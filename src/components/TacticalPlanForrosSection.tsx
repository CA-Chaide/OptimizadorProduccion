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
  Calculator,
  GraduationCap,
  Wrench,
  Activity,
  ClipboardList,
  AlertTriangle,
  Info,
  CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
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
  dayCode?: string;
  dayName?: string;
  nightCode?: string;
  nightName?: string;
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

  // FECHAS
  const [todayDate, setTodayDate] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>('');

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
        const filtered = response.data.filter((order: any) => {
          const normalizedOrderDate = normalizeDateForFilter(order['FECHAINICIO']);
          return normalizedOrderDate >= todayDate && normalizedOrderDate <= targetDate;
        });
        setDailyOrders(filtered);
      }
    } catch (error) {
      console.error('Error fetching daily orders:', error);
    } finally {
      setIsLoadingDaily(false);
    }
  }, [externalFilters, todayDate, targetDate, normalizeDateForFilter]);

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
      if (ws && ws !== 'null' && ws.toUpperCase() !== 'MARCOSUIO') wsSet.add(ws);
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
        <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
          {val}
        </span>
      ) : (
        <span className="text-gray-400 italic">—</span>
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

  const MachineCard = ({ machineCode, title }: { machineCode: string, title: string }) => {
    const orders = dailyOrders.filter(o => getResolvedMachine(o) === machineCode);
    const quantity = orders.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0);
    const totalTimeMin = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o), 0);
    const totalTimeHours = totalTimeMin / 60;
    const config = workstationConfigs[machineCode] || { people: 1 };
    const capacityHours = totalHorasNetas * config.people;
    const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;
    const isOverloaded = utilization > 100;

    return (
      <div className="flex border-2 border-slate-800 rounded-lg overflow-hidden h-[480px] shadow-xl w-full bg-white">
        <div className="w-[35%] bg-[#0070c0] p-5 text-white flex flex-col border-r-2 border-slate-800">
          <div className="mb-4">
            <h4 className="text-xs font-black uppercase tracking-widest opacity-80 mb-1">{machineCode}</h4>
            <h3 className="text-2xl font-black uppercase leading-tight tracking-tighter">{title}</h3>
          </div>
          
          <div className="flex-1 space-y-5">
            <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
              <p className="text-[10px] font-bold uppercase opacity-60 mb-3 tracking-widest">Capacidad Técnica</p>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 font-bold uppercase text-[11px]"><Users className="w-4 h-4" /> Personal:</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', Math.max(1, config.people - 1))} className="w-6 h-6 rounded bg-white/20 hover:bg-white/40 flex items-center justify-center">-</button>
                    <span className="font-mono font-black text-xl">{config.people}</span>
                    <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', config.people + 1)} className="w-6 h-6 rounded bg-white/20 hover:bg-white/40 flex items-center justify-center">+</button>
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 font-bold uppercase text-[11px]"><Activity className="w-4 h-4" /> Disponible:</span>
                  <span className="font-mono font-black text-lg">{capacityHours.toFixed(2)}h</span>
                </div>
              </div>
            </div>

            <div className="bg-white/10 p-4 rounded-xl backdrop-blur-sm border border-white/10">
              <p className="text-[10px] font-bold uppercase opacity-60 mb-3 tracking-widest">Saturación</p>
              <div className="flex items-baseline gap-2 mb-2">
                <span className={cn("text-5xl font-black font-mono tracking-tighter", isOverloaded ? "text-red-300" : "text-white")}>
                  {utilization.toFixed(1)}
                </span>
                <span className="text-xl font-bold opacity-60">%</span>
              </div>
              <Progress value={utilization} className={cn("h-4 bg-white/20", isOverloaded ? "[&>div]:bg-red-400" : "[&>div]:bg-green-400")} />
              <p className="text-[11px] mt-3 font-black uppercase text-center opacity-80">
                Uso: {totalTimeHours.toFixed(2)}h / {capacityHours.toFixed(2)}h
              </p>
            </div>
          </div>
        </div>

        <div className="flex-1 bg-[#1d5c2a] p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/20">
            <h3 className="text-xl font-black text-white uppercase flex items-center gap-2 tracking-tighter">
              <ClipboardList className="w-6 h-6 text-green-300" /> ÓRDENES DE TRABAJO
            </h3>
            <Badge className="bg-white/10 text-white border-white/30 font-mono px-3 py-1">{orders.length} LÍNEAS</Badge>
          </div>
          
          <div className="flex-1 overflow-auto rounded-lg border border-white/10 bg-black/10">
            <table className="w-full text-[10px] text-white/90">
              <thead className="bg-black/30 sticky top-0 z-10 backdrop-blur-sm">
                <tr>
                  <th className="px-3 py-3 text-left font-black uppercase text-green-300 border-b border-white/10 tracking-widest">CodMaterial</th>
                  <th className="px-3 py-3 text-left font-black uppercase text-green-300 border-b border-white/10 tracking-widest">Nombre</th>
                  <th className="px-3 py-3 text-right font-black uppercase text-green-300 border-b border-white/10 tracking-widest">Cant.</th>
                  <th className="px-3 py-3 text-center font-black uppercase text-green-300 border-b border-white/10 tracking-widest">Unid.</th>
                  <th className="px-3 py-3 text-right font-black uppercase text-green-300 border-b border-white/10 tracking-widest">Tiempo (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {orders.map((o, i) => {
                  const t = calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o) / 60;
                  return (
                    <tr key={i} className="hover:bg-white/10 transition-all cursor-default">
                      <td className="px-3 py-2.5 font-mono font-bold text-green-100">{o['CodMaterial'] || normalizeMaterialCode(o['MATERIAL'])}</td>
                      <td className="px-3 py-2.5 max-w-[150px] truncate font-medium uppercase" title={o['NOMBRE'] || o['TEXTOMATERIAL']}>{o['NOMBRE'] || o['TEXTOMATERIAL']}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-black text-white">{Number(o['CANTIDAD'] || 0).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-center opacity-70 font-bold uppercase">{o['UNIDAD'] || 'ST'}</td>
                      <td className="px-3 py-2.5 text-right font-mono font-black text-green-300">{t.toFixed(2)}h</td>
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

  const chnBasesDateTotals = useMemo(() => {
    const today = dailyOrders.filter(o => normalizeDateForFilter(o['FECHAINICIO']) === todayDate);
    const target = dailyOrders.filter(o => normalizeDateForFilter(o['FECHAINICIO']) === targetDate);
    return {
      totalToday: today.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0),
      totalTarget: target.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0)
    };
  }, [dailyOrders, todayDate, targetDate, normalizeDateForFilter]);

  const machinePairs = useMemo(() => {
    const suffixes = ["02", "06", "08", "09", "10"];
    return suffixes.map(s => ({ suffix: s, ach: `HR-ACH${s}`, pef: `HR-PEF${s}` }));
  }, []);

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
    <div className="p-6 md:p-8 space-y-6 bg-slate-50 min-h-screen">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="bg-slate-800 p-2 rounded-lg text-white">
            <CalendarClock className="w-6 h-6" />
          </div>
          <h2 className="text-3xl font-black text-slate-800 uppercase tracking-tighter">Programación Táctica Forros</h2>
        </div>
      </div>

      <Tabs defaultValue="diaria" className="w-full">
        <TabsList className="flex w-full h-auto bg-white border border-slate-200 p-1 mb-8 rounded-xl shadow-sm overflow-x-auto justify-start">
          <TabsTrigger value="diaria" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-lg transition-all text-sm font-bold uppercase tracking-tight text-slate-500"><CalendarCheck className="w-4 h-4" /> Tablero Visual ACH-PEF</TabsTrigger>
          <TabsTrigger value="mantenimiento" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-lg transition-all text-sm font-bold uppercase tracking-tight text-slate-500"><Wrench className="w-4 h-4" /> Mantenimiento Preventivo</TabsTrigger>
          <TabsTrigger value="grupos" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-lg transition-all text-sm font-bold uppercase tracking-tight text-slate-500"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-lg transition-all text-sm font-bold uppercase tracking-tight text-slate-500"><Lock className="w-4 h-4" /> Restricciones</TabsTrigger>
          <TabsTrigger value="tiempos" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-lg transition-all text-sm font-bold uppercase tracking-tight text-slate-500"><Timer className="w-4 h-4" /> Maestros Técnicos</TabsTrigger>
          <TabsTrigger value="personal-turnos" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-lg transition-all text-sm font-bold uppercase tracking-tight text-slate-500"><UserPlus className="w-4 h-4" /> Capacidad Turnos</TabsTrigger>
          <TabsTrigger value="forros-chn-bases" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-white rounded-lg transition-all text-sm font-bold uppercase tracking-tight text-slate-500"><Package className="w-4 h-4" /> Forros & Bases</TabsTrigger>
        </TabsList>

        <TabsContent value="diaria" className="space-y-12">
          {/* Tablero Twin-Board Visual */}
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-lg">
            <div className="flex items-center gap-5">
              <div className="bg-indigo-600 p-4 rounded-2xl shadow-xl shadow-indigo-100">
                <CalendarCheck className="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tighter leading-none">Tablero de Control Componentes</h3>
                <p className="text-sm text-slate-500 font-bold mt-2 uppercase tracking-wide">Carga sincronizada para: <span className="text-indigo-600">{todayDate}</span></p>
              </div>
            </div>
            <Button onClick={fetchDailyOrders} disabled={isLoadingDaily} className="bg-slate-800 hover:bg-slate-700 h-12 px-6 rounded-xl font-black uppercase text-xs tracking-widest transition-all shadow-lg"><RefreshCw className={cn("h-4 w-4 mr-2", isLoadingDaily && "animate-spin")} /> Refrescar</Button>
          </div>

          <div className="space-y-16 pb-24">
            {machinePairs.map((pair) => (
              <div key={pair.suffix} className="space-y-6">
                <div className="flex items-center gap-5 px-2">
                  <Badge className="bg-slate-800 text-white px-8 py-2 rounded-full font-black text-lg tracking-widest shadow-2xl">LÍNEA TÉCNICA {pair.suffix}</Badge>
                  <div className="h-1 flex-1 bg-gradient-to-r from-slate-800 to-transparent opacity-10 rounded-full"></div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                  <MachineCard machineCode={pair.ach} title={`Acolchadora ${pair.suffix}`} />
                  <MachineCard machineCode={pair.pef} title={`Pegadora de Tapa ${pair.suffix}`} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="mantenimiento">
          <Card className="rounded-2xl shadow-lg border-slate-200 overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tighter flex items-center gap-2"><Wrench className="w-6 h-6 text-indigo-600" /> Mantenimientos Preventivos Programados</CardTitle>
                  <CardDescription className="font-bold uppercase text-[10px] tracking-widest text-slate-400 mt-1">Filtrado por responsables de Forros • Orden cronológico</CardDescription>
                </div>
                <Button onClick={fetchMantenimientos} disabled={isLoadingMantenimientos} variant="outline" size="sm" className="h-9 px-4 font-black uppercase text-[10px] tracking-widest">
                  <RefreshCw className={cn("w-3 h-3 mr-2", isLoadingMantenimientos && "animate-spin")} /> Sincronizar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                    <tr className="text-slate-600 font-black uppercase tracking-widest">
                      <th className="px-4 py-4 text-left border-r border-slate-200 bg-indigo-50/50">FECHA PROG.</th>
                      <th className="px-4 py-4 text-left border-r border-slate-200">EQUIPO</th>
                      <th className="px-4 py-4 text-left border-r border-slate-200">NOMBRE EQUIPO</th>
                      <th className="px-4 py-4 text-left border-r border-slate-200">FRECUENCIA</th>
                      <th className="px-4 py-4 text-left border-r border-slate-200">RESPONSABLE</th>
                      <th className="px-4 py-4 text-left">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {isLoadingMantenimientos ? (
                      <tr><td colSpan={6} className="py-20 text-center font-bold text-slate-400 italic">Consultando maestro de mantenimiento...</td></tr>
                    ) : pagedMantenimientos.length > 0 ? (
                      pagedMantenimientos.map((m, idx) => (
                        <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                          <td className="px-4 py-3.5 font-mono font-black text-indigo-700 bg-indigo-50/10">
                            {m.FECHA_PRO ? new Date(m.FECHA_PRO).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-3.5 font-mono font-bold text-slate-700">{m.CODIGO_EQ || '—'}</td>
                          <td className="px-4 py-3.5 font-medium text-slate-600 uppercase">{m.NOMBRE_EQ || '—'}</td>
                          <td className="px-4 py-3.5 text-slate-500 font-bold uppercase">{m.T_FREC || '—'}</td>
                          <td className="px-4 py-3.5">
                            <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 font-mono text-[10px] px-2">{m.RespCtrlProd || '—'}</Badge>
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge className={cn(
                              "font-black text-[9px] px-2 py-0.5 border-none",
                              m.ESTADO === 'PROGRAMADO' ? "bg-blue-500 text-white" : 
                              m.ESTADO === 'EJECUTADO' ? "bg-emerald-500 text-white" : 
                              "bg-slate-400 text-white"
                            )}>
                              {m.ESTADO || 'PENDIENTE'}
                            </Badge>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr><td colSpan={6} className="py-20 text-center text-slate-400 italic font-bold">No se encontraron mantenimientos para los responsables definidos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Paginación de Mantenimiento */}
              {totalMaintPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Mostrando {pagedMantenimientos.length} de {mantenimientos.length} registros
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(1)} disabled={maintPage === 1} className="h-8 w-8"><ChevronsLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(prev => Math.max(1, prev - 1))} disabled={maintPage === 1} className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>
                    
                    {getPageNumbers(maintPage, totalMaintPages).map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => typeof p === 'number' && setMaintPage(p)}
                        className={cn(
                          "min-w-[32px] h-8 rounded-md text-[11px] font-black transition-all border",
                          maintPage === p 
                            ? "bg-slate-800 text-white border-slate-800 shadow-lg" 
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {p}
                      </button>
                    ))}

                    <Button variant="outline" size="icon" onClick={() => setMaintPage(prev => Math.min(totalMaintPages, prev + 1))} disabled={maintPage === totalMaintPages} className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(totalMaintPages)} disabled={maintPage === totalMaintPages} className="h-8 w-8"><ChevronsRight className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grupos">
           <Card className="rounded-2xl shadow-lg border-slate-200 overflow-hidden">
             <CardHeader className="bg-slate-50 border-b border-slate-200"><CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tighter">Grupos Técnicos Asignados</CardTitle></CardHeader>
             <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {forrosGruposList.map(g => (
                    <div key={g.codigo_grupo} className="p-5 border-2 border-slate-100 rounded-2xl bg-white hover:border-indigo-200 transition-all group">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="bg-indigo-50 p-2 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors"><ListTree className="w-5 h-5" /></div>
                        <h4 className="font-black text-slate-800 uppercase tracking-tight">{g.nombre_grupo}</h4>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-bold uppercase">ID: <span className="text-slate-800">{g.codigo_grupo}</span></p>
                        <p className="text-xs text-slate-500 font-bold uppercase">Centro: <span className="text-indigo-600">{g.centro}</span></p>
                      </div>
                    </div>
                  ))}
                </div>
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="restricciones">
           <Card className="rounded-2xl shadow-lg border-slate-200 overflow-hidden">
             <CardHeader className="bg-slate-50 border-b border-slate-200"><CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tighter">Configuración de Reglas de Negocio</CardTitle></CardHeader>
             <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {forrosRestricciones.map(r => (
                     <div key={r.codigo_restriccion} className="flex items-start gap-4 p-5 bg-white border-2 border-slate-100 rounded-2xl">
                        <div className="bg-amber-50 p-3 rounded-xl text-amber-600"><Lock className="w-6 h-6" /></div>
                        <div>
                          <h4 className="font-black text-slate-800 uppercase text-sm tracking-widest mb-1">{r.nombre_restriccion}</h4>
                          <Badge className="bg-slate-800 text-white font-mono mb-2">{r.valor_restriccion}</Badge>
                          <p className="text-xs text-slate-500 leading-relaxed font-medium">{r.descripcion || 'Sin descripción adicional.'}</p>
                        </div>
                     </div>
                   ))}
                </div>
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="rounded-2xl shadow-lg border-slate-200 overflow-hidden">
             <CardHeader className="bg-slate-50 border-b border-slate-200">
               <div className="flex items-center justify-between">
                 <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tighter">Maestros Técnicos de Producción</CardTitle>
                 <Badge variant="outline" className="font-mono">{tiemposProduccion.length} Registros</Badge>
               </div>
             </CardHeader>
             <CardContent className="p-0">
               <div className="overflow-x-auto max-h-[60vh]">
                 <table className="w-full text-[10px] border-collapse">
                   <thead className="bg-slate-100 border-b border-slate-200 sticky top-0 z-10">
                     <tr className="text-slate-600 font-black uppercase tracking-widest">
                       <th className="px-4 py-3 text-left">CodMaterial</th>
                       <th className="px-4 py-3 text-left">Descripción</th>
                       <th className="px-4 py-3 text-left">Línea</th>
                       <th className="px-4 py-3 text-left">Puesto</th>
                       <th className="px-4 py-3 text-right">Tiempo (min)</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {isLoadingTiempos ? (
                       <tr><td colSpan={5} className="py-20 text-center font-bold text-slate-400 italic">Sincronizando con ingeniería...</td></tr>
                     ) : tiemposProduccion.map((t, idx) => (
                       <tr key={idx} className="hover:bg-slate-50">
                         <td className="px-4 py-2.5 font-mono font-bold text-indigo-700">{t.CodMaterial || t.Material}</td>
                         <td className="px-4 py-2.5 uppercase font-medium text-slate-600">{t.Material || t.nombre_material || t.DESCRIPCION}</td>
                         <td className="px-4 py-2.5 font-bold text-slate-700">{t.Linea || t.nombre_linea}</td>
                         <td className="px-4 py-2.5"><Badge variant="outline" className="bg-white">{t.PuestoTrabajo || t.nombre_estacion}</Badge></td>
                         <td className="px-4 py-2.5 text-right font-mono font-black">{Number(t.Tiempo || t.Tiempo_Min).toFixed(2)}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal-turnos">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-1 rounded-2xl shadow-lg border-slate-200 overflow-hidden">
               <CardHeader className="bg-slate-800 text-white border-b border-slate-700">
                 <CardTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-2"><Clock className="w-6 h-6 text-orange-400" /> Horarios de Planta</CardTitle>
               </CardHeader>
               <CardContent className="p-6 space-y-8">
                 <div className="space-y-4">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Jornada Diurna (L-V)</label>
                    <Select value={jornadaDiurnaSel} onValueChange={setJornadaDiurnaSel}>
                      <SelectTrigger className="h-12 border-2 border-slate-100 rounded-xl font-bold text-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-bold">{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                 </div>
                 <div className="space-y-4">
                    <label className="text-xs font-black text-slate-500 uppercase tracking-widest">Jornada Nocturna</label>
                    <Select value={jornadaNocturnaSel} onValueChange={setJornadaNocturnaSel}>
                      <SelectTrigger className="h-12 border-2 border-slate-100 rounded-xl font-bold text-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOCTURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-bold">{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                 </div>
                 <div className="p-6 bg-slate-900 rounded-2xl text-white shadow-xl">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Resumen Capacidad Neta (84%)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border-l-4 border-orange-400 pl-4">
                        <p className="text-2xl font-black font-mono">{horasNetasDiurnas.toFixed(2)}h</p>
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Día</p>
                      </div>
                      <div className="border-l-4 border-indigo-400 pl-4">
                        <p className="text-2xl font-black font-mono">{horasNetasNocturnas.toFixed(2)}h</p>
                        <p className="text-[9px] font-bold text-slate-500 uppercase">Noche</p>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 border-t border-white/10">
                      <p className="text-4xl font-black text-emerald-400 font-mono tracking-tighter">{totalHorasNetas.toFixed(2)}h</p>
                      <p className="text-[10px] font-black text-slate-500 uppercase mt-1">Total Horas/Persona día</p>
                    </div>
                 </div>
               </CardContent>
            </Card>

            <Card className="lg:col-span-2 rounded-2xl shadow-lg border-slate-200 overflow-hidden">
               <CardHeader className="bg-slate-50 border-b border-slate-200">
                 <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tighter">Configuración de Puestos de Trabajo</CardTitle>
                 <CardDescription className="font-bold uppercase text-[10px] text-slate-400">Define el número de personas para calcular la capacidad por puesto</CardDescription>
               </CardHeader>
               <CardContent className="p-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                    {uniqueWorkstations.map(ws => {
                      const config = workstationConfigs[ws] || { people: 1 };
                      return (
                        <div key={ws} className="flex items-center justify-between p-4 border-2 border-slate-100 rounded-2xl bg-white hover:border-slate-300 transition-all">
                          <div>
                            <p className="font-black text-slate-800 uppercase text-xs tracking-tight">{ws}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">Capacidad: {(config.people * totalHorasNetas).toFixed(1)}h</p>
                          </div>
                          <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', Math.max(1, config.people - 1))} className="w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center font-black hover:bg-slate-800 hover:text-white transition-all">-</button>
                            <span className="font-mono font-black text-lg min-w-[20px] text-center">{config.people}</span>
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', config.people + 1)} className="w-8 h-8 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center font-black hover:bg-slate-800 hover:text-white transition-all">+</button>
                          </div>
                        </div>
                      );
                    })}
                 </div>
               </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="forros-chn-bases">
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="bg-white border-l-8 border-l-orange-500 shadow-xl rounded-2xl overflow-hidden group hover:scale-[1.02] transition-all duration-300">
                <CardContent className="p-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-orange-600 font-black uppercase text-xs tracking-widest"><MapPin className="w-4 h-4" /> Producción GYE (Fecha 1)</div>
                      <p className="text-lg font-bold text-slate-700 capitalize">{todayDate}</p>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-2xl group-hover:rotate-12 transition-transform"><CalendarIconLucide className="w-8 h-8 text-orange-600" /></div>
                  </div>
                  <div className="mt-6 flex items-baseline gap-2">
                    <p className="text-5xl font-black text-orange-700 font-mono tracking-tighter tabular-nums">{chnBasesDateTotals.totalToday.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>
                    <p className="text-xs text-slate-400 uppercase font-black tracking-widest">Unidades Totales</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-l-8 border-l-indigo-600 shadow-xl rounded-2xl overflow-hidden group hover:scale-[1.02] transition-all duration-300">
                <CardContent className="p-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-indigo-600 font-black uppercase text-xs tracking-widest"><MapPin className="w-4 h-4" /> Producción Quito (Fecha 2)</div>
                      <p className="text-lg font-bold text-slate-700 capitalize">{targetDate}</p>
                    </div>
                    <div className="bg-indigo-50 p-4 rounded-2xl group-hover:-rotate-12 transition-transform"><CalendarIconLucide className="w-8 h-8 text-indigo-600" /></div>
                  </div>
                  <div className="mt-6 flex items-baseline gap-2">
                    <p className="text-5xl font-black text-indigo-800 font-mono tracking-tighter tabular-nums">{chnBasesDateTotals.totalTarget.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>
                    <p className="text-xs text-slate-400 uppercase font-black tracking-widest">Unidades Totales</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-2xl shadow-lg border-slate-200 overflow-hidden">
              <CardHeader className="bg-slate-50 border-b border-slate-200"><CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tighter">Listado Maestro: Forros & Bases</CardTitle></CardHeader>
              <CardContent className="p-0">
                <ProvisionalOrdersTabSection 
                  externalFilters={{...externalFilters, MAQUINA: ['HR-FBASE', 'HR-FORRO']}} 
                  renderCell={renderResolvedProvisionalCell} 
                  groupBy="MAQUINA" 
                  resolveValue={resolveLogicValue} 
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};