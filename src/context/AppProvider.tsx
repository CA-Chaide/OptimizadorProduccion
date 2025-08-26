
'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import { useToast } from "@/hooks/use-toast";
import {
    AppState, AppAction, SalesDataRow, ProductionPlan, TacticalRequest,
    TacticalPlanResult, Employee, EmployeeSkill, AbsenteeismEvent, MaintenanceEvent,
    WorkShift, AppConstraints, NotificationMessage, TiempoEnsambleItem
} from '@/types/types';
import { ActiveView } from '@/constants/constants';
import { generateProductionPlan, generateTacticalPlan, processAssemblyDataFromApi } from '@/services/OptimizationService';
import { fetchTiempoEnsambleData } from '@/hooks/useApiData';

const initialState: AppState = {
    year: null,
    activeView: ActiveView.DASHBOARD,
    salesData: [],
    isLoading: false,
    productionPlan: { dailyPlan: [], monthlyPlan: [], auditLog: [] },
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
};

function appReducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'SET_YEAR':
            return { ...state, year: action.payload };
        case 'SET_ACTIVE_VIEW':
            return { ...state, activeView: action.payload };
        case 'SET_SALES_DATA':
            return { ...state, salesData: action.payload };
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
            return { ...state, isLoading: true };
        case 'GENERATE_PRODUCTION_PLAN_SUCCESS':
            return { ...state, isLoading: false, productionPlan: action.payload, activeView: ActiveView.PRODUCTION_PLAN };
        case 'GENERATE_PRODUCTION_PLAN_ERROR':
            return { ...state, isLoading: false };
        case 'GENERATE_TACTICAL_PLAN':
            return { ...state, tacticalPlanResult: action.payload };
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
    constraints: AppConstraints;
    employees: Employee[];
    employeeSkills: EmployeeSkill[];
    maintenanceEvents: MaintenanceEvent[];
    absenteeismEvents: AbsenteeismEvent[];
    workShifts: WorkShift[];
    tacticalPlanResult: TacticalPlanResult | null;
    dispatch: React.Dispatch<AppAction>;
    addNotification: (type: NotificationMessage['type'], text: string, errors?: string[]) => void;
    handleDataImported: (data: SalesDataRow[]) => void;
    handleGeneratePlan: () => void;
    handleGenerateTacticalPlan: (request: TacticalRequest) => TacticalPlanResult;
    setEmployees: (employees: Employee[]) => void;
    setSkills: (skills: EmployeeSkill[]) => void;
    setAbsenteeismEvents: (events: AbsenteeismEvent[]) => void;
    setMaintenanceEvents: (events: MaintenanceEvent[]) => void;
    setWorkShifts: (shifts: WorkShift[]) => void;
    setConstraints: (constraints: AppConstraints) => void;
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
        dispatch({ type: 'SET_YEAR', payload: new Date().getFullYear() });
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
            duration: type === 'error' ? 15000 : 5000,
        });
    }, [toast]);

    const handleDataImported = (data: SalesDataRow[]) => {
        dispatch({ type: 'SET_SALES_DATA', payload: data });
        addNotification('success', `Se importaron ${data.length} registros de ventas.`);
        dispatch({ type: 'SET_ACTIVE_VIEW', payload: ActiveView.CONSTRAINTS });
    };

    const handleGeneratePlan = useCallback(async () => {
        if (state.salesData.length === 0) {
            addNotification('warning', 'Por favor, carga primero los datos de ventas.');
            return;
        }
        dispatch({ type: 'GENERATE_PRODUCTION_PLAN_START' });
        
        try {
            // 1. Fetch assembly times data from the API
            addNotification('info', 'Sincronizando datos de ensamble desde la API...');
            const assemblyData: TiempoEnsambleItem[] = await fetchTiempoEnsambleData({ limit: 50000 });
            
            if (assemblyData.length === 0) {
                throw new Error("La API no devolvió datos de tiempos de ensamble.");
            }
            addNotification('success', `Se sincronizaron ${assemblyData.length} registros de ensamble.`);

            // 2. Process this data to update constraints (ProductProcessInfos and InventorySettings)
            addNotification('info', 'Validando y procesando datos de ensamble...');
            const { productProcessInfos, inventorySettings, validationErrors } = processAssemblyDataFromApi(
                assemblyData,
                state.constraints,
                state.salesData
            );

            if (validationErrors.length > 0) {
                addNotification('error', `La sincronización se detuvo por ${validationErrors.length} inconsistencia(s) entre la API y la configuración.`, validationErrors);
                dispatch({ type: 'GENERATE_PRODUCTION_PLAN_ERROR' });
                return;
            }

            const updatedConstraints: AppConstraints = {
                ...state.constraints,
                productProcessInfos,
                inventorySettings,
            };
            
            // This dispatch is important to make sure the planner uses the latest data
            dispatch({ type: 'SET_CONSTRAINTS', payload: updatedConstraints });

            // 3. Generate the actual production plan with the updated constraints
            addNotification('info', 'Generando plan de producción... Esto puede tardar unos momentos.');
            const plan = generateProductionPlan(state.salesData, updatedConstraints);
            dispatch({ type: 'GENERATE_PRODUCTION_PLAN_SUCCESS', payload: plan });
            addNotification('success', 'Plan de producción generado exitosamente.');

        } catch (error) {
            console.error("Error during plan generation process:", error);
            dispatch({ type: 'GENERATE_PRODUCTION_PLAN_ERROR' });
            addNotification('error', `Error al generar el plan: ${(error as Error).message}`);
        }
    }, [state.salesData, state.constraints, addNotification]);

    const handleGenerateTacticalPlan = useCallback((request: TacticalRequest): TacticalPlanResult => {
        addNotification('info', `Generando plan táctico para ${request.targetDate}...`);
        try {
            const result = generateTacticalPlan(request, {
                dailyPlan: state.productionPlan.dailyPlan,
                constraints: state.constraints,
                maintenanceEvents: state.maintenanceEvents,
                absenteeismEvents: state.absenteeismEvents,
                employees: state.employees,
                employeeSkills: state.employeeSkills
            });
            dispatch({ type: 'GENERATE_TACTICAL_PLAN', payload: result });
            if (result.alerts.length > 0) {
                addNotification('warning', 'Plan táctico generado con alertas.', result.alerts);
            } else {
                addNotification('success', 'Plan táctico generado exitosamente sin alertas.');
            }
            return result;
        } catch (error) {
            console.error("Error generating tactical plan:", error);
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
    };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
