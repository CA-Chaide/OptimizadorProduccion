'use client';

import React from 'react';
import { Wind } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';

/**
 * TacticalPlanEspumasSection
 * 
 * Replicando el comportamiento de TacticalPlan2Section (Colchones)
 * para la división de Espumas.
 */
export const TacticalPlanEspumasSection: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <Wind className="w-6 h-6 text-blue-600" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Espumas</h2>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Datos de Órdenes Previsionales - Espumas</CardTitle>
          <CardDescription>
            Visualización y exploración de las órdenes previsionales cargadas en el sistema para el área de espumación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProvisionalOrdersTabSection />
        </CardContent>
      </Card>
    </div>
  );
};
