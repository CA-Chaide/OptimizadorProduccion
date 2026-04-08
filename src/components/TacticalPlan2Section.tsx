'use client';

import React from 'react';
import { CalendarClock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const TacticalPlan2Section: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <CalendarClock className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica colchones</h2>
      </div>
      
      <Tabs defaultValue="backend" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-1">
          <TabsTrigger value="backend">Backend Previsionales</TabsTrigger>
        </TabsList>
        
        <TabsContent value="backend" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Backend Previsionales</CardTitle>
              <CardDescription>
                Sección dedicada a la visualización y gestión de órdenes previsionales desde el backend para colchones.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-gray-500 border-2 border-dashed rounded-lg">
                <CalendarClock className="w-12 h-12 mb-4 text-gray-300" />
                <p>Esperando instrucciones para la carga y visualización de datos en esta pestaña.</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
