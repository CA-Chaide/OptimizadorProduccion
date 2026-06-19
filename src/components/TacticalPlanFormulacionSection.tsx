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
  Info,
  Minus,
  Plus
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

  const curadoGroupsSummary = useMemo(() => {
    const leaderRows: any[] = [];
    const cofamaRows: any[] = [];
    
    curadoRows.forEach(row => {
      const maquinaVal = String(getProp(row, ['Maquina', 'MAQUINA'])).toUpperCase();
      const estadoTrasVal = String(getProp(row, ['estadoTras', 'Estado_Tras'])).toUpperCase();
      const fechaVal = String(getProp(row, ['fecha', 'FECHA']));
      
      const info = extractMaterialInfo({ MATERIAL: row.NomMaterial || row.CodMaterial || '' });
      let densityVal = getProp(row, ['Densidad', 'DENSIDAD', 'Dens']);
      if (!densityVal || densityVal === '—' || densityVal === '0') densityVal = info.dens;

      const enriched = { ...row, apertura: info.apertura, densityFixed: densityVal };

      // LÓGICA LEADER: [estadoTras] = "CALLE" AND [Maquina] = "F_BLOQ" AND [fecha] contiene 2026
      const isLeader = estadoTrasVal === 'CALLE' && maquinaVal === 'F_BLOQ' && fechaVal.includes('2026');

      // LÓGICA COFAMA: [estadoTras] = "BCALL" OR [Maquina] = "F_BLOQ_M" (Se visualizan todos sin restricción de stock)
      const isCofama = estadoTrasVal === 'BCALL' || maquinaVal === 'F_BLOQ_M';

      if (isLeader) leaderRows.push(enriched);
      else if (isCofama) cofamaRows.push(enriched);
    });

    const getApertureSummary = (rows: any[]) => {
      const report = new Map<string, number>();
      rows.forEach(r => {
        const key = r.apertura || '—';
        report.set(key, (report.get(key) || 0) + 1);
      });
      return Array.from(report.entries()).map(([ap, qty]) => ({ ap, qty }));
    };

    return [
      { 
        id: 'leader', 
        label: 'BLOQUE FORMULADO LEADER', 
        rows: leaderRows, 
        apertures: getApertureSummary(leaderRows),
        badge: 'bg-indigo-600' 
      },
      { 
        id: 'cofama', 
        label: 'BLOQUE FORMULADO COFAMA', 
        rows: cofamaRows, 
        apertures: getApertureSummary(cofamaRows),
        badge: 'bg-slate-800' 
      }
    ];
  }, [curadoRows]);

  const inventarioFiltrado = useMemo(() => {
    return inventarioSAP.filter(row => String(row.CODRESPPROD || row.CodRespProd || '').trim() === '005');
  }, [inventarioSAP]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><FlaskConical className="w-6 h-6 text-primary" /></div>
          <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Formulación</h2>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            onClick={fetchData} 
            disabled={isLoading} 
            className="h-10 px-6 rounded-xl bg-primary hover:bg-primary/90 text-white gap-2 font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            ACTUALIZAR DATOS
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 px-5 rounded-xl border-gray-200 gap-2 font-black text-[10px] uppercase shadow-sm transition-all hover:border-primary/50">
                <CalendarIcon className="w-4 h-4 text-primary" /> 
                {selectedDates.size === 0 ? 'Filtro Fecha' : `${selectedDates.size} Días Seleccionados`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-3" align="end">
              <div className="bg-white p-5 font-sans text-left">
                {viewDate && (
                  <>
                    <div className="flex items-center justify-between mb-5 text-left">
                      <h3 className="text-xs font-black text-slate-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                      <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
                        <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate!, 1))} className="h-8 h-8 hover:bg-white"><ChevronLeft className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate!, 1))} className="h-8 h-8 hover:bg-white"><ChevronRight className="w-4 h-4" /></Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-y-1.5 text-center mb-4">
                      {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[10px] font-black text-slate-300 py-1">{d}</div>)}
                      {calendarDays.map((day, idx) => {
                        if (!day) return <div key={idx} />;
                        const dStr = format(day, 'yyyy-MM-dd');
                        const isSel = selectedDates.has(dStr);
                        return (
                          <button key={dStr} onClick={() => { const n = new Set(selectedDates); isSel ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSel ? "bg-primary text-white shadow-md shadow-primary/20" : "hover:bg-slate-50")}>
                            <span className={cn("text-xs font-black", !datesWithOrders.has(dStr) && !isSel ? "text-slate-200" : "text-slate-700")}>{format(day, 'd')}</span>
                            {datesWithOrders.has(dStr) && !isSel && <div className="absolute bottom-1.5 w-1 h-1 bg-primary/40 rounded-full" />}
                          </button>
                        );
                      })}
                    </div>
                    <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-primary h-9 mt-1 rounded-xl hover:bg-primary/5 tracking-widest" onClick={() => setSelectedDates(new Set())}>Ver Todo el Plan</Button>
                  </>
                )}
              </div>
            </PopoverContent>
          </Popover>
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {apertureReport.map((ap) => (
              <Card key={ap.apertura} className="p-4 border-none shadow-sm bg-slate-900 text-white rounded-2xl flex flex-col justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Apertura Bloque SAP</p>
                  <p className="text-xl font-black font-mono tracking-tighter text-[#facc15]">{ap.apertura}</p>
                </div>
                <div className="mt-3 pt-3 border-t border-white/5 flex justify-between items-end">
                  <p className="text-lg font-black font-mono text-indigo-400">{ap.totalBloques} <span className="text-[10px] opacity-40">BL</span></p>
                  <TrendingUp className="w-4 h-4 text-emerald-500 opacity-40" />
                </div>
              </Card>
            ))}
          </div>

          <Card className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white mt-4">
            <div className="overflow-x-auto max-h-[550px] relative">
              <table className="w-full border-collapse text-center font-sans text-[11px]">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-gray-50 text-slate-400 uppercase font-black tracking-tighter border-b border-gray-100 text-[9px]">
                    <th className="px-5 py-4 border-r border-gray-50 text-left">Fecha SAP</th>
                    <th className="px-5 py-4 border-r border-gray-50 text-indigo-600">Máquina Producción</th>
                    <th className="px-5 py-4 border-r border-gray-50">Densidad</th>
                    <th className="px-5 py-4 border-r border-gray-50">Tipo</th>
                    <th className="px-5 py-4 border-r border-gray-50 bg-indigo-50/30 text-indigo-900">Apertura</th>
                    <th className="px-5 py-4 border-r border-gray-50 text-orange-600">Bloques Teor.</th>
                    <th className="px-5 py-4 bg-indigo-600 text-white font-black">Plan Reposición</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                  {unifiedSummaryData.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 text-slate-400 border-r border-gray-50">{row.fecha}</td>
                      <td className="px-5 py-3 font-black text-slate-800 border-r border-gray-50 uppercase">{row.maquina}</td>
                      <td className="px-5 py-3 border-r border-gray-50">{row.dens}</td>
                      <td className="px-5 py-3 text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                      <td className="px-5 py-3 text-blue-700 border-r border-gray-50 bg-blue-50/5 font-black">{row.apertura}</td>
                      <td className="px-5 py-3 font-mono font-black text-orange-800 border-r border-gray-50 bg-orange-50/5">{formatNum(row.totalBloques, 1)}</td>
                      <td className="px-5 py-3 font-mono font-black text-indigo-700 bg-indigo-50/20 text-sm">{row.planReposicion}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="curado" className="space-y-10 animate-in fade-in duration-300 text-left">
          {curadoGroupsSummary.map((group) => (
            <div key={group.id} className="space-y-4">
              <div className="flex justify-between items-end px-2">
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", group.badge)} /> {group.label}
                  </h3>
                  <div className="flex gap-2 mt-2">
                    {group.apertures.map(ap => (
                      <Badge key={ap.ap} variant="outline" className="px-3 py-0.5 border-gray-100 bg-gray-50 text-slate-500 font-black text-[9px] uppercase">
                        AP {ap.ap}: {ap.qty} BL
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Capacidad Ocupada</p>
                  <p className="text-sm font-black text-slate-800">{group.rows.length} Bloques | {group.rows.reduce((s, r) => s + safeNum(r.peso || r.PESO), 0).toLocaleString()} KG</p>
                </div>
              </div>

              <Card className="border border-gray-100 rounded-2xl shadow-lg overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[450px]">
                  <table className="w-full border-collapse text-center font-sans text-[10px]">
                    <thead className="bg-[#f8fafc] sticky top-0 z-10 text-slate-400 uppercase font-black border-b border-gray-100">
                      <tr>
                        {group.rows.length > 0 && Object.keys(group.rows[0]).map(k => (
                          <th key={k} className="px-5 py-4 border-r border-gray-50">{k.replace(/_/g, ' ')}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {group.rows.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          {Object.keys(row).map(k => (
                            <td key={k} className={cn(
                              "px-5 py-2.5 border-r border-gray-50",
                              k.toLowerCase().includes('apertura') ? "text-blue-700 bg-blue-50/5 font-black" : "text-slate-600"
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
        </TabsContent>

        <TabsContent value="inventario" className="animate-in fade-in duration-300 space-y-4 text-left">
          <div className="flex items-center gap-2 px-1">
            <div className="p-1.5 bg-blue-600 rounded-lg text-white"><Database className="w-4 h-4" /></div>
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Responsable SAP: 005 (Auditado)</h3>
          </div>

          <Card className="rounded-2xl border border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[550px] relative">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-[#1e293b] text-white border-b border-white/5 uppercase font-black tracking-widest text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-5 py-5 border-r border-white/5">Material</th>
                    <th className="px-6 py-5 border-r border-white/5 text-left">Descripción del Producto</th>
                    <th className="px-3 py-5 border-r border-white/5">Centro</th>
                    <th className="px-3 py-5 border-r border-white/5 text-indigo-300">ALM.</th>
                    <th className="px-3 py-5 border-r border-white/5">Año/Mes</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-green-500/30 text-green-300">Libre Utiliz.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-blue-500/30 text-blue-200">En Traslado</th>
                    <th className="px-3 py-5 border-r border-white/5">Insp. Calidad</th>
                    <th className="px-3 py-5 border-r border-white/5 text-red-300">Bloqueado</th>
                    <th className="px-3 py-5 border-r border-white/5">Punto Pedido</th>
                    <th className="px-3 py-5">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-[11px]">
                  {inventarioFiltrado.length === 0 ? (
                    <tr><td colSpan={11} className="py-24 text-slate-200 font-black uppercase tracking-widest italic text-center">No se detectó inventario para el responsable 005</td></tr>
                  ) : (
                    inventarioFiltrado.map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/10 transition-colors">
                        <td className="px-5 py-3 border-r border-dashed border-gray-100 font-mono text-blue-600">{cleanCode(row.MATERIAL)}</td>
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 text-left uppercase text-slate-500 truncate max-w-[300px] leading-tight" title={row.NOMBRE}>{row.NOMBRE || '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100">{row.CENTRO}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 text-indigo-700 font-black bg-indigo-50/30">{row.ALMACEN}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-slate-400">{row.ANIO}/{row.MES}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-green-700 bg-green-50/30">{Number(row.LIBREUTILIZACION || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-blue-500 bg-blue-50/30">{Number(row.ENTRASLADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-slate-400">{Number(row.INSPECCCALIDAD || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-red-600 bg-red-50/30">{Number(row.BLOQUEADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-indigo-400">{Number(row.PUNTOPEDIDO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-[10px] text-slate-300 uppercase">
                          {row.TIPO_MATERIAL} {row.PETICIONBORRADO === 'X' && <span className="text-red-500 font-black" title="Petición de Borrado">[B]</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="animate-in fade-in duration-300 text-left">
          <Card className="rounded-2xl border border-gray-100 shadow-lg overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full border-collapse text-center font-sans text-[11px]">
                <thead className="bg-gray-50 sticky top-0 z-10 text-[10px] font-black uppercase text-slate-400 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-5 border-r border-gray-100 text-left">Orden SAP</th>
                    <th className="px-5 py-5 border-r border-gray-100 text-left">Material / Descripción</th>
                    <th className="px-4 py-5 border-r border-gray-100 bg-blue-50/50 text-blue-900">Apertura</th>
                    <th className="px-5 py-5 border-r border-gray-100 font-black">Cant. (UN)</th>
                    <th className="px-5 py-5">Máquina Recurso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                  {provFiltradas.length === 0 ? (
                    <tr><td colSpan={5} className="py-24 text-slate-200 uppercase tracking-widest font-black italic text-center">No hay órdenes para los filtros seleccionados</td></tr>
                  ) : (
                    provFiltradas.map((o, i) => {
                      const info = extractMaterialInfo(o);
                      return (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3 border-r border-gray-100 text-slate-400 font-mono">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                          <td className="px-5 py-3 border-r border-gray-100 text-left uppercase text-slate-600 truncate max-w-[400px]" title={info.desc}>{info.desc}</td>
                          <td className="px-4 py-3 border-r border-gray-100 font-black text-blue-700 bg-blue-50/10">{info.apertura}</td>
                          <td className="px-5 py-3 border-r border-gray-100 font-mono font-black text-slate-900 text-sm">{formatNum(o.CANTIDAD || o.CANTPROGRAMADA, 0)}</td>
                          <td className="px-5 py-3 font-black text-indigo-700 uppercase tracking-tight">{o.MAQUINA || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300 text-left">
          <Card className="rounded-2xl border border-gray-100 shadow-lg overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[550px]">
              <table className="w-full border-collapse text-center font-sans text-[11px]">
                <thead className="bg-[#0f172a] text-white uppercase font-black tracking-widest text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5 text-left">Material</th>
                    <th className="px-6 py-5 border-r border-white/5 text-left">Descripción Técnica SAP</th>
                    <th className="px-6 py-5 border-r border-white/5">Línea Prod.</th>
                    <th className="px-6 py-5 text-teal-400 font-black">Estándar (Min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {tiemposEnsamblado.length === 0 ? (
                    <tr><td colSpan={4} className="py-24 text-slate-200 uppercase tracking-widest text-center italic">Sincronizando Catálogo Maestro de Tiempos...</td></tr>
                  ) : (
                    tiemposEnsamblado.map((t, i) => (
                      <tr key={i} className="hover:bg-indigo-50/20 transition-colors">
                        <td className="px-6 py-3 border-r border-gray-100 text-left font-mono text-indigo-600">{cleanCode(t.CodMaterial)}</td>
                        <td className="px-6 py-3 border-r border-gray-100 text-left uppercase text-slate-500 truncate max-w-[450px] leading-tight">{t.Material || t.Descripcion}</td>
                        <td className="px-6 py-3 border-r border-gray-100 text-slate-400 uppercase font-black text-[9px]">{t.Linea}</td>
                        <td className="px-6 py-3 font-mono font-black text-teal-600 bg-teal-50/20 text-sm">{Number(t.Tiempo || 0).toFixed(4)}</td>
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
          Nota: Auditoría técnica sincronizada con SAP S/4HANA. Segmento COFAMA visualiza todos los bloques BCALL y F_BLOQ_M.
        </p>
      </div>
    </div>
  );
};
