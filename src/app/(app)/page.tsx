
'use client';

import React, { useState, useCallback, useEffect } from 'react';
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
} from '@/components';
import DashboardSection from '@/components/DashboardSection';
import { ActiveView, viewConfig } from '@/constants/constants';
import type { SalesDataRow, AppConstraints, ProductionPlan, EmployeeSkill, Employee, AbsenteeismEvent, MaintenanceEvent, TacticalPlanResult, TacticalRequest, WorkShift } from '@/types/types';
import { generateProductionPlan, generateTacticalPlan } from '@/services/OptimizationService';
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { NotificationMessage } from '@/types/types';


export default function ProductionOptimizerPage() {
  const { toast } = useToast();
  const [year, setYear] = useState<number | null>(null);

  useEffect(() => {
    setYear(new Date().getFullYear());
  }, []);


  const [activeView, setActiveView] = useState<ActiveView>(ActiveView.DASHBOARD);
  const [salesData, setSalesData] = useState<SalesDataRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [productionPlan, setProductionPlan] = useState<ProductionPlan>({ dailyPlan: [], monthlyPlan: [], auditLog: [] });
  
  // AppConstraints state
  const [constraints, setConstraints] = useState<AppConstraints>({
    workstationDefinitions: [],
    workCenters: [],
    productionLines: [],
    productProcessInfos: [],
    globalBaseCostPerHour: null,
    laborCostFactors: null,
    inventorySettings: [],
    bottlenecks: [],
    contingencyFundPercentage: 5,
    supplierDeliveryTimes: [],
    qualityParameters: [],
    holidays: [],
  });
  
  // Other domain-specific states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeSkills, setEmployeeSkills] = useState<EmployeeSkill[]>([]);
  const [maintenanceEvents, setMaintenanceEvents] = useState<MaintenanceEvent[]>([]);
  const [absenteeismEvents, setAbsenteeismEvents] = useState<AbsenteeismEvent[]>([]);
  const [workShifts, setWorkShifts] = useState<WorkShift[]>([]);

  // State for Tactical Plan
  const [tacticalPlanResult, setTacticalPlanResult] = useState<TacticalPlanResult | null>(null);

  const addNotification = (type: NotificationMessage['type'], text: string, errors: string[] = []) => {
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
  };

  const handleDataImported = (data: SalesDataRow[]) => {
    setSalesData(data);
    addNotification('success', `Se importaron ${data.length} registros de ventas.`);
    setActiveView(ActiveView.CONSTRAINTS);
  };

  const handleConstraintsUpdate = (newConstraints: AppConstraints) => {
    setConstraints(newConstraints);
    // No notification needed for every change, maybe just on save.
  };

  const handleGeneratePlan = useCallback(() => {
    if (salesData.length === 0) {
      addNotification('warning', 'Por favor, carga primero los datos de ventas.');
      return;
    }
    setIsLoading(true);
    addNotification('info', 'Generando plan de producción... Esto puede tardar unos momentos.');

    // Simulate async operation
    setTimeout(() => {
        try {
            const plan = generateProductionPlan(salesData, constraints);
            setProductionPlan(plan);
            addNotification('success', 'Plan de producción generado exitosamente.');
            setActiveView(ActiveView.PRODUCTION_PLAN);
        } catch (error) {
            console.error("Error generating production plan:", error);
            addNotification('error', `Error al generar el plan: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, 500); // Give UI time to update
  }, [salesData, constraints, addNotification]);

  const handleGenerateTacticalPlan = useCallback((request: TacticalRequest): TacticalPlanResult => {
      addNotification('info', `Generando plan táctico para ${request.targetDate}...`);
      try {
          const result = generateTacticalPlan(request, {
              dailyPlan: productionPlan.dailyPlan,
              constraints,
              maintenanceEvents,
              absenteeismEvents,
              employees,
              employeeSkills
          });
          setTacticalPlanResult(result);
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
          setTacticalPlanResult(emptyResult);
          return emptyResult;
      }
  }, [productionPlan.dailyPlan, constraints, maintenanceEvents, absenteeismEvents, employees, employeeSkills, addNotification]);

  const renderActiveView = () => {
    switch (activeView) {
      case ActiveView.DASHBOARD:
        return <DashboardSection plan={productionPlan.dailyPlan} salesData={salesData} constraints={constraints}/>;
      case ActiveView.DATA_IMPORT:
        return <DataImportSection onDataImported={handleDataImported} addNotification={addNotification} />;
      case ActiveView.CONSTRAINTS:
        return <ConstraintConfigurationSection constraints={constraints} onConstraintsUpdate={handleConstraintsUpdate} salesDataProducts={salesData} addNotification={addNotification} />;
      case ActiveView.PERSONNEL:
        return <PersonnelManagementSection employees={employees} setEmployees={setEmployees} skills={employeeSkills} setSkills={setEmployeeSkills} workstationDefinitions={constraints.workstationDefinitions} addNotification={addNotification} />;
      case ActiveView.ABSENTEEISM:
        return <AbsenteeismSection events={absenteeismEvents} setEvents={setAbsenteeismEvents} employees={employees} addNotification={addNotification} />;
      case ActiveView.PRODUCTION_PLAN:
        return <ProductionPlanSection plan={productionPlan} onGeneratePlan={handleGeneratePlan} isLoading={isLoading} constraints={constraints} />;
      case ActiveView.MAINTENANCE:
        return <MaintenanceSection events={maintenanceEvents} setEvents={setMaintenanceEvents} productionLines={constraints.productionLines} addNotification={addNotification} />;
      case ActiveView.TACTICAL_SCHEDULING:
        return <TacticalPlanSection onGeneratePlan={handleGenerateTacticalPlan} addNotification={addNotification} />;
      case ActiveView.WORK_SHIFT_PLANNING:
        return <WorkShiftPlanningSection 
          shifts={workShifts} 
          setShifts={setWorkShifts}
          constraints={constraints}
          employees={employees}
          absenteeismEvents={absenteeismEvents}
          employeeSkills={employeeSkills}
          addNotification={addNotification}
        />;
      default:
        return <DataImportSection onDataImported={handleDataImported} addNotification={addNotification} />;
    }
  };

  return (
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
              onClick={() => setActiveView(view)}
              className={`flex items-center space-x-3 p-3 rounded-lg w-full text-left transition-all duration-200 ease-in-out text-sm text-primary-foreground
                        ${
                          activeView === view
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
          <p className="text-xs text-primary-foreground/50 text-center">&copy; {year || '...'} Chaide IA</p>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto bg-gray-100 text-gray-800 print:overflow-visible print:bg-white p-8">
        {renderActiveView()}
        <Toaster />
      </main>
    </div>
  );
}
