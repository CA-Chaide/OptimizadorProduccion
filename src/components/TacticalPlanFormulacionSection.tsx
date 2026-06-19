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
  TrendingUp,
  Box,
  Info
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
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
  
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState<Date | null>(null);

  useEffect(() => { 
    setMounted(true); 
    const now = new Date();
    setViewDate(now);
    setSelectedDates(new Set([format(now, 'yyyy-MM-dd')]));
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
      
      inspector.captureVariable('fetch_complete', { orders: (provsRes.data?.data || provsRes.data || []).length });
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
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || item.NomMaterial || '').trim();
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
    const apertureRegex = /194\.5|206|219|228/;
    const apertureMatch = catStr.match(apertureRegex) || desc.match(apertureRegex);
    if (apertureMatch) dimensions.apertura = apertureMatch[0];
    
    return { code, desc, categoria: catStr, ...dimensions };
  };

  const provFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || '').trim();
      const itemAlmValue = String(o.ALMACEN || o.Almacen || '').trim();
      if (itemCentro !== '1000' || itemAlmValue !== '1006') return false; 

      const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenes, selectedDates]);

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
      
      const qty = safeNum(o.CANTPROGRAMADA || o.CANTIDAD || 0);
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

  const apertureReport = useMemo(() => {
    const report = new Map<string, { apertura: string; totalBloques: number }>();
    unifiedSummaryData.forEach(row => {
      const key = row.apertura || '—';
      if (!report.has(key)) report.set(key, { apertura: key, totalBloques: 0 });
      report.get(key)!.totalBloques += row.planReposicion;
    });
    return Array.from(report.values()).sort((a, b) => b.totalBloques - a.totalBloques);
  }, [unifiedSummaryData]);

  // KPIs de Curado por Apertura
  const curadoApertureSummary = useMemo(() => {
    const report = new Map<string, { apertura: string; total: number }>();
    curadoRows.forEach(row => {
      const info = extractMaterialInfo({ MATERIAL: row.NomMaterial || row.CodMaterial || '' });
      const key = info.apertura || '—';
      if (!report.has(key)) report.set(key, { apertura: key, total: 0 });
      report.get(key)!.total += 1;
    });
    return Array.from(report.values()).sort((a, b) => b.total - a.total);
  }, [curadoRows]);

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
      const isManual = maquinaVal.includes('F_BLOQ_M') && (estadoTrasVal.includes('BCALL') || estadoTrasVal.includes('MANUAL'));

      if (isStirling) fBloqRows.push(enriched);
      else if (isManual) fBloqMRows.push(enriched);
      else fBloqMRows.push(enriched); // Fallback a manual
    });

    const getStats = (rows: any[]) => ({ count: rows.length, weight: rows.reduce((s, r) => s + safeNum(r.peso || r.PESO), 0) });

    return [
      { id: 'f_bloq', label: 'Sistema Stirling (F_BLOQ - CALLE)', rows: fBloqRows, stats: getStats(fBloqRows), color: 'border-l-indigo-600', badge: 'bg-indigo-600' },
      { id: 'f_bloq_m', label: 'Proceso Manual / Otros', rows: fBloqMRows, stats: getStats(fBloqMRows), color: 'border-l-slate-800', badge: 'bg-slate-800' }
    ];
  }, [curadoRows]);

  const inventarioFiltrado = useMemo(() => {
    return inventarioSAP.filter(row => String(row.CODRESPPROD || row.CodRespProd || '').trim() === '005');
  }, [inventarioSAP]);

  if (!mounted) return null;

  return (
    <div className="p-3 md:p-5 space-y-5 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-3 border-b border-gray-50">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 bg-primary/10 rounded-lg"><FlaskConical className="w-5 h-5 text-primary" /></div>
          <div>
            <h2 className="text-lg font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Formulación</h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            onClick={fetchData} 
            disabled={isLoading} 
            size="sm"
            className="h-8 px-4 rounded-lg bg-primary hover:bg-primary/90 text-white gap-2 font-black text-[9px] uppercase shadow-md transition-all active:scale-95"
          >
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            ACTUALIZAR DATOS
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-4 rounded-lg border-gray-200 gap-2 font-black text-[9px] uppercase shadow-sm hover:border-primary/40 transition-all">
                <CalendarIcon className="w-3.5 h-3.5 text-primary" /> 
                {selectedDates.size === 0 ? 'Filtro Fecha' : `${selectedDates.size} Días`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-0 border-none shadow-xl rounded-xl overflow-hidden mt-2" align="end">
              <div className="bg-white p-4 font-sans text-left">
                {viewDate && (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                      <div className="flex gap-1 bg-gray-50 p-1 rounded-lg">
                        <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate!, 1))} className="h-6 h-6 hover:bg-white"><ChevronLeft className="w-3 h-3" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate!, 1))} className="h-6 h-6 hover:bg-white"><ChevronRight className="w-3 h-3" /></Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-y-1 text-center">
                      {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                      {calendarDays.map((day, idx) => {
                        if (!day) return <div key={idx} />;
                        const dStr = format(day, 'yyyy-MM-dd');
                        const isSel = selectedDates.has(dStr);
                        return (
                          <button key={dStr} onClick={() => { const n = new Set(selectedDates); isSel ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-7 w-7 mx-auto rounded-lg flex items-center justify-center transition-all", isSel ? "bg-primary text-white shadow-sm" : "hover:bg-gray-100")}>
                            <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !isSel ? "text-slate-200" : "text-slate-700")}>{format(day, 'd')}</span>
                            {datesWithOrders.has(dStr) && !isSel && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
                          </button>
                        );
                      })}
                    </div>
                    <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-primary h-8 mt-2 rounded-lg hover:bg-primary/5" onClick={() => setSelectedDates(new Set())}>Ver Todo</Button>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-9 bg-gray-50 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Capacidad', i: LayoutDashboard }, 
            { v: 'curado', l: 'Stock Curado', i: History },
            { v: 'inventario', l: 'Inventarios SAP', i: Database },
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Catálogo', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {apertureReport.map((ap) => (
              <Card key={ap.apertura} className="p-3 border-none shadow-sm bg-slate-900 text-white rounded-2xl flex flex-col justify-between">
                <div>
                  <p className="text-[8px] font-black uppercase text-slate-500 tracking-wider">Apertura Bloque</p>
                  <p className="text-lg font-black font-mono tracking-tighter text-[#facc15]">{ap.apertura}</p>
                </div>
                <div className="mt-2 pt-2 border-t border-white/5 flex justify-between items-end">
                  <p className="text-base font-black font-mono text-indigo-400">{ap.totalBloques} <span className="text-[9px] opacity-40">BL</span></p>
                  <TrendingUp className="w-3 h-3 text-emerald-500 opacity-40" />
                </div>
              </Card>
            ))}
          </div>

          <Card className="border border-gray-100 rounded-2xl shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-gray-50 sticky top-0 z-10 text-[9px] font-black uppercase text-slate-400 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-3 border-r border-gray-50 text-left">Fecha</th>
                    <th className="px-4 py-3 border-r border-gray-50 text-indigo-600">Máquina SAP</th>
                    <th className="px-4 py-3 border-r border-gray-50">Dens</th>
                    <th className="px-4 py-3 border-r border-gray-50">Tipo</th>
                    <th className="px-4 py-3 border-r border-gray-50 bg-indigo-50/30 text-indigo-900">Apertura</th>
                    <th className="px-4 py-3 border-r border-gray-50 text-orange-600">Bloques Teor.</th>
                    <th className="px-4 py-3 bg-indigo-600 text-white font-black">Plan Reposición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[10px] font-bold">
                  {unifiedSummaryData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2 text-slate-400 border-r border-gray-50">{row.fecha}</td>
                      <td className="px-4 py-2 font-black text-slate-800 border-r border-gray-50 uppercase">{row.maquina}</td>
                      <td className="px-4 py-2 border-r border-gray-50">{row.dens}</td>
                      <td className="px-4 py-2 text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                      <td className="px-4 py-2 text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.apertura}</td>
                      <td className="px-4 py-2 font-mono font-black text-orange-800 border-r border-gray-50 bg-orange-50/5">{formatNum(row.totalBloques, 1)}</td>
                      <td className="px-4 py-2 font-mono font-black text-indigo-700 bg-indigo-50/20 text-sm">{row.planReposicion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="curado" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
            {curadoApertureSummary.map(ap => (
              <Badge key={ap.apertura} variant="outline" className="px-3 py-1 gap-2 border-indigo-100 bg-indigo-50 text-indigo-700 font-black text-[9px] uppercase shrink-0">
                <Box className="w-3 h-3" />
                AP {ap.apertura}: {ap.total} UND
              </Badge>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6">
            {curadoGroupsSummary.map((group) => (
              <div key={group.id} className="space-y-2">
                <div className="flex justify-between items-center px-1">
                   <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                     <div className={cn("w-1.5 h-1.5 rounded-full", group.badge)} /> {group.label}
                   </h4>
                   <span className="text-[9px] font-black text-slate-300 uppercase">{group.stats.count} BLOQUES | {group.stats.weight.toLocaleString()} KG</span>
                </div>
                <Card className="border border-gray-100 rounded-xl shadow-sm overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full border-collapse text-center font-sans text-[9px]">
                      <thead className="bg-gray-50 sticky top-0 z-10 text-slate-400 uppercase font-black border-b border-gray-100">
                        <tr>
                          {group.rows.length > 0 && Object.keys(group.rows[0]).map(k => (
                            <th key={k} className="px-4 py-3 border-r border-gray-50">{k.replace(/_/g, ' ')}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-bold">
                        {group.rows.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                            {Object.keys(row).map(k => (
                              <td key={k} className={cn(
                                "px-4 py-2 border-r border-gray-50",
                                k.toLowerCase().includes('apertura') ? "text-blue-700 bg-blue-50/5" : "text-slate-600"
                              )}>
                                {typeof row[k] === 'number' ? formatNum(row[k], 1) : String(row[k] ?? '—')}
                              </td>
                            ))}
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

        <TabsContent value="inventario" className="animate-in fade-in duration-300">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white"><Database className="w-4 h-4" /></div>
            <h3 className="text-[10px] font-black uppercase tracking-tight text-slate-800">Inventarios SAP Responsable: 005</h3>
          </div>

          <Card className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[500px] relative">
              <table className="w-full border-collapse text-center font-sans text-[9px]">
                <thead className="bg-slate-900 text-slate-400 uppercase font-black border-b border-white/5 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-4 border-r border-white/5 text-white">Material</th>
                    <th className="px-4 py-4 border-r border-white/5 text-left text-white">Nombre</th>
                    <th className="px-3 py-4 border-r border-white/5">Centro</th>
                    <th className="px-3 py-4 border-r border-white/5 text-blue-300">ALM.</th>
                    <th className="px-3 py-4 border-r border-white/5">Año/Mes</th>
                    <th className="px-3 py-4 border-r border-white/5 bg-green-500/10 text-green-300">Libre</th>
                    <th className="px-3 py-4 border-r border-white/5">Traslado</th>
                    <th className="px-3 py-4 border-r border-white/5 text-red-300">Bloqueado</th>
                    <th className="px-3 py-4">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold">
                  {inventarioFiltrado.map((row, i) => (
                    <tr key={i} className="hover:bg-blue-50/10 transition-colors">
                      <td className="px-4 py-2 border-r border-dashed border-gray-100 font-mono text-blue-600">{cleanCode(row.MATERIAL)}</td>
                      <td className="px-4 py-2 border-r border-dashed border-gray-100 text-left uppercase text-slate-500 truncate max-w-[250px]">{row.NOMBRE || '—'}</td>
                      <td className="px-3 py-2 border-r border-dashed border-gray-100">{row.CENTRO}</td>
                      <td className="px-3 py-2 border-r border-gray-100 text-indigo-700 font-black bg-indigo-50/20">{row.ALMACEN}</td>
                      <td className="px-3 py-2 border-r border-dashed border-gray-100 font-mono text-slate-400">{row.ANIO}/{row.MES}</td>
                      <td className="px-3 py-2 border-r border-dashed border-gray-100 font-mono text-green-700 bg-green-50/20">{Number(row.LIBREUTILIZACION || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 border-r border-dashed border-gray-100 font-mono text-blue-400">{Number(row.ENTRASLADO || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 border-r border-dashed border-gray-100 font-mono text-red-600">{Number(row.BLOQUEADO || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-[9px] text-slate-300">{row.TIPO_MATERIAL}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="animate-in fade-in duration-300">
          <Card className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-center font-sans text-[9px]">
                <thead className="bg-gray-50 sticky top-0 z-10 text-slate-400 uppercase font-black border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Orden</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Material</th>
                    <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/50 text-blue-900">Apertura</th>
                    <th className="px-4 py-4 border-r border-gray-100 font-black">Cant. (UN)</th>
                    <th className="px-4 py-4">Máquina</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold">
                  {provFiltradas.map((o, i) => {
                    const info = extractMaterialInfo(o);
                    return (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-2 border-r border-gray-100 text-slate-400 font-mono">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                        <td className="px-4 py-2 border-r border-gray-100 text-left uppercase text-slate-600 truncate max-w-[300px]">{info.desc}</td>
                        <td className="px-3 py-2 border-r border-gray-100 font-black text-blue-700 bg-blue-50/10">{info.apertura}</td>
                        <td className="px-4 py-2 border-r border-gray-100 font-mono font-black text-slate-900">{formatNum(o.CANTIDAD || o.CANTPROGRAMADA, 0)}</td>
                        <td className="px-4 py-2 font-black text-indigo-700 uppercase">{o.MAQUINA || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300">
          <Card className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-slate-900 text-white uppercase font-black tracking-widest text-[8px]">
                  <tr>
                    <th className="px-6 py-4 border-r border-white/5 text-left">Material</th>
                    <th className="px-6 py-4 border-r border-white/5 text-left">Descripción Técnica</th>
                    <th className="px-6 py-4 border-r border-white/5">Línea</th>
                    <th className="px-6 py-4 text-teal-400 font-black">Estándar (Min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {tiemposEnsamblado.map((t, i) => (
                    <tr key={i} className="hover:bg-indigo-50/20 transition-colors text-[9px]">
                      <td className="px-6 py-2 border-r border-gray-100 text-left font-mono text-indigo-600">{cleanCode(t.CodMaterial)}</td>
                      <td className="px-6 py-2 border-r border-gray-100 text-left uppercase text-slate-500 truncate max-w-[400px]">{t.Material || t.Descripcion}</td>
                      <td className="px-6 py-2 border-r border-gray-100 text-slate-400 uppercase">{t.Linea}</td>
                      <td className="px-6 py-2 font-mono font-black text-teal-600 bg-teal-50/20">{Number(t.Tiempo || 0).toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};