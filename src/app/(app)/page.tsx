'use client';

// 1. Importaciones de React y hooks.
import React, { useState, useCallback, useEffect } from 'react';

// 2. Importaciones de los componentes de las secciones.
import { DashboardSection } from '@/components/DashboardSection';
import { DataImportSection } from '@/components/DataImportSection';
import { ConstraintConfigurationSection } from '@/components/ConstraintConfigurationSection';
import { PersonnelManagementSection } from '@/components/PersonnelManagementSection';
import { AbsenteeismSection } from '@/components/AbsenteeismSection';
import { ProductionPlanSection } from '@/components/ProductionPlanSection';
import { MaintenanceSection } from '@/components/MaintenanceSection';
import { TacticalSchedulingSection } from '@/components/TacticalSchedulingSection';
import { MainNav } from '@/components/main-nav';

// 3. Importaciones de tipos de datos.
import type { SalesDataRow, AppConstraints, ProductionPlanItem } from '@/types/types';

// 4. Importaciones de constantes y enumeraciones.
import { ActiveView, viewConfig } from '@/constants/constants';

// 5. Importaciones de servicios de lógica de negocio.
import { generateProductionPlan } from '@/services/OptimizationService';

/**
 * Componente principal de la aplicación.
 * Reemplaza al antiguo App.tsx. Es un Componente de Cliente porque maneja
 * el estado interactivo, como la vista activa y los datos.
 */
export default function DashboardPage() {
  // Estado para controlar la vista activa.
  const [activeView, setActiveView] = useState<ActiveView>(ActiveView.DASHBOARD);

  // Estados para manejar los datos de la aplicación.
  const [salesData, setSalesData] = useState<SalesDataRow[]>([]);
  const [constraints, setConstraints] = useState<AppConstraints | null>(null);
  const [productionPlan, setProductionPlan] = useState<ProductionPlanItem[]>([]);

  // Función para cambiar la vista, envuelta en useCallback para optimización.
  const handleViewChange = useCallback((view: ActiveView) => {
    setActiveView(view);
  }, []);

  // Función para manejar la generación del plan de producción.
  const onGeneratePlan = () => {
    if (salesData.length > 0 && constraints) {
      const plan = generateProductionPlan(salesData, constraints);
      setProductionPlan(plan);
      setActiveView(ActiveView.PRODUCTION_PLAN); // Cambia a la vista del plan después de generarlo.
    } else {
      alert('Por favor, carga datos de ventas y configura las restricciones primero.');
    }
  };
  
  // Lógica para renderizar el componente de la vista activa.
  const renderActiveView = () => {
    switch (activeView) {
      case ActiveView.DASHBOARD:
        return <DashboardSection />;
      case ActiveView.DATA_IMPORT:
        return <DataImportSection onDataLoaded={setSalesData} />;
      case ActiveView.CONSTRAINTS:
        return <ConstraintConfigurationSection onConstraintsChanged={setConstraints} />;
      case ActiveView.PERSONNEL:
        return <PersonnelManagementSection />;
      case ActiveView.ABSENTEEISM:
        return <AbsenteeismSection />;
      case ActiveView.PRODUCTION_PLAN:
        return <ProductionPlanSection plan={productionPlan} onGenerate={onGeneratePlan} />;
      case ActiveView.MAINTENANCE:
        return <MaintenanceSection />;
      case ActiveView.TACTICAL_SCHEDULING:
        return <TacticalSchedulingSection />;
      default:
        return <DashboardSection />;
    }
  };

  return (
    <div className="flex h-screen">
      {/* La navegación lateral se podría mover a un componente Layout si se comparte en más páginas */}
      <aside className="w-64 bg-gray-800 text-white p-4">
        <h1 className="text-2xl font-bold mb-6">Prod-Opt</h1>
        <nav>
          <ul>
            {Object.values(ActiveView).map((view) => {
              const config = viewConfig[view];
              return (
                <li key={view} className="mb-2">
                  <button
                    onClick={() => handleViewChange(view)}
                    className={`flex items-center w-full text-left p-2 rounded-lg ${
                      activeView === view ? 'bg-gray-700' : 'hover:bg-gray-700'
                    }`}
                  >
                    <span className="mr-3">{config.icon}</span>
                    {config.title}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
      
      {/* Área de contenido principal donde se renderiza la vista activa */}
      <main className="flex-1 p-6 bg-gray-100 overflow-auto">
        {renderActiveView()}
      </main>
    </div>
  );
}
