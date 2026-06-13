
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
  TrendingUp,
  Info,
  Box,
  Check,
  Database,
  ChevronDown,
  Plus,
  Minus
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

/**
 * MOTOR DE PARSING MEJORADO:
 * Basado en el patrón de catálogo provisto: 204X1.2, 204X1.0, 204X3.5
 * Implementa la inferencia técnica para la Distancia cuando no está en la descripción.
 */
const parseDimensionsEnhanced = (desc: string) => {
  const d = desc.toUpperCase();
  
  // 1. Densidad: D22 -> 22
  const densMatch = d.match(/D(\d+)/);
  const densidad = densMatch ? parseInt(densMatch[1]) : 0;

  // 2. Altura y Espesor: 204X1.2 -> Altura 204, Espesor 1.2
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/);
  const alturaOriginal = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const espesor = dimMatch ? parseFloat(dimMatch[2]) : 0;

  // 3. Ajuste Técnico de Altura (Patrón imagen: 204 en desc -> 206 o 204 en tabla)
  // Generalmente se agregan 2cm de refile si el espesor es bajo
  let alturaFinal = alturaOriginal;
  if (alturaOriginal === 204 && espesor <= 1.2) {
    alturaFinal = 206;
  }

  // 4. Inferencia de Distancia (Patrón imagen: no está en desc, se unifica por catálogo)
  // Basado en el patrón de su imagen: 100 para 1.2, 110 para 1.0, 60 para 3.5
  let distancia = 100; // Valor base
  if (espesor === 1.0) distancia = 110;
  else if (espesor === 3.5) distancia = 60;
  else if (espesor === 1.2) distancia = 100;

  return { densidad, distancia, altura: alturaFinal, espesor };
};

export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanLaminado');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('ordenes');
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
  const [bomPage, setBomPage] = useState(1);
  const [bomRowsPerPage, setBomRowsPerPage] = useState(50);

  const [unifiedNeeds, setUnifiedNeeds] = useState<UnifiedNeedRow[]>([]);
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });
  const [processedSignature, setProcessedSignature] = useState('');
  
  // Control de expansión de grupos
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

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
      
      if (existing) {
        existing.totalQty += orderQty;
      } else {
        materialGroups.set(matCode, { totalQty: orderQty });
      }
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
                    // Formula: (Distancia * Altura * Espesor * Densidad) / 10000
                    const pesoCalculado = (dims.distancia * dims.altura * dims.espesor * dims.densidad) / 10000;
                    
                    // Integración de Stocks desde TiemposEnsamblado
                    const s1006 = tiemposEnsamblado.filter(t => cleanCode(t.CodMaterial) === code && String(t.Almacen || t.ALMACEN) === '1006').reduce((s, t) => s + safeNum(t.StockActual), 0);
                    const s1008 = tiemposEnsamblado.filter(t => cleanCode(t.CodMaterial) === code && String(t.Almacen || t.ALMACEN) === '1008').reduce((s, t) => s + safeNum(t.StockActual), 0);
                    const s1015 = tiemposEnsamblado.filter(t => cleanCode(t.CodMaterial) === code && String(t.Almacen || t.ALMACEN) === '1015').reduce((s, t) => s + safeNum(t.StockActual), 0);

                    consolidatedMap.set(code, {
                      material: code,
                      descripcion: desc,
                      distancia: dims.distancia,
                      altura: dims.altura,
                      espesor: dims.espesor,
                      densidad: dims.densidad,
                      peso: pesoCalculado,
                      consumoKg: kgTotal,
                      consumoUn: 0,
                      stock1006: s1006,
                      stock1008: s1008,
                      stock1015: s1015
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
      })).sort((a, b) => b.consumoKg - a.consumoKg);
      setUnifiedNeeds(finalArray);
      inspector.captureVariable('unifiedNeedsLaminado', finalArray);
    } catch (err) {
      console.error('Error procesando resumen:', err);
    } finally { 
      setIsProcessingResumen(false); 
    }
  }, [inspector, tiemposEnsamblado]);

  useEffect(() => {
    if (activeTab === 'resumen' && filteredOrders.length > 0 && !isProcessingResumen) {
      const signature = `${selectedDate}|${filteredOrders.length}|${filteredOrders[0]?.ORDENPREVISIONAL || ''}`;
      if (signature !== processedSignature) {
        handleProcessResumen(filteredOrders);
        setProcessedSignature(signature);
      }
    }
  }, [activeTab, filteredOrders, selectedDate, isProcessingResumen, processedSignature, handleProcessResumen]);

  // Lógica de agrupamiento por Densidad y Altura
  const groupedNeeds = useMemo(() => {
    const map = new Map<string, { 
      densidad: number; 
      altura: number; 
      items: UnifiedNeedRow[];
      totalKg: number;
      totalUn: number;
      total1006: number;
      total1008: number;
      total1015: number;
    }>();

    unifiedNeeds.forEach(item => {
      const key = `${item.densidad}-${item.altura}`;
      if (!map.has(key)) {
        map.set(key, { 
          densidad: item.densidad, 
          altura: item.altura, 
          items: [], 
          totalKg: 0, 
          totalUn: 0,
          total1006: 0,
          total1008: 0,
          total1015: 0
        });
      }
      const group = map.get(key)!;
      group.items.push(item);
      group.totalKg += item.consumoKg;
      group.totalUn += item.consumoUn;
      group.total1006 += item.stock1006;
      group.total1008 += item.stock1008;
      group.total1015 += item.stock1015;
    });

    return Array.from(map.values()).sort((a, b) => b.totalKg - a.totalKg);
  }, [unifiedNeeds]);

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedGroups(next);
  };

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const centro = String(o.CENTRO || o.Centro || '').trim();
      if (centro === '2000') return;
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

  const handleSearchBOM = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fertBusqueda.trim()) return;
    setIsSearchingBOM(true);
    setBomRows([]);
    setBomPage(1);
    try {
      const fullCode = fertBusqueda.trim().padStart(18, '0');
      const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 5000);
      const rawData = response?.data?.data || response?.data || [];
      if (Array.isArray(rawData)) {
        setBomRows(rawData.filter(row => getProp(row, 'CENTRO') !== '2000' && getProp(row, 'DESCRIPCION_COMPONENTE').toUpperCase().includes('LAMINA CILINDRICA')).map(row => ({
          NIVEL: getProp(row, 'NIVEL'),
          CENTRO: getProp(row, 'CENTRO'),
          FERT_PRINCIPAL: getProp(row, 'FERT_PRINCIPAL'),
          DESCRIPCION_FERT: getProp(row, 'DESCRIPCION_FERT'),
          MATERIAL_PADRE: getProp(row, 'MATERIAL_PADRE'),
          COMPONENTE: getProp(row, 'COMPONENTE'),
          DESCRIPCION_COMPONENTE: getProp(row, 'DESCRIPCION_COMPONENTE'),
          CANTIDAD_UNITARIA: getNumProp(row, 'CANTIDAD_UNITARIA'),
          CANTIDAD_ACUMULADA: getNumProp(row, 'CANTIDAD_ACUMULADA') || getNumProp(row, 'CANTIDAD_UNITARIA')
        })));
      }
    } catch (err) { 
      addNotification('error', 'Error al consultar la explosión técnica.'); 
    } finally { 
      setIsSearchingBOM(false); 
    }
  };

  const totalsUnified = useMemo(() => {
    return unifiedNeeds.reduce((acc, row) => ({
      kg: acc.kg + row.consumoKg,
      un: acc.un + row.consumoUn
    }), { kg: 0, un: 0 });
  }, [unifiedNeeds]);

  const paginatedBomRows = useMemo(() => bomRows.slice((bomPage - 1) * bomRowsPerPage, bomPage * bomRowsPerPage), [bomRows, bomPage, bomRowsPerPage]);

  const looperRecords = useMemo(() => {
    return tiemposEnsamblado.filter(t => {
      const linea = String(t.Linea || '').toLowerCase();
      const puesto = String(t.PuestoTrabajo || '').toLowerCase();
      return (linea.includes('looper') || puesto.includes('looper'));
    });
  }, [tiemposEnsamblado]);

  if (!mounted) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4 text-center">
        <Loader2 className="w-10 h-10 animate-spin text-red-600" />
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Cargando Módulo de Laminado...</p>
      </div>
    );
  }

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
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'resumen', l: 'Resumen Necesidades', i: LayoutDashboard },
            { v: 'listaMateriales', l: 'Auditoría BOM', i: ClipboardList },
            { v: 'tiempos', l: 'Procesos Looper', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-red-600 rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ordenes" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-gray-100 shadow-xl">
            <div className="flex items-center gap-6 text-left">
              <div className="flex flex-col">
                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1.5 flex items-center gap-2">
                  <UserCheck className="w-3 h-3" /> Responsables Habilitados (Laminado)
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
                          <td className="px-6 py-4 border-r border-gray-50 font-mono text-[9px] text-slate-400">{o.FECHAINICIO || '—'}</td>
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

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <Card className="p-5 border-none shadow-xl bg-[#0f172a] text-white flex flex-col items-center justify-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Consolidado Total (Kg)</p>
                <p className="text-3xl font-black font-mono text-indigo-400">{totalsUnified.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
             </Card>
             <Card className="p-5 border-none shadow-xl bg-[#0f172a] text-white flex flex-col items-center justify-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total Rollos (Un)</p>
                <p className="text-3xl font-black font-mono text-emerald-400">{totalsUnified.un.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
             </Card>
             <Card className="p-5 border-none shadow-xl bg-white border border-gray-100 flex flex-col items-center justify-center col-span-2">
                {isProcessingResumen ? (
                  <div className="w-full px-10 space-y-3 text-center">
                    <div className="flex justify-between text-[10px] font-black uppercase text-indigo-600">
                      <span>Procesando Ingeniería...</span>
                      <span>{resumenProgress.current} / {resumenProgress.total}</span>
                    </div>
                    <Progress value={(resumenProgress.current / resumenProgress.total) * 100} className="h-2.5 bg-indigo-50" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <p className="text-sm font-black text-slate-700 uppercase tracking-tighter">Auditoría Técnica por Dimensiones</p>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1 flex items-center gap-1.5">
                      <Check className="w-3 h-3" /> Cálculos sincronizados SAP multinivel
                    </p>
                  </div>
                )}
             </Card>
          </div>

          <div className="border-2 border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse font-sans text-[11px] text-center">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-[#ffff00] text-black uppercase font-black tracking-tighter text-[11px] border-b-2 border-black/10">
                    <th className="px-4 py-4 border-r border-black/5 text-left w-32">codigo</th>
                    <th className="px-6 py-4 border-r border-black/5 text-left">descripción</th>
                    <th className="px-4 py-4 border-r border-black/5">distancia</th>
                    <th className="px-4 py-4 border-r border-black/5">altura</th>
                    <th className="px-4 py-4 border-r border-black/5">espesor</th>
                    <th className="px-4 py-4 border-r border-black/5">Densidad</th>
                    <th className="px-6 py-4 border-r border-black/5 bg-[#b4d4ea]">peso</th>
                    <th className="px-3 py-4 border-r border-black/5">Stock 1006 (UN)</th>
                    <th className="px-3 py-4 border-r border-black/5">Stock 1008 (UN)</th>
                    <th className="px-3 py-4 border-r border-black/5">Stock 1015 (UN)</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right font-black">Consumo OF [Kg]</th>
                    <th className="px-4 py-4 text-right font-black">Consumo OF [Un]</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {groupedNeeds.map((group, gIdx) => {
                    const groupKey = `${group.densidad}-${group.altura}`;
                    const isExpanded = expandedGroups.has(groupKey);
                    
                    return (
                      <React.Fragment key={groupKey}>
                        {/* Fila de Subtotal / Grupo */}
                        <tr className="bg-slate-50/80 hover:bg-slate-100 cursor-pointer transition-all border-l-4 border-l-red-500" onClick={() => toggleGroup(groupKey)}>
                          <td className="px-4 py-4 flex items-center gap-2">
                             {isExpanded ? <Minus className="w-3 h-3 text-red-500" /> : <Plus className="w-3 h-3 text-indigo-500" />}
                             <span className="font-black text-[10px] text-slate-400 uppercase tracking-widest">SUBTOTAL</span>
                          </td>
                          <td className="px-6 py-4 text-left text-indigo-900 font-black uppercase">
                            Agrupación: D{group.densidad} | H{group.altura}
                            <span className="ml-3 text-[9px] font-bold text-slate-400">({group.items.length} materiales)</span>
                          </td>
                          <td className="px-4 py-4 text-slate-300 font-mono">VAR</td>
                          <td className="px-4 py-4 text-indigo-700 font-mono font-black">{group.altura}</td>
                          <td className="px-4 py-4 text-slate-300 font-mono">VAR</td>
                          <td className="px-4 py-4 text-indigo-700 font-mono font-black">{group.densidad}</td>
                          <td className="px-6 py-4 bg-[#cfe2f3]/30 font-mono text-slate-300">—</td>
                          <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1006).toLocaleString()}</td>
                          <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1008).toLocaleString()}</td>
                          <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1015).toLocaleString()}</td>
                          <td className="px-4 py-4 text-right font-mono font-black text-indigo-900 bg-indigo-50/50">
                            {group.totalKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </td>
                          <td className="px-4 py-4 text-right font-mono font-black text-emerald-700 bg-emerald-50/30">
                            {group.totalUn.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                        
                        {/* Filas de Detalle (si está expandido) */}
                        {isExpanded && group.items.map((row, iIdx) => (
                          <tr key={`${groupKey}-${iIdx}`} className="bg-white hover:bg-blue-50/10 transition-colors animate-in slide-in-from-top-1 duration-200">
                            <td className="px-4 py-3 border-r border-gray-100 font-mono text-indigo-600 text-left pl-8">{row.material}</td>
                            <td className="px-6 py-3 border-r border-gray-100 text-left text-gray-400 uppercase leading-tight italic text-[10px]">{row.descripcion}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-slate-400 font-mono">{row.distancia}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-slate-400 font-mono">{row.altura}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-slate-400 font-mono">{row.espesor.toFixed(1)}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-slate-400 font-mono">{row.densidad}</td>
                            <td className="px-6 py-3 border-r border-gray-100 bg-[#cfe2f3] font-mono font-black text-indigo-700">{row.peso.toFixed(2)}</td>
                            <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{row.stock1006 || '—'}</td>
                            <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{row.stock1008 || '—'}</td>
                            <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{row.stock1015 || '—'}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-bold text-indigo-400">{row.consumoKg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{row.consumoUn.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                {unifiedNeeds.length > 0 && (
                  <tfoot className="bg-slate-900 text-white font-black uppercase text-[10px] sticky bottom-0 z-30">
                    <tr>
                      <td colSpan={10} className="px-6 py-4 text-right tracking-widest text-slate-500 uppercase">Consolidado Total Planificado:</td>
                      <td className="px-4 py-4 text-right font-mono text-indigo-300 text-sm">{totalsUnified.kg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KG</td>
                      <td className="px-4 py-4 text-right font-mono text-emerald-300 text-sm">{totalsUnified.un.toLocaleString(undefined, { maximumFractionDigits: 0 })} UN</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
          
          <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600" />
            <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
              Nota: Use los botones + / - para auditar el detalle de materiales por cada especificación de Densidad y Altura.
            </p>
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
             <form onSubmit={handleSearchBOM} className="flex gap-3">
               <div className="relative group">
                 <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-300 group-hover:text-red-500 transition-colors" />
                 <input type="text" placeholder="Código FERT..." value={fertBusqueda} onChange={e => setFertBusqueda(e.target.value)} className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-black w-56 focus:ring-4 focus:ring-red-500/10 focus:bg-white transition-all outline-none" />
               </div>
               <Button type="submit" disabled={isSearchingBOM} className="bg-slate-900 text-white rounded-2xl h-10 px-8 text-[10px] font-black uppercase tracking-widest shadow-xl hover:bg-black transition-all">
                 {isSearchingBOM ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Auditar'}
               </Button>
             </form>
          </div>

          {!isSearchingBOM && bomRows.length > 0 ? (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-3xl overflow-hidden bg-white shadow-xl">
                <div className="overflow-x-auto max-h-[550px]">
                  <table className="w-full border-collapse font-sans text-[10px]">
                    <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-widest sticky top-0 z-10 border-b border-slate-100">
                      <tr>
                        <th className="px-5 py-4 border-r border-slate-50 text-center w-16">NV</th>
                        <th className="px-5 py-4 border-r border-slate-50">FERT Principal</th>
                        <th className="px-5 py-4 border-r border-slate-50">Material Padre</th>
                        <th className="px-5 py-4 border-r border-slate-50">Componente</th>
                        <th className="px-5 py-4 border-r border-slate-100 text-left">Descripción del Componente</th>
                        <th className="px-5 py-4 border-r border-slate-50 text-right w-28">Cant. Unit.</th>
                        <th className="px-5 py-4 text-right w-28">Cant. Acum.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {paginatedBomRows.map((row, idx) => {
                        const level = parseInt(row.NIVEL);
                        return (
                          <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                            <td className={cn(
                              "px-5 py-3 border-r border-gray-100 text-center font-mono text-[10px]",
                              level === 1 ? "bg-red-50 text-red-600" : "text-slate-300"
                            )}>{ ".".repeat(level) }{level}</td>
                            <td className="px-5 py-3 border-r border-gray-100 font-mono text-indigo-600 tracking-tighter">{row.FERT_PRINCIPAL}</td>
                            <td className="px-5 py-3 border-r border-gray-100 font-mono text-slate-400 tracking-tighter">{row.MATERIAL_PADRE}</td>
                            <td className="px-5 py-3 border-r border-gray-100 font-mono text-slate-700 tracking-tighter text-sm">{row.COMPONENTE}</td>
                            <td className="px-5 py-3 border-r border-gray-100 text-left uppercase font-black text-slate-600 tracking-tight leading-tight">{row.DESCRIPCION_COMPONENTE}</td>
                            <td className="px-5 py-3 border-r border-gray-100 text-right font-mono text-slate-400">{row.CANTIDAD_UNITARIA.toFixed(3)}</td>
                            <td className="px-5 py-3 text-right font-mono text-slate-900 bg-slate-50/50">{row.CANTIDAD_ACUMULADA.toFixed(3)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between px-2">
                 <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Mostrando {paginatedBomRows.length} de {bomRows.length} registros</p>
                 <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setBomPage(prev => Math.max(1, prev - 1))} disabled={bomPage === 1} className="rounded-xl">Anterior</Button>
                    <Button variant="outline" size="sm" onClick={() => setBomPage(prev => Math.min(Math.ceil(bomRows.length / bomRowsPerPage), prev + 1))} disabled={bomPage * bomRowsPerPage >= bomRows.length} className="rounded-xl">Siguiente</Button>
                 </div>
              </div>
            </div>
          ) : !isSearchingBOM && (
            <div className="py-24 text-center bg-gray-50/30 rounded-[3rem] border-2 border-dashed border-gray-100">
              <Database className="w-16 h-16 text-indigo-100 mx-auto" />
              <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-6">Ingrese un código FERT de Colchón o Panel para auditar su estructura técnica</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300 space-y-10">
          <div className="space-y-4">
            <div className="flex items-center gap-3 px-2">
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
                      <th className="px-6 py-5 text-red-300">Stock Seg.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-[11px] font-black">
                    {looperRecords.length === 0 ? (
                      <tr><td colSpan={8} className="py-24 text-center text-slate-300 uppercase tracking-widest opacity-40">No se encontraron registros Looper</td></tr>
                    ) : (
                      looperRecords.map((t, i) => {
                        const matCode = cleanCode(t.CodMaterial);
                        const desc = String(t.Material || t.Descripcion || '—').toUpperCase();
                        return (
                          <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-6 py-4 font-mono text-indigo-600 border-r border-dashed border-gray-100 text-left text-sm">{matCode}</td>
                            <td className="px-6 py-4 text-left border-r border-dashed border-gray-100 text-slate-600 uppercase leading-tight max-w-[300px] truncate">{desc}</td>
                            <td className="px-6 py-4 border-r border-dashed border-gray-100 font-black text-indigo-400 uppercase text-[9px] bg-indigo-50/10">{t.Linea || '—'}</td>
                            <td className="px-6 py-4 border-r border-dashed border-gray-100">
                               <Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-200 font-mono px-2 py-0">{t.RespControlProd || t.RESP_CONTROL_PROD || '—'}</Badge>
                            </td>
                            <td className="px-6 py-4 border-r border-dashed border-gray-100 text-slate-400 font-bold">{t.Almacen || t.ALMACEN || '—'}</td>
                            <td className="px-6 py-4 font-mono text-teal-600 border-r border-dashed border-gray-100 bg-teal-50/10 text-sm">
                              {Number(t.Tiempo || 0).toFixed(4)}
                            </td>
                            <td className="px-6 py-4 text-slate-400 font-mono border-r border-dashed border-gray-100">{(t.StockActual || 0).toLocaleString()}</td>
                            <td className="px-6 py-4 text-red-400 font-mono font-black border-r border-dashed border-gray-100">{(t.StockSeguridad || 0).toLocaleString()}</td>
                          </tr>
                        );
                      })
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
