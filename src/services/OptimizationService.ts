

import { 
    SalesDataRow, AppConstraints, ProductionPlan, ProductionPlanItem, 
    ProductProcessInfo, WorkCenter, ProductionLine, LaborCostSettings, InventorySetting, Holiday,
    MonthlyInventoryState, ProcessType, WorkstationDefinition,
    SupplyInfo, MonthlyProductionPlanItem, NotificationMessage, LineMonthlySummary, 
    TacticalRequest, TacticalPlanResult, TacticalOrderItem, ProvisionalOrder, Employee, EmployeeSkill, MaintenanceEvent, AbsenteeismEvent, AssignedPersonnel, ShiftParameters,
    Machine, Qualification, TiempoEnsambleItem, DetailedProductionPlan, PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment, PresupuestoItem,
    PlanningProgress
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

function getPpiOptionsForProduct(productId: string, demandCenterId: string, constraints: AppConstraints, apiData: TiempoEnsambleItem[]): ProductProcessInfo[] {
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
    return ppiCandidates.sort((a, b) => a.totalManufacturingTimeHours - b.totalManufacturingTimeHours);
}

function sequenceDailyProduction(dailyGoals: MonthlyAssignment[], inventoryState: Map<string, number>, dailyDemand: Map<string, number>, currentDate: Date, dailyDemandTotals: Map<string, number>): MonthlyAssignment[] {
    const dateKeyPrefix = `${currentDate.getFullYear()}-${currentDate.getMonth() + 1}-${currentDate.getDate()}`;
    const scoredGoals = dailyGoals.map(goal => {
        const stockKey = `${goal.productId}---${goal.demandCenterId}`;
        const currentStock = inventoryState.get(stockKey) || 0;
        const demandToday = dailyDemand.get(`${dateKeyPrefix}---${goal.productId}---${goal.demandCenterId}`) || 0;
        const avgDailyDemand = (dailyDemandTotals.get(stockKey) || 1) / 30;
        const urgencyScore = (currentStock - demandToday) / (avgDailyDemand + 0.1);
        return { ...goal, urgencyScore };
    });
    return scoredGoals.sort((a, b) => a.urgencyScore - b.urgencyScore);
}

export const generateProductionPlan = async (
    planningYear: number, 
    constraints: AppConstraints, 
    apiData: TiempoEnsambleItem[], 
    salesData: SalesDataRow[],
    onProgress: (progress: PlanningProgress | null) => void,
): Promise<{ finalPlan: ProductionPlan, details: DetailedProductionPlan }> => {
  console.log('--- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN ---');
  const { inventorySettings, holidays, workCenters, productionLines, globalBaseCostPerHour, laborCostFactors, workstationDefinitions, shiftParameters } = constraints;

  const monthKeysInSales = new Set(salesData.map(s => `${s.año}-${s.mes}`));
  const planningHorizon = Array.from(monthKeysInSales).map(m => {
    const [year, month] = m.split('-').map(Number);
    return { year, month };
  }).sort((a, b) => a.year - b.year || a.month - b.month);


  if (planningHorizon.length === 0) {
      onProgress(null);
      const emptyResult = { 
        finalPlan: { dailyPlan: [], monthlyPlan: [], auditLog: ["No hay datos de ventas para planificar."] },
        details: { planningGroupDetails: [], productionNeeds: [], monthlyAssignments: [] },
      };
      return emptyResult;
  }
  const horizonMonths = planningHorizon.length;

  const productNamesMap = new Map<string, string>();
    salesData.forEach(s => {
        const normalizedProductId = normalizeMaterialCode(s.código);
        if (!productNamesMap.has(normalizedProductId) || (productNamesMap.get(normalizedProductId) && productNamesMap.get(normalizedProductId)!.startsWith('FAL'))) {
             productNamesMap.set(normalizedProductId, s.descripciónMaterial || s.etiqueta || normalizedProductId);
        }
    });

  console.log('Paso 1: Agrupando demanda de ventas por producto-centro-mes...');
  const demandMap = new Map<string, { [monthKey: string]: number }>();
  salesData.forEach(s => {
      const pairKey = `${normalizeMaterialCode(s.código)}---${String(s.centro).trim()}`;
      if (!demandMap.has(pairKey)) demandMap.set(pairKey, {});
      const monthKey = `${s.año}-${s.mes}`;
      demandMap.get(pairKey)![monthKey] = (demandMap.get(pairKey)![monthKey] || 0) + s.unidadesProyectado;
  });
  console.log(`Paso 2: Demanda de ventas agrupada en ${demandMap.size} grupos.`);

  const planningGroupDetails: PlanningGroupMonthlyDetail[] = [];
  demandMap.forEach((monthlyDemands, pairKey) => {
      const [productId, centerId] = pairKey.split('---');
      const invSetting = inventorySettings.find(is => is.itemId === productId && is.centerId === centerId);
      Object.entries(monthlyDemands).forEach(([monthKey, demand]) => {
          if (demand > 0) {
              const [yearStr, monthStr] = monthKey.split('-');
              planningGroupDetails.push({ pairKey, productId, centerName: centerId, year: parseInt(yearStr), month: parseInt(monthStr), demand, initialStock: invSetting?.currentStock || 0, minStock: invSetting?.minStock || 0 });
          }
      });
  });
  console.log('Paso 3: Detalles de demanda mensual generados:', planningGroupDetails);
  
  console.log("Paso 4: Consolidando demanda según reglas de aprovisionamiento ('F' -> Centro 1000)...");
  const consolidatedDemandMap = new Map<string, { [monthKey: string]: number }>();
  demandMap.forEach((monthlyDemands, pairKey) => {
    const [productId, demandCenterId] = pairKey.split('---');
    let ruleRow = apiData.find(row => normalizeMaterialCode(row.CodMaterial) === productId && (String(row.Centro).trim() === demandCenterId || !row.Centro)) || apiData.find(row => normalizeMaterialCode(row.CodMaterial) === productId);
    const provisioningRule = ruleRow?.ClaseAprovisionamiento || 'E';
    const productionCenterId = provisioningRule === 'F' ? "1000" : demandCenterId;
    const consolidatedKey = `${productId}---${productionCenterId}`;
    if (!consolidatedDemandMap.has(consolidatedKey)) consolidatedDemandMap.set(consolidatedKey, {});
    const destMap = consolidatedDemandMap.get(consolidatedKey)!;
    for (const [monthKey, demand] of Object.entries(monthlyDemands)) destMap[monthKey] = (destMap[monthKey] || 0) + demand;
  });
  console.log('Paso 5: Demanda consolidada en centro de producción:', consolidatedDemandMap);

  const productionNeedsMap = new Map<string, number[]>();
  consolidatedDemandMap.forEach((monthlyDemands, pairKey) => {
      const [productId, centerId] = pairKey.split('---');
      const invSetting = inventorySettings.find(is => is.itemId === productId && is.centerId === centerId);
      const needs = Array(horizonMonths).fill(0);
      let stockAtStartOfMonth = invSetting?.currentStock || 0;
      for (let i = 0; i < horizonMonths; i++) {
          const { year, month } = planningHorizon[i];
          const monthKey = `${year}-${month}`;
          const demandThisMonth = monthlyDemands[monthKey] || 0;
          const productionNeeded = Math.max(0, demandThisMonth + (invSetting?.minStock || 0) - stockAtStartOfMonth);
          const maxAllowedByStorage = (invSetting?.maxStock === 0 || !invSetting?.maxStock) ? Infinity : invSetting.maxStock - (stockAtStartOfMonth - demandThisMonth);
          const cappedProduction = Math.max(0, Math.min(productionNeeded, maxAllowedByStorage));
          needs[i] = cappedProduction;
          stockAtStartOfMonth += cappedProduction - demandThisMonth;
      }
      productionNeedsMap.set(pairKey, needs);
  });
  console.log('Paso 6: Calculadas las necesidades de producción mensuales netas:', productionNeedsMap);
  
  const monthlyAssignments: MonthlyAssignment[] = [];
  const activeLines = productionLines.filter(l => l.isActive !== false);
  const lineMonthlyHours = new Map<string, LineHourAvailability[]>();
  activeLines.forEach(line => {
    lineMonthlyHours.set(line.id, planningHorizon.map(({ year, month }) => {
      const availability: LineHourAvailability = { regular: 0, extra: 0, holiday: 0 };
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
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
  console.log('Paso 7: Calculada la disponibilidad de horas mensuales por línea.');
  
  const monthlyOriginalNeeds = new Map<string, number>();
  productionNeedsMap.forEach((needs, pairKey) => needs.forEach((need, index) => {
      if (index < planningHorizon.length) {
          const { year, month } = planningHorizon[index];
          monthlyOriginalNeeds.set(`${pairKey}---${year}-${month}`, need);
      }
  }));

  for (let monthIndex = 0; monthIndex < horizonMonths; monthIndex++) {
    const { year, month } = planningHorizon[monthIndex];
    onProgress({ message: `Analizando capacidad mensual...`, step: 'monthly', current: monthIndex + 1, total: horizonMonths });
    
    const availableHoursThisMonth = new Map<string, LineHourAvailability>();
    lineMonthlyHours.forEach((monthlyAvail, lineId) => availableHoursThisMonth.set(lineId, { ...monthlyAvail[monthIndex] }));
    const productsToPlanThisMonth = Array.from(productionNeedsMap.entries()).filter(([_, needs]) => needs[monthIndex] > 0).map(([pairKey, needs]) => ({ pairKey, units: needs[monthIndex], ppiOptions: getPpiOptionsForProduct(pairKey.split('---')[0], pairKey.split('---')[1], constraints, apiData) })).filter(p => p.ppiOptions.length > 0).sort((a,b) => a.ppiOptions[0].totalManufacturingTimeHours - b.ppiOptions[0].totalManufacturingTimeHours);

    for(const prod of productsToPlanThisMonth) {
        let unitsLeftToPlan = prod.units;
        const [productId, centerId] = prod.pairKey.split('---');
        for (const ppi of prod.ppiOptions) {
            if (unitsLeftToPlan < 0.1) break;
            const lineAvailability = availableHoursThisMonth.get(ppi.productionLineId)!;
            const totalAvailable = lineAvailability.regular + lineAvailability.extra + lineAvailability.holiday;
            if (totalAvailable < 0.01 || ppi.totalManufacturingTimeHours <= 0) continue;
            const maxUnitsCanMake = totalAvailable / ppi.totalManufacturingTimeHours;
            const unitsToMake = Math.min(unitsLeftToPlan, maxUnitsCanMake);
            const hoursToConsume = unitsToMake * ppi.totalManufacturingTimeHours;
            const consumedHours: LineHourAvailability = { regular: 0, extra: 0, holiday: 0 };
            let remainingHoursToAssign = hoursToConsume;
             for (const hourType of HOUR_COST_ORDER) {
                const consume = Math.min(remainingHoursToAssign, lineAvailability[hourType]);
                consumedHours[hourType] += consume;
                lineAvailability[hourType] -= consume;
                remainingHoursToAssign -= consume;
                if (remainingHoursToAssign < 0.01) break;
            }
            const originalNeedKey = `${prod.pairKey}---${year}-${month}`;
            const originalNeed = monthlyOriginalNeeds.get(originalNeedKey) || 0;
            const originalUnitsToMake = Math.min(unitsToMake, originalNeed);
            monthlyOriginalNeeds.set(originalNeedKey, originalNeed - originalUnitsToMake);
            const advancedUnitsToMake = Math.max(0, unitsToMake - originalUnitsToMake);
            const line = activeLines.find(l=>l.id === ppi.productionLineId)!;
            if(unitsToMake > 0) {
              monthlyAssignments.push({ id: `${monthIndex}-${ppi.productionLineId}-${productId}-${centerId}`, monthIndex, lineId: line.id, lineName: line.name, ppiId: ppi.id, productId, centerName: line.workCenterId, demandCenterId: centerId, units: unitsToMake, originalNeedUnits: originalUnitsToMake, advancedUnits: advancedUnitsToMake, totalHours: hoursToConsume, laborCost: calculateLaborCost(consumedHours, ppi, globalBaseCostPerHour, laborCostFactors, workstationDefinitions) });
            }
            unitsLeftToPlan -= unitsToMake;
        }
        if (unitsLeftToPlan > 0.1 && monthIndex < horizonMonths - 1) {
            productionNeedsMap.get(prod.pairKey)![monthIndex + 1] += unitsLeftToPlan;
        }
    }
  }
  console.log('Paso 8: Finalizada la asignación de producción mensual a las líneas.');
  
  const productionNeeds: MonthlyNeed[] = [];
  productionNeedsMap.forEach((needs, pairKey) => {
      const [productId, centerName] = pairKey.split('---');
      needs.forEach((need, index) => {
          if (need > 0 && index < planningHorizon.length) {
              const { year, month } = planningHorizon[index];
              productionNeeds.push({ pairKey, productId, centerName, year, month, productionNeeded: need });
          }
      });
  });

  console.log('--- INICIANDO GENERACIÓN DE PLAN DIARIO ---');
  const dailyPlan: ProductionPlanItem[] = [];
  const inventoryState = new Map<string, number>();
  inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));
  
  const workingDaysByMonth = new Map<string, number>();
  planningHorizon.forEach(({year, month}) => {
      let count = 0;
      for (let day=1; day<=new Date(year, month, 0).getDate(); day++) {
          const dayType = getDayTypeForProduction(new Date(year, month-1, day), holidays);
          if (dayType === 'Weekday' || dayType === 'Saturday' || dayType === 'ProductiveHoliday') count++;
      }
      workingDaysByMonth.set(`${year}-${month}`, count);
  });
  
  const dailyDemand = new Map<string, number>();
  salesData.forEach(s => {
    const workingDays = workingDaysByMonth.get(`${s.año}-${s.mes}`);
    if (!workingDays) return;
    const demandPerDay = s.unidadesProyectado / workingDays;
    for (let day = 1; day <= new Date(s.año, s.mes, 0).getDate(); day++) {
        const d = new Date(s.año, s.mes - 1, day);
        if (getDayTypeForProduction(d, holidays) !== 'Sunday' && getDayTypeForProduction(d, holidays) !== 'NonProductiveHoliday') {
            const dayKey = `${s.año}-${s.mes}-${day}---${normalizeMaterialCode(s.código)}---${String(s.centro).trim()}`;
            dailyDemand.set(dayKey, (dailyDemand.get(dayKey) || 0) + demandPerDay);
        }
    }
  });

  for (let monthIndex = 0; monthIndex < horizonMonths; monthIndex++) {
    const { year, month } = planningHorizon[monthIndex];
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const assignmentsForMonth = monthlyAssignments.filter(a => a.monthIndex === monthIndex);
    const remainingUnitsToProduce = new Map<string, number>();
    assignmentsForMonth.forEach(a => remainingUnitsToProduce.set(a.id, a.units));
    
    const dailyDemandTotals = new Map<string, number>();
    demandMap.forEach((monthlyDemands, pairKey) => dailyDemandTotals.set(pairKey, monthlyDemands[`${year}-${month}`] || 0));
    
    for (let day = 1; day <= daysInMonth; day++) {
        onProgress({ message: `Generando plan diario para ${MONTH_NAMES[month-1]}...`, step: 'daily', current: day, total: daysInMonth });
        
        const currentDate = new Date(year, month - 1, day);
        const dayType = getDayTypeForProduction(currentDate, holidays);
        if (dayType === 'Sunday' || dayType === 'NonProductiveHoliday') continue;
        
        let hoursPerDay = (dayType === 'Weekday') ? shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay : shiftParameters.saturdayAndHolidayHours;
        const hoursByLine = new Map<string, number>();
        activeLines.forEach(line => hoursByLine.set(line.id, hoursPerDay));
        
        for (const [demandKey, demandValue] of dailyDemand.entries()) {
            const [dateKey, productId, centerId] = demandKey.split('---');
            if (dateKey === `${year}-${month}-${day}`) {
                 const stockKey = `${productId}---${centerId}`;
                 inventoryState.set(stockKey, (inventoryState.get(stockKey) || 0) - demandValue);
            }
        }
        
        const assignmentsByLine = new Map<string, MonthlyAssignment[]>();
        monthlyAssignments.filter(a => (remainingUnitsToProduce.get(a.id) || 0) > 0.1)
          .forEach(assignment => {
            if (!assignmentsByLine.has(assignment.lineId)) assignmentsByLine.set(assignment.lineId, []);
            assignmentsByLine.get(assignment.lineId)!.push(assignment);
        });

        for (const [lineId, assignments] of assignmentsByLine.entries()) {
            let hoursRemainingTodayForLine = hoursByLine.get(lineId) || 0;
            const sequencedAssignments = sequenceDailyProduction(assignments.filter(a => (remainingUnitsToProduce.get(a.id) || 0) > 0.1), inventoryState, dailyDemand, currentDate, dailyDemandTotals);
            
            for (const assignment of sequencedAssignments) {
                if (hoursRemainingTodayForLine <= 0.01) break;
                
                const unitsLeftForAssignment = remainingUnitsToProduce.get(assignment.id) || 0;
                if (unitsLeftForAssignment <= 0.1) continue;

                const manufacturingTime = assignment.totalHours / assignment.units;
                if(manufacturingTime <= 0) continue;
                
                const invSetting = inventorySettings.find(i => i.itemId === assignment.productId && i.centerId === assignment.centerName);
                
                let unitsToProduce = Math.min(unitsLeftForAssignment, hoursRemainingTodayForLine / manufacturingTime);
                
                if (invSetting && unitsToProduce > 0 && unitsToProduce < invSetting.lotMin) {
                  if (hoursRemainingTodayForLine >= (invSetting.lotMin * manufacturingTime)) {
                      unitsToProduce = Math.min(unitsLeftForAssignment, invSetting.lotMin);
                  } else {
                      continue; 
                  }
                }
                
                unitsToProduce = Math.floor(unitsToProduce);

                if (unitsToProduce < 0.1) continue;

                const hoursConsumed = unitsToProduce * manufacturingTime;
                if (hoursConsumed > hoursRemainingTodayForLine) continue;

                const prodStockKey = `${assignment.productId}---${assignment.centerName}`;
                const initialStockOnDay = inventoryState.get(prodStockKey) || 0;
                
                remainingUnitsToProduce.set(assignment.id, unitsLeftForAssignment - unitsToProduce);
                hoursRemainingTodayForLine -= hoursConsumed;
                
                inventoryState.set(prodStockKey, initialStockOnDay + unitsToProduce);

                const demandKey = `${year}-${month}-${day}---${assignment.productId}---${assignment.demandCenterId}`;
                const demandOnDay = dailyDemand.get(demandKey) || 0;
                const isTransfer = assignment.centerName !== assignment.demandCenterId;

                dailyPlan.push({
                    id: `${year}-${month}-${day}-${assignment.productId}-${lineId}-${Math.random()}`, year, month, day, week: 0, productId: assignment.productId,
                    productName: productNamesMap.get(assignment.productId) || assignment.productId,
                    quantityToProduce: unitsToProduce,
                    demandOnDay: demandOnDay,
                    initialStockOnDay: initialStockOnDay,
                    finalStockOnDay: initialStockOnDay + unitsToProduce - demandOnDay, 
                    assignedLineId: lineId, producingCenterId: assignment.centerName, demandCenterId: assignment.demandCenterId,
                    estimatedLaborCost: (assignment.laborCost / assignment.units) * unitsToProduce, 
                    hoursWorked: hoursConsumed,
                    status: isTransfer ? 'Transferencia' : 'Planificado', notes: '', isTransfer: isTransfer,
                    transferSourceCenterId: isTransfer ? assignment.centerName : undefined,
                    transferDestinationCenterId: isTransfer ? assignment.demandCenterId : undefined,
                });
            }
             hoursByLine.set(lineId, hoursRemainingTodayForLine);
        }
    }
  }

  const aggregatedMonthlyPlan = new Map<string, MonthlyProductionPlanItem>();
  dailyPlan.forEach(item => {
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
  
  onProgress(null);
  return { 
    finalPlan: { dailyPlan, monthlyPlan: Array.from(aggregatedMonthlyPlan.values()), auditLog: [] },
    details: { planningGroupDetails, productionNeeds, monthlyAssignments },
  };
};

export const exportDailyPlanToExcel = (plan: ProductionPlanItem[], constraints: AppConstraints): void => {
  if (!plan) return;
  const dailyDataToExport = plan.map(item => ({
    'Año': item.year, 'Mes': MONTH_NAMES[item.month - 1], 'Día': item.day, 'Producto (Cód)': item.productId,
    'Nombre Producto': item.productName, 'Stock Inicial': Math.round(item.initialStockOnDay),
    'Demanda Diaria': Math.round(item.demandOnDay), 'Producción/Transfer': Math.round(item.quantityToProduce),
    'Stock Final': Math.round(item.finalStockOnDay), 'Centro Prod.': item.producingCenterId,
    'Centro Demanda': item.demandCenterId,
    'Línea': constraints.productionLines.find(l => l.id === item.assignedLineId)?.name || item.assignedLineId,
    'Horas fabricación': parseFloat(item.hoursWorked.toFixed(2)),
    'Costo Labor Est.': parseFloat(item.estimatedLaborCost.toFixed(2)), 'Estado': item.status, 'Notas': item.notes || ''
  }));
  const dailyWorksheet = XLSX.utils.json_to_sheet(dailyDataToExport);
  dailyWorksheet['!cols'] = [ { wch: 6 }, { wch: 10 }, { wch: 5 }, { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, {wch: 15}, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 50 }, ];
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

