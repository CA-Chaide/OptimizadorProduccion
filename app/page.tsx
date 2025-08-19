'use client';

import React, { useState, useCallback } from 'react';
import {
  AbsenteeismSection,
  ConstraintConfigurationSection,
  DataImportSection,
  MaintenanceSection,
  PersonnelManagementSection,
  ProductionPlanSection,
  TacticalSchedulingSection,
} from '@/components';
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
    <div className="flex h-screen bg-gray-100">
      {/* Barra de Navegación Lateral */}
      <aside className="w-64 bg-white shadow-md">
        <div className="p-4">
          <h1 className="text-2xl font-bold text-gray-800">Prod-Opt</h1>
        </div>
        <nav>
          <ul>
            {Object.values(ActiveView).map((view) => (
              <li key={view}>
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setActiveView(view);
                  }}
                  className={`flex items-center p-4 text-gray-600 hover:bg-gray-200 ${
                    activeView === view ? 'bg-blue-500 text-white' : ''
                  }`}
                >
                  {viewConfig[view].icon}
                  <span className="ml-3">{viewConfig[view].title}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 p-8 overflow-auto">
        {renderActiveView()}
      </main>
    </div>
  );
}
