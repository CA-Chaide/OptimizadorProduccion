

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

    if (holidayInfo) {
        if (holidayInfo.appliesTo === 'Toda la Planta') {
            return { isWorkDay: holidayInfo.isProductionAllowed, isSalesDay: false };
        }
        if (holidayInfo.appliesTo === 'Distribucion') {
            return { isWorkDay: true, isSalesDay: false };
        }
        // Specific line or process type holidays are handled within capacity calculation
    }

    const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
    if (dayOfWeek === 0) return { isWorkDay: false, isSalesDay: false }; // Sunday
    if (dayOfWeek === 6) return { isWorkDay: true, isSalesDay: false }; // Saturday is for production, not sales

    return { isWorkDay: true, isSalesDay: true }; // Weekday
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
    console.log('--- INICIANDO NUEVO MOTOR DE PLANIFICACIÓN ESTRATÉGICA ---');
    const { inventorySettings, holidays, productionLines, workstationDefinitions, shiftParameters } = constraints;

    if (salesData.length === 0) {
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog: ["No hay datos de ventas para planificar."] };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const firstSale = salesData.sort((a,b) => (a.año*100+a.mes) - (b.año*100+b.mes))[0];
    const lastSale = salesData.sort((a,b) => (b.año*100+b.mes) - (a.año*100+a.mes))[0];

    let startDate = new Date(today);
    const endDate = new Date(lastSale.año, lastSale.mes, 0); // Last day of the last month of sales

    // --- 1. DATA PREPARATION ---
    const productInfoMap = new Map<string, { name: string; provisionRule: 'E' | 'X' | 'F' }>();
    apiData.forEach(item => {
        const productId = normalizeMaterialCode(item.CodMaterial);
        if (!productInfoMap.has(productId)) {
            productInfoMap.set(productId, { name: 'N/A', provisionRule: item.ClaseAprovisionamiento || 'E' });
        }
    });
    salesData.forEach(item => {
        const productId = normalizeMaterialCode(item.código);
        if (productInfoMap.has(productId)) {
            productInfoMap.get(productId)!.name = item.descripciónMaterial || item.etiqueta;
        }
    });

    const weeklyDemandMap = new Map<string, number>(); // Key: `YYYY-WW---productId---centerId`
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dayOfMonth = d.getDate();
        const month = d.getMonth() + 1;
        const year = d.getFullYear();
        const { week } = getWeekNumber(d);
        const weekKeyPart = `${year}-W${week}`;

        const monthSales = salesData.filter(s => s.año === year && s.mes === month);
        const monthSalesDays = new Array(new Date(year, month, 0).getDate()).fill(0)
            .map((_, i) => getDayType(new Date(year, month-1, i+1), holidays).isSalesDay)
            .filter(Boolean).length;
        
        if (monthSalesDays > 0) {
            monthSales.forEach(sale => {
                const dailyDemand = sale.unidadesProyectado / monthSalesDays;
                const productId = normalizeMaterialCode(sale.código);
                const centerId = String(sale.centro).trim();
                const demandKey = `${weekKeyPart}---${productId}---${centerId}`;
                const { isSalesDay } = getDayType(d, holidays);
                if (isSalesDay) {
                    weeklyDemandMap.set(demandKey, (weeklyDemandMap.get(demandKey) || 0) + dailyDemand);
                }
            });
        }
    }
    
    const weeks: { year: number; week: number }[] = [];
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 7)) {
        weeks.push(getWeekNumber(d));
    }
    const uniqueWeeks = weeks.filter((w, i, a) => a.findIndex(t => t.year === w.year && t.week === w.week) === i);


    // --- 2. CAPACITY & LOOK-AHEAD (BACKWARD PASS) ---
    onProgress({ message: 'Analizando capacidad futura...', step: 'monthly', current: 1, total: 2 });
    const weeklyAdvancedNeed = new Map<string, number>(); // Key: `YYYY-WW---lineId---productId`, Value: units
    const lineWeeklyCapacityHours = new Map<string, number>(); // Key: `YYYY-WW---lineId`
    
    for (let i = uniqueWeeks.length - 1; i >= 0; i--) {
        const { year, week } = uniqueWeeks[i];
        const weekKeyPart = `${year}-W${week}`;
        
        const firstDayOfWeek = new Date(year, 0, 1 + (week - 1) * 7);
        while (firstDayOfWeek.getDay() !== 1) { firstDayOfWeek.setDate(firstDayOfWeek.getDate() - 1); }

        for (const line of productionLines) {
            let capacityHours = 0;
            for(let d = 0; d < 7; d++) {
                const date = new Date(firstDayOfWeek);
                date.setDate(date.getDate() + d);
                if (date < startDate) continue;

                const dayType = getDayType(date, holidays);
                if(dayType.isWorkDay) {
                     if (date.getDay() === 6) capacityHours += shiftParameters.saturdayAndHolidayHours;
                     else capacityHours += shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay;
                }
            }
            lineWeeklyCapacityHours.set(`${weekKeyPart}---${line.id}`, capacityHours);
            
            const productsOnLine = Array.from(productInfoMap.keys()).filter(pid => 
                calculateEffectiveManufacturingTime(pid, line, apiData, workstationDefinitions) < Infinity
            );

            for (const productId of productsOnLine) {
                const demandKeyLocal = `${weekKeyPart}---${productId}---${line.workCenterId}`;
                let totalDemandForProductOnLine = weeklyDemandMap.get(demandKeyLocal) || 0;

                // Add transfer demand
                for (const center of constraints.workCenters) {
                    if (center.id !== line.workCenterId && productInfoMap.get(productId)?.provisionRule === 'F' && line.workCenterId === '1000') {
                        const demandKeyTransfer = `${weekKeyPart}---${productId}---${center.id}`;
                        totalDemandForProductOnLine += weeklyDemandMap.get(demandKeyTransfer) || 0;
                    }
                }

                totalDemandForProductOnLine += weeklyAdvancedNeed.get(`${weekKeyPart}---${line.id}---${productId}`) || 0;

                if (totalDemandForProductOnLine > 0) {
                    const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
                    const hoursNeeded = totalDemandForProductOnLine * timePerUnit;
                    
                    if (hoursNeeded > capacityHours) {
                        const capacityDeficitHours = hoursNeeded - capacityHours;
                        const unitsToAdvance = capacityDeficitHours / timePerUnit;
                        
                        const prevWeekIndex = i - 1;
                        if (prevWeekIndex >= 0) {
                            const prevWeekKeyPart = `${uniqueWeeks[prevWeekIndex].year}-W${uniqueWeeks[prevWeekIndex].week}`;
                            const advancedNeedKey = `${prevWeekKeyPart}---${line.id}---${productId}`;
                            weeklyAdvancedNeed.set(advancedNeedKey, (weeklyAdvancedNeed.get(advancedNeedKey) || 0) + unitsToAdvance);
                        }
                        capacityHours = 0; // All capacity used
                    } else {
                        capacityHours -= hoursNeeded;
                    }
                }
            }
        }
    }


    // --- 3. FORWARD PASS - WEEKLY PLANNING ---
    onProgress({ message: 'Generando plan semana a semana...', step: 'monthly', current: 2, total: 2 });
    const weeklyPlan: WeeklyPlanItem[] = [];
    const inventoryState = new Map<string, number>(); // Key: `productId---centerId`, Value: stock
    inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));

    for (const { year, week } of uniqueWeeks) {
        const weekKeyPart = `${year}-W${week}`;
        onProgress({ message: `Planificando semana ${week}...`, step: 'daily', current: week, total: uniqueWeeks[uniqueWeeks.length -1].week });
        
        const weeklyProduction = new Map<string, number>(); // Key: `lineId---productId`, Value: units
        const weeklyTransfers = new Map<string, number>(); // Key: `fromCenter---toCenter---productId`, Value: units
        
        const thisWeekLineHours = new Map<string, number>();
        productionLines.forEach(l => thisWeekLineHours.set(l.id, lineWeeklyCapacityHours.get(`${weekKeyPart}---${l.id}`) || 0));

        // --- Prioritize Transfers ---
        for (const line of productionLines.filter(l => l.workCenterId === '1000')) {
             let availableHours = thisWeekLineHours.get(line.id) || 0;
             if (availableHours <= 0) continue;

            const productsOnLine = Array.from(productInfoMap.keys()).filter(pid => 
                calculateEffectiveManufacturingTime(pid, line, apiData, workstationDefinitions) < Infinity
            );
            
             for (const productId of productsOnLine) {
                 if (productInfoMap.get(productId)?.provisionRule !== 'F') continue;

                 for (const demandCenter of constraints.workCenters.filter(c => c.id !== '1000')) {
                    const invKey = `${productId}---${demandCenter.id}`;
                    const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === demandCenter.id)?.minStock || 0;
                    const demand = weeklyDemandMap.get(`${weekKeyPart}---${productId}---${demandCenter.id}`) || 0;
                    
                    const need = safetyStock + demand - (inventoryState.get(invKey) || 0);

                    if (need > 0) {
                        const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
                        const canProduce = availableHours / timePerUnit;
                        const toProduce = Math.min(need, canProduce);

                        if(toProduce > 0) {
                            const prodKey = `${line.id}---${productId}`;
                            weeklyProduction.set(prodKey, (weeklyProduction.get(prodKey) || 0) + toProduce);

                            const transferKey = `1000---${demandCenter.id}---${productId}`;
                            weeklyTransfers.set(transferKey, (weeklyTransfers.get(transferKey) || 0) + toProduce);
                            
                            availableHours -= toProduce * timePerUnit;
                            thisWeekLineHours.set(line.id, availableHours);
                        }
                    }
                 }
             }
        }
        
        // --- Plan Remaining Production ---
        for (const line of productionLines) {
            let availableHours = thisWeekLineHours.get(line.id) || 0;
            if (availableHours <= 0) continue;

            const productsOnLine = Array.from(productInfoMap.keys()).filter(pid => 
                calculateEffectiveManufacturingTime(pid, line, apiData, workstationDefinitions) < Infinity
            );
            
            for (const productId of productsOnLine) {
                const invKey = `${productId}---${line.workCenterId}`;
                const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === line.workCenterId)?.minStock || 0;
                const demand = weeklyDemandMap.get(`${weekKeyPart}---${productId}---${line.workCenterId}`) || 0;
                const advancedNeed = weeklyAdvancedNeed.get(`${weekKeyPart}---${line.id}---${productId}`) || 0;

                const need = safetyStock + demand + advancedNeed - (inventoryState.get(invKey) || 0);
                
                if (need > 0) {
                    const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
                    const canProduce = availableHours / timePerUnit;
                    const toProduce = Math.min(need, canProduce);
                    
                    if (toProduce > 0) {
                         const prodKey = `${line.id}---${productId}`;
                         weeklyProduction.set(prodKey, (weeklyProduction.get(prodKey) || 0) + toProduce);
                         availableHours -= toProduce * timePerUnit;
                         thisWeekLineHours.set(line.id, availableHours);
                    }
                }
            }
        }
        
        // --- Generate Weekly Summary and Update Inventory ---
        const centerProductSales = new Map<string, number>();
        const centerProductNetTransfers = new Map<string, number>();

        weeklyDemandMap.forEach((demand, key) => {
            if (key.startsWith(weekKeyPart)) {
                const [, productId, centerId] = key.split('---');
                const invKey = `${productId}---${centerId}`;
                centerProductSales.set(invKey, (centerProductSales.get(invKey) || 0) + demand);
            }
        });
        
        weeklyTransfers.forEach((qty, key) => {
            const [from, to, productId] = key.split('---');
            const sourceKey = `${productId}---${from}`;
            const destKey = `${productId}---${to}`;
            centerProductNetTransfers.set(sourceKey, (centerProductNetTransfers.get(sourceKey) || 0) - qty);
            centerProductNetTransfers.set(destKey, (centerProductNetTransfers.get(destKey) || 0) + qty);
        });

        // Group production by product and center
        const centerProductProduction = new Map<string, number>();
        weeklyProduction.forEach((qty, key) => {
            const [lineId, productId] = key.split('---');
            const centerId = productionLines.find(l => l.id === lineId)!.workCenterId;
            const invKey = `${productId}---${centerId}`;
            centerProductProduction.set(invKey, (centerProductProduction.get(invKey) || 0) + qty);
        });

        // Generate weekly items for all lines
        for (const line of productionLines) {
            const lineProduction = Array.from(weeklyProduction.entries())
                                    .filter(([key]) => key.startsWith(line.id))
                                    .reduce((sum, [,qty]) => sum + qty, 0);

            const productsOnLine = Array.from(productInfoMap.keys()).filter(pid => 
                calculateEffectiveManufacturingTime(pid, line, apiData, workstationDefinitions) < Infinity
            );
            
            let lineInitialStock = 0;
            let lineSales = 0;
            let lineNetTransfers = 0;

            for (const productId of productsOnLine) {
                 const invKey = `${productId}---${line.workCenterId}`;
                 lineInitialStock += inventoryState.get(invKey) || 0;
                 lineSales += centerProductSales.get(invKey) || 0;
                 lineNetTransfers += centerProductNetTransfers.get(invKey) || 0;
            }

            const finalStock = lineInitialStock + lineProduction + lineNetTransfers - lineSales;

            weeklyPlan.push({
                id: `${weekKeyPart}---${line.workCenterId}---${line.id}`,
                year, week, workCenterId: line.workCenterId, lineId: line.id,
                initialStock: lineInitialStock,
                production: lineProduction,
                sales: lineSales,
                netTransfers: lineNetTransfers,
                finalStock: finalStock,
            });
        }
        
        // Update master inventory state for next week
        centerProductProduction.forEach((qty, key) => inventoryState.set(key, (inventoryState.get(key) || 0) + qty));
        centerProductSales.forEach((qty, key) => inventoryState.set(key, (inventoryState.get(key) || 0) - qty));
        centerProductNetTransfers.forEach((qty, key) => inventoryState.set(key, (inventoryState.get(key) || 0) + qty));
    }


    onProgress(null);
    return {
        dailyPlan: [], // Daily plan is no longer the primary output
        monthlyPlan: [], // Monthly plan is no longer the primary output
        weeklyPlan,
        auditLog: []
    };
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

