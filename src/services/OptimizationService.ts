

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
    
    // START: Logic for Production Needs of First Month
    const firstMonthKey = salesData.length > 0 ? `${salesData[0].año}-${String(salesData[0].mes).padStart(2, '0')}` : null;
    const productionNeedsFirstMonthMap = new Map<string, {
        producingCenterId: string;
        sector: string;
        claseAprovisionamiento: 'E' | 'X' | 'F' | 'N/A';
        totalUnits: number;
    }>();

    const initialInventoryState = new Map<string, number>();
    const filteredCuboData = cuboInventariosData.filter(item => 
        inventoryFilters.centros.includes(String(item.Centro).trim()) &&
        inventoryFilters.sectores.includes(item.Sector || 'Sin Sector')
    );
     filteredCuboData.forEach(item => {
        if(item.Material && item.Centro && item.StockActual) {
            const stock = Number(item.StockActual);
            if (stock > 0) {
                const productId = normalizeMaterialCode(item.Material);
                const centerId = String(item.Centro).trim();
                const key = `${productId}---${centerId}`;
                initialInventoryState.set(key, (initialInventoryState.get(key) || 0) + stock);
            }
        }
    });
    // END: Logic for Production Needs of First Month

    auditLog.push(`[${new Date().toLocaleTimeString()}] Aplicados filtros de inventario. Se usarán ${filteredCuboData.length} de ${cuboInventariosData.length} registros para el saldo inicial.`);

    salesData.forEach(row => {
        const productId = normalizeMaterialCode(row.código);
        const centerId = String(row.centro).trim();
        const sector = row.sector || 'Sin Sector';
        
        let claseAprovisionamiento: 'E' | 'X' | 'F' | 'N/A' = 'N/A';
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
        
        // First month production needs calculation
        if (`${row.año}-${String(row.mes).padStart(2, '0')}` === firstMonthKey && claseAprovisionamiento !== 'N/A') {
            const currentStock = initialInventoryState.get(primaryKey) || 0;
            const safetyStock = constraints.inventorySettings.find(s => s.id === primaryKey)?.minStock || 0;
            const netNeed = Math.max(0, row.unidadesProyectado + safetyStock - currentStock);
            
            if(netNeed > 0) {
                const producingCenterId = claseAprovisionamiento === 'F' ? '1000' : centerId;
                const needKey = `${producingCenterId}-${sector}-${claseAprovisionamiento}`;
                if (!productionNeedsFirstMonthMap.has(needKey)) {
                    productionNeedsFirstMonthMap.set(needKey, {
                        producingCenterId, sector, claseAprovisionamiento, totalUnits: 0
                    });
                }
                productionNeedsFirstMonthMap.get(needKey)!.totalUnits += netNeed;
            }
        }

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
        .sort((a, b) => a.centro.localeCompare(b.centro) || a.sector.localeCompare(b.sector));
    const transfers = Array.from(transfersMap.values())
        .sort((a, b) => a.centro.localeCompare(b.centro) || a.sector.localeCompare(b.sector));
    const productionNeedsFirstMonth = Array.from(productionNeedsFirstMonthMap.values())
        .sort((a, b) => a.producingCenterId.localeCompare(b.producingCenterId) || a.sector.localeCompare(b.sector));

    auditLog.push(`[${new Date().toLocaleTimeString()}] Análisis de demanda completado. Total de demanda bruta: ${totalDemand.toLocaleString()}. Grupos clasificados: ${demandByGroup.length}.`);
    if(unclassifiedMaterials.length > 0) {
        auditLog.push(`[${new Date().toLocaleTimeString()}] ADVERTENCIA: Se encontraron ${unclassifiedMaterials.length} registros de demanda para materiales fabricables (código inicia con 3 o 4) pero sin Clase de Aprovisionamiento definida en CuboInventarios.`);
    }

    return { totalDemand, demandByGroup, unclassifiedMaterials, auditLog, transfers, productionNeedsFirstMonth };
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
    const finalProrateCurrentMonth = false; 
    logger.log(`--- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN (Prorrateo forzado a: ${finalProrateCurrentMonth}) ---`, 'info');
    auditLog.push(`[${new Date().toLocaleTimeString()}] INICIO: Generación de plan (Prorrateo mes actual forzado a: ${finalProrateCurrentMonth}).`);

    const { holidays, productionLines, workstationDefinitions, shiftParameters, laborCostFactors, globalBaseCostPerHour } = constraints;

    if (salesData.length === 0) {
        auditLog.push(`Error: No hay datos de ventas para planificar.`);
        return { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog };
    }
     if (!laborCostFactors || !globalBaseCostPerHour || !shiftParameters) {
        auditLog.push(`Error: No se han definido los parámetros de costo laboral o turnos.`);
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

    for (let i = 0; i < planningMonths.length; i++) {
        const monthKey = planningMonths[i];
        const [year, monthNum] = monthKey.split('-').map(Number);
        
        onProgress({ message: `Planificando mes ${monthNum}...`, step: 'monthly', current: i + 1, total: planningMonths.length });
        auditLog.push(`\n[${new Date().toLocaleTimeString()}] --- Planificando Mes ${monthNum}/${year} ---`);
        
        const salesThisMonth = filteredSalesData.filter(s => `${s.año}-${String(s.mes).padStart(2, '0')}` === monthKey);
        
        const productionNeedsByCenter = new Map<string, { needs: { productId: string; demandCenterId: string; units: number }[], totalHoursNeeded: number }>();
        const allProductDemandPairsThisMonth = new Set(salesThisMonth.map(s => `${normalizeMaterialCode(s.código)}---${s.centro.trim()}`));

        allProductDemandPairsThisMonth.forEach(pairKey => {
            const [productId, demandCenterId] = pairKey.split('---');
            const totalDemand = salesThisMonth.filter(s => normalizeMaterialCode(s.código) === productId && s.centro.trim() === demandCenterId)
                                              .reduce((sum, s) => sum + s.unidadesProyectado, 0);

            const currentStock = inventoryState.get(pairKey) || 0;
            const safetyStock = constraints.inventorySettings.find(s => s.id === pairKey)?.minStock || 0;
            const netNeed = Math.max(0, totalDemand + safetyStock - currentStock);

            if (netNeed > 0) {
                const ppi = constraints.productProcessInfos.find(p => p.productId === productId);
                const prodClass = ppi?.ClaseAprovisionamiento;
                const producingCenterId = prodClass === 'F' ? '1000' : demandCenterId;

                if (!productionNeedsByCenter.has(producingCenterId)) {
                    productionNeedsByCenter.set(producingCenterId, { needs: [], totalHoursNeeded: 0 });
                }
                const centerNeeds = productionNeedsByCenter.get(producingCenterId)!;
                centerNeeds.needs.push({ productId, demandCenterId, units: netNeed });
                const timePerUnit = ppi?.totalManufacturingTimeHours || 0;
                centerNeeds.totalHoursNeeded += timePerUnit * netNeed;
            }
        });

        const finalProductionPlan = new Map<string, number>(); 
        let allBacklog: { productId: string, centerId: string, units: number }[] = [];

        productionNeedsByCenter.forEach((data, producingCenterId) => {
            const availableCapacity = constraints.productionLines
                .filter(l => l.workCenterId === producingCenterId && l.isActive)
                .reduce((sum, line) => sum + getMonthlyCapacity(year, monthNum, line, constraints).totalHours, 0);

            if (data.totalHoursNeeded <= availableCapacity) {
                data.needs.forEach(need => {
                    const key = `${need.productId}---${producingCenterId}`;
                    finalProductionPlan.set(key, (finalProductionPlan.get(key) || 0) + need.units);
                });
            } else {
                const deficitHours = data.totalHoursNeeded - availableCapacity;
                const totalUnitsInCenter = data.needs.reduce((sum, n) => sum + n.units, 0);
                
                data.needs.forEach(need => {
                    const ppi = constraints.productProcessInfos.find(p => p.productId === need.productId);
                    const timePerUnit = ppi?.totalManufacturingTimeHours || 0;
                    
                    const participation = totalUnitsInCenter > 0 ? need.units / totalUnitsInCenter : 0;
                    const hoursDeficitForNeed = deficitHours * participation;
                    const unitsToCut = timePerUnit > 0 ? Math.floor(hoursDeficitForNeed / timePerUnit) : need.units;
                    
                    const adjustedProduction = Math.max(0, need.units - unitsToCut);
                    const backlogUnits = need.units - adjustedProduction;

                    if (adjustedProduction > 0) {
                        const key = `${need.productId}---${producingCenterId}`;
                        finalProductionPlan.set(key, (finalProductionPlan.get(key) || 0) + adjustedProduction);
                    }
                    if (backlogUnits > 0) {
                        allBacklog.push({ productId: need.productId, centerId: need.demandCenterId, units: backlogUnits });
                    }
                });
            }
        });

        const monthlyMovements = new Map<string, { production: number; salesDemand: number; transfersIn: number; transfersOut: number; initialStock: number; finalStock: number; dispatches: number; backlog: number }>();
        const allRelevantPairs = new Set([...inventoryState.keys(), ...salesThisMonth.map(s => `${normalizeMaterialCode(s.código)}---${s.centro.trim()}`)]);
        
        allRelevantPairs.forEach(key => monthlyMovements.set(key, { production: 0, salesDemand: 0, transfersIn: 0, transfersOut: 0, initialStock: inventoryState.get(key) || 0, finalStock: 0, dispatches: 0, backlog: 0 }));
        
        salesThisMonth.forEach(s => {
            const key = `${normalizeMaterialCode(s.código)}---${s.centro.trim()}`;
            monthlyMovements.get(key)!.salesDemand += s.unidadesProyectado;
        });

        finalProductionPlan.forEach((units, key) => {
            monthlyMovements.get(key)!.production += units;
        });

        productionNeedsByCenter.forEach((data, producingCenterId) => {
            data.needs.forEach(need => {
                if (need.demandCenterId !== producingCenterId) {
                    const planKey = `${need.productId}---${producingCenterId}`;
                    const demandKey = `${need.productId}---${need.demandCenterId}`;
                    const producedForTransfer = finalProductionPlan.get(planKey) || 0;
                    const transferAmount = Math.min(producedForTransfer, need.units);
                    
                    if (transferAmount > 0) {
                         monthlyMovements.get(planKey)!.transfersOut += transferAmount;
                         monthlyMovements.get(demandKey)!.transfersIn += transferAmount;
                    }
                }
            });
        });

        const newInventoryState = new Map(inventoryState);
        getAllRelevantPairs().forEach(key => {
            const mov = monthlyMovements.get(key)!;
            const availableForSale = mov.initialStock + mov.production + mov.transfersIn - mov.transfersOut;
            const dispatches = Math.min(availableForSale, mov.salesDemand);
            const finalStock = availableForSale - dispatches;
            const backlog = Math.max(0, mov.salesDemand - dispatches);

            mov.dispatches = dispatches;
            mov.finalStock = finalStock;
            mov.backlog = backlog;
            newInventoryState.set(key, finalStock);
            
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
                backlogVentas: backlog,
                backlogTrasladosF: 0, 
                backlogTrasladosX: 0,
                totalHoursWorked: 0,
                totalEstimatedLaborCost: 0, 
            });
        });
        inventoryState = newInventoryState;
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




