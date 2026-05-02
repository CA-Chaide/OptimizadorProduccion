'use client';

/**
 * @fileOverview Módulo de Planificación Táctica para Formulación.
 * 
 * - Lista Necesidades: Unión de Órdenes y Tiempos por CodMaterial con filtrado por Restricciones.
 * - Restricciones: Filtradas para el Centro 1000 (heredadas de Corte y Laminado).
 * - Diseño: Industrial Sans Serif / Monospace.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  FlaskConical, Users, Lock, Package, Loader2, Clock, 
  LayoutDashboard, Calendar as CalendarIcon, ChevronLeft, ChevronRight, 
  Filter, ShieldCheck, ClipboardList, ChevronsLeft, ChevronsRight,
  ListChecks, Info
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// --- CONSTANTES TÉCNICAS ---
const MACHINE_RADIO_CM = 350;    
const SECONDS_LOAD_BLOCK = 300;   
const SECONDS_REPETITION = 45;    
const SECONDS_CART_SWAP = 60;     

const getParam = (restrictions: Restriccion[], key: string, defaultValue: number) => {
  const r = restrictions.find(res => res.nombre_restriccion.toUpperCase() === key.toUpperCase());
  if (r) {
    return { value: parseFloat(r.valor_restriccion) || defaultValue, isOverridden: true };
  }
  return { value: defaultValue, isOverridden: false };
};

const CapacityEvaluationPanel = ({ 
  plannedHours, 
  restrictions, 
  resources 
}: { 
  plannedHours: number, 
  restrictions: Restriccion[], 
  resources: { id: string, name: string, defaultT1?: number, defaultT2?: number }[]
}) => {
  const rendParam = getParam(restrictions, 'RENDIMIENTO_PROCESO', 70);
  const shiftHoursParam = getParam(restrictions, 'HORAS_TRABAJO', 9);
  const maxExtrasParam = getParam(restrictions, 'MAX_EXTRAS_HORAS', 2);
  const parityParam = getParam(restrictions, 'PARO_PROGRAMADO', 0.68); 

  const processedResources = resources.map(m => {
    const t1 = getParam(restrictions, `${m.id}_T1`, m.defaultT1 ?? shiftHoursParam.value);
    const t2 = getParam(restrictions, `${m.id}_T2`, m.defaultT2 ?? 8);
    const p = getParam(restrictions, `${m.id}_PARO`, parityParam.value);
    const baseHours = t1.value + t2.value - (p.value * 2);
    return { ...m, t1, t2, p, maxExtras: maxExtrasParam, baseHours };
  });

  const totalBaseHours = processedResources.reduce((acc, m) => acc + m.baseHours, 0);
  const netCapacityBase = totalBaseHours * (rendParam.value / 100);
  const netCapacityMax = (totalBaseHours + (resources.length * maxExtrasParam.value)) * (rendParam.value / 100);
  
  const capacitySaldo = netCapacityBase - plannedHours;
  
  let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
  if (plannedHours > netCapacityMax) status = 'CRITICAL';
  else if (plannedHours > netCapacityBase) status = 'WARNING';

  return (
    <div className="mb-8 text-left font-sans animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="bg-teal-900 text-white p-3 rounded-t-2xl flex justify-between items-center shadow-lg px-6 border-b-2 border-teal-500">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-teal-300" />
          <span className="text-xs font-black tracking-widest uppercase">Evaluación de Capacidad Neta - Formulación</span>
        </div>
        <Badge className={cn("font-black text-[10px]", status === 'NORMAL' ? "bg-green-500" : status === 'WARNING' ? "bg-amber-500" : "bg-red-500")}>
          {status === 'NORMAL' ? 'CAPACIDAD OK' : status === 'WARNING' ? 'REQUERIDAS EXTRAS' : 'SOBRECARGA'}
        </Badge>
      </div>

      <div className="bg-white border-x border-b border-gray-200 rounded-b-2xl shadow-xl overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 divide-x divide-gray-100">
           <div className="p-4 flex flex-col items-center justify-center bg-gray-50/30">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">Rendimiento Técnico</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-slate-800 font-mono">{rendParam.value}%</span>
                {rendParam.isOverridden && <ShieldCheck className="w-4 h-4 text-blue-500" />}
              </div>
           </div>
           <div className="p-4 flex flex-col items-center justify-center bg-teal-50/20">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">Capacidad Neta (Base)</span>
              <span className="text-2xl font-black text-teal-600 font-mono">{netCapacityBase.toFixed(1)}h</span>
           </div>
           <div className="p-4 flex flex-col items-center justify-center bg-amber-50/10">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">Carga Programada</span>
              <span className="text-2xl font-black text-amber-600 font-mono">{plannedHours.toFixed(1)}h</span>
           </div>
           <div className={cn("p-4 flex flex-col items-center justify-center", capacitySaldo < 0 ? "bg-red-50" : "bg-green-50")}>
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">Saldo Disponible</span>
              <span className={cn("text-2xl font-black font-mono", capacitySaldo < 0 ? "text-red-600" : "text-green-600")}>
                {capacitySaldo.toFixed(1)}h
              </span>
           </div>
        </div>
      </div>
    </div>
  );
};

export const TacticalPlanFormulacionSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanFormulacion');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [viewDate, setViewDate] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');

  // Estados para Lista de Materiales (Maestro Brutos)
  const [brutosData, setBrutosData] = useState<any[]>([]);
  const [brutosTotal, setBrutosTotal] = useState(0);
  const [brutosPage, setBrutosPage] = useState(1);
  const [brutosRowsPerPage, setBrutosRowsPerPage] = useState(20);
  const [brutosLoading, setBrutosLoading] = useState(false);
  const [brutosColumns, setBrutosColumns] = useState<string[]>([]);
  const [availableTypes, setAvailableTypes] = useState<string[]>([]);

  const scrollNecesidades = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

  const fetchBrutosData = useCallback(async (page: number, rows: number) => {
    setBrutosLoading(true);
    try {
      const res = await serviciosService.getMaterialesBrutosPorMaterialMateriaPrima(page, rows);
      if (res && res.data) {
        const dataArray = Array.isArray(res.data) ? res.data : (res.data.data || [res.data]);
        const types = new Set<string>();
        dataArray.forEach((m: any) => {
          const t = String(m.TIPO_MATERIAL || m.tipomaterial || m.TipoMaterial || '').trim().toUpperCase();
          if (t) types.add(t);
        });
        setAvailableTypes(Array.from(types).sort());
        setBrutosData(dataArray);
        setBrutosTotal(res.totalRegistros || res.totalRecords || res.length || dataArray.length);
        if (dataArray.length > 0) setBrutosColumns(Object.keys(dataArray[0]));
      }
    } catch (error) {
      console.error('Error cargando lista de materiales:', error);
    } finally {
      setBrutosLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setViewDate(new Date());

    const init = async () => {
      setIsLoading(true);
      try {
        const resG = await grupoService.getAll();
        const filteredGroups = (resG.data || []).filter(g => 
          g.nombre_grupo && g.nombre_grupo.toLowerCase().includes('corte y laminado')
        );
        setGrupos(filteredGroups);
        const ids = filteredGroups.map(g => g.codigo_grupo);

        const resR = await restriccionService.getAll();
        // Filtrar restricciones solo para Centro 1000
        setRestricciones((resR.data || []).filter(r => ids.includes(r.codigo_grupo) && String(r.grupo?.centro) === '1000'));

        const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
        setOrders(resProv.data || []);

        const resT = await serviciosService.getTiemposEnsamblado(1, 10000);
        const tData = Array.isArray(resT.data) ? resT.data : (resT.data?.data || []);
        setTiemposEnsamblado(tData);

        await fetchBrutosData(1, 20);

      } catch (error) {
        console.error('Error inicializando Formulación:', error);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, [fetchBrutosData]);

  const handleBrutosPageChange = (newPage: number) => {
    const p = Math.max(1, Math.min(newPage, Math.ceil(brutosTotal / brutosRowsPerPage)));
    setBrutosPage(p);
    fetchBrutosData(p, brutosRowsPerPage);
  };

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        dates.add(d.includes('T') ? d.split('T')[0] : d);
      }
    });
    return dates;
  }, [ordenes]);

  const calendarDays = useMemo(() => {
    if (!viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions = { dens: '—', ancho: '—', largo: '—', esp: '—' };
    if (desc) {
      const densMatch = desc.match(/D-?(\d+)/i);
      if (densMatch) dimensions.dens = densMatch[1];
      const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
      if (dimMatch) {
        dimensions.ancho = dimMatch[1];
        dimensions.largo = dimMatch[2];
        if (dimMatch[3]) dimensions.esp = dimMatch[3];
      }
    }
    return { code, desc, ...dimensions };
  };

  const calculateCargasLogic = (totalSubblocks: number, ancho: number, largo: number) => {
    if (ancho <= 0 || largo <= 0 || totalSubblocks <= 0) return { subbloquesPorCarga: 0, totalCargas: 0 };
    const innerRadius = MACHINE_RADIO_CM - largo;
    if (innerRadius <= 0) return { subbloquesPorCarga: 1, totalCargas: Math.ceil(totalSubblocks) };
    const innerCircumference = 2 * Math.PI * innerRadius;
    const subbloquesPorCarga = Math.max(1, Math.floor(innerCircumference / ancho));
    const totalCargas = Math.ceil(totalSubblocks / subbloquesPorCarga);
    return { subbloquesPorCarga, totalCargas };
  };

  const filteredOrders = useMemo(() => {
    return ordenes.filter(o => {
      if (selectedDate !== 'all') {
        const d = String(o.FECHAINICIO || o.FECHA || '').trim();
        const date = d.includes('T') ? d.split('T')[0] : d;
        if (date !== selectedDate) return false;
      }
      return true;
    });
  }, [ordenes, selectedDate]);

  /**
   * UNIÓN TÁCTICA: Lista Necesidades
   * Cruce de Provisionales con Tiempos por CodMaterial.
   * Aplica filtros de RESPCTRLPROD y ALMACEN desde restricciones de Planta 1000.
   */
  const listaNecesidades = useMemo(() => {
    // 1. Obtener códigos permitidos desde las restricciones
    const respCodes = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    const almCodes = restricciones
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    const timesMap = new Map<string, any>();
    tiemposEnsamblado.forEach(t => {
      const code = String(t.CodMaterial || '').trim();
      if (code) timesMap.set(code, t);
    });

    return ordenes
      .filter(o => {
        // Filtrar por Responsable (si hay restricción)
        const itemResp = String(o.RESPCONTROLPROD || o.RESPCTRLPROD || o.RespCtrlProd || '').trim();
        const matchResp = respCodes.length === 0 || respCodes.includes(itemResp);
        
        // Filtrar por Almacén (si hay restricción)
        const itemAlm = String(o.Almacen || o.ALMACEN || o.almacen || '').trim();
        const matchAlm = almCodes.length === 0 || almCodes.includes(itemAlm);

        return matchResp && matchAlm;
      })
      .map(o => {
        const info = extractMaterialInfo(o);
        const t = timesMap.get(info.code);
        
        return {
          centro: o.Centro || o.CENTRO || t?.Centro || '—',
          almacen: o.Almacen || o.ALMACEN || '—',
          categoria: o.CATEGORIA || o.Categoria || '—',
          material: info.code,
          descripcion: info.desc,
          cantidad: o.CANTIDAD || o.CANTPROGRAMADA || 0,
          lineaTecnica: t?.Linea || t?.PuestoTrabajoLinea || '—',
          maquina: o.Maquina || o.MAQUINA || '—',
          tiempo: t?.Tiempo_Min || t?.Tiempo || 0
        };
      });
  }, [ordenes, tiemposEnsamblado, restricciones]);

  const summaryData = useMemo(() => {
    const groupsMap = new Map<string, any>();
    filteredOrders.forEach(o => {
      const info = extractMaterialInfo(o);
      const qty = Number(o.CANTIDAD || 0);
      const e = parseFloat(info.esp) || 0;
      const d = parseFloat(info.dens) || 0;
      const w = parseFloat(info.ancho) || 0;
      const l = parseFloat(info.largo) || 0;
      const key = `${info.dens}|${info.ancho}|${info.largo}`;
      
      const usefulHeight = isNaN(d) ? 103 : (d < 30 ? 103 : 85);
      const itemSub = (qty * e) / usefulHeight;
      const itemBloqueF = (w * itemSub) / 2000;
      const { totalCargas } = calculateCargasLogic(itemSub, w, l);
      const physicalBlocks = Math.ceil(itemBloqueF);
      const timeLog = (physicalBlocks * SECONDS_LOAD_BLOCK + Math.ceil(qty / (e > 10 ? 4 : 3)) * SECONDS_REPETITION + Math.ceil(physicalBlocks / 2) * SECONDS_CART_SWAP) / 3600;

      if (!groupsMap.has(key)) groupsMap.set(key, { ...info, units: 0, sub: 0, bloqueF: 0, cargas: 0, time: 0 });
      const entry = groupsMap.get(key);
      entry.units += qty; entry.sub += itemSub; entry.bloqueF += itemBloqueF; entry.cargas += totalCargas; entry.time += timeLog;
    });
    return Array.from(groupsMap.values());
  }, [filteredOrders]);

  const totalPlannedTime = useMemo(() => summaryData.reduce((sum, r) => sum + r.time, 0), [summaryData]);

  // Sincronización de scroll para Lista Necesidades
  useEffect(() => {
    if (activeTab === 'necesidades' && mounted) {
      const group = scrollNecesidades;
      if (!group.top.current || !group.bottom.current) return;
      const syncB = () => { if (group.bottom.current) group.bottom.current.scrollLeft = group.top.current.scrollLeft; };
      const syncT = () => { if (group.top.current) group.top.current.scrollLeft = group.bottom.current.scrollLeft; };
      group.top.current.addEventListener('scroll', syncB);
      group.bottom.current.addEventListener('scroll', syncT);
      if (group.table.current) group.width[1](group.table.current.offsetWidth);
      return () => {
        group.top.current?.removeEventListener('scroll', syncB);
        group.bottom.current?.removeEventListener('scroll', syncT);
      };
    }
  }, [activeTab, mounted, listaNecesidades]);

  if (!mounted || !viewDate) return (
    <div className="flex justify-center p-20">
      <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
    </div>
  );

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-96 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
      <p className="text-gray-500 font-medium text-xs uppercase font-black tracking-widest">Sincronizando Táctica Formulación...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center space-x-4 pb-4 border-b border-gray-100">
        <div className="p-2 bg-teal-50 rounded-xl shadow-sm"><FlaskConical className="w-6 h-6 text-teal-600" /></div>
        <div>
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Táctica Formulación</h2>
          <Badge variant="outline" className="text-[10px] font-bold border-teal-200 text-teal-700 bg-teal-50 mt-1 uppercase">Control Global de Necesidades</Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-7 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Resumen', i: LayoutDashboard }, 
            { v: 'necesidades', l: 'Lista Necesidades', i: ListChecks },
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Restricciones', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos', i: Clock },
            { v: 'brutos', l: 'Lista de Materiales', i: ClipboardList }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="animate-in fade-in duration-300 space-y-6">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-teal-50 rounded-xl"><CalendarIcon className="w-4 h-4 text-teal-600" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Horizonte de Mezcla</p>
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Consolidado Global' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl border-gray-200 hover:bg-white hover:border-teal-500/50 gap-2 font-bold text-[10px] uppercase transition-all shadow-sm">
                  <Filter className="w-3 h-3" /> Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3 rounded-2xl shadow-2xl border-none">
                  <div className="flex items-center justify-between mb-3 text-left">
                    <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate || new Date(), 'MMMM yyyy', { locale: es })}</h3>
                    <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate!, 1))} className="h-6 h-6"><ChevronLeft className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate!, 1))} className="h-6 h-6"><ChevronRight className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-y-1 text-center mb-2">
                    {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={`pad-${idx}`} className="p-1" />;
                      const dStr = format(day, 'yyyy-MM-dd');
                      const isSel = selectedDate === dStr;
                      return (
                        <button key={dStr} onClick={() => setSelectedDate(isSel ? 'all' : dStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", isSel ? "bg-teal-600 text-white shadow-md" : "hover:bg-gray-100")}>
                          <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !isSel ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                          {datesWithOrders.has(dStr) && !isSel && <div className="absolute bottom-1 w-1 h-1 bg-teal-400 rounded-full" />}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-teal-600 h-7 mt-1" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
              </PopoverContent>
            </Popover>
          </div>

          <CapacityEvaluationPanel 
            plannedHours={totalPlannedTime} 
            restrictions={restricciones}
            resources={[ { id: 'FORMULACION_Q', name: 'Planta de Mezcla' } ]}
          />

          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[450px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-gray-100/80 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Densidad</th>
                    <th className="px-4 py-4 border-r border-gray-100">Ancho</th>
                    <th className="px-4 py-4 border-r border-gray-100">Largo</th>
                    <th className="px-4 py-4 border-r border-gray-100 bg-teal-50/50">Unidades</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-purple-700">Subbloques</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-orange-800">Bloque Formulado</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-purple-900">Cargas</th>
                    <th className="px-4 py-4 text-center text-teal-700 bg-teal-50/30">Tiempo Operativo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {summaryData.length === 0 ? (
                    <tr><td colSpan={8} className="py-12 text-center text-gray-400 font-medium italic">Sin mezclas programadas para el criterio</td></tr>
                  ) : (
                    summaryData.map((row, i) => (
                      <tr key={i} className="hover:bg-teal-50/20 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-3 font-mono text-gray-500 border-r border-gray-50">{row.ancho}</td>
                        <td className="px-4 py-3 font-mono text-gray-500 border-r border-gray-50">{row.largo}</td>
                        <td className="px-4 py-3 font-bold text-teal-700 border-r border-gray-50 bg-teal-50/5">{row.units.toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-purple-700 border-r border-gray-50">{row.sub.toFixed(1)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-orange-800 border-r border-gray-50 bg-orange-50/5">{row.bloqueF.toFixed(1)}</td>
                        <td className="px-4 py-3 font-mono text-purple-900 border-r border-gray-50 bg-purple-50/5">{Math.ceil(row.cargas)}</td>
                        <td className="px-4 py-3 font-mono font-bold text-teal-600 bg-teal-50/5">{row.time.toFixed(2)}h</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="necesidades" className="animate-in fade-in duration-300">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
            <div className="p-4 bg-indigo-50/50 border-b border-indigo-100 text-left">
              <h3 className="text-xs font-black uppercase text-indigo-900 flex items-center gap-2">
                <ListChecks className="w-4 h-4" /> Unión Táctica: Provisionales + Tiempos Ensamblado
              </h3>
              <p className="text-[10px] text-indigo-600 mt-1">Filtrado por Restricciones de Planta 1000 (Resp. / Alm.)</p>
            </div>
            <div ref={scrollNecesidades.top} className="overflow-x-auto h-3 bg-gray-50 border-b border-gray-100">
              <div style={{ width: scrollNecesidades.width[0], height: '1px' }} />
            </div>
            <div ref={scrollNecesidades.bottom} className="overflow-x-auto max-h-[600px]">
              <table ref={scrollNecesidades.table} className="w-full border-collapse text-center">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[9px] font-black uppercase text-gray-500 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-4 border-r border-dashed border-gray-200">Centro</th>
                    <th className="px-4 py-4 border-r border-dashed border-gray-200">Almacén</th>
                    <th className="px-4 py-4 border-r border-dashed border-gray-200 text-blue-700 bg-blue-50/20">Categoría</th>
                    <th className="px-4 py-4 border-r border-dashed border-gray-200">Material</th>
                    <th className="px-4 py-4 border-r border-dashed border-gray-200 text-left">Descripción</th>
                    <th className="px-4 py-4 border-r border-dashed border-gray-200">Cantidad</th>
                    <th className="px-4 py-4 border-r border-dashed border-gray-200 text-purple-700 bg-purple-50/20">Línea Técnica</th>
                    <th className="px-4 py-4 border-r border-dashed border-gray-200 text-orange-700 bg-orange-50/10">Máquina</th>
                    <th className="px-4 py-4 text-teal-700 bg-teal-50/20">Tiempo (Min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px]">
                  {listaNecesidades.length === 0 ? (
                    <tr><td colSpan={9} className="py-20 text-gray-400 italic">No hay registros que coincidan con las restricciones</td></tr>
                  ) : (
                    listaNecesidades.map((row, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-400 border-r border-dashed border-gray-100">{row.centro}</td>
                        <td className="px-4 py-3 font-mono text-gray-400 border-r border-dashed border-gray-100">{row.almacen}</td>
                        <td className="px-4 py-3 font-bold text-blue-700 border-r border-dashed border-gray-100 bg-blue-50/5 uppercase">{row.categoria}</td>
                        <td className="px-4 py-3 font-mono font-bold text-primary border-r border-dashed border-gray-100 tracking-tighter">{row.material}</td>
                        <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[220px]">{row.descripcion}</td>
                        <td className="px-4 py-3 font-black text-slate-800 border-r border-dashed border-gray-100 font-mono">{row.cantidad.toLocaleString()}</td>
                        <td className="px-4 py-3 font-bold text-purple-700 border-r border-dashed border-gray-100 bg-purple-50/5 uppercase">{row.lineaTecnica}</td>
                        <td className="px-4 py-3 font-bold text-orange-700 border-r border-dashed border-gray-100 bg-orange-50/5 uppercase">{row.maquina}</td>
                        <td className="px-4 py-3 font-mono font-black text-teal-600 bg-teal-50/5">{row.tiempo.toFixed(4)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
            <Card className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
              <div className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
              <Badge className="bg-teal-50 text-teal-700 mb-2 font-bold text-[9px] uppercase">VÍNCULO OPERATIVO</Badge>
              <h4 className="font-bold text-gray-800 uppercase text-sm">RESTRICCIONES: CORTE Y LAMINADO (CENTRO 1000)</h4>
              <p className="text-[10px] font-medium text-gray-400 mt-2">Los parámetros de Formulación se heredan del grupo maestro de la planta.</p>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
             <div className="p-4 bg-teal-50 border-b border-teal-100 text-left">
               <p className="text-[10px] font-black uppercase text-teal-800">Restricciones Planta 1000 (Vínculo Corte y Laminado)</p>
            </div>
            <table className="w-full border-collapse text-center">
              <thead className="bg-gray-50/50 text-[10px] font-bold uppercase text-gray-400 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Parámetro Técnico</th>
                  <th className="px-6 py-5 border-r border-dashed border-gray-200">Valor</th>
                  <th className="px-6 py-5 text-left">Descripción Operativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px]">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-teal-50/20">
                    <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-200">
                      <Badge variant="outline" className="font-mono text-teal-700 border-teal-200 bg-teal-50/50">{r.valor_restriccion}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-center font-sans">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Orden</th>
                    <th className="px-4 py-4 border-r border-gray-100">CodMaterial</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Nombre Material</th>
                    <th className="px-4 py-4 border-r border-gray-100">Categoría</th>
                    <th className="px-4 py-4 border-r border-gray-100">Cantidad</th>
                    <th className="px-4 py-4 border-r border-gray-100">Almacén</th>
                    <th className="px-4 py-4">Maquina</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={7} className="py-12 text-center text-gray-400 italic">No hay órdenes para mostrar</td></tr>
                  ) : (
                    filteredOrders.map((o, i) => {
                      const info = extractMaterialInfo(o);
                      return (
                        <tr key={i} className="hover:bg-teal-50/30 transition-colors">
                          <td className="px-4 py-3 font-bold text-gray-900 border-r border-gray-100 uppercase">{o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-3 font-mono font-bold text-teal-700 border-r border-gray-100 tracking-tighter">{info.code}</td>
                          <td className="px-4 py-3 text-left border-r border-dashed border-gray-100 text-gray-500 uppercase truncate max-w-[300px]">{info.desc}</td>
                          <td className="px-4 py-3 font-bold text-blue-700 border-r border-gray-100 uppercase">{o.CATEGORIA || o.Categoria}</td>
                          <td className="px-4 py-3 font-black text-slate-800 border-r border-gray-100">{o.CANTIDAD || o.CANTPROGRAMADA}</td>
                          <td className="px-4 py-3 text-gray-400 font-bold uppercase border-r border-gray-100">{o.Almacen || o.ALMACEN}</td>
                          <td className="px-4 py-3 font-bold text-teal-600 uppercase">{o.Maquina || o.MAQUINA || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full border-collapse text-center font-sans">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">CodMaterial</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                    <th className="px-4 py-4 border-r border-gray-100">Línea Técnica</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-teal-600">Tiempo (Min)</th>
                    <th className="px-4 py-4">Stock / Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {tiemposEnsamblado.length === 0 ? (
                    <tr><td colSpan={5} className="py-12 text-center text-gray-400 italic">No hay catálogos técnicos cargados</td></tr>
                  ) : (
                    tiemposEnsamblado.map((t, i) => (
                      <tr key={i} className="hover:bg-teal-50/20 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-teal-700 border-r border-gray-100 tracking-tighter">{t.CodMaterial}</td>
                        <td className="px-4 py-3 text-left border-r border-gray-100 text-gray-500 uppercase truncate max-w-[300px]">{t.Descripcion || t.Material}</td>
                        <td className="px-4 py-3 font-bold text-gray-400 border-r border-gray-100 uppercase">{t.Linea || '—'}</td>
                        <td className="px-4 py-3 font-mono font-bold text-teal-600 border-r border-gray-100">{(t.Tiempo_Min || 0).toFixed(4)}</td>
                        <td className="px-4 py-3 text-gray-400 font-mono">{t.StockActual || 0} / {t.StockSeguridad || 0}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="brutos" className="animate-in fade-in duration-300 space-y-4">
          <div className="bg-teal-50 border border-teal-200 p-4 rounded-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-teal-900 font-bold text-xs uppercase tracking-widest">
              <Info className="w-4 h-4" /> Tipos Detectados (Auditoría de Lote)
            </div>
            <div className="flex flex-wrap gap-2">
              {availableTypes.length === 0 ? (
                <span className="text-[10px] text-teal-600 italic">Analizando lote de datos...</span>
              ) : (
                availableTypes.map(t => (
                  <Badge key={t} className="text-[10px] font-black font-mono px-3 py-1 bg-white text-teal-700 border-teal-200 uppercase">
                    {t}
                  </Badge>
                ))
              )}
            </div>
          </div>

          <Card className="p-6 space-y-4 rounded-2xl bg-white border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-50 rounded-xl"><ClipboardList className="w-5 h-5 text-teal-600" /></div>
                <h3 className="text-lg font-bold text-gray-800 uppercase text-left">Lista de Materiales</h3>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-teal-50 text-teal-700 rounded-lg border border-teal-100 text-xs font-bold">
                {brutosTotal.toLocaleString()} REGISTROS TOTALES
              </div>
            </div>

            {brutosLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Consultando Materia Prima...</p>
              </div>
            ) : brutosData.length === 0 ? (
              <div className="text-center py-20 text-gray-400 italic border-2 border-dashed rounded-2xl">No se han cargado datos</div>
            ) : (
              <>
                <div className="overflow-x-auto border rounded-2xl">
                  <table className="w-full border-collapse text-left text-[10px] font-sans">
                    <thead className="bg-gray-50 sticky top-0 font-bold uppercase text-gray-500 border-b border-gray-100">
                      <tr>
                        {brutosColumns.map(col => (
                          <th key={col} className="px-4 py-3 whitespace-nowrap border-r border-gray-100 last:border-r-0">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {brutosData.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                          {brutosColumns.map(col => (
                            <td key={`${idx}-${col}`} className="px-4 py-2.5 text-gray-600 border-r border-gray-50 last:border-r-0">
                              {typeof row[col] === 'object' ? JSON.stringify(row[col]) : String(row[col] ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-4 bg-white">
                  <p className="text-[10px] font-bold text-gray-400 uppercase">
                    Página {brutosPage} de {Math.ceil(brutosTotal / brutosRowsPerPage)}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-xl" onClick={() => handleBrutosPageChange(1)} disabled={brutosPage === 1}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-xl" onClick={() => handleBrutosPageChange(brutosPage - 1)} disabled={brutosPage === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-1 mx-2">
                      <span className="text-[10px] font-bold text-gray-700 uppercase">Filas:</span>
                      <select 
                        value={brutosRowsPerPage} 
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setBrutosRowsPerPage(val);
                          setBrutosPage(1);
                          fetchBrutosData(1, val);
                        }}
                        className="text-[10px] font-bold border rounded-lg px-2 h-7 bg-gray-50"
                      >
                        {[20, 50, 100, 500].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-xl" onClick={() => handleBrutosPageChange(brutosPage + 1)} disabled={brutosPage >= Math.ceil(brutosTotal / brutosRowsPerPage)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-xl" onClick={() => handleBrutosPageChange(Math.ceil(brutosTotal / brutosRowsPerPage))} disabled={brutosPage >= Math.ceil(brutosTotal / brutosRowsPerPage)}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
