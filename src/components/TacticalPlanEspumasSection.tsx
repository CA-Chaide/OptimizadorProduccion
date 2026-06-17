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
  ShoppingCart
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
 * --- CONSTANTES DE INGENIERÍA DE PLANTA ---
 */
const CARRUSEL_DIAMETER_CM = 320;
const CIRCUMFERENCE = Math.PI * CARRUSEL_DIAMETER_CM; // ~1005.31 cm
const BASE_GAP_CM = 30; 
const MANIPULATION_FACTOR = 1.05; 
const EFFECTIVE_GAP_CM = BASE_GAP_CM * MANIPULATION_FACTOR; 
const BLOCK_20M_CM = 2000; 
const MAX_STACK_HEIGHT_CM = 200; 

const SECONDS_PER_LOAD_VUELTA = 300; 
const SECONDS_PER_MANEUVER_DESC = 45; 

const PARO_PROG_T1 = 1.27;
const PARO_PROG_T2 = 0.77;

const CAPACIDAD_CONFIG = {
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

const OPERATIVE_BASE = {
  '1000': [
    { maquina: 'CNC01 - CNC Giotto', puesto: 'CNC01', code: 'CNC01' },
    { maquina: 'CR01 - Carrusel 1 (HR-CAR01)', puesto: 'HR-CAR01', code: 'CR01' },
    { maquina: 'CR03 - Carrusel 3', puesto: 'HR-CAR03', code: 'CR03' },
    { maquina: 'CR04 - Carrusel 4', puesto: 'HR-CAR02', code: 'CR04' }
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

const formatNum = (val: any, decimals: number = 2): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

/**
 * Parsea fechas con formato DD/MM/YYYY HH:mm o ISO
 */
const parseSAPDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str || str === 'null' || str === 'undefined') return null;

  // Caso 1: Formato regional DD/MM/YYYY HH:mm
  if (str.includes('/')) {
    const [datePart, timePart] = str.split(' ');
    const [day, month, year] = datePart.split('/').map(Number);
    const [hours, minutes] = timePart ? timePart.split(':').map(Number) : [0, 0];
    const date = new Date(year, month - 1, day, hours, minutes);
    return isNaN(date.getTime()) ? null : date;
  }

  // Caso 2: Formato ISO
  const isoDate = new Date(str);
  return isNaN(isoDate.getTime()) ? null : isoDate;
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumenOperativo');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
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
  }, []);

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
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) initData();
  }, [mounted, initData]);

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    const allData = [...ordenes, ...ordenesFert];
    allData.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || o.fecha_inicio || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
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

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.CodMaterial || '').trim();
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
    return { code, desc, ...dims };
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

  const filterData = (data: any[], centro: string) => {
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    const groupIds = relevantGroups.map(g => g.codigo_grupo);
    const groupRest = restriccionesArray.filter(r => groupIds.includes(r.codigo_grupo));

    const respCodes = groupRest
      .filter(r => r.nombre_restriccion === 'RESPCONTROLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almCodes = groupRest
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return data.filter(o => {
      const c = String(o.CENTRO || o.Centro || o.centro || '').trim();
      if (c !== centro) return false;
      
      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      const matchAlm = almCodes.length === 0 || almCodes.includes(itemAlmValue);
      if (!matchAlm) return false;

      const itemResp = String(o.RESPCONTROLPROD || o.RespControlProd || o.RESP_CONTROL_PROD || o.RespCtrlProd || '').trim();
      const matchResp = respCodes.length === 0 || respCodes.includes(itemResp);
      if (!matchResp) return false;

      if (selectedDate !== 'all') {
        const dFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = dFull.includes('T') ? dFull.split('T')[0] : dFull;
        if (itemDate !== selectedDate) return false;
      }
      return true;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restriccionesArray, selectedDate]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restriccionesArray, selectedDate]);
  const fertC1000 = useMemo(() => filterData(ordenesFert, '1000'), [ordenesFert, grupos, restriccionesArray, selectedDate]);
  const fertC2000 = useMemo(() => filterData(ordenesFert, '2000'), [ordenesFert, grupos, restriccionesArray, selectedDate]);

  const getMachineMTTO = (maquinaCode: string) => {
    if (selectedDate === 'all') return 0;
    return mantenimientos
      .filter(m => {
        const dStr = String(m.FECHA_OT_PRG_INI || m.FECHA_PRO || m.FECHA_INI || '').trim();
        let normalizedDate = '';
        if (dStr.includes('T')) normalizedDate = dStr.split('T')[0];
        else if (dStr.includes('/')) {
          const parts = dStr.split(' ')[0].split('/');
          if (parts.length === 3) normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        } else normalizedDate = dStr;

        const mMachine = String(m.ID_MAQUINA || m.MAQUINA || '').toUpperCase();
        return normalizedDate === selectedDate && (mMachine.includes(maquinaCode.toUpperCase()) || maquinaCode.toUpperCase().includes(mMachine));
      })
      .reduce((sum, m) => sum + safeNum(m.T_MTTO_PLANIFICADO || m.TIEMPO), 0);
  };

  const getCenterPlannedHoursTotal = (centro: string) => {
    const provData = centro === '1000' ? provC1000 : provC2000;
    const fertData = centro === '1000' ? fertC1000 : fertC2000;
    return [...provData, ...fertData].reduce((sum, o) => sum + calculateEngineering(o).hours, 0);
  };

  const formatMTTODate = (dateStr: any) => {
    const d = parseSAPDate(dateStr);
    if (!d) return '—';
    return format(d, 'dd/MM/yyyy HH:mm', { locale: es });
  };

  const calculateMTTOCapacity = (start: any, end: any): string => {
    const s = parseSAPDate(start);
    const e = parseSAPDate(end);
    if (!s || !e) return '0.0';
    const diffHrs = (e.getTime() - s.getTime()) / (1000 * 60 * 60);
    return Math.max(0, diffHrs).toFixed(1);
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
            <p className="text-xs text-gray-500 font-medium">Coche 2m | Ingeniería de Planta | Engineering Model v2.2</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-6 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumenOperativo', l: 'Resumen Operativo', i: Activity },
            { v: 'resumen', l: 'Capacidad General', i: LayoutDashboard }, 
            { v: 'habilidades', l: 'Habilidades SAP', i: GraduationCap },
            { v: 'mantenimiento', l: 'MTTO Preventivo', i: Wrench }, 
            { v: 'ordenes', l: 'Provisionales', i: Package },
            { v: 'ordenesFert', l: 'FERT', i: ShoppingCart }
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
                      <div className="flex items-center justify-between mb-3 text-left">
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
                            <button key={dStr} onClick={() => setSelectedDate(sel ? 'all' : dStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                              <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !sel ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                              {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
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

          <div className="grid grid-cols-1 gap-6">
            {Object.entries(OPERATIVE_BASE).map(([centro, machines]) => (
              <Card key={centro} className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-gray-100 font-black uppercase text-[10px] tracking-widest text-slate-500">Centro {centro}</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px] font-bold">
                    <thead className="bg-slate-800 text-white uppercase tracking-tighter">
                      <tr>
                        <th className="px-4 py-3 text-left w-56">Máquina</th>
                        <th className="px-4 py-3 text-center">Cant. Planificada</th>
                        <th className="px-4 py-3 text-center">Horas Req.</th>
                        <th className="px-4 py-3 text-center">Auditado SAP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {machines.map((m) => {
                        const prov = centro === '1000' ? provC1000 : provC2000;
                        const fert = centro === '1000' ? fertC1000 : fertC2000;
                        const machOrders = [...prov, ...fert].filter(o => String(o.MAQUINA || o.RECURSO || '').toUpperCase().includes(m.code));
                        const totalQty = machOrders.reduce((sum, o) => sum + safeNum(o.CANTIDAD || o.CANTPROGRAMADA), 0);
                        const totalHours = machOrders.reduce((sum, o) => sum + calculateEngineering(o).hours, 0);
                        return (
                          <tr key={m.code} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-slate-800 font-black uppercase">{m.maquina}</td>
                            <td className="px-4 py-3 text-center font-mono">{totalQty > 0 ? formatNum(totalQty, 0) : '—'}</td>
                            <td className="px-4 py-3 text-center font-mono text-indigo-600">{totalHours > 0 ? `${totalHours.toFixed(2)}h` : '—'}</td>
                            <td className="px-4 py-3 text-center text-slate-400">✓</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="resumen" className="animate-in fade-in duration-300 space-y-8">
          <div className="grid grid-cols-1 gap-12">
            {Object.entries(CAPACIDAD_CONFIG).map(([centro, machines]) => {
              const totalT1 = machines.reduce((sum, m) => sum + m.t1, 0);
              const totalT2 = machines.reduce((sum, m) => sum + m.t2, 0);
              const totalParo1 = PARO_PROG_T1 * machines.length;
              const totalParo2 = PARO_PROG_T2 * machines.length;
              const totalMTTO = machines.reduce((sum, m) => sum + getMachineMTTO(m.code), 0);
              
              const totalDisponibleBruto = machines.reduce((sum, m) => {
                const mtto = getMachineMTTO(m.code);
                return sum + (m.t1 + m.t2 - PARO_PROG_T1 - PARO_PROG_T2 - mtto);
              }, 0);

              const totalDisponibleReal = machines.reduce((sum, m) => {
                const mtto = getMachineMTTO(m.code);
                const base = m.t1 + m.t2 - PARO_PROG_T1 - PARO_PROG_T2 - mtto;
                return sum + (base * m.rendimiento);
              }, 0);

              const totalPlanificado = getCenterPlannedHoursTotal(centro);
              const totalOcupacion = totalDisponibleReal > 0 ? (totalPlanificado / totalDisponibleReal) * 100 : 0;

              return (
                <div key={centro} className="space-y-4">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3 text-left">
                      <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg"><Activity className="w-4 h-4" /></div>
                      <h3 className="text-sm font-black uppercase tracking-tighter text-slate-800">CENTRO {centro === '1000' ? 'QUITO' : 'GUAYAQUIL'}</h3>
                    </div>
                    <Badge className="bg-yellow-400 text-black font-black text-[9px] uppercase px-4 shadow-sm border-none">Periodo: {selectedDate === 'all' ? 'PLAN CONSOLIDADO' : selectedDate}</Badge>
                  </div>
                  <Card className="rounded-3xl border border-gray-200 shadow-2xl overflow-hidden bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse font-sans text-[10px]">
                        <thead className="bg-[#4a69bd] text-white uppercase font-black tracking-tighter">
                          <tr>
                            <th rowSpan={2} className="px-6 py-4 border-r border-white/10 text-left bg-slate-900 w-52">Recurso Operativo</th>
                            {machines.map(m => <th key={m.code} className="px-4 py-4 border-r border-white/10">{m.code}</th>)}
                            <th className="px-6 py-4 bg-slate-950 text-indigo-400 border-l-2 border-indigo-500/30">TOTAL PLANTA</th>
                          </tr>
                          <tr className="bg-slate-800 text-[8px]">
                            {machines.map(m => <th key={`${m.code}-name`} className="px-4 py-2 border-r border-white/10 font-bold max-w-[100px] truncate">{m.name}</th>) }
                            <th className="px-4 py-2 bg-slate-900 text-slate-400 border-l-2 border-indigo-500/30">Consolidado</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-bold">
                          <tr className="hover:bg-slate-50">
                            <td className="px-6 py-2 border-r border-gray-100 bg-gray-50/50 uppercase">Turno 1 [H]</td>
                            {machines.map(m => <td key={`${m.code}-t1`} className="px-4 py-2 border-r border-gray-100 text-center font-mono">{m.t1}</td>)}
                            <td className="px-4 py-2 text-center font-mono bg-slate-50 border-l-2 border-indigo-500/10">{totalT1.toFixed(1)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50">
                            <td className="px-6 py-2 border-r border-gray-100 bg-gray-50/50 uppercase">Turno 2 [H]</td>
                            {machines.map(m => <td key={`${m.code}-t2`} className="px-4 py-2 border-r border-gray-100 text-center font-mono">{m.t2}</td>)}
                            <td className="px-4 py-2 text-center font-mono bg-slate-50 border-l-2 border-indigo-500/10">{totalT2.toFixed(1)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50 text-red-600/70 text-left">
                            <td className="px-6 py-2 border-r border-gray-100 bg-gray-50/50 uppercase">Paro Prog. T1</td>
                            {machines.map(m => <td key={`${m.code}-p1`} className="px-4 py-2 border-r border-gray-100 text-center font-mono">{PARO_PROG_T1}</td>)}
                            <td className="px-4 py-2 text-center font-mono bg-red-50/20 border-l-2 border-indigo-500/10">{totalParo1.toFixed(2)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50 text-red-600/70 text-left">
                            <td className="px-6 py-2 border-r border-gray-100 bg-gray-50/50 uppercase">Paro Prog. T2</td>
                            {machines.map(m => <td key={`${m.code}-p2`} className="px-4 py-2 border-r border-gray-100 text-center font-mono">{PARO_PROG_T2}</td>)}
                            <td className="px-4 py-2 text-center font-mono bg-red-50/20 border-l-2 border-indigo-500/10">{totalParo2.toFixed(2)}</td>
                          </tr>
                          <tr className="hover:bg-slate-50 text-orange-600">
                            <td className="px-6 py-2 border-r border-gray-100 bg-gray-50/50 uppercase">MTTO Preventivo</td>
                            {machines.map(m => <td key={`${m.code}-mtto`} className="px-4 py-2 border-r border-gray-100 text-center font-mono">{getMachineMTTO(m.code) > 0 ? getMachineMTTO(m.code) : '—'}</td>)}
                            <td className="px-4 py-2 text-center font-mono bg-orange-50/30 border-l-2 border-indigo-500/10">{totalMTTO > 0 ? totalMTTO.toFixed(1) : '—'}</td>
                          </tr>
                          <tr className="bg-slate-900 text-slate-300">
                            <td className="px-6 py-2 border-r border-white/5 uppercase font-black">Disponibilidad Neta</td>
                            {machines.map(m => <td key={`${m.code}-net`} className="px-4 py-2 border-r border-white/5 text-center font-mono text-slate-600">—</td>)}
                            <td className="px-4 py-2 text-center font-black font-mono border-l-2 border-indigo-500/30 text-indigo-300">{totalDisponibleBruto.toFixed(2)}</td>
                          </tr>
                          <tr className="bg-yellow-400">
                            <td className="px-6 py-3 border-r border-black/10 uppercase font-black text-slate-800">T. TOTAL DISPONIBLE [H]</td>
                            {machines.map(m => <td key={`${m.code}-disp-cell`} className="px-4 py-3 border-r border-black/10 text-center font-black font-mono text-yellow-600">—</td>)}
                            <td className="px-4 py-3 text-center font-black font-mono bg-yellow-400 text-black border-l-2 border-black/20">{totalDisponibleReal.toFixed(1)}</td>
                          </tr>
                          <tr className="bg-blue-50/50">
                            <td className="px-6 py-3 border-r border-blue-100 uppercase font-black text-indigo-900">TIEMPO PLANIFICADO [H]</td>
                            {machines.map(m => <td key={`${m.code}-plan-cell`} className="px-4 py-3 border-r border-blue-100 text-center font-black font-mono text-indigo-200">—</td>)}
                            <td className="px-4 py-3 text-center font-black font-mono text-indigo-900 bg-indigo-100 border-l-2 border-indigo-500/30">{totalPlanificado > 0 ? totalPlanificado.toFixed(1) : '0.0'}</td>
                          </tr>
                          <tr className="bg-slate-50 border-t-2 border-gray-200">
                            <td className="px-6 py-3 border-r border-gray-200 uppercase font-black text-slate-700">% OCUPACIÓN</td>
                            {machines.map(m => <td key={`${m.code}-perc-cell`} className="px-4 py-3 border-r border-gray-100 text-center font-black text-xs text-slate-200">—</td>)}
                            <td className={cn("px-4 py-3 text-center font-black border-l-2 border-indigo-500/30 text-base", totalOcupacion > 100 ? "text-red-700" : "text-emerald-700")}>
                              {totalOcupacion > 0 ? `${totalOcupacion.toFixed(1)}%` : '0%'}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>
              );
            })}
          </div>
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
                <thead className="bg-[#fef3c7] sticky top-0 z-10 text-amber-900 uppercase font-black tracking-widest border-b border-amber-200">
                  <tr>
                    <th className="px-4 py-4 border-r border-amber-100">ID_PLANTA</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-left">PLANTA</th>
                    <th className="px-4 py-4 border-r border-amber-100">ID_AREA</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-left">AREA</th>
                    <th className="px-4 py-4 border-r border-amber-100">ID_MAQUINA</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-left">MAQUINA</th>
                    <th className="px-4 py-4 border-r border-amber-100">OT_PRG_ID</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-left">FECHA_OT_PRG_INI</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-left">FECHA_OT_PRG_FIN</th>
                    <th className="px-4 py-4 text-center bg-amber-500/10">T_MTTO_PLANIFICADO (H)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {mantenimientos.filter(m => {
                    const dStr = String(m.FECHA_OT_PRG_INI || m.FECHA_PRO || m.FECHA_INI || '').trim();
                    if (!dStr || dStr === 'null') return selectedDate === 'all';
                    
                    let normalizedDate = '';
                    if (dStr.includes('T')) {
                      normalizedDate = dStr.split('T')[0];
                    } else if (dStr.includes('/')) {
                      const parts = dStr.split(' ')[0].split('/');
                      if (parts.length === 3) normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                    } else normalizedDate = dStr;

                    return selectedDate === 'all' || normalizedDate === selectedDate;
                  }).map((m, i) => (
                    <tr key={i} className="hover:bg-amber-50/30">
                      <td className="px-4 py-3 border-r border-gray-100 text-slate-700">{String(m.ID_PLANTA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-left uppercase text-slate-700">{String(m.PLANTA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-slate-700">{String(m.ID_AREA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-left uppercase text-slate-700">{String(m.AREA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-indigo-900">{String(m.ID_MAQUINA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-left uppercase text-indigo-900">{String(m.MAQUINA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-mono text-slate-900">{String(m.OT_PRG_ID || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-left font-mono text-slate-700">{formatMTTODate(m.FECHA_OT_PRG_INI || m.FECHA_INI || m.FECHA_PRO)}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-left font-mono text-slate-700">{formatMTTODate(m.FECHA_OT_PRG_FIN || m.FECHA_FIN || m.FECHA_PRO)}</td>
                      <td className="px-4 py-3 text-center font-mono font-black text-amber-700 bg-amber-500/5">
                        {calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI || m.FECHA_PRO, m.FECHA_OT_PRG_FIN || m.FECHA_FIN || m.FECHA_PRO)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-10 animate-in fade-in duration-300">
          {[ 
            { t: 'Planta 1000 - Quito (Alm)', d: provC1000, id: '1000', c: 'text-green-700', b: 'bg-green-600' }, 
            { t: 'Planta 2000 - Guayaquil (Alm)', d: provC2000, id: '2000', c: 'text-indigo-700', b: 'bg-indigo-600' } 
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
                        <th className="px-3 py-4 border-r border-gray-100 font-black">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-black text-indigo-700 bg-indigo-50/20">Máquina</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/20 text-blue-900">T. INDIV. (min)</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-amber-50/50 text-amber-900">T. TOTAL (H)</th>
                        <th className="px-2 py-2 border-r border-gray-50 bg-orange-50/50 font-black">BLOQUES 20M</th>
                        <th className="px-3 py-4 border-r border-gray-50 text-red-700 bg-red-50/50 font-black">CARGAS</th>
                        <th className="px-3 py-4 border-r border-gray-50">Resp.</th>
                        <th className="px-3 py-4 bg-slate-50 text-slate-900 font-black">Alm.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={12} className="py-8 text-slate-300 font-bold uppercase italic">Sin órdenes registradas para los criterios de almacén y responsable aplicados</td></tr>
                      ) : (
                        center.d.map((o, i) => {
                          const eng = calculateEngineering(o);
                          const dRaw = String(o.FECHAINICIO || o.FECHA || '—').trim();
                          const date = dRaw.includes('T') ? dRaw.split('T')[0] : dRaw;
                          return (
                            <tr key={i} className="hover:bg-gray-50/50">
                              <td className="px-3 py-2 text-slate-400 border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                              <td className="px-3 py-2 border-r border-gray-100 font-mono text-[8px] text-gray-400">{date}</td>
                              <td className="px-3 py-2 font-mono text-primary border-r border-gray-50">{eng.code}</td>
                              <td className="px-3 py-2 text-left border-r border-gray-50 uppercase text-gray-500 max-w-[200px] truncate" title={eng.desc}>{eng.desc}</td>
                              <td className="px-3 py-2 border-r border-gray-100 font-black text-gray-900 font-mono">{eng.qty.toLocaleString()}</td>
                              <td className="px-3 py-2 border-r border-gray-100 font-black text-indigo-700 bg-indigo-50/5 uppercase">{String(o.MAQUINA || o.RECURSO || '—')}</td>
                              <td className="px-3 py-2 border-r border-gray-100 bg-blue-50/10 font-mono text-blue-700 text-center">{eng.indivMin.toFixed(2)}</td>
                              <td className="px-3 py-2 border-r border-gray-100 bg-amber-50/10 font-mono text-amber-700 text-center">{eng.hours.toFixed(2)}</td>
                              <td className="px-2 py-2 border-r border-gray-50 bg-orange-50/10 font-black text-orange-800">{eng.blocks20m.toFixed(1)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 bg-red-50/20 font-black text-red-600">{String(eng.loads)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 text-gray-300">{String(o.RESPCONTROLPROD || '—')}</td>
                              <td className="px-3 py-2 bg-slate-50/50 text-slate-900 font-black">{o.Almacen || o.ALMACEN || '—'}</td>
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
        </TabsContent>

        <TabsContent value="ordenesFert" className="space-y-10 animate-in fade-in duration-300">
          {[ 
            { t: 'Planta 1000 - Quito (Órdenes FERT)', d: fertC1000, id: '1000', c: 'text-green-700', b: 'bg-green-600' }, 
            { t: 'Planta 2000 - Guayaquil (Órdenes FERT)', d: fertC2000, id: '2000', c: 'text-indigo-700', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-3">
              <h3 className={cn("text-[10px] font-black uppercase flex items-center gap-2 px-1 text-left", center.c)}>
                <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t}
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-center font-sans text-[9px]">
                    <thead className="bg-slate-900 text-white uppercase font-black tracking-tighter border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-white/5">Orden</th>
                        <th className="px-3 py-4 border-r border-white/5">Fecha</th>
                        <th className="px-3 py-4 border-r border-white/5">Material</th>
                        <th className="px-3 py-4 border-r border-white/5 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-white/10 font-black">Cant.</th>
                        <th className="px-3 py-4 border-r border-white/10 font-black text-indigo-400 bg-indigo-500/10">Máquina</th>
                        <th className="px-3 py-4 border-r border-white/10 bg-blue-500/10 text-blue-300">T. INDIV. (min)</th>
                        <th className="px-3 py-4 border-r border-white/10 bg-amber-500/10 text-amber-300">T. TOTAL (H)</th>
                        <th className="px-3 py-4 border-r border-white/5 bg-orange-500/10 font-black">BLOQUES 20M</th>
                        <th className="px-3 py-4 border-r border-white/5 text-red-300 bg-red-500/10 font-black">CARGAS</th>
                        <th className="px-3 py-4 border-r border-white/5">Resp.</th>
                        <th className="px-3 py-4 bg-slate-800 text-white font-black">Alm.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={12} className="py-8 text-slate-300 font-bold uppercase italic">Sin órdenes registradas para los criterios de almacén y responsable aplicados</td></tr>
                      ) : (
                        center.d.map((o, i) => {
                          const eng = calculateEngineering(o);
                          const dRaw = String(o.FECHA || o.FECHAINICIO || '—').trim();
                          const date = dRaw.includes('T') ? dRaw.split('T')[0] : dRaw;
                          return (
                            <tr key={i} className="hover:bg-gray-50/50">
                              <td className="px-3 py-2 text-slate-400 border-r border-gray-50">{o.ORDEN || '—'}</td>
                              <td className="px-3 py-2 border-r border-gray-100 font-mono text-[8px] text-gray-400">{date}</td>
                              <td className="px-3 py-2 font-mono text-primary border-r border-gray-50">{eng.code}</td>
                              <td className="px-3 py-2 text-left border-r border-gray-50 uppercase text-gray-500 max-w-[200px] truncate" title={eng.desc}>{eng.desc}</td>
                              <td className="px-3 py-2 border-r border-white/10 font-black text-gray-900 font-mono">{eng.qty.toLocaleString()}</td>
                              <td className="px-3 py-2 border-r border-white/10 font-black text-indigo-700 bg-indigo-50/5 uppercase">{String(o.MAQUINA || o.RECURSO || '—')}</td>
                              <td className="px-3 py-2 border-r border-white/10 bg-blue-50/10 font-mono text-blue-700 text-center">{eng.indivMin.toFixed(2)}</td>
                              <td className="px-3 py-2 border-r border-white/10 bg-amber-50/10 font-mono text-amber-700 text-center">{eng.hours.toFixed(2)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 bg-orange-50/10 font-black text-orange-800">{eng.blocks20m.toFixed(1)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 bg-red-50/20 font-black text-red-600">{String(eng.loads)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 text-gray-300">{String(o.RESPCONTROLPROD || '—')}</td>
                              <td className="px-3 py-2 bg-slate-50/50 text-slate-900 font-black">{o.Almacen || o.ALMACEN || '—'}</td>
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
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300 space-y-10">
          {[ { t: 'Quito 1000', d: tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim()==='1000') }, { t: 'Guayaquil 2000', d: tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim()==='2000') } ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className="text-[11px] font-black uppercase text-gray-400 text-left tracking-widest">Catálogo Tiempos - {center.t}</h3>
              <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full border-collapse text-[11px] font-bold text-center">
                    <thead className="bg-finish-800 text-white sticky top-0 z-10 uppercase font-black tracking-widest text-[9px]">
                      <tr className="bg-slate-900">
                        <th className="px-5 py-4 border-r border-white/5 text-left">Material</th>
                        <th className="px-5 py-4 border-r border-white/5 text-left">Descripción Técnica</th>
                        <th className="px-5 py-4 border-r border-white/5">Línea</th>
                        <th className="px-5 py-4 text-teal-400">Estándar (Min)</th>
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