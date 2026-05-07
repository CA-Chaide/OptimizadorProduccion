'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { CalendarRange, Home, AlertCircle } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Grupo, Restriccion } from '@/types/interfaces';

interface ProgDiariaTabSectionProps {
  readonly groups: Grupo[];
  readonly restrictions: Restriccion[];
}

export const ProgDiariaTabSection: React.FC<ProgDiariaTabSectionProps> = ({ groups }) => {
  const inspector = useRuntimeInspector('ProgDiariaTab');
  
  // Obtener centros únicos de los grupos de ensamblado para las sub-pestañas
  const availableCenters = useMemo(() => {
    return [...new Set(groups.map(g => String(g.centro).trim()))].sort();
  }, [groups]);

  const [selectedCenter, setSelectedCenter] = useState<string>("");

  // Inicializar el centro seleccionado al cargar los grupos
  useEffect(() => {
    if (availableCenters.length > 0 && !selectedCenter) {
      setSelectedCenter(availableCenters[0]);
    }
  }, [availableCenters, selectedCenter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CalendarRange className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Programación Diaria de Planta</h3>
            <p className="text-xs text-gray-500 mt-1">Gestión y control de carga diaria por centro operativo</p>
          </div>
        </div>
      </div>

      <Tabs value={selectedCenter} onValueChange={setSelectedCenter} className="w-full">
        <TabsList className="flex h-auto bg-gray-100/50 p-1 mb-4">
          {availableCenters.map(center => (
            <TabsTrigger 
              key={center} 
              value={center}
              className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-6 py-2 text-xs font-bold uppercase tracking-wider"
            >
              <Home className="w-3 h-3 mr-2" />
              Centro {center}
            </TabsTrigger>
          ))}
        </TabsList>

        {availableCenters.map(centerId => (
          <TabsContent key={centerId} value={centerId} className="mt-0">
            <div className="bg-white rounded-lg shadow-sm border border-dashed border-gray-300 py-24 flex flex-col items-center justify-center text-center">
              <AlertCircle className="w-12 h-12 text-gray-300 mb-4" />
              <p className="text-gray-500 font-medium">No hay información disponible para mostrar</p>
              <p className="text-xs text-gray-400 mt-1">La matriz de programación diaria ha sido reiniciada.</p>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
