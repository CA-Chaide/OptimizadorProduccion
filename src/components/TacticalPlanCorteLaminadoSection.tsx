'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  Database,
  Filter,
  Activity,
  PlayCircle,
  UserCheck,
  TrendingUp,
  Info,
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

  useEffect(() => {
    setMounted(true);
    setViewDate(new Date());
    
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
          CANTIDAD_ACUMULADA: getNumProp(row, 'CANTIDAD_ACUMULADA')
        })));
      }
    } catch (err) { 
      addNotification('error', 'Error al consultar la explosión técnica.'); 
    } finally { 
      setIsSearchingBOM(false); 
    }
  };

  const handleProcessResumen = async () => {
    if (filteredOrders.length === 0) return;
    setIsProcessingResumen(true);
    setUnifiedNeeds([]);
    setResumenProgress({ current: 0, total: filteredOrders.length });
    const consolidatedMap = new Map<string, UnifiedNeedRow>();

    try {
      for (let i = 0; i < filteredOrders.length; i++) {
        const order = filteredOrders[i];
        const matCode = String(order.MATERIAL || order.CodMaterial || '').match(/^(\d+)/)?.[1] || '';
        const fullCode = matCode.padStart(18, '0');
        const orderQty = safeNum(order.CANTPROGRAMADA || order.CANTIDAD || 0);

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 500);
          const rawData = response?.data?.data || response?.data || [];
          if (Array.isArray(rawData)) {
            rawData.filter(row => getProp(row, 'CENTRO') !== '2000' && getProp(row, 'DESCRIPCION_COMPONENTE').toUpperCase().includes('LAMINA CILINDRICA')).forEach(comp => {
              const code = getProp(comp, 'COMPONENTE').slice(-8);
              const desc = getProp(comp, 'DESCRIPCION_COMPONENTE').toUpperCase();
              const cantAcum = getNumProp(comp, 'CANTIDAD_ACUMULADA');
              const kgTotal = orderQty * cantAcum;
              
              if (consolidatedMap.has(code)) {
                const ex = consolidatedMap.get(code)!;
                ex.consumoKg += kgTotal;
              } else {
                const pRollo = getPesoPorRollo(code, desc);
                consolidatedMap.set(code, {
                  material: code,
                  descripcion: desc,
                  consumoKg: kgTotal,
                  consumoUn: 0,
                  pesoRollo: pRollo
                });
              }
            });
          }
        } catch (e) {}
        setResumenProgress(prev => ({ ...prev, current: i + 1 }));
      }
      
      const finalArray = Array.from(consolidatedMap.values()).map(row => ({
        ...row,
        consumoUn: row.pesoRollo > 0 ? row.consumoKg / row.pesoRollo : 0
      })).sort((a, b) => b.consumoKg - a.consumoKg);
      
      setUnifiedNeeds(finalArray);
    } finally { setIsProcessingResumen(false); }
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
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-red-600" />
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Módulo de Laminado...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Laminado</h2>
            <p className="text-xs text-gray-500 font-medium">Gestión Táctica de Láminas y Auditoría de Materiales</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-10 bg-gray-100/50 p-1 rounded-xl border border-gray-200 mb-6">
          {[ 
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'resumen', l: 'Resumen Necesidades', i: LayoutDashboard },
            { v: 'listaMateriales', l: 'Lista Materiales (BOOM)', i: ClipboardList },
            { v: 'tiempos', l: 'Tiempos Ensamblado', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-md data-[state=active]:text-red-600">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ordenes" className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-gray-50 p-3 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-red-500/10 rounded-xl text-red-600"><UserCheck className="w-4 h-4" /></div>
              <div>
                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Responsables Críticos</p>
                <div className="flex gap-1.5 mt-0.5">
                  {RESPONSABLES_VALIDOS.map(c => <Badge key={c} variant="outline" className="text-[9px] font-black bg-white border-gray-200">{c}</Badge>)}
                </div>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button className="h-9 px-4 rounded-xl border border-gray-200 bg-white hover:border-red-500/50 flex items-center gap-2 font-bold text-[10px] uppercase shadow-sm transition-all">
                  <Filter className="w-3 h-3 text-red-500" /> {selectedDate === 'all' ? 'Plan Maestro' : selectedDate}
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-4 font-sans text-left" style={{ minHeight: '320px' }}>
                  {viewDate && (
                    <>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xs font-black text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-7 w-7"><ChevronLeft className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-7 w-7"><ChevronRight className="w-4 h-4" /></Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-y-1 text-center mb-3">
                        {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[9px] font-bold text-gray-300 py-1">{d}</div>)}
                        {calendarDays.map((day, idx) => {
                          if (!day) return <div key={idx} />;
                          const dStr = format(day, 'yyyy-MM-dd');
                          const sel = selectedDate === dStr;
                          return (
                            <button key={dStr} onClick={() => setSelectedDate(sel ? 'all' : dStr)} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-red-600 text-white" : "hover:bg-gray-100")}>
                              <span className={cn("text-xs font-bold", !datesWithOrders.has(dStr) && !sel ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                              {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1 w-1 h-1 bg-red-400 rounded-full" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-center font-sans text-[11px]">
                <thead className="bg-[#f8fafc] text-slate-400 border-b border-gray-100 uppercase font-black tracking-widest text-[9px]">
                  <tr>
                    <th className="px-5 py-4 border-r border-gray-50">Orden</th>
                    <th className="px-5 py-4 border-r border-gray-50">Fecha</th>
                    <th className="px-5 py-4 border-r border-gray-50">Material</th>
                    <th className="px-5 py-4 border-r border-gray-100 text-left">Descripción</th>
                    <th className="px-5 py-4 border-r border-gray-50">Cant.</th>
                    <th className="px-5 py-4 border-r border-gray-50">Resp.</th>
                    <th className="px-5 py-4 border-r border-gray-50">Máquina</th>
                    <th className="px-5 py-4">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={8} className="py-20 text-gray-200 font-black uppercase tracking-widest text-center">No hay registros para este filtro</td></tr>
                  ) : (
                    filteredOrders.map((o, i) => {
                      const mat = String(o.MATERIAL || '').match(/^(\d+)/)?.[1]?.slice(-8) || '—';
                      const desc = String(o.MATERIAL || '').replace(/^\d+\s*/, '') || '—';
                      return (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-bold text-slate-800 border-r border-gray-50">{o.ORDENPREVISIONAL || '—'}</td>
                          <td className="px-4 py-3 border-r border-gray-50 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || '—'}</td>
                          <td className="px-4 py-3 font-mono font-black text-red-500 border-r border-gray-50 tracking-tighter">{mat}</td>
                          <td className="px-4 py-3 text-left border-r border-gray-100 truncate max-w-[280px] text-slate-600 font-bold uppercase">{desc}</td>
                          <td className="px-4 py-3 font-black text-slate-900 border-r border-gray-50">{Number(o.CANTIDAD || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 border-r border-gray-50">
                            <Badge variant="outline" className="text-[10px] font-black bg-blue-50 text-blue-700 border-blue-100">{String(o.RESPCONTROLPROD || '—')}</Badge>
                          </td>
                          <td className="px-4 py-3 font-bold text-gray-400 border-r border-gray-50 text-[10px]">{String(o.MAQUINA || o.Maquina || o.RECURSO || '—')}</td>
                          <td className="px-4 py-3 font-bold text-gray-300 text-[10px]">{o.Almacen || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col md:flex-row items-end justify-between gap-4">
             <div className="flex items-center gap-4">
                <div className="bg-[#7f1d1d] text-white p-3 rounded-xl shadow-lg min-w-[160px] text-center border-b-4 border-black/20">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Consumo Diario (Kg)</p>
                    <p className="text-xl font-black font-mono">{totalsUnified.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</p>
                </div>
                <div className="bg-[#7f1d1d] text-white p-3 rounded-xl shadow-lg min-w-[160px] text-center border-b-4 border-black/20">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-1">Total Rollos (Un)</p>
                    <p className="text-xl font-black font-mono">{totalsUnified.un.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
             </div>
             <Button onClick={handleProcessResumen} disabled={isProcessingResumen || filteredOrders.length === 0} className="bg-slate-900 hover:bg-black text-white rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest shadow-xl">
               {isProcessingResumen ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
               Calcular Resumen de Necesidades
             </Button>
          </div>

          {isProcessingResumen && (
            <div className="space-y-3 bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
              <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest text-left">
                <span className="flex items-center gap-2"><Activity className="w-3 h-3" /> Procesando Auditoría de SAP...</span>
                <span>{resumenProgress.current} / {resumenProgress.total} Órdenes</span>
              </div>
              <Progress value={(resumenProgress.current / resumenProgress.total) * 100} className="h-2 bg-indigo-100" />
            </div>
          )}

          {!isProcessingResumen && unifiedNeeds.length > 0 ? (
            <div className="border border-gray-100 rounded-2xl shadow-xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full border-collapse font-sans text-[11px] text-center">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-[#bde0fe] text-slate-800 uppercase font-black tracking-tight text-[10px]">
                      <th className="px-6 py-4 border-r border-gray-100 text-left w-32">Material</th>
                      <th className="px-6 py-4 border-r border-gray-100 text-left">Descripción</th>
                      <th className="px-6 py-4 border-r border-gray-100 w-40 text-center">peso / rollo (Kg)</th>
                      <th className="px-6 py-4 border-r border-gray-100 w-48 text-right bg-orange-100/50">Consumo Actual OF [Kg]</th>
                      <th className="px-6 py-4 w-48 text-right bg-orange-100/50">Consumo Actual OF [Un]</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-bold">
                    {unifiedNeeds.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-6 py-3 border-r border-gray-100 font-mono text-indigo-600 text-left bg-blue-50/5">{row.material}</td>
                        <td className="px-6 py-3 border-r border-gray-100 text-left text-slate-500 uppercase font-bold truncate max-w-[300px]" title={row.descripcion}>{row.descripcion}</td>
                        <td className="px-6 py-3 border-r border-gray-100 font-mono text-green-700 text-center bg-green-50/5">
                          {String(row.pesoRollo)}
                        </td>
                        <td className="px-6 py-3 border-r border-gray-100 font-mono text-slate-800 bg-orange-50/10 text-right">
                          {row.consumoKg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-3 font-mono text-red-600 bg-orange-50/10 text-right">
                          {row.consumoUn.toLocaleString(undefined, { maximumFractionDigits: 1 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white font-black uppercase text-[10px] sticky bottom-0">
                    <tr>
                      <td colSpan={3} className="px-6 py-4 text-right tracking-widest text-slate-400">Total Consolidado del Período:</td>
                      <td className="px-6 py-4 text-right font-mono text-orange-300">{totalsUnified.kg.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</td>
                      <td className="px-6 py-4 text-right font-mono text-orange-300">{totalsUnified.un.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          ) : !isProcessingResumen && (
            <div className="py-24 text-center bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100">
              <Database className="w-16 h-16 text-indigo-100 mx-auto" />
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-4">Calcule las necesidades para visualizar el consolidado estructural</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="listaMateriales" className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-gray-100/50 p-4 rounded-2xl border border-gray-200">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-indigo-600/10 rounded-xl text-indigo-600"><ClipboardList className="w-5 h-5" /></div>
               <div>
                 <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter text-left">Auditoría Estructural de Materiales (BOM)</h3>
                 <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 text-left">Filtrado por: LÁMINA CILÍNDRICA | Excluye: Centro 2000</p>
               </div>
             </div>
             <form onSubmit={handleSearchBOM} className="flex gap-2">
               <div className="relative">
                 <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                 <input type="text" placeholder="FERT Principal..." value={fertBusqueda} onChange={e => setFertBusqueda(e.target.value)} className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold w-48 focus:ring-2 focus:ring-red-500/20" />
               </div>
               <Button type="submit" disabled={isSearchingBOM} className="bg-slate-900 text-white rounded-lg h-9 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg">
                 {isSearchingBOM ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Auditar'}
               </Button>
             </form>
          </div>

          {!isSearchingBOM && bomRows.length > 0 ? (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-md">
                <div className="overflow-x-auto max-h-[550px]">
                  <table className="w-full border-collapse font-sans text-[10px]">
                    <thead className="bg-[#bde0fe] text-slate-800 uppercase font-black tracking-tight sticky top-0 z-20 border-b border-blue-200">
                      <tr>
                        <th className="px-3 py-3 border-r border-blue-100 text-center w-14">NV</th>
                        <th className="px-3 py-3 border-r border-blue-100 w-16">CT</th>
                        <th className="px-3 py-3 border-r border-blue-100">FERT Principal</th>
                        <th className="px-3 py-3 border-r border-blue-100">Material Padre</th>
                        <th className="px-3 py-3 border-r border-blue-100">Componente</th>
                        <th className="px-3 py-3 border-r border-blue-100 text-left">Descripción Componente</th>
                        <th className="px-3 py-3 border-r border-blue-100 text-right w-24">Cant. Unit.</th>
                        <th className="px-3 py-3 text-right w-24">Cant. Acum.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-bold">
                      {paginatedBomRows.map((row, idx) => {
                        const level = parseInt(row.NIVEL);
                        return (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                            <td className="px-3 py-2 border-r border-gray-100 text-center text-slate-400 font-mono text-[9px]">{ ".".repeat(level) }{level}</td>
                            <td className="px-3 py-2 border-r border-gray-100 text-gray-400 text-center">{row.CENTRO}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-indigo-600 tracking-tighter">{row.FERT_PRINCIPAL}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-gray-400 tracking-tighter">{row.MATERIAL_PADRE}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-slate-700 tracking-tighter">{row.COMPONENTE}</td>
                            <td className="px-3 py-2 border-r border-gray-100 text-left uppercase font-black text-slate-600">{row.DESCRIPCION_COMPONENTE}</td>
                            <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-slate-500">{row.CANTIDAD_UNITARIA.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-800">{row.CANTIDAD_ACUMULADA.toFixed(3)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-800 text-white font-black uppercase text-[10px] sticky bottom-0">
                      <tr>
                        <td colSpan={6} className="px-3 py-3 text-right tracking-widest text-slate-400">Total General:</td>
                        <td className="px-3 py-3 text-right font-mono text-blue-300">{bomRows.reduce((s, r) => s + r.CANTIDAD_UNITARIA, 0).toFixed(3)}</td>
                        <td className="px-3 py-3 text-right font-mono text-blue-300">{bomRows.reduce((s, r) => s + r.CANTIDAD_ACUMULADA, 0).toFixed(3)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          ) : !isSearchingBOM && (
            <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100">
              <Database className="w-16 h-16 text-indigo-100 mx-auto" />
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-4">Ingrese un código FERT para auditar su estructura técnica</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300">
           <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[700px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-[#1e293b] text-white sticky top-0 z-10 text-[10px] font-black uppercase tracking-tight border-b border-white/5">
                  <tr>
                    <th className="px-5 py-4 border-r border-white/5 text-left">Material</th>
                    <th className="px-5 py-4 border-r border-white/5 text-left">Descripción Técnica</th>
                    <th className="px-5 py-4 border-r border-white/5">Puesto Trabajo</th>
                    <th className="px-5 py-4 border-r border-white/5">Línea</th>
                    <th className="px-5 py-4 border-r border-white/5 text-teal-400">T. Estándar (Min)</th>
                    <th className="px-5 py-4">Stock Actual</th>
                    <th className="px-5 py-4">Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px] font-bold">
                  {tiemposEnsamblado.length === 0 ? (
                    <tr><td colSpan={7} className="py-24 text-gray-300 font-black uppercase tracking-widest opacity-30 text-center">No hay registros cargados</td></tr>
                  ) : (
                    tiemposEnsamblado.map((t, i) => {
                      const code = String(t.CodMaterial || '').slice(-8);
                      const desc = String(t.Material || t.Descripcion || '—').toUpperCase();
                      return (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 font-mono text-indigo-600 border-r border-dashed border-gray-100 text-left">{code}</td>
                          <td className="px-4 py-4 text-left border-r border-dashed border-gray-100 text-gray-600 truncate max-w-[280px]">{desc}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-100 font-black text-gray-400 uppercase text-[9px]">{t.PuestoTrabajo || '—'}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-100 font-black text-slate-400 uppercase text-[9px]">{t.Linea || '—'}</td>
                          <td className="px-4 py-4 font-mono text-teal-600 border-r border-dashed border-gray-100 bg-teal-50/10">
                            {Number(t.Tiempo || 0).toFixed(4)}
                          </td>
                          <td className="px-4 py-4 text-gray-400 font-mono border-r border-dashed border-gray-100">{(t.StockActual || 0).toLocaleString()}</td>
                          <td className="px-4 py-4 text-gray-900 font-mono font-black">{(t.StockSeguridad || 0).toLocaleString()}</td>
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