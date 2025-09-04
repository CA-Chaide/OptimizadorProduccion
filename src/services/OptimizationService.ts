

import { 
    SalesDataRow, AppConstraints, ProductionPlan, ProductionPlanItem, 
    ProductProcessInfo, WorkCenter, ProductionLine, LaborCostSettings, InventorySetting, Holiday,
    MonthlyInventoryState, ProcessType, WorkstationDefinition,
    SupplyInfo, MonthlyProductionPlanItem, NotificationMessage, LineMonthlySummary, 
    TacticalRequest, TacticalPlanResult, TacticalOrderItem, ProvisionalOrder, Employee, EmployeeSkill, MaintenanceEvent, AbsenteeismEvent, AssignedPersonnel, ShiftParameters,
    Machine, Qualification, TiempoEnsambleItem, DetailedProductionPlan, PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment
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
        if (row.ClaseAprovisionamiento === null || row.ClaseAprovisionamiento === undefined) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'ClaseAprovisionamiento'.`);
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
    
    // Create a set of unique product-center pairs from the API data.
    const uniqueProductCenterPairs = new Set(
        apiData.map(row => `${normalizeMaterialCode(row.CodMaterial)}---${String(row.Centro).trim()}`)
    );

    const inventorySettings: InventorySetting[] = [];
    
    uniqueProductCenterPairs.forEach(pairKey => {
        const [productId, centerId] = pairKey.split('---');
        
        // Find all rows for this specific pair
        const rowsForPair = apiData.filter(row => 
            normalizeMaterialCode(row.CodMaterial) === productId && String(row.Centro).trim() === centerId
        );
        
        // Find the best row to get inventory data from (e.g., one that has stock info)
        const inventoryDataSource = 
            rowsForPair.find(r => r.StockSeguridad || r.StockMaximo) || 
            rowsForPair[0];

        if (inventoryDataSource) {
             inventorySettings.push({
                id: pairKey,
                itemId: productId,
                itemName: productNamesMap.get(productId) || productId,
                centerId: centerId,
                isRawMaterial: false,
                minStock: parseInt(String(inventoryDataSource.StockSeguridad || 0), 10),
                maxStock: parseInt(String(inventoryDataSource.StockMaximo || 0), 10),
                currentStock: parseInt(String(inventoryDataSource.StockActual || 0), 10),
                lotMin: parseInt(String(inventoryDataSource.TamLoteMin || 1), 10) || 1,
                lotMax: inventoryDataSource.TamLoteMax ? parseInt(String(inventoryDataSource.TamLoteMax), 10) : null,
            });
        }

        // Add product to materials handled by the line
        rowsForPair.forEach(row => {
            const lineName = String(row.Linea).trim();
            const lineId = `pl---${centerId}---${lineName}`;
            const line = discoveredLines.get(lineId);
            if (line && !line.materialsHandled.includes(productId)) {
                line.materialsHandled.push(productId);
            }
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
    log: string[]
): number => {
    
    const workstationEffectiveTimes: number[] = [];

    // Iterate over all workstation definitions required by the line
    for (const assignedWorkstation of line.assignedWorkstations) {
        const workstationDef = workstationDefs.find(wd => wd.id === assignedWorkstation.definitionId);
        if (!workstationDef) continue;
        
        // Find the specific time for this product-line-workstation combination in the API data
        const apiRow = apiData.find(row => 
            normalizeMaterialCode(row.CodMaterial) === productId &&
            String(row.Centro).trim() === line.workCenterId &&
            String(row.Linea).trim() === line.name &&
            String(row.PuestoTrabajo).trim() === workstationDef.name
        );
        
        if (apiRow && apiRow.Tiempo > 0) {
            const timeMinutes = apiRow.Tiempo;
            const quantityOfPosts = assignedWorkstation.quantity;
            // Effective time is the time it takes one post, divided by how many posts of that type there are.
            const effectiveTimeForThisPostType = timeMinutes / quantityOfPosts;
            workstationEffectiveTimes.push(effectiveTimeForThisPostType);
        }
    }

    // If a product requires passing through workstations but no times were found for it, it cannot be made.
    if (line.assignedWorkstations.length > 0 && workstationEffectiveTimes.length !== line.assignedWorkstations.length) {
        log.push(`Alerta: Para producto ${productId} en línea ${line.name}, no se encontraron tiempos para todos los puestos de trabajo asignados. Se requieren ${line.assignedWorkstations.length}, se encontraron ${workstationEffectiveTimes.length}. La línea no se considerará.`);
        return Infinity;
    }
    
    if (workstationEffectiveTimes.length === 0) {
        return Infinity;
    }

    // The line's bottleneck is the highest effective time of any of its workstations.
    const bottleneckTimeMinutes = Math.max(0, ...workstationEffectiveTimes);
    
    // Return time in hours.
    return bottleneckTimeMinutes / 60;
};


function getPpiOptionsForProduct(
    productId: string,
    demandCenterId: string,
    constraints: AppConstraints,
    apiData: TiempoEnsambleItem[],
    localAuditLog: string[]
): ProductProcessInfo[] {
    const { productionLines, workstationDefinitions } = constraints;
    const ppiCandidates: ProductProcessInfo[] = [];

    // Step 1: Find the provisioning rule for the product.
    // First, try to find the rule for the specific demand center.
    let ruleRow = apiData.find(row => 
        normalizeMaterialCode(row.CodMaterial) === productId && 
        String(row.Centro).trim() === demandCenterId &&
        row.ClaseAprovisionamiento
    );

    // If not found, find any rule for that product in any center.
    if (!ruleRow) {
        ruleRow = apiData.find(row => 
            normalizeMaterialCode(row.CodMaterial) === productId && 
            row.ClaseAprovisionamiento
        );
    }
    
    // Default to 'E' (produce in same center) if no specific rule is found at all.
    const provisioningRule = ruleRow?.ClaseAprovisionamiento || 'E';

    // Step 2: Determine which production centers are allowed based on the rule.
    let allowedProductionCenters: string[];
    const allCenterIds = Array.from(new Set(productionLines.map(l => l.workCenterId)));

    switch(provisioningRule) {
        case 'E': // Must be produced in the same center as demand.
            allowedProductionCenters = [demandCenterId];
            break;
        case 'F': // Must be sourced from a different center (transfer).
            // Hardcoded rule: For now, all external sourcing is from center 1000.
            allowedProductionCenters = ["1000"];
            break;
        case 'X': // Can be produced in any center.
        default:
            allowedProductionCenters = allCenterIds;
            break;
    }

    // Step 3: Find all lines in the allowed centers that can actually make the product.
    const allCapableLines = productionLines.filter(line => 
        // Is the line in an allowed production center?
        allowedProductionCenters.includes(line.workCenterId) &&
        // Does any API data exist linking this product to this line?
        apiData.some(d => 
            normalizeMaterialCode(d.CodMaterial) === productId &&
            String(d.Centro).trim() === line.workCenterId &&
            String(d.Linea).trim() === line.name
        )
    );

    if (allCapableLines.length === 0) {
        // Log if no lines are found, this is useful for debugging.
        localAuditLog.push(`Info: Producto ${productId} (Demanda en ${demandCenterId}, Regla: ${provisioningRule}) no tiene líneas de producción válidas en los centros permitidos: [${allowedProductionCenters.join(', ')}].`);
        return [];
    }

    // Step 4: For each capable line, calculate its effective manufacturing time and create a PPI option.
    allCapableLines.forEach(line => {
        const manufacturingTime = calculateEffectiveManufacturingTime(productId, line, apiData, workstationDefinitions, localAuditLog);

        if (manufacturingTime < Infinity && manufacturingTime > 0) {
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

    // Sort options from fastest to slowest to prioritize efficiency.
    ppiCandidates.sort((a, b) => a.totalManufacturingTimeHours - b.totalManufacturingTimeHours);
    
    return ppiCandidates;
}


// ==========================================================================================
// --- Daily Plan Generation Helpers ---
// ==========================================================================================
function sequenceDailyProduction(
    dailyGoals: MonthlyAssignment[],
    line: ProductionLine,
    constraints: AppConstraints,
    log: string[]
): MonthlyAssignment[] {
    if (dailyGoals.length <= 1) {
        return dailyGoals;
    }
    // Simple sort by remaining units, more complex logic (like bottleneck rate) can be added here.
    return dailyGoals.sort((a, b) => b.units - a.units);
}


export const generateProductionPlan = async (
  salesData: SalesDataRow[],
  constraints: AppConstraints,
  apiData: TiempoEnsambleItem[] 
): Promise<DetailedProductionPlan> => {
  const localAuditLog: string[] = [];
  console.log("--- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN ---");
  localAuditLog.push("--- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN ---");

  const { inventorySettings, holidays, workCenters, productionLines, globalBaseCostPerHour, laborCostFactors, workstationDefinitions, shiftParameters } = constraints;
  
  if (!salesData || salesData.length === 0) {
      localAuditLog.push('Error: No hay datos de ventas para procesar.');
      console.error("PLAN_GEN_ERROR: No hay datos de ventas.");
      return { finalPlan: { dailyPlan: [], monthlyPlan: [], auditLog: localAuditLog }, planningGroupDetails: [], productionNeeds: [], monthlyAssignments: [] };
  }
  console.log(`Paso 1: Se encontraron ${salesData.length} registros de ventas.`);
  localAuditLog.push(`Paso 1: Se encontraron ${salesData.length} registros de ventas.`);

  const productNamesMap = new Map<string, string>();
    salesData.forEach(s => {
        const normalizedProductId = normalizeMaterialCode(s.código);
        if (!productNamesMap.has(normalizedProductId) || (productNamesMap.get(normalizedProductId) && productNamesMap.get(normalizedProductId)!.startsWith('FAL'))) {
             productNamesMap.set(normalizedProductId, s.descripciónMaterial || s.etiqueta || normalizedProductId);
        }
    });
  
  // --- Robust Planning Horizon Calculation ---
  const planningYear = salesData[0]?.año;
  if (!planningYear) {
      localAuditLog.push('Error: No se pudo determinar el año de planificación a partir de los datos de ventas.');
      console.error("PLAN_GEN_ERROR: No se pudo determinar el año de planificación.");
      return { finalPlan: { dailyPlan: [], monthlyPlan: [], auditLog: localAuditLog }, planningGroupDetails: [], productionNeeds: [], monthlyAssignments: [] };
  }
  const planningHorizon = Array.from({ length: 12 }, (_, i) => ({
      year: planningYear,
      month: i + 1,
  }));
  // --- End Horizon Calculation ---

  console.log(`Paso 2: Horizonte de planificación establecido para el año ${planningYear}.`);
  localAuditLog.push(`Paso 2: Horizonte de planificación establecido para el año ${planningYear}.`);

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
  console.log(`Paso 3: Demanda de ventas agrupada en ${demandMap.size} combinaciones de producto-centro.`);
  localAuditLog.push(`Paso 3: Demanda de ventas agrupada en ${demandMap.size} combinaciones de producto-centro.`);


  const planningGroupDetails: PlanningGroupMonthlyDetail[] = [];
  demandMap.forEach((monthlyDemands, pairKey) => {
      const [productId, centerId] = pairKey.split('---');
      
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
      }
    );
  });
  console.log(`Paso 4: Creados ${planningGroupDetails.length} detalles de grupos de planificación mensuales (demanda desglosada).`);
  localAuditLog.push(`Paso 4: Creados ${planningGroupDetails.length} detalles de grupos de planificación mensuales (demanda desglosada).`);
  
  // --- New Logic: Consolidate external demand into the manufacturing center's demand ---
  const consolidatedDemandMap = new Map<string, { [monthKey: string]: number }>();
  demandMap.forEach((monthlyDemands, pairKey) => {
    const [productId, demandCenterId] = pairKey.split('---');
    
    const ruleRow = apiData.find(row => 
        normalizeMaterialCode(row.CodMaterial) === productId && 
        (String(row.Centro).trim() === demandCenterId || !row.Centro)
    ) || apiData.find(row => normalizeMaterialCode(row.CodMaterial) === productId);
    
    const provisioningRule = ruleRow?.ClaseAprovisionamiento || 'E';
    const productionCenterId = provisioningRule === 'F' ? "1000" : demandCenterId;

    const consolidatedKey = `${productId}---${productionCenterId}`;
    if (!consolidatedDemandMap.has(consolidatedKey)) {
        consolidatedDemandMap.set(consolidatedKey, {});
    }

    const destMap = consolidatedDemandMap.get(consolidatedKey)!;
    for (const [monthKey, demand] of Object.entries(monthlyDemands)) {
        destMap[monthKey] = (destMap[monthKey] || 0) + demand;
    }
  });
  console.log(`Paso 5: Demanda consolidada en ${consolidatedDemandMap.size} centros de producción según reglas de aprovisionamiento.`);
  localAuditLog.push(`Paso 5: Demanda consolidada en ${consolidatedDemandMap.size} centros de producción según reglas de aprovisionamiento.`);


  const productionNeedsMap = new Map<string, number[]>();
  consolidatedDemandMap.forEach((monthlyDemands, pairKey) => {
      const [productId, centerId] = pairKey.split('---');
      
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
  console.log(`Paso 6: Calculadas las necesidades de producción mensuales netas para ${productionNeedsMap.size} grupos.`);
  localAuditLog.push(`Paso 6: Calculadas las necesidades de producción mensuales netas para ${productionNeedsMap.size} grupos.`);
  
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
  console.log("Paso 7: Calculada la disponibilidad de horas mensuales para cada línea de producción.");
  localAuditLog.push("Paso 7: Calculada la disponibilidad de horas mensuales para cada línea de producción.");
  
  const monthlyOriginalNeeds = new Map<string, number>();
  productionNeedsMap.forEach((needs, pairKey) => {
    needs.forEach((need, index) => {
        const { year, month } = planningHorizon[index];
        const key = `${pairKey}---${year}-${month}`;
        monthlyOriginalNeeds.set(key, need);
    });
  });

  for (let monthIndex = 0; monthIndex < planningHorizon.length; monthIndex++) {
    console.log(`--- Planificando Mes ${monthIndex + 1} / 12 ---`);
    localAuditLog.push(`--- Planificando Mes ${monthIndex + 1} / ${planningHorizon.length} ---`);

    await new Promise(resolve => setTimeout(resolve, 0));
    
    const availableHoursThisMonth = new Map<string, LineHourAvailability>();
    lineMonthlyHours.forEach((monthlyAvail, lineId) => availableHoursThisMonth.set(lineId, { ...monthlyAvail[monthIndex] }));
    
    const productsToPlanThisMonth = Array.from(productionNeedsMap.entries())
        .filter(([_, needs]) => needs[monthIndex] > 0)
        .map(([pairKey, needs]) => {
            const [productId, centerId] = pairKey.split('---');
            const ppiOptions = getPpiOptionsForProduct(productId, centerId, constraints, apiData, localAuditLog);
            return { pairKey, units: needs[monthIndex], ppiOptions };
        })
        .filter(p => p.ppiOptions.length > 0)
        .sort((a,b) => a.ppiOptions[0].totalManufacturingTimeHours - b.ppiOptions[0].totalManufacturingTimeHours);
    console.log(`Mes ${monthIndex + 1}: ${productsToPlanThisMonth.length} productos con necesidad de producción.`);
    localAuditLog.push(`Mes ${monthIndex + 1}: ${productsToPlanThisMonth.length} productos con necesidad de producción.`);

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
                centerName: line.workCenterId, 
                demandCenterId: centerId,
                units: unitsToMake,
                originalNeedUnits: originalUnitsToMake,
                advancedUnits: advancedUnitsToMake,
                totalHours: hoursToConsume,
                laborCost: laborCost
            });
            console.log(`  Asignación Mes ${monthIndex + 1}: ${unitsToMake.toFixed(0)} u de ${productId} a línea ${line.name}. Horas: ${hoursToConsume.toFixed(2)}.`);
            localAuditLog.push(`  Asignación Mes ${monthIndex + 1}: ${unitsToMake.toFixed(0)} u de ${productId} a línea ${line.name}. Horas: ${hoursToConsume.toFixed(2)}.`);

            unitsLeftToPlan -= unitsToMake;
        }
        if (unitsLeftToPlan > 0.1 && monthIndex < planningHorizon.length - 1) {
            productionNeedsMap.get(prod.pairKey)![monthIndex + 1] += unitsLeftToPlan;
            console.log(`  Adelanto: ${unitsLeftToPlan.toFixed(0)} u de ${productId} se mueven al mes ${monthIndex + 2}.`);
            localAuditLog.push(`  Adelanto: ${unitsLeftToPlan.toFixed(0)} u de ${productId} se mueven al mes ${monthIndex + 2}.`);
        }
    }
  }
  console.log("Paso 8: Finalizada la asignación de producción mensual a las líneas.");
  localAuditLog.push("Paso 8: Finalizada la asignación de producción mensual a las líneas.");

  // Final corrected production needs for display
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
  console.log(`Paso 9: Generadas ${productionNeeds.length} entradas de necesidades de producción finales.`);
  localAuditLog.push(`Paso 9: Generadas ${productionNeeds.length} entradas de necesidades de producción finales.`);

  // --- Daily Plan Generation ---
  console.log("--- INICIANDO GENERACIÓN DE PLAN DIARIO ---");
  localAuditLog.push("--- INICIANDO GENERACIÓN DE PLAN DIARIO ---");
  const dailyPlan: ProductionPlanItem[] = [];
  const inventoryState = new Map<string, number>(); // KEY: "productId---centerId"
  inventorySettings.forEach(inv => inventoryState.set(`${inv.itemId}---${inv.centerId}`, inv.currentStock));
  console.log("Paso 10: Inicializado el estado de inventario.");
  localAuditLog.push("Paso 10: Inicializado el estado de inventario.");
  
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
  console.log("Paso 11: Calculados los días laborables para cada mes.");
  localAuditLog.push("Paso 11: Calculados los días laborables para cada mes.");
  
  const dailyDemand = new Map<string, number>(); // Key: "YYYY-M-D---productId---centerId"
  salesData.forEach(s => {
    const monthKey = `${s.año}-${s.mes}`;
    const workingDays = workingDaysByMonth.get(monthKey);
    if (!workingDays || workingDays === 0) return;
    const demandPerDay = s.unidadesProyectado / workingDays;
    const centerId = String(s.centro).trim();
    const productId = normalizeMaterialCode(s.código);

    for (let day = 1; day <= new Date(s.año, s.mes, 0).getDate(); day++) {
        const d = new Date(s.año, s.mes - 1, day);
        if (getDayTypeForProduction(d, holidays) !== 'Sunday' && getDayTypeForProduction(d, holidays) !== 'NonProductiveHoliday') {
            const dayKey = `${s.año}-${s.mes}-${day}---${productId}---${centerId}`;
            dailyDemand.set(dayKey, (dailyDemand.get(dayKey) || 0) + demandPerDay);
        }
    }
  });
  console.log(`Paso 12: Demanda diaria calculada y distribuida en ${dailyDemand.size} entradas.`);
  localAuditLog.push(`Paso 12: Demanda diaria calculada y distribuida en ${dailyDemand.size} entradas.`);


  for (let monthIndex = 0; monthIndex < planningHorizon.length; monthIndex++) {
    const { year, month } = planningHorizon[monthIndex];
    const assignmentsForMonth = monthlyAssignments.filter(a => a.monthIndex === monthIndex);
    console.log(`--- Procesando Plan Diario para Mes ${month}/${year}. ${assignmentsForMonth.length} asignaciones a procesar.`);
    localAuditLog.push(`--- Procesando Plan Diario para Mes ${month}/${year}. ${assignmentsForMonth.length} asignaciones a procesar.`);
    
    const remainingUnitsToProduce = new Map<string, number>(); // key: assignment.id
    assignmentsForMonth.forEach(a => remainingUnitsToProduce.set(a.id, a.units));

    const daysInMonth = new Date(year, month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        await new Promise(resolve => setTimeout(resolve, 0)); // Prevent blocking

        const currentDate = new Date(year, month - 1, day);
        const dayType = getDayTypeForProduction(currentDate, holidays);
        if (dayType === 'Sunday' || dayType === 'NonProductiveHoliday') continue;
        console.log(`  Día ${day}: Procesando... (Tipo: ${dayType})`);
        localAuditLog.push(`  Día ${day}: Procesando... (Tipo: ${dayType})`);

        let hoursPerDay: number;
        if (dayType === 'Weekday') hoursPerDay = shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay;
        else hoursPerDay = shiftParameters.saturdayAndHolidayHours;
        
        const assignmentsByLine = new Map<string, MonthlyAssignment[]>();
        const activeAssignments = assignmentsForMonth.filter(a => (remainingUnitsToProduce.get(a.id) || 0) > 0.1);

        for (const assignment of activeAssignments) {
            if (!assignmentsByLine.has(assignment.lineId)) {
                assignmentsByLine.set(assignment.lineId, []);
            }
            assignmentsByLine.get(assignment.lineId)!.push(assignment);
        }
        
        // --- Day's Demand Processing ---
        for (const [demandKey, demandValue] of dailyDemand.entries()) {
            const [dateKey, productId, centerId] = demandKey.split('---');
            if (dateKey === `${year}-${month}-${day}`) {
                 const stockKey = `${productId}---${centerId}`;
                 const currentStock = inventoryState.get(stockKey) || 0;
                 inventoryState.set(stockKey, currentStock - demandValue);
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
                
                const { productId, centerName: productionCenterId } = assignment;
                
                const invSetting = inventorySettings.find(i => i.itemId === productId && i.centerId === productionCenterId);
                const lotMin = invSetting?.lotMin || 1;
                const lotMax = invSetting?.lotMax || Infinity;

                const maxUnitsInTime = hoursRemainingToday / manufacturingTime;
                
                const unitsToProduceAttempt = Math.max(lotMin, Math.min(unitsLeftForAssignment, maxUnitsInTime, lotMax));

                if (unitsToProduceAttempt < lotMin && unitsLeftForAssignment > unitsToProduceAttempt) {
                     continue;
                }

                const unitsToProduce = Math.min(unitsLeftForAssignment, unitsToProduceAttempt);

                if (unitsToProduce < 0.1) continue;

                const hoursConsumed = unitsToProduce * manufacturingTime;
                
                const prodStockKey = `${productId}---${productionCenterId}`;
                const initialStockOnDay = inventoryState.get(prodStockKey) || 0;
                
                remainingUnitsToProduce.set(assignment.id, unitsLeftForAssignment - unitsToProduce);
                hoursRemainingToday -= hoursConsumed;
                console.log(`    Línea ${line.name}: Produce ${unitsToProduce.toFixed(0)} u de ${productId}. Horas consumidas: ${hoursConsumed.toFixed(2)}. Horas restantes hoy: ${hoursRemainingToday.toFixed(2)}.`);
                localAuditLog.push(`    Línea ${line.name}: Produce ${unitsToProduce.toFixed(0)} u de ${productId}. Horas consumidas: ${hoursConsumed.toFixed(2)}. Horas restantes hoy: ${hoursRemainingToday.toFixed(2)}.`);
                
                
                const originalDemands = salesData.filter(s => {
                    const sProdId = normalizeMaterialCode(s.código);
                    const sCenterId = String(s.centro).trim();

                    const ruleRow = apiData.find(d => 
                        normalizeMaterialCode(d.CodMaterial) === sProdId && 
                        (String(d.Centro).trim() === sCenterId || !d.Centro)
                    ) || apiData.find(d => normalizeMaterialCode(d.CodMaterial) === sProdId);
                    
                    const provRule = ruleRow?.ClaseAprovisionamiento || 'E';
                    const prodCenterForDemand = provRule === 'F' ? "1000" : sCenterId;
                    
                    return sProdId === productId && prodCenterForDemand === productionCenterId;
                });

                let unitsToDistribute = unitsToProduce;
                inventoryState.set(prodStockKey, initialStockOnDay + unitsToProduce);

                originalDemands.forEach(originalDemand => {
                    if (unitsToDistribute <= 0) return;
                    
                    const demandCenterId = String(originalDemand.centro).trim();
                    const demandKey = `${year}-${month}-${day}---${productId}---${demandCenterId}`;
                    const demandOnDay = dailyDemand.get(demandKey) || 0;
                    
                    const isTransfer = productionCenterId !== demandCenterId;

                    let unitsForThisPlanItem: number;
                    let finalStockOnDay: number;
                    let initialStockInDemandCenter: number;

                    const demandStockKey = `${productId}---${demandCenterId}`;

                    if (isTransfer) {
                        const transferAmount = Math.min(unitsToDistribute, demandOnDay > 0 ? demandOnDay : unitsToDistribute);
                        unitsForThisPlanItem = transferAmount;
                        
                        const stockInProdCenter = inventoryState.get(prodStockKey) || 0;
                        inventoryState.set(prodStockKey, stockInProdCenter - transferAmount);

                        initialStockInDemandCenter = inventoryState.get(demandStockKey) || 0;
                        inventoryState.set(demandStockKey, initialStockInDemandCenter + transferAmount);
                        finalStockOnDay = initialStockInDemandCenter + transferAmount;
                        
                        console.log(`      Transferencia: ${transferAmount.toFixed(0)} u de ${productId} de ${productionCenterId} a ${demandCenterId}.`);
                        localAuditLog.push(`      Transferencia: ${transferAmount.toFixed(0)} u de ${productId} de ${productionCenterId} a ${demandCenterId}.`);

                    } else { // Not a transfer, production is for the same center
                        unitsForThisPlanItem = unitsToProduce;
                        initialStockInDemandCenter = initialStockOnDay + unitsToProduce; // Stock before today's sales
                        finalStockOnDay = (inventoryState.get(prodStockKey) || 0); // Final stock after sales
                    }
                    
                    dailyPlan.push({
                        id: `${year}-${month}-${day}-${productId}-${line.id}-${demandCenterId}-${Math.random()}`,
                        year, month, day, week: 0,
                        productId: productId,
                        productName: productNamesMap.get(productId) || productId,
                        quantityToProduce: unitsForThisPlanItem,
                        demandOnDay: dailyDemand.get(demandKey) || 0, // CORRECTED
                        initialStockOnDay: initialStockInDemandCenter - unitsForThisPlanItem, // Stock before this item's production/transfer
                        finalStockOnDay: finalStockOnDay,
                        assignedLineId: line.id,
                        producingCenterId: productionCenterId,
                        demandCenterId: demandCenterId,
                        estimatedLaborCost: (assignment.laborCost / assignment.units) * unitsForThisPlanItem, 
                        hoursWorked: (assignment.totalHours / assignment.units) * unitsForThisPlanItem,
                        status: isTransfer ? 'Transferencia' : 'Planificado',
                        notes: isTransfer ? `De ${productionCenterId} a ${demandCenterId}`: '',
                        isTransfer: isTransfer,
                        transferDestinationCenterId: isTransfer ? demandCenterId : undefined,
                        transferSourceCenterId: isTransfer ? productionCenterId : undefined,
                    });
                    
                    unitsToDistribute -= unitsForThisPlanItem;
                    if (!isTransfer) return;
                });

            }
        }
    }
  }
  console.log(`Paso 13: Plan diario completo. Se generaron ${dailyPlan.length} registros de producción/transferencia.`);
  localAuditLog.push(`Paso 13: Plan diario completo. Se generaron ${dailyPlan.length} registros de producción/transferencia.`);

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
    // Aggregate only the actual production, not transfers
    if (!item.isTransfer) {
        entry.totalQuantityToProduce += item.quantityToProduce;
    }
    entry.totalHoursWorked += item.hoursWorked;
    entry.totalEstimatedLaborCost += item.estimatedLaborCost;
    aggregatedMonthlyPlan.set(key, entry);
  });
  console.log("Paso 14: Plan mensual agregado a partir del plan diario.");
  localAuditLog.push("Paso 14: Plan mensual agregado a partir del plan diario.");
  
  console.log("--- FINALIZADA LA GENERACIÓN DEL PLAN DE PRODUCCIÓN ---");
  localAuditLog.push("--- FINALIZADA LA GENERACIÓN DEL PLAN DE PRODUCCIÓN ---");
  
  return { 
    finalPlan: { dailyPlan, monthlyPlan: Array.from(aggregatedMonthlyPlan.values()), auditLog: localAuditLog },
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
    'Producción/Transfer': Math.round(item.quantityToProduce),
    'Stock Final': Math.round(item.finalStockOnDay),
    'Centro Prod.': item.producingCenterId,
    'Centro Demanda': item.demandCenterId,
    'Línea': constraints.productionLines.find(l => l.id === item.assignedLineId)?.name || item.assignedLineId,
    'Horas fabricación': parseFloat(item.hoursWorked.toFixed(2)),
    'Costo Labor Est.': parseFloat(item.estimatedLaborCost.toFixed(2)),
    'Estado': item.status,
    'Notas': item.notes || ''
  }));

  const dailyWorksheet = XLSX.utils.json_to_sheet(dailyDataToExport);
  const dailyColWidths = [
    { wch: 6 }, { wch: 10 }, { wch: 5 }, { wch: 15 }, { wch: 30 }, 
    { wch: 12 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, {wch: 15},
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





