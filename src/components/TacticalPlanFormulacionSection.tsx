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
  Info,
  Search,
  RefreshCw
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
  const [isLoading, setIsLoading] = useState(true);
  
  // Estados de Fecha - Hidratación Segura
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState<Date | null>(null);

  // Estados para Tiempos de Curado e Inventario
  const [curadoRows, setCuradoRows] = useState<any[]>([]);
  const [inventarioSAP, setInventarioSAP] = useState<any[]>([]);
  const [isLoadingCurado, setIsLoadingCurado] = useState(false);
  const [isLoadingInventario, setIsLoadingInventario] = useState(false);

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

      const [restrsRes, provsRes, curadoRes, invRes] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getTiemposCuradoBloqueFormulado(1, 10000),
        serviciosService.getInventarioAñoActual()
      ]);

      setRestricciones((restrsRes.data || []).filter((r: any) => groupsIds.includes(r.codigo_grupo)));
      setOrders(provsRes.data?.data || provsRes.data || []);
      setCuradoRows(Array.isArray(curadoRes.data) ? curadoRes.data : []);
      setInventarioSAP(Array.isArray(invRes.data) ? invRes.data : []);
      
      inspector.captureVariable('inventarioSAP_Raw', invRes.data);

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
    const centro = '1000'; // Formulación centralizada en Quito
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    if (relevantGroups.length === 0) return [];
    
    return ordenes.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || '').trim();
      if (itemCentro !== centro) return false;
      
      const itemAlmValue = String(o.ALMACEN || o.Almacen || '').trim();
      if (itemAlmValue !== '1006') return false; // Almacén técnico formulación

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
      { id: 'f_bloq', label: 'F_BLOQ (SISTEMA STIRLING - CALLE)', rows: fBloqRows, stats: getStats(fBloqRows), color: 'bg-indigo-900' },
      { id: 'f_bloq_m', label: 'F_BLOQ_M (PROCESO MANUAL - BCALL)', rows: fBloqMRows, stats: getStats(fBloqMRows), color: 'bg-slate-800' }
    ];
  }, [curadoRows]);

  const inventarioFiltrado = useMemo(() => {
    // Filtro por responsables de Formulación
    return inventarioSAP.filter(row => {
      const resp = String(row.CODRESPPROD || row.CodRespProd || '').trim();
      return ['003', '004', '006'].includes(resp);
    });
  }, [inventarioSAP]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><FlaskConical className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Formulación</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Plan de Reposición Bloques | Auditoría Curado SAP</p>
          </div>
        </div>

        <Button onClick={fetchData} disabled={isLoading} variant="outline" className="h-10 px-5 rounded-xl border-gray-200 gap-2 font-black text-[10px] uppercase shadow-sm hover:border-primary/50">
          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} SINCRONIZAR SAP
        </Button>
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

        <TabsContent value="resumen" className="space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-slate-50/50 p-4 rounded-[2rem] border border-gray-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-primary/10 rounded-xl"><CalendarIcon className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Horizonte de Reposición</p>
                <h3 className="text-sm font-black text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'PLAN MAESTRO CONSOLIDADO' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 px-6 rounded-2xl border-gray-200 hover:bg-white hover:border-primary/50 gap-2 font-black text-xs uppercase transition-all shadow-sm">
                  <Filter className="w-4 h-4" /> FILTRAR FECHA
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

          <div className="space-y-4">
            <h3 className="text-[11px] font-black uppercase flex items-center gap-2 px-1 tracking-widest text-left text-primary">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" /> Auditoría de Reposición por Máquina de Formulación
            </h3>
            <Card className="rounded-[2.5rem] border border-gray-100 shadow-2xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[550px]">
                <table className="w-full border-collapse text-center font-sans">
                  <thead className="bg-[#1e293b] sticky top-0 z-10 text-[10px] font-black uppercase text-white border-b border-white/5">
                    <tr>
                      <th className="px-6 py-5 border-r border-white/5">Fecha Plan</th>
                      <th className="px-6 py-5 border-r border-white/5 text-indigo-300">MÁQUINA SAP</th>
                      <th className="px-6 py-5 border-r border-white/5">Densidad</th>
                      <th className="px-6 py-5 border-r border-white/5">Tipo</th>
                      <th className="px-6 py-5 border-r border-white/5 text-blue-200">Apertura</th>
                      <th className="px-6 py-5 border-r border-white/5 text-orange-300 font-black">Total Bloques Teor.</th>
                      <th className="px-6 py-5 bg-emerald-500/20 text-emerald-300 font-black">Plan Reposición (Enteros)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                    {unifiedSummaryData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-400 border-r border-gray-50">{row.fecha}</td>
                        <td className="px-6 py-4 font-black text-indigo-700 border-r border-gray-50 uppercase tracking-tighter">{row.maquina}</td>
                        <td className="px-6 py-4 font-black text-slate-800 border-r border-gray-50">{row.dens}</td>
                        <td className="px-6 py-4 font-black text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                        <td className="px-6 py-4 font-black text-blue-700 border-r border-gray-50">{row.apertura}</td>
                        <td className="px-6 py-4 font-mono font-black text-orange-800 border-r border-gray-50 bg-orange-50/20">{formatNum(row.totalBloques, 2)}</td>
                        <td className="px-6 py-4 font-mono font-black text-emerald-700 bg-emerald-50/30 text-lg">{row.planReposicion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="curado" className="space-y-12 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-[#0f172a] p-6 rounded-[2.5rem] border border-white/10 shadow-2xl">
            <div className="flex items-center gap-5 text-left">
              <div className="p-4 bg-indigo-500/20 rounded-2xl text-indigo-400"><History className="w-8 h-8" /></div>
              <div>
                <h3 className="text-lg font-black text-white uppercase tracking-tight">Monitor Maestro de Bloques Curados</h3>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-1">Auditado vía SAP ERP | Trazabilidad por Ubicación Logística</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total Inventario Planta</p>
              <p className="text-3xl font-black text-indigo-400 font-mono tracking-tighter">{curadoRows.length}</p>
            </div>
          </div>

          <div className="space-y-16">
            {curadoGroupsSummary.map((group) => (
              <div key={group.id} className="space-y-4">
                <div className={cn("p-6 rounded-[2.5rem] border flex flex-col gap-6 text-white shadow-2xl", group.color)}>
                   <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-left">
                         <div className="p-3 bg-white/10 rounded-xl"><Layers className="w-6 h-6" /></div>
                         <div>
                            <h4 className="text-md font-black uppercase tracking-widest">{group.label}</h4>
                            <p className="text-[10px] font-bold opacity-60 uppercase">Estatus de Maduración de Espuma</p>
                         </div>
                      </div>
                   </div>
                   
                   <div className="flex gap-10 items-center bg-black/15 p-4 rounded-2xl border border-white/5">
                      <div className="text-center min-w-[120px]">
                         <p className="text-[10px] font-black uppercase opacity-60 tracking-wider">Unidades</p>
                         <p className="text-2xl font-black font-mono">{group.stats.count}</p>
                      </div>
                      <div className="text-center min-w-[140px] border-l border-white/10">
                         <p className="text-[10px] font-black uppercase opacity-60 tracking-wider">Peso Bruto (Kg)</p>
                         <p className="text-2xl font-black font-mono tracking-tighter">{group.stats.weight.toLocaleString()}</p>
                      </div>
                      <div className="text-left px-6 border-l border-white/10 flex-1">
                         <p className="text-[10px] font-black uppercase opacity-60 mb-2 tracking-widest">Aperturas en Stock</p>
                         <div className="flex flex-wrap gap-2">
                            {Array.from(group.stats.apertureMap.entries()).map(([ap, count]) => (
                              <Badge key={ap} variant="outline" className="bg-white/10 border-white/20 text-white text-[10px] font-black px-4 py-1.5 rounded-xl">
                                 {ap}: {count} un.
                              </Badge>
                            ))}
                         </div>
                      </div>
                   </div>
                </div>

                <Card className="rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[450px]">
                    <table className="w-full border-collapse text-center font-sans text-[10px]">
                      <thead className="bg-[#f8fafc] sticky top-0 z-10 text-slate-400 uppercase font-black tracking-tight border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-4 border-r border-gray-100">ID bloque</th>
                          <th className="px-4 py-4 border-r border-gray-100">Fecha</th>
                          <th className="px-4 py-4 border-r border-gray-100">ESTADO</th>
                          <th className="px-4 py-4 border-r border-gray-100">Orden</th>
                          <th className="px-4 py-4 border-r border-gray-100">CodMaterial</th>
                          <th className="px-5 py-4 border-r border-gray-100 text-left">Descripción Material</th>
                          <th className="px-3 py-4 border-r border-gray-100 text-orange-800">Peso (Kg)</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-indigo-700">Máquina</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-indigo-700 bg-indigo-50/30">Ubicación</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-blue-700">Densidad</th>
                          <th className="px-4 py-4 bg-blue-50 text-blue-900">Apertura</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-bold">
                        {group.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 border-r border-gray-100 text-gray-400 font-mono">{String(row.Idbloque || row.ID_BLOQUE)}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-gray-500 font-mono">{String(row.fecha || row.FECHA).split('T')[0]}</td>
                            <td className="px-4 py-3 border-r border-gray-100 uppercase text-[9px]">{String(row.ESTADO || '—')}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-indigo-600 font-mono tracking-tighter">{String(row.orden || row.ORDEN)}</td>
                            <td className="px-4 py-3 border-r border-gray-100 font-mono text-slate-800">{String(row.CodMaterial || row.COD_MATERIAL)}</td>
                            <td className="px-5 py-3 border-r border-gray-100 text-left uppercase text-slate-500 truncate max-w-[180px]">{String(row.NomMaterial || row.NOM_MATERIAL)}</td>
                            <td className="px-3 py-3 border-r border-gray-100 font-mono text-orange-700 font-black">{formatNum(row.peso || row.PESO, 1)}</td>
                            <td className="px-4 py-3 border-r border-gray-100 font-black text-indigo-700 uppercase tracking-tighter">{String(row.Maquina || row.MAQUINA || '—')}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-center uppercase tracking-widest text-[9px]">{String(row.estadoTras || row.Estado_Tras || '—')}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-blue-700 font-black">{String(row.densityFixed || '—')}</td>
                            <td className="px-4 py-3 text-indigo-900 font-black bg-blue-50/50">{String(row.apertura || '—')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="inventario" className="animate-in fade-in duration-300 space-y-4 text-left">
          <div className="flex items-center justify-between bg-[#1e293b] p-5 rounded-[2rem] border border-white/10 shadow-2xl text-white">
            <div className="flex items-center gap-4 text-left">
              <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg"><Database className="w-6 h-6" /></div>
              <div>
                <h3 className="text-md font-black uppercase tracking-tight">Inventarios SAP Año Actual (Auditado)</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Filtro: Responsables Formulación (003, 004, 006)</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Registros Totales</p>
              <p className="text-2xl font-black text-blue-400 font-mono tracking-tighter">{inventarioFiltrado.length}</p>
            </div>
          </div>

          <Card className="rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-tight border-b border-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-5 border-r border-gray-50">Material</th>
                    <th className="px-6 py-5 border-r border-gray-50 text-left">Descripción del Material</th>
                    <th className="px-3 py-5 border-r border-gray-50">Centro</th>
                    <th className="px-3 py-5 border-r border-gray-50 text-indigo-600">ALM.</th>
                    <th className="px-3 py-5 border-r border-gray-50">Año/Mes</th>
                    <th className="px-3 py-5 border-r border-gray-50 bg-green-50 text-green-700">Libre Utiliz.</th>
                    <th className="px-3 py-5 border-r border-gray-50 bg-blue-50 text-blue-700">En Traslado</th>
                    <th className="px-3 py-5 border-r border-gray-50">Insp. Calidad</th>
                    <th className="px-3 py-5 border-r border-gray-50 text-red-600 bg-red-50">Bloqueado</th>
                    <th className="px-3 py-5 border-r border-gray-50">Punto Pedido</th>
                    <th className="px-3 py-5">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {inventarioFiltrado.length === 0 ? (
                    <tr><td colSpan={11} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center italic">No hay inventario registrado para los criterios seleccionados</td></tr>
                  ) : (
                    inventarioFiltrado.map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3 border-r border-gray-50 font-mono text-blue-600">{cleanCode(row.MATERIAL)}</td>
                        <td className="px-6 py-3 border-r border-gray-50 text-left uppercase text-slate-600 truncate max-w-[250px]" title={row.NOMBRE}>{row.NOMBRE || '—'}</td>
                        <td className="px-3 py-3 border-r border-gray-50">{row.CENTRO}</td>
                        <td className="px-3 py-3 border-r border-gray-50 text-indigo-700 font-black bg-indigo-50/20">{row.ALMACEN}</td>
                        <td className="px-3 py-3 border-r border-gray-50 font-mono text-slate-400">{row.ANIO}/{row.MES}</td>
                        <td className="px-3 py-3 border-r border-gray-50 font-mono text-green-700 bg-green-50/50">{Number(row.LIBREUTILIZACION || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-gray-50 font-mono text-blue-700 bg-blue-50/50">{Number(row.ENTRASLADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-gray-50 font-mono text-slate-500">{Number(row.INSPECCCALIDAD || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-gray-50 font-mono text-red-600 bg-red-50/50">{Number(row.BLOQUEADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-gray-50 font-mono text-indigo-400">{Number(row.PUNTOPEDIDO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-[10px] text-slate-300">
                          {row.TIPO_MATERIAL} {row.PETICIONBORRADO === 'X' && <Badge variant="destructive" className="ml-1 h-4 text-[8px] px-1 font-black">DEL</Badge>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 px-1 text-left">
            <div className="p-2 bg-primary rounded-xl text-white shadow-lg"><Package className="w-4 h-4" /></div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Órdenes Provisionales Filtradas (Formulación)</h3>
          </div>
          <Card className="rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden bg-white text-left">
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full border-collapse text-center font-sans">
                <thead className="bg-[#f8fafc] sticky top-0 z-10 text-slate-400 uppercase font-black tracking-tight border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Orden</th>
                    <th className="px-4 py-4 border-r border-gray-100">Fecha Inicio</th>
                    <th className="px-4 py-4 border-r border-gray-100">Material</th>
                    <th className="px-6 py-4 border-r border-gray-100 text-left">Descripción</th>
                    <th className="px-3 py-4 border-r border-gray-100">DENS.</th>
                    <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/50 text-blue-900">Apertura</th>
                    <th className="px-4 py-4 border-r border-gray-100 font-black">Cant. (UN)</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-indigo-700">Máquina</th>
                    <th className="px-4 py-4">Resp. CP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold text-[10px]">
                  {provFiltradas.length === 0 ? (
                    <tr><td colSpan={9} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center italic">No hay órdenes para los criterios seleccionados</td></tr>
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
                          <td className="px-4 py-3 border-r border-gray-100 font-black text-indigo-700 uppercase tracking-tighter">{o.MAQUINA || '—'}</td>
                          <td className="px-4 py-3 text-slate-400">
                            <Badge variant="outline" className="text-[9px] font-black border-slate-100">{o.RESPCONTROLPROD || '—'}</Badge>
                          </td>
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

      <div className="bg-blue-50 border border-blue-100 p-4 rounded-3xl flex items-center gap-3">
        <Info className="w-5 h-5 text-blue-600" />
        <p className="text-[10px] font-black text-blue-700 uppercase tracking-widest">
          Nota: Datos auditados contra el entorno SAP S/4HANA en tiempo real para el proceso de Formulación.
        </p>
      </div>
    </div>
  );
};
