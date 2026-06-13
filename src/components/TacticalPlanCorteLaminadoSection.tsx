
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Scissors, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  ClipboardList, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Filter,
  Activity,
  PlayCircle,
  UserCheck,
  Check,
  Database,
  Plus,
  Minus,
  Info,
  RefreshCw,
  BarChart3,
  Box
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from "@/components/ui/progress";
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

interface RawBOMRow {
  NIVEL: string;
  CENTRO: string;
  FERT_PRINCIPAL: string;
  DESCRIPCION_FERT: string;
  MATERIAL_PADRE: string;
  COMPONENTE: string;
  DESCRIPCION_COMPONENTE: string;
  CANTIDAD_UNITARIA: number;
  CANTIDAD_ACUMULADA: number;
}

interface UnifiedNeedRow {
  material: string;
  descripcion: string;
  distancia: number;
  altura: number;
  espesor: number;
  densidad: number;
  peso: number;
  consumoKg: number;
  consumoUn: number;
  stock1006: number;
  stock1008: number;
  stock1015: number;
  porcentajeNecesidad: number;
  planUn: number;
  planKg: number;
}

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const getProp = (obj: any, key: string): string => {
  if (!obj) return '';
  const searchKey = key.toUpperCase().trim();
  const foundKey = Object.keys(obj).find(k => k.toUpperCase().trim() === searchKey);
  return foundKey ? String(obj[foundKey]).trim() : '';
};

const getNumProp = (obj: any, key: string): number => {
  if (!obj) return 0;
  const searchKey = key.toUpperCase().trim();
  const foundKey = Object.keys(obj).find(k => k.toUpperCase().trim() === searchKey);
  return foundKey ? safeNum(obj[foundKey]) : 0;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const parseDimensionsEnhanced = (desc: string) => {
  const d = desc.toUpperCase();
  const densMatch = d.match(/D(\d+)/);
  const densidad = densMatch ? parseInt(densMatch[1]) : 0;
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/);
  const alturaOriginal = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const espesor = dimMatch ? parseFloat(dimMatch[2]) : 0;
  
  let alturaFinal = alturaOriginal;
  if (alturaOriginal === 204 && espesor <= 1.2) {
    alturaFinal = 206;
  }
  
  let distancia = 100; 
  if (espesor === 1.0) distancia = 110;
  else if (espesor === 3.5) distancia = 60;
  else if (espesor === 1.2) distancia = 100;
  
  return { densidad, distancia, altura: alturaFinal, espesor };
};

export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanLaminado');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState<Date | null>(null);
  const [fertBusqueda, setFertBusqueda] = useState('');
  const [bomRows, setBomRows] = useState<RawBOMRow[]>([]);
  const [isSearchingBOM, setIsSearchingBOM] = useState(false);
  const [unifiedNeeds, setUnifiedNeeds] = useState<UnifiedNeedRow[]>([]);
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });
  const [processedSignature, setProcessedSignature] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Definición de fechas con órdenes para el calendario (CORRECCIÓN DE ERROR)
  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes]);

  useEffect(() => {
    setMounted(true);
    const now = new Date();
    setViewDate(now);
    setSelectedDate(now.toISOString().split('T')[0]);
    const init = async () => {
      try {
        const groupsRes = await grupoService.getAll();
        const filteredGroups = (groupsRes.data || []).filter(g => {
          const name = (g.nombre_grupo || '').toLowerCase();
          return (name.includes('corte y laminado') || name.includes('laminado'));
        });
        setGrupos(filteredGroups);
        const ids = filteredGroups.map(g => g.codigo_grupo);
        const [restrs, provs, times] = await Promise.all([
          restriccionService.getAll(),
          serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
          serviciosService.getTiemposEnsamblado(1, 15000).catch(() => ({ data: [] }))
        ]);
        setRestriccionesArray((restrs.data || []).filter((r: any) => ids.includes(r.codigo_grupo)));
        setOrders(provs.data?.data || provs.data || []);
        setTiemposEnsamblado(times.data?.data || times.data || []);
      } catch (e) {
        console.error('Error init:', e);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const filteredOrders = useMemo(() => {
    const relevantGroups = grupos.filter(g => {
      const name = (g.nombre_grupo || '').toLowerCase();
      return (name.includes('corte y laminado') || name.includes('laminado'));
    }).map(g => g.codigo_grupo);
    
    const allowedResps = restriccionesArray
      .filter(r => (r.nombre_restriccion === 'RESPCTRLPROD' || r.nombre_restriccion === 'Hojas_Rutas_Materiales') && relevantGroups.includes(r.codigo_grupo))
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return ordenes.filter(o => {
      const centro = String(o.CENTRO || o.Centro || '').trim();
      if (centro === '2000') return false; 
      const responsable = String(o.RESPCONTROLPROD || o.RespControlProd || o.RESP_CONTROL_PROD || '').trim();
      if (allowedResps.length > 0 && !allowedResps.includes(responsable)) return false;
      if (selectedDate !== 'all') {
        const dateRaw = String(o.FECHAINICIO || o.FECHA || '').trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        if (date !== selectedDate) return false;
      }
      return true;
    });
  }, [ordenes, selectedDate, grupos, restriccionesArray]);

  const handleProcessResumen = useCallback(async (ordersToProcess: any[]) => {
    if (ordersToProcess.length === 0) {
      setUnifiedNeeds([]);
      return;
    }
    setIsProcessingResumen(true);
    const materialGroups = new Map<string, { totalQty: number }>();
    ordersToProcess.forEach(order => {
      const matRaw = String(order.MATERIAL || order.CodMaterial || '').trim();
      const match = matRaw.match(/^(\d+)/);
      const matCode = match ? match[1] : matRaw;
      if (!matCode) return;
      const existing = materialGroups.get(matCode);
      const orderQty = safeNum(order.CANTPROGRAMADA || order.CANTIDAD || 0);
      if (existing) existing.totalQty += orderQty;
      else materialGroups.set(matCode, { totalQty: orderQty });
    });
    const uniqueMaterials = Array.from(materialGroups.entries());
    setResumenProgress({ current: 0, total: uniqueMaterials.length });
    const consolidatedMap = new Map<string, UnifiedNeedRow>();
    const CONCURRENCY_LIMIT = 5; 
    try {
      for (let i = 0; i < uniqueMaterials.length; i += CONCURRENCY_LIMIT) {
        const batch = uniqueMaterials.slice(i, i + CONCURRENCY_LIMIT);
        await Promise.all(batch.map(async ([matCode, data]) => {
          const fullCode = matCode.padStart(18, '0');
          const totalQtyForMaterial = data.totalQty;
          try {
            const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 500);
            const rawData = response?.data?.data || response?.data || [];
            if (Array.isArray(rawData)) {
              rawData
                .filter(row => {
                  const descComp = getProp(row, 'DESCRIPCION_COMPONENTE').toUpperCase();
                  const centroComp = getProp(row, 'CENTRO');
                  return centroComp !== '2000' && descComp.includes('LAMINA CILINDRICA');
                })
                .forEach(comp => {
                  const code = cleanCode(getProp(comp, 'COMPONENTE'));
                  const desc = getProp(comp, 'DESCRIPCION_COMPONENTE').toUpperCase();
                  const cantAcum = getNumProp(comp, 'CANTIDAD_ACUMULADA') || getNumProp(comp, 'CANTIDAD_UNITARIA');
                  const kgTotal = totalQtyForMaterial * cantAcum;
                  if (consolidatedMap.has(code)) {
                    const ex = consolidatedMap.get(code)!;
                    ex.consumoKg += kgTotal;
                  } else {
                    const dims = parseDimensionsEnhanced(desc);
                    const pesoCalculado = (dims.distancia * dims.altura * dims.espesor * dims.densidad) / 10000;
                    const s1006 = tiemposEnsamblado.filter(t => cleanCode(t.CodMaterial) === code && String(t.Almacen || t.ALMACEN) === '1006').reduce((s, t) => s + safeNum(t.StockActual), 0);
                    const s1008 = tiemposEnsamblado.filter(t => cleanCode(t.CodMaterial) === code && String(t.Almacen || t.ALMACEN) === '1008').reduce((s, t) => s + safeNum(t.StockActual), 0);
                    const s1015 = tiemposEnsamblado.filter(t => cleanCode(t.CodMaterial) === code && String(t.Almacen || t.ALMACEN) === '1015').reduce((s, t) => s + safeNum(t.StockActual), 0);
                    consolidatedMap.set(code, {
                      material: code, descripcion: desc, distancia: dims.distancia, altura: dims.altura, espesor: dims.espesor, densidad: dims.densidad,
                      peso: pesoCalculado, consumoKg: kgTotal, consumoUn: 0, stock1006: s1006, stock1008: s1008, stock1015: s1015,
                      porcentajeNecesidad: 0, planUn: 0, planKg: 0
                    });
                  }
                });
            }
          } catch (e) {
            console.warn(`[Laminado] Error procesando material ${matCode}:`, (e as Error).message);
          }
        }));
        setResumenProgress(prev => ({ ...prev, current: Math.min(i + CONCURRENCY_LIMIT, uniqueMaterials.length) }));
      }
      const finalArray = Array.from(consolidatedMap.values()).map(row => ({
        ...row,
        consumoUn: row.peso > 0 ? row.consumoKg / row.peso : 0
      }));
      
      const groupMap = new Map<string, UnifiedNeedRow[]>();
      finalArray.forEach(row => {
        const k = `${row.densidad}-${row.altura}`;
        if(!groupMap.has(k)) groupMap.set(k, []);
        groupMap.get(k)!.push(row);
      });
      
      groupMap.forEach(items => {
        const totalKgGroup = items.reduce((s, r) => s + r.consumoKg, 0);
        const targetPlanUn = 40; 
        items.forEach(row => {
          row.porcentajeNecesidad = totalKgGroup > 0 ? (row.consumoKg / totalKgGroup) : 0;
          row.planUn = Math.round(targetPlanUn * row.porcentajeNecesidad);
          row.planKg = row.planUn * row.peso;
        });
      });
      setUnifiedNeeds(finalArray.sort((a, b) => b.consumoKg - a.consumoKg));
    } catch (err) {
      console.error('Error procesando resumen:', err);
    } finally { 
      setIsProcessingResumen(false); 
    }
  }, [tiemposEnsamblado]);

  useEffect(() => {
    if (activeTab === 'resumen' && filteredOrders.length > 0 && !isProcessingResumen) {
      const signature = `${selectedDate}|${filteredOrders.length}|${filteredOrders[0]?.ORDENPREVISIONAL || ''}`;
      if (signature !== processedSignature) {
        handleProcessResumen(filteredOrders);
        setProcessedSignature(signature);
      }
    }
  }, [activeTab, filteredOrders, selectedDate, isProcessingResumen, processedSignature, handleProcessResumen]);

  const groupedNeeds = useMemo(() => {
    const map = new Map<string, { 
      densidad: number; altura: number; items: UnifiedNeedRow[]; totalKg: number; totalUn: number;
      total1006: number; total1008: number; total1015: number; totalPlanUn: number; totalPlanKg: number;
    }>();
    unifiedNeeds.forEach(item => {
      const key = `${item.densidad}-${item.altura}`;
      if (!map.has(key)) {
        map.set(key, { 
          densidad: item.densidad, altura: item.altura, items: [], totalKg: 0, totalUn: 0,
          total1006: 0, total1008: 0, total1015: 0, totalPlanUn: 0, totalPlanKg: 0
        });
      }
      const group = map.get(key)!;
      group.items.push(item);
      group.totalKg += item.consumoKg;
      group.totalUn += item.consumoUn;
      group.total1006 += item.stock1006;
      group.total1008 += item.stock1008;
      group.total1015 += item.stock1015;
      group.totalPlanUn += item.planUn;
      group.totalPlanKg += item.planKg;
    });
    return Array.from(map.values()).sort((a, b) => b.totalKg - a.totalKg);
  }, [unifiedNeeds]);

  const totalsUnified = useMemo(() => {
    return unifiedNeeds.reduce((acc, row) => ({
      kg: acc.kg + row.consumoKg,
      un: acc.un + row.consumoUn,
      planUn: acc.planUn + row.planUn,
      planKg: acc.planKg + row.planKg,
      stock1006: acc.stock1006 + row.stock1006,
      stock1008: acc.stock1008 + row.stock1008
    }), { kg: 0, un: 0, planUn: 0, planKg: 0, stock1006: 0, stock1008: 0 });
  }, [unifiedNeeds]);

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedGroups(next);
  };

  const handleRefresh = () => {
    setProcessedSignature('');
    handleProcessResumen(filteredOrders);
    addNotification('info', 'Actualizando datos del resumen técnico...');
  };

  const calendarDays = useMemo(() => {
    if (!mounted || !viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

  const looperRecords = useMemo(() => {
    return tiemposEnsamblado.filter(t => {
      const linea = String(t.Linea || '').toLowerCase();
      const puesto = String(t.PuestoTrabajo || '').toLowerCase();
      return (linea.includes('looper') || puesto.includes('looper'));
    });
  }, [tiemposEnsamblado]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl shadow-inner"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Laminado</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Explosión Técnica SAP | Gestión de Rollos y Auditoría Multinivel</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[ 
            { v: 'resumen', l: 'Resumen Necesidades', i: LayoutDashboard },
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'listaMateriales', l: 'Auditoría BOM', i: ClipboardList },
            { v: 'tiempos', l: 'Procesos Looper', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-red-600 rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
           {/* RESUMEN EJECUTIVO SIMPLIFICADO */}
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center bg-[#1e293b] p-6 rounded-3xl border border-white/10 shadow-2xl text-white">
             <div className="flex flex-col gap-1 border-r border-white/10 pr-6">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cantidad Necesaria (KG)</span>
                <p className="text-2xl font-black font-mono text-red-400 tracking-tighter">
                  {totalsUnified.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </p>
             </div>
             <div className="flex flex-col gap-1 border-r border-white/10 pr-6 pl-2">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Cantidad Necesaria (UND)</span>
                <p className="text-2xl font-black font-mono text-indigo-400 tracking-tighter">
                  {Math.round(totalsUnified.un).toLocaleString()}
                </p>
             </div>
             <div className="flex flex-col gap-1 pl-2">
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Nro de Aperturas o Corridas</span>
                <p className="text-2xl font-black font-mono text-yellow-400 tracking-tighter">
                  {groupedNeeds.length}
                </p>
             </div>
             <div className="flex justify-end ml-auto">
                <Button 
                  onClick={handleRefresh} 
                  disabled={isProcessingResumen}
                  className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg transition-all"
                >
                  {isProcessingResumen ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Actualizar Datos
                </Button>
             </div>
           </div>

          <div className="border-2 border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse font-sans text-[11px] text-center">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-[#ffff00] text-black uppercase font-black tracking-tighter text-[11px] border-b-2 border-black/10">
                    <th className="px-4 py-4 border-r border-black/5 text-left w-32">Material</th>
                    <th className="px-6 py-4 border-r border-black/5 text-left">Descripción</th>
                    <th className="px-3 py-4 border-r border-black/5">Stock 1006</th>
                    <th className="px-3 py-4 border-r border-black/5">Stock 1008</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right bg-orange-100/50">Consumo OF [Kg]</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right bg-orange-100/50">Consumo OF [Un]</th>
                    <th className="px-6 py-4 border-r border-black/5 bg-[#cfe2f3]">Peso / Rollo (Kg)</th>
                    <th className="px-4 py-4 border-r border-black/5 text-center">% Necesidad</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right font-black bg-red-100/50 text-red-900">PLAN (UN)</th>
                    <th className="px-4 py-4 text-right font-black bg-red-100/50 text-red-900">PLAN (KG)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {isProcessingResumen ? (
                    <tr>
                      <td colSpan={10} className="py-20 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500 mb-3" />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Calculando Ingeniería de Rollos: {resumenProgress.current} / {resumenProgress.total}</p>
                      </td>
                    </tr>
                  ) : groupedNeeds.length === 0 ? (
                    <tr><td colSpan={10} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center">Sin necesidades técnicas identificadas</td></tr>
                  ) : (
                    groupedNeeds.map((group, gIdx) => {
                      const groupKey = `${group.densidad}-${group.altura}`;
                      const isExpanded = expandedGroups.has(groupKey);
                      return (
                        <React.Fragment key={groupKey}>
                          <tr className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer transition-all border-l-4 border-l-red-500" onClick={() => toggleGroup(groupKey)}>
                            <td className="px-4 py-4 flex items-center gap-2">
                               {isExpanded ? <Minus className="w-3 h-3 text-red-500" /> : <Plus className="w-3 h-3 text-indigo-500" />}
                               <span className="font-black text-[10px] text-slate-400 uppercase tracking-widest">Apertura {group.altura} - D{group.densidad}</span>
                            </td>
                            <td className="px-6 py-4 text-left text-indigo-900 font-black uppercase">Subtotal Corrida</td>
                            <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1006).toLocaleString()}</td>
                            <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1008).toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-indigo-900 bg-indigo-50/50">{group.totalKg.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-emerald-700 bg-emerald-50/30">{Math.round(group.totalUn).toLocaleString()}</td>
                            <td className="px-6 py-4 bg-[#cfe2f3]/30 font-mono text-slate-300">—</td>
                            <td className="px-4 py-4 text-center font-black text-indigo-300">100%</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-red-50">{group.totalPlanUn.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-red-50">{group.totalPlanKg.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                          </tr>
                          {isExpanded && group.items.map((row, iIdx) => (
                            <tr key={`${groupKey}-${iIdx}`} className="bg-white hover:bg-blue-50/10 transition-colors animate-in slide-in-from-top-1 duration-200">
                              <td className="px-4 py-3 border-r border-gray-100 font-mono text-indigo-600 text-left pl-8">{row.material}</td>
                              <td className="px-6 py-3 border-r border-gray-100 text-left text-gray-400 uppercase leading-tight italic text-[10px] truncate max-w-[250px]">{row.descripcion}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{row.stock1006 || '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{row.stock1008 || '—'}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-bold text-indigo-400">{row.consumoKg.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-bold text-emerald-400">{Math.round(row.consumoUn).toLocaleString()}</td>
                              <td className="px-6 py-3 border-r border-gray-100 bg-[#cfe2f3] font-mono font-black text-indigo-700">{row.peso.toFixed(2)}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-center font-black text-slate-300">{(row.porcentajeNecesidad * 100).toFixed(0)}%</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-black text-red-500 bg-red-50/20">{row.planUn.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-red-500 bg-red-50/20">{row.planKg.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-gray-100 shadow-xl">
            <div className="flex items-center gap-6 text-left">
              <div className="flex flex-col">
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1.5 flex items-center gap-2">
                  <UserCheck className="w-3 h-3" /> Responsables Corte y Laminado
                </p>
                <div className="flex gap-2">
                  {restriccionesArray.filter(r => r.nombre_restriccion === 'RESPCTRLPROD' || r.nombre_restriccion === 'Hojas_Rutas_Materiales').map((r, ri) => (
                    <Badge key={ri} variant="outline" className="text-[10px] font-black bg-slate-50 border-slate-200 px-3 py-0.5 rounded-lg">{r.valor_restriccion}</Badge>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
               <Popover>
                <PopoverTrigger asChild>
                  <button className="h-10 px-5 rounded-2xl border border-gray-200 bg-white hover:border-red-500/50 flex items-center gap-3 font-black text-[11px] uppercase shadow-sm transition-all">
                    <Filter className="w-4 h-4 text-red-500" /> 
                    {selectedDate === 'all' ? 'Plan Maestro' : selectedDate}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-3" align="end">
                  <div className="bg-white p-5 font-sans text-left">
                    {viewDate && (
                      <>
                        <div className="flex items-center justify-between mb-5">
                          <h3 className="text-xs font-black text-slate-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                          <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
                            <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-8 w-8 hover:bg-white hover:shadow-sm"><ChevronLeft className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-8 w-8 hover:bg-white hover:shadow-sm"><ChevronRight className="w-4 h-4" /></Button>
                          </div>
                        </div>
                        <div className="grid grid-cols-7 gap-y-1.5 text-center mb-4">
                          {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[10px] font-black text-slate-300 py-1">{d}</div>)}
                          {calendarDays.map((day, idx) => {
                            if (!day) return <div key={idx} />;
                            const dStr = format(day, 'yyyy-MM-dd');
                            const sel = selectedDate === dStr;
                            return (
                              <button key={dStr} onClick={() => setSelectedDate(sel ? 'all' : dStr)} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-red-600 text-white shadow-md shadow-red-200" : "hover:bg-slate-50")}>
                                <span className={cn("text-xs font-black", !datesWithOrders.has(dStr) && !sel ? "text-slate-200" : "text-slate-700")}>{format(day, 'd')}</span>
                                {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1.5 w-1 h-1 bg-red-400 rounded-full" />}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-red-600 h-9 mt-1 rounded-xl hover:bg-red-50 tracking-widest" onClick={() => setSelectedDate('all')}>Ver Todo el Plan</Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse font-sans text-[11px] text-center">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5">Orden</th>
                    <th className="px-6 py-5 border-r border-white/5">Fecha Inicio</th>
                    <th className="px-6 py-5 border-r border-white/5">Código FERT</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Descripción del Producto</th>
                    <th className="px-6 py-5 border-r border-white/5">Cantidad</th>
                    <th className="px-6 py-5 border-r border-white/5">Responsable</th>
                    <th className="px-6 py-5 border-r border-white/5">Máquina</th>
                    <th className="px-6 py-5">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center">Sin registros para el filtro seleccionado</td></tr>
                  ) : (
                    filteredOrders.map((o, i) => {
                      const matCode = cleanCode(String(o.MATERIAL || '').match(/^(\d+)/)?.[1]);
                      const description = String(o.MATERIAL || '').replace(/^\d+\s*/, '') || o.NOMBRE || '—';
                      return (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-800 border-r border-gray-50">{o.ORDENPREVISIONAL || '—'}</td>
                          <td className="px-6 py-4 border-r border-gray-50 font-mono text-[9px] text-slate-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                          <td className="px-6 py-4 font-mono font-black text-red-600 border-r border-gray-50 tracking-tighter text-sm">{matCode}</td>
                          <td className="px-6 py-4 text-left border-r border-gray-100 text-slate-600 font-black uppercase leading-tight max-w-[450px]">
                            {description}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 font-mono text-sm">
                            {Number(o.CANTIDAD || 0).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 border-r border-gray-50">
                            <Badge variant="outline" className="text-[10px] font-black bg-blue-50 text-blue-700 border-blue-100">{String(o.RESPCONTROLPROD || '—')}</Badge>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-400 border-r border-gray-50 text-[10px] uppercase">
                            {String(o.MAQUINA || o.RECURSO || '—')}
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-200 text-[10px]">{o.Almacen || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="listaMateriales" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-white p-5 rounded-3xl border border-gray-100 shadow-xl">
             <div className="flex items-center gap-4">
               <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600"><ClipboardList className="w-6 h-6" /></div>
               <div>
                 <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Auditoría Estructural BOM</h3>
                 <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-1">Niveles de Explosión SAP | Auditoría Multinivel Directa</p>
               </div>
             </div>
             <form onSubmit={(e) => { e.preventDefault(); if(fertBusqueda.trim()) handleRefresh(); }} className="flex gap-3">
               <div className="relative group">
                 <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-300 group-hover:text-red-500 transition-colors" />
                 <input type="text" placeholder="Código FERT..." value={fertBusqueda} onChange={e => setFertBusqueda(e.target.value)} className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black w-56 focus:ring-4 focus:ring-red-500/10 focus:bg-white transition-all outline-none" />
               </div>
               <Button type="submit" disabled={isSearchingBOM} className="bg-slate-900 text-white rounded-2xl h-10 px-8 text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all">
                 {isSearchingBOM ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Auditar'}
               </Button>
             </form>
          </div>
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300 space-y-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-2 text-left">
              <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><Activity className="w-4 h-4" /></div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Procesos de Costura Especial (LOOPER)</h3>
            </div>
            <Card className="rounded-3xl border border-indigo-100 shadow-xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full border-collapse text-center">
                  <thead className="bg-[#1e293b] text-white sticky top-0 z-10 text-[10px] font-black uppercase tracking-tight border-b border-white/5">
                    <tr>
                      <th className="px-6 py-5 border-r border-white/5 text-left">Material</th>
                      <th className="px-6 py-5 border-r border-white/5 text-left">Descripción Técnica</th>
                      <th className="px-6 py-5 border-r border-white/5">Línea de Proceso</th>
                      <th className="px-6 py-5 border-r border-white/5 text-blue-200">Responsable CP</th>
                      <th className="px-6 py-5 border-r border-white/5 text-blue-200">Almacén</th>
                      <th className="px-6 py-5 border-r border-white/5 text-teal-400">Estándar (Min)</th>
                      <th className="px-6 py-5 text-indigo-300">Stock Actual</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px] font-black">
                    {looperRecords.map((t, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-6 py-4 font-mono text-indigo-600 border-r border-dashed border-gray-100 text-left text-sm">{cleanCode(t.CodMaterial)}</td>
                        <td className="px-6 py-4 text-left border-r border-dashed border-gray-100 text-slate-600 uppercase leading-tight max-w-[300px] truncate">{String(t.Material || t.Descripcion || '—').toUpperCase()}</td>
                        <td className="px-6 py-4 border-r border-dashed border-gray-100 font-black text-indigo-400 uppercase text-[9px] bg-indigo-50/10">{t.Linea || '—'}</td>
                        <td className="px-6 py-4 border-r border-dashed border-gray-100 text-center">
                           <Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-200 font-mono px-2 py-0">{t.RespControlProd || t.RESP_CONTROL_PROD || '—'}</Badge>
                        </td>
                        <td className="px-6 py-4 border-r border-dashed border-gray-100 text-slate-400 font-bold text-center">{t.Almacen || t.ALMACEN || '—'}</td>
                        <td className="px-6 py-4 font-mono text-teal-600 border-r border-dashed border-gray-100 bg-teal-50/10 text-sm">{Number(t.Tiempo || 0).toFixed(4)}</td>
                        <td className="px-6 py-4 text-slate-400 font-mono text-center">{(t.StockActual || 0).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
