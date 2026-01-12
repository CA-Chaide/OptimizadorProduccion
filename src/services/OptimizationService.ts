

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
    
    discoveredLines.forEach(line => {
        const workstationIdsForLine = new Set<string>();
        apiData.forEach(row => {
            const centerId = String(row.Centro).trim();
            const lineName = String(row.Linea).trim();
            
            if (centerId === line.workCenterId && lineName === line.name) {
                const workstationName = String(row.PuestoTrabajo).trim();
                const workstationId = `wd---${centerId}---${workstationName}`;
                workstationIdsForLine.add(workstationId);
            }
        });
        
        line.assignedWorkstations = Array.from(workstationIdsForLine).map(wsId => ({
            definitionId: wsId,
            quantity: 1 
        }));
    });

    discoveredLines.forEach(line => {
        const predefinedQuantities = getPredefinedQuantities(line.workCenterId, line.name);
        const userEditedLine = currentConstraints.productionLines.find(l => l.id === line.id);
        
        line.assignedWorkstations.forEach(as => {
            const predefined = predefinedQuantities.find(p => p.definitionId === as.definitionId);
            const userDefined = userEditedLine?.assignedWorkstations.find(u => u.definitionId === as.definitionId);
            
            if (userDefined) {
                as.quantity = userDefined.quantity;
            } else if (predefined) {
                as.quantity = predefined.quantity;
            } else {
                as.quantity = 1;
            }
        });
    });

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
            'LINEA 1': { 'Armado': 12, 'Cerrado L1': 6 },
            'LINEA 2': { 'Armado': 6, 'Pegado1 L2': 2, 'Pegado2 L2': 2, 'Cerrado1 L2': 4, 'Cerrado2 L2': 4 },
            'LINEA 3': { 'Armado': 2 },
            'LINEA 5': { 'Armado': 2 }
        },
        '2000': {
            'LINEA 1': { 'Armado': 8, 'Cerrado L1': 6 },
            'LINEA 2': { 'Armado': 4, 'Pegado1 L2': 2, 'Cerrado1 L2': 2, 'Cerrado2 L2': 2 },
            'LINEA 5': { 'Armado': 3 }
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

    const getMonthlyCapacity = (
        year: number,
        month: number,
        line: ProductionLine,
        startDay: number = 1
    ): { totalHours: number } => {
        const EFFICIENCY_FACTOR = 0.87;
        let grossTotalHours = 0;
        const daysInMonth = new Date(year, month, 0).getDate();
        
        for (let day = startDay; day <= daysInMonth; day++) {
            const checkDate = new Date(year, month - 1, day);
            const dayOfWeek = checkDate.getDay(); 
            
            let dailyHours = 0;
            
            if (dayOfWeek !== 0) { // Not Sunday
                const holidayInfo = holidays.find(h => h.date === checkDate.toISOString().split('T')[0]);
                
                let isNonWorkingHoliday = false;
                if (holidayInfo && holidayInfo.dayType === 'asueto') {
                    const appliesTo = holidayInfo.appliesTo;
                    if (appliesTo === 'Toda la Planta' || appliesTo === line.workCenterId || appliesTo === line.processType || appliesTo === line.id) {
                        isNonWorkingHoliday = true;
                    }
                }

                if (!isNonWorkingHoliday) {
                     if (holidayInfo && holidayInfo.isProductionAllowed) {
                        if (holidayInfo.dayType === 'full') {
                            dailyHours = shiftParameters.regularHoursPerDay;
                        } else if (holidayInfo.dayType === 'half') {
                            dailyHours = 5;
                        }
                    } else {
                        if (dayOfWeek === 6) { // Saturday
                            dailyHours = shiftParameters.saturdayAndHolidayHours;
                        } else { // Weekday
                            dailyHours = shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay;
                        }
                    }
                }
            }
            
            grossTotalHours += dailyHours;
        }

        const netTotalHours = grossTotalHours * EFFICIENCY_FACTOR;
        return { totalHours: netTotalHours };
    };

    
    const initialInventoryState = new Map<string, number>(); 
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
                    initialInventoryState.set(key, (initialInventoryState.get(key) || 0) + stock);
                }
            }
        });
        const logMsg = `Inventario inicial cargado desde CuboInventarios. Se encontraron ${initialInventoryState.size} pares producto-centro con stock.`;
        auditLog.push(`[${new Date().toLocaleTimeString()}] INFO: ${logMsg}`);
        logger.log(`[${new Date().toLocaleTimeString()}] [Punto 1: Motor] ${logMsg}`, 'success');

    } else {
        const logMsg = `ADVERTENCIA: No se pudo cargar el inventario inicial desde CuboInventarios. La planificación puede ser imprecisa.`;
        auditLog.push(`[${new Date().toLocaleTimeString()}] ${logMsg}`);
        logger.log(`[${new Date().toLocaleTimeString()}] ${logMsg}`, 'warning');
    }
    
    const monthlyPlanItems: MonthlyProductionPlanItem[] = [];
    let salesBacklog = new Map<string, number>();

    const plannableMaterialCodes = new Set(apiData.map(item => normalizeMaterialCode(item.CodMaterial)));
    const filteredSalesData = salesData.filter(sale => plannableMaterialCodes.has(normalizeMaterialCode(sale.código)));
    const allMonthKeys = new Set<string>();
    filteredSalesData.forEach(s => allMonthKeys.add(`${s.año}-${String(s.mes).padStart(2, '0')}`));
    const planningMonths = Array.from(allMonthKeys).sort();
    
    const horizonMsg = `Horizonte de planificación: ${planningMonths.length > 0 ? `${planningMonths[0]} a ${planningMonths[planningMonths.length-1]}` : 'Ninguno'}`;
    auditLog.push(`[${new Date().toLocaleTimeString()}] INFO: ${horizonMsg}`);
    logger.log(`[${new Date().toLocaleTimeString()}] ${horizonMsg}`, 'info');

    let inventoryState = new Map(initialInventoryState);

    for (let i = 0; i < planningMonths.length; i++) {
        const monthKey = planningMonths[i];
        const [year, monthNum] = monthKey.split('-').map(Number);
        
        onProgress({ message: `Planificando mes ${monthNum}...`, step: 'monthly', current: i + 1, total: planningMonths.length });
        auditLog.push(`\n[${new Date().toLocaleTimeString()}] --- Planificando Mes ${monthNum}/${year} ---`);
        
        const isCurrentPlanningMonth = year === new Date().getFullYear() && monthNum === new Date().getMonth() + 1;
        const startDayForCapacityCalc = (prorateCurrentMonth && isCurrentPlanningMonth) ? new Date().getDate() : 1;
        
        let salesThisMonth = filteredSalesData.filter(s => `${s.año}-${String(s.mes).padStart(2, '0')}` === monthKey);

        if (prorateCurrentMonth && isCurrentPlanningMonth) {
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

        const monthlyCapacityByLine = new Map<string, number>();
        productionLines.forEach(line => {
            const { totalHours } = getMonthlyCapacity(year, monthNum, line, startDayForCapacityCalc);
            monthlyCapacityByLine.set(line.id, totalHours);
        });

        const monthlyMovements = new Map<string, { production: number; salesDemand: number; dispatches: number; transfersIn: number; transfersOut: number; initialStock: number }>();
        const getMovements = (key: string) => {
            if (!monthlyMovements.has(key)) {
                monthlyMovements.set(key, { production: 0, salesDemand: 0, dispatches: 0, transfersIn: 0, transfersOut: 0, initialStock: 0 });
            }
            return monthlyMovements.get(key)!;
        };
        
        const productionNeedsThisMonth = new Map<string, { demandVentas: number; demandTrasladosF: number; demandTrasladosX: number; }>();
        const getNeeds = (key: string) => {
            if (!productionNeedsThisMonth.has(key)) {
                productionNeedsThisMonth.set(key, { demandVentas: 0, demandTrasladosF: 0, demandTrasladosX: 0 });
            }
            return productionNeedsThisMonth.get(key)!;
        };

        const allDemandKeys = new Set([...salesThisMonth.map(s => `${normalizeMaterialCode(s.código)}---${String(s.centro).trim()}`), ...salesBacklog.keys()]);

        allDemandKeys.forEach(demandKey => {
            const [productId, demandCenterId] = demandKey.split('---');
            const sale = salesThisMonth.find(s => normalizeMaterialCode(s.código) === productId && String(s.centro).trim() === demandCenterId);
            const totalDemandForDispatch = (sale?.unidadesProyectado || 0) + (salesBacklog.get(demandKey) || 0);

            getMovements(demandKey).salesDemand += totalDemandForDispatch;
            
            let classType: 'E' | 'X' | 'F' | null | undefined = null;
            
            const centralRuleRow = apiData.find(d => 
                normalizeMaterialCode(d.CodMaterial) === productId && 
                String(d.Centro).trim() === '1000'
            );
            
            if (centralRuleRow?.ClaseAprovisionamiento === 'F') {
                classType = 'F';
            } else {
                const localRuleRow = apiData.find(d => 
                    normalizeMaterialCode(d.CodMaterial) === productId && 
                    String(d.Centro).trim() === demandCenterId
                );
                classType = localRuleRow?.ClaseAprovisionamiento;
            }

            if (classType === 'F' && demandCenterId !== '1000') {
                const needsKey1000 = `${productId}---1000`;
                getNeeds(needsKey1000).demandTrasladosF += totalDemandForDispatch;
            } else { 
                getNeeds(demandKey).demandVentas += totalDemandForDispatch;
            }
        });

        const productCenterPairs = Array.from(new Set(filteredSalesData.map(s => `${normalizeMaterialCode(s.código)}---${s.centro}`)));

        const allNeeds = productCenterPairs.map(pairKey => {
             const [productId, centerId] = pairKey.split('---');
            const safetyStock = constraints.inventorySettings.find(inv => inv.itemId === productId && inv.centerId === centerId)?.minStock || 0;
            const currentStock = inventoryState.get(pairKey) || 0;
            const salesNeed = getNeeds(pairKey).demandVentas;
            const transferNeed = getNeeds(pairKey).demandTrasladosF + getNeeds(pairKey).demandTrasladosX;
            
            const netNeedForProduction = Math.max(0, (salesNeed + transferNeed + safetyStock) - currentStock);
            return { prodCenterKey: pairKey, netNeedForProduction };
        });

        // --- INICIO: LOGGING DE NECESIDADES ---
        const needsLog: Record<string, { ventas: number, stockSeguridad: number, traslados: number, total: number }> = {};
        productCenterPairs.forEach(pairKey => {
            const [productId, centerId] = pairKey.split('---');
            const safetyStock = constraints.inventorySettings.find(inv => inv.itemId === productId && inv.centerId === centerId)?.minStock || 0;
            const salesNeed = getNeeds(pairKey).demandVentas;
            const transferNeed = getNeeds(pairKey).demandTrasladosF + getNeeds(pairKey).demandTrasladosX;
            const totalBruto = salesNeed + transferNeed + safetyStock;

            if (totalBruto > 0) {
                if (!needsLog[centerId]) {
                    needsLog[centerId] = { ventas: 0, stockSeguridad: 0, traslados: 0, total: 0 };
                }
                needsLog[centerId].ventas += salesNeed;
                needsLog[centerId].stockSeguridad += safetyStock;
                needsLog[centerId].traslados += transferNeed;
                needsLog[centerId].total += totalBruto;
            }
        });
        console.log(`\n--- TOTAL DE NECESIDADES BRUTAS (MES ${monthNum}/${year}) ---`);
        console.table(needsLog);
        // --- FIN: LOGGING DE NECESIDADES ---


        for (const { prodCenterKey, netNeedForProduction } of allNeeds) {
            let remainingNeed = netNeedForProduction;
            if (remainingNeed <= 0) continue;

            const [productId, centerId] = prodCenterKey.split('---');
            const invKey = `${productId}---${centerId}`;

            const linesForProduct = productionLines.filter(l => l.workCenterId === centerId && l.materialsHandled.includes(productId));
            
            for (const line of linesForProduct) {
                if(remainingNeed <= 0) break;

                const availableHours = monthlyCapacityByLine.get(line.id) || 0;
                const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);

                if (timePerUnit === Infinity || timePerUnit <= 0) continue;

                const capacityInUnits = Math.floor(availableHours / timePerUnit);
                const actualProduction = Math.min(remainingNeed, capacityInUnits);
                
                if (actualProduction > 0) {
                    const hoursForProduction = actualProduction * timePerUnit;
                    getMovements(invKey).production += actualProduction;
                    monthlyCapacityByLine.set(line.id, availableHours - hoursForProduction);
                    remainingNeed -= actualProduction;
                }
            }
        }
        
        // --- INICIO: LOGGING DE PRODUCCIÓN ---
        const prodLog: Record<string, { produccionPlanificada: number }> = {};
        for (const [pairKey, movement] of monthlyMovements.entries()) {
            if (movement.production > 0) {
                const [, centerId] = pairKey.split('---');
                if (!prodLog[centerId]) {
                    prodLog[centerId] = { produccionPlanificada: 0 };
                }
                prodLog[centerId].produccionPlanificada += movement.production;
            }
        }
        console.log(`\n--- TOTAL DE PRODUCCIÓN PLANIFICADA (MES ${monthNum}/${year}) ---`);
        console.table(prodLog);
        // --- FIN: LOGGING DE PRODUCCIÓN ---
        

        allDemandKeys.forEach(demandKey => {
             const [productId, demandCenterId] = demandKey.split('---');
             if(demandCenterId === '1000') return;

             let classType: 'E' | 'X' | 'F' | null | undefined = null;
             const centralRuleRow = apiData.find(d => normalizeMaterialCode(d.CodMaterial) === productId && String(d.Centro).trim() === '1000');
             if (centralRuleRow?.ClaseAprovisionamiento === 'F') {
                 classType = 'F';
             }

             if (classType === 'F') {
                 const transferDemand = getMovements(demandKey).salesDemand;
                 if (transferDemand > 0) {
                     const key1000 = `${productId}---1000`;
                     const stockAt1000 = (inventoryState.get(key1000) || 0) + getMovements(key1000).production;
                     const actualTransfer = Math.min(transferDemand, stockAt1000);

                     if (actualTransfer > 0) {
                         getMovements(key1000).transfersOut += actualTransfer;
                         getMovements(demandKey).transfersIn += actualTransfer;
                         inventoryState.set(key1000, (inventoryState.get(key1000) || 0) - actualTransfer);
                     }
                 }
             }
        });


        const newSalesBacklog = new Map<string, number>();
        const allProductCenterPairsThisMonth = new Set<string>();
        inventoryState.forEach((_, key) => allProductCenterPairsThisMonth.add(key));
        monthlyMovements.forEach((_, key) => allProductCenterPairsThisMonth.add(key));
        allDemandKeys.forEach(key => allProductCenterPairsThisMonth.add(key));

        for (const pairKey of allProductCenterPairsThisMonth) {
            const [productId, centerId] = pairKey.split('---');
            const initialStock = inventoryState.get(pairKey) || 0;
            
            const movements = getMovements(pairKey);
            movements.initialStock = initialStock;

            const totalSalesDemand = movements.salesDemand;

            const availableForDispatch = initialStock + movements.production + movements.transfersIn - movements.transfersOut;
            const dispatches = Math.min(availableForDispatch, totalSalesDemand);
            const finalStock = availableForDispatch - dispatches;
            
            const newBacklog = Math.max(0, totalSalesDemand - dispatches);

            if (newBacklog > 0) {
                newSalesBacklog.set(pairKey, newBacklog);
            }
            
            inventoryState.set(pairKey, finalStock);
            movements.dispatches = dispatches;
        }

        for (const [pairKey, movements] of monthlyMovements.entries()) {
             const [productId, centerId] = pairKey.split('---');
             monthlyPlanItems.push({
                id: `${monthKey}---${pairKey}`, year, month: monthNum, productId, centerId,
                productName: salesData.find(s=> normalizeMaterialCode(s.código) === productId)?.descripciónMaterial || productId,
                totalQuantityToProduce: movements.production,
                totalDemand: movements.salesDemand,
                dispatches: movements.dispatches,
                netTransfers: movements.transfersIn - movements.transfersOut,
                initialStock: movements.initialStock,
                finalStock: (inventoryState.get(pairKey) || 0),
                backlogVentas: newSalesBacklog.get(pairKey) || 0,
                backlogTrasladosF: 0, 
                backlogTrasladosX: 0,
                totalHoursWorked: 0, 
                totalEstimatedLaborCost: 0, 
            });
        }


        salesBacklog = newSalesBacklog;
    }
    
    auditLog.push(`[${new Date().toLocaleTimeString()}] FIN: Plan mensual completado.`);
    logger.log(`[${new Date().toLocaleTimeString()}] Plan mensual completado.`, 'success');
    
    onProgress(null);
    return { dailyPlan: [], monthlyPlan: monthlyPlanItems, weeklyPlan: [], auditLog, initialInventory: initialInventoryState };
};

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
    
    // Aggregate production by month, center, and material
    const aggregatedProduction = new Map<string, number>();
    plan.forEach(item => {
        const key = `${item.month}-${item.centerId}-${item.productId}`;
        const currentQty = aggregatedProduction.get(key) || 0;
        aggregatedProduction.set(key, currentQty + item.totalQuantityToProduce);
    });

    const dataToExport = Array.from(aggregatedProduction.entries()).map(([key, quantity]) => {
        const [month, center, material] = key.split('-');
        return {
            'Mes': MONTH_NAMES[parseInt(month, 10) - 1],
            'Centro': center,
            'codigo material': material,
            'cantidad a fabricar': Math.round(quantity),
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    worksheet['!cols'] = [ { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 20 } ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plan Mensual Fabricacion');
    XLSX.writeFile(workbook, 'Resumen_Inventario_Mensual.xlsx');
};

export const parseTacticalOrdersExcel = (file: File): Promise<ProvisionalOrder[]> => { return Promise.resolve([]); };

export const generateTacticalPlan = ( request: TacticalRequest, context: any ): TacticalPlanResult => { return { plan: [], alerts: [] }; };

export const exportSkillsToExcel = ( employees: Employee[], skills: EmployeeSkill[], machines: Machine[], constraints: AppConstraints ): void => {};

