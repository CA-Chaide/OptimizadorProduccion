'use client';

import React from 'react';
import { Wind } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const TacticalPlanEspumasSection: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <Wind className="w-6 h-6 text-blue-600" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Espumas</h2>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Control de Producción de Espumas</CardTitle>
          <CardDescription>
            Gestión detallada de bloques y densidades para la programación diaria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 border-2 border-dashed rounded-lg">
            <Wind className="w-12 h-12 mb-4 text-gray-300" />
            <p>Módulo de planificación de espumas en desarrollo.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
