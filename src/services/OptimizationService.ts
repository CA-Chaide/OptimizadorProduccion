

import { 
    SalesDataRow, AppConstraints, ProductionPlan, ProductionPlanItem, 
    ProductProcessInfo, WorkCenter, ProductionLine, LaborCostSettings, InventorySetting, Holiday,
    MonthlyInventoryState, ProcessType, WorkstationDefinition,
    SupplyInfo, MonthlyProductionPlanItem, NotificationMessage, LineMonthlySummary, 
    TacticalRequest, TacticalPlanResult, TacticalOrderItem, ProvisionalOrder, Employee, EmployeeSkill, MaintenanceEvent, AbsenteeismEvent, AssignedPersonnel, ShiftParameters,
    Machine, Qualification, TiempoEnsambleItem, DetailedProductionPlan, PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment, PresupuestoItem,
    PlanningProgress, WeeklyPlanItem, DemandAnalysisResult, CuboInventariosItem
} from '@/types/types';
import { MONTH_NAMES, PROCESS_TYPE_OPTIONS } from '@/constants/constants'; 
import { queryApi } from '@/hooks/useApiData';
import { logger } from './LogService';

declare var XLSX: any; 

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

export const analyzeSalesDemand = async (
    salesData: SalesDataRow[],
    cuboInventariosData: CuboInventariosItem[],
    constraints: AppConstraints,
    inventoryFilters: { centros: string[]; sectores: string[] }
): Promise<DemandAnalysisResult> => {
    const auditLog: string[] = [];
    auditLog.push(`[${new Date().toLocaleTimeString()}] Iniciando análisis de demanda con ${salesData.length} registros de venta y ${cuboInventariosData.length} registros de CuboInventarios.`);
    
    const totalDemand = salesData.reduce((sum, row) => sum + row.unidadesProyectado, 0);

    const demandByGroupMap = new Map<string, {
        claseAprovisionamiento: 'E' | 'X' | 'F' | 'N/A';
        centro: string;
        sector: string;
        totalUnidades: number;
    }>();
    
    const transfersMap = new Map<string, {
        centro: string;
        sector: string;
        etiqueta: string;
        totalUnidades: number;
    }>();

    const unclassifiedMaterials: DemandAnalysisResult['unclassifiedMaterials'] = [];
    const cuboMap = new Map<string, CuboInventariosItem>();
    
    // Aplicar filtros de inventario
    const filteredCuboData = cuboInventariosData.filter(item => 
        inventoryFilters.centros.includes(String(item.Centro).trim()) &&
        inventoryFilters.sectores.includes(item.Sector || 'Sin Sector')
    );
    auditLog.push(`[${new Date().toLocaleTimeString()}] Aplicados filtros de inventario. Se usarán ${filteredCuboData.length} de ${cuboInventariosData.length} registros para el saldo inicial.`);

    filteredCuboData.forEach(item => {
        const key = `${normalizeMaterialCode(item.Material)}---${String(item.Centro).trim()}`;
        cuboMap.set(key, item);
    });
    
    auditLog.push(`[${new Date().toLocaleTimeString()}] Creado mapa de búsqueda de CuboInventarios con ${cuboMap.size} entradas únicas.`);

    salesData.forEach(row => {
        const productId = normalizeMaterialCode(row.código);
        const centerId = String(row.centro).trim();
        const sector = row.sector || 'Sin Sector';
        
        let claseAprovisionamiento: 'E' | 'X' | 'F' | 'N/A' = 'N/A';

        // Lógica para obtener ClaseAprovisionamiento de cualquier registro de CuboInventarios, no solo los filtrados
        const primaryKey = `${productId}---${centerId}`;
        const fallbackKey = `${productId}---1000`;
        
        const primaryEntry = cuboInventariosData.find(item => `${normalizeMaterialCode(item.Material)}---${String(item.Centro).trim()}` === primaryKey);
        const fallbackEntry = cuboInventariosData.find(item => `${normalizeMaterialCode(item.Material)}---${String(item.Centro).trim()}` === fallbackKey);
        
        if (primaryEntry && primaryEntry.ClaseAprovisionam) {
            claseAprovisionamiento = primaryEntry.ClaseAprovisionam;
        } else if (centerId !== '1000' && fallbackEntry && fallbackEntry.ClaseAprovisionam === 'F') {
            claseAprovisionamiento = 'F';
        } else if (String(row.código).startsWith('3') || String(row.código).startsWith('4')) {
             unclassifiedMaterials.push({
                productId: row.código,
                productName: row.descripciónMaterial,
                centerId: centerId,
                sector: sector,
                demand: row.unidadesProyectado
            });
        }
        
        if (claseAprovisionamiento !== 'N/A') {
            const groupKey = `${claseAprovisionamiento}-${centerId}-${sector}`;

            if (!demandByGroupMap.has(groupKey)) {
                demandByGroupMap.set(groupKey, {
                    claseAprovisionamiento,
                    centro: centerId,
                    sector: sector,
                    totalUnidades: 0,
                });
            }
            const group = demandByGroupMap.get(groupKey)!;
            group.totalUnidades += row.unidadesProyectado;
        }

        // Agregación para reporte de transferencias
        if (claseAprovisionamiento === 'F' && centerId !== '1000') {
            const transferKey = `${centerId}-${sector}-${row.etiqueta}`;
            if (!transfersMap.has(transferKey)) {
                transfersMap.set(transferKey, {
                    centro: centerId,
                    sector,
                    etiqueta: row.etiqueta,
                    totalUnidades: 0
                });
            }
            transfersMap.get(transferKey)!.totalUnidades += row.unidadesProyectado;
        }
    });

    const demandByGroup = Array.from(demandByGroupMap.values())
        .sort((a, b) => {
            if (a.centro < b.centro) return -1;
            if (a.centro > b.centro) return 1;
            if (a.claseAprovisionamiento < b.claseAprovisionamiento) return -1;
            if (a.claseAprovisionamiento > b.claseAprovisionamiento) return 1;
            return a.sector.localeCompare(b.sector);
        });

    const transfers = Array.from(transfersMap.values())
        .sort((a, b) => {
            if (a.centro < b.centro) return -1;
            if (a.centro > b.centro) return 1;
            return a.sector.localeCompare(b.sector);
        });

    auditLog.push(`[${new Date().toLocaleTimeString()}] Análisis de demanda completado. Total de demanda bruta: ${totalDemand.toLocaleString()}. Grupos clasificados: ${demandByGroup.length}.`);

    if(unclassifiedMaterials.length > 0) {
        auditLog.push(`[${new Date().toLocaleTimeString()}] ADVERTENCIA: Se encontraron ${unclassifiedMaterials.length} registros de demanda para materiales fabricables (código inicia con 3 o 4) pero sin Clase de Aprovisionamiento definida en CuboInventarios.`);
    }

    return { totalDemand, demandByGroup, unclassifiedMaterials, auditLog, transfers };
};

export function processAndValidateAssemblyData(
    apiData: TiempoEnsambleItem[],
    currentConstraints: AppConstraints,
): {
    newConstraints: AppConstraints,
    validationErrors: string[],
    dataCompletenessErrors: string[]
} {
    const timestamp = new Date().toLocaleTimeString();
    logger.log(`[${timestamp}] --- INICIANDO PROCESAMIENTO Y VALIDACIÓN DE DATOS DE ENSAMBLE --- (Datos recibidos: ${apiData.length})`, 'info');
    const validationErrors: string[] = [];
    const dataCompletenessErrors: string[] = [];
    
    apiData.forEach((row, index) => {
        if (!row.CodMaterial) dataCompletenessErrors.push(`Fila API ${index + 1}: Falta 'CodMaterial'.`);
        if (!row.Centro) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'Centro'.`);
        if (!row.Linea) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'Linea'.`);
        if (!row.PuestoTrabajo) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'PuestoTrabajo'.`);
        if (row.Tiempo === null || row.Tiempo === undefined) dataCompletenessErrors.push(`Fila API ${index + 1} (Mat: ${row.CodMaterial}): Falta 'Tiempo'.`);
        if (row.ClaseAprovisionamiento === null || row.ClaseAprovisionamiento === undefined) {
          // No es un error fatal, pero se puede loguear si se desea
          // logger.log(`Fila API ${index+1} (Mat: ${row.CodMaterial}) no tiene ClaseAprovisionamiento. Se tratará como 'E'.`, 'warning');
        }
    });

    if (dataCompletenessErrors.length > 0) {
        logger.log(`[${timestamp}] [VALIDATION ERRORS] Errores de completitud de datos: ${dataCompletenessErrors.join(', ')}`, 'error');
        return { newConstraints: currentConstraints, validationErrors, dataCompletenessErrors };
    }

    const discoveredWorkCenters = new Map<string, WorkCenter>();
    const discoveredLines = new Map<string, ProductionLine>();
    const discoveredWorkstations = new Map<string, WorkstationDefinition>();
    const productProcessInfos: ProductProcessInfo[] = [];

    apiData.forEach(row => {
        const centerId = String(row.Centro).trim();
        if (!discoveredWorkCenters.has(centerId)) {
            discoveredWorkCenters.set(centerId, { id: centerId, name: `Planta ${centerId}`, productionLineIds: [], isActive: true });
        }

        const workstationName = String(row.PuestoTrabajo).trim();
        const workstationId = `wd---${centerId}---${workstationName}`;
        if (!discoveredWorkstations.has(workstationId)) {
            discoveredWorkstations.set(workstationId, { id: workstationId, name: workstationName, employeesPerWorkstation: 1, machineCode: null, isActive: true });
        }

        const lineName = String(row.Linea).trim();
        const lineId = `pl---${centerId}---${lineName}`;
        if (!discoveredLines.has(lineId)) {
             const userEditedLine = currentConstraints.productionLines.find(l => l.id === lineId);
            discoveredLines.set(lineId, {
                id: lineId, name: lineName, workCenterId: centerId,
                processType: userEditedLine?.processType || 'Colchones',
                assignedWorkstations: [], capacity: { maxUnitsPerHour: 0, normalUnitsPerHour: 0, minUnitsPerHour: 0 },
                materialsHandled: [], isActive: true
            });
            const center = discoveredWorkCenters.get(centerId);
            if (center && !center.productionLineIds.includes(lineId)) center.productionLineIds.push(lineId);
        }
    });
    
    discoveredLines.forEach(line => {
        const workstationIdsForLine = new Set<string>();
        apiData.forEach(row => {
            const centerId = String(row.Centro).trim();
            const lineName = String(row.Linea).trim();
            
            if (centerId === line.workCenterId && lineName === line.name) {
                const workstationName = String(row.PuestoTrabajo).trim();
                const workstationId = `wd---${centerId}---${workstationName}`;
                workstationIdsForLine.add(workstationId);
            }
        });
        
        line.assignedWorkstations = Array.from(workstationIdsForLine).map(wsId => ({
            definitionId: wsId,
            quantity: 1 
        }));
    });
    
    discoveredLines.forEach(line => {
        const predefinedQuantities = getPredefinedQuantities(line.workCenterId, line.name);
        const userEditedLine = currentConstraints.productionLines.find(l => l.id === line.id);
        
        line.assignedWorkstations.forEach(as => {
            const predefined = predefinedQuantities.find(p => p.definitionId === as.definitionId);
            const userDefined = userEditedLine?.assignedWorkstations.find(u => u.definitionId === as.definitionId);
            
            if (userDefined) {
                as.quantity = userDefined.quantity;
            } else if (predefined) {
                as.quantity = predefined.quantity;
            } else {
                as.quantity = 1;
            }
        });
    });
    
    const uniqueProductLinePairs = new Set<string>();
    apiData.forEach(row => {
        const productId = normalizeMaterialCode(row.CodMaterial);
        const centerId = String(row.Centro).trim();
        const lineName = String(row.Linea).trim();
        const lineId = `pl---${centerId}---${lineName}`;
        uniqueProductLinePairs.add(`${productId}---${lineId}`);
    });
    
    uniqueProductLinePairs.forEach(pairKey => {
        const [productId, lineId] = pairKey.split('---');
        const line = discoveredLines.get(lineId);
        if (!line) return;

        const workstationTimes: { workstationDefinitionId: string; timeHours: number }[] = [];
        let totalManufacturingTimeHours = 0;
        
        const workstationDefsForLine = line.assignedWorkstations.map(as => discoveredWorkstations.get(as.definitionId)).filter(Boolean) as WorkstationDefinition[];

        for (const workstationDef of workstationDefsForLine) {
            const apiRow = apiData.find(d => 
                normalizeMaterialCode(d.CodMaterial) === productId &&
                String(d.Centro).trim() === line.workCenterId &&
                String(d.Linea).trim() === line.name &&
                String(d.PuestoTrabajo).trim() === workstationDef.name
            );

            if (apiRow && apiRow.Tiempo > 0) {
                const assignedWs = line.assignedWorkstations.find(as => as.definitionId === workstationDef.id);
                const quantity = assignedWs?.quantity || 1;
                const timePerPost = apiRow.Tiempo / (quantity > 0 ? quantity : 1);
                workstationTimes.push({ workstationDefinitionId: workstationDef.id, timeHours: timePerPost / 60 });
            }
        }
        
        if (workstationTimes.length > 0) {
            totalManufacturingTimeHours = Math.max(...workstationTimes.map(wt => wt.timeHours));
        }

        const representativeRow = apiData.find(d => normalizeMaterialCode(d.CodMaterial) === productId && String(d.Centro).trim() === line.workCenterId);

        productProcessInfos.push({
            id: `${productId}---${lineId}`,
            productId: productId,
            productName: representativeRow?.Material,
            productionLineId: lineId,
            workstationTimes: workstationTimes,
            totalManufacturingTimeHours: totalManufacturingTimeHours,
            ClaseAprovisionamiento: representativeRow?.ClaseAprovisionamiento || undefined
        });
    });


    const finalLines = Array.from(discoveredLines.values());
    const inventorySettings: InventorySetting[] = [];
    const uniqueProductCenterPairsForInv = new Set(apiData.map(row => `${normalizeMaterialCode(row.CodMaterial)}---${String(row.Centro).trim()}`));
    
    uniqueProductCenterPairsForInv.forEach(pairKey => {
        const [productId, centerId] = pairKey.split('---');
        const rowsForPair = apiData.filter(row => normalizeMaterialCode(row.CodMaterial) === productId && String(row.Centro).trim() === centerId);
        
        const inventoryDataSource = rowsForPair.find(r => r.StockSeguridad || r.StockMaximo) || rowsForPair[0];
        if (inventoryDataSource) {
             inventorySettings.push({
                id: pairKey, itemId: productId, itemName: productId, centerId: centerId, isRawMaterial: false,
                minStock: parseInt(String(inventoryDataSource.StockSeguridad || 0), 10),
                maxStock: parseInt(String(inventoryDataSource.StockMaximo || 0), 10),
                currentStock: 0, 
                lotMin: parseInt(String(inventoryDataSource.TamLoteMin || 1), 10) || 1,
                lotMax: inventoryDataSource.TamLoteMax ? parseInt(String(inventoryDataSource.TamLoteMax), 10) : null,
            });
        }

        rowsForPair.forEach(row => {
            const lineName = String(row.Linea).trim();
            const lineId = `pl---${centerId}---${lineName}`;
            const line = finalLines.find(l => l.id === lineId);
            if (line && !line.materialsHandled.includes(productId)) {
                line.materialsHandled.push(productId);
            }
        });
    });

    if (discoveredWorkCenters.size === 0 || discoveredLines.size === 0) {
        const structuralError = "Error Crítico: No se pudo descubrir ninguna estructura de producción (Centros o Líneas) a partir de los datos. Revise la fuente de datos 'TiemposEnsamblado'.";
        validationErrors.push(structuralError);
        logger.log(`[${timestamp}] [STRUCTURE ERROR] ${structuralError}`, 'error');
        return { newConstraints: currentConstraints, validationErrors, dataCompletenessErrors };
    }

    const newConstraints: AppConstraints = {
        ...currentConstraints,
        workCenters: Array.from(discoveredWorkCenters.values()),
        productionLines: finalLines,
        workstationDefinitions: Array.from(discoveredWorkstations.values()),
        productProcessInfos: productProcessInfos, 
        inventorySettings: inventorySettings, 
    };
    logger.log(`[${timestamp}] Procesamiento y validación completados. Centros: ${discoveredWorkCenters.size}, Líneas: ${discoveredLines.size}, Puestos: ${discoveredWorkstations.size}, Inventario: ${inventorySettings.length}`, 'success');
    return { newConstraints, validationErrors: [], dataCompletenessErrors: [] };
}

function getPredefinedQuantities(centerId: string, lineName: string): Array<{ definitionId: string; quantity: number }> {
    const quantities: { [key: string]: { [key: string]: { [key: string]: number } } } = {
        '1000': { 
            'LINEA 1': { 'Armado': 12, 'Cerrado L1': 6 },
            'LINEA 2': { 'Armado': 6, 'Pegado1 L2': 2, 'Pegado2 L2': 2, 'Cerrado1 L2': 4, 'Cerrado2 L2': 4 },
            'LINEA 3': { 'Armado': 2 },
            'LINEA 5': { 'Armado': 2 }
        },
        '2000': {
            'LINEA 1': { 'Armado': 8, 'Cerrado L1': 6 },
            'LINEA 2': { 'Armado': 4, 'Pegado1 L2': 2, 'Cerrado1 L2': 2, 'Cerrado2 L2': 2 },
            'LINEA 5': { 'Armado': 3 }
        }
    };

    const centerConfig = quantities[centerId];
    if (centerConfig && centerConfig[lineName]) {
        return Object.entries(centerConfig[lineName]).map(([wsName, qty]) => ({
            definitionId: `wd---${centerId}---${wsName}`,
            quantity: qty
        }));
    }
    return [];
}

const getMonthlyCapacity = (
    year: number,
    month: number,
    line: ProductionLine,
    constraints: AppConstraints,
    startDay: number = 1
): { totalHours: number } => {
    const EFFICIENCY_FACTOR = 0.87;
    let grossTotalHours = 0;
    const daysInMonth = new Date(year, month, 0).getDate();
    
    for (let day = startDay; day <= daysInMonth; day++) {
        const checkDate = new Date(year, month - 1, day);
        const dayOfWeek = checkDate.getDay(); 
        
        let dailyHours = 0;
        
        if (dayOfWeek !== 0) { // Not Sunday
            const holidayInfo = constraints.holidays.find(h => h.date === checkDate.toISOString().split('T')[0]);
            
            let isNonWorkingHoliday = false;
            if (holidayInfo && holidayInfo.dayType === 'asueto') {
                const appliesTo = holidayInfo.appliesTo;
                if (appliesTo === 'Toda la Planta' || appliesTo === line.workCenterId || appliesTo === line.processType || appliesTo === line.id) {
                    isNonWorkingHoliday = true;
                }
            }

            if (!isNonWorkingHoliday) {
                 if (holidayInfo && holidayInfo.isProductionAllowed) {
                    if (holidayInfo.dayType === 'full') {
                        dailyHours = constraints.shiftParameters.regularHoursPerDay;
                    } else if (holidayInfo.dayType === 'half') {
                        dailyHours = 5;
                    }
                } else {
                    if (dayOfWeek === 6) { // Saturday
                        dailyHours = constraints.shiftParameters.saturdayAndHolidayHours;
                    } else { // Weekday
                        dailyHours = constraints.shiftParameters.regularHoursPerDay + constraints.shiftParameters.extraHoursPerDay;
                    }
                }
            }
        }
        
        grossTotalHours += dailyHours;
    }

    const netTotalHours = grossTotalHours * EFFICIENCY_FACTOR;
    return { totalHours: netTotalHours };
};


export const generateProductionPlan = async (
    planningYear: number, 
    constraints: AppConstraints, 
    apiData: TiempoEnsambleItem[], 
    cuboInventariosData: CuboInventariosItem[],
    salesData: SalesDataRow[],
    prorateCurrentMonth: boolean,
    onProgress: (progress: PlanningProgress | null) => void
): Promise<ProductionPlan> => {
    
    const auditLog: string[] = [];
    // Desactivar prorrateo automático
    const finalProrateCurrentMonth = false; 
    logger.log(`--- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN (Prorrateo forzado a: ${finalProrateCurrentMonth}) ---`, 'info');
    auditLog.push(`[${new Date().toLocaleTimeString()}] INICIO: Generación de plan (Prorrateo mes actual forzado a: ${finalProrateCurrentMonth}).`);

    const { holidays, productionLines, workstationDefinitions, shiftParameters, laborCostFactors, globalBaseCostPerHour } = constraints;

    if (salesData.length === 0) {
        auditLog.push(`Error: No hay datos de ventas para planificar.`);
        logger.log("Error: No hay datos de ventas para planificar.", 'error');
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }
     if (!laborCostFactors || !globalBaseCostPerHour || !shiftParameters) {
        auditLog.push(`Error: No se han definido los parámetros de costo laboral o turnos.`);
        logger.log("Error: No se han definido los parámetros de costo laboral o turnos.", 'error');
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }

    const initialInventoryState = new Map<string, number>(); 
    
    if (cuboInventariosData) {
        cuboInventariosData.forEach((inv: any) => {
            if(inv.Material && inv.Centro && inv.StockActual) {
                const stock = Number(inv.StockActual);
                if (stock > 0) {
                    const productId = normalizeMaterialCode(inv.Material);
                    const centerId = String(inv.Centro).trim();
                    const key = `${productId}---${centerId}`;
                    initialInventoryState.set(key, (initialInventoryState.get(key) || 0) + stock);
                }
            }
        });
        const logMsg = `Inventario inicial cargado desde CuboInventarios. Se encontraron ${initialInventoryState.size} pares producto-centro con stock.`;
        auditLog.push(`[${new Date().toLocaleTimeString()}] INFO: ${logMsg}`);
        logger.log(`[${new Date().toLocaleTimeString()}] [Punto 1: Motor] ${logMsg}`, 'success');

    } else {
        const logMsg = `ADVERTENCIA: No se pudo cargar el inventario inicial desde CuboInventarios. La planificación puede ser imprecisa.`;
        auditLog.push(`[${new Date().toLocaleTimeString()}] ${logMsg}`);
        logger.log(`[${new Date().toLocaleTimeString()}] ${logMsg}`, 'warning');
    }
    
    let inventoryState = new Map(initialInventoryState);
    const monthlyPlanItems: MonthlyProductionPlanItem[] = [];
    
    const plannableMaterialCodes = new Set(apiData.map(item => normalizeMaterialCode(item.CodMaterial)));
    const filteredSalesData = salesData.filter(sale => plannableMaterialCodes.has(normalizeMaterialCode(sale.código)));
    const allMonthKeys = new Set<string>();
    filteredSalesData.forEach(s => allMonthKeys.add(`${s.año}-${String(s.mes).padStart(2, '0')}`));
    const planningMonths = Array.from(allMonthKeys).sort();
    
    const horizonMsg = `Horizonte de planificación: ${planningMonths.length > 0 ? `${planningMonths[0]} a ${planningMonths[planningMonths.length-1]}` : 'Ninguno'}`;
    auditLog.push(`[${new Date().toLocaleTimeString()}] INFO: ${horizonMsg}`);
    logger.log(`[${new Date().toLocaleTimeString()}] ${horizonMsg}`, 'info');


    for (let i = 0; i < planningMonths.length; i++) {
        const monthKey = planningMonths[i];
        const [year, monthNum] = monthKey.split('-').map(Number);
        
        onProgress({ message: `Planificando mes ${monthNum}...`, step: 'monthly', current: i + 1, total: planningMonths.length });
        auditLog.push(`\n[${new Date().toLocaleTimeString()}] --- Planificando Mes ${monthNum}/${year} ---`);
        
        let salesThisMonth = filteredSalesData.filter(s => `${s.año}-${String(s.mes).padStart(2, '0')}` === monthKey);

        if (finalProrateCurrentMonth && year === new Date().getFullYear() && monthNum === new Date().getMonth() + 1) {
            const today = new Date();
            const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
            const daysPassed = today.getDate() - 1;
            const remainingProportion = (daysInMonth - daysPassed) / daysInMonth;
            auditLog.push(`[${new Date().toLocaleTimeString()}] INFO: Prorrateando demanda para el mes actual. Proporción restante: ${remainingProportion.toFixed(2)}`);
            
            salesThisMonth = salesThisMonth.map(sale => ({
                ...sale,
                unidadesProyectado: sale.unidadesProyectado * remainingProportion
            }));
        }

        const monthlyCapacityByLine = new Map<string, number>();
        productionLines.forEach(line => {
            let startDayForCapacityCalc = 1;
            if (finalProrateCurrentMonth && year === new Date().getFullYear() && monthNum === new Date().getMonth() + 1) {
                startDayForCapacityCalc = new Date().getDate();
            }
            const { totalHours } = getMonthlyCapacity(year, monthNum, line, constraints, startDayForCapacityCalc);
            monthlyCapacityByLine.set(line.id, totalHours);
        });

        // ====================================================================
        // FASE 1: Agregación de Demanda y Determinación de Estrategia
        // ====================================================================
        const demandE: Map<string, number> = new Map(); // key: product---center, value: quantity
        const demandF: Map<string, number> = new Map(); // key: product---center, value: quantity
        const demandX: Map<string, number> = new Map(); // key: product---center, value: quantity
        
        for (const sale of salesThisMonth) {
            const productId = normalizeMaterialCode(sale.código);
            const centerId = String(sale.centro).trim();
            const demandKey = `${productId}---${centerId}`;

            const classF_rule = apiData.find(item => normalizeMaterialCode(item.CodMaterial) === productId && String(item.Centro).trim() === '1000' && item.ClaseAprovisionamiento === 'F');

            if (classF_rule) {
                demandF.set(demandKey, (demandF.get(demandKey) || 0) + sale.unidadesProyectado);
                continue;
            }

            const local_rule = apiData.find(item => normalizeMaterialCode(item.CodMaterial) === productId && String(item.Centro).trim() === centerId);

            if (local_rule?.ClaseAprovisionamiento === 'X') {
                demandX.set(demandKey, (demandX.get(demandKey) || 0) + sale.unidadesProyectado);
            } else { // 'E' or undefined defaults to local
                demandE.set(demandKey, (demandE.get(demandKey) || 0) + sale.unidadesProyectado);
            }
        }

        const monthlyProductionPlan: Map<string, number> = new Map(); // key: product---center, value: quantity
        
        // ====================================================================
        // FASE 2: Planificación de la Producción
        // ====================================================================

        // Prioridad 1: Clase 'E'
        for (const [key, demand] of demandE) {
            const currentStock = inventoryState.get(key) || 0;
            const safetyStock = constraints.inventorySettings.find(s => s.id === key)?.minStock || 0;
            const needed = Math.max(0, demand + safetyStock - currentStock);
            if (needed <= 0) continue;
            
            monthlyProductionPlan.set(key, (monthlyProductionPlan.get(key) || 0) + needed);
        }

        // Prioridad 2: Clase 'X' (intento local)
        const overflowX: Map<string, number> = new Map(); // Needs that couldn't be satisfied locally
        for (const [key, demand] of demandX) {
            const [productId, centerId] = key.split('---');
            const currentStock = inventoryState.get(key) || 0;
            const safetyStock = constraints.inventorySettings.find(s => s.id === key)?.minStock || 0;
            const needed = Math.max(0, demand + safetyStock - currentStock);
            if (needed <= 0) continue;

            const linesForProduct = productionLines.filter(l => l.workCenterId === centerId && l.materialsHandled.includes(productId));
            let remainingNeed = needed;

            for (const line of linesForProduct) {
                 if (remainingNeed <= 0) break;
                 const timePerUnit = constraints.productProcessInfos.find(p => p.id === `${productId}---${line.id}`)?.totalManufacturingTimeHours || Infinity;
                 if (timePerUnit === Infinity || timePerUnit <= 0) continue;

                 const lineCapacityHours = monthlyCapacityByLine.get(line.id) || 0;
                 const productionCapacityUnits = Math.floor(lineCapacityHours / timePerUnit);
                 const canProduce = Math.min(remainingNeed, productionCapacityUnits);

                 if (canProduce > 0) {
                     monthlyProductionPlan.set(key, (monthlyProductionPlan.get(key) || 0) + canProduce);
                     monthlyCapacityByLine.set(line.id, lineCapacityHours - (canProduce * timePerUnit));
                     remainingNeed -= canProduce;
                 }
            }
            
            if (remainingNeed > 0) {
                overflowX.set(key, remainingNeed); // Store the overflow need
            }
        }

        // Prioridad 3 & 4: Clases 'F' y Desborde 'X' (producción centralizada)
        const centralProductionNeeds: Map<string, number> = new Map(); // key: product, value: quantity
        for (const [key, demand] of demandF) {
            const [productId, centerId] = key.split('---');
            const centralKey = `${productId}---1000`;
            const currentStock = inventoryState.get(key) || 0;
            const safetyStock = constraints.inventorySettings.find(s => s.id === key)?.minStock || 0;
            const needed = Math.max(0, demand + safetyStock - currentStock);
            if (needed <= 0) continue;
            
            centralProductionNeeds.set(productId, (centralProductionNeeds.get(productId) || 0) + needed);
        }
        for (const [key, need] of overflowX) {
            const [productId] = key.split('---');
            centralProductionNeeds.set(productId, (centralProductionNeeds.get(productId) || 0) + need);
        }
        
        // Add local demand for Center 1000 (if any)
        const localDemand1000 = salesThisMonth.filter(s => s.centro === '1000');
        for(const sale of localDemand1000) {
            const productId = normalizeMaterialCode(sale.código);
            const key = `${productId}---1000`;
            const currentStock = inventoryState.get(key) || 0;
            const safetyStock = constraints.inventorySettings.find(s => s.id === key)?.minStock || 0;
            const needed = Math.max(0, sale.unidadesProyectado + safetyStock - currentStock);
            if (needed <= 0) continue;
            
            centralProductionNeeds.set(productId, (centralProductionNeeds.get(productId) || 0) + needed);
        }


        // Planificar producción en Centro 1000
        for (const [productId, needed] of centralProductionNeeds) {
            const centralKey = `${productId}---1000`;
            const linesForProduct = productionLines.filter(l => l.workCenterId === '1000' && l.materialsHandled.includes(productId));
            let remainingNeed = needed;

            for (const line of linesForProduct) {
                if (remainingNeed <= 0) break;
                const timePerUnit = constraints.productProcessInfos.find(p => p.id === `${productId}---${line.id}`)?.totalManufacturingTimeHours || Infinity;
                if (timePerUnit === Infinity || timePerUnit <= 0) continue;

                const lineCapacityHours = monthlyCapacityByLine.get(line.id) || 0;
                const productionCapacityUnits = Math.floor(lineCapacityHours / timePerUnit);
                const canProduce = Math.min(remainingNeed, productionCapacityUnits);

                if (canProduce > 0) {
                    monthlyProductionPlan.set(centralKey, (monthlyProductionPlan.get(centralKey) || 0) + canProduce);
                    monthlyCapacityByLine.set(line.id, lineCapacityHours - (canProduce * timePerUnit));
                    remainingNeed -= canProduce;
                }
            }
        }
        
        // ====================================================================
        // FASE 3: Cálculo de Traslados y Saldos Finales
        // ====================================================================
        const monthlyMovements = new Map<string, { production: number; salesDemand: number; transfersIn: number; transfersOut: number; initialStock: number; finalStock: number; dispatches: number }>();
        const getAllProductCenterPairs = () => new Set([...inventoryState.keys(), ...monthlyProductionPlan.keys(), ...salesThisMonth.map(s => `${normalizeMaterialCode(s.código)}---${s.centro}`)]);

        getAllProductCenterPairs().forEach(key => monthlyMovements.set(key, { production: 0, salesDemand: 0, transfersIn: 0, transfersOut: 0, initialStock: inventoryState.get(key) || 0, finalStock: 0, dispatches: 0 }));
        
        monthlyProductionPlan.forEach((qty, key) => monthlyMovements.get(key)!.production = qty);
        salesThisMonth.forEach(sale => {
            const key = `${normalizeMaterialCode(sale.código)}---${sale.centro}`;
            if (monthlyMovements.has(key)) {
                monthlyMovements.get(key)!.salesDemand += sale.unidadesProyectado;
            }
        });

        // Traslados 'F'
        const totalDemandF = new Map<string, number>(); // product -> total demand
        demandF.forEach((demand, key) => {
            const [productId] = key.split('---');
            totalDemandF.set(productId, (totalDemandF.get(productId) || 0) + demand);
        });

        demandF.forEach((demand, key) => {
            const [productId, centerId] = key.split('---');
            if (centerId === '1000') return;

            const totalProdForThisF = monthlyProductionPlan.get(`${productId}---1000`) || 0;
            const totalDemandForThisF = totalDemandF.get(productId) || 1;
            const proportion = demand / totalDemandForThisF;
            const transferAmount = Math.floor(totalProdForThisF * proportion);
            
            if (transferAmount > 0) {
                if (monthlyMovements.has(`${productId}---1000`)) monthlyMovements.get(`${productId}---1000`)!.transfersOut += transferAmount;
                if (monthlyMovements.has(key)) monthlyMovements.get(key)!.transfersIn += transferAmount;
            }
        });

        // Traslados 'X'
        overflowX.forEach((need, key) => {
            const [productId] = key.split('---');
            const centralKey = `${productId}---1000`;
            const productionForOverflow = (monthlyProductionPlan.get(centralKey) || 0) - (centralProductionNeeds.get(productId) || 0); // Approx
            const transferAmount = Math.min(need, productionForOverflow);
            
            if (transferAmount > 0) {
                 if (monthlyMovements.has(centralKey)) monthlyMovements.get(centralKey)!.transfersOut += transferAmount;
                 if (monthlyMovements.has(key)) monthlyMovements.get(key)!.transfersIn += transferAmount;
            }
        });
        
        // Final balances and update inventory for next month
        const newInventoryState = new Map(inventoryState);
        getAllProductCenterPairs().forEach(key => {
            const mov = monthlyMovements.get(key)!;
            const available = mov.initialStock + mov.production + mov.transfersIn - mov.transfersOut;
            const dispatches = Math.min(available, mov.salesDemand);
            const finalStock = available - dispatches;

            mov.dispatches = dispatches;
            mov.finalStock = finalStock;
            newInventoryState.set(key, finalStock);
        });
        inventoryState = newInventoryState; // Update for next iteration
        
        // Push to monthly plan
        monthlyMovements.forEach((mov, key) => {
            const [productId, centerId] = key.split('---');
            const sale = salesThisMonth.find(s => normalizeMaterialCode(s.código) === productId && String(s.centro).trim() === centerId);
            
            monthlyPlanItems.push({
                id: `${monthKey}---${key}`, year, month: monthNum, productId, centerId,
                productName: sale?.descripciónMaterial || productId,
                totalQuantityToProduce: mov.production,
                totalDemand: mov.salesDemand,
                dispatches: mov.dispatches,
                netTransfers: mov.transfersIn - mov.transfersOut,
                initialStock: mov.initialStock,
                finalStock: mov.finalStock,
                backlogVentas: Math.max(0, mov.salesDemand - mov.dispatches),
                backlogTrasladosF: 0, 
                backlogTrasladosX: 0,
                totalHoursWorked: 0, 
                totalEstimatedLaborCost: 0, 
            });
        });
    }
    
    auditLog.push(`[${new Date().toLocaleTimeString()}] FIN: Plan mensual completado.`);
    logger.log(`[${new Date().toLocaleTimeString()}] Plan mensual completado.`, 'success');
    
    onProgress(null);
    return { dailyPlan: [], monthlyPlan: monthlyPlanItems, weeklyPlan: [], auditLog, initialInventory: initialInventoryState };
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
    
    // Aggregate production by month, center, and material
    const aggregatedProduction = new Map<string, number>();
    plan.forEach(item => {
        const key = `${item.month}-${item.centerId}-${item.productId}`;
        const currentQty = aggregatedProduction.get(key) || 0;
        aggregatedProduction.set(key, currentQty + item.totalQuantityToProduce);
    });

    const dataToExport = Array.from(aggregatedProduction.entries()).map(([key, quantity]) => {
        const [month, center, material] = key.split('-');
        return {
            'Mes': MONTH_NAMES[parseInt(month, 10) - 1],
            'Centro': center,
            'codigo material': material,
            'cantidad a fabricar': Math.round(quantity),
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    worksheet['!cols'] = [ { wch: 15 }, { wch: 10 }, { wch: 20 }, { wch: 20 } ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plan Mensual Fabricacion');
    XLSX.writeFile(workbook, 'Resumen_Inventario_Mensual.xlsx');
};

export const parseTacticalOrdersExcel = (file: File): Promise<ProvisionalOrder[]> => { return Promise.resolve([]); };

export const generateTacticalPlan = ( request: TacticalRequest, context: any ): TacticalPlanResult => { return { plan: [], alerts: [] }; };

export const exportSkillsToExcel = ( employees: Employee[], skills: EmployeeSkill[], machines: Machine[], constraints: AppConstraints ): void => {};

