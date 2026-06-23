
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
  ThermometerSnowflake,
  ShoppingCart,
  MapPin,
  Box,
  TrendingUp,
  Info
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, differenceInDays, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

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
  const [ordenesProceso, setOrdenesProceso] = useState<any[]>([]);
  const [inventarioSAP, setInventarioSAP] = useState<any[]>([]);
  const [curadoData, setCuradoData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });
  const [unifiedSummaryData, setUnifiedSummaryData] = useState<any[]>([]);
  
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState(new Date());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = getProp(item, ['MATERIAL', 'Material', 'CodMaterial', 'MATERIAL_ID', 'CODIGO']);
    const nameStr = getProp(item, ['NOMBRE', 'NombreMaterial', 'Descripcion', 'NomMaterial', 'DESCRIPCION']);
    const catStr = getProp(item, ['CATEGORIA', 'Categoria', 'CATEGORIA_DESC']);
    
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
      const alm = getProp(o, ['ALMACEN', 'Almacen']).trim();
      if (alm !== '1006') return false;
      const itemDateFull = getProp(o, ['FECHAINICIO', 'FECHA']).trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenes, selectedDates]);

  const prodFiltradas = useMemo(() => {
    return ordenesProceso.filter(o => {
      const centro = String(getProp(o, ['CENTRO', 'Centro'])).trim();
      const alm = String(getProp(o, ['ALMACEN', 'Almacen'])).trim();
      
      // Filtro para Formulación: Almacén 1006 o Planta 1000 (Quito)
      const matchArea = alm === '1006' || centro === '1000';
      if (!matchArea) return false;

      const itemDateFull = getProp(o, ['FECHA_INICIO', 'FECHA', 'FECHAINICIO']).trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenesProceso, selectedDates]);

  const handleProcessResumen = useCallback(async () => {
    if (provFiltradas.length === 0) {
      setUnifiedSummaryData([]);
      return;
    }
    
    setIsProcessingResumen(true);
    const groupsMap = new Map<string, any>();
    setResumenProgress({ current: 0, total: provFiltradas.length });

    for (let i = 0; i < provFiltradas.length; i++) {
      const o = provFiltradas[i];
      const info = extractMaterialInfo(o);
      
      const qty = safeNum(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const anchoVal = parseFloat(info.ancho) || 0;
      const espVal = parseFloat(info.esp) || 0;
      const densVal = parseFloat(String(info.dens)) || 0;
      const usefulHeight = (densVal < 30) ? 103 : 85;
      const itemBloques = (qty * espVal * anchoVal) / (usefulHeight * BLOCK_LENGTH_METERS * 100);
      const itemKg = (anchoVal * 200 * espVal * densVal * qty) / 10000;

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

      const key = `${blockCode}|${info.apertura}|${densVal}`;

      if (!groupsMap.has(key)) {
        const finalSearchCode = blockCode !== '—' ? blockCode : info.code;
        const stockKg = inventarioSAP
          .filter(inv => cleanCode(inv.MATERIAL) === finalSearchCode)
          .reduce((sum, item) => sum + safeNum(item.LIBREUTILIZACION), 0);

        const pesoBloque = (100 * usefulHeight * BLOCK_LENGTH_METERS * densVal) / 10000;
        const stockUN = pesoBloque > 0 ? stockKg / pesoBloque : 0;

        groupsMap.set(key, { 
          blockCode, blockDesc: blockDesc !== '—' ? blockDesc : info.desc, 
          dens: info.dens, apertura: info.apertura, 
          totalBloques: 0, planReposicion: 0,
          stockKg, stockUN, pesoBloque,
          kgTotal: 0, unidades: 0,
          ferts: [] 
        });
      }
      
      const entry = groupsMap.get(key)!;
      entry.totalBloques += itemBloques;
      entry.kgTotal += itemKg;
      entry.unidades += qty;
      entry.planReposicion = Math.ceil(entry.totalBloques);
      entry.ferts.push({ code: info.code, desc: info.desc, qty, kg: itemKg, bloques: itemBloques });
      
      if (i % 10 === 0) setResumenProgress({ current: i + 1, total: provFiltradas.length });
    }

    const finalData = Array.from(groupsMap.values()).sort((a, b) => b.kgTotal - a.kgTotal);
    setUnifiedSummaryData(finalData);
    setIsProcessingResumen(false);
  }, [provFiltradas, inventarioSAP, extractMaterialInfo]);

  const globalStats = useMemo(() => {
    return unifiedSummaryData.reduce((acc, row) => ({
      unidades: acc.unidades + row.unidades,
      kilos: acc.kilos + row.kgTotal,
      bloques: acc.bloques + row.planReposicion
    }), { unidades: 0, kilos: 0, bloques: 0 });
  }, [unifiedSummaryData]);

  const curadoAudit = useMemo(() => {
    return curadoData
      .map(row => {
        const info = extractMaterialInfo(row);
        const fabDateRaw = getProp(row, ['FECHA_FABRICACION', 'FECHA', 'FECHA_FAB']);
        
        let fabDate: Date | null = null;
        if (fabDateRaw && fabDateRaw !== 'null' && fabDateRaw !== 'undefined') {
          const d = fabDateRaw.includes('T') ? fabDateRaw.split('T')[0] : fabDateRaw;
          const parts = d.split('-');
          if (parts.length === 3) {
            const [y, m, day] = parts.map(Number);
            const tempDate = new Date(y, m - 1, day);
            if (!isNaN(tempDate.getTime())) {
              fabDate = tempDate;
              fabDate.setHours(0,0,0,0);
            }
          }
        }
        
        let estatus = 'SIN FECHA';
        let diasTranscurridos = 0;
        let diasRequeridos = 3; 
        
        if (fabDate && !isNaN(fabDate.getTime())) {
          diasTranscurridos = differenceInDays(new Date(), fabDate);
          diasRequeridos = info.apertura === '194.5' ? 2 : 3;
          estatus = diasTranscurridos >= diasRequeridos ? 'DISPONIBLE' : 'EN CURADO';
        }

        return {
          ...row,
          ...info,
          fabDate,
          fabDateStr: (fabDate && !isNaN(fabDate.getTime())) ? format(fabDate, 'yyyy-MM-dd') : '—',
          diasTranscurridos,
          diasRequeridos,
          estatus,
          nroBloque: getProp(row, ['NRO_BLOQUE', 'BLOQUE', 'ID'])
        };
      })
      .sort((a, b) => (b.fabDate?.getTime() || 0) - (a.fabDate?.getTime() || 0));
  }, [curadoData, extractMaterialInfo]);

  const filteredInventario = useMemo(() => {
    return inventarioSAP.filter(row => {
      const nombre = String(getProp(row, ['NOMBRE', 'DESCRIPCION']) || '').toUpperCase();
      return nombre.includes('BLOQUE FORMULADO');
    });
  }, [inventarioSAP]);

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

      const [restrsRes, provsRes, invRes, curadoRes, fertsRes] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getInventarioAñoActual().catch(() => ({ data: [] })),
        serviciosService.getTiemposCuradoBloqueFormulado(1, 3000).catch(() => ({ data: [] })),
        serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] }))
      ]);

      setRestricciones((restrsRes.data || []).filter((r: any) => groupsIds.includes(r.codigo_grupo)));
      setOrders(provsRes.data?.data || provsRes.data || []);
      setOrdenesProceso(fertsRes.data?.data || fertsRes.data || []);
      setInventarioSAP(Array.isArray(invRes.data) ? invRes.data : []);
      setCuradoData(curadoRes.data || []);
    } catch (error) {
      console.error('Error sincronizando datos formulacion');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) fetchDataAsync();
  }, [mounted, fetchDataAsync]);

  const calendarDaysList = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  const datesWithOrdersSet = useMemo(() => {
    const set = new Set<string>();
    ordenesProceso.forEach(o => {
      const d = String(getProp(o, ['FECHA_INICIO', 'FECHA', 'FECHAINICIO'])).trim();
      if (d && d !== 'null' && d !== 'undefined') set.add(d.includes('T') ? d.split('T')[0] : d);
    });
    return set;
  }, [ordenesProceso]);

  if (!mounted) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando SAP Formulación...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-indigo-600/10 rounded-xl"><FlaskConical className="w-6 h-6 text-indigo-600" /></div>
          <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Formulación</h2>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={handleProcessResumen} disabled={isProcessingResumen} className="h-9 px-5 rounded-xl bg-primary text-white gap-2 font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">
            {isProcessingResumen ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} ACTUALIZAR AUDITORÍA
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 px-5 rounded-xl border-gray-200 gap-2 font-black text-[10px] uppercase shadow-sm transition-all hover:border-primary/50">
                <CalendarIcon className="w-4 h-4 text-primary" /> {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} Días`}
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
                    const hasOrders = datesWithOrdersSet.has(dStr);
                    return (
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); isSel ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSel ? "bg-primary text-white shadow-md" : "hover:bg-slate-50")}>
                        <span className={cn("text-xs font-black", !hasOrders && !isSel ? "text-slate-200" : "text-slate-700")}>{format(day, 'd')}</span>
                        {hasOrders && !isSel && <div className="absolute bottom-1.5 w-1 h-1 bg-primary/40 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-primary h-9 rounded-xl hover:bg-primary/5 tracking-widest" onClick={() => setSelectedDates(new Set())}>Ver Todo</Button>
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
            { v: 'ordenesProd', l: 'Órdenes FERT', i: ShoppingCart },
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
              <h3 className="text-xl font-black uppercase text-indigo-400 mt-1 tracking-tighter">Plan de Reposición</h3>
            </div>
            <div className="flex flex-col gap-1 text-center">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Peso Total (Kg)</p>
              <p className="text-2xl font-black font-mono text-indigo-400 tracking-tighter">{globalStats.kilos.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className="flex flex-col gap-1 text-center border-l border-white/10">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total UN (Láminas)</p>
              <p className="text-2xl font-black font-mono text-emerald-400 tracking-tighter">{globalStats.unidades.toLocaleString()}</p>
            </div>
            <div className="flex flex-col gap-1 text-center border-l border-white/10">
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Bloques Requeridos</p>
              <p className="text-2xl font-black font-mono text-yellow-400 tracking-tighter">{globalStats.bloques}</p>
            </div>
          </div>

          <div className="border-2 border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white text-left">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse text-center font-sans text-[10px] text-gray-700">
                <thead className="bg-[#1e293b] text-white uppercase font-black tracking-widest text-[8px] sticky top-0 z-20 border-b-2 border-white/10">
                  <tr>
                    <th className="px-6 py-4 text-left border-r border-white/5 w-32">Bloque Formulado</th>
                    <th className="px-6 py-4 text-left border-r border-white/5">Descripción Técnica SAP</th>
                    <th className="px-3 py-4 border-r border-white/5">Dens.</th>
                    <th className="px-3 py-4 border-r border-white/5">Apert.</th>
                    <th className="px-4 py-4 border-r border-white/5 bg-white/5">Total Kg</th>
                    <th className="px-4 py-4 border-r border-white/5">T. Unidades</th>
                    <th className="px-6 py-4 border-r border-white/5 text-emerald-400 bg-black/10">Stock (Kg)</th>
                    <th className="px-4 py-4 border-r border-white/5 text-emerald-400 bg-black/10 font-black">Stock (UN)</th>
                    <th className="px-6 py-4 text-right bg-yellow-500/20 text-yellow-300 font-black">Subtotal Plan (UN)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold">
                  {isProcessingResumen ? (
                    <tr>
                      <td colSpan={9} className="py-24 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary mb-3" />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Analizando Auditoría SAP: {resumenProgress.current} / {resumenProgress.total}</p>
                      </td>
                    </tr>
                  ) : unifiedSummaryData.length === 0 ? (
                    <tr><td colSpan={9} className="py-24 text-slate-200 uppercase font-black tracking-widest text-center italic">Presione "ACTUALIZAR AUDITORÍA" para sincronizar la planta</td></tr>
                  ) : (
                    unifiedSummaryData.map((row, idx) => (
                      <React.Fragment key={idx}>
                        <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { const n = new Set(expandedGroups); n.has(row.blockCode) ? n.delete(row.blockCode) : n.add(row.blockCode); setExpandedGroups(n); }}>
                          <td className="px-6 py-3 text-left font-mono font-black text-indigo-600 border-r border-gray-100 flex items-center gap-2">
                             {expandedGroups.has(row.blockCode) ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                             {row.blockCode}
                          </td>
                          <td className="px-6 py-3 text-left uppercase text-slate-900 font-black text-[9px] border-r border-gray-100 truncate max-w-[250px]">{row.blockDesc}</td>
                          <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{row.dens}</td>
                          <td className="px-3 py-3 border-r border-gray-100 font-black text-blue-700">{row.apertura}</td>
                          <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-indigo-600 bg-indigo-50/10">{row.kgTotal.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          <td className="px-4 py-3 border-r border-gray-100 font-mono text-slate-400">{row.unidades.toLocaleString()}</td>
                          <td className="px-6 py-3 border-r border-gray-100 text-right font-mono font-black text-emerald-600 bg-emerald-50/10">{row.stockKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                          <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-black text-emerald-800 bg-emerald-50/20">{row.stockUN.toFixed(1)}</td>
                          <td className="px-6 py-3 text-right font-mono font-black text-yellow-700 bg-yellow-50/30 text-sm">{row.planReposicion}</td>
                        </tr>
                        {expandedGroups.has(row.blockCode) && row.ferts.map((f: any, fIdx: number) => (
                          <tr key={`${idx}-${fIdx}`} className="bg-slate-50/50 text-[9px] text-slate-400 font-medium">
                            <td className="px-6 py-1.5 text-left pl-10 italic">{f.code}</td>
                            <td className="px-6 py-1.5 text-left uppercase italic truncate max-w-[250px]">{f.desc}</td>
                            <td colSpan={2}></td>
                            <td className="px-4 py-1.5 font-mono">{f.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                            <td className="px-4 py-1.5 font-mono">{f.qty}</td>
                            <td colSpan={2}></td>
                            <td className="px-6 py-1.5 text-right font-mono opacity-50">{f.bloques.toFixed(3)}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="curado" className="animate-in fade-in duration-300 text-left">
           <Card className="rounded-[2.5rem] border-2 border-gray-100 shadow-xl overflow-hidden bg-white">
             <div className="overflow-x-auto max-h-[650px]">
               <table className="w-full text-[10px] text-center border-collapse">
                 <thead className="bg-[#0f172a] text-white uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                   <tr>
                     <th className="px-6 py-5 text-left border-r border-white/5">Nro. Bloque</th>
                     <th className="px-6 py-5 text-left border-r border-white/5">Mezcla Química</th>
                     <th className="px-4 py-5 border-r border-white/5">Apert.</th>
                     <th className="px-4 py-5 border-r border-white/5 bg-white/5">Dens.</th>
                     <th className="px-6 py-5 border-r border-white/5">Fabricación SAP</th>
                     <th className="px-4 py-5 border-r border-white/5">D. Trans.</th>
                     <th className="px-4 py-5 border-r border-white/5">Ciclo</th>
                     <th className="px-6 py-5">Maduración</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-gray-50 font-bold">
                    {curadoAudit.length === 0 ? (
                      <tr><td colSpan={8} className="py-24 text-slate-200 uppercase font-black tracking-widest text-center">Sin bloques registrados en SAP</td></tr>
                    ) : (
                      curadoAudit.map((row, idx) => {
                        const isReady = row.estatus === 'DISPONIBLE';
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-left font-mono font-black text-indigo-600 border-r border-gray-100">{row.nroBloque || '—'}</td>
                            <td className="px-6 py-4 text-left uppercase text-slate-400 italic text-[9px] border-r border-gray-100 truncate max-w-[280px]" title={row.desc}>{row.desc}</td>
                            <td className="px-4 py-4 border-r border-gray-100 font-black text-blue-700 bg-blue-50/20">{row.apertura}</td>
                            <td className="px-4 py-4 border-r border-gray-100 font-mono text-slate-400">{row.dens}</td>
                            <td className="px-6 py-4 border-r border-gray-100 font-mono text-slate-400 bg-slate-50/30">{row.fabDateStr}</td>
                            <td className="px-4 py-4 border-r border-gray-100 font-black text-slate-700">{row.diasTranscurridos}d</td>
                            <td className="px-4 py-4 border-r border-gray-100 font-black text-slate-400">{row.diasRequeridos}d</td>
                            <td className="px-6 py-4">
                              <Badge className={cn(
                                "px-4 py-1 rounded-full text-[9px] font-black tracking-tighter uppercase",
                                isReady ? "bg-green-100 text-green-700 border-green-200" : "bg-amber-100 text-amber-700 border-amber-200"
                              )} variant="outline">
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
           </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="animate-in fade-in duration-300 text-left">
           <Card className="border-2 border-gray-50 rounded-[2.5rem] shadow-xl overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-[10px] text-center border-collapse">
                  <thead className="bg-[#1e293b] text-white uppercase font-black tracking-widest text-[8px] border-b border-white/5 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-5 text-left border-r border-white/5">Orden</th>
                      <th className="px-6 py-5 text-left border-r border-white/5">Material / Descripción</th>
                      <th className="px-4 py-5 border-r border-white/5">Apertura</th>
                      <th className="px-4 py-5 border-r border-white/5 bg-black/10">Dens.</th>
                      <th className="px-6 py-5 border-r border-white/5 text-right font-black">Cant. Prog.</th>
                      <th className="px-4 py-5 border-r border-white/5">Máquina</th>
                      <th className="px-4 py-5">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-bold text-slate-600">
                    {provFiltradas.length === 0 ? (
                      <tr><td colSpan={7} className="py-20 text-center text-slate-200 uppercase font-black">Sin órdenes para el Almacén 1006</td></tr>
                    ) : (
                      provFiltradas.map((o, idx) => {
                        const info = extractMaterialInfo(o);
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-left font-mono font-black text-slate-900 border-r border-gray-50">{getProp(o, ['ORDENPREVISIONAL', 'ORDEN'])}</td>
                            <td className="px-6 py-4 text-left border-r border-gray-50 truncate max-w-[400px]">
                              <span className="text-indigo-600 font-black block text-[11px]">{info.code}</span>
                              <span className="text-slate-400 text-[9px] uppercase italic block leading-tight">{info.desc}</span>
                            </td>
                            <td className="px-4 py-4 border-r border-gray-50 font-black text-blue-700 bg-blue-50/20">{info.apertura}</td>
                            <td className="px-4 py-4 border-r border-gray-50 font-mono text-slate-900">{info.dens}</td>
                            <td className="px-6 py-4 text-right font-mono font-black text-slate-900 bg-slate-50/10 border-r border-gray-50">{formatNum(o.CANTIDAD || o.CANTPROGRAMADA, 0)}</td>
                            <td className="px-4 py-4 border-r border-gray-50 font-black text-slate-400 uppercase text-[9px]">{getProp(o, ['MAQUINA', 'RECURSO'])}</td>
                            <td className="px-4 py-4 text-indigo-700 font-black bg-indigo-50/30">{getProp(o, ['ALMACEN', 'Almacen'])}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
           </Card>
        </TabsContent>

        <TabsContent value="ordenesProd" className="animate-in fade-in duration-300 text-left">
          <Card className="border-2 border-gray-50 rounded-[2.5rem] shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-[10px] text-center border-collapse">
                <thead className="bg-[#1e293b] text-white uppercase font-black tracking-widest text-[8px] border-b border-white/5 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 text-left border-r border-white/5">Orden FERT</th>
                    <th className="px-6 py-5 text-left border-r border-white/5">Material / Descripción</th>
                    <th className="px-6 py-5 border-r border-white/5 text-right font-black">Cant.</th>
                    <th className="px-4 py-5 border-r border-white/5">Responsable</th>
                    <th className="px-4 py-5 border-r border-white/5">Máquina</th>
                    <th className="px-4 py-5">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-slate-600">
                  {prodFiltradas.length === 0 ? (
                    <tr><td colSpan={6} className="py-20 text-center text-slate-200 uppercase font-black">Sin órdenes de producción detectadas para Formulación / Almacén 1006</td></tr>
                  ) : (
                    prodFiltradas.map((o, idx) => {
                      const info = extractMaterialInfo(o);
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-left font-mono font-black text-indigo-900 border-r border-gray-50">{getProp(o, ['ORDEN', 'ORDEN_PROCESO'])}</td>
                          <td className="px-6 py-4 text-left border-r border-gray-50 truncate max-w-[400px]">
                            <span className="text-primary font-black block text-[11px]">{info.code}</span>
                            <span className="text-slate-400 text-[9px] uppercase italic block leading-tight">{info.desc}</span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-black text-slate-900 bg-slate-50/10 border-r border-gray-50">{formatNum(o.CANT_PROG || o.CANTIDAD || o.CANTPROGRAMADA, 0)}</td>
                          <td className="px-4 py-4 border-r border-gray-50">
                            <Badge variant="outline" className="text-[10px] font-black bg-blue-50 text-blue-700 border-blue-100">{getProp(o, ['RESP_CONTROL_PROD', 'RESPCONTROLPROD'])}</Badge>
                          </td>
                          <td className="px-4 py-4 border-r border-gray-50 font-black text-slate-400 uppercase text-[9px]">{getProp(o, ['MAQUINA', 'RECURSO'])}</td>
                          <td className="px-4 py-4 text-slate-400 font-bold">{getProp(o, ['ALMACEN', 'Almacen'])}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="inventario" className="animate-in fade-in duration-300 text-left">
          <Card className="rounded-[2.5rem] border-2 border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5">Material</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Descripción del Bloque (SAP)</th>
                    <th className="px-3 py-5 border-r border-white/5">Centro</th>
                    <th className="px-3 py-5 border-r border-white/5 text-indigo-300">ALM.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-green-500/30 text-green-300">Libre Utiliz.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-blue-500/30 text-blue-200">En Traslado</th>
                    <th className="px-3 py-5">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-[11px]">
                  {filteredInventario.length === 0 ? (
                    <tr><td colSpan={7} className="py-20 text-center text-slate-200 uppercase font-black">No hay stock de "BLOQUE FORMULADO" registrado</td></tr>
                  ) : (
                    filteredInventario.map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/10 transition-colors">
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 font-mono text-blue-600">{cleanCode(row.MATERIAL)}</td>
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 text-left uppercase text-slate-500 truncate max-w-[350px] leading-tight">{row.NOMBRE || '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100">{row.CENTRO}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 text-indigo-700 font-black bg-indigo-50/30">{row.ALMACEN}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-green-700 bg-green-50/30">{Number(row.LIBREUTILIZACION || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-blue-500 bg-blue-50/30">{Number(row.ENTRASLADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-[9px] text-blue-600 uppercase font-black">{getProp(row, ['RESP_CONTROL_PROD', 'RESPCONTROLPROD'])}</td>
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
