'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Search
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
      const allData = responses.flatMap(res => res.data || []);
      setTiemposProduccion(allData);
    } catch (error) {
      console.error('Error al cargar tiempos:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [forrosGruposList]);

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
  }, [isMounted, externalFilters, todayDate, targetDate, normalizeDateForFilter, isHorizonFilterActive]);

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
      const ws = String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').trim().toUpperCase();
      if (ws && ws !== 'NULL' && ws !== '-') wsSet.add(ws);
    });
    return Array.from(wsSet).sort();
  }, [tiemposProduccion]);

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

  // GRUPOS TÉCNICOS
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
        <span className="font-bold text-slate-700 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200">
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
        "flex border border-slate-200 rounded-2xl overflow-hidden shadow-sm bg-white transition-all hover:shadow-md",
        small ? "h-[320px]" : "h-[420px]"
      )}>
        {/* LADO IZQUIERDO: INFO TÉCNICA (SLATE DARK) */}
        <div className={cn(
          "bg-slate-900 p-5 text-white flex flex-col border-r border-slate-800",
          small ? "w-[40%]" : "w-[35%]"
        )}>
          <div className="mb-4">
            <h3 className="text-lg font-black uppercase tracking-tight text-slate-100 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-sky-400" />
              {machineCode}
            </h3>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">Capacidad Neta (84%)</p>
          </div>
          
          <div className="flex-1 space-y-4">
            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Personal:</span>
                <div className="flex items-center gap-2 bg-slate-800 rounded-md p-1">
                  <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', Math.max(1, config.people - 1))} className="w-6 h-6 rounded bg-slate-700 hover:bg-indigo-600 flex items-center justify-center text-xs">-</button>
                  <span className="font-mono font-bold text-sm w-4 text-center">{config.people}</span>
                  <button onClick={() => handleWorkstationConfigChange(machineCode, 'people', config.people + 1)} className="w-6 h-6 rounded bg-slate-700 hover:bg-indigo-600 flex items-center justify-center text-xs">+</button>
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] border-t border-white/5 pt-2">
                <span className="text-slate-500 font-bold uppercase">Total Disp:</span>
                <span className="font-mono font-bold text-sky-400">{capacityHours.toFixed(2)}h</span>
              </div>
            </div>

            <div className="bg-white/5 p-3 rounded-xl border border-white/10">
              <p className="text-[9px] font-black uppercase text-slate-500 mb-2 tracking-widest">Ocupación</p>
              <div className="flex items-baseline gap-1 mb-1">
                <span className={cn("text-3xl font-black font-mono tracking-tighter", isOverloaded ? "text-red-400" : "text-sky-300")}>
                  {utilization.toFixed(0)}
                </span>
                <span className="text-xs font-black text-slate-600">%</span>
              </div>
              <Progress value={utilization} className={cn("h-2 bg-slate-800", isOverloaded ? "[&>div]:bg-red-500" : "[&>div]:bg-indigo-500")} />
              <div className="mt-3 flex justify-between text-[9px] font-black uppercase tracking-tighter">
                <div className="text-slate-500">Carga: <span className="text-slate-100">{totalTimeHours.toFixed(2)}h</span></div>
                <div className={cn(isOverloaded ? "text-red-400" : "text-sky-400")}>Rem: {(capacityHours - totalTimeHours).toFixed(2)}h</div>
              </div>
            </div>
          </div>
        </div>

        {/* LADO DERECHO: LISTADO ÓRDENES (WHITE TÉCNICO) */}
        <div className="flex-1 p-5 flex flex-col bg-slate-50/30">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
            <h4 className="text-[10px] font-black text-slate-700 uppercase tracking-widest flex items-center gap-2">
              <ClipboardList className="w-3.5 h-3.5 text-slate-400" /> Órdenes Planificadas
            </h4>
            <Badge variant="outline" className="bg-white text-slate-400 border-slate-200 font-mono text-[9px] px-2 py-0">{orders.length}</Badge>
          </div>
          
          <div className="flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-inner">
            <table className="w-full text-[10px] border-collapse">
              <thead className="bg-slate-50 sticky top-0 z-10">
                <tr className="text-slate-400 font-black uppercase tracking-widest text-left">
                  <th className="px-3 py-2 border-b">CodMaterial</th>
                  <th className="px-3 py-2 border-b">Nombre</th>
                  <th className="px-3 py-2 border-b text-right">Cant.</th>
                  <th className="px-3 py-2 border-b text-center">Unid.</th>
                  <th className="px-3 py-2 border-b text-right text-indigo-700">T. (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((o, i) => {
                  const t = calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o) / 60;
                  return (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 font-mono font-bold text-slate-500">{o['CodMaterial'] || normalizeMaterialCode(o['MATERIAL'])}</td>
                      <td className="px-3 py-2 truncate max-w-[120px] font-bold text-slate-400 uppercase" title={o['NOMBRE'] || o['TEXTOMATERIAL']}>{o['NOMBRE'] || o['TEXTOMATERIAL']}</td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-slate-600">{Number(o['CANTIDAD'] || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-center text-slate-400 font-black uppercase text-[8px]">{o['UNIDAD'] || 'ST'}</td>
                      <td className="px-3 py-2 text-right font-mono font-black text-indigo-600">{t.toFixed(2)}</td>
                    </tr>
                  );
                })}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-slate-300 italic font-black uppercase tracking-widest text-[9px]">Sin carga operativa</td>
                  </tr>
                )}
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
      {/* HEADER DE COMANDO (SOBRIO) */}
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-5">
          <div className="bg-slate-900 p-4 rounded-2xl text-white shadow-lg">
            <CalendarClock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Programación Táctica Forros</h2>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="border-slate-200 text-slate-400 bg-slate-50 font-black uppercase tracking-[0.2em] text-[9px] px-3 py-0.5">Centro de Control Operativo</Badge>
              <div className="flex items-center gap-1.5 ml-2">
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sistema en línea</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-4 items-center">
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center gap-4 min-w-[180px] shadow-inner">
            <div className="bg-indigo-700 p-2 rounded-xl text-white"><MapPin className="w-4 h-4" /></div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Resumen GYE (2000)</p>
              <p className="text-xl font-black text-slate-800 font-mono tracking-tight">{dailyOrders.filter(o => String(o.Centro).trim() === '2000').length.toLocaleString()} <span className="text-[10px] text-slate-400 uppercase">Ord</span></p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-center gap-4 min-w-[180px] shadow-inner">
            <div className="bg-slate-700 p-2 rounded-xl text-white"><MapPin className="w-4 h-4" /></div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Resumen UIO (1000)</p>
              <p className="text-xl font-black text-slate-800 font-mono tracking-tight">{dailyOrders.filter(o => String(o.Centro).trim() === '1000').length.toLocaleString()} <span className="text-[10px] text-slate-400 uppercase">Ord</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* PANEL DE HORIZONTE TÁCTICO */}
      <Card className="rounded-2xl shadow-sm border-slate-200 bg-white overflow-hidden">
        <div className="px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-6 bg-slate-50/30">
          <div className="flex items-center gap-6">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                <Clock className="w-3 h-3 text-indigo-400" /> Inicio Horizonte
              </label>
              <input 
                type="date" 
                value={todayDate} 
                onChange={(e) => setTodayDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm"
              />
            </div>
            <div className="flex items-center pt-4">
              <ArrowRight className="w-4 h-4 text-slate-300" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] flex items-center gap-2">
                <Clock className="w-3 h-3 text-indigo-400" /> Fin Horizonte
              </label>
              <input 
                type="date" 
                value={targetDate} 
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-slate-700 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm"
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
                "h-11 px-6 rounded-xl font-black uppercase text-[10px] tracking-widest transition-all gap-2 shadow-sm",
                isHorizonFilterActive ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100" : "border-slate-300 text-slate-600 hover:bg-white"
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              {isHorizonFilterActive ? "Horizonte Activo" : "Aplicar Horizonte"}
            </Button>
            <Button 
              onClick={fetchDailyOrders} 
              disabled={isLoadingDaily}
              variant="outline"
              className="h-11 w-11 rounded-xl border-slate-300 hover:bg-white text-slate-600 transition-all p-0 shadow-sm"
            >
              <RefreshCw className={cn("w-4 h-4", isLoadingDaily && "animate-spin")} />
            </Button>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="resumen-produccion" className="w-full">
        <TabsList className="flex w-full h-auto bg-white border border-slate-200 p-2 mb-8 rounded-2xl shadow-sm overflow-x-auto justify-start sticky top-0 z-50">
          <TabsTrigger value="resumen-produccion" className="flex items-center gap-2 px-6 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <BarChart3 className="w-3.5 h-3.5" /> Resumen de Producción
          </TabsTrigger>
          <TabsTrigger value="acolchado-tapas" className="flex items-center gap-2 px-6 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Cpu className="w-3.5 h-3.5" /> 1. Acolchado & Tapas
          </TabsTrigger>
          <TabsTrigger value="bandas" className="flex items-center gap-2 px-6 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Layers className="w-3.5 h-3.5" /> 2. Proceso Bandas
          </TabsTrigger>
          <TabsTrigger value="interiores-corte" className="flex items-center gap-2 px-6 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Settings2 className="w-3.5 h-3.5" /> 3. Interiores & Corte
          </TabsTrigger>
          <TabsTrigger value="forros" className="flex items-center gap-2 px-6 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <LayoutGrid className="w-3.5 h-3.5" /> 4. Forros Finales
          </TabsTrigger>
          <TabsTrigger value="componentes" className="flex items-center gap-2 px-6 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Inbox className="w-3.5 h-3.5" /> Componentes (Maestro)
          </TabsTrigger>
          <TabsTrigger value="mantenimiento" className="flex items-center gap-2 px-6 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Wrench className="w-3.5 h-3.5" /> Mantenimiento
          </TabsTrigger>
          <TabsTrigger value="personal-turnos" className="flex items-center gap-2 px-6 py-3 data-[state=active]:bg-slate-900 data-[state=active]:text-white rounded-xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <UserPlus className="w-3.5 h-3.5" /> Config. Capacidad
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen-produccion">
          <Card className="rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3">
                    <BarChart3 className="w-6 h-6 text-slate-400" /> Matriz de Salud de Planta
                  </CardTitle>
                  <CardDescription>Consolidado de carga operativa vs capacidad neta (Hoja de Ruta).</CardDescription>
                </div>
                <div className="flex items-center gap-2 bg-slate-900 px-4 py-2 rounded-xl text-white">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Turno: {totalHorasNetas.toFixed(2)}h netas</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr className="text-slate-500 font-black uppercase tracking-widest">
                      <th className="px-6 py-4 text-left bg-slate-100/50">Puesto de Trabajo</th>
                      <th className="px-6 py-4 text-center">Órdenes</th>
                      <th className="px-6 py-4 text-right">Cant. Total</th>
                      <th className="px-6 py-4 text-right text-indigo-700 bg-indigo-50/30">T. Requerido (h)</th>
                      <th className="px-6 py-4 text-right text-slate-900">Capacidad (h)</th>
                      <th className="px-6 py-4 text-center">% Ocupación</th>
                      <th className="px-6 py-4 text-right">Estatus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {uniqueWorkstations.map((ws, idx) => {
                      const orders = dailyOrders.filter(o => getResolvedMachine(o) === ws);
                      const totalUnits = orders.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0);
                      const totalTimeHours = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o), 0) / 60;
                      const config = workstationConfigs[ws] || { people: 1 };
                      const capacityHours = totalHorasNetas * config.people;
                      const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;
                      const isOverloaded = utilization > 100;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-700 uppercase">{ws}</td>
                          <td className="px-6 py-4 text-center font-mono font-bold text-slate-400">{orders.length}</td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-slate-600">{totalUnits.toLocaleString()}</td>
                          <td className="px-6 py-4 text-right font-mono font-black text-indigo-600 bg-indigo-50/30">{totalTimeHours.toFixed(2)}h</td>
                          <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">{capacityHours.toFixed(2)}h</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <Progress value={utilization} className={cn("h-1.5 w-20 bg-slate-100", isOverloaded ? "[&>div]:bg-red-500" : "[&>div]:bg-indigo-600")} />
                              <span className={cn("font-mono font-black w-8 text-right", isOverloaded ? "text-red-500" : "text-slate-600")}>{utilization.toFixed(0)}%</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {isOverloaded ? (
                              <Badge className="bg-red-100 text-red-700 border-none rounded-lg text-[9px] font-black uppercase px-2 py-0.5">Saturado</Badge>
                            ) : utilization > 80 ? (
                              <Badge className="bg-amber-100 text-amber-700 border-none rounded-lg text-[9px] font-black uppercase px-2 py-0.5">Alerta</Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-700 border-none rounded-lg text-[9px] font-black uppercase px-2 py-0.5">Óptimo</Badge>
                            )}
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

        <TabsContent value="acolchado-tapas" className="space-y-12 pb-10">
          {group1Suffixes.map(suffix => {
            const achCode = `HR-ACH${suffix}`;
            const pefCode = `HR-PEF${suffix}`;
            
            const achExists = uniqueWorkstations.includes(achCode);
            const pefExists = uniqueWorkstations.includes(pefCode);

            if (!achExists && !pefExists) return null;

            return (
              <div key={suffix} className="space-y-4">
                <div className="flex items-center gap-3 px-5 py-2 bg-slate-900/5 rounded-full w-fit">
                  <Badge className="bg-slate-900 text-white font-black px-4 py-1 rounded-full text-[10px] uppercase tracking-widest">
                    Bloque Técnico Twin {suffix}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                  {achExists ? <MachineCard machineCode={achCode} /> : <div className="hidden xl:block bg-slate-100/50 border border-dashed border-slate-200 rounded-3xl" />}
                  {pefExists ? <MachineCard machineCode={pefCode} /> : <div className="hidden xl:block bg-slate-100/50 border border-dashed border-slate-200 rounded-3xl" />}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="bandas" className="space-y-8 pb-10">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {workstationsGroup2.map((wsCode) => (
              <MachineCard key={wsCode} machineCode={wsCode} small />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="interiores-corte" className="space-y-8 pb-10">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {workstationsGroup3.map((wsCode) => (
              <MachineCard key={wsCode} machineCode={wsCode} small />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="forros" className="space-y-8 pb-10">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {workstationsGroup4.map((wsCode) => (
              <MachineCard key={wsCode} machineCode={wsCode} small />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="componentes">
           <Card className="rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
             <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
                <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3"><Inbox className="w-6 h-6 text-slate-400" /> Buffer Maestro de Componentes</CardTitle>
                <CardDescription>Listado global de órdenes previsionales para distribución técnica.</CardDescription>
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
          <Card className="rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight flex items-center gap-3"><Wrench className="w-6 h-6 text-slate-400" /> Paradas Programadas</CardTitle>
                <Button onClick={fetchMantenimientos} disabled={isLoadingMantenimientos} variant="outline" size="sm" className="h-10 px-5 font-black uppercase text-[9px] tracking-widest border-slate-300 rounded-xl">
                  <RefreshCw className={cn("w-3.5 h-3.5 mr-2", isLoadingMantenimientos && "animate-spin")} /> Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                    <tr className="text-slate-500 font-black uppercase tracking-widest">
                      <th className="px-6 py-4 text-left bg-slate-100/50">FECHA PROG.</th>
                      <th className="px-6 py-4 text-left">EQUIPO</th>
                      <th className="px-6 py-4 text-left">DESCRIPCIÓN</th>
                      <th className="px-6 py-4 text-left">FRECUENCIA</th>
                      <th className="px-6 py-4 text-left">ESTADO</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {pagedMantenimientos.length > 0 ? pagedMantenimientos.map((m, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 font-mono font-black text-slate-700">{m.FECHA_PRO ? new Date(m.FECHA_PRO).toLocaleDateString('es-ES') : '—'}</td>
                        <td className="px-6 py-4 font-mono font-bold text-slate-500">{m.CODIGO_EQ || '—'}</td>
                        <td className="px-6 py-4 font-black text-slate-400 uppercase">{m.NOMBRE_EQ || '—'}</td>
                        <td className="px-6 py-4 text-slate-400 font-black uppercase text-[9px]">{m.T_FREC || '—'}</td>
                        <td className="px-6 py-4"><Badge className="font-black text-[9px] px-3 py-1 border-none rounded-lg shadow-sm bg-indigo-600 text-white">{m.ESTADO || 'PENDIENTE'}</Badge></td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="py-24 text-center font-black text-slate-200 uppercase text-xs tracking-widest">Sin mantenimientos pendientes</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {totalMaintPages > 1 && (
                <div className="flex items-center justify-between px-8 py-5 bg-slate-50 border-t border-slate-200">
                  <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Página {maintPage} de {totalMaintPages}</div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(1)} disabled={maintPage === 1} className="h-8 w-8 rounded-lg"><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(prev => Math.max(1, prev - 1))} disabled={maintPage === 1} className="h-8 w-8 rounded-lg"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                    {getPageNumbers(maintPage, totalMaintPages).map((p, idx) => (
                      <button key={idx} onClick={() => typeof p === 'number' && setMaintPage(p)} className={cn("min-w-[32px] h-8 rounded-lg text-[10px] font-black border", maintPage === p ? "bg-slate-900 text-white" : "bg-white text-slate-500 border-slate-200")}>{p}</button>
                    ))}
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(prev => Math.min(totalMaintPages, prev + 1))} disabled={maintPage === totalMaintPages} className="h-8 w-8 rounded-lg"><ChevronRight className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" size="icon" onClick={() => setMaintPage(totalMaintPages)} disabled={maintPage === totalMaintPages} className="h-8 w-8 rounded-lg"><ChevronsRight className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal-turnos">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-1 rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
               <CardHeader className="bg-slate-900 text-white p-6">
                 <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-3"><Clock className="w-6 h-6 text-sky-400" /> Parámetros de Tiempo</CardTitle>
               </CardHeader>
               <CardContent className="p-8 space-y-8">
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Jornada Diurna (L-V)</label>
                    <Select value={jornadaDiurnaSel} onValueChange={setJornadaDiurnaSel}>
                      <SelectTrigger className="h-11 border border-slate-200 rounded-xl font-bold text-slate-700"><SelectValue /></SelectTrigger>
                      <SelectContent>{DIURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-bold">{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                 </div>
                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">Jornada Nocturna</label>
                    <Select value={jornadaNocturnaSel} onValueChange={setJornadaNocturnaSel}>
                      <SelectTrigger className="h-11 border border-slate-200 rounded-xl font-bold text-slate-700"><SelectValue /></SelectTrigger>
                      <SelectContent>{NOCTURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-bold">{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                 </div>
                 <div className="p-7 bg-slate-900 rounded-[1.5rem] text-white shadow-xl border border-white/10">
                    <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mb-6">Eficiencia Operativa: 84%</p>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="border-l-4 border-sky-400 pl-4"><p className="text-xl font-black font-mono">{horasNetasDiurnas.toFixed(2)}h</p><p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Día Neto</p></div>
                      <div className="border-l-4 border-indigo-500 pl-4"><p className="text-xl font-black font-mono">{horasNetasNocturnas.toFixed(2)}h</p><p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">Noche Neto</p></div>
                    </div>
                    <div className="mt-8 pt-6 border-t border-white/10"><p className="text-4xl font-black text-sky-300 font-mono">{totalHorasNetas.toFixed(2)}h</p><p className="text-[10px] font-black text-slate-500 uppercase mt-2 tracking-[0.2em]">Potencial Diario / Persona</p></div>
                 </div>
               </CardContent>
            </Card>

            <Card className="lg:col-span-2 rounded-3xl shadow-sm border-slate-200 overflow-hidden bg-white">
               <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-8"><CardTitle className="text-xl font-black text-slate-800 uppercase tracking-tight">Dotación por Estación</CardTitle></CardHeader>
               <CardContent className="p-8">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto pr-2">
                    {uniqueWorkstations.map(ws => {
                      const config = workstationConfigs[ws] || { people: 1 };
                      return (
                        <div key={ws} className="flex items-center justify-between p-5 border border-slate-100 rounded-[1.25rem] bg-white hover:border-slate-300 transition-all shadow-sm group">
                          <div><p className="font-black text-slate-700 uppercase text-xs tracking-wider group-hover:text-indigo-700 transition-colors">{ws}</p><p className="text-[9px] font-black text-slate-400 uppercase mt-1">Capacidad: {(config.people * totalHorasNetas).toFixed(1)}h/día</p></div>
                          <div className="flex items-center gap-2.5 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', Math.max(1, config.people - 1))} className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center font-black hover:bg-slate-900 hover:text-white transition-all text-xs">-</button>
                            <span className="font-mono font-black text-md min-w-[28px] text-center">{config.people}</span>
                            <button onClick={() => handleWorkstationConfigChange(ws, 'people', config.people + 1)} className="w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center font-black hover:bg-slate-900 hover:text-white transition-all text-xs">+</button>
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
