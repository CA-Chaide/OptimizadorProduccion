'use client';

import React from 'react';
import { Scissors } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <Scissors className="w-6 h-6 text-red-600" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Corte y Laminado</h2>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Optimización de Corte y Laminado</CardTitle>
          <CardDescription>
            Programación de máquinas de corte y procesos de laminación por capas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 border-2 border-dashed rounded-lg">
            <Scissors className="w-12 h-12 mb-4 text-gray-300" />
            <p>Módulo de corte y laminado en desarrollo.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
