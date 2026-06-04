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
  TestTube,
  FileSpreadsheet
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

const PUESTO_TRABAJO_OVERRIDES: Record<string, string> = {
  'HR-ACH09': 'ACOLCHADORA09',
  'HR-ACH12': 'ACOLCHADORA11',
  'HR-BO01': 'ACOLCHADORA11',
  'HR-INTE2': 'COSEDORA-INTPR',
  'HR-INTPT': 'COSEDORA-INTPR',
};

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
        const date = new Date(Number(parts.y), Number(parts.m) - 1, Number(parts.d));
        date.setDate(date.getDate() + 1);
        const dy = date.getFullYear();
        const dm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${dd}/${dm}/${dy}`;
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
        filters[key].push(r.valor_restriccion.trim());
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

  const uniqueMachines = useMemo(() => {
    const machinesSet = new Set<string>();
    tiemposProduccion.forEach(t => {
      const values = Object.values(t).map(v => String(v || '').trim().toUpperCase());
      const hr = values.find(v => v.startsWith('HR'));
      if (hr) machinesSet.add(hr);
    });
    
    const machinesArray = Array.from(machinesSet);

    return machinesArray.sort((a, b) => {
      const getParts = (name: string) => {
        const match = name.match(/^HR-(ACH|PEF)(\d+)$/);
        if (match) return { type: match[1], suffix: parseInt(match[2]), isMain: true };
        return { type: name, suffix: 0, isMain: false };
      };

      const partA = getParts(a);
      const partB = getParts(b);

      if (partA.isMain && partB.isMain) {
        if (partA.suffix !== partB.suffix) return partA.suffix - partB.suffix;
        return partA.type.localeCompare(partB.type); 
      }

      if (partA.isMain && !partB.isMain) return -1;
      if (!partA.isMain && partB.isMain) return 1;

      return a.localeCompare(b);
    });
  }, [tiemposProduccion]);

  useEffect(() => {
    if (uniqueMachines.length > 0 && Object.keys(workstationConfigs).length === 0 && forrosRestricciones.length > 0) {
      const initial: Record<string, WorkstationConfig> = {};
      uniqueMachines.forEach(m => {
        const mNorm = m.replace(/-/g, '_').toUpperCase();
        
        const peopleRes = forrosRestricciones.find(r => {
          const rName = r.nombre_restriccion.toUpperCase();
          return rName.includes('PERSONAS') && rName.includes(mNorm);
        });

        const shiftsRes = forrosRestricciones.find(r => {
          const rName = r.nombre_restriccion.toUpperCase();
          return rName.includes('TURNOS') && rName.includes(mNorm);
        });

        initial[m] = { 
          machine: m, 
          shifts: shiftsRes ? parseInt(shiftsRes.valor_restriccion) || 1 : 1, 
          people: peopleRes ? parseInt(peopleRes.valor_restriccion) || 1 : 1 
        };
      });
      setWorkstationConfigs(initial);
    }
  }, [uniqueMachines, forrosRestricciones, workstationConfigs]);

  const fetchDailyOrders = useCallback(async () => {
    if (Object.keys(externalFilters).length === 0 || !todayDate || !targetDate) return;
    setIsLoadingDaily(true);
    try {
      const response = await serviciosService.OrdenesProvisionalesPaginados(1, 10000);
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
  }, [externalFilters, targetDate, todayDate, normalizeDateForFilter]);

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
    }
  }, [isMounted, forrosGruposList, fetchTiemposProduccion, fetchDailyOrders]);

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

  const resolveLogicValue = useCallback((column: string, order: any) => {
    const upperCol = column.toUpperCase().trim();
    if (upperCol === 'MAQUINA') {
      return getResolvedMachine(order) || 'Z_SIN_MAQUINA';
    }
    return String(order[column] ?? '');
  }, [getResolvedMachine]);

  const totalTiemposPages = Math.max(1, Math.ceil(tiemposProduccion.length / tiemposRowsPerPage));

  const filteredTiempos = useMemo(() => {
    return tiemposProduccion.filter(item => {
      return Object.entries(tiemposFilters).every(([col, val]) => {
        if (!val) return true;
        const itemVal = String(item[col] ?? '').toLowerCase();
        return itemVal.includes(val.toLowerCase());
      });
    });
  }, [tiemposProduccion, tiemposFilters]);

  const paginatedTiemposData = useMemo(() => {
    const start = (tiemposPage - 1) * tiemposRowsPerPage;
    return filteredTiempos.slice(start, start + tiemposRowsPerPage);
  }, [filteredTiempos, tiemposPage, tiemposRowsPerPage]);

  const handleTiemposFilterChange = (column: string, value: string) => {
    setTiemposFilters(prev => ({ ...prev, [column]: value }));
    setTiemposPage(1);
  };

  const dailyColumns = useMemo(() => {
    const priority = ['ORDENPREVISIONAL', 'MATERIAL', 'TEXTOMATERIAL', 'FECHAINICIO', 'CANTIDAD', 'TIEMPOS DE PRODUCCIÓN', 'MAQUINA', 'FECHAFIN'];
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

  const handleWorkstationConfigChange = (machine: string, field: 'shifts' | 'people', value: number) => {
    setWorkstationConfigs(prev => ({
      ...prev,
      [machine]: {
        ...prev[machine],
        [field]: value
      }
    }));
  };

  const productionSummary = useMemo(() => {
    const summaryMap = new Map<string, { machine: string; quantity: number; count: number; totalTime: number }>();
    uniqueMachines.forEach(m => summaryMap.set(m, { machine: m, quantity: 0, count: 0, totalTime: 0 }));

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
  }, [dailyOrders, uniqueMachines, getResolvedMachine, calculateProductionTime]);

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

      currentGroupQuantity += quantity;
      currentGroupTime += timeVal;

      rows.push(
        <tr key={`daily-${idx}`} className="hover:bg-blue-50/40 transition-colors">
          {dailyColumns.map((col, cIdx) => {
            const upperCol = col.toUpperCase().trim();
            if (col === 'TIEMPOS DE PRODUCCIÓN') return <td key={`daily-cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600"><span className="font-bold text-emerald-700">{timeVal.toFixed(2)} min</span></td>;
            if (upperCol === 'MAQUINA') return <td key={`daily-cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600"><span className="font-semibold text-blue-700">{machine}</span></td>;
            return <td key={`daily-cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600">{formatValueForDisplay(col, order[col])}</td>;
          })}
        </tr>
      );

      const nextOrder = paginatedDailyOrders[idx + 1];
      const nextMachine = nextOrder ? (getResolvedMachine(nextOrder) || 'SIN MÁQUINA') : null;

      if (machine !== nextMachine) {
        rows.push(
          <tr key={`subtotal-${machine}-${idx}`} className="bg-gray-100/80 font-bold border-t-2 border-gray-200">
            {dailyColumns.map((col, cIdx) => {
               const upperCol = col.toUpperCase().trim();
               if (cIdx === 0) return <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2 text-[10px] text-gray-500 uppercase flex items-center gap-2"><Layers className="w-3 h-3" /> SUBTOTAL {machine}</td>;
               if (upperCol === 'CANTIDAD') return <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2 text-left font-mono text-blue-800 text-[11px]">{currentGroupQuantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
               if (col === 'TIEMPOS DE PRODUCCIÓN') return <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2 text-left font-mono text-emerald-800 text-[11px]">{currentGroupTime.toFixed(2)} min</td>;
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

  const formattedTodayDisp = displayTodayDate ? formatValueForDisplay('FECHA', displayTodayDate) : '...';
  const formattedTargetDisp = displayTargetDate ? formatValueForDisplay('FECHA', displayTargetDate) : '...';

  // --- Lógica para pestaña PRUEBAS ---
  const pruebasOrders = useMemo(() => {
    return dailyOrders.filter(order => {
      const machine = getResolvedMachine(order);
      return ['HR-ACH02', 'HR-PEF02'].includes(machine);
    }).sort((a, b) => {
      const machineA = getResolvedMachine(a);
      const machineB = getResolvedMachine(b);
      return machineA.localeCompare(machineB);
    });
  }, [dailyOrders, getResolvedMachine]);

  const renderPruebasTableBody = () => {
    if (isLoadingDaily) return <tr><td colSpan={dailyColumns.length} className="py-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></td></tr>;
    if (pruebasOrders.length === 0) return <tr><td colSpan={dailyColumns.length} className="py-20 text-center text-gray-400 italic">No se encontraron órdenes para HR-ACH02 o HR-PEF02.</td></tr>;

    const rows: React.ReactNode[] = [];
    let currentGroupQuantity = 0;
    let currentGroupTime = 0;

    pruebasOrders.forEach((order, idx) => {
      const machine = getResolvedMachine(order) || 'SIN MÁQUINA';
      const quantity = Number(order['CANTIDAD'] || 0);
      const timeVal = parseFloat(calculateProductionTime(order['MATERIAL'] || order['CodMaterial'] || '', quantity, order)) || 0;

      currentGroupQuantity += quantity;
      currentGroupTime += timeVal;

      rows.push(
        <tr key={`pruebas-row-${idx}`} className="hover:bg-indigo-50/20 transition-colors">
          {dailyColumns.map((col, cIdx) => {
            const upperCol = col.toUpperCase().trim();
            if (col === 'TIEMPOS DE PRODUCCIÓN') return <td key={`pruebas-cell-${idx}-${col}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono font-bold text-emerald-700">{timeVal.toFixed(2)} min</td>;
            if (upperCol === 'MAQUINA') return <td key={`pruebas-cell-${idx}-${col}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono font-bold text-indigo-700">{machine}</td>;
            return <td key={`pruebas-cell-${idx}-${col}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600">{formatValueForDisplay(col, order[col])}</td>;
          })}
        </tr>
      );

      const nextOrder = pruebasOrders[idx + 1];
      const nextMachine = nextOrder ? (getResolvedMachine(nextOrder) || 'SIN MÁQUINA') : null;

      if (machine !== nextMachine) {
        rows.push(
          <tr key={`pruebas-subtotal-${machine}-${idx}`} className="bg-indigo-50 font-bold border-t-2 border-indigo-100">
            {dailyColumns.map((col, cIdx) => {
               const upperCol = col.toUpperCase().trim();
               if (cIdx === 0) return <td key={`p-sub-${idx}-${cIdx}`} className="px-4 py-2 text-[10px] text-indigo-600 uppercase flex items-center gap-2 font-black"><Layers className="w-3 h-3" /> TOTAL {machine}</td>;
               if (upperCol === 'CANTIDAD') return <td key={`p-sub-${idx}-${cIdx}`} className="px-4 py-2 text-left font-mono text-blue-800 text-[11px]">{currentGroupQuantity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>;
               if (col === 'TIEMPOS DE PRODUCCIÓN') return <td key={`p-sub-${idx}-${cIdx}`} className="px-4 py-2 text-left font-mono text-emerald-800 text-[11px]">{currentGroupTime.toFixed(2)} min</td>;
               return <td key={`p-sub-${idx}-${cIdx}`} className="px-4 py-2"></td>;
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
            <TabsTrigger value="explosion" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><ListTree className="w-4 h-4" /> Explosión de Materiales</TabsTrigger>
            <TabsTrigger value="forros-chn-bases" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><Package className="w-4 h-4" /> Forros CHN & Bases</TabsTrigger>
            <TabsTrigger value="diaria" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><CalendarCheck className="w-4 h-4" /> Programación Componentes</TabsTrigger>
            <TabsTrigger value="resumen-diario" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><BarChart3 className="w-4 h-4" /> Resumen de producción diaria</TabsTrigger>
            <TabsTrigger value="pruebas" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><TestTube className="w-4 h-4" /> PRUEBAS</TabsTrigger>
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
              <div className="rounded-md border bg-white overflow-hidden">
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
                              <input type="text" placeholder="Buscar..." value={tiemposFilters[col] || ''} onChange={(e) => handleTiemposFilterChange(col, e.target.value)} className="w-full text-[10px] pl-7 pr-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary outline-none font-normal bg-white" />
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
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Capacidad: Distribución del personal</CardTitle>
              <CardDescription>Define los rangos horarios de las jornadas y el personal asignado por puesto.</CardDescription>
            </CardHeader>
            <CardContent>
              {/* PANEL DE HORARIOS DE PRUEBA */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 items-start">
                <div className="p-4 border rounded-xl bg-white shadow-sm space-y-3 border-indigo-100">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="bg-orange-100 p-1.5 rounded-md"><Clock className="w-4 h-4 text-orange-600" /></div>
                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">JORNADA DIURNA</label>
                  </div>
                  <Select value={jornadaDiurnaSel} onValueChange={setJornadaDiurnaSel}>
                    <SelectTrigger className="h-10 text-sm font-mono font-bold bg-gray-50">
                      <SelectValue placeholder="Seleccione horario" />
                    </SelectTrigger>
                    <SelectContent>
                      {DIURNA_OPTIONS.map(opt => (
                        <SelectItem key={`d-${opt.value}`} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 border rounded-xl bg-white shadow-sm space-y-3 border-indigo-100">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="bg-indigo-100 p-1.5 rounded-md"><Clock className="w-4 h-4 text-indigo-600" /></div>
                    <label className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">JORNADA NOCTURNA</label>
                  </div>
                  <Select value={jornadaNocturnaSel} onValueChange={setJornadaNocturnaSel}>
                    <SelectTrigger className="h-10 text-sm font-mono font-bold bg-gray-50">
                      <SelectValue placeholder="Seleccione horario" />
                    </SelectTrigger>
                    <SelectContent>
                      {NOCTURNA_OPTIONS.map(opt => (
                        <SelectItem key={`n-${opt.value}`} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-5 border rounded-xl bg-indigo-600 shadow-md border-indigo-700 text-white flex flex-col justify-between min-h-[140px]">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/10">
                    <div className="bg-white/20 p-1.5 rounded-md"><Calculator className="w-4 h-4 text-white" /></div>
                    <label className="text-[11px] font-bold text-indigo-100 uppercase tracking-wider">HORAS NETAS POR TURNO (84%)</label>
                  </div>
                  
                  <div className="py-2 space-y-1">
                    <div className="flex justify-between items-center text-[11px] text-indigo-100/70">
                      <span>DIURNA ({parseFloat(jornadaDiurnaSel)}h):</span>
                      <span className="font-mono font-bold">{horasNetasDiurnas.toFixed(3)}h</span>
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-indigo-100/70">
                      <span>NOCTURNA ({parseFloat(jornadaNocturnaSel)}h):</span>
                      <span className="font-mono font-bold">{horasNetasNocturnas.toFixed(3)}h</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/20 flex items-center justify-between">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-tighter text-indigo-200">TOTAL DISPONIBLE:</span>
                      <span className="text-[10px] text-white/50 italic leading-none">(NETO X TURNO)</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-black font-mono tracking-tighter tabular-nums drop-shadow-sm">{totalHorasNetas.toFixed(3)}</span>
                      <span className="text-sm font-bold opacity-60">h</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* TABLA DE CONFIGURACIÓN POR PUESTO */}
              <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50/80">
                      <tr>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">HOJA DE RUTA</th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">PUESTO DE TRABAJO</th>
                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Nº Turnos</th>
                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">Personas / Turno</th>
                        <th className="px-6 py-4 text-right text-xs font-bold text-blue-700 uppercase tracking-wider">Capacidad Neta (h)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-100">
                      {uniqueMachines.map((m) => {
                        const config = workstationConfigs[m] || { machine: m, shifts: 1, people: 1 };
                        const totalNetHours = totalHorasNetas * config.shifts * config.people;
                        
                        // Lookup descriptive name for PUESTO DE TRABAJO with overrides
                        const workstationName = PUESTO_TRABAJO_OVERRIDES[m.toUpperCase()] || tiemposProduccion.find(t => {
                          const values = Object.values(t).map(v => String(v || '').trim().toUpperCase());
                          return values.includes(m.toUpperCase());
                        })?.PuestoTrabajo || '—';

                        return (
                          <tr key={`config-${m}`} className="hover:bg-indigo-50/30 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-800">{m}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{workstationName}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <Select value={config.shifts.toString()} onValueChange={(val) => handleWorkstationConfigChange(m, 'shifts', parseInt(val))}>
                                <SelectTrigger className="w-28 h-9 mx-auto text-xs font-bold shadow-sm">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">1 Turno</SelectItem>
                                  <SelectItem value="2">2 Turnos</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-3">
                                <Input type="number" className="w-16 h-9 text-center text-xs font-bold shadow-sm" value={config.people} min="1" max="10" onChange={(e) => handleWorkstationConfigChange(m, 'people', parseInt(e.target.value) || 1)} />
                                <span className="text-[10px] text-gray-400 font-black tracking-widest">PERS.</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-blue-700 text-lg">
                              {totalNetHours.toFixed(2)} h
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-3">
                <Repeat className="w-5 h-5 text-indigo-600 mt-0.5" />
                <div className="text-[11px] text-indigo-900 leading-relaxed">
                  <p className="font-black uppercase tracking-tight mb-1">Algoritmo de capacidad:</p>
                  <p>Capacidad Neta = <span className="font-bold">(Σ Horas Raw × 84%)</span> × <span className="font-bold">Turnos</span> × <span className="font-bold">Personas</span>.</p>
                  <p className="mt-1 italic opacity-80">El factor de eficiencia del 84% ya está aplicado en el recuadro superior morado y en la tabla de resultados.</p>
                </div>
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
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarCheck className="w-5 h-5 text-primary" /> Programación Componentes (Ecuador): {formattedTodayDisp} (GYE) y {formattedTargetDisp} (Quito)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-auto max-h-[65vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>{dailyColumns.map((col, idx) => (<th key={`daily-head-${col}-${idx}`} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-gray-50 border-b text-gray-600">{col}</th>))}</tr>
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
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{processedDailyOrders.length} componentes ordenados por Hoja de Ruta</span>
                  <Button variant="outline" size="sm" onClick={fetchDailyOrders} disabled={isLoadingDaily} className="h-8 px-4 bg-white"><RefreshCw className={cn("h-3 w-3 mr-2", isLoadingDaily && "animate-spin")} /> Actualizar</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resumen-diario">
          <Card className="shadow-md">
            <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="w-5 h-5 text-primary" /> Carga por Máquina / Puesto Técnico</CardTitle><CardDescription>Consolidado único de unidades y tiempos de carga comparados contra capacidad configurada.</CardDescription></CardHeader>
            <CardContent className="pt-6">
              <div className="rounded-md border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr><th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Máquina / Puesto</th><th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Cant. Órdenes</th><th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Total Unidades</th><th className="px-6 py-3 text-right text-xs font-bold text-emerald-700 uppercase tracking-wider">Tiempo Total (min)</th><th className="px-6 py-3 text-right text-xs font-bold text-indigo-600 uppercase tracking-wider">Tiempo Total (h)</th><th className="px-6 py-3 text-right text-xs font-bold text-blue-700 uppercase tracking-wider">Capacidad Máx (h)</th><th className="px-6 py-3 text-right text-xs font-bold text-blue-700 uppercase tracking-wider">Ocupación (%)</th></tr>
                    </thead>
                    <tbody className="divide-y divide-200 bg-white">
                      {isLoadingDaily ? <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></td></tr> : productionSummary.length > 0 ? productionSummary.map((item, idx) => {
                          const config = workstationConfigs[item.machine] || { machine: item.machine, shifts: 1, people: 1 };
                          const plannedCapacityHours = (totalHorasNetas * config.shifts * config.people);
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

        <TabsContent value="pruebas">
          <div className="space-y-6">
            <Card className="border-indigo-200 shadow-lg">
              <CardHeader className="bg-indigo-50/50 border-b">
                <div className="flex items-center gap-3">
                  <div className="bg-indigo-600 p-2 rounded-lg text-white">
                    <TestTube className="w-5 h-5" />
                  </div>
                  <div>
                    <CardTitle>Validación Técnica: HR-ACH02 y HR-PEF02</CardTitle>
                    <CardDescription>Simulación técnica agrupada por máquina (Carga vs Capacidad).</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
                  <div className="overflow-auto max-h-[60vh]">
                    <table className="min-w-full divide-y divide-gray-200 border-collapse">
                      <thead className="bg-gray-100/80 sticky top-0 z-10 shadow-sm">
                        <tr>
                          {dailyColumns.map((col, idx) => (
                            <th key={`pruebas-head-${col}-${idx}`} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap text-gray-600 border-b">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-100 bg-white">
                        {renderPruebasTableBody()}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                    <h5 className="text-xs font-bold text-blue-900 uppercase flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4" /> Notas de Simulación
                    </h5>
                    <p className="text-[11px] text-blue-800 leading-relaxed">
                      Este par de máquinas tiene una <strong>regla espejo mandatoria</strong>. Cualquier ajuste en la programación de acolchado debe verse reflejado en la confección de tapas.
                    </p>
                  </div>
                  <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-2">
                    <h5 className="text-xs font-bold text-indigo-900 uppercase flex items-center gap-2">
                      <Users className="w-4 h-4" /> Capacidad de Prueba
                    </h5>
                    <p className="text-[11px] text-blue-800 leading-relaxed">
                      La capacidad neta actual configurada es de <strong>{totalHorasNetas.toFixed(3)}h</strong> por turno (eficiencia 84%). Verifica en la pestaña "Resumen" que el tiempo total de carga no exceda el tiempo neto disponible.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};