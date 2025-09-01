

import { 
    SalesDataRow, AppConstraints, ProductionPlan, ProductionPlanItem, 
    ProductProcessInfo, WorkCenter, ProductionLine, LaborCostSettings, InventorySetting, Holiday,
    MonthlyInventoryState, ProcessType, WorkstationDefinition,
    SupplyInfo, MonthlyProductionPlanItem, NotificationMessage, LineMonthlySummary, 
    TacticalRequest, TacticalPlanResult, TacticalOrderItem, ProvisionalOrder, Employee, EmployeeSkill, MaintenanceEvent, AbsenteeismEvent, AssignedPersonnel, ShiftParameters,
    Machine, Qualification, TiempoEnsambleItem, DetailedProductionPlan, PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment, DailyPlanContext 
} from '@/types/types';
import { MONTH_NAMES, PROCESS_TYPE_OPTIONS } from '@/constants/constants'; 


// XLSX type will be available globally from CDN script in index.html
declare var XLSX: any; 

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    // Return the last 8 characters, which is the clean product code.
    return codeStr.slice(-8);
};

/**
 * Discovers the production structure (Centers, Lines, Workstations) from API data,
 * validates it, and processes it into the application's constraint format.
 */
export function processAndValidateAssemblyData(
    apiData: TiempoEnsambleItem[],
    currentConstraints: AppConstraints,
    salesData: SalesDataRow[] 
): {
    newConstraints: AppConstraints,
    validationErrors: string[],
    dataCompletenessErrors: string[]
} {
    const validationErrors: string[] = [];
    const dataCompletenessErrors: string[] = [];
    
    // --- 1. Data Completeness Check on Raw API Data ---
    apiData.forEach((row, index) => {
        if (!row.CodMaterial) dataCompletenessErrors.push(`Fila API ${index + 1}: Falta 'CodMaterial'.`);
        if (!row.Centro) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'Centro'.`);
        if (!row.Linea) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'Linea'.`);
        if (!row.PuestoTrabajo) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'PuestoTrabajo'.`);
        if (row.Tiempo === null || row.Tiempo === undefined) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'Tiempo'.`);
    });

    if (dataCompletenessErrors.length > 0) {
        return { newConstraints: currentConstraints, validationErrors, dataCompletenessErrors };
    }

    // --- 2. Discover and Create Structure from API Data, preserving manual overrides ---
    const discoveredWorkCenters = new Map<string, WorkCenter>();
    const discoveredLines = new Map<string, ProductionLine>();
    const discoveredWorkstations = new Map<string, WorkstationDefinition>();

    // Pre-load existing manual settings to preserve them
    const existingWorkstations = new Map(currentConstraints.workstationDefinitions.map(wd => [wd.id, wd]));
    const existingLines = new Map(currentConstraints.productionLines.map(pl => [pl.id, pl]));

    apiData.forEach(row => {
        const centerId = String(row.Centro).trim();
        const lineName = String(row.Linea).trim();
        const workstationName = String(row.PuestoTrabajo).trim();

        // Work Center
        if (!discoveredWorkCenters.has(centerId)) {
            discoveredWorkCenters.set(centerId, {
                id: centerId, 
                name: centerId,
                productionLineIds: [], 
                isActive: true
            });
        }
        
        // Workstation Definition (ID = Center + Name)
        const workstationId = `wd---${centerId}---${workstationName}`;
        if (!discoveredWorkstations.has(workstationId)) {
            const existingWd = existingWorkstations.get(workstationId);
            discoveredWorkstations.set(workstationId, {
                id: workstationId,
                name: workstationName,
                employeesPerWorkstation: existingWd?.employeesPerWorkstation || 1,
                machineCode: existingWd?.machineCode || null,
                isActive: true
            });
        }
        
        // Production Line (ID = Center + Name)
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
        if(!discoveredWorkCenters.get(centerId)!.productionLineIds.includes(line.id)){
            discoveredWorkCenters.get(centerId)!.productionLineIds.push(line.id);
        }

        if (!line.assignedWorkstations.some(as => as.definitionId === workstationId)) {
             const existingAssignment = existingLines.get(lineId)?.assignedWorkstations.find(as => as.definitionId === workstationId);
             line.assignedWorkstations.push({ 
                definitionId: workstationId, 
                quantity: existingAssignment?.quantity || 1
            });
        }
    });

    // --- 3. Create Final Process and Inventory Info ---
    const productNamesMap = new Map<string, string>();
    salesData.forEach(row => {
        const normalizedProductId = normalizeMaterialCode(row.código);
        if (!productNamesMap.has(normalizedProductId)) {
            productNamesMap.set(normalizedProductId, row.descripciónMaterial || row.etiqueta || String(row.código));
        }
    });

    const processInfoAggregator = new Map<string, ProductProcessInfo>();
    const inventoryMap = new Map<string, InventorySetting>();
    
    apiData.forEach(row => {
        const centerId = String(row.Centro).trim();
        const lineName = String(row.Linea).trim();
        const lineId = `pl---${centerId}---${lineName}`;
        const normalizedProductId = normalizeMaterialCode(row.CodMaterial);

        const line = discoveredLines.get(lineId)!;
        if (line && !line.materialsHandled.includes(normalizedProductId)) {
            line.materialsHandled.push(normalizedProductId);
        }
        
        const invKey = `${normalizedProductId}---${centerId}`;
        if (!inventoryMap.has(invKey)) {
            inventoryMap.set(invKey, {
                id: invKey,
                itemId: normalizedProductId,
                itemName: productNamesMap.get(normalizedProductId) || normalizedProductId,
                centerId: centerId,
                isRawMaterial: false,
                minStock: parseInt(String(row.StockSeguridad || 0), 10),
                maxStock: parseInt(String(row.StockMaximo || 0), 10),
                currentStock: parseInt(String(row.SaldoInicial || 0), 10),
            });
        }
    });

    // --- 4. Assemble the new constraints object ---
    const newConstraints: AppConstraints = {
        ...currentConstraints, // Preserve manual settings like costs, holidays
        workCenters: Array.from(discoveredWorkCenters.values()),
        productionLines: Array.from(discoveredLines.values()),
        workstationDefinitions: Array.from(discoveredWorkstations.values()),
        productProcessInfos: [], // This will be generated dynamically inside the planner
        inventorySettings: Array.from(inventoryMap.values()),
    };

    return {
        newConstraints,
        validationErrors: [],
        dataCompletenessErrors: []
    };
}

type DayProductionType = 'Weekday' | 'Saturday' | 'Sunday' | 'ProductiveHoliday' | 'NonProductiveHoliday';

const getDayTypeForProduction = (date: Date, holidays: Holiday[]): DayProductionType => {
    const yyyyMmDd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const holidayInfo = holidays.find(h => h.date === yyyyMmDd);

    if (holidayInfo && (holidayInfo.appliesTo === 'Produccion' || holidayInfo.appliesTo === 'Ambos')) {
        return holidayInfo.isProductionAllowed ? 'ProductiveHoliday' : 'NonProductiveHoliday';
    }

    const dayOfWeek = date.getDay(); // 0 (Sun) to 6 (Sat)
    if (dayOfWeek === 0) return 'Sunday';
    if (dayOfWeek === 6) return 'Saturday';
    return 'Weekday'; // Mon-Fri
};

type HourType = 'regular' | 'extra' | 'holiday';
type LineHourAvailability = Record<HourType, number>;
const HOUR_COST_ORDER: HourType[] = ['regular', 'extra', 'holiday'];


function calculateLaborCost(
    consumedHours: LineHourAvailability,
    ppi: ProductProcessInfo,
    baseCostPerHour: number | null,
    costFactors: LaborCostSettings | null,
    workstationDefs: WorkstationDefinition[]
): number {
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

const calculateEffectiveManufacturingTime = (
    productId: string,
    line: ProductionLine,
    apiData: TiempoEnsambleItem[],
    workstationDefs: WorkstationDefinition[],
): number => {
    
    let maxTime = 0;
    
    for (const assignedWorkstation of line.assignedWorkstations) {
        const workstationDef = workstationDefs.find(wd => wd.id === assignedWorkstation.definitionId);
        if(!workstationDef) continue;
        
        const apiRow = apiData.find(d => 
            normalizeMaterialCode(d.CodMaterial) === productId &&
            String(d.Centro).trim() === line.workCenterId &&
            String(d.Linea).trim() === line.name &&
            String(d.PuestoTrabajo).trim() === workstationDef.name
        );
        
        if (apiRow && apiRow.Tiempo > 0) {
            const timeHours = apiRow.Tiempo / 60;
            const effectiveTime = timeHours / assignedWorkstation.quantity;
            if(effectiveTime > maxTime) {
                maxTime = effectiveTime;
            }
        }
    }

    return maxTime > 0 ? maxTime : Infinity;
};


function getPpiOptionsForProduct(
    productId: string,
    demandCenterId: string,
    constraints: AppConstraints,
    apiData: TiempoEnsambleItem[],
    auditLog: string[]
): ProductProcessInfo[] {
    const { productionLines, workstationDefinitions } = constraints;
    const ppiCandidates: ProductProcessInfo[] = [];

    // Find the provisioning rule for the product in the demanding center.
    const ruleRow = apiData.find(row => 
        normalizeMaterialCode(row.CodMaterial) === productId && 
        String(row.Centro).trim() === demandCenterId
    );
    const provisioningRule = ruleRow?.ClaseAprovisionamiento || 'E'; // Default to 'E' if not found

    let allowedProductionCenters: string[];
    const allCenterIds = Array.from(new Set(productionLines.map(l => l.workCenterId)));


    switch(provisioningRule) {
        case 'E': // Must be produced in the same center
            allowedProductionCenters = [demandCenterId];
            break;
        case 'F': // Must be sourced from a different center.
            // Specific business rule: if demand is at 2000, source from 1000
            if (demandCenterId === '2000') {
                allowedProductionCenters = ['1000'];
            } else {
                 // General case for F: any center EXCEPT the demanding one.
                allowedProductionCenters = allCenterIds.filter(id => id !== demandCenterId);
            }
            break;
        case 'X': // Can be produced in any center
        default:
            allowedProductionCenters = allCenterIds;
            break;
    }

    // Find all lines in the allowed centers that can produce this product
    const allCapableLines = productionLines.filter(line => 
        allowedProductionCenters.includes(line.workCenterId) &&
        apiData.some(row => 
            normalizeMaterialCode(row.CodMaterial) === productId &&
            String(row.Centro).trim() === line.workCenterId &&
            String(row.Linea).trim() === line.name
        )
    );

    if (allCapableLines.length === 0) {
        auditLog.push(`Info: Producto ${productId} (Demanda en ${demandCenterId}, Regla: ${provisioningRule}) no tiene líneas de producción válidas en los centros permitidos: [${allowedProductionCenters.join(', ')}].`);
        return [];
    }

    allCapableLines.forEach(line => {
        const manufacturingTime = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions);

        if (manufacturingTime < Infinity) {
            const ppiId = `${productId}---${line.id}`;
            const workstationTimes = line.assignedWorkstations.map(as => {
                 const workstationDef = workstationDefinitions.find(wd => wd.id === as.definitionId)!;
                 const apiRow = apiData.find(d => 
                    normalizeMaterialCode(d.CodMaterial) === productId &&
                    String(d.Centro).trim() === line.workCenterId &&
                    String(d.Linea).trim() === line.name &&
                    String(d.PuestoTrabajo).trim() === workstationDef.name
                );
                return {
                    workstationDefinitionId: as.definitionId,
                    timeHours: (apiRow?.Tiempo || 0) / 60
                };
            }).filter(wt => wt.timeHours > 0);

            ppiCandidates.push({
                id: ppiId,
                productId: productId,
                productionLineId: line.id,
                workstationTimes: workstationTimes,
                totalManufacturingTimeHours: manufacturingTime,
            });
        }
    });

    // Sort by manufacturing time (most efficient first)
    ppiCandidates.sort((a, b) => a.totalManufacturingTimeHours - b.totalManufacturingTimeHours);
    
    return ppiCandidates;
}


// ==========================================================================================
// --- PASO 4: Daily Plan Generation (Rebuilt Logic) ---
// ==========================================================================================

function getLineBottleneckRate(
    ppi: ProductProcessInfo,
    line: ProductionLine,
    workstationDefs: WorkstationDefinition[],
    auditLog: string[]
): number {
    if (ppi.totalManufacturingTimeHours > 0 && ppi.totalManufacturingTimeHours < Infinity) {
        return 1 / ppi.totalManufacturingTimeHours;
    }
    return 0;
}


function sequenceDailyProduction(
    dailyGoals: DailyPlanContext[],
    line: ProductionLine,
    constraints: AppConstraints,
    auditLog: string[]
): DailyPlanContext[] {
    if (dailyGoals.length <= 1) {
        return dailyGoals;
    }

    const bottleneckRates = new Map<string, number>();
    dailyGoals.forEach(goal => {
        const ppi = { // Reconstruct a temporary PPI for the function
            id: goal.ppiId,
            productId: goal.productId,
            productionLineId: goal.lineId,
            workstationTimes: [], // Not needed for this calc
            totalManufacturingTimeHours: goal.totalHours / goal.units
        }
        const rate = getLineBottleneckRate(ppi, line, constraints.workstationDefinitions, auditLog);
        bottleneckRates.set(goal.ppiId, rate);
    });

    dailyGoals.sort((a, b) => {
        const rateA = bottleneckRates.get(a.ppiId) || 0;
        const rateB = bottleneckRates.get(b.ppiId) || 0;
        
        if (rateA !== rateB) {
            return rateB - rateA;
        }

        return b.dailyGoal - a.dailyGoal;
    });

    return dailyGoals;
}


export const generateProductionPlan = async (
  salesData: SalesDataRow[],
  constraints: AppConstraints,
  apiData: TiempoEnsambleItem[] // Pass the raw assembly data here
): Promise<DetailedProductionPlan> => {
  const auditLog: string[] = [];
  const { inventorySettings, holidays, workCenters, productionLines, globalBaseCostPerHour, laborCostFactors, workstationDefinitions, shiftParameters } = constraints;
  
  if (!salesData || salesData.length === 0) {
      auditLog.push('Error: No hay datos de ventas para procesar.');
      return { finalPlan: { dailyPlan: [], monthlyPlan: [], auditLog }, planningGroupDetails: [], productionNeeds: [], monthlyAssignments: [] };
  }
  
  const planningHorizon: { year: number, month: number }[] = [];
  if (salesData.length > 0) {
    const dates = salesData.map(s => new Date(s.año, s.mes - 1, 1).getTime());
    const firstSaleDate = new Date(Math.min(...dates));
    const lastSaleDate = new Date(Math.max(...dates));
    let currentHorizonDate = new Date(firstSaleDate);
    while(currentHorizonDate <= lastSaleDate) {
        planningHorizon.push({ year: currentHorizonDate.getFullYear(), month: currentHorizonDate.getMonth() + 1 });
        currentHorizonDate.setMonth(currentHorizonDate.getMonth() + 1);
    }
  }
  auditLog.push(`Horizonte de planificación: ${planningHorizon.length} meses.`);

  const demandMap = new Map<string, { [monthKey: string]: number }>();
  salesData.forEach(s => {
      const normalizedProductId = normalizeMaterialCode(s.código);
      const centerId = String(s.centro).trim();
      const pairKey = `${normalizedProductId}---${centerId}`;

      if (!demandMap.has(pairKey)) {
          demandMap.set(pairKey, {});
      }

      const monthKey = `${s.año}-${s.mes}`;
      const currentDemand = demandMap.get(pairKey)![monthKey] || 0;
      demandMap.get(pairKey)![monthKey] = currentDemand + s.unidadesProyectado;
  });

  const planningGroupDetails: PlanningGroupMonthlyDetail[] = [];
  demandMap.forEach((monthlyDemands, pairKey) => {
      const [productId, centerId] = pairKey.split('---');
      
      const ppiOptions = getPpiOptionsForProduct(productId, centerId, constraints, apiData, auditLog);
      if (ppiOptions.length === 0) {
          auditLog.push(`Info: Producto ${productId} en centro de demanda ${centerId} no tiene opciones de fabricación. Descartado.`);
          return;
      }
      
      Object.entries(monthlyDemands).forEach(([monthKey, demand]) => {
          if (demand > 0) {
              const [yearStr, monthStr] = monthKey.split('-');
              const year = parseInt(yearStr);
              const month = parseInt(monthStr);

              // Correctly find the inventory setting for the product in its demand center.
              const invSetting = inventorySettings.find(is => is.itemId === productId && is.centerId === centerId);
              
              planningGroupDetails.push({
                  pairKey,
                  productId,
                  centerName: centerId,
                  year,
                  month,
                  demand,
                  initialStock: invSetting?.currentStock || 0,
                  minStock: invSetting?.minStock || 0,
              });
          }
      });
  });

  auditLog.push(`Se han consolidado ${planningGroupDetails.length} grupos de planificación (producto-centro-mes).`);
  
  const productionNeedsMap = new Map<string, number[]>();
  demandMap.forEach((monthlyDemands, pairKey) => {
       const [productId, centerId] = pairKey.split('---');
      if(getPpiOptionsForProduct(productId, centerId, constraints, apiData, auditLog).length === 0) return;

      const invSetting = inventorySettings.find(is => is.itemId === productId && is.centerId === centerId);
      const initialStock = invSetting?.currentStock || 0;
      const minStock = invSetting?.minStock || 0;
      const maxStock = invSetting?.maxStock === 0 || !invSetting?.maxStock ? Infinity : invSetting.maxStock;
      
      const needs = Array(planningHorizon.length).fill(0);
      let stockAtStartOfMonth = initialStock;

      for (let i = 0; i < planningHorizon.length; i++) {
          const { year, month } = planningHorizon[i];
          const monthKey = `${year}-${month}`;
          const demandThisMonth = monthlyDemands[monthKey] || 0;
          const productionNeeded = Math.max(0, demandThisMonth + minStock - stockAtStartOfMonth);
          const maxAllowedByStorage = (maxStock === Infinity) ? Infinity : maxStock - (stockAtStartOfMonth - demandThisMonth);
          const cappedProduction = Math.max(0, Math.min(productionNeeded, maxAllowedByStorage));
          needs[i] = cappedProduction;
          stockAtStartOfMonth += cappedProduction - demandThisMonth;
      }
      productionNeedsMap.set(pairKey, needs);
  });
  
  const productionNeeds: MonthlyNeed[] = [];
  productionNeedsMap.forEach((needs, pairKey) => {
      const [productId, centerName] = pairKey.split('---');
      needs.forEach((need, index) => {
          if (need > 0) {
              const { year, month } = planningHorizon[index];
              productionNeeds.push({
                  pairKey,
                  productId,
                  centerName,
                  year,
                  month,
                  productionNeeded: need,
              });
          }
      });
  });

  const monthlyAssignments: MonthlyAssignment[] = [];
  const activeLines = productionLines.filter(l => l.isActive !== false);
  const lineMonthlyHours = new Map<string, LineHourAvailability[]>();
  activeLines.forEach(line => {
    lineMonthlyHours.set(line.id, planningHorizon.map(({ year, month }) => {
      const availability: LineHourAvailability = { regular: 0, extra: 0, holiday: 0 };
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        const dayType = getDayTypeForProduction(d, holidays);
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
  
  const monthlyOriginalNeeds = new Map<string, number>();
  productionNeeds.forEach(need => {
      const key = `${need.pairKey}---${need.year}-${need.month}`;
      monthlyOriginalNeeds.set(key, need.productionNeeded);
  });

  for (let monthIndex = 0; monthIndex < planningHorizon.length; monthIndex++) {
    await new Promise(resolve => setTimeout(resolve, 0)); // Unblock UI thread
    const availableHoursThisMonth = new Map<string, LineHourAvailability>();
    lineMonthlyHours.forEach((monthlyAvail, lineId) => availableHoursThisMonth.set(lineId, { ...monthlyAvail[monthIndex] }));
    
    const productsToPlanThisMonth = Array.from(productionNeedsMap.entries())
        .filter(([_, needs]) => needs[monthIndex] > 0)
        .map(([pairKey, needs]) => {
            const [productId, centerId] = pairKey.split('---');
            const ppiOptions = getPpiOptionsForProduct(productId, centerId, constraints, apiData, auditLog);
            return { pairKey, units: needs[monthIndex], ppiOptions };
        })
        .filter(p => p.ppiOptions.length > 0)
        .sort((a,b) => a.ppiOptions[0].totalManufacturingTimeHours - b.ppiOptions[0].totalManufacturingTimeHours);

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

            const { year, month } = planningHorizon[monthIndex];
            const originalNeedKey = `${prod.pairKey}---${year}-${month}`;
            const originalNeed = monthlyOriginalNeeds.get(originalNeedKey) || 0;
            const originalUnitsToMake = Math.min(unitsToMake, originalNeed);
            monthlyOriginalNeeds.set(originalNeedKey, originalNeed - originalUnitsToMake);
            const advancedUnitsToMake = Math.max(0, unitsToMake - originalUnitsToMake);


            const laborCost = calculateLaborCost(consumedHours, ppi, globalBaseCostPerHour, laborCostFactors, workstationDefinitions);
            const line = activeLines.find(l=>l.id === ppi.productionLineId)!;
            const productName = salesData.find(d => normalizeMaterialCode(d.código) === productId)?.descripciónMaterial || productId;

            monthlyAssignments.push({
                id: `${monthIndex}-${ppi.productionLineId}-${productId}-${centerId}`,
                monthIndex,
                lineId: line.id,
                lineName: line.name,
                ppiId: ppi.id,
                productId,
                centerName: line.workCenterId, // The production happens at the line's center
                units: unitsToMake,
                originalNeedUnits: originalUnitsToMake,
                advancedUnits: advancedUnitsToMake,
                totalHours: hoursToConsume,
                laborCost: laborCost
            });

            unitsLeftToPlan -= unitsToMake;
        }
        if (unitsLeftToPlan > 0.1 && monthIndex > 0) {
            productionNeedsMap.get(prod.pairKey)![monthIndex-1] += unitsLeftToPlan;
        }
    }
  }

  // --- Daily Plan Generation ---
  const dailyPlan: ProductionPlanItem[] = [];
  const monthlyPlan: MonthlyProductionPlanItem[] = [];
  const inventoryState = new Map<string, number>(); // Key: "productId---centerId"
  inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));

  for (let monthIndex = 0; monthIndex < planningHorizon.length; monthIndex++) {
    const { year, month } = planningHorizon[monthIndex];
    const assignmentsForMonth = monthlyAssignments.filter(a => a.monthIndex === monthIndex);
    
    // Group assignments by line to prepare for daily planning
    const monthlyLineGoals = new Map<string, DailyPlanContext[]>();
    for (const assignment of assignmentsForMonth) {
        if (!monthlyLineGoals.has(assignment.lineId)) {
            monthlyLineGoals.set(assignment.lineId, []);
        }
        monthlyLineGoals.get(assignment.lineId)!.push({
            ...assignment,
            remainingUnits: assignment.units,
            dailyGoal: 0 // Will be calculated below
        });
    }

    const daysInMonth = new Date(year, month, 0).getDate();
    const workingDaysInMonth = Array.from({ length: daysInMonth }, (_, i) => getDayTypeForProduction(new Date(year, month - 1, i + 1), holidays))
        .filter(type => type === 'Weekday' || type === 'Saturday' || type === 'ProductiveHoliday').length;

    if (workingDaysInMonth === 0) continue;
    
    // Set proportional daily goal
    monthlyLineGoals.forEach(goals => {
        goals.forEach(goal => {
            goal.dailyGoal = goal.units / workingDaysInMonth;
        });
    });

    for (let day = 1; day <= daysInMonth; day++) {
        await new Promise(resolve => setTimeout(resolve, 0)); // Unblock UI thread
        const currentDate = new Date(year, month - 1, day);
        const dayType = getDayTypeForProduction(currentDate, holidays);
        if (dayType === 'Sunday' || dayType === 'NonProductiveHoliday') continue;

        let hoursPerDay: number;
        if (dayType === 'Weekday') hoursPerDay = shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay;
        else hoursPerDay = shiftParameters.saturdayAndHolidayHours;

        for (const [lineId, goals] of monthlyLineGoals.entries()) {
            const line = activeLines.find(l => l.id === lineId)!;
            let hoursRemainingToday = hoursPerDay;

            const sequencedGoals = sequenceDailyProduction(goals.filter(g => g.remainingUnits > 0.1), line, constraints, auditLog);

            for (const goal of sequencedGoals) {
                if (hoursRemainingToday <= 0.01) break;
                
                const manufacturingTime = goal.totalHours / goal.units;
                if(manufacturingTime <= 0) continue;

                const maxUnitsInTime = hoursRemainingToday / manufacturingTime;
                const unitsToProduce = Math.min(goal.remainingUnits, goal.dailyGoal, maxUnitsInTime);
                
                if (unitsToProduce < 0.1) continue;

                const hoursConsumed = unitsToProduce * manufacturingTime;
                
                const demandCenterInfo = planningGroupDetails.find(d => d.productId === goal.productId); // Find the original demand center
                const demandCenterId = demandCenterInfo?.centerName || goal.centerName; // Fallback to production center
                const stockKey = `${goal.productId}---${demandCenterId}`;
                const initialStockOnDay = inventoryState.get(stockKey) || 0;
                
                const demandOnDay = (salesData
                    .filter(s => s.año === year && s.mes === month && normalizeMaterialCode(s.código) === goal.productId && String(s.centro).trim() === demandCenterId)
                    .reduce((sum, s) => sum + s.unidadesProyectado, 0)
                ) / workingDaysInMonth;

                // Update stock in the production center first
                const prodCenterStockKey = `${goal.productId}---${goal.centerName}`;
                const currentProdCenterStock = inventoryState.get(prodCenterStockKey) || 0;
                inventoryState.set(prodCenterStockKey, currentProdCenterStock + unitsToProduce);

                let finalStockOnDay = initialStockOnDay;
                if (goal.centerName === demandCenterId) {
                    finalStockOnDay = currentProdCenterStock + unitsToProduce - demandOnDay;
                    inventoryState.set(stockKey, finalStockOnDay);
                } else {
                    // This implies a transfer happened, which needs to be modeled
                    const currentDemandCenterStock = inventoryState.get(stockKey) || 0;
                    finalStockOnDay = currentDemandCenterStock - demandOnDay;
                    inventoryState.set(stockKey, finalStockOnDay);
                }
                
                const productName = salesData.find(d => normalizeMaterialCode(d.código) === goal.productId)?.descripciónMaterial || goal.productId;

                dailyPlan.push({
                    id: `${year}-${month}-${day}-${goal.productId}-${line.id}`,
                    year, month, day, week: 0,
                    productId: goal.productId,
                    productName: productName,
                    quantityToProduce: unitsToProduce,
                    demandOnDay, initialStockOnDay, finalStockOnDay,
                    assignedLineId: line.id,
                    producingCenterId: goal.centerName,
                    estimatedLaborCost: (goal.laborCost / goal.units) * unitsToProduce, 
                    hoursWorked: hoursConsumed,
                    status: 'Planificado',
                    notes: '',
                });

                goal.remainingUnits -= unitsToProduce;
                hoursRemainingToday -= hoursConsumed;
            }
        }
    }
  }

  // Aggregate monthly plan from daily results
  const aggregatedMonthlyPlan = new Map<string, MonthlyProductionPlanItem>();
  dailyPlan.forEach(item => {
    const key = `${item.year}-${item.month}-${item.productId}-${item.producingCenterId}`;
    let entry = aggregatedMonthlyPlan.get(key);
    if (!entry) {
        const productName = salesData.find(d => normalizeMaterialCode(d.código) === item.productId)?.descripciónMaterial || item.productId;
        entry = {
            id: key,
            year: item.year, month: item.month,
            productId: item.productId, productName: productName,
            producingCenterId: item.producingCenterId,
            totalQuantityToProduce: 0, totalHoursWorked: 0, totalEstimatedLaborCost: 0
        };
    }
    entry.totalQuantityToProduce += item.quantityToProduce;
    entry.totalHoursWorked += item.hoursWorked;
    entry.totalEstimatedLaborCost += item.estimatedLaborCost;
    aggregatedMonthlyPlan.set(key, entry);
  });
  
  return { 
    finalPlan: { dailyPlan, monthlyPlan: Array.from(aggregatedMonthlyPlan.values()), auditLog },
    planningGroupDetails,
    productionNeeds,
    monthlyAssignments,
  };
};

export const exportDailyPlanToExcel = (
  plan: ProductionPlanItem[],
  constraints: AppConstraints,
): void => {
  if (!plan) return;

  // --- Sheet 1: Daily Plan ---
  const dailyDataToExport = plan.map(item => ({
    'Año': item.year,
    'Mes': MONTH_NAMES[item.month - 1],
    'Día': item.day,
    'Producto (Cód)': item.productId,
    'Nombre Producto': item.productName,
    'Stock Inicial': Math.round(item.initialStockOnDay),
    'Demanda Diaria': Math.round(item.demandOnDay),
    'Producción Diaria': Math.round(item.quantityToProduce),
    'Stock Final': Math.round(item.finalStockOnDay),
    'Centro Prod.': item.producingCenterId,
    'Línea': item.assignedLineId,
    'Horas fabricación': parseFloat(item.hoursWorked.toFixed(2)),
    'Costo Labor Est.': parseFloat(item.estimatedLaborCost.toFixed(2)),
    'Estado': item.status,
    'Notas': item.notes || ''
  }));

  const dailyWorksheet = XLSX.utils.json_to_sheet(dailyDataToExport);
  const dailyColWidths = [
    { wch: 6 }, { wch: 10 }, { wch: 5 }, { wch: 15 }, { wch: 30 }, 
    { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 20 }, 
    { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 50 },
  ];
  dailyWorksheet['!cols'] = dailyColWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dailyWorksheet, 'Plan de Producción Diario');
  
  XLSX.writeFile(workbook, 'Plan_Produccion_Diario.xlsx');
};

export const exportMonthlyPlanToExcel = (plan: MonthlyProductionPlanItem[]): void => {
    if (!plan) return;
    const dataToExport = plan.map(item => ({
        'Año': item.year,
        'Mes': MONTH_NAMES[item.month - 1],
        'Producto (Cód)': item.productId,
        'Nombre Producto': item.productName,
        'Centro Prod.': item.producingCenterId || 'N/A',
        'Producción Total': Math.round(item.totalQuantityToProduce),
        'Horas Totales': parseFloat(item.totalHoursWorked.toFixed(2)),
        'Costo Labor Total Est.': parseFloat(item.totalEstimatedLaborCost.toFixed(2)),
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const colWidths = [ { wch: 6 }, { wch: 10 }, { wch: 15 }, { wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 22 } ];
    worksheet['!cols'] = colWidths;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plan Mensual');
    XLSX.writeFile(workbook, 'Plan_Produccion_Mensual.xlsx');
};

const parseDateFromExcel = (dateValue: any): string | null => { return null; };
export const parseTacticalOrdersExcel = (file: File): Promise<ProvisionalOrder[]> => { return Promise.resolve([]); };

export const generateTacticalPlan = ( request: TacticalRequest, context: any ): TacticalPlanResult => { return { plan: [], alerts: [] }; };

export const exportSkillsToExcel = ( employees: Employee[], skills: EmployeeSkill[], machines: Machine[], constraints: AppConstraints ): void => {};

    