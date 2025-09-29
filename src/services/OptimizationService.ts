
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
                // Find workstation definition ID based on name and center. Crucially, workstation names are unique within a center.
                const workstation = Array.from(workstationsMap.values()).find(w => w.name === workstationName);

                if (!workstation) continue;

                // Update workstation quantity in the line
                const assignedWsIndex = line.assignedWorkstations.findIndex(as => as.definitionId === workstation.id);
                if (assignedWsIndex !== -1) {
                    // This is the line that actually applies the change.
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
        
        // PuestoTrabajo names can be repeated across centers, so the ID must be unique.
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
                processType: 'Colchones', // Default
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

    const discoveredLinesArray = Array.from(discoveredLines.values());
    const discoveredWorkstationsArray = Array.from(discoveredWorkstations.values());

    // --- APPLY PREDEFINED VALUES TO THE DISCOVERED STRUCTURE ---
    let { updatedLines, updatedWorkstations } = applyPredefinedValues(
        Array.from(discoveredWorkCenters.values()),
        discoveredLinesArray,
        discoveredWorkstationsArray
    );

    // --- MERGE WITH USER EDITS FROM PREVIOUS STATE ---
    const finalLines = updatedLines.map(line => {
        const userEditedLine = currentConstraints.productionLines.find(l => l.id === line.id);
        if (userEditedLine) {
            line.processType = userEditedLine.processType;
            // For each assigned workstation in the newly discovered line structure
            line.assignedWorkstations.forEach(as => {
                const userEditedAs = userEditedLine.assignedWorkstations.find(uas => uas.definitionId === as.definitionId);
                // If the user has a different quantity for this workstation, keep the user's value
                if (userEditedAs && userEditedAs.quantity !== as.quantity) {
                    as.quantity = userEditedAs.quantity;
                }
            });
        }
        return line;
    });

    const finalWorkstations = updatedWorkstations.map(ws => {
        const userEditedWs = currentConstraints.workstationDefinitions.find(w => w.id === ws.id);
        if (userEditedWs) {
            if(userEditedWs.employeesPerWorkstation !== ws.employeesPerWorkstation) {
                ws.employeesPerWorkstation = userEditedWs.employeesPerWorkstation;
            }
            ws.machineCode = userEditedWs.machineCode;
        }
        return ws;
    });

    console.log('Work Centers Discovered:', Array.from(discoveredWorkCenters.values()));
    console.log('Final Production Lines (after merge):', finalLines);
    console.log('Final Workstation Definitions (after merge):', finalWorkstations);
    
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
    console.log('--- RUNNING STRATEGIC PLANNER V10 (Cost-Optimized Hours) ---');
    const auditLog: string[] = ['Iniciando Planificador Estratégico v10 con optimización de costos de horas.'];
    const { inventorySettings, holidays, productionLines, workstationDefinitions, shiftParameters, workCenters, laborCostFactors, globalBaseCostPerHour } = constraints;

    if (salesData.length === 0) {
        auditLog.push("Error: No hay datos de ventas para planificar.");
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }
     if (!laborCostFactors || !globalBaseCostPerHour) {
        auditLog.push("Error: No se han definido los factores de costo laboral o el costo base por hora.");
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
    
    // Prorate demand based on agreed logic
    const weeklyDemandMap = new Map<string, number>(); // Key: `YYYY-WW---productId---centerId`
    const monthSaleDays = new Map<string, number>(); // Key: 'YYYY-MM'

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
        monthSaleDays.set(monthKey, salesDaysInMonth > 0 ? salesDaysInMonth : 1);
    });
    
    const rule1_weekDays = new Date();
    const currentDayOfWeek = rule1_weekDays.getDay(); // 0=Sun, 1=Mon...
    const remainingWeekdays = (currentDayOfWeek >= 1 && currentDayOfWeek <= 5) ? 5 - currentDayOfWeek + 1 : 0;
    
    const { year: currentWeekYear, week: currentWeekNum } = getWeekNumber(rule1_weekDays);
    const currentWeekKey = `${currentWeekYear}-W${currentWeekNum}`;
    let currentWeekSaleDays = 0;
    for(let i=0; i < remainingWeekdays; i++) {
        const d = new Date(rule1_weekDays.getTime());
        d.setDate(d.getDate() + i);
        if(getDayType(d, holidays, 'Distribucion')) {
            currentWeekSaleDays++;
        }
    }


    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (d < today) continue;
        
        const { year: weekYear, week } = getWeekNumber(d);
        const weekKey = `${weekYear}-W${week}`;
        
        let totalSaleDaysInContext;
        
        if (weekKey === currentWeekKey) {
            totalSaleDaysInContext = currentWeekSaleDays;
        } else {
            totalSaleDaysInContext = 5 - holidays.filter(h => {
                const hDate = new Date(h.date + 'T00:00:00');
                return getWeekNumber(hDate).week === week && h.appliesTo === 'Distribucion';
            }).length;
        }

        if (getDayType(d, holidays, 'Distribucion')) {
            const year = d.getFullYear();
            const month = d.getMonth() + 1;
            const monthKey = `${year}-${month}`;
            const totalSaleDaysInMonth = monthSaleDays.get(monthKey) || 1;

            const salesForMonth = salesData.filter(s => s.año === year && s.mes === month);
            salesForMonth.forEach(sale => {
                 const dailyRate = sale.unidadesProyectado / totalSaleDaysInMonth;
                 const productId = normalizeMaterialCode(sale.código);
                 const centerId = String(sale.centro).trim();
                 const demandKey = `${weekYear}-W${week}---${productId}---${centerId}`;
                 weeklyDemandMap.set(demandKey, (weeklyDemandMap.get(demandKey) || 0) + dailyRate);
            });
        }
    }
    auditLog.push(`Prorrateo de demanda completado. Se generaron ${weeklyDemandMap.size} entradas de demanda semanal.`);
    

    const planningWeeks = Array.from(new Set(Array.from(weeklyDemandMap.keys()).map(k => k.split('---')[0]))).sort()
        .map(weekKey => {
            const [yearStr, weekStr] = weekKey.split('-W');
            return { year: parseInt(yearStr), week: parseInt(weekStr) };
        });

    const advancedNeed = new Map<string, number>(); 
    
    // BACKWARD PASS
    for (let i = planningWeeks.length - 1; i >= 0; i--) {
        onProgress({ message: `Analizando capacidad futura...`, step: 'monthly', current: planningWeeks.length - i, total: planningWeeks.length });
        const { year, week } = planningWeeks[i];
        const weekKeyPart = `${year}-W${week}`;

        for (const line of productionLines) {
            if (!line.isActive) continue;
            
            const weeklyCapacity = getWeeklyCapacity(year, week, line.id, holidays, shiftParameters);
            let totalCapacityHours = weeklyCapacity.regularHours + weeklyCapacity.extraHours + weeklyCapacity.saturdayHours;
            
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
                    if (hoursNeeded > totalCapacityHours) {
                        const deficitUnits = (hoursNeeded - totalCapacityHours) / timePerUnit;
                        if(i > 0) {
                            const prevWeek = planningWeeks[i-1];
                            const advNeedKey = `${prevWeek.year}-W${prevWeek.week}---${line.id}---${productId}`;
                            advancedNeed.set(advNeedKey, (advancedNeed.get(advNeedKey) || 0) + deficitUnits);
                        }
                        totalCapacityHours = 0; 
                    } else {
                        totalCapacityHours -= hoursNeeded;
                    }
                }
            }
        }
    }
    auditLog.push(`Fase 1 (Análisis Futuro) completada. Se calcularon ${advancedNeed.size} necesidades de adelanto.`);

    // FORWARD PASS
    const weeklyPlan: WeeklyPlanItem[] = [];
    const inventoryState = new Map<string, number>(); 
    inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));

    for (let i = 0; i < planningWeeks.length; i++) {
        const { year, week } = planningWeeks[i];
        onProgress({ message: `Planificando semana ${week}...`, step: 'daily', current: i + 1, total: planningWeeks.length });
        const weekKeyPart = `${year}-W${week}`;
        
        const weeklyLineCapacity = new Map<string, { regularHours: number, extraHours: number, saturdayHours: number, usedRegular: number, usedExtra: number, usedSaturday: number }>();
        productionLines.forEach(line => {
             if (!line.isActive) return;
             const cap = getWeeklyCapacity(year, week, line.id, holidays, shiftParameters);
             weeklyLineCapacity.set(line.id, { ...cap, usedRegular: 0, usedExtra: 0, usedSaturday: 0 });
        });

        const weeklyAggregates = new Map<string, { production: number, sales: number, netTransfers: number }>();

        const consumeCapacityAndGetCost = (lineId: string, hoursToConsume: number): { success: boolean; cost: number } => {
            const capacity = weeklyLineCapacity.get(lineId);
            if (!capacity) return { success: false, cost: 0 };
            
            let totalAvailable = (capacity.regularHours - capacity.usedRegular) + 
                                 (capacity.extraHours - capacity.usedExtra) + 
                                 (capacity.saturdayHours - capacity.usedSaturday);

            if (hoursToConsume > totalAvailable) return { success: false, cost: 0 };

            let remainingHours = hoursToConsume;
            let totalCost = 0;

            const regularToConsume = Math.min(remainingHours, capacity.regularHours - capacity.usedRegular);
            capacity.usedRegular += regularToConsume;
            totalCost += regularToConsume * globalBaseCostPerHour;
            remainingHours -= regularToConsume;

            if (remainingHours > 0) {
                const extraToConsume = Math.min(remainingHours, capacity.extraHours - capacity.usedExtra);
                capacity.usedExtra += extraToConsume;
                totalCost += extraToConsume * globalBaseCostPerHour * (1 + laborCostFactors.factorAdicionalDiurno / 100);
                remainingHours -= extraToConsume;
            }

            if (remainingHours > 0) {
                const saturdayToConsume = Math.min(remainingHours, capacity.saturdayHours - capacity.usedSaturday);
                capacity.usedSaturday += saturdayToConsume;
                totalCost += saturdayToConsume * globalBaseCostPerHour * (1 + laborCostFactors.factorFinSemanaFeriado / 100);
            }
            
            return { success: true, cost: totalCost };
        };
        
        const planProduction = (line: ProductionLine, productId: string, unitsToProduce: number) => {
            const timePerUnit = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
            if (timePerUnit === Infinity) return 0;
            
            const capacity = weeklyLineCapacity.get(line.id)!;
            const totalAvailableHours = (capacity.regularHours - capacity.usedRegular) + (capacity.extraHours - capacity.usedExtra) + (capacity.saturdayHours - capacity.usedSaturday);
            if (totalAvailableHours <= 0) return 0;

            const producibleUnits = Math.min(unitsToProduce, Math.floor(totalAvailableHours / timePerUnit));
            const hoursToConsume = producibleUnits * timePerUnit;
            
            const { success, cost } = consumeCapacityAndGetCost(line.id, hoursToConsume);
            if (success) {
                if (!weeklyAggregates.has(line.id)) weeklyAggregates.set(line.id, { production: 0, sales: 0, netTransfers: 0 });
                weeklyAggregates.get(line.id)!.production += producibleUnits;
                // We're not tracking cost per product, but we could add it here
                return producibleUnits;
            }
            return 0;
        };

        const applyProductionLogic = (centerId: string) => {
             const centerLines = productionLines.filter(l => l.workCenterId === centerId && l.isActive);
             const productLineMapping = new Map<string, string[]>();
             
             apiData.forEach(item => {
                 if (String(item.Centro).trim() !== centerId) return;
                 const productId = normalizeMaterialCode(item.CodMaterial);
                 const lineName = String(item.Linea).trim();
                 const line = centerLines.find(l => l.name === lineName);
                 if (!line) return;

                 if (!productLineMapping.has(productId)) productLineMapping.set(productId, []);
                 if (!productLineMapping.get(productId)!.includes(line.id)) {
                     productLineMapping.get(productId)!.push(line.id);
                 }
             });

             // Step 1: Exclusive products for all lines
             for (const line of centerLines) {
                 const exclusiveProducts = Array.from(productLineMapping.entries())
                     .filter(([_, lineIds]) => lineIds.length === 1 && lineIds[0] === line.id)
                     .map(([productId]) => productId);

                 for (const productId of exclusiveProducts) {
                     const invKey = `${productId}---${centerId}`;
                     const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === centerId)?.minStock || 0;
                     const demand = (weeklyDemandMap.get(`${weekKeyPart}---${productId}---${centerId}`) || 0) + (advancedNeed.get(`${weekKeyPart}---${line.id}---${productId}`) || 0);
                     const currentStock = inventoryState.get(invKey) || 0;
                     const need = safetyStock + demand - currentStock;
                     if (need > 0) {
                         const produced = planProduction(line, productId, need);
                         inventoryState.set(invKey, (inventoryState.get(invKey) || 0) + produced);
                     }
                 }
             }

             // Step 2 & 3: Spillover logic for Center 1000, Line 1 -> Line 3
             if (centerId === '1000') {
                 const line1 = centerLines.find(l => l.name === "LINEA 1");
                 const line3 = centerLines.find(l => l.name === "LINEA 3");

                 if (line1 && line3) {
                     const sharedProducts = Array.from(productLineMapping.entries())
                         .filter(([_, lineIds]) => lineIds.includes(line1.id) && lineIds.includes(line3.id))
                         .map(([productId]) => productId);

                     for (const productId of sharedProducts) {
                         const invKey = `${productId}---1000`;
                         const safetyStock = inventorySettings.find(i => i.itemId === productId && i.centerId === '1000')?.minStock || 0;
                         const demand = (weeklyDemandMap.get(`${weekKeyPart}---${productId}---1000`) || 0) + (advancedNeed.get(`${weekKeyPart}---${line1.id}---${productId}`) || 0);
                         const currentStock = inventoryState.get(invKey) || 0;
                         let remainingNeed = safetyStock + demand - currentStock;

                         if (remainingNeed > 0) {
                             const producedOnL1 = planProduction(line1, productId, remainingNeed);
                             inventoryState.set(invKey, (inventoryState.get(invKey) || 0) + producedOnL1);
                             remainingNeed -= producedOnL1;
                             
                             if (remainingNeed > 0) {
                                 const producedOnL3 = planProduction(line3, productId, remainingNeed);
                                 inventoryState.set(invKey, (inventoryState.get(invKey) || 0) + producedOnL3);
                             }
                         }
                     }
                 }
             }
        };

        workCenters.forEach(center => applyProductionLogic(center.id));

        for(const [key, demandQty] of weeklyDemandMap.entries()) {
            if (key.startsWith(weekKeyPart)) {
                const [, productId, centerId] = key.split('---');
                const invKey = `${productId}---${centerId}`;
                const stock = inventoryState.get(invKey) || 0;
                const sold = Math.min(stock, demandQty);
                inventoryState.set(invKey, stock - sold);

                const linesInCenter = productionLines.filter(l => l.workCenterId === centerId && l.isActive);
                 if (linesInCenter.length > 0) {
                    const demandPerLine = sold / linesInCenter.length;
                    linesInCenter.forEach(l => {
                        if (!weeklyAggregates.has(l.id)) weeklyAggregates.set(l.id, { production: 0, sales: 0, netTransfers: 0 });
                        weeklyAggregates.get(l.id)!.sales += demandPerLine;
                    });
                }
            }
        }
        
        for (const [lineId, agg] of weeklyAggregates.entries()) {
            const line = productionLines.find(l => l.id === lineId)!;
            const initialStockForLineProducts = line.materialsHandled.reduce((sum, pid) => sum + (inventoryState.get(`${pid}---${line.workCenterId}`) || 0), 0) / (line.materialsHandled.length || 1);
            weeklyPlan.push({
                id: `${weekKeyPart}---${line.workCenterId}---${line.id}`,
                year, week, workCenterId: line.workCenterId, lineId: line.id,
                initialStock: initialStockForLineProducts, production: agg.production,
                sales: agg.sales, netTransfers: agg.netTransfers,
                finalStock: initialStockForLineProducts + agg.production + agg.netTransfers - agg.sales,
            });
        }
    }

    onProgress(null);
    auditLog.push(`Fase 2 (Planificación) completada. Se generaron ${weeklyPlan.length} registros de plan semanal.`);
    return { dailyPlan: [], monthlyPlan: [], weeklyPlan, auditLog };
};


function getWeeklyCapacity(year: number, week: number, lineId: string, holidays: Holiday[], shiftParams: ShiftParameters): { regularHours: number, extraHours: number, saturdayHours: number } {
    const capacity = { regularHours: 0, extraHours: 0, saturdayHours: 0 };
    const firstDayOfYear = new Date(year, 0, 1);
    const daysOffset = (week - 1) * 7;
    // Adjust to Monday of the week
    const firstDayOfWeek = new Date(firstDayOfYear.setDate(firstDayOfYear.getDate() + daysOffset - (firstDayOfYear.getDay() + 6) % 7));

    for (let d = 0; d < 7; d++) {
        const checkDate = new Date(firstDayOfWeek.valueOf());
        checkDate.setDate(checkDate.getDate() + d);
        const dayOfWeek = checkDate.getDay(); // 0=Sun, 6=Sat

        let isProdHoliday = false;
        const holidayInfo = holidays.find(h => h.date === checkDate.toISOString().split('T')[0]);
        if (holidayInfo) {
             if ((holidayInfo.appliesTo === 'Toda la Planta' || holidayInfo.appliesTo === lineId) && !holidayInfo.isProductionAllowed) {
                 isProdHoliday = true;
             }
        }
        if (isProdHoliday) continue;

        if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Monday to Friday
            capacity.regularHours += shiftParams.regularHoursPerDay;
            capacity.extraHours += shiftParams.extraHoursPerDay;
        } else if (dayOfWeek === 6) { // Saturday
             if (!holidayInfo || (holidayInfo && holidayInfo.isProductionAllowed)) {
                capacity.saturdayHours += shiftParams.saturdayAndHolidayHours;
             }
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



