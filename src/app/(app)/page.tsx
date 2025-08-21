
'use client';
import React, { useState, useCallback, useEffect, useReducer, createContext } from 'react';
import Image from 'next/image';
import {
  DataImportSection,
  ConstraintConfigurationSection,
  ProductionPlanSection,
  MaintenanceSection,
  PersonnelManagementSection,
  TacticalPlanSection,
  AbsenteeismSection,
  WorkShiftPlanningSection,
  RealDataSection,
} from '@/components';
import DashboardSection from '@/components/DashboardSection';
import { ActiveView, viewConfig } from '@/constants/constants';
import type { SalesDataRow, AppConstraints, ProductionPlan, EmployeeSkill, Employee, AbsenteeismEvent, MaintenanceEvent, TacticalPlanResult, TacticalRequest, WorkShift, NotificationMessage, ProductionLine } from '@/types/types';
import { generateProductionPlan, generateTacticalPlan } from '@/services/OptimizationService';
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"

// App State Management using useReducer for robustness
type AppState = {
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
};

type AppAction =
    | { type: 'SET_YEAR'; payload: number }
    | { type: 'SET_ACTIVE_VIEW'; payload: ActiveView }
    | { type: 'SET_SALES_DATA'; payload: SalesDataRow[] }
    | { type: 'SET_CONSTRAINTS'; payload: AppConstraints }
    | { type: 'SET_EMPLOYEES'; payload: Employee[] }
    | { type: 'SET_EMPLOYEE_SKILLS'; payload: EmployeeSkill[] }
    | { type: 'SET_MAINTENANCE_EVENTS'; payload: MaintenanceEvent[] }
    | { type: 'SET_ABSENTEEISM_EVENTS'; payload: AbsenteeismEvent[] }
    | { type: 'SET_WORK_SHIFTS'; payload: WorkShift[] }
    | { type: 'GENERATE_PRODUCTION_PLAN_START' }
    | { type: 'GENERATE_PRODUCTION_PLAN_SUCCESS'; payload: ProductionPlan }
    | { type: 'GENERATE_PRODUCTION_PLAN_ERROR' }
    | { type: 'GENERATE_TACTICAL_PLAN'; payload: TacticalPlanResult };


const initialState: AppState = {
    year: null, // Initialize as null to prevent hydration mismatch
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

// Notification Context for decoupling
export const NotificationContext = createContext<(type: NotificationMessage['type'], text: string, errors?: string[]) => void>(() => {});

export default function ProductionOptimizerPage() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const { toast } = useToast();

  // Set year on client-side to avoid hydration mismatch
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

  const handleGeneratePlan = useCallback(() => {
    if (state.salesData.length === 0) {
      addNotification('warning', 'Por favor, carga primero los datos de ventas.');
      return;
    }
    dispatch({ type: 'GENERATE_PRODUCTION_PLAN_START' });
    addNotification('info', 'Generando plan de producción... Esto puede tardar unos momentos.');

    setTimeout(() => {
        try {
            const plan = generateProductionPlan(state.salesData, state.constraints);
            dispatch({ type: 'GENERATE_PRODUCTION_PLAN_SUCCESS', payload: plan });
            addNotification('success', 'Plan de producción generado exitosamente.');
        } catch (error) {
            console.error("Error generating production plan:", error);
            dispatch({ type: 'GENERATE_PRODUCTION_PLAN_ERROR' });
            addNotification('error', `Error al generar el plan: ${(error as Error).message}`);
        }
    }, 500);
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
  
  const renderActiveView = () => {
    switch (state.activeView) {
      case ActiveView.DASHBOARD:
        return <DashboardSection plan={state.productionPlan.dailyPlan} salesData={state.salesData} constraints={state.constraints}/>;
      case ActiveView.DATA_IMPORT:
        return <DataImportSection onDataImported={handleDataImported} />;
      case ActiveView.CONSTRAINTS:
        return <ConstraintConfigurationSection constraints={state.constraints} onConstraintsUpdate={(c) => dispatch({type: 'SET_CONSTRAINTS', payload: c})} salesDataProducts={state.salesData} addNotification={addNotification} />;
      case ActiveView.PERSONNEL:
        return <PersonnelManagementSection 
                  employees={state.employees} 
                  setEmployees={(e) => dispatch({ type: 'SET_EMPLOYEES', payload: e })} 
                  skills={state.employeeSkills} 
                  setSkills={(s) => dispatch({ type: 'SET_EMPLOYEE_SKILLS', payload: s })}
                  constraints={state.constraints}
                />;
      case ActiveView.ABSENTEEISM:
        return <AbsenteeismSection events={state.absenteeismEvents} setEvents={(e) => dispatch({ type: 'SET_ABSENTEEISM_EVENTS', payload: e })} employees={state.employees} />;
      case ActiveView.PRODUCTION_PLAN:
        return <ProductionPlanSection plan={state.productionPlan} onGeneratePlan={handleGeneratePlan} isLoading={state.isLoading} constraints={state.constraints} />;
      case ActiveView.MAINTENANCE:
        return <MaintenanceSection events={state.maintenanceEvents} setEvents={(e) => dispatch({ type: 'SET_MAINTENANCE_EVENTS', payload: e })} constraints={state.constraints} onConstraintsUpdate={(c) => dispatch({type: 'SET_CONSTRAINTS', payload: c})} addNotification={addNotification} />;
      case ActiveView.TACTICAL_SCHEDULING:
        return <TacticalPlanSection onGeneratePlan={handleGenerateTacticalPlan} />;
      case ActiveView.WORK_SHIFT_PLANNING:
        return <WorkShiftPlanningSection 
          shifts={state.workShifts} 
          setShifts={(s) => dispatch({ type: 'SET_WORK_SHIFTS', payload: s})}
          constraints={state.constraints}
          employees={state.employees}
          absenteeismEvents={state.absenteeismEvents}
          employeeSkills={state.employeeSkills}
        />;
      case ActiveView.REAL_DATA:
        return <RealDataSection />;
      default:
        return <DataImportSection onDataImported={handleDataImported} />;
    }
  };

  return (
    <NotificationContext.Provider value={addNotification}>
      <div className="flex h-screen bg-background text-foreground print:bg-white print:text-black">
        <nav className="w-64 bg-primary p-4 space-y-2 flex flex-col shadow-lg print:hidden">
          <div className="mb-2 mt-4 px-2">
              <Image 
                  src="/logo.png" 
                  alt="Logo de la Compañía"
                  width={180}
                  height={40}
                  className="mx-auto"
                  data-ai-hint="company logo"
              />
          </div>
          {Object.values(ActiveView).map((view) => {
            const viewInfo = viewConfig[view];
            if (!viewInfo) return null;
            return (
              <button
                key={view}
                onClick={() => dispatch({ type: 'SET_ACTIVE_VIEW', payload: view })}
                className={`flex items-center space-x-3 p-3 rounded-lg w-full text-left transition-all duration-200 ease-in-out text-sm text-primary-foreground
                          ${
                            state.activeView === view
                              ? 'bg-primary-foreground/20 shadow-md font-semibold'
                              : 'hover:bg-primary-foreground/10'
                          }`}
              >
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center">{viewInfo.icon}</span>
                <span className="text-primary-foreground">{viewInfo.title}</span>
              </button>
            );
          })}
          <div className="mt-auto pt-4 border-t border-primary-foreground/20">
            <p className="text-xs text-primary-foreground/50 text-center">&copy; {state.year || '...'} Chaide IA</p>
          </div>
        </nav>

        <main className="flex-1 overflow-y-auto bg-gray-100 text-gray-800 print:overflow-visible print:bg-white p-8">
          {renderActiveView()}
          <Toaster />
        </main>
      </div>
    </NotificationContext.Provider>
  );
}
