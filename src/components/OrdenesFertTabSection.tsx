'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Package, Check, ChevronsUpDown, Loader2, BellRing, AlertTriangle } from 'lucide-react';
import type { OrdenFert, ProvisionalOrder, Restriccion } from '@/types/interfaces';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const normalizeMaterialCode = (code: string | number): string => {
  const codeStr = String(code).trim();
  return codeStr.slice(-8);
};

// Mapeo oficial de Mesas de Trabajo proporcionado por el usuario
const MESA_MAPPING = [
  { name: "MESA DE ARMADO 1", code: "TAP-AR01" },
  { name: "MESA DE ARMADO 2", code: "TAP-AR02" },
  { name: "MESA DE ARMADO 3", code: "TAP-AR03" },
  { name: "MESA DE ARMADO 4", code: "TAP-AR04" },
  { name: "MESA DE ARMADO 5", code: "TAP-AR05" },
  { name: "MESA DE ARMADO 6", code: "TAP-AR06" },
  { name: "MESA DE ARMADO 7", code: "TAP-AR07" },
  { name: "MESA DE ARMADO 8", code: "TAP-AR08" },
  { name: "MESA DE ARMADO 9", code: "TAP-AR09" },
  { name: "MESA DE ARMADO 10", code: "TAP-AR10" },
  { name: "MESA DE ARMADO 11", code: "TAP-AR11" },
  { name: "MESA DE ARMADO 12", code: "TAP-AR12" },
  { name: "MESA DE ARMADO 13", code: "TAP-AR13" },
  { name: "MESA DE ARMADO 14", code: "TAP-AR14" },
];

interface OrdenesFertTabSectionProps {
  restricciones: Restriccion[];
  columns?: string[];
  hideControls?: boolean;
  tiemposData?: any[];
  displayMode?: 'full' | 'plan';
}

interface PaginationState {
  currentPage: number;
  totalRegistros: number;
  pageSize: number;
  isExploring: boolean;
  rowsPerPage: number;
}

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

// MultiSelect component
const MultiSelect: React.FC<{
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}> = ({ options, selected, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const isAllSelected = options.length > 0 && selected.length === options.length;

  return (
    <div className="flex flex-col items-start w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 text-sm font-normal"
          >
            <span className="truncate">
              {selected.length === 0
                ? placeholder || 'Seleccionar...'
                : isAllSelected
                ? 'Todas las fechas'
                : `${selected.length} seleccionada(s)`}
            </span>
            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0">
          <Command>
            <CommandInput placeholder="Buscar fecha..." className="h-9" />
            <CommandEmpty>No se encontraron fechas.</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
              <CommandItem
                onSelect={() => {
                  if (isAllSelected) {
                    onChange([]);
                  } else {
                    onChange(options.map(o => o.value));
                  }
                }}
                className="font-bold border-b mb-1"
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    isAllSelected ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {isAllSelected ? "Desmarcar Todas" : "Seleccionar Todas"}
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    handleSelect(option.value);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected.includes(option.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="text-xs">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && !isAllSelected && (
          <div className="pt-1 text-left w-full min-h-[22px]">
            {selected.slice(0, 3).map(value => (
              <Badge key={value} variant="secondary" className="mr-1 mb-1 max-w-[100px] truncate" title={value}>
                {value}
              </Badge>
            ))}
            {selected.length > 3 && <Badge variant="secondary">+{selected.length - 3}</Badge>}
          </div>
      )}
      {isAllSelected && (
        <div className="pt-1 text-left w-full min-h-[22px]">
           <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200">
             Mostrando todo el horizonte
           </Badge>
        </div>
      )}
    </div>
  );
};

export const OrdenesFertTabSection: React.FC<OrdenesFertTabSectionProps> = ({ restricciones, columns, hideControls = false, tiemposData = [], displayMode = 'full' }) => {
  const { addNotification } = useAppContext();
  const [isMounted, setIsMounted] = useState(false);
  const [orders, setOrders] = useState<OrdenFert[]>([]);
  const [provisionalOrders, setProvisionalOrders] = useState<ProvisionalOrder[]>([]);
  const [tapiceros, setTapiceros] = useState<any[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalRegistros: 0,
    pageSize: 10000,
    isExploring: true,
    rowsPerPage: 100,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [hasSetDefaultDate, setHasSetDefaultDate] = useState(false);
  const [workSchedule, setWorkSchedule] = useState<string>("9");
  const [workTables, setWorkTables] = useState<string>("14");

  // Hydration Guard
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const lastScrolledRef = useRef<'top' | 'table' | null>(null);

  // TIEMPO DISPONIBLE DIARIO TOTAL (Suma de todas las mesas seleccionadas)
  const TIEMPO_DISPONIBLE_DIARIO_TOTAL = useMemo(() => {
    const hours = parseInt(workSchedule);
    const tables = parseInt(workTables);
    return hours * tables * 0.87;
  }, [workSchedule, workTables]);

  // TIEMPO DISPONIBLE POR MESA INDIVIDUAL
  const TIEMPO_DISPONIBLE_POR_MESA = useMemo(() => {
    const hours = parseInt(workSchedule);
    return hours * 0.87;
  }, [workSchedule]);

  const tiemposMap = useMemo(() => {
    if (!tiemposData || tiemposData.length === 0) {
        return new Map<string, number>();
    }
    const map = new Map<string, number>();
    tiemposData.forEach(item => {
        const materialCode = normalizeMaterialCode(item.CodMaterial ?? item.MATERIAL ?? item.Material ?? '');
        const tiempo = item.Tiempo_Min ?? item.Tiempo ?? 0;
        if (materialCode && tiempo > 0) {
            if (!map.has(materialCode)) {
                map.set(map.has(materialCode) ? `${materialCode}_dup` : materialCode, tiempo);
            }
        }
    });
    return map;
  }, [tiemposData]);

  const COLUMNS_TO_DISPLAY = columns || [
    'FECHA', 'PEDIDO', 'POSICION', 'ORDEN', 'MATERIAL', 'NOMBRE', 'CANTPROGRAMADA', 'CANTPENDIENTE', 'CENTRO', 
    'MAQUINA', 'PUESTOTRABAJO', 'SECTORDESC', 'CATEGORIA', 'RESPCTRLPROD'
  ];

  // Cargar Habilidades (Tapiceros)
  useEffect(() => {
    if (!isMounted) return;

    const fetchTapiceros = async () => {
      try {
        const res = await serviciosService.getCuboHabilidadesOP();
        if (res && res.data) {
          const dataArray = Array.isArray(res.data) ? res.data : [res.data];
          const filtered = dataArray.filter((s: any) => {
            const role = String(s.ROL || '').trim().toUpperCase();
            const location = String(s.LOCALIDAD || s.CENTRO || s.Centro || '').trim();
            return role.includes("TAPICERO") && (location.includes("QUITO") || location.includes("1000"));
          });
          const sorted = filtered.sort((a: any, b: any) => (Number(b.CALIFICACION) || 0) - (Number(a.CALIFICACION) || 0));
          setTapiceros(sorted);
        }
      } catch (e) {
        console.error("Error cargando tapiceros para el PLAN", e);
      }
    };
    fetchTapiceros();
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        // 1. Fetch FERT Orders
        const exploreResponse = await serviciosService.getOrdenesFert(1, 1);
        const totalFert = exploreResponse.totalRegistros || (exploreResponse.data?.length > 0 ? 1 : 0);

        let allFert: OrdenFert[] = [];
        if (totalFert > 0) {
          const BATCH_SIZE = 10000;
          const pages = Math.ceil(totalFert / BATCH_SIZE);
          for (let i = 1; i <= pages; i++) {
            const res = await serviciosService.getOrdenesFert(i, BATCH_SIZE);
            if (res.data) allFert = allFert.concat(res.data);
          }
        }
        setOrders(allFert);

        // 2. Fetch Provisional Orders
        const provResponse = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
        if (provResponse.data) {
          setProvisionalOrders(Array.isArray(provResponse.data) ? provResponse.data : [provResponse.data]);
        }

      } catch (err) {
        const errorMessage = (err as Error).message;
        setError(errorMessage);
        addNotification('error', `Error al cargar datos: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    if (restricciones) {
      fetchData();
    }
  }, [addNotification, restricciones, isMounted]);

  // COMBINAR ÓRDENES FERT Y PREVISIONALES
  const baseFilteredOrders = useMemo(() => {
    const validResp = ['019', '006'];
    
    // Normalizar FERT
    const fertMapped = orders.filter(o => 
      validResp.includes(String(o.RESPCTRLPROD).trim()) && o.CENTRO === '1000'
    ).map(o => ({
      ...o,
      _isPrevisional: false,
      _displayId: o.ORDEN
    }));

    // Normalizar Previsionales
    const provMapped = provisionalOrders.filter(o => 
      validResp.includes(String(o.RESPCONTROLPROD).trim()) && o.CENTRO === '1000'
    ).map(o => ({
      FECHA: o.FECHAINICIO,
      PEDIDO: '',
      POSICION: '',
      ORDEN: o.ORDENPREVISIONAL,
      MATERIAL: o.MATERIAL,
      NOMBRE: o.NOMBRE,
      CANTPROGRAMADA: o.CANTIDAD,
      CANTPENDIENTE: o.CANTIDAD,
      CENTRO: o.CENTRO,
      MAQUINA: o.Maquina,
      PUESTOTRABAJO: o.PUESTOTRABAJO || o.Maquina,
      RESPCTRLPROD: o.RESPCONTROLPROD,
      CATEGORIA: o.CATEGORIA,
      _isPrevisional: true,
      _displayId: o.ORDENPREVISIONAL
    }));

    return [...fertMapped, ...provMapped];
  }, [orders, provisionalOrders]);

  const uniqueDates = useMemo(() => {
    const dates = new Set(baseFilteredOrders.map(order => order.FECHA));
    return Array.from(dates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [baseFilteredOrders]);

  useEffect(() => {
    if (!hasSetDefaultDate && uniqueDates.length > 0 && displayMode === 'plan') {
      const getTargetDate = () => {
        const today = new Date();
        let daysAdded = 0;
        let result = new Date(today);
        while (daysAdded < 3) {
          result.setDate(result.getDate() + 1);
          const day = result.getDay();
          if (day !== 0 && day !== 6) daysAdded++;
        }
        return result.toISOString().split('T')[0];
      };

      const target = getTargetDate();
      setSelectedDates([target]);
      setHasSetDefaultDate(true);
    }
  }, [uniqueDates, hasSetDefaultDate, displayMode]);

  const filteredOrders = useMemo(() => {
    return baseFilteredOrders.filter(order => {
        if (selectedDates.length === 0) return true;
        return selectedDates.includes(order.FECHA);
      });
  }, [baseFilteredOrders, selectedDates]);
  
  // ALERTA DE TIEMPOS FALTANTES
  const missingTimesCount = useMemo(() => {
    const missing = new Set<string>();
    filteredOrders.forEach(order => {
      const materialCode = normalizeMaterialCode(order.MATERIAL);
      if (!tiemposMap.has(materialCode)) {
        missing.add(materialCode);
      }
    });
    return missing.size;
  }, [filteredOrders, tiemposMap]);

  const totalCantProgramadaGeneral = useMemo(() => {
    return filteredOrders.reduce((sum, order) => sum + (Number(order.CANTPROGRAMADA) || 0), 0);
  }, [filteredOrders]);

  const totalTiempoRequeridoGeneral = useMemo(() => {
    return filteredOrders.reduce((sum, order) => {
      const materialCode = normalizeMaterialCode(order.MATERIAL);
      const tiempoMin = tiemposMap.get(materialCode) || 0;
      return sum + ((Number(order.CANTPROGRAMADA) || 0) * tiempoMin);
    }, 0);
  }, [filteredOrders, tiemposMap]);

  const statusSummary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    let retrasadas = 0;
    let enProceso = 0;
    let porPlanificar = 0;

    filteredOrders.forEach(order => {
      const cant = Number(order.CANTPROGRAMADA) || 0;
      if (order.FECHA < todayStr) retrasadas += cant;
      else if (order.FECHA === todayStr) enProceso += cant;
      else porPlanificar += cant;
    });

    return { retrasadas, enProceso, porPlanificar };
  }, [filteredOrders]);

  const planSummaryByDate = useMemo(() => {
    if (displayMode !== 'plan' || selectedDates.length === 0) return [];

    return selectedDates.map(date => {
      const ordersOnDate = filteredOrders.filter(o => o.FECHA === date);
      
      const rawMesas = MESA_MAPPING.map(mesa => {
        const mesaOrders = ordersOnDate.filter(o => String(o.PUESTOTRABAJO || '').trim() === mesa.code);
        const cantProgramada = mesaOrders.reduce((sum, o) => sum + (Number(o.CANTPROGRAMADA) || 0), 0);
        const tiempoRequeridoMin = mesaOrders.reduce((sum, o) => {
          const materialCode = normalizeMaterialCode(o.MATERIAL);
          const t = tiemposMap.get(materialCode) || 0;
          return sum + (Number(o.CANTPROGRAMADA) || 0) * t;
        }, 0);

        return { ...mesa, cantProgramada, tiempoRequeridoH: tiempoRequeridoMin / 60 };
      });

      const sortedMesasByLoad = [...rawMesas].sort((a, b) => b.tiempoRequeridoH - a.tiempoRequeridoH);
      const mesaAssignments = new Map();
      sortedMesasByLoad.forEach((mesa, idx) => {
        if (tapiceros && tapiceros.length > idx) mesaAssignments.set(mesa.code, tapiceros[idx]);
      });

      const mesasBreakdown = rawMesas.map(m => ({
        ...m,
        assignedTapicero: mesaAssignments.get(m.code) ? `${mesaAssignments.get(m.code).NOMBRE} (${mesaAssignments.get(m.code).CALIFICACION})` : 'Sin Asignar'
      }));

      return {
        date,
        cantProgramada: mesasBreakdown.reduce((sum, m) => sum + m.cantProgramada, 0),
        tiempoTotalH: mesasBreakdown.reduce((sum, m) => sum + m.tiempoRequeridoH, 0),
        mesas: mesasBreakdown
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredOrders, selectedDates, displayMode, tiemposMap, tapiceros]);

  const totalPagesLocal = Math.ceil(filteredOrders.length / pagination.rowsPerPage);
  const startIndex = (pagination.currentPage - 1) * pagination.rowsPerPage;
  const endIndex = startIndex + pagination.rowsPerPage;
  const displayedOrders = filteredOrders.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setPagination(prev => ({ ...prev, currentPage: Math.max(1, Math.min(page, totalPagesLocal)) }));
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPagination(prev => ({ ...prev, rowsPerPage: Number(e.target.value), currentPage: 1 }));
  };
  
  const handleDateChange = (dates: string[]) => {
    setSelectedDates(dates);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  useEffect(() => {
    if (!isMounted) return;
    const calculateWidth = () => { if (tableRef.current) setTableWidth(tableRef.current.offsetWidth); };
    calculateWidth();
    window.addEventListener('resize', calculateWidth);
    const resizeObserver = new ResizeObserver(calculateWidth);
    if (tableRef.current) resizeObserver.observe(tableRef.current);
    return () => {
      window.removeEventListener('resize', calculateWidth);
      if (tableRef.current) resizeObserver.unobserve(tableRef.current);
    };
  }, [displayedOrders, isMounted]);

  if (!isMounted) return null;

  return (
    <div className="space-y-4">
      {displayMode === 'plan' && missingTimesCount > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 flex items-center gap-4 shadow-md animate-pulse">
          <div className="flex-shrink-0 bg-red-100 p-2 rounded-full">
            <BellRing className="h-6 w-6 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-red-800 uppercase tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Alerta de Consistencia de Datos
            </h3>
            <p className="text-xs text-red-700 font-medium mt-0.5">
              Se han detectado <span className="underline decoration-2">{missingTimesCount}</span> materiales en la selección que <span className="font-bold">no tienen información de tiempo</span>.
            </p>
          </div>
        </div>
      )}

      {!hideControls && (
        <div className="flex flex-col space-y-6 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4">
              <div className="w-56">
                <label htmlFor="date-filter" className="text-sm font-semibold text-gray-700">Fecha(s):</label>
                <MultiSelect
                  options={uniqueDates.map(d => ({ value: d, label: d }))}
                  selected={selectedDates}
                  onChange={handleDateChange}
                  placeholder="Todas las fechas"
                />
              </div>

              {displayMode === 'plan' && (
                <>
                  <div className="w-64">
                    <label className="text-sm font-semibold text-gray-700">Horario de Trabajo:</label>
                    <select
                      value={workSchedule}
                      onChange={(e) => setWorkSchedule(e.target.value)}
                      className="w-full h-9 border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="8">8 horas / 07:00 - 15:45</option>
                      <option value="9">9 horas / 07:00 - 17:00</option>
                      <option value="10">10 horas / 07:00 - 18:00</option>
                    </select>
                  </div>
                  <div className="w-56">
                    <label className="text-sm font-semibold text-gray-700">Mesas de Trabajo:</label>
                    <select
                      value={workTables}
                      onChange={(e) => setWorkTables(e.target.value)}
                      className="w-full h-9 border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                    >
                      {[6, 7, 8, 9, 10, 11, 12, 13, 14].map(num => (
                        <option key={num} value={String(num)}>{num} Mesas de Trabajo</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
          </div>

          {displayMode === 'plan' && (
            <div className="flex flex-col space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide">CAPACIDAD CONSOLIDADA (FERT + PREVISIONALES)</h4>
                  <div className="grid grid-cols-3 gap-0 items-center text-base border rounded-md bg-white min-h-[80px]">
                      <div className="text-center border-r border-dashed border-gray-300 p-3 flex flex-col justify-center">
                          <p className="text-[12px] text-gray-500 font-semibold uppercase mb-1">CANT. PROGRAMADA TOTAL</p>
                          <p className="font-bold text-base text-gray-900">{totalCantProgramadaGeneral.toLocaleString()}</p>
                      </div>
                      <div className="text-center border-r border-dashed border-gray-300 p-3 flex flex-col justify-center">
                          <p className="text-[12px] text-gray-500 font-semibold uppercase mb-1">TIEMPO REQUERIDO TOTAL (h)</p>
                          <p className="font-bold text-base text-indigo-700">{(totalTiempoRequeridoGeneral / 60).toFixed(2)}h</p>
                      </div>
                      <div className="text-center p-3 flex flex-col justify-center">
                          <p className="text-[12px] text-gray-500 font-semibold uppercase mb-1">DIAS PENDIENTES</p>
                          <p className="font-bold text-base text-blue-600">
                            {((totalTiempoRequeridoGeneral / 60) / TIEMPO_DISPONIBLE_DIARIO_TOTAL).toFixed(2)} Días
                          </p>
                      </div>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide">Desglose por Fecha y Mesa</h4>
                  <div className="space-y-4 max-h-[500px] overflow-y-auto">
                      {selectedDates.length > 0 ? (
                        planSummaryByDate.map((daySummary) => {
                          const capacidadOcupadaTotal = (daySummary.tiempoTotalH / TIEMPO_DISPONIBLE_DIARIO_TOTAL) * 100;
                          return (
                          <div key={daySummary.date} className="border rounded-md bg-white overflow-hidden shadow-sm">
                              <div className="grid grid-cols-5 gap-0 items-center text-xs p-2 bg-indigo-600 text-white font-bold uppercase">
                                  <div className="text-center border-r border-indigo-400">FECHA: {daySummary.date}</div>
                                  <div className="text-center border-r border-indigo-400">CANT: {daySummary.cantProgramada.toLocaleString()}</div>
                                  <div className="text-center border-r border-indigo-400">REQ: {daySummary.tiempoTotalH.toFixed(1)}h</div>
                                  <div className="text-center border-r border-indigo-400">DISP: {TIEMPO_DISPONIBLE_DIARIO_TOTAL.toFixed(1)}h</div>
                                  <div className="text-center">OCUPACIÓN: {capacidadOcupadaTotal.toFixed(1)}%</div>
                              </div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-[11px]">
                                  <thead className="bg-gray-100 text-gray-600 uppercase border-b">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left font-bold border-r">Mesa</th>
                                      <th className="px-3 py-1.5 text-left font-bold border-r">Personal</th>
                                      <th className="px-2 py-1.5 text-center font-bold border-r">Cant</th>
                                      <th className="px-2 py-1.5 text-center font-bold border-r">Horas Req</th>
                                      <th className="px-2 py-1.5 text-center font-bold">Ocupación %</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {daySummary.mesas.map((mesa) => {
                                      const capMesa = (mesa.tiempoRequeridoH / TIEMPO_DISPONIBLE_POR_MESA) * 100;
                                      return (
                                        <tr key={mesa.code} className="border-b last:border-0">
                                          <td className="px-3 py-1 font-semibold border-r">{mesa.name}</td>
                                          <td className="px-3 py-1 border-r text-blue-600 truncate max-w-[150px]">{mesa.assignedTapicero}</td>
                                          <td className="px-2 py-1 text-center font-mono border-r">{mesa.cantProgramada}</td>
                                          <td className="px-2 py-1 text-center font-mono border-r">{mesa.tiempoRequeridoH.toFixed(2)}</td>
                                          <td className={cn("px-2 py-1 text-center font-bold font-mono", capMesa > 100 ? "text-red-600 bg-red-50" : "text-blue-600")}>
                                            {capMesa.toFixed(1)}%
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                          </div>
                          );
                        })
                      ) : (
                        <p className="p-4 text-center text-gray-500 text-sm italic bg-white rounded-md border">Selecciona fechas para analizar capacidad.</p>
                      )}
                  </div>
                </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg overflow-hidden border">
        <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden" style={{ height: '18px' }}>
            <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
        </div>
        <div ref={tableScrollRef} onScroll={handleTableScroll} className="overflow-x-auto">
          <table ref={tableRef} className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {COLUMNS_TO_DISPLAY.map((col, index) => (
                  <th key={col} className={cn("px-3 py-3 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider", index < COLUMNS_TO_DISPLAY.length - 1 && "border-r border-dashed border-gray-300")}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayedOrders.map((order, index) => {
                  const materialCode = normalizeMaterialCode(order.MATERIAL);
                  const tiempoMin = tiemposMap.get(materialCode) || 0;
                  const tiempoTotal = (Number(order.CANTPROGRAMADA) || 0) * tiempoMin;

                  return (
                    <tr key={`${order._displayId}-${index}`} className={cn("hover:bg-gray-50 transition-colors", order._isPrevisional ? "bg-blue-50/20" : "")}>
                      {COLUMNS_TO_DISPLAY.map((col, colIndex) => {
                          const isBorder = colIndex < COLUMNS_TO_DISPLAY.length - 1 ? 'border-r border-dashed border-gray-300' : '';
                          
                          if (col === 'TIEMPO') {
                              return (
                                 <td key={col} className={cn("px-2 py-3 text-center font-mono font-bold text-[13px]", tiempoTotal === 0 ? "text-red-400" : "text-blue-700", isBorder)}>
                                   {tiempoTotal > 0 ? tiempoTotal.toFixed(2) : '-'}
                                 </td>
                              );
                          }

                          let displayValue = String((order as any)[col] ?? '-');
                          if ((col === 'PEDIDO' || col === 'POSICION') && displayValue.startsWith('000')) {
                              displayValue = displayValue.substring(3);
                          } else if (col === 'ORDEN' && displayValue.length > 4 && !order._isPrevisional) {
                              displayValue = displayValue.substring(4);
                          } else if (col === 'MATERIAL') {
                              displayValue = normalizeMaterialCode(displayValue);
                          }

                          return (
                           <td key={col} className={cn("px-2 py-3 text-center text-sm text-gray-600", col === 'CANTPROGRAMADA' && "font-bold text-gray-900", isBorder)}>
                             {displayValue}
                           </td>
                          );
                      })}
                    </tr>
                  );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center space-x-4">
          <span className="text-xs text-gray-500">Mostrando {displayedOrders.length} de {filteredOrders.length} registros.</span>
          <select value={pagination.rowsPerPage} onChange={handleRowsPerPageChange} className="px-2 py-1 border border-gray-300 rounded text-xs">
            {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => goToPage(1)} disabled={pagination.currentPage === 1}>Primera</Button>
          <Button variant="outline" size="sm" onClick={() => goToPage(pagination.currentPage - 1)} disabled={pagination.currentPage === 1}>Ant.</Button>
          <span className="text-xs font-bold px-2">{pagination.currentPage} / {totalPagesLocal}</span>
          <Button variant="outline" size="sm" onClick={() => goToPage(pagination.currentPage + 1)} disabled={pagination.currentPage >= totalPagesLocal}>Sig.</Button>
          <Button variant="outline" size="sm" onClick={() => goToPage(totalPagesLocal)} disabled={pagination.currentPage >= totalPagesLocal}>Última</Button>
        </div>
      </div>
    </div>
  );
};
