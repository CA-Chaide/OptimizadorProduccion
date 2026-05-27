'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wind, 
  Users, 
  Lock, 
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
  PlayCircle,
  Info,
  TrendingUp,
  Box,
  AlertTriangle
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

// --- CONSTANTES TÉCNICAS Y OPERATIVAS ---
const MACHINE_RADIO_CM = 350;    
const SECONDS_LOAD_BLOCK = 300;   
const SECONDS_REPETITION = 45;    
const SECONDS_CART_SWAP = 60;     

const MATERIALES_EXCLUIDOS = ["30009844", "30007116"];

// Definición de Recursos Operativos por Planta (Basado en ejemplo suministrado)
const OPERATIVE_RESOURCES = {
  '1000': [
    { code: 'CR04', name: 'Carrusel 4 FECKEN', t1: 10, t2: 8.5, p1: 1.27, p2: 0.77, mtto: 0 },
    { code: 'CR03', name: 'Carrusel 3 SCHMUZIGER C-700', t1: 10, t2: 8.5, p1: 1.27, p2: 0.77, mtto: 0 },
    { code: 'CR01', name: 'Carrusel 1 SCHMUZIGER', t1: 4, t2: 8.5, p1: 1.27, p2: 0.77, mtto: 0 },
    { code: 'CNC01', name: 'Cortadora CNC GIOTTO X #1', t1: 10, t2: 8.5, p1: 1.27, p2: 0.77, mtto: 0 },
  ],
  '2000': [
    { code: 'CR02', name: 'Carrusel 2 FECKEN', t1: 9, t2: 0, p1: 1.27, p2: 0, mtto: 0 },
    { code: 'MAQ03', name: 'Máquina 3 Gye', t1: 9, t2: 0, p1: 1.27, p2: 0, mtto: 0 },
  ]
};

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const formatNum = (val: any, decimals: number = 0): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification, constraints } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState<Date | null>(null);

  useEffect(() => { 
    setMounted(true); 
    setViewDate(new Date());
    
    const initData = async () => {
      setIsLoading(true);
      try {
        const groupsRes = await grupoService.getAll();
        const filteredGroups = (groupsRes.data || []).filter(g => {
          const name = (g.nombre_grupo || '').toLowerCase();
          return name.includes('espuma') || name.includes('corte y laminado');
        });
        setGrupos(filteredGroups);
        const groupsIds = filteredGroups.map(g => g.codigo_grupo);

        const [restrsRes, provsRes, timesRes] = await Promise.all([
          restriccionService.getAll(),
          serviciosService.OrdenesProvisionalesPaginados(1, 20000),
          serviciosService.getTiemposEnsamblado(1, 15000)
        ]);

        setRestricciones((restrsRes.data || []).filter((r: any) => groupsIds.includes(r.codigo_grupo)));
        setOrders(provsRes.data?.data || provsRes.data || []);
        setTiemposEnsamblado(timesRes.data?.data || timesRes.data || []);

      } catch (error) {
        console.error('Error init TacticalPlanEspumas:', error);
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, []);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || item.categoria || '').trim();
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
    const apertureMatch = catStr.match(apertureRegex) || desc.match(apertureRegex);
    if (apertureMatch) dimensions.apertura = apertureMatch[0];
    
    return { code, desc, categoria: catStr, ...dimensions };
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
      const matStr = String(o.MATERIAL || o.CodMaterial || '').trim();
      if (MATERIALES_EXCLUIDOS.some(ex => matStr.includes(ex))) return false;

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

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    ordenes.forEach(o => {
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

  const calculateOperativeHours = (o: any) => {
    const info = extractMaterialInfo(o);
    const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
    const ancho = parseFloat(info.ancho) || 0;
    const esp = parseFloat(info.esp) || 0;
    const densValue = parseFloat(info.dens) || 0;
    const usefulHeight = (densValue < 30) ? 103 : 85;
    
    const itemSubbloques = (qty * esp) / usefulHeight;
    const itemBloques20m = (ancho * itemSubbloques) / 2000;
    const physicalBlocksCount = Math.ceil(itemBloques20m);
    
    const tCarga = (physicalBlocksCount * SECONDS_LOAD_BLOCK);
    const tDescarga = (Math.ceil(qty / (esp > 10 ? 4 : 3)) * SECONDS_REPETITION);
    const tCoches = (Math.ceil(physicalBlocksCount / 2) * SECONDS_CART_SWAP);
    
    return (tCarga + tDescarga + tCoches) / 3600;
  };

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
      const usefulHeight = (densValue < 30) ? 103 : 85;
      
      const itemSubbloques = (qty * esp) / usefulHeight;
      const itemBloques20m = (ancho * itemSubbloques) / 2000;
      const { totalCargas } = calculateCargasLogic(itemSubbloques, ancho, largo);
      const itemTimeLog = calculateOperativeHours(o);
      
      if (!groupsMap.has(key)) groupsMap.set(key, { fecha, dens: info.dens, tipo: info.tipo, apertura: info.apertura, units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 });
      const entry = groupsMap.get(key)!;
      entry.units += qty; entry.subbloques += itemSubbloques; entry.bloques20m += itemBloques20m; entry.cargas += totalCargas; entry.timeLog += itemTimeLog;
    });
    return Array.from(groupsMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.dens.localeCompare(b.dens));
  };

  const summaryData1000 = useMemo(() => calculateSummary(provC1000), [provC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(provC2000), [provC2000]);

  const summaryTotals1000 = useMemo(() => summaryData1000.reduce((acc, row) => ({ units: acc.units + row.units, subbloques: acc.subbloques + row.subbloques, bloques20m: acc.bloques20m + row.bloques20m, cargas: acc.cargas + row.cargas, timeLog: acc.timeLog + row.timeLog }), { units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 }), [summaryData1000]);
  const summaryTotals2000 = useMemo(() => summaryData2000.reduce((acc, row) => ({ units: acc.units + row.units, subbloques: acc.subbloques + row.subbloques, bloques20m: acc.bloques20m + row.bloques20m, cargas: acc.cargas + row.cargas, timeLog: acc.timeLog + row.timeLog }), { units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 }), [summaryData2000]);

  // Componente de Tabla de Capacidad Detallada
  const CapacitySummaryTable = ({ centerId, title }: { centerId: '1000' | '2000', title: string }) => {
    const resources = OPERATIVE_RESOURCES[centerId];
    const centerOrders = centerId === '1000' ? provC1000 : provC2000;
    
    // Calcular tiempo planificado por recurso
    const plannedTimeByResource = new Map<string, number>();
    centerOrders.forEach(o => {
      const maquina = String(o.MAQUINA || o.Maquina || o.RECURSO || 'SIN MÁQUINA').trim().toUpperCase();
      const hours = calculateOperativeHours(o);
      plannedTimeByResource.set(maquina, (plannedTimeByResource.get(maquina) || 0) + hours);
    });

    const RENDIMIENTO = 0.90; // 90%
    let totalAvailCombined = 0;
    let totalPlannedCombined = 0;

    return (
      <div className="space-y-4">
        <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter border-l-4 border-red-600 pl-3">{title}</h3>
        <Card className="rounded-2xl border border-gray-200 shadow-sm overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px] font-sans">
              <thead className="bg-[#1e293b] text-white">
                <tr>
                  <th className="px-4 py-4 text-left border-r border-white/10 w-48 font-black uppercase tracking-widest text-slate-400">recurso operativo</th>
                  {resources.map(r => (
                    <th key={r.code} className="px-4 py-4 text-center border-r border-white/10 min-w-[120px]">
                      <div className="text-white font-black uppercase tracking-tight">{r.code}</div>
                      <div className="text-[9px] text-slate-400 font-bold mt-0.5">{r.name}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-bold">
                {/* Turno 1 */}
                <tr className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-slate-600 border-r border-gray-100 uppercase font-black">Turno 1 [H]</td>
                  {resources.map(r => (
                    <td key={r.code} className="px-4 py-3 text-center border-r border-gray-100 font-mono">{r.t1.toFixed(1)}</td>
                  ))}
                </tr>
                {/* Turno 2 */}
                <tr className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-slate-600 border-r border-gray-100 uppercase font-black">Turno 2 [H]</td>
                  {resources.map(r => (
                    <td key={r.code} className="px-4 py-3 text-center border-r border-gray-100 font-mono">{r.t2.toFixed(1)}</td>
                  ))}
                </tr>
                {/* Paros Turno 1 */}
                <tr className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-slate-600 border-r border-gray-100 uppercase font-black">Paro Prog. Turno 1</td>
                  {resources.map(r => (
                    <td key={r.code} className="px-4 py-3 text-center border-r border-gray-100 font-mono text-red-500">{r.p1.toFixed(2)}</td>
                  ))}
                </tr>
                {/* Paros Turno 2 */}
                <tr className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-slate-600 border-r border-gray-100 uppercase font-black">Paro Prog. Turno 2</td>
                  {resources.map(r => (
                    <td key={r.code} className="px-4 py-3 text-center border-r border-gray-100 font-mono text-red-500">{r.p2.toFixed(2)}</td>
                  ))}
                </tr>
                {/* MTTO */}
                <tr className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 text-slate-600 border-r border-gray-100 uppercase font-black">MTTO</td>
                  {resources.map(r => (
                    <td key={r.code} className="px-4 py-3 text-center border-r border-gray-100 font-mono">{r.mtto.toFixed(2)}</td>
                  ))}
                </tr>
                {/* Tiempo Total Per Resource */}
                <tr className="bg-slate-50 border-y-2 border-gray-100">
                  <td className="px-4 py-3 text-slate-800 border-r border-gray-200 uppercase font-black">Tiempo total</td>
                  {resources.map(r => {
                    const total = (r.t1 + r.t2) - (r.p1 + r.p2) - r.mtto;
                    totalAvailCombined += total;
                    return (
                      <td key={r.code} className="px-4 py-3 text-center border-r border-gray-200 font-mono text-blue-700 font-black">{total.toFixed(2)}</td>
                    );
                  })}
                </tr>
                {/* Rendimiento (Merged row concept) */}
                <tr className="bg-white">
                  <td className="px-4 py-3 text-slate-800 border-r border-gray-200 uppercase font-black">Rendimiento</td>
                  <td colSpan={resources.length} className="px-4 py-3 text-center border-r border-gray-200 font-black text-indigo-600">{(RENDIMIENTO * 100).toFixed(0)}%</td>
                </tr>
                {/* Tiempo total disponible */}
                <tr className="bg-yellow-400/20">
                  <td className="px-4 py-3 text-slate-800 border-r border-gray-200 uppercase font-black">Tiempo total disponible</td>
                  <td colSpan={resources.length} className="px-4 py-3 text-center border-r border-gray-200 font-mono font-black text-slate-900">
                    {(totalAvailCombined * RENDIMIENTO).toFixed(1)}
                  </td>
                </tr>
                {/* Tiempo planificado */}
                <tr className="bg-slate-100/50">
                  <td className="px-4 py-3 text-slate-800 border-r border-gray-200 uppercase font-black">Tiempo planificado</td>
                  <td colSpan={resources.length} className="px-4 py-3 text-center border-r border-gray-200 font-mono font-black text-slate-900">
                    {(() => {
                        const totalPlanned = resources.reduce((sum, res) => {
                            const match = plannedTimeByResource.get(res.code.toUpperCase()) || 0;
                            return sum + match;
                        }, 0);
                        totalPlannedCombined = totalPlanned;
                        return totalPlanned.toFixed(1);
                    })()}
                  </td>
                </tr>
                {/* % Planificado */}
                <tr className="bg-emerald-100/50">
                  <td className="px-4 py-3 text-slate-800 border-r border-gray-200 uppercase font-black">% Planificado</td>
                  <td colSpan={resources.length} className="px-4 py-3 text-center border-r border-gray-200 font-mono font-black text-emerald-700">
                    {(() => {
                        const totalAvail = totalAvailCombined * RENDIMIENTO;
                        const pct = totalAvail > 0 ? (totalPlannedCombined / totalAvail) * 100 : 0;
                        return pct.toFixed(1) + '%';
                    })()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  };

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Módulo de Corte...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Corte Espuma</h2>
            <p className="text-xs text-gray-500 font-medium">Control de Capacidad Neta y Programación Diaria</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Capacidad', i: LayoutDashboard }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Reglas', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Catálogo', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-12 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-primary/10 rounded-xl"><CalendarIcon className="w-4 h-4 text-primary" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Carga Operativa</p>
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
                <div className="bg-white p-3 font-sans" style={{ minHeight: '300px' }}>
                  {viewDate && (
                    <>
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
                    </>
                  )}
                  <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-primary h-7 mt-1 rounded-lg hover:bg-primary/5" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-12">
            <CapacitySummaryTable centerId="1000" title="QUITO - CONTROL DE CAPACIDAD TÉCNICA" />
            <CapacitySummaryTable centerId="2000" title="GUAYAQUIL - CONTROL DE CAPACIDAD TÉCNICA" />
          </div>

          <div className="space-y-4">
            <h3 className="text-[11px] font-bold uppercase flex items-center gap-2 px-1 tracking-wider text-left text-green-700">
              <div className="w-2.5 h-2.5 rounded-full bg-green-600" /> Detalle de Carga - Planta 1000
            </h3>
            <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[400px]">
                <table className="w-full border-collapse text-center font-sans">
                  <thead className="bg-[#bde0fe] sticky top-0 z-10 text-[10px] font-black uppercase text-slate-800 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 border-r border-gray-100">Fecha</th>
                      <th className="px-4 py-3 border-r border-gray-100">Densidad</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-primary">Tipo</th>
                      <th className="px-4 py-3 border-r border-gray-100 bg-blue-50/50 text-blue-800">Apertura</th>
                      <th className="px-4 py-3 border-r border-gray-100">Unidades</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-700">Subbloque</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-orange-800 font-bold">Bloque 20m</th>
                      <th className="px-4 py-3 border-r border-gray-100 text-purple-800 font-bold">Cargas</th>
                      <th className="px-4 py-3 text-center text-teal-700 bg-teal-50/20">T. Operativo (H)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                    {summaryData1000.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-2 font-medium text-gray-400 border-r border-gray-50">{row.fecha}</td>
                        <td className="px-4 py-2 text-gray-700 border-r border-gray-50">{row.dens}</td>
                        <td className="px-4 py-2 font-black text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                        <td className="px-4 py-2 text-blue-700 border-r border-gray-50 bg-blue-50/5">{row.apertura}</td>
                        <td className="px-4 py-2 font-mono border-r border-gray-50">{String(row.units)}</td>
                        <td className="px-4 py-2 font-mono text-purple-700 border-r border-gray-50">{formatNum(row.subbloques, 1)}</td>
                        <td className="px-4 py-2 font-mono text-orange-800 border-r border-gray-50 bg-orange-50/5">{formatNum(row.bloques20m, 1)}</td>
                        <td className="px-4 py-2 font-mono text-purple-700 border-r border-gray-50 bg-purple-50/5">{String(Math.ceil(row.cargas))}</td>
                        <td className="px-4 py-2 font-mono text-teal-600 text-center bg-teal-50/5">{formatNum(row.timeLog, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white font-black text-[11px] uppercase">
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-right tracking-widest">Total Planta 1000:</td>
                      <td className="px-4 py-3 font-mono">{String(summaryTotals1000.units)}</td>
                      <td className="px-4 py-3 font-mono">{formatNum(summaryTotals1000.subbloques, 1)}</td>
                      <td className="px-4 py-3 font-mono">{formatNum(summaryTotals1000.bloques20m, 1)}</td>
                      <td className="px-4 py-3 font-mono">{String(Math.ceil(summaryTotals1000.cargas))}</td>
                      <td className="px-4 py-3 font-mono text-teal-300">{formatNum(summaryTotals1000.timeLog, 2)}h</td>
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
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-[#bde0fe] text-[10px] font-black uppercase text-slate-800 border-b border-gray-100">
                <tr>
                  <th className="px-6 py-5 border-r border-gray-100">Parámetro Técnico</th>
                  <th className="px-6 py-5 border-r border-gray-100">Valor</th>
                  <th className="px-6 py-5 text-left">Descripción Operativa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px] font-bold">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 text-gray-500 border-r border-gray-100 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-gray-100">
                      <Badge variant="outline" className="font-mono text-indigo-700 border-indigo-200 bg-indigo-50/50">{r.valor_restriccion}</Badge>
                    </td>
                    <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-10 animate-in fade-in duration-300">
          {[ 
            { t: 'Planta 1000 - Quito', d: provC1000, id: '1000' }, 
            { t: 'Planta 2000 - Guayaquil', d: provC2000, id: '2000' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1 tracking-widest text-left", center.id === '1000' ? 'text-green-700' : 'text-indigo-700')}>
                <div className={cn("w-2 h-2 rounded-full", center.id === '1000' ? 'bg-green-600' : 'bg-indigo-600')} /> {center.t} ({center.d.length} órdenes)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full border-collapse text-center font-sans">
                    <thead className="bg-[#bde0fe] sticky top-0 z-10 text-[9px] font-black uppercase text-slate-800 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/20 text-blue-900">Categoría</th>
                        <th className="px-2 py-4 border-r border-gray-100">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-black">Cant.</th>
                        <th className="px-2 py-4 border-r border-gray-100 text-indigo-900 bg-indigo-50/30 font-black">ALT. TOT.</th>
                        <th className="px-2 py-4 border-r border-gray-100 text-purple-700 bg-purple-50/30 font-black">SUBBLOQ.</th>
                        <th className="px-2 py-4 border-r border-gray-100 text-orange-800 bg-orange-50/30 font-black">BLQ 20M</th>
                        <th className="px-2 py-4 border-r border-gray-100 text-purple-900 bg-purple-100/30 font-black">CARGAS</th>
                        <th className="px-4 py-4 border-r border-gray-100 text-teal-700 bg-teal-50/30">T. Operativo</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-bold">Máquina</th>
                        <th className="px-3 py-4">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[10px] font-bold">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                        const w = parseFloat(info.ancho) || 0;
                        const l = parseFloat(info.largo) || 0;
                        const e = parseFloat(info.esp) || 0;
                        const dVal = parseFloat(info.dens) || 0;
                        
                        const alturaTotal = qty * e;
                        const usefulHeight = (dVal < 30) ? 103 : 85;
                        const nSub = alturaTotal / usefulHeight;
                        const nBlocks20m = (w * nSub) / 2000;
                        const { totalCargas } = calculateCargasLogic(nSub, w, l);
                        const tOperativo = calculateOperativeHours(o);

                        const maquina = String(o.MAQUINA || o.Maquina || o.RECURSO || '—').trim();

                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2 text-gray-500 border-r border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                            <td className="px-3 py-2 font-mono text-primary border-r border-gray-100 tracking-tighter">{info.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-100 truncate max-w-[150px] text-gray-500 uppercase">{info.desc}</td>
                            <td className="px-3 py-2 text-blue-800 border-r border-gray-100 bg-blue-50/5 uppercase font-bold">{String(o.CATEGORIA || '—')}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-100 text-gray-500">{info.dens}</td>
                            <td className="px-2 py-2 font-mono text-gray-500 border-r border-gray-100">{info.ancho}</td>
                            <td className="px-2 py-2 font-mono text-gray-500 border-r border-gray-100">{info.largo}</td>
                            <td className="px-2 py-2 font-mono text-gray-500 border-r border-gray-100">{info.esp}</td>
                            <td className="px-3 py-2 text-gray-900 border-r border-gray-100 font-mono">{String(qty)}</td>
                            <td className="px-2 py-2 font-mono text-indigo-900 border-r border-gray-100 bg-indigo-50/20">{formatNum(alturaTotal, 1)}</td>
                            <td className="px-2 py-2 font-mono text-purple-700 border-r border-gray-100 bg-purple-50/20">{formatNum(nSub, 1)}</td>
                            <td className="px-2 py-2 font-mono text-orange-800 border-r border-gray-100 bg-orange-50/20">{formatNum(nBlocks20m, 1)}</td>
                            <td className="px-2 py-2 font-mono text-purple-900 border-r border-gray-100 bg-purple-100/30">{String(Math.ceil(totalCargas))}</td>
                            <td className="px-3 py-2 font-mono border-r border-gray-100 text-teal-600 bg-teal-50/10">{formatNum(tOperativo, 2)}h</td>
                            <td className="px-3 py-2 font-black text-indigo-700 border-r border-gray-100 uppercase">{maquina}</td>
                            <td className="px-3 py-2 font-bold text-gray-200">{o.Almacen || o.ALMACEN || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
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
                <h3 className="text-[11px] font-black uppercase text-gray-400 text-left tracking-widest px-1">Catálogo de Tiempos - {center.t}</h3>
                <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full border-collapse text-center font-sans">
                      <thead className="bg-[#bde0fe] sticky top-0 text-[10px] font-black uppercase text-slate-800 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-4 border-r border-gray-100">Material</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                          <th className="px-4 py-4 border-r border-gray-100">Línea</th>
                          <th className="px-4 py-4 border-r border-gray-100 text-teal-700">Estándar (Min)</th>
                          <th className="px-4 py-4">Inventario / Seguridad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                        {center.d.length === 0 ? (
                          <tr><td colSpan={5} className="py-12 text-center text-gray-300 font-bold uppercase tracking-widest opacity-30">No hay registros cargados</td></tr>
                        ) : (
                          center.d.map((t, i) => {
                            const info = extractMaterialInfo(t);
                            return (
                              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 font-mono text-primary border-r border-gray-50 text-left">{info.code}</td>
                                <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[280px]">{info.desc}</td>
                                <td className="px-4 py-3 border-r border-gray-100 font-bold text-gray-400 uppercase">{t.Linea || t.PuestoTrabajoLinea || '—'}</td>
                                <td className="px-4 py-3 font-mono text-teal-600 border-r border-gray-100 bg-teal-50/5">{formatNum(t.Tiempo_Min || t.Tiempo || 0, 4)}</td>
                                <td className="px-4 py-3 text-gray-400 font-mono">{String(t.StockActual || 0)} / {String(t.StockSeguridad || 0)}</td>
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
