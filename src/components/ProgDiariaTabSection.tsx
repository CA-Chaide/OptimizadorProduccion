'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { dataStore } from '@/services/DataStore';
import { ListChecks, Home, Map, Hash, AlertCircle, Loader2, CalendarRange } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Grupo, Restriccion } from '@/types/interfaces';

interface ProgDiariaTabSectionProps {
  readonly groups: Grupo[];
  readonly restrictions: Restriccion[];
}

export const ProgDiariaTabSection: React.FC<ProgDiariaTabSectionProps> = ({ groups, restrictions }) => {
  const inspector = useRuntimeInspector('ProgDiariaTab');
  const [selectedCenter, setSelectedCenter] = useState<string>("");
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);

  // 1. Suscribirse a los datos de Órdenes Fert del DataStore
  useEffect(() => {
    const updateFromStore = () => {
      const snapshot = dataStore.getData('ordenesFert');
      if (snapshot?.data) {
        setOrdenesFert(snapshot.data);
      }
    };

    updateFromStore();
    return dataStore.subscribe((key) => {
      if (key === 'ordenesFert') updateFromStore();
    });
  }, []);

  // 2. Obtener centros únicos de los grupos
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

  // Helper para procesar el valor de la restricción HOJA_DE_RUTA
  const parseHojaDeRuta = (value: string): string[] => {
    if (!value) return [];
    return value.split(/[,&]/).map(v => v.trim()).filter(Boolean);
  };

  // 3. Generar Matriz de Carga por Centro
  const matrixData = useMemo(() => {
    if (!selectedCenter || ordenesFert.length === 0) return null;

    // Filtrar órdenes por centro
    const centerOrders = ordenesFert.filter(o => String(o.CENTRO).trim() === selectedCenter);
    
    // Obtener HOJA_DE_RUTA para este centro
    const group = groups.find(g => String(g.centro).trim() === selectedCenter && g.nombre_grupo.toLowerCase().includes('ensamblado'));
    const restriction = restrictions.find(r => r.codigo_grupo === group?.codigo_grupo && r.nombre_restriccion.toUpperCase() === 'HOJA_DE_RUTA');
    const allowedRoutes = parseHojaDeRuta(restriction?.valor_restriccion || "");

    // Extraer fechas únicas ordenadas
    const dates = [...new Set(centerOrders.map(o => o.FECHA))].sort((a, b) => {
      // Intentar ordenar fechas DD/MM/YYYY o ISO
      const parseDate = (d: string) => {
        const parts = d.split('/');
        if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
        return new Date(d).getTime();
      };
      return parseDate(a) - parseDate(b);
    });

    // Calcular Carga: SUM(T. TOTAL) / 60 por MAQUINA y FECHA
    const aggregation: Record<string, Record<string, number>> = {};
    
    centerOrders.forEach(o => {
      const route = String(o.MAQUINA || "").trim();
      const date = o.FECHA;
      const tTotal = Number((o.T_PROD || 0) * (o.CANTPENDIENTE || 0));

      if (!aggregation[route]) aggregation[route] = {};
      aggregation[route][date] = (aggregation[route][date] || 0) + (tTotal / 60);
    });

    return { allowedRoutes, dates, aggregation };
  }, [selectedCenter, ordenesFert, groups, restrictions]);

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
          <CalendarRange className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Matriz de Carga Diaria (Horas)</h3>
            <p className="text-xs text-gray-500 mt-1">Cálculo: Σ(T.Prod * Cant.Pendiente) / 60 por Ruta y Fecha</p>
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
            <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
              {matrixData && matrixData.dates.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[#003d5b] text-white">
                      <tr>
                        <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider border-r border-white/10 sticky left-0 bg-[#003d5b] z-20 min-w-[150px]">
                          CÓDIGO RUTA
                        </th>
                        {matrixData.dates.map(date => (
                          <th key={date} className="px-4 py-3 text-center text-[11px] font-bold uppercase tracking-wider border-r border-white/10 min-w-[100px]">
                            {date}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {matrixData.allowedRoutes.map(route => (
                        <tr key={route} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="px-4 py-3 text-[12px] font-bold text-white bg-[#003d5b] border-r border-white/10 sticky left-0 z-10">
                            {route}
                          </td>
                          {matrixData.dates.map(date => {
                            const val = matrixData.aggregation[route]?.[date];
                            return (
                              <td key={`${route}-${date}`} className="px-4 py-3 text-center text-sm font-mono text-gray-700 border-r border-gray-100">
                                {val !== undefined ? val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center bg-gray-50">
                  <AlertCircle className="w-12 h-12 text-gray-300 mb-4" />
                  <p className="text-gray-500 font-medium">No hay datos de Órdenes Fert disponibles para procesar</p>
                  <p className="text-xs text-gray-400 mt-1">Por favor, cargue la información en la pestaña "Fert" primero.</p>
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};