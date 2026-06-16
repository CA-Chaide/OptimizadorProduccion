
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Scissors, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  ClipboardList, 
  Filter,
  Activity,
  PlayCircle,
  UserCheck,
  Plus,
  Minus,
  RefreshCw,
  Database,
  ChevronLeft,
  ChevronRight
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { MaestroMaterialesExplosionSection } from './MaestroMaterialesExplosionSection';

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
  // Stock en KG
  stock1006: number;
  stock1008: number;
  stock1015: number;
  // Stock en UN (Calculado)
  stockUN1006: number;
  stockUN1008: number;
  stockUN1015: number;
  // Datos recuperados de Procesos Looper
  looperPesoUN: number;
  looperDensidad: string;
  looperEspesor: number;
  looperTRolloMin: number;
  // Calculos plan
  porcentajeNecesidad: number;
  planUn: number;
  planKg: number;
}

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const parseDimensionsEnhanced = (desc: string) => {
  const d = desc.toUpperCase();
  const densMatch = d.match(/D(\d+)/);
  const densidad = densMatch ? parseInt(densMatch[1]) : 0;
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
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
  const [kpiLooperData, setKpiLooperData] = useState<any[]>([]);
  const [inventarioAnioActual, setInventarioAnioActual] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [unifiedNeeds, setUnifiedNeeds] = useState<UnifiedNeedRow[]>([]);
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || o.fecha_inicio || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes]);

  const calendarDays = useMemo(() => {
    if (!mounted || !viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

  const initData = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return (name.includes('corte y laminado') || name.includes('laminado'));
      });
      setGrupos(filteredGroups);
      const ids = filteredGroups.map(g => g.codigo_grupo);
      
      const [restrs, provs, times, kpiLooper, invAnio] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getTiemposEnsamblado(1, 15000).catch(() => ({ data: [] })),
        serviciosService.getKPIMAestroLooper().catch(() => ({ data: [] })),
        serviciosService.getInventarioAñoActual().catch(() => ({ data: [] }))
      ]);
      
      setRestriccionesArray((restrs.data || []).filter((r: any) => ids.includes(r.codigo_grupo)));
      setOrders(provs.data?.data || provs.data || []);
      setTiemposEnsamblado(times.data?.data || times.data || []);
      setKpiLooperData(kpiLooper?.data || []);
      setInventarioAnioActual(invAnio?.data || []);

    } catch (e) {
      console.error('Error init:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    initData();
  }, [initData]);

  const filteredOrders = useMemo(() => {
    const relevantGroups = grupos.map(g => g.codigo_grupo);
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

  const handleProcessResumen = useCallback(async () => {
    const ordersToProcess = filteredOrders;
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
    
    try {
      for (let i = 0; i < uniqueMaterials.length; i++) {
        const [matCode, data] = uniqueMaterials[i];
        const fullCode = matCode.padStart(18, '0');
        const totalQtyForMaterial = data.totalQty;
        
        try {
          const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 500);
          const rawData = response?.data?.data || response?.data || [];
          if (Array.isArray(rawData)) {
            rawData
              .filter(row => {
                const descVal = (row.DESCRIPCION_COMPONENTE || '').toUpperCase();
                return descVal.includes('LAMINA CILINDRICA');
              })
              .forEach(comp => {
                const compCode = cleanCode(comp.COMPONENTE);
                const desc = String(comp.DESCRIPCION_COMPONENTE || '').toUpperCase();
                const cantAcum = safeNum(comp.CANTIDAD_ACUMULADA || comp.CANTIDAD_UNITARIA);
                const kgTotal = totalQtyForMaterial * cantAcum;

                if (consolidatedMap.has(compCode)) {
                  const existingRow = consolidatedMap.get(compCode)!;
                  existingRow.consumoKg += kgTotal;
                } else {
                  const dims = parseDimensionsEnhanced(desc);
                  const pesoCalculado = (dims.distancia * dims.altura * dims.espesor * dims.densidad) / 10000;
                  
                  // Lookup en KPI Looper (Procesos Looper Tab)
                  const looperMatch = kpiLooperData.find(k => cleanCode(k.Material) === compCode);
                  const finalPeso = looperMatch ? safeNum(looperMatch.PesoUN) : pesoCalculado;

                  // Lookup en Inventarios SAP (Inventario Tab) para almacenes 1006, 1008, 1015
                  const getStockKg = (alm: string) => {
                    return inventarioAnioActual
                      .filter(inv => cleanCode(inv.MATERIAL) === compCode && String(inv.ALMACEN).trim() === alm)
                      .reduce((sum, item) => sum + safeNum(item.LIBREUTILIZACION), 0);
                  };

                  const s1006 = getStockKg('1006');
                  const s1008 = getStockKg('1008');
                  const s1015 = getStockKg('1015');

                  consolidatedMap.set(compCode, {
                    material: compCode,
                    descripcion: desc,
                    distancia: dims.distancia,
                    altura: dims.altura,
                    espesor: dims.espesor,
                    densidad: dims.densidad,
                    peso: finalPeso,
                    consumoKg: kgTotal,
                    consumoUn: 0,
                    stock1006: s1006,
                    stock1008: s1008,
                    stock1015: s1015,
                    stockUN1006: finalPeso > 0 ? s1006 / finalPeso : 0,
                    stockUN1008: finalPeso > 0 ? s1008 / finalPeso : 0,
                    stockUN1015: finalPeso > 0 ? s1015 / finalPeso : 0,
                    looperPesoUN: looperMatch ? safeNum(looperMatch.PesoUN) : 0,
                    looperDensidad: looperMatch ? String(looperMatch.Densidad) : '—',
                    looperEspesor: looperMatch ? safeNum(looperMatch.Espesor) : 0,
                    looperTRolloMin: looperMatch ? safeNum(looperMatch.TiempoRolloMin) : 0,
                    porcentajeNecesidad: 0,
                    planUn: 0,
                    planKg: 0
                  });
                }
              });
          }
        } catch (e) {
          console.warn(`Error material ${matCode}:`, (e as Error).message);
        }
        setResumenProgress({ current: i + 1, total: uniqueMaterials.length });
      }

      const finalArray = Array.from(consolidatedMap.values()).map(row => ({
        ...row,
        consumoUn: row.peso > 0 ? row.consumoKg / row.peso : 0
      }));
      
      // Lógica de cálculo de Planificación (Prorrateo 40 Unidades por apertura)
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
      addNotification('success', 'Resumen actualizado correctamente');
    } finally { 
      setIsProcessingResumen(false); 
    }
  }, [filteredOrders, kpiLooperData, inventarioAnioActual, addNotification]);

  const groupedNeeds = useMemo(() => {
    const map = new Map<string, { 
      densidad: number; altura: number; items: UnifiedNeedRow[]; totalKg: number; totalUn: number;
      total1006: number; total1008: number; total1015: number; totalPlanUn: number; totalPlanKg: number;
      totalUN1006: number; totalUN1008: number; totalUN1015: number;
    }>();
    unifiedNeeds.forEach(item => {
      const key = `${item.densidad}-${item.altura}`;
      if (!map.has(key)) {
        map.set(key, { 
          densidad: item.densidad, altura: item.altura, items: [], totalKg: 0, totalUn: 0,
          total1006: 0, total1008: 0, total1015: 0, totalPlanUn: 0, totalPlanKg: 0,
          totalUN1006: 0, totalUN1008: 0, totalUN1015: 0
        });
      }
      const group = map.get(key)!;
      group.items.push(item);
      group.totalKg += item.consumoKg;
      group.totalUn += item.consumoUn;
      group.total1006 += item.stock1006;
      group.total1008 += item.stock1008;
      group.total1015 += item.stock1015;
      group.totalUN1006 += item.stockUN1006;
      group.totalUN1008 += item.stockUN1008;
      group.totalUN1015 += item.stockUN1015;
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
      stock1008: acc.stock1008 + row.stock1008,
      stock1015: acc.stock1015 + row.stock1015,
      stockUN1006: acc.stockUN1006 + row.stockUN1006,
      stockUN1008: acc.stockUN1008 + row.stockUN1008,
      stockUN1015: acc.stockUN1015 + row.stockUN1015
    }), { kg: 0, un: 0, planUn: 0, planKg: 0, stock1006: 0, stock1008: 0, stock1015: 0, stockUN1006: 0, stockUN1008: 0, stockUN1015: 0 });
  }, [unifiedNeeds]);

  const densityBreakdown = useMemo(() => {
    const map = new Map<number, number>();
    groupedNeeds.forEach(g => {
      map.set(g.densidad, (map.get(g.densidad) || 0) + 1);
    });
    return Array.from(map.entries()).sort((a,b) => a[0] - b[0]);
  }, [groupedNeeds]);

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedGroups(next);
  };

  const handleRefresh = () => {
    handleProcessResumen();
  };

  const filteredInventario = useMemo(() => {
    const allowedAlmacenes = restriccionesArray
      .filter(r => r.nombre_restriccion === 'ALmacen_Consumo')
      .flatMap(r => r.valor_restriccion.split(/[&,]/).map(v => v.trim()))
      .filter(v => v !== '');

    return inventarioAnioActual.filter(row => {
      const alm = String(row.ALMACEN || '').trim();
      const matchAlm = allowedAlmacenes.length === 0 || allowedAlmacenes.includes(alm);
      return matchAlm;
    });
  }, [inventarioAnioActual, restriccionesArray]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl shadow-inner"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Laminado</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Ingeniería SAP | Control Multialmacén (1006/1008/1015)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
           <Button 
              onClick={handleRefresh} 
              disabled={isProcessingResumen}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 flex items-center gap-2"
            >
              {isProcessingResumen ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              ACTUALIZAR DATOS
            </Button>

           <Popover>
            <PopoverTrigger asChild>
              <button className="h-10 px-5 rounded-2xl border border-gray-200 bg-white hover:border-red-500/50 flex items-center gap-3 font-black text-[11px] uppercase shadow-sm transition-all">
                <Filter className="w-4 h-4 text-red-500" /> 
                {selectedDate === 'all' ? 'Plan Maestro' : selectedDate}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-3" align="end">
              <div className="bg-white p-5 font-sans text-left">
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
                <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-red-600 h-9 mt-1 rounded-xl hover:bg-red-50 tracking-widest" onClick={() => setSelectedDate('all')}>Ver Todo el Plan</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[ 
            { v: 'resumen', l: 'Resumen Necesidades', i: LayoutDashboard },
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'listaMateriales', l: 'Auditoría BOM', i: ClipboardList },
            { v: 'tiempos', l: 'Procesos Looper', i: Clock },
            { v: 'inventario', l: 'Inventarios SAP', i: Database }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-red-600 rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
           {/* Tablero Ejecutivo Superior */}
           <div className="flex items-center gap-10 bg-[#1e293b] p-6 rounded-[2.5rem] border border-white/5 shadow-2xl text-white">
             <div className="flex items-center gap-12 flex-1">
                <div className="flex flex-col gap-1 border-r border-white/10 pr-10 text-left">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cantidad necesaria (KG)</span>
                   <p className="text-4xl font-black font-mono text-[#f87171] tracking-tighter">
                     {totalsUnified.kg.toLocaleString(undefined, { minimumFractionDigits: 1 }).replace('.', ',')}
                   </p>
                </div>
                <div className="flex flex-col gap-1 border-r border-white/10 px-10 text-left">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Cantidad necesaria (und)</span>
                   <p className="text-4xl font-black font-mono text-indigo-400 tracking-tighter">
                     {Math.round(totalsUnified.un).toLocaleString()}
                   </p>
                </div>
                <div className="flex flex-col gap-1 flex-1 text-left">
                   <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nro De Aperturas o corridas = {groupedNeeds.length}</span>
                   <div className="flex flex-col gap-1 mt-1 pl-1 text-left">
                        {densityBreakdown.map(([dens, count]) => (
                          <div key={dens} className="flex items-center gap-2">
                             <span className="text-[10px] font-black text-[#facc15] uppercase tracking-tight">
                               - D{dens} = {count} CORRIDA{count !== 1 ? 'S' : ''}
                             </span>
                          </div>
                        ))}
                   </div>
                </div>
             </div>
           </div>

          <div className="border-2 border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white mt-8">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse font-sans text-[11px] text-center">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-[#ffff00] text-black uppercase font-black tracking-tighter text-[11px] border-b-2 border-black/10">
                    <th className="px-4 py-4 border-r border-black/5 text-left w-32">Material</th>
                    <th className="px-6 py-4 border-r border-black/5 text-left min-w-[200px]">Descripción</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-indigo-50/50">Peso UN (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-indigo-50/50">Dens.</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-indigo-50/50">Esp.</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-indigo-50/50">T. Rollo (Min)</th>
                    <th className="px-3 py-4 border-r border-black/5 bg-blue-50/50">Stock 1006 (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-cyan-50/50 text-cyan-800">UN 1006</th>
                    <th className="px-3 py-4 border-r border-black/5 bg-blue-50/50">Stock 1008 (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-cyan-50/50 text-cyan-800">UN 1008</th>
                    <th className="px-3 py-4 border-r border-black/5 bg-blue-50/50">Stock 1015 (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-cyan-50/50 text-cyan-800">UN 1015</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right bg-orange-100/30">Consumo OF [Kg]</th>
                    <th className="px-6 py-4 border-r border-black/5 bg-[#cfe2f3]">Peso Teor. (Kg)</th>
                    <th className="px-4 py-4 border-r border-black/5 text-center">% Nec.</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right font-black bg-[#fee2e2] text-red-900">PLAN (UN)</th>
                    <th className="px-4 py-4 text-right font-black bg-[#fee2e2] text-red-900">PLAN (KG)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {isProcessingResumen ? (
                    <tr>
                      <td colSpan={17} className="py-20 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500 mb-3" />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Ejecutando Explosión Técnica BOM: {resumenProgress.current} / {resumenProgress.total}</p>
                      </td>
                    </tr>
                  ) : groupedNeeds.length === 0 ? (
                    <tr><td colSpan={17} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center italic">Presione el botón "ACTUALIZAR DATOS" para iniciar la auditoría</td></tr>
                  ) : (
                    groupedNeeds.map((group, gIdx) => {
                      const groupKey = `${group.densidad}-${group.altura}`;
                      const isExpanded = expandedGroups.has(groupKey);
                      return (
                        <React.Fragment key={groupKey}>
                          <tr className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer transition-all border-l-4 border-l-red-500" onClick={() => toggleGroup(groupKey)}>
                            <td className="px-4 py-4 flex items-center gap-2 text-left">
                               {isExpanded ? <Minus className="w-3 h-3 text-red-500" /> : <Plus className="w-3 h-3 text-indigo-500" />}
                               <span className="font-black text-[10px] text-slate-400 uppercase tracking-widest">Apertura {group.altura} - D{group.densidad}</span>
                            </td>
                            <td className="px-6 py-4 text-left text-indigo-900 font-black uppercase">Subtotal Corrida</td>
                            <td colSpan={4} className="bg-indigo-50/20"></td>
                            <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1006).toLocaleString()}</td>
                            <td className="px-2 py-4 text-cyan-600/50 font-mono">{(group.totalUN1006).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1008).toLocaleString()}</td>
                            <td className="px-2 py-4 text-cyan-600/50 font-mono">{(group.totalUN1008).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1015).toLocaleString()}</td>
                            <td className="px-2 py-4 text-cyan-600/50 font-mono">{(group.totalUN1015).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-indigo-900 bg-indigo-50/50">{group.totalKg.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                            <td className="px-6 py-4 bg-[#cfe2f3]/30 font-mono text-slate-300">—</td>
                            <td className="px-4 py-4 text-center font-black text-indigo-300">100%</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-[#fee2e2]/50">{group.totalPlanUn.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-[#fee2e2]/50">{group.totalPlanKg.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                          </tr>
                          {isExpanded && group.items.map((item, iIdx) => (
                            <tr key={`${groupKey}-${iIdx}`} className="bg-white hover:bg-blue-50/10 transition-colors">
                              <td className="px-4 py-3 border-r border-gray-100 font-mono text-indigo-600 text-left pl-8">{item.material}</td>
                              <td className="px-6 py-3 border-r border-gray-100 text-left text-gray-400 uppercase leading-tight italic text-[10px] truncate max-w-[250px]">{item.descripcion}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-indigo-900 bg-indigo-50/10">{item.looperPesoUN || '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-bold text-indigo-900 bg-indigo-50/10">{item.looperDensidad}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-indigo-900 bg-indigo-50/10">{item.looperEspesor || '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono font-black text-indigo-900 bg-indigo-50/10">{item.looperTRolloMin || '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{item.stock1006 > 0 ? item.stock1006.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-cyan-600 bg-cyan-50/10">{item.stockUN1006 > 0 ? Math.round(item.stockUN1006).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{item.stock1008 > 0 ? item.stock1008.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-cyan-600 bg-cyan-50/10">{item.stockUN1008 > 0 ? Math.round(item.stockUN1008).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{item.stock1015 > 0 ? item.stock1015.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-cyan-600 bg-cyan-50/10">{item.stockUN1015 > 0 ? Math.round(item.stockUN1015).toLocaleString() : '—'}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-bold text-indigo-400">{item.consumoKg.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
                              <td className="px-6 py-3 border-r border-gray-100 bg-[#cfe2f3] font-mono font-black text-indigo-700">{item.peso.toFixed(2)}</td>
                              <td className="px-4 py-3 border-r border-black/10 text-center font-black text-slate-300">{(item.porcentajeNecesidad * 100).toFixed(0)}%</td>
                              <td className="px-4 py-3 border-r border-black/10 text-right font-mono font-black text-red-500 bg-[#fee2e2]/20">{item.planUn.toLocaleString()}</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-red-500 bg-[#fee2e2]/20">{item.planKg.toLocaleString(undefined, { minimumFractionDigits: 1 })}</td>
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

        <TabsContent value="ordenes" className="space-y-6 animate-in fade-in duration-300 text-left">
          <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-gray-100 shadow-xl">
            <div className="flex items-center gap-6 text-left">
              <div className="flex flex-col">
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1.5 flex items-center gap-2">
                  <UserCheck className="w-3 h-3" /> Responsables Corte y Laminado
                </p>
                <div className="flex gap-2">
                  {restriccionesArray.filter(r => (r.nombre_restriccion === 'RESPCTRLPROD' || r.nombre_restriccion === 'Hojas_Rutas_Materiales')).map((r, ri) => (
                    <Badge key={ri} variant="outline" className="text-[10px] font-black bg-slate-50 border-slate-200 px-3 py-0.5 rounded-lg">{r.valor_restriccion}</Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border-collapse font-sans text-[11px] text-center">
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
                    <tr><td colSpan={8} className="py-24 text-slate-300 font-black uppercase tracking-widest text-center italic">No se detectaron órdenes para los criterios aplicados</td></tr>
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

        <TabsContent value="listaMateriales" className="space-y-6 animate-in fade-in duration-300 text-left">
           <MaestroMaterialesExplosionSection ordenes={filteredOrders} />
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300 space-y-10 text-left">
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-2 text-left">
              <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><Activity className="w-4 h-4" /></div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Indicadores Maestro Looper (KPI SAP)</h3>
            </div>
            <Card className="rounded-3xl border border-indigo-100 shadow-xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[600px] relative">
                <table className="w-full border-collapse text-center">
                  <thead className="bg-[#1e293b] text-white sticky top-0 z-10 text-[9px] font-black uppercase tracking-tight border-b border-white/5">
                    <tr>
                      <th className="px-6 py-5 border-r border-white/5 text-left">Material</th>
                      <th className="px-6 py-5 border-r border-white/5 text-left">Descripción</th>
                      <th className="px-6 py-5 border-r border-white/5">Peso UN (Kg)</th>
                      <th className="px-6 py-5 border-r border-white/5">Densidad</th>
                      <th className="px-6 py-5 border-r border-white/5">Espesor</th>
                      <th className="px-6 py-5 border-r border-white/5">T. Rollo (Min)</th>
                      <th className="px-6 py-5">T. Rollo (H)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px] font-black">
                    {kpiLooperData.length === 0 ? (
                      <tr><td colSpan={7} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center italic">Consultando indicadores KPI de SAP...</td></tr>
                    ) : (
                      kpiLooperData.map((row, i) => (
                        <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="px-6 py-4 border-r border-dashed border-gray-100 text-left font-mono text-indigo-600">{String(row.Material || '—')}</td>
                          <td className="px-6 py-4 border-r border-dashed border-gray-100 text-left uppercase text-slate-600">{String(row.Descripcion || '—')}</td>
                          <td className="px-6 py-4 border-r border-dashed border-gray-100 font-mono text-indigo-400">{safeNum(row.PesoUN).toFixed(2)}</td>
                          <td className="px-6 py-4 border-r border-dashed border-gray-100 text-indigo-900">{String(row.Densidad || '—')}</td>
                          <td className="px-6 py-4 border-r border-dashed border-gray-100 font-mono">{safeNum(row.Espesor).toFixed(2)}</td>
                          <td className="px-6 py-4 border-r border-dashed border-gray-100 font-mono text-teal-600">{safeNum(row.TiempoRolloMin).toFixed(2)}</td>
                          <td className="px-6 py-4 font-mono text-slate-400">{safeNum(row.TiempoRolloHora).toFixed(3)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="inventario" className="animate-in fade-in duration-300 space-y-10 text-left">
          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-3 text-left">
                <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg"><Database className="w-4 h-4" /></div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Inventario SAP Año Actual (Auditado)</h3>
              </div>
            </div>
            <Card className="rounded-3xl border border-blue-100 shadow-xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[600px] relative">
                <table className="w-full border-collapse text-center font-sans text-[10px]">
                  <thead className="bg-[#1e293b] text-white sticky top-0 z-10 text-[9px] font-black uppercase tracking-tight border-b border-white/5">
                    <tr>
                      <th className="px-4 py-5 border-r border-white/5">Material</th>
                      <th className="px-6 py-5 border-r border-white/5 text-left">Nombre</th>
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
                  <tbody className="divide-y divide-gray-100 text-[11px] font-black">
                    {filteredInventario.length === 0 ? (
                      <tr><td colSpan={11} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center italic">No hay inventario registrado en los almacenes configurados</td></tr>
                    ) : (
                      filteredInventario.map((row, i) => (
                        <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-3 border-r border-dashed border-gray-100 font-mono text-blue-600">{cleanCode(row.MATERIAL)}</td>
                          <td className="px-6 py-3 border-r border-dashed border-gray-100 text-left uppercase text-slate-600 truncate max-w-[200px]" title={row.NOMBRE}>{row.NOMBRE || '—'}</td>
                          <td className="px-3 py-3 border-r border-dashed border-gray-100">{row.CENTRO}</td>
                          <td className="px-3 py-3 border-r border-dashed border-gray-100 text-indigo-700 font-black bg-indigo-50/30">{row.ALMACEN}</td>
                          <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-slate-400">{row.ANIO}/{row.MES}</td>
                          <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-green-700 bg-green-50/30">{Number(row.LIBREUTILIZACION || 0).toLocaleString()}</td>
                          <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-blue-700 bg-blue-50/30">{Number(row.ENTRASLADO || 0).toLocaleString()}</td>
                          <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono">{Number(row.INSPECCCALIDAD || 0).toLocaleString()}</td>
                          <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-red-600">{Number(row.BLOQUEADO || 0).toLocaleString()}</td>
                          <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-indigo-400">{Number(row.PUNTOPEDIDO || 0).toLocaleString()}</td>
                          <td className="px-3 py-3 text-[10px] text-slate-400">{row.TIPO_MATERIAL} {row.PETICIONBORRADO === 'X' && <span className="text-red-500 font-black">[B]</span>}</td>
                        </tr>
                      ))
                    )}
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
