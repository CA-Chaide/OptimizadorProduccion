import { 
    SalesDataRow, AppConstraints, ProductionPlan, ProductionPlanItem, ProductionTimeImportRow, 
    ProductProcessInfo, WorkCenter, ProductionLine, LaborCostSettings, InventorySetting, Holiday,
    MonthlyInventoryState, ProcessType, WorkstationDefinition,
    ParsedProductionData, SupplyInfo, MonthlyProductionPlanItem, NotificationMessage, LineMonthlySummary, 
    TacticalRequest, TacticalPlanResult, TacticalOrderItem, ProvisionalOrder, Employee, EmployeeSkill, MaintenanceEvent, AbsenteeismEvent, AssignedPersonnel
} from '@/types/types';
import { MONTH_NAMES, PROCESS_TYPE_OPTIONS } from '@/constants/constants'; 


// XLSX type will be available globally from CDN script in index.html
declare var XLSX: any; 

/**
 * Finds a sheet in the workbook by name, ignoring case and accents.
 * @param workbook The XLSX workbook object.
 * @param nameToFind The desired sheet name (e.g., "PPTO_VTAS").
 * @returns The worksheet object or null if not found.
 */
const findSheetByName = (workbook: any, nameToFind: string): any | null => {
    const normalizedNameToFind = nameToFind
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    for (const sheetName of workbook.SheetNames) {
        const normalizedSheetName = sheetName
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
        
        if (normalizedSheetName === normalizedNameToFind) {
            return workbook.Sheets[sheetName];
        }
    }
    return null;
};


export const parseExcelData = (file: File): Promise<SalesDataRow[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // Find sheet by name robustly, falling back to the first sheet.
        const worksheet = findSheetByName(workbook, 'PPTO_VTAS') ?? workbook.Sheets[workbook.SheetNames[0]];
        if (!worksheet) {
            reject(new Error("No se encontró una hoja de cálculo válida en el archivo. Buscando 'PPTO_VTAS' o la primera hoja."));
            return;
        }

        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (jsonData.length < 2) { 
          resolve([]);
          return;
        }
        
        const salesData: SalesDataRow[] = jsonData.slice(1).map((row, index) => {
          if(row.filter(cell => cell !== null && cell !== undefined && cell !== '').length === 0) return null; 

          return {
            id: `row-${Date.now()}-${index}`,
            año: parseInt(String(row[0]), 10) || 0,
            mes: parseInt(String(row[1]), 10) || 0,
            sector: String(row[2] || ''),
            etiqueta: String(row[3] || ''),
            código: String(row[4] || '').trim(),
            centro: String(row[5] || '').trim(), // Demand Center
            unidadesProyectado: parseFloat(String(row[6])) || 0,
            dolaresProyectado: parseFloat(String(row[7])) || 0,
            descripciónMaterial: String(row[8] || ''),
            familia: String(row[9] || ''),
            marca: String(row[10] || ''),
            lineaProduccion: String(row[11] || '').trim(), // Suggested Production Line
          };
        }).filter(row => row !== null && row.unidadesProyectado >= 0 && row.código) as SalesDataRow[]; 

        resolve(salesData);
      } catch (error) {
        console.error("Error processing Sales Excel:", error);
        reject(new Error('Formato de archivo Excel de ventas inválido o corrupto.'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

export const parseProductionTimesExcel = (file: File): Promise<ParsedProductionData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });

        const productionTimes: ProductionTimeImportRow[] = [];
        const supplyInfos: SupplyInfo[] = [];

        // --- Parse Times Sheet ("Tiempos_produccion" or "Tiempos_producción") ---
        const timesWorksheet = findSheetByName(workbook, 'Tiempos_produccion');
        if (timesWorksheet) {
            const jsonData = XLSX.utils.sheet_to_json(timesWorksheet, { header: 1 }) as any[][];
            if (jsonData.length >= 2) {
                productionTimes.push(...jsonData.slice(1).map((row, index) => {
                  if(row.filter(cell => cell !== null && cell !== undefined && cell !== '').length === 0) return null;
                  
                  // The time value from Excel is assumed to be in MINUTES.
                  return {
                    rowIndex: index + 2, 
                    códigoMaterial: String(row[0] || '').trim(),      
                    centro: String(row[1] || '').trim(),              
                    linea: String(row[2] || '').trim(),               
                    puestoTrabajo: String(row[3] || '').trim(),      
                    tiempo: parseFloat(String(row[4])) || 0, // This is in MINUTES         
                    saldoInicial: parseFloat(String(row[5])) || 0,    
                    stockSeguridad: parseFloat(String(row[6])) || 0,  
                    stockMaximo: parseFloat(String(row[7])) || 0,     
                  };
                }).filter(row => 
                    row !== null && 
                    row.códigoMaterial && 
                    row.centro && 
                    row.linea && 
                    row.puestoTrabajo
                ) as ProductionTimeImportRow[]);
            }
        }
        
        // --- Parse Supply Sheet ("Tipo_suministro") ---
        const supplyWorksheet = findSheetByName(workbook, 'Tipo_suministro');
        if (supplyWorksheet) {
            const supplyJsonData = XLSX.utils.sheet_to_json(supplyWorksheet, { header: 1 }) as any[][];
            if (supplyJsonData.length > 1) {
                supplyInfos.push(
                    ...supplyJsonData.slice(1).map((row): SupplyInfo | null => {
                         if(row.filter(cell => cell !== null && cell !== undefined && cell !== '').length === 0) return null;
                         
                         const aprovisionamiento = String(row[2] || '').trim().toUpperCase();
                         if (aprovisionamiento !== 'E' && aprovisionamiento !== 'X' && aprovisionamiento !== 'F') {
                            return null;
                         }
                         
                         return {
                            código: String(row[0] || '').trim(),
                            centro: String(row[1] || '').trim(),
                            aprovisionamiento: aprovisionamiento as 'E' | 'X' | 'F',
                         };
                    }).filter((item): item is SupplyInfo => item !== null && !!item.código && !!item.centro)
                );
            }
        }
        
        resolve({ times: productionTimes, supplyInfos });

      } catch (error) {
        console.error("Error processing Production Times Excel:", error);
        reject(new Error('Formato de archivo Excel de tiempos/inventario inválido o corrupto. Revise las hojas "Tiempos_produccion" y "Tipo_suministro".'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};

// Helper function to normalize center names for reliable matching
const normalizeCenterName = (name: string): string => {
  return (name || '').toLowerCase().replace('centro', '').trim();
};

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


/**
 * Calculates the total labor cost for a given production task.
 * This function encapsulates the "Total Labor-Hours" logic.
 */
function calculateLaborCost(
    consumedHours: LineHourAvailability,
    ppi: ProductProcessInfo,
    baseCostPerHour: number | null,
    costFactors: LaborCostSettings | null,
    workstationDefs: WorkstationDefinition[]
): number {
    if (!baseCostPerHour || !costFactors || !ppi.workstationTimes) return 0;

    // 1. Sum up all employees involved in making this specific product on this line.
    const totalEmployees = ppi.workstationTimes.reduce((sum, wt) => {
        const def = workstationDefs.find(d => d.id === wt.workstationDefinitionId);
        return sum + (def?.employeesPerWorkstation || 1);
    }, 0);

    // 2. Calculate cost for each type of hour worked, factoring in the total employees.
    const regularHoursCost = (consumedHours.regular * totalEmployees) * baseCostPerHour;
    const extraHoursCost = (consumedHours.extra * totalEmployees) * baseCostPerHour * (1 + (costFactors.factorAdicionalDiurno / 100));
    const holidayHoursCost = (consumedHours.holiday * totalEmployees) * baseCostPerHour * (1 + (costFactors.factorFinSemanaFeriado / 100));

    return regularHoursCost + extraHoursCost + holidayHoursCost;
}

/**
 * Generates summary data aggregated by production line and month.
 */
function generateLineSummaryData(plan: ProductionPlanItem[], constraints: AppConstraints): LineMonthlySummary[] {
    const summaryMap = new Map<string, LineMonthlySummary>(); // key: `${year}-${month}-${lineId}`

    plan.forEach(item => {
        if (!item.assignedLineId || !item.producingCenterId) return;

        const lineNames = item.assignedLineId.split(', ');
        for (const lineName of lineNames) {
            const line = constraints.productionLines.find(l => l.name === lineName && l.workCenterId === constraints.workCenters.find(c => c.name === item.producingCenterId)?.id);
            if (!line) continue;
    
            const key = `${item.year}-${item.month}-${line.id}`;
            if (!summaryMap.has(key)) {
                summaryMap.set(key, {
                    lineId: line.id, lineName: line.name, centerName: item.producingCenterId,
                    year: item.year, month: MONTH_NAMES[item.month - 1],
                    initialStock: 0, minStock: 0, demand: 0, production: 0, finalStock: 0, // These are harder to aggregate by line
                    workingDays: 0,
                    avgWeekdayHours: 0, saturdaysWorked: 0, avgSaturdayHours: 0,
                    holidaysWorked: 0, holidayHours: 0,
                });
            }
        }
    });

    for (const [key, summary] of summaryMap.entries()) {
        const [yearStr, monthStr, lineId] = key.split('-');
        const year = parseInt(yearStr);
        const monthNum = MONTH_NAMES.indexOf(summary.month) + 1;
        
        const dailyItemsForLineMonth = plan.filter(p => 
            p.year === year && 
            p.month === monthNum && 
            p.assignedLineId?.split(', ').includes(summary.lineName)
        );

        let weekdayHours = 0, saturdayHours = 0, holidayHours = 0;
        const weekdaysWorked = new Set<number>(), saturdaysWorked = new Set<number>(), holidaysWorked = new Set<number>();
        
        const daysInMonth = new Date(year, monthNum, 0).getDate();
        summary.workingDays = Array.from({length: daysInMonth}, (_, i) => getDayTypeForProduction(new Date(year, monthNum-1, i+1), constraints.holidays))
                                .filter(d => d === 'Weekday' || d === 'Saturday' || d === 'ProductiveHoliday').length;

        dailyItemsForLineMonth.forEach(item => {
            const hoursPerLine = item.assignedLineId!.split(', ').length;
            const hoursOnThisLine = item.hoursWorked / hoursPerLine; // Approximate distribution

            summary.production += item.quantityToProduce / hoursPerLine; // Apportion production
            summary.demand += item.demandOnDay; // Note: Demand is center-based, this is an approximation
            
            const currentDate = new Date(item.year, item.month - 1, item.day);
            const dayType = getDayTypeForProduction(currentDate, constraints.holidays);
            
            if (hoursOnThisLine > 0) {
                 if (dayType === 'Weekday') {
                    weekdayHours += hoursOnThisLine;
                    weekdaysWorked.add(item.day);
                } else if (dayType === 'Saturday') {
                    saturdayHours += hoursOnThisLine;
                    saturdaysWorked.add(item.day);
                } else if (dayType === 'ProductiveHoliday') {
                    holidayHours += hoursOnThisLine;
                    holidaysWorked.add(item.day);
                }
            }
        });
        
        summary.saturdaysWorked = saturdaysWorked.size;
        summary.holidaysWorked = holidaysWorked.size;
        summary.holidayHours = parseFloat(holidayHours.toFixed(2));
        summary.avgWeekdayHours = weekdaysWorked.size > 0 ? parseFloat((weekdayHours / weekdaysWorked.size).toFixed(2)) : 0;
        summary.avgSaturdayHours = saturdaysWorked.size > 0 ? parseFloat((saturdayHours / saturdaysWorked.size).toFixed(2)) : 0;
    }
    
    return Array.from(summaryMap.values()).sort((a,b) => a.year - b.year || MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month) || a.centerName.localeCompare(b.centerName) || a.lineName.localeCompare(b.lineName));
}

/**
 * Dynamically calculates the effective manufacturing time for a given process,
 * accounting for parallel workstations (bottleneck logic).
 * Returns Infinity if the line is missing a required workstation.
 */
const calculateEffectiveManufacturingTime = (
    ppi: ProductProcessInfo,
    line: ProductionLine
): number => {
    if (!ppi.workstationTimes || ppi.workstationTimes.length === 0) {
        return Infinity; // Cannot be produced if process is undefined
    }

    const effectiveWorkstationTimes = ppi.workstationTimes.map(wt => {
        const assignedWorkstation = line.assignedWorkstations.find(as => as.definitionId === wt.workstationDefinitionId);
        
        // CRITICAL FIX: If a workstation required for the process is not assigned to the line, this line cannot produce the item.
        if (!assignedWorkstation) {
            return Infinity;
        }
        
        const quantity = assignedWorkstation.quantity;
        // Divide time by the number of parallel workstations for that task.
        return wt.timeHours / (quantity > 0 ? quantity : 1);
    });
    
    // The line's speed is determined by its slowest step (the bottleneck).
    // If any step was Infinity, the result will be Infinity.
    const maxTime = Math.max(0, ...effectiveWorkstationTimes);
    return maxTime;
};


export const generateProductionPlan = (
  salesData: SalesDataRow[],
  constraints: AppConstraints
): ProductionPlan => {
  const auditLog: string[] = [];
  if (!salesData || salesData.length === 0) return { dailyPlan: [], monthlyPlan: [], auditLog: ['No sales data provided.'] };

  const { inventorySettings, holidays, productProcessInfos, workCenters, productionLines, globalBaseCostPerHour, laborCostFactors, workstationDefinitions } = constraints;
  
  auditLog.push('--- INICIO DE PLANIFICACIÓN ---');
  
  auditLog.push('\n--- SUPUESTO 1: CÁLCULO DE TIEMPO DE FABRICACIÓN (CUELLO DE BOTELLA) ---');
  auditLog.push('El "Tiempo Efectivo de Fabricación" se calcula dinámicamente para cada producto en cada línea posible.');
  auditLog.push('1. Para cada puesto de trabajo, el tiempo se divide por la CANTIDAD de puestos de ese tipo en la línea (paralelismo).');
  auditLog.push('2. El tiempo final de la línea es el MÁXIMO de esos tiempos efectivos, representando el "cuello de botella".');
  auditLog.push('3. Si una línea no tiene un puesto de trabajo requerido para un producto, no se puede fabricar en esa línea (tiempo = infinito).');

  auditLog.push('\n--- SUPUESTO 2: CÁLCULO DE COSTO DE MANO DE OBRA (HORAS-HOMBRE) ---');
  auditLog.push('El Costo Laboral no se basa solo en el tiempo de la línea, sino en el esfuerzo total.');
  auditLog.push('1. Se suman TODOS los empleados de TODOS los puestos de trabajo usados para un producto en una línea.');
  auditLog.push('2. Se calculan las "Horas-Hombre" = (Horas de Funcionamiento de Línea) x (Total de Empleados).');
  auditLog.push('3. El costo es (Horas-Hombre) x (Tarifa por hora del día, con recargos).');

  // --- Helper to get all valid production options, sorted by efficiency ---
  const getPpiOptionsForPair = (
    pair: string,
    productProcessInfos: ProductProcessInfo[],
    workCenters: WorkCenter[],
    activeLines: ProductionLine[]
  ): ProductProcessInfo[] => {
      const [productId, centerName] = pair.split('---');
      const center = workCenters.find(wc => normalizeCenterName(wc.name) === centerName);
      if (!center) return [];

      const ppiCandidates = productProcessInfos.filter(ppi =>
          ppi.productId === productId &&
          activeLines.some(l => l.id === ppi.productionLineId && l.workCenterId === center.id)
      );

      // Dynamically calculate effective manufacturing time for each candidate
      const candidatesWithEffectiveTime = ppiCandidates.map(ppi => {
          const line = activeLines.find(l => l.id === ppi.productionLineId);
          if (!line) return { ppi, effectiveTime: Infinity };
          const effectiveTime = calculateEffectiveManufacturingTime(ppi, line);
          return { ppi, effectiveTime };
      });

      // Sort by the newly calculated effective time, filtering out impossible options
      return candidatesWithEffectiveTime
          .filter(item => item.effectiveTime < Infinity)
          .sort((a, b) => a.effectiveTime - b.effectiveTime)
          .map(item => ({ ...item.ppi, totalManufacturingTimeHours: item.effectiveTime })); // Overwrite with dynamic time
  };


  // --- 1. SETUP & HORIZON ---
  const productDetails = new Map<string, {name: string}>();
  salesData.forEach(s => {
    if (!productDetails.has(s.código)) {
      productDetails.set(s.código, { name: s.descripciónMaterial || s.etiqueta || s.código });
    }
  });

  let firstSaleDate: Date | null = null;
  let lastSaleDate: Date | null = null;
  salesData.forEach(s => {
    if (s.año > 0 && s.mes > 0 && s.mes <= 12) {
      const currentDate = new Date(s.año, s.mes - 1, 1);
      if (!firstSaleDate || currentDate < firstSaleDate) firstSaleDate = currentDate;
      if (!lastSaleDate || currentDate > lastSaleDate) lastSaleDate = currentDate;
    }
  });

  if (!firstSaleDate || !lastSaleDate) return { dailyPlan: [], monthlyPlan: [], auditLog: ['Could not determine planning horizon from sales data.'] };

  const planningHorizon: { year: number, month: number }[] = [];
  let currentHorizonDate = new Date(firstSaleDate);
  while(currentHorizonDate <= lastSaleDate) {
      planningHorizon.push({ year: currentHorizonDate.getFullYear(), month: currentHorizonDate.getMonth() + 1 });
      currentHorizonDate.setMonth(currentHorizonDate.getMonth() + 1);
  }
  auditLog.push(`\nHorizonte de planificación: ${planningHorizon.length} meses, desde ${firstSaleDate.toLocaleDateString()} hasta ${lastSaleDate.toLocaleDateString()}`);

  // --- 2. CALCULATE LINE AVAILABILITY ---
  const REGULAR_HOURS_PER_DAY = 8;
  const EXTRA_HOURS_PER_DAY = 2;
  const SATURDAY_HOLIDAY_HOURS = 5; // User defined hours for Sat/Hol
  auditLog.push(`\n--- SUPUESTOS DE HORAS DISPONIBLES POR DÍA ---`);
  auditLog.push(`- Horas Regulares (L-V): ${REGULAR_HOURS_PER_DAY}h (Jornada base en días laborables)`);
  auditLog.push(`- Horas Extra (L-V): ${EXTRA_HOURS_PER_DAY}h (costo: +${laborCostFactors?.factorAdicionalDiurno || 0}%)`);
  auditLog.push(`- Horas Sábado/Feriado Productivo: ${SATURDAY_HOLIDAY_HOURS}h (costo: +${laborCostFactors?.factorFinSemanaFeriado || 0}%)`);

  const lineMonthlyHours = new Map<string, LineHourAvailability[]>(); // lineId -> monthIndex -> {regular, extra, holiday}
  const activeLines = productionLines.filter(l => l.isActive !== false);

  activeLines.forEach(line => {
    const monthlyAvailability: LineHourAvailability[] = planningHorizon.map(({ year, month }) => {
      const availability: LineHourAvailability = { regular: 0, extra: 0, holiday: 0 };
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        const dayType = getDayTypeForProduction(d, holidays);
        if (dayType === 'Weekday') {
          availability.regular += REGULAR_HOURS_PER_DAY;
          availability.extra += EXTRA_HOURS_PER_DAY;
        } else if (dayType === 'Saturday' || dayType === 'ProductiveHoliday') {
          availability.holiday += SATURDAY_HOLIDAY_HOURS;
        }
      }
      return availability;
    });
    lineMonthlyHours.set(line.id, monthlyAvailability);
  });

  auditLog.push('\n--- HORAS TOTALES DISPONIBLES POR LÍNEA Y MES ---');
  lineMonthlyHours.forEach((availabilities, lineId) => {
    const lineName = activeLines.find(l => l.id === lineId)?.name || lineId;
    availabilities.forEach((avail, monthIndex) => {
      const { year, month } = planningHorizon[monthIndex];
      auditLog.push(`- ${lineName} (${year}/${month}): Reg: ${avail.regular.toFixed(0)}h, Ext: ${avail.extra.toFixed(0)}h, Hol: ${avail.holiday.toFixed(0)}h`);
    });
  });

  // --- 3. AGGREGATE DEMAND & STOCK BY PRODUCT/CENTER ---
  const planningGroups = new Map<string, { demands: number[]; initialStock: number; minStock: number; maxStock: number; }>();
  const allProductCenterPairs = new Set<string>();
  salesData.forEach(s => {
    if (s.código && s.centro) allProductCenterPairs.add(`${s.código}---${normalizeCenterName(s.centro)}`);
  });
  inventorySettings.forEach(is => {
    const center = workCenters.find(c => c.id === is.centerId);
    if(center) allProductCenterPairs.add(`${is.itemId}---${normalizeCenterName(center.name)}`);
  });

  for (const pair of allProductCenterPairs) {
    const [productId, centerName] = pair.split('---');
    const center = workCenters.find(wc => normalizeCenterName(wc.name) === centerName);
    if (!center) continue;

    const ppiOptions = getPpiOptionsForPair(pair, productProcessInfos, workCenters, activeLines);
    if (ppiOptions.length === 0) continue;

    const demands = planningHorizon.map(({ year, month }) => 
        salesData
            .filter(s => s.código === productId && normalizeCenterName(s.centro) === centerName && s.año === year && s.mes === month)
            .reduce((sum, s) => sum + s.unidadesProyectado, 0)
    );

    const invSetting = inventorySettings.find(is => is.itemId === productId && is.centerId === center.id);
    if (!demands.some(d => d > 0) && (!invSetting || invSetting.currentStock === 0)) continue;

    planningGroups.set(pair, {
        demands,
        initialStock: invSetting?.currentStock || 0,
        minStock: invSetting?.minStock || 0,
        maxStock: invSetting?.maxStock === 0 ? Infinity : invSetting?.maxStock || Infinity,
    });
  }

  // --- 4. CALCULATE MONTHLY PRODUCTION TARGETS (MRP-style Backwards Pass) ---
  const productionNeeds = new Map<string, number[]>();
  auditLog.push('\n--- FASE DE PLANIFICACIÓN MENSUAL (Hacia Atrás - Lógica MRP) ---');
  auditLog.push('Calcula la producción necesaria desde el último mes al primero para anticipar correctamente la capacidad.');

  for (const [pair, group] of planningGroups.entries()) {
    const needs = Array(planningHorizon.length).fill(0);
    let stockAtEndOfMonth = group.minStock; // Goal for the very end of the horizon

    for (let i = planningHorizon.length - 1; i >= 0; i--) {
      const demandThisMonth = group.demands[i];
      let projectedStockFromPrevious = (i === 0) 
        ? group.initialStock 
        : stockAtEndOfMonth; // Simplified start for this pass
      
      const productionNeeded = Math.max(0, demandThisMonth + group.minStock - projectedStockFromPrevious);
      
      // Cap production if it exceeds max stock
      const cappedProduction = Math.min(productionNeeded, (group.maxStock - projectedStockFromPrevious) > 0 ? (group.maxStock - projectedStockFromPrevious) : 0);
      
      needs[i] = cappedProduction;
      
      // Update stock for PREVIOUS month's calculation
      stockAtEndOfMonth = projectedStockFromPrevious + cappedProduction - demandThisMonth;
    }
     productionNeeds.set(pair, needs);
  }


  // --- 5. MONTHLY SCHEDULING (REVISED LOGIC WITH OVERFLOW) ---
  auditLog.push('\n\n--- INICIO DE ASIGNACIÓN MENSUAL (con plan anticipado y desborde inteligente) ---');
  const monthlyAssignments = new Map<string, { units: number; hours: LineHourAvailability; laborCost: number }>(); // key: `${monthIndex}-${lineId}-${productId}-${centerId}`

  // Refined Logic: This loop now also pushes unmet demand to previous months if capacity is insufficient.
  for (let monthIndex = planningHorizon.length - 1; monthIndex >= 0; monthIndex--) {
    const { year, month } = planningHorizon[monthIndex];
    auditLog.push(`\n--- MES DE PLANIFICACIÓN: ${MONTH_NAMES[month - 1]} ${year} (Pasada hacia atrás) ---`);

    const availableHoursThisMonth = new Map<string, LineHourAvailability>();
    lineMonthlyHours.forEach((monthlyAvail, lineId) => { 
        availableHoursThisMonth.set(lineId, { ...monthlyAvail[monthIndex] });
    });
    
    // Get all products that need production in this month
    const productsToPlanThisMonth: { pair: string, units: number, ppiOptions: ProductProcessInfo[] }[] = [];
    productionNeeds.forEach((needs, pair) => { 
        if (needs[monthIndex] > 0) {
            const ppiOptions = getPpiOptionsForPair(pair, productProcessInfos, workCenters, activeLines);
            if(ppiOptions.length > 0) {
                 productsToPlanThisMonth.push({ pair, units: needs[monthIndex], ppiOptions });
            }
        } 
    });

    // Schedule products on their most efficient lines first
    for(const prod of productsToPlanThisMonth) {
        let unitsLeftToPlan = prod.units;
        const [productId, centerName] = prod.pair.split('---');
        const center = workCenters.find(c => normalizeCenterName(c.name) === centerName);
        if (!center) continue;


        for (const ppi of prod.ppiOptions) { // Iterate through efficient lines
            if (unitsLeftToPlan < 0.1) break;

            const lineId = ppi.productionLineId;
            const lineAvailability = availableHoursThisMonth.get(lineId)!;
            const totalAvailable = lineAvailability.regular + lineAvailability.extra + lineAvailability.holiday;
            
            if (totalAvailable < 0.1 || ppi.totalManufacturingTimeHours < 0.001) continue;
            
            const maxUnitsCanMake = totalAvailable / ppi.totalManufacturingTimeHours;
            const unitsToMake = Math.min(unitsLeftToPlan, maxUnitsCanMake);
            
            const hoursToConsume = unitsToMake * ppi.totalManufacturingTimeHours;
            const consumedHours: LineHourAvailability = { regular: 0, extra: 0, holiday: 0 };
            let remainingHoursToAssign = hoursToConsume;
             for (const hourType of HOUR_COST_ORDER) {
                const available = lineAvailability[hourType];
                const consume = Math.min(remainingHoursToAssign, available);
                consumedHours[hourType] += consume;
                lineAvailability[hourType] -= consume;
                remainingHoursToAssign -= consume;
                if (remainingHoursToAssign < 0.01) break;
            }

            const laborCost = calculateLaborCost(consumedHours, ppi, globalBaseCostPerHour, laborCostFactors, workstationDefinitions);
            const assignmentKey = `${monthIndex}-${lineId}-${productId}-${center.id}`;
            const assignment = monthlyAssignments.get(assignmentKey) || { units: 0, hours: { regular: 0, extra: 0, holiday: 0 }, laborCost: 0 };
            assignment.units += unitsToMake;
            assignment.hours.regular += consumedHours.regular;
            assignment.hours.extra += consumedHours.extra;
            assignment.hours.holiday += consumedHours.holiday;
            assignment.laborCost += laborCost;
            monthlyAssignments.set(assignmentKey, assignment);
            
            unitsLeftToPlan -= unitsToMake;
        }

        // If there's still production left, push it to the previous month
        if (unitsLeftToPlan > 0.1 && monthIndex > 0) {
            auditLog.push(`  - Déficit para [${productId}] de ${unitsLeftToPlan.toFixed(0)} uds. Empujando al mes anterior.`);
            productionNeeds.get(prod.pair)![monthIndex-1] += unitsLeftToPlan;
        } else if (unitsLeftToPlan > 0.1) {
            auditLog.push(`  - !! DÉFICIT FINAL para [${productId}] de ${unitsLeftToPlan.toFixed(0)} uds. No hay más meses para anticipar.`);
        }
    }
  }


  // --- 6. CREATE DAILY PLAN ITEMS (Using a sequential "mini-scheduler") ---
  let stockState = new Map<string, number>(); // key: `${productId}-${centerId}`, value: currentStock
  planningGroups.forEach((group, pair) => {
    const [productId, centerName] = pair.split('---');
    const center = workCenters.find(wc => normalizeCenterName(wc.name) === centerName)!;
    stockState.set(`${productId}-${center.id}`, group.initialStock);
  });
  
  const rawDailyPlan: ProductionPlanItem[] = []; // Store transactions before consolidation
  
  for (let monthIndex = 0; monthIndex < planningHorizon.length; monthIndex++) {
    const { year, month } = planningHorizon[monthIndex];
    const daysInMonth = new Date(year, month, 0).getDate();
    
    // Create a mutable "bucket" of monthly production to be scheduled day-by-day
    const monthlyProductionBucket = new Map<string, { units: number; hours: number; cost: number }>();
    monthlyAssignments.forEach((assignment, key) => {
      const [mIdx, lineId, productId, centerId] = key.split('-');
      if (parseInt(mIdx) !== monthIndex) return;
      const bucketKey = `${lineId}-${productId}-${centerId}`;
      const totalHours = assignment.hours.regular + assignment.hours.extra + assignment.hours.holiday;
      monthlyProductionBucket.set(bucketKey, { units: assignment.units, hours: totalHours, cost: assignment.laborCost });
    });

    for (let day = 1; day <= daysInMonth; day++) {
      const currentDate = new Date(year, month - 1, day);
      
      // A: Process all demand for the day first
      const distributionDaysInMonth = Array.from({length: daysInMonth}, (_, i) => new Date(year, month - 1, i + 1)).filter(d => getDayTypeForProduction(d, holidays) !== 'Sunday' && getDayTypeForProduction(d, holidays) !== 'NonProductiveHoliday').length || 1;
      const isDistributionDay = getDayTypeForProduction(currentDate, holidays) !== 'Sunday' && getDayTypeForProduction(currentDate, holidays) !== 'NonProductiveHoliday';
      
      planningGroups.forEach((group, pair) => {
        const [productId, centerName] = pair.split('---');
        const center = workCenters.find(wc => normalizeCenterName(wc.name) === centerName)!;
        const stockKey = `${productId}-${center.id}`;
        const initialStockOnDay = stockState.get(stockKey)!;
        const dailyDemand = isDistributionDay ? (group.demands[monthIndex] / distributionDaysInMonth) : 0;
        
        if (dailyDemand > 0.01) {
            stockState.set(stockKey, initialStockOnDay - dailyDemand);
            rawDailyPlan.push({
                id: `${year}-${month}-${day}-${pair}-demand`, year, month, day, week: Math.ceil(day/7),
                productId, productName: productDetails.get(productId)?.name || productId,
                producingCenterId: center.name, assignedLineId: 'Demanda',
                initialStockOnDay, demandOnDay: dailyDemand, quantityToProduce: 0,
                finalStockOnDay: stockState.get(stockKey)!,
                hoursWorked: 0, estimatedLaborCost: 0, status: 'Planificado'
            });
        }
      });
      
      // B: Process production for the day by filling its capacity
      const dayType = getDayTypeForProduction(currentDate, holidays);
      const capacityForDay: Record<string, number> = {}; // lineId -> hours
      if (dayType === 'Weekday') activeLines.forEach(l => capacityForDay[l.id] = REGULAR_HOURS_PER_DAY + EXTRA_HOURS_PER_DAY);
      if (dayType === 'Saturday' || dayType === 'ProductiveHoliday') activeLines.forEach(l => capacityForDay[l.id] = SATURDAY_HOLIDAY_HOURS);
      
      for (const [bucketKey, bucket] of monthlyProductionBucket.entries()) {
        const [lineId, productId, centerId] = bucketKey.split('-');
        const line = activeLines.find(l => l.id === lineId);
        if (!line || !capacityForDay[lineId] || capacityForDay[lineId] <= 0.01) continue;
        
        const hoursToSchedule = Math.min(capacityForDay[lineId], bucket.hours);
        if (hoursToSchedule <= 0.01) continue;

        const proportionOfMonth = bucket.hours > 0 ? hoursToSchedule / bucket.hours : 0;
        const unitsToProduce = bucket.units * proportionOfMonth;
        const costForDay = bucket.cost * proportionOfMonth;

        // Update buckets
        bucket.units -= unitsToProduce;
        bucket.hours -= hoursToSchedule;
        bucket.cost -= costForDay;
        capacityForDay[lineId] -= hoursToSchedule;

        const center = workCenters.find(c => c.id === centerId)!;
        const stockKey = `${productId}-${center.id}`;
        const initialStockOnDay = stockState.get(stockKey)!;
        stockState.set(stockKey, initialStockOnDay + unitsToProduce);
        
        rawDailyPlan.push({
            id: `${year}-${month}-${day}-${line.id}-${productId}-prod`, year, month, day, week: Math.ceil(day/7),
            productId, productName: productDetails.get(productId)?.name || productId,
            producingCenterId: center.name, assignedLineId: line.name,
            initialStockOnDay, demandOnDay: 0, quantityToProduce: unitsToProduce,
            finalStockOnDay: stockState.get(stockKey)!,
            hoursWorked: hoursToSchedule, estimatedLaborCost: costForDay, status: 'Planificado'
        });
      }
    }
  }

  // --- 7. AGGREGATE FINAL PLAN ITEMS ---
  // A. Consolidate daily plan for a cleaner view
  const consolidatedDailyPlan = new Map<string, ProductionPlanItem>();
  rawDailyPlan
    .sort((a, b) => new Date(a.year, a.month-1, a.day).getTime() - new Date(b.year, b.month-1, b.day).getTime() || a.productId.localeCompare(b.productId))
    .forEach(item => {
        const key = `${item.year}-${item.month}-${item.day}-${item.productId}-${item.producingCenterId}`;
        const existing = consolidatedDailyPlan.get(key);
        if (!existing) {
            consolidatedDailyPlan.set(key, { ...item, id: key, assignedLineId: item.assignedLineId === 'Demanda' ? '' : item.assignedLineId });
        } else {
            existing.quantityToProduce += item.quantityToProduce;
            existing.demandOnDay += item.demandOnDay;
            existing.hoursWorked += item.hoursWorked;
            existing.estimatedLaborCost += item.estimatedLaborCost;
            existing.finalStockOnDay = item.finalStockOnDay; // Last transaction of day sets final stock
            if (item.assignedLineId && item.assignedLineId !== 'Demanda') {
                if (!existing.assignedLineId) existing.assignedLineId = item.assignedLineId;
                else if (!existing.assignedLineId.split(', ').includes(item.assignedLineId)) existing.assignedLineId += `, ${item.assignedLineId}`;
            }
        }
    });

  // B. Aggregate monthly plan from the scheduled daily items
  const monthlyPlanMap = new Map<string, MonthlyProductionPlanItem>();
  Array.from(consolidatedDailyPlan.values()).filter(p => p.quantityToProduce > 0).forEach(dp => {
    const key = `${dp.year}-${dp.month}-${dp.productId}-${dp.producingCenterId}`;
    if (!monthlyPlanMap.has(key)) {
        monthlyPlanMap.set(key, {
            id: key, year: dp.year, month: dp.month, productId: dp.productId,
            productName: dp.productName, producingCenterId: dp.producingCenterId,
            totalQuantityToProduce: 0, totalHoursWorked: 0, totalEstimatedLaborCost: 0
        });
    }
    const mp = monthlyPlanMap.get(key)!;
    mp.totalQuantityToProduce += dp.quantityToProduce;
    mp.totalHoursWorked += dp.hoursWorked;
    mp.totalEstimatedLaborCost += dp.estimatedLaborCost;
  });

  // --- 8. FINAL AUDIT SUMMARY ---
    auditLog.push('\n--- RESUMEN FINAL DE CUMPLIMIENTO ---');
    auditLog.push('Compara la demanda total del período con la producción total planificada para cada producto.');
    let totalDemand = 0;
    let totalProduction = 0;
    planningGroups.forEach((group, pair) => {
        const [productId] = pair.split('---');
        const demand = group.demands.reduce((a, b) => a + b, 0);
        const production = Array.from(monthlyPlanMap.values())
            .filter(ppi => ppi.productId === productId)
            .reduce((sum, p) => sum + p.totalQuantityToProduce, 0);
        totalDemand += demand;
        totalProduction += production;
        const difference = production - demand;
        const status = difference >= -0.1 ? 'OK' : 'DÉFICIT';
        if (demand > 0) {
            auditLog.push(`- Prod [${productId}]: Demanda=${demand.toFixed(0)}, Prod=${production.toFixed(0)}, Dif=${difference.toFixed(0)} -> ${status}`);
        }
    });
    auditLog.push(`\n- RESUMEN GLOBAL: Demanda Total = ${totalDemand.toFixed(0)}, Producción Total = ${totalProduction.toFixed(0)}`);
    auditLog.push('- NOTA: Los déficits generalmente ocurren por limitaciones en la capacidad total de horas de trabajo en todo el período o por alcanzar el límite de Stock Máximo, lo que impide adelantar producción.');


  return { 
    dailyPlan: Array.from(consolidatedDailyPlan.values()).filter(p => p.quantityToProduce > 0.01 || p.demandOnDay > 0.01).sort((a,b) => a.year - b.year || a.month - b.month || a.day - b.day || a.productId.localeCompare(b.productId) || (a.producingCenterId || '').localeCompare(b.producingCenterId || '')),
    monthlyPlan: Array.from(monthlyPlanMap.values()).sort((a,b) => a.year - b.year || a.month - b.month || a.productId.localeCompare(b.productId) || (a.producingCenterId || '').localeCompare(b.producingCenterId || '')),
    auditLog
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

  // --- Sheet 2: Summary by Line ---
  const summaryData = generateLineSummaryData(plan, constraints);
  const summaryDataToExport = summaryData.map(item => ({
    'Año': item.year,
    'Mes': item.month,
    'Centro': item.centerName,
    'Línea': item.lineName,
    'Demanda (Unid.)': Math.round(item.demand), // Approximation
    'Producción (Unid.)': Math.round(item.production),
    'Días Laborables en Mes': item.workingDays,
    'Horas Promedio (L-V)': item.avgWeekdayHours,
    'Sábados Trabajados': item.saturdaysWorked,
    'Horas Promedio (Sáb)': item.avgSaturdayHours,
    'Feriados Trabajados': item.holidaysWorked,
    'Horas en Feriados': item.holidayHours,
  }));
  const summaryWorksheet = XLSX.utils.json_to_sheet(summaryDataToExport);
  const summaryColWidths = [
    { wch: 6 }, { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, 
    { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 20 }, { wch: 22 }, 
    { wch: 20 }, { wch: 18 },
  ];
  summaryWorksheet['!cols'] = summaryColWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dailyWorksheet, 'Plan de Producción Diario');
  XLSX.utils.book_append_sheet(workbook, summaryWorksheet, 'Resumen por Línea');

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

    const colWidths = [
        { wch: 6 },
        { wch: 10 },
        { wch: 15 },
        { wch: 30 },
        { wch: 15 },
        { wch: 18 },
        { wch: 15 },
        { wch: 22 },
    ];
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plan Mensual');

    XLSX.writeFile(workbook, 'Plan_Produccion_Mensual.xlsx');
};

/**
 * A new function to correctly process production time data from the file
 * and integrate it into the existing constraints structure. This separates
 * file parsing from data processing, improving code clarity.
 */
export function processImportedProductionData(
    parsedData: ParsedProductionData,
    currentConstraints: AppConstraints,
    uniqueProducts: { id: string, name: string }[]
): {
    productProcessInfos: ProductProcessInfo[],
    inventorySettings: InventorySetting[],
    validationErrors: string[]
} {
    const validationErrors: string[] = [];
    const { times, supplyInfos } = parsedData;

    // --- Create helper maps for quick lookup of existing, active constraints ---
    const activeWorkCenters = currentConstraints.workCenters.filter(wc => wc.isActive !== false);
    const activeLines = currentConstraints.productionLines.filter(pl => pl.isActive !== false);
    const activeWorkstationDefs = currentConstraints.workstationDefinitions.filter(wd => wd.isActive !== false);

    const centerMap = new Map(activeWorkCenters.map(wc => [normalizeCenterName(wc.name), wc]));
    const lineMap = new Map(activeLines.map(pl => [`${pl.workCenterId}-${pl.name.toLowerCase()}`, pl]));
    const workstationDefMap = new Map(activeWorkstationDefs.map(wd => [wd.name.toLowerCase(), wd]));

    // --- 1. Validation Phase ---
    // This phase checks for inconsistencies before any data processing begins.
    times.forEach(row => {
        const center = centerMap.get(normalizeCenterName(row.centro));
        if (!center) {
            validationErrors.push(`Fila ${row.rowIndex}: El centro '${row.centro}' no existe o está inactivo en la configuración.`);
            return; // No need to check line if center is invalid
        }

        const line = lineMap.get(`${center.id}-${row.linea.toLowerCase()}`);
        if (!line) {
            validationErrors.push(`Fila ${row.rowIndex}: La línea '${row.linea}' no existe en el centro '${row.centro}' o está inactiva.`);
            return; // No need to check workstation if line is invalid
        }

        const workstationDef = workstationDefMap.get(row.puestoTrabajo.toLowerCase());
        if (!workstationDef) {
            validationErrors.push(`Fila ${row.rowIndex}: El puesto de trabajo '${row.puestoTrabajo}' no existe o está inactivo en la configuración.`);
            return;
        }

        // CRITICAL CHECK: Ensure the workstation is actually assigned to the line in the configuration.
        const isWorkstationAssigned = line.assignedWorkstations.some(as => as.definitionId === workstationDef.id);
        if (!isWorkstationAssigned) {
            validationErrors.push(`Fila ${row.rowIndex}: El puesto '${row.puestoTrabajo}' NO ESTÁ ASIGNADO a la línea '${row.linea}' en la configuración.`);
        }
    });

    // If any validation errors were found, stop processing and return the errors.
    if (validationErrors.length > 0) {
        return {
            productProcessInfos: [],
            inventorySettings: [],
            validationErrors
        };
    }

    // --- 2. Processing Phase (only if validation passes) ---
    // This aggregator groups all workstation times for a product on a specific line.
    const processInfoAggregator = new Map<string, {
        productId: string;
        productionLineId: string;
        workstationTimes: { workstationDefinitionId: string; timeHours: number; }[];
        rows: number[];
    }>();

    times.forEach(row => {
        const center = centerMap.get(normalizeCenterName(row.centro))!;
        const line = lineMap.get(`${center.id}-${row.linea.toLowerCase()}`)!;
        const workstationDef = workstationDefMap.get(row.puestoTrabajo.toLowerCase())!;

        const key = `${row.códigoMaterial}-${line.id}`;
        if (!processInfoAggregator.has(key)) {
            processInfoAggregator.set(key, {
                productId: row.códigoMaterial,
                productionLineId: line.id,
                workstationTimes: [],
                rows: []
            });
        }
        const info = processInfoAggregator.get(key)!;
        // The time from the Excel file is in minutes. Convert it to hours.
        const timeInHours = row.tiempo / 60;
        info.workstationTimes.push({ workstationDefinitionId: workstationDef.id, timeHours: timeInHours });
        info.rows.push(row.rowIndex);
    });

    const finalProcessInfoData = new Map<string, ProductProcessInfo>();
    processInfoAggregator.forEach((aggData, key) => {
        const line = activeLines.find(l => l.id === aggData.productionLineId)!;
        const center = activeWorkCenters.find(c => c.id === line.workCenterId)!;
        const supply = supplyInfos.find(s => s.código === aggData.productId && normalizeCenterName(s.centro) === normalizeCenterName(center.name));
        const totalTimeSum = aggData.workstationTimes.reduce((sum, wt) => sum + wt.timeHours, 0);
        const productName = uniqueProducts.find(p => p.id === aggData.productId)?.name || aggData.productId;

        finalProcessInfoData.set(key, {
            id: `ppi-${aggData.productId}-${aggData.productionLineId}`,
            productId: aggData.productId,
            productName: productName,
            productionLineId: aggData.productionLineId,
            workstationTimes: aggData.workstationTimes,
            totalManufacturingTimeHours: totalTimeSum, // This will be recalculated dynamically in the planner.
            aprovisionamientoEspecial: supply?.aprovisionamiento,
        });
    });
    
    // --- 3. Process Inventory Settings from the same file ---
    const inventoryMap = new Map<string, InventorySetting>();
    times.forEach(row => {
        const center = centerMap.get(normalizeCenterName(row.centro));
        if (!center || !row.códigoMaterial) return;
        const key = `${row.códigoMaterial}-${center.id}`;
        if (!inventoryMap.has(key)) {
            const productName = uniqueProducts.find(p => p.id === row.códigoMaterial)?.name || row.códigoMaterial;
            inventoryMap.set(key, {
                id: `inv-${row.códigoMaterial}-${center.id}`,
                itemId: row.códigoMaterial,
                itemName: productName,
                centerId: center.id,
                isRawMaterial: false,
                minStock: row.stockSeguridad,
                maxStock: row.stockMaximo,
                currentStock: row.saldoInicial,
            });
        }
    });

    return {
        productProcessInfos: Array.from(finalProcessInfoData.values()),
        inventorySettings: Array.from(inventoryMap.values()),
        validationErrors: [] // No errors
    };
}


// --- Tactical Scheduling ---
const parseDateFromExcel = (dateValue: any): string | null => {
    if (typeof dateValue === 'number') {
        // Handle Excel serial number dates
        const date = new Date(Date.UTC(1899, 11, 30 + dateValue));
        return date.toISOString().split('T')[0];
    }
    if (typeof dateValue === 'string') {
        // Handle string dates like 'D/M/YYYY' or other formats
        const parts = dateValue.match(/(\d+)/g);
        if (parts && parts.length >= 3) {
            let day, month, year;
            // Attempt to parse common formats like D/M/YYYY or M/D/YYYY
            if (parseInt(parts[0]) > 12 || parseInt(parts[1]) > 12) { // Heuristic for DD/MM/YYYY
                day = parseInt(parts[0]);
                month = parseInt(parts[1]);
                year = parseInt(parts[2]);
            } else { // Can be ambiguous, assume M/D/YYYY for US format or D/M for others. Let's try D/M/YYYY as a common non-US standard.
                day = parseInt(parts[0]);
                month = parseInt(parts[1]);
                year = parseInt(parts[2]);
            }
            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                const fullYear = year < 100 ? 2000 + year : year;
                if(fullYear > 1900 && month > 0 && month <= 12 && day > 0 && day <= 31) {
                    return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                }
            }
        }
    }
    return null; // Return null if format is not recognized
};


export const parseTacticalOrdersExcel = (file: File): Promise<ProvisionalOrder[]> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!worksheet) {
            reject(new Error("No se encontró una hoja de cálculo válida en el archivo."));
            return;
        }

        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false });
        
        const firstRowWithData = jsonData.findIndex(row => row && row.some(cell => cell !== null && cell !== undefined && cell !== ''));
        if (firstRowWithData === -1) {
            resolve([]);
            return;
        }

        const headers = jsonData[firstRowWithData].map(h => String(h || '').trim().toUpperCase().replace(/\s+/g, ''));
        const headerMap: { [key in keyof ProvisionalOrder]?: number } = {
            ORDENPREVISIONAL: headers.indexOf('ORDENPREVISIONAL'),
            MATERIAL: headers.indexOf('MATERIAL'),
            NOMBRE: headers.indexOf('NOMBRE'),
            CANTIDAD: headers.indexOf('CANTIDAD'),
            FECHAINICIO: headers.indexOf('FECHAINICIO'),
            CENTRO: headers.indexOf('CENTRO'),
        };
        
        const requiredHeaders: (keyof ProvisionalOrder)[] = ['MATERIAL', 'CANTIDAD', 'FECHAINICIO', 'CENTRO'];
        for (const h of requiredHeaders) {
            if (headerMap[h] === undefined || headerMap[h] === -1) {
                reject(new Error(`El archivo de órdenes previsionales debe contener la columna '${h}'.`));
                return;
            }
        }

        const orders: ProvisionalOrder[] = jsonData.slice(firstRowWithData + 1).map((row, index) => {
          if(!row || row.filter(cell => cell !== null && cell !== undefined && cell !== '').length === 0) return null; 
          
          const orderDate = parseDateFromExcel(row[headerMap.FECHAINICIO!]);
          if (!orderDate) return null;

          return {
            rowIndex: index + firstRowWithData + 2,
            ORDENPREVISIONAL: String(row[headerMap.ORDENPREVISIONAL!] || ''),
            MATERIAL: String(row[headerMap.MATERIAL!] || '').trim(),
            NOMBRE: String(row[headerMap.NOMBRE!] || ''),
            CANTIDAD: parseFloat(String(row[headerMap.CANTIDAD!])) || 0,
            FECHAINICIO: orderDate,
            CENTRO: String(row[headerMap.CENTRO!] || '').trim(),
          };
        }).filter((row): row is ProvisionalOrder => row !== null && !!row.MATERIAL && !!row.CENTRO && row.CANTIDAD > 0); 

        resolve(orders);
      } catch (error) {
        console.error("Error processing Tactical Orders Excel:", error);
        reject(new Error('Formato de archivo Excel de órdenes previsionales inválido.'));
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};


export const generateTacticalPlan = (
    request: TacticalRequest,
    context: {
        dailyPlan: ProductionPlanItem[];
        constraints: AppConstraints;
        maintenanceEvents: MaintenanceEvent[];
        absenteeismEvents: AbsenteeismEvent[];
        employees: Employee[];
        employeeSkills: EmployeeSkill[];
    }
): TacticalPlanResult => {
    const alerts: string[] = [];
    const tacticalPlan: TacticalOrderItem[] = [];
    const { provisionalOrders, targetDate } = request;
    const { constraints, maintenanceEvents, absenteeismEvents, employees, employeeSkills } = context;

    // --- 1. Filter and Prepare Context for Target Date ---
    const targetDateTime = new Date(targetDate + "T00:00:00").getTime();
    
    // Available lines (not in maintenance)
    const linesInMaintenance = new Set<string>();
    maintenanceEvents.forEach(event => {
        const start = new Date(`${event.startDate}T${event.startTime}`).getTime();
        const end = new Date(`${event.endDate}T${event.endTime}`).getTime();
        if (targetDateTime >= start && targetDateTime <= end) {
            linesInMaintenance.add(event.productionLineId);
            alerts.push(`Alerta Mantenimiento: Línea '${constraints.productionLines.find(l => l.id === event.productionLineId)?.name}' no estará disponible por '${event.title}'.`);
        }
    });
    const availableLines = constraints.productionLines.filter(line => !linesInMaintenance.has(line.id) && line.isActive !== false);

    // Available employees (present and active)
    const absentEmployeeIds = new Set<string>();
    absenteeismEvents.forEach(event => {
        const start = new Date(`${event.startDate}T${event.startTime}`).getTime();
        const end = new Date(`${event.endDate}T${event.endTime}`).getTime();
        if (targetDateTime >= start && targetDateTime <= end) {
            event.employeeIds.forEach(id => absentEmployeeIds.add(id));
        }
    });
    const availableEmployees = employees.filter(emp => emp.isActive !== false && !absentEmployeeIds.has(emp.id));
    if(absentEmployeeIds.size > 0) {
        alerts.push(`Info: ${absentEmployeeIds.size} empleado(s) no estarán disponibles por ausentismo programado.`);
    }

    // --- 2. Consolidate Tactical Demand ---
    const tacticalDemand = new Map<string, number>(); // key: `${productId}-${centerName}`
    
    // From medium-term plan
    const [tYear, tMonth, tDay] = targetDate.split('-').map(Number);
    context.dailyPlan.forEach(item => {
        if(item.year === tYear && item.month === tMonth && item.day === tDay && item.quantityToProduce > 0) {
            const key = `${item.productId}-${normalizeCenterName(item.producingCenterId!)}`;
            tacticalDemand.set(key, (tacticalDemand.get(key) || 0) + item.quantityToProduce);
        }
    });

    // From provisional orders file
    provisionalOrders.forEach(order => {
        if (order.FECHAINICIO === targetDate) {
            const key = `${order.MATERIAL}-${normalizeCenterName(order.CENTRO)}`;
            const currentDemand = tacticalDemand.get(key) || 0;
            tacticalDemand.set(key, Math.max(currentDemand, order.CANTIDAD));
        }
    });

    // --- 3. Feasibility Analysis ---
    const lineCapacityToday: Record<string, number> = {};
    const dayType = getDayTypeForProduction(new Date(targetDate + "T12:00:00"), constraints.holidays);
    const REGULAR_HOURS_PER_DAY = 8; const EXTRA_HOURS_PER_DAY = 2; const SATURDAY_HOLIDAY_HOURS = 5;
    
    if (dayType === 'Weekday') availableLines.forEach(l => lineCapacityToday[l.id] = REGULAR_HOURS_PER_DAY + EXTRA_HOURS_PER_DAY);
    else if (dayType === 'Saturday' || dayType === 'ProductiveHoliday') availableLines.forEach(l => lineCapacityToday[l.id] = SATURDAY_HOLIDAY_HOURS);
    else {
        alerts.push(`Alerta de Calendario: El día ${targetDate} es un ${dayType}, no se puede programar producción.`);
        return { plan: [], alerts };
    }


    tacticalDemand.forEach((quantity, key) => {
        const [productId, centerName] = key.split('-');
        const productInfo = constraints.productProcessInfos.find(p => p.productId === productId);
        if(!productInfo){
            alerts.push(`Alerta de Datos: No se encontró información de proceso para el producto '${productId}'. No se puede planificar.`);
            return;
        }
        
        const center = constraints.workCenters.find(c => normalizeCenterName(c.name) === centerName);
        if(!center) {
            alerts.push(`Alerta de Datos: No se encontró el centro '${centerName}' para el producto '${productId}'.`);
            return;
        }

        const possibleLines = availableLines
            .filter(line => line.workCenterId === center.id && constraints.productProcessInfos.some(ppi => ppi.productId === productId && ppi.productionLineId === line.id))
            .map(line => ({ line, time: calculateEffectiveManufacturingTime(constraints.productProcessInfos.find(ppi => ppi.productId === productId && ppi.productionLineId === line.id)!, line) }))
            .filter(l => l.time < Infinity)
            .sort((a,b) => a.time - b.time);

        if (possibleLines.length === 0) {
            alerts.push(`Déficit de Línea: No hay líneas de producción disponibles o configuradas correctamente para fabricar '${productInfo.productName}' en el centro '${center.name}'.`);
            return;
        }

        const bestLine = possibleLines[0].line;
        const timePerUnit = possibleLines[0].time;
        const requiredHours = quantity * timePerUnit;

        if(requiredHours > lineCapacityToday[bestLine.id]) {
            const deficit = requiredHours - lineCapacityToday[bestLine.id];
            alerts.push(`Déficit de Capacidad: Se requieren ${requiredHours.toFixed(1)}h para '${productInfo.productName}' en la línea '${bestLine.name}', pero solo quedan ${lineCapacityToday[bestLine.id].toFixed(1)}h. Faltan ${deficit.toFixed(1)}h.`);
            // Don't produce if capacity is insufficient
            return;
        }
        lineCapacityToday[bestLine.id] -= requiredHours;

        // Personnel Assignment
        const assignedPersonnel: AssignedPersonnel[] = [];
        let personnelOk = true;
        const requiredWorkstations = bestLine.assignedWorkstations;
        requiredWorkstations.forEach(reqWs => {
            const workstationDef = constraints.workstationDefinitions.find(wd => wd.id === reqWs.definitionId);
            if(!workstationDef) return;

            const qualifiedEmployees = availableEmployees
                .filter(emp => employeeSkills.some(skill => skill.employeeId === emp.id && skill.workstationDefinitionId === reqWs.definitionId && skill.skillLevel > 0))
                .sort((a, b) => {
                    const skillA = employeeSkills.find(s => s.employeeId === a.id && s.workstationDefinitionId === reqWs.definitionId)!.skillLevel;
                    const skillB = employeeSkills.find(s => s.employeeId === b.id && s.workstationDefinitionId === reqWs.definitionId)!.skillLevel;
                    return skillB - skillA;
                });
            
            if(qualifiedEmployees.length < reqWs.quantity) {
                alerts.push(`Déficit de Personal: Faltan ${reqWs.quantity - qualifiedEmployees.length} empleado(s) calificado(s) para el puesto '${workstationDef.name}' en la línea '${bestLine.name}'.`);
                personnelOk = false;
            }

            assignedPersonnel.push({
                workstationDefinitionId: workstationDef.id,
                workstationName: workstationDef.name,
                required: reqWs.quantity,
                available: qualifiedEmployees,
            });
        });

        if (personnelOk) {
             tacticalPlan.push({
                id: `tactical-${key}`,
                productId: productId,
                productName: productInfo.productName || productId,
                centerName: center.name,
                quantity: Math.round(quantity),
                assignedLineName: bestLine.name,
                requiredHours: parseFloat(requiredHours.toFixed(2)),
                assignedPersonnel: assignedPersonnel
            });
        }
    });

    return { plan: tacticalPlan.sort((a,b) => a.assignedLineName.localeCompare(b.assignedLineName) || a.productName.localeCompare(b.productName)), alerts };
};
