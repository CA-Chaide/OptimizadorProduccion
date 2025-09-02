

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
    
    const productCenterDataMap = new Map<string, TiempoEnsambleItem>();
    apiData.forEach(row => {
        const key = `${normalizeMaterialCode(row.CodMaterial)}---${String(row.Centro).trim()}`;
        // Prioritize rows that seem more complete, but simple assignment is fine for now
        productCenterDataMap.set(key, row);

        const centerId = String(row.Centro).trim();
        const lineName = String(row.Linea).trim();
        const lineId = `pl---${centerId}---${lineName}`;
        const line = discoveredLines.get(lineId);
        if (line && !line.materialsHandled.includes(normalizeMaterialCode(row.CodMaterial))) {
            line.materialsHandled.push(normalizeMaterialCode(row.CodMaterial));
        }
    });

    const inventorySettings: InventorySetting[] = [];
    productCenterDataMap.forEach((row, key) => {
        const [productId, centerId] = key.split('---');
        inventorySettings.push({
            id: key,
            itemId: productId,
            itemName: productNamesMap.get(productId) || productId,
            centerId: centerId,
            isRawMaterial: false,
            minStock: parseInt(String(row.StockSeguridad || 0), 10),
            maxStock: parseInt(String(row.StockMaximo || 0), 10),
            currentStock: parseInt(String(row.StockActual || 0), 10),
        });
    });


    // --- 4. Assemble the new constraints object ---
    const newConstraints: AppConstraints = {
        ...currentConstraints, // Preserve manual settings like costs, holidays
        workCenters: Array.from(discoveredWorkCenters.values()),
        productionLines: Array.from(discoveredLines.values()),
        workstationDefinitions: Array.from(discoveredWorkstations.values()),
        productProcessInfos: [], // This will be generated dynamically inside the planner
        inventorySettings: inventorySettings, 
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
    let totalTime = 0;
    
    // Iterate over all workstation definitions required by the line
    for (const assignedWorkstation of line.assignedWorkstations) {
        const workstationDef = workstationDefs.find(wd => wd.id === assignedWorkstation.definitionId);
        if (!workstationDef) continue;
        
        // Find the specific time for this product-line-workstation combination in the API data
        const apiRow = apiData.find(d => 
            normalizeMaterialCode(d.CodMaterial) === productId &&
            String(d.Centro).trim() === line.workCenterId &&
            String(d.Linea).trim() === line.name &&
            String(d.PuestoTrabajo).trim() === workstationDef.name
        );
        
        // If a time is found, add it to the total for the line.
        // This assumes a sequential process where times add up.
        if (apiRow && apiRow.Tiempo > 0) {
            const timeHours = apiRow.Tiempo / 60; // Convert minutes to hours
            totalTime += timeHours;
        }
    }

    // If no valid time was found for any workstation on the line, return Infinity
    // to indicate this line cannot produce this product.
    return totalTime > 0 ? totalTime : Infinity;
};


function getPpiOptionsForProduct(
    productId: string,
    demandCenterId: string,
    constraints: AppConstraints,
    apiData: TiempoEnsambleItem[],
    auditLog: string[],
): ProductProcessInfo[] {
    const { productionLines, workstationDefinitions } = constraints;
    const ppiCandidates: ProductProcessInfo[] = [];

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
            if (demandCenterId === '2000') {
                allowedProductionCenters = ['1000'];
            } else {
                allowedProductionCenters = allCenterIds.filter(id => id !== demandCenterId);
            }
            break;
        case 'X': // Can be produced in any center
        default:
            allowedProductionCenters = allCenterIds;
            break;
    }

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

    ppiCandidates.sort((a, b) => a.totalManufacturingTimeHours - b.totalManufacturingTimeHours);
    
    return ppiCandidates;
}


// ==========================================================================================
// --- Daily Plan Generation Helpers ---
// ==========================================================================================
function sequenceDailyProduction(
    dailyGoals: DailyPlanContext[],
    line: ProductionLine,
    constraints: AppConstraints,
    auditLog: string[]
): DailyPlanContext[] {
    if (dailyGoals.length <= 1) {
        return dailyGoals;
    }
    // Simple sort by remaining units, more complex logic (like bottleneck rate) can be added here.
    return dailyGoals.sort((a, b) => b.remainingUnits - a.remainingUnits);
}


export const generateProductionPlan = async (
  salesData: SalesDataRow[],
  constraints: AppConstraints,
  apiData: TiempoEnsambleItem[] 
): Promise<DetailedProductionPlan> => {
  const auditLog: string[] = [];
  const { inventorySettings, holidays, workCenters, productionLines, globalBaseCostPerHour, laborCostFactors, workstationDefinitions, shiftParameters } = constraints;
  
  if (!salesData || salesData.length === 0) {
      auditLog.push('Error: No hay datos de ventas para procesar.');
      return { finalPlan: { dailyPlan: [], monthlyPlan: [], auditLog }, planningGroupDetails: [], productionNeeds: [], monthlyAssignments: [] };
  }

  const productNamesMap = new Map<string, string>();
    salesData.forEach(s => {
        const normalizedProductId = normalizeMaterialCode(s.código);
        if (!productNamesMap.has(normalizedProductId) || (productNamesMap.get(normalizedProductId) && productNamesMap.get(normalizedProductId)!.startsWith('FAL'))) {
             productNamesMap.set(normalizedProductId, s.descripciónMaterial || s.etiqueta || normalizedProductId);
        }
    });
  
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
      
      const invSetting = inventorySettings.find(is => is.itemId === productId && is.centerId === centerId);

      Object.entries(monthlyDemands).forEach(([monthKey, demand]) => {
          if (demand > 0) {
              const [yearStr, monthStr] = monthKey.split('-');
              const year = parseInt(yearStr);
              const month = parseInt(monthStr);
              
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
    if (monthIndex % 2 === 0) { 
        await new Promise(resolve => setTimeout(resolve, 0));
    }
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
            
            monthlyAssignments.push({
                id: `${monthIndex}-${ppi.productionLineId}-${productId}-${centerId}`,
                monthIndex,
                lineId: line.id,
                lineName: line.name,
                ppiId: ppi.id,
                productId,
                centerName: line.workCenterId, // This is production center
                demandCenterId: centerId, // This is demand center
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
  const inventoryState = new Map<string, number>(); // KEY: "productId---centerId"
  inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));
  
  const workingDaysByMonth = new Map<string, number>();
  planningHorizon.forEach(({year, month}) => {
      const monthKey = `${year}-${month}`;
      let count = 0;
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day=1; day<=daysInMonth; day++) {
          const d = new Date(year, month-1, day);
          const dayType = getDayTypeForProduction(d, holidays);
          if (dayType === 'Weekday' || dayType === 'Saturday' || dayType === 'ProductiveHoliday') {
              count++;
          }
      }
      workingDaysByMonth.set(monthKey, count);
  });
  
  const dailyDemand = new Map<string, number>(); // Key: "YYYY-M-D---productId---centerId"
  salesData.forEach(s => {
    const monthKey = `${s.año}-${s.mes}`;
    const workingDays = workingDaysByMonth.get(monthKey);
    if (!workingDays || workingDays === 0) return;
    const demandPerDay = s.unidadesProyectado / workingDays;

    for (let day = 1; day <= new Date(s.año, s.mes, 0).getDate(); day++) {
        const d = new Date(s.año, s.mes - 1, day);
        if (getDayTypeForProduction(d, holidays) !== 'Sunday' && getDayTypeForProduction(d, holidays) !== 'NonProductiveHoliday') {
            const dayKey = `${s.año}-${s.mes}-${day}---${normalizeMaterialCode(s.código)}---${String(s.centro).trim()}`;
            dailyDemand.set(dayKey, (dailyDemand.get(dayKey) || 0) + demandPerDay);
        }
    }
  });


  for (let monthIndex = 0; monthIndex < planningHorizon.length; monthIndex++) {
    const { year, month } = planningHorizon[monthIndex];
    const assignmentsForMonth = monthlyAssignments.filter(a => a.monthIndex === monthIndex);
    
    const remainingUnitsToProduce = new Map<string, number>(); // key: assignment.id
    assignmentsForMonth.forEach(a => remainingUnitsToProduce.set(a.id, a.units));

    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        await new Promise(resolve => setTimeout(resolve, 0)); // Prevent blocking

        const currentDate = new Date(year, month - 1, day);
        const dayType = getDayTypeForProduction(currentDate, holidays);
        if (dayType === 'Sunday' || dayType === 'NonProductiveHoliday') continue;

        let hoursPerDay: number;
        if (dayType === 'Weekday') hoursPerDay = shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay;
        else hoursPerDay = shiftParameters.saturdayAndHolidayHours;
        
        const assignmentsByLine = new Map<string, MonthlyAssignment[]>();
        for (const assignment of assignmentsForMonth) {
            if((remainingUnitsToProduce.get(assignment.id) || 0) > 0.1) {
                if (!assignmentsByLine.has(assignment.lineId)) {
                    assignmentsByLine.set(assignment.lineId, []);
                }
                assignmentsByLine.get(assignment.lineId)!.push(assignment);
            }
        }

        for (const [lineId, assignments] of assignmentsByLine.entries()) {
            const line = activeLines.find(l => l.id === lineId)!;
            let hoursRemainingToday = hoursPerDay;

            const sequencedAssignments = assignments.sort((a,b) => (remainingUnitsToProduce.get(b.id) || 0) - (remainingUnitsToProduce.get(a.id) || 0));

            for (const assignment of sequencedAssignments) {
                if (hoursRemainingToday <= 0.01) break;
                
                const unitsLeftForAssignment = remainingUnitsToProduce.get(assignment.id) || 0;
                if(unitsLeftForAssignment <= 0.1) continue;

                const manufacturingTime = assignment.totalHours / assignment.units;
                if(manufacturingTime <= 0) continue;

                const maxUnitsInTime = hoursRemainingToday / manufacturingTime;
                const unitsToProduce = Math.min(unitsLeftForAssignment, maxUnitsInTime);
                
                if (unitsToProduce < 0.1) continue;

                const hoursConsumed = unitsToProduce * manufacturingTime;
                
                const { productId, demandCenterId, centerName: productionCenterId } = assignment;
                const isTransfer = productionCenterId !== demandCenterId;
                
                const prodStockKey = `${productId}---${productionCenterId}`;
                const initialStockInProdCenter = inventoryState.get(prodStockKey) || 0;
                
                let stockInDemandCenterBeforeDemand = 0;
                if (isTransfer) {
                   inventoryState.set(prodStockKey, initialStockInProdCenter - unitsToProduce);
                   const demandStockKey = `${productId}---${demandCenterId}`;
                   stockInDemandCenterBeforeDemand = (inventoryState.get(demandStockKey) || 0) + unitsToProduce;
                } else {
                   stockInDemandCenterBeforeDemand = initialStockInProdCenter;
                }
                
                const demandKey = `${year}-${month}-${day}---${productId}---${demandCenterId}`;
                const demandOnDay = dailyDemand.get(demandKey) || 0;
                const finalStockOnDay = stockInDemandCenterBeforeDemand - demandOnDay;

                const demandStockKey = `${productId}---${demandCenterId}`;
                inventoryState.set(demandStockKey, finalStockOnDay);
                

                dailyPlan.push({
                    id: `${year}-${month}-${day}-${productId}-${line.id}`,
                    year, month, day, week: 0,
                    productId: productId,
                    productName: productNamesMap.get(productId) || productId,
                    quantityToProduce: unitsToProduce,
                    demandOnDay: demandOnDay, 
                    initialStockOnDay: stockInDemandCenterBeforeDemand,
                    finalStockOnDay: finalStockOnDay,
                    assignedLineId: line.id,
                    producingCenterId: productionCenterId,
                    demandCenterId: demandCenterId,
                    estimatedLaborCost: (assignment.laborCost / assignment.units) * unitsToProduce, 
                    hoursWorked: hoursConsumed,
                    status: isTransfer ? 'Transferencia' : 'Planificado',
                    notes: isTransfer ? `De ${productionCenterId} a ${demandCenterId}`: '',
                    isTransfer: isTransfer,
                    transferDestinationCenterId: isTransfer ? demandCenterId : undefined,
                    transferSourceCenterId: isTransfer ? productionCenterId : undefined,
                });

                remainingUnitsToProduce.set(assignment.id, unitsLeftForAssignment - unitsToProduce);
                hoursRemainingToday -= hoursConsumed;
            }
        }
         // Apply demand for products not produced today
        for (const [key, demand] of dailyDemand.entries()) {
            const [dateKey, productId, centerId] = key.split('---');
            if (dateKey === `${year}-${month}-${day}`) {
                 if (!dailyPlan.some(p => p.year === year && p.month === month && p.day === day && p.productId === productId && (p.demandCenterId === centerId))) {
                    const stockKey = `${productId}---${centerId}`;
                    const initialStock = inventoryState.get(stockKey) || 0;
                    inventoryState.set(stockKey, initialStock - demand);
                }
            }
        }
    }
  }

  const aggregatedMonthlyPlan = new Map<string, MonthlyProductionPlanItem>();
  dailyPlan.forEach(item => {
    const key = `${item.year}-${item.month}-${item.productId}-${item.producingCenterId}`;
    let entry = aggregatedMonthlyPlan.get(key);
    if (!entry) {
        const productName = productNamesMap.get(item.productId) || item.productId;
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
    'Línea': constraints.productionLines.find(l => l.id === item.assignedLineId)?.name || item.assignedLineId,
    'Horas fabricación': parseFloat(item.hoursWorked.toFixed(2)),
    'Costo Labor Est.': parseFloat(item.estimatedLaborCost.toFixed(2)),
    'Estado': item.status,
    'Notas': item.notes || ''
  }));

  const dailyWorksheet = XLSX.utils.json_to_sheet(dailyDataToExport);
  const dailyColWidths = [
    { wch: 6 }, { wch: 10 }, { wch: 5 }, { wch: 15 }, { wch: 30 }, 
    { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, 
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
