'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Wrench,
  GraduationCap,
  RefreshCw,
  ShoppingCart,
  Box,
  TrendingUp,
  Info
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from '@/components/ui/badge';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * --- HELPERS TÉCNICOS Y DE INGENIERÍA ---
 */
const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const formatNum = (val: any, decimals: number = 2): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const parseSAPDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str || str === 'null' || str === 'undefined') return null;
  
  if (str.includes('/')) {
    const [datePart, timePart] = str.split(' ');
    if (!datePart) return null;
    const dateParts = datePart.split('/');
    if (dateParts.length < 3) return null;
    const [day, month, year] = dateParts.map(Number);
    const [hours, minutes] = timePart ? timePart.split(':').map(Number) : [0, 0];
    return new Date(year, month - 1, day, hours, minutes);
  }
  
  const isoDate = new Date(str);
  return isNaN(isoDate.getTime()) ? null : isoDate;
};

const calculateMTTOCapacity = (start: string, end: string): string => {
  const s = parseSAPDate(start);
  const e = parseSAPDate(end);
  if (!s || !e) return '0.0';
  const diffHrs = (e.getTime() - s.getTime()) / (1000 * 60 * 60);
  return Math.max(0, diffHrs).toFixed(1);
};

// Constantes de Ingeniería Planta
const BLOCK_LENGTH_METERS = 20;
const CARRUSEL_DIAMETER_CM = 320;
const CIRCUMFERENCE = Math.PI * CARRUSEL_DIAMETER_CM;
const BASE_GAP_CM = 30; 
const MANIPULATION_FACTOR = 1.05; 
const EFFECTIVE_GAP_CM = BASE_GAP_CM * MANIPULATION_FACTOR; 
const BLOCK_20M_CM = 2000; 
const MAX_STACK_HEIGHT_CM = 200; 
const SECONDS_PER_LOAD_VUELTA = 300; 
const SECONDS_PER_MANEUVER_DESC = 45; 
const PARO_PROG_T1 = 1.27;
const PARO_PROG_T2 = 0.77;

const CAPACIDAD_CONFIG_BASE = {
  '1000': [
    { code: 'CR04', name: 'Carrusel 4 FECKEN', t1: 12, t2: 10, rendimiento: 0.90 },
    { code: 'CR03', name: 'Carrusel 3 SCHMUZIG ER C-700', t1: 12, t2: 10, rendimiento: 0.90 },
    { code: 'CR01', name: 'Carrusel 1 SCHMUZIGER', t1: 6.6, t2: 10, rendimiento: 0.90 },
    { code: 'CNC01', name: 'Cortadora CNC GIOTTO X #1', t1: 9, t2: 10, rendimiento: 0.90 },
  ],
  '2000': [
    { code: 'CR02', name: 'Fema', t1: 10, t2: 0, rendimiento: 0.70 },
    { code: 'CR01', name: 'Carrusel 1 SCHMUZIGER', t1: 10, t2: 0, rendimiento: 0.70 },
    { code: 'LA02', name: 'Repotenciado', t1: 10, t2: 0, rendimiento: 0.70 },
  ]
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('capacidad');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [habilidades, setHabilidades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState<Date | null>(null);
  const [manualHours, setManualHours] = useState<Record<string, number>>({});

  useEffect(() => { 
    setMounted(true); 
    const now = new Date();
    setViewDate(now);
    setSelectedDates(new Set([now.toISOString().split('T')[0]]));
  }, []);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dims: any = { dens: '—', ancho: '—', largo: '—', esp: '—' };
    const dimFullMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    if (dimFullMatch) {
      dims.ancho = dimFullMatch[1];
      dims.largo = dimFullMatch[2];
      if (dimFullMatch[3]) dims.esp = dimFullMatch[3];
    }
    const densM = catStr.match(/D(\d+)/i) || desc.match(/D-?(\d+)/i);
    if (densM) dims.dens = densM[1];
    return { code, desc, catStr, ...dims };
  };

  const calculateEngineering = (o: any) => {
    const info = extractMaterialInfo(o);
    const qty = safeNum(o.CANTIDAD || o.CANTPROGRAMADA || 0);
    const ancho = parseFloat(info.ancho) || 0;
    const largo = parseFloat(info.largo) || 0;
    const esp = parseFloat(info.esp) || 0;
    const densV = parseFloat(info.dens) || 0;

    const singleBlockH = (densV < 30) ? 103 : 85;
    const stackedH = singleBlockH * 2;
    const usefulH = Math.min(MAX_STACK_HEIGHT_CM, stackedH);
    const sheetsPerStack = esp > 0 ? Math.floor(usefulH / esp) : 1;
    const subblocks = sheetsPerStack > 0 ? Math.ceil(qty / sheetsPerStack) : 0;
    const piezasPorLargoBloque = largo > 0 ? Math.floor(BLOCK_20M_CM / largo) : 0;
    const blocks20m = piezasPorLargoBloque > 0 ? (subblocks * 2) / piezasPorLargoBloque : 0;
    const sbPerLoad = ancho > 0 ? Math.floor(CIRCUMFERENCE / (ancho + EFFECTIVE_GAP_CM)) : 1;
    const loads = sbPerLoad > 0 ? Math.ceil(subblocks / sbPerLoad) : 0;

    const tCargaSec = loads * SECONDS_PER_LOAD_VUELTA; 
    const sheetsPerRep = (esp > 10) ? 4 : 3;
    const totalRepsDescarga = sheetsPerRep > 0 ? Math.ceil(qty / sheetsPerRep) : qty;
    const tDescargaSec = totalRepsDescarga * SECONDS_PER_MANEUVER_DESC;

    const matchTime = tiemposEnsamblado.find(t => String(t.CodMaterial || t.cod_material).slice(-8) === info.code);
    const sapSecPerUnit = safeNum(matchTime?.Tiempo || matchTime?.tiempo || 0);
    const totalSapSec = qty * sapSecPerUnit;

    const totalTimeSec = tCargaSec + tDescargaSec + totalSapSec;
    const hours = totalTimeSec / 3600;
    const indivMin = qty > 0 ? (totalTimeSec / qty) / 60 : 0;

    return { ...info, subblocks, sbPerLoad, blocks20m, loads, hours, indivMin, qty, tCargaSec, tDescargaSec, totalSapSec };
  };

  const initData = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('espuma') || name.includes('corte y laminado');
      });
      setGrupos(filteredGroups);
      const gIds = filteredGroups.map(g => g.codigo_grupo);

      const [restrs, provs, ferts, times, maint, habs] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getOrdenesFert(1, 20000),
        serviciosService.getTiemposEnsamblado(1, 15000),
        serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] })),
        serviciosService.getHabilidadesOperadorPorEstacion().catch(() => ({ data: [] }))
      ]);

      setRestriccionesArray((restrs.data || []).filter((r: any) => gIds.includes(r.codigo_grupo)));
      setOrders(provs.data?.data || provs.data || []);
      setOrdersFert(ferts.data?.data || ferts.data || []);
      setTiemposEnsamblado(times.data?.data || times.data || []);
      setMantenimientos(mantenimientosDeduplicados(maint.data || []));
      setHabilidades(Array.isArray(habs.data) ? habs.data : []);
      
    } catch (e) {
      console.error('Error init TacticalPlanEspumas:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const mantenimientosDeduplicados = (data: any[]) => {
    const seen = new Set();
    return data.filter(m => {
      const key = `${m.ID_MAQUINA}-${m.FECHA_OT_PRG_INI}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  useEffect(() => { if (mounted) initData(); }, [mounted, initData]);

  const getMachineMTTO = (maquinaCode: string) => {
    if (selectedDates.size === 0) return 0;
    return mantenimientos
      .filter(m => {
        const mMachine = String(m.ID_MAQUINA || m.MAQUINA || '').toUpperCase();
        if (!mMachine.includes(maquinaCode.toUpperCase()) && !maquinaCode.toUpperCase().includes(mMachine)) return false;
        const dStr = String(m.FECHA_OT_PRG_INI || m.FECHA_INI || '').split('T')[0];
        return selectedDates.has(dStr);
      })
      .reduce((sum, m) => {
        const durStr = calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI, m.FECHA_OT_PRG_FIN || m.FECHA_FIN);
        return sum + safeNum(durStr);
      }, 0);
  };

  const filterData = (data: any[], centro: string, ignoreRestrictions: boolean = false) => {
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    const groupIds = relevantGroups.map(g => g.codigo_grupo);
    const groupRest = restriccionesArray.filter(r => groupIds.includes(r.codigo_grupo));

    const respCodes = ignoreRestrictions ? [] : groupRest
      .filter(r => r.nombre_restriccion === 'RESPCONTROLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almCodes = ignoreRestrictions ? [] : groupRest
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return data.filter(o => {
      const c = String(o.CENTRO || o.Centro || '').trim();
      if (c !== centro) return false;
      
      if (!ignoreRestrictions) {
        const itemAlm = String(o.ALMACEN || o.Almacen || '').trim();
        if (almCodes.length > 0 && !almCodes.includes(itemAlm)) return false;
        const itemResp = String(o.RESPCONTROLPROD || o.RespControlProd || '').trim();
        if (respCodes.length > 0 && !respCodes.includes(itemResp)) return false;
      }

      if (selectedDates.size > 0) {
        const dFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = dFull.includes('T') ? dFull.split('T')[0] : dFull;
        if (!selectedDates.has(itemDate)) return false;
      }
      return true;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restriccionesArray, selectedDates]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restriccionesArray, selectedDates]);
  const fertC1000 = useMemo(() => filterData(ordenesFert, '1000', true), [ordenesFert, selectedDates]);
  const fertC2000 = useMemo(() => filterData(ordenesFert, '2000', true), [ordenesFert, selectedDates]);

  const defaultOpHour = useMemo(() => {
    const clGroup = grupos.find(g => g.nombre_grupo.toLowerCase().includes('corte y laminado'));
    const htRest = clGroup ? restriccionesArray.find(r => r.codigo_grupo === clGroup.codigo_grupo && r.nombre_restriccion === 'HORAS_TRABAJO') : null;
    return safeNum(htRest?.valor_restriccion) || 8;
  }, [grupos, restriccionesArray]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    [...ordenes, ...ordenesFert].forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') dates.add(d.includes('T') ? d.split('T')[0] : d);
    });
    return dates;
  }, [ordenes, ordenesFert]);

  const calendarDays = useMemo(() => {
    if (!viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Modelo de Ingeniería Planta v2.2</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={initData} disabled={isLoading} variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm hover:border-primary/50 transition-all">
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} ACTUALIZAR
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
                <Filter className="w-3 h-3 text-primary" /> {selectedDates.size === 0 ? 'Filtro Fecha' : `${selectedDates.size} Días`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
              <div className="bg-white p-4 font-sans text-left">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold text-gray-800 capitalize">{viewDate ? format(viewDate, 'MMMM yyyy', { locale: es }) : ''}</h3>
                  <div className="flex gap-1 bg-gray-50 p-1 rounded-lg">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate!, 1))} className="h-6 h-6"><ChevronLeft className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate!, 1))} className="h-6 h-6"><ChevronRight className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center">
                  {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                  {calendarDays.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dStr = format(day, 'yyyy-MM-dd');
                    const sel = selectedDates.has(dStr);
                    return (
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); sel ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                        <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !sel ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                        {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'capacidad', l: 'Capacidad General', i: LayoutDashboard }, 
            { v: 'habilidades', l: 'Habilidades SAP', i: GraduationCap },
            { v: 'mantenimiento', l: 'MTTO Preventivo', i: Wrench }, 
            { v: 'ordenes', l: 'Provisionales', i: Package },
            { v: 'ordenesFert', l: 'Órdenes FERT', i: ShoppingCart }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="capacidad" className="animate-in fade-in duration-300 space-y-12 text-left">
          {[ { id: '1000', label: 'QUITO' }, { id: '2000', label: 'GUAYAQUIL' } ].map(center => {
            const machines = CAPACIDAD_CONFIG_BASE[center.id as '1000' | '2000'];
            const provOrders = center.id === '1000' ? provC1000 : provC2000;
            const fertOrders = center.id === '1000' ? fertC1000 : fertC2000;

            const getMachineLoad = (machineCode: string, orders: any[]) => {
              return orders.filter(o => {
                const m = String(o.MAQUINA || o.RECURSO || '').toUpperCase();
                return m.includes(machineCode.toUpperCase()) || machineCode.toUpperCase().includes(m);
              }).reduce((sum, o) => sum + calculateEngineering(o).hours, 0);
            };

            const centerDispNetaTotal = machines.reduce((sum, m) => {
              const hT1 = manualHours[`${center.id}_${m.code}_t1`] ?? (center.id==='1000' ? m.t1 : defaultOpHour);
              const hT2 = manualHours[`${center.id}_${m.code}_t2`] ?? (center.id==='1000' ? m.t2 : 0);
              const mtto = getMachineMTTO(m.code);
              return sum + ((hT1 + hT2 - PARO_PROG_T1 - PARO_PROG_T2 - mtto) * m.rendimiento);
            }, 0);

            const centerLoadProvTotal = machines.reduce((sum, m) => sum + getMachineLoad(m.code, provOrders), 0);
            const centerLoadFertTotal = machines.reduce((sum, m) => sum + getMachineLoad(m.code, fertOrders), 0);

            return (
              <div key={center.id} className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-800 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-slate-900" /> PLANTA {center.label}
                  </h3>
                </div>

                <Card className="rounded-3xl border border-gray-100 shadow-2xl overflow-hidden bg-white">
                  <table className="w-full border-collapse font-sans text-[10px]">
                    <thead className="bg-white text-slate-400 uppercase font-black tracking-tighter border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-5 text-left bg-gray-50/50 w-56">Máquina / Recurso</th>
                        <th className="px-2 py-5 border-r border-gray-50">T1 (H)</th>
                        <th className="px-2 py-5 border-r border-gray-50">T2 (H)</th>
                        <th className="px-3 py-5 border-r border-gray-50">Paro T1</th>
                        <th className="px-3 py-5 border-r border-gray-50">Paro T2</th>
                        <th className="px-3 py-5 border-r border-gray-50">MTTO (SAP)</th>
                        <th className="px-4 py-5 bg-indigo-50 text-indigo-900 border-r border-gray-100">Disp. Neta (H)</th>
                        <th className="px-4 py-5 text-blue-400 bg-blue-50/20 border-r border-gray-50">Total Ord_Provisionales</th>
                        <th className="px-4 py-5 bg-[#0f172a] text-white">% Ocupación Ord_Prov</th>
                        <th className="px-4 py-5 text-teal-400 bg-teal-50/20 border-r border-gray-50">Total Ord_Fert</th>
                        <th className="px-4 py-5 bg-[#0f172a] text-white">% Ocupación Ord_Fert</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {machines.map(m => {
                        const hT1 = manualHours[`${center.id}_${m.code}_t1`] ?? (center.id==='1000' ? m.t1 : defaultOpHour);
                        const hT2 = manualHours[`${center.id}_${m.code}_t2`] ?? (center.id==='1000' ? m.t2 : 0);
                        const mtto = getMachineMTTO(m.code);
                        const loadProv = getMachineLoad(m.code, provOrders);
                        const loadFert = getMachineLoad(m.code, fertOrders);
                        
                        const netAvailable = (hT1 + hT2 - PARO_PROG_T1 - PARO_PROG_T2 - mtto) * m.rendimiento;
                        const occProv = netAvailable > 0 ? (loadProv / netAvailable) * 100 : 0;
                        const occFert = netAvailable > 0 ? (loadFert / netAvailable) * 100 : 0;
                        
                        return (
                          <tr key={m.code} className="hover:bg-slate-50 transition-colors border-b border-gray-50">
                            <td className="px-6 py-4 text-left">
                              <div className="text-indigo-800 font-black text-sm">{m.code}</div>
                              <div className="text-[8px] text-gray-400 opacity-60 uppercase">{m.name}</div>
                            </td>
                            <td className="px-2 py-4 text-center">
                              <select 
                                className="bg-slate-100/50 border border-slate-200 rounded-lg px-1 py-1 text-[10px] font-black w-16 text-center focus:ring-2 focus:ring-primary outline-none"
                                value={hT1}
                                onChange={e => setManualHours({...manualHours, [`${center.id}_${m.code}_t1`]: Number(e.target.value)})}
                              >
                                {Array.from({length: 13}, (_, i) => <option key={i} value={i}>{i}h</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-4 text-center">
                              <select 
                                className="bg-slate-100/50 border border-slate-200 rounded-lg px-1 py-1 text-[10px] font-black w-16 text-center focus:ring-2 focus:ring-primary outline-none"
                                value={hT2}
                                onChange={e => setManualHours({...manualHours, [`${center.id}_${m.code}_t2`]: Number(e.target.value)})}
                              >
                                {Array.from({length: 13}, (_, i) => <option key={i} value={i}>{i}h</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-4 text-center text-slate-400 font-mono">{PARO_PROG_T1}</td>
                            <td className="px-3 py-4 text-center text-slate-400 font-mono">{PARO_PROG_T2}</td>
                            <td className={cn("px-3 py-4 text-center font-mono", mtto > 0 ? "text-orange-600 bg-orange-50/20" : "text-slate-200")}>
                              {mtto > 0 ? `${mtto}h` : '—'}
                            </td>
                            <td className="px-4 py-4 text-center font-mono font-black text-indigo-700 bg-indigo-50/30 border-r border-gray-100">{netAvailable.toFixed(1)}</td>
                            <td className="px-4 py-4 text-center font-mono text-blue-600 bg-blue-50/10">{loadProv.toFixed(1)}</td>
                            <td className={cn("px-4 py-4 text-center font-mono font-black", occProv > 100 ? "text-red-500" : "text-emerald-400")}>
                              {occProv.toFixed(1)}%
                            </td>
                            <td className="px-4 py-4 text-center font-mono text-teal-600 bg-teal-50/10">{loadFert.toFixed(1)}</td>
                            <td className={cn("px-4 py-4 text-center font-mono font-black", occFert > 100 ? "text-red-500" : "text-emerald-400")}>
                              {occFert.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-[#1e293b] text-white font-black uppercase text-[10px]">
                      <tr>
                        <td colSpan={6} className="px-6 py-4 text-right tracking-widest border-r border-white/10">Totales Planta {center.label}</td>
                        <td className="px-4 py-4 text-center bg-indigo-900 border-r border-white/10">{centerDispNetaTotal.toFixed(2)}</td>
                        <td className="px-4 py-4 text-center bg-blue-900 border-r border-white/10">{centerLoadProvTotal.toFixed(2)}</td>
                        <td className="px-4 py-4 text-center bg-black/40 border-r border-white/10">
                          {centerDispNetaTotal > 0 ? ((centerLoadProvTotal / centerDispNetaTotal) * 100).toFixed(0) : 0}%
                        </td>
                        <td className="px-4 py-4 text-center bg-teal-900 border-r border-white/10">{centerLoadFertTotal.toFixed(2)}</td>
                        <td className="px-4 py-4 text-center bg-black/40">
                          {centerDispNetaTotal > 0 ? ((centerLoadFertTotal / centerDispNetaTotal) * 100).toFixed(0) : 0}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </Card>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="habilidades" className="animate-in fade-in duration-300">
          <Card className="rounded-3xl border border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[650px] relative text-left">
              <table className="w-full border-collapse font-sans text-[10px]">
                <thead className="bg-[#e0e7ff] sticky top-0 z-20 text-indigo-900 uppercase font-black border-b border-indigo-200">
                  <tr>{habilidades.length > 0 && Object.keys(habilidades[0]).map(k => <th key={k} className="px-6 py-4 border-r border-indigo-100 whitespace-nowrap">{k.replace(/_/g, ' ')}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {habilidades.map((h, i) => (
                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                      {Object.keys(h).map(k => <td key={k} className="px-6 py-3 border-r border-gray-100 text-slate-700">{String(h[k] ?? '—')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="mantenimiento" className="animate-in fade-in duration-300 text-left">
          <Card className="rounded-3xl border border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse font-sans text-[10px] text-center">
                <thead className="bg-[#fef3c7] sticky top-0 z-10 text-amber-900 uppercase font-black border-b border-amber-200">
                  <tr>
                    <th className="px-6 py-5 border-r border-amber-100">ID_PLANTA</th>
                    <th className="px-6 py-5 border-r border-amber-100 text-left">PLANTA</th>
                    <th className="px-6 py-5 border-r border-amber-100">ID_AREA</th>
                    <th className="px-6 py-5 border-r border-amber-100 text-left">AREA</th>
                    <th className="px-6 py-5 border-r border-amber-100">ID_MAQUINA</th>
                    <th className="px-6 py-5 border-r border-amber-100 text-left">MAQUINA</th>
                    <th className="px-6 py-5 border-r border-amber-100 text-left">OT_PRG_ID</th>
                    <th className="px-6 py-5 border-r border-amber-100 text-left">FECHA_INI</th>
                    <th className="px-6 py-5 border-r border-amber-100 text-left">FECHA_FIN</th>
                    <th className="px-8 py-5 text-center bg-amber-500/10 text-amber-700">T_MTTO_PLANIFICADO (H)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {mantenimientos.length === 0 ? (
                    <tr><td colSpan={10} className="py-20 text-slate-300 uppercase tracking-widest italic">Sincronizando Mantenimientos SAP...</td></tr>
                  ) : (
                    mantenimientos.map((m, i) => (
                      <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-6 py-4 border-r border-gray-100 text-slate-400">{String(m.ID_PLANTA || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-left uppercase text-slate-600">{String(m.PLANTA || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-slate-400">{String(m.ID_AREA || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-left uppercase text-slate-600">{String(m.AREA || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-indigo-900 font-black">{String(m.ID_MAQUINA || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-left uppercase text-slate-500">{String(m.MAQUINA || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 font-mono text-left text-slate-400">{String(m.OT_PRG_ID || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-left font-mono text-slate-500">{m.FECHA_OT_PRG_INI || m.FECHA_INI || '—'}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-left font-mono text-slate-500">{m.FECHA_OT_PRG_FIN || m.FECHA_FIN || '—'}</td>
                        <td className="px-8 py-4 text-center font-mono font-black text-amber-700 bg-amber-50/50">
                          {calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI, m.FECHA_OT_PRG_FIN || m.FECHA_FIN)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-8 animate-in fade-in duration-300 text-center">
           {[ {t: 'Planta 1000 - Quito', d: provC1000}, {t: 'Planta 2000 - Guayaquil', d: provC2000} ].map((c, i) => (
             <div key={i} className="space-y-4">
                <h3 className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-left px-2">{c.t} (Corte y Laminado)</h3>
                <Card className="rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-center font-sans text-[10px]">
                      <thead className="bg-[#1e293b] text-white uppercase font-black border-b border-white/5">
                        <tr>
                          <th className="px-6 py-5 border-r border-white/5">Orden</th>
                          <th className="px-6 py-5 border-r border-white/5">Fecha</th>
                          <th className="px-6 py-5 border-r border-white/5">Material</th>
                          <th className="px-6 py-5 border-r border-white/10 text-left">Descripción</th>
                          <th className="px-6 py-5 border-r border-white/5">Cant.</th>
                          <th className="px-6 py-5 border-r border-white/5 text-blue-200">Responsable</th>
                          <th className="px-6 py-5 border-r border-white/5">Máquina</th>
                          <th className="px-6 py-5 border-r border-white/10 bg-blue-500/10 text-blue-200">T. INDIV. (min)</th>
                          <th className="px-6 py-5 border-r border-white/10 bg-amber-500/10 text-amber-200">T. TOTAL (H)</th>
                          <th className="px-6 py-5 border-r border-white/5 text-red-400 bg-red-500/10 font-black">CARGAS</th>
                          <th className="px-6 py-5">Alm.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-bold">
                        {c.d.map((o, idx) => {
                          const eng = calculateEngineering(o);
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-6 py-4 text-slate-800 border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                              <td className="px-6 py-4 border-r border-gray-50 text-gray-400 font-mono text-[9px]">{String(o.FECHAINICIO || '').split('T')[0]}</td>
                              <td className="px-6 py-4 font-mono font-black text-red-600 border-r border-gray-50">{cleanCode(eng.code)}</td>
                              <td className="px-6 py-4 text-left border-r border-gray-100 text-slate-600 uppercase truncate max-w-[200px]">{eng.desc}</td>
                              <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 font-mono">{eng.qty}</td>
                              <td className="px-6 py-4 border-r border-gray-50">
                                <Badge variant="outline" className="text-[9px] font-black bg-blue-50 text-blue-700 border-blue-100">
                                  {String(o.RESPCONTROLPROD || '—')}
                                </Badge>
                              </td>
                              <td className="px-6 py-4 font-bold text-slate-400 border-r border-gray-50 uppercase">{o.MAQUINA || '—'}</td>
                              <td className="px-6 py-4 border-r border-white/10 text-blue-700 bg-blue-50/10 font-mono">{eng.indivMin.toFixed(2)}</td>
                              <td className="px-6 py-4 border-r border-white/10 text-amber-700 bg-amber-50/10 font-mono">{eng.hours.toFixed(2)}</td>
                              <td className="px-6 py-4 border-r border-gray-50 text-red-600 bg-red-50/20 font-mono">{eng.loads}</td>
                              <td className="px-6 py-4 text-slate-200">{o.ALMACEN || '—'}</td>
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

        <TabsContent value="ordenesFert" className="space-y-8 animate-in fade-in duration-300 text-center">
           {[ {t: 'Planta 1000 - Quito (Auditoría Global FERT)', d: fertC1000}, {t: 'Planta 2000 - Guayaquil (Auditoría Global FERT)', d: fertC2000} ].map((c, i) => (
             <div key={i} className="space-y-4">
                <h3 className="text-[11px] font-black uppercase text-slate-400 tracking-widest text-left px-2">{c.t} - Visualización Sin Filtros</h3>
                <Card className="rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full text-center font-sans text-[9px]">
                      <thead className="bg-[#1e293b] text-white uppercase font-black border-b border-white/5">
                        <tr>
                          <th className="px-3 py-5 border-r border-white/5">Orden</th>
                          <th className="px-3 py-5 border-r border-white/5">Fecha</th>
                          <th className="px-3 py-5 border-r border-white/5">Material</th>
                          <th className="px-6 py-5 border-r border-white/10 text-left">Descripción</th>
                          <th className="px-3 py-5 border-r border-white/5 text-blue-300">Categoría</th>
                          <th className="px-3 py-5 border-r border-white/5">Cant.</th>
                          <th className="px-2 py-5 border-r border-white/5 text-slate-400">UM</th>
                          <th className="px-4 py-5 border-r border-white/5 text-indigo-300">Responsable</th>
                          <th className="px-3 py-5 border-r border-white/5 text-teal-300">Máquina</th>
                          <th className="px-4 py-5 border-r border-white/10 bg-blue-500/10 text-blue-200">T. INDIV. (min)</th>
                          <th className="px-4 py-5 border-r border-white/10 bg-amber-500/10 text-amber-200">T. TOTAL (H)</th>
                          <th className="px-3 py-5 border-r border-white/5 text-red-400 bg-red-500/10 font-black">CARGAS</th>
                          <th className="px-4 py-5">Almacén</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-bold">
                        {c.d.map((o, idx) => {
                          const eng = calculateEngineering(o);
                          const description = String(o.MATERIAL || '').replace(/^\d+\s*/, '') || o.NOMBRE || '—';
                          return (
                            <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-3 py-4 text-slate-800 border-r border-gray-50">{o.ORDEN || '—'}</td>
                              <td className="px-3 py-4 border-r border-gray-50 text-gray-400 font-mono text-[8px]">{String(o.FECHA || '').split('T')[0]}</td>
                              <td className="px-3 py-4 font-mono font-black text-red-600 border-r border-gray-50 tracking-tighter">{cleanCode(eng.code)}</td>
                              <td className="px-6 py-4 text-left border-r border-gray-100 text-slate-600 uppercase truncate max-w-[150px]">{description}</td>
                              <td className="px-3 py-4 border-r border-gray-50 text-indigo-400 text-[8px] uppercase font-black">{String(o.CATEGORIA || '—')}</td>
                              <td className="px-3 py-4 font-black text-slate-900 border-r border-gray-50 font-mono">{o.CANTIDAD || 0}</td>
                              <td className="px-2 py-4 border-r border-gray-50 text-slate-300 text-[8px]">{o.UNIDAD || '—'}</td>
                              <td className="px-4 py-4 border-r border-gray-50">
                                <Badge variant="outline" className="text-[8px] font-black bg-indigo-50 text-indigo-700 border-indigo-100">
                                  {String(o.RESPCONTROLPROD || '—')}
                                </Badge>
                              </td>
                              <td className="px-3 py-4 font-bold text-indigo-500 border-r border-gray-50 uppercase">{o.MAQUINA || o.RECURSO || '—'}</td>
                              <td className="px-4 py-4 border-r border-white/10 text-blue-700 bg-blue-50/10 font-mono">{eng.indivMin.toFixed(2)}</td>
                              <td className="px-4 py-4 border-r border-white/10 text-amber-700 bg-amber-50/10 font-mono">{eng.hours.toFixed(2)}</td>
                              <td className="px-3 py-4 border-r border-gray-50 text-red-600 bg-red-50/20 font-mono">{eng.loads}</td>
                              <td className="px-4 py-4 text-slate-200 text-[8px]">{o.ALMACEN || '—'}</td>
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
      
      <div className="mt-8 p-5 bg-blue-50 border border-blue-100 rounded-3xl flex items-start gap-4">
        <div className="p-3 bg-blue-600 text-white rounded-2xl shadow-lg"><Info className="w-5 h-5" /></div>
        <div className="text-left">
          <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest mb-1">Nota de Ingeniería de Planta</h4>
          <p className="text-[10px] text-blue-700 leading-relaxed font-bold uppercase opacity-80">
            El modelo de capacidad aplica un factor de eficiencia técnica del 90% en Quito y 70% en GYE. 
            El cálculo de cargas está basado en el diámetro del carrusel de 320cm y un gap efectivo de 31.5cm por bloque.
          </p>
        </div>
      </div>
    </div>
  );
};