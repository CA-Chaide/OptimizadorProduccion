

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

declare var XLSX: any; 

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

const applyPredefinedValues = (
    workCenters: WorkCenter[],
    productionLines: ProductionLine[],
    workstationDefinitions: WorkstationDefinition[]
): { updatedLines: ProductionLine[], updatedWorkstations: WorkstationDefinition[] } => {
    
    const predefinedQuantities: { [centerId: string]: { [lineName: string]: { [workstationName: string]: number } } } = {
        '1000': {
            'LINEA 1': { 'Armado': 12, 'Cerrado': 6 },
            'LINEA 2': { 'Armado': 6, 'Cerrado': 8 },
            'LINEA 3': { 'Armado': 1, 'Cerrado': 1 },
            'LINEA 5': { 'Armado': 2 },
        },
        '2000': {
            'LINEA 1': { 'Armado': 9, 'Cerrado': 5 },
            'LINEA 2': { 'Armado': 4, 'Cerrado': 4 },
            'LINEA 5': { 'Armado': 3 },
        }
    };
    
    let workstationsMap = new Map(workstationDefinitions.map(wd => [wd.id, {...wd}]));
    let linesMap = new Map(productionLines.map(pl => [pl.id, {...pl, assignedWorkstations: pl.assignedWorkstations.map(as => ({...as}))}]));

    for (const centerId in predefinedQuantities) {
        const centerLines = predefinedQuantities[centerId];
        for (const lineName in centerLines) {
            const line = Array.from(linesMap.values()).find(l => l.workCenterId === centerId && l.name === lineName);
            if (!line) continue;

            const workstationSettings = centerLines[lineName];
            for (const workstationName in workstationSettings) {
                const quantity = workstationSettings[workstationName];
                const workstation = Array.from(workstationsMap.values()).find(w => w.name === workstationName);

                if (!workstation) continue;

                const assignedWsIndex = line.assignedWorkstations.findIndex(as => as.definitionId === workstation.id);
                if (assignedWsIndex !== -1) {
                    line.assignedWorkstations[assignedWsIndex].quantity = quantity;
                }
            }
        }
    }
    
    return {
        updatedLines: Array.from(linesMap.values()),
        updatedWorkstations: Array.from(workstationsMap.values())
    };
};

export function processAndValidateAssemblyData(
    apiData: TiempoEnsambleItem[],
    currentConstraints: AppConstraints,
): {
    newConstraints: AppConstraints,
    validationErrors: string[],
    dataCompletenessErrors: string[]
} {
    console.log('--- INICIANDO PROCESAMIENTO Y VALIDACIÓN DE DATOS DE ENSAMBLE ---', { receivedDataCount: apiData.length });
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
        console.error('[VALIDATION ERRORS] Errores de completitud de datos:', dataCompletenessErrors);
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

    const { updatedLines: linesWithPredefinedQuantities } = applyPredefinedValues(
        Array.from(discoveredWorkCenters.values()),
        Array.from(discoveredLines.values()),
        Array.from(discoveredWorkstations.values())
    );

    const finalLines = linesWithPredefinedQuantities.map(line => {
        const userEditedLine = currentConstraints.productionLines.find(l => l.id === line.id);
        if (userEditedLine) {
            line.processType = userEditedLine.processType;
            line.assignedWorkstations.forEach(as => {
                const userEditedAs = userEditedLine.assignedWorkstations.find(uas => uas.definitionId === as.definitionId);
                if (userEditedAs && userEditedAs.quantity !== 1 && as.quantity !== userEditedAs.quantity) {
                    as.quantity = userEditedAs.quantity;
                }
            });
        }
        return line;
    });

    const finalWorkstations = Array.from(discoveredWorkstations.values()).map(ws => {
        const userEditedWs = currentConstraints.workstationDefinitions.find(w => w.id === ws.id);
        if (userEditedWs) {
            ws.employeesPerWorkstation = userEditedWs.employeesPerWorkstation > 0 ? userEditedWs.employeesPerWorkstation : 1;
            ws.machineCode = userEditedWs.machineCode;
        }
        return ws;
    });
    
    if(discoveredWorkCenters.size === 0 || discoveredLines.size === 0) {
        const structuralError = "Error Crítico: No se pudo descubrir ninguna estructura de producción (Centros o Líneas) a partir de los datos. Revise la fuente de datos 'TiemposEnsamblado'.";
        validationErrors.push(structuralError);
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
                currentStock: parseInt(String(inventoryDataSource.StockActual || 0), 10),
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
    const workstationEffectiveTimes: number[] = [];
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
            const timeMinutes = apiRow.Tiempo;
            const quantityOfPosts = assignedWorkstation.quantity > 0 ? assignedWorkstation.quantity : 1; 
            const effectiveTimeForThisPostType = timeMinutes / quantityOfPosts;
            workstationEffectiveTimes.push(effectiveTimeForThisPostType);
        }
    }
    if (line.assignedWorkstations.length > 0 && workstationEffectiveTimes.length === 0) return Infinity; 
    if (workstationEffectiveTimes.length === 0) return Infinity; 
    const bottleneckTimeMinutes = Math.max(0, ...workstationEffectiveTimes);
    return bottleneckTimeMinutes / 60; 
};

export const generateProductionPlan = async (
    planningYear: number, 
    constraints: AppConstraints, 
    apiData: TiempoEnsambleItem[], 
    salesData: SalesDataRow[],
    onProgress: (progress: PlanningProgress | null) => void,
): Promise<ProductionPlan> => {
    console.log('--- RUNNING STRATEGIC PLANNER V18 ---');
    const auditLog: string[] = ['Iniciando Planificador Estratégico v18.'];
    const { inventorySettings, holidays, productionLines, workstationDefinitions, shiftParameters, workCenters, laborCostFactors, globalBaseCostPerHour } = constraints;

    if (salesData.length === 0) {
        auditLog.push("Error: No hay datos de ventas para planificar.");
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }
     if (!laborCostFactors || !globalBaseCostPerHour || !shiftParameters) {
        auditLog.push("Error: No se han definido los parámetros de costo laboral o turnos.");
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }

    const productInfoMap = new Map<string, { name: string; provisionRule: 'E' | 'X' | 'F' }>();
    apiData.forEach(item => {
        const productId = normalizeMaterialCode(item.CodMaterial);
        if (!productInfoMap.has(productId)) {
            productInfoMap.set(productId, { name: item.Material, provisionRule: item.ClaseAprovisionamiento || 'E' });
        }
    });
    salesData.forEach(item => {
        const productId = normalizeMaterialCode(item.código);
        if (!productInfoMap.has(productId)) {
           productInfoMap.set(productId, { name: item.descripciónMaterial || item.etiqueta, provisionRule: 'E' });
        }
    });
    auditLog.push(`Se cargaron ${productInfoMap.size} productos únicos desde los datos maestros y de ventas.`);
    
    // Step 1: Aggregate pure sales demand (dispatch needs)
    const monthlyDemandMap = new Map<string, number>(); // Key: 'YYYY-MM---productId---demandCenterId', Value: units
    salesData.forEach(sale => {
        const { año, mes, código, centro, unidadesProyectado } = sale;
        const productId = normalizeMaterialCode(código);
        const centerId = String(centro).trim();
        const monthKey = `${año}-${String(mes).padStart(2, '0')}`;
        const demandKey = `${monthKey}---${productId}---${centerId}`;
        monthlyDemandMap.set(demandKey, (monthlyDemandMap.get(demandKey) || 0) + unidadesProyectado);
    });
    auditLog.push(`Paso 1: Demanda de despacho (ventas) agregada. ${monthlyDemandMap.size} entradas únicas.`);

    // Step 2: Derive production needs and transfers
    const monthlyProductionNeeds = new Map<string, number>(); // Key: 'YYYY-MM---productId---producingCenterId', Value: units
    const monthlyTransfers = new Map<string, number>(); // Key: 'YYYY-MM---productId---from---to', Value: qty

    for (const [demandKey, demandQty] of monthlyDemandMap.entries()) {
        const [monthKeyPart, productId, demandCenterId] = demandKey.split('---');
        const provisionRule = productInfoMap.get(productId)?.provisionRule || 'E';
        
        let producingCenterId = demandCenterId;
        if (provisionRule === 'F' && demandCenterId !== '1000') {
            producingCenterId = '1000';
            const transferKey = `${monthKeyPart}---${productId}---1000---${demandCenterId}`;
            monthlyTransfers.set(transferKey, (monthlyTransfers.get(transferKey) || 0) + demandQty);
        }
        
        const needKey = `${monthKeyPart}---${productId}---${producingCenterId}`;
        monthlyProductionNeeds.set(needKey, (monthlyProductionNeeds.get(needKey) || 0) + demandQty);
    }
    auditLog.push(`Paso 2: Necesidades de producción y traslados derivados. ${monthlyProductionNeeds.size} necesidades de prod, ${monthlyTransfers.size} traslados.`);

    // Step 3: Monthly Planning
    const planningMonths = Array.from(new Set(Array.from(monthlyDemandMap.keys()).map(k => k.split('---')[0]))).sort()
        .map(monthKey => {
            const [yearStr, monthStr] = monthKey.split('-');
            return { year: parseInt(yearStr), month: parseInt(monthStr) };
        });

    const monthlyPlan: MonthlyProductionPlanItem[] = [];
    let inventoryState = new Map<string, number>(); // Key: 'productId---centerId'
    inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));

    for (let i = 0; i < planningMonths.length; i++) {
        const { year, month } = planningMonths[i];
        onProgress({ message: `Planificando mes ${month}...`, step: 'monthly', current: i + 1, total: planningMonths.length });
        const monthKeyPart = `${year}-${String(month).padStart(2, '0')}`;
        
        const allProductCenterPairsThisMonth = new Set<string>();
        for (const key of monthlyDemandMap.keys()) if (key.startsWith(monthKeyPart)) allProductCenterPairsThisMonth.add(key.split('---').slice(1).join('---'));
        for (const key of monthlyProductionNeeds.keys()) if (key.startsWith(monthKeyPart)) allProductCenterPairsThisMonth.add(key.split('---').slice(1,3).join('---'));
        for (const key of monthlyTransfers.keys()) {
            if (key.startsWith(monthKeyPart)) {
                const [, productId, from, to] = key.split('---');
                allProductCenterPairsThisMonth.add(`${productId}---${from}`);
                allProductCenterPairsThisMonth.add(`${productId}---${to}`);
            }
        }
        
        const previousMonthState = new Map(inventoryState);
        const productionThisMonth = new Map<string, number>();

        for (const [prodNeedKey, totalDemandForProd] of monthlyProductionNeeds.entries()) {
            if (!prodNeedKey.startsWith(monthKeyPart)) continue;
            const [, productId, producingCenterId] = prodNeedKey.split('---');
            const itemKey = `${productId}---${producingCenterId}`;
            const initialStock = previousMonthState.get(itemKey) || 0;
            const safetyStock = inventorySettings.find(inv => inv.itemId === productId && inv.centerId === producingCenterId)?.minStock || 0;
            
            const productionNeeded = Math.max(0, totalDemandForProd + safetyStock - initialStock);
            if (productionNeeded > 0) {
                productionThisMonth.set(itemKey, (productionThisMonth.get(itemKey) || 0) + productionNeeded);
            }
        }

        // Calculate and build the monthly plan items
        for (const pairKey of allProductCenterPairsThisMonth) {
            const [productId, centerId] = pairKey.split('---');
            const initialStock = previousMonthState.get(pairKey) || 0;
            const production = productionThisMonth.get(pairKey) || 0;
            const salesDemand = monthlyDemandMap.get(`${monthKeyPart}---${pairKey}`) || 0;
            
            const transfersOut = Array.from(monthlyTransfers.entries())
                .filter(([key,]) => key.startsWith(monthKeyPart) && key.split('---')[1] === productId && key.split('---')[2] === centerId)
                .reduce((sum, [, qty]) => sum + qty, 0);

            const transfersIn = Array.from(monthlyTransfers.entries())
                .filter(([key,]) => key.startsWith(monthKeyPart) && key.split('---')[1] === productId && key.split('---')[3] === centerId)
                .reduce((sum, [, qty]) => sum + qty, 0);
                
            const finalStock = initialStock + production + transfersIn - salesDemand - transfersOut;
            inventoryState.set(pairKey, finalStock);
            
            const planItem: MonthlyProductionPlanItem = {
                id: `${monthKeyPart}---${pairKey}`,
                year, month, productId, centerId,
                productName: productInfoMap.get(productId)?.name || productId,
                totalQuantityToProduce: production,
                totalDemand: salesDemand,
                netTransfers: transfersIn - transfersOut,
                initialStock: initialStock,
                finalStock: finalStock,
                totalHoursWorked: 0, 
                totalEstimatedLaborCost: 0, 
            };
            monthlyPlan.push(planItem);
        }
    }

    onProgress(null);
    auditLog.push(`Paso 3: Plan mensual de inventario completado.`);
    
    // Step 4: Generate Weekly Plan from Monthly
    const weeklyPlan: WeeklyPlanItem[] = [];
    const monthlyPlanByProductCenter = new Map<string, MonthlyProductionPlanItem[]>();
    monthlyPlan.forEach(mp => {
        const key = `${mp.productId}---${mp.centerId}`;
        if (!monthlyPlanByProductCenter.has(key)) monthlyPlanByProductCenter.set(key, []);
        monthlyPlanByProductCenter.get(key)!.push(mp);
    });

    for (const [pcKey, items] of monthlyPlanByProductCenter.entries()) {
        const [productId, centerId] = pcKey.split('---');
        let lastWeekStock = inventorySettings.find(inv => inv.itemId === productId && inv.centerId === centerId)?.currentStock || 0;

        for (const mp of items.sort((a, b) => a.year * 100 + a.month - (b.year * 100 + b.month))) {
            const daysInMonth = new Date(mp.year, mp.month, 0).getDate();
            const weeksInMonth: { [weekKey: string]: { days: number } } = {};
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(mp.year, mp.month - 1, day);
                const { year, week } = getWeekNumber(date);
                const weekKey = `${year}-W${String(week).padStart(2, '0')}`;
                if (!weeksInMonth[weekKey]) weeksInMonth[weekKey] = { days: 0 };
                weeksInMonth[weekKey].days++;
            }

            for (const weekKey of Object.keys(weeksInMonth).sort()) {
                const { days } = weeksInMonth[weekKey];
                const [yearStr, weekStr] = weekKey.split('-W');
                const year = parseInt(yearStr, 10);
                const week = parseInt(weekStr, 10);

                const weeklyProduction = (mp.totalQuantityToProduce / daysInMonth) * days;
                const weeklySales = (mp.totalDemand / daysInMonth) * days;
                const weeklyNetTransfers = (mp.netTransfers || 0) / daysInMonth * days;

                const finalStock = lastWeekStock + weeklyProduction + weeklyNetTransfers - weeklySales;

                weeklyPlan.push({
                    id: `${productId}---${centerId}---${weekKey}`,
                    year, week, productId, workCenterId: centerId,
                    lineId: mp.assignedLineId || 'N/A',
                    initialStock: lastWeekStock,
                    production: weeklyProduction,
                    sales: weeklySales,
                    netTransfers: weeklyNetTransfers,
                    finalStock,
                });
                lastWeekStock = finalStock;
            }
        }
    }
    auditLog.push(`Paso 4: Plan semanal de inventario completado.`);


    return { dailyPlan: [], monthlyPlan, weeklyPlan, auditLog };
};

function getMonthlyCapacity(year: number, month: number, lineId: string, holidays: Holiday[], shiftParams: ShiftParameters): { regularHours: number, extraHours: number, saturdayHours: number } {
    const capacity = { regularHours: 0, extraHours: 0, saturdayHours: 0 };
    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const checkDate = new Date(year, month - 1, day);
        const dayOfWeek = checkDate.getDay(); 

        let isProdHoliday = false;
        const holidayInfo = holidays.find(h => h.date === checkDate.toISOString().split('T')[0]);
        if (holidayInfo) {
             if ((holidayInfo.appliesTo === 'Toda la Planta' || holidayInfo.appliesTo === lineId) && !holidayInfo.isProductionAllowed) {
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
    return capacity;
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
        'Nombre Producto': item.productName, 'Centro Prod.': item.producingCenterId || 'N/A',
        'Producción Total': Math.round(item.totalQuantityToProduce),
        'Horas Totales': parseFloat(item.totalHoursWorked.toFixed(2)),
        'Costo Labor Total Est.': parseFloat(item.totalEstimatedLaborCost.toFixed(2)),
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    worksheet['!cols'] = [ { wch: 6 }, { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 22 } ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plan Mensual');
    XLSX.writeFile(workbook, 'Plan_Produccion_Mensual.xlsx');
};

export const parseTacticalOrdersExcel = (file: File): Promise<ProvisionalOrder[]> => { return Promise.resolve([]); };

export const generateTacticalPlan = ( request: TacticalRequest, context: any ): TacticalPlanResult => { return { plan: [], alerts: [] }; };

export const exportSkillsToExcel = ( employees: Employee[], skills: EmployeeSkill[], machines: Machine[], constraints: AppConstraints ): void => {};
