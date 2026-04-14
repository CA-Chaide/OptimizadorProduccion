'use client';

import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export const TacticalPlanVentaExternaSection: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <ShoppingCart className="w-6 h-6 text-green-600" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Venta Externa</h2>
      </div>
      
      <Card>
        <CardHeader>
          <CardTitle>Órdenes de Venta Externa</CardTitle>
          <CardDescription>
            Priorización y seguimiento de pedidos para clientes externos y distribuidores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-gray-500 border-2 border-dashed rounded-lg">
            <ShoppingCart className="w-12 h-12 mb-4 text-gray-300" />
            <p>Módulo de venta externa en desarrollo.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
