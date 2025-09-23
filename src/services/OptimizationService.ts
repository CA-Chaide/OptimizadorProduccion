

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

type DayProductionType = 'Weekday' | 'Saturday' | 'Sunday' | 'ProductiveHoliday' | 'NonProductiveHoliday';

const getDayTypeForProduction = (date: Date, holidays: Holiday[]): DayProductionType => {
    const yyyyMmDd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const holidayInfo = holidays.find(h => h.date === yyyyMmDd);

    if (holidayInfo && (holidayInfo.appliesTo === 'Produccion' || holidayInfo.appliesTo === 'Ambos')) {
        return holidayInfo.isProductionAllowed ? 'ProductiveHoliday' : 'NonProductiveHoliday';
    }

    const dayOfWeek = date.getDay();
    if (dayOfWeek === 0) return 'Sunday';
    if (dayOfWeek === 6) return 'Saturday';
    return 'Weekday';
};

type HourType = 'regular' | 'extra' | 'holiday';
type LineHourAvailability = Record<HourType, number>;
const HOUR_COST_ORDER: HourType[] = ['regular', 'extra', 'holiday'];

function calculateLaborCost(consumedHours: LineHourAvailability, ppi: ProductProcessInfo, baseCostPerHour: number | null, costFactors: LaborCostSettings | null, workstationDefs: WorkstationDefinition[]): number {
    if (!baseCostPerHour || !costFactors || !ppi.workstationTimes) return 0;
    const totalEmployees = ppi.workstationTimes.reduce((sum, wt) => {
        const def = workstationDefs.find(d => d.id === wt.workstationDefinitionId);
        return sum + (def?.employeesPerWorkstation || 1);
    }, 0);
    const regularHoursCost = (consumedHours.regular * totalEmployees) * baseCostPerHour;
    const extraHoursCost = (consumedHours.extra * totalEmployees) * baseCostPerHour * (1 + (costFactors.factorAdicionalDiurno / 100));
    const holidayHoursCost = (consumedHours.holiday * totalEmployees) * baseCostPerHour * (1 + (costFactors.factorFinSemanaFeriado / 100));
    return regularHoursCost + extraHoursCost + holidayHoursCost;
}

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

function getPpiOptionsForProduct(productId: string, demandCenterId: string, constraints: AppConstraints, apiData: TiempoEnsambleItem[], ppiCache: Map<string, ProductProcessInfo[]>): ProductProcessInfo[] {
    const cacheKey = `${productId}---${demandCenterId}`;
    if (ppiCache.has(cacheKey)) {
        return ppiCache.get(cacheKey)!;
    }
    const { productionLines, workstationDefinitions } = constraints;
    let ruleRow = apiData.find(row => normalizeMaterialCode(row.CodMaterial) === productId && String(row.Centro).trim() === demandCenterId && row.ClaseAprovisionamiento) || apiData.find(row => normalizeMaterialCode(row.CodMaterial) === productId && row.ClaseAprovisionamiento);
    const provisioningRule = ruleRow?.ClaseAprovisionamiento || 'E';
    
    const productionCenterId = provisioningRule === 'F' ? "1000" : demandCenterId;

    const allCapableLines = productionLines.filter(line => 
        line.workCenterId === productionCenterId &&
        apiData.some(d => normalizeMaterialCode(d.CodMaterial) === productId && String(d.Centro).trim() === line.workCenterId && String(d.Linea).trim() === line.name)
    );

    if (allCapableLines.length === 0) return [];
    
    const ppiCandidates: ProductProcessInfo[] = [];
    allCapableLines.forEach(line => {
        const manufacturingTime = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);
        if (manufacturingTime < Infinity && manufacturingTime > 0) {
            const ppiId = `${productId}---${line.id}`;
            const workstationTimes = line.assignedWorkstations.map(as => {
                 const workstationDef = workstationDefinitions.find(wd => wd.id === as.definitionId)!;
                 const apiTimeRow = apiData.find(d => normalizeMaterialCode(d.CodMaterial) === productId && String(d.Centro).trim() === line.workCenterId && String(d.Linea).trim() === line.name && String(d.PuestoTrabajo).trim() === workstationDef.name);
                return { workstationDefinitionId: as.definitionId, timeHours: (apiTimeRow?.Tiempo || 0) / 60 };
            }).filter(wt => wt.timeHours > 0);
            ppiCandidates.push({ id: ppiId, productId: productId, productionLineId: line.id, workstationTimes: workstationTimes, totalManufacturingTimeHours: manufacturingTime });
        }
    });
    const sortedCandidates = ppiCandidates.sort((a, b) => a.totalManufacturingTimeHours - b.totalManufacturingTimeHours);
    ppiCache.set(cacheKey, sortedCandidates);
    return sortedCandidates;
}

function sequenceDailyProduction(dailyGoals: MonthlyAssignment[], inventoryState: Map<string, number>, dailyDemand: Map<string, number>): MonthlyAssignment[] {
    const scoredGoals = dailyGoals.map(goal => {
        const stockKey = `${goal.productId}---${goal.demandCenterId}`;
        const currentStock = inventoryState.get(stockKey) || 0;
        const avgDailyDemand = (dailyDemand.get(stockKey) || 1) / 30; // Simplified
        const urgencyScore = (currentStock) / (avgDailyDemand + 0.1);
        return { ...goal, urgencyScore };
    });
    return scoredGoals.sort((a, b) => a.urgencyScore - b.urgencyScore);
}

const getWeekNumber = (d: Date): { year: number; week: number } => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return { year: d.getUTCFullYear(), week: weekNo };
};

export const generateProductionPlan = async (
    planningYear: number, 
    constraints: AppConstraints, 
    apiData: TiempoEnsambleItem[], 
    salesData: SalesDataRow[],
    onProgress: (progress: PlanningProgress | null) => void,
): Promise<ProductionPlan> => {
    console.log('--- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN ---');
    const { inventorySettings, holidays, workCenters, productionLines, globalBaseCostPerHour, laborCostFactors, workstationDefinitions, shiftParameters } = constraints;

    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    
    const planningHorizon = Array.from(new Set(salesData.map(s => `${s.año}-${s.mes}`)))
        .map(key => {
            const [year, month] = key.split('-').map(Number);
            return { year, month };
        })
        .sort((a, b) => a.year - b.year || a.month - b.month);

    if (planningHorizon.length === 0) {
        onProgress(null);
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog: ["No hay datos de ventas para planificar."] };
    }
    const horizonMonths = planningHorizon.length;

    const ppiCache = new Map<string, ProductProcessInfo[]>();

    const productNamesMap = new Map<string, string>();
    salesData.forEach(s => {
        const normalizedProductId = normalizeMaterialCode(s.código);
        if (!productNamesMap.has(normalizedProductId) || (productNamesMap.get(normalizedProductId) && productNamesMap.get(normalizedProductId)!.startsWith('FAL'))) {
            productNamesMap.set(normalizedProductId, s.descripciónMaterial || s.etiqueta || normalizedProductId);
        }
    });

    const demandMap = new Map<string, { [monthKey: string]: number }>();
    salesData.forEach(s => {
        const pairKey = `${normalizeMaterialCode(s.código)}---${String(s.centro).trim()}`;
        if (!demandMap.has(pairKey)) demandMap.set(pairKey, {});
        const monthKey = `${s.año}-${s.mes}`;
        demandMap.get(pairKey)![monthKey] = (demandMap.get(pairKey)![monthKey] || 0) + s.unidadesProyectado;
    });

    // --- Monthly Planning ---
    const productionNeedsMap = new Map<string, number[]>(); // Map<pairKey, needs_per_month_index>
    const adjustedInitialStock = new Map<string, number>();

    // Adjust stock and demand for the current month
    const firstMonthOfPlanning = planningHorizon[0];
    if (firstMonthOfPlanning.year === today.getFullYear() && firstMonthOfPlanning.month === today.getMonth() + 1) {
        const daysInMonth = new Date(firstMonthOfPlanning.year, firstMonthOfPlanning.month, 0).getDate();
        const workingDaysInMonth = Array.from({ length: daysInMonth }, (_, i) => new Date(firstMonthOfPlanning.year, firstMonthOfPlanning.month - 1, i + 1))
            .filter(d => getDayTypeForProduction(d, holidays) !== 'Sunday' && getDayTypeForProduction(d, holidays) !== 'NonProductiveHoliday').length;
        const pastWorkingDays = Array.from({ length: today.getDate() -1 }, (_, i) => new Date(firstMonthOfPlanning.year, firstMonthOfPlanning.month - 1, i + 1))
            .filter(d => getDayTypeForProduction(d, holidays) !== 'Sunday' && getDayTypeForProduction(d, holidays) !== 'NonProductiveHoliday').length;
        
        demandMap.forEach((monthlyDemands, pairKey) => {
            const [productId, centerId] = pairKey.split('---');
            const invSetting = inventorySettings.find(is => is.itemId === productId && is.centerId === centerId);
            if (invSetting) {
                const demandThisMonth = monthlyDemands[`${firstMonthOfPlanning.year}-${firstMonthOfPlanning.month}`] || 0;
                const dailyDemand = demandThisMonth / (workingDaysInMonth || 1);
                const consumedDemand = dailyDemand * pastWorkingDays;
                adjustedInitialStock.set(pairKey, invSetting.currentStock - consumedDemand);
            }
        });
    }

    demandMap.forEach((monthlyDemands, pairKey) => {
        const [productId, centerId] = pairKey.split('---');
        const invSetting = inventorySettings.find(is => is.itemId === productId && is.centerId === centerId);
        const needs = Array(horizonMonths).fill(0);
        
        let stockAtStartOfMonth = adjustedInitialStock.get(pairKey) ?? invSetting?.currentStock ?? 0;

        for (let i = 0; i < horizonMonths; i++) {
            const { year, month } = planningHorizon[i];
            const monthKey = `${year}-${month}`;
            const demandThisMonth = monthlyDemands[monthKey] || 0;
            let productionNeeded = demandThisMonth + (invSetting?.minStock || 0) - stockAtStartOfMonth;

            // For the first month of planning, only consider demand for remaining days
            if (year === today.getFullYear() && month === today.getMonth() + 1) {
                 const daysInMonth = new Date(year, month, 0).getDate();
                 const workingDaysInMonth = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month - 1, i + 1)).filter(d => getDayTypeForProduction(d, holidays) !== 'Sunday' && getDayTypeForProduction(d, holidays) !== 'NonProductiveHoliday').length;
                 const remainingWorkingDays = Array.from({ length: daysInMonth - today.getDate() + 1 }, (_, i) => new Date(year, month - 1, today.getDate() + i)).filter(d => getDayTypeForProduction(d, holidays) !== 'Sunday' && getDayTypeForProduction(d, holidays) !== 'NonProductiveHoliday').length;
                 const remainingDemand = (demandThisMonth / (workingDaysInMonth || 1)) * remainingWorkingDays;
                 productionNeeded = remainingDemand + (invSetting?.minStock || 0) - stockAtStartOfMonth;
            }

            const maxAllowedByStorage = (invSetting?.maxStock === 0 || !invSetting?.maxStock) ? Infinity : invSetting.maxStock - (stockAtStartOfMonth - demandThisMonth);
            const cappedProduction = Math.max(0, Math.min(productionNeeded, maxAllowedByStorage));
            needs[i] = cappedProduction;
            stockAtStartOfMonth += cappedProduction - demandThisMonth;
        }
        productionNeedsMap.set(pairKey, needs);
    });

    const activeLines = productionLines.filter(l => l.isActive !== false);
    const lineMonthlyHours = new Map<string, LineHourAvailability[]>();
    activeLines.forEach(line => {
        lineMonthlyHours.set(line.id, planningHorizon.map(({ year, month }) => {
            const availability: LineHourAvailability = { regular: 0, extra: 0, holiday: 0 };
            const daysInMonth = new Date(year, month, 0).getDate();
            const startDay = (year === today.getFullYear() && month === today.getMonth() + 1) ? today.getDate() : 1;

            for (let day = startDay; day <= daysInMonth; day++) {
                const dayType = getDayTypeForProduction(new Date(year, month - 1, day), holidays);
                if (dayType === 'Weekday') {
                    availability.regular += shiftParameters.regularHoursPerDay;
                    availability.extra += shiftParameters.extraHoursPerDay;
                } else if (dayType === 'Saturday' || dayType === 'ProductiveHoliday') {
                    availability.holiday += shiftParameters.saturdayAndHolidayHours;
                }
            }
            return availability;
        }));
    });
    
    // Monthly assignment logic
    const monthlyAssignmentsMap = new Map<string, MonthlyAssignment>();
    
    // Smoothing (pre-production) logic
    for (let i = horizonMonths - 1; i >= 0; i--) {
        const { year, month } = planningHorizon[i];
        onProgress({ message: `Analizando capacidad mensual y suavizando carga...`, step: 'monthly', current: horizonMonths - i, total: horizonMonths });
        
        const availableHoursThisMonth = new Map<string, LineHourAvailability>();
        lineMonthlyHours.forEach((monthlyAvail, lineId) => availableHoursThisMonth.set(lineId, { ...monthlyAvail[i] }));
        
        const needsForMonth = Array.from(productionNeedsMap.entries()).map(([pk, needs]) => ({pairKey: pk, units: needs[i]}));

        for(const { pairKey, units } of needsForMonth) {
            let unitsLeftToPlan = units;
            if(unitsLeftToPlan <= 0) continue;

            const [productId, centerId] = pairKey.split('---');
            const ppiOptions = getPpiOptionsForProduct(productId, centerId, constraints, apiData, ppiCache);
            if (ppiOptions.length === 0) continue;

            for (const ppi of ppiOptions) {
                const lineAvailability = availableHoursThisMonth.get(ppi.productionLineId);
                if (!lineAvailability || ppi.totalManufacturingTimeHours <= 0) continue;
                
                const totalAvailable = lineAvailability.regular + lineAvailability.extra + lineAvailability.holiday;
                const maxUnitsCanMake = totalAvailable / ppi.totalManufacturingTimeHours;
                const unitsToMake = Math.min(unitsLeftToPlan, maxUnitsCanMake);
                const hoursToConsume = unitsToMake * ppi.totalManufacturingTimeHours;
                
                let remainingHoursToAssign = hoursToConsume;
                for (const hourType of HOUR_COST_ORDER) {
                    const consume = Math.min(remainingHoursToAssign, lineAvailability[hourType]);
                    lineAvailability[hourType] -= consume;
                    remainingHoursToAssign -= consume;
                }
                
                const assignmentKey = `${i}-${ppi.id}`;
                const existing = monthlyAssignmentsMap.get(assignmentKey) || {
                    id: assignmentKey, year, month, lineId: ppi.productionLineId, ppiId: ppi.id,
                    productId: productId, demandCenterId: centerId,
                    lineName: productionLines.find(l=>l.id === ppi.productionLineId)?.name || '',
                    centerName: productionLines.find(l=>l.id === ppi.productionLineId)?.workCenterId || '',
                    units: 0, totalHours: 0, laborCost: 0, originalNeedUnits: 0, advancedUnits: 0
                };
                existing.units += unitsToMake;
                existing.totalHours += hoursToConsume;
                monthlyAssignmentsMap.set(assignmentKey, existing);
                
                unitsLeftToPlan -= unitsToMake;
                if (unitsLeftToPlan < 0.1) break;
            }

            if (unitsLeftToPlan > 0.1 && i > 0) {
                 productionNeedsMap.get(pairKey)![i-1] += unitsLeftToPlan;
            }
        }
    }
    const monthlyAssignments = Array.from(monthlyAssignmentsMap.values());


    // --- Daily Planning ---
    let dailyPlan: ProductionPlanItem[] = [];
    const assignmentsByMonth = new Map<string, MonthlyAssignment[]>();
    monthlyAssignments.forEach(a => {
        const key = `${a.year}-${a.month}`;
        if (!assignmentsByMonth.has(key)) assignmentsByMonth.set(key, []);
        assignmentsByMonth.get(key)!.push(a);
    });

    const inventoryState = new Map<string, number>();
    inventorySettings.forEach(inv => {
        const initialStock = adjustedInitialStock.get(`${inv.itemId}---${inv.centerId}`) ?? inv.currentStock;
        inventoryState.set(`${inv.itemId}---${inv.centerId}`, initialStock);
    });

    const dailyDemandMap = new Map<string, number>();
    planningHorizon.forEach(({ year, month }) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        const workingDaysInMonth = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month - 1, i + 1))
            .filter(d => getDayTypeForProduction(d, holidays) !== 'Sunday' && getDayTypeForProduction(d, holidays) !== 'NonProductiveHoliday').length;
        
        demandMap.forEach((monthlyDemands, pairKey) => {
            const demandThisMonth = monthlyDemands[`${year}-${month}`] || 0;
            if (demandThisMonth > 0) {
                dailyDemandMap.set(pairKey, demandThisMonth / (workingDaysInMonth || 1));
            }
        });
    });

    for (const { year, month } of planningHorizon) {
        const assignmentsForMonth = assignmentsByMonth.get(`${year}-${month}`) || [];
        const remainingUnitsToProduce = new Map<string, number>();
        assignmentsForMonth.forEach(a => remainingUnitsToProduce.set(a.id, a.units));

        const daysInMonth = new Date(year, month, 0).getDate();
        const startDay = (year === today.getFullYear() && month === today.getMonth() + 1) ? today.getDate() : 1;

        for (let day = startDay; day <= daysInMonth; day++) {
            onProgress({ message: `Generando plan diario para ${MONTH_NAMES[month - 1]}...`, step: 'daily', current: day, total: daysInMonth });
            
            const currentDate = new Date(year, month - 1, day);
            const dayType = getDayTypeForProduction(currentDate, holidays);
            if (dayType === 'Sunday' || dayType === 'NonProductiveHoliday') continue;
            
            let hoursPerDay = (dayType === 'Weekday') ? shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay : shiftParameters.saturdayAndHolidayHours;
            const hoursByLine = new Map<string, number>();
            activeLines.forEach(line => hoursByLine.set(line.id, hoursPerDay));
            
            const dayProductionEvents: ProductionPlanItem[] = [];

            const assignmentsByLine = new Map<string, MonthlyAssignment[]>();
            assignmentsForMonth.filter(a => (remainingUnitsToProduce.get(a.id) || 0) > 0.1).forEach(a => {
                if (!assignmentsByLine.has(a.lineId)) assignmentsByLine.set(a.lineId, []);
                assignmentsByLine.get(a.lineId)!.push(a);
            });

            for (const [lineId, assignments] of assignmentsByLine.entries()) {
                let hoursRemainingTodayForLine = hoursByLine.get(lineId) || 0;
                const sequencedAssignments = sequenceDailyProduction(assignments, inventoryState, dailyDemandMap);
                
                for (const assignment of sequencedAssignments) {
                    if (hoursRemainingTodayForLine <= 0.01) break;
                    
                    const unitsLeftForAssignment = remainingUnitsToProduce.get(assignment.id) || 0;
                    if (unitsLeftForAssignment <= 0.1) continue;

                    const ppi = getPpiOptionsForProduct(assignment.productId, assignment.demandCenterId, constraints, apiData, ppiCache).find(p => p.id === assignment.ppiId);
                    if (!ppi || ppi.totalManufacturingTimeHours <= 0) continue;

                    let unitsToProduce = Math.min(unitsLeftForAssignment, hoursRemainingTodayForLine / ppi.totalManufacturingTimeHours);
                    const invSetting = inventorySettings.find(i => i.itemId === assignment.productId && i.centerId === assignment.centerName);
                    if (invSetting && unitsToProduce > 0 && unitsToProduce < invSetting.lotMin) {
                        if (hoursRemainingTodayForLine >= (invSetting.lotMin * ppi.totalManufacturingTimeHours)) {
                           unitsToProduce = Math.min(unitsLeftForAssignment, invSetting.lotMin);
                        } else {
                           continue;
                        }
                    }
                    
                    unitsToProduce = Math.floor(unitsToProduce);
                    if (unitsToProduce < 0.1) continue;

                    const hoursConsumed = unitsToProduce * ppi.totalManufacturingTimeHours;
                    
                    remainingUnitsToProduce.set(assignment.id, unitsLeftForAssignment - unitsToProduce);
                    hoursRemainingTodayForLine -= hoursConsumed;
                    
                    const isTransfer = assignment.centerName !== assignment.demandCenterId;
                    dayProductionEvents.push({
                        id: `${year}-${month}-${day}-${assignment.productId}-${lineId}-${Math.random()}`, year, month, day, week: 0, 
                        productId: assignment.productId, productName: productNamesMap.get(assignment.productId) || assignment.productId,
                        quantityToProduce: unitsToProduce, demandOnDay: 0, initialStockOnDay: 0, finalStockOnDay: 0,
                        assignedLineId: lineId, producingCenterId: assignment.centerName, demandCenterId: assignment.demandCenterId,
                        estimatedLaborCost: (assignment.laborCost / assignment.units) * unitsToProduce, hoursWorked: hoursConsumed,
                        status: isTransfer ? 'Transferencia' : 'Planificado', notes: '', isTransfer: isTransfer,
                        transferSourceCenterId: isTransfer ? assignment.centerName : undefined,
                        transferDestinationCenterId: isTransfer ? assignment.demandCenterId : undefined,
                    });
                }
                hoursByLine.set(lineId, hoursRemainingTodayForLine);
            }

            const dailyEventsForKardex = new Map<string, ProductionPlanItem>();

            dayProductionEvents.forEach(item => {
                const key = `${item.productId}---${item.demandCenterId}`;
                dailyEventsForKardex.set(key, item);
            });
            
            demandMap.forEach((_, pairKey) => {
                const [productId, centerId] = pairKey.split('---');
                const demandDay = new Date(year, month - 1, day);
                const isWorkingDay = getDayTypeForProduction(demandDay, holidays) !== 'Sunday' && getDayTypeForProduction(demandDay, holidays) !== 'NonProductiveHoliday';
                const dailyDemandAmount = dailyDemandMap.get(pairKey) || 0;

                if(isWorkingDay && dailyDemandAmount > 0.1 && !dailyEventsForKardex.has(pairKey)) {
                     dailyEventsForKardex.set(pairKey, {
                        id: `${year}-${month}-${day}-${productId}-${centerId}-demandOnly`, year, month, day, week: 0, productId,
                        productName: productNamesMap.get(productId) || productId, quantityToProduce: 0, demandOnDay: 0, initialStockOnDay: 0, finalStockOnDay: 0,
                        assignedLineId: '', producingCenterId: centerId, demandCenterId: centerId,
                        estimatedLaborCost: 0, hoursWorked: 0, status: 'Demanda', notes: '', isTransfer: false,
                    });
                }
            });

            const dayEvents = Array.from(dailyEventsForKardex.values());
            dayEvents.forEach(item => {
                const stockKey = `${item.productId}---${item.demandCenterId}`;
                const dailyDemandValue = dailyDemandMap.get(stockKey) || 0;
                
                item.demandOnDay = dailyDemandValue;
                item.initialStockOnDay = inventoryState.get(stockKey) || 0;

                let stockAfterMovements = item.initialStockOnDay - item.demandOnDay;
                if (!item.isTransfer) {
                     const productionStockKey = `${item.productId}---${item.producingCenterId}`;
                     const currentProdStock = inventoryState.get(productionStockKey) || 0;
                     inventoryState.set(productionStockKey, currentProdStock + item.quantityToProduce);
                     if(item.producingCenterId === item.demandCenterId) {
                         stockAfterMovements += item.quantityToProduce;
                     }
                } else {
                     const sourceStockKey = `${item.productId}---${item.transferSourceCenterId}`;
                     const destStockKey = `${item.productId}---${item.transferDestinationCenterId}`;
                     const sourceStock = inventoryState.get(sourceStockKey) || 0;
                     const destStock = inventoryState.get(destStockKey) || 0;
                     inventoryState.set(sourceStockKey, sourceStock - item.quantityToProduce);
                     inventoryState.set(destStockKey, destStock + item.quantityToProduce);
                     
                     if (item.demandCenterId === item.transferDestinationCenterId) stockAfterMovements += item.quantityToProduce;
                     if (item.demandCenterId === item.transferSourceCenterId) stockAfterMovements -= item.quantityToProduce;
                }
                item.finalStockOnDay = stockAfterMovements;
                inventoryState.set(stockKey, item.finalStockOnDay);
            });
            dailyPlan.push(...dayEvents);
        }
    }

    const finalDailyPlan = dailyPlan.filter(d => d.demandOnDay > 0.01 || d.quantityToProduce > 0.01)
        .sort((a, b) => (a.year * 10000 + a.month * 100 + a.day) - (b.year * 10000 + b.month * 100 + b.day));

    const aggregatedMonthlyPlan = new Map<string, MonthlyProductionPlanItem>();
    finalDailyPlan.forEach(item => {
        const key = `${item.year}-${item.month}-${item.productId}-${item.producingCenterId}`;
        let entry = aggregatedMonthlyPlan.get(key);
        if (!entry) {
            entry = {
                id: key, year: item.year, month: item.month, productId: item.productId,
                productName: productNamesMap.get(item.productId) || item.productId,
                producingCenterId: item.producingCenterId, totalQuantityToProduce: 0,
                totalHoursWorked: 0, totalEstimatedLaborCost: 0
            };
        }
        if (!item.isTransfer) entry.totalQuantityToProduce += item.quantityToProduce;
        entry.totalHoursWorked += item.hoursWorked;
        entry.totalEstimatedLaborCost += item.estimatedLaborCost;
        aggregatedMonthlyPlan.set(key, entry);
    });

    const weeklyPlanMap = new Map<string, WeeklyPlanItem>();
    const lineStockStateForWeekly = new Map<string, number>();
    inventorySettings.forEach(inv => {
        const ppiOptions = getPpiOptionsForProduct(inv.itemId, inv.centerId, constraints, apiData, ppiCache);
        if (ppiOptions.length > 0) {
            const lineId = ppiOptions[0].productionLineId;
            const currentStock = lineStockStateForWeekly.get(lineId) || 0;
            lineStockStateForWeekly.set(lineId, currentStock + inv.currentStock);
        }
    });

    const sortedDailyPlan = [...finalDailyPlan].sort((a, b) => new Date(a.year, a.month-1, a.day).getTime() - new Date(b.year, b.month-1, b.day).getTime());
    
    sortedDailyPlan.forEach(item => {
        const date = new Date(item.year, item.month - 1, item.day);
        const { year, week } = getWeekNumber(date);
        
        productionLines.forEach(line => {
            const key = `${year}-W${week}---${line.workCenterId}---${line.id}`;
            if (!weeklyPlanMap.has(key)) {
                 weeklyPlanMap.set(key, {
                    id: key, year, week, workCenterId: line.workCenterId, lineId: line.id,
                    initialStock: 0, production: 0, sales: 0, netTransfers: 0, finalStock: 0,
                });
            }
        });
        
        const line = productionLines.find(l => l.id === item.assignedLineId);
        if (line) {
            const key = `${year}-W${week}---${line.workCenterId}---${line.id}`;
            const weeklyItem = weeklyPlanMap.get(key)!;
            weeklyItem.production += item.isTransfer ? 0 : item.quantityToProduce;
        }

        const demandLine = productionLines.find(l => l.workCenterId === item.demandCenterId && getPpiOptionsForProduct(item.productId, item.demandCenterId, constraints, apiData, ppiCache).some(p => p.productionLineId === l.id));
        if (demandLine) {
            const key = `${year}-W${week}---${demandLine.workCenterId}---${demandLine.id}`;
             const weeklyItem = weeklyPlanMap.get(key)!;
             weeklyItem.sales += item.demandOnDay;
        }

        if (item.isTransfer) {
            const sourceLine = productionLines.find(l => l.workCenterId === item.transferSourceCenterId && getPpiOptionsForProduct(item.productId, item.transferSourceCenterId!, constraints, apiData, ppiCache).some(p => p.productionLineId === l.id));
            if(sourceLine) {
                 const key = `${year}-W${week}---${sourceLine.workCenterId}---${sourceLine.id}`;
                 const weeklyItem = weeklyPlanMap.get(key)!;
                 weeklyItem.netTransfers -= item.quantityToProduce;
            }
            const destLine = productionLines.find(l => l.workCenterId === item.transferDestinationCenterId && getPpiOptionsForProduct(item.productId, item.transferDestinationCenterId!, constraints, apiData, ppiCache).some(p => p.productionLineId === l.id));
             if(destLine) {
                 const key = `${year}-W${week}---${destLine.workCenterId}---${destLine.id}`;
                 const weeklyItem = weeklyPlanMap.get(key)!;
                 weeklyItem.netTransfers += item.quantityToProduce;
            }
        }
    });

    const weeklyPlan = Array.from(weeklyPlanMap.values()).sort((a, b) => (a.year - b.year) || (a.week - b.week));
    const lineStockState = new Map<string, number>();
     inventorySettings.forEach(inv => {
        const ppiOptions = getPpiOptionsForProduct(inv.itemId, inv.centerId, constraints, apiData, ppiCache);
        if (ppiOptions.length > 0) {
            const line = productionLines.find(l => l.id === ppiOptions[0].productionLineId);
             if (line) {
                 const stock = lineStockState.get(line.id) || 0;
                 lineStockState.set(line.id, stock + inv.currentStock);
            }
        }
    });


    const sortedWeeks = Array.from(new Set(weeklyPlan.map(w => `${w.year}-W${w.week}`))).sort();
    sortedWeeks.forEach(weekKey => {
         weeklyPlan.filter(w => `${w.year}-W${w.week}` === weekKey).forEach(item => {
             const initial = lineStockState.get(item.lineId) || 0;
             item.initialStock = initial;
             item.finalStock = initial + item.production + item.netTransfers - item.sales;
             lineStockState.set(item.lineId, item.finalStock);
         });
    });

    onProgress(null);
    return {
        dailyPlan: finalDailyPlan,
        monthlyPlan: Array.from(aggregatedMonthlyPlan.values()),
        weeklyPlan,
        auditLog: []
    };
};

export const exportDailyPlanToExcel = (plan: ProductionPlanItem[], constraints: AppConstraints): void => {
  if (!plan) return;
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
    if (!plan) return;
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
