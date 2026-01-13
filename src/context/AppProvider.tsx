

'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useState } from 'react';
import { useToast } from "@/hooks/use-toast";
import {
    AppState, AppAction, SalesDataRow, ProductionPlan, TacticalRequest,
    TacticalPlanResult, Employee, EmployeeSkill, AbsenteeismEvent, MaintenanceEvent,
    WorkShift, AppConstraints, NotificationMessage, TiempoEnsambleItem, SyncStatus,
    DetailedProductionPlan, PresupuestoItem, PlanningProgress, DemandAnalysisResult, CuboInventariosItem
} from '@/types/types';
import { ActiveView, MONTH_NAMES } from '@/constants/constants';
import { generateProductionPlan, processAndValidateAssemblyData, analyzeSalesDemand } from '@/services/OptimizationService';
import { queryApi } from '@/hooks/useApiData';
import { syncDataToStore } from '@/app/actions/datastore';
import { runtimeInspector } from '@/services/RuntimeInspector';

const initialState: AppState = {
    year: null,
    activeView: ActiveView.DATA_IMPORT,
    salesData: [],
    isLoading: false,
    productionPlan: { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog: [] },
    detailedProductionPlan: null, 
    planningProgress: null,
    constraints: {
        workstationDefinitions: [],
        workCenters: [],
        productionLines: [],
        productProcessInfos: [],
        globalBaseCostPerHour: 8,
        laborCostFactors: { factorAdicionalDiurno: 25, factorRecargoNocturno: 50, factorFinSemanaFeriado: 100 },
        shiftParameters: { regularHoursPerDay: 9, extraHoursPerDay: 2, saturdayAndHolidayHours: 5 },
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
    planningStep: 0,
    demandAnalysis: null,
    apiAssemblyData: [],
    apiCuboInventariosData: [],
};

function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'SET_YEAR':
            return { ...state, year: action.payload };
        case 'SET_ACTIVE_VIEW':
            return { ...state, activeView: action.payload };
        case 'SET_SALES_DATA':
            console.log("[AppContext] Action: SET_SALES_DATA. Reseteando plan de producción.");
            return { ...state, salesData: action.payload, syncStatus: null, productionPlan: initialState.productionPlan, detailedProductionPlan: null, planningStep: 0, demandAnalysis: null };
        case 'SET_CONSTRAINTS':
            console.log("[AppContext] Action: SET_CONSTRAINTS. Invalidando plan de producción existente.");
            return { 
                ...state, 
                constraints: action.payload,
                productionPlan: initialState.productionPlan, 
                detailedProductionPlan: null,
                planningStep: 0, 
                demandAnalysis: null 
            };
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
            console.log("[AppContext] Action: GENERATE_PRODUCTION_PLAN_START. isLoading: true.");
            return { ...state, isLoading: true, detailedProductionPlan: null, productionPlan: initialState.productionPlan, planningProgress: { message: 'Iniciando...', step: 'monthly', current: 0, total: 12 } };
        case 'GENERATE_PRODUCTION_PLAN_SUCCESS':
            console.log("[AppContext] Action: GENERATE_PRODUCTION_PLAN_SUCCESS. isLoading: false.");
            return { 
                ...state, 
                isLoading: false, 
                productionPlan: action.payload,
                planningProgress: null,
            };
        case 'GENERATE_PRODUCTION_PLAN_ERROR':
             console.log("[AppContext] Action: GENERATE_PRODUCTION_PLAN_ERROR. isLoading: false.");
            return { 
                ...state, 
                isLoading: false, 
                productionPlan: { ...initialState.productionPlan, auditLog: action.payload },
                detailedProductionPlan: null,
                planningProgress: null,
            };
        case 'GENERATE_TACTICAL_PLAN':
            return { ...state, tacticalPlanResult: action.payload };
        case 'SET_SYNC_STATUS':
            return { ...state, syncStatus: action.payload };
        case 'SET_IS_LOADING':
            console.log(`[AppContext] Action: SET_IS_LOADING. Payload: ${action.payload}`);
            return { ...state, isLoading: action.payload };
        case 'SET_PLANNING_PROGRESS':
            return { ...state, planningProgress: action.payload };
        case 'SET_PLANNING_STEP':
            return { ...state, planningStep: action.payload };
        case 'SET_DEMAND_ANALYSIS':
            return { ...state, demandAnalysis: action.payload };
        case 'RESET_PLANNING':
            return { ...state, planningStep: 0, demandAnalysis: null, productionPlan: initialState.productionPlan };
        case 'SET_API_ASSEMBLY_DATA':
            return { ...state, apiAssemblyData: action.payload };
        case 'SET_API_CUBO_INVENTARIOS_DATA':
            return { ...state, apiCuboInventariosData: action.payload };
        default:
            return state;
    }
}

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
    planningProgress: PlanningProgress | null;
    planningStep: number;
    demandAnalysis: DemandAnalysisResult | null;
    apiAssemblyData: TiempoEnsambleItem[];
    apiCuboInventariosData: CuboInventariosItem[];
    dispatch: React.Dispatch<AppAction>;
    addNotification: (type: NotificationMessage['type'], text: string, errors?: string[]) => void;
    handleDataImported: (data: SalesDataRow[]) => void;
    handleGeneratePlan: (prorateCurrentMonth: boolean) => Promise<boolean>;
    handleGenerateTacticalPlan: (request: TacticalRequest) => TacticalPlanResult;
    setEmployees: (employees: Employee[]) => Promise<void>;
    setSkills: (skills: EmployeeSkill[]) => Promise<void>;
    setAbsenteeismEvents: (events: AbsenteeismEvent[]) => Promise<void>;
    setMaintenanceEvents: (events: MaintenanceEvent[]) => Promise<void>;
    setWorkShifts: (shifts: WorkShift[]) => Promise<void>;
    setConstraints: (constraints: AppConstraints) => Promise<void>;
    handleSyncAndValidate: () => Promise<boolean>;
    handleContinueToStep2: () => void;
    handleContinueToStep3: () => Promise<void>;
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

    useEffect(() => {
        const year = new Date().getFullYear();
        dispatch({ type: 'SET_YEAR', payload: year });
        dispatch({ type: 'SET_ACTIVE_VIEW', payload: ActiveView.DATA_IMPORT });
    }, []);
    
    // HYPERVISOR: Capturar automáticamente TODO el estado del AppContext
    useEffect(() => {
        // Capturar estado completo cada vez que cambia
        runtimeInspector.captureState('AppContext', JSON.parse(JSON.stringify(state)));
    }, [state]);
    
    // HYPERVISOR: Sincronizar automáticamente TODO al DataStore
    useEffect(() => {
        const syncAllData = async () => {
            try {
                // Sincronizar datos principales solo si existen
                if (state.salesData.length > 0) {
                    await syncDataToStore('salesData', state.salesData, 'AppContext-AutoSync', {
                        count: state.salesData.length,
                        autoSync: true
                    });
                }
                
                if (state.constraints.productionLines.length > 0) {
                    await syncDataToStore('constraints', state.constraints, 'AppContext-AutoSync', {
                        productionLines: state.constraints.productionLines.length,
                        autoSync: true
                    });
                }
                
                if (state.productionPlan.monthlyPlan.length > 0 || state.productionPlan.weeklyPlan.length > 0 || state.productionPlan.dailyPlan.length > 0) {
                    await syncDataToStore('productionPlan', state.productionPlan, 'AppContext-AutoSync', {
                        autoSync: true
                    });
                }
                
                if (state.employees.length > 0) {
                    await syncDataToStore('employees', state.employees, 'AppContext-AutoSync', {
                        count: state.employees.length,
                        autoSync: true
                    });
                }
                
                if (state.employeeSkills.length > 0) {
                    await syncDataToStore('employeeSkills', state.employeeSkills, 'AppContext-AutoSync', {
                        count: state.employeeSkills.length,
                        autoSync: true
                    });
                }
                
                if (state.maintenanceEvents.length > 0) {
                    await syncDataToStore('maintenanceEvents', state.maintenanceEvents, 'AppContext-AutoSync', {
                        count: state.maintenanceEvents.length,
                        autoSync: true
                    });
                }
                
                if (state.absenteeismEvents.length > 0) {
                    await syncDataToStore('absenteeismEvents', state.absenteeismEvents, 'AppContext-AutoSync', {
                        count: state.absenteeismEvents.length,
                        autoSync: true
                    });
                }
                
                if (state.workShifts.length > 0) {
                    await syncDataToStore('workShifts', state.workShifts, 'AppContext-AutoSync', {
                        count: state.workShifts.length,
                        autoSync: true
                    });
                }
                
                console.log('[AppProvider HYPERVISOR] Todos los datos sincronizados con DataStore');
            } catch (error) {
                console.error('[AppProvider HYPERVISOR] Error en auto-sincronización:', error);
            }
        };
        
        // Debounce: solo sincronizar después de 500ms de inactividad
        const timeoutId = setTimeout(syncAllData, 500);
        return () => clearTimeout(timeoutId);
    }, [state.salesData, state.constraints, state.productionPlan, state.employees, state.employeeSkills, state.maintenanceEvents, state.absenteeismEvents, state.workShifts]);

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
            duration: type === 'error' ? 10000 : 5000,
        });
    }, [toast]);

    const handleDataImported = useCallback(async (data: SalesDataRow[]) => {
        console.log(`[AppProvider] handleDataImported llamado con ${data.length} registros.`);
        dispatch({ type: 'SET_SALES_DATA', payload: data });
        
        if (data.length > 0) {
            addNotification('success', `Éxito: Se han cargado ${data.length} registros de ventas. Ahora puede proceder a la planificación.`);
        } else {
            addNotification('warning', `Se han cargado 0 registros. No podrá generar un plan de producción.`);
        }
    }, [addNotification]);


    const handleSyncAndValidate = useCallback(async (): Promise<boolean> => {
        addNotification('info', 'Sincronizando y validando estructura y tiempos desde la API...');
        dispatch({ type: 'SET_IS_LOADING', payload: true });
        try {
            const [assemblyData, cuboInventariosData] = await Promise.all([
                queryApi({ 
                    source: 'TiemposEnsamblado', 
                    operation: 'get_data',
                    pagination: { limit: 50000 }
                }),
                queryApi({
                    source: 'CuboInventarios',
                    operation: 'get_data',
                    pagination: { limit: 500000 }
                })
            ]);
            
            if (!assemblyData || assemblyData.length === 0) {
                addNotification('warning', "La API no devolvió datos de tiempos de ensamble.");
                dispatch({ type: 'SET_SYNC_STATUS', payload: { isSynced: false, lastSyncTimestamp: new Date().toISOString(), errors: ["La API de TiemposEnsamblado no devolvió datos."] }});
                return false;
            }
             if (!cuboInventariosData || cuboInventariosData.length === 0) {
                addNotification('warning', "La API no devolvió datos de CuboInventarios.");
                dispatch({ type: 'SET_SYNC_STATUS', payload: { isSynced: false, lastSyncTimestamp: new Date().toISOString(), errors: ["La API de CuboInventarios no devolvió datos."] }});
                return false;
            }
            
            dispatch({ type: 'SET_API_ASSEMBLY_DATA', payload: assemblyData });
            dispatch({ type: 'SET_API_CUBO_INVENTARIOS_DATA', payload: cuboInventariosData });

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
            addNotification('success', `Sincronización exitosa. Se descubrieron y validaron ${assemblyData.length} registros de ensamble y ${cuboInventariosData.length} de inventario.`);
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

    const handleContinueToStep2 = useCallback(() => {
        dispatch({ type: 'SET_PLANNING_STEP', payload: 2 });
    }, []);

    const handleContinueToStep3 = useCallback(async () => {
        dispatch({ type: 'SET_PLANNING_STEP', payload: 3 });
    }, []);

    const handleGeneratePlan = useCallback(async (prorateCurrentMonth: boolean): Promise<boolean> => {
        console.log(`[AppProvider] handleGeneratePlan invocado con prorrateo: ${prorateCurrentMonth}.`);
        
        if (!state.year) {
            addNotification('warning', 'No hay un año seleccionado para la planificación.');
            return false;
        }
        if (state.salesData.length === 0) {
            addNotification('error', 'No hay datos de ventas cargados. Por favor, importe los datos antes de generar un plan.');
            return false;
        }
        if (!state.syncStatus?.isSynced || state.apiAssemblyData.length === 0) {
            addNotification('error', 'Debe sincronizar y validar los datos de ensamble antes de generar el plan.');
            return false;
        }
        
        dispatch({ type: 'GENERATE_PRODUCTION_PLAN_START' });
        
        try {
            const progressCallback = (progress: PlanningProgress | null) => {
                dispatch({ type: 'SET_PLANNING_PROGRESS', payload: progress });
            };
            
            const planResult = await generateProductionPlan(state.year, state.constraints, state.apiAssemblyData, state.apiCuboInventariosData, state.salesData, prorateCurrentMonth, progressCallback);

            if (planResult.auditLog.some(log => log.startsWith('Error:'))) {
                 dispatch({ type: 'GENERATE_PRODUCTION_PLAN_ERROR', payload: planResult.auditLog });
                 addNotification('error', `Error al generar el plan. Revise la bitácora.`);
                 return false;
            }

            if (planResult.monthlyPlan.length === 0 && planResult.weeklyPlan.length === 0 && planResult.dailyPlan.length === 0) {
                dispatch({ type: 'GENERATE_PRODUCTION_PLAN_ERROR', payload: planResult.auditLog.length > 0 ? planResult.auditLog : ["El planificador no generó resultados. Revise la bitácora en la sección del plan."] });
                addNotification('warning', 'El planificador finalizó pero no generó un plan. Revise la bitácora en la sección del plan.');
                return false;
            }

            dispatch({ type: 'GENERATE_PRODUCTION_PLAN_SUCCESS', payload: planResult });
            
            addNotification('success', 'Proceso de planificación completado. Revise los resultados.');
            return true;

        } catch (error) {
            const errorMessage = (error as Error).message;
            console.error('[AppProvider] Error en handleGeneratePlan:', error);
            dispatch({ type: 'GENERATE_PRODUCTION_PLAN_ERROR', payload: [errorMessage] });
            addNotification('error', `Error al generar el plan: ${errorMessage}`);
            return false;
        }
    }, [state.year, state.constraints, state.syncStatus, state.apiAssemblyData, state.apiCuboInventariosData, state.salesData, addNotification]);

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
    }, [addNotification]);

    const setEmployees = async (employees: Employee[]) => {
        dispatch({ type: 'SET_EMPLOYEES', payload: employees });
    };
    
    const setSkills = async (skills: EmployeeSkill[]) => {
        dispatch({ type: 'SET_EMPLOYEE_SKILLS', payload: skills });
    };
    
    const setAbsenteeismEvents = async (events: AbsenteeismEvent[]) => {
        dispatch({ type: 'SET_ABSENTEEISM_EVENTS', payload: events });
    };
    
    const setMaintenanceEvents = async (events: MaintenanceEvent[]) => {
        dispatch({ type: 'SET_MAINTENANCE_EVENTS', payload: events });
    };
    
    const setWorkShifts = async (shifts: WorkShift[]) => {
        dispatch({ type: 'SET_WORK_SHIFTS', payload: shifts });
    };
    
    const setConstraints = async (constraints: AppConstraints) => {
        dispatch({ type: 'SET_CONSTRAINTS', payload: constraints });
    };
    
    const value = {
        ...state,
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
        handleContinueToStep2,
        handleContinueToStep3,
    };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
