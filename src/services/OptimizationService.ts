

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

    // Step 2: Discover all unique entities (WorkCenters, Lines, Workstations)
    apiData.forEach(row => {
        const centerId = String(row.Centro).trim();
        const lineName = String(row.Linea).trim();
        const workstationName = String(row.PuestoTrabajo).trim();

        if (!discoveredWorkCenters.has(centerId)) {
            discoveredWorkCenters.set(centerId, { 
                id: centerId, name: `Planta ${centerId}`, productionLineIds: [], isActive: true 
            });
        }
        
        const workstationId = `wd---${centerId}---${workstationName}`;
        if (!discoveredWorkstations.has(workstationId)) {
            discoveredWorkstations.set(workstationId, {
                id: workstationId, name: workstationName, employeesPerWorkstation: 1, machineCode: null, isActive: true
            });
        }

        const lineId = `pl---${centerId}---${lineName}`;
        if (!discoveredLines.has(lineId)) {
            const userEditedLine = currentConstraints.productionLines.find(l => l.id === lineId);
            discoveredLines.set(lineId, {
                id: lineId, name: lineName, workCenterId: centerId,
                processType: userEditedLine?.processType || 'Colchones',
                assignedWorkstations: [],
                capacity: { maxUnitsPerHour: 0, normalUnitsPerHour: 0, minUnitsPerHour: 0 },
                materialsHandled: [],
                isActive: true
            });
            const center = discoveredWorkCenters.get(centerId);
            if (center && !center.productionLineIds.includes(lineId)) {
                center.productionLineIds.push(lineId);
            }
        }
    });

    // Step 3: Assign workstations to lines based on data
    apiData.forEach(row => {
        const centerId = String(row.Centro).trim();
        const lineName = String(row.Linea).trim();
        const workstationName = String(row.PuestoTrabajo).trim();
        const lineId = `pl---${centerId}---${lineName}`;
        const workstationId = `wd---${centerId}---${workstationName}`;
        
        const line = discoveredLines.get(lineId);
        if (line && !line.assignedWorkstations.some(ws => ws.definitionId === workstationId)) {
            line.assignedWorkstations.push({ definitionId: workstationId, quantity: 1 });
        }
    });

    // Step 4: Override workstation quantities with predefined values where they exist
    discoveredLines.forEach(line => {
        const predefinedQuantities = getPredefinedQuantities(line.workCenterId, line.name);
        if (predefinedQuantities.length > 0) {
            const newAssignedWorkstations = line.assignedWorkstations.map(currentAs => {
                const predefined = predefinedQuantities.find(p => p.definitionId === currentAs.definitionId);
                return { ...currentAs, quantity: predefined ? predefined.quantity : currentAs.quantity };
            });
            
            // Add any predefined workstations that were not discovered, just in case
            predefinedQuantities.forEach(predefined => {
                if (!newAssignedWorkstations.some(as => as.definitionId === predefined.definitionId)) {
                    newAssignedWorkstations.push(predefined);
                }
            });
            
            line.assignedWorkstations = newAssignedWorkstations;
        }
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
        '1000': {
            'LINEA 1': { 'Armado': 12, 'Cerrado': 6 },
            'LINEA 2': { 'Armado': 6, 'Cerrado': 4 }
        },
        '2000': {
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
    onProgress: (progress: PlanningProgress | null) => void,
    auditLog: string[]
): Promise<ProductionPlan> => {
    
    logger.log(`--- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN ---`, 'info');
    auditLog.push(`[${new Date().toLocaleTimeString()}] INICIO: Generación de plan de producción.`);

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

        const monthlyCapacityByLine = new Map<string, number>();
        productionLines.forEach(line => {
            const { totalHours } = getMonthlyCapacity(year, monthNum, line, holidays, shiftParameters, auditLog);
            monthlyCapacityByLine.set(line.id, totalHours);
        });

        const monthlyMovements = new Map<string, { production: number; sales: number; transfersIn: number; transfersOut: number }>();
        const getMovements = (key: string) => {
            if (!monthlyMovements.has(key)) {
                monthlyMovements.set(key, { production: 0, sales: 0, transfersIn: 0, transfersOut: 0 });
            }
            return monthlyMovements.get(key)!;
        };

        const salesThisMonth = filteredSalesData.filter(s => `${s.año}-${String(s.mes).padStart(2, '0')}` === monthKey);
        const productionNeedsThisMonth = new Map<string, { demand: number, type: 'E' | 'X' | 'F' }>();
        
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
        
        const deficitNeedsForX = new Map<string, number>();
        productionNeedsThisMonth.forEach((need, key) => {
            if (need.type === 'X') {
                const [productId, centerId] = key.split('---');
                if (centerId === '2000') { // Asumimos Guayaquil
                    const currentStock = inventoryState.get(key) || 0;
                    const netNeed = need.demand - currentStock;
                    if (netNeed > 0) {
                        deficitNeedsForX.set(key, netNeed);
                    }
                }
            }
        });
        
        deficitNeedsForX.forEach((deficit, gyeKey) => {
            const [productId] = gyeKey.split('---');
            const quitoKey = `${productId}---1000`;
            const quitoCurrentStock = inventoryState.get(quitoKey) || 0;
            const quitoLocalDemand = (productionNeedsThisMonth.get(quitoKey) || { demand: 0 }).demand;
            
            const stockAvailableForTransfer = Math.max(0, quitoCurrentStock - quitoLocalDemand - 1);
            const transferAmount = Math.min(deficit, stockAvailableForTransfer);
            
            if (transferAmount > 0) {
                auditLog.push(`[${new Date().toLocaleTimeString()}]   - Mes ${monthNum}: Quito (1000) ayudará a GYE (2000) con ${transferAmount.toFixed(0)} unidades de ${productId} (X).`);
                
                const gyeNeeds = productionNeedsThisMonth.get(gyeKey)!;
                gyeNeeds.demand -= transferAmount; 
                productionNeedsThisMonth.set(gyeKey, gyeNeeds);

                const quitoNeeds = productionNeedsThisMonth.get(quitoKey) || { demand: 0, type: 'F' };
                quitoNeeds.demand += transferAmount; 
                productionNeedsThisMonth.set(quitoKey, quitoNeeds);

                getMovements(quitoKey).transfersOut += transferAmount;
                getMovements(gyeKey).transfersIn += transferAmount;
            }
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
             const [productId, centerId] = prodCenterKey.split('---');
             const invKey = `${productId}---${centerId}`;
             const currentStock = inventoryState.get(invKey) || 0;
             const safetyStock = constraints.inventorySettings.find(inv => inv.itemId === productId && inv.centerId === centerId)?.minStock || 0;
             const netNeed = Math.max(0, (need.demand + safetyStock) - currentStock);
             auditLog.push(`[${new Date().toLocaleTimeString()}]     - Need for ${prodCenterKey}: Demand=${need.demand}, Safety=${safetyStock}, Stock=${currentStock} -> NetNeed=${netNeed.toFixed(0)}`);
             return { prodCenterKey, productId, centerId, netNeed, urgency: (currentStock - need.demand) / (need.demand || 1) };
        }).filter(item => item.netNeed > 0).sort((a,b) => a.urgency - b.urgency);
        
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
                
                const capacityInUnits = Math.floor(availableHours / timePerUnit);
                const actualProduction = Math.min(netNeed, capacityInUnits);
                auditLog.push(`[${new Date().toLocaleTimeString()}]     - Asignación para ${productId} en ${relevantLine.name}: Necesita ${netNeed.toFixed(0)}, Capacidad en unidades ${capacityInUnits.toFixed(0)} -> Producirá ${actualProduction.toFixed(0)}`);
                
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
            const finalStock = initialStock + movements.production + movements.transfersIn - movements.transfersOut - movements.sales;
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
    const weeklyGrouped = new Map<string, { production: number, sales: number, netTransfers: number, lineId: string, workCenterId: string, initialStocks: Map<string, number> }>();
    
    monthlyPlanItems.forEach(item => {
        const { year, month, productId, centerId, assignedLineId, totalQuantityToProduce, totalDemand, netTransfers, initialStock } = item;
        
        const daysInMonth = new Date(year, month, 0).getDate();
        const productionPerDay = totalQuantityToProduce / daysInMonth;
        const salesPerDay = totalDemand / daysInMonth;
        const transfersPerDay = netTransfers / daysInMonth;
        
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
                    initialStocks: new Map()
                });
            }
            const group = weeklyGrouped.get(weekKey)!;
            group.production += productionPerDay;
            group.sales += salesPerDay;
            group.netTransfers += transfersPerDay;
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
            finalStock: initialStockForWeek + data.production + data.netTransfers - data.sales,
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
    auditLog: string[]
): { totalHours: number } {
    const EFFICIENCY_FACTOR = 0.85;
    let grossTotalHours = 0;
    const daysInMonth = new Date(year, month, 0).getDate();

    auditLog.push(`[${new Date().toLocaleTimeString()}]     - Calculando capacidad para línea ${line.name} en mes ${month}:`);
    
    for (let day = 1; day <= daysInMonth; day++) {
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
        auditLog.push(`[${new Date().toLocaleTimeString()}]       - ${logMsg}`);
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
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    worksheet['!cols'] = [ { wch: 6 }, { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 } ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumen Mensual');
    XLSX.writeFile(workbook, 'Resumen_Inventario_Mensual.xlsx');
};

export const parseTacticalOrdersExcel = (file: File): Promise<ProvisionalOrder[]> => { return Promise.resolve([]); };

export const generateTacticalPlan = ( request: TacticalRequest, context: any ): TacticalPlanResult => { return { plan: [], alerts: [] }; };

export const exportSkillsToExcel = ( employees: Employee[], skills: EmployeeSkill[], machines: Machine[], constraints: AppConstraints ): void => {};





    

    




    












