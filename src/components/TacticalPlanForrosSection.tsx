'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  CalendarClock, 
  Loader2, 
  Users, 
  Lock, 
  Package, 
  Timer, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  CalendarCheck,
  Clock,
  Search,
  Calendar as CalendarIconLucide,
  MapPin,
  ListTree,
  UserPlus,
  Activity,
  ClipboardList,
  Wrench,
  BarChart3,
  LayoutGrid,
  Inbox,
  Filter,
  ArrowRight,
  Cpu
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppProvider';

interface WorkstationConfig {
  machine: string;
  shifts: number;
  people: number;
}

export const TacticalPlanForrosSection: React.FC = () => {
  const { addNotification } = useAppContext();
  const [isMounted, setIsMounted] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [tiemposProduccion, setTiemposProduccion] = useState<any[]>([]);
  const [dailyOrders, setDailyOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTiempos, setIsLoadingTiempos] = useState(false);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);

  // MANTENIMIENTO PREVENTIVO
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [isLoadingMantenimientos, setIsLoadingMantenimientos] = useState(false);
  const [maintPage, setMaintPage] = useState(1);
  const maintPageSize = 10;

  // CONFIGURACIÓN DE JORNADAS
  const DIURNA_OPTIONS = [
    { label: "07:00 - 15:45 (8.75h)", value: "8.75" },
    { label: "07:00 - 17:00 (10.0h)", value: "10.0" },
    { label: "07:00 - 18:00 (11.0h)", value: "11.0" }
  ];

  const NOCTURNA_OPTIONS = [
    { label: "Sin Jornada Nocturna", value: "0" },
    { label: "21:00 - 05:30 (8.5h)", value: "8.5" },
    { label: "19:00 - 05:30 (10.5h)", value: "10.5" }
  ];

  const [jornadaDiurnaSel, setJornadaDiurnaSel] = useState("10.0");
  const [jornadaNocturnaSel, setJornadaNocturnaSel] = useState("8.5");

  const horasNetasDiurnas = useMemo(() => parseFloat(jornadaDiurnaSel) * 0.84, [jornadaDiurnaSel]);
  const horasNetasNocturnas = useMemo(() => parseFloat(jornadaNocturnaSel) * 0.84, [jornadaNocturnaSel]);
  const totalHorasNetas = useMemo(() => horasNetasDiurnas + horasNetasNocturnas, [horasNetasDiurnas, horasNetasNocturnas]);

  // PERSONAL & TURNOS
  const [workstationConfigs, setWorkstationConfigs] = useState<Record<string, WorkstationConfig>>({});

  // FECHAS & HORIZONTE
  const [todayDate, setTodayDate] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>('');
  const [isHorizonFilterActive, setIsHorizonFilterActive] = useState(false);

  const normalizeMaterialCode = useCallback((code: string | number): string => {
    if (!code) return '';
    return String(code).trim().replace(/^0+/, '');
  }, []);

  const safeParseDateParts = useCallback((value: any) => {
    if (!value) return null;
    const str = String(value).trim();
    const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return { y: ymd[1], m: ymd[2], d: ymd[3] };
    const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return { y: dmy[3], m: dmy[2].padStart(2, '0'), d: dmy[1].padStart(2, '0') };
    return null;
  }, []);

  const normalizeDateForFilter = useCallback((dateInput: any): string | null => {
    const parts = safeParseDateParts(dateInput);
    if (parts) return `${parts.y}-${parts.m}-${parts.d}`;
    return null;
  }, [safeParseDateParts]);

  const fetchBaseData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [gRes, rRes] = await Promise.all([
        grupoService.getAll(),
        restriccionService.getAll()
      ]);
      setGrupos(gRes.data || []);
      setRestricciones(rRes.data || []);
    } catch (error) {
      console.error('Error fetching base data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setIsMounted(true);
    fetchBaseData();
  }, [fetchBaseData]);

  const forrosGruposList = useMemo(() => {
    return grupos.filter(g => {
      const name = (g.nombre_grupo || '').toUpperCase();
      return name.includes('FORRO') || name.includes('CHN') || name.includes('BASE') || name.includes('BANDA');
    });
  }, [grupos]);

  const forrosRestricciones = useMemo(() => {
    const forrosGroupIds = new Set(forrosGruposList.map(g => g.codigo_grupo));
    return restricciones.filter(r => forrosGroupIds.has(r.codigo_grupo));
  }, [forrosGruposList, restricciones]);

  useEffect(() => {
    if (isMounted) {
      const today = new Date();
      const target = new Date();
      target.setDate(today.getDate() + 1);
      setTodayDate(today.toISOString().split('T')[0]);
      setTargetDate(target.toISOString().split('T')[0]);
    }
  }, [isMounted]);

  const externalFilters = useMemo(() => {
    const filters: Record<string, string[]> = {};
    forrosRestricciones.forEach(r => {
      const name = (r.nombre_restriccion || '').trim().toUpperCase();
      if (name === 'RESPCTRLPROD' || name === 'ALMACEN') {
        if (!filters[name]) filters[name] = [];
        filters[name].push(...r.valor_restriccion.split('&').map(s => s.trim()));
      }
    });
    return filters;
  }, [forrosRestricciones]);

  const fetchTiemposProduccion = useCallback(async () => {
    if (forrosGruposList.length === 0) return;
    setIsLoadingTiempos(true);
    try {
      const promises = forrosGruposList.map(g => 
        serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo)
      );
      const responses = await Promise.all(promises);
      const allData = responses.flatMap(res => res.data || []);
      setTiemposProduccion(allData);
    } catch (error) {
      console.error('Error al cargar tiempos:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [forrosGruposList]);

  const fetchDailyOrders = useCallback(async () => {
    if (Object.keys(externalFilters).length === 0 || !todayDate) return;
    setIsLoadingDaily(true);
    try {
      const response = await serviciosService.OrdenesProvisionalesAlphaPaginados(1, 10000);
      if (response && response.data) {
        let filtered = response.data;
        
        if (isHorizonFilterActive) {
          filtered = filtered.filter((order: any) => {
            const normalizedOrderDate = normalizeDateForFilter(order['FECHAINICIO']);
            return normalizedOrderDate >= todayDate && normalizedOrderDate <= targetDate;
          });
        }
        
        setDailyOrders(filtered);
      }
    } catch (error) {
      console.error('Error fetching daily orders:', error);
    } finally {
      setIsLoadingDaily(false);
    }
  }, [externalFilters, todayDate, targetDate, normalizeDateForFilter, isHorizonFilterActive]);

  const fetchMantenimientos = useCallback(async () => {
    setIsLoadingMantenimientos(true);
    try {
      const response = await serviciosService.ListarMantenimientoPreventivosProgramados();
      const rawData = response.data || [];
      
      const respRestriction = forrosRestricciones.find(r => r.nombre_restriccion.toUpperCase() === 'RESPCTRLPROD');
      if (respRestriction) {
        const allowedCodes = respRestriction.valor_restriccion.split('&').map(s => s.trim().padStart(3, '0'));
        const filtered = rawData.filter((m: any) => {
          const resp = String(m.RespCtrlProd || '').trim().padStart(3, '0');
          return allowedCodes.includes(resp);
        });
        
        filtered.sort((a: any, b: any) => {
          const dateA = new Date(a.FECHA_PRO || 0).getTime();
          const dateB = new Date(b.FECHA_PRO || 0).getTime();
          return dateA - dateB;
        });
        
        setMantenimientos(filtered);
      }
    } catch (error) {
      console.error('Error fetching maintenance:', error);
    } finally {
      setIsLoadingMantenimientos(false);
    }
  }, [forrosRestricciones]);

  const uniqueWorkstations = useMemo(() => {
    const wsSet = new Set<string>();
    tiemposProduccion.forEach(t => {
      const ws = String(t.PuestoTrabajo || t.nombre_estacion || '').trim();
      if (ws && ws !== 'null' && ws.toUpperCase() !== 'MARCOSUIO') wsSet.add(ws.toUpperCase());
    });
    return Array.from(wsSet).sort();
  }, [tiemposProduccion]);

  useEffect(() => {
    if (uniqueWorkstations.length > 0 && Object.keys(workstationConfigs).length === 0) {
      const initial: Record<string, WorkstationConfig> = {};
      uniqueWorkstations.forEach(ws => {
        initial[ws] = { machine: ws, shifts: 1, people: 1 };
      });
      setWorkstationConfigs(initial);
    }
  }, [uniqueWorkstations, workstationConfigs]);

  useEffect(() => {
    if (isMounted && forrosGruposList.length > 0) {
      fetchTiemposProduccion();
      fetchDailyOrders();
      fetchMantenimientos();
    }
  }, [isMounted, forrosGruposList, fetchTiemposProduccion, fetchDailyOrders, fetchMantenimientos]);

  const getResolvedMachine = useCallback((order: any) => {
    const orderFields = ['MAQUINA', 'Maquina', 'PuestoTrabajo'];
    for (const k of orderFields) {
      const val = order[k];
      if (val && String(val).trim() !== '' && String(val).toLowerCase() !== 'null') {
        const sVal = String(val).trim().toUpperCase();
        if (sVal.startsWith('HR')) return sVal;
      }
    }
    const material = normalizeMaterialCode(order['MATERIAL'] || order['CodMaterial'] || '');
    const match = tiemposProduccion.find(t => normalizeMaterialCode(t.CodMaterial || t.Material || '') === material);
    return match ? String(match.PuestoTrabajo || match.nombre_estacion || '').trim().toUpperCase() : '';
  }, [tiemposProduccion, normalizeMaterialCode]);

  const calculateProductionTime = useCallback((material: string, quantity: number, order: any) => {
    if (!material) return 0;
    const normMaterial = normalizeMaterialCode(material);
    const machine = getResolvedMachine(order);
    const match = tiemposProduccion.find(t => 
      normalizeMaterialCode(t.CodMaterial || t.Material || '') === normMaterial &&
      String(t.PuestoTrabajo || t.nombre_estacion || '').trim().toUpperCase() === machine
    ) || tiemposProduccion.find(t => normalizeMaterialCode(t.CodMaterial || t.Material || '') === normMaterial);

    return match ? (Number(match.Tiempo || match.Tiempo_Min || 0) * quantity) : 0;
  }, [tiemposProduccion, normalizeMaterialCode, getResolvedMachine]);

  const renderResolvedProvisionalCell = useCallback((column: string, order: any) => {
    const upperCol = column.toUpperCase().trim();
    if (upperCol === 'MAQUINA') {
      const val = getResolvedMachine(order);
      return val ? (
        <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
          {val}
        </span>
      ) : (
        <span className="text-slate-400 italic">—</span>
      );
    }
    return undefined;
  }, [getResolvedMachine]);

  const resolveLogicValue = useCallback((column: string, order: any) => {
    const upperCol = column.toUpperCase().trim();
    if (upperCol === 'MAQUINA') {
      return getResolvedMachine(order) || 'Z_SIN_MAQUINA';
    }
    return String(order[column] ?? '');
  }, [getResolvedMachine]);

  const handleWorkstationConfigChange = (ws: string, field: keyof WorkstationConfig, value: any) => {
    setWorkstationConfigs(prev => ({ ...prev, [ws]: { ...prev[ws], [field]: value } }));
  };

  const MachineCard = ({ machineCode }: { machineCode: string }) => {
    const orders = dailyOrders.filter(o => getResolvedMachine(o) === machineCode);
    const quantity = orders.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0);
    const totalTimeMin = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o), 0);
    const totalTimeHours = totalTimeMin / 60;
    const config = workstationConfigs[machineCode] || { people: 1 };
    const capacityHours = totalHorasNetas * config.people;
    const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;
    const isOverloaded = utilization > 100;

    return (
      <div className="flex border border-slate-200 rounded-2xl overflow-hidden h-[420px] shadow-sm w-full bg-white transition-all hover:shadow-md">
        {/* PANEL IZQUIERDO: INFORMACIÓN DE CAPACIDAD (AZUL PIZARRA) */}
        <div className="w-[40%] bg-slate-900 p-6 text-white flex flex-col border-r border-slate-800">
          <div className="mb-6">
            <h3 className="text-xl font-black uppercase leading-tight tracking-tight text-slate-100 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              {machineCode}
            </h3>
            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-500 mt-1">Recurso de Producción</p>
          </div>
          
          <div className="flex-1 space-y-5">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner">
              <p className="text-[9px] font-bold uppercase text-slate-400 mb-3 tracking-[0.2em] flex items-center gap-2">
                <Users className="w-3 h-3" /> Dotación Operativa
              </p>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase text-[10px] text-slate-500">Operadores:</span>
                  <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1">
                    <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', Math.max(1, config.people - 1))} className="w-7 h-7 rounded-md bg-slate-700 hover:bg-indigo-600 flex items-center justify-center text-white transition-colors">-</button>
                    <span className="font-mono font-bold text-lg text-white w-6 text-center">{config.people}</span>
                    <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', config.people + 1)} className="w-7 h-7 rounded-md bg-slate-700 hover:bg-indigo-600 flex items-center justify-center text-white transition-colors">+</button>
                  </div>
                </div>
                <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                  <span className="font-bold uppercase text-[10px] text-slate-500">Capacidad Total:</span>
                  <span className="font-mono font-bold text-md text-indigo-400">{capacityHours.toFixed(2)}h</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner">
              <p className="text-[9px] font-bold uppercase text-slate-400 mb-3 tracking-[0.2em]">Ocupación del Recurso</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className={cn("text-5xl font-black font-mono tracking-tighter", isOverloaded ? "text-red-400" : "text-sky-400")}>
                  {utilization.toFixed(0)}
                </span>
                <span className="text-xl font-black text-slate-600">%</span>
              </div>
              <Progress value={utilization} className={cn("h-4 bg-slate-800 border border-white/5", isOverloaded ? "[&>div]:bg-red-500" : "[&>div]:bg-indigo-500")} />
              <div className="mt-4 flex justify-between text-[10px] font-bold uppercase">
                <div className="text-slate-500">Carga: <span className="text-slate-100">{totalTimeHours.toFixed(2)}h</span></div>
                <div className={cn(isOverloaded ? "text-red-400" : "text-indigo-400")}>Rem: {(capacityHours - totalTimeHours).toFixed(2)}h</div>
              </div>
            </div>
          </div>
        </div>

        {/* PANEL DERECHO: LISTADO DE ÓRDENES (GRIS SOBRIO) */}
        <div className="flex-1 bg-slate-50/50 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-200">
            <h3 className="text-xs font-black text-slate-700 uppercase flex items-center gap-2 tracking-widest">
              <ClipboardList className="w-4 h-4 text-indigo-600" /> Órdenes Programadas
            </h3>
            <Badge variant="secondary" className="bg-slate-200 text-slate-600 border-none font-mono text-[10px] px-2.5 py-0.5">{orders.length} ITEMS</Badge>
          </div>
          
          <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-100/80 sticky top-0 z-10">
                <tr className="text-slate-400 font-bold uppercase tracking-[0.1em]">
                  <th className="px-4 py-3 text-left border-b border-slate-200">CodMaterial</th>
                  <th className="px-4 py-3 text-left border-b border-slate-200">Nombre</th>
                  <th className="px-4 py-3 text-right border-b border-slate-200">Cant.</th>
                  <th className="px-4 py-3 text-right border-b border-slate-200 text-indigo-600">Tiempo (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o, i) => {
                  const t = calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o) / 60;
                  return (
                    <tr key={i} className="hover:bg-indigo-50/40 transition-colors group">
                      <td className="px-4 py-3 font-mono font-bold text-slate-500 group-hover:text-indigo-700">{o['CodMaterial'] || normalizeMaterialCode(o['MATERIAL'])}</td>
                      <td className="px-4 py-3 max-w-[160px] truncate font-bold uppercase text-slate-400 group-hover:text-slate-600" title={o['NOMBRE'] || o['TEXTOMATERIAL']}>{o['NOMBRE'] || o['TEXTOMATERIAL']}</td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-slate-600">{Number(o['CANTIDAD'] || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-indigo-600">{t.toFixed(2)}</td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-20 text-center text-slate-300 italic font-black uppercase tracking-[0.3em] text-[10px]">Sin órdenes asignadas</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const chnBasesDateTotals = useMemo(() => {
    const today = dailyOrders.filter(o => normalizeDateForFilter(o['FECHAINICIO']) === todayDate);
    const target = dailyOrders.filter(o => normalizeDateForFilter(o['FECHAINICIO']) === targetDate);
    return {
      totalToday: today.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0),
      totalTarget: target.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0)
    };
  }, [dailyOrders, todayDate, targetDate, normalizeDateForFilter]);

  const totalMaintPages = Math.ceil(mantenimientos.length / maintPageSize);
  const pagedMantenimientos = mantenimientos.slice((maintPage - 1) * maintPageSize, maintPage * maintPageSize);

  const getPageNumbers = (current: number, total: number) => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | string)[] = [1];
    const left = Math.max(2, current - 1);
    const right = Math.min(total - 1, current + 1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < total - 1) pages.push('...');
    pages.push(total);
    return pages;
  };

  if (!isMounted) return null;

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50/60 min-h-screen">
      {/* HEADER DE CONTROL PRINCIPAL */}
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 bg-white p-7 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-5">
          <div className="bg-slate-900 p-4 rounded-2xl text-white shadow-xl">
            <CalendarClock className="w-9 h-9" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Plan Táctico de Forros</h2>
            <div className="flex items-center gap-2 mt-1.5">
              <Badge variant="outline" className="border-slate-200 text-slate-400 bg-slate-50 font-black uppercase tracking-[0.25em] text-[10px] px-3 py-1">Centro de Comando Unificado</Badge>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-4">
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center gap-5 min-w-[200px] shadow-inner">
              <div className="bg-indigo-600 p-2.5 rounded-xl text-white"><MapPin className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga GYE</p>
                <p className="text-2xl font-black text-slate-800 font-mono tracking-tight">{chnBasesDateTotals.totalToday.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center gap-5 min-w-[200px] shadow-inner">
              <div className="bg-slate-800 p-2.5 rounded-xl text-white"><MapPin className="w-5 h-5" /></div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carga UIO</p>
                <p className="text-2xl font-black text-slate-800 font-mono tracking-tight">{chnBasesDateTotals.totalTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL DE HORIZONTE TÁCTICO */}
      <Card className="rounded-3xl shadow-sm border-slate-200 bg-white overflow-hidden">
        <div className="px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-8 bg-slate-50/30">
          <div className="flex items-center gap-8">
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2"><CalendarIconLucide className="w-3.5 h-3.5" /> Inicio Horizonte</label>
              <input 
                type="date" 
                value={todayDate} 
                onChange={(e) => setTodayDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-black text-slate-700 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all shadow-sm"
              />
            </div>
            <div className="flex items-center pt-6">
              <div className="w-12 h-px bg-slate-200 relative">
                <ArrowRight className="w-4 h-4 text-slate-300 absolute -right-2 -top-2" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2"><CalendarIconLucide className="w-3.5 h-3.5" /> Fin Horizonte</label>
              <input 
                type="date" 
                value={targetDate} 
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-black text-slate-700 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all shadow-sm"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button 
              onClick={() => {
                setIsHorizonFilterActive(!isHorizonFilterActive);
                fetchDailyOrders();
              }}
              variant={isHorizonFilterActive ? "default" : "outline"}
              className={cn(
                "h-12 px-8 rounded-2xl font-black uppercase text-[11px] tracking-[0.15em] transition-all gap-3 shadow-sm",
                isHorizonFilterActive ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200" : "border-slate-300 text-slate-600 hover:bg-white"
              )}
            >
              <Filter className="w-4 h-4" />
              {isHorizonFilterActive ? "Filtro Activo" : "Aplicar Horizonte Táctico"}
            </Button>
            <Button 
              onClick={fetchDailyOrders} 
              disabled={isLoadingDaily}
              variant="outline"
              className="h-12 w-12 rounded-2xl border-slate-300 hover:bg-white text-slate-600 transition-all p-0 shadow-sm"
            >
              <RefreshCw className={cn("w-5 h-5", isLoadingDaily && "animate-spin")} />
            </Button>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="visual" className="w-full">
        <TabsList className="flex w-full h-auto bg-white border border-slate-200 p-2 mb-10 rounded-3xl shadow-sm overflow-x-auto justify-start sticky top-0 z-50">
          <TabsTrigger value="visual" className="flex items-center gap-3 px-8 py-3.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500"><LayoutGrid className="w-4 h-4" /> Tablero Global</TabsTrigger>
          <TabsTrigger value="componentes" className="flex items-center gap-3 px-8 py-3.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500"><Inbox className="w-4 h-4" /> Buffer Maestro</TabsTrigger>
          <TabsTrigger value="mantenimiento" className="flex items-center gap-3 px-8 py-3.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500"><Wrench className="w-4 h-4" /> Mant. Preventivo</TabsTrigger>
          <TabsTrigger value="personal-turnos" className="flex items-center gap-3 px-8 py-3.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500"><UserPlus className="w-4 h-4" /> Config. Capacidad</TabsTrigger>
          <TabsTrigger value="tiempos" className="flex items-center gap-3 px-8 py-3.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500"><Timer className="w-4 h-4" /> Maestros Técnicos</TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-3 px-8 py-3.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500"><Lock className="w-4 h-4" /> Reglas</TabsTrigger>
          <TabsTrigger value="grupos" className="flex items-center gap-3 px-8 py-3.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500"><Users className="w-4 h-4" /> Estructura</TabsTrigger>
        </TabsList>

        {/* TABLERO GLOBAL DE PUESTOS DE TRABAJO */}
        <TabsContent value="visual" className="space-y-10 pb-20">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {uniqueWorkstations.map((wsCode) => (
              <MachineCard key={wsCode} machineCode={wsCode} />
            ))}
            {uniqueWorkstations.length === 0 && (
              <div className="col-span-full py-32 text-center">
                <div className="bg-slate-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Activity className="w-10 h-10 text-slate-300" />
                </div>
                <h3 className="text-xl font-black text-slate-400 uppercase tracking-widest">No se detectaron puestos de trabajo</h3>
                <p className="text-slate-400 mt-2">Sincronice los maestros técnicos para visualizar el tablero.</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* BUFFER MAESTRO */}
        <TabsContent value="componentes">
           <Card className="rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
             <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                      <Inbox className="w-6 h-6 text-indigo-600" />
                      Listado Maestro de Componentes (Buffer Global)
                    </CardTitle>
                    <CardDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">
                      Universo de órdenes previsionales filtradas por responsabilidad técnica y almacén
                    </CardDescription>
                  </div>
                  <Badge className="bg-slate-800 text-white font-black px-4 py-1.5 uppercase text-[10px] tracking-widest rounded-xl">Status: Live Data</Badge>
                </div>
             </CardHeader>
             <CardContent className="p-0">
                <ProvisionalOrdersTabSection 
                  externalFilters={externalFilters} 
                  renderCell={renderResolvedProvisionalCell} 
                  groupBy="FECHAINICIO"
                  resolveValue={resolveLogicValue} 
                />
             </CardContent>
           </Card>
        </TabsContent>

        {/* MANTENIMIENTO PREVENTIVO */}
        <TabsContent value="mantenimiento">
          <Card className="rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3"><Wrench className="w-6 h-6 text-indigo-600" /> Mantenimiento Programado</CardTitle>
                  <CardDescription className="font-bold uppercase text-[10px] tracking-[0.2em] text-slate-400 mt-2">Sincronización por RespCtrlProd • Orden cronológico de parada</CardDescription>
                </div>
                <Button onClick={fetchMantenimientos} disabled={isLoadingMantenimientos} variant="outline" size="sm" className="h-11 px-6 font-black uppercase text-[10px] tracking-widest border-slate-300 rounded-xl">
                  <RefreshCw className={cn("w-4 h-4 mr-2", isLoadingMantenimientos && "animate-spin")} /> Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr className="text-slate-500 font-black uppercase tracking-widest">
                      <th className="px-6 py-4 text-left bg-indigo-50/30">FECHA PROG.</th>
                      <th className="px-6 py-4 text-left">EQUIPO</th>
                      <th className="px-6 py-4 text-left">DESCRIPCIÓN EQUIPO</th>
                      <th className="px-6 py-4 text-left">FRECUENCIA</th>
                      <th className="px-6 py-4 text-left">RESPONSABLE</th>
                      <th className="px-6 py-4 text-left">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {isLoadingMantenimientos ? (
                      <tr><td colSpan={6} className="py-24 text-center font-black text-slate-300 italic animate-pulse tracking-[0.3em] uppercase text-xs">Consultando maestros...</td></tr>
                    ) : pagedMantenimientos.length > 0 ? (
                      pagedMantenimientos.map((m, idx) => (
                        <tr key={idx} className="hover:bg-indigo-50/20 transition-colors group">
                          <td className="px-6 py-4 font-mono font-black text-indigo-700 group-hover:scale-105 transition-transform origin-left">
                            {m.FECHA_PRO ? new Date(m.FECHA_PRO).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-slate-600">{m.CODIGO_EQ || '—'}</td>
                          <td className="px-6 py-4 font-black text-slate-500 uppercase">{m.NOMBRE_EQ || '—'}</td>
                          <td className="px-6 py-4 text-slate-400 font-black uppercase text-[10px]">{m.T_FREC || '—'}</td>
                          <td className="px-6 py-4">
                            <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-mono text-[10px] px-3">{m.RespCtrlProd || '—'}</Badge>
                          </td>
                          <td className="px-6 py-4">
                            <Badge className={cn(
                              "font-black text-[9px] px-3 py-1 border-none rounded-lg",
                              m.ESTADO === 'PROGRAMADO' ? "bg-indigo-500 text-white" : 
                              m.ESTADO === 'EJECUTADO' ? "bg-slate-800 text-white" : 
                              "bg-slate-300 text-white"
                            )}>
                              {m.ESTADO || 'PENDIENTE'}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={6} className="py-24 text-center text-slate-300 italic font-black uppercase tracking-[0.3em] text-xs">No hay paradas técnicas registradas</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {totalMaintPages > 1 && (
                <div className="flex items-center justify-between px-8 py-5 bg-slate-50 border-t border-slate-200">
                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Visualizando {maintPage} de {totalMaintPages}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(1)} disabled={maintPage === 1} className="h-9 w-9 rounded-xl"><ChevronsLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(prev => Math.max(1, prev - 1))} disabled={maintPage === 1} className="h-9 w-9 rounded-xl"><ChevronLeft className="h-4 w-4" /></Button>
                    
                    {getPageNumbers(maintPage, totalMaintPages).map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => typeof p === 'number' && setMaintPage(p)}
                        className={cn(
                          "min-w-[36px] h-9 rounded-xl text-[11px] font-black transition-all border",
                          maintPage === p 
                            ? "bg-slate-900 text-white border-slate-900 shadow-lg" 
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        {p}
                      </button>
                    ))}

                    <Button variant="outline" size="icon" onClick={() => setMaintPage(prev => Math.min(totalMaintPages, prev + 1))} disabled={maintPage === totalMaintPages} className="h-9 w-9 rounded-xl"><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(totalMaintPages)} disabled={maintPage === totalMaintPages} className="h-9 w-9 rounded-xl"><ChevronsRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* PERSONAL & TURNOS */}
        <TabsContent value="personal-turnos">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-1 rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
               <CardHeader className="bg-slate-900 text-white border-b border-slate-800 p-6">
                 <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-3"><Clock className="w-6 h-6 text-sky-400" /> Parámetros de Tiempo</CardTitle>
               </CardHeader>
               <CardContent className="p-8 space-y-8">
                 <div className="space-y-4">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Jornada Diurna (L-V)</label>
                    <Select value={jornadaDiurnaSel} onValueChange={setJornadaDiurnaSel}>
                      <SelectTrigger className="h-12 border border-slate-200 rounded-2xl font-black text-slate-700 shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-bold">{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                 </div>
                 <div className="space-y-4">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.25em]">Jornada Nocturna</label>
                    <Select value={jornadaNocturnaSel} onValueChange={setJornadaNocturnaSel}>
                      <SelectTrigger className="h-12 border border-slate-200 rounded-2xl font-black text-slate-700 shadow-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOCTURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-bold">{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                 </div>
                 <div className="p-8 bg-slate-900 rounded-[2rem] text-white shadow-2xl border border-white/5 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <Timer className="w-24 h-24" />
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6">Eficiencia Operativa: 84%</p>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="border-l-4 border-sky-400 pl-5">
                        <p className="text-2xl font-black font-mono tracking-tighter">{horasNetasDiurnas.toFixed(2)}h</p>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Día Neto</p>
                      </div>
                      <div className="border-l-4 border-indigo-500 pl-5">
                        <p className="text-2xl font-black font-mono tracking-tighter">{horasNetasNocturnas.toFixed(2)}h</p>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Noche Neto</p>
                      </div>
                    </div>
                    <div className="mt-8 pt-6 border-t border-white/10">
                      <p className="text-5xl font-black text-sky-400 font-mono tracking-tighter">{totalHorasNetas.toFixed(2)}h</p>
                      <p className="text-[11px] font-black text-slate-500 uppercase mt-2 tracking-[0.2em]">Potencial Diario / Persona</p>
                    </div>
                 </div>
               </CardContent>
            </Card>

            <Card className="lg:col-span-2 rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
               <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
                 <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight">Recursos Asignados por Puesto</CardTitle>
                 <CardDescription className="font-bold uppercase text-[10px] text-slate-400 tracking-[0.2em] mt-2">Configuración de dotación de personal para cálculo de capacidad por estación</CardDescription>
               </CardHeader>
               <CardContent className="p-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[65vh] overflow-y-auto pr-4">
                    {uniqueWorkstations.map(ws => {
                      const config = workstationConfigs[ws] || { people: 1 };
                      return (
                        <div key={ws} className="flex items-center justify-between p-6 border border-slate-100 rounded-[1.5rem] bg-white hover:border-indigo-200 transition-all shadow-sm hover:shadow-md group">
                          <div>
                            <p className="font-black text-slate-700 uppercase text-sm tracking-tight group-hover:text-indigo-600 transition-colors">{ws}</p>
                            <p className="text-[10px] font-black text-slate-400 uppercase mt-1 tracking-widest">Capacidad: {(config.people * totalHorasNetas).toFixed(1)}h/día</p>
                          </div>
                          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200 shadow-inner">
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', Math.max(1, config.people - 1))} className="w-9 h-9 rounded-xl bg-white shadow-sm border border-slate-200 flex items-center justify-center font-black hover:bg-slate-900 hover:text-white transition-all text-sm">-</button>
                            <span className="font-mono font-black text-lg min-w-[30px] text-center text-indigo-600">{config.people}</span>
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', config.people + 1)} className="w-9 h-9 rounded-xl bg-white shadow-sm border border-slate-200 flex items-center justify-center font-black hover:bg-slate-900 hover:text-white transition-all text-sm">+</button>
                          </div>
                        </div>
                      );
                    })}
                 </div>
               </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* MAESTROS TÉCNICOS */}
        <TabsContent value="tiempos">
          <Card className="rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
             <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
               <div className="flex items-center justify-between">
                 <div>
                   <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                     <Timer className="w-6 h-6 text-indigo-600" />
                     Maestros Técnicos de Producción
                   </CardTitle>
                   <CardDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">Relación de tiempos estándar por material y puesto de trabajo</CardDescription>
                 </div>
                 <Badge variant="secondary" className="font-mono bg-slate-200 text-slate-600 px-4 py-1.5 rounded-xl">{tiemposProduccion.length} REGISTROS</Badge>
               </div>
             </CardHeader>
             <CardContent className="p-0">
               <div className="overflow-x-auto max-h-[70vh]">
                 <table className="w-full text-[11px] border-collapse">
                   <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                     <tr className="text-slate-500 font-black uppercase tracking-widest">
                       <th className="px-6 py-4 text-left">CodMaterial</th>
                       <th className="px-6 py-4 text-left">Descripción Material</th>
                       <th className="px-6 py-4 text-left">Línea Prod.</th>
                       <th className="px-6 py-4 text-left">Puesto Trabajo</th>
                       <th className="px-6 py-4 text-right text-indigo-600">T. Estándar (min)</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 bg-white">
                     {isLoadingTiempos ? (
                       <tr><td colSpan={5} className="py-32 text-center font-black text-slate-300 italic animate-pulse tracking-[0.4em] uppercase text-sm">Sincronizando maestros...</td></tr>
                     ) : tiemposProduccion.map((t, idx) => (
                       <tr key={idx} className="hover:bg-indigo-50/30 transition-colors group">
                         <td className="px-6 py-3.5 font-mono font-black text-slate-500 group-hover:text-indigo-600">{t.CodMaterial || t.Material}</td>
                         <td className="px-6 py-3.5 uppercase font-bold text-slate-400 group-hover:text-slate-600">{t.Material || t.nombre_material || t.DESCRIPCION}</td>
                         <td className="px-6 py-3.5 font-black text-slate-400">{t.Linea || t.nombre_linea}</td>
                         <td className="px-6 py-3.5"><Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 uppercase text-[9px] font-black px-3 py-0.5 rounded-lg">{t.PuestoTrabajo || t.nombre_estacion}</Badge></td>
                         <td className="px-6 py-3.5 text-right font-mono font-black text-indigo-600 text-sm">{Number(t.Tiempo || t.Tiempo_Min).toFixed(2)}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </CardContent>
          </Card>
        </TabsContent>

        {/* REGLAS DE NEGOCIO */}
        <TabsContent value="restricciones">
           <Card className="rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
             <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
                <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3"><Lock className="w-6 h-6 text-indigo-600" /> Reglas de Negocio Área Forros</CardTitle>
             </CardHeader>
             <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   {forrosRestricciones.map(r => (
                     <div key={r.codigo_restriccion} className="flex items-start gap-6 p-7 bg-white border border-slate-100 rounded-[2rem] shadow-sm hover:border-indigo-300 transition-all group hover:shadow-md">
                        <div className="bg-slate-900 p-4 rounded-2xl text-white group-hover:bg-indigo-600 transition-colors shadow-lg"><Lock className="w-6 h-6" /></div>
                        <div>
                          <h4 className="font-black text-slate-700 uppercase text-sm tracking-wider mb-2">{r.nombre_restriccion}</h4>
                          <Badge className="bg-indigo-50 text-indigo-700 border-indigo-100 font-mono mb-3 text-[11px] px-3 py-0.5 rounded-lg">{r.valor_restriccion}</Badge>
                          <p className="text-[11px] text-slate-400 leading-relaxed font-bold uppercase tracking-tight">{r.descripcion || 'Sin descripción técnica disponible.'}</p>
                        </div>
                     </div>
                   ))}
                </div>
             </CardContent>
           </Card>
        </TabsContent>

        {/* ESTRUCTURA DE GRUPOS */}
        <TabsContent value="grupos">
           <Card className="rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
             <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
                <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3"><ListTree className="w-6 h-6 text-indigo-600" /> Grupos Técnicos de Planificación</CardTitle>
             </CardHeader>
             <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {forrosGruposList.map(g => (
                    <div key={g.codigo_grupo} className="p-7 border border-slate-100 rounded-[2rem] bg-white hover:border-indigo-400 transition-all group shadow-sm hover:shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-bl-[4rem] -mr-10 -mt-10 group-hover:bg-slate-900 transition-colors duration-500"></div>
                      <div className="flex items-center gap-4 mb-5 relative z-10">
                        <div className="bg-indigo-50 p-3 rounded-xl text-indigo-600 group-hover:bg-white group-hover:text-slate-900 transition-colors shadow-sm"><ListTree className="w-5 h-5" /></div>
                        <h4 className="font-black text-slate-700 uppercase tracking-tighter text-lg group-hover:text-white transition-colors duration-500">{g.nombre_grupo}</h4>
                      </div>
                      <div className="space-y-3 pt-4 border-t border-slate-50 relative z-10">
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">ID GRUPO: <span className="text-slate-800 font-mono ml-2">{g.codigo_grupo}</span></p>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em]">CENTRO FAB.: <span className="text-indigo-600 font-mono ml-2">{g.centro}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
             </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
