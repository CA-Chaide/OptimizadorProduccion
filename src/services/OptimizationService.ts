

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
    const existingWorkstations = new Map(currentConstraints.workstationDefinitions.map(wd => [wd.id, wd]));
    const existingLines = new Map(currentConstraints.productionLines.map(pl => [pl.id, pl]));

    apiData.forEach(row => {
        const centerId = String(row.Centro).trim();
        const lineName = String(row.Linea).trim();
        const workstationName = String(row.PuestoTrabajo).trim();

        if (!discoveredWorkCenters.has(centerId)) {
            discoveredWorkCenters.set(centerId, { id: centerId, name: centerId, productionLineIds: [], isActive: true });
        }
        
        const workstationId = `wd---${centerId}---${workstationName}`;
        if (!discoveredWorkstations.has(workstationId)) {
            const existingWd = existingWorkstations.get(workstationId);
            discoveredWorkstations.set(workstationId, {
                id: workstationId, name: workstationName,
                employeesPerWorkstation: existingWd?.employeesPerWorkstation || 1,
                machineCode: existingWd?.machineCode || null, isActive: true
            });
        }
        
        const lineId = `pl---${centerId}---${lineName}`;
        if (!discoveredLines.has(lineId)) {
            const existingLine = existingLines.get(lineId);
            discoveredLines.set(lineId, {
                id: lineId, name: lineName, workCenterId: centerId,
                processType: existingLine?.processType || 'Colchones',
                assignedWorkstations: [],
                capacity: { maxUnitsPerHour: 0, normalUnitsPerHour: 0, minUnitsPerHour: 0 },
                materialsHandled: [], isActive: true
            });
        }
        
        const line = discoveredLines.get(lineId)!;
        if (!line.assignedWorkstations.some(as => as.definitionId === workstationId)) {
             const existingAssignment = existingLines.get(lineId)?.assignedWorkstations.find(as => as.definitionId === workstationId);
             line.assignedWorkstations.push({ definitionId: workstationId, quantity: existingAssignment?.quantity || 1 });
        }
        
        const center = discoveredWorkCenters.get(centerId)!;
        if(!center.productionLineIds.includes(lineId)){
            center.productionLineIds.push(lineId);
        }
    });
    
    console.log('Work Centers Discovered:', Array.from(discoveredWorkCenters.values()));
    console.log('Production Lines Discovered:', Array.from(discoveredLines.values()));
    console.log('Workstation Definitions Discovered:', Array.from(discoveredWorkstations.values()));
    
    if(discoveredWorkCenters.size === 0 || discoveredLines.size === 0) {
        const structuralError = "Error Crítico: No se pudo descubrir ninguna estructura de producción (Centros o Líneas) a partir de los datos. Revise la fuente de datos 'TiemposEnsamblado'.";
        console.error(`[VALIDATION ERRORS] ${structuralError}`);
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
            const line = discoveredLines.get(lineId);
            if (line && !line.materialsHandled.includes(productId)) line.materialsHandled.push(productId);
        });
    });

    const newConstraints: AppConstraints = {
        ...currentConstraints,
        workCenters: Array.from(discoveredWorkCenters.values()),
        productionLines: Array.from(discoveredLines.values()),
        workstationDefinitions: Array.from(discoveredWorkstations.values()),
        productProcessInfos: [], 
        inventorySettings: inventorySettings, 
    };

    return { newConstraints, validationErrors: [], dataCompletenessErrors: [] };
}

const getDayType = (date: Date, holidays: Holiday[]): { isWorkDay: boolean; isSalesDay: boolean } => {
    const yyyyMmDd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const holidayInfo = holidays.find(h => h.date === yyyyMmDd);

    let isHolidayForProduction = false;
    let isHolidayForSales = false;

    if (holidayInfo) {
        if (holidayInfo.appliesTo === 'Distribucion') {
            isHolidayForSales = true;
        }
        if (holidayInfo.appliesTo === 'Toda la Planta' && !holidayInfo.isProductionAllowed) {
            isHolidayForProduction = true;
        }
    }

    const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
    
    // Sales day: Monday to Friday, and not a sales holiday
    const salesDay = dayOfWeek >= 1 && dayOfWeek <= 5 && !isHolidayForSales;

    // Work day: Monday to Friday, and not a production holiday
    const workDay = dayOfWeek >= 1 && dayOfWeek <= 5 && !isHolidayForProduction;

    return { isWorkDay: workDay, isSalesDay: salesDay };
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
            const quantityOfPosts = assignedWorkstation.quantity;
            const effectiveTimeForThisPostType = timeMinutes / quantityOfPosts;
            workstationEffectiveTimes.push(effectiveTimeForThisPostType);
        }
    }
    if (line.assignedWorkstations.length > 0 && workstationEffectiveTimes.length !== line.assignedWorkstations.length) return Infinity;
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
    console.log('--- RUNNING STRATEGIC PLANNER V4 ---');
    const auditLog: string[] = ['Iniciando Planificador Estratégico v4.'];
    const { inventorySettings, holidays, productionLines, workstationDefinitions, shiftParameters, workCenters } = constraints;

    if (salesData.length === 0) {
        auditLog.push("Error: No hay datos de ventas para planificar.");
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const productInfoMap = new Map<string, { name: string; provisionRule: 'E' | 'X' | 'F' }>();
    apiData.forEach(item => {
        const productId = normalizeMaterialCode(item.CodMaterial);
        if (!productInfoMap.has(productId)) {
            productInfoMap.set(productId, { name: item.CodMaterial, provisionRule: item.ClaseAprovisionamiento || 'E' });
        }
    });
    salesData.forEach(item => {
        const productId = normalizeMaterialCode(item.código);
        const info = productInfoMap.get(productId);
        if (info) {
            info.name = item.descripciónMaterial || item.etiqueta;
        }
    });
    auditLog.push(`Se cargaron ${productInfoMap.size} productos únicos desde los datos maestros.`);

    const lastSale = salesData.sort((a,b) => (b.año*100+b.mes) - (a.año*100+a.mes))[0];
    const endDate = new Date(lastSale.año, lastSale.mes, 0);

    const planningWeeks: { year: number; week: number, days: Date[] }[] = [];
    let currentDateIterator = new Date(today);
    while (currentDateIterator <= endDate) {
        const {year, week} = getWeekNumber(currentDateIterator);
        if (!planningWeeks.some(w => w.year === year && w.week === week)) {
            const firstDayOfWeek = new Date(currentDateIterator);
            const dayOfWeek = firstDayOfWeek.getDay();
            const diff = firstDayOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            const weekStart = new Date(firstDayOfWeek.setDate(diff));
            
            const daysInWeek: Date[] = [];
            for(let i=0; i<7; i++) {
                const day = new Date(weekStart);
                day.setDate(day.getDate() + i);
                daysInWeek.push(day);
            }
            planningWeeks.push({ year, week, days: daysInWeek });
        }
        currentDateIterator.setDate(currentDateIterator.getDate() + 7);
    }
    auditLog.push(`Horizonte de planificación definido: ${planningWeeks.length} semanas.`);

    const weeklyDemandMap = new Map<string, number>(); // Key: `YYYY-WW---productId---centerId`
    const monthlySalesDaysCache = new Map<string, number>();

    planningWeeks.forEach(({ year, week, days }) => {
        days.forEach(currentDate => {
             if (currentDate < today) return;

            const month = currentDate.getMonth() + 1;
            const saleYear = currentDate.getFullYear();
            const monthKey = `${saleYear}-${String(month).padStart(2, '0')}`;
            
            if (!monthlySalesDaysCache.has(monthKey)) {
                let count = 0;
                const daysInMonth = new Date(saleYear, month, 0).getDate();
                for (let i = 1; i <= daysInMonth; i++) {
                    const checkDate = new Date(saleYear, month - 1, i);
                    if(getDayType(checkDate, holidays).isSalesDay) count++;
                }
                monthlySalesDaysCache.set(monthKey, count > 0 ? count : 1);
            }
            
            const salesDaysInMonth = monthlySalesDaysCache.get(monthKey)!;
            const monthSales = salesData.filter(s => s.año === saleYear && s.mes === month);
            
            monthSales.forEach(sale => {
                if (getDayType(currentDate, holidays).isSalesDay) {
                    const dailyDemand = sale.unidadesProyectado / salesDaysInMonth;
                    const productId = normalizeMaterialCode(sale.código);
                    const centerId = String(sale.centro).trim();
                    const demandKey = `${year}-W${week}---${productId}---${centerId}`;
                    weeklyDemandMap.set(demandKey, (weeklyDemandMap.get(demandKey) || 0) + dailyDemand);
                }
            });
        });
    });

    // FASE 1: Pase hacia atrás para calcular el adelanto de producción
    const advancedNeed = new Map<string, number>(); // Key: `YYYY-WW---lineId---productId` -> units to advance
    for (let i = planningWeeks.length - 1; i >= 0; i--) {
        onProgress({ message: `Analizando capacidad futura...`, step: 'monthly', current: planningWeeks.length - i, total: planningWeeks.length });
        const { year, week, days } = planningWeeks[i];
        const weekKeyPart = `${year}-W${week}`;

        for (const line of productionLines) {
            let capacityHours = 0;
            days.forEach(date => {
                if(getDayType(date, holidays).isWorkDay) {
                    capacityHours += shiftParameters.regularHoursPerDay;
                }
            });
            
            const productsOnLine = Array.from(new Set(line.materialsHandled));

            for (const productId of productsOnLine) {
                 const provisionRule = productInfoMap.get(productId)?.provisionRule;
                 let totalDemandForProduct = 0;

                 if (provisionRule === 'F' && line.workCenterId === '1000') {
                    for (const center of workCenters) {
                        totalDemandForProduct += weeklyDemandMap.get(`${weekKeyPart}---${productId}---${center.id}`) || 0;
                    }
                 } else if (provisionRule !== 'F') {
                     totalDemandForProduct = weeklyDemandMap.get(`${weekKeyPart}---${productId}---${line.workCenterId}`) || 0;
                 } else {
                    continue; 
                 }
                
                if (i < planningWeeks.length - 1) {
                    const nextWeek = planningWeeks[i+1];
                    totalDemandForProduct += advancedNeed.get(`${nextWeek.year}-W${nextWeek.week}---${line.id}---${productId}`) || 0;
                }

                if (totalDemandForProduct > 0) {
                    const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
                    if (timePerUnit === Infinity) continue;

                    const hoursNeeded = totalDemandForProduct * timePerUnit;
                    if (hoursNeeded > capacityHours) {
                        const deficitUnits = (hoursNeeded - capacityHours) / timePerUnit;
                        if(i > 0) {
                            const prevWeek = planningWeeks[i-1];
                            const advNeedKey = `${prevWeek.year}-W${prevWeek.week}---${line.id}---${productId}`;
                            advancedNeed.set(advNeedKey, (advancedNeed.get(advNeedKey) || 0) + deficitUnits);
                        }
                        capacityHours = 0; 
                    } else {
                        capacityHours -= hoursNeeded;
                    }
                }
            }
        }
    }
    auditLog.push(`Fase 1 (Análisis Futuro) completada. Se calcularon necesidades de adelanto.`);

    // FASE 2: Pase hacia adelante para planificar la producción
    const weeklyPlan: WeeklyPlanItem[] = [];
    const inventoryState = new Map<string, number>(); // Key: `productId---centerId` -> current stock
    inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));

    for (let i = 0; i < planningWeeks.length; i++) {
        const { year, week, days } = planningWeeks[i];
        onProgress({ message: `Planificando semana ${week}...`, step: 'daily', current: i + 1, total: planningWeeks.length });
        const weekKeyPart = `${year}-W${week}`;
        
        const weeklyLineCapacity = new Map<string, number>(); 
        productionLines.forEach(line => {
            let capacityHours = 0;
            days.forEach(date => {
                if (date >= today && getDayType(date, holidays).isWorkDay) {
                    capacityHours += shiftParameters.regularHoursPerDay;
                }
            });
            weeklyLineCapacity.set(line.id, capacityHours);
        });

        const weeklyAggregates = new Map<string, { initialStock: number, production: number, sales: number, netTransfers: number }>();
        productionLines.forEach(l => {
            if (!weeklyAggregates.has(l.id)) weeklyAggregates.set(l.id, {initialStock: 0, production: 0, sales: 0, netTransfers: 0});
        });
        
        inventorySettings.forEach(inv => {
            const lines = productionLines.filter(l => l.workCenterId === inv.centerId);
            lines.forEach(line => {
                const agg = weeklyAggregates.get(line.id);
                if (agg) {
                     agg.initialStock += inv.currentStock / lines.length; // Spread stock across lines in the center
                }
            });
        });
        
        // Prioritize transfers for 'F' products
        const transferNeeds = new Map<string, number>(); // productId---toCenter -> quantity
        for (const center of workCenters) {
            if (center.id === '1000') continue;
            for(const [demandKey, demandQty] of weeklyDemandMap.entries()) {
                if (demandKey.startsWith(weekKeyPart) && demandKey.endsWith(`---${center.id}`)) {
                    const [, productId, ] = demandKey.split('---');
                    const info = productInfoMap.get(productId);
                    if (info?.provisionRule === 'F') {
                        const invKey = `${productId}---${center.id}`;
                        const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === center.id)?.minStock || 0;
                        const currentStock = inventoryState.get(invKey) || 0;
                        const need = safetyStock + demandQty - currentStock;
                        if (need > 0) {
                            transferNeeds.set(`${productId}---${center.id}`, (transferNeeds.get(`${productId}---${center.id}`) || 0) + need);
                        }
                    }
                }
            }
        }

        for (const [needKey, qty] of transferNeeds.entries()) {
            const [productId, toCenter] = needKey.split('---');
            const line = productionLines.find(l => l.workCenterId === '1000' && l.materialsHandled.includes(productId));
            if (line) {
                const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
                let availableHours = weeklyLineCapacity.get(line.id) || 0;
                if (timePerUnit !== Infinity && availableHours > 0) {
                    const canProduce = availableHours / timePerUnit;
                    const toProduce = Math.min(qty, canProduce);
                    
                    const agg = weeklyAggregates.get(line.id);
                    if(agg) agg.production += toProduce;

                    const fromCenter = '1000';
                    const toAggs = productionLines.filter(l => l.workCenterId === toCenter).map(l => weeklyAggregates.get(l.id)).filter(a => a);
                    const fromAggs = productionLines.filter(l => l.workCenterId === fromCenter).map(l => weeklyAggregates.get(l.id)).filter(a => a);

                    if (toAggs.length > 0) toAggs.forEach(a => a!.netTransfers += toProduce / toAggs.length);
                    if (fromAggs.length > 0) fromAggs.forEach(a => a!.netTransfers -= toProduce / fromAggs.length);

                    inventoryState.set(`${productId}---${fromCenter}`, (inventoryState.get(`${productId}---${fromCenter}`) || 0) + toProduce - toProduce);
                    inventoryState.set(`${productId}---${toCenter}`, (inventoryState.get(`${productId}---${toCenter}`) || 0) + toProduce);
                    
                    weeklyLineCapacity.set(line.id, availableHours - toProduce * timePerUnit);
                }
            }
        }
        
        // Main production loop
        for (const line of productionLines) {
            const productsOnLine = Array.from(new Set(line.materialsHandled));
            for (const productId of productsOnLine) {
                 const invKey = `${productId}---${line.workCenterId}`;
                 const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === line.workCenterId)?.minStock || 0;
                 const demand = weeklyDemandMap.get(`${weekKeyPart}---${productId}---${line.workCenterId}`) || 0;
                 const advNeed = advancedNeed.get(`${weekKeyPart}---${line.id}---${productId}`) || 0;
                 const currentStock = inventoryState.get(invKey) || 0;
                 
                 const need = safetyStock + demand + advNeed - currentStock;
                 
                 if (need > 0) {
                    const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
                    let availableHours = weeklyLineCapacity.get(line.id) || 0;
                    if (timePerUnit !== Infinity && availableHours > 0) {
                         const canProduce = availableHours / timePerUnit;
                         const toProduce = Math.min(need, canProduce);
                         
                         const agg = weeklyAggregates.get(line.id);
                         if(agg) agg.production += toProduce;

                         inventoryState.set(invKey, currentStock + toProduce);
                         weeklyLineCapacity.set(line.id, availableHours - toProduce * timePerUnit);
                    }
                 }
            }
        }

        // Update sales and final inventory
        for(const [demandKey, demandQty] of weeklyDemandMap.entries()) {
            if (demandKey.startsWith(weekKeyPart)) {
                const [, productId, centerId] = demandKey.split('---');
                const invKey = `${productId}---${centerId}`;
                const stock = inventoryState.get(invKey) || 0;
                const fulfilledDemand = Math.min(stock, demandQty);
                inventoryState.set(invKey, stock - fulfilledDemand);

                const linesInCenter = productionLines.filter(l => l.workCenterId === centerId);
                linesInCenter.forEach(line => {
                    const agg = weeklyAggregates.get(line.id);
                    if (agg) {
                        agg.sales += demandQty / linesInCenter.length;
                    }
                });
            }
        }
        
        weeklyAggregates.forEach((agg, lineId) => {
            const line = productionLines.find(l => l.id === lineId);
            if(line){
                weeklyPlan.push({
                    id: `${weekKeyPart}---${line.workCenterId}---${line.id}`,
                    year, week, workCenterId: line.workCenterId, lineId: line.id,
                    initialStock: agg.initialStock,
                    production: agg.production,
                    sales: agg.sales,
                    netTransfers: agg.netTransfers,
                    finalStock: agg.initialStock + agg.production + agg.netTransfers - agg.sales,
                });
            }
        });

         // Update initial stock for next week
        inventoryState.forEach((stock, key) => {
            const [productId, centerId] = key.split('---');
            const invSetting = inventorySettings.find(i => i.itemId === productId && i.centerId === centerId);
            if (invSetting) {
                invSetting.currentStock = stock;
            }
        });
    }

    onProgress(null);
    auditLog.push(`Fase 2 (Planificación) completada. Se generaron ${weeklyPlan.length} registros de plan semanal.`);
    return { dailyPlan: [], monthlyPlan: [], weeklyPlan, auditLog };
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

