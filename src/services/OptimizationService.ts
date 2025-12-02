

import { 
    SalesDataRow, AppConstraints, ProductionPlan, ProductionPlanItem, 
    ProductProcessInfo, WorkCenter, ProductionLine, LaborCostSettings, InventorySetting, Holiday,
    MonthlyInventoryState, ProcessType, WorkstationDefinition,
    SupplyInfo, MonthlyProductionPlanItem, NotificationMessage, LineMonthlySummary, 
    TacticalRequest, TacticalPlanResult, TacticalOrderItem, ProvisionalOrder, Employee, EmployeeSkill, MaintenanceEvent, AbsenteeismEvent, AssignedPersonnel, ShiftParameters,
    Machine, Qualification, TiempoEnsambleItem, DetailedProductionPlan, PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment, PresupuestoItem,
    PlanningProgress, WeeklyPlanItem 
} from '@/types/types';
import { MONTH_NAMES, PROCESS_TYPE_OPTIONS } from '@/constants/constants'; 
import { queryApi } from '@/hooks/useApiData';
import { logger } from './LogService';

declare var XLSX: any; 

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

export function processAndValidateAssemblyData(
    apiData: TiempoEnsambleItem[],
    currentConstraints: AppConstraints,
): {
    newConstraints: AppConstraints,
    validationErrors: string[],
    dataCompletenessErrors: string[]
} {
    const timestamp = new Date().toLocaleTimeString();
    logger.log(`[${timestamp}] --- INICIANDO PROCESAMIENTO Y VALIDACIÓN DE DATOS DE ENSAMBLE --- (Datos recibidos: ${apiData.length})`, 'info');
    const validationErrors: string[] = [];
    const dataCompletenessErrors: string[] = [];
    
    // Step 1: Basic data completeness check
    apiData.forEach((row, index) => {
        if (!row.CodMaterial) dataCompletenessErrors.push(`Fila API ${index + 1}: Falta 'CodMaterial'.`);
        if (!row.Centro) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'Centro'.`);
        if (!row.Linea) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'Linea'.`);
        if (!row.PuestoTrabajo) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'PuestoTrabajo'.`);
        if (row.Tiempo === null || row.Tiempo === undefined) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'Tiempo'.`);
        if (row.ClaseAprovisionamiento === null || row.ClaseAprovisionamiento === undefined) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'ClaseAprovisionamiento'.`);
    });

    if (dataCompletenessErrors.length > 0) {
        logger.log(`[${timestamp}] [VALIDATION ERRORS] Errores de completitud de datos: ${dataCompletenessErrors.join(', ')}`, 'error');
        return { newConstraints: currentConstraints, validationErrors, dataCompletenessErrors };
    }

    const discoveredWorkCenters = new Map<string, WorkCenter>();
    const discoveredLines = new Map<string, ProductionLine>();
    const discoveredWorkstations = new Map<string, WorkstationDefinition>();

    // Step 2: Discover all unique entities
    apiData.forEach(row => {
        const centerId = String(row.Centro).trim();
        if (!discoveredWorkCenters.has(centerId)) {
            discoveredWorkCenters.set(centerId, { id: centerId, name: `Planta ${centerId}`, productionLineIds: [], isActive: true });
        }

        const workstationName = String(row.PuestoTrabajo).trim();
        const workstationId = `wd---${centerId}---${workstationName}`;
        if (!discoveredWorkstations.has(workstationId)) {
            discoveredWorkstations.set(workstationId, { id: workstationId, name: workstationName, employeesPerWorkstation: 1, machineCode: null, isActive: true });
        }

        const lineName = String(row.Linea).trim();
        const lineId = `pl---${centerId}---${lineName}`;
        if (!discoveredLines.has(lineId)) {
             const userEditedLine = currentConstraints.productionLines.find(l => l.id === lineId);
            discoveredLines.set(lineId, {
                id: lineId, name: lineName, workCenterId: centerId,
                processType: userEditedLine?.processType || 'Colchones',
                assignedWorkstations: [], capacity: { maxUnitsPerHour: 0, normalUnitsPerHour: 0, minUnitsPerHour: 0 },
                materialsHandled: [], isActive: true
            });
            const center = discoveredWorkCenters.get(centerId);
            if (center && !center.productionLineIds.includes(lineId)) center.productionLineIds.push(lineId);
        }
    });

    // Step 3: Assign workstations to lines based on TiemposEnsamblado data
    apiData.forEach(row => {
        const centerId = String(row.Centro).trim();
        const lineName = String(row.Linea).trim();
        const lineId = `pl---${centerId}---${lineName}`;
        const line = discoveredLines.get(lineId);

        if (line) {
            const workstationName = String(row.PuestoTrabajo).trim();
            const workstationId = `wd---${centerId}---${workstationName}`;
            if (!line.assignedWorkstations.some(ws => ws.definitionId === workstationId)) {
                // Initialize with quantity 0, to be determined in the next step.
                line.assignedWorkstations.push({ definitionId: workstationId, quantity: 0 });
            }
        }
    });
    
    // Step 4: Apply predefined quantities and user overrides
    discoveredLines.forEach(line => {
        const predefinedQuantities = getPredefinedQuantities(line.workCenterId, line.name);
        const userEditedLine = currentConstraints.productionLines.find(l => l.id === line.id);
        
        // Use a map to handle all workstations related to the line
        const workstationsInLine = new Map<string, { definitionId: string, quantity: number }>();
        
        // First, add all workstations discovered for the line
        line.assignedWorkstations.forEach(as => {
            workstationsInLine.set(as.definitionId, { ...as, quantity: 1 }); // Default to 1 if no other info is found
        });
        
        // Apply predefined quantities
        predefinedQuantities.forEach(predefined => {
            if (workstationsInLine.has(predefined.definitionId)) {
                workstationsInLine.get(predefined.definitionId)!.quantity = predefined.quantity;
            }
        });

        // Apply user overrides, which have the highest precedence
        if (userEditedLine) {
            userEditedLine.assignedWorkstations.forEach(userAs => {
                if (workstationsInLine.has(userAs.definitionId)) {
                    workstationsInLine.get(userAs.definitionId)!.quantity = userAs.quantity;
                }
            });
        }
        
        // Filter out workstations that ended up with 0 quantity
        line.assignedWorkstations = Array.from(workstationsInLine.values()).filter(ws => ws.quantity > 0);
    });

    // Step 5: Populate materials handled and create inventory settings
    const finalLines = Array.from(discoveredLines.values());
    const inventorySettings: InventorySetting[] = [];
    const uniqueProductCenterPairs = new Set(apiData.map(row => `${normalizeMaterialCode(row.CodMaterial)}---${String(row.Centro).trim()}`));
    
    uniqueProductCenterPairs.forEach(pairKey => {
        const [productId, centerId] = pairKey.split('---');
        const rowsForPair = apiData.filter(row => normalizeMaterialCode(row.CodMaterial) === productId && String(row.Centro).trim() === centerId);
        
        const inventoryDataSource = rowsForPair.find(r => r.StockSeguridad || r.StockMaximo) || rowsForPair[0];
        if (inventoryDataSource) {
             inventorySettings.push({
                id: pairKey, itemId: productId, itemName: productId, centerId: centerId, isRawMaterial: false,
                minStock: parseInt(String(inventoryDataSource.StockSeguridad || 0), 10),
                maxStock: parseInt(String(inventoryDataSource.StockMaximo || 0), 10),
                currentStock: 0, 
                lotMin: parseInt(String(inventoryDataSource.TamLoteMin || 1), 10) || 1,
                lotMax: inventoryDataSource.TamLoteMax ? parseInt(String(inventoryDataSource.TamLoteMax), 10) : null,
            });
        }

        rowsForPair.forEach(row => {
            const lineName = String(row.Linea).trim();
            const lineId = `pl---${centerId}---${lineName}`;
            const line = finalLines.find(l => l.id === lineId);
            if (line && !line.materialsHandled.includes(productId)) {
                line.materialsHandled.push(productId);
            }
        });
    });

    if (discoveredWorkCenters.size === 0 || discoveredLines.size === 0) {
        const structuralError = "Error Crítico: No se pudo descubrir ninguna estructura de producción (Centros o Líneas) a partir de los datos. Revise la fuente de datos 'TiemposEnsamblado'.";
        validationErrors.push(structuralError);
        logger.log(`[${timestamp}] [STRUCTURE ERROR] ${structuralError}`, 'error');
        return { newConstraints: currentConstraints, validationErrors, dataCompletenessErrors };
    }

    const newConstraints: AppConstraints = {
        ...currentConstraints,
        workCenters: Array.from(discoveredWorkCenters.values()),
        productionLines: finalLines,
        workstationDefinitions: Array.from(discoveredWorkstations.values()),
        productProcessInfos: [], 
        inventorySettings: inventorySettings, 
    };
    logger.log(`[${timestamp}] Procesamiento y validación completados. Centros: ${discoveredWorkCenters.size}, Líneas: ${discoveredLines.size}, Puestos: ${discoveredWorkstations.size}, Inventario: ${inventorySettings.length}`, 'success');
    return { newConstraints, validationErrors: [], dataCompletenessErrors: [] };
}

function getPredefinedQuantities(centerId: string, lineName: string): Array<{ definitionId: string; quantity: number }> {
    const quantities: { [key: string]: { [key: string]: { [key: string]: number } } } = {
        '1000': { // Quito
            'LINEA 1': { 'Armado': 12, 'Cerrado': 6 },
            'LINEA 2': { 'Armado': 6, 'Cerrado': 4 }
        },
        '2000': { // Guayaquil
            'LINEA 1': { 'Armado': 8, 'Cerrado': 4 },
            'LINEA 2': { 'Armado': 4, 'Cerrado': 4 }
        }
    };

    const centerConfig = quantities[centerId];
    if (centerConfig && centerConfig[lineName]) {
        return Object.entries(centerConfig[lineName]).map(([wsName, qty]) => ({
            definitionId: `wd---${centerId}---${wsName}`,
            quantity: qty
        }));
    }
    return [];
}


const getDayType = (date: Date, holidays: Holiday[], appliesToFilter: 'Produccion' | 'Distribucion' | 'Toda la Planta', lineId?: string): boolean => {
    const yyyyMmDd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const holidayInfo = holidays.find(h => h.date === yyyyMmDd);
    
    let isHoliday = false;

    if (holidayInfo) {
        if (appliesToFilter === 'Distribucion') {
            isHoliday = holidayInfo.appliesTo === 'Distribucion';
        } else if (appliesToFilter === 'Produccion') {
            if (holidayInfo.appliesTo === 'Toda la Planta' && !holidayInfo.isProductionAllowed) {
                isHoliday = true;
            } else if (holidayInfo.appliesTo === lineId && !holidayInfo.isProductionAllowed) {
                isHoliday = true;
            }
        }
    }

    const dayOfWeek = date.getDay(); 
    
    if (appliesToFilter === 'Distribucion') {
        return dayOfWeek >= 1 && dayOfWeek <= 5 && !isHoliday;
    } else { 
        return dayOfWeek >= 1 && dayOfWeek <= 6 && !isHoliday;
    }
};

const getWeekNumber = (d: Date): { year: number; week: number } => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
};

const calculateEffectiveManufacturingTime = (productId: string, line: ProductionLine, apiData: TiempoEnsambleItem[], workstationDefs: WorkstationDefinition[]): number => {
    const workstationTimes: number[] = [];
    
    for (const assignedWorkstation of line.assignedWorkstations) {
        const workstationDef = workstationDefs.find(wd => wd.id === assignedWorkstation.definitionId);
        if (!workstationDef) continue;

        const apiRow = apiData.find(d => 
            normalizeMaterialCode(d.CodMaterial) === productId &&
            String(d.Centro).trim() === line.workCenterId &&
            String(d.Linea).trim() === line.name &&
            String(d.PuestoTrabajo).trim() === workstationDef.name
        );
        
        if (apiRow && apiRow.Tiempo > 0) {
            const timePerPost = apiRow.Tiempo / (assignedWorkstation.quantity > 0 ? assignedWorkstation.quantity : 1);
            workstationTimes.push(timePerPost);
        }
    }
    
    if (workstationTimes.length === 0) return Infinity;

    const bottleneckTimeMinutes = Math.max(0, ...workstationTimes);
    return bottleneckTimeMinutes / 60;
};

export const generateProductionPlan = async (
    planningYear: number, 
    constraints: AppConstraints, 
    apiData: TiempoEnsambleItem[], 
    salesData: SalesDataRow[],
    prorateCurrentMonth: boolean,
    onProgress: (progress: PlanningProgress | null) => void
): Promise<ProductionPlan> => {
    
    const auditLog: string[] = [];
    logger.log(`--- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN (Prorrateo: ${prorateCurrentMonth}) ---`, 'info');
    auditLog.push(`[${new Date().toLocaleTimeString()}] INICIO: Generación de plan (Prorrateo mes actual: ${prorateCurrentMonth}).`);

    var { holidays, productionLines, workstationDefinitions, shiftParameters, laborCostFactors, globalBaseCostPerHour } = constraints;

    if (salesData.length === 0) {
        auditLog.push(`Error: No hay datos de ventas para planificar.`);
        logger.log("Error: No hay datos de ventas para planificar.", 'error');
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }
     if (!laborCostFactors || !globalBaseCostPerHour || !shiftParameters) {
        auditLog.push(`Error: No se han definido los parámetros de costo laboral o turnos.`);
        logger.log("Error: No se han definido los parámetros de costo laboral o turnos.", 'error');
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }
    
    const inventoryState = new Map<string, number>(); 
    const allInventoryData = await queryApi({
      source: 'CuboInventarios',
      operation: 'get_data',
      columns: ['Material', 'Centro', 'StockActual'],
      pagination: { limit: 500000 }
    });

    if (allInventoryData) {
        allInventoryData.forEach((inv: any) => {
            if(inv.Material && inv.Centro && inv.StockActual) {
                const stock = Number(inv.StockActual);
                if (stock > 0) {
                    const productId = normalizeMaterialCode(inv.Material);
                    const centerId = String(inv.Centro).trim();
                    const key = `${productId}---${centerId}`;
                    inventoryState.set(key, (inventoryState.get(key) || 0) + stock);
                }
            }
        });
        
        let totalStockCentro1000 = 0;
        for (const [key, value] of inventoryState.entries()) {
            if (key.endsWith('---1000')) {
                totalStockCentro1000 += value;
            }
        }
        const logMsg = `Inventario inicial cargado DIRECTAMENTE de CuboInventarios. Total para centro 1000: ${totalStockCentro1000.toLocaleString()}`;
        auditLog.push(`[${new Date().toLocaleTimeString()}] INFO: ${logMsg}`);
        logger.log(`[${new Date().toLocaleTimeString()}] [Punto 1: Motor] ${logMsg}`, 'success');

    } else {
        const logMsg = `ADVERTENCIA: No se pudo cargar el inventario inicial desde CuboInventarios. La planificación puede ser imprecisa.`;
        auditLog.push(`[${new Date().toLocaleTimeString()}] ${logMsg}`);
        logger.log(`[${new Date().toLocaleTimeString()}] ${logMsg}`, 'warning');
    }
    
    const initialInventoryState = new Map(inventoryState);
    const monthlyPlanItems: MonthlyProductionPlanItem[] = [];
    let productionBacklog = new Map<string, number>();

    const plannableMaterialCodes = new Set(apiData.map(item => normalizeMaterialCode(item.CodMaterial)));
    const filteredSalesData = salesData.filter(sale => plannableMaterialCodes.has(normalizeMaterialCode(sale.código)));
    const allMonthKeys = new Set<string>();
    filteredSalesData.forEach(s => allMonthKeys.add(`${s.año}-${String(s.mes).padStart(2, '0')}`));
    const planningMonths = Array.from(allMonthKeys).sort();
    
    const horizonMsg = `Horizonte de planificación: ${planningMonths.length > 0 ? `${planningMonths[0]} a ${planningMonths[planningMonths.length-1]}` : 'Ninguno'}`;
    auditLog.push(`[${new Date().toLocaleTimeString()}] INFO: ${horizonMsg}`);
    logger.log(`[${new Date().toLocaleTimeString()}] ${horizonMsg}`, 'info');

    for (let i = 0; i < planningMonths.length; i++) {
        const monthKey = planningMonths[i];
        const [year, monthNum] = monthKey.split('-').map(Number);
        
        onProgress({ message: `Planificando mes ${monthNum}...`, step: 'monthly', current: i + 1, total: planningMonths.length });
        auditLog.push(`\n[${new Date().toLocaleTimeString()}] --- Planificando Mes ${monthNum}/${year} ---`);

        const isCurrentMonth = year === new Date().getFullYear() && monthNum === new Date().getMonth() + 1;
        const startDayForCalc = (prorateCurrentMonth && isCurrentMonth) ? new Date().getDate() : 1;

        const monthlyCapacityByLine = new Map<string, number>();
        productionLines.forEach(line => {
            const { totalHours } = getMonthlyCapacity(year, monthNum, line, holidays, shiftParameters, auditLog, startDayForCalc);
            monthlyCapacityByLine.set(line.id, totalHours);
        });

        const monthlyMovements = new Map<string, { production: number; sales: number; transfersIn: number; transfersOut: number }>();
        const getMovements = (key: string) => {
            if (!monthlyMovements.has(key)) {
                monthlyMovements.set(key, { production: 0, sales: 0, transfersIn: 0, transfersOut: 0 });
            }
            return monthlyMovements.get(key)!;
        };
        
        let salesThisMonth = filteredSalesData.filter(s => `${s.año}-${String(s.mes).padStart(2, '0')}` === monthKey);

        if (prorateCurrentMonth && isCurrentMonth) {
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const daysPassed = today.getDate() - 1;
            const remainingProportion = (daysInMonth - daysPassed) / daysInMonth;
            auditLog.push(`[${new Date().toLocaleTimeString()}] INFO: Prorrateando demanda para el mes actual. Proporción restante: ${remainingProportion.toFixed(2)}`);
            
            salesThisMonth = salesThisMonth.map(sale => ({
                ...sale,
                unidadesProyectado: sale.unidadesProyectado * remainingProportion
            }));
        }


        const productionNeedsThisMonth = new Map<string, { demand: number, type: 'E' | 'X' | 'F' | 'N/A' }>();
        
        salesThisMonth.forEach(sale => {
            const productId = normalizeMaterialCode(sale.código);
            const demandCenterId = String(sale.centro).trim();
            const classType = sale.claseAprovisionamiento;

            if (classType === 'F' && demandCenterId !== '1000') {
                const productionKey = `${productId}---1000`;
                const needs = productionNeedsThisMonth.get(productionKey) || { demand: 0, type: 'F' };
                needs.demand += sale.unidadesProyectado;
                productionNeedsThisMonth.set(productionKey, needs);
                
                getMovements(`${productId}---1000`).transfersOut += sale.unidadesProyectado;
                getMovements(`${productId}---${demandCenterId}`).transfersIn += sale.unidadesProyectado;
            } else { // E, X, o F en el mismo centro 1000
                const productionKey = `${productId}---${demandCenterId}`;
                const needs = productionNeedsThisMonth.get(productionKey) || { demand: 0, type: classType || 'E' };
                needs.demand += sale.unidadesProyectado;
                productionNeedsThisMonth.set(productionKey, needs);
            }
             getMovements(`${productId}---${demandCenterId}`).sales += sale.unidadesProyectado;
        });

        // Start 'X' logic: Identify deficits in Guayaquil for 'X' products
        const gyeXDeficits = new Map<string, number>();

        // First pass: plan local production for GYE and identify deficits
        productionNeedsThisMonth.forEach((need, key) => {
            if (need.type === 'X' && key.endsWith('---2000')) {
                const [productId, centerId] = key.split('---');
                const invKey = key;
                const currentStock = inventoryState.get(invKey) || 0;
                const safetyStock = constraints.inventorySettings.find(inv => inv.itemId === productId && inv.centerId === centerId)?.minStock || 0;
                let netNeed = Math.max(0, (need.demand + safetyStock) - currentStock);

                const linesInGye = productionLines.filter(l => l.workCenterId === '2000' && l.materialsHandled.includes(productId));
                const relevantLine = linesInGye[0];

                if (relevantLine && netNeed > 0) {
                    const timePerUnit = calculateEffectiveManufacturingTime(productId, relevantLine, apiData, workstationDefinitions);
                    const availableHours = monthlyCapacityByLine.get(relevantLine.id) || 0;
                    
                    if (timePerUnit !== Infinity && timePerUnit > 0) {
                        const capacityInUnits = Math.floor(availableHours / timePerUnit);
                        const actualProduction = Math.min(netNeed, capacityInUnits);

                        if (actualProduction > 0) {
                             const hoursForProduction = actualProduction * timePerUnit;
                             getMovements(invKey).production += actualProduction;
                             monthlyCapacityByLine.set(relevantLine.id, availableHours - hoursForProduction);
                             netNeed -= actualProduction; // Reduce the need
                        }
                    }
                }
                // If there's still a need, it's a deficit for Quito to potentially handle
                if (netNeed > 0) {
                    gyeXDeficits.set(productId, (gyeXDeficits.get(productId) || 0) + netNeed);
                    auditLog.push(`[${new Date().toLocaleTimeString()}]   - Mes ${monthNum}: Déficit de capacidad para material 'X' ${productId} en GYE (2000): ${netNeed.toFixed(0)} unidades. Solicitando a UIO (1000).`);
                }
            }
        });
        
        // Add GYE deficits to Quito's demand
        gyeXDeficits.forEach((deficit, productId) => {
            const quitoKey = `${productId}---1000`;
            const quitoNeeds = productionNeedsThisMonth.get(quitoKey) || { demand: 0, type: 'E' }; // Assume 'E' or whatever is correct for Quito
            quitoNeeds.demand += deficit;
            productionNeedsThisMonth.set(quitoKey, quitoNeeds);
        });

        auditLog.push(`[${new Date().toLocaleTimeString()}]   Demanda local y de traslados consolidada para el mes.`);
        
        productionBacklog.forEach((qty, key) => {
            const needs = productionNeedsThisMonth.get(key) || { demand: 0, type: 'E' };
            needs.demand += qty;
            productionNeedsThisMonth.set(key, needs);
            auditLog.push(`[${new Date().toLocaleTimeString()}]   -> Añadiendo ${qty.toFixed(0)} unidades de backlog para ${key}`);
        });
        productionBacklog.clear();

        const allNeeds = Array.from(productionNeedsThisMonth.entries()).map(([prodCenterKey, need]) => {
             // Exclude 'X' needs from GYE as they were handled already or sent to Quito
             if (need.type === 'X' && prodCenterKey.endsWith('---2000')) {
                return null;
             }
             const [productId, centerId] = prodCenterKey.split('---');
             const invKey = `${productId}---${centerId}`;
             const currentStock = inventoryState.get(invKey) || 0;
             const safetyStock = constraints.inventorySettings.find(inv => inv.itemId === productId && inv.centerId === centerId)?.minStock || 0;
             const netNeed = Math.max(0, (need.demand + safetyStock) - currentStock);
             auditLog.push(`[${new Date().toLocaleTimeString()}]     - Need for ${prodCenterKey}: Demand=${need.demand.toFixed(2)}, Safety=${safetyStock}, Stock=${currentStock.toFixed(2)} -> NetNeed=${netNeed.toFixed(2)}`);
             return { prodCenterKey, productId, centerId, netNeed, urgency: (currentStock - need.demand) / (need.demand || 1) };
        }).filter((item): item is NonNullable<typeof item> => item !== null)
          .sort((a,b) => a.urgency - b.urgency);
        
        for (const { prodCenterKey, productId, centerId, netNeed } of allNeeds) {
             const invKey = `${productId}---${centerId}`;

            const linesInCenter = productionLines.filter(l => l.workCenterId === centerId && l.materialsHandled.includes(productId));
            const relevantLine = linesInCenter[0];

            if (relevantLine) {
                const timePerUnit = calculateEffectiveManufacturingTime(productId, relevantLine, apiData, workstationDefinitions);
                const availableHours = monthlyCapacityByLine.get(relevantLine.id) || 0;

                if (timePerUnit === Infinity || timePerUnit <= 0) {
                    auditLog.push(`[${new Date().toLocaleTimeString()}]     [WARN] Tiempo de fabricación inválido para ${productId} en línea ${relevantLine.name}. Saltando.`);
                    productionBacklog.set(prodCenterKey, (productionBacklog.get(prodCenterKey) || 0) + netNeed);
                    continue;
                }
                
                let quantityToProduce = netNeed;

                // For Quito, check if this production is for a GYE deficit
                if (centerId === '1000' && gyeXDeficits.has(productId)) {
                    const deficitForGye = gyeXDeficits.get(productId)!;
                    
                    // What would be the final stock in quito if we produce EVERYTHING (local demand + gye deficit)?
                    const quitoStock = inventoryState.get(invKey) || 0;
                    const quitoSales = getMovements(invKey).sales;
                    const quitoTransfersOutF = getMovements(invKey).transfersOut; // Transfers for 'F' materials
                    const projectedFinalStockIfAllProduced = quitoStock + quantityToProduce - quitoSales - quitoTransfersOutF;
                    
                    const minStockForQuito = 1; // The rule is >= 1

                    if (projectedFinalStockIfAllProduced < minStockForQuito) {
                        const allowableProduction = quantityToProduce - (minStockForQuito - projectedFinalStockIfAllProduced);
                        quantityToProduce = Math.max(0, allowableProduction);
                        auditLog.push(`[${new Date().toLocaleTimeString()}]     - UIO (1000) limita producción de ${productId} a ${quantityToProduce.toFixed(0)} para no bajar de 1 unidad de stock.`);
                    }
                    
                    // The amount produced for GYE is the lesser of the deficit or the part of production that corresponds to it
                    const productionForGye = Math.min(deficitForGye, quantityToProduce);
                    if (productionForGye > 0) {
                         getMovements(invKey).transfersOut += productionForGye;
                         getMovements(`${productId}---2000`).transfersIn += productionForGye;
                    }
                    gyeXDeficits.delete(productId); // Mark as handled
                }


                const capacityInUnits = Math.floor(availableHours / timePerUnit);
                const actualProduction = Math.min(quantityToProduce, capacityInUnits);
                auditLog.push(`[${new Date().toLocaleTimeString()}]     - Asignación para ${productId} en ${relevantLine.name}: Necesita ${quantityToProduce.toFixed(0)}, Capacidad en unidades ${capacityInUnits.toFixed(0)} -> Producirá ${actualProduction.toFixed(0)}`);
                
                if (actualProduction > 0) {
                    const hoursForProduction = actualProduction * timePerUnit;
                    getMovements(invKey).production += actualProduction;
                    
                    monthlyCapacityByLine.set(relevantLine.id, availableHours - hoursForProduction);
                    auditLog.push(`[${new Date().toLocaleTimeString()}]       - Horas consumidas: ${hoursForProduction.toFixed(2)}. Horas restantes en línea: ${(availableHours - hoursForProduction).toFixed(2)}`);
                }

                const pendingUnits = netNeed - actualProduction;
                if (pendingUnits > 0) {
                    auditLog.push(`[${new Date().toLocaleTimeString()}]     [BACKLOG] Insuficiente capacidad para ${productId}. Faltantes: ${pendingUnits.toFixed(0)}.`);
                    productionBacklog.set(prodCenterKey, (productionBacklog.get(prodCenterKey) || 0) + pendingUnits);
                }
            } else {
                 auditLog.push(`[${new Date().toLocaleTimeString()}]     [WARN] No se encontró línea para ${productId} en centro ${centerId}. Faltantes: ${netNeed.toFixed(0)}.`);
                 productionBacklog.set(prodCenterKey, (productionBacklog.get(prodCenterKey) || 0) + netNeed);
            }
        }
        
        const allProductCenterPairsThisMonth = new Set<string>(Array.from(inventoryState.keys()));
        monthlyMovements.forEach((_, key) => allProductCenterPairsThisMonth.add(key));

        for (const pairKey of allProductCenterPairsThisMonth) {
            const [productId, centerId] = pairKey.split('---');
            const initialStock = inventoryState.get(pairKey) || 0;
            const movements = getMovements(pairKey);
            const realBalance = initialStock + movements.production + movements.transfersIn - movements.transfersOut - movements.sales;
            const finalStock = Math.max(0, realBalance);
            const unmetDemand = Math.abs(Math.min(0, realBalance));

            inventoryState.set(pairKey, finalStock); 

            if (Object.values(movements).some(v => v !== 0) || (initialInventoryState.get(pairKey) || 0) > 0) {
                 monthlyPlanItems.push({
                    id: `${monthKey}---${pairKey}`, year, month: monthNum, productId, centerId,
                    productName: salesData.find(s=> normalizeMaterialCode(s.código) === productId)?.descripciónMaterial || productId,
                    totalQuantityToProduce: movements.production,
                    totalDemand: movements.sales,
                    netTransfers: movements.transfersIn - movements.transfersOut,
                    initialStock: initialStock,
                    finalStock: finalStock,
                    unmetDemand: unmetDemand,
                    totalHoursWorked: 0, 
                    totalEstimatedLaborCost: 0, 
                    assignedLineId: productionLines.find(l => l.workCenterId === centerId && l.materialsHandled.includes(productId))?.id,
                });
            }
        }
    }
    
    auditLog.push(`[${new Date().toLocaleTimeString()}] FIN: Plan mensual completado.`);
    logger.log(`[${new Date().toLocaleTimeString()}] Plan mensual completado.`, 'success');
    
    const weeklyPlan: WeeklyPlanItem[] = [];
    const weeklyGrouped = new Map<string, { production: number, sales: number, netTransfers: number, lineId: string, workCenterId: string, initialStocks: Map<string, number>, unmetDemand: number }>();
    
    monthlyPlanItems.forEach(item => {
        const { year, month, productId, centerId, assignedLineId, totalQuantityToProduce, totalDemand, netTransfers, initialStock, unmetDemand } = item;
        
        const daysInMonth = new Date(year, month, 0).getDate();
        const productionPerDay = totalQuantityToProduce / daysInMonth;
        const salesPerDay = totalDemand / daysInMonth;
        const transfersPerDay = netTransfers / daysInMonth;
        const unmetDemandPerDay = unmetDemand / daysInMonth;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const { year: weekYear, week: weekNum } = getWeekNumber(date);
            const weekKey = `${weekYear}-W${String(weekNum).padStart(2, '0')}---${productId}---${centerId}---${assignedLineId}`;

            if (!weeklyGrouped.has(weekKey)) {
                weeklyGrouped.set(weekKey, { 
                    production: 0, 
                    sales: 0, 
                    netTransfers: 0, 
                    lineId: assignedLineId || '', 
                    workCenterId: centerId,
                    initialStocks: new Map(),
                    unmetDemand: 0,
                });
            }
            const group = weeklyGrouped.get(weekKey)!;
            group.production += productionPerDay;
            group.sales += salesPerDay;
            group.netTransfers += transfersPerDay;
            group.unmetDemand += unmetDemandPerDay;

            if (!group.initialStocks.has(productId)) {
                 const weekOneOfMonth = getWeekNumber(new Date(year, month - 1, 1)).week;
                 if(weekNum === weekOneOfMonth) {
                    group.initialStocks.set(productId, initialStock);
                 }
            }
        }
    });

    for (const [key, data] of weeklyGrouped.entries()) {
        const [week, productId, centerId, lineId] = key.split('---');
        const [yearStr, weekStr] = week.split('-W');
        const year = parseInt(yearStr, 10);
        const weekNum = parseInt(weekStr, 10);
        
        const initialStockForWeek = Array.from(data.initialStocks.values()).reduce((sum, stock) => sum + stock, 0);
        const realBalance = initialStockForWeek + data.production + data.netTransfers - data.sales;

        weeklyPlan.push({
            id: `${week}-${productId}-${centerId}`,
            year: year,
            week: weekNum,
            productId: productId,
            productName: salesData.find(s=> s.código === productId)?.descripciónMaterial || productId,
            workCenterId: centerId,
            lineId: data.lineId,
            initialStock: initialStockForWeek,
            production: data.production,
            sales: data.sales,
            netTransfers: data.netTransfers,
            finalStock: Math.max(0, realBalance),
            unmetDemand: Math.abs(Math.min(0, realBalance)),
        });
    }

    onProgress(null);
    return { dailyPlan: [], monthlyPlan: monthlyPlanItems, weeklyPlan, auditLog, initialInventory: initialInventoryState };
};


function getMonthlyCapacity(
    year: number,
    month: number,
    line: ProductionLine,
    holidays: Holiday[],
    shiftParams: ShiftParameters,
    auditLog: string[],
    startDay: number = 1
): { totalHours: number } {
    const EFFICIENCY_FACTOR = 0.85;
    let grossTotalHours = 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    
    if (startDay > 1) {
        auditLog.push(`[${new Date().toLocaleTimeString()}]     - Mes corriente detectado. Calculando capacidad desde el día ${startDay}.`);
    }
    auditLog.push(`[${new Date().toLocaleTimeString()}]     - Calculando capacidad para línea ${line.name} en mes ${month}:`);
    
    for (let day = startDay; day <= daysInMonth; day++) {
        const checkDate = new Date(year, month - 1, day);
        const dayOfWeek = checkDate.getDay(); 
        
        let dailyHours = 0;
        let logMsg = '';

        if (dayOfWeek === 0) { // Sunday
            logMsg = `Día ${day}: Domingo. Horas: 0.`;
        } else {
            const holidayInfo = holidays.find(h => h.date === checkDate.toISOString().split('T')[0]);
            let isNonProductiveHoliday = false;
            if (holidayInfo && !holidayInfo.isProductionAllowed) {
                const appliesTo = holidayInfo.appliesTo;
                if (appliesTo === 'Toda la Planta' || appliesTo === line.workCenterId || appliesTo === line.processType || appliesTo === line.id) {
                    isNonProductiveHoliday = true;
                }
            }

            if (isNonProductiveHoliday) {
                logMsg = `Día ${day}: Feriado no productivo ('${holidayInfo?.name}'). Horas: 0.`;
            } else {
                if (dayOfWeek === 6) { // Saturday
                    dailyHours = shiftParams.saturdayAndHolidayHours;
                    logMsg = `Día ${day}: Sábado. +${dailyHours}h.`;
                } else { // Weekday
                    dailyHours = shiftParams.regularHoursPerDay + shiftParams.extraHoursPerDay;
                    logMsg = `Día ${day}: L-V normal. +${dailyHours}h.`;
                }
                
                if (holidayInfo && holidayInfo.isProductionAllowed) {
                   const holidayHours = holidayInfo.dayType === 'half' ? 5 : shiftParams.saturdayAndHolidayHours;
                   dailyHours = holidayHours; // Override with holiday hours
                   logMsg = `Día ${day}: Feriado productivo ('${holidayInfo.name}'). Horas: ${dailyHours}.`;
                }
            }
        }
        
        grossTotalHours += dailyHours;
        if(startDay <= 1) auditLog.push(`[${new Date().toLocaleTimeString()}]       - ${logMsg}`);
    }

    const netTotalHours = grossTotalHours * EFFICIENCY_FACTOR;
    auditLog.push(`[${new Date().toLocaleTimeString()}]     - Total Bruto Mes para ${line.name}: ${grossTotalHours.toFixed(2)}h. Total Neto (x${EFFICIENCY_FACTOR}): ${netTotalHours.toFixed(2)}h.`);
    return { totalHours: netTotalHours };
}

export const exportDailyPlanToExcel = (plan: ProductionPlanItem[], constraints: AppConstraints): void => {
  if (!plan || plan.length === 0) return;
  const dailyDataToExport = plan.map(item => ({
    'Año': item.year, 'Mes': MONTH_NAMES[item.month - 1], 'Día': item.day, 'Producto (Cód)': item.productId,
    'Nombre Producto': item.productName, 'Stock Inicial': Math.round(item.initialStockOnDay),
    'Producción': item.isTransfer ? 0 : Math.round(item.quantityToProduce),
    'T. Entrante': item.isTransfer && item.transferDestinationCenterId === item.demandCenterId ? Math.round(item.quantityToProduce) : 0,
    'T. Saliente': item.isTransfer && item.transferSourceCenterId === item.demandCenterId ? Math.round(item.quantityToProduce) : 0,
    'Demanda Diaria': Math.round(item.demandOnDay),
    'Stock Final': Math.round(item.finalStockOnDay), 'Centro Prod.': item.producingCenterId,
    'Centro Demanda': item.demandCenterId,
    'Línea': constraints.productionLines.find(l => l.id === item.assignedLineId)?.name || item.assignedLineId,
    'Horas fabricación': parseFloat(item.hoursWorked.toFixed(2)),
    'Costo Labor Est.': parseFloat(item.estimatedLaborCost.toFixed(2)), 'Estado': item.status, 'Notas': item.notes || ''
  }));
  const dailyWorksheet = XLSX.utils.json_to_sheet(dailyDataToExport);
  dailyWorksheet['!cols'] = [ { wch: 6 }, { wch: 10 }, { wch: 5 }, { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 50 }, ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dailyWorksheet, 'Plan de Producción Diario');
  XLSX.writeFile(workbook, 'Plan_Produccion_Diario.xlsx');
};

export const exportMonthlyPlanToExcel = (plan: MonthlyProductionPlanItem[]): void => {
    if (!plan || plan.length === 0) return;
    const dataToExport = plan.map(item => ({
        'Año': item.year, 'Mes': MONTH_NAMES[item.month - 1], 'Producto (Cód)': item.productId,
        'Nombre Producto': item.productName,
        'Centro': item.centerId,
        'Stock Inicial': Math.round(item.initialStock),
        'Producción': Math.round(item.totalQuantityToProduce),
        'Ventas': Math.round(item.totalDemand),
        'Traslados (Neto)': Math.round(item.netTransfers),
        'Stock Final': Math.round(item.finalStock),
        'Faltante (Backlog)': Math.round(item.unmetDemand || 0)
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    worksheet['!cols'] = [ { wch: 6 }, { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 15 } ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumen Mensual');
    XLSX.writeFile(workbook, 'Resumen_Inventario_Mensual.xlsx');
};

export const parseTacticalOrdersExcel = (file: File): Promise<ProvisionalOrder[]> => { return Promise.resolve([]); };

export const generateTacticalPlan = ( request: TacticalRequest, context: any ): TacticalPlanResult => { return { plan: [], alerts: [] }; };

export const exportSkillsToExcel = ( employees: Employee[], skills: EmployeeSkill[], machines: Machine[], constraints: AppConstraints ): void => {};





    

    




    
















