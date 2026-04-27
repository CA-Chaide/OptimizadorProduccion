'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { ListChecks, Home, Map, Hash, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from '@/components/ui/card';
import type { Grupo, Restriccion } from '@/types/interfaces';

interface ProgDiariaTabSectionProps {
  readonly groups: Grupo[];
  readonly restrictions: Restriccion[];
}

export const ProgDiariaTabSection: React.FC<ProgDiariaTabSectionProps> = ({ groups, restrictions }) => {
  const inspector = useRuntimeInspector('ProgDiariaTab');
  const [selectedCenter, setSelectedCenter] = useState<string>("");

  // Obtener centros únicos de los grupos
  const availableCenters = useMemo(() => {
    const centers = [...new Set(groups.map(g => String(g.centro).trim()))].sort();
    return centers;
  }, [groups]);

  // Inicializar el centro seleccionado
  useEffect(() => {
    if (availableCenters.length > 0 && !selectedCenter) {
      setSelectedCenter(availableCenters[0]);
    }
  }, [availableCenters, selectedCenter]);

  // Helper para procesar el valor de la restricción
  const parseHojaDeRuta = (value: string): string[] => {
    if (!value) return [];
    // Separar por , o & y limpiar espacios
    return value.split(/[,&]/).map(v => v.trim()).filter(Boolean);
  };

  // Obtener Hojas de Ruta por Centro
  const routesByCenter = useMemo(() => {
    const result: Record<string, string[]> = {};

    availableCenters.forEach(centerId => {
      // 1. Encontrar el grupo de ensamblado para este centro
      const group = groups.find(g => 
        String(g.centro).trim() === centerId && 
        g.nombre_grupo.toLowerCase().includes('ensamblado')
      );

      if (group) {
        // 2. Buscar la restricción HOJA_DE_RUTA para este grupo
        const restriction = restrictions.find(r => 
          r.codigo_grupo === group.codigo_grupo && 
          r.nombre_restriccion.toUpperCase() === 'HOJA_DE_RUTA'
        );

        if (restriction) {
          result[centerId] = parseHojaDeRuta(restriction.valor_restriccion);
        } else {
          result[centerId] = [];
        }
      } else {
        result[centerId] = [];
      }
    });

    inspector.captureVariable('hojas_de_ruta_mapeadas', result);
    return result;
  }, [availableCenters, groups, restrictions, inspector]);

  if (availableCenters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-lg border border-dashed">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400 mb-4" />
        <p className="text-gray-500">Cargando configuración de centros...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ListChecks className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Programación Diaria</h3>
            <p className="text-xs text-gray-500 mt-1">Gestión de Hojas de Ruta configuradas por Planta</p>
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
            <div className="space-y-4">
              {/* Header de la sección */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Map className="w-5 h-5 text-indigo-600" />
                  <div>
                    <span className="text-sm font-bold text-indigo-900 uppercase">Hojas de Ruta Activas - Planta {centerId}</span>
                    <p className="text-[10px] text-indigo-700 mt-0.5">Definidas en la restricción técnica HOJA_DE_RUTA</p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-white text-indigo-700 border-indigo-200">
                  {routesByCenter[centerId]?.length || 0} Rutas
                </Badge>
              </div>

              {/* Lista de Hojas de Ruta */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {routesByCenter[centerId] && routesByCenter[centerId].length > 0 ? (
                  routesByCenter[centerId].map((route, idx) => (
                    <Card key={`${route}-${idx}`} className="hover:shadow-md transition-shadow border-l-4 border-l-indigo-500">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="bg-indigo-100 p-2 rounded-lg">
                            <Hash className="w-4 h-4 text-indigo-600" />
                          </div>
                          <div>
                            <span className="text-xs font-bold text-gray-500 uppercase tracking-tighter">Código Ruta</span>
                            <p className="text-lg font-mono font-bold text-gray-900 leading-none">{route}</p>
                          </div>
                        </div>
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-none text-[10px] font-bold">
                          ACTIVA
                        </Badge>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <div className="col-span-full py-12 flex flex-col items-center justify-center bg-gray-50 rounded-xl border border-dashed border-gray-300">
                    <AlertCircle className="w-10 h-10 text-gray-300 mb-3" />
                    <p className="text-gray-500 font-medium">No hay Hojas de Ruta configuradas para el Centro {centerId}</p>
                    <p className="text-xs text-gray-400 mt-1">Verifique las restricciones del grupo de ensamblado</p>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
