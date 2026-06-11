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
  Check
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
  densidad: string;
  largoMtrs: number;
  ancho: number;
  espesor: number;
  consumoKg: number;
  consumoUn: number; 
  pesoRollo: number;
}

const RESPONSABLES_VALIDOS = ["009", "018", "022", "014", "042", "043"];

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

const getPesoPorRollo = (materialCode: string, descripcion: string): number => {
  const desc = descripcion.toUpperCase();
  const code = materialCode.toUpperCase();
  if (desc.includes('D12') || code.includes('D12')) return 12;
  if (desc.includes('D18') || code.includes('D18')) return 18;
  if (desc.includes('D20') || code.includes('D20')) return 20;
  if (desc.includes('D24') || code.includes('D24')) return 24;
  if (desc.includes('D28') || code.includes('D28')) return 28;
  if (desc.includes('D30') || code.includes('D30')) return 30;
  if (desc.includes('D35') || code.includes('D35')) return 35;
  if (desc.includes('D40') || code.includes('D40')) return 40;
  if (desc.includes('D50') || code.includes('D50')) return 50;
  return 35; 
};

// Parser técnico para extraer dimensiones de la descripción de SAP
const parseDimensions = (desc: string) => {
  const d = desc.toUpperCase();
  
  // 1. Densidad (ej: D22, D18)
  const densMatch = d.match(/D(\d+)/);
  const densidad = densMatch ? `d${densMatch[1]}` : '—';
  
  // 2. Ancho x Espesor (ej: 214x1.2 o 214*1.2)
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/);
  const ancho = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const espesor = dimMatch ? parseFloat(dimMatch[2]) : 0;
  
  // 3. Largo (mtrs) (ej: 100M o 100 M)
  const largoMatch = d.match(/(\d+)\s*M/);
  const largoMtrs = largoMatch ? parseInt(largoMatch[1]) : 100; // Por defecto 100m si no se encuentra
  
  return { densidad, ancho, espesor, largoMtrs };
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
          serviciosService.OrdenesProvisionalesPaginados(1, 20000),
          serviciosService.getTiemposEnsamblado(1, 15000)
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
    return ordenes.filter(o => {
      const centro = String(o.CENTRO || o.Centro || '').trim();
      if (centro === '2000') return false; 
      const responsable = String(o.RESPCONTROLPROD || o.RespControlProd || o.RESP_CONTROL_PROD || '').trim();
      if (!RESPONSABLES_VALIDOS.includes(responsable)) return false;
      if (selectedDate !== 'all') {
        const dateRaw = String(o.FECHAINICIO || o.FECHA || '').trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        if (date !== selectedDate) return false;
      }
      return true;
    });
  }, [ordenes, selectedDate]);

  const handleProcessResumen = useCallback(async (ordersToProcess: any[]) => {
    if (ordersToProcess.length === 0) {
      setUnifiedNeeds([]);
      return;
    }
    
    setIsProcessingResumen(true);
    // Agrupación inteligente: Consolidar por código de material único antes de explosionar
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
                  const code = getProp(comp, 'COMPONENTE').slice(-8);
                  const desc = getProp(comp, 'DESCRIPCION_COMPONENTE').toUpperCase();
                  const cantAcum = getNumProp(comp, 'CANTIDAD_ACUMULADA') || getNumProp(comp, 'CANTIDAD_UNITARIA');
                  const kgTotal = totalQtyForMaterial * cantAcum;
                  
                  const dims = parseDimensions(desc);
                  const key = `${dims.densidad}|${dims.largoMtrs}|${dims.ancho}|${dims.espesor}`;

                  if (consolidatedMap.has(key)) {
                    const ex = consolidatedMap.get(key)!;
                    ex.consumoKg += kgTotal;
                  } else {
                    const pRollo = getPesoPorRollo(code, desc);
                    consolidatedMap.set(key, {
                      material: code,
                      descripcion: desc,
                      densidad: dims.densidad,
                      largoMtrs: dims.largoMtrs,
                      ancho: dims.ancho,
                      espesor: dims.espesor,
                      consumoKg: kgTotal,
                      consumoUn: 0,
                      pesoRollo: pRollo
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
        consumoUn: row.pesoRollo > 0 ? row.consumoKg / row.pesoRollo : 0
      })).sort((a, b) => b.consumoKg - a.consumoKg);
      setUnifiedNeeds(finalArray);
      inspector.captureVariable('unifiedNeedsLaminado', finalArray);
    } catch (err) {
      console.error('Error procesando resumen:', err);
    } finally { 
      setIsProcessingResumen(false); 
    }
  }, [inspector]);

  // Gatillo automático para iniciar explosión al cambiar filtros o tab
  useEffect(() => {
    if (activeTab === 'resumen' && filteredOrders.length > 0 && !isProcessingResumen) {
      const signature = `${selectedDate}|${filteredOrders.length}|${filteredOrders[0]?.ORDENPREVISIONAL || ''}`;
      if (signature !== processedSignature) {
        handleProcessResumen(filteredOrders);
        setProcessedSignature(signature);
      }
    }
  }, [activeTab, filteredOrders, selectedDate, isProcessingResumen, processedSignature, handleProcessResumen]);

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const centro = String(o.CENTRO || o.Centro || '').trim();
      if (centro === '2000') return;
      const resp = String(o.RESPCONTROLPROD || o.RespControlProd || '').trim();
      if (!RESPONSABLES_VALIDOS.includes(resp)) return;
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
            { v: 'tiempos', l: 'Tiempos Ensamblado', i: Clock }
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
                  <UserCheck className="w-3 h-3" /> Responsables Críticos
                </p>
                <div className="flex gap-2">
                  {RESPONSABLES_VALIDOS.map(c => <Badge key={c} variant="outline" className="text-[10px] font-black bg-slate-50 border-slate-200 px-3 py-0.5 rounded-lg">{c}</Badge>)}
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
                <thead className="bg-[#f8fafc] text-slate-400 border-b border-gray-100 uppercase font-black tracking-widest text-[9px]">
                  <tr>
                    <th className="px-6 py-5 border-r border-gray-50">Orden</th>
                    <th className="px-6 py-5 border-r border-gray-50">Fecha Inicio</th>
                    <th className="px-6 py-5 border-r border-gray-50">Código FERT</th>
                    <th className="px-6 py-5 border-r border-gray-100 text-left">Descripción Técnica del Producto</th>
                    <th className="px-6 py-5 border-r border-gray-50">Cantidad</th>
                    <th className="px-6 py-5 border-r border-gray-50">RESP</th>
                    <th className="px-6 py-5 border-r border-gray-50">Máquina</th>
                    <th className="px-6 py-5">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center">Sin registros para el filtro seleccionado</td></tr>
                  ) : (
                    filteredOrders.map((o, i) => {
                      const matCode = String(o.MATERIAL || '').match(/^(\d+)/)?.[1]?.slice(-8) || '—';
                      const description = String(o.MATERIAL || '').replace(/^\d+\s*/, '') || o.NOMBRE || '—';
                      return (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-800 border-r border-gray-50">{o.ORDENPREVISIONAL || '—'}</td>
                          <td className="px-6 py-4 border-r border-gray-50 font-mono text-[9px] text-slate-400">{o.FECHAINICIO || '—'}</td>
                          <td className="px-6 py-4 font-mono font-black text-red-600 border-r border-gray-50 tracking-tighter text-sm">{matCode}</td>
                          <td className="px-6 py-4 text-left border-r border-gray-100 text-slate-600 font-black uppercase leading-tight max-w-[350px]">
                            {description}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 font-mono text-sm">
                            {Number(o.CANTIDAD || 0).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 border-r border-gray-50">
                            <Badge variant="outline" className="text-[10px] font-black bg-blue-50 text-blue-700 border-blue-100">{String(o.RESPCONTROLPROD || '—')}</Badge>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-400 border-r border-gray-50 text-[10px] uppercase">
                            {String(o.MAQUINA || o.Maquina || o.RECURSO || '—')}
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-200 text-[10px]">{o.Almacen || o.ALMACEN || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="resumen" className="space-y-8 animate-in fade-in duration-300">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             <Card className="p-5 border-none shadow-xl bg-[#0f172a] text-white flex flex-col items-center justify-center border-b-4 border-black/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Total Consumo Diario</p>
                <p className="text-3xl font-black font-mono text-indigo-400">{totalsUnified.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase mt-1.5">Kilogramos (KG)</p>
             </Card>
             
             <Card className="p-5 border-none shadow-xl bg-[#0f172a] text-white flex flex-col items-center justify-center border-b-4 border-black/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2">Estimación Logística</p>
                <p className="text-3xl font-black font-mono text-emerald-400">{totalsUnified.un.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase mt-1.5">Rollos Totales (UN)</p>
             </Card>

             <Card className="p-5 border-none shadow-xl bg-white border border-gray-100 flex flex-col items-center justify-center col-span-2">
                <div className="flex items-center gap-3 mb-2">
                   <div className="p-2 bg-red-100 rounded-xl text-red-600"><TrendingUp className="w-4 h-4" /></div>
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estado de la Auditoría</p>
                </div>
                {isProcessingResumen ? (
                  <div className="space-y-3 w-full px-6">
                    <div className="flex justify-between text-[10px] font-black uppercase text-indigo-600">
                      <span>Procesando...</span>
                      <span>{resumenProgress.current} / {resumenProgress.total}</span>
                    </div>
                    <Progress value={(resumenProgress.current / resumenProgress.total) * 100} className="h-2.5 bg-indigo-50" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <p className="text-sm font-black text-slate-700 uppercase tracking-tighter">Explosión Técnica Completada</p>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase mt-1 flex items-center gap-1.5">
                      <Check className="w-3 h-3" /> Datos sincronizados con SAP
                    </p>
                  </div>
                )}
             </Card>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between px-2">
               <h3 className="text-xs font-black uppercase flex items-center gap-2 tracking-widest text-slate-800">
                 <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" /> Consolidado Técnico de Necesidades
               </h3>
               <Button 
                onClick={() => handleProcessResumen(filteredOrders)} 
                disabled={isProcessingResumen} 
                variant="outline" 
                className="rounded-xl h-9 px-6 text-[10px] font-black uppercase tracking-widest border-slate-200 hover:bg-slate-50"
               >
                 <Activity className="w-3.5 h-3.5 mr-2" /> Forzar Recálculo
               </Button>
            </div>

            <div className="border border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[600px] relative">
                <table className="w-full border-collapse font-sans text-[11px] text-center">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-yellow-400 text-black uppercase font-black tracking-tighter text-[11px] border-b border-black/10">
                      <th className="px-8 py-4 border-r border-black/5 text-left w-32">Densidad</th>
                      <th className="px-8 py-4 border-r border-black/5 text-center w-32">Largo (mtrs)</th>
                      <th className="px-8 py-4 border-r border-black/5 text-center w-32">Ancho</th>
                      <th className="px-8 py-4 border-r border-black/5 text-center w-32">espesor</th>
                      <th className="px-8 py-4 border-r border-black/5 text-right bg-black/5 w-40">Necesidad (Kg)</th>
                      <th className="px-8 py-4 text-right bg-black/5 w-40">Equivalente (Un)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {unifiedNeeds.length === 0 && !isProcessingResumen ? (
                       <tr><td colSpan={6} className="py-24 text-center text-slate-300 font-black uppercase tracking-widest opacity-40">No hay datos calculados</td></tr>
                    ) : (
                      unifiedNeeds.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/80 transition-all group">
                          <td className="px-8 py-4 border-r border-gray-100 font-mono text-indigo-600 text-left bg-slate-50/50 font-black">
                            {row.densidad}
                          </td>
                          <td className="px-8 py-4 border-r border-gray-100 text-center text-slate-700 font-black">
                            {row.largoMtrs}
                          </td>
                          <td className="px-8 py-4 border-r border-gray-100 text-center text-slate-700 font-black">
                            {row.ancho}
                          </td>
                          <td className="px-8 py-4 border-r border-gray-100 text-center text-slate-700 font-black">
                            {row.espesor.toFixed(1)}
                          </td>
                          <td className="px-8 py-4 border-r border-gray-100 font-mono text-slate-900 bg-indigo-50/30 text-right font-black text-sm">
                            {row.consumoKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-8 py-4 font-mono text-emerald-600 bg-emerald-50/30 text-right font-black text-sm">
                            {row.consumoUn.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {unifiedNeeds.length > 0 && (
                    <tfoot className="bg-slate-900 text-white font-black uppercase text-[10px] sticky bottom-0">
                      <tr>
                        <td colSpan={4} className="px-8 py-5 text-right tracking-widest text-slate-500">Consolidado Total del Período:</td>
                        <td className="px-8 py-5 text-right font-mono text-indigo-300 text-sm">{totalsUnified.kg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} KG</td>
                        <td className="px-8 py-5 text-right font-mono text-emerald-300 text-sm">{totalsUnified.un.toLocaleString(undefined, { maximumFractionDigits: 0 })} UN</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
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

        <TabsContent value="tiempos" className="animate-in fade-in duration-300">
           <Card className="rounded-3xl border border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[700px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-[#1e293b] text-white sticky top-0 z-10 text-[10px] font-black uppercase tracking-tight border-b border-white/5">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5 text-left">Material</th>
                    <th className="px-6 py-5 border-r border-white/5 text-left">Descripción Técnica</th>
                    <th className="px-6 py-5 border-r border-white/5">Línea</th>
                    <th className="px-6 py-5 border-r border-white/5 text-teal-400">Estándar (Min)</th>
                    <th className="px-6 py-5">Stock Actual</th>
                    <th className="px-6 py-5">Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px] font-black">
                  {tiemposEnsamblado.length === 0 ? (
                    <tr><td colSpan={7} className="py-24 text-slate-200 font-black uppercase tracking-widest opacity-40 text-center">Cargando base de tiempos...</td></tr>
                  ) : (
                    tiemposEnsamblado.map((t, i) => {
                      const matCode = String(t.CodMaterial || '').match(/^(\d+)/)?.[1]?.slice(-8) || '—';
                      const desc = String(t.Material || t.Descripcion || '—').toUpperCase();
                      return (
                        <tr key={i} className="hover:bg-slate-50/5 transition-colors">
                          <td className="px-6 py-4 font-mono text-indigo-600 border-r border-dashed border-gray-100 text-left text-sm">{matCode}</td>
                          <td className="px-6 py-4 text-left border-r border-dashed border-gray-100 text-slate-600 uppercase leading-tight max-w-[300px] truncate">{desc}</td>
                          <td className="px-6 py-4 border-r border-dashed border-gray-100 font-black text-slate-400 uppercase text-[9px]">{t.Linea || '—'}</td>
                          <td className="px-6 py-4 font-mono text-teal-600 border-r border-dashed border-gray-100 bg-teal-50/10 text-sm">
                            {Number(t.Tiempo || 0).toFixed(4)}
                          </td>
                          <td className="px-6 py-4 text-slate-400 font-mono border-r border-dashed border-gray-100">{(t.StockActual || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 text-slate-900 font-mono font-black">{(t.StockSeguridad || 0).toLocaleString()}</td>
                        </tr>
                      );
                    })
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
