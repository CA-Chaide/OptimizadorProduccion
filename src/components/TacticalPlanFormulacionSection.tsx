
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
  RefreshCw,
  Minus,
  Plus,
  TrendingUp,
  ClipboardList,
  ThermometerSnowflake,
  AlertCircle,
  CheckCircle2,
  Timer,
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, differenceInDays, parseISO, subDays } from 'date-fns';
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

const formatNum = (val: any, decimals: number = 2): string => {
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
  const [inventarioSAP, setInventarioSAP] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [curadoData, setCuradoData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });
  const [unifiedSummaryData, setUnifiedSummaryData] = useState<any[]>([]);
  
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState(new Date());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // --- LOGICA DE EXTRACCION Y FILTRADO ---

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || item.MATERIAL_ID || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || item.NomMaterial || item.DESCRIPCION || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || item.CATEGORIA_DESC || '').trim();
    
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
  }, []);

  const provFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenes, selectedDates]);

  const handleProcessResumen = useCallback(async () => {
    if (provFiltradas.length === 0) {
      setUnifiedSummaryData([]);
      return;
    }
    
    setIsProcessingResumen(true);
    const groupsMap = new Map<string, any>();
    const uniqueMatKeys = Array.from(new Set(provFiltradas.map(o => {
      const info = extractMaterialInfo(o);
      const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
      const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const maquina = String(o.MAQUINA || o.RECURSO || 'SIN MÁQUINA').trim().toUpperCase();
      return `${fecha}|${maquina}|${info.code}|${info.apertura}`;
    })));

    setResumenProgress({ current: 0, total: uniqueMatKeys.length });

    for (let i = 0; i < provFiltradas.length; i++) {
      const o = provFiltradas[i];
      const info = extractMaterialInfo(o);
      const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
      const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const maquina = String(o.MAQUINA || o.RECURSO || 'SIN MÁQUINA').trim().toUpperCase();
      const key = `${fecha}|${maquina}|${info.code}|${info.apertura}`;
      
      const qty = safeNum(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const anchoVal = parseFloat(info.ancho) || 0;
      const espVal = parseFloat(info.esp) || 0;
      const densVal = parseFloat(String(info.dens)) || 0;
      const usefulHeight = (densVal < 30) ? 103 : 85;
      const itemBloques = (qty * espVal * anchoVal) / (usefulHeight * BLOCK_LENGTH_METERS * 100);
      const itemKg = (anchoVal * 200 * espVal * densVal * qty) / 10000;

      if (!groupsMap.has(key)) {
        let blockCode = '—';
        let blockDesc = '—';
        try {
          const bomResponse = await serviciosService.getMaestroMaterialesExplosion("1000", info.code.padStart(18, '0'), 1, 100);
          const bomData = bomResponse?.data?.data || bomResponse?.data || [];
          if (Array.isArray(bomData)) {
            const blockComp = bomData.find(row => (row.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('BLOQUE FORMULADO'));
            if (blockComp) {
              blockCode = cleanCode(blockComp.COMPONENTE);
              blockDesc = String(blockComp.DESCRIPCION_COMPONENTE).toUpperCase();
            }
          }
        } catch (e) { console.warn(`Error BOM para ${info.code}`); }

        const finalBlockSearchCode = blockCode !== '—' ? blockCode : info.code;
        const stockKg = inventarioSAP
          .filter(inv => cleanCode(inv.MATERIAL) === finalBlockSearchCode)
          .reduce((sum, item) => sum + safeNum(item.LIBREUTILIZACION), 0);

        const pesoBloque = (100 * usefulHeight * BLOCK_LENGTH_METERS * densVal) / 10000;

        groupsMap.set(key, { 
          fecha, maquina, material: info.code, descripcion: info.desc, 
          dens: info.dens, tipo: info.tipo, apertura: info.apertura, 
          ancho: anchoVal, esp: espVal, totalBloques: 0, planReposicion: 0,
          blockCode, blockDesc, stockKg, pesoBloque,
          kgTotal: 0, ordenes: 0, unidades: 0
        });
      }
      
      const entry = groupsMap.get(key)!;
      entry.totalBloques += itemBloques;
      entry.kgTotal += itemKg;
      entry.unidades += qty;
      entry.ordenes += 1;
      entry.planReposicion = Math.ceil(entry.totalBloques);
      
      if (i % 10 === 0) setResumenProgress({ current: i + 1, total: provFiltradas.length });
    }

    const finalData = Array.from(groupsMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.maquina.localeCompare(b.maquina));
    setUnifiedSummaryData(finalData);
    setIsProcessingResumen(false);
    addNotification('success', 'Auditoría técnica de carga completada.');
  }, [provFiltradas, inventarioSAP, addNotification, extractMaterialInfo]);

  const globalStats = useMemo(() => {
    return unifiedSummaryData.reduce((acc, row) => ({
      ordenes: acc.ordenes + row.ordenes,
      unidades: acc.unidades + row.unidades,
      kilos: acc.kilos + row.kgTotal,
      bloques: acc.bloques + row.planReposicion
    }), { ordenes: 0, unidades: 0, kilos: 0, bloques: 0 });
  }, [unifiedSummaryData]);

  const groupedNeeds = useMemo(() => {
    const map = new Map<string, any>();
    unifiedSummaryData.forEach(row => {
      const key = row.apertura || '—';
      if (!map.has(key)) map.set(key, { apertura: key, items: [], totalKg: 0, totalUn: 0, totalBloques: 0 });
      const group = map.get(key)!;
      group.items.push(row);
      group.totalKg += row.kgTotal;
      group.totalUn += row.unidades;
      group.totalBloques += row.planReposicion;
    });
    return Array.from(map.values()).sort((a, b) => b.totalKg - a.totalKg);
  }, [unifiedSummaryData]);

  const curadoAudit = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const eightDaysAgo = subDays(today, 8);

    return curadoData
      .map(row => {
        const info = extractMaterialInfo(row);
        const fabDateRaw = String(row.FECHA_FABRICACION || row.FECHA || row.FECHA_FAB || '').trim();
        
        let fabDate: Date | null = null;
        if (fabDateRaw && fabDateRaw !== 'null') {
          const d = fabDateRaw.includes('T') ? fabDateRaw.split('T')[0] : fabDateRaw;
          const [y, m, day] = d.split('-').map(Number);
          fabDate = new Date(y, m - 1, day);
          fabDate.setHours(0,0,0,0);
        }
        
        let estatus = 'SIN FECHA';
        let diasTranscurridos = 0;
        let diasRequeridos = 3; 
        
        if (fabDate) {
          diasTranscurridos = differenceInDays(today, fabDate);
          diasRequeridos = info.apertura === '194.5' ? 2 : 3;
          estatus = diasTranscurridos >= diasRequeridos ? 'DISPONIBLE' : 'EN CURADO';
        }

        return {
          ...row,
          ...info,
          fabDate,
          fabDateStr: fabDate ? format(fabDate, 'yyyy-MM-dd') : '—',
          diasTranscurridos,
          diasRequeridos,
          estatus
        };
      })
      .filter(row => row.fabDate && row.fabDate >= eightDaysAgo)
      .sort((a, b) => (b.fabDate?.getTime() || 0) - (a.fabDate?.getTime() || 0));
  }, [curadoData, extractMaterialInfo]);

  const filteredInventario = useMemo(() => {
    return inventarioSAP.filter(row => {
      const resp = String(getProp(row, ['RESP_CONTROL_PROD', 'RESPCONTROLPROD', 'RESP_CTRL_PROD', 'RESPONSABLE'])).trim();
      // FILTRO AGIL: Mostrar solo responsable 005 en inventario
      return resp === '005';
    });
  }, [inventarioSAP]);

  const datesWithOrdersSet = useMemo(() => {
    const s = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') s.add(d.includes('T') ? d.split('T')[0] : d);
    });
    return s;
  }, [ordenes]);

  const calendarDaysList = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  // --- INITIALIZATION ---

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    setViewDate(today);
    setSelectedDates(new Set([format(today, 'yyyy-MM-dd')]));
  }, []);

  const fetchDataAsync = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('formulación') || name.includes('espuma');
      });
      setGrupos(filteredGroups);
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);

      const [restrsRes, provsRes, invRes, timesRes, curadoRes] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getInventarioAñoActual(),
        serviciosService.getTiemposEnsamblado(1, 15000),
        serviciosService.getTiemposCuradoBloqueFormulado(1, 3000)
      ]);

      setRestricciones((restrsRes.data || []).filter((r: any) => groupsIds.includes(r.codigo_grupo)));
      setOrders(provsRes.data?.data || provsRes.data || []);
      setInventarioSAP(Array.isArray(invRes.data) ? invRes.data : []);
      setTiemposEnsamblado(timesRes.data?.data || timesRes.data || []);
      setCuradoData(curadoRes.data || []);
      
      addNotification('success', 'Sincronización técnica completada.');
    } catch (error) {
      addNotification('error', 'Error al sincronizar datos operativos');
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    if (mounted) fetchDataAsync();
  }, [mounted, fetchDataAsync]);

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedGroups(next);
  };

  // --- RENDER HELPERS ---

  if (!mounted) {
    return <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 font-sans text-left" />;
  }

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 flex flex-col items-center justify-center gap-4 text-left">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando SAP Formulación...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-indigo-600/10 rounded-xl shadow-inner"><FlaskConical className="w-6 h-6 text-indigo-600" /></div>
          <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Formulación</h2>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleProcessResumen} disabled={isProcessingResumen} className="h-9 px-5 rounded-xl bg-primary text-white gap-2 font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">
            {isProcessingResumen ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} ACTUALIZAR AUDITORÍA
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 px-5 rounded-xl border-gray-200 gap-2 font-black text-[10px] uppercase shadow-sm transition-all hover:border-primary/50">
                <CalendarIcon className="w-4 h-4 text-primary" /> {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} Días Seleccionados`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
              <div className="bg-white p-5 font-sans text-left text-[11px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-slate-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                  <div className="flex gap-1 bg-gray-50 p-1 rounded-xl">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => subMonths(prev, 1))} className="h-8 w-8 hover:bg-white"><ChevronLeft className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => addMonths(prev, 1))} className="h-8 w-8 hover:bg-white"><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center mb-4">
                  {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[9px] font-black text-slate-300 uppercase py-1">{d}</div>)}
                  {calendarDaysList.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dStr = format(day, 'yyyy-MM-dd');
                    const isSel = selectedDates.has(dStr);
                    return (
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); isSel ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSel ? "bg-primary text-white shadow-md shadow-primary/20" : "hover:bg-slate-50")}>
                        <span className={cn("text-xs font-black", !datesWithOrdersSet.has(dStr) && !isSel ? "text-slate-200" : "text-slate-700")}>{format(day, 'd')}</span>
                        {datesWithOrdersSet.has(dStr) && !isSel && <div className="absolute bottom-1.5 w-1 h-1 bg-primary/40 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-primary h-9 rounded-xl hover:bg-primary/5 tracking-widest" onClick={() => setSelectedDates(new Set())}>Ver Todo el Plan</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[ 
            { v: 'resumen', l: 'Salida de Datos', i: LayoutDashboard }, 
            { v: 'curado', l: 'Control Curado', i: ThermometerSnowflake },
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'inventario', l: 'Inventarios SAP', i: Database }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-primary rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#0f172a] p-6 rounded-[2.5rem] border border-white/5 shadow-2xl text-white">
            <div className="border-r border-white/10 pr-6 text-left">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Consolidado Planta</p>
              <h3 className="text-xl font-black uppercase text-indigo-400 mt-1 tracking-tighter">Reporte Maestro</h3>
            </div>
            <div className="flex flex-col gap-1 text-center">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Órdenes</p>
              <p className="text-2xl font-black font-mono text-slate-100 tracking-tighter">{globalStats.ordenes}</p>
            </div>
            <div className="flex flex-col gap-1 text-center border-l border-white/10">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Unidades</p>
              <p className="text-2xl font-black font-mono text-emerald-400 tracking-tighter">{globalStats.unidades.toLocaleString()}</p>
            </div>
            <div className="flex flex-col gap-1 text-center border-l border-white/10">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Peso Total (Kg)</p>
              <p className="text-2xl font-black font-mono text-indigo-400 tracking-tighter">{globalStats.kilos.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
          </div>

          <div className="space-y-10">
            {groupedNeeds.length === 0 ? (
              <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100">
                <TrendingUp className="w-16 h-16 text-indigo-100 mx-auto" />
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Presione el botón "ACTUALIZAR" para generar la auditoría técnica</p>
              </div>
            ) : (
              groupedNeeds.map((group) => {
                const key = group.apertura;
                const isExp = expandedGroups.has(key);
                return (
                  <div key={key} className="border-2 border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white transition-all text-left">
                    <div 
                      className="flex items-center justify-between bg-[#1e293b] text-white px-8 py-5 cursor-pointer hover:bg-[#0f172a] transition-colors"
                      onClick={() => toggleGroup(key)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        {isExp ? <Minus className="w-5 h-5 text-red-500" /> : <Plus className="w-5 h-5 text-emerald-500" />}
                        <h4 className="text-sm font-black uppercase tracking-widest">Apertura: {key}</h4>
                      </div>
                      <div className="flex gap-12 font-mono">
                        <div className="text-right">
                          <p className="text-[8px] font-bold text-slate-500 uppercase opacity-60">Total Kg</p>
                          <p className="text-sm font-black text-indigo-400">{group.totalKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-bold text-slate-500 uppercase opacity-60">Total UN</p>
                          <p className="text-sm font-black text-emerald-400">{group.totalUn.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-bold text-slate-500 uppercase opacity-60">Bloques Teor.</p>
                          <p className="text-sm font-black text-yellow-400">{group.totalBloques.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                        </div>
                      </div>
                    </div>

                    {isExp && (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-center font-sans text-[10px] text-gray-700">
                          <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-widest text-[9px] border-b border-gray-100">
                            <tr>
                              <th className="px-6 py-4 text-left border-r border-gray-50">Material</th>
                              <th className="px-6 py-4 text-left border-r border-gray-50">Descripción del Bloque (BOM)</th>
                              <th className="px-4 py-4 border-r border-gray-50">Densidad</th>
                              <th className="px-4 py-4 border-r border-gray-50">Tipo</th>
                              <th className="px-4 py-4 border-r border-gray-50 font-black text-slate-900 bg-slate-50/30">Cant. (UN)</th>
                              <th className="px-5 py-4 border-r border-gray-50 text-indigo-700 bg-indigo-50/30">Total Kg</th>
                              <th className="px-5 py-4 border-r border-gray-50 text-red-700 bg-red-50/30 font-black">Nro. Bloques</th>
                              <th className="px-6 py-4 text-left border-r border-gray-50">Cód. Bloque (SAP)</th>
                              <th className="px-6 py-4 text-left bg-emerald-50/30 text-emerald-800">Stock Actual (Kg)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 font-bold">
                            {group.items.map((item: any, idx: number) => (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-3 text-left font-mono font-black text-indigo-600 border-r border-gray-50">{item.material}</td>
                                <td className="px-6 py-3 text-left uppercase text-slate-900 font-black text-[9px] border-r border-gray-50 truncate max-w-[200px]" title={item.blockDesc}>{item.blockDesc !== '—' ? item.blockDesc : item.descripcion}</td>
                                <td className="px-4 py-3 border-r border-gray-50 font-mono">{item.dens}</td>
                                <td className="px-4 py-3 border-r border-gray-50 uppercase text-slate-400">{item.tipo}</td>
                                <td className="px-4 py-3 border-r border-gray-50 font-mono font-black text-slate-900 bg-slate-50/10">{item.unidades.toLocaleString()}</td>
                                <td className="px-5 py-3 border-r border-gray-50 font-mono font-black text-indigo-600 bg-indigo-50/10">{item.kgTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                                <td className="px-5 py-3 border-r border-gray-50 font-mono font-black text-red-600 bg-red-50/10">{item.planReposicion}</td>
                                <td className="px-6 py-3 text-left font-mono text-slate-400 border-r border-gray-50">{item.blockCode}</td>
                                <td className="px-6 py-3 text-left font-mono font-black text-emerald-600 bg-emerald-50/10">{item.stockKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="curado" className="animate-in fade-in duration-300 text-left">
           <div className="space-y-6">
             <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-xl">
               <div className="flex items-center gap-3 mb-6">
                 <div className="p-3 bg-blue-600/10 rounded-2xl text-blue-600">
                    <Timer className="w-6 h-6" />
                 </div>
                 <div>
                   <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Audit de Curado y Maduración Química (Últimos 8 Días)</h3>
                   <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Lógica: 194.5 (2D) | 206/219/228 (3D) | Auditoría Temporal Filtrada</p>
                 </div>
               </div>

               <div className="border border-gray-50 rounded-2xl overflow-hidden shadow-inner bg-white">
                 <div className="overflow-x-auto max-h-[600px]">
                   <table className="w-full text-[10px] text-center border-collapse">
                     <thead className="bg-[#0f172a] text-white uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                       <tr>
                         <th className="px-6 py-5 text-left border-r border-white/5">Código Bloque</th>
                         <th className="px-6 py-5 text-left border-r border-white/5">Descripción Técnica</th>
                         <th className="px-4 py-5 border-r border-white/5">Apertura</th>
                         <th className="px-4 py-5 border-r border-white/5 bg-white/5">Dens.</th>
                         <th className="px-6 py-5 border-r border-white/5">Fecha Fabricación</th>
                         <th className="px-4 py-5 border-r border-white/5">Días Trans.</th>
                         <th className="px-4 py-5 border-r border-white/5">Min. Req.</th>
                         <th className="px-6 py-5">Estatus de Uso</th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-50 font-bold">
                        {curadoAudit.length === 0 ? (
                          <tr><td colSpan={8} className="py-24 text-slate-200 uppercase font-black tracking-widest italic opacity-40">Sin bloques fabricados en los últimos 8 días</td></tr>
                        ) : (
                          curadoAudit.map((row, idx) => {
                            const isReady = row.estatus === 'DISPONIBLE';
                            return (
                              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 text-left font-mono font-black text-indigo-600 border-r border-gray-50">{row.code}</td>
                                <td className="px-6 py-4 text-left uppercase text-slate-400 italic text-[9px] border-r border-gray-50 truncate max-w-[250px]" title={row.desc}>{row.desc}</td>
                                <td className="px-4 py-4 border-r border-gray-50 font-black text-blue-700 bg-blue-50/20">{row.apertura}</td>
                                <td className="px-4 py-4 border-r border-gray-50 font-mono">{row.dens}</td>
                                <td className="px-6 py-4 border-r border-gray-50 font-mono text-slate-400 bg-slate-50/30">{row.fabDateStr}</td>
                                <td className="px-4 py-4 border-r border-gray-50 font-black text-slate-700">{row.diasTranscurridos}</td>
                                <td className="px-4 py-4 border-r border-gray-50 font-black text-slate-400">{row.diasRequeridos}D</td>
                                <td className="px-6 py-4">
                                  <Badge className={cn(
                                    "px-4 py-1 rounded-full text-[9px] font-black tracking-tighter uppercase",
                                    isReady ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200"
                                  )} variant="outline">
                                    {isReady ? <CheckCircle2 className="w-3 h-3 mr-1.5" /> : <Activity className="w-3 h-3 mr-1.5" />}
                                    {row.estatus}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })
                        )}
                     </tbody>
                   </table>
                 </div>
               </div>
             </div>
           </div>
        </TabsContent>

        <TabsContent value="ordenes" className="animate-in fade-in duration-300 text-left">
           <div className="border-2 border-gray-50 rounded-[2rem] shadow-xl overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] text-center border-collapse">
                  <thead className="bg-[#1e293b] text-white uppercase font-black tracking-widest text-[8px] border-b border-white/5 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-5 text-left border-r border-white/5">Orden Previsional</th>
                      <th className="px-6 py-5 text-left border-r border-white/5">Material / Descripción</th>
                      <th className="px-4 py-5 border-r border-white/5">Apertura</th>
                      <th className="px-4 py-5 border-r border-white/5 bg-black/10">Dens.</th>
                      <th className="px-6 py-5 border-r border-white/5 text-right font-black">Cant. Programada</th>
                      <th className="px-4 py-5 border-r border-white/5">U.M.</th>
                      <th className="px-4 py-5 border-r border-white/5">Máquina</th>
                      <th className="px-4 py-5">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-bold text-slate-600">
                    {provFiltradas.length === 0 ? (
                      <tr><td colSpan={8} className="py-24 text-slate-200 uppercase tracking-widest italic font-black opacity-40">No se detectaron órdenes provisionales</td></tr>
                    ) : (
                      provFiltradas.map((o, idx) => {
                        const info = extractMaterialInfo(o);
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-left font-mono font-black text-slate-900 border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                            <td className="px-6 py-4 text-left border-r border-gray-50 max-w-[400px] truncate">
                              <span className="text-indigo-600 font-black block text-[11px]">{info.code}</span>
                              <span className="text-slate-400 text-[9px] uppercase italic block leading-tight">{info.desc}</span>
                            </td>
                            <td className="px-4 py-4 border-r border-gray-50 font-black text-blue-700 bg-blue-50/20">{info.apertura}</td>
                            <td className="px-4 py-4 border-r border-gray-50 font-mono text-slate-900">{info.dens}</td>
                            <td className="px-6 py-4 text-right font-mono font-black text-slate-900 bg-slate-50/10 border-r border-gray-50">{formatNum(o.CANTIDAD || o.CANTPROGRAMADA, 0)}</td>
                            <td className="px-4 py-4 border-r border-gray-50 text-slate-300">UN</td>
                            <td className="px-4 py-4 border-r border-gray-50 font-black text-slate-400 uppercase text-[9px]">{o.MAQUINA || o.RECURSO || '—'}</td>
                            <td className="px-4 py-4 text-slate-200 font-bold">{o.ALMACEN || o.Almacen || '—'}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
           </div>
        </TabsContent>

        <TabsContent value="inventario" className="animate-in fade-in duration-300 text-left">
          <Card className="rounded-[2rem] border-2 border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5">Material</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Descripción del Producto (SAP)</th>
                    <th className="px-3 py-5 border-r border-white/5">Centro</th>
                    <th className="px-3 py-5 border-r border-white/5 text-indigo-300">ALM.</th>
                    <th className="px-3 py-5 border-r border-white/5">Año/Mes</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-green-500/30 text-green-300">Libre Utiliz.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-blue-500/30 text-blue-200">En Traslado</th>
                    <th className="px-3 py-5 border-r border-white/5 text-red-300">Bloqueado</th>
                    <th className="px-3 py-5">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-[11px]">
                  {filteredInventario.length === 0 ? (
                    <tr><td colSpan={9} className="py-24 text-slate-200 font-black uppercase tracking-widest italic text-center">Sin stock registrado para el responsable 005</td></tr>
                  ) : (
                    filteredInventario.map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/10 transition-colors">
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 font-mono text-blue-600">{cleanCode(row.MATERIAL)}</td>
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 text-left uppercase text-slate-500 truncate max-w-[300px] leading-tight" title={row.NOMBRE}>{row.NOMBRE || '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100">{row.CENTRO}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 text-indigo-700 font-black bg-indigo-50/30">{row.ALMACEN}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-slate-400">{row.ANIO}/{row.MES}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-green-700 bg-green-50/30">{Number(row.LIBREUTILIZACION || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-blue-500 bg-blue-50/30">{Number(row.ENTRASLADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-red-600 bg-red-50/30">{Number(row.BLOQUEADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-[9px] text-blue-600 uppercase font-black">{getProp(row, ['RESP_CONTROL_PROD', 'RESPCONTROLPROD', 'RESPONSABLE'])}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* NOTA TECNICA FINAL */}
      <div className="flex items-center gap-3 p-5 bg-indigo-50 border border-indigo-100 rounded-[1.5rem] shadow-sm text-left">
        <Info className="w-5 h-5 text-indigo-600 flex-shrink-0" />
        <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest leading-relaxed">
          Nota Técnica: Auditoría multinivel FERT->BLOQUE. Los estatus de curado se calculan automáticamente según la apertura del bloque y su estampa de tiempo de fabricación SAP.
        </p>
      </div>
    </div>
  );
};
