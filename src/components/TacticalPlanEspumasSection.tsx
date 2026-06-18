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
  Check,
  TrendingUp,
  ShoppingCart,
  RefreshCw,
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
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

// Constantes de Ingeniería
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

    const matchTime = tiemposEnsamblado.find(t => String(t.CodMaterial).slice(-8) === info.code);
    const sapSecPerUnit = safeNum(matchTime?.Tiempo || 0);
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
      setMantenimientos(maint.data || []);
      setHabilidades(Array.isArray(habs.data) ? habs.data : []);
      
      addNotification('success', 'Datos sincronizados correctamente desde SAP.');
    } catch (e) {
      console.error('Error init TacticalPlanEspumas:', e);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => { if (mounted) initData(); }, [mounted, initData]);

  const uniqueMantenimientos = useMemo(() => {
    const seenMachine = new Set<string>();
    return mantenimientos.filter(m => {
      const machineId = String(m.ID_MAQUINA || m.MAQUINA || '').trim();
      if (!machineId) return true; 
      if (seenMachine.has(machineId)) return false;
      seenMachine.add(machineId);
      return true;
    });
  }, [mantenimientos]);

  const getMachineMTTO = (maquinaCode: string) => {
    if (selectedDates.size === 0) return 0;
    return uniqueMantenimientos
      .filter(m => {
        const mMachine = String(m.ID_MAQUINA || m.MAQUINA || '').toUpperCase();
        return mMachine.includes(maquinaCode.toUpperCase()) || maquinaCode.toUpperCase().includes(mMachine);
      })
      .reduce((sum, m) => {
        const durStr = calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI || m.FECHA_PRO, m.FECHA_OT_PRG_FIN || m.FECHA_FIN || m.FECHA_PRO);
        return sum + safeNum(durStr);
      }, 0);
  };

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    [...ordenes, ...ordenesFert].forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes, ordenesFert, mounted]);

  const calendarDays = useMemo(() => {
    if (!mounted || !viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

  const filterData = (data: any[], centro: string, applyRestrictions: boolean = true) => {
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    const groupIds = relevantGroups.map(g => g.codigo_grupo);
    const groupRest = restriccionesArray.filter(r => groupIds.includes(r.codigo_grupo));

    const respCodes = applyRestrictions ? groupRest
      .filter(r => r.nombre_restriccion === 'RESPCONTROLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '') : [];
    
    const almCodes = applyRestrictions ? groupRest
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '') : [];

    return data.filter(o => {
      const c = String(o.CENTRO || o.Centro || '').trim();
      if (c !== centro) return false;
      
      if (applyRestrictions) {
        const itemAlm = String(o.ALMACEN || o.Almacen || '').trim();
        const matchAlm = almCodes.length === 0 || almCodes.includes(itemAlm);
        if (!matchAlm) return false;

        const itemResp = String(o.RESPCONTROLPROD || o.RespControlProd || '').trim();
        const matchResp = respCodes.length === 0 || respCodes.includes(itemResp);
        if (!matchResp) return false;
      }

      if (selectedDates.size > 0) {
        const dFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = dFull.includes('T') ? dFull.split('T')[0] : dFull;
        if (!selectedDates.has(itemDate)) return false;
      }
      return true;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000', true), [ordenes, grupos, restriccionesArray, selectedDates]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000', true), [ordenes, grupos, restriccionesArray, selectedDates]);
  
  // ÓRDENES FERT: SIN FILTROS DE RESPONSABLE/ALMACEN SEGÚN SOLICITUD
  const fertC1000 = useMemo(() => filterData(ordenesFert, '1000', false), [ordenesFert, selectedDates]);
  const fertC2000 = useMemo(() => filterData(ordenesFert, '2000', false), [ordenesFert, selectedDates]);

  const defaultOpHour = useMemo(() => {
    const clGroup = grupos.find(g => g.nombre_grupo.toLowerCase().includes('corte y laminado'));
    const htRest = clGroup ? restriccionesArray.find(r => r.codigo_grupo === clGroup.codigo_grupo && r.nombre_restriccion === 'HORAS_TRABAJO') : null;
    return safeNum(htRest?.valor_restriccion) || 8;
  }, [grupos, restriccionesArray]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Coche 2m | Ingeniería de Planta | Engineering Model v2.2</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={initData} disabled={isLoading} variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Actualizar
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
                <Filter className="w-3 h-3 text-primary" /> {selectedDates.size === 0 ? 'Filtro Fecha' : `${selectedDates.size} Días`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
              <div className="bg-white p-3 font-sans text-left">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-gray-800 capitalize">{viewDate ? format(viewDate, 'MMMM yyyy', { locale: es }) : ''}</h3>
                  <div className="flex gap-1">
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
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); sel ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
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

        <TabsContent value="capacidad" className="animate-in fade-in duration-300 space-y-8">
          {[ { id: '1000', label: 'QUITO' }, { id: '2000', label: 'GUAYAQUIL' } ].map(center => {
            const machines = CAPACIDAD_CONFIG_BASE[center.id as '1000' | '2000'];
            const totalPlan = machines.reduce((sum, m) => sum + [...filterData(ordenes, center.id), ...filterData(ordenesFert, center.id, false)].reduce((s, o) => s + calculateEngineering(o).hours, 0), 0);
            return (
              <div key={center.id} className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-tighter text-slate-800 px-2 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-900" /> CENTRO {center.label}
                </h3>
                <Card className="rounded-[2rem] border border-gray-200 shadow-2xl overflow-hidden bg-white">
                  <table className="w-full border-collapse font-sans text-[10px]">
                    <thead className="bg-[#4a69bd] text-white uppercase font-black tracking-tighter">
                      <tr>
                        <th rowSpan={2} className="px-6 py-4 border-r border-white/10 text-left bg-slate-900 w-52">Recurso Operativo</th>
                        {machines.map(m => <th key={m.code} className="px-4 py-4 border-r border-white/10">{m.code}</th>)}
                        <th className="px-6 py-4 bg-slate-950 text-indigo-400 border-l-2 border-indigo-500/30">TOTAL PLANTA</th>
                      </tr>
                      <tr className="bg-slate-800 text-[8px]">
                        {machines.map(m => <th key={`${m.code}-n`} className="px-4 py-2 border-r border-white/10">{m.name}</th>)}
                        <th className="px-4 py-2 bg-slate-900 text-slate-400 border-l-2 border-indigo-500/30">Consolidado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-bold">
                      {['Turno 1 [H]', 'Turno 2 [H]', 'Paro Prog. T1', 'Paro Prog. T2', 'MTTO SAP'].map(rowLabel => (
                        <tr key={rowLabel} className="hover:bg-slate-50">
                          <td className="px-6 py-2 border-r border-gray-100 bg-gray-50/50 uppercase">{rowLabel}</td>
                          {machines.map(m => {
                            if (rowLabel.includes('Turno')) {
                              const tKey = rowLabel.includes('1') ? 't1' : 't2';
                              return (
                                <td key={`${m.code}-${tKey}`} className="px-4 py-2 border-r border-gray-100 text-center">
                                  <select className="bg-transparent border border-indigo-100 rounded text-[10px]" value={manualHours[`${center.id}_${m.code}_${tKey}`] ?? (tKey==='t1' ? defaultOpHour : (center.id==='1000' ? m.t2 : 0))} onChange={e => setManualHours({...manualHours, [`${center.id}_${m.code}_${tKey}`]: Number(e.target.value)})}>
                                    {Array.from({length: 13}, (_, i) => <option key={i} value={i}>{i}h</option>)}
                                  </select>
                                </td>
                              );
                            }
                            if (rowLabel.includes('Paro')) return <td key={`${m.code}-p`} className="px-4 py-2 border-r border-gray-100 text-center font-mono text-red-600/50">{rowLabel.includes('1') ? PARO_PROG_T1 : PARO_PROG_T2}</td>;
                            return <td key={`${m.code}-m`} className="px-4 py-2 border-r border-gray-100 text-center font-mono text-orange-600">{getMachineMTTO(m.code) > 0 ? `${getMachineMTTO(m.code)}h` : '—'}</td>;
                          })}
                          <td className="px-4 py-2 text-center font-mono bg-slate-50 border-l-2 border-indigo-500/10">—</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-6 animate-in fade-in duration-300">
           {[ {t: 'Planta 1000 - Quito', d: provC1000}, {t: 'Planta 2000 - GYE', d: provC2000} ].map((c, i) => (
             <Card key={i} className="rounded-3xl border border-gray-100 shadow-xl overflow-hidden bg-white">
                <div className="bg-[#1e293b] px-6 py-4 border-b border-gray-100"><h3 className="text-xs font-black text-white uppercase tracking-widest">{c.t} (Provisionales)</h3></div>
                <div className="overflow-x-auto"><table className="w-full text-center font-sans text-[9px]"><thead className="bg-slate-900 text-white uppercase font-black text-[8px] sticky top-0"><tr><th className="px-6 py-5 border-r border-white/5">Orden</th><th className="px-6 py-5 border-r border-white/5">Fecha</th><th className="px-6 py-5 border-r border-white/5">Material</th><th className="px-6 py-5 border-r border-white/10 text-left">Descripción</th><th className="px-6 py-5 border-r border-white/5">Cant.</th><th className="px-6 py-5 border-r border-white/5">Responsable</th><th className="px-6 py-5 border-r border-white/5">Máquina</th><th className="px-6 py-5 border-r border-white/10">T. INDIV.</th><th className="px-6 py-5 border-r border-white/10">T. TOTAL (H)</th><th className="px-6 py-5 border-r border-white/5">CARGAS</th><th className="px-6 py-5">Alm.</th></tr></thead>
                <tbody className="divide-y divide-gray-50 font-bold">{c.d.map((o, idx) => { const eng = calculateEngineering(o); return (
                  <tr key={idx} className="hover:bg-slate-50/50"><td className="px-6 py-4 text-slate-800 border-r border-gray-50">{o.ORDENPREVISIONAL || '—'}</td><td className="px-6 py-4 border-r border-gray-50 text-gray-400">{String(o.FECHAINICIO || '').split('T')[0]}</td><td className="px-6 py-4 font-mono font-black text-red-600 border-r border-gray-50">{cleanCode(eng.code)}</td><td className="px-6 py-4 text-left border-r border-gray-100 text-slate-600 uppercase truncate max-w-[200px]">{eng.desc}</td><td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 font-mono">{eng.qty}</td><td className="px-6 py-4 border-r border-gray-50"><Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700">{o.RESPCONTROLPROD || '—'}</Badge></td><td className="px-6 py-4 font-bold text-slate-400 border-r border-gray-50 uppercase">{o.MAQUINA || '—'}</td><td className="px-6 py-4 border-r border-white/10 text-blue-700">{eng.indivMin.toFixed(2)}</td><td className="px-6 py-4 border-r border-white/10 text-amber-700">{eng.hours.toFixed(2)}</td><td className="px-6 py-4 border-r border-gray-50 text-red-600 bg-red-50/20">{eng.loads}</td><td className="px-6 py-4 text-slate-200">{o.ALMACEN || '—'}</td></tr>
                );})}</tbody></table></div>
             </Card>
           ))}
        </TabsContent>

        <TabsContent value="ordenesFert" className="space-y-6 animate-in fade-in duration-300">
           {[ {t: 'Planta 1000 - Quito (Órdenes FERT)', d: fertC1000}, {t: 'Planta 2000 - GYE (Órdenes FERT)', d: fertC2000} ].map((c, i) => (
             <Card key={i} className="rounded-3xl border border-gray-100 shadow-xl overflow-hidden bg-white">
                <div className="bg-[#1e293b] px-6 py-4 border-b border-gray-100"><h3 className="text-xs font-black text-white uppercase tracking-widest">{c.t} - VISUALIZACIÓN COMPLETA SAP</h3></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-center font-sans text-[9px]">
                    <thead className="bg-slate-900 text-white uppercase font-black text-[8px] sticky top-0">
                      <tr>
                        <th className="px-6 py-5 border-r border-white/5">Orden</th>
                        <th className="px-6 py-5 border-r border-white/5">Fecha</th>
                        <th className="px-6 py-5 border-r border-white/5">Material</th>
                        <th className="px-6 py-5 border-r border-white/10 text-left">Descripción</th>
                        <th className="px-6 py-5 border-r border-white/5">Categoría</th>
                        <th className="px-6 py-5 border-r border-white/5">Cant.</th>
                        <th className="px-6 py-5 border-r border-white/5">UM</th>
                        <th className="px-6 py-5 border-r border-white/5">Responsable</th>
                        <th className="px-6 py-5 border-r border-white/5 text-indigo-300">Máquina</th>
                        <th className="px-6 py-5 border-r border-white/10 bg-blue-500/10 text-blue-200">T. INDIV.</th>
                        <th className="px-6 py-5 border-r border-white/10 bg-amber-500/10 text-amber-200">T. TOTAL (H)</th>
                        <th className="px-6 py-5 border-r border-white/5 text-red-400 bg-red-500/10 font-black">CARGAS</th>
                        <th className="px-6 py-5">Alm.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {c.d.map((o, idx) => {
                        const eng = calculateEngineering(o);
                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 text-slate-800 border-r border-gray-50">{o.ORDEN || '—'}</td>
                            <td className="px-6 py-4 border-r border-gray-50 text-gray-400">{String(o.FECHA || '').split('T')[0]}</td>
                            <td className="px-6 py-4 font-mono font-black text-red-600 border-r border-gray-50">{cleanCode(eng.code)}</td>
                            <td className="px-6 py-4 text-left border-r border-gray-100 text-slate-600 uppercase truncate max-w-[150px]">{eng.desc}</td>
                            <td className="px-6 py-4 border-r border-gray-50 text-indigo-400 text-[8px] uppercase">{o.CATEGORIA || '—'}</td>
                            <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 font-mono">{o.CANTIDAD || o.CANTPROGRAMADA || 0}</td>
                            <td className="px-6 py-4 border-r border-gray-50 text-slate-300">{o.UNIDAD || '—'}</td>
                            <td className="px-6 py-4 border-r border-gray-50"><Badge variant="outline" className="text-[9px] bg-indigo-50 text-indigo-700 border-indigo-100">{o.RESPCONTROLPROD || '—'}</Badge></td>
                            <td className="px-6 py-4 font-bold text-indigo-500 border-r border-gray-50 uppercase">{o.MAQUINA || '—'}</td>
                            <td className="px-6 py-4 border-r border-white/10 text-blue-700 bg-blue-50/10">{eng.indivMin.toFixed(2)}</td>
                            <td className="px-6 py-4 border-r border-white/10 text-amber-700 bg-amber-50/10">{eng.hours.toFixed(2)}</td>
                            <td className="px-6 py-4 border-r border-gray-50 text-red-600 bg-red-50/20">{eng.loads}</td>
                            <td className="px-6 py-4 text-slate-200">{o.ALMACEN || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
             </Card>
           ))}
        </TabsContent>

        {/* OTROS TABS PRESERVADOS SIN MODIFICACIÓN */}
        <TabsContent value="habilidades" className="animate-in fade-in duration-300">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[650px] relative text-left">
              <table className="w-full border-collapse font-sans text-[9px]"><thead className="bg-[#e0e7ff] sticky top-0 z-20 text-indigo-900 uppercase font-black border-b border-indigo-200">
              <tr>{habilidades.length > 0 && Object.keys(habilidades[0]).map(k => <th key={k} className="px-4 py-3 border-r border-indigo-100 whitespace-nowrap">{k.replace(/_/g, ' ')}</th>)}</tr></thead>
              <tbody className="divide-y divide-gray-100 font-bold">{habilidades.map((h, i) => (<tr key={i} className="hover:bg-indigo-50/30">{Object.keys(h).map(k => <td key={k} className="px-4 py-2 border-r border-gray-100 text-slate-700">{String(h[k] ?? '—')}</td>)}</tr>))}</tbody></table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
           <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative text-center"><table className="w-full border-collapse font-sans text-[10px]"><thead className="bg-[#fef3c7] sticky top-0 z-10 text-amber-900 uppercase font-black border-b border-amber-200">
            <tr><th className="px-4 py-4 border-r border-amber-100">ID_PLANTA</th><th className="px-4 py-4 border-r border-amber-100 text-left">PLANTA</th><th className="px-4 py-4 border-r border-amber-100">ID_AREA</th><th className="px-4 py-4 border-r border-amber-100 text-left">AREA</th><th className="px-4 py-4 border-r border-amber-100">ID_MAQUINA</th><th className="px-4 py-4 border-r border-amber-100 text-left">MAQUINA</th><th className="px-4 py-4 border-r border-amber-100 text-left">OT_PRG_ID</th><th className="px-4 py-4 border-r border-amber-100 text-left">FECHA_INI</th><th className="px-4 py-4 border-r border-amber-100 text-left">FECHA_FIN</th><th className="px-4 py-4 text-center bg-amber-500/10">T_MTTO (H)</th></tr></thead>
            <tbody className="divide-y divide-gray-100 font-bold">{uniqueMantenimientos.map((m, i) => (<tr key={i} className="hover:bg-amber-50/30"><td className="px-4 py-3 border-r border-gray-100">{String(m.ID_PLANTA || '—')}</td><td className="px-4 py-3 border-r border-gray-100 text-left uppercase">{String(m.PLANTA || '—')}</td><td className="px-4 py-3 border-r border-gray-100">{String(m.ID_AREA || '—')}</td><td className="px-4 py-3 border-r border-gray-100 text-left uppercase">{String(m.AREA || '—')}</td><td className="px-4 py-3 border-r border-gray-100 text-indigo-900 font-black">{String(m.ID_MAQUINA || '—')}</td><td className="px-4 py-3 border-r border-gray-100 text-left uppercase">{String(m.MAQUINA || '—')}</td><td className="px-4 py-3 border-r border-gray-100 font-mono text-left">{String(m.OT_PRG_ID || '—')}</td><td className="px-4 py-3 border-r border-gray-100 text-left font-mono">{m.FECHA_OT_PRG_INI || '—'}</td><td className="px-4 py-3 border-r border-gray-100 text-left font-mono">{m.FECHA_OT_PRG_FIN || '—'}</td><td className="px-4 py-3 text-center font-mono font-black text-amber-700">{calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI, m.FECHA_OT_PRG_FIN || m.FECHA_FIN)}</td></tr>))}</tbody></table></div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
