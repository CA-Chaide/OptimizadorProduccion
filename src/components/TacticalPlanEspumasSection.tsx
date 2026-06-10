
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wind, 
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
  Box,
  Users,
  Lock,
  Wrench,
  GraduationCap,
  Search,
  History,
  AlertCircle,
  ShoppingCart
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

/**
 * --- CONSTANTES DE INGENIERÍA DE PLANTA ---
 */
const CARRUSEL_DIAMETER_CM = 320;
const CIRCUMFERENCE = Math.PI * CARRUSEL_DIAMETER_CM; // ~1005.31 cm
const BASE_GAP_CM = 30; 
const MANIPULATION_FACTOR = 1.05; // +5% sobre distancia entre bloques
const EFFECTIVE_GAP_CM = BASE_GAP_CM * MANIPULATION_FACTOR; // 31.5 cm reales
const BLOCK_20M_CM = 2000; 

// Capacidad de Coche: 2 bloques apilados, altura máxima 2 metros (200cm)
const MAX_STACK_HEIGHT_CM = 200; 

// Tiempos Estándar (Segundos)
const SECONDS_PER_LOAD_VUELTA = 300; // 5 min por vuelta de carrusel
const SECONDS_PER_MANEUVER_DESC = 45; // 45 segundos por repetición de descarga

const RESPONSABLES_QUITO = ["013", "036", "038", "039", "044"];
const RESPONSABLES_GYE = ["002", "038", "039"];

const OPERATIVE_BASE = {
  '1000': [
    { maquina: 'CNC01 - CNC Giotto', puesto: 'CNC01', code: 'CNC01' },
    { maquina: 'CR01 - Carrusel 1 (HR-CAR01)', puesto: 'HR-CAR01', code: 'CR01' },
    { maquina: 'CR03 - Carrusel 3', puesto: 'HR-CAR03', code: 'CR03' },
    { maquina: 'CR04 - Carrusel 4', puesto: 'HR-CAR02', code: 'CR04' },
    { maquina: 'HR_V03_1', puesto: 'HR_V03_1', code: 'HR_V03_1' }
  ],
  '2000': [
    { maquina: 'CR02 - Fema', puesto: 'HR-CAR02', code: 'CR02' },
    { maquina: 'LA02 - Repotenciado', puesto: 'HR-CAR01', code: 'LA02' },
    { maquina: 'CR01 - Carrusel 1 SCHMUZIGER', puesto: 'HR-CAR03', code: 'CR01' }
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

const getProp = (obj: any, keys: string[]): string => {
  if (!obj) return '';
  const rowKeys = Object.keys(obj);
  for (const k of keys) {
    const found = rowKeys.find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
    if (found) return String(obj[found]).trim();
  }
  return '';
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumenOperativo');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [habilidades, setHabilidades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState<Date | null>(null);

  useEffect(() => { 
    setMounted(true); 
    const now = new Date();
    setViewDate(now);
    setSelectedDate(now.toISOString().split('T')[0]);
    
    const init = async () => {
      setIsLoading(true);
      try {
        const groupsRes = await grupoService.getAll();
        const filteredGroups = (groupsRes.data || []).filter(g => {
          const name = (g.nombre_grupo || '').toLowerCase();
          return name.includes('espuma') || name.includes('corte y laminado');
        });
        setGrupos(filteredGroups);
        const gIds = filteredGroups.map(g => g.codigo_grupo);

        const [restrs, provs, times, maint, habs] = await Promise.all([
          restriccionService.getAll(),
          serviciosService.OrdenesProvisionalesPaginados(1, 20000),
          serviciosService.getTiemposEnsamblado(1, 15000),
          serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] })),
          serviciosService.getHabilidadesOperadorPorEstacion().catch(() => ({ data: [] }))
        ]);

        setRestriccionesArray((restrs.data || []).filter((r: any) => gIds.includes(r.codigo_grupo)));
        setOrders(provs.data?.data || provs.data || []);
        setTiemposEnsamblado(times.data?.data || times.data || []);
        setMantenimientos(maint.data || []);
        setHabilidades(Array.isArray(habs.data) ? habs.data : []);
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dims: any = { dens: '—', ancho: '—', largo: '—', esp: '—' };
    
    const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s/);
    const dimFullMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    
    if (dimFullMatch) {
      dims.ancho = dimFullMatch[1];
      dims.largo = dimFullMatch[2];
      if (dimFullMatch[3]) dims.esp = dimFullMatch[3];
    }
    
    const densM = catStr.match(/D(\d+)/i) || desc.match(/D-?(\d+)/i);
    if (densM) dims.dens = densM[1];

    return { code, desc, ...dims };
  };

  /**
   * --- MOTOR DE CÁLCULO TÉCNICO (INGENIERÍA DE PLANTA) ---
   */
  const calculateEngineering = (o: any) => {
    const info = extractMaterialInfo(o);
    const qty = safeNum(o.CANTIDAD || o.CANTPROGRAMADA || 0);
    const ancho = parseFloat(info.ancho) || 0;
    const largo = parseFloat(info.largo) || 0;
    const esp = parseFloat(info.esp) || 0;
    const densV = parseFloat(info.dens) || 0;

    // 1. Altura Útil según apilamiento de 2 bloques
    const singleBlockH = (densV < 30) ? 103 : 85;
    const stackedH = singleBlockH * 2;
    const usefulH = Math.min(MAX_STACK_HEIGHT_CM, stackedH);
    
    // 2. Cálculo de Subbloques (Pilas verticales en el carrusel)
    const sheetsPerStack = esp > 0 ? Math.floor(usefulH / esp) : 1;
    const subblocks = sheetsPerStack > 0 ? Math.ceil(qty / sheetsPerStack) : 0;

    // 3. Consumo Real de Bloques de 20 metros (Cada subbloque usa 2 bloques apilados)
    const piezasPorLargoBloque = largo > 0 ? Math.floor(BLOCK_20M_CM / largo) : 0;
    const blocks20m = piezasPorLargoBloque > 0 ? (subblocks * 2) / piezasPorLargoBloque : 0;

    // 4. Capacidad del Carrusel (Gap 31.5cm dinámico)
    const sbPerLoad = ancho > 0 ? Math.floor(CIRCUMFERENCE / (ancho + EFFECTIVE_GAP_CM)) : 1;
    const loads = sbPerLoad > 0 ? Math.ceil(subblocks / sbPerLoad) : 0;

    // 5. Tiempos de Maniobra y Proceso (Basado en Segundos)
    const tCargaSec = loads * SECONDS_PER_LOAD_VUELTA; 
    
    const sheetsPerRep = (esp > 10) ? 4 : 3;
    const totalRepsDescarga = sheetsPerRep > 0 ? Math.ceil(qty / sheetsPerRep) : qty;
    const tDescargaSec = totalRepsDescarga * SECONDS_PER_MANEUVER_DESC;

    // Tiempo SAP (Asumimos segundos)
    const matchTime = tiemposEnsamblado.find(t => String(t.CodMaterial).slice(-8) === info.code);
    const sapSecPerUnit = safeNum(matchTime?.Tiempo || 0);
    const totalSapSec = qty * sapSecPerUnit;

    const totalTimeSec = tCargaSec + tDescargaSec + totalSapSec;
    const hours = totalTimeSec / 3600;
    const indivMin = qty > 0 ? (totalTimeSec / qty) / 60 : 0;

    return { 
      ...info, 
      subblocks, 
      sbPerLoad, 
      blocks20m, 
      loads, 
      hours, 
      indivMin,
      qty, 
      tCargaSec, 
      tDescargaSec,
      totalSapSec
    };
  };

  const filterData = (data: any[], centro: string) => {
    return data.filter(o => {
      const c = String(o.CENTRO || o.Centro || '').trim();
      if (c !== centro) return false;
      const resp = String(o.RESPCONTROLPROD || o.RespControlProd || '').trim();
      const valid = centro === '1000' ? RESPONSABLES_QUITO : RESPONSABLES_GYE;
      if (valid.length > 0 && !valid.includes(resp)) return false;
      if (selectedDate !== 'all') {
        const dFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        if ((dFull.includes('T') ? dFull.split('T')[0] : dFull) !== selectedDate) return false;
      }
      return true;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, selectedDate]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, selectedDate]);

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const c = String(o.CENTRO || o.Centro || '').trim();
      const resp = String(o.RESPCONTROLPROD || o.RespControlProd || '').trim();
      const valid = c === '1000' ? RESPONSABLES_QUITO : RESPONSABLES_GYE;
      if (valid.length > 0 && !valid.includes(resp)) return;
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
    const pad = startDay === 0 ? 6 : startDay - 1;
    return [...Array(pad).fill(null), ...days];
  }, [viewDate, mounted]);

  const getPuestoMTTO = (idMaquina: string) => {
    const match = habilidades.find(h => getProp(h, ['MaquinaSismac']).toUpperCase() === String(idMaquina).trim().toUpperCase());
    return match ? getProp(match, ['PuestoTrabajo']) : '—';
  };

  const getConsolidadoResumen = (centroId: string, maquinaCode: string) => {
    const orders = centroId === '1000' ? provC1000 : provC2000;
    const mNorm = String(maquinaCode).trim().toUpperCase();
    return orders.reduce((acc, o) => {
      const oM = String(o.MAQUINA || o.RECURSO || '').trim().toUpperCase();
      if (oM.includes(mNorm) || mNorm.includes(oM)) {
        const eng = calculateEngineering(o);
        acc.qty += eng.qty;
        acc.hours += eng.hours;
      }
      return acc;
    }, { qty: 0, hours: 0 });
  };

  if (!mounted) return null;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Módulo de Espumas...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Corte Espuma</h2>
            <p className="text-xs text-gray-500 font-medium">Coche 2m | Descargas por Repetición | Engineering Model v2.1</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-8 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumenOperativo', l: 'Resumen Operativo', i: Activity },
            { v: 'resumen', l: 'Capacidad', i: LayoutDashboard }, 
            { v: 'habilidades', l: 'Habilidades SAP', i: GraduationCap },
            { v: 'mantenimiento', l: 'MTTO Preventivo', i: Wrench }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Parámetros', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Catálogo Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumenOperativo" className="animate-in fade-in duration-300 space-y-4">
          <div className="flex justify-between items-center bg-gray-50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl text-primary"><Activity className="w-4 h-4" /></div>
              <div>
                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Tablero de Mando Diario</p>
                <h3 className="text-[10px] font-black text-gray-700 uppercase">{selectedDate === 'all' ? 'Vista Consolidada' : `Fecha: ${selectedDate}`}</h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
                  <Filter className="w-3 h-3 text-primary" /> Filtrar Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-3 font-sans text-left">
                  {viewDate && (
                    <>
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6"><ChevronLeft className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6"><ChevronRight className="w-3 h-3" /></Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-y-1 text-center">
                        {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((d, i) => <div key={i} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                        {calendarDays.map((day, idx) => {
                          if (!day) return <div key={idx} />;
                          const dStr = format(day, 'yyyy-MM-dd');
                          const sel = selectedDate === dStr;
                          return (
                            <button key={dStr} onClick={() => setSelectedDate(sel ? 'all' : dStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white" : "hover:bg-gray-100")}>
                              <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !sel ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                              {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
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

          <Card className="rounded-2xl border border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-sans text-left">
                <thead className="bg-[#1e293b] text-white uppercase font-black tracking-tighter text-[9px] border-b border-slate-700">
                  <tr>
                    <th className="px-2 py-4 text-center w-12 border-r border-white/5"></th>
                    <th className="px-2 py-4 text-center border-r border-white/5">Turno</th>
                    <th className="px-4 py-4 border-r border-white/5 w-56">MÁQUINA</th>
                    <th className="px-3 py-4 border-r border-white/5 text-right w-20">Cantidad</th>
                    <th className="px-3 py-4 border-r border-white/5 text-right w-24">T. ocupacion</th>
                    <th className="px-4 py-4 border-r border-white/5">Código Operador</th>
                    <th className="px-4 py-4 border-r border-white/5">Nombre Empleado</th>
                    <th className="px-3 py-4 border-r border-white/5 text-center w-24">_Habilidades (%)</th>
                    <th className="px-4 py-4 border-r border-white/5 text-center">Horas Efectivas</th>
                    <th className="px-3 py-4 border-r border-white/5 text-center">Tiempo MTTO</th>
                    <th className="px-4 py-4 text-center">Citas Médicas</th>
                  </tr>
                </thead>
                <tbody className="text-[10px] font-bold">
                  {Object.entries(OPERATIVE_BASE).map(([centro, machines]) => (
                    <React.Fragment key={centro}>
                      {machines.map((m, idx) => {
                        const cons = getConsolidadoResumen(centro, m.code);
                        const rowBg = centro === '1000' ? "bg-yellow-100/40" : "bg-slate-100/50";
                        return (
                          <React.Fragment key={`${centro}-${m.code}`}>
                            {['dia', 'noche'].map((turno, tIdx) => (
                              <tr key={tIdx} className={cn("border-b border-gray-100 hover:bg-gray-50", rowBg)}>
                                {idx === 0 && tIdx === 0 && (
                                  <td rowSpan={machines.length * 2} className={cn("px-2 py-4 border-r border-gray-200 font-black text-center uppercase tracking-widest text-[9px]", centro === '1000' ? "text-yellow-600" : "text-slate-400")}>
                                    centro {centro}
                                  </td>
                                )}
                                <td className="px-2 py-2 border-r border-gray-100 text-center uppercase text-slate-400">{turno}</td>
                                <td className="px-4 py-2 border-r border-gray-100 text-slate-800 font-black uppercase">{m.maquina}</td>
                                <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-gray-900">{turno === 'dia' ? (cons.qty > 0 ? formatNum(cons.qty) : '—') : ''}</td>
                                <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-indigo-600">{turno === 'dia' ? (cons.hours > 0 ? `${cons.hours.toFixed(1)}h` : '—') : ''}</td>
                                <td className="px-4 py-2 border-r border-gray-100 text-slate-400 font-mono">operador {turno === 'dia' ? 'a' : 'b'}</td>
                                <td className="px-4 py-2 border-r border-gray-100"></td>
                                <td className="px-3 py-2 border-r border-gray-100 text-center text-green-600">{turno === 'dia' ? '75%' : '100%'}</td>
                                <td className="px-4 py-2 border-r border-gray-100 text-center font-black text-indigo-700">18.5h</td>
                                <td className="px-3 py-2 border-r border-gray-100 text-center text-red-500">—</td>
                                <td className="px-4 py-2 text-center text-orange-500">—</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="habilidades" className="animate-in fade-in duration-300">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[650px] relative text-left">
              <table className="w-full border-collapse font-sans text-[9px]">
                <thead className="bg-[#e0e7ff] sticky top-0 z-20 text-indigo-900 uppercase font-black tracking-widest border-b border-indigo-200">
                  <tr>
                    {habilidades.length > 0 && Object.keys(habilidades[0]).map(k => <th key={k} className="px-4 py-3 border-r border-indigo-100 whitespace-nowrap">{k.replace(/_/g, ' ')}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {habilidades.map((h, i) => (
                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                      {Object.keys(h).map(k => <td key={k} className="px-4 py-2 border-r border-gray-100 text-slate-700">{String(h[k] ?? '—')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
           <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative text-center">
              <table className="w-full border-collapse font-sans text-[9px]">
                <thead className="bg-[#fef3c7] sticky top-0 z-20 text-amber-900 uppercase font-black tracking-widest border-b border-amber-200">
                  <tr>
                    <th className="px-4 py-4 border-r border-amber-100">ID Planta</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-left">Máquina</th>
                    <th className="px-4 py-4 border-r border-amber-100 bg-indigo-50 text-indigo-900">Puesto (SISMAC)</th>
                    <th className="px-4 py-4 border-r border-amber-100">Tiempo (H)</th>
                    <th className="px-4 py-4 border-r border-amber-100">Fecha Inicio</th>
                    <th className="px-4 py-4 border-r border-amber-100">Fecha Fin</th>
                    <th className="px-4 py-4">OT ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {mantenimientos.filter(m => selectedDate === 'all' || (String(m.FECHA_PRO || m.FECHA_INI || '').split('T')[0]) === selectedDate).map((m, i) => (
                    <tr key={i} className="hover:bg-amber-50/30">
                      <td className="px-4 py-3 border-r border-gray-100 text-slate-400">{String(m.ID_PLANTA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-left uppercase">{String(m.MAQUINA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 bg-indigo-50/20 text-indigo-700 uppercase">{getPuestoMTTO(String(m.ID_MAQUINA))}</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-black text-red-600">{String(m.TIEMPO || '0')}h</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-mono">{String(m.FECHA_INI || m.FECHA_PRO || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-mono">{String(m.FECHA_FIN || '—')}</td>
                      <td className="px-4 py-3 font-mono">{String(m.OT_PRG_ID || '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-10 animate-in fade-in duration-300">
          {[ 
            { t: 'Planta 1000 - Quito', d: provC1000, id: '1000', c: 'text-green-700', b: 'bg-green-600' }, 
            { t: 'Planta 2000 - Guayaquil', d: provC2000, id: '2000', c: 'text-indigo-700', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className={cn("text-[10px] font-black uppercase flex items-center gap-2 px-1 text-left", center.c)}>
                <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t}
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-center font-sans text-[9px]">
                    <thead className="bg-gray-100 sticky top-0 z-10 text-slate-500 uppercase font-black tracking-tighter border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-50">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-50">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-50">Material</th>
                        <th className="px-3 py-4 border-r border-gray-50 text-left">Descripción</th>
                        <th className="px-2 py-4 border-r border-gray-50">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-50">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-50">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-50">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-black">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-black text-indigo-700 bg-indigo-50/20">Máquina</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/20 text-blue-900">T. INDIV. (min)</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-amber-50/50 text-amber-900">T. TOTAL (H)</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-green-50/50 text-green-900">T. C/D (H)</th>
                        <th className="px-2 py-4 border-r border-gray-50 bg-purple-50/50 text-purple-900">SUBBL.</th>
                        <th className="px-2 py-4 border-r border-gray-50 bg-orange-50/50 font-black">BLOQUES 20M</th>
                        <th className="px-3 py-4 border-r border-gray-50 text-red-700 bg-red-50/50 font-black">CARGAS</th>
                        <th className="px-3 py-4 border-r border-gray-50">Alm.</th>
                        <th className="px-3 py-4">Resp.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {center.d.map((o, i) => {
                        const eng = calculateEngineering(o);
                        const dRaw = String(o.FECHAINICIO || o.FECHA || '—').trim();
                        const date = dRaw.includes('T') ? dRaw.split('T')[0] : dRaw;
                        
                        // Tiempos de Carga y Descarga transformados a HORAS
                        const loadHours = (eng.tCargaSec / 3600).toFixed(2);
                        const unloadHours = (eng.tDescargaSec / 3600).toFixed(2);
                        
                        return (
                          <tr key={i} className="hover:bg-gray-50/50">
                            <td className="px-3 py-2 text-slate-400 border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-[8px] text-gray-400">{date}</td>
                            <td className="px-3 py-2 font-mono text-primary border-r border-gray-50">{eng.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[120px] uppercase text-gray-500">{eng.desc}</td>
                            <td className="px-2 py-2 border-r border-gray-50 text-gray-400">{eng.dens}</td>
                            <td className="px-2 py-2 border-r border-gray-50 text-gray-400 font-mono">{eng.ancho}</td>
                            <td className="px-2 py-2 border-r border-gray-50 text-gray-400 font-mono">{eng.largo}</td>
                            <td className="px-2 py-2 border-r border-gray-50 text-gray-400 font-mono">{eng.esp}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-black text-gray-900 font-mono">{eng.qty.toLocaleString()}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-black text-indigo-700 bg-indigo-50/5 uppercase">{String(o.MAQUINA || o.RECURSO || '—')}</td>
                            <td className="px-3 py-2 border-r border-gray-100 bg-blue-50/10 font-mono text-blue-700 text-center">{eng.indivMin.toFixed(2)}</td>
                            <td className="px-3 py-2 border-r border-gray-100 bg-amber-50/10 font-mono text-amber-700 text-center">{eng.hours.toFixed(2)}</td>
                            <td className="px-3 py-2 border-r border-gray-100 bg-green-50/10 font-mono text-green-700 text-center" title={`${loadHours}h Carga + ${unloadHours}h Descarga`}>{loadHours} + {unloadHours}</td>
                            <td className="px-2 py-2 border-r border-gray-50 bg-purple-50/10 text-purple-700">{eng.subblocks.toFixed(1)}</td>
                            <td className="px-2 py-2 border-r border-gray-50 bg-orange-50/10 font-black text-orange-800">{eng.blocks20m.toFixed(1)}</td>
                            <td className="px-3 py-2 border-r border-gray-50 bg-red-50/20 font-black text-red-600">{String(eng.loads)}</td>
                            <td className="px-3 py-2 border-r border-gray-50 text-gray-300">{String(o.ALMACEN || '—')}</td>
                            <td className="px-3 py-2 text-gray-300">{String(o.RESPCONTROLPROD || '—')}</td>
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

        <TabsContent value="tiempos" className="animate-in fade-in duration-300 space-y-10">
          {[ { t: 'Quito 1000', d: tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim()==='1000') }, { t: 'Guayaquil 2000', d: tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim()==='2000') } ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className="text-[11px] font-black uppercase text-gray-400 text-left tracking-widest">Catálogo Tiempos - {center.t}</h3>
              <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full border-collapse text-[11px] font-bold text-center">
                    <thead className="bg-[#1e293b] text-white sticky top-0 z-10 uppercase font-black tracking-widest text-[9px]">
                      <tr>
                        <th className="px-5 py-4 border-r border-white/5 text-left">Material</th>
                        <th className="px-5 py-4 border-r border-white/5 text-left">Descripción</th>
                        <th className="px-5 py-4 border-r border-white/5">Línea</th>
                        <th className="px-5 py-4 text-teal-400">Estándar (Seg)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {center.d.map((t, i) => {
                        const info = extractMaterialInfo(t);
                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-3 font-mono text-indigo-600 border-r border-gray-50 text-left">{info.code}</td>
                            <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-600 truncate max-w-[300px] uppercase">{String(t.Material || t.Descripcion || '—')}</td>
                            <td className="px-4 py-3 border-r border-gray-100 text-gray-400 uppercase">{String(t.Linea || '—')}</td>
                            <td className="px-4 py-3 font-mono text-teal-600 bg-teal-50/10">{Number(t.Tiempo || 0).toFixed(2)}</td>
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
      </Tabs>
    </div>
  );
};
