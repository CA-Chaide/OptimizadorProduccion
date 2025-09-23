

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
        if (holidayInfo.appliesTo === 'Distribucion') isHolidayForSales = true;
        
        const isProductionHoliday = holidayInfo.appliesTo === 'Toda la Planta';
        if (isProductionHoliday && !holidayInfo.isProductionAllowed) {
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
    console.log('--- RUNNING STRATEGIC PLANNER V3 ---');
    const { inventorySettings, holidays, productionLines, workstationDefinitions, shiftParameters, workCenters } = constraints;

    if (salesData.length === 0) {
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog: ["No hay datos de ventas para planificar."] };
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
        if (productInfoMap.has(productId)) {
            productInfoMap.get(productId)!.name = item.descripciónMaterial || item.etiqueta;
        }
    });

    const lastSale = salesData.sort((a,b) => (b.año*100+b.mes) - (a.año*100+a.mes))[0];
    const endDate = new Date(lastSale.año, lastSale.mes, 0);

    const planningWeeks: { year: number; week: number, days: Date[] }[] = [];
    let d = new Date(today);
    while (d <= endDate) {
        const {year, week} = getWeekNumber(d);
        if (!planningWeeks.some(w => w.year === year && w.week === week)) {
            const firstDayOfWeek = new Date(d);
            const dayOfWeek = firstDayOfWeek.getDay();
            const diff = firstDayOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
            const weekStart = new Date(firstDayOfWeek.setDate(diff));
            
            const daysInWeek: Date[] = [];
            for(let i=0; i<7; i++) {
                const day = new Date(weekStart);
                day.setDate(day.getDate() + i);
                if (day >= today) {
                    daysInWeek.push(day);
                }
            }
            planningWeeks.push({ year, week, days: daysInWeek });
        }
        d.setDate(d.getDate() + 7);
    }
    
    const weeklyDemandMap = new Map<string, number>(); // Key: `YYYY-WW---productId---centerId`
    const monthlySalesDays = new Map<string, number>(); // Key: 'YYYY-MM'

    planningWeeks.forEach(({ year, week, days }) => {
        days.forEach(currentDate => {
            const month = currentDate.getMonth() + 1;
            const saleYear = currentDate.getFullYear();
            const monthKey = `${saleYear}-${String(month).padStart(2, '0')}`;
            
            if (!monthlySalesDays.has(monthKey)) {
                let count = 0;
                const daysInMonth = new Date(saleYear, month, 0).getDate();
                for (let i = 1; i <= daysInMonth; i++) {
                    const checkDate = new Date(saleYear, month - 1, i);
                    if(getDayType(checkDate, holidays).isSalesDay) count++;
                }
                monthlySalesDays.set(monthKey, count > 0 ? count : 1);
            }
            
            const salesDaysInMonth = monthlySalesDays.get(monthKey)!;
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

    const advancedNeed = new Map<string, number>(); // Key: `YYYY-WW---lineId---productId` -> units to advance
    for (let i = planningWeeks.length - 1; i >= 0; i--) {
        const { year, week, days } = planningWeeks[i];
        const weekKeyPart = `${year}-W${week}`;

        for (const line of productionLines) {
            let capacityHours = 0;
            days.forEach(date => {
                if(getDayType(date, holidays).isWorkDay) {
                    capacityHours += shiftParameters.regularHoursPerDay;
                }
            });
            
            const productsOnLine = Array.from(productInfoMap.keys()).filter(pid => calculateEffectiveManufacturingTime(pid, line, apiData, workstationDefinitions) < Infinity);
            for (const productId of productsOnLine) {
                let totalDemandForProduct = weeklyDemandMap.get(`${weekKeyPart}---${productId}---${line.workCenterId}`) || 0;
                
                if (line.workCenterId === '1000' && productInfoMap.get(productId)?.provisionRule === 'F') {
                    for (const center of workCenters.filter(c => c.id !== '1000')) {
                        totalDemandForProduct += weeklyDemandMap.get(`${weekKeyPart}---${productId}---${center.id}`) || 0;
                    }
                }
                
                if (i < planningWeeks.length - 1) {
                    const nextWeek = planningWeeks[i+1];
                    totalDemandForProduct += advancedNeed.get(`${nextWeek.year}-W${nextWeek.week}---${line.id}---${productId}`) || 0;
                }

                if (totalDemandForProduct > 0) {
                    const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
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
    
    const weeklyPlan: WeeklyPlanItem[] = [];
    const inventoryState = new Map<string, number>(); // Key: `productId---centerId` -> current stock
    inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));

    for (const { year, week, days } of planningWeeks) {
        const weekKeyPart = `${year}-W${week}`;
        onProgress({ message: `Planificando semana ${week}...`, step: 'daily', current: week, total: planningWeeks.length });
        
        const weeklyLineCapacity = new Map<string, number>(); // Key: `lineId` -> available hours
        productionLines.forEach(line => {
            let capacityHours = 0;
            days.forEach(date => {
                if (getDayType(date, holidays).isWorkDay) {
                    capacityHours += shiftParameters.regularHoursPerDay;
                }
            });
            weeklyLineCapacity.set(line.id, capacityHours);
        });

        const thisWeekProduction = new Map<string, number>(); // Key: `lineId---productId` -> units to produce
        const thisWeekTransfers = new Map<string, number>(); // Key: `productId---fromCenter---toCenter` -> units
        
        // --- Priority Pass: Centralized 'F' products ---
        for (const line of productionLines.filter(l => l.workCenterId === '1000')) {
            const productsOnLine = Array.from(productInfoMap.keys()).filter(pid => productInfoMap.get(pid)?.provisionRule === 'F' && calculateEffectiveManufacturingTime(pid, line, apiData, workstationDefinitions) < Infinity);
            
            for (const center of workCenters.filter(c => c.id !== '1000')) {
                for (const productId of productsOnLine) {
                    const invKey = `${productId}---${center.id}`;
                    const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === center.id)?.minStock || 0;
                    const demand = weeklyDemandMap.get(`${weekKeyPart}---${productId}---${center.id}`) || 0;
                    
                    const need = safetyStock + demand - (inventoryState.get(invKey) || 0);

                    if (need > 0) {
                        const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
                        let availableHours = weeklyLineCapacity.get(line.id) || 0;
                        if (availableHours > 0 && timePerUnit < Infinity) {
                            const canProduce = availableHours / timePerUnit;
                            const toProduce = Math.min(need, canProduce);
                            if (toProduce > 0) {
                                const prodKey = `${line.id}---${productId}`;
                                thisWeekProduction.set(prodKey, (thisWeekProduction.get(prodKey) || 0) + toProduce);
                                const transferKey = `${productId}---1000---${center.id}`;
                                thisWeekTransfers.set(transferKey, (thisWeekTransfers.get(transferKey) || 0) + toProduce);
                                weeklyLineCapacity.set(line.id, availableHours - (toProduce * timePerUnit));
                            }
                        }
                    }
                }
            }
        }
        
        // --- Main Production Pass ---
        for (const line of productionLines) {
            const productsOnLine = Array.from(productInfoMap.keys()).filter(pid => calculateEffectiveManufacturingTime(pid, line, apiData, workstationDefinitions) < Infinity);
            for (const productId of productsOnLine) {
                const invKey = `${productId}---${line.workCenterId}`;
                const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === line.workCenterId)?.minStock || 0;
                const demand = weeklyDemandMap.get(`${weekKeyPart}---${productId}---${line.workCenterId}`) || 0;
                const advNeed = advancedNeed.get(`${weekKeyPart}---${line.id}---${productId}`) || 0;
                const netTransfers = (thisWeekTransfers.get(`${productId}---${line.workCenterId}---other`) || 0) - (thisWeekTransfers.get(`${productId}---other---${line.workCenterId}`) || 0);

                const need = safetyStock + demand + advNeed - (inventoryState.get(invKey) || 0) - netTransfers;

                if (need > 0) {
                    const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
                    let availableHours = weeklyLineCapacity.get(line.id) || 0;
                    if (availableHours > 0 && timePerUnit < Infinity) {
                        const canProduce = availableHours / timePerUnit;
                        const toProduce = Math.min(need, canProduce);
                        if (toProduce > 0) {
                            const prodKey = `${line.id}---${productId}`;
                            thisWeekProduction.set(prodKey, (thisWeekProduction.get(prodKey) || 0) + toProduce);
                            weeklyLineCapacity.set(line.id, availableHours - (toProduce * timePerUnit));
                        }
                    }
                }
            }
        }
        
        const weeklyAggregates = new Map<string, { initialStock: number, production: number, sales: number, netTransfers: number }>();
        productionLines.forEach(l => {
            if (!weeklyAggregates.has(l.id)) {
                weeklyAggregates.set(l.id, {initialStock: 0, production: 0, sales: 0, netTransfers: 0});
            }
        });

        const currentWeekInventory = new Map(inventoryState);
        
        inventoryState.forEach((stock, key) => {
            const [productId, centerId] = key.split('---');
            const linesInCenter = productionLines.filter(l => l.workCenterId === centerId);
            if (linesInCenter.length > 0) {
                linesInCenter.forEach(line => {
                    const lineAgg = weeklyAggregates.get(line.id)!;
                    lineAgg.initialStock += stock / linesInCenter.length;
                });
            }
        });
        
        thisWeekProduction.forEach((qty, key) => {
            const [lineId, productId] = key.split('---');
            const line = productionLines.find(l => l.id === lineId)!;
            const centerId = line.workCenterId;
            const invKey = `${productId}---${centerId}`;
            inventoryState.set(invKey, (inventoryState.get(invKey) || 0) + qty);
            weeklyAggregates.get(lineId)!.production += qty;
        });

        thisWeekTransfers.forEach((qty, key) => {
            const [productId, fromCenter, toCenter] = key.split('---');
            const fromInvKey = `${productId}---${fromCenter}`;
            const toInvKey = `${productId}---${toCenter}`;
            inventoryState.set(fromInvKey, (inventoryState.get(fromInvKey) || 0) - qty);
            inventoryState.set(toInvKey, (inventoryState.get(toInvKey) || 0) + qty);

            const fromLines = productionLines.filter(l => l.workCenterId === fromCenter);
            if(fromLines.length > 0) fromLines.forEach(l => weeklyAggregates.get(l.id)!.netTransfers -= qty / fromLines.length);

            const toLines = productionLines.filter(l => l.workCenterId === toCenter);
            if(toLines.length > 0) toLines.forEach(l => weeklyAggregates.get(l.id)!.netTransfers += qty / toLines.length);
        });

        weeklyDemandMap.forEach((demand, key) => {
            if (key.startsWith(weekKeyPart)) {
                const [, productId, centerId] = key.split('---');
                const invKey = `${productId}---${centerId}`;
                const provisionRule = productInfoMap.get(productId)?.provisionRule;

                if (provisionRule === 'F' && centerId !== '1000') {
                    // Demand fulfilled by transfer, inventory already updated
                } else {
                    const fulfilledDemand = Math.min(inventoryState.get(invKey) || 0, demand);
                    inventoryState.set(invKey, (inventoryState.get(invKey) || 0) - fulfilledDemand);
                }

                const linesInCenter = productionLines.filter(l => l.workCenterId === centerId);
                if(linesInCenter.length > 0) linesInCenter.forEach(line => {
                    if (weeklyAggregates.has(line.id)) {
                        weeklyAggregates.get(line.id)!.sales += demand / linesInCenter.length;
                    }
                });
            }
        });
        
        weeklyAggregates.forEach((agg, lineId) => {
            const line = productionLines.find(l => l.id === lineId)!;
            weeklyPlan.push({
                id: `${weekKeyPart}---${line.workCenterId}---${line.id}`,
                year, week, workCenterId: line.workCenterId, lineId: line.id,
                initialStock: agg.initialStock,
                production: agg.production,
                sales: agg.sales,
                netTransfers: agg.netTransfers,
                finalStock: agg.initialStock + agg.production + agg.netTransfers - agg.sales,
            });
        });
    }

    onProgress(null);
    return { dailyPlan: [], monthlyPlan: [], weeklyPlan, auditLog: [] };
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

