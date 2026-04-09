'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';

export const TacticalPlanForrosSection: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <CalendarClock className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Forros</h2>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Datos de Órdenes Previsionales (Forros)</CardTitle>
          <CardDescription>
            Visualización y exploración de las órdenes previsionales disponibles para el área de forros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProvisionalOrdersTabSection />
        </CardContent>
      </Card>
    </div>
  );
};
