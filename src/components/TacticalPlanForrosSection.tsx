'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CalendarClock, 
  Loader2, 
  Users, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Clock,
  MapPin,
  Inbox,
  Filter,
  ArrowRight,
  Cpu,
  Layers,
  Settings2,
  Wrench,
  LayoutGrid,
  ClipboardList,
  UserPlus,
  AlertTriangle,
  CheckCircle2,
  BarChart3,
  Search,
  Info,
  ShieldCheck,
  Zap,
  ZapOff,
  History
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
    { label: "Jornada Normal (8h)", value: "8.0" },
    { label: "07:00 - 15:45 (8.75h)", value: "8.75" },
    { label: "07:00 - 17:00 (10.0h)", value: "10.0" }
  ];

  const NOCTURNA_OPTIONS = [
    { label: "Sin Jornada Nocturna", value: "0" },
    { label: "21:00 - 05:30 (8.5h)", value: "8.5" }
  ];

  const [jornadaDiurnaSel, setJornadaDiurnaSel] = useState("8.0");
  const [jornadaNocturnaSel, setJornadaNocturnaSel] = useState("0");
  const [maxExtrasPermitidas, setMaxExtrasPermitidas] = useState(2);

  const horasNetasDiurnas = useMemo(() => parseFloat(jornadaDiurnaSel) * 0.84, [jornadaDiurnaSel]);
  const horasNetasNocturnas = useMemo(() => parseFloat(jornadaNocturnaSel) * 0.84, [jornadaNocturnaSel]);
  const totalHorasNetas = useMemo(() => horasNetasDiurnas + horasNetasNocturnas, [horasNetasDiurnas, horasNetasNocturnas]);

  // PERSONAL & TURNOS
  const [workstationConfigs, setWorkstationConfigs] = useState<Record<string, WorkstationConfig>>({});

  // FECHAS & HORIZONTE
  const [todayDate, setTodayDate] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>('');

  useEffect(() => {
    setIsMounted(true);
  }, []);

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

  const fetchBaseData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [gRes, rRes] = await Promise.all([
        grupoService.getAll(),
        restriccionService.getAll()
      ]);
      setGrupos(gRes.data || []);
      setRestricciones(rRes.data || []);
      
      const relevantGroups = gRes.data?.filter((g: any) => {
        const name = g.nombre_grupo.toUpperCase();
        return name.includes('FORRO') || name.includes('ACOLCHADO') || name.includes('TAPAS') || name.includes('BANDA');
      }) || [];

      if (relevantGroups.length > 0) {
        const firstGroupRest = rRes.data?.filter((r: any) => r.codigo_grupo === relevantGroups[0].codigo_grupo) || [];
        const hTrabajo = firstGroupRest.find((r: any) => r.nombre_restriccion === 'HORAS_TRABAJO');
        const hExtras = firstGroupRest.find((r: any) => r.nombre_restriccion === 'MAX_EXTRAS_HORAS');
        if (hTrabajo) setJornadaDiurnaSel(parseFloat(hTrabajo.valor_restriccion).toFixed(1));
        if (hExtras) setMaxExtrasPermitidas(parseInt(hExtras.valor_restriccion));
      }

    } catch (error) {
      console.error('Error fetching base data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isMounted) fetchBaseData();
  }, [isMounted, fetchBaseData]);

  const forrosGruposList = useMemo(() => {
    return grupos.filter(g => {
      const name = (g.nombre_grupo || '').toUpperCase();
      return name.includes('FORRO') || 
             name.includes('CHN') || 
             name.includes('BASE') || 
             name.includes('BANDA') || 
             name.includes('ACOLCHADO') ||
             name.includes('TAPAS');
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
      let allData = responses.flatMap(res => res.data || []);
      
      if (externalFilters.RESPCTRLPROD) {
        const allowed = externalFilters.RESPCTRLPROD.map(c => c.trim().padStart(3, '0'));
        allData = allData.filter(t => {
          const resp = String(t.RespControlProd || t.RESPCONTROLPROD || t.RespCtrlProd || '').trim().padStart(3, '0');
          return allowed.includes(resp);
        });
      }

      setTiemposProduccion(allData);
    } catch (error) {
      console.error('Error al cargar tiempos:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [forrosGruposList, externalFilters]);

  const fetchDailyOrders = useCallback(async () => {
    if (!isMounted) return;
    setIsLoadingDaily(true);
    try {
      const response = await serviciosService.OrdenesProvisionalesAlphaPaginados(1, 10000);
      if (response && response.data) {
        let filtered = response.data;
        if (externalFilters.RESPCTRLPROD) {
          const allowedCodes = externalFilters.RESPCTRLPROD.map(c => c.trim().padStart(3, '0'));
          filtered = filtered.filter((o: any) => {
            const resp = String(o.RESPCONTROLPROD || '').trim().padStart(3, '0');
            return allowedCodes.includes(resp);
          });
        }
        setDailyOrders(filtered);
      }
    } catch (error) {
      console.error('Error fetching daily orders:', error);
    } finally {
      setIsLoadingDaily(false);
    }
  }, [isMounted, externalFilters]);

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
        filtered.sort((a: any, b: any) => new Date(a.FECHA_PRO || 0).getTime() - new Date(b.FECHA_PRO || 0).getTime());
        setMantenimientos(filtered);
      }
    } catch (error) {
      console.error('Error fetching maintenance:', error);
    } finally {
      setIsLoadingMantenimientos(false);
    }
  }, [forrosRestricciones]);

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
    return match ? String(match.PuestoTrabajo || match.nombre_estacion || match.Maquina || '').trim().toUpperCase() : '';
  }, [tiemposProduccion, normalizeMaterialCode]);

  const uniqueWorkstations = useMemo(() => {
    const wsSet = new Set<string>();
    tiemposProduccion.forEach(t => {
      const ws = String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').trim().toUpperCase();
      if (ws && ws !== 'NULL' && ws !== '-' && ws !== '—') wsSet.add(ws);
    });
    dailyOrders.forEach(o => {
      const ws = getResolvedMachine(o);
      if (ws && ws !== 'Z_SIN_MAQUINA' && ws !== '') wsSet.add(ws);
    });
    return Array.from(wsSet).sort();
  }, [tiemposProduccion, dailyOrders, getResolvedMachine]);

  const calculateProductionTime = useCallback((material: string, quantity: number, order: any) => {
    if (!material) return 0;
    const normMaterial = normalizeMaterialCode(material);
    const machine = getResolvedMachine(order);
    const match = tiemposProduccion.find(t => 
      normalizeMaterialCode(t.CodMaterial || t.Material || '') === normMaterial &&
      String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').trim().toUpperCase() === machine
    ) || tiemposProduccion.find(t => normalizeMaterialCode(t.CodMaterial || t.Material || '') === normMaterial);
    return match ? (Number(match.Tiempo || match.Tiempo_Min || 0) * quantity) : 0;
  }, [tiemposProduccion, normalizeMaterialCode, getResolvedMachine]);

  const group1Suffixes = ['02', '06', '07', '08', '09', '10'];

  const workstationsGroup2 = useMemo(() => {
    return uniqueWorkstations.filter(m => 
      m.includes('ACH11') || m.includes('ACH12') || m.includes('RMTB') || m.includes('COS3D') || m.includes('ENCBD') || m.includes('BO01')
    );
  }, [uniqueWorkstations]);

  const workstationsGroup3 = useMemo(() => {
    return uniqueWorkstations.filter(m => 
      m.includes('INTP') || m.includes('MTBS') || m.includes('CT')
    );
  }, [uniqueWorkstations]);

  const workstationsGroup4 = useMemo(() => {
    return uniqueWorkstations.filter(m => 
      m.includes('FORRO') || m.includes('FBASE') || m.includes('TTCF') || m.includes('TTSUP')
    );
  }, [uniqueWorkstations]);

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

  const renderResolvedProvisionalCell = useCallback((column: string, order: any) => {
    const upperCol = column.toUpperCase().trim();
    if (upperCol === 'MAQUINA') {
      const val = getResolvedMachine(order);
      return val ? (
        <span className="font-black text-slate-700 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200 text-[10px]">
          {val}
        </span>
      ) : (
        <span className="text-slate-300 italic">—</span>
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

  const MachineCard = ({ machineCode, small = false }: { machineCode: string, small?: boolean }) => {
    const orders = dailyOrders.filter(o => getResolvedMachine(o) === machineCode);
    const totalTimeHours = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o), 0) / 60;
    const config = workstationConfigs[machineCode] || { people: 1 };
    const capacityHours = totalHorasNetas * config.people;
    const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;
    const isOverloaded = utilization > 100;

    return (
      <div className={cn(
        "flex border border-slate-200 rounded-3xl overflow-hidden shadow-sm bg-white transition-all hover:shadow-lg",
        small ? "h-[360px]" : "h-[450px]"
      )}>
        <div className={cn(
          "bg-slate-950 p-6 text-white flex flex-col border-r border-slate-800",
          small ? "w-[42%]" : "w-[38%]"
        )}>
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black uppercase tracking-tighter text-slate-100 flex items-center gap-2">
                <Cpu className="w-5 h-5 text-sky-400" />
                {machineCode}
              </h3>
              <Badge variant="outline" className="border-white/20 text-sky-400 font-black text-[8px] uppercase tracking-widest px-2">HR-ENG</Badge>
            </div>
            <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-500 mt-1">Status Operativo Nivel 1</p>
          </div>
          <div className="flex-1 space-y-5">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner">
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Dotación:</span>
                <div className="flex items-center gap-2.5 bg-slate-900 rounded-xl p-1.5 border border-white/10">
                  <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', Math.max(1, config.people - 1))} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-indigo-600 flex items-center justify-center font-black transition-colors">-</button>
                  <span className="font-mono font-black text-sm w-5 text-center text-sky-300">{config.people}</span>
                  <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', config.people + 1)} className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-indigo-600 flex items-center justify-center font-black transition-colors">+</button>
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] border-t border-white/5 pt-3">
                <span className="text-slate-400 font-black uppercase tracking-widest">Capacidad Neta:</span>
                <span className="font-mono font-black text-sky-400 text-sm">{capacityHours.toFixed(2)}h</span>
              </div>
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 shadow-inner">
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]">Ocupación</p>
                <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-lg border", isOverloaded ? "bg-red-500/20 border-red-500/30 text-red-400" : "bg-indigo-500/20 border-indigo-500/30 text-indigo-300")}>
                  {isOverloaded ? "Saturado" : "Estable"}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className={cn("text-4xl font-black font-mono tracking-tighter", isOverloaded ? "text-red-400" : "text-sky-300")}>
                  {utilization.toFixed(0)}
                </span>
                <span className="text-xs font-black text-slate-600">%</span>
              </div>
              <Progress value={utilization} className={cn("h-3 bg-slate-900 border border-white/5", isOverloaded ? "[&>div]:bg-red-500" : "[&>div]:bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.3)]")} />
              <div className="mt-4 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest">
                <div className="bg-slate-900/50 p-2 rounded-lg border border-white/5 text-center">
                  <span className="text-slate-500 block mb-1">Carga</span>
                  <span className="text-slate-100 font-mono">{totalTimeHours.toFixed(2)}h</span>
                </div>
                <div className={cn("p-2 rounded-lg border border-white/5 text-center", isOverloaded ? "bg-red-950/20 text-red-400" : "bg-sky-950/20 text-sky-400")}>
                  <span className="text-slate-500 block mb-1">Remanente</span>
                  <span className="font-mono">{(capacityHours - totalTimeHours).toFixed(2)}h</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 p-6 flex flex-col bg-slate-50/50">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.25em] flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-indigo-600" /> Plan de Producción
            </h4>
            <Badge className="bg-white text-slate-900 border-slate-200 font-mono font-black text-[10px] px-3 py-0.5 rounded-full shadow-sm">{orders.length} <span className="ml-1 text-[8px] opacity-40">ORD</span></Badge>
          </div>
          <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-inner">
            <table className="w-full text-[10px] border-collapse">
              <thead className="bg-slate-100/80 sticky top-0 z-10">
                <tr className="text-slate-500 font-black uppercase tracking-widest text-left">
                  <th className="px-4 py-3 border-b border-slate-200">Material</th>
                  <th className="px-4 py-3 border-b border-slate-200">Descripción</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-right">Cant.</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-center">Unid.</th>
                  <th className="px-4 py-3 border-b border-slate-200 text-right text-indigo-700 bg-indigo-50/50">T. (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o, i) => {
                  const t = calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o) / 60;
                  return (
                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="px-4 py-3 font-mono font-bold text-slate-500 group-hover:text-indigo-600 transition-colors">{o['CodMaterial'] || normalizeMaterialCode(o['MATERIAL'])}</td>
                      <td className="px-4 py-3 truncate max-w-[140px] font-bold text-slate-400 uppercase text-[9px]" title={o['NOMBRE'] || o['TEXTOMATERIAL']}>{o['NOMBRE'] || o['TEXTOMATERIAL']}</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-700">{Number(o['CANTIDAD'] || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-center text-slate-400 font-black uppercase text-[8px]">{o['UNIDAD'] || 'ST'}</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-indigo-600 bg-indigo-50/30 group-hover:bg-indigo-100/50 transition-colors">{t.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

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

  const pagedMantenimientos = mantenimientos.slice((maintPage - 1) * maintPageSize, maintPage * maintPageSize);
  const totalMaintPages = Math.ceil(mantenimientos.length / maintPageSize);

  if (!isMounted) return null;

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50/40 min-h-screen">
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 bg-white p-7 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-6">
          <div className="bg-slate-950 p-5 rounded-[1.5rem] text-white shadow-xl ring-4 ring-slate-100">
            <CalendarClock className="w-9 h-9 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Programación Táctica</h2>
              <Badge className="bg-indigo-600 text-white border-none font-black px-3 py-1 rounded-lg text-[10px] uppercase tracking-widest shadow-sm shadow-indigo-100">Forros</Badge>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Monitor de Planta en Tiempo Real
              </span>
              <div className="h-4 w-px bg-slate-200 mx-1" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Eficiencia: 84%
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex items-center gap-5 min-w-[200px] shadow-inner group hover:bg-indigo-50 transition-colors">
            <div className="bg-indigo-700 p-3 rounded-2xl text-white shadow-lg group-hover:scale-110 transition-transform"><MapPin className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">GYE (2000)</p>
              <p className="text-2xl font-black text-slate-900 font-mono tracking-tight">{dailyOrders.filter(o => String(o.Centro).trim() === '2000').length.toLocaleString()} <span className="text-xs text-slate-400 opacity-60 font-bold">ORD</span></p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex items-center gap-5 min-w-[200px] shadow-inner group hover:bg-slate-900 transition-colors">
            <div className="bg-slate-800 p-3 rounded-2xl text-white shadow-lg group-hover:bg-indigo-600 transition-colors"><MapPin className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 group-hover:text-slate-500 transition-colors">UIO (1000)</p>
              <p className="text-2xl font-black text-slate-900 font-mono tracking-tight group-hover:text-white transition-colors">{dailyOrders.filter(o => String(o.Centro).trim() === '1000').length.toLocaleString()} <span className="text-xs text-slate-400 opacity-60 font-bold">ORD</span></p>
            </div>
          </div>
        </div>
      </div>

      <Card className="rounded-3xl shadow-sm border-slate-200 bg-white overflow-hidden ring-1 ring-slate-100">
        <div className="px-8 py-5 flex flex-col md:flex-row items-center justify-between gap-8 bg-slate-50/40">
          <div className="flex flex-wrap items-center gap-10 opacity-40 grayscale pointer-events-none">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Inicio Horizonte
              </label>
              <input type="date" value={todayDate} className="bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-black text-slate-800 outline-none transition-all shadow-sm w-[180px]" disabled />
            </div>
            <div className="flex items-center pt-6"><ArrowRight className="w-5 h-5 text-slate-300 mx-2" /></div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.3em] flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Fin Horizonte
              </label>
              <input type="date" value={targetDate} className="bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-black text-slate-800 outline-none transition-all shadow-sm w-[180px]" disabled />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-indigo-50 border border-indigo-100 px-5 py-3 rounded-2xl">
              <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Buffer Maestro Total Activado
              </span>
            </div>
            <Button onClick={fetchDailyOrders} disabled={isLoadingDaily} variant="outline" className="h-14 w-14 rounded-2xl border-2 border-slate-200 hover:bg-white text-slate-600 shadow-sm active:scale-95">
              <RefreshCw className={cn("w-5 h-5", isLoadingDaily && "animate-spin")} />
            </Button>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="resumen-produccion" className="w-full">
        <TabsList className="flex w-full h-auto bg-white border border-slate-200 p-2.5 mb-10 rounded-[2rem] shadow-sm overflow-x-auto justify-start sticky top-0 z-50 ring-1 ring-slate-100">
          <TabsTrigger value="resumen-produccion" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500 group">
            <BarChart3 className="w-4 h-4 group-data-[state=active]:text-sky-400" /> Resumen de Producción
          </TabsTrigger>
          <TabsTrigger value="kpi-tiempos" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500 group">
            <Zap className="w-4 h-4 group-data-[state=active]:text-sky-400" /> KPI TIEMPOS
          </TabsTrigger>
          <TabsTrigger value="acolchado-tapas" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500 group">
            <Cpu className="w-4 h-4 group-data-[state=active]:text-sky-400" /> 1. Acolchado & Tapas
          </TabsTrigger>
          <TabsTrigger value="bandas" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500 group">
            <Layers className="w-4 h-4 group-data-[state=active]:text-sky-400" /> 2. Proceso Bandas
          </TabsTrigger>
          <TabsTrigger value="interiores-corte" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500 group">
            <Settings2 className="w-4 h-4 group-data-[state=active]:text-sky-400" /> 3. Interiores & Corte
          </TabsTrigger>
          <TabsTrigger value="forros" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500 group">
            <LayoutGrid className="w-4 h-4 group-data-[state=active]:text-sky-400" /> 4. Forros Finales
          </TabsTrigger>
          <TabsTrigger value="componentes" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500 group">
            <Inbox className="w-4 h-4 group-data-[state=active]:text-sky-400" /> Componentes
          </TabsTrigger>
          <TabsTrigger value="mantenimiento" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500 group">
            <Wrench className="w-4 h-4 group-data-[state=active]:text-sky-400" /> Mantenimiento
          </TabsTrigger>
          <TabsTrigger value="personal-turnos" className="flex items-center gap-2 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500 group">
            <UserPlus className="w-4 h-4 group-data-[state=active]:text-sky-400" /> Capacidad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen-produccion">
          <Card className="rounded-[2.5rem] shadow-sm border-slate-200 overflow-hidden bg-white ring-1 ring-slate-100">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-7 h-7 text-indigo-600" />
                    <CardTitle className="text-2xl font-black text-slate-900 uppercase tracking-tight">Matriz de Salud de Planta</CardTitle>
                  </div>
                  <CardDescription className="mt-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest">Análisis de carga total vs capacidad neta por Hoja de Ruta</CardDescription>
                </div>
                <div className="bg-slate-950 px-6 py-3 rounded-2xl text-white shadow-lg ring-4 ring-slate-100">
                  <span className="text-sm font-black font-mono">{totalHorasNetas.toFixed(2)}h / Operador (84% Efic.)</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-slate-900 sticky top-0 z-10 text-white">
                    <tr className="text-slate-400 font-black uppercase tracking-[0.2em]">
                      <th className="px-8 py-5 text-left bg-slate-950">HOJA DE RUTA</th>
                      <th className="px-8 py-5 text-left">Puesto de Trabajo</th>
                      <th className="px-8 py-5 text-center">Ingeniería (min/u)</th>
                      <th className="px-8 py-5 text-right">Cant. Total</th>
                      <th className="px-8 py-5 text-right bg-indigo-950/20">T. Requerido (h)</th>
                      <th className="px-8 py-5 text-right">Capacidad (h)</th>
                      <th className="px-8 py-5 text-center">% Ocupación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {uniqueWorkstations.map((ws, idx) => {
                      const orders = dailyOrders.filter(o => getResolvedMachine(o) === ws);
                      const totalUnits = orders.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0);
                      const matches = tiemposProduccion.filter(t => String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').trim().toUpperCase() === ws);
                      const avgHrMin = matches.length > 0 ? matches.reduce((sum, t) => sum + Number(t.Tiempo || t.Tiempo_Min || 0), 0) / matches.length : 0;
                      const totalTimeHours = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o), 0) / 60;
                      const config = workstationConfigs[ws] || { people: 1 };
                      const capacityHours = totalHorasNetas * config.people;
                      const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;

                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-all group">
                          <td className="px-8 py-5 font-mono font-black text-indigo-700 bg-indigo-50/20">{ws.startsWith('HR') ? ws : `HR-${ws}`}</td>
                          <td className="px-8 py-5 font-black text-slate-900 uppercase">{ws}</td>
                          <td className="px-8 py-5 text-center font-mono font-bold text-slate-400">{avgHrMin.toFixed(2)}</td>
                          <td className="px-8 py-5 text-right font-mono font-black text-slate-800">{totalUnits.toLocaleString()}</td>
                          <td className="px-8 py-5 text-right font-mono font-black text-indigo-700 bg-indigo-50/40">{totalTimeHours.toFixed(2)}h</td>
                          <td className="px-8 py-5 text-right font-mono font-bold text-slate-900">{capacityHours.toFixed(2)}h</td>
                          <td className="px-8 py-5 text-center">
                             <div className="flex items-center justify-center gap-3">
                               <div className="w-16 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                 <motion.div initial={{width:0}} animate={{width: `${Math.min(utilization, 100)}%`}} className={cn("h-full", utilization > 100 ? "bg-red-500" : "bg-indigo-600")} />
                               </div>
                               <span className={cn("font-mono font-black", utilization > 100 ? "text-red-600" : "text-slate-900")}>{utilization.toFixed(0)}%</span>
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kpi-tiempos">
          <Card className="rounded-[2.5rem] shadow-sm border-slate-200 overflow-hidden bg-white ring-1 ring-slate-100">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <History className="w-7 h-7 text-indigo-600" />
                    <CardTitle className="text-2xl font-black text-slate-900 uppercase tracking-tight">Maestros Técnicos de Ingeniería</CardTitle>
                  </div>
                  <CardDescription className="mt-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest">Base de datos de tiempos de ensamble por material y puesto</CardDescription>
                </div>
                <div className="flex items-center gap-3 bg-slate-950 px-6 py-3 rounded-2xl text-white">
                  <span className="text-xs font-black font-mono">{tiemposProduccion.length} Registros Activos</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[65vh]">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-900 sticky top-0 z-10 text-white">
                    <tr className="text-slate-400 font-black uppercase tracking-widest">
                      <th className="px-6 py-4 text-left">Código Material</th>
                      <th className="px-6 py-4 text-left">Descripción</th>
                      <th className="px-6 py-4 text-center">Centro</th>
                      <th className="px-6 py-4 text-left">Línea</th>
                      <th className="px-6 py-4 text-left text-sky-400">Puesto (Hoja de Ruta)</th>
                      <th className="px-6 py-4 text-right">Tiempo (min)</th>
                      <th className="px-6 py-4 text-center">Resp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {tiemposProduccion.map((t, idx) => (
                      <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-6 py-3 font-mono font-bold text-slate-700">{t.CodMaterial || t.Material || '—'}</td>
                        <td className="px-6 py-3 uppercase text-slate-500 truncate max-w-[250px]" title={t.Material || t.NOMBRE}>{t.Material || t.NOMBRE || '—'}</td>
                        <td className="px-6 py-3 text-center font-bold text-slate-400">{t.Centro || '—'}</td>
                        <td className="px-6 py-3 text-slate-600 font-medium">{t.Linea || '—'}</td>
                        <td className="px-6 py-3 font-black text-indigo-700">{t.PuestoTrabajo || t.nombre_estacion || '—'}</td>
                        <td className="px-6 py-3 text-right font-mono font-black text-sky-600 bg-sky-50/30">{Number(t.Tiempo || t.Tiempo_Min || 0).toFixed(2)}</td>
                        <td className="px-6 py-3 text-center text-slate-400 font-bold">{t.RespControlProd || t.RESPCONTROLPROD || '—'}</td>
                      </tr>
                    ))}
                    {tiemposProduccion.length === 0 && (
                      <tr><td colSpan={7} className="py-32 text-center text-slate-300 font-black uppercase text-sm tracking-widest">No se encontraron datos técnicos para este grupo</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acolchado-tapas" className="space-y-16 pb-20">
          {group1Suffixes.map(suffix => {
            const achCode = `HR-ACH${suffix}`;
            const pefCode = `HR-PEF${suffix}`;
            const achExists = uniqueWorkstations.includes(achCode);
            const pefExists = uniqueWorkstations.includes(pefCode);
            if (!achExists && !pefExists) return null;
            return (
              <div key={suffix} className="space-y-6">
                <div className="flex items-center gap-4 px-7 py-2.5 bg-slate-900 rounded-full w-fit shadow-xl">
                  <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                  <span className="text-white font-black text-xs uppercase tracking-[0.3em]">Célula Twin {suffix}</span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                  {achExists ? <MachineCard machineCode={achCode} /> : <div className="hidden xl:flex bg-slate-100/30 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-20 text-slate-300 font-black uppercase text-[10px]">No Definido</div>}
                  {pefExists ? <MachineCard machineCode={pefCode} /> : <div className="hidden xl:flex bg-slate-100/30 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-20 text-slate-300 font-black uppercase text-[10px]">No Definido</div>}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="bandas" className="space-y-10 pb-20">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {workstationsGroup2.map((wsCode) => (<MachineCard key={wsCode} machineCode={wsCode} small />))}
          </div>
        </TabsContent>

        <TabsContent value="interiores-corte" className="space-y-10 pb-20">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {workstationsGroup3.map((wsCode) => (<MachineCard key={wsCode} machineCode={wsCode} small />))}
          </div>
        </TabsContent>

        <TabsContent value="forros" className="space-y-10 pb-20">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {workstationsGroup4.map((wsCode) => (<MachineCard key={wsCode} machineCode={wsCode} small />))}
          </div>
        </TabsContent>

        <TabsContent value="componentes">
           <Card className="rounded-[2.5rem] bg-white overflow-hidden ring-1 ring-slate-100">
             <CardHeader className="bg-slate-50/50 p-10">
                <div className="flex items-center gap-4">
                  <Inbox className="w-8 h-8 text-indigo-600" />
                  <div>
                    <CardTitle className="text-2xl font-black text-slate-900 uppercase">Buffer Maestro de Componentes</CardTitle>
                    <CardDescription className="text-[9px] font-bold tracking-widest text-slate-400 mt-1 uppercase">Listado global sin restricciones de fecha</CardDescription>
                  </div>
                </div>
             </CardHeader>
             <CardContent className="p-0">
                <ProvisionalOrdersTabSection 
                  externalFilters={externalFilters} 
                  renderCell={renderResolvedProvisionalCell} 
                  groupBy="ORDENPREVISIONAL"
                  resolveValue={resolveLogicValue} 
                />
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="mantenimiento">
          <Card className="rounded-[2.5rem] overflow-hidden bg-white ring-1 ring-slate-100">
            <CardHeader className="bg-slate-50/50 p-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Wrench className="w-8 h-8 text-slate-400" />
                  <div>
                    <CardTitle className="text-2xl font-black text-slate-900 uppercase">Paradas Programadas</CardTitle>
                    <CardDescription className="text-[9px] font-bold tracking-widest text-slate-400 mt-1 uppercase">Mantenimiento preventivo</CardDescription>
                  </div>
                </div>
                <Button onClick={fetchMantenimientos} disabled={isLoadingMantenimientos} variant="outline" className="rounded-2xl font-black uppercase text-[10px]">
                  <RefreshCw className={cn("w-4 h-4 mr-2", isLoadingMantenimientos && "animate-spin")} /> Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-slate-950 text-white">
                    <tr className="text-slate-400 font-black uppercase tracking-[0.25em]">
                      <th className="px-8 py-5 text-left">FECHA PROG.</th>
                      <th className="px-8 py-5 text-left">EQUIPO</th>
                      <th className="px-8 py-5 text-left text-sky-400">DESCRIPCIÓN</th>
                      <th className="px-8 py-5 text-left">FRECUENCIA</th>
                      <th className="px-8 py-5 text-left">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedMantenimientos.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-8 py-5 font-mono font-black">{m.FECHA_PRO ? new Date(m.FECHA_PRO).toLocaleDateString('es-ES') : '—'}</td>
                        <td className="px-8 py-5 font-mono font-bold text-slate-500">{m.CODIGO_EQ || '—'}</td>
                        <td className="px-8 py-5 font-black text-slate-700">{m.NOMBRE_EQ || '—'}</td>
                        <td className="px-8 py-5 text-slate-400 font-black uppercase text-[10px]">{m.T_FREC || '—'}</td>
                        <td className="px-8 py-5"><Badge className="bg-indigo-600 text-white uppercase text-[10px] font-black">{m.ESTADO || 'PENDIENTE'}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal-turnos">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <Card className="lg:col-span-1 rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden">
               <CardHeader className="bg-slate-950 text-white p-8"><CardTitle className="text-xl font-black uppercase">Parámetros de Jornada</CardTitle></CardHeader>
               <CardContent className="p-10 space-y-10">
                 <div className="space-y-5">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em]">Jornada Diurna (L-V)</label>
                    <Select value={jornadaDiurnaSel} onValueChange={setJornadaDiurnaSel}>
                      <SelectTrigger className="h-14 border-2 rounded-2xl font-black text-slate-800"><SelectValue /></SelectTrigger>
                      <SelectContent>{DIURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-black py-3">{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                 </div>
                 <div className="p-8 bg-slate-950 rounded-[2rem] text-white">
                    <div className="grid grid-cols-2 gap-8">
                      <div><p className="text-2xl font-black font-mono">{horasNetasDiurnas.toFixed(2)}h</p><p className="text-[10px] uppercase mt-2">Día Neto</p></div>
                      <div><p className="text-2xl font-black font-mono">{horasNetasNocturnas.toFixed(2)}h</p><p className="text-[10px] uppercase mt-2">Noche Neto</p></div>
                    </div>
                    <div className="mt-10 pt-8 border-t border-white/5 flex flex-col items-center">
                      <span className="text-4xl font-black text-sky-400 font-mono tracking-tighter">{totalHorasNetas.toFixed(2)}h</span>
                      <span className="text-[11px] font-black text-slate-500 uppercase mt-3">Capacidad Diaria / Persona</span>
                    </div>
                 </div>
               </CardContent>
            </Card>
            <Card className="lg:col-span-2 rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden">
               <CardHeader className="bg-slate-50/50 p-10"><CardTitle className="text-2xl font-black uppercase tracking-tight">Dotación de Planta</CardTitle></CardHeader>
               <CardContent className="p-10">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-h-[65vh] overflow-y-auto pr-4">
                    {uniqueWorkstations.map(ws => {
                      const config = workstationConfigs[ws] || { people: 1 };
                      return (
                        <div key={ws} className="flex items-center justify-between p-6 border-2 border-slate-50 rounded-[2rem] bg-white hover:border-indigo-100 transition-all">
                          <div>
                            <p className="font-black text-slate-800 uppercase text-sm">{ws}</p>
                            <Badge className="bg-slate-100 text-slate-400 border-none font-mono text-[10px] mt-2">CAP: {(config.people * totalHorasNetas).toFixed(1)}h</Badge>
                          </div>
                          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', Math.max(1, config.people - 1))} className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center font-black">-</button>
                            <span className="font-mono font-black text-lg min-w-[32px] text-center text-indigo-700">{config.people}</span>
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', config.people + 1)} className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center font-black">+</button>
                          </div>
                        </div>
                      );
                    })}
                 </div>
               </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
