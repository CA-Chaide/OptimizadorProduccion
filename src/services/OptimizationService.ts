

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

const applyPredefinedValues = (line: ProductionLine, workstations: WorkstationDefinition[]) => {
    const predefinedQuantities: { [lineName: string]: { [workstationName: string]: number } } = {
        'LINEA 1': { 'Armado': 12, 'Cerrado': 6 },
        'LINEA 2': { 'Armado': 6, 'Cerrado': 4 },
    };

    const lineConfig = predefinedQuantities[line.name];
    if (lineConfig && (line.workCenterId === '1000' || line.workCenterId === '2000')) {
        line.assignedWorkstations.forEach(as => {
            const workstationDef = workstations.find(wd => wd.id === as.definitionId);
            if (workstationDef && lineConfig[workstationDef.name]) {
                as.quantity = lineConfig[workstationDef.name];
            }
        });
    }
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
        const lineName = String(row.Linea).trim();
        const workstationName = String(row.PuestoTrabajo).trim();

        if (!discoveredWorkCenters.has(centerId)) {
            discoveredWorkCenters.set(centerId, { id: centerId, name: centerId, productionLineIds: [], isActive: true });
        }
        
        const workstationId = `wd---${workstationName}`;
        if (!discoveredWorkstations.has(workstationId)) {
            discoveredWorkstations.set(workstationId, {
                id: workstationId, name: workstationName,
                employeesPerWorkstation: 1, 
                machineCode: null, isActive: true
            });
        }
        
        const lineId = `pl---${centerId}---${lineName}`;
        if (!discoveredLines.has(lineId)) {
            discoveredLines.set(lineId, {
                id: lineId, name: lineName, workCenterId: centerId,
                processType: 'Colchones', 
                assignedWorkstations: [],
                capacity: { maxUnitsPerHour: 0, normalUnitsPerHour: 0, minUnitsPerHour: 0 },
                materialsHandled: [], isActive: true
            });
        }
        
        const line = discoveredLines.get(lineId)!;
        if (!line.assignedWorkstations.some(as => as.definitionId === workstationId)) {
             line.assignedWorkstations.push({ definitionId: workstationId, quantity: 1 }); 
        }
        
        const center = discoveredWorkCenters.get(centerId)!;
        if(!center.productionLineIds.includes(lineId)){
            center.productionLineIds.push(lineId);
        }
    });

    // Log para auditoría de puestos de cerrado
    const allWorkstationNames = Array.from(discoveredWorkstations.values()).map(ws => ws.name);
    const cerradoWorkstations = allWorkstationNames.filter(name => name.toLowerCase().includes('cerrado'));
    console.log(`[Auditoría de Puestos] Se encontraron ${cerradoWorkstations.length} tipos de puestos de 'Cerrado' en los datos de la API:`, cerradoWorkstations);

    const finalWorkstations = Array.from(discoveredWorkstations.values()).map(ws => {
        const userEditedWs = currentConstraints.workstationDefinitions.find(w => w.id === ws.id);
        if (userEditedWs) {
            ws.employeesPerWorkstation = userEditedWs.employeesPerWorkstation > 0 ? userEditedWs.employeesPerWorkstation : 1;
            ws.machineCode = userEditedWs.machineCode;
        }
        return ws;
    });

    const finalLines = Array.from(discoveredLines.values()).map(line => {
        applyPredefinedValues(line, finalWorkstations);
        const userEditedLine = currentConstraints.productionLines.find(l => l.id === line.id);
        if (userEditedLine) {
            line.processType = userEditedLine.processType;
            // Mantener la cantidad de puestos si el usuario ya la editó
            line.assignedWorkstations.forEach(as => {
                const userEditedAs = userEditedLine.assignedWorkstations.find(uas => uas.definitionId === as.definitionId);
                if (userEditedAs) {
                    as.quantity = userEditedAs.quantity;
                }
            });
        }
        return line;
    });
    
    if(discoveredWorkCenters.size === 0 || discoveredLines.size === 0) {
        const structuralError = "Error Crítico: No se pudo descubrir ninguna estructura de producción (Centros o Líneas) a partir de los datos. Revise la fuente de datos 'TiemposEnsamblado'.";
        validationErrors.push(structuralError);
        logger.log(`[${timestamp}] [STRUCTURE ERROR] ${structuralError}`,'error');
        return { newConstraints: currentConstraints, validationErrors, dataCompletenessErrors };
    }

    const uniqueProductCenterPairs = new Set(apiData.map(row => `${normalizeMaterialCode(row.CodMaterial)}---${String(row.Centro).trim()}`));
    const inventorySettings: InventorySetting[] = [];
    
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
            if (line && !line.materialsHandled.includes(productId)) line.materialsHandled.push(productId);
        });
    });

    const newConstraints: AppConstraints = {
        ...currentConstraints,
        workCenters: Array.from(discoveredWorkCenters.values()),
        productionLines: finalLines,
        workstationDefinitions: finalWorkstations,
        productProcessInfos: [], 
        inventorySettings: inventorySettings, 
    };
    logger.log(`[${timestamp}] Procesamiento y validación completados. Centros: ${discoveredWorkCenters.size}, Líneas: ${discoveredLines.size}, Puestos: ${discoveredWorkstations.size}, Inventario: ${inventorySettings.length}`,'success');
    return { newConstraints, validationErrors: [], dataCompletenessErrors: [] };
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
): Promise<ProductionPlan> => {
    const timestamp = new Date().toLocaleTimeString();
    const auditLog: string[] = [];
    logger.log(`[${timestamp}] --- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN ---`, 'info');

    var { holidays, productionLines, workstationDefinitions, shiftParameters, laborCostFactors, globalBaseCostPerHour } = constraints;

    if (salesData.length === 0) {
        logger.log("Error: No hay datos de ventas para planificar.", 'error');
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }
     if (!laborCostFactors || !globalBaseCostPerHour || !shiftParameters) {
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
        logger.log(`[${new Date().toLocaleTimeString()}] [Punto 1: Motor] Inventario inicial cargado DIRECTAMENTE de CuboInventarios. Total para centro 1000: ${totalStockCentro1000.toLocaleString()}`, 'success');
    } else {
        logger.log(`[${new Date().toLocaleTimeString()}] ADVERTENCIA: No se pudo cargar el inventario inicial desde CuboInventarios. La planificación puede ser imprecisa.`, 'warning');
    }
    
    const initialInventoryState = new Map(inventoryState);
    const monthlyPlanItems: MonthlyProductionPlanItem[] = [];
    let productionBacklog = new Map<string, number>();

    const plannableMaterialCodes = new Set(apiData.map(item => normalizeMaterialCode(item.CodMaterial)));
    const filteredSalesData = salesData.filter(sale => plannableMaterialCodes.has(normalizeMaterialCode(sale.código)));
    const allMonthKeys = new Set<string>();
    filteredSalesData.forEach(s => allMonthKeys.add(`${s.año}-${String(s.mes).padStart(2, '0')}`));
    const planningMonths = Array.from(allMonthKeys).sort();
    
    logger.log(`[${new Date().toLocaleTimeString()}] Horizonte de planificación: ${planningMonths.length > 0 ? `${planningMonths[0]} a ${planningMonths[planningMonths.length-1]}` : 'Ninguno'}`, 'info');

    for (let i = 0; i < planningMonths.length; i++) {
        const monthKey = planningMonths[i];
        const [year, monthNum] = monthKey.split('-').map(Number);
        const monthTimestamp = new Date().toLocaleTimeString();
        
        onProgress({ message: `Planificando mes ${monthNum}...`, step: 'monthly', current: i + 1, total: planningMonths.length });
        logger.log(`\n[${monthTimestamp}] --- Planificando Mes ${monthNum}/${year} ---`, 'info');

        // Get monthly capacity and create a mutable copy for this month's planning
        const monthlyCapacityByLine = new Map<string, number>();
        productionLines.forEach(line => {
            const { totalHours } = getMonthlyCapacity(year, monthNum, line.id, holidays, shiftParameters);
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
        const productionNeedsThisMonth = new Map<string, number>();
        
        salesThisMonth.forEach(sale => {
            const productId = normalizeMaterialCode(sale.código);
            const demandCenterId = String(sale.centro).trim();
            const demandKey = `${productId}---${demandCenterId}`;
            
            getMovements(demandKey).sales += sale.unidadesProyectado;

            if (sale.claseAprovisionamiento === 'F' && demandCenterId !== '1000') {
                const productionCenterId = '1000';
                const productionKey = `${productId}---${productionCenterId}`;
                productionNeedsThisMonth.set(productionKey, (productionNeedsThisMonth.get(productionKey) || 0) + sale.unidadesProyectado);
                getMovements(`${productId}---${productionCenterId}`).transfersOut += sale.unidadesProyectado;
                getMovements(`${productId}---${demandCenterId}`).transfersIn += sale.unidadesProyectado;

            } else {
                const productionCenterId = demandCenterId;
                const productionKey = `${productId}---${productionCenterId}`;
                productionNeedsThisMonth.set(productionKey, (productionNeedsThisMonth.get(productionKey) || 0) + sale.unidadesProyectado);
            }
        });
        
        auditLog.push(`[${new Date().toLocaleTimeString()}] Mes ${monthNum}: Demanda local y de traslados consolidada.`);
        
        productionBacklog.forEach((qty, key) => {
            productionNeedsThisMonth.set(key, (productionNeedsThisMonth.get(key) || 0) + qty);
            auditLog.push(`[${new Date().toLocaleTimeString()}] -> Añadiendo ${qty.toFixed(0)} unidades de backlog para ${key}`);
        });
        productionBacklog.clear();

        const allNeeds = Array.from(productionNeedsThisMonth.entries()).map(([prodCenterKey, totalDemand]) => {
             const [productId, centerId] = prodCenterKey.split('---');
             const invKey = `${productId}---${centerId}`;
             const currentStock = inventoryState.get(invKey) || 0;
             const safetyStock = constraints.inventorySettings.find(inv => inv.itemId === productId && inv.centerId === centerId)?.minStock || 0;
             const netNeed = Math.max(0, (totalDemand + safetyStock) - currentStock);
             return { prodCenterKey, productId, centerId, netNeed, urgency: (currentStock - totalDemand) / (totalDemand || 1) };
        }).filter(item => item.netNeed > 0).sort((a,b) => a.urgency - b.urgency);
        

        for (const { prodCenterKey, productId, centerId, netNeed } of allNeeds) {
             const invKey = `${productId}---${centerId}`;

            const linesInCenter = productionLines.filter(l => l.workCenterId === centerId && l.materialsHandled.includes(productId));
            const relevantLine = linesInCenter[0]; // Simplification: assume first valid line

            if (relevantLine) {
                const timePerUnit = calculateEffectiveManufacturingTime(productId, relevantLine, apiData, workstationDefinitions);
                const availableHours = monthlyCapacityByLine.get(relevantLine.id) || 0;

                if (timePerUnit === Infinity || timePerUnit <= 0) {
                    auditLog.push(`[WARN] Tiempo de fabricación inválido para ${productId} en línea ${relevantLine.name}. Saltando.`);
                    productionBacklog.set(prodCenterKey, (productionBacklog.get(prodCenterKey) || 0) + netNeed);
                    continue;
                }
                
                const capacityInUnits = Math.floor(availableHours / timePerUnit);
                const actualProduction = Math.min(netNeed, capacityInUnits);
                
                if (actualProduction > 0) {
                    const hoursForProduction = actualProduction * timePerUnit;
                    getMovements(invKey).production += actualProduction;
                    
                    // Decrease available capacity for the line
                    monthlyCapacityByLine.set(relevantLine.id, availableHours - hoursForProduction);
                }

                const pendingUnits = netNeed - actualProduction;
                if (pendingUnits > 0) {
                    auditLog.push(`[BACKLOG] Insuficiente capacidad para ${productId}. Faltantes: ${pendingUnits.toFixed(0)}.`);
                    productionBacklog.set(prodCenterKey, (productionBacklog.get(prodCenterKey) || 0) + pendingUnits);
                }
            } else {
                 auditLog.push(`[WARN] No se encontró línea para ${productId} en centro ${centerId}. Faltantes: ${netNeed.toFixed(0)}.`);
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
    
    logger.log(`[${new Date().toLocaleTimeString()}] Plan mensual completado.`, 'success');
    
    // --- GENERACIÓN DEL PLAN SEMANAL ---
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
                 // Simplification: use the monthly initial stock for the first week it appears.
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


function getMonthlyCapacity(year: number, month: number, lineId: string, holidays: Holiday[], shiftParams: ShiftParameters): { regularHours: number, extraHours: number, saturdayHours: number, totalHours: number } {
    const EFFICIENCY_FACTOR = 0.84;
    const capacity = { regularHours: 0, extraHours: 0, saturdayHours: 0 };
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const checkDate = new Date(year, month - 1, day);
        const dayOfWeek = checkDate.getDay(); 

        let isProdHoliday = false;
        const holidayInfo = holidays.find(h => h.date === checkDate.toISOString().split('T')[0]);
        if (holidayInfo) {
            if (holidayInfo.appliesTo === 'Toda la Planta' && !holidayInfo.isProductionAllowed) {
                isProdHoliday = true;
            } else if (holidayInfo.appliesTo === lineId && !holidayInfo.isProductionAllowed) {
                isProdHoliday = true;
            }
        }
        if (isProdHoliday || dayOfWeek === 0) continue; 

        if (dayOfWeek >= 1 && dayOfWeek <= 5) { 
            capacity.regularHours += shiftParams.regularHoursPerDay;
            capacity.extraHours += shiftParams.extraHoursPerDay;
        } else if (dayOfWeek === 6) { 
             if (!holidayInfo || (holidayInfo && holidayInfo.isProductionAllowed)) {
                capacity.saturdayHours += shiftParams.saturdayAndHolidayHours;
             }
        } else if (holidayInfo && holidayInfo.isProductionAllowed) { 
            capacity.saturdayHours += shiftParams.saturdayAndHolidayHours;
        }
    }
    
    const grossTotalHours = capacity.regularHours + capacity.extraHours + capacity.saturdayHours;
    const netTotalHours = grossTotalHours * EFFICIENCY_FACTOR;

    return { ...capacity, totalHours: netTotalHours };
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





    

    
