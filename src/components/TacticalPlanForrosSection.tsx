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
  ArrowRight
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
        
        // Filtrado por horizonte táctico solo si está activo
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
      <div className="flex border border-slate-200 rounded-xl overflow-hidden h-[420px] shadow-sm w-full bg-white transition-all hover:shadow-md">
        {/* LADO IZQUIERDO: INFORMACIÓN TÉCNICA (AZUL PIZARRA SOBRIO) */}
        <div className="w-[38%] bg-slate-900 p-5 text-white flex flex-col border-r border-slate-200">
          <div className="mb-4">
            <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">{machineCode}</h4>
            <h3 className="text-xl font-bold uppercase leading-tight tracking-tight text-slate-100">{title}</h3>
          </div>
          
          <div className="flex-1 space-y-4">
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <p className="text-[8px] font-bold uppercase text-slate-500 mb-3 tracking-widest flex items-center gap-2">
                <Activity className="w-3 h-3" /> Capacidad Neta Turno
              </p>
              <div className="space-y-3">
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 font-bold uppercase text-[9px] text-slate-400">Operadores:</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', Math.max(1, config.people - 1))} className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white text-xs transition-colors">-</button>
                    <span className="font-mono font-bold text-lg text-sky-400 w-4 text-center">{config.people}</span>
                    <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', config.people + 1)} className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-white text-xs transition-colors">+</button>
                  </div>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="flex items-center gap-2 font-bold uppercase text-[9px] text-slate-400">Disp. Total:</span>
                  <span className="font-mono font-bold text-md text-sky-400">{capacityHours.toFixed(2)}h</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <p className="text-[8px] font-bold uppercase text-slate-500 mb-3 tracking-widest">Utilización de Recursos</p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className={cn("text-4xl font-bold font-mono tracking-tighter", isOverloaded ? "text-red-400" : "text-sky-400")}>
                  {utilization.toFixed(1)}
                </span>
                <span className="text-md font-bold text-slate-600">%</span>
              </div>
              <Progress value={utilization} className={cn("h-3 bg-slate-800", isOverloaded ? "[&>div]:bg-red-500" : "[&>div]:bg-sky-500")} />
              <div className="mt-3 flex justify-between text-[9px] font-bold uppercase text-slate-500">
                <span>Carga: {totalTimeHours.toFixed(2)}h</span>
                <span className={cn(isOverloaded ? "text-red-400" : "text-slate-500")}>Rem: {(capacityHours - totalTimeHours).toFixed(2)}h</span>
              </div>
            </div>
          </div>
        </div>

        {/* LADO DERECHO: ÓRDENES (GRIS SOBRIO) */}
        <div className="flex-1 bg-slate-50/50 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-200">
            <h3 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2 tracking-tight">
              <ClipboardList className="w-4 h-4 text-blue-600" /> Órdenes Planificadas
            </h3>
            <Badge variant="secondary" className="bg-slate-200 text-slate-700 border-none font-mono text-[9px] px-2">{orders.length} LÍNEAS</Badge>
          </div>
          
          <div className="flex-1 overflow-auto rounded-lg border border-slate-200 bg-white shadow-inner">
            <table className="w-full text-[10px]">
              <thead className="bg-slate-100/80 sticky top-0 z-10">
                <tr className="text-slate-500 font-bold uppercase tracking-wider">
                  <th className="px-3 py-2.5 text-left border-b border-slate-200">Material</th>
                  <th className="px-3 py-2.5 text-left border-b border-slate-200">Nombre</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200">Cant.</th>
                  <th className="px-3 py-2.5 text-right border-b border-slate-200 text-blue-700">Tiempo (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o, i) => {
                  const t = calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o) / 60;
                  return (
                    <tr key={i} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-slate-600">{o['CodMaterial'] || normalizeMaterialCode(o['MATERIAL'])}</td>
                      <td className="px-3 py-2 max-w-[140px] truncate font-medium uppercase text-slate-500" title={o['NOMBRE'] || o['TEXTOMATERIAL']}>{o['NOMBRE'] || o['TEXTOMATERIAL']}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-700">{Number(o['CANTIDAD'] || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{t.toFixed(2)}h</td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400 italic font-medium uppercase tracking-widest text-[9px]">Sin datos para el horizonte táctico</td>
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
    <div className="p-6 md:p-8 space-y-6 bg-slate-50/80 min-h-screen">
      {/* HEADER SECTION: TITULO & RESUMEN DE CARGA */}
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="bg-slate-900 p-3 rounded-2xl text-white shadow-inner">
            <CalendarClock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 uppercase tracking-tight">Programación Táctica Forros</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="border-slate-200 text-slate-500 bg-slate-50 font-bold uppercase tracking-widest text-[9px] px-2 py-0.5">Módulo de Sincronización ACH-PEF</Badge>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-4">
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-4 min-w-[180px]">
              <div className="bg-blue-600 p-2 rounded-lg text-white"><MapPin className="w-4 h-4" /></div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Producción GYE</p>
                <p className="text-lg font-bold text-slate-800 font-mono">{chnBasesDateTotals.totalToday.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>
              </div>
            </div>
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 flex items-center gap-4 min-w-[180px]">
              <div className="bg-indigo-600 p-2 rounded-lg text-white"><MapPin className="w-4 h-4" /></div>
              <div>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Producción UIO</p>
                <p className="text-lg font-bold text-slate-800 font-mono">{chnBasesDateTotals.totalTarget.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DATE CONTROL PANEL: BOTON APARTE PARA FECHA */}
      <Card className="rounded-2xl shadow-sm border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest flex items-center gap-1.5"><CalendarIconLucide className="w-3 h-3" /> Fecha Ejecución</label>
              <input 
                type="date" 
                value={todayDate} 
                onChange={(e) => setTodayDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
            <div className="flex items-center pt-5">
              <ArrowRight className="w-4 h-4 text-slate-300" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest flex items-center gap-1.5"><CalendarIconLucide className="w-3 h-3" /> Fecha Límite</label>
              <input 
                type="date" 
                value={targetDate} 
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button 
              onClick={() => {
                setIsHorizonFilterActive(!isHorizonFilterActive);
                fetchDailyOrders();
              }}
              variant={isHorizonFilterActive ? "default" : "outline"}
              className={cn(
                "h-10 px-6 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all gap-2",
                isHorizonFilterActive ? "bg-blue-600 hover:bg-blue-700 shadow-md" : "border-slate-300 text-slate-600"
              )}
            >
              <Filter className="w-4 h-4" />
              {isHorizonFilterActive ? "Horizonte Activo" : "Aplicar Horizonte Táctico"}
            </Button>
            <Button 
              onClick={fetchDailyOrders} 
              disabled={isLoadingDaily}
              variant="outline"
              className="h-10 px-4 rounded-xl border-slate-300 hover:bg-slate-50 text-slate-600 transition-all"
              title="Refrescar datos de la base"
            >
              <RefreshCw className={cn("w-4 h-4", isLoadingDaily && "animate-spin")} />
            </Button>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="visual" className="w-full">
        <TabsList className="flex w-full h-auto bg-white border border-slate-200 p-1.5 mb-8 rounded-2xl shadow-sm overflow-x-auto justify-start sticky top-0 z-50">
          <TabsTrigger value="visual" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-slate-500"><LayoutGrid className="w-4 h-4" /> Tablero ACH-PEF</TabsTrigger>
          <TabsTrigger value="componentes" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-slate-500"><Inbox className="w-4 h-4" /> Buffer Maestro</TabsTrigger>
          <TabsTrigger value="mantenimiento" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-slate-500"><Wrench className="w-4 h-4" /> Mant. Preventivo</TabsTrigger>
          <TabsTrigger value="forros-chn-bases" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-slate-500"><Package className="w-4 h-4" /> Forros & Bases</TabsTrigger>
          <TabsTrigger value="personal-turnos" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-slate-500"><UserPlus className="w-4 h-4" /> Capacidad</TabsTrigger>
          <TabsTrigger value="tiempos" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-slate-500"><Timer className="w-4 h-4" /> Maestros</TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-slate-500"><Lock className="w-4 h-4" /> Reglas</TabsTrigger>
          <TabsTrigger value="grupos" className="flex items-center gap-2 px-6 py-2.5 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-bold uppercase tracking-widest text-slate-500"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
        </TabsList>

        {/* CONTENIDO: TABLERO VISUAL ACH-PEF */}
        <TabsContent value="visual" className="space-y-12">
          <div className="space-y-16 pb-24">
            {machinePairs.map((pair) => (
              <div key={pair.suffix} className="space-y-6">
                <div className="flex items-center gap-5 px-2">
                  <div className="bg-indigo-600 h-1.5 w-8 rounded-full"></div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Línea de Sincronización Técnica {pair.suffix}</h3>
                  <div className="h-px flex-1 bg-slate-200"></div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                  <MachineCard machineCode={pair.ach} title={`Acolchadora ${pair.suffix}`} />
                  <MachineCard machineCode={pair.pef} title={`Pegadora de Tapa ${pair.suffix}`} />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* CONTENIDO: BUFFER MAESTRO (TODO EL UNIVERSO SIN FILTRO DE FECHA AUTOMATICO) */}
        <TabsContent value="componentes">
           <Card className="rounded-2xl shadow-sm border-slate-200 overflow-hidden bg-white">
             <CardHeader className="bg-slate-50/50 border-b border-slate-200">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2">
                      <Inbox className="w-5 h-5 text-blue-600" />
                      Listado Maestro de Componentes (Buffer Completo)
                    </CardTitle>
                    <CardDescription className="text-slate-400 font-bold uppercase text-[9px] tracking-widest mt-1">
                      Órdenes previsionales disponibles filtradas por responsabilidad técnica (RespCtrlProd)
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-slate-800 text-white font-mono px-3 py-1 uppercase text-[9px] tracking-widest">Estado: Sincronizado</Badge>
                  </div>
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

        <TabsContent value="mantenimiento">
          <Card className="rounded-2xl shadow-sm border-slate-200 overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2"><Wrench className="w-5 h-5 text-blue-600" /> Mantenimiento Preventivo</CardTitle>
                  <CardDescription className="font-bold uppercase text-[9px] tracking-widest text-slate-400 mt-1">Sincronización por RespCtrlProd • Orden cronológico FECHA_PRO</CardDescription>
                </div>
                <Button onClick={fetchMantenimientos} disabled={isLoadingMantenimientos} variant="outline" size="sm" className="h-9 px-4 font-bold uppercase text-[10px] tracking-widest border-slate-300">
                  <RefreshCw className={cn("w-3 h-3 mr-2", isLoadingMantenimientos && "animate-spin")} /> Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr className="text-slate-500 font-bold uppercase tracking-widest">
                      <th className="px-4 py-3.5 text-left bg-blue-50/30">FECHA PROG.</th>
                      <th className="px-4 py-3.5 text-left">EQUIPO</th>
                      <th className="px-4 py-3.5 text-left">NOMBRE EQUIPO</th>
                      <th className="px-4 py-3.5 text-left">FRECUENCIA</th>
                      <th className="px-4 py-3.5 text-left">RESPONSABLE</th>
                      <th className="px-4 py-3.5 text-left">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {isLoadingMantenimientos ? (
                      <tr><td colSpan={6} className="py-16 text-center font-bold text-slate-400 italic">Consultando maestro de mantenimiento...</td></tr>
                    ) : pagedMantenimientos.length > 0 ? (
                      pagedMantenimientos.map((m, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/20 transition-colors">
                          <td className="px-4 py-3 font-mono font-bold text-blue-700">
                            {m.FECHA_PRO ? new Date(m.FECHA_PRO).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-600">{m.CODIGO_EQ || '—'}</td>
                          <td className="px-4 py-3 font-medium text-slate-500 uppercase">{m.NOMBRE_EQ || '—'}</td>
                          <td className="px-4 py-3 text-slate-400 font-bold uppercase">{m.T_FREC || '—'}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="bg-slate-50 text-slate-500 border-slate-200 font-mono text-[9px] px-2">{m.RespCtrlProd || '—'}</Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={cn(
                              "font-bold text-[8px] px-2 py-0.5 border-none",
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
                      <tr><td colSpan={6} className="py-16 text-center text-slate-400 italic font-bold uppercase tracking-widest">No se encontraron mantenimientos registrados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {totalMaintPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                    Página {maintPage} de {totalMaintPages}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(1)} disabled={maintPage === 1} className="h-8 w-8"><ChevronsLeft className="h-3 w-3" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(prev => Math.max(1, prev - 1))} disabled={maintPage === 1} className="h-8 w-8"><ChevronLeft className="h-3 w-3" /></Button>
                    
                    {getPageNumbers(maintPage, totalMaintPages).map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => typeof p === 'number' && setMaintPage(p)}
                        className={cn(
                          "min-w-[28px] h-8 rounded-lg text-[10px] font-bold transition-all border",
                          maintPage === p 
                            ? "bg-slate-900 text-white border-slate-900 shadow-sm" 
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {p}
                      </button>
                    ))}

                    <Button variant="outline" size="icon" onClick={() => setMaintPage(prev => Math.min(totalMaintPages, prev + 1))} disabled={maintPage === totalMaintPages} className="h-8 w-8"><ChevronRight className="h-3 w-3" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(totalMaintPages)} disabled={maintPage === totalMaintPages} className="h-8 w-8"><ChevronsRight className="h-3 w-3" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forros-chn-bases">
          <Card className="rounded-2xl shadow-sm border-slate-200 overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold text-slate-800 uppercase tracking-tight flex items-center gap-2"><Package className="w-5 h-5 text-blue-600" /> Órdenes de Producción Forros/Bases</CardTitle>
                <Badge variant="outline" className="font-bold border-blue-100 text-blue-600 uppercase tracking-widest text-[8px]">Filtrado por Proceso</Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <ProvisionalOrdersTabSection 
                externalFilters={{...externalFilters, MAQUINA: ['HR-FBASE', 'HR-FORRO']}} 
                renderCell={renderResolvedProvisionalCell} 
                groupBy="MAQUINA" 
                resolveValue={resolveLogicValue} 
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal-turnos">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-1 rounded-2xl shadow-sm border-slate-200 overflow-hidden bg-white">
               <CardHeader className="bg-slate-900 text-white border-b border-slate-800">
                 <CardTitle className="text-lg font-bold uppercase tracking-tight flex items-center gap-2"><Clock className="w-5 h-5 text-sky-400" /> Horarios de Planta</CardTitle>
               </CardHeader>
               <CardContent className="p-6 space-y-6">
                 <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Jornada Diurna (L-V)</label>
                    <Select value={jornadaDiurnaSel} onValueChange={setJornadaDiurnaSel}>
                      <SelectTrigger className="h-10 border border-slate-200 rounded-xl font-bold text-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-bold">{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                 </div>
                 <div className="space-y-3">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Jornada Nocturna</label>
                    <Select value={jornadaNocturnaSel} onValueChange={setJornadaNocturnaSel}>
                      <SelectTrigger className="h-10 border border-slate-200 rounded-xl font-bold text-slate-700">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOCTURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-bold">{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                 </div>
                 <div className="p-6 bg-slate-900 rounded-2xl text-white shadow-lg border border-white/5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-4">Capacidad Neta (84%)</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border-l-2 border-sky-400 pl-4">
                        <p className="text-xl font-bold font-mono">{horasNetasDiurnas.toFixed(2)}h</p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase">Día</p>
                      </div>
                      <div className="border-l-2 border-slate-600 pl-4">
                        <p className="text-xl font-bold font-mono">{horasNetasNocturnas.toFixed(2)}h</p>
                        <p className="text-[8px] font-bold text-slate-500 uppercase">Noche</p>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 border-t border-white/10">
                      <p className="text-3xl font-bold text-sky-400 font-mono tracking-tighter">{totalHorasNetas.toFixed(2)}h</p>
                      <p className="text-[9px] font-bold text-slate-500 uppercase mt-1">Horas/Persona día</p>
                    </div>
                 </div>
               </CardContent>
            </Card>

            <Card className="lg:col-span-2 rounded-2xl shadow-sm border-slate-200 overflow-hidden bg-white">
               <CardHeader className="bg-slate-50/50 border-b border-slate-200">
                 <CardTitle className="text-lg font-bold text-slate-800 uppercase tracking-tight">Recursos por Puesto de Trabajo</CardTitle>
                 <CardDescription className="font-bold uppercase text-[9px] text-slate-400 tracking-wider">Configuración de dotación para cálculo de capacidad neta</CardDescription>
               </CardHeader>
               <CardContent className="p-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">
                    {uniqueWorkstations.map(ws => {
                      const config = workstationConfigs[ws] || { people: 1 };
                      return (
                        <div key={ws} className="flex items-center justify-between p-4 border border-slate-100 rounded-2xl bg-white hover:border-blue-200 transition-all shadow-sm">
                          <div>
                            <p className="font-bold text-slate-700 uppercase text-xs tracking-tight">{ws}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Capacidad: {(config.people * totalHorasNetas).toFixed(1)}h/día</p>
                          </div>
                          <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', Math.max(1, config.people - 1))} className="w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center font-bold hover:bg-slate-900 hover:text-white transition-all text-xs">-</button>
                            <span className="font-mono font-bold text-md min-w-[24px] text-center text-blue-600">{config.people}</span>
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', config.people + 1)} className="w-7 h-7 rounded-lg bg-white shadow-sm border border-slate-200 flex items-center justify-center font-bold hover:bg-slate-900 hover:text-white transition-all text-xs">+</button>
                          </div>
                        </div>
                      );
                    })}
                 </div>
               </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card className="rounded-2xl shadow-sm border-slate-200 overflow-hidden bg-white">
             <CardHeader className="bg-slate-50/50 border-b border-slate-200">
               <div className="flex items-center justify-between">
                 <CardTitle className="text-lg font-bold text-slate-800 uppercase tracking-tight">Maestros Técnicos de Producción</CardTitle>
                 <Badge variant="secondary" className="font-mono bg-slate-200 text-slate-600">{tiemposProduccion.length} REGISTROS</Badge>
               </div>
             </CardHeader>
             <CardContent className="p-0">
               <div className="overflow-x-auto max-h-[60vh]">
                 <table className="w-full text-[10px] border-collapse">
                   <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                     <tr className="text-slate-500 font-bold uppercase tracking-widest">
                       <th className="px-4 py-3 text-left">CodMaterial</th>
                       <th className="px-4 py-3 text-left">Descripción</th>
                       <th className="px-4 py-3 text-left">Línea</th>
                       <th className="px-4 py-3 text-left">Puesto</th>
                       <th className="px-4 py-3 text-right text-blue-700">Tiempo (min)</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100 bg-white">
                     {isLoadingTiempos ? (
                       <tr><td colSpan={5} className="py-16 text-center font-bold text-slate-400 italic animate-pulse">Sincronizando maestros...</td></tr>
                     ) : tiemposProduccion.map((t, idx) => (
                       <tr key={idx} className="hover:bg-slate-50 transition-colors">
                         <td className="px-4 py-2.5 font-mono font-bold text-slate-600">{t.CodMaterial || t.Material}</td>
                         <td className="px-4 py-2.5 uppercase font-medium text-slate-500">{t.Material || t.nombre_material || t.DESCRIPCION}</td>
                         <td className="px-4 py-2.5 font-bold text-slate-400">{t.Linea || t.nombre_linea}</td>
                         <td className="px-4 py-2.5"><Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-200 uppercase text-[8px] font-bold">{t.PuestoTrabajo || t.nombre_estacion}</Badge></td>
                         <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-600">{Number(t.Tiempo || t.Tiempo_Min).toFixed(2)}</td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
           <Card className="rounded-2xl shadow-sm border-slate-200 overflow-hidden bg-white">
             <CardHeader className="bg-slate-50/50 border-b border-slate-200">
                <CardTitle className="text-lg font-bold text-slate-800 uppercase tracking-tight">Reglas de Negocio Área Forros</CardTitle>
             </CardHeader>
             <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {forrosRestricciones.map(r => (
                     <div key={r.codigo_restriccion} className="flex items-start gap-4 p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-blue-200 transition-all group">
                        <div className="bg-slate-900 p-3 rounded-xl text-white group-hover:bg-blue-600 transition-colors"><Lock className="w-5 h-5" /></div>
                        <div>
                          <h4 className="font-bold text-slate-700 uppercase text-xs tracking-wider mb-1">{r.nombre_restriccion}</h4>
                          <Badge className="bg-slate-100 text-slate-800 border-none font-mono mb-2 text-[10px]">{r.valor_restriccion}</Badge>
                          <p className="text-[10px] text-slate-400 leading-relaxed font-medium uppercase">{r.descripcion || 'Sin descripción técnica disponible.'}</p>
                        </div>
                     </div>
                   ))}
                </div>
             </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="grupos">
           <Card className="rounded-2xl shadow-sm border-slate-200 overflow-hidden bg-white">
             <CardHeader className="bg-slate-50/50 border-b border-slate-200">
                <CardTitle className="text-lg font-bold text-slate-800 uppercase tracking-tight">Grupos Técnicos</CardTitle>
             </CardHeader>
             <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {forrosGruposList.map(g => (
                    <div key={g.codigo_grupo} className="p-5 border border-slate-100 rounded-2xl bg-white hover:border-blue-300 transition-all group shadow-sm">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="bg-blue-50 p-2 rounded-lg text-blue-600 group-hover:bg-slate-900 group-hover:text-white transition-colors"><ListTree className="w-4 h-4" /></div>
                        <h4 className="font-bold text-slate-700 uppercase tracking-tight text-sm">{g.nombre_grupo}</h4>
                      </div>
                      <div className="space-y-2 pt-2 border-t border-slate-50">
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">ID GRUPO: <span className="text-slate-700">{g.codigo_grupo}</span></p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">CENTRO FAB.: <span className="text-blue-600 font-mono">{g.centro}</span></p>
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