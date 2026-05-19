'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Package, Check, ChevronsUpDown } from 'lucide-react';
import type { OrdenFert, Restriccion } from '@/types/interfaces';
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
                : `${selected.length} seleccionada(s)`}
            </span>
            <Check className="ml-1 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0">
          <Command>
            <CommandInput placeholder="Buscar fecha..." className="h-9" />
            <CommandEmpty>No se encontraron fechas.</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
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
      {selected.length > 0 && (
          <div className="pt-1 text-left w-full min-h-[22px]">
            {selected.slice(0, 3).map(value => (
              <Badge key={value} variant="secondary" className="mr-1 mb-1 max-w-[100px] truncate" title={value}>
                {value}
              </Badge>
            ))}
            {selected.length > 3 && <Badge variant="secondary">+{selected.length - 3}</Badge>}
          </div>
      )}
    </div>
  );
};

export const OrdenesFertTabSection: React.FC<OrdenesFertTabSectionProps> = ({ restricciones, columns, hideControls = false, tiemposData = [], displayMode = 'full' }) => {
  const { addNotification } = useAppContext();
  const [orders, setOrders] = useState<OrdenFert[]>([]);
  const [tapiceros, setTapiceros] = useState<any[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalRegistros: 0,
    pageSize: 10000,
    isExploring: true,
    rowsPerPage: 20,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [hasSetDefaultDate, setHasSetDefaultDate] = useState(false);
  const [workSchedule, setWorkSchedule] = useState<string>("9");
  const [workTables, setWorkTables] = useState<string>("14");

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
                map.set(materialCode, tiempo);
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
    const fetchTapiceros = async () => {
      try {
        const res = await serviciosService.getCuboHabilidadesOP();
        if (res && res.data) {
          const dataArray = Array.isArray(res.data) ? res.data : [res.data];
          
          // Filtro robusto: Tapiceros de Quito
          const filtered = dataArray.filter((s: any) => {
            const role = String(s.ROL || '').trim().toUpperCase();
            const location = String(s.LOCALIDAD || s.CENTRO || s.Centro || '').trim();
            return role.includes("TAPICERO") && (location.includes("QUITO") || location.includes("1000"));
          });

          // Si el filtro específico no devuelve nada, intentar filtro general por rol
          const finalFiltered = filtered.length > 0 ? filtered : dataArray.filter((s: any) => 
            String(s.ROL || '').trim().toUpperCase().includes("TAPICERO")
          );

          // Ordenar por calificación descendente
          const sorted = finalFiltered.sort((a: any, b: any) => (Number(b.CALIFICACION) || 0) - (Number(a.CALIFICACION) || 0));
          console.log(`[OrdenesFertTabSection] Se cargaron ${sorted.length} tapiceros.`);
          setTapiceros(sorted);
        }
      } catch (e) {
        console.error("Error cargando tapiceros para el PLAN", e);
      }
    };
    fetchTapiceros();
  }, []);

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const exploreResponse = await serviciosService.getOrdenesFert(1, 1);
        const totalRecords = exploreResponse.totalRegistros || (exploreResponse.data?.length > 0 ? 1 : 0);

        if (totalRecords === 0) {
          setOrders([]);
          addNotification('info', 'No se encontraron órdenes FERT.');
          setIsLoading(false);
          return;
        }

        const BATCH_SIZE = 10000;
        const totalPagesToFetch = Math.ceil(totalRecords / BATCH_SIZE);
        let allData: OrdenFert[] = [];

        for (let i = 1; i <= totalPagesToFetch; i++) {
          const pageResponse = await serviciosService.getOrdenesFert(i, BATCH_SIZE);
          if (pageResponse.data && Array.isArray(pageResponse.data)) {
            allData = allData.concat(pageResponse.data);
          }
        }
        
        setOrders(allData);

      } catch (err) {
        const errorMessage = (err as Error).message;
        setError(errorMessage);
        addNotification('error', `Error al cargar datos: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    if (restricciones) {
      fetchOrders();
    }
  }, [addNotification, restricciones]);

  const uniqueDates = useMemo(() => {
    if (!orders) return [];
    const dates = new Set(orders.map(order => order.FECHA));
    return Array.from(dates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [orders]);

  useEffect(() => {
    if (!hasSetDefaultDate && uniqueDates.length > 0 && displayMode === 'plan') {
      const getTargetDate = () => {
        const today = new Date();
        let daysAdded = 0;
        let result = new Date(today);
        while (daysAdded < 3) {
          result.setDate(result.getDate() + 1);
          const day = result.getDay();
          if (day !== 0 && day !== 6) {
            daysAdded++;
          }
        }
        return result.toISOString().split('T')[0];
      };

      const target = getTargetDate();
      setSelectedDates([target]);
      setHasSetDefaultDate(true);
    }
  }, [uniqueDates, hasSetDefaultDate, displayMode]);

  const baseFilteredOrders = useMemo(() => {
    return orders.filter(order => 
      (order.RESPCTRLPROD === '019' || order.RESPCTRLPROD === '006') &&
      order.CENTRO === '1000'
    );
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return baseFilteredOrders.filter(order => {
        if (selectedDates.length === 0) return true;
        return selectedDates.includes(order.FECHA);
      });
  }, [baseFilteredOrders, selectedDates]);
  
  const totalCantidadPendienteGeneral = useMemo(() => {
    return baseFilteredOrders.reduce((sum, order) => sum + (Number(order.CANTPENDIENTE) || 0), 0);
  }, [baseFilteredOrders]);

  const totalCantProgramadaGeneral = useMemo(() => {
    return baseFilteredOrders.reduce((sum, order) => sum + (Number(order.CANTPROGRAMADA) || 0), 0);
  }, [baseFilteredOrders]);

  const totalTiempoRequeridoGeneral = useMemo(() => {
    return baseFilteredOrders.reduce((sum, order) => {
      const materialCode = normalizeMaterialCode(order.MATERIAL);
      const tiempoMin = tiemposMap.get(materialCode) || 0;
      return sum + ((Number(order.CANTPROGRAMADA) || 0) * tiempoMin);
    }, 0);
  }, [baseFilteredOrders, tiemposMap]);

  const statusSummary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    let retrasadas = 0;
    let retrasadasTimeMin = 0;
    let enProceso = 0;
    let enProcesoTimeMin = 0;
    let porPlanificar = 0;
    let porPlanificarTimeMin = 0;

    baseFilteredOrders.forEach(order => {
      const cant = Number(order.CANTPROGRAMADA) || 0;
      const materialCode = normalizeMaterialCode(order.MATERIAL);
      const tiempoMin = tiemposMap.get(materialCode) || 0;
      const orderTotalTimeMin = cant * tiempoMin;

      if (order.FECHA < todayStr) {
        retrasadas += cant;
        retrasadasTimeMin += orderTotalTimeMin;
      } else if (order.FECHA === todayStr) {
        enProceso += cant;
        enProcesoTimeMin += orderTotalTimeMin;
      } else {
        porPlanificar += cant;
        porPlanificarTimeMin += orderTotalTimeMin;
      }
    });

    return { 
      retrasadas, 
      retrasadasTimeH: retrasadasTimeMin / 60,
      enProceso, 
      enProcesoTimeH: enProcesoTimeMin / 60,
      porPlanificar,
      porPlanificarTimeH: porPlanificarTimeMin / 60
    };
  }, [baseFilteredOrders, tiemposMap]);

  const planSummaryByDate = useMemo(() => {
    if (displayMode !== 'plan' || selectedDates.length === 0) return [];

    return selectedDates.map(date => {
      const ordersOnDate = filteredOrders.filter(o => o.FECHA === date);
      
      // 1. Calcular estadísticas base por mesa
      const rawMesas = MESA_MAPPING.map(mesa => {
        const mesaOrders = ordersOnDate.filter(o => String(o.PUESTOTRABAJO || '').trim() === mesa.code);
        const cantProgramada = mesaOrders.reduce((sum, o) => sum + (Number(o.CANTPROGRAMADA) || 0), 0);
        const tiempoRequeridoMin = mesaOrders.reduce((sum, o) => {
          const materialCode = normalizeMaterialCode(o.MATERIAL);
          const t = tiemposMap.get(materialCode) || 0;
          return sum + (Number(o.CANTPROGRAMADA) || 0) * t;
        }, 0);

        return {
          ...mesa,
          cantProgramada,
          tiempoRequeridoH: tiempoRequeridoMin / 60
        };
      });

      // 2. Asignación Inteligente de Tapiceros
      // Ordenar mesas por tiempo requerido (carga) descendente para asignar los mejores tapiceros a las más cargadas
      const sortedMesasByLoad = [...rawMesas]
        .map((m, originalIndex) => ({ ...m, originalIndex }))
        .sort((a, b) => b.tiempoRequeridoH - a.tiempoRequeridoH);
      
      // Mapeo de asignación: mesaCode -> tapiceroInfo
      const mesaAssignments = new Map();
      sortedMesasByLoad.forEach((mesa, idx) => {
        if (tapiceros && tapiceros.length > idx) {
          mesaAssignments.set(mesa.code, tapiceros[idx]);
        }
      });

      // 3. Re-mapear a la estructura final manteniendo el orden original de MESA_MAPPING
      const mesasBreakdown = rawMesas.map(m => {
        const tapicero = mesaAssignments.get(m.code);
        return {
          ...m,
          assignedTapicero: tapicero ? `${tapicero.NOMBRE} (${tapicero.CALIFICACION})` : 'Sin Asignar'
        };
      });

      const totalCantProgramada = mesasBreakdown.reduce((sum, m) => sum + m.cantProgramada, 0);
      const totalTiempoRequeridoH = mesasBreakdown.reduce((sum, m) => sum + m.tiempoRequeridoH, 0);

      return {
        date,
        cantProgramada: totalCantProgramada,
        tiempoTotalH: totalTiempoRequeridoH,
        mesas: mesasBreakdown
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredOrders, selectedDates, displayMode, tiemposMap, tapiceros]);

  const totalPagesLocal = Math.ceil(filteredOrders.length / pagination.rowsPerPage);
  const startIndex = (pagination.currentPage - 1) * pagination.rowsPerPage;
  const endIndex = startIndex + pagination.rowsPerPage;
  const displayedOrders = filteredOrders.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setPagination(prev => ({
        ...prev,
        currentPage: Math.max(1, Math.min(page, totalPagesLocal))
    }));
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPagination(prev => ({
      ...prev,
      rowsPerPage: Number(e.target.value),
      currentPage: 1,
    }));
  };
  
  const handleDateChange = (dates: string[]) => {
    setSelectedDates(dates);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        <span className="ml-3 text-gray-600">Cargando Órdenes FERT...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
                    <label htmlFor="schedule-filter" className="text-sm font-semibold text-gray-700">Horario de Trabajo:</label>
                    <select
                      id="schedule-filter"
                      value={workSchedule}
                      onChange={(e) => setWorkSchedule(e.target.value)}
                      className="w-full h-9 border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    >
                      <option value="8">8 horas / 07:00 - 15:45</option>
                      <option value="9">9 horas / 07:00 - 17:00</option>
                      <option value="10">10 horas / 07:00 - 18:00</option>
                    </select>
                  </div>
                  <div className="w-56">
                    <label htmlFor="tables-filter" className="text-sm font-semibold text-gray-700">Mesas de Trabajo:</label>
                    <select
                      id="tables-filter"
                      value={workTables}
                      onChange={(e) => setWorkTables(e.target.value)}
                      className="w-full h-9 border border-gray-300 rounded-md px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
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
                {/* RECUADRO 1: PENDIENTES TOTALES */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide">PENDIENTES TOTALES</h4>
                  <div className="grid grid-cols-3 gap-0 items-center text-base border rounded-md bg-white min-h-[80px]">
                      <div className="text-center border-r border-dashed border-gray-300 p-3 h-full flex flex-col justify-center">
                          <p className="text-[12px] text-gray-500 font-semibold uppercase mb-1">CANT. PROGRAMADA TOTAL</p>
                          <p className="font-bold text-base text-gray-900">{totalCantProgramadaGeneral.toLocaleString()}</p>
                      </div>
                      <div className="text-center border-r border-dashed border-gray-300 p-3 h-full flex flex-col justify-center">
                          <p className="text-[12px] text-gray-500 font-semibold uppercase mb-1">TIEMPO REQUERIDO TOTAL (h)</p>
                          <p className="font-bold text-base text-indigo-700">{(totalTiempoRequeridoGeneral / 60).toFixed(2)}</p>
                      </div>
                      <div className="text-center p-3 h-full flex flex-col justify-center">
                          <p className="text-[12px] text-gray-500 font-semibold uppercase mb-1">DIAS PENDIENTES</p>
                          <p className="font-bold text-base text-blue-600">
                            {((totalTiempoRequeridoGeneral / 60) / TIEMPO_DISPONIBLE_DIARIO_TOTAL).toFixed(2)} Días
                          </p>
                      </div>
                  </div>
                </div>

                {/* RECUADRO 2: CAPACIDAD POR FECHA (DESGLOSADO POR MESAS) */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide">Capacidad por fecha</h4>
                  <div className="space-y-4 max-h-[500px] overflow-y-auto">
                      {selectedDates.length > 0 ? (
                        planSummaryByDate.map((daySummary) => {
                          const capacidadOcupadaTotal = (daySummary.tiempoTotalH / TIEMPO_DISPONIBLE_DIARIO_TOTAL) * 100;
                          
                          return (
                          <div key={daySummary.date} className="border rounded-md bg-white overflow-hidden">
                              {/* Header del día */}
                              <div className="grid grid-cols-5 gap-0 items-center text-xs p-2 bg-indigo-600 text-white font-bold uppercase tracking-wider">
                                  <div className="text-center border-r border-indigo-400">FECHA: {daySummary.date}</div>
                                  <div className="text-center border-r border-indigo-400">CANT. TOTAL: {daySummary.cantProgramada.toLocaleString()}</div>
                                  <div className="text-center border-r border-indigo-400">REQ. TOTAL: {daySummary.tiempoTotalH.toFixed(2)}h</div>
                                  <div className="text-center border-r border-indigo-400">DISP. TOTAL: {TIEMPO_DISPONIBLE_DIARIO_TOTAL.toFixed(2)}h</div>
                                  <div className="text-center">OCUPACIÓN: {capacidadOcupadaTotal.toFixed(1)}%</div>
                              </div>
                              
                              {/* Detalle por mesa */}
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-[12px]">
                                  <thead className="bg-gray-100 text-gray-600 uppercase border-b">
                                    <tr>
                                      <th className="px-3 py-1.5 text-left font-bold border-r">Mesa de Trabajo</th>
                                      <th className="px-3 py-1.5 text-left font-bold border-r">Personal Asignado</th>
                                      <th className="px-2 py-1.5 text-center font-bold border-r">Cant. Programada</th>
                                      <th className="px-2 py-1.5 text-center font-bold border-r">Tiempo Requerido (h)</th>
                                      <th className="px-2 py-1.5 text-center font-bold border-r">Tiempo Disponible (h)</th>
                                      <th className="px-2 py-1.5 text-center font-bold">Capacidad (%)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-100">
                                    {daySummary.mesas.map((mesa) => {
                                      const capMesa = (mesa.tiempoRequeridoH / TIEMPO_DISPONIBLE_POR_MESA) * 100;
                                      return (
                                        <tr key={mesa.code} className="hover:bg-gray-50 transition-colors">
                                          <td className="px-3 py-1.5 font-semibold text-gray-700 border-r bg-gray-50/30">{mesa.name}</td>
                                          <td className="px-3 py-1.5 font-semibold text-blue-600 truncate max-w-[200px] border-r" title={mesa.assignedTapicero}>
                                            {mesa.assignedTapicero}
                                          </td>
                                          <td className="px-2 py-1.5 text-center font-mono border-r">{mesa.cantProgramada.toLocaleString()}</td>
                                          <td className="px-2 py-1.5 text-center font-mono text-indigo-700 border-r">{mesa.tiempoRequeridoH.toFixed(2)}</td>
                                          <td className="px-2 py-1.5 text-center font-mono text-emerald-700 border-r">{TIEMPO_DISPONIBLE_POR_MESA.toFixed(2)}</td>
                                          <td className={cn(
                                            "px-2 py-1.5 text-center font-bold font-mono",
                                            capMesa > 100 ? "text-red-600 bg-red-50" : "text-blue-600 bg-blue-50"
                                          )}>
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
                        <p className="p-4 text-center text-gray-500 text-sm italic bg-white rounded-md border">Selecciona una fecha para ver el resumen por mesa.</p>
                      )}
                  </div>
                </div>

                {/* RECUADRO 3: ESTATUS ACTUAL ORDENES */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide">ESTATUS ACTUAL ORDENES</h4>
                  <div className="grid grid-cols-3 gap-0 items-center text-base border rounded-md bg-white min-h-[80px]">
                      <div className="text-center border-r border-dashed border-gray-300 p-3 h-full flex flex-col justify-center">
                          <p className="text-[12px] text-gray-500 font-semibold uppercase mb-1">RETRASADAS</p>
                          <div className="flex items-center justify-center gap-2">
                            <p className="font-bold text-base text-red-600">{statusSummary.retrasadas.toLocaleString()}</p>
                            <span className="text-xs text-red-400 font-mono">/ {statusSummary.retrasadasTimeH.toFixed(1)}h</span>
                          </div>
                      </div>
                      <div className="text-center border-r border-dashed border-gray-300 p-3 h-full flex flex-col justify-center">
                          <p className="text-[12px] text-gray-500 font-semibold uppercase mb-1">EN PROCESO</p>
                          <div className="flex items-center justify-center gap-2">
                            <p className="font-bold text-base text-blue-600">{statusSummary.enProceso.toLocaleString()}</p>
                            <span className="text-xs text-blue-400 font-mono">/ {statusSummary.enProcesoTimeH.toFixed(1)}h</span>
                          </div>
                      </div>
                      <div className="text-center p-3 h-full flex flex-col justify-center">
                          <p className="text-[12px] text-gray-500 font-semibold uppercase mb-1">POR PLANIFICAR</p>
                          <div className="flex items-center justify-center gap-2">
                            <p className="font-bold text-base text-teal-600">{statusSummary.porPlanificar.toLocaleString()}</p>
                            <span className="text-xs text-teal-400 font-mono">/ {statusSummary.porPlanificarTimeH.toFixed(1)}h</span>
                          </div>
                      </div>
                  </div>
                </div>
            </div>
          )}
        </div>
      )}

      {/* Tabla de Órdenes FERT */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {COLUMNS_TO_DISPLAY.map((col, index) => (
                  <th
                    key={col}
                    className={cn(
                      "px-3 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider",
                      col === 'CANTPROGRAMADA' && "w-24",
                      index < COLUMNS_TO_DISPLAY.length - 1 && "border-r border-dashed border-gray-300"
                    )}
                  >
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayedOrders.map((order, index) => {
                  let tiempoCalculado = '-';
                  if (COLUMNS_TO_DISPLAY.includes('TIEMPO')) {
                      const materialCode = normalizeMaterialCode(order.MATERIAL);
                      const tiempoMin = tiemposMap.get(materialCode);
                      if (tiempoMin) {
                          const cantProgramada = Number(order.CANTPROGRAMADA) || 0;
                          const tiempoTotal = cantProgramada * tiempoMin;
                          tiempoCalculado = tiempoTotal.toFixed(2);
                      }
                  }
                  
                  return (
                    <tr key={`${order.ORDEN}-${index}`} className="hover:bg-gray-50">
                      {COLUMNS_TO_DISPLAY.map((col, colIndex) => {
                          if (col === 'TIEMPO') {
                              return (
                                 <td key={col} className={cn(
                                   "px-2 py-4 whitespace-nowrap text-sm text-center font-mono font-semibold text-blue-700",
                                   colIndex < COLUMNS_TO_DISPLAY.length - 1 ? 'border-r border-dashed border-gray-300' : ''
                                 )}>
                                   {tiempoCalculado}
                                 </td>
                              );
                          }

                          let displayValue = String((order as any)[col] ?? '-');
                          if (col === 'ORDEN') {
                            if (displayValue && displayValue.length > 4) {
                                displayValue = displayValue.substring(4);
                            }
                          } else if (col === 'MATERIAL') {
                            displayValue = normalizeMaterialCode(displayValue);
                          }
                          return (
                           <td key={col} className={cn(
                             "px-2 py-4 whitespace-nowrap text-sm text-gray-600 text-center",
                             col === 'CANTPROGRAMADA' && "w-24 font-bold",
                             colIndex < COLUMNS_TO_DISPLAY.length - 1 && "border-r border-dashed border-gray-300"
                           )}>
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
      
      {/* Controles de Paginación */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">
            Mostrando {startIndex + 1} a {Math.min(endIndex, filteredOrders.length)} de {filteredOrders.length} órdenes.
          </span>
          <select
            value={pagination.rowsPerPage}
            onChange={handleRowsPerPageChange}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
        <div className="flex items-center space-x-2">
           <span className="text-sm text-gray-600">
            Página <span className="font-bold">{pagination.currentPage}</span> de <span className="font-bold">{totalPagesLocal}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(1)}
            disabled={pagination.currentPage === 1 || isLoading}
          >
            Primera
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(pagination.currentPage - 1)}
            disabled={pagination.currentPage === 1 || isLoading}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(pagination.currentPage + 1)}
            disabled={pagination.currentPage >= totalPagesLocal || isLoading}
          >
            Siguiente
          </Button>
           <Button
            variant="outline"
            size="sm"
            onClick={() => goToPage(totalPagesLocal)}
            disabled={pagination.currentPage === totalPagesLocal || isLoading}
          >
            Última
          </Button>
        </div>
      </div>
    </div>
  );
};