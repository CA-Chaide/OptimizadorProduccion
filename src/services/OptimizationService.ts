


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

    const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
    
    if (appliesToFilter === 'Distribucion') {
        return dayOfWeek >= 1 && dayOfWeek <= 5 && !isHoliday;
    } else { // Production
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
    console.log('--- RUNNING STRATEGIC PLANNER V7 ---');
    const auditLog: string[] = ['Iniciando Planificador Estratégico v7.'];
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

    const firstSale = salesData.sort((a, b) => (a.año * 100 + a.mes) - (b.año * 100 + b.mes))[0];
    const lastSale = salesData.sort((a,b) => (b.año*100+b.mes) - (a.año*100+a.mes))[0];
    const startDate = new Date(firstSale.año, firstSale.mes-1, 1);
    const endDate = new Date(lastSale.año, lastSale.mes, 0);

    // --- Correct Demand Proration Logic ---
    const weeklyDemandMap = new Map<string, number>(); // Key: `YYYY-WW---productId---centerId`
    const monthlyDemandRates = new Map<string, { dailyRate: number }>(); // Key: `YYYY-MM---productId---centerId`
    
    const uniqueMonths = new Set(salesData.map(s => `${s.año}-${s.mes}`));
    uniqueMonths.forEach(monthKey => {
        const [year, month] = monthKey.split('-').map(Number);
        let salesDaysInMonth = 0;
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let i = 1; i <= daysInMonth; i++) {
            if (getDayType(new Date(year, month - 1, i), holidays, 'Distribucion')) {
                salesDaysInMonth++;
            }
        }
        salesDaysInMonth = salesDaysInMonth > 0 ? salesDaysInMonth : 1;

        const monthSales = salesData.filter(s => s.año === year && s.mes === month);
        monthSales.forEach(sale => {
            const dailyRate = sale.unidadesProyectado / salesDaysInMonth;
            const rateKey = `${year}-${month}---${normalizeMaterialCode(sale.código)}---${String(sale.centro).trim()}`;
            monthlyDemandRates.set(rateKey, { dailyRate });
        });
    });

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (d >= today && getDayType(d, holidays, 'Distribucion')) {
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const { year: weekYear, week } = getWeekNumber(d);
            
            const salesForDay = salesData.filter(s => s.año === year && s.mes === month);
            salesForDay.forEach(sale => {
                const productId = normalizeMaterialCode(sale.código);
                const centerId = String(sale.centro).trim();
                const rateKey = `${year}-${month}---${productId}---${centerId}`;
                const dailyRate = monthlyDemandRates.get(rateKey)?.dailyRate || 0;
                
                const demandKey = `${weekYear}-W${week}---${productId}---${centerId}`;
                weeklyDemandMap.set(demandKey, (weeklyDemandMap.get(demandKey) || 0) + dailyRate);
            });
        }
    }
    auditLog.push(`Prorrateo de demanda completado. Se generaron ${weeklyDemandMap.size} entradas de demanda semanal.`);

    // --- Start of 2-Phase Planning ---
    const planningWeeks = Array.from(new Set(Array.from(weeklyDemandMap.keys()).map(k => k.split('---')[0]))).sort()
        .map(weekKey => {
            const [yearStr, weekStr] = weekKey.split('-W');
            return { year: parseInt(yearStr), week: parseInt(weekStr) };
        });

    const advancedNeed = new Map<string, number>(); // Key: `YYYY-WW---lineId---productId` -> units to advance
    
    // Phase 1: Backward Pass to find future capacity deficits
    for (let i = planningWeeks.length - 1; i >= 0; i--) {
        onProgress({ message: `Analizando capacidad futura...`, step: 'monthly', current: planningWeeks.length - i, total: planningWeeks.length });
        const { year, week } = planningWeeks[i];
        const weekKeyPart = `${year}-W${week}`;

        for (const line of productionLines) {
            if (!line.isActive) continue;
            let capacityHours = 0;
            const daysInWeek = 7; 
            for(let d=0; d<daysInWeek; d++) {
                const checkDate = new Date(year, 0, (week-1)*7 + d + 1);
                if (checkDate >= today && getDayType(checkDate, holidays, 'Produccion', line.id)) {
                    capacityHours += shiftParameters.regularHoursPerDay;
                }
            }
            
            const productsOnLine = Array.from(new Set(line.materialsHandled));
            for (const productId of productsOnLine) {
                 const provisionRule = productInfoMap.get(productId)?.provisionRule;
                 let totalDemandForProduct = 0;

                 if (provisionRule === 'F') {
                    if (line.workCenterId === '1000') {
                        for (const center of workCenters) {
                            totalDemandForProduct += weeklyDemandMap.get(`${weekKeyPart}---${productId}---${center.id}`) || 0;
                        }
                    } else continue;
                 } else {
                     totalDemandForProduct = weeklyDemandMap.get(`${weekKeyPart}---${productId}---${line.workCenterId}`) || 0;
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
    auditLog.push(`Fase 1 (Análisis Futuro) completada. Se calcularon ${advancedNeed.size} necesidades de adelanto.`);

    // Phase 2: Forward Pass to plan production
    const weeklyPlan: WeeklyPlanItem[] = [];
    const inventoryState = new Map<string, number>(); // Key: `productId---centerId` -> current stock
    inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));

    for (let i = 0; i < planningWeeks.length; i++) {
        const { year, week } = planningWeeks[i];
        onProgress({ message: `Planificando semana ${week}...`, step: 'daily', current: i + 1, total: planningWeeks.length });
        const weekKeyPart = `${year}-W${week}`;
        
        const weeklyLineCapacity = new Map<string, number>(); 
        productionLines.forEach(line => {
             if (!line.isActive) return;
            let capacityHours = 0;
            const daysInWeek = 7;
             for(let d=0; d<daysInWeek; d++) {
                const checkDate = new Date(year, 0, (week-1)*7 + d + 1);
                if (checkDate >= today && getDayType(checkDate, holidays, 'Produccion', line.id)) {
                    capacityHours += shiftParameters.regularHoursPerDay;
                }
            }
            weeklyLineCapacity.set(line.id, capacityHours);
        });

        const weeklyAggregates = new Map<string, { production: number, sales: number, netTransfers: number }>();
        
        // Prioritize transfers
        const transferNeeds = new Map<string, number>(); // Key: `productId---toCenterId` -> quantity
        for (const center of workCenters) {
            if (center.id === '1000') continue;
            for(const [key, demandQty] of weeklyDemandMap.entries()) {
                if (key.startsWith(weekKeyPart) && key.endsWith(`---${center.id}`)) {
                    const [, productId] = key.split('---');
                    const info = productInfoMap.get(productId);
                    if (info?.provisionRule === 'F') {
                        const invKey = `${productId}---${center.id}`;
                        const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === center.id)?.minStock || 0;
                        const currentStock = inventoryState.get(invKey) || 0;
                        const netTransfersForWeek = weeklyPlan.filter(p => p.week === week && p.netTransfers !== 0).reduce((sum, p) => sum + p.netTransfers, 0); // Simplified
                        const need = safetyStock + demandQty - (currentStock + netTransfersForWeek);
                        if (need > 0) {
                            transferNeeds.set(`${productId}---${center.id}`, (transferNeeds.get(`${productId}---${center.id}`) || 0) + need);
                        }
                    }
                }
            }
        }
        
        // Fulfill transfer needs from Center 1000
        for (const [needKey, qty] of transferNeeds.entries()) {
            const [productId, toCenter] = needKey.split('---');
            const line = productionLines.find(l => l.workCenterId === '1000' && l.materialsHandled.includes(productId) && l.isActive);
            if (!line) {
                 throw new Error(`Error de configuración: El producto '${productId}' (código: ${productInfoMap.get(productId)?.name}) debe fabricarse en el Centro 1000 (Regla 'F') para abastecer al centro ${toCenter}, pero no se encontró una línea de producción válida asignada para él en el Centro 1000.`);
            }
            if (!weeklyAggregates.has(line.id)) weeklyAggregates.set(line.id, { production: 0, sales: 0, netTransfers: 0 });

            const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
            let availableHours = weeklyLineCapacity.get(line.id) || 0;
            if (timePerUnit !== Infinity && availableHours > 0) {
                const toProduce = Math.min(qty, availableHours / timePerUnit);
                weeklyAggregates.get(line.id)!.production += toProduce;
                weeklyAggregates.get(line.id)!.netTransfers -= toProduce; // Outgoing transfer
                
                const destLines = productionLines.filter(l => l.workCenterId === toCenter && l.isActive);
                if (destLines.length > 0) {
                    const transferPerLine = toProduce / destLines.length;
                    destLines.forEach(dl => {
                        if (!weeklyAggregates.has(dl.id)) weeklyAggregates.set(dl.id, { production: 0, sales: 0, netTransfers: 0 });
                        weeklyAggregates.get(dl.id)!.netTransfers += transferPerLine; // Incoming
                    });
                }
                
                weeklyLineCapacity.set(line.id, availableHours - toProduce * timePerUnit);
            }
        }

        // Fulfill local demand and advance needs
        for (const line of productionLines) {
             if (!line.isActive) continue;
             if (!weeklyAggregates.has(line.id)) weeklyAggregates.set(line.id, { production: 0, sales: 0, netTransfers: 0 });

            const productsOnLine = Array.from(new Set(line.materialsHandled));
            for (const productId of productsOnLine) {
                 const invKey = `${productId}---${line.workCenterId}`;
                 const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === line.workCenterId)?.minStock || 0;
                 const demand = weeklyDemandMap.get(`${weekKeyPart}---${productId}---${line.workCenterId}`) || 0;
                 const advNeed = advancedNeed.get(`${weekKeyPart}---${line.id}---${productId}`) || 0;
                 const currentStock = inventoryState.get(invKey) || 0;
                 
                 const netTransfers = weeklyAggregates.get(line.id)?.netTransfers || 0;
                 const need = safetyStock + demand + advNeed - (currentStock + netTransfers);
                 
                 if (need > 0) {
                    const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
                    let availableHours = weeklyLineCapacity.get(line.id) || 0;
                    if (timePerUnit !== Infinity && availableHours > 0) {
                         const toProduce = Math.min(need, availableHours / timePerUnit);
                         weeklyAggregates.get(line.id)!.production += toProduce;
                         weeklyLineCapacity.set(line.id, availableHours - toProduce * timePerUnit);
                    }
                 }
            }
        }

        // Fulfill sales from final inventory
        for(const [key, demandQty] of weeklyDemandMap.entries()) {
            if (key.startsWith(weekKeyPart)) {
                const [, productId, centerId] = key.split('---');
                const invKey = `${productId}---${centerId}`;
                const initialInv = inventoryState.get(invKey) || 0;
                const weekProduction = Array.from(weeklyAggregates.entries()).filter(([lineId]) => productionLines.find(l=>l.id===lineId)?.workCenterId === centerId && productionLines.find(l=>l.id===lineId)?.materialsHandled.includes(productId)).reduce((sum, [, data]) => sum + data.production, 0);
                const weekTransfers = Array.from(weeklyAggregates.entries()).filter(([lineId]) => productionLines.find(l=>l.id===lineId)?.workCenterId === centerId).reduce((sum, [, data]) => sum + data.netTransfers, 0);
                const stock = initialInv + weekProduction + weekTransfers;
                
                const linesInCenter = productionLines.filter(l => l.workCenterId === centerId && l.isActive);
                if (linesInCenter.length > 0) {
                    const demandPerLine = demandQty / linesInCenter.length;
                    linesInCenter.forEach(l => {
                        if (!weeklyAggregates.has(l.id)) weeklyAggregates.set(l.id, { production: 0, sales: 0, netTransfers: 0 });
                        weeklyAggregates.get(l.id)!.sales += demandPerLine;
                    });
                }
            }
        }
        
        // Finalize weekly plan and update inventory state for next week
        const nextWeekInventoryState = new Map(inventoryState);
        for (const [lineId, agg] of weeklyAggregates.entries()) {
            const line = productionLines.find(l => l.id === lineId)!;
            const initialStockForLineProducts = line.materialsHandled.reduce((sum, pid) => sum + (inventoryState.get(`${pid}---${line.workCenterId}`) || 0), 0) / (line.materialsHandled.length || 1);

            const finalStock = initialStockForLineProducts + agg.production + agg.netTransfers - agg.sales;
            
            weeklyPlan.push({
                id: `${weekKeyPart}---${line.workCenterId}---${line.id}`,
                year, week, workCenterId: line.workCenterId, lineId: line.id,
                initialStock: initialStockForLineProducts,
                production: agg.production,
                sales: agg.sales,
                netTransfers: agg.netTransfers,
                finalStock: finalStock,
            });

            // Update inventory state for next week
            line.materialsHandled.forEach(pid => {
                const invKey = `${pid}---${line.workCenterId}`;
                const current = nextWeekInventoryState.get(invKey) || 0;
                // This is a simplification, should distribute based on production mix
                const stockChange = (agg.production + agg.netTransfers - agg.sales) / (line.materialsHandled.length || 1);
                nextWeekInventoryState.set(invKey, current + stockChange);
            });
        }
        inventoryState.clear();
        for(const [key, value] of nextWeekInventoryState.entries()) inventoryState.set(key, value);
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
