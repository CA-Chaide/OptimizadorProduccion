'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { dataStore } from '@/services/DataStore';
import { CalendarRange, Home, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Grupo, Restriccion } from '@/types/interfaces';

interface ProgDiariaTabSectionProps {
  readonly groups: Grupo[];
  readonly restrictions: Restriccion[];
}

interface RowAggregation {
  maquina: string;
  sumTT_Armado: number;
  sumTT_CerradoL1: number;
  sumTT_Cerrado1L2: number;
  sumTT_Cerrado2L2: number;
  sumTT_CerradoL3: number;
}

export const ProgDiariaTabSection: React.FC<ProgDiariaTabSectionProps> = ({ groups, restrictions }) => {
  const inspector = useRuntimeInspector('ProgDiariaTab');
  
  const [ordenes, setOrdenes] = useState<any[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("");
  const [selectedDates, setSelectedDates] = useState<Record<string, string>>({});

  // Suscribirse a cambios en el DataStore para obtener órdenes Fert
  useEffect(() => {
    const unsubscribe = dataStore.subscribe((key, snapshot) => {
      if (key === 'ordenesFert' && snapshot) {
        setOrdenes(snapshot.data || []);
      }
    });
    
    // Carga inicial
    const initial = dataStore.getData('ordenesFert');
    if (initial) setOrdenes(initial.data || []);

    return unsubscribe;
  }, []);

  // Obtener centros únicos de los grupos de ensamblado
  const availableCenters = useMemo(() => {
    const centers = [...new Set(groups.map(g => String(g.centro).trim()))].sort();
    return centers;
  }, [groups]);

  // Inicializar centro seleccionado
  useEffect(() => {
    if (availableCenters.length > 0 && !selectedCenter) {
      setSelectedCenter(availableCenters[0]);
    }
  }, [availableCenters, selectedCenter]);

  // Obtener fechas únicas por centro
  const availableDatesByCenter = useMemo(() => {
    const datesMap: Record<string, string[]> = {};
    availableCenters.forEach(centerId => {
      const dates = [...new Set(ordenes
        .filter(o => String(o.CENTRO || '').trim() === centerId)
        .map(o => o.FECHA)
      )].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
      datesMap[centerId] = dates;
    });
    return datesMap;
  }, [ordenes, availableCenters]);

  // Inicializar fecha seleccionada por centro
  useEffect(() => {
    const newSelectedDates = { ...selectedDates };
    let changed = false;
    availableCenters.forEach(centerId => {
      if (!newSelectedDates[centerId] && availableDatesByCenter[centerId]?.length > 0) {
        newSelectedDates[centerId] = availableDatesByCenter[centerId][0];
        changed = true;
      }
    });
    if (changed) setSelectedDates(newSelectedDates);
  }, [availableDatesByCenter, availableCenters, selectedDates]);

  // Obtener rutas de la restricción HOJA_DE_RUTA
  const getRoutesForCenter = (centerId: string) => {
    const group = groups.find(g => String(g.centro).trim() === centerId);
    if (!group) return [];
    
    const restriction = restrictions.find(r => 
      r.codigo_grupo === group.codigo_grupo && 
      r.nombre_restriccion === 'HOJA_DE_RUTA'
    );
    
    if (!restriction) return [];
    return restriction.valor_restriccion.split(/[,&]/).map(r => r.trim()).filter(Boolean);
  };

  // Lógica de agregación para la matriz
  const matrixData = useMemo(() => {
    if (!selectedCenter || ordenes.length === 0) return [];
    
    const currentDate = selectedDates[selectedCenter];
    if (!currentDate) return [];

    const routes = getRoutesForCenter(selectedCenter);
    // Filtrar por CENTRO y FECHA
    const centerOrders = ordenes.filter(o => 
      String(o.CENTRO || '').trim() === selectedCenter && 
      o.FECHA === currentDate
    );
    
    // Agrupar por Máquina
    const aggregated = new Map<string, RowAggregation>();
    
    // Inicializar mapa con todas las rutas oficiales
    routes.forEach(route => {
      aggregated.set(route, {
        maquina: route,
        sumTT_Armado: 0,
        sumTT_CerradoL1: 0,
        sumTT_Cerrado1L2: 0,
        sumTT_Cerrado2L2: 0,
        sumTT_CerradoL3: 0
      });
    });

    // Sumar valores de las órdenes
    centerOrders.forEach(order => {
      const maquina = String(order.MAQUINA || '').trim();
      if (aggregated.has(maquina)) {
        const row = aggregated.get(maquina)!;
        row.sumTT_Armado += Number(order.ttArmado || 0);
        row.sumTT_CerradoL1 += Number(order.ttCerradoL1 || 0);
        row.sumTT_Cerrado1L2 += Number(order.ttCerrado1L2 || 0);
        row.sumTT_Cerrado2L2 += Number(order.ttCerrado2L2 || 0);
        row.sumTT_CerradoL3 += Number(order.ttCerradoL3 || 0);
      }
    });

    return Array.from(aggregated.values()).sort((a, b) => a.maquina.localeCompare(b.maquina));
  }, [selectedCenter, selectedDates, ordenes, groups, restrictions]);

  // Totales generales
  const totalGeneral = useMemo(() => {
    return matrixData.reduce((acc, row) => ({
      maquina: 'Total general',
      sumTT_Armado: acc.sumTT_Armado + row.sumTT_Armado,
      sumTT_CerradoL1: acc.sumTT_CerradoL1 + row.sumTT_CerradoL1,
      sumTT_Cerrado1L2: acc.sumTT_Cerrado1L2 + row.sumTT_Cerrado1L2,
      sumTT_Cerrado2L2: acc.sumTT_Cerrado2L2 + row.sumTT_Cerrado2L2,
      sumTT_CerradoL3: acc.sumTT_CerradoL3 + row.sumTT_CerradoL3,
    }), {
      maquina: 'Total general',
      sumTT_Armado: 0,
      sumTT_CerradoL1: 0,
      sumTT_Cerrado1L2: 0,
      sumTT_Cerrado2L2: 0,
      sumTT_CerradoL3: 0
    });
  }, [matrixData]);

  const handleDateChange = (centerId: string, date: string) => {
    setSelectedDates(prev => ({ ...prev, [centerId]: date }));
  };

  const formatHours = (minutes: number, decimals: number = 0) => {
    const hours = minutes / 60;
    if (hours === 0) return "0";
    return hours.toLocaleString(undefined, { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: 2 
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CalendarRange className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Programación Diaria de Planta</h3>
            <p className="text-xs text-gray-500 mt-1">Matriz de Carga Horaria por Máquina y Estación</p>
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
          <TabsContent key={centerId} value={centerId} className="mt-0 space-y-4">
            {/* Filtro de Fecha - Estilo Screenshot */}
            <div className="flex items-center gap-4">
               <div className="flex items-center bg-[#cceeff] border border-[#99ccff] rounded px-2 py-1 min-w-[250px]">
                 <span className="text-xs font-semibold text-gray-700 mr-2">Fecha</span>
                 <select 
                    value={selectedDates[centerId] || ""} 
                    onChange={(e) => handleDateChange(centerId, e.target.value)}
                    className="bg-transparent text-xs font-medium text-gray-900 outline-none flex-1 cursor-pointer"
                 >
                    {availableDatesByCenter[centerId]?.map(date => (
                      <option key={date} value={date}>{date}</option>
                    ))}
                    {(!availableDatesByCenter[centerId] || availableDatesByCenter[centerId].length === 0) && (
                      <option value="">No hay fechas disponibles</option>
                    )}
                 </select>
               </div>
            </div>

            {ordenes.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-dashed border-gray-300 py-24 flex flex-col items-center justify-center text-center">
                <Loader2 className="w-10 h-10 text-indigo-300 animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Esperando datos de Órdenes Fert...</p>
                <p className="text-xs text-gray-400 mt-1">Por favor carga las órdenes en la pestaña anterior.</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-[#cceeff]">
                      <tr>
                        <th className="px-4 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-[#99ccff]">
                          <div className="flex items-center gap-1">
                            Máquina
                            <ChevronDown className="w-3 h-3" />
                          </div>
                        </th>
                        <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-[#99ccff]">Suma de TT Armado</th>
                        <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-[#99ccff]">Suma de TT Cerrado L1</th>
                        <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-[#99ccff]">Suma de TT Cerrado1 L2</th>
                        <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-[#99ccff]">Suma de TT Cerrado2 L2</th>
                        <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider">Suma de TT Cerrado L3</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {matrixData.length > 0 ? (
                        <>
                          {matrixData.map((row, idx) => (
                            <tr key={`${centerId}-${row.maquina}-${idx}`} className="hover:bg-blue-50/30 transition-colors">
                              <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-900 border-r border-gray-50">{row.maquina}</td>
                              <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-gray-50">
                                {formatHours(row.sumTT_Armado)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-gray-50">
                                {formatHours(row.sumTT_CerradoL1)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-gray-50">
                                {formatHours(row.sumTT_Cerrado1L2)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-gray-50">
                                {formatHours(row.sumTT_Cerrado2L2)}
                              </td>
                              <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600">
                                {formatHours(row.sumTT_CerradoL3)}
                              </td>
                            </tr>
                          ))}
                          {/* Fila de Total General */}
                          <tr className="bg-[#cceeff]/40 font-bold border-t-2 border-[#99ccff]">
                            <td className="px-4 py-2 text-xs text-gray-700 uppercase border-r border-[#99ccff]">Total general</td>
                            <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-[#99ccff]">
                              {formatHours(totalGeneral.sumTT_Armado, 2)}
                            </td>
                            <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-[#99ccff]">
                              {formatHours(totalGeneral.sumTT_CerradoL1, 2)}
                            </td>
                            <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-[#99ccff]">
                              {formatHours(totalGeneral.sumTT_Cerrado1L2, 2)}
                            </td>
                            <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-[#99ccff]">
                              {formatHours(totalGeneral.sumTT_Cerrado2L2, 2)}
                            </td>
                            <td className="px-4 py-2 text-right text-sm font-mono text-gray-900">
                              {formatHours(totalGeneral.sumTT_CerradoL3, 2)}
                            </td>
                          </tr>
                        </>
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                            No hay información disponible para la fecha seleccionada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
