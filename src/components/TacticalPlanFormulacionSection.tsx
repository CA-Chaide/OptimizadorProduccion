'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  FlaskConical, 
  Users, 
  Lock, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  AlertTriangle, 
  Activity,
  Database,
  PlayCircle,
  Info
} from 'lucide-react';
import { Card } from '@/components/ui/card';
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
import { Progress } from "@/components/ui/progress";

// --- CONSTANTES OPERATIVAS ---
const MAX_DAILY_BLOCKS = 36; 
const BLOCK_LENGTH_METERS = 20;

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

export const TacticalPlanFormulacionSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanFormulacion');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState<Date | null>(null);

  useEffect(() => { 
    setMounted(true); 
    setViewDate(new Date());
  }, []);

  const fetchGruposRelevantes = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return (name.includes('espuma') || name.includes('corte y laminado')) && !name.includes('formulación');
      });
      setGrupos(filtered);
      return filtered;
    } catch (error) {
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
      return [];
    }
  };

  const fetchOrdenes = async () => {
    try {
      const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      const data = resProv.data?.data || resProv.data || [];
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    }
  };

  const fetchTiemposEnsamblado = async (filteredGroups: Grupo[]) => {
    try {
      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) allTiempos.push(...data);
      }
      setTiemposEnsamblado(allTiempos);
    } catch (error) {
      console.error('Error cargando tiempos:', error);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const initData = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGruposRelevantes();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await Promise.all([
        fetchRestricciones(groupsIds),
        fetchOrdenes(),
        fetchTiemposEnsamblado(filteredGroups)
      ]);
      setIsLoading(false);
    };
    initData();
  }, [mounted]);

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes, mounted]);

  const calendarDays = useMemo(() => {
    if (!mounted || !viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions: any = { dens: '—', ancho: '—', largo: '—', esp: '—', apertura: '—', tipo: '—' };
    
    const techMatch = catStr.match(/D(\d+)([a-zA-Z]+)/i);
    if (techMatch) {
      dimensions.dens = techMatch[1]; 
      dimensions.tipo = techMatch[2].toUpperCase(); 
    } else {
      const densMatch = desc.match(/D-?(\d+)/i);
      if (densMatch) dimensions.dens = densMatch[1];
      const tipoMatch = desc.match(/D-?\d+([a-zA-Z]+)/i);
      if (tipoMatch) dimensions.tipo = tipoMatch[1].toUpperCase();
    }

    const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    if (dimMatch) {
      dimensions.ancho = dimMatch[1];
      dimensions.largo = dimMatch[2];
      if (dimMatch[3]) dimensions.esp = dimMatch[3];
    }
    const apertureRegex = /194\.5|206|219/;
    const apertureMatch = catStr.match(apertureRegex) || desc.match(apertureRegex);
    if (apertureMatch) dimensions.apertura = apertureMatch[0];
    
    return { code, desc, categoria: catStr, ...dimensions };
  };

  const filterData = (data: any[], centro: string, applyDateFilter: boolean = true) => {
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    if (relevantGroups.length === 0) return [];
    return data.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;
      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      if (centro === '1000' && itemAlmValue !== '1006') return false;
      if (centro === '2000' && itemAlmValue !== '2006') return false;
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = relevantGroups.some(g => {
        const respCodes = restricciones.filter(r => r.codigo_grupo === g.codigo_grupo && r.nombre_restriccion === 'RESPCTRLPROD')
          .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim())).filter(v => v !== '');
        return respCodes.length === 0 || respCodes.includes(itemResp);
      });
      if (!matchResp) return false;
      if (applyDateFilter) {
        const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
        if (selectedDate !== 'all' && itemDate !== selectedDate) return false;
      }
      return true;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones, selectedDate]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones, selectedDate]);
  
  const tiemposC1000 = useMemo(() => tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim() === '1000'), [tiemposEnsamblado]);
  const tiemposC2000 = useMemo(() => tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim() === '2000'), [tiemposEnsamblado]);

  const calculateUnifiedSummary = (data1000: any[], data2000: any[]) => {
    const groupsMap = new Map<string, { 
      fecha: string; dens: string; tipo: string; apertura: string;
      bloques1000: number; bloques2000: number; totalBloques: number;
      bloquesStock: number; bloquesCurado: number; bloquesProceso: number;
      planReposicion: number;
    }>();

    const process = (data: any[], centerId: '1000' | '2000') => {
      data.forEach(o => {
        const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
        const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        const info = extractMaterialInfo(o);
        const key = `${fecha}|${info.dens}|${info.tipo}|${info.apertura}`;
        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
        const ancho = parseFloat(info.ancho) || 0;
        const esp = parseFloat(info.esp) || 0;
        const densValue = parseFloat(String(info.dens)) || 0;
        const usefulHeight = (densValue < 30) ? 103 : 85;
        const itemBloques = (qty * esp * ancho) / (usefulHeight * BLOCK_LENGTH_METERS * 100);

        if (!groupsMap.has(key)) {
          groupsMap.set(key, { fecha, dens: info.dens, tipo: info.tipo, apertura: info.apertura, bloques1000: 0, bloques2000: 0, totalBloques: 0, bloquesStock: 0, bloquesCurado: 0, bloquesProceso: 0, planReposicion: 0 });
        }
        const entry = groupsMap.get(key)!;
        if (centerId === '1000') entry.bloques1000 += itemBloques;
        else entry.bloques2000 += itemBloques;
        entry.totalBloques = entry.bloques1000 + entry.bloques2000;
        entry.planReposicion = Math.ceil(entry.totalBloques);
      });
    };

    process(data1000, '1000');
    process(data2000, '2000');

    return Array.from(groupsMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.dens.localeCompare(b.dens));
  };

  const unifiedSummaryData = useMemo(() => calculateUnifiedSummary(provC1000, provC2000), [provC1000, provC2000]);

  const dailyLoadSummary = useMemo(() => {
    const map = new Map<string, number>();
    unifiedSummaryData.forEach(row => map.set(row.fecha, (map.get(row.fecha) || 0) + row.planReposicion));
    return map;
  }, [unifiedSummaryData]);

  const summaryTotals = useMemo(() => {
    const base = { bloques1000: 0, bloques2000: 0, totalBloques: 0, planReposicion: 0, byAperture: {} as Record<string, number> };
    return unifiedSummaryData.reduce((acc, row) => {
      const ap = row.apertura || 'N/A';
      acc.byAperture[ap] = (acc.byAperture[ap] || 0) + row.planReposicion;
      return { 
        ...acc,
        bloques1000: acc.bloques1000 + row.bloques1000,
        bloques2000: acc.bloques2000 + row.bloques2000,
        totalBloques: acc.totalBloques + row.totalBloques,
        planReposicion: acc.planReposicion + row.planReposicion
      };
    }, base);
  }, [unifiedSummaryData]);

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Iniciando Entorno de Formulación...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-xl"><FlaskConical className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Formulación</h2>
            <p className="text-xs text-gray-500 font-medium">Control Maestro de Bloques (Límite: {MAX_DAILY_BLOCKS} Bloques/Día)</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Capacidad y Carga', i: LayoutDashboard }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Parámetros', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Catálogo Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-xl"><CalendarIcon className="w-4 h-4 text-primary" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider text-left">Horizonte de Carga</p>
                <h3 className="text-xs font-black text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Plan Maestro Consolidado' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
                  <Filter className="w-3 h-3" /> Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-3 font-sans">
                  {viewDate && (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold text-gray-800 capitalize text-left">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                        <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6"><ChevronLeft className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6"><ChevronRight className="w-3 h-3" /></Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-y-1 text-center">
                        {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((d, i) => <div key={i} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                        {calendarDays.map((day, idx) => {
                          if (!day) return <div key={idx} />;
                          const dStr = format(day, 'yyyy-MM-dd');
                          const sel = selectedDate === dStr;
                          return (
                            <button key={dStr} onClick={() => setSelectedDate(sel ? 'all' : dStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                              <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !sel ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                              {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-primary h-7 mt-1 rounded-lg hover:bg-primary/5" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {selectedDate !== 'all' && (
            <Card className="p-4 border-2 border-primary/10 rounded-2xl shadow-sm bg-primary/5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase text-gray-600">Estado de Carga Diaria</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-primary">{(dailyLoadSummary.get(selectedDate) || 0).toFixed(0)}</span>
                  <span className="text-xs font-bold text-gray-400"> / {MAX_DAILY_BLOCKS} Bloques</span>
                </div>
              </div>
              <Progress value={((dailyLoadSummary.get(selectedDate) || 0) / MAX_DAILY_BLOCKS) * 100} className="h-2 bg-primary/20" />
              {(dailyLoadSummary.get(selectedDate) || 0) > MAX_DAILY_BLOCKS && (
                <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                  <p className="text-[9px] font-black text-red-700 uppercase">Sobrecarga detectada. Redistribuya bloques.</p>
                </div>
              )}
            </Card>
          )}

          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase flex items-center gap-2 px-1 tracking-wider text-left text-primary">
              <div className="w-2 h-2 rounded-full bg-primary" /> Resumen Maestro de Producción Unificado
            </h3>
            <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[500px]">
                <table className="w-full border-collapse text-center font-sans">
                  <thead className="bg-[#bde0fe] sticky top-0 z-10 text-[9px] font-black uppercase text-slate-800 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-4 border-r border-gray-100">Fecha</th>
                      <th className="px-4 py-4 border-r border-gray-100">Descripción</th>
                      <th className="px-4 py-4 border-r border-gray-100">Densidad</th>
                      <th className="px-4 py-4 border-r border-gray-100 text-primary">Tipo</th>
                      <th className="px-4 py-4 border-r border-gray-100 bg-blue-50/50 text-blue-800">Apertura</th>
                      <th className="px-4 py-4 border-r border-gray-100 text-green-700 bg-green-50/30">Nro. Bloques (1000)</th>
                      <th className="px-4 py-4 border-r border-gray-100 text-indigo-700 bg-indigo-50/30">Nro. Bloques (2000)</th>
                      <th className="px-4 py-4 border-r border-gray-100 text-orange-800 font-black bg-orange-50/30">Total Bloque Formulado (U)</th>
                      <th className="px-4 py-4 border-r border-gray-100 bg-slate-100 text-slate-600">BLOQUE STOCK</th>
                      <th className="px-4 py-4 border-r border-gray-100 bg-amber-50 text-amber-600">BLOQUE CURADO</th>
                      <th className="px-4 py-4 border-r border-gray-100 bg-blue-50 text-blue-900">BLOQUE PROCESO</th>
                      <th className="px-4 py-4 bg-emerald-50 text-emerald-800 font-black">PLAN REPOSICIÓN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[10px]">
                    {unifiedSummaryData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-400 border-r border-gray-50">{row.fecha}</td>
                        <td className="px-4 py-3 font-black text-gray-400 border-r border-gray-50 uppercase text-[8px]">BLOQUE FORMULADO</td>
                        <td className="px-4 py-3 font-bold text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-3 font-black text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                        <td className="px-4 py-3 font-bold text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.apertura}</td>
                        <td className="px-4 py-3 font-mono font-bold text-green-700 border-r border-gray-50 bg-green-50/10">{row.bloques1000.toFixed(1)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-indigo-700 border-r border-gray-50 bg-indigo-50/10">{row.bloques2000.toFixed(1)}</td>
                        <td className="px-4 py-3 font-mono font-black text-orange-800 border-r border-gray-50 bg-orange-50/10">{row.totalBloques.toFixed(1)}</td>
                        <td className="px-4 py-3 font-mono text-slate-400 border-r border-gray-50 bg-slate-50/20">0</td>
                        <td className="px-4 py-3 font-mono text-amber-400 border-r border-gray-50 bg-amber-50/20">0</td>
                        <td className="px-4 py-3 font-mono text-blue-400 border-r border-gray-50 bg-blue-50/20">0</td>
                        <td className="px-4 py-3 font-mono font-black text-emerald-600 bg-emerald-50/30">{row.planReposicion}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-800 text-white font-bold text-[10px] sticky bottom-0">
                    {Object.entries(summaryTotals.byAperture).sort().map(([ap, total]) => (
                      <tr key={ap} className="bg-indigo-900/40">
                        <td colSpan={11} className="px-4 py-2 text-right uppercase text-indigo-200 tracking-widest text-[9px]">Subtotal Apertura {ap}:</td>
                        <td className="px-4 py-2 font-mono text-indigo-200">{total}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-900">
                      <td colSpan={5} className="px-4 py-3 text-right uppercase tracking-widest">Total Maestro Consolidado:</td>
                      <td className="px-4 py-3 font-mono text-green-300">{summaryTotals.bloques1000.toFixed(1)}</td>
                      <td className="px-4 py-3 font-mono text-indigo-300">{summaryTotals.bloques2000.toFixed(1)}</td>
                      <td className="px-4 py-3 font-mono text-orange-300">{summaryTotals.totalBloques.toFixed(1)}</td>
                      <td colSpan={3} className="border-r border-gray-700"></td>
                      <td className="px-4 py-3 font-mono text-emerald-300">{summaryTotals.planReposicion}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                <Badge className="bg-gray-100 text-gray-600 mb-2 font-bold text-[9px] uppercase">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-sm">{g.nombre_grupo}</h4>
                <p className="text-[9px] font-mono text-gray-400 mt-2">ID: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-[#bde0fe] text-[10px] font-black uppercase text-slate-800 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-gray-100">Parámetro Técnico</th>
                  <th className="px-6 py-5 border-r border-gray-100">Valor</th>
                  <th className="px-6 py-5 text-left">Descripción Operativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px] font-bold">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 text-gray-500 border-r border-gray-100 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-gray-100">
                      <Badge variant="outline" className="font-mono text-indigo-700 border-indigo-200 bg-indigo-50/50">{r.valor_restriccion}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-10">
          {[ 
            { t: 'Planta 1000 - Quito', d: provC1000, id: '1000' }, 
            { t: 'Planta 2000 - Guayaquil', d: provC2000, id: '2000' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1 text-left", center.id === '1000' ? 'text-green-700' : 'text-indigo-700')}>
                <div className={cn("w-2 h-2 rounded-full", center.id === '1000' ? 'bg-green-600' : 'bg-indigo-600')} /> {center.t} ({center.d.length} órdenes)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full border-collapse text-center font-sans">
                    <thead className="bg-[#bde0fe] sticky top-0 z-10 text-[9px] font-black uppercase text-slate-800 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-gray-100">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Máquina</th>
                        <th className="px-3 py-4">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[10px]">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2 text-gray-500 border-r border-gray-100">{o.ORDENPREVISIONAL || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || '—'}</td>
                            <td className="px-3 py-2 font-mono text-primary border-r border-gray-100">{info.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-100 truncate max-w-[150px] uppercase font-bold text-gray-600">{info.desc}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-black text-gray-400">{info.dens}</td>
                            <td className="px-2 py-2 border-r border-gray-100 text-gray-400 font-mono">{info.ancho}</td>
                            <td className="px-2 py-2 border-r border-gray-100 text-gray-400 font-mono">{info.largo}</td>
                            <td className="px-2 py-2 border-r border-gray-100 text-gray-400 font-mono">{info.esp}</td>
                            <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-100">{Number(o.CANTIDAD || 0).toLocaleString()}</td>
                            <td className="px-3 py-2 font-black text-gray-300 border-r border-gray-100 uppercase">{o.MAQUINA || '—'}</td>
                            <td className="px-3 py-2 font-bold text-gray-200">{o.Almacen || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="tiempos">
          <div className="grid grid-cols-1 gap-10">
            {[ { t: 'Quito 1000', d: tiemposC1000 }, { t: 'Guayaquil 2000', d: tiemposC2000 } ].map((center, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className="text-[11px] font-black uppercase text-gray-400 text-left tracking-widest px-1">Catálogo de Tiempos - {center.t}</h3>
                <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full border-collapse text-center font-sans">
                      <thead className="bg-[#bde0fe] sticky top-0 text-[10px] font-black uppercase text-slate-800 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-4 border-r border-gray-100">Material</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                          <th className="px-4 py-4 border-r border-gray-100">Línea</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-teal-700">Estándar (Min)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                        {center.d.length === 0 ? (
                          <tr><td colSpan={4} className="py-12 text-center text-gray-300 font-bold uppercase tracking-widest opacity-30">No hay registros</td></tr>
                        ) : (
                          center.d.map((t, i) => {
                            const info = extractMaterialInfo(t);
                            return (
                              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 font-mono text-primary border-r border-gray-50">{info.code}</td>
                                <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[280px]">{info.desc}</td>
                                <td className="px-4 py-3 border-r border-gray-100 font-bold text-gray-400 uppercase">{t.Linea || '—'}</td>
                                <td className="px-4 py-3 font-mono text-teal-600 bg-teal-50/5">{(t.Tiempo || 0).toFixed(4)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};