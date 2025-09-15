

'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import {
    AppState, AppAction, SalesDataRow, ProductionPlan, TacticalRequest,
    TacticalPlanResult, Employee, EmployeeSkill, AbsenteeismEvent, MaintenanceEvent,
    WorkShift, AppConstraints, NotificationMessage, TiempoEnsambleItem, SyncStatus,
    DetailedProductionPlan, PresupuestoItem
} from '@/types/types';
import { ActiveView, MONTH_NAMES } from '@/constants/constants';
import { generateProductionPlan, processAndValidateAssemblyData } from '@/services/OptimizationService';
import { queryApi } from '@/hooks/useApiData';

const initialState: AppState = {
    year: null,
    activeView: ActiveView.DATA_IMPORT,
    salesData: [],
    isLoading: false,
    productionPlan: { dailyPlan: [], monthlyPlan: [], auditLog: [] },
    detailedProductionPlan: null, 
    constraints: {
        workstationDefinitions: [],
        workCenters: [],
        productionLines: [],
        productProcessInfos: [],
        globalBaseCostPerHour: 8,
        laborCostFactors: { factorAdicionalDiurno: 25, factorRecargoNocturno: 50, factorFinSemanaFeriado: 100 },
        shiftParameters: { regularHoursPerDay: 8, extraHoursPerDay: 2, saturdayAndHolidayHours: 5 },
        inventorySettings: [],
        bottlenecks: [],
        contingencyFundPercentage: 5,
        supplierDeliveryTimes: [],
        qualityParameters: [],
        holidays: [],
    },
    employees: [],
    employeeSkills: [],
    maintenanceEvents: [],
    absenteeismEvents: [],
    workShifts: [],
    tacticalPlanResult: null,
    syncStatus: null,
};

function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'SET_YEAR':
            return { ...state, year: action.payload };
        case 'SET_ACTIVE_VIEW':
            return { ...state, activeView: action.payload };
        case 'SET_SALES_DATA':
            return { ...state, salesData: action.payload, syncStatus: null, productionPlan: initialState.productionPlan, detailedProductionPlan: null };
        case 'SET_CONSTRAINTS':
            return { ...state, constraints: action.payload };
        case 'SET_EMPLOYEES':
            return { ...state, employees: action.payload };
        case 'SET_EMPLOYEE_SKILLS':
            return { ...state, employeeSkills: action.payload };
        case 'SET_MAINTENANCE_EVENTS':
            return { ...state, maintenanceEvents: action.payload };
        case 'SET_ABSENTEEISM_EVENTS':
            return { ...state, absenteeismEvents: action.payload };
        case 'SET_WORK_SHIFTS':
            return { ...state, workShifts: action.payload };
        case 'GENERATE_PRODUCTION_PLAN_START':
            return { ...state, isLoading: true, detailedProductionPlan: null, productionPlan: initialState.productionPlan };
        case 'GENERATE_PRODUCTION_PLAN_SUCCESS':
            return { 
                ...state, 
                isLoading: false, 
                productionPlan: action.payload.finalPlan,
                detailedProductionPlan: action.payload.details
            };
        case 'GENERATE_PRODUCTION_PLAN_ERROR':
            return { 
                ...state, 
                isLoading: false, 
                productionPlan: { dailyPlan: [], monthlyPlan: [], auditLog: [action.payload || 'Error desconocido'] },
                detailedProductionPlan: null 
            };
        case 'GENERATE_TACTICAL_PLAN':
            return { ...state, tacticalPlanResult: action.payload };
        case 'SET_SYNC_STATUS':
            return { ...state, syncStatus: action.payload };
        case 'SET_IS_LOADING':
            return { ...state, isLoading: action.payload };
        default:
            return state;
    }
}

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};


type AppContextType = {
    year: number | null;
    activeView: ActiveView;
    salesData: SalesDataRow[];
    isLoading: boolean;
    productionPlan: ProductionPlan;
    detailedProductionPlan: DetailedProductionPlan | null;
    constraints: AppConstraints;
    employees: Employee[];
    employeeSkills: EmployeeSkill[];
    maintenanceEvents: MaintenanceEvent[];
    absenteeismEvents: AbsenteeismEvent[];
    workShifts: WorkShift[];
    tacticalPlanResult: TacticalPlanResult | null;
    syncStatus: SyncStatus | null;
    apiAssemblyData: TiempoEnsambleItem[]; // New: Store raw API data
    dispatch: React.Dispatch<AppAction>;
    addNotification: (type: NotificationMessage['type'], text: string, errors?: string[]) => void;
    handleDataImported: (year: number) => void;
    handleGeneratePlan: () => Promise<boolean>;
    handleGenerateTacticalPlan: (request: TacticalRequest) => TacticalPlanResult;
    setEmployees: (employees: Employee[]) => void;
    setSkills: (skills: EmployeeSkill[]) => void;
    setAbsenteeismEvents: (events: AbsenteeismEvent[]) => void;
    setMaintenanceEvents: (events: MaintenanceEvent[]) => void;
    setWorkShifts: (shifts: WorkShift[]) => void;
    setConstraints: (constraints: AppConstraints) => void;
    handleSyncAndValidate: () => Promise<boolean>;
};


const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(appReducer, initialState);
    const { toast } = useToast();
    const [apiAssemblyData, setApiAssemblyData] = useState<TiempoEnsambleItem[]>([]);

    useEffect(() => {
        const year = new Date().getFullYear();
        dispatch({ type: 'SET_YEAR', payload: year });
    }, []);

    const addNotification = useCallback((type: NotificationMessage['type'], text: string, errors: string[] = []) => {
        let description: React.ReactNode = text;
        if (errors.length > 0) {
            description = (
                <div>
                    <p>{text}</p>
                    <ul className="list-disc list-inside mt-2 max-h-40 overflow-y-auto">
                        {errors.map((e, i) => <li key={i} className="text-xs">{e}</li>)}
                    </ul>
                </div>
            );
        }
        toast({
            variant: type === 'error' ? 'destructive' : 'default',
            title: type.charAt(0).toUpperCase() + type.slice(1),
            description: description,
            duration: 5000,
        });
    }, [toast]);

    const handleDataImported = useCallback(async (year: number) => {
        dispatch({ type: 'SET_IS_LOADING', payload: true });
        addNotification('info', `Iniciando carga de datos de ventas para todo el año ${year}...`);

        const allSalesData: SalesDataRow[] = [];
        try {
            for (let month = 1; month <= 12; month++) {
                addNotification('info', `Cargando datos de ventas para ${MONTH_NAMES[month-1]} ${year}...`);
                const monthlyData: PresupuestoItem[] = await queryApi({
                    source: 'Presupuesto',
                    operation: 'get_data',
                    filters: { Año: year, Mes: month },
                    pagination: { limit: 50000 }
                });

                if (monthlyData && monthlyData.length > 0) {
                    const mappedData: SalesDataRow[] = monthlyData.map((item, index) => ({
                        id: `row-${year}-${month}-${index}`,
                        año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
                        etiqueta: item.Etiqueta || 'Sin Etiqueta', 
                        código: normalizeMaterialCode(item.CodMaterial),
                        centro: String(item.Centro).trim(), unidadesProyectado: item.UnidadesProyectado,
                        dolaresProyectado: 0,
                        descripciónMaterial: item.Material,
                        familia: item.Familia, marca: item.Marca, lineaProduccion: '',
                    }));
                    allSalesData.push(...mappedData);
                }
            }

            if (allSalesData.length === 0) {
                addNotification('warning', `No se encontraron datos de ventas para el año ${year}.`);
            } else {
                console.log(`Carga de datos de ventas completada. Se encontraron ${allSalesData.length} registros en total para el año ${year}.`);
                dispatch({ type: 'SET_SALES_DATA', payload: allSalesData });
                dispatch({ type: 'SET_YEAR', payload: year });
                addNotification('success', `Éxito: Se han cargado ${allSalesData.length} registros de ventas para ${year}. Ahora puede proceder a la planificación.`);
            }

        } catch (error) {
            const errorMessage = `Error durante la carga masiva de datos de ventas: ${(error as Error).message}`;
            console.error(errorMessage, error);
            addNotification('error', errorMessage);
        } finally {
            dispatch({ type: 'SET_IS_LOADING', payload: false });
        }
    }, [addNotification]);


    const handleSyncAndValidate = useCallback(async (): Promise<boolean> => {
        addNotification('info', 'Sincronizando y validando estructura y tiempos desde la API...');
        dispatch({ type: 'SET_IS_LOADING', payload: true });
        try {
            const assemblyData: TiempoEnsambleItem[] = await queryApi({ 
                source: 'TiemposEnsamblado', 
                operation: 'get_data',
                pagination: { limit: 50000 }
            });

            if (assemblyData.length === 0) {
                addNotification('warning', "La API no devolvió datos de tiempos de ensamble.");
                dispatch({ type: 'SET_SYNC_STATUS', payload: { isSynced: false, lastSyncTimestamp: new Date().toISOString(), errors: ["La API no devolvió datos."] }});
                return false;
            }
            
            setApiAssemblyData(assemblyData);

            const { newConstraints, validationErrors, dataCompletenessErrors } = processAndValidateAssemblyData(
                assemblyData,
                state.constraints
            );

            const allErrors = [...validationErrors, ...dataCompletenessErrors];

            if (allErrors.length > 0) {
                const errorMessage = `La sincronización falló. Se encontraron ${allErrors.length} problema(s).`;
                addNotification('error', errorMessage, allErrors);
                dispatch({ type: 'SET_SYNC_STATUS', payload: { isSynced: false, lastSyncTimestamp: new Date().toISOString(), errors: allErrors }});
                return false;
            }
            
            dispatch({ type: 'SET_CONSTRAINTS', payload: newConstraints });
            dispatch({ type: 'SET_SYNC_STATUS', payload: { isSynced: true, lastSyncTimestamp: new Date().toISOString(), errors: [] }});
            addNotification('success', `Sincronización exitosa. Se descubrieron y validaron ${assemblyData.length} registros.`);
            return true;
        } catch (error) {
            const errorMessage = `Error de red o de API al sincronizar: ${(error as Error).message}`;
            addNotification('error', errorMessage);
            dispatch({ type: 'SET_SYNC_STATUS', payload: { isSynced: false, lastSyncTimestamp: new Date().toISOString(), errors: [errorMessage] }});
            return false;
        } finally {
            dispatch({ type: 'SET_IS_LOADING', payload: false });
        }
    }, [state.constraints, addNotification]);

    const handleGeneratePlan = useCallback(async () => {
        if (!state.year) {
            addNotification('warning', 'No hay un año seleccionado para la planificación.');
            return false;
        }
        if (state.salesData.length === 0) {
            addNotification('error', 'No hay datos de ventas cargados. Por favor, importe los datos antes de generar un plan.');
            return false;
        }
        if (!state.syncStatus?.isSynced || apiAssemblyData.length === 0) {
            addNotification('error', 'Debe sincronizar y validar los datos de ensamble antes de generar el plan.');
            return false;
        }
        
        dispatch({ type: 'GENERATE_PRODUCTION_PLAN_START' });
        
        try {
            // Using a timeout to allow the UI to update to the loading state before the heavy computation starts
            await new Promise(resolve => setTimeout(resolve, 50)); 
            
            const detailedPlan = await generateProductionPlan(state.year, state.constraints, apiAssemblyData, state.salesData);

            dispatch({ type: 'GENERATE_PRODUCTION_PLAN_SUCCESS', payload: detailedPlan });
            addNotification('success', 'Proceso de planificación completado. Revise los resultados paso a paso.');
            return true;

        } catch (error) {
            const errorMessage = (error as Error).message;
            dispatch({ type: 'GENERATE_PRODUCTION_PLAN_ERROR', payload: errorMessage });
            addNotification('error', `Error al generar el plan: ${errorMessage}`);
            return false;
        }
    }, [state.year, state.constraints, state.syncStatus, apiAssemblyData, state.salesData, addNotification]);

    const handleGenerateTacticalPlan = useCallback((request: TacticalRequest): TacticalPlanResult => {
        addNotification('info', `Generando plan táctico para ${request.targetDate}...`);
        try {
            const result = {} as TacticalPlanResult; // Placeholder
            dispatch({ type: 'GENERATE_TACTICAL_PLAN', payload: result });
            if (result.alerts.length > 0) {
                addNotification('warning', 'Plan táctico generado con alertas.', result.alerts);
            } else {
                addNotification('success', 'Plan táctico generado exitosamente sin alertas.');
            }
            return result;
        } catch (error) {
            addNotification('error', `Error al generar el plan táctico: ${(error as Error).message}`);
            const emptyResult: TacticalPlanResult = { plan: [], alerts: [`Error al generar el plan táctico: ${(error as Error).message}`] };
            dispatch({ type: 'GENERATE_TACTICAL_PLAN', payload: emptyResult });
            return emptyResult;
        }
    }, [state.productionPlan.dailyPlan, state.constraints, state.maintenanceEvents, state.absenteeismEvents, state.employees, state.employeeSkills, addNotification]);

    const setEmployees = (employees: Employee[]) => dispatch({ type: 'SET_EMPLOYEES', payload: employees });
    const setSkills = (skills: EmployeeSkill[]) => dispatch({ type: 'SET_EMPLOYEE_SKILLS', payload: skills });
    const setAbsenteeismEvents = (events: AbsenteeismEvent[]) => dispatch({ type: 'SET_ABSENTEEISM_EVENTS', payload: events });
    const setMaintenanceEvents = (events: MaintenanceEvent[]) => dispatch({ type: 'SET_MAINTENANCE_EVENTS', payload: events });
    const setWorkShifts = (shifts: WorkShift[]) => dispatch({ type: 'SET_WORK_SHIFTS', payload: shifts });
    const setConstraints = (constraints: AppConstraints) => dispatch({ type: 'SET_CONSTRAINTS', payload: constraints });
    
    const value = {
        ...state,
        apiAssemblyData,
        dispatch,
        addNotification,
        handleDataImported,
        handleGeneratePlan,
        handleGenerateTacticalPlan,
        setEmployees,
        setSkills,
        setAbsenteeismEvents,
        setMaintenanceEvents,
        setWorkShifts,
        setConstraints,
        handleSyncAndValidate,
    };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
