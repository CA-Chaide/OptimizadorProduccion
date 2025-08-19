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
import DashboardPage from '@/app/page';
import { ActiveView, viewConfig } from '@/constants/constants';
import type { SalesDataRow, AppConstraints, ProductionPlanItem } from '@/types/types';
import { generateProductionPlan } from '@/services/OptimizationService';

/**
 * Componente principal de la aplicación.
 * Reemplaza al antiguo App.tsx y gestiona el estado principal.
 */
export default function ProductionOptimizerPage() {
  const [activeView, setActiveView] = useState<ActiveView>(ActiveView.DATA_IMPORT);
  const [salesData, setSalesData] = useState<SalesDataRow[]>([]);
  const [constraints, setConstraints] = useState<AppConstraints>({
    maxShiftHours: 8,
    minProductionSpeed: 100,
    maxOvertime: 4,
  });
  const [productionPlan, setProductionPlan] = useState<ProductionPlanItem[]>([]);

  // Callback para manejar los datos cargados desde DataImportSection
  const handleDataLoaded = (data: SalesDataRow[]) => {
    setSalesData(data);
    // Opcionalmente, cambiar a la vista de restricciones después de cargar datos.
    setActiveView(ActiveView.CONSTRAINTS);
  };

  // Callback para manejar el cambio de restricciones
  const handleConstraintsChanged = (newConstraints: AppConstraints) => {
    setConstraints(newConstraints);
  };

  // Callback para generar el plan de producción
  const handleGeneratePlan = useCallback(() => {
    if (salesData.length === 0) {
      alert('Por favor, carga primero los datos de ventas.');
      return;
    }
    const plan = generateProductionPlan(salesData, constraints);
    setProductionPlan(plan);
    setActiveView(ActiveView.PRODUCTION_PLAN);
  }, [salesData, constraints]);

  // Renderiza el componente de la vista activa
  const renderActiveView = () => {
    switch (activeView) {
      case ActiveView.DASHBOARD:
        return <DashboardPage />;
      case ActiveView.DATA_IMPORT:
        return <DataImportSection onDataLoaded={handleDataLoaded} />;
      case ActiveView.CONSTRAINTS:
        return <ConstraintConfigurationSection onConstraintsChanged={handleConstraintsChanged} />;
      case ActiveView.PERSONNEL:
        return <PersonnelManagementSection />;
      case ActiveView.ABSENTEEISM:
        return <AbsenteeismSection />;
      case ActiveView.PRODUCTION_PLAN:
        return <ProductionPlanSection plan={productionPlan} onGenerate={handleGeneratePlan} />;
      case ActiveView.MAINTENANCE:
        return <MaintenanceSection />;
      case ActiveView.TACTICAL_SCHEDULING:
        return <TacticalSchedulingSection />;
      default:
        return <DataImportSection onDataLoaded={handleDataLoaded} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white print:bg-white print:text-black">
      {/* Sidebar */}
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

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-gray-100 text-gray-800 print:overflow-visible print:bg-white p-8">
        {renderActiveView()}
      </main>
    </div>
  );
}
