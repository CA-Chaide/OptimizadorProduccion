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
  Search
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@radix-ui/react-tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

  // Horarios de jornada
  const [horarioDiurno, setHorarioDiurno] = useState("8.75");
  const [horarioNocturno, setHorarioNocturno] = useState("0");

  // Filtros y Paginación para Tiempos
  const [tiemposFilters, setTiemposFilters] = useState<Record<string, string>>({});
  const [tiemposPage, setTiemposPage] = useState(1);
  const [tiemposRowsPerPage, setTiemposRowsPerPage] = useState(20);
  
  // Paginación para Diario
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyRowsPerPage, setDailyRowsPerPage] = useState(20);

  // Fechas de planificación
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
      return name.includes('FORRO');
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
      addNotification('error', 'Error al cargar órdenes diarias.');
    } finally {
      setIsLoadingDaily(false);
    }
  }, [externalFilters, targetDate, todayDate, addNotification, normalizeDateForFilter]);

  useEffect(() => {
    if (isMounted && forrosGruposList.length > 0) {
      fetchTiemposProduccion();
      fetchDailyOrders();
    }
  }, [isMounted, forrosGruposList, fetchTiemposProduccion, fetchDailyOrders]);

  /**
   * Resuelve la máquina con prioridad a identificadores que inicien con "HR"
   */
  const getResolvedMachine = useCallback((order: any) => {
    // 1. Escanear campos de la propia orden
    const orderFields = ['MAQUINA', 'Maquina', 'maquina', 'PUESTOTRABAJO', 'PuestoTrabajo', 'puestotrabajo'];
    for (const k of orderFields) {
      const val = order[k];
      if (val && String(val).trim() !== '' && String(val).toLowerCase() !== 'null') {
        const sVal = String(val).trim().toUpperCase();
        if (sVal.startsWith('HR')) return sVal;
      }
    }
    
    // 2. Escanear maestros técnicos por material
    const material = normalizeMaterialCode(order['MATERIAL'] || order['CodMaterial'] || '');
    if (!material) return '';

    const matches = tiemposProduccion.filter(t => 
      normalizeMaterialCode(t.CodMaterial || t.Material || '') === material
    );

    if (matches.length > 0) {
      // Buscar CUALQUIER valor en el maestro que empiece con HR
      for (const m of matches) {
        const values = Object.values(m).map(v => String(v || '').trim().toUpperCase());
        const hrValue = values.find(v => v.startsWith('HR'));
        if (hrValue) return hrValue;
      }
      
      // Si no hay HR, devolver el primer puesto disponible
      const first = matches.find(m => Number(m.Tiempo || m.Tiempo_Min) > 0) || matches[0];
      return String(first.PuestoTrabajo || first.Maquina || first.nombre_estacion || '').trim().toUpperCase();
    }
    
    // 3. Fallback final al valor original de la orden si existe
    const fallback = order['MAQUINA'] || order['Maquina'] || order['PuestoTrabajo'] || '';
    return String(fallback).trim().toUpperCase() || '';
  }, [tiemposProduccion, normalizeMaterialCode]);

  /**
   * Calcula el tiempo total de producción
   */
  const calculateProductionTime = useCallback((material: string, quantity: number, order: any) => {
    if (!material) return '0';
    const normMaterial = normalizeMaterialCode(material);
    const resolvedMachine = getResolvedMachine(order).trim().toUpperCase();
    
    if (!resolvedMachine) return '0';
    
    // Buscar coincidencia en maestros
    const match = tiemposProduccion.find(t => {
      if (normalizeMaterialCode(t.CodMaterial || t.Material || '') !== normMaterial) return false;
      const values = Object.values(t).map(v => String(v || '').trim().toUpperCase());
      return values.includes(resolvedMachine);
    }) || tiemposProduccion.find(t => normalizeMaterialCode(t.CodMaterial || t.Material || '') === normMaterial && Number(t.Tiempo || t.Tiempo_Min) > 0);

    if (!match) return '0';
    const unitTime = Number(match.Tiempo || match.Tiempo_Min || 0);
    return (unitTime * quantity).toFixed(2);
  }, [tiemposProduccion, normalizeMaterialCode, getResolvedMachine]);

  const renderResolvedProvisionalCell = useCallback((column: string, order: any) => {
    const upperCol = column.toUpperCase().trim();
    if (upperCol === 'MAQUINA') {
      const val = getResolvedMachine(order);
      return val ? (
        <span className="font-semibold text-blue-700">{val}</span>
      ) : '—';
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

  // Columnas y Filtrado de Tiempos
  const tiemposColumns = useMemo(() => {
    if (tiemposProduccion.length === 0) return [];
    const allKeys = Object.keys(tiemposProduccion[0]);
    
    // Nuevo orden solicitado
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

    // Columnas a eliminar
    const toExclude = ['StockActual', 'GrupoCompras'];

    const matchedPriority = priority.filter(k => allKeys.includes(k));
    const otherCols = allKeys.filter(k => !priority.includes(k) && !toExclude.includes(k));
    
    return [...matchedPriority, ...otherCols];
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

  // Diario
  const dailyColumns = useMemo(() => {
    if (dailyOrders.length === 0) return ['ORDENPREVISIONAL', 'MATERIAL', 'TEXTOMATERIAL', 'FECHAINICIO', 'CANTIDAD', 'TIEMPOS DE PRODUCCIÓN', 'MAQUINA', 'FECHAFIN'];
    const allKeys = Object.keys(dailyOrders[0]);
    const priority = ['ORDENPREVISIONAL', 'MATERIAL', 'TEXTOMATERIAL', 'FECHAINICIO', 'CANTIDAD', 'TIEMPOS DE PRODUCCIÓN', 'MAQUINA', 'FECHAFIN'];
    const cols = [...priority];
    allKeys.forEach(k => {
      const uk = k.toUpperCase().trim();
      if (!priority.includes(uk) && uk !== 'CATEGORIA' && uk !== 'MAQUINA' && uk !== 'PUESTOTRABAJO') {
        cols.push(k);
      }
    });
    return cols;
  }, [dailyOrders]);

  const paginatedDailyData = useMemo(() => {
    const start = (dailyPage - 1) * dailyRowsPerPage;
    return dailyOrders.slice(start, start + dailyRowsPerPage);
  }, [dailyOrders, dailyPage, dailyRowsPerPage]);

  const totalDailyPages = Math.max(1, Math.ceil(dailyOrders.length / dailyRowsPerPage));

  const plannedCapacity = useMemo(() => {
    const diurno = parseFloat(horarioDiurno) || 0;
    const nocturno = parseFloat(horarioNocturno) || 0;
    return (diurno + nocturno) * 0.84;
  }, [horarioDiurno, horarioNocturno]);

  const productionSummary = useMemo(() => {
    const summaryMap = new Map<string, { machine: string; quantity: number; count: number; totalTime: number }>();
    
    // Asegurar que todas las máquinas conocidas aparezcan
    const allKnownMachines = [...new Set(tiemposProduccion.map(t => {
      const values = Object.values(t).map(v => String(v || '').trim().toUpperCase());
      return values.find(v => v.startsWith('HR')) || String(t.PuestoTrabajo || '').trim().toUpperCase();
    }))].filter(m => m !== '');

    allKnownMachines.forEach(m => {
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
  }, [dailyOrders, tiemposProduccion, getResolvedMachine, calculateProductionTime]);

  if (!isMounted) return null;

  const formattedToday = todayDate ? formatValueForDisplay('FECHA', todayDate) : '...';
  const formattedTarget = targetDate ? formatValueForDisplay('FECHA', targetDate) : '...';

  const diurnoOptions = [
    { value: "8.75", label: "7:00 - 15:45 (8.75h)" },
    { value: "10", label: "7:00 - 17:00 (10h)" },
    { value: "11", label: "7:00 - 18:00 (11h)" },
  ];

  const nocturnoOptions = [
    { value: "0", label: "Sin turno nocturno" },
    { value: "8.5", label: "21:00 - 5:30 (8.5h)" },
  ];

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
            <TabsTrigger value="ordenes" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><Package className="w-4 h-4" /> Órdenes Previsionales</TabsTrigger>
            <TabsTrigger value="diaria" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><CalendarCheck className="w-4 h-4" /> Programación Diaria</TabsTrigger>
            <TabsTrigger value="resumen-diario" className="flex items-center gap-2 px-6 py-3 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none whitespace-nowrap text-sm font-medium transition-all text-gray-500 hover:text-gray-900"><BarChart3 className="w-4 h-4" /> Resumen de producción diaria</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="grupos">
          <Card>
            <CardHeader><CardTitle>Grupos de Forros</CardTitle></CardHeader>
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
            <CardHeader><CardTitle>Restricciones de Forros</CardTitle></CardHeader>
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
              <div className="flex-1"><CardTitle>Tiempos de Producción (Ecuador Continental)</CardTitle></div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        {tiemposColumns.map(col => (
                          <th key={col} className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase whitespace-nowrap bg-gray-50 border-b">
                            {col}
                          </th>
                        ))}
                      </tr>
                      <tr className="bg-gray-50/50">
                        {tiemposColumns.map(col => (
                          <th key={`filter-t-${col}`} className="px-2 py-2 bg-gray-50 border-b border-gray-200">
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
                          <td colSpan={tiemposColumns.length || 1} className="py-24 text-center">
                            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
                          </td>
                        </tr>
                      ) : paginatedTiemposData.length > 0 ? paginatedTiemposData.map((t, idx) => (
                        <tr key={`tiempo-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                          {tiemposColumns.map(col => (
                            <td key={`cell-${idx}-${col}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] text-gray-600 font-mono">
                              {formatValueForDisplay(col, t[col])}
                            </td>
                          ))}
                        </tr>
                      )) : (
                        <tr>
                          <td colSpan={tiemposColumns.length || 1} className="py-20 text-center text-gray-400 italic bg-gray-50/50">
                            {tiemposProduccion.length === 0 ? 'No hay datos disponibles.' : 'No se encontraron resultados para los filtros.'}
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

        <TabsContent value="ordenes">
          <Card>
            <CardHeader><CardTitle>Órdenes Previsionales Filtradas (Ecuador Continental)</CardTitle></CardHeader>
            <CardContent>
              <ProvisionalOrdersTabSection 
                externalFilters={externalFilters} 
                renderCell={renderResolvedProvisionalCell}
                groupBy="MAQUINA"
                resolveValue={resolveLogicValue}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diaria">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><CalendarCheck className="w-5 h-5 text-primary" /> Programación Diaria (Ecuador): {formattedToday} y {formattedTarget}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-md border bg-white overflow-hidden">
                <div className="overflow-auto max-h-[60vh]">
                  <table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        {dailyColumns.map((col) => (
                          <th 
                            key={col} 
                            className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-gray-50 border-b text-gray-600"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {isLoadingDaily ? (<tr><td colSpan={dailyColumns.length || 1} className="py-24 text-center"><Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" /></td></tr>) : dailyOrders.length > 0 ? paginatedDailyData.map((order, idx) => (
                        <tr key={`daily-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                          {dailyColumns.map((col) => {
                            const upperCol = col.toUpperCase().trim();
                            
                            return (
                              <td 
                                key={`cell-${idx}-${col}`} 
                                className="px-4 py-2.5 whitespace-nowrap text-[11px] font-mono text-gray-600"
                              >
                                {col === 'TIEMPOS DE PRODUCCIÓN' ? (
                                  <span className="font-bold text-emerald-700">
                                    {calculateProductionTime(order['MATERIAL'] || order['CodMaterial'] || '', Number(order['CANTIDAD'] || 0), order)} min
                                  </span>
                                ) : upperCol === 'MAQUINA' ? (
                                  <span className="font-semibold text-blue-700">
                                    {getResolvedMachine(order) || '—'}
                                  </span>
                                ) : (
                                  formatValueForDisplay(col, order[col])
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      )) : (<tr><td colSpan={dailyColumns.length || 1} className="py-20 text-center text-gray-400 italic bg-gray-50/50">No hay órdenes para hoy o la fecha objetivo seleccionada.</td></tr>)}
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
                <Button variant="outline" size="sm" onClick={fetchDailyOrders} disabled={isLoadingDaily} className="h-8 px-4 bg-white"><RefreshCw className={cn("h-3 w-3 mr-2", isLoadingDaily && "animate-spin")} /> Actualizar</Button>
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
                  Capacidad de Forros
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                <div className="space-y-6">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Capacidad Total Planificada</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-extrabold text-indigo-700">
                        {plannedCapacity.toFixed(2)}
                      </p>
                      <span className="text-sm font-medium text-gray-400 italic">horas / día</span>
                    </div>
                  </div>
                  
                  <div className="space-y-4 pt-4 border-t border-gray-100">
                    <div>
                      <label className="text-[10px] font-bold text-gray-700 uppercase mb-1.5 block">Horario diurno</label>
                      <Select value={horarioDiurno} onValueChange={setHorarioDiurno}>
                        <SelectTrigger className="w-full h-9 text-xs">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {diurnoOptions.map(opt => (
                            <SelectItem key={`d-${opt.value}`} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-gray-700 uppercase mb-1.5 block">Horario nocturno</label>
                      <Select value={horarioNocturno} onValueChange={setHorarioNocturno}>
                        <SelectTrigger className="w-full h-9 text-xs">
                          <SelectValue placeholder="Seleccionar" />
                        </SelectTrigger>
                        <SelectContent>
                          {nocturnoOptions.map(opt => (
                            <SelectItem key={`n-${opt.value}`} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-[10px] leading-relaxed text-amber-800 italic">
                      * Las horas se calculan sumando las jornadas y restando el 16% de factor de eficiencia operativa.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="lg:col-span-3 shadow-md">
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Resumen de Carga de Producción (Detalle por Máquina)
                </CardTitle>
                <CardDescription>
                  Consolidado único de unidades y tiempos de carga por puesto de trabajo técnico.
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
                          <th className="px-6 py-3 text-right text-xs font-bold text-blue-700 uppercase tracking-wider">Capacidad (%)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {isLoadingDaily ? (
                          <tr>
                            <td colSpan={5} className="py-12 text-center">
                              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                            </td>
                          </tr>
                        ) : productionSummary.length > 0 ? (
                          productionSummary.map((item, idx) => {
                            const capacityInMinutes = plannedCapacity * 60;
                            const utilizationPercent = capacityInMinutes > 0 ? (item.totalTime / capacityInMinutes) * 100 : 0;
                            
                            return (
                              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700">{item.machine}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">{item.count}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-blue-700 font-mono">{item.quantity.toLocaleString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-emerald-700 font-mono">{item.totalTime.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
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
                            <td colSpan={5} className="py-12 text-center text-gray-400 italic">
                              No hay datos en la programación diaria para resumir.
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {productionSummary.length > 0 && (
                        <tfoot className="bg-gray-50 font-bold border-t-2">
                          <tr>
                            <td className="px-6 py-3 text-right text-xs text-gray-600 uppercase">Totales Generales:</td>
                            <td className="px-6 py-3 text-right font-mono text-sm">
                              {productionSummary.reduce((acc, curr) => acc + curr.count, 0)}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-sm text-blue-800">
                              {productionSummary.reduce((acc, curr) => acc + curr.quantity, 0).toLocaleString()}
                            </td>
                            <td className="px-6 py-3 text-right font-mono text-sm text-emerald-800">
                              {productionSummary.reduce((acc, curr) => acc + curr.totalTime, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </td>
                            <td className="px-6 py-3 text-right">
                              {(() => {
                                const totalTimeAll = productionSummary.reduce((acc, curr) => acc + curr.totalTime, 0);
                                const totalCapacityAll = plannedCapacity * 60 * productionSummary.length;
                                const avgUtilization = totalCapacityAll > 0 ? (totalTimeAll / totalCapacityAll) * 100 : 0;
                                return (
                                  <span className="text-xs text-gray-500 italic">
                                    Promedio: {avgUtilization.toFixed(1)}%
                                  </span>
                                );
                              })()}
                            </td>
                          </tr>
                        </tfoot>
                      )}
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