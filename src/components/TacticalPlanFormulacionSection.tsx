'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FlaskConical, Users, Lock, Package, Loader2, Clock, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const TacticalPlanFormulacionSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanFormulacion');
  const { addNotification } = useAppContext();

  // Estados de control de montaje para evitar errores de hidratación
  const [mounted, setMounted] = useState(false);
  const [viewDate, setViewDate] = useState<Date | null>(null);

  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');

  // Refs para sincronización de scroll
  const scrollProv = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollTiempos = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

  const fetchGruposRelevantes = async () => {
    try {
      const res = await grupoService.getAll();
      // Filtrar por "Corte y Laminado" como solicitó el usuario para heredar sus restricciones
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo && g.nombre_grupo.toLowerCase().includes('corte y laminado')
      );
      setGrupos(filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
      return [];
    }
  };

  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      const res = await restriccionService.getAll();
      const filtered = (res.data || []).filter(r => gruposIds.includes(r.codigo_grupo));
      setRestricciones(filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando restricciones:', error);
      return [];
    }
  };

  const loadData = async (filteredGroups: Grupo[]) => {
    try {
      // 1. Cargar Órdenes Provisionales
      const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      setOrders(resProv.data || []);

      // 2. Cargar Tiempos de Ensamblado específicos para estos grupos
      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
        const dataArray = Array.isArray(res.data) ? res.data : (res.data?.data || []);
        if (dataArray.length > 0) allTiempos.push(...dataArray);
      }
      setTiemposEnsamblado(allTiempos);
    } catch (error) {
      console.error('Error cargando datos operativos:', error);
    }
  };

  useEffect(() => {
    setMounted(true);
    setViewDate(new Date());

    const init = async () => {
      setIsLoading(true);
      const groups = await fetchGruposRelevantes();
      const ids = groups.map(g => g.codigo_grupo);
      await fetchRestricciones(ids);
      await loadData(groups);
      setIsLoading(false);
    };
    init();
  }, []);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes]);

  const calendarDays = useMemo(() => {
    if (!viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  const filterData = (data: any[]) => {
    if (!data || data.length === 0) return [];
    
    // Filtro estricto: Centro 1000 y Responsable 005
    return data.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== '1000') return false;

      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      if (itemResp !== '005') return false;

      if (selectedDate !== 'all') {
        const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
        if (itemDate !== selectedDate) return false;
      }
      return true;
    });
  };

  const ordenesFiltradas = useMemo(() => filterData(ordenes), [ordenes, selectedDate]);
  const tiemposFiltrados = useMemo(() => filterData(tiemposEnsamblado), [tiemposEnsamblado]);

  // Sincronización de scroll
  const setupScroll = (group: any) => {
    if (!group.top.current || !group.bottom.current) return;
    const syncB = () => { if (group.bottom.current) group.bottom.current.scrollLeft = group.top.current.scrollLeft; };
    const syncT = () => { if (group.top.current) group.top.current.scrollLeft = group.bottom.current.scrollLeft; };
    group.top.current.addEventListener('scroll', syncB);
    group.bottom.current.addEventListener('scroll', syncT);
    return () => {
      group.top.current?.removeEventListener('scroll', syncB);
      group.bottom.current?.removeEventListener('scroll', syncT);
    };
  };

  useEffect(() => {
    if (activeTab === 'ordenes') {
      setupScroll(scrollProv);
      if (scrollProv.table.current) scrollProv.width[1](scrollProv.table.current.offsetWidth);
    } else if (activeTab === 'tiempos') {
      setupScroll(scrollTiempos);
      if (scrollTiempos.table.current) scrollTiempos.width[1](scrollTiempos.table.current.offsetWidth);
    }
  }, [activeTab, ordenesFiltradas, tiemposFiltrados]);

  // Renderizado consistente para evitar errores de hidratación
  if (!mounted || !viewDate) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
        <p className="text-gray-500 font-medium">Iniciando entorno de Formulación...</p>
      </div>
    );
  }

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      <p className="text-gray-500 font-medium">Consultando datos para Planta 1000 - Responsable 005...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-teal-50 rounded-xl"><FlaskConical className="w-6 h-6 text-teal-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Planificación Táctica Formulación</h2>
            <p className="text-xs text-gray-500 font-medium">Criterio: Planta 1000 | Resp. 005 | Restricciones: Corte y Laminado</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Resumen', i: LayoutDashboard }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Restricciones', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100 mb-6">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-teal-50 rounded-xl"><CalendarIcon className="w-4 h-4 text-teal-600" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Fecha de Planificación</p>
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Vista Consolidada' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl border-gray-200 hover:bg-white hover:border-teal-500/50 gap-2 font-bold text-[10px] uppercase transition-all shadow-sm">
                  <Filter className="w-3 h-3" /> Filtrar Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-3 font-sans">
                  <div className="flex items-center justify-between mb-3 text-left">
                    <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                    <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white hover:shadow-sm"><ChevronLeft className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white hover:shadow-sm"><ChevronRight className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-y-1 text-center mb-2">
                    {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((day, idx) => <div key={`cal-head-${idx}`} className="text-[8px] font-bold text-gray-300 uppercase py-1">{day}</div>)}
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={`cal-pad-${idx}`} className="p-1" />;
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isSelected = selectedDate === dateStr;
                      return (
                        <button key={dateStr} onClick={() => setSelectedDate(isSelected ? 'all' : dateStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-teal-600 text-white shadow-md" : "hover:bg-gray-100")}>
                          <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dateStr) && !isSelected ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                          {datesWithOrders.has(dateStr) && !isSelected && <div className="absolute bottom-1 w-1 h-1 bg-teal-400/60 rounded-full" />}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-teal-600 h-7 mt-1 rounded-lg hover:bg-teal-50" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 rounded-2xl border-2 border-dashed border-teal-100 bg-teal-50/10">
              <h4 className="text-xs font-bold uppercase text-teal-800 mb-4">Métricas de Carga</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Órdenes Provisionales</p>
                  <p className="text-2xl font-black text-teal-700">{ordenesFiltradas.length}</p>
                </div>
                <div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase">Total Unidades</p>
                  <p className="text-2xl font-black text-teal-700">
                    {ordenesFiltradas.reduce((sum, o) => sum + (o.CANTIDAD || 0), 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>
            
            <Card className="p-6 rounded-2xl border-2 border-dashed border-blue-100 bg-blue-50/10">
              <h4 className="text-xs font-bold uppercase text-blue-800 mb-4">Sincronización Técnica</h4>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-medium">Grupo de Capacidad:</span>
                  <Badge className="bg-blue-600">Corte y Laminado</Badge>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-500 font-medium">Catálogo de Tiempos:</span>
                  <span className="font-bold text-blue-700">{tiemposFiltrados.length} materiales</span>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
                <div className="absolute top-0 left-0 w-1 h-full bg-teal-500/20 group-hover:bg-teal-500 transition-colors" />
                <Badge className="bg-teal-50 text-teal-700 mb-2 font-bold text-[9px] uppercase">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-sm">{g.nombre_grupo}</h4>
                <p className="text-[9px] font-mono text-gray-400 mt-2">Sincronizado para Formulación</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro (Corte y Laminado)</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Valor</th>
                  <th className="px-6 py-5 text-left">Descripción Operativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px]">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-teal-50/10">
                    <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-200">
                      <Badge variant="outline" className="font-mono text-teal-700 border-teal-200 bg-teal-50/50">{r.valor_restriccion}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div ref={scrollProv.top} className="overflow-x-auto h-3 bg-gray-50 border-b border-gray-100">
              <div style={{ width: scrollProv.width[0], height: '1px' }} />
            </div>
            <div ref={scrollProv.bottom} className="overflow-x-auto max-h-[500px]">
              <table ref={scrollProv.table} className="w-full border-collapse text-center font-sans">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Orden</th>
                    <th className="px-4 py-4 border-r border-gray-100">Material</th>
                    <th className="px-4 py-4 border-r border-gray-100">Descripción</th>
                    <th className="px-4 py-4 border-r border-gray-100">Cantidad</th>
                    <th className="px-4 py-4">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {ordenesFiltradas.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-gray-400 italic">No hay órdenes para Planta 1000 - Resp. 005</td></tr>
                  ) : (
                    ordenesFiltradas.map((o, i) => (
                      <tr key={i} className="hover:bg-teal-50/50 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-900 border-r border-gray-100 uppercase">{o.ORDENPREVISIONAL}</td>
                        <td className="px-4 py-3 font-mono font-bold text-teal-700 border-r border-gray-100 tracking-tighter">{String(o.MATERIAL).split(' ')[0]}</td>
                        <td className="px-4 py-3 text-left border-r border-gray-100 text-gray-500 uppercase truncate max-w-[300px]">{String(o.NOMBRE || o.MATERIAL).replace(/^\d+\s*/, '')}</td>
                        <td className="px-4 py-3 font-black text-slate-800 border-r border-gray-100">{o.CANTIDAD}</td>
                        <td className="px-4 py-3 text-gray-400 font-bold uppercase">{o.Almacen || o.ALMACEN}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div ref={scrollTiempos.top} className="overflow-x-auto h-3 bg-gray-50 border-b border-gray-100">
              <div style={{ width: scrollTiempos.width[0], height: '1px' }} />
            </div>
            <div ref={scrollTiempos.bottom} className="overflow-x-auto max-h-[500px]">
              <table ref={scrollTiempos.table} className="w-full border-collapse text-center font-sans">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">CodMaterial</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                    <th className="px-4 py-4 border-r border-gray-100">Línea Técnica</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-teal-600">Tiempo (Min)</th>
                    <th className="px-4 py-4">Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {tiemposFiltrados.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-gray-400 italic">No hay catálogos técnicos para Planta 1000 - Resp. 005</td></tr>
                  ) : (
                    tiemposFiltrados.map((t, i) => (
                      <tr key={i} className="hover:bg-teal-50/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-teal-700 border-r border-gray-100 tracking-tighter">{t.CodMaterial}</td>
                        <td className="px-4 py-3 text-left border-r border-gray-100 text-gray-500 uppercase truncate max-w-[300px]">{t.Descripcion || t.Material}</td>
                        <td className="px-4 py-3 font-bold text-gray-400 border-r border-gray-100 uppercase">{t.Linea}</td>
                        <td className="px-4 py-3 font-mono font-bold text-teal-600 border-r border-gray-100">{(t.Tiempo_Min || 0).toFixed(4)}</td>
                        <td className="px-4 py-3 text-gray-400 font-bold uppercase">{t.StockSeguridad}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
