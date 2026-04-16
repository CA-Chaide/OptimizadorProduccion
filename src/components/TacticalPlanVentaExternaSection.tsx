'use client';

import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';

/**
 * TacticalPlanVentaExternaSection
 * 
 * Replica el comportamiento de la sección de Colchones (TacticalPlan2Section)
 * integrando la visualización de Órdenes Previsionales del backend.
 */
export const TacticalPlanVentaExternaSection: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Encabezado de la sección */}
      <div className="flex items-center space-x-3">
        <ShoppingCart className="w-8 h-8 text-green-600" />
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Programación Táctica Venta Externa</h2>
          <p className="text-sm text-gray-500">Gestión y monitoreo de órdenes para canales de venta externa</p>
        </div>
      </div>
      
      {/* Card principal con la tabla de órdenes */}
      <Card>
        <CardHeader>
          <CardTitle>Datos de Órdenes Previsionales</CardTitle>
          <CardDescription>
            Visualización y exploración de todas las órdenes previsionales disponibles en el sistema para el área de venta externa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProvisionalOrdersTabSection />
        </CardContent>
      </Card>
    </div>
  );
};
