'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';

/**
 * Componente de sección para la Programación Táctica de Planchas Mixtas.
 * Basado en la estructura del módulo de colchones.
 */
export const TacticalPlanPlanchasMixtasSection: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <Layers className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Planchas Mixtas</h2>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Datos de Órdenes Previsionales</CardTitle>
          <CardDescription>
            Visualización y exploración de todas las órdenes previsionales correspondientes al área de Planchas Mixtas (Responsables 015 y 016).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProvisionalOrdersTabSection respCodes={['015', '016']} />
        </CardContent>
      </Card>
    </div>
  );
};