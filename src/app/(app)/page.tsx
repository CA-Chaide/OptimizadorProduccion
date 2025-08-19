
'use client';

import React, { useState, useCallback } from 'react';
import {
  DataImportSection,
  ConstraintConfigurationSection,
  ProductionPlanSection,
  MaintenanceSection,
  PersonnelManagementSection,
  TacticalSchedulingSection,
  AbsenteeismSection,
} from '@/components';
import DashboardSection from '@/components/DashboardSection';
import { ActiveView, viewConfig } from '@/constants/constants';
import type { SalesDataRow, AppConstraints, ProductionPlan, EmployeeSkill, Employee, AbsenteeismEvent, MaintenanceEvent } from '@/types/types';
import { generateProductionPlan } from '@/services/OptimizationService';
import { useToast } from "@/hooks/use-toast"
import { Toaster } from "@/components/ui/toaster"
import { NotificationMessage } from '@/types/types';


export default function ProductionOptimizerPage() {
  const { toast } = useToast();

  const [activeView, setActiveView] = useState<ActiveView>(ActiveView.DATA_IMPORT);
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
  }, [salesData, constraints]);

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
        return <TacticalSchedulingSection dailyPlan={productionPlan.dailyPlan} constraints={constraints} maintenanceEvents={maintenanceEvents} employees={employees} employeeSkills={employeeSkills} />;
      default:
        return <DataImportSection onDataImported={handleDataImported} addNotification={addNotification} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white print:bg-white print:text-black">
      <nav className="w-64 bg-gray-800 p-4 space-y-2 flex flex-col shadow-lg print:hidden">
        <div className="text-2xl font-bold mb-6 text-center text-indigo-400">Production Optimizer</div>
        {Object.values(ActiveView).map((view) => {
          const viewInfo = viewConfig[view];
          if (!viewInfo) return null;
          return (
            <button
              key={view}
              onClick={() => setActiveView(view)}
              className={`flex items-center space-x-3 p-3 rounded-lg w-full text-left transition-all duration-200 ease-in-out
                        ${
                          activeView === view
                            ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-400'
                            : 'hover:bg-gray-700 hover:text-indigo-300 text-gray-300'
                        }`}
            >
              {viewInfo.icon}
              <span>{viewInfo.title}</span>
            </button>
          );
        })}
        <div className="mt-auto pt-4 border-t border-gray-700">
          <p className="text-xs text-gray-500 text-center">&copy; {new Date().getFullYear()} Optimizador IA</p>
        </div>
      </nav>

      <main className="flex-1 overflow-y-auto bg-gray-100 text-gray-800 print:overflow-visible print:bg-white p-8">
        {renderActiveView()}
        <Toaster />
      </main>
    </div>
  );
}
