'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CalendarClock, Loader2, Users, Lock, Package, Timer, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarCheck, Search } from 'lucide-react';
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

  // Paginación Tiempos
  const [tiemposPage, setTiemposPage] = useState(1);
  const [tiemposRowsPerPage, setTiemposRowsPerPage] = useState(20);

  // Paginación Diaria
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyRowsPerPage, setDailyRowsPerPage] = useState(20);

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

  // Obtener valor de Horizonte de Planificación
  const horizonValue = useMemo(() => {
    const horizon = forrosRestricciones.find(r => 
      r.nombre_restriccion.trim().toUpperCase() === 'HORIZONTE_PLANIFICACION' || 
      r.nombre_restriccion.trim().toUpperCase() === 'HORIZONTE_PLANIFICACIÓN'
    );
    const val = horizon ? parseInt(horizon.valor_restriccion) : 1;
    return isNaN(val) ? 1 : val;
  }, [forrosRestricciones]);

  // Helper para fecha Hoy + Horizonte (sin fines de semana)
  const getTargetPlanningDate = useCallback((days: number) => {
    const date = new Date();
    // Añadimos los días del horizonte
    date.setDate(date.getDate() + days);
    
    const day = date.getDay(); // 0: Dom, 6: Sab
    
    // Ajustar si cae en fin de semana (mover al Lunes)
    if (day === 6) date.setDate(date.getDate() + 2); // Sábado -> Lunes
    else if (day === 0) date.setDate(date.getDate() + 1); // Domingo -> Lunes
    
    return date.toISOString().split('T')[0];
  }, []);

  const targetDate = useMemo(() => getTargetPlanningDate(horizonValue), [getTargetPlanningDate, horizonValue]);

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
          // 1. Filtro de Restricciones (RespCtrlProd / ALMACEN)
          const matchesExternal = Object.entries(externalFilters).every(([key, allowed]) => {
            const orderKey = Object.keys(order).find(k => k.toUpperCase().trim() === key.toUpperCase().trim());
            if (!orderKey) return true;
            const val = String(order[orderKey] ?? '').trim().toUpperCase();
            return allowed.some(a => a.trim().toUpperCase() === val);
          });

          if (!matchesExternal) return false;

          // 2. Filtro de Fecha Hoy + Horizonte
          const orderDateKey = Object.keys(order).find(k => k.toUpperCase() === 'FECHAINICIO');
          if (!orderDateKey) return false;
          
          const orderDate = String(order[orderDateKey] ?? '').split('T')[0];
          return orderDate === targetDate;
        });

        setDailyOrders(filtered);
        setDailyPage(1);
      }
    } catch (error) {
      console.error('Error fetching daily orders:', error);
      addNotification('error', 'No se pudieron cargar las órdenes para programación diaria.');
    } finally {
      setIsLoadingDaily(false);
    }
  }, [externalFilters, targetDate, addNotification]);

  useEffect(() => {
    if (forrosGruposList.length > 0) {
      fetchTiemposProduccion();
      fetchDailyOrders();
    }
  }, [forrosGruposList, fetchTiemposProduccion, fetchDailyOrders]);

  // Tablas dinámicas helpers
  const tiemposColumns = useMemo(() => tiemposProduccion.length > 0 ? Object.keys(tiemposProduccion[0]) : [], [tiemposProduccion]);
  const dailyColumns = useMemo(() => dailyOrders.length > 0 ? Object.keys(dailyOrders[0]) : [], [dailyOrders]);

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

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-gray-500 font-medium">Cargando datos de Programación Táctica...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <CalendarClock className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Forros</h2>
      </div>

      <Tabs defaultValue="grupos" className="w-full">
        <div className="relative border-b border-gray-200 mb-8">
          <TabsList className="flex w-full h-auto bg-transparent p-0 overflow-x-auto justify-start scrollbar-hide">
            <TabsTrigger value="grupos" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap">
              <Users className="w-4 h-4" /> Grupos
            </TabsTrigger>
            <TabsTrigger value="restricciones" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap">
              <Lock className="w-4 h-4" /> Restricciones
            </TabsTrigger>
            <TabsTrigger value="tiempos" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap">
              <Timer className="w-4 h-4" /> Tiempos de Producción
            </TabsTrigger>
            <TabsTrigger value="ordenes" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap">
              <Package className="w-4 h-4" /> Órdenes Previsionales
            </TabsTrigger>
            <TabsTrigger value="diaria" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap">
              <CalendarCheck className="w-4 h-4" /> Programación Diaria
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Grupos de Forros</CardTitle>
              <CardDescription>Grupos operativos que contienen "Forros" en su nombre.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Código</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Centro</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Nombre</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {forrosGruposList.map((g) => (
                        <tr key={g.codigo_grupo} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">{g.codigo_grupo}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{g.centro}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium">{g.nombre_grupo}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <Badge variant={g.estado === 'A' ? 'default' : 'secondary'} className={g.estado === 'A' ? 'bg-green-600' : ''}>
                              {g.estado === 'A' ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </td>
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
            <CardHeader>
              <CardTitle>Restricciones de Forros</CardTitle>
              <CardDescription>Configuración técnica específica del grupo de Forros.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Nombre Restricción</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Valor</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Descripción</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
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
              <div className="flex-1">
                <CardTitle>Tiempos de Producción</CardTitle>
                <CardDescription>Detalle dinámico de tiempos de ensamble ({tiemposProduccion.length} registros).</CardDescription>
              </div>
              {!isLoadingTiempos && tiemposProduccion.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(1)} disabled={tiemposPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(p => Math.max(1, p - 1))} disabled={tiemposPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="px-3 text-[11px] font-bold text-gray-700 min-w-[120px] text-center border-x py-1 bg-gray-50 rounded">Página {tiemposPage} de {totalTiemposPages}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(p => Math.min(totalTiemposPages, p + 1))} disabled={tiemposPage === totalTiemposPages}><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(totalTiemposPages)} disabled={tiemposPage === totalTiemposPages}><ChevronsRight className="h-4 w-4" /></Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchTiemposProduccion} disabled={isLoadingTiempos}><RefreshCw className={cn("h-4 w-4 mr-2", isLoadingTiempos && "animate-spin")} /> Recargar</Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        {tiemposColumns.map(col => (
                          <th key={col} className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap border-b bg-gray-50">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {isLoadingTiempos ? (
                        <tr><td colSpan={tiemposColumns.length || 1} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" /></td></tr>
                      ) : paginatedTiemposData.map((t, idx) => (
                        <tr key={`tiempo-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                          {tiemposColumns.map(col => (
                            <td key={`cell-${idx}-${col}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] text-gray-600 font-mono">{t[col] !== null && t[col] !== undefined ? String(t[col]) : '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card>
            <CardHeader>
              <CardTitle>Órdenes Previsionales Filtradas</CardTitle>
              <CardDescription>Visualización de órdenes que cumplen con RespCtrlProd y ALMACEN del grupo de Forros.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProvisionalOrdersTabSection externalFilters={externalFilters} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diaria">
          <Card>
            <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1">
                <CardTitle className="flex items-center gap-2">
                  <CalendarCheck className="w-5 h-5 text-primary" />
                  Programación Diaria: {targetDate}
                </CardTitle>
                <CardDescription>
                  Horizonte: Hoy + {horizonValue} día(s). Órdenes para el día laborable objetivo.
                </CardDescription>
              </div>
              
              {!isLoadingDaily && dailyOrders.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(1)} disabled={dailyPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(p => Math.max(1, p - 1))} disabled={dailyPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="px-3 text-[11px] font-bold text-gray-700 min-w-[120px] text-center border-x py-1 bg-gray-50 rounded">Página {dailyPage} de {totalDailyPages}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(p => Math.min(totalDailyPages, p + 1))} disabled={dailyPage === totalDailyPages}><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(totalDailyPages)} disabled={dailyPage === totalDailyPages}><ChevronsRight className="h-4 w-4" /></Button>
                  </div>
                  <Button variant="outline" size="sm" onClick={fetchDailyOrders} disabled={isLoadingDaily}><RefreshCw className={cn("h-4 w-4 mr-2", isLoadingDaily && "animate-spin")} /> Recargar</Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-white shadow-sm overflow-hidden">
                <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        {dailyColumns.map(col => (
                          <th key={col} className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap border-b bg-gray-50">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {isLoadingDaily ? (
                        <tr><td colSpan={dailyColumns.length || 1} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" /></td></tr>
                      ) : dailyOrders.length > 0 ? (
                        paginatedDailyData.map((order, idx) => (
                          <tr key={`daily-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                            {dailyColumns.map(col => (
                              <td key={`cell-${idx}-${col}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] text-gray-600 font-mono">
                                {order[col] !== null && order[col] !== undefined ? String(order[col]) : '—'}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={dailyColumns.length || 1} className="py-20 text-center text-gray-400 italic bg-gray-50/50">
                            No se encontraron órdenes para la fecha {targetDate} con las restricciones actuales.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {!isLoadingDaily && dailyOrders.length > 0 && (
                <div className="mt-4 flex justify-end text-[10px] text-gray-400 uppercase font-bold tracking-widest">
                  Total {dailyOrders.length} registros para {targetDate}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};