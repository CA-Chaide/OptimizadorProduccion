
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
  BarChart3,
  Clock,
  Search,
  Calendar as CalendarIconLucide,
  MapPin,
  ListTree,
  Layers,
  UserPlus,
  Repeat,
  Calculator,
  FileSpreadsheet,
  GraduationCap,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Activity,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
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

const MAINT_ROWS_PER_PAGE = 20;

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

  // HABILIDADES OP
  const [habilidadesOpData, setHabilidadesOpData] = useState<any[]>([]);
  const [isLoadingHabilidades, setIsLoadingHabilidades] = useState(false);
  const [habilidadesPage, setHabilidadesPage] = useState(1);
  const [habilidadesRowsPerPage] = useState(20);
  const [habilidadesFilters, setHabilidadesFilters] = useState<Record<string, string>>({});

  // MANTENIMIENTOS
  const [mantenimientosData, setMantenimientosData] = useState<any[]>([]);
  const [isLoadingMantenimientos, setIsLoadingMantenimientos] = useState(false);
  const [maintCurrentPage, setMaintCurrentPage] = useState(1);
  const [maintColumns, setMaintColumns] = useState<string[]>([]);

  // CONFIGURACIÓN DE JORNADAS
  const DIURNA_OPTIONS = [
    { label: "07:00 - 15:45 (8.75h)", value: "8.75" },
    { label: "07:00 - 17:00 (10.0h)", value: "10.0" },
    { label: "07:00 - 18:00 (11.0h)", value: "11.0" }
  ].sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

  const NOCTURNA_OPTIONS = [
    { label: "Sin Jornada Nocturna", value: "0" },
    { label: "21:00 - 05:30 (8.5h)", value: "8.5" },
    { label: "19:00 - 05:30 (10.5h)", value: "10.5" }
  ].sort((a, b) => parseFloat(a.value) - parseFloat(b.value));

  const [jornadaDiurnaSel, setJornadaDiurnaSel] = useState("10.0");
  const [jornadaNocturnaSel, setJornadaNocturnaSel] = useState("8.5");

  const horasNetasDiurnas = useMemo(() => parseFloat(jornadaDiurnaSel) * 0.84, [jornadaDiurnaSel]);
  const horasNetasNocturnas = useMemo(() => parseFloat(jornadaNocturnaSel) * 0.84, [jornadaNocturnaSel]);
  const totalHorasNetas = useMemo(() => horasNetasDiurnas + horasNetasNocturnas, [horasNetasDiurnas, horasNetasNocturnas]);

  // PERSONAL & TURNOS
  const [workstationConfigs, setWorkstationConfigs] = useState<Record<string, WorkstationConfig>>({});

  // Explosión de Materiales
  const [explosionData, setExplosionData] = useState<any[]>([]);
  const [isLoadingExplosion, setIsLoadingExplosion] = useState(false);
  const [explosionPage, setExplosionPage] = useState(1);
  const [explosionTotal, setExplosionTotal] = useState(0);
  const [explosionRowsPerPage] = useState(20);
  const [centroExplosion, setCentroExplosion] = useState('1000');
  const [fertExplosion, setFertExplosion] = useState('');

  // Filtros y Paginación
  const [tiemposFilters, setTiemposFilters] = useState<Record<string, string>>({});
  const [tiemposPage, setTiemposPage] = useState(1);
  const [tiemposRowsPerPage, setTiemposRowsPerPage] = useState(20);
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyRowsPerPage, setDailyRowsPerPage] = useState(20);

  // Fechas
  const [todayDate, setTodayDate] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>('');

  const normalizeMaterialCode = useCallback((code: string | number): string => {
    if (!code) return '';
    return String(code).trim().replace(/^0+/, '');
  }, []);

  const getEcuadorTodayString = useCallback((): string => {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Guayaquil',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
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

  const formatValueForDisplay = useCallback((col: string, value: any): string => {
    if (value === null || value === undefined || value === '') return '—';
    const upperCol = col.toUpperCase().trim();
    
    if (upperCol.includes('FECHA')) {
      const parts = safeParseDateParts(value);
      if (parts) {
        return `${parts.d}/${parts.m}/${parts.y}`;
      }
      return String(value);
    }
    
    const num = parseFloat(value);
    if (!isNaN(num)) {
      if (upperCol === 'TIEMPO_MIN' || upperCol === 'TIEMPO' || upperCol.includes('TIEMPOS') || upperCol === 'CANTIDAD' || upperCol.includes('CANTIDAD')) {
        return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
      }
    }

    return String(value);
  }, [safeParseDateParts]);

  const getPageNumbers = (current: number, total: number): (number | '...')[] => {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    const left = Math.max(2, current - 1);
    const right = Math.min(total - 1, current + 1);
    if (left > 2) pages.push('...');
    for (let i = left; i <= right; i++) pages.push(i);
    if (right < total - 1) pages.push('...');
    pages.push(total);
    return pages;
  };

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
      console.error('Error fetching forros data:', error);
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

  const horizonValue = useMemo(() => {
    const horizon = forrosRestricciones.find(r => {
      const name = r.nombre_restriccion.trim().toUpperCase();
      return name === 'HORIZONTE_PLANIFICACION' || name === 'HORIZONTE_PLANIFICACIÓN';
    });
    const val = horizon ? parseInt(horizon.valor_restriccion) : 1;
    return isNaN(val) ? 1 : val;
  }, [forrosRestricciones]);

  useEffect(() => {
    if (isMounted) {
      const todayStr = getEcuadorTodayString();
      const [y, m, d] = todayStr.split('-').map(Number);
      let baseDate = new Date(y, m - 1, d);
      
      const dayOfWeek = baseDate.getDay();
      if (dayOfWeek === 6) baseDate.setDate(baseDate.getDate() + 2);
      else if (dayOfWeek === 0) baseDate.setDate(baseDate.getDate() + 1);
      
      const planningToday = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(baseDate);

      let targetDateObj = new Date(baseDate);
      let businessDaysAdded = 0;
      while (businessDaysAdded < horizonValue) {
        targetDateObj.setDate(targetDateObj.getDate() + 1);
        if (targetDateObj.getDay() !== 0 && targetDateObj.getDay() !== 6) {
          businessDaysAdded++;
        }
      }

      const planningTarget = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Guayaquil',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(targetDateObj);

      setTodayDate(planningToday);
      setTargetDate(planningTarget);
    }
  }, [isMounted, horizonValue, getEcuadorTodayString]);

  const externalFilters = useMemo(() => {
    const filters: Record<string, string[]> = {};
    forrosRestricciones.forEach(r => {
      const name = (r.nombre_restriccion || '').trim().toUpperCase();
      if (name === 'RESPCTRLPROD' || name === 'ALMACEN' || name === 'ALMACÉN') {
        const key = name === 'ALMACÉN' ? 'ALMACEN' : name;
        if (!filters[key]) filters[key] = [];
        
        const val = r.valor_restriccion.trim();
        if (val.includes('&')) {
          filters[key].push(...val.split('&').map(s => s.trim()));
        } else {
          filters[key].push(val);
        }
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
      console.error('Error al cargar tiempos de producción:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [forrosGruposList]);

  const fetchHabilidadesOp = useCallback(async () => {
    setIsLoadingHabilidades(true);
    try {
      const res = await serviciosService.getCuboHabilidadesOP();
      setHabilidadesOpData(res.data || []);
      setHabilidadesPage(1);
    } catch (error) {
      console.error('Error fetching Habilidades OP:', error);
      addNotification('error', 'No se pudieron cargar las Habilidades OP.');
    } finally {
      setIsLoadingHabilidades(false);
    }
  }, [addNotification]);

  const fetchMantenimientos = useCallback(async () => {
    setIsLoadingMantenimientos(true);
    try {
      const res = await serviciosService.ListarMantenimientoPreventivosProgramados();
      const rawData = res.data || [];
      setMantenimientosData(rawData);
      if (rawData.length > 0) {
        setMaintColumns(Object.keys(rawData[0]));
      }
      setMaintCurrentPage(1);
    } catch (error) {
      console.error('Error fetching Mantenimientos:', error);
      addNotification('error', 'No se pudieron cargar los Mantenimientos Preventivos.');
    } finally {
      setIsLoadingMantenimientos(false);
    }
  }, [addNotification]);

  const uniqueWorkstations = useMemo(() => {
    const wsSet = new Set<string>();
    tiemposProduccion.forEach(t => {
      const ws = String(t.PuestoTrabajo || t.nombre_estacion || '').trim();
      if (ws && ws !== 'null' && ws.toUpperCase() !== 'MARCOSUIO') {
        wsSet.add(ws);
      }
    });
    return Array.from(wsSet).sort();
  }, [tiemposProduccion]);

  useEffect(() => {
    if (uniqueWorkstations.length > 0 && Object.keys(workstationConfigs).length === 0 && forrosRestricciones.length > 0) {
      const initial: Record<string, WorkstationConfig> = {};
      uniqueWorkstations.forEach(ws => {
        const wsNorm = ws.replace(/[\s-]/g, '_').toUpperCase();
        
        const peopleRes = forrosRestricciones.find(r => {
          const rName = r.nombre_restriccion.toUpperCase();
          return (rName.includes('PERSONAS') || rName.includes('CANTIDAD_PERSONAS')) && 
                 (rName.includes(wsNorm) || rName.includes(ws.toUpperCase()));
        });

        initial[ws] = { 
          machine: ws, 
          shifts: 1, 
          people: peopleRes ? parseInt(peopleRes.valor_restriccion) || 1 : 1,
          dayCode: '',
          dayName: '',
          nightCode: '',
          nightName: ''
        };
      });
      setWorkstationConfigs(initial);
    }
  }, [uniqueWorkstations, forrosRestricciones, workstationConfigs]);

  const fetchDailyOrders = useCallback(async () => {
    if (Object.keys(externalFilters).length === 0 || !todayDate || !targetDate) return;
    setIsLoadingDaily(true);
    try {
      const response = await serviciosService.OrdenesProvisionalesAlphaPaginados(1, 10000);
      if (response && response.data) {
        const filtered = response.data.filter((order: any) => {
          const matchesExternal = Object.entries(externalFilters).every(([key, allowed]) => {
            const orderKey = Object.keys(order).find(k => k.toUpperCase().trim() === key.toUpperCase().trim());
            if (!orderKey) return true;
            const val = String(order[orderKey] ?? '').trim().toUpperCase();
            return allowed.some(a => a.trim().toUpperCase() === val);
          });
          if (!matchesExternal) return false;

          const normalizedOrderDate = normalizeDateForFilter(order['FECHAINICIO']);
          if (!normalizedOrderDate) return false;
          return normalizedOrderDate >= todayDate && normalizedOrderDate <= targetDate;
        });
        setDailyOrders(filtered);
        setDailyPage(1);
      }
    } catch (error) {
      console.error('Error fetching daily orders:', error);
    } finally {
      setIsLoadingDaily(false);
    }
  }, [externalFilters, targetDate, todayDate, safeParseDateParts, normalizeDateForFilter]);

  const fetchExplosionData = useCallback(async (page: number = 1) => {
    setIsLoadingExplosion(true);
    try {
      const response = await serviciosService.getMaestroMaterialesExplosion(
        centroExplosion,
        fertExplosion,
        page,
        explosionRowsPerPage
      );
      if (response && response.data) {
        setExplosionData(response.data);
        setExplosionTotal(response.totalRegistros || 0);
        setExplosionPage(page);
      } else {
        setExplosionData([]);
        setExplosionTotal(0);
      }
    } catch (error) {
      console.error('Error fetching explosion data:', error);
      addNotification('error', 'No se pudo cargar la explosión de materiales.');
    } finally {
      setIsLoadingExplosion(false);
    }
  }, [centroExplosion, fertExplosion, explosionRowsPerPage, addNotification]);

  useEffect(() => {
    if (isMounted && forrosGruposList.length > 0) {
      fetchTiemposProduccion();
      fetchDailyOrders();
      fetchHabilidadesOp();
      fetchMantenimientos();
    }
  }, [isMounted, forrosGruposList, fetchTiemposProduccion, fetchDailyOrders, fetchHabilidadesOp, fetchMantenimientos]);

  const getResolvedMachine = useCallback((order: any) => {
    const orderFields = ['MAQUINA', 'Maquina', 'maquina', 'PUESTOTRABAJO', 'PuestoTrabajo', 'puestotrabajo'];
    for (const k of orderFields) {
      const val = order[k];
      if (val && String(val).trim() !== '' && String(val).toLowerCase() !== 'null') {
        const sVal = String(val).trim().toUpperCase();
        if (sVal.startsWith('HR')) return sVal;
      }
    }
    
    const material = normalizeMaterialCode(order['MATERIAL'] || order['CodMaterial'] || '');
    if (!material) return '';

    const matches = tiemposProduccion.filter(t => 
      normalizeMaterialCode(t.CodMaterial || t.Material || '') === material
    );

    if (matches.length > 0) {
      for (const m of matches) {
        const values = Object.values(m).map(v => String(v || '').trim().toUpperCase());
        const hrValue = values.find(v => v.startsWith('HR'));
        if (hrValue) return hrValue;
      }
      const best = matches.find(m => Number(m.Tiempo || m.Tiempo_Min) > 0) || matches[0];
      return String(best.PuestoTrabajo || best.Maquina || best.nombre_estacion || '').trim().toUpperCase();
    }

    return '';
  }, [tiemposProduccion, normalizeMaterialCode]);

  const calculateProductionTime = useCallback((material: string, quantity: number, order: any) => {
    if (!material) return '0.00';
    const normMaterial = normalizeMaterialCode(material);
    const resolvedMachine = getResolvedMachine(order).trim().toUpperCase();
    
    if (!resolvedMachine) return '0.00';
    
    const match = tiemposProduccion.find(t => {
      if (normalizeMaterialCode(t.CodMaterial || t.Material || '') !== normMaterial) return false;
      const values = Object.values(t).map(v => String(v || '').trim().toUpperCase());
      return values.includes(resolvedMachine);
    }) || tiemposProduccion.find(t => normalizeMaterialCode(t.CodMaterial || t.Material || '') === normMaterial && Number(t.Tiempo || t.Tiempo_Min) > 0);

    if (!match) return '0.00';
    const unitTime = Number(match.Tiempo || match.Tiempo_Min || 0);
    return (unitTime * quantity).toFixed(2);
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

  const filteredTiempos = useMemo(() => {
    return tiemposProduccion.filter(item => {
      return Object.entries(tiemposFilters).every(([col, val]) => {
        if (!val) return true;
        const itemVal = String(item[col] ?? '').toLowerCase();
        return itemVal.includes(val.toLowerCase());
      });
    });
  }, [tiemposProduccion, tiemposFilters]);

  const totalTiemposPages = Math.max(1, Math.ceil(filteredTiempos.length / tiemposRowsPerPage));

  const paginatedTiemposData = useMemo(() => {
    const start = (tiemposPage - 1) * tiemposRowsPerPage;
    return filteredTiempos.slice(start, start + tiemposRowsPerPage);
  }, [filteredTiempos, tiemposPage, tiemposRowsPerPage]);

  const handleTiemposFilterChange = (column: string, value: string) => {
    setTiemposFilters(prev => ({ ...prev, [column]: value }));
    setTiemposPage(1);
  };

  const dailyColumns = useMemo(() => {
    const priority = ['ORDENPREVISIONAL', 'MATERIAL', 'TEXTOMATERIAL', 'FECHAINICIO', 'CANTIDAD', 'TIEMPOS DE PRODUCCIÓN', 'MAQUINA', 'VALIDACIÓN TÉCNICA', 'FECHAFIN'];
    if (dailyOrders.length === 0) return priority;
    const allKeys = Object.keys(dailyOrders[0]);
    const usedKeysUpper = new Set(priority.map(p => p.toUpperCase().trim()));
    const finalColumns = [...priority];

    allKeys.forEach(k => {
      const kUpper = k.toUpperCase().trim();
      if (!usedKeysUpper.has(kUpper) && kUpper !== 'CATEGORIA' && kUpper !== 'MAQUINA' && kUpper !== 'PUESTOTRABAJO') {
        finalColumns.push(k);
        usedKeysUpper.add(kUpper);
      }
    });

    return finalColumns;
  }, [dailyOrders]);

  const processedDailyOrders = useMemo(() => {
    return dailyOrders
      .filter(order => {
        const machine = getResolvedMachine(order);
        return machine !== 'HR-FORRO' && machine !== 'HR-FBASE';
      })
      .sort((a, b) => {
        const machineA = getResolvedMachine(a);
        const machineB = getResolvedMachine(b);
        return machineA.localeCompare(machineB);
      });
  }, [dailyOrders, getResolvedMachine]);

  const totalDailyPages = Math.max(1, Math.ceil(processedDailyOrders.length / dailyRowsPerPage));
  const paginatedDailyOrders = useMemo(() => {
    const start = (dailyPage - 1) * dailyRowsPerPage;
    return processedDailyOrders.slice(start, start + dailyRowsPerPage);
  }, [processedDailyOrders, dailyPage, dailyRowsPerPage]);

  const handleWorkstationConfigChange = (ws: string, field: keyof WorkstationConfig, value: any) => {
    setWorkstationConfigs(prev => ({
      ...prev,
      [ws]: {
        ...prev[ws],
        [field]: value
      }
    }));
  };

  const productionSummary = useMemo(() => {
    const summaryMap = new Map<string, { machine: string; quantity: number; count: number; totalTime: number }>();
    const machines = new Set<string>();
    tiemposProduccion.forEach(t => {
      const values = Object.values(t).map(v => String(v || '').trim().toUpperCase());
      const hr = values.find(v => v.startsWith('HR'));
      if (hr) machines.add(hr);
    });

    machines.forEach(m => summaryMap.set(m, { machine: m, quantity: 0, count: 0, totalTime: 0 }));

    dailyOrders.forEach(order => {
      const machine = getResolvedMachine(order) || 'SIN MÁQUINA';
      const quantity = Number(order['CANTIDAD'] || 0);
      const timeVal = parseFloat(calculateProductionTime(order['MATERIAL'] || order['CodMaterial'] || '', quantity, order)) || 0;
      if (!summaryMap.has(machine)) summaryMap.set(machine, { machine, quantity: 0, count: 0, totalTime: 0 });
      const entry = summaryMap.get(machine)!;
      entry.quantity += quantity;
      entry.count += 1;
      entry.totalTime += timeVal;
    });
    
    return Array.from(summaryMap.values()).sort((a, b) => a.machine.localeCompare(b.machine));
  }, [dailyOrders, tiemposProduccion, getResolvedMachine, calculateProductionTime]);

  // VALIDADOR DE REGLA ESPEJO INTEGRADO
  const getValidationAlert = useCallback((order: any) => {
    const machine = getResolvedMachine(order).trim().toUpperCase();
    const material = normalizeMaterialCode(order['MATERIAL'] || order['CodMaterial'] || '');
    
    if (machine.startsWith('HR-ACH')) {
      const suffix = machine.slice(-2);
      const targetPef = `HR-PEF${suffix}`;
      const hasPair = dailyOrders.some(o => 
        normalizeMaterialCode(o['MATERIAL'] || o['CodMaterial'] || '') === material && 
        getResolvedMachine(o).toUpperCase() === targetPef
      );
      return hasPair ? null : `Falta par ${targetPef}`;
    }
    
    if (machine.startsWith('HR-PEF')) {
      const suffix = machine.slice(-2);
      const targetAch = `HR-ACH${suffix}`;
      const hasPair = dailyOrders.some(o => 
        normalizeMaterialCode(o['MATERIAL'] || o['CodMaterial'] || '') === material && 
        getResolvedMachine(o).toUpperCase() === targetAch
      );
      return hasPair ? null : `Falta par ${targetAch}`;
    }

    return null;
  }, [dailyOrders, getResolvedMachine, normalizeMaterialCode]);

  const filteredHabilidades = useMemo(() => {
    return habilidadesOpData.filter(item => {
      return Object.entries(habilidadesFilters).every(([col, val]) => {
        if (!val) return true;
        return String(item[col] ?? '').toLowerCase().includes(val.toLowerCase());
      });
    });
  }, [habilidadesOpData, habilidadesFilters]);

  const totalHabilidadesPages = Math.max(1, Math.ceil(filteredHabilidades.length / habilidadesRowsPerPage));
  const paginatedHabilidadesData = useMemo(() => {
    const start = (habilidadesPage - 1) * habilidadesRowsPerPage;
    return filteredHabilidades.slice(start, start + habilidadesRowsPerPage);
  }, [filteredHabilidades, habilidadesPage, habilidadesRowsPerPage]);

  const handleHabilidadesFilterChange = (column: string, value: string) => {
    setHabilidadesFilters(prev => ({ ...prev, [column]: value }));
    setHabilidadesPage(1);
  };

  const filteredMantenimientosFull = useMemo(() => {
    let result = [...mantenimientosData];
    const allowedResps = externalFilters['RESPCTRLPROD'] || [];
    if (allowedResps.length > 0) {
      result = result.filter(m => {
        const respKey = Object.keys(m).find(k => 
          k.toUpperCase().trim() === 'RESP_CONTROL_PROD' || 
          k.toUpperCase().trim() === 'RESPONSABLE' ||
          k.toUpperCase().trim() === 'RESPONSABLE_CONTROL'
        );
        if (!respKey) return true;
        const val = String(m[respKey] || '').trim().padStart(3, '0');
        return allowedResps.includes(val);
      });
    }
    result.sort((a, b) => {
      const dateA = new Date(a.FECHA_PRO || a.FECHA_INICIO || a.FECHA || 0).getTime();
      const dateB = new Date(b.FECHA_PRO || b.FECHA_INICIO || b.FECHA || 0).getTime();
      return dateA - dateB;
    });
    return result;
  }, [mantenimientosData, externalFilters]);

  const maintTotalPages = Math.max(1, Math.ceil(filteredMantenimientosFull.length / MAINT_ROWS_PER_PAGE));
  const paginatedMantenimientos = useMemo(() => {
    const start = (maintCurrentPage - 1) * MAINT_ROWS_PER_PAGE;
    return filteredMantenimientosFull.slice(start, start + MAINT_ROWS_PER_PAGE);
  }, [filteredMantenimientosFull, maintCurrentPage]);

  const maintColumnsSorted = useMemo(() => {
    if (maintColumns.length === 0) return [];
    const dateCol = maintColumns.find(c => {
      const norm = c.toUpperCase().replace(/_/g, '');
      return norm === 'FECHAPRO' || norm === 'FECHAPROGRAMACION';
    }) || maintColumns.find(c => c.toUpperCase().includes('FECHA'));
    if (!dateCol) return maintColumns;
    return [dateCol, ...maintColumns.filter(c => c !== dateCol)];
  }, [maintColumns]);

  const chnBasesDateTotals = useMemo(() => {
    const filteredForTab = dailyOrders.filter(order => {
      const machine = getResolvedMachine(order);
      return ['HR-FBASE', 'HR-FORRO'].includes(machine);
    });
    const totalToday = filteredForTab.filter(order => normalizeDateForFilter(order['FECHAINICIO']) === todayDate).reduce((sum, order) => sum + Number(order['CANTIDAD'] || 0), 0);
    const totalTarget = filteredForTab.filter(order => normalizeDateForFilter(order['FECHAINICIO']) === targetDate).reduce((sum, order) => sum + Number(order['CANTIDAD'] || 0), 0);
    return { totalToday, totalTarget };
  }, [dailyOrders, getResolvedMachine, normalizeDateForFilter, todayDate, targetDate]);

  const displayTodayDate = useMemo(() => {
    if (!todayDate) return '';
    const [y, m, d] = todayDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }, [todayDate]);

  const displayTargetDate = useMemo(() => {
    if (!targetDate) return '';
    const [y, m, d] = targetDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    date.setDate(date.getDate() + 1);
    return date.toISOString().split('T')[0];
  }, [targetDate]);

  const formattedTodayDisp = displayTodayDate ? formatValueForDisplay('FECHA', displayTodayDate) : '...';
  const formattedTargetDisp = displayTargetDate ? formatValueForDisplay('FECHA', displayTargetDate) : '...';

  const renderDailyTableBody = () => {
    if (isLoadingDaily) return <tr><td colSpan={dailyColumns.length} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></td></tr>;
    if (paginatedDailyOrders.length === 0) return <tr><td colSpan={dailyColumns.length} className="py-20 text-center text-gray-400 italic bg-gray-50/50">No hay órdenes para hoy o la fecha objetivo seleccionada en esta página.</td></tr>;

    const rows: React.ReactNode[] = [];
    let currentGroupQuantity = 0;
    let currentGroupTime = 0;

    paginatedDailyOrders.forEach((order, idx) => {
      const machine = getResolvedMachine(order) || 'SIN MÁQUINA';
      const quantity = Number(order['CANTIDAD'] || 0);
      const timeVal = parseFloat(calculateProductionTime(order['MATERIAL'] || order['CodMaterial'] || '', quantity, order)) || 0;
      const alert = getValidationAlert(order);

      currentGroupQuantity += quantity;
      currentGroupTime += timeVal;

      rows.push(
        <tr key={`daily-${idx}`} className="hover:bg-blue-50/40 transition-colors">
          {dailyColumns.map((col, cIdx) => {
            const upperCol = col.toUpperCase().trim();
            if (col === 'TIEMPOS DE PRODUCCIÓN') return <td key={`daily-cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600"><span className="font-bold text-emerald-700">{timeVal.toFixed(2)} min</span></td>;
            if (upperCol === 'MAQUINA') return <td key={`daily-cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600"><span className="font-semibold text-blue-700">{machine}</span></td>;
            if (upperCol === 'VALIDACIÓN TÉCNICA') return (
              <td key={`daily-cell-${idx}-${col}`} className="px-4 py-2.5">
                {alert ? (
                  <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-[9px] font-black uppercase flex items-center gap-1">
                    <ShieldAlert className="w-2.5 h-2.5" /> {alert}
                  </Badge>
                ) : (
                  <div className="text-green-600"><ShieldCheck className="w-4 h-4" /></div>
                )}
              </td>
            );
            return <td key={`daily-cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600">{formatValueForDisplay(col, order[col])}</td>;
          })}
        </tr>
      );

      const nextOrder = paginatedDailyOrders[idx + 1];
      const nextMachine = nextOrder ? (getResolvedMachine(nextOrder) || 'SIN MÁQUINA') : null;

      if (machine !== nextMachine) {
        // Cálculo de capacidad para el subtotal
        const config = workstationConfigs[machine] || { people: 1 };
        const cap = totalHorasNetas * config.people;
        const usedH = currentGroupTime / 60;
        const percent = cap > 0 ? (usedH / cap) * 100 : 0;
        const isOverloaded = percent > 100;

        rows.push(
          <tr key={`subtotal-${machine}-${idx}`} className={cn("bg-gray-100/80 font-bold border-t-2 border-gray-200", isOverloaded && "bg-red-50/50")}>
            {dailyColumns.map((col, cIdx) => {
               const upperCol = col.toUpperCase().trim();
               if (cIdx === 0) return <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2 text-[10px] text-gray-500 uppercase flex items-center gap-2 font-black"><Layers className="w-3 h-3" /> SUBTOTAL {machine}</td>;
               if (upperCol === 'CANTIDAD') return <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2 text-left font-mono text-blue-800 text-[11px]">{currentGroupQuantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
               if (col === 'TIEMPOS DE PRODUCCIÓN') return (
                 <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2 text-left font-mono text-[11px]">
                   <span className={cn(isOverloaded ? "text-red-700" : "text-emerald-800")}>{currentGroupTime.toFixed(2)} min</span>
                   <div className="text-[9px] font-normal text-gray-400">({usedH.toFixed(2)}h / {cap.toFixed(2)}h)</div>
                 </td>
               );
               if (upperCol === 'VALIDACIÓN TÉCNICA') return <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2"><Badge variant="outline" className={cn("font-bold text-[9px]", isOverloaded ? "bg-red-600 text-white" : percent > 85 ? "bg-orange-500 text-white" : "bg-green-600 text-white")}>{percent.toFixed(1)}% CARGA</Badge></td>;
               return <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2"></td>;
            })}
          </tr>
        );
        currentGroupQuantity = 0;
        currentGroupTime = 0;
      }
    });

    return rows;
  };

  const tiemposColumns = useMemo(() => {
    const priority = ['CodMaterial', 'HojaRuta', 'VersionFabricacion_Manual', 'CONTADORHOJARUTA', 'Tiempo_Min', 'Linea', 'PuestoTrabajo', 'PuestoTrabajoLinea', 'centro', 'RespCtrlProd', 'NombRespControlProd', 'TamLoteMin', 'TamLoteMax', 'StockSeguridad', 'StockMaximo', 'ClaseAprovisionam'];
    if (tiemposProduccion.length === 0) return priority;
    const allKeys = Object.keys(tiemposProduccion[0]);
    const toExclude = ['STOCKACTUAL', 'GRUPOSCOMPRAS', 'GRUPOCOMPRAS'];
    const usedKeysUpper = new Set<string>();
    const finalColumns: string[] = [];

    priority.forEach(pCol => {
      const pColUpper = pCol.toUpperCase().trim();
      const match = allKeys.find(k => k.toUpperCase().trim() === pColUpper);
      if (match && !usedKeysUpper.has(pColUpper)) {
        finalColumns.push(match);
        usedKeysUpper.add(pColUpper);
      }
    });

    allKeys.forEach(k => {
      const kUpper = k.toUpperCase().trim();
      if (!usedKeysUpper.has(kUpper) && !toExclude.includes(kUpper)) {
        finalColumns.push(k);
        usedKeysUpper.add(kUpper);
      }
    });
    
    return finalColumns;
  }, [tiemposProduccion]);

  if (!isMounted) return null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <CalendarClock className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Forros</h2>
      </div>

      <Tabs defaultValue="grupos" className="w-full">
        <div className="relative border-b border-gray-200 mb-8">
          <TabsList className="flex w-full h-auto bg-transparent p-0 overflow-x-auto justify-start scrollbar-hide">
            <TabsTrigger value="grupos" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
            <TabsTrigger value="restricciones" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><Lock className="w-4 h-4" /> Restricciones</TabsTrigger>
            <TabsTrigger value="tiempos" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><Timer className="w-4 h-4" /> Tiempos de Producción</TabsTrigger>
            <TabsTrigger value="personal-turnos" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><UserPlus className="w-4 h-4" /> Distribución del personal</TabsTrigger>
            <TabsTrigger value="habilidades-op" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><GraduationCap className="w-4 h-4" /> Habilidades OP</TabsTrigger>
            <TabsTrigger value="mantenimiento" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><Wrench className="w-4 h-4" /> Mantenimiento Preventivo</TabsTrigger>
            <TabsTrigger value="explosion" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><ListTree className="w-4 h-4" /> Explosión de Materiales</TabsTrigger>
            <TabsTrigger value="forros-chn-bases" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><Package className="w-4 h-4" /> Forros CHN & Bases</TabsTrigger>
            <TabsTrigger value="diaria" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><CalendarCheck className="w-4 h-4" /> Programación Componentes</TabsTrigger>
            <TabsTrigger value="resumen-diario" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><BarChart3 className="w-4 h-4" /> Resumen de producción diaria</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="grupos">
          <Card>
            <CardHeader><CardTitle>Grupos del Área</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Código</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Centro</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Nombre</th><th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase">Estado</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {forrosGruposList.map((g) => (
                        <tr key={g.codigo_grupo} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-mono text-xs">{g.codigo_grupo}</td>
                          <td className="px-6 py-4 whitespace-nowrap">{g.centro}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-medium">{g.nombre_grupo}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-center"><Badge variant={g.estado === 'A' ? 'default' : 'secondary'} className={g.estado === 'A' ? 'bg-green-600' : ''}>{g.estado === 'A' ? 'Activo' : 'Inactivo'}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <CardHeader><CardTitle>Restricciones Técnicas</CardTitle></CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Nombre</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Valor</th><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Descripción</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {forrosRestricciones.map((r) => (
                        <tr key={r.codigo_restriccion} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap font-semibold text-indigo-700">{r.nombre_restriccion}</td>
                          <td className="px-6 py-4 whitespace-nowrap font-mono">{r.valor_restriccion}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-gray-500 text-xs">{r.descripcion || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card>
            <CardHeader><CardTitle>Tiempos de Producción (Maestros Técnicos)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        {tiemposColumns.map((col, idx) => (
                          <th key={`head-${col}-${idx}`} className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap bg-gray-50 border-b">{col}</th>
                        ))}
                      </tr>
                      <tr className="bg-gray-50/50">
                        {tiemposColumns.map((col, idx) => (
                          <th key={`filter-t-${col}-${idx}`} className="px-2 py-2 bg-gray-50 border-b border-gray-200">
                            <div className="relative">
                              <Search className="absolute left-2 top-1.5 h-3 w-3 text-gray-400" />
                              <input type="text" placeholder="Buscar..." value={tiemposFilters[col] || ''} onChange={(e) => setTiemposFilters(prev => ({ ...prev, [col]: e.target.value }))} className="w-full text-[10px] pl-7 pr-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary outline-none font-normal bg-white" />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {isLoadingTiempos && tiemposProduccion.length === 0 ? (
                        <tr><td colSpan={tiemposColumns.length} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></td></tr>
                      ) : paginatedTiemposData.length > 0 ? paginatedTiemposData.map((t, idx) => (
                        <tr key={`tiempo-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                          {tiemposColumns.map((col, cIdx) => (
                            <td key={`cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] text-gray-600 font-mono">{formatValueForDisplay(col, t[col])}</td>
                          ))}
                        </tr>
                      )) : (
                        <tr><td colSpan={tiemposColumns.length} className="py-20 text-center text-gray-400 italic bg-gray-50/50">No se encontraron resultados.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(1)} disabled={tiemposPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(p => Math.max(1, p - 1))} disabled={tiemposPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="px-3 text-[11px] font-bold min-w-[120px] text-center border-x py-1 bg-white rounded">Página {tiemposPage} de {totalTiemposPages}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(p => Math.min(totalTiemposPages, p + 1))} disabled={tiemposPage === totalTiemposPages}><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setTiemposPage(totalTiemposPages)} disabled={tiemposPage === totalTiemposPages}><ChevronsRight className="h-4 w-4" /></Button>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-400 font-bold uppercase">{filteredTiempos.length} registros filtrados</span>
                  <Button variant="outline" size="sm" onClick={fetchTiemposProduccion} disabled={isLoadingTiempos} className="h-8 px-4 bg-white"><RefreshCw className={cn("h-3 w-3 mr-2", isLoadingTiempos && "animate-spin")} /> Actualizar</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal-turnos">
          <div className="space-y-8">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Configuración de Capacidad: Distribución del personal</h3>
              <p className="text-sm text-gray-500 mt-1">Define los rangos horarios de las jornadas y el personal asignado por puesto.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-orange-50 p-2.5 rounded-xl border border-orange-100">
                    <Clock className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Turno Principal</h4>
                    <p className="text-sm font-bold text-gray-700">JORNADA DIURNA</p>
                  </div>
                </div>
                <Select value={jornadaDiurnaSel} onValueChange={setJornadaDiurnaSel}>
                  <SelectTrigger className="w-full h-11 border-gray-200 bg-gray-50/50 font-semibold text-gray-700">
                    <SelectValue placeholder="Seleccione horario" />
                  </SelectTrigger>
                  <SelectContent>
                    {DIURNA_OPTIONS.map(opt => (
                      <SelectItem key={`d-${opt.value}`} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 hover:shadow-md transition-all">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-indigo-50 p-2.5 rounded-xl border border-indigo-100">
                    <Clock className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Turno Secundario</h4>
                    <p className="text-sm font-bold text-gray-700">JORNADA NOCTURNA</p>
                  </div>
                </div>
                <Select value={jornadaNocturnaSel} onValueChange={setJornadaNocturnaSel}>
                  <SelectTrigger className="w-full h-11 border-gray-200 bg-gray-50/50 font-semibold text-gray-700">
                    <SelectValue placeholder="Seleccione horario" />
                  </SelectTrigger>
                  <SelectContent>
                    {NOCTURNA_OPTIONS.map(opt => (
                      <SelectItem key={`n-${opt.value}`} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl shadow-lg p-5 text-white flex flex-col justify-between overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:translate-x-2 group-hover:-translate-y-2 transition-transform duration-500">
                  <Calculator size={100} />
                </div>
                <div className="flex items-center gap-3 mb-4 relative z-10">
                  <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                    <Calculator className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black text-indigo-100 uppercase tracking-widest leading-none">Capacidad Calculada</h4>
                    <p className="text-sm font-bold">HORAS NETAS POR TURNO (84%)</p>
                  </div>
                </div>
                <div className="flex-1 flex flex-col justify-center space-y-1.5 mb-4 relative z-10">
                  <div className="flex justify-between items-center text-[11px] text-indigo-50/80">
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-orange-400"></div> DIURNA ({parseFloat(jornadaDiurnaSel)}h):</span>
                    <span className="font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded-md">{horasNetasDiurnas.toFixed(3)}h</span>
                  </div>
                  <div className="flex justify-between items-center text-[11px] text-indigo-50/80">
                    <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-300"></div> NOCTURNA ({parseFloat(jornadaNocturnaSel)}h):</span>
                    <span className="font-mono font-bold text-white bg-white/10 px-2 py-0.5 rounded-md">{horasNetasNocturnas.toFixed(3)}h</span>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/20 flex items-end justify-between relative z-10">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-black uppercase tracking-tighter text-indigo-200">TOTAL DISPONIBLE:</span>
                    <span className="text-[10px] text-white/50 italic leading-none">(NETO X TURNO)</span>
                  </div>
                  <div className="flex items-baseline gap-1 bg-white/10 px-3 py-1 rounded-xl backdrop-blur-md">
                    <span className="text-4xl font-black font-mono tracking-tighter tabular-nums drop-shadow-md">{totalHorasNetas.toFixed(3)}</span>
                    <span className="text-xs font-bold opacity-60 ml-0.5">h</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 border-collapse">
                  <thead className="bg-gray-50/50">
                    <tr className="border-b border-gray-200">
                      <th colSpan={1} className="px-4 py-2"></th>
                      <th colSpan={1} className="px-4 py-2 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest border-l border-gray-100">Configuración</th>
                      <th colSpan={2} className="px-4 py-2 text-center text-[10px] font-black text-orange-600 uppercase tracking-widest border-l border-orange-100 bg-orange-50/30">Turno Día</th>
                      <th colSpan={2} className="px-4 py-2 text-center text-[10px] font-black text-indigo-600 uppercase tracking-widest border-l border-indigo-100 bg-indigo-50/30">Turno Noche</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-black text-gray-500 uppercase tracking-widest">PUESTO DE TRABAJO</th>
                      <th className="px-4 py-4 text-center text-xs font-black text-gray-500 uppercase tracking-widest border-l border-gray-100">Pers / Turno</th>
                      <th className="px-4 py-4 text-left text-[10px] font-black text-orange-700 uppercase tracking-widest border-l border-orange-100 bg-orange-50/30">Código</th>
                      <th className="px-4 py-4 text-left text-[10px] font-black text-orange-700 uppercase tracking-widest bg-orange-50/30">Nombre</th>
                      <th className="px-4 py-4 text-left text-[10px] font-black text-indigo-700 uppercase tracking-widest border-l border-indigo-100 bg-indigo-50/30">Código</th>
                      <th className="px-4 py-4 text-left text-[10px] font-black text-indigo-700 uppercase tracking-widest bg-indigo-50/30">Nombre</th>
                      <th className="px-6 py-4 text-right text-xs font-black text-indigo-600 uppercase tracking-widest">Capacidad Neta (h)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-100">
                    {uniqueWorkstations.map((ws) => {
                      const config = workstationConfigs[ws] || { machine: ws, shifts: 1, people: 1 };
                      const totalNetHours = totalHorasNetas * config.people;

                      return (
                        <tr key={`config-${ws}`} className="hover:bg-indigo-50/30 transition-colors group">
                          <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-800">{ws}</td>
                          <td className="px-4 py-4 whitespace-nowrap text-center border-l border-gray-50">
                            <Input type="number" className="w-16 h-9 text-center text-xs font-bold border-gray-200 bg-gray-50/30 mx-auto" value={config.people} min="1" max="10" onChange={(e) => handleWorkstationConfigChange(ws, 'people', parseInt(e.target.value) || 1)} />
                          </td>
                          <td className="px-2 py-4 whitespace-nowrap border-l border-orange-100 bg-orange-50/20">
                            <Input className="h-8 text-[10px] font-mono border-orange-200 focus:ring-orange-500" placeholder="Cód. Día" value={config.dayCode || ''} onChange={(e) => handleWorkstationConfigChange(ws, 'dayCode', e.target.value)} />
                          </td>
                          <td className="px-2 py-4 whitespace-nowrap bg-orange-50/20">
                            <Input className="h-8 text-[10px] border-orange-200 focus:ring-orange-500" placeholder="Nombre Operador" value={config.dayName || ''} onChange={(e) => handleWorkstationConfigChange(ws, 'dayName', e.target.value)} />
                          </td>
                          <td className="px-2 py-4 whitespace-nowrap border-l border-indigo-100 bg-indigo-50/20">
                            <Input className="h-8 text-[10px] font-mono border-indigo-200 focus:ring-indigo-500" placeholder="Cód. Noche" disabled={parseFloat(jornadaNocturnaSel) === 0} value={config.nightCode || ''} onChange={(e) => handleWorkstationConfigChange(ws, 'nightCode', e.target.value)} />
                          </td>
                          <td className="px-2 py-4 whitespace-nowrap bg-indigo-50/20">
                            <Input className="h-8 text-[10px] border-indigo-200 focus:ring-indigo-500" placeholder="Nombre Operador" disabled={parseFloat(jornadaNocturnaSel) === 0} value={config.nightName || ''} onChange={(e) => handleWorkstationConfigChange(ws, 'nightName', e.target.value)} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-indigo-700 text-md tabular-nums">
                            {totalNetHours.toFixed(2)} <span className="text-[10px] font-bold opacity-40">h</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-5 bg-indigo-50/80 border border-indigo-100 rounded-2xl flex items-start gap-4">
              <div className="bg-indigo-600 p-1.5 rounded-lg shadow-sm"><Repeat className="w-4 h-4 text-white" /></div>
              <div className="text-xs text-indigo-950 leading-relaxed">
                <p className="font-black uppercase tracking-widest mb-1.5 text-indigo-600">Lógica de Ingeniería de Planta:</p>
                <p>El sistema aplica un factor de utilización del <span className="font-bold bg-indigo-100 px-1.5 py-0.5 rounded text-indigo-800">84%</span> sobre la jornada bruta seleccionada para descontar paros programados. El valor mostrado es la <strong>Capacidad Neta</strong> disponible por estación considerando la dotación de personal por turno.</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="habilidades-op">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Habilidades del Personal (OP)</CardTitle>
                  <CardDescription>Calificación técnica y polivalencia de los operadores por estación.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchHabilidadesOp} disabled={isLoadingHabilidades}>
                  <RefreshCw className={cn("h-4 w-4 mr-2", isLoadingHabilidades && "animate-spin")} />
                  Actualizar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                    <Input 
                      placeholder="Filtrar por Operador..." 
                      className="pl-9 h-10 text-sm" 
                      onChange={(e) => handleHabilidadesFilterChange('OPERADOR', e.target.value)}
                    />
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
                    <Input 
                      placeholder="Filtrar por Estación..." 
                      className="pl-9 h-10 text-sm" 
                      onChange={(e) => handleHabilidadesFilterChange('ESTACION', e.target.value)}
                    />
                  </div>
                </div>

                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                  <div className="overflow-x-auto max-h-[60vh]">
                    <table className="min-w-full divide-y divide-gray-200 border-collapse">
                      <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                          {habilidadesOpData.length > 0 && Object.keys(habilidadesOpData[0]).map((col) => (
                            <th key={`hab-head-${col}`} className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-100">
                        {isLoadingHabilidades ? (
                          <tr><td colSpan={10} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></td></tr>
                        ) : paginatedHabilidadesData.length > 0 ? paginatedHabilidadesData.map((row, idx) => (
                          <tr key={`hab-row-${idx}`} className="hover:bg-blue-50/20 transition-colors">
                            {Object.keys(row).map((col, cIdx) => {
                              const val = row[col];
                              const isCalificacion = col.toUpperCase().includes('CALIF') || col.toUpperCase().includes('PUNTAJE');
                              return (
                                <td key={`hab-cell-${idx}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600">
                                  {isCalificacion ? (
                                    <Badge variant="outline" className={cn(
                                      "font-bold font-mono",
                                      Number(val) >= 90 ? "bg-green-50 text-green-700 border-green-200" :
                                      Number(val) >= 70 ? "bg-amber-50 text-amber-700 border-amber-200" :
                                      "bg-red-50 text-red-700 border-red-200"
                                    )}>
                                      {val}%
                                    </Badge>
                                  ) : String(val ?? '—')}
                                </td>
                              );
                            })}
                          </tr>
                        )) : (
                          <tr><td colSpan={10} className="py-20 text-center text-gray-400 italic">No se encontraron datos de habilidades.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setHabilidadesPage(1)} disabled={habilidadesPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setHabilidadesPage(p => Math.max(1, p - 1))} disabled={habilidadesPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="px-3 text-[11px] font-bold min-w-[120px] text-center border-x py-1 bg-white rounded">Página {habilidadesPage} de {totalHabilidadesPages}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setHabilidadesPage(p => Math.min(totalHabilidadesPages, p + 1))} disabled={habilidadesPage === totalHabilidadesPages}><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setHabilidadesPage(totalHabilidadesPages)} disabled={habilidadesPage === totalHabilidadesPages}><ChevronsRight className="h-4 w-4" /></Button>
                  </div>
                  <span className="text-[10px] text-gray-400 font-bold uppercase">{filteredHabilidades.length} habilidades registradas</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mantenimiento">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Mantenimientos Preventivos Programados</CardTitle>
                  <CardDescription>Paros técnicos organizados cronológicamente y filtrados para el área de Forros.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchMantenimientos} disabled={isLoadingMantenimientos}>
                  <RefreshCw className={cn("h-4 w-4 mr-2", isLoadingMantenimientos && "animate-spin")} />
                  Actualizar Datos
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full border-collapse">
                      <thead className="bg-gray-100 border-b">
                        <tr>
                          {maintColumnsSorted.map((col) => (
                            <th
                              key={`maint-col-${col}`}
                              className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap"
                            >
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {isLoadingMantenimientos ? (
                          <tr><td colSpan={maintColumnsSorted.length || 6} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></td></tr>
                        ) : paginatedMantenimientos.length > 0 ? (
                          paginatedMantenimientos.map((row, idx) => (
                            <tr key={`maint-row-${idx}`} className="hover:bg-blue-50/20 transition-colors">
                              {maintColumnsSorted.map((col) => {
                                const value = row[col];
                                const upperCol = col.toUpperCase().replace(/_/g, '');
                                if (upperCol.includes('FECHA')) {
                                  return (<td key={`${idx}-${col}`} className="px-4 py-3 text-xs font-mono font-bold text-blue-700 whitespace-nowrap">{formatValueForDisplay(col, value)}</td>);
                                }
                                if (upperCol === 'ESTADO' || upperCol === 'STATUS') {
                                  const val = String(value || '').toUpperCase();
                                  const isEjecutado = val.includes('EJEC') || val.includes('OK') || val.includes('TERMINADO');
                                  const isEnProceso = val.includes('PROC') || val.includes('CURSO');
                                  return (<td key={`${idx}-${col}`} className="px-4 py-3"><Badge variant="outline" className={cn("font-bold text-[10px] px-2 py-0.5", isEjecutado ? "bg-green-50 text-green-700 border-green-200" : isEnProceso ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-amber-50 text-amber-700 border-amber-200")}>{val || 'PROGRAMADO'}</Badge></td>);
                                }
                                if (upperCol.includes('EQUIPO') || upperCol.includes('MAQUINA')) {
                                  return (<td key={`${idx}-${col}`} className="px-4 py-3 text-xs font-mono font-bold text-gray-900">{String(value ?? '—')}</td>);
                                }
                                return (<td key={`${idx}-${col}`} className="px-4 py-3 text-xs text-gray-600">{typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—')}</td>);
                              })}
                            </tr>
                          ))
                        ) : (
                          <tr><td colSpan={maintColumnsSorted.length || 6} className="text-center py-20 text-gray-500 italic">No hay registros de mantenimientos programados.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
                {maintTotalPages > 1 && (
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                    <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Mostrando página {maintCurrentPage} de {maintTotalPages}</div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="icon" onClick={() => setMaintCurrentPage(1)} disabled={maintCurrentPage === 1} className="h-8 w-8"><ChevronsLeft className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" onClick={() => setMaintCurrentPage(p => Math.max(1, p - 1))} disabled={maintCurrentPage === 1} className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>
                      <div className="flex items-center gap-1 mx-2">{getPageNumbers(maintCurrentPage, maintTotalPages).map((p, i) => p === '...' ? <span key={`ell-${i}`} className="px-2 text-gray-400 text-xs font-bold">...</span> : <Button key={`p-${p}`} variant={maintCurrentPage === p ? "default" : "outline"} size="sm" onClick={() => setMaintCurrentPage(p as number)} className={cn("h-8 w-8 p-0 text-xs font-bold", maintCurrentPage === p ? "bg-primary text-primary-foreground" : "bg-white")}>{p}</Button>)}</div>
                      <Button variant="outline" size="icon" onClick={() => setMaintCurrentPage(p => Math.min(maintTotalPages, p + 1))} disabled={maintCurrentPage === maintTotalPages} className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
                      <Button variant="outline" size="icon" onClick={() => setMaintCurrentPage(maintTotalPages)} disabled={maintCurrentPage === maintTotalPages} className="h-8 w-8"><ChevronsRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="explosion">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div><CardTitle>Explosión de Materiales (BOM)</CardTitle><CardDescription>Consulta de componentes por material (FERT).</CardDescription></div>
                <div className="flex flex-wrap items-end gap-3 p-3 bg-gray-50 rounded-lg border">
                  <div className="w-24"><label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Centro</label><Select value={centroExplosion} onValueChange={setCentroExplosion}><SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="1000">1000</SelectItem><SelectItem value="2000">2000</SelectItem></SelectContent></Select></div>
                  <div className="w-48"><label className="text-[10px] font-bold text-gray-700 uppercase block mb-1.5">FERT Principal (Cód)</label><Input className="h-9 text-xs" placeholder="Ej: 10001433" value={fertExplosion} onChange={(e) => setFertExplosion(e.target.value)} /></div>
                  <Button size="sm" onClick={() => fetchExplosionData(1)} disabled={isLoadingExplosion}>{isLoadingExplosion ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Search className="h-3 w-3 mr-2" />} Consultar</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-auto max-h-[55vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-50 border-b"><th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Centro</th><th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">FERT Principal</th><th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Desc. FERT</th><th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Componente</th><th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Desc. Componente</th><th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Tipo</th><th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-600 uppercase">Cant. Unitaria</th><th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-600 uppercase">Cant. Acumulada</th></thead>
                    <tbody className="divide-y divide-200 bg-white">
                      {isLoadingExplosion ? <tr><td colSpan={8} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></td></tr> : explosionData.length > 0 ? explosionData.map((row, idx) => (<tr key={`bom-${idx}`} className="hover:bg-blue-50/40 transition-colors"><td className="px-4 py-2 text-[11px] font-mono">{row.CENTRO}</td><td className="px-4 py-2 text-[11px] font-bold">{row.FERT_PRINCIPAL}</td><td className="px-4 py-2 text-[11px] text-gray-600 max-w-40 truncate" title={row.DESCRIPCION_FERT}>{row.DESCRIPCION_FERT}</td><td className="px-4 py-2 text-[11px] font-bold text-blue-700">{row.COMPONENTE}</td><td className="px-4 py-2 text-[11px] text-gray-600 max-w-48 truncate" title={row.DESCRIPCION_COMPONENTE}>{row.DESCRIPCION_COMPONENTE}</td><td className="px-4 py-2 text-[11px] text-gray-400">{row.TipoMaterial}</td><td className="px-4 py-2 text-[11px] text-right font-mono font-bold text-indigo-700">{formatValueForDisplay('CANTIDAD', row.TOTAL_CANTIDAD_UNITARIA)}</td><td className="px-4 py-2 text-[11px] text-right font-mono font-bold text-indigo-400">{formatValueForDisplay('CANTIDAD', row.TOTAL_CANTIDAD_ACUMULADA)}</td></tr>)) : (<tr><td colSpan={8} className="py-20 text-center text-gray-400 italic bg-gray-50/50">Ingresa filtros y presiona consultar para ver la explosión de materiales.</td></tr>)}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm mt-4">
                <div className="flex items-center gap-1"><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fetchExplosionData(1)} disabled={explosionPage === 1 || isLoadingExplosion}><ChevronsLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fetchExplosionData(explosionPage - 1)} disabled={explosionPage === 1 || isLoadingExplosion}><ChevronLeft className="h-4 w-4" /></Button><span className="px-3 text-[11px] font-bold min-w-[120px] text-center border-x py-1 bg-white rounded">Página {explosionPage} de {Math.max(1, Math.ceil(explosionTotal / explosionRowsPerPage))}</span><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fetchExplosionData(explosionPage + 1)} disabled={explosionPage >= Math.ceil(explosionTotal / explosionRowsPerPage) || isLoadingExplosion}><ChevronRight className="h-4 w-4" /></Button><Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fetchExplosionData(Math.ceil(explosionTotal / explosionRowsPerPage))} disabled={explosionPage >= Math.ceil(explosionTotal / explosionRowsPerPage) || isLoadingExplosion}><ChevronsRight className="h-4 w-4" /></Button></div>
                <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{explosionTotal.toLocaleString()} registros totales</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="forros-chn-bases">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-white border-l-4 border-l-orange-500 shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-orange-600"><MapPin className="w-4 h-4" /><p className="text-sm font-bold uppercase tracking-wider">Producción GYE (Fecha Cercana)</p></div>
                      <p className="text-md font-semibold text-gray-700">{formattedTodayDisp}</p>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-full"><CalendarIconLucide className="w-6 h-6 text-orange-600" /></div>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2"><p className="text-3xl font-extrabold text-orange-700 font-mono">{chnBasesDateTotals.totalToday.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-xs text-gray-400 uppercase font-semibold">Unidades</p></div>
                </CardContent>
              </Card>
              <Card className="bg-white border-l-4 border-l-blue-600 shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-blue-600"><MapPin className="w-4 h-4" /><p className="text-sm font-bold uppercase tracking-wider">Producción Quito (Segunda Fecha)</p></div>
                      <p className="text-md font-semibold text-gray-700">{formattedTargetDisp}</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-full"><CalendarIconLucide className="w-6 h-6 text-blue-600" /></div>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2"><p className="text-3xl font-extrabold text-blue-800 font-mono">{chnBasesDateTotals.totalTarget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="text-xs text-gray-400 uppercase font-semibold">Unidades</p></div>
                </CardContent>
              </Card>
            </div>
            <Card><CardHeader><CardTitle>Forros CHN & Bases</CardTitle></CardHeader><CardContent><ProvisionalOrdersTabSection externalFilters={{...externalFilters, MAQUINA: ['HR-FBASE', 'HR-FORRO']}} renderCell={renderResolvedProvisionalCell} groupBy="MAQUINA" resolveValue={resolveLogicValue} /></CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="diaria">
          <div className="space-y-6">
            {/* MONITOR DE SALUD DE PLANTA (Optimizado) */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {productionSummary.map((item) => {
                const config = workstationConfigs[item.machine] || { people: 1 };
                const cap = totalHorasNetas * config.people;
                const usedH = item.totalTime / 60;
                const percent = cap > 0 ? (usedH / cap) * 100 : 0;
                
                const statusColor = percent > 100 ? "border-red-500 bg-red-50" : 
                                   percent > 85 ? "border-orange-500 bg-orange-50" : 
                                   "border-green-500 bg-green-50";
                const textStatus = percent > 100 ? "text-red-700" : 
                                  percent > 85 ? "text-orange-700" : 
                                  "text-green-700";

                return (
                  <div key={`health-${item.machine}`} className={cn("border-2 rounded-xl p-3 shadow-sm transition-all hover:scale-105", statusColor)}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black text-gray-500 uppercase">{item.machine}</span>
                      <Activity className={cn("w-3 h-3", textStatus)} />
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={cn("text-lg font-black font-mono", textStatus)}>{percent.toFixed(1)}%</span>
                      <span className="text-[9px] text-gray-400 font-bold">CARGA</span>
                    </div>
                    <div className="mt-1 flex justify-between text-[9px] font-bold text-gray-400 uppercase">
                      <span>{usedH.toFixed(1)}h</span>
                      <span>/ {cap.toFixed(1)}h</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <Card className="shadow-lg border-gray-200">
              <CardHeader className="bg-gray-50/50 border-b flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarCheck className="w-5 h-5 text-primary" /> 
                    Programación Componentes: {formattedTodayDisp} y {formattedTargetDisp}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-black text-[10px]">REGLA ESPEJO ACTIVA</Badge>
                  <Button variant="outline" size="sm" onClick={fetchDailyOrders} disabled={isLoadingDaily} className="h-8 px-4 bg-white"><RefreshCw className={cn("h-3 w-3 mr-2", isLoadingDaily && "animate-spin")} /> Sincronizar</Button>
                </div>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-inner">
                  <div className="overflow-auto max-h-[60vh]">
                    <table className="min-w-full divide-y divide-gray-200 border-collapse">
                      <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                        <tr>{dailyColumns.map((col, idx) => (<th key={`daily-head-${col}-${idx}`} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-gray-100 border-b text-gray-600">{col}</th>))}</tr>
                      </thead>
                      <tbody className="divide-y divide-200 bg-white">{renderDailyTableBody()}</tbody>
                    </table>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(1)} disabled={dailyPage === 1}><ChevronsLeft className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(p => Math.max(1, p - 1))} disabled={dailyPage === 1}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="px-3 text-[11px] font-bold min-w-[120px] text-center border-x py-1 bg-white rounded">Página {dailyPage} de {totalDailyPages}</span>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(p => Math.min(totalDailyPages, p + 1))} disabled={dailyPage === totalDailyPages}><ChevronRight className="h-4 w-4" /></Button>
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setDailyPage(totalDailyPages)} disabled={dailyPage === totalDailyPages}><ChevronsRight className="h-4 w-4" /></Button>
                  </div>
                  <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{processedDailyOrders.length} registros cargados</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="resumen-diario">
          <Card className="shadow-md">
            <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="w-5 h-5 text-primary" /> Carga por Máquina / Puesto Técnico</CardTitle><CardDescription>Consolidado único de unidades y tiempos de carga comparados contra capacidad configurada.</CardDescription></CardHeader>
            <CardContent className="pt-6">
              <div className="rounded-md border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Máquina / Puesto</th><th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Cant. Órdenes</th><th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Total Unidades</th><th className="px-6 py-3 text-right text-xs font-bold text-emerald-700 uppercase tracking-wider">Tiempo Total (min)</th><th className="px-6 py-3 text-right text-xs font-bold text-indigo-600 uppercase tracking-wider">Tiempo Total (h)</th><th className="px-6 py-3 text-right text-xs font-bold text-blue-700 uppercase tracking-wider">Capacidad Máx (h)</th><th className="px-6 py-3 text-right text-xs font-bold text-blue-700 uppercase tracking-wider">Ocupación (%)</th></tr>
                    </thead>
                    <tbody className="divide-y divide-200 bg-white">
                      {isLoadingDaily ? <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></td></tr> : productionSummary.length > 0 ? productionSummary.map((item, idx) => {
                          const config = workstationConfigs[item.machine] || { machine: item.machine, shifts: 1, people: 1 };
                          const plannedCapacityHours = totalHorasNetas * config.people;
                          const totalTimeHours = item.totalTime / 60;
                          const utilizationPercent = plannedCapacityHours > 0 ? (totalTimeHours / plannedCapacityHours) * 100 : 0;
                          return (<tr key={idx} className="hover:bg-gray-50 transition-colors"><td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700">{item.machine}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">{item.count}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-700 font-mono">{item.quantity.toLocaleString()}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-emerald-700 font-mono">{item.totalTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-indigo-600 font-mono">{totalTimeHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-gray-400">{plannedCapacityHours.toFixed(2)} h</td><td className="px-6 py-4 whitespace-nowrap text-sm text-right"><Badge className={cn("font-mono font-bold", utilizationPercent > 100 ? "bg-red-100 text-red-700 hover:bg-red-200" : utilizationPercent > 80 ? "bg-amber-100 text-amber-700 hover:bg-amber-200" : "bg-green-100 text-green-700 hover:bg-green-200")}>{utilizationPercent.toFixed(1)}%</Badge></td></tr>);
                        }) : <tr><td colSpan={7} className="py-12 text-center text-gray-400 italic">No hay datos para resumir.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
