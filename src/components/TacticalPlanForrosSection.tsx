'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarClock, Loader2, Users, Lock, Package, Timer, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppProvider';

export const TacticalPlanForrosSection: React.FC = () => {
  const { addNotification } = useAppContext();
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [tiemposProduccion, setTiemposProduccion] = useState<any[]>([]);
  const [dailyOrders, setDailyOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTiempos, setIsLoadingTiempos] = useState(false);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);

  const [tiemposPage, setTiemposPage] = useState(1);
  const [tiemposRowsPerPage, setTiemposRowsPerPage] = useState(20);

  const [dailyPage, setDailyPage] = useState(1);
  const [dailyRowsPerPage, setDailyRowsPerPage] = useState(20);

  // Helper para obtener hoy en Ecuador (YYYY-MM-DD) de forma segura
  const getEcuadorTodayString = (): string => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
  };

  // FUNCIÓN MAESTRA: Extrae las partes de la fecha SIN usar el objeto Date de JS
  // Esto evita desfases por zona horaria (UTC-5) y garantiza que el dato sea el mismo del servidor
  const safeParseDateParts = (value: any) => {
    if (!value) return null;
    const str = String(value).trim();
    
    // Intenta formato YYYY-MM-DD (ej: 2026-04-29...)
    const ymd = str.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return { y: ymd[1], m: ymd[2], d: ymd[3] };
    
    // Intenta formato DD/MM/YYYY (ej: 29/04/2026...)
    const dmy = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmy) return { y: dmy[3], m: dmy[2], d: dmy[1] };
    
    return null;
  };

  // Normaliza a YYYY-MM-DD para comparaciones lógicas exactas sin horas
  const normalizeDateForFilter = (dateInput: any): string | null => {
    const parts = safeParseDateParts(dateInput);
    if (parts) return `${parts.y}-${parts.m}-${parts.d}`;
    return null;
  };

  // Formatea para visualización (DD/MM/YYYY) preservando los números originales
  const formatValueForDisplay = (col: string, value: any): string => {
    if (value === null || value === undefined) return '—';
    const upperCol = col.toUpperCase().trim();
    
    if (upperCol.includes('FECHA')) {
      const parts = safeParseDateParts(value);
      if (parts) {
        // Retornamos el formato legible DD/MM/YYYY extraído directamente del texto
        return `${parts.d}/${parts.m}/${parts.y}`;
      }
      return String(value);
    }
    
    return String(value);
  };

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [gRes, rRes] = await Promise.all([
        grupoService.getAll(),
        restriccionService.getAll()
      ]);
      setGrupos(gRes.data || []);
      setRestricciones(rRes.data || []);
    } catch (error) {
      console.error('Error fetching forros data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const forrosGruposList = useMemo(() => {
    return grupos.filter(g => (g.nombre_grupo || '').toUpperCase().includes('FORROS'));
  }, [grupos]);

  const forrosRestricciones = useMemo(() => {
    const forrosGroupIds = new Set(forrosGruposList.map(g => g.codigo_grupo));
    return restricciones.filter(r => forrosGroupIds.has(r.codigo_grupo));
  }, [forrosGruposList, restricciones]);

  const horizonValue = useMemo(() => {
    const horizon = forrosRestricciones.find(r => {
      const name = r.nombre_restriccion.trim().toUpperCase();
      return name === 'HORIZONTE_PLANIFICACION' || name === 'HORIZONTE_PLANIFICACIÓN';
    });
    const val = horizon ? parseInt(horizon.valor_restriccion) : 1;
    return isNaN(val) ? 1 : val;
  }, [forrosRestricciones]);

  const getTargetPlanningDate = useCallback((days: number) => {
    const todayStr = getEcuadorTodayString();
    const [y, m, d] = todayStr.split('-').map(Number);
    const date = new Date(y, m - 1, d); // Mes es 0-indexed en JS
    
    date.setDate(date.getDate() + days);
    
    const dayOfWeek = date.getDay();
    if (dayOfWeek === 6) date.setDate(date.getDate() + 2); // Sábado -> Lunes
    else if (dayOfWeek === 0) date.setDate(date.getDate() + 1); // Domingo -> Lunes
    
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(date);
  }, []);

  const targetDate = useMemo(() => getTargetPlanningDate(horizonValue), [getTargetPlanningDate, horizonValue]);
  const todayDate = useMemo(() => getEcuadorTodayString(), []);

  const externalFilters = useMemo(() => {
    const filters: Record<string, string[]> = {};
    forrosRestricciones.forEach(r => {
      const name = (r.nombre_restriccion || '').trim().toUpperCase();
      if (name === 'RESPCTRLPROD' || name === 'ALMACEN' || name === 'ALMACÉN') {
        const key = name === 'ALMACÉN' ? 'ALMACEN' : name;
        if (!filters[key]) filters[key] = [];
        filters[key].push(r.valor_restriccion.trim());
      }
    });
    return filters;
  }, [forrosRestricciones]);

  const fetchTiemposProduccion = useCallback(async () => {
    if (forrosGruposList.length === 0) return;
    setIsLoadingTiempos(true);
    try {
      const promises = forrosGruposList.map(g => 
        serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo)
      );
      const responses = await Promise.all(promises);
      setTiemposProduccion(responses.flatMap(res => res.data || []));
      setTiemposPage(1); 
    } catch (error) {
      console.error('Error al cargar tiempos de producción:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [forrosGruposList]);

  const fetchDailyOrders = useCallback(async () => {
    if (Object.keys(externalFilters).length === 0) return;
    setIsLoadingDaily(true);
    try {
      const response = await serviciosService.OrdenesProvisionalesPaginados(1, 10000);
      if (response && response.data) {
        const filtered = response.data.filter((order: any) => {
          const matchesExternal = Object.entries(externalFilters).every(([key, allowed]) => {
            const orderKey = Object.keys(order).find(k => k.toUpperCase().trim() === key.toUpperCase().trim());
            if (!orderKey) return true;
            const val = String(order[orderKey] ?? '').trim().toUpperCase();
            return allowed.some(a => a.trim().toUpperCase() === val);
          });
          if (!matchesExternal) return false;

          const orderDateKey = Object.keys(order).find(k => k.toUpperCase() === 'FECHAINICIO');
          if (!orderDateKey) return false;
          
          const normalizedOrderDate = normalizeDateForFilter(order[orderDateKey]);
          return normalizedOrderDate === todayDate || normalizedOrderDate === targetDate;
        });
        setDailyOrders(filtered);
        setDailyPage(1);
      }
    } catch (error) {
      console.error('Error fetching daily orders:', error);
      addNotification('error', 'Error al cargar órdenes diarias.');
    } finally {
      setIsLoadingDaily(false);
    }
  }, [externalFilters, targetDate, todayDate, addNotification]);

  useEffect(() => {
    if (forrosGruposList.length > 0) {
      fetchTiemposProduccion();
      fetchDailyOrders();
    }
  }, [forrosGruposList, fetchTiemposProduccion, fetchDailyOrders]);

  const tiemposColumns = useMemo(() => {
    if (tiemposProduccion.length === 0) return [];
    const allKeys = Object.keys(tiemposProduccion[0]);
    const priority = ['CodMaterial', 'Material', 'Centro', 'Linea', 'PuestoTrabajo', 'Tiempo'];
    return [...priority.filter(k => allKeys.includes(k)), ...allKeys.filter(k => !priority.includes(k))];
  }, [tiemposProduccion]);

  const dailyColumns = useMemo(() => {
    if (dailyOrders.length === 0) return [];
    const allKeys = Object.keys(dailyOrders[0]);
    // Agregamos RAW_FECHA_BACKEND
    const priority = ['ORDENPREVISIONAL', 'MATERIAL', 'TEXTOMATERIAL', 'FECHAINICIO', 'RAW_FECHA_BACKEND', 'CANTIDAD', 'FECHAFIN'];
    return [...priority.filter(k => allKeys.includes(k) || k === 'RAW_FECHA_BACKEND'), ...allKeys.filter(k => !priority.includes(k))];
  }, [dailyOrders]);

  const paginatedTiemposData = useMemo(() => {
    const start = (tiemposPage - 1) * tiemposRowsPerPage;
    return tiemposProduccion.slice(start, start + tiemposRowsPerPage);
  }, [tiemposProduccion, tiemposPage, tiemposRowsPerPage]);

  const paginatedDailyData = useMemo(() => {
    const start = (dailyPage - 1) * dailyRowsPerPage;
    return dailyOrders.slice(start, start + dailyRowsPerPage);
  }, [dailyOrders, dailyPage, dailyRowsPerPage]);

  const totalTiemposPages = Math.max(1, Math.ceil(tiemposProduccion.length / tiemposRowsPerPage));
  const totalDailyPages = Math.max(1, Math.ceil(dailyOrders.length / dailyRowsPerPage));

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <CalendarClock className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Forros</h2>
      </div>

      <Tabs defaultValue="grupos" className="w-full">
        <div className="relative border-b border-gray-200 mb-8">
          <TabsList className="flex w-full h-auto bg-transparent p-0 overflow-x-auto justify-start scrollbar-hide">
            <TabsTrigger value="grupos" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
            <TabsTrigger value="restricciones" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap"><Lock className="w-4 h-4" /> Restricciones</TabsTrigger>
            <TabsTrigger value="tiempos" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap"><Timer className="w-4 h-4" /> Tiempos de Producción</TabsTrigger>
            <TabsTrigger value="ordenes" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap"><Package className="w-4 h-4" /> Órdenes Previsionales</TabsTrigger>
            <TabsTrigger value="diaria" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap"><CalendarCheck className="w-4 h-4" /> Programación Diaria</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="grupos">
          <Card>
            <CardHeader><CardTitle>Grupos de Forros</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Código</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Centro</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Nombre</th><th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase">Estado</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {forrosGruposList.map((g) => (
                        <tr key={g.codigo_grupo} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">{g.codigo_grupo}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{g.centro}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium">{g.nombre_grupo}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-center"><Badge variant={g.estado === 'A' ? 'default' : 'secondary'} className={g.estado === 'A' ? 'bg-green-600' : ''}>{g.estado === 'A' ? 'Activo' : 'Inactivo'}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <CardHeader><CardTitle>Restricciones de Forros</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Nombre</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Valor</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Descripción</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {forrosRestricciones.map((r) => (
                        <tr key={r.codigo_restriccion} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-semibold text-indigo-700">{r.nombre_restriccion}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-mono">{r.valor_restriccion}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">{r.descripcion || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card>
            <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1"><CardTitle>Tiempos de Producción (Ecuador Continental)</CardTitle></div>
              {!isLoadingTiempos && tiemposProduccion.length > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(1)} disabled={tiemposPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(p => Math.max(1, p - 1))} disabled={tiemposPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="px-3 text-[11px] font-bold min-w-[120px] text-center border-x py-1 bg-gray-50 rounded">Página {tiemposPage} de {totalTiemposPages}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(p => Math.min(totalTiemposPages, p + 1))} disabled={tiemposPage === totalTiemposPages}><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(totalTiemposPages)} disabled={tiemposPage === totalTiemposPages}><ChevronsRight className="h-4 w-4" /></Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchTiemposProduccion} disabled={isLoadingTiempos} title="Recargar"><RefreshCw className={cn("h-4 w-4", isLoadingTiempos && "animate-spin")} /></Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>{tiemposColumns.map(col => (<th key={col} className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap bg-gray-50 border-b">{col}</th>))}</tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {isLoadingTiempos ? (<tr><td colSpan={tiemposColumns.length || 1} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></td></tr>) : tiemposProduccion.length > 0 ? paginatedTiemposData.map((t, idx) => (
                        <tr key={`tiempo-${idx}`} className="hover:bg-blue-50/40 transition-colors">{tiemposColumns.map(col => (<td key={`cell-${idx}-${col}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] text-gray-600 font-mono">{formatValueForDisplay(col, t[col])}</td>))}</tr>
                      )) : (<tr><td colSpan={tiemposColumns.length || 1} className="py-20 text-center text-gray-400 italic bg-gray-50/50">No hay datos disponibles.</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card>
            <CardHeader><CardTitle>Órdenes Previsionales Filtradas (Ecuador Continental)</CardTitle></CardHeader>
            <CardContent><ProvisionalOrdersTabSection externalFilters={externalFilters} /></CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diaria">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarCheck className="w-5 h-5 text-primary" /> Programación Diaria (Ecuador): {formatValueForDisplay('FECHA', todayDate)} y {formatValueForDisplay('FECHA', targetDate)}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        {dailyColumns.map((col) => (
                          <th 
                            key={col} 
                            className={cn(
                              "px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-gray-50 border-b",
                              col === 'RAW_FECHA_BACKEND' ? "text-red-600 bg-red-50" : "text-gray-600"
                            )}
                          >
                            {col === 'RAW_FECHA_BACKEND' ? 'FECHA (RAW BACKEND)' : col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {isLoadingDaily ? (<tr><td colSpan={dailyColumns.length || 1} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></td></tr>) : dailyOrders.length > 0 ? paginatedDailyData.map((order, idx) => (
                        <tr key={`daily-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                          {dailyColumns.map((col) => (
                            <td 
                              key={`cell-${idx}-${col}`} 
                              className={cn(
                                "px-4 py-2.5 whitespace-nowrap text-[11px] font-mono",
                                col === 'RAW_FECHA_BACKEND' ? "text-red-700 bg-red-50/30" : "text-gray-600"
                              )}
                            >
                              {col === 'RAW_FECHA_BACKEND' 
                                ? String(order['FECHAINICIO'] || 'N/A') 
                                : formatValueForDisplay(col, order[col])}
                            </td>
                          ))}
                        </tr>
                      )) : (<tr><td colSpan={dailyColumns.length || 1} className="py-20 text-center text-gray-400 italic bg-gray-50/50">No hay órdenes para hoy o la fecha objetivo seleccionada.</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(1)} disabled={dailyPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(p => Math.max(1, p - 1))} disabled={dailyPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="px-3 text-[11px] font-bold min-w-[120px] text-center border-x py-1 bg-gray-50 rounded">Página {dailyPage} de {totalDailyPages}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(p => Math.min(totalDailyPages, p + 1))} disabled={dailyPage === totalDailyPages}><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(totalDailyPages)} disabled={dailyPage === totalDailyPages}><ChevronsRight className="h-4 w-4" /></Button>
                </div>
                <Button variant="outline" size="sm" onClick={fetchDailyOrders} disabled={isLoadingDaily} className="h-8"><RefreshCw className={cn("h-4 w-4", isLoadingDaily && "animate-spin")} /> Recargar</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
