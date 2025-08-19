'use client';

import React from 'react';
import type { ProductionPlanItem } from '@/types/types';

/**
 * Propiedades para el componente ProductionPlanSection.
 */
interface ProductionPlanSectionProps {
  plan: ProductionPlanItem[];
  onGenerate: () => void;
}

/**
 * Componente que muestra el plan de producción generado.
 * Es un Componente de Cliente porque es interactivo (botón, visualización de datos).
 */
export function ProductionPlanSection({ plan, onGenerate }: ProductionPlanSectionProps) {
  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Plan de Producción</h2>
        <button
          onClick={onGenerate}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Generar Nuevo Plan
        </button>
      </div>
      
      {/* Aquí se mostraría la tabla o visualización del plan */}
      {plan.length > 0 ? (
        <pre className="bg-white p-4 rounded-lg shadow">
          {JSON.stringify(plan, null, 2)}
        </pre>
      ) : (
        <p>Aún no se ha generado un plan. Carga datos y configura restricciones primero.</p>
      )}
    </div>
  );
}
