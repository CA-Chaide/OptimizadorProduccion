'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Wind, Users, Lock, Package, Loader2, Clock, LayoutDashboard, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, ShieldCheck, AlertTriangle, CheckCircle2, Activity } from 'lucide-react';
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { MaestroMaterialesExplosionSection } from './MaestroMaterialesExplosionSection';
import { TacticalNeedsSection } from './TacticalNeedsSection';

// --- CONSTANTES TÉCNICAS ---
const MACHINE_RADIO_CM = 350;    
const SECONDS_LOAD_BLOCK = 300;   
const SECONDS_REPETITION = 45;    
const SECONDS_CART_SWAP = 60;     

/**
 * Helper para obtener valores de restricciones
 */
const getParam = (restrictions: Restriccion[], key: string, defaultValue: number) => {
  const r = restrictions.find(res => res.nombre_restriccion.toUpperCase().replace(/\s+/g, '_') === key.toUpperCase().replace(/\s+/g, '_'));
  if (r) {
    return { value: parseFloat(r.valor_restriccion) || defaultValue, isOverridden: true };
  }
  return { value: defaultValue, isOverridden: false };
};

/**
 * PANEL DE CONTROL ESPECÍFICO PARA CENTRO 1000 (QUITO)
 * Visualización en Matriz Técnica con Recursos como Columnas
 */
const ScheduleControlPanelC1000 = ({ 
  plannedHours, 
  restrictions 
}: { 
  plannedHours: number, 
  restrictions: Restriccion[] 
}) => {
  // Extraer parámetros dinámicos del grupo
  const t1Param = getParam(restrictions, 'HORAS_TRABAJO_DÍA', 12);
  const t2Param = getParam(restrictions, 'HORAS_TRABAJO_Noche', 10);
  const comidaParam = getParam(restrictions, 'MINUTOS_COMIDAS', 45);
  const pausasParam = getParam(restrictions, 'Pausas_Activas', 15);
  const rendParam = getParam(restrictions, 'RENDIMIENTO_PROCESO', 90);

  // Deducción calculada en horas (Comida + Pausas) por cada turno
  const deductionHoursPerShift = (comidaParam.value + pausasParam.value) / 60;

  const resources = [
    { id: 'FECKEN', name: 'Fecken' },
    { id: 'MAQUINA_3', name: 'Máquina 3' },
    { id: 'MAQUINA_1', name: 'Máquina 1', specialT1: 4 }, // Máquina 1 restringida a 4h en T1
    { id: 'CNC', name: 'CNC' }
  ];

  const processedResources = resources.map(m => {
    const t1 = m.specialT1 ?? t1Param.value;
    const t2 = t2Param.value;
    const p1 = deductionHoursPerShift;
    const p2 = t2 > 0 ? deductionHoursPerShift : 0;
    const effectiveTime = (t1 + t2) - (p1 + p2);
    return { ...m, t1, t2, p1, p2, effectiveTime };
  });

  const totalEffectiveHours = processedResources.reduce((acc, m) => acc + m.effectiveTime, 0);
  const netCapacity = totalEffectiveHours * (rendParam.value / 100);
  const utilizacion = netCapacity > 0 ? (plannedHours / netCapacity) * 100 : 0;
  const saldo = netCapacity - plannedHours;

  return (
    <div className="mb-10 text-left font-sans animate-in fade-in slide-in-from-top-4 duration-700">
      <div className="bg-slate-900 text-white p-3 rounded-t-2xl flex justify-between items-center shadow-lg px-6 border-b-2 border-blue-500">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-blue-400" />
          <span className="text-xs font-black tracking-widest uppercase">
            Control de Capacidad - Planta 1000 (Corte y Laminado)
          </span>
        </div>
        <Badge className={cn(
          "font-black text-[10px] px-4 py-1 rounded-full shadow-inner",
          utilizacion <= 100 ? "bg-green-500 text-white" : "bg-red-500 text-white"
        )}>
          {utilizacion <= 100 ? "CAPACIDAD NORMAL" : "SOBRECARGA DETECTADA"}
        </Badge>
      </div>

      <div className="bg-white border-x border-b border-gray-200 rounded-b-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse text-[11px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase font-black border-b border-gray-100">
                <th className="px-4 py-4 text-left sticky left-0 bg-gray-50 z-10 w-48">Parámetros Operativos</th>
                {processedResources.map(m => (
                  <th key={m.id} className="px-4 py-4 text-indigo-900 border-l border-gray-100">{m.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <tr className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-left font-bold text-gray-600 sticky left-0 bg-white border-r border-gray-50">Turno Día (H)</td>
                {processedResources.map(m => (
                  <td key={m.id} className="px-4 py-3 font-mono">{m.t1.toFixed(1)}</td>
                ))}
              </tr>
              <tr className="hover:bg-gray-50/50 transition-colors">
                <td className="px-4 py-3 text-left font-bold text-gray-600 sticky left-0 bg-white border-r border-gray-50">Turno Noche (H)</td>
                {processedResources.map(m => (
                  <td key={m.id} className="px-4 py-3 font-mono">{m.t2.toFixed(1)}</td>
                ))}
              </tr>
              <tr className="hover:bg-gray-50/50 transition-colors bg-red-50/30">
                <td className="px-4 py-3 text-left font-bold text-red-700 sticky left-0 bg-red-50/50 border-r border-red-100">Deducciones (H)</td>
                {processedResources.map(m => (
                  <td key={m.id} className="px-4 py-3 font-mono text-red-500">-{ (m.p1 + m.p2).toFixed(2) }</td>
                ))}
              </tr>
              <tr className="bg-slate-50 font-black">
                <td className="px-4 py-3 text-left text-slate-900 sticky left-0 bg-slate-50 border-r border-gray-200">Tiempo Bruto Efectivo (H)</td>
                {processedResources.map(m => (
                  <td key={m.id} className="px-4 py-3 font-mono text-slate-800">{m.effectiveTime.toFixed(2)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 border-t border-gray-200 bg-gray-50/10">
           <div className="p-4 border-r border-gray-100 flex flex-col items-center justify-center">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">Rendimiento Proceso</span>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-black text-slate-800 font-mono">{rendParam.value}%</span>
                {rendParam.isOverridden && <ShieldCheck className="w-4 h-4 text-blue-500" />}
              </div>
           </div>
           
           <div className="p-4 border-r border-gray-100 flex flex-col items-center justify-center bg-blue-50/20">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter mb-1">Capacidad Neta Planta (H)</span>
              <span className="text-2xl font-black text-indigo-600 font-mono">{netCapacity.toFixed(1)}h</span>
           </div>

           <div className="p-4 border-r border-gray-100 flex flex-col items-center justify-center">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter mb-1">Saldo de Horas</span>
              <span className={cn("text-2xl font-black font-mono", saldo < 0 ? "text-red-600" : "text-green-600")}>
                {saldo.toFixed(1)}h
              </span>
           </div>

           <div className={cn("p-4 flex flex-col items-center justify-center px-6", utilizacion <= 100 ? "bg-green-50/50" : "bg-red-50/50")}>
              <div className="flex items-center gap-2 mb-1">
                <Activity className={cn("w-4 h-4", utilizacion <= 100 ? "text-green-600" : "text-red-600")} />
                <span className="text-[10px] font-black uppercase tracking-tighter text-gray-500">UTILIZACIÓN: {utilizacion.toFixed(1)}%</span>
              </div>
              <Progress value={Math.min(utilizacion, 100)} className={cn("h-1.5 w-full", utilizacion > 100 ? "[&>div]:bg-red-500" : "[&>div]:bg-primary")} />
           </div>
        </div>
      </div>
    </div>
  );
};

/**
 * PANEL DE CONTROL ORIGINAL PARA CENTRO 2000 (GUAYAQUIL)
 */
const ScheduleControlPanelC2000 = ({ 
  plannedHours, 
  restrictions, 
  resources 
}: { 
  plannedHours: number, 
  restrictions: Restriccion[], 
  resources: { id: string, name: string, defaultT1?: number, defaultT2?: number }[]
}) => {
  const rendParam = getParam(restrictions, 'RENDIMIENTO_PROCESO_GYE', 75);
  const shiftHoursParam = getParam(restrictions, 'HORAS_TRABAJO', 12); 
  const nightShiftParam = getParam(restrictions, 'HORAS_TRABAJO_NOCHE', 10);
  const paroParam = getParam(restrictions, 'PARO_PROGRAMADO', 0.68); 

  const processedResources = resources.map(m => {
    const t1 = getParam(restrictions, `${m.id}_T1`, m.defaultT1 ?? shiftHoursParam.value);
    const t2 = getParam(restrictions, `${m.id}_T2`, m.defaultT2 ?? nightShiftParam.value); 
    const p = getParam(restrictions, `${m.id}_PARO`, paroParam.value);
    const baseHours = t1.value + t2.value - (p.value * (t2.value > 0 ? 2 : 1));
    return { ...m, t1, t2, p, baseHours };
  });

  const totalBaseHours = processedResources.reduce((acc, m) => acc + m.baseHours, 0);
  const netCapacity = totalBaseHours * (rendParam.value / 100);
  const utilizacion = netCapacity > 0 ? (plannedHours / netCapacity) * 100 : 0;
  const saldo = netCapacity - plannedHours;

  return (
    <div className="mb-10 text-left font-sans">
      <div className="bg-indigo-950 text-white p-3 rounded-t-2xl flex justify-between items-center shadow-lg px-6 border-b-2 border-indigo-400">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-indigo-400" />
          <span className="text-xs font-black tracking-widest uppercase">
            Capacidad Operativa - Planta 2000 (Guayaquil)
          </span>
        </div>
        <Badge className={cn("font-black text-[10px] px-4 py-1 rounded-full", utilizacion <= 100 ? "bg-green-500" : "bg-red-500")}>
          {utilizacion <= 100 ? "CAPACIDAD NORMAL" : "SOBRECARGA"}
        </Badge>
      </div>

      <div className="bg-white border-x border-b border-gray-200 rounded-b-2xl shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse text-[11px]">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase font-black border-b border-gray-100">
                <th className="px-4 py-4 text-left w-48">Recurso</th>
                <th className="px-4 py-4">Turno Día</th>
                <th className="px-4 py-4">Turno Noche</th>
                <th className="px-4 py-4 text-red-400">Paros (H)</th>
                <th className="px-4 py-4 font-black bg-slate-50 border-l border-gray-100">Capacidad Bruta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {processedResources.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 text-left font-bold text-gray-700">{m.name}</td>
                  <td className="px-4 py-3 font-mono">{m.t1.value.toFixed(1)}</td>
                  <td className="px-4 py-3 font-mono">{m.t2.value.toFixed(1)}</td>
                  <td className="px-4 py-3 font-mono text-red-400">-{m.p.value.toFixed(2)}</td>
                  <td className="px-4 py-3 font-mono font-black text-slate-800 bg-slate-50/50 border-l border-gray-100">{m.baseHours.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 border-t border-gray-200">
           <div className="p-4 border-r border-gray-100 flex flex-col items-center justify-center">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Rendimiento: {rendParam.value}%</span>
           </div>
           <div className="p-4 border-r border-gray-100 flex flex-col items-center justify-center bg-blue-50/20">
              <span className="text-[10px] font-black text-blue-400 uppercase tracking-tighter">Capacidad Neta: {netCapacity.toFixed(1)}h</span>
           </div>
           <div className="p-4 border-r border-gray-100 flex flex-col items-center justify-center">
              <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">Saldo Horas: {saldo.toFixed(1)}h</span>
           </div>
           <div className="p-4 flex flex-col items-center justify-center px-6">
              <span className="text-[10px] font-black uppercase text-gray-500">UTILIZACIÓN: {utilizacion.toFixed(1)}%</span>
              <Progress value={Math.min(utilizacion, 100)} className={cn("h-1.5 w-full mt-1", utilizacion > 100 ? "[&>div]:bg-red-500" : "[&>div]:bg-primary")} />
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

  const calendarDays = useMemo(() => {
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
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions: any = { dens: '—', ancho: '—', largo: '—', esp: '—', apertura: '—', tipo: '—' };
    
    const catSearchMatch = catStr.match(/D(\d+)([a-zA-Z]+)/i);
    if (catSearchMatch) {
      dimensions.dens = catSearchMatch[1]; 
      dimensions.tipo = catSearchMatch[2].toUpperCase(); 
    } else {
      const densMatch = desc.match(/D-?(\d+)/i);
      if (densMatch) dimensions.dens = densMatch[1];
      const tipoMatch = desc.match(/D-?\d+([a-zA-Z]+)/i);
      if (tipoMatch) dimensions.tipo = tipoMatch[1].toUpperCase();
    }

    const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    if (dimMatch) {
      dimensions.ancho = dimMatch[1];
      dimensions.largo = dimMatch[2];
      if (dimMatch[3]) dimensions.esp = dimMatch[3];
    }
    const apertureRegex = /194\.5|206|219/;
    const catApertureMatch = catStr.match(apertureRegex);
    const descApertureMatch = desc.match(apertureRegex);
    if (catApertureMatch) dimensions.apertura = catApertureMatch[0];
    else if (descApertureMatch) dimensions.apertura = descApertureMatch[0];
    
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
  
  const tiemposC1000 = useMemo(() => tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim() === '1000'), [tiemposEnsamblado]);
  const tiemposC2000 = useMemo(() => tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim() === '2000'), [tiemposEnsamblado]);

  const calculateSummary = (data: any[]) => {
    const groupsMap = new Map<string, { fecha: string; dens: string; tipo: string; apertura: string; units: number; subbloques: number; bloques20m: number; cargas: number; timeLog: number }>();
    data.forEach(o => {
      const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
      const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const info = extractMaterialInfo(o);
      const key = `${fecha}|${info.dens}|${info.tipo}|${info.apertura}`;
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
      if (!groupsMap.has(key)) groupsMap.set(key, { fecha, dens: info.dens, tipo: info.tipo, apertura: info.apertura, units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 });
      const entry = groupsMap.get(key)!;
      entry.units += qty; entry.subbloques += itemSubbloques; entry.bloques20m += itemBloques20m; entry.cargas += totalCargas; entry.timeLog += itemTimeLog;
    });
    return Array.from(groupsMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.dens.localeCompare(b.dens) || a.tipo.localeCompare(b.tipo) || a.apertura.localeCompare(b.apertura));
  };

  const summaryData1000 = useMemo(() => calculateSummary(provC1000), [provC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(provC2000), [provC2000]);

  const summaryTotals1000 = useMemo(() => summaryData1000.reduce((acc, row) => ({ units: acc.units + row.units, subbloques: acc.subbloques + row.subbloques, bloques20m: acc.bloques20m + row.bloques20m, cargas: acc.cargas + row.cargas, timeLog: acc.timeLog + row.timeLog }), { units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 }), [summaryData1000]);
  const summaryTotals2000 = useMemo(() => summaryData2000.reduce((acc, row) => ({ units: acc.units + row.units, subbloques: acc.subbloques + row.subbloques, bloques20m: acc.bloques20m + row.bloques20m, cargas: acc.cargas + row.cargas, timeLog: acc.timeLog + row.timeLog }), { units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 }), [summaryData2000]);

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
        <TabsList className="grid grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Resumen', i: LayoutDashboard }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Restricciones', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
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
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Plan Maestro Consolidado' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
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

          <ScheduleControlPanelC1000 plannedHours={summaryTotals1000.timeLog} restrictions={restricciones} />

          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase flex items-center gap-2 px-1 tracking-wider text-left text-green-700">
              <div className="w-2 h-2 rounded-full bg-green-600" /> Planta 1000 - Quito (Almacén 1006)
            </h3>
            <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full border-collapse text-center font-sans">
                  <thead className="bg-gray-100/80 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 border-r border-gray-100">Fecha</th>
                      <th className="px-4 py-3 border-r border-gray-100">Descripción</th>
                      <th className="px-4 py-3 border-r border-gray-100">Densidad</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-primary">Tipo</th>
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
                        <td className="px-4 py-2 font-black text-gray-400 border-r border-gray-50 uppercase text-[8px]">BLOQUE FORMULADO</td>
                        <td className="px-4 py-2 font-bold text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-2 font-black text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                        <td className="px-4 py-2 font-bold text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.apertura}</td>
                        <td className="px-4 py-2 font-mono border-r border-gray-50">{row.units.toLocaleString()}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50">{row.subbloques.toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-orange-800 border-r border-gray-50 bg-orange-50/5">{row.bloques20m.toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50 bg-purple-50/5">{Math.ceil(row.cargas)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-teal-600 text-center bg-teal-50/5">{row.timeLog.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-800 text-white font-bold text-[11px]">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right uppercase">Total Planta 1000:</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals1000.units.toLocaleString()}</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals1000.subbloques.toFixed(1)}</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals1000.bloques20m.toFixed(1)}</td>
                      <td className="px-4 py-2 font-mono">{Math.ceil(summaryTotals1000.cargas)}</td>
                      <td className="px-4 py-2 font-mono text-teal-300">{summaryTotals1000.timeLog.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          </div>

          <ScheduleControlPanelC2000 
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
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full border-collapse text-center font-sans">
                  <thead className="bg-gray-100/80 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 border-r border-gray-100">Fecha</th>
                      <th className="px-4 py-3 border-r border-gray-100">Descripción</th>
                      <th className="px-4 py-3 border-r border-gray-100">Densidad</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-primary">Tipo</th>
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
                        <td className="px-4 py-2 font-black text-gray-400 border-r border-gray-50 uppercase text-[8px]">BLOQUE FORMULADO</td>
                        <td className="px-4 py-2 font-bold text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-2 font-black text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                        <td className="px-4 py-2 font-bold text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.apertura}</td>
                        <td className="px-4 py-2 font-mono border-r border-gray-50">{row.units.toLocaleString()}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50">{row.subbloques.toFixed(1)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-purple-700 border-r border-gray-50 bg-purple-50/5">{Math.ceil(row.cargas)}</td>
                        <td className="px-4 py-2 font-mono font-bold text-teal-600 text-center bg-teal-50/5">{row.timeLog.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-800 text-white font-bold text-[11px]">
                    <tr>
                      <td colSpan={5} className="px-4 py-2 text-right uppercase">Total Planta 2000:</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals2000.units.toLocaleString()}</td>
                      <td className="px-4 py-2 font-mono">{summaryTotals2000.subbloques.toFixed(1)}</td>
                      <td className="px-4 py-2 font-mono">{Math.ceil(summaryTotals2000.cargas)}</td>
                      <td className="px-4 py-2 font-mono text-teal-300">{summaryTotals2000.timeLog.toFixed(2)}</td>
                    </tr>
                  </tfoot>
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
            { t: 'Planta 1000 - Quito', d: provC1000, id: '1000', totals: summaryTotals1000 }, 
            { t: 'Planta 2000 - Guayaquil', d: provC2000, id: '2000', totals: summaryTotals2000 } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1", center.id === '1000' ? 'text-green-700' : 'text-indigo-700')}>
                <div className={cn("w-2 h-2 rounded-full", center.id === '1000' ? 'bg-green-600' : 'bg-indigo-600')} /> {center.t} ({center.d.length} órdenes)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full border-collapse text-center">
                    <thead className="bg-gray-100/80 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-500 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/20 text-blue-900">Categoría</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-amber-50/20 text-amber-900">Tipo</th>
                        <th className="px-2 py-4 border-r border-gray-100">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100 bg-blue-50/20">APERT.</th>
                        <th className="px-2 py-4 border-r border-gray-100">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                        <th className="px-2 py-4 border-r border-gray-100 text-indigo-900 bg-indigo-50/30 font-black">ALT. TOT.</th>
                        <th className="px-2 py-4 border-r border-gray-100 bg-orange-50/10 font-black">NRO. SUBBLOQUE</th>
                        <th className="px-2 py-4 border-r border-gray-100 bg-purple-50/10 font-bold">Nro. Cargas Subbloque</th>
                        <th className="px-4 py-4 border-r border-gray-100 text-teal-700 bg-teal-50/30">Tiempo Operativo</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-black">Máquina</th>
                        <th className="px-3 py-4 font-black">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                        const hasCategory = String(o.CATEGORIA || '').trim() !== '' && String(o.CATEGORIA || '').trim() !== 'N/A';
                        let alturaTotal = 0, nSubItem = 0, tiempoLogistico = 0, totalCargas = 0;
                        if (hasCategory) {
                          const e = parseFloat(info.esp) || 0;
                          const d = parseFloat(info.dens) || 0;
                          const w = parseFloat(info.ancho) || 0;
                          const l = parseFloat(info.largo) || 0;
                          alturaTotal = qty * e;
                          const usefulHeight = isNaN(d) ? 103 : (d < 30 ? 103 : 85);
                          nSubItem = alturaTotal / usefulHeight;
                          const logic = calculateCargasLogic(nSubItem, w, l);
                          totalCargas = logic.totalCargas;
                          const itemBloques20m = (w * nSubItem) / 2000;
                          const physicalBlocks = Math.ceil(itemBloques20m);
                          tiempoLogistico = (physicalBlocks * SECONDS_LOAD_BLOCK + Math.ceil(qty / (e > 10 ? 4 : 3)) * SECONDS_REPETITION + Math.ceil(physicalBlocks / 2) * SECONDS_CART_SWAP) / 3600;
                        }
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors text-center text-[10px]">
                            <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-100 tracking-tighter">{info.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-100 truncate max-w-[180px] text-gray-500 uppercase">{info.desc}</td>
                            <td className="px-3 py-2 text-blue-800 border-r border-gray-100 bg-blue-50/5 uppercase text-[9px]">{String(o.CATEGORIA || o.Categoria || '—')}</td>
                            <td className="px-3 py-2 font-black text-amber-700 border-r border-gray-100 bg-amber-50/5 uppercase">{info.tipo}</td>
                            <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.dens : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-blue-700 border-r border-gray-100 bg-blue-50/10">{hasCategory ? info.apertura : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.ancho : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.largo : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-gray-700 border-r border-gray-100">{hasCategory ? info.esp : '—'}</td>
                            <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-100 font-mono">{qty}</td>
                            <td className="px-2 py-2 font-mono font-bold text-indigo-900 border-r border-gray-100 bg-indigo-50/20">{hasCategory ? alturaTotal.toFixed(1) : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-orange-700 border-r border-gray-100 bg-orange-50/10">{hasCategory ? nSubItem.toFixed(2) : '—'}</td>
                            <td className="px-2 py-2 font-mono font-bold text-purple-700 border-r border-gray-100 bg-purple-50/10">{hasCategory ? Math.ceil(totalCargas) : '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold border-r border-gray-100 text-teal-600 bg-teal-50/10">{hasCategory && tiempoLogistico > 0 ? tiempoLogistico.toFixed(2) : '—'}</td>
                            <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-100 uppercase">{o.MAQUINA || o.Maquina || o.RECURSO || '—'}</td>
                            <td className="px-3 py-2 font-medium text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-gray-800 text-white font-bold text-[9px] uppercase">
                      <tr>
                        <td colSpan={11} className="px-3 py-2 text-right">Totales {center.t}:</td>
                        <td className="px-3 py-2 font-mono">{center.totals.units.toLocaleString()}</td>
                        <td className="px-2 py-2 font-mono text-indigo-200">{(center.totals.units * 15).toFixed(0)}</td>
                        <td className="px-2 py-2 font-mono text-orange-200">{center.totals.subbloques.toFixed(1)}</td>
                        <td className="px-2 py-2 font-mono text-purple-200">{Math.ceil(center.totals.cargas)}</td>
                        <td className="px-4 py-2 font-mono text-teal-300">{center.totals.timeLog.toFixed(2)}</td>
                        <td></td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300">
          <div className="grid grid-cols-1 gap-10">
            {[ { t: 'Quito 1000', d: tiemposC1000 }, { t: 'Guayaquil 2000', d: tiemposC2000 } ].map((center, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className="text-sm font-bold uppercase text-gray-400 text-left">Catálogo de Tiempos - {center.t}</h3>
                <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full border-collapse text-center">
                      <thead className="bg-gray-100 sticky top-0 text-[10px] font-bold uppercase text-gray-500">
                        <tr>
                          <th className="px-4 py-4 border-r border-gray-100">Material</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                          <th className="px-4 py-4 border-r border-gray-100">Línea</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-teal-600">Estándar (Min)</th>
                          <th className="px-4 py-4">Stock / Seguridad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[11px]">
                        {center.d.length === 0 ? (
                          <tr><td colSpan={5} className="py-8 text-center text-gray-400 italic">No hay tiempos cargados para este centro</td></tr>
                        ) : (
                          center.d.map((t, i) => {
                            const info = extractMaterialInfo(t);
                            return (
                              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 font-mono font-bold text-primary border-r border-gray-50">{info.code}</td>
                                <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[280px]">{info.desc}</td>
                                <td className="px-4 py-3 border-r border-dashed border-gray-200 font-medium text-gray-400 uppercase">{t.Linea || t.PuestoTrabajoLinea || '—'}</td>
                                <td className="px-4 py-3 font-mono font-bold text-teal-600 border-r border-gray-50">{(t.Tiempo_Min || t.Tiempo || 0).toFixed(4)}</td>
                                <td className="px-4 py-3 text-gray-400 font-mono">{(t.StockActual || 0)} / {(t.StockSeguridad || 0)}</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
