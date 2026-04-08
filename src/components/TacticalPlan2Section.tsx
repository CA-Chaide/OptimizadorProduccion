'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const TacticalPlan2Section: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <CalendarClock className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica 2</h2>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Nueva Sección de Programación Táctica</CardTitle>
          <CardDescription>
            Esta sección está preparada para recibir la nueva lógica de programación táctica.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 border-2 border-dashed rounded-lg">
            <CalendarClock className="w-12 h-12 mb-4 text-gray-300" />
            <p>Esperando instrucciones adicionales para la implementación de esta sección.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
