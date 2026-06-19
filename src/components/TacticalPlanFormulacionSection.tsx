'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  FlaskConical, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Activity,
  Database,
  History,
  Layers,
  MapPin,
  RefreshCw,
  Info,
  TrendingUp,
  Box
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from '@/components/ui/badge';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

// --- CONSTANTES Y HELPERS TÉCNICOS ---
const BLOCK_LENGTH_METERS = 20;

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const formatNum = (val: any, decimals: number = 0): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

const getProp = (obj: any, keys: string[]): string => {
  if (!obj) return '';
  const rowKeys = Object.keys(obj);
  for (const k of keys) {
    const found = rowKeys.find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
    if (found) return String(obj[found]).trim();
  }
  return '';
};

export const TacticalPlanFormulacionSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanFormulacion');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [curadoRows, setCuradoRows] = useState<any[]>([]);
  const [inventarioSAP, setInventarioSAP] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Estados de Fecha - Hidratación Segura
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState<Date | null>(null);

  useEffect(() => { 
    setMounted(true); 
    const now = new Date();
    setViewDate(now);
    setSelectedDate(format(now, 'yyyy-MM-dd'));
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('espuma') || name.includes('corte y laminado') || name.includes('formulación');
      });
      setGrupos(filteredGroups);
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);

      const [restrsRes, provsRes, curadoRes, invRes, timesRes] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getTiemposCuradoBloqueFormulado(1, 10000),
        serviciosService.getInventarioAñoActual(),
        serviciosService.getTiemposEnsamblado(1, 15000)
      ]);

      setRestricciones((restrsRes.data || []).filter((r: any) => groupsIds.includes(r.codigo_grupo)));
      setOrders(provsRes.data?.data || provsRes.data || []);
      setCuradoRows(Array.isArray(curadoRes.data) ? curadoRes.data : []);
      setInventarioSAP(Array.isArray(invRes.data) ? invRes.data : []);
      setTiemposEnsamblado(timesRes.data?.data || timesRes.data || []);
      
      inspector.captureVariable('inventarioSAP_Sync', invRes.data);

    } catch (error) {
      console.error('Error init TacticalPlanFormulacion:', error);
      addNotification('error', 'Error al sincronizar datos de formulación');
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector]);

  useEffect(() => {
    if (mounted) fetchData();
  }, [mounted, fetchData]);

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') dates.add(d.includes('T') ? d.split('T')[0] : d);
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
    
    const techPattern = catStr.match(/D(\d+)([a-zA-Z]*)/i) || desc.match(/D-?(\d+)([a-zA-Z]*)/i);
    if (techPattern) {
      dimensions.dens = techPattern[1]; 
      dimensions.tipo = (techPattern[2] || '').toUpperCase(); 
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

  const provFiltradas = useMemo(() => {
    const centro = '1000';
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    if (relevantGroups.length === 0) return [];
    
    return ordenes.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || '').trim();
      if (itemCentro !== centro) return false;
      
      const itemAlmValue = String(o.ALMACEN || o.Almacen || '').trim();
      if (itemAlmValue !== '1006') return false; 

      const itemResp = String(o.RESPCONTROLPROD || o.RESP_CONTROL_PROD || '').trim();
      const matchResp = relevantGroups.some(g => {
        const respCodes = restricciones.filter(r => r.codigo_grupo === g.codigo_grupo && r.nombre_restriccion === 'RESPCTRLPROD')
          .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim())).filter(v => v !== '');
        return respCodes.length === 0 || respCodes.includes(itemResp);
      });
      if (!matchResp) return false;

      const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDate === 'all' || itemDate === selectedDate;
    });
  }, [ordenes, grupos, restricciones, selectedDate]);

  const unifiedSummaryData = useMemo(() => {
    const groupsMap = new Map<string, { 
      fecha: string; maquina: string; dens: string; tipo: string; apertura: string;
      totalBloques: number; planReposicion: number;
    }>();

    provFiltradas.forEach(o => {
      const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
      const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const maquina = String(o.MAQUINA || o.RECURSO || 'SIN MÁQUINA').trim().toUpperCase();
      const info = extractMaterialInfo(o);
      const key = `${fecha}|${maquina}|${info.dens}|${info.tipo}|${info.apertura}`;
      
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const ancho = parseFloat(info.ancho) || 0;
      const esp = parseFloat(info.esp) || 0;
      const densValue = parseFloat(String(info.dens)) || 0;
      const usefulHeight = (densValue < 30) ? 103 : 85;
      const itemBloques = (qty * esp * ancho) / (usefulHeight * BLOCK_LENGTH_METERS * 100);

      if (!groupsMap.has(key)) {
        groupsMap.set(key, { fecha, maquina, dens: info.dens, tipo: info.tipo, apertura: info.apertura, totalBloques: 0, planReposicion: 0 });
      }
      const entry = groupsMap.get(key)!;
      entry.totalBloques += itemBloques;
      entry.planReposicion = Math.ceil(entry.totalBloques);
    });

    return Array.from(groupsMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.maquina.localeCompare(b.maquina));
  }, [provFiltradas]);

  const curadoGroupsSummary = useMemo(() => {
    const fBloqRows: any[] = [];
    const fBloqMRows: any[] = [];
    
    curadoRows.forEach(row => {
      const maquinaVal = getProp(row, ['Maquina', 'MAQUINA']).toUpperCase();
      const estadoTrasVal = getProp(row, ['estadoTras', 'Estado_Tras']).toUpperCase();
      const info = extractMaterialInfo({ MATERIAL: row.NomMaterial || row.CodMaterial || '' });
      
      let densityVal = getProp(row, ['Densidad', 'DENSIDAD', 'Dens']);
      if (!densityVal || densityVal === '—' || densityVal === '0') densityVal = info.dens;

      const enriched = { ...row, apertura: info.apertura, densityFixed: densityVal };
      const isStirling = maquinaVal.includes('F_BLOQ') && !maquinaVal.includes('F_BLOQ_M') && estadoTrasVal.includes('CALLE');
      const isManual = maquinaVal.includes('F_BLOQ_M') && estadoTrasVal.includes('BCALL');

      if (isStirling) fBloqRows.push(enriched);
      else if (isManual) fBloqMRows.push(enriched);
    });

    const getStats = (rows: any[]) => {
      const count = rows.length;
      const weight = rows.reduce((s, r) => s + safeNum(r.peso || r.PESO), 0);
      const apertureMap = new Map<string, number>();
      rows.forEach(r => {
        const ap = r.apertura || '—';
        apertureMap.set(ap, (apertureMap.get(ap) || 0) + 1);
      });
      return { count, weight, apertureMap };
    };

    return [
      { id: 'f_bloq', label: 'Sistema Stirling (F_BLOQ - CALLE)', rows: fBloqRows, stats: getStats(fBloqRows), color: 'border-l-indigo-600', badge: 'bg-indigo-600' },
      { id: 'f_bloq_m', label: 'Proceso Manual (F_BLOQ_M - BCALL)', rows: fBloqMRows, stats: getStats(fBloqMRows), color: 'border-l-slate-800', badge: 'bg-slate-800' }
    ];
  }, [curadoRows]);

  const inventarioFiltrado = useMemo(() => {
    return inventarioSAP.filter(row => {
      const resp = String(row.CODRESPPROD || row.CodRespProd || '').trim();
      return resp === '005';
    });
  }, [inventarioSAP]);

  const resumenKPIs = useMemo(() => {
    const totalBloquesPlan = unifiedSummaryData.reduce((s, r) => s + r.planReposicion, 0);
    const totalKgPlan = unifiedSummaryData.reduce((s, r) => s + (r.totalBloques * 450), 0); // Estimación 450kg/bloque
    return { bloques: totalBloquesPlan, kg: totalKgPlan };
  }, [unifiedSummaryData]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      {/* Cabecera Técnica y Botón de Actualización */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><FlaskConical className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Formulación</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Plan de Reposición y Auditoría de Stock SAP</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={fetchData} 
            disabled={isLoading} 
            className="h-10 px-6 rounded-xl bg-primary hover:bg-primary/90 text-white gap-2 font-black text-[10px] uppercase shadow-lg transition-all active:scale-95"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            ACTUALIZAR DATOS
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[ 
            { v: 'resumen', l: 'Capacidad y Carga', i: LayoutDashboard }, 
            { v: 'curado', l: 'Stock Curado', i: History },
            { v: 'inventario', l: 'Inventarios SAP', i: Database },
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Catálogo Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-primary rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-primary/5 rounded-xl"><CalendarIcon className="w-5 h-5 text-primary" /></div>
              <h3 className="text-xs font-black text-gray-700 uppercase">
                {selectedDate === 'all' ? 'PLAN MAESTRO CONSOLIDADO' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
              </h3>
            </div>
            
            <div className="flex items-center gap-6 pr-2">
              <div className="text-right">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Total Reposición</p>
                <p className="text-lg font-black text-primary font-mono tracking-tighter">{resumenKPIs.bloques} Bloques</p>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 px-4 rounded-xl border-gray-200 hover:bg-white hover:border-primary/50 gap-2 font-black text-[10px] uppercase transition-all shadow-sm">
                    <Filter className="w-3.5 h-3.5" /> FILTRAR FECHA
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-3" align="end">
                  <div className="bg-white p-4 font-sans text-left">
                    {viewDate && (
                      <>
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-[10px] font-black text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                          <div className="flex gap-1 bg-gray-50 rounded-xl p-1">
                            <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate!, 1))} className="h-7 w-7 hover:bg-white"><ChevronLeft className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate!, 1))} className="h-7 w-7 hover:bg-white"><ChevronRight className="w-4 h-4" /></Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-7 gap-y-1.5 text-center mb-3">
                          {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((d, i) => <div key={i} className="text-[9px] font-black text-gray-300 uppercase py-1">{d}</div>)}
                          {calendarDays.map((day, idx) => {
                            if (!day) return <div key={idx} />;
                            const dStr = format(day, 'yyyy-MM-dd');
                            const sel = selectedDate === dStr;
                            return (
                              <button key={dStr} onClick={() => setSelectedDate(sel ? 'all' : dStr)} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md shadow-primary/30" : "hover:bg-gray-100")}>
                                <span className={cn("text-[11px] font-black", !datesWithOrders.has(dStr) && !sel ? "text-slate-200" : "text-slate-700")}>{format(day, 'd')}</span>
                                {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1.5 w-1 h-1 bg-primary/40 rounded-full" />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-primary h-9 mt-1 rounded-xl hover:bg-primary/5 tracking-widest" onClick={() => setSelectedDate('all')}>Ver Todo el Plan</Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <Card className="border border-gray-100 rounded-3xl shadow-lg overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full border-collapse text-center font-sans">
                <thead className="bg-gray-50 sticky top-0 z-10 text-[10px] font-black uppercase text-gray-400 border-b border-gray-100">
                  <tr>
                    <th className="px-6 py-4 border-r border-gray-100">Fecha Plan</th>
                    <th className="px-6 py-4 border-r border-gray-100 text-primary">MÁQUINA SAP</th>
                    <th className="px-6 py-4 border-r border-gray-100">Densidad</th>
                    <th className="px-6 py-4 border-r border-gray-100">Tipo</th>
                    <th className="px-6 py-4 border-r border-gray-100">Apertura</th>
                    <th className="px-6 py-4 border-r border-gray-100 text-orange-600 font-black">Bloques Teor.</th>
                    <th className="px-6 py-5 bg-primary/5 text-primary font-black">Plan Reposición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                  {isLoading ? (
                    <tr><td colSpan={7} className="py-20 text-center text-slate-200 uppercase animate-pulse font-black tracking-widest">Sincronizando Capacidades...</td></tr>
                  ) : unifiedSummaryData.length === 0 ? (
                    <tr><td colSpan={7} className="py-20 text-slate-200 font-black uppercase tracking-widest text-center italic">No hay órdenes para los criterios seleccionados</td></tr>
                  ) : (
                    unifiedSummaryData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-400 border-r border-gray-50">{row.fecha}</td>
                        <td className="px-6 py-4 font-black text-indigo-700 border-r border-gray-50 uppercase tracking-tighter">{row.maquina}</td>
                        <td className="px-6 py-4 font-black text-slate-800 border-r border-gray-50">{row.dens}</td>
                        <td className="px-6 py-4 font-black text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                        <td className="px-6 py-4 font-black text-blue-700 border-r border-gray-50">{row.apertura}</td>
                        <td className="px-6 py-4 font-mono font-black text-orange-800 border-r border-gray-50 bg-orange-50/10">{formatNum(row.totalBloques, 2)}</td>
                        <td className="px-6 py-4 font-mono font-black text-primary bg-primary/5 text-lg">{row.planReposicion}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="curado" className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {curadoGroupsSummary.map((group) => (
              <div key={group.id} className="space-y-4">
                <div className={cn("p-4 rounded-3xl border-l-4 bg-white shadow-sm flex items-center justify-between", group.color)}>
                   <div className="flex items-center gap-3">
                      <div className={cn("p-2 rounded-xl text-white", group.badge)}><Layers className="w-5 h-5" /></div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-widest text-gray-800">{group.label}</h4>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Auditado en Tiempo Real</p>
                      </div>
                   </div>
                   <div className="flex gap-4 items-center">
                      <div className="text-right">
                         <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Total Kg</p>
                         <p className="text-sm font-black font-mono text-gray-800">{group.stats.weight.toLocaleString()}</p>
                      </div>
                      <div className="text-right border-l border-gray-100 pl-4">
                         <p className="text-[9px] font-black uppercase text-gray-400 tracking-wider">Unidades</p>
                         <p className="text-sm font-black font-mono text-gray-800">{group.stats.count}</p>
                      </div>
                   </div>
                </div>

                <div className="border border-gray-100 rounded-3xl shadow-sm overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full border-collapse text-center font-sans text-[10px]">
                      <thead className="bg-gray-50 sticky top-0 z-10 text-gray-400 uppercase font-black border-b border-gray-100">
                        <tr>
                          <th className="px-3 py-3 border-r border-gray-50">ID bloque</th>
                          <th className="px-3 py-3 border-r border-gray-50">Orden</th>
                          <th className="px-3 py-3 border-r border-gray-50 text-indigo-700">Peso (Kg)</th>
                          <th className="px-3 py-3 text-blue-900 bg-blue-50/50">Apertura</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-bold">
                        {group.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2 border-r border-gray-50 text-gray-400 font-mono">{String(row.Idbloque || row.ID_BLOQUE)}</td>
                            <td className="px-3 py-2 border-r border-gray-50 text-indigo-600 font-mono tracking-tighter">{String(row.orden || row.ORDEN)}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-mono text-indigo-900">{formatNum(row.peso || row.PESO, 1)}</td>
                            <td className="px-3 py-2 text-indigo-900 font-black bg-blue-50/20">{String(row.apertura || '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="inventario" className="space-y-4 animate-in fade-in duration-300 text-left">
          <div className="flex items-center justify-between bg-white p-3 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg"><Database className="w-4 h-4" /></div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-tight text-gray-800">Inventarios SAP Año Actual</h3>
                <p className="text-[9px] text-blue-600 font-black uppercase tracking-widest">Responsable 005</p>
              </div>
            </div>
            <div className="text-right pr-4">
              <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest mr-3">Items Encontrados</span>
              <span className="text-lg font-black text-blue-600 font-mono tracking-tighter">{inventarioFiltrado.length}</span>
            </div>
          </div>

          <Card className="rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-[#1e293b] text-slate-400 uppercase font-black tracking-tight border-b border-white/5 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-5 border-r border-white/5 text-white">Material</th>
                    <th className="px-6 py-5 border-r border-white/5 text-left text-white">Descripción</th>
                    <th className="px-3 py-5 border-r border-white/5">Centro</th>
                    <th className="px-3 py-5 border-r border-white/5 text-blue-300">ALM.</th>
                    <th className="px-3 py-5 border-r border-white/5">Año/Mes</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-green-500/20 text-green-300">Libre Utiliz.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-blue-500/20 text-blue-200">En Traslado</th>
                    <th className="px-3 py-5 border-r border-white/5 text-red-300">Bloqueado</th>
                    <th className="px-3 py-5">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {isLoading ? (
                    <tr><td colSpan={9} className="py-20 text-center text-slate-200 uppercase animate-pulse font-black tracking-widest">Consultando Inventarios SAP...</td></tr>
                  ) : inventarioFiltrado.length === 0 ? (
                    <tr><td colSpan={9} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center italic">No hay inventario registrado para el responsable 005</td></tr>
                  ) : (
                    inventarioFiltrado.map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/20 transition-colors">
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 font-mono text-blue-600">{cleanCode(row.MATERIAL)}</td>
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 text-left uppercase text-slate-600 truncate max-w-[250px]" title={row.NOMBRE}>{row.NOMBRE || '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100">{row.CENTRO}</td>
                        <td className="px-3 py-3 border-r border-gray-100 text-indigo-700 font-black bg-indigo-50/20">{row.ALMACEN}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-slate-400">{row.ANIO}/{row.MES}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-green-700 bg-green-50/30">{Number(row.LIBREUTILIZACION || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-blue-700 bg-blue-50/30">{Number(row.ENTRASLADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-red-600 bg-red-50/30">{Number(row.BLOQUEADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-[10px] text-slate-300">{row.TIPO_MATERIAL} {row.PETICIONBORRADO === 'X' && <span className="text-red-500 font-black">[B]</span>}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 px-1 text-left">
            <div className="p-2 bg-primary rounded-xl text-white shadow-lg"><Package className="w-4 h-4" /></div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">Órdenes Provisionales Filtradas</h3>
          </div>
          <Card className="rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden bg-white text-left">
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-gray-50 sticky top-0 z-10 text-slate-400 uppercase font-black tracking-tight border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Orden</th>
                    <th className="px-4 py-4 border-r border-gray-100">Fecha Inicio</th>
                    <th className="px-4 py-4 border-r border-gray-100">Material</th>
                    <th className="px-6 py-4 border-r border-gray-100 text-left">Descripción</th>
                    <th className="px-3 py-4 border-r border-gray-100">DENS.</th>
                    <th className="px-3 py-4 border-r border-gray-100 text-blue-900 bg-blue-50/50">Apertura</th>
                    <th className="px-4 py-4 border-r border-gray-100 font-black">Cant. (UN)</th>
                    <th className="px-4 py-4">Máquina</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {provFiltradas.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center italic">No hay órdenes para los criterios seleccionados</td></tr>
                  ) : (
                    provFiltradas.map((o, i) => {
                      const info = extractMaterialInfo(o);
                      return (
                        <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                          <td className="px-4 py-3 border-r border-gray-100 text-slate-400 font-mono">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                          <td className="px-4 py-3 border-r border-gray-100 font-mono text-slate-500">{String(o.FECHAINICIO || '').split('T')[0]}</td>
                          <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-red-600">{info.code}</td>
                          <td className="px-6 py-3 border-r border-gray-100 text-left uppercase text-slate-600 truncate max-w-[250px]">{info.desc}</td>
                          <td className="px-3 py-3 border-r border-gray-100 font-black text-slate-800">{info.dens}</td>
                          <td className="px-3 py-3 border-r border-gray-100 font-black text-blue-700 bg-blue-50/20">{info.apertura}</td>
                          <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-slate-900">{formatNum(o.CANTIDAD || o.CANTPROGRAMADA, 0)}</td>
                          <td className="px-4 py-3 font-black text-indigo-700 uppercase tracking-tighter">{o.MAQUINA || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300">
          <Card className="rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden bg-white text-left">
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full border-collapse text-center font-sans text-[11px]">
                <thead className="bg-[#1e293b] sticky top-0 z-10 text-white uppercase font-black tracking-widest text-[9px]">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5 text-left">Material</th>
                    <th className="px-6 py-5 border-r border-white/5 text-left">Descripción Técnica</th>
                    <th className="px-6 py-5 border-r border-white/5">Línea</th>
                    <th className="px-6 py-5 text-teal-400 font-black">Estándar (Min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {tiemposEnsamblado.length === 0 ? (
                    <tr><td colSpan={4} className="py-24 text-slate-200 uppercase tracking-widest text-center italic">Cargando Catálogo Maestro de Tiempos...</td></tr>
                  ) : (
                    tiemposEnsamblado.map((t, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-6 py-4 border-r border-gray-100 text-left font-mono text-indigo-600">{cleanCode(t.CodMaterial)}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-left uppercase text-slate-500 truncate max-w-[400px]">{t.Material || t.Descripcion}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-slate-400 uppercase tracking-tighter">{t.Linea}</td>
                        <td className="px-6 py-4 font-mono font-black text-teal-600 bg-teal-50/30">{Number(t.Tiempo || 0).toFixed(4)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="bg-blue-50 border border-blue-100 p-3 rounded-2xl flex items-center gap-3">
        <Info className="w-4 h-4 text-blue-600" />
        <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
          Nota: Auditoría técnica sincronizada con SAP S/4HANA. Módulo de Formulación optimizado para alta visibilidad de datos.
        </p>
      </div>
    </div>
  );
};
