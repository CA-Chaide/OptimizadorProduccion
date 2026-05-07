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

  // Obtener restricciones de Horas para la matriz superior
  const getHoursRestrictionsForCenter = (centerId: string) => {
    const group = groups.find(g => String(g.centro).trim() === centerId && g.nombre_grupo.toLowerCase().includes('ensamblado'));
    if (!group) return { hTrabajo: 0, hExtras: 0 };

    const hTrabajoRes = restrictions.find(r => r.codigo_grupo === group.codigo_grupo && r.nombre_restriccion === 'HORAS_TRABAJO');
    const hExtrasRes = restrictions.find(r => r.codigo_grupo === group.codigo_grupo && r.nombre_restriccion === 'MAX_EXTRAS_HORAS');

    return {
      hTrabajo: Number(hTrabajoRes?.valor_restriccion || 0),
      hExtras: Number(hExtrasRes?.valor_restriccion || 0)
    };
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

  const formatOperators = (minutes: number, totalDayHours: number) => {
    if (totalDayHours === 0 || minutes === 0) return "0.0";
    const hoursRequired = minutes / 60;
    const ops = hoursRequired / totalDayHours;
    return ops.toLocaleString(undefined, { 
      minimumFractionDigits: 1, 
      maximumFractionDigits: 1 
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

        {availableCenters.map(centerId => {
          const { hTrabajo, hExtras } = getHoursRestrictionsForCenter(centerId);
          const totalHorasDia = hTrabajo + hExtras;

          return (
          <TabsContent key={centerId} value={centerId} className="mt-0 space-y-8">
            
            {/* Cabecera: Filtro Fecha + Matriz de Restricciones */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Filtro de Fecha */}
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

              {/* Matriz de Restricciones (Estilo imagen) */}
              <div className="border border-black bg-white min-w-[220px]">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#cceeff] border-b border-black">
                      <th colSpan={2} className="py-2 text-center font-bold text-gray-700 uppercase tracking-wider">Restricción</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-black">
                      <td className="px-3 py-2 font-bold text-gray-700 border-r border-black">HORAS_TRABAJO</td>
                      <td className="px-3 py-2 text-right font-mono font-medium">{hTrabajo}</td>
                    </tr>
                    <tr className="border-b border-black">
                      <td className="px-3 py-2 font-bold text-gray-700 border-r border-black">MAX_EXTRAS_HORAS</td>
                      <td className="px-3 py-2 text-right font-mono font-medium">{hExtras}</td>
                    </tr>
                    <tr className="bg-[#cceeff] font-bold">
                      <td className="px-3 py-2 text-gray-700 border-r border-black">TOTAL HORAS</td>
                      <td className="px-3 py-2 text-right font-mono text-sm">{totalHorasDia}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {ordenes.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-dashed border-gray-300 py-24 flex flex-col items-center justify-center text-center">
                <Loader2 className="w-10 h-10 text-indigo-300 animate-spin mb-4" />
                <p className="text-gray-500 font-medium">Esperando datos de Órdenes Fert...</p>
                <p className="text-xs text-gray-400 mt-1">Por favor carga las órdenes en la pestaña anterior.</p>
              </div>
            ) : (
              <div className="space-y-8">
                {/* 1. Matriz de Carga Horaria */}
                <div className="bg-white rounded-lg shadow-sm border border-black overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse border-black">
                      <thead className="bg-[#cceeff]">
                        <tr className="border-b border-black">
                          <th className="px-4 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">
                            <div className="flex items-center gap-1">
                              Máquina
                              <ChevronDown className="w-3 h-3" />
                            </div>
                          </th>
                          <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">Armado (h)</th>
                          <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">Cerrado L1 (h)</th>
                          <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">Cerrado1 L2 (h)</th>
                          <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">Cerrado2 L2 (h)</th>
                          <th className="px-4 py-2 text-right text-[11px] font-bold text-gray-700 uppercase tracking-wider">Cerrado L3 (h)</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {matrixData.length > 0 ? (
                          <>
                            {matrixData.map((row, idx) => (
                              <tr key={`ch-${centerId}-${row.maquina}-${idx}`} className="hover:bg-blue-50/30 border-b border-gray-200">
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-900 border-r border-black">{row.maquina}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-black">{formatHours(row.sumTT_Armado)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-black">{formatHours(row.sumTT_CerradoL1)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-black">{formatHours(row.sumTT_Cerrado1L2)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-black">{formatHours(row.sumTT_Cerrado2L2)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600">{formatHours(row.sumTT_CerradoL3)}</td>
                              </tr>
                            ))}
                            <tr className="bg-[#cceeff]/40 font-bold border-t border-black">
                              <td className="px-4 py-2 text-xs text-gray-700 uppercase border-r border-black">Total general</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-black">{formatHours(totalGeneral.sumTT_Armado, 2)}</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-black">{formatHours(totalGeneral.sumTT_CerradoL1, 2)}</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-black">{formatHours(totalGeneral.sumTT_Cerrado1L2, 2)}</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-black">{formatHours(totalGeneral.sumTT_Cerrado2L2, 2)}</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900">{formatHours(totalGeneral.sumTT_CerradoL3, 2)}</td>
                            </tr>
                          </>
                        ) : (
                          <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">No hay información de carga para hoy.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 2. Matriz de Operadores Requeridos */}
                <div className="bg-white rounded-lg shadow-sm border border-black overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse border-black">
                      <thead className="bg-[#cceeff]">
                        <tr className="border-b border-black">
                          <th colSpan={6} className="px-4 py-3 text-left text-sm font-bold text-gray-800 uppercase tracking-wide">
                            Total operadores por puesto de Trabajo
                          </th>
                        </tr>
                        <tr className="border-b border-black">
                          <th className="px-4 py-2 text-left text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">Máquina</th>
                          <th className="px-4 py-2 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">Armado</th>
                          <th className="px-4 py-2 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">Cerrado L1</th>
                          <th className="px-4 py-2 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">Cerrado1 L2</th>
                          <th className="px-4 py-2 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider border-r border-black">Cerrado2 L2</th>
                          <th className="px-4 py-2 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider">Cerrado L3</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {matrixData.length > 0 ? (
                          <>
                            {matrixData.map((row, idx) => (
                              <tr key={`op-${centerId}-${row.maquina}-${idx}`} className="hover:bg-blue-50/30 border-b border-gray-200">
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-medium text-gray-900 border-r border-black">{row.maquina}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-black">{formatOperators(row.sumTT_Armado, totalHorasDia)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-black">{formatOperators(row.sumTT_CerradoL1, totalHorasDia)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-black">{formatOperators(row.sumTT_Cerrado1L2, totalHorasDia)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600 border-r border-black">{formatOperators(row.sumTT_Cerrado2L2, totalHorasDia)}</td>
                                <td className="px-4 py-2 whitespace-nowrap text-xs font-mono text-right text-gray-600">{formatOperators(row.sumTT_CerradoL3, totalHorasDia)}</td>
                              </tr>
                            ))}
                            <tr className="bg-[#cceeff]/40 font-bold border-t border-black">
                              <td className="px-4 py-2 text-xs text-gray-700 uppercase border-r border-black">Total operadores</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-black">{formatOperators(totalGeneral.sumTT_Armado, totalHorasDia)}</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-black">{formatOperators(totalGeneral.sumTT_CerradoL1, totalHorasDia)}</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-black">{formatOperators(totalGeneral.sumTT_Cerrado1L2, totalHorasDia)}</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900 border-r border-black">{formatOperators(totalGeneral.sumTT_Cerrado2L2, totalHorasDia)}</td>
                              <td className="px-4 py-2 text-right text-sm font-mono text-gray-900">{formatOperators(totalGeneral.sumTT_CerradoL3, totalHorasDia)}</td>
                            </tr>
                          </>
                        ) : (
                          <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">No hay información disponible.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
        );})}
      </Tabs>
    </div>
  );
};
