'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wind, Users, Lock, Package, Loader2, Clock, LayoutDashboard, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, ShieldCheck, AlertTriangle, CheckCircle2, Scissors } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";

// --- CONSTANTES TÉCNICAS ---
const MACHINE_RADIO_CM = 350;    
const SECONDS_LOAD_BLOCK = 300;   
const SECONDS_REPETITION = 45;    
const SECONDS_CART_SWAP = 60;     

/**
 * Helper para obtener valores de restricciones
 */
const getParam = (restrictions: Restriccion[], key: string, defaultValue: number) => {
  const r = restrictions.find(res => res.nombre_restriccion.toUpperCase() === key.toUpperCase());
  if (r) {
    return { value: parseFloat(r.valor_restriccion) || defaultValue, isOverridden: true };
  }
  return { value: defaultValue, isOverridden: false };
};

/**
 * COMPONENTE: Plan de Control de Horarios y Evaluación de Capacidad
 */
const ScheduleControlPanel = ({ 
  plannedHours, 
  restrictions, 
  centroId, 
  resources 
}: { 
  plannedHours: number, 
  restrictions: Restriccion[], 
  centroId: string,
  resources: { id: string, name: string, defaultT1?: number, defaultT2?: number }[]
}) => {
  const isQuito = centroId === '1000';
  
  // Parámetros de restricción generales del grupo
  const rendParam = getParam(restrictions, isQuito ? 'RENDIMIENTO_PROCESO' : 'RENDIMIENTO_PROCESO_GYE', isQuito ? 70 : 65);
  const shiftHoursParam = getParam(restrictions, 'HORAS_TRABAJO', 9);
  const maxExtrasParam = getParam(restrictions, 'MAX_EXTRAS_HORAS', 2);
  const paroParam = getParam(restrictions, 'PARO_PROGRAMADO', 0.68); 

  // Procesamiento de recursos
  const processedResources = resources.map(m => {
    const t1 = getParam(restrictions, `${m.id}_T1`, m.defaultT1 ?? shiftHoursParam.value);
    const t2 = getParam(restrictions, `${m.id}_T2`, m.defaultT2 ?? 8);
    const p = getParam(restrictions, `${m.id}_PARO`, paroParam.value);
    
    const baseHours = t1.value + t2.value - (p.value * 2);
    const maxPotentialHours = baseHours + maxExtrasParam.value; 
    
    return { 
      ...m, 
      t1, 
      t2, 
      p, 
      maxExtras: maxExtrasParam,
      baseHours,
      maxPotentialHours
    };
  });

  const totalBaseHours = processedResources.reduce((acc, m) => acc + m.baseHours, 0);
  const totalMaxHours = processedResources.reduce((acc, m) => acc + m.maxPotentialHours, 0);
  
  const netCapacityBase = totalBaseHours * (rendParam.value / 100);
  const netCapacityMax = totalMaxHours * (rendParam.value / 100);
  
  const utilization = netCapacityBase > 0 ? (plannedHours / netCapacityBase) * 100 : 0;
  
  let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
  let statusMessage = "Capacidad Normal";
  let recommendation = "El plan es factible dentro de la jornada normal.";
  
  if (plannedHours > netCapacityMax) {
    status = 'CRITICAL';
    statusMessage = "SOBRECARGA CRÍTICA";
    recommendation = `La demanda excede la capacidad máxima (${netCapacityMax.toFixed(1)}h). Se requiere reprogramar.`;
  } else if (plannedHours > netCapacityBase) {
    status = 'WARNING';
    statusMessage = "EXTRAS REQUERIDAS";
    const extrasNeeded = (plannedHours / (rendParam.value / 100)) - totalBaseHours;
    recommendation = `Se requiere programar aproximadamente ${extrasNeeded.toFixed(1)}h de extras.`;
  }

  return (
    <div className="mb-10 text-left font-sans animate-in fade-in slide-in-from-top-4 duration-700">
      <div className={cn(
        "text-white p-3 rounded-t-2xl flex justify-between items-center shadow-lg px-6",
        isQuito ? "bg-slate-900 border-b-2 border-blue-500" : "bg-indigo-950 border-b-2 border-indigo-400"
      )}>
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-blue-400" />
          <span className="text-xs font-black tracking-widest uppercase">
            Control de Horarios y Evaluación de Capacidad - Planta {centroId}
          </span>
        </div>
        <Badge className={cn(
          "font-black text-[10px]",
          status === 'NORMAL' ? "bg-green-500" : status === 'WARNING' ? "bg-amber-500" : "bg-red-500"
        )}>
          {statusMessage}
        </Badge>
      </div>

      <div className="bg-white border-x border-b border-gray-200 rounded-b-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse text-[11px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase font-black border-b border-gray-100">
                <th className="px-4 py-4 text-left sticky left-0 bg-gray-50 z-10 w-48">Recurso Operativo</th>
                <th className="px-4 py-4">Turno 1 (H)</th>
                <th className="px-4 py-4">Turno 2 (H)</th>
                <th className="px-4 py-4 text-gray-400">Paros (H)</th>
                <th className="px-4 py-4 text-blue-600">Límite Extras (H)</th>
                <th className="px-4 py-4 font-black bg-slate-50">Cap. Bruta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {processedResources.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-left font-bold text-gray-700 sticky left-0 bg-white border-r border-gray-50">{m.name}</td>
                  <td className="px-4 py-3 font-mono">
                    <div className="flex items-center justify-center gap-1">
                      {m.t1.value.toFixed(1)} {m.t1.isOverridden && <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <div className="flex items-center justify-center gap-1">
                      {m.t2.value.toFixed(1)} {m.t2.isOverridden && <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-400 italic">-{m.p.value.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono text-blue-600 font-bold">+{m.maxExtras.value.toFixed(1)}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-800 bg-slate-50/50">{m.baseHours.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 border-t border-gray-200">
           <div className="p-6 border-r border-gray-100 flex flex-col items-center justify-center bg-gray-50/30">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-2">Rendimiento Planta</span>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-black text-slate-800 font-mono">{rendParam.value}%</span>
                {rendParam.isOverridden && <ShieldCheck className="w-5 h-5 text-blue-500" />}
              </div>
           </div>
           
           <div className="p-6 border-r border-gray-100 flex flex-col items-center justify-center">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-2">Capacidad Neta Disponible</span>
              <span className="text-3xl font-black text-indigo-600 font-mono">{netCapacityBase.toFixed(1)}h</span>
           </div>

           <div className="p-6 border-r border-gray-100 flex flex-col items-center justify-center">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-2">Utilización del Plan</span>
              <div className="flex flex-col items-center gap-1">
                <span className={cn(
                  "text-3xl font-black font-mono",
                  utilization > 100 ? "text-red-600" : "text-green-600"
                )}>
                  {utilization.toFixed(1)}%
                </span>
                <Progress value={Math.min(utilization, 100)} className="w-24 h-1.5" />
              </div>
           </div>

           <div className={cn(
             "p-6 flex flex-col items-start justify-center px-8",
             status === 'NORMAL' ? "bg-green-50/50" : status === 'WARNING' ? "bg-amber-50/50" : "bg-red-50/50"
           )}>
              <div className="flex items-center gap-2 mb-1">
                {status === 'NORMAL' ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                <span className="text-[10px] font-black uppercase tracking-tighter text-gray-500">Evaluación Operativa</span>
              </div>
              <p className="text-xs font-bold text-gray-800">{recommendation}</p>
           </div>
        </div>
      </div>
    </div>
  );
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState(new Date());

  const scrollProv1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollProv2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollResumen1000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };
  const scrollResumen2000 = { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) };

  useEffect(() => { setMounted(true); }, []);

  const fetchGruposRelevantes = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('espuma') || name.includes('corte y laminado');
      });
      setGrupos(filtered);
      return filtered;
    } catch (error) {
      return [];
    }
  };

  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      const res = await restriccionService.getAll();
      const filtered = (res.data || []).filter(r => gruposIds.includes(r.codigo_grupo));
      setRestricciones(filtered);
      return filtered;
    } catch (error) {
      return [];
    }
  };

  const fetchOrdenes = async () => {
    try {
      const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      const data = resProv.data?.data || resProv.data || [];
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    }
  };

  const fetchTiemposEnsamblado = async (filteredGroups: Grupo[]) => {
    try {
      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
        const data = res.data?.data || res.data || [];
        if (Array.isArray(data)) allTiempos.push(...data);
      }
      setTiemposEnsamblado(allTiempos);
    } catch (error) {
      console.error('Error cargando tiempos:', error);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const initData = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGruposRelevantes();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await Promise.all([
        fetchRestricciones(groupsIds),
        fetchOrdenes(),
        fetchTiemposEnsamblado(filteredGroups)
      ]);
      setIsLoading(false);
    };
    initData();
  }, [mounted]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes]);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions = { dens: '—', ancho: '—', largo: '—', esp: '—', apertura: '—' };
    if (desc) {
      const densMatch = desc.match(/D-?(\d+)/i);
      if (densMatch) dimensions.dens = densMatch[1];
      const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
      if (dimMatch) {
        dimensions.ancho = dimMatch[1];
        dimensions.largo = dimMatch[2];
        if (dimMatch[3]) dimensions.esp = dimMatch[3];
      }
      const apertureMatch = desc.match(/194\.5|206|219/);
      if (apertureMatch) dimensions.apertura = apertureMatch[0];
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

  const filterData = (data: any[], centro: string, applyDateFilter: boolean = true) => {
    if (!data || data.length === 0) return [];
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    if (relevantGroups.length === 0) return [];

    return data.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;

      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      if (centro === '1000' && itemAlmValue !== '1006') return false;
      if (centro === '2000' && itemAlmValue !== '2006') return false;

      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = relevantGroups.some(g => {
        const respCodes = restricciones.filter(r => r.codigo_grupo === g.codigo_grupo && r.nombre_restriccion === 'RESPCTRLPROD')
          .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim())).filter(v => v !== '');
        return respCodes.length === 0 || respCodes.includes(itemResp);
      });

      if (!matchResp) return false;
      if (applyDateFilter) {
        const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
        if (selectedDate !== 'all' && itemDate !== selectedDate) return false;
      }
      return true;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones, selectedDate]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones, selectedDate]);
  const tiemposC1000 = useMemo(() => filterData(tiemposEnsamblado, '1000', false), [tiemposEnsamblado, grupos, restricciones]);
  const tiemposC2000 = useMemo(() => filterData(tiemposEnsamblado, '2000', false), [tiemposEnsamblado, grupos, restricciones]);

  const calculateSummary = (data: any[]) => {
    const groupsMap = new Map<string, { fecha: string; dens: string; apertura: string; units: number; subbloques: number; bloques20m: number; cargas: number; timeLog: number }>();

    data.forEach(o => {
      const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
      const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const info = extractMaterialInfo(o);
      const key = `${fecha}|${info.dens}|${info.apertura}`;
      
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const ancho = parseFloat(info.ancho) || 0;
      const largo = parseFloat(info.largo) || 0;
      const esp = parseFloat(info.esp) || 0;
      const densValue = parseFloat(info.dens) || 0;
      
      const usefulHeight = isNaN(densValue) ? 103 : (densValue < 30 ? 103 : 85);
      const itemSubbloques = (qty * esp) / usefulHeight;
      const itemBloques20m = (ancho * itemSubbloques) / 2000;
      
      const { totalCargas } = calculateCargasLogic(itemSubbloques, ancho, largo);
      
      const physicalBlocksCount = Math.ceil(itemBloques20m);
      const tCarga = physicalBlocksCount * SECONDS_LOAD_BLOCK;
      const tDescarga = Math.ceil(qty / (esp > 10 ? 4 : 3)) * SECONDS_REPETITION;
      const tCoches = Math.ceil(physicalBlocksCount / 2) * SECONDS_CART_SWAP;
      const itemTimeLog = (tCarga + tDescarga + tCoches) / 3600;

      if (!groupsMap.has(key)) groupsMap.set(key, { fecha, dens: info.dens, apertura: info.apertura, units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 });
      const entry = groupsMap.get(key)!;
      entry.units += qty; entry.subbloques += itemSubbloques; entry.bloques20m += itemBloques20m; entry.cargas += totalCargas; entry.timeLog += itemTimeLog;
    });

    return Array.from(groupsMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.dens.localeCompare(b.dens) || a.apertura.localeCompare(b.apertura));
  };

  const summaryData1000 = useMemo(() => calculateSummary(provC1000), [provC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(provC2000), [provC2000]);

  const summaryTotals1000 = useMemo(() => summaryData1000.reduce((acc, row) => ({ timeLog: acc.timeLog + row.timeLog }), { timeLog: 0 }), [summaryData1000]);
  const summaryTotals2000 = useMemo(() => summaryData2000.reduce((acc, row) => ({ timeLog: acc.timeLog + row.timeLog }), { timeLog: 0 }), [summaryData2000]);

  const setupScrollSync = (group: any) => {
    if (!group.top.current || !group.bottom.current) return;
    const syncB = () => { if (group.bottom.current) group.bottom.current.scrollLeft = group.top.current.scrollLeft; };
    const syncT = () => { if (group.top.current) group.top.current.scrollLeft = group.bottom.current.scrollLeft; };
    group.top.current.addEventListener('scroll', syncB);
    group.bottom.current.addEventListener('scroll', syncT);
    return () => { group.top.current?.removeEventListener('scroll', syncB); group.bottom.current?.removeEventListener('scroll', syncT); };
  };

  useEffect(() => {
    if (!mounted) return;
    const items = [scrollProv1000, scrollProv2000, scrollResumen1000, scrollResumen2000];
    const cleaners = items.map(setupScrollSync);
    const timer = setTimeout(() => { items.forEach(s => { if (s.table.current) s.width[1](s.table.current.offsetWidth); }); }, 500);
    return () => { cleaners.forEach(c => c?.()); clearTimeout(timer); };
  }, [activeTab, ordenes, mounted]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const firstDay = getDay(start); 
    const padding = Array.from({ length: firstDay === 0 ? 6 : firstDay - 1 }, () => null);
    return [...padding, ...days];
  }, [viewDate]);

  if (!mounted) return null;

  const renderTableBody = (data: any[], centroId: string) => {
    return data.map((o, i) => {
      const info = extractMaterialInfo(o);
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const hasCategory = String(o.CATEGORIA || '').trim() !== '' && String(o.CATEGORIA || '').trim() !== 'N/A';
      
      let alturaTotal = 0, nSubItem = 0, bloques20mItem = 0, tiempoLogistico = 0, totalCargas = 0, subbloquesPorCarga = 0;
      
      if (hasCategory) {
        const e = parseFloat(info.esp) || 0;
        const d = parseFloat(info.dens) || 0;
        const w = parseFloat(info.ancho) || 0;
        const l = parseFloat(info.largo) || 0;
        alturaTotal = qty * e;
        const usefulHeight = isNaN(d) ? 103 : (d < 30 ? 103 : 85);
        nSubItem = alturaTotal / usefulHeight;
        bloques20mItem = (w * nSubItem) / 2000;
        const logic = calculateCargasLogic(nSubItem, w, l);
        subbloquesPorCarga = logic.subbloquesPorCarga;
        totalCargas = logic.totalCargas;
        const physicalBlocks = Math.ceil(bloques20mItem);
        tiempoLogistico = (physicalBlocks * SECONDS_LOAD_BLOCK + Math.ceil(qty / (e > 10 ? 4 : 3)) * SECONDS_REPETITION + Math.ceil(physicalBlocks / 2) * SECONDS_CART_SWAP) / 3600;
      }

      return (
        <tr key={i} className="hover:bg-gray-50/50 transition-colors text-center text-[10px] font-sans">
          <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
          <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
          <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-100 tracking-tighter">{info.code}</td>
          <td className="px-3 py-2 text-left border-r border-gray-100 truncate max-w-[180px] text-gray-500 uppercase">{info.desc}</td>
          <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.dens : '—'}</td>
          <td className="px-2 py-2 font-mono font-bold text-blue-700 border-r border-gray-100 bg-blue-50/10">{hasCategory ? info.apertura : '—'}</td>
          <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.ancho : '—'}</td>
          <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.largo : '—'}</td>
          <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.esp : '—'}</td>
          <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-100 font-mono">{qty}</td>
          <td className="px-2 py-2 font-mono font-bold text-indigo-900 border-r border-gray-100 bg-indigo-50/20">{hasCategory ? alturaTotal.toFixed(1) : '—'}</td>
          <td className="px-2 py-2 font-mono font-bold text-orange-700 border-r border-gray-100 bg-orange-50/10">{hasCategory ? nSubItem.toFixed(2) : '—'}</td>
          <td className="px-2 py-2 font-mono font-bold text-blue-800 border-r border-gray-100 bg-blue-50/5">{hasCategory ? subbloquesPorCarga : '—'}</td>
          {centroId === '1000' && (
            <td className="px-2 py-2 font-mono font-bold text-orange-900 border-r border-gray-100 bg-orange-50/10">{hasCategory ? bloques20mItem.toFixed(1) : '—'}</td>
          )}
          <td className="px-2 py-2 font-mono font-bold text-purple-700 border-r border-gray-100 bg-purple-50/10">{hasCategory ? Math.ceil(totalCargas) : '—'}</td>
          <td className="px-3 py-2 font-mono font-bold border-r border-gray-100 text-teal-600 bg-teal-50/10">{hasCategory && tiempoLogistico > 0 ? tiempoLogistico.toFixed(2) : '—'}</td>
          <td className="px-3 py-2 font-medium text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
        </tr>
      );
    });
  };

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Corte Espuma</h2>
            <p className="text-xs text-gray-500 font-medium">Control de Capacidad Neta y Evaluación de Horarios Operativos</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Resumen', i: LayoutDashboard }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Restricciones', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos', i: Clock } 
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-primary/10 rounded-xl"><CalendarIcon className="w-4 h-4 text-primary" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Horizonte de Carga</p>
                <h3 className="text-xs font-bold text-gray-700 uppercase">{selectedDate === 'all' ? 'Plan Maestro Consolidado' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}</h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl border-gray-200 hover:bg-white hover:border-primary/50 gap-2 font-bold text-[10px] uppercase transition-all shadow-sm">
                  <Filter className="w-3 h-3" /> Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-3 font-sans">
                  <div className="flex items-center justify-between mb-3 text-left">
                    <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                    <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white hover:shadow-sm"><ChevronLeft className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white hover:shadow-sm"><ChevronRight className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-y-1 text-center mb-2">
                    {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((day, idx) => <div key={`cal-head-${idx}`} className="text-[8px] font-bold text-gray-300 uppercase py-1">{day}</div>)}
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={`cal-pad-${idx}`} className="p-1" />;
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isSelected = selectedDate === dateStr;
                      return (
                        <button key={dateStr} onClick={() => setSelectedDate(isSelected ? 'all' : dateStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                          <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dateStr) && !isSelected ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                          {datesWithOrders.has(dateStr) && !isSelected && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-primary h-7 mt-1 rounded-lg hover:bg-primary/5" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <ScheduleControlPanel 
            centroId="1000" 
            plannedHours={summaryTotals1000.timeLog} 
            restrictions={restricciones}
            resources={[
              { id: 'FECKEN', name: 'Fecken' },
              { id: 'MAQUINA_3', name: 'Máquina 3' },
              { id: 'MAQUINA_1', name: 'Máquina 1', defaultT1: 4 },
              { id: 'CNC', name: 'CNC' }
            ]}
          />

          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase flex items-center gap-2 px-1 tracking-wider text-left text-green-700">
              <div className="w-2 h-2 rounded-full bg-green-600" /> Planta 1000 - Quito (Almacén 1006)
            </h3>
            <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div ref={scrollResumen1000.top} className="overflow-x-auto h-2 bg-gray-50/50 border-b border-gray-100"><div style={{ width: scrollResumen1000.width[0], height: '1px' }} /></div>
              <div ref={scrollResumen1000.bottom} className="overflow-x-auto max-h-[400px]">
                <table ref={scrollResumen1000.table} className="w-full border-collapse text-center font-sans">
                  <thead className="bg-gray-100/80 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 border-r border-gray-100">Fecha</th>
                      <th className="px-4 py-3 border-r border-gray-100">Densidad</th>
                      <th className="px-4 py-3 border-r border-gray-100 bg-blue-50/50 text-blue-800">Apertura</th>
                      <th className="px-4 py-3 border-r border-gray-100">Unidades</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-700">Nro. Subbloque</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-orange-800 font-bold">Nro. Bloque Formulado</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-800 font-bold">Nro. Cargas Subbloque</th>
                      <th className="px-4 py-3 text-center text-teal-700 bg-teal-50/20">Tiempo Operativo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px]">
                    {summaryData1000.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-2 font-medium text-gray-400 border-r border-gray-50">{row.fecha}</td>
                        <td className="px-4 py-2 font-bold text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-2 font-bold text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.apertura}</td>
                        <td className="px-4 py-2 font-mono border-r border-gray-50">{row.units.toLocaleString()}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50">{row.subbloques.toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-orange-800 border-r border-gray-50 bg-orange-50/5">{row.bloques20m.toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50 bg-purple-50/5">{Math.ceil(row.cargas)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-teal-600 text-center bg-teal-50/5">{row.timeLog.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <ScheduleControlPanel 
            centroId="2000" 
            plannedHours={summaryTotals2000.timeLog} 
            restrictions={restricciones}
            resources={[
              { id: 'FEMA', name: 'Fema' },
              { id: 'MAQUINA_3_G', name: 'Máquina 3' },
              { id: 'REPOTENCIADO', name: 'Repotenciado', defaultT1: 6 }
            ]}
          />

          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase flex items-center gap-2 px-1 tracking-wider text-left text-indigo-700">
              <div className="w-2 h-2 rounded-full bg-indigo-600" /> Planta 2000 - Guayaquil (Almacén 2006)
            </h3>
            <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div ref={scrollResumen2000.top} className="overflow-x-auto h-2 bg-gray-50/50 border-b border-gray-100"><div style={{ width: scrollResumen2000.width[0], height: '1px' }} /></div>
              <div ref={scrollResumen2000.bottom} className="overflow-x-auto max-h-[400px]">
                <table ref={scrollResumen2000.table} className="w-full border-collapse text-center font-sans">
                  <thead className="bg-gray-100/80 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 border-r border-gray-100">Fecha</th>
                      <th className="px-4 py-3 border-r border-gray-100">Densidad</th>
                      <th className="px-4 py-3 border-r border-gray-100 bg-blue-50/50 text-blue-800">Apertura</th>
                      <th className="px-4 py-3 border-r border-gray-100">Unidades</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-700">Nro. Subbloque</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-800 font-bold">Nro. Cargas Subbloque</th>
                      <th className="px-4 py-3 text-center text-teal-700 bg-teal-50/20">Tiempo Operativo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px]">
                    {summaryData2000.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-2 font-medium text-gray-400 border-r border-gray-50">{row.fecha}</td>
                        <td className="px-4 py-2 font-bold text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-2 font-bold text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.apertura}</td>
                        <td className="px-4 py-2 font-mono border-r border-gray-50">{row.units.toLocaleString()}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50">{row.subbloques.toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50 bg-purple-50/5">{Math.ceil(row.cargas)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-teal-600 text-center bg-teal-50/5">{row.timeLog.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                <Badge className="bg-gray-100 text-gray-600 mb-2 font-bold text-[9px] uppercase">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-sm">{g.nombre_grupo}</h4>
                <p className="text-[9px] font-mono text-gray-400 mt-2">ID: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
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
                  <tr key={r.codigo_restriccion} className="hover:bg-amber-50/20">
                    <td className="px-6 py-4 font-bold text-gray-700 border-r border-dashed border-gray-200 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-200">
                      <Badge variant="outline" className="font-mono text-amber-700 border-amber-200 bg-amber-50/50">{r.valor_restriccion}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-10">
          {[ 
            { t: 'Planta 1000 - Quito', d: provC1000, s: scrollProv1000, b: 'bg-green-600', c: 'text-green-700', id: '1000' }, 
            { t: 'Planta 2000 - Guayaquil', d: provC2000, s: scrollProv2000, b: 'bg-indigo-600', c: 'text-indigo-700', id: '2000' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1", center.c)}>
                <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t} ({center.d.length} órdenes)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                <div ref={center.s.top} className="overflow-x-auto h-2 bg-gray-50/50 border-b border-gray-100"><div style={{ width: center.s.width[0], height: '1px' }} /></div>
                <div ref={center.s.bottom} className="overflow-x-auto max-h-[500px]">
                  <table ref={center.s.table} className="w-full border-collapse text-center">
                    <thead className="bg-gray-100/80 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-2 py-4 border-r border-gray-100 text-gray-800 bg-gray-50/20">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100 text-blue-800 bg-blue-50/20">APERT.</th>
                        <th className="px-2 py-4 border-r border-gray-100 text-gray-800">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100">CANT.</th>
                        <th className="px-2 py-4 border-r border-gray-100 text-indigo-900 bg-indigo-50/30 font-black">ALT. TOT.</th>
                        <th className="px-2 py-4 border-r border-gray-100 bg-orange-50/10 font-black">NRO. SUBBLOQUE</th>
                        <th className="px-2 py-4 border-r border-gray-100 bg-blue-50/10 font-bold" title="Capacidad física del carrusel">Batch. Carga Carrusel</th>
                        {center.id === '1000' && <th className="px-2 py-4 border-r border-gray-100 bg-orange-50/10 font-bold">Nro. Bloque Formulado</th>}
                        <th className="px-2 py-4 border-r border-gray-100 bg-purple-50/10 font-bold">Nro. Cargas Subbloque</th>
                        <th className="px-4 py-4 border-r border-gray-100 text-teal-700 bg-teal-50/30">Tiempo Operativo</th>
                        <th className="px-3 py-4 font-black">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">{renderTableBody(center.d, center.id)}</tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="tiempos">
          <div className="grid grid-cols-1 gap-10">
            {[ { t: 'Quito 1000', d: tiemposC1000 }, { t: 'Guayaquil 2000', d: tiemposC2000 } ].map((center, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className="text-sm font-bold uppercase text-gray-400 text-left">Catálogo de Tiempos - {center.t}</h3>
                <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
                  <table className="w-full border-collapse text-center">
                    <thead className="bg-gray-100 sticky top-0 text-[10px] font-bold uppercase text-gray-500">
                      <tr>
                        <th className="px-4 py-4 border-r border-gray-100">Material</th>
                        <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                        <th className="px-4 py-4 border-r border-gray-100">Línea</th>
                        <th className="px-4 py-4 border-r border-gray-100 text-teal-600">Estándar (Min)</th>
                        <th className="px-4 py-4">Stock</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[11px]">
                      {center.d.map((t, i) => {
                        const info = extractMaterialInfo(t);
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 font-mono font-bold text-primary border-r border-gray-50">{info.code}</td>
                            <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[280px]">{info.desc}</td>
                            <td className="px-4 py-3 border-r border-gray-50 text-gray-400 font-medium uppercase">{t.Linea || '—'}</td>
                            <td className="px-4 py-3 font-mono font-bold text-teal-600 border-r border-gray-50">{(t.Tiempo_Min || 0).toFixed(4)}</td>
                            <td className="px-4 py-3 text-gray-400 font-mono">{t.StockActual || 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};