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
  AlertCircle,
  Layers,
  UserPlus,
  Repeat
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

  // Estados para PERSONAL & TURNOS
  const [workstationConfigs, setWorkstationConfigs] = useState<Record<string, WorkstationConfig>>({});

  // Estados para Explosión de Materiales
  const [explosionData, setExplosionData] = useState<any[]>([]);
  const [isLoadingExplosion, setIsLoadingExplosion] = useState(false);
  const [explosionPage, setExplosionPage] = useState(1);
  const [explosionTotal, setExplosionTotal] = useState(0);
  const [explosionRowsPerPage] = useState(20);
  const [centroExplosion, setCentroExplosion] = useState('1000');
  const [fertExplosion, setFertExplosion] = useState('');

  // Horarios de jornada (Generales)
  const [horarioDiurno, setHorarioDiurno] = useState("8.75");
  const [horarioNocturno, setHorarioNocturno] = useState("0");

  // Filtros y Paginación para Tiempos
  const [tiemposFilters, setTiemposFilters] = useState<Record<string, string>>({});
  const [tiemposPage, setTiemposPage] = useState(1);
  const [tiemposRowsPerPage, setTiemposRowsPerPage] = useState(20);
  
  // Paginación para Diario
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyRowsPerPage, setDailyRowsPerPage] = useState(20);

  // Fechas de planificación (Internas para Filtro)
  const [todayDate, setTodayDate] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>('');

  /**
   * Normaliza códigos de material eliminando todos los ceros a la izquierda
   */
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
      if (parts) return `${parts.d}/${parts.m}/${parts.y}`;
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

  // Carga inicial de grupos y restricciones
  const fetchData = useCallback(async () => {
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
    fetchData();
  }, [fetchData]);

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

  const forrosChnBasesFilters = useMemo(() => {
    return {
      ...externalFilters,
      MAQUINA: ['HR-FBASE', 'HR-FORRO']
    };
  }, [externalFilters]);

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

  // Inicializar configuraciones de puestos al cargar tiempos con ordenamiento ESPEJO solicitado
  const uniqueMachines = useMemo(() => {
    const machinesSet = new Set<string>();
    tiemposProduccion.forEach(t => {
      const values = Object.values(t).map(v => String(v || '').trim().toUpperCase());
      const hr = values.find(v => v.startsWith('HR'));
      if (hr) machinesSet.add(hr);
    });
    
    const machinesArray = Array.from(machinesSet);

    // Ordenamiento Espejo: Por sufijo numérico (ACH02, PEF02, ACH06, PEF06, etc.)
    return machinesArray.sort((a, b) => {
      const getParts = (name: string) => {
        const match = name.match(/^HR-(ACH|PEF)(\d+)$/);
        if (match) return { type: match[1], suffix: match[2], isMain: true };
        return { type: name, suffix: '', isMain: false };
      };

      const partA = getParts(a);
      const partB = getParts(b);

      // Si ambos son del grupo principal (ACH/PEF)
      if (partA.isMain && partB.isMain) {
        // Ordenar por sufijo numérico primero (02, 06, etc)
        if (partA.suffix !== partB.suffix) {
          return partA.suffix.localeCompare(partB.suffix, undefined, { numeric: true });
        }
        // Si tienen el mismo sufijo, ACH va antes que PEF
        return partA.type.localeCompare(partB.type); 
      }

      // El grupo ACH/PEF siempre va primero que otros puestos
      if (partA.isMain && !partB.isMain) return -1;
      if (!partA.isMain && partB.isMain) return 1;

      // Resto de máquinas en orden alfabético
      return a.localeCompare(b);
    });
  }, [tiemposProduccion]);

  useEffect(() => {
    if (uniqueMachines.length > 0 && Object.keys(workstationConfigs).length === 0) {
      const initial: Record<string, WorkstationConfig> = {};
      uniqueMachines.forEach(m => {
        initial[m] = { machine: m, shifts: 1, people: 1 };
      });
      setWorkstationConfigs(initial);
    }
  }, [uniqueMachines, workstationConfigs]);

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

  const tiemposColumns = useMemo(() => {
    const priority = [
      'CodMaterial', 
      'HojaRuta', 
      'VersionFabricacion_Manual', 
      'CONTADORHOJARUTA', 
      'Tiempo_Min', 
      'Linea', 
      'PuestoTrabajo', 
      'PuestoTrabajoLinea', 
      'centro', 
      'RespCtrlProd', 
      'NombRespControlProd', 
      'TamLoteMin', 
      'TamLoteMax', 
      'StockSeguridad', 
      'StockMaximo', 
      'ClaseAprovisionam'
    ];

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

  const totalTiemposPages = Math.max(1, Math.ceil(filteredTiempos.length / tiemposRowsPerPage));

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

  const paginatedDailyData = useMemo(() => {
    const start = (dailyPage - 1) * dailyRowsPerPage;
    return processedDailyOrders.slice(start, start + dailyRowsPerPage);
  }, [processedDailyOrders, dailyPage, dailyRowsPerPage]);

  const totalDailyPages = Math.max(1, Math.ceil(processedDailyOrders.length / dailyRowsPerPage));

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
    
    uniqueMachines.forEach(m => {
      summaryMap.set(m, { machine: m, quantity: 0, count: 0, totalTime: 0 });
    });

    dailyOrders.forEach(order => {
      const machine = getResolvedMachine(order) || 'SIN MÁQUINA';
      const quantity = Number(order['CANTIDAD'] || 0);
      const timeVal = parseFloat(calculateProductionTime(order['MATERIAL'], quantity, order)) || 0;
      
      if (!summaryMap.has(machine)) {
        summaryMap.set(machine, { machine, quantity: 0, count: 0, totalTime: 0 });
      }
      
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

    const totalToday = filteredForTab
      .filter(order => normalizeDateForFilter(order['FECHAINICIO']) === todayDate)
      .reduce((sum, order) => sum + Number(order['CANTIDAD'] || 0), 0);

    const totalTarget = filteredForTab
      .filter(order => normalizeDateForFilter(order['FECHAINICIO']) === targetDate)
      .reduce((sum, order) => sum + Number(order['CANTIDAD'] || 0), 0);

    return { totalToday, totalTarget };
  }, [dailyOrders, getResolvedMachine, normalizeDateForFilter, todayDate, targetDate]);

  // Visual Dates (+1 Day)
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
    if (isLoadingDaily) {
      return (
        <tr>
          <td colSpan={dailyColumns.length} className="py-24 text-center">
            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          </td>
        </tr>
      );
    }

    if (processedDailyOrders.length === 0) {
      return (
        <tr>
          <td colSpan={dailyColumns.length} className="py-20 text-center text-gray-400 italic bg-gray-50/50">
            No hay órdenes para hoy o la fecha objetivo seleccionada.
          </td>
        </tr>
      );
    }

    const rows: React.ReactNode[] = [];
    let currentGroupQuantity = 0;
    let currentGroupTime = 0;

    paginatedDailyData.forEach((order, idx) => {
      const machine = getResolvedMachine(order) || 'SIN MÁQUINA';
      const quantity = Number(order['CANTIDAD'] || 0);
      const timeStr = calculateProductionTime(order['MATERIAL'] || order['CodMaterial'] || '', quantity, order);
      const timeVal = parseFloat(timeStr) || 0;

      currentGroupQuantity += quantity;
      currentGroupTime += timeVal;

      rows.push(
        <tr key={`daily-${idx}`} className="hover:bg-blue-50/40 transition-colors">
          {dailyColumns.map((col, cIdx) => {
            const upperCol = col.toUpperCase().trim();
            if (col === 'TIEMPOS DE PRODUCCIÓN') {
               return (
                 <td key={`daily-cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600">
                   <span className="font-bold text-emerald-700">{timeVal.toFixed(2)} min</span>
                 </td>
               );
            }
            if (upperCol === 'MAQUINA') {
              return (
                <td key={`daily-cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600">
                  <span className="font-semibold text-blue-700">{machine}</span>
                </td>
              );
            }
            return (
              <td key={`daily-cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600">
                {formatValueForDisplay(col, order[col])}
              </td>
            );
          })}
        </tr>
      );

      const nextOrder = paginatedDailyData[idx + 1];
      const nextMachine = nextOrder ? (getResolvedMachine(nextOrder) || 'SIN MÁQUINA') : null;

      if (machine !== nextMachine) {
        rows.push(
          <tr key={`subtotal-${machine}-${idx}`} className="bg-gray-100/80 font-bold border-t-2 border-gray-200">
            {dailyColumns.map((col, cIdx) => {
               const upperCol = col.toUpperCase().trim();
               if (cIdx === 0) {
                 return (
                   <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2 text-[10px] text-gray-500 uppercase flex items-center gap-2">
                     <Layers className="w-3 h-3" /> SUBTOTAL {machine}
                   </td>
                 );
               }
               if (upperCol === 'CANTIDAD') {
                 return <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2 text-left font-mono text-blue-800 text-[11px]">{currentGroupQuantity.toLocaleString()}</td>;
               }
               if (col === 'TIEMPOS DE PRODUCCIÓN') {
                 return <td key={`sub-${idx}-${cIdx}`} className="px-4 py-2 text-left font-mono text-emerald-800 text-[11px]">{currentGroupTime.toFixed(2)} min</td>;
               }
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

  if (!isMounted) return null;

  const formattedTodayDisp = displayTodayDate ? formatValueForDisplay('FECHA', displayTodayDate) : '...';
  const formattedTargetDisp = displayTargetDate ? formatValueForDisplay('FECHA', displayTargetDate) : '...';

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
            <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex-1"><CardTitle>Tiempos de Producción (Maestros Técnicos)</CardTitle></div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        {tiemposColumns.map((col, idx) => (
                          <th key={`head-${col}-${idx}`} className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap bg-gray-50 border-b">
                            {col}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-gray-50/50">
                        {tiemposColumns.map((col, idx) => (
                          <th key={`filter-t-${col}-${idx}`} className="px-2 py-2 bg-gray-50 border-b border-gray-200">
                            <div className="relative">
                              <Search className="absolute left-2 top-1.5 h-3 w-3 text-gray-400" />
                              <input
                                type="text"
                                placeholder="Buscar..."
                                value={tiemposFilters[col] || ''}
                                onChange={(e) => handleTiemposFilterChange(col, e.target.value)}
                                className="w-full text-[10px] pl-7 pr-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary outline-none font-normal bg-white"
                              />
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {isLoadingTiempos && tiemposProduccion.length === 0 ? (
                        <tr>
                          <td colSpan={tiemposColumns.length} className="py-24 text-center">
                            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                          </td>
                        </tr>
                      ) : paginatedTiemposData.length > 0 ? paginatedTiemposData.map((t, idx) => (
                        <tr key={`tiempo-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                          {tiemposColumns.map((col, cIdx) => (
                            <td key={`cell-${idx}-${col}-${cIdx}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] text-gray-600 font-mono">
                              {formatValueForDisplay(col, t[col])}
                            </td>
                          ))}
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={tiemposColumns.length} className="py-20 text-center text-gray-400 italic bg-gray-50/50">
                            No se encontraron resultados.
                          </td>
                        </tr>
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
              <CardDescription>Define la cantidad de turnos y personal asignado por puesto de trabajo para el cálculo de capacidad real.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase">Hoja de Ruta / Puesto</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase">Nº Turnos</th>
                        <th className="px-6 py-3 text-center text-xs font-bold text-gray-600 uppercase">Personas / Turno</th>
                        <th className="px-6 py-3 text-right text-xs font-bold text-blue-700 uppercase">Capacidad Neta (h)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {uniqueMachines.map((m) => {
                        const config = workstationConfigs[m] || { machine: m, shifts: 1, people: 1 };
                        const baseHours = 8.625;
                        const totalNetHours = (baseHours * config.shifts * config.people * 0.84);

                        return (
                          <tr key={`config-${m}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap font-semibold text-gray-700">{m}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <span className="sr-only">Seleccionar Turnos</span>
                              <Select 
                                value={config.shifts.toString()} 
                                onValueChange={(val) => handleWorkstationConfigChange(m, 'shifts', parseInt(val))}
                              >
                                <SelectTrigger className="w-24 h-8 mx-auto text-xs font-bold">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">1 Turno</SelectItem>
                                  <SelectItem value="2">2 Turnos</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center">
                              <div className="flex items-center justify-center gap-2">
                                <Input 
                                  type="number" 
                                  className="w-16 h-8 text-center text-xs font-bold" 
                                  value={config.people}
                                  min="1"
                                  max="10"
                                  onChange={(e) => handleWorkstationConfigChange(m, 'people', parseInt(e.target.value) || 1)}
                                />
                                <span className="text-[10px] text-gray-400 font-bold">PERS.</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right font-mono font-bold text-blue-700">
                              {totalNetHours.toFixed(2)} h
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-6 p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
                <Repeat className="w-5 h-5 text-blue-600 mt-0.5" />
                <div className="text-xs text-blue-800 space-y-1">
                  <p className="font-bold uppercase tracking-tight">Nota sobre el cálculo de capacidad:</p>
                  <p>La capacidad neta se calcula multiplicando las horas de jornada base por el número de turnos y personas, aplicando un factor de eficiencia operativa del 84%.</p>
                  <p className="font-semibold italic">Ejemplo: 2 Turnos con 1 Persona = 14.49 horas efectivas por día.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="explosion">
          <Card>
            <CardHeader>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <CardTitle>Explosión de Materiales (BOM)</CardTitle>
                  <CardDescription>Consulta de componentes por material (FERT).</CardDescription>
                </div>
                <div className="flex flex-wrap items-end gap-3 p-3 bg-gray-50 rounded-lg border">
                  <div className="w-24">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Centro</label>
                    <Select value={centroExplosion} onValueChange={setCentroExplosion}>
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1000">1000</SelectItem>
                        <SelectItem value="2000">2000</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-48">
                    <label className="text-[10px] font-bold text-gray-700 uppercase block mb-1.5">FERT Principal (Cód)</label>
                    <Input 
                      className="h-9 text-xs" 
                      placeholder="Ej: 10001433" 
                      value={fertExplosion}
                      onChange={(e) => setFertExplosion(e.target.value)}
                    />
                  </div>
                  <Button size="sm" onClick={() => fetchExplosionData(1)} disabled={isLoadingExplosion}>
                    {isLoadingExplosion ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <Search className="h-3 w-3 mr-2" />}
                    Consultar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-auto max-h-[55vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr className="bg-gray-50 border-b">
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Centro</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">FERT Principal</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Desc. FERT</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Componente</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Desc. Componente</th>
                        <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase">Tipo</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-600 uppercase">Cant. Unitaria</th>
                        <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-600 uppercase">Cant. Acumulada</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {isLoadingExplosion ? (
                        <tr>
                          <td colSpan={8} className="py-24 text-center">
                            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                          </td>
                        </tr>
                      ) : explosionData.length > 0 ? (
                        explosionData.map((row, idx) => (
                          <tr key={`bom-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                            <td className="px-4 py-2 text-[11px] font-mono">{row.CENTRO}</td>
                            <td className="px-4 py-2 text-[11px] font-bold">{row.FERT_PRINCIPAL}</td>
                            <td className="px-4 py-2 text-[11px] text-gray-600 max-w-40 truncate" title={row.DESCRIPCION_FERT}>{row.DESCRIPCION_FERT}</td>
                            <td className="px-4 py-2 text-[11px] font-bold text-blue-700">{row.COMPONENTE}</td>
                            <td className="px-4 py-2 text-[11px] text-gray-600 max-w-48 truncate" title={row.DESCRIPCION_COMPONENTE}>{row.DESCRIPCION_COMPONENTE}</td>
                            <td className="px-4 py-2 text-[11px] text-gray-400">{row.TipoMaterial}</td>
                            <td className="px-4 py-2 text-[11px] text-right font-mono font-bold text-indigo-700">{formatValueForDisplay('CANTIDAD', row.TOTAL_CANTIDAD_UNITARIA)}</td>
                            <td className="px-4 py-2 text-[11px] text-right font-mono text-indigo-400">{formatValueForDisplay('CANTIDAD', row.TOTAL_CANTIDAD_ACUMULADA)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={8} className="py-20 text-center text-gray-400 italic bg-gray-50/50">
                            Ingresa filtros y presiona consultar para ver la explosión de materiales.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm mt-4">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fetchExplosionData(1)} disabled={explosionPage === 1 || isLoadingExplosion}><ChevronsLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fetchExplosionData(explosionPage - 1)} disabled={explosionPage === 1 || isLoadingExplosion}><ChevronLeft className="h-4 w-4" /></Button>
                  <span className="px-3 text-[11px] font-bold min-w-[120px] text-center border-x py-1 bg-white rounded">
                    Página {explosionPage} de {Math.max(1, Math.ceil(explosionTotal / explosionRowsPerPage))}
                  </span>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fetchExplosionData(explosionPage + 1)} disabled={explosionPage >= Math.ceil(explosionTotal / explosionRowsPerPage) || isLoadingExplosion}><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => fetchExplosionData(Math.ceil(explosionTotal / explosionRowsPerPage))} disabled={explosionPage >= Math.ceil(explosionTotal / explosionRowsPerPage) || isLoadingExplosion}><ChevronsRight className="h-4 w-4" /></Button>
                </div>
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
                      <div className="flex items-center gap-2 text-orange-600">
                        <MapPin className="w-4 h-4" />
                        <p className="text-sm font-bold uppercase tracking-wider">Producción GYE (Fecha Cercana)</p>
                      </div>
                      <p className="text-md font-semibold text-gray-700">{formattedTodayDisp}</p>
                    </div>
                    <div className="bg-orange-50 p-3 rounded-full">
                      <CalendarIconLucide className="w-6 h-6 text-orange-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <p className="text-3xl font-extrabold text-orange-700 font-mono">
                      {chnBasesDateTotals.totalToday.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Unidades</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-l-4 border-l-blue-600 shadow-md">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-blue-600">
                        <MapPin className="w-4 h-4" />
                        <p className="text-sm font-bold uppercase tracking-wider">Producción Quito (Segunda Fecha)</p>
                      </div>
                      <p className="text-md font-semibold text-gray-700">{formattedTargetDisp}</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-full">
                      <CalendarIconLucide className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <p className="text-3xl font-extrabold text-blue-800 font-mono">
                      {chnBasesDateTotals.totalTarget.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-gray-400 uppercase font-semibold">Unidades</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Forros CHN & Bases</CardTitle></CardHeader>
              <CardContent>
                <ProvisionalOrdersTabSection 
                  externalFilters={forrosChnBasesFilters} 
                  renderCell={renderResolvedProvisionalCell}
                  groupBy="MAQUINA"
                  resolveValue={resolveLogicValue}
                />
              </CardContent>
            </Card>
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
                      <tr>
                        {dailyColumns.map((col, idx) => (
                          <th 
                            key={`daily-head-${col}-${idx}`} 
                            className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-gray-50 border-b text-gray-600"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {renderDailyTableBody()}
                    </tbody>
                  </table>
                </div>
              </div>
              
              <div className="flex items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200">
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
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <Card className="lg:col-span-1 border-indigo-100 shadow-md">
              <CardHeader className="bg-indigo-50/50 border-b border-indigo-100">
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-indigo-900 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Configuración Global
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-6">
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-[10px] leading-relaxed text-amber-800 italic">
                      * Nota: Use la pestaña "Distribución del personal" para configurar la capacidad específica de cada máquina.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3 shadow-md">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Carga por Máquina / Puesto Técnico
                </CardTitle>
                <CardDescription>
                  Consolidado único de unidades y tiempos de carga comparados contra capacidad configurada.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="rounded-md border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Máquina / Puesto</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Cant. Órdenes</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Total Unidades</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-emerald-700 uppercase tracking-wider">Tiempo Total (min)</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-indigo-600 uppercase tracking-wider">Tiempo Total (h)</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-blue-700 uppercase tracking-wider">Capacidad Máx (h)</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-blue-700 uppercase tracking-wider">Ocupación (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {isLoadingDaily ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center">
                              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                            </td>
                          </tr>
                        ) : productionSummary.length > 0 ? (
                          productionSummary.map((item, idx) => {
                            const config = workstationConfigs[item.machine] || { shifts: 1, people: 1 };
                            const baseHours = 8.625;
                            const plannedCapacityHours = (baseHours * config.shifts * config.people * 0.84);
                            const totalTimeHours = item.totalTime / 60;
                            const utilizationPercent = plannedCapacityHours > 0 ? (totalTimeHours / plannedCapacityHours) * 100 : 0;
                            
                            return (
                              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700">{item.machine}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">{item.count}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-700 font-mono">{item.quantity.toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-emerald-700 font-mono">
                                  {item.totalTime.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-indigo-600 font-mono">
                                  {totalTimeHours.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-gray-400">
                                  {plannedCapacityHours.toFixed(2)} h
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                                  <Badge 
                                    className={cn(
                                      "font-mono font-bold",
                                      utilizationPercent > 100 ? "bg-red-100 text-red-700 hover:bg-red-200" : 
                                      utilizationPercent > 80 ? "bg-amber-100 text-amber-700 hover:bg-amber-200" :
                                      "bg-green-100 text-green-700 hover:bg-green-200"
                                    )}
                                  >
                                    {utilizationPercent.toFixed(1)}%
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-gray-400 italic">
                              No hay datos para resumir.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
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
