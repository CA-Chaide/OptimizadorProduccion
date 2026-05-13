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

  // Constante de tiempo disponible diario actualizada a 83.52h
  const TIEMPO_DISPONIBLE_DIARIO = 83.52;

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
    'MAQUINA', 'SECTORDESC', 'CATEGORIA', 'RESPCTRLPROD'
  ];

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
          addNotification('info', `Cargando lote ${i} de ${totalPagesToFetch} de órdenes FERT...`);
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

  // Lógica para establecer la fecha por defecto (Hoy + 3 días laborables) en el modo PLAN
  useEffect(() => {
    if (!hasSetDefaultDate && uniqueDates.length > 0 && displayMode === 'plan') {
      const getTargetDate = () => {
        const today = new Date();
        let daysAdded = 0;
        let result = new Date(today);
        
        // Loop para añadir exactamente 3 días laborables (saltando Sábados y Domingos)
        while (daysAdded < 3) {
          result.setDate(result.getDate() + 1);
          const day = result.getDay();
          if (day !== 0 && day !== 6) { // 0 es Domingo, 6 es Sábado
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

  // Base filtrada para Muebles (Centro 1000, Resp 019/006)
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
  
  const totalCantidadPendiente = useMemo(() => {
    return filteredOrders.reduce((sum, order) => sum + (Number(order.CANTPENDIENTE) || 0), 0);
  }, [filteredOrders]);
  
  const totalCantidadPendienteGeneral = useMemo(() => {
    return baseFilteredOrders.reduce((sum, order) => sum + (Number(order.CANTPENDIENTE) || 0), 0);
  }, [baseFilteredOrders]);

  // Cálculos para PENDIENTES TOTALES (Independiente de la fecha)
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

  // Cálculos para ESTATUS ACTUAL ORDENES (Con Horas Totales)
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

    const summaryMap = new Map<string, { cantProgramada: number; tiempoTotal: number }>();

    selectedDates.forEach(date => {
        summaryMap.set(date, { cantProgramada: 0, tiempoTotal: 0 });
    });

    filteredOrders.forEach(order => {
        const date = order.FECHA;
        if (summaryMap.has(date)) {
            const summary = summaryMap.get(date)!;
            const cantProgramada = Number(order.CANTPROGRAMADA) || 0;
            summary.cantProgramada += cantProgramada;

            const materialCode = normalizeMaterialCode(order.MATERIAL);
            const tiempoMin = tiemposMap.get(materialCode);
            if (tiempoMin) {
                summary.tiempoTotal += cantProgramada * tiempoMin;
            }
        }
    });

    return Array.from(summaryMap.entries()).map(([date, totals]) => ({
        date,
        ...totals,
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [filteredOrders, selectedDates, displayMode, tiemposMap]);


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

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-800">
          <span className="font-semibold">Error:</span> {error}
        </p>
      </div>
    );
  }
  
  if (orders.length === 0) {
    return (
        <div className="flex flex-col items-center justify-center py-12 text-gray-500 border-2 border-dashed rounded-lg">
          <Package className="w-12 h-12 mb-4 text-gray-300" />
          <p>No hay órdenes FERT disponibles para mostrar.</p>
        </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideControls && (
        <div className="flex flex-col space-y-6 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-2">
              <div className="w-56">
                <label htmlFor="date-filter" className="text-sm font-semibold text-gray-700">Fecha(s):</label>
                <MultiSelect
                  options={uniqueDates.map(d => ({ value: d, label: d }))}
                  selected={selectedDates}
                  onChange={handleDateChange}
                  placeholder="Todas las fechas"
                />
              </div>
              
              {displayMode === 'full' && (
                <>
                  <div className="flex items-center space-x-3 bg-indigo-50 border border-teal-200 rounded-lg p-3 shadow-sm mt-6">
                    <Package className="w-6 h-6 text-indigo-600" />
                    <div>
                      <p className="text-xs text-indigo-800 font-semibold uppercase">CANT. PENDIENTE</p>
                      <p className="text-2xl font-bold text-indigo-900">{totalCantidadPendiente.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 bg-teal-50 border border-teal-200 rounded-lg p-3 shadow-sm mt-6">
                    <Package className="w-6 h-6 text-teal-600" />
                    <div>
                      <p className="text-xs text-teal-800 font-semibold uppercase">CANT. TOTAL</p>
                      <p className="text-2xl font-bold text-teal-900">{totalCantidadPendienteGeneral.toLocaleString()}</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {displayMode === 'plan' && (
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Recuadro CAPACIDAD POR FECHA */}
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                  <h4 className="text-[11px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide">Capacidad por fecha</h4>
                  <div className="space-y-0 max-h-64 overflow-y-auto border rounded-md">
                      {selectedDates.length > 0 ? (
                        planSummaryByDate.map(({ date, cantProgramada, tiempoTotal }) => {
                          const tiempoRequeridoH = tiempoTotal / 60;
                          const capacidadOcupada = (tiempoRequeridoH / TIEMPO_DISPONIBLE_DIARIO) * 100;
                          
                          return (
                          <div key={date} className="grid grid-cols-5 gap-0 items-center text-base p-3 border-b last:border-b-0 bg-white hover:bg-indigo-50/30 transition-colors">
                              <div className="text-center border-r border-dashed border-gray-300 px-2 h-full flex flex-col justify-center">
                                  <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">FECHA</p>
                                  <p className="font-bold text-gray-900">{date}</p>
                              </div>
                              <div className="text-center border-r border-dashed border-gray-300 px-2 h-full flex flex-col justify-center">
                                  <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">CANT. PROGRAMADA</p>
                                  <p className="font-bold text-gray-900">{cantProgramada.toLocaleString()}</p>
                              </div>
                              <div className="text-center border-r border-dashed border-gray-300 px-2 h-full flex flex-col justify-center">
                                  <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">TIEMPO REQUERIDO (h)</p>
                                  <p className="font-bold text-indigo-700">{tiempoRequeridoH.toFixed(2)}</p>
                              </div>
                              <div className="text-center border-r border-dashed border-gray-300 px-2 h-full flex flex-col justify-center">
                                  <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">TIEMPO DISPONIBLE (h)</p>
                                  <p className="font-bold text-emerald-700">{TIEMPO_DISPONIBLE_DIARIO.toFixed(2)}</p>
                              </div>
                              <div className="text-center px-2 h-full flex flex-col justify-center">
                                  <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">CAPACIDAD</p>
                                  <p className={cn("font-bold", capacidadOcupada > 100 ? "text-red-600" : "text-blue-600")}>
                                    {capacidadOcupada.toFixed(2)}%
                                  </p>
                              </div>
                          </div>
                          );
                        })
                      ) : (
                        <p className="p-4 text-center text-gray-500 text-sm italic">Selecciona una fecha para ver el resumen diario.</p>
                      )}
                  </div>
                </div>

                {/* Recuadro PENDIENTES TOTALES */}
                <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm h-full">
                  <h4 className="text-[11px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide">PENDIENTES TOTALES</h4>
                  <div className="grid grid-cols-3 gap-0 items-center text-base border rounded-md bg-white min-h-[80px]">
                      <div className="text-center border-r border-dashed border-gray-300 p-3 h-full flex flex-col justify-center">
                          <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">CANT. PROGRAMADA TOTAL</p>
                          <p className="font-bold text-gray-900">{totalCantProgramadaGeneral.toLocaleString()}</p>
                      </div>
                      <div className="text-center border-r border-dashed border-gray-300 p-3 h-full flex flex-col justify-center">
                          <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">TIEMPO REQUERIDO TOTAL (h)</p>
                          <p className="font-bold text-indigo-700">{(totalTiempoRequeridoGeneral / 60).toFixed(2)}</p>
                      </div>
                      <div className="text-center p-3 h-full flex flex-col justify-center">
                          <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">DIAS PENDIENTES</p>
                          <p className="font-bold text-blue-600">
                            {((totalTiempoRequeridoGeneral / 60) / TIEMPO_DISPONIBLE_DIARIO).toFixed(2)} Días
                          </p>
                      </div>
                  </div>
                </div>
              </div>

              {/* Recuadro ESTATUS ACTUAL ORDENES */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                <h4 className="text-[11px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide">ESTATUS ACTUAL ORDENES</h4>
                <div className="grid grid-cols-3 gap-0 items-center text-base border rounded-md bg-white min-h-[80px]">
                    <div className="text-center border-r border-dashed border-gray-300 p-3 h-full flex flex-col justify-center">
                        <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">RETRASADAS</p>
                        <div className="flex items-center justify-center gap-2">
                          <p className="font-bold text-red-600">{statusSummary.retrasadas.toLocaleString()}</p>
                          <span className="text-xs text-red-400 font-mono">/ {statusSummary.retrasadasTimeH.toFixed(1)}h</span>
                        </div>
                    </div>
                    <div className="text-center border-r border-dashed border-gray-300 p-3 h-full flex flex-col justify-center">
                        <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">EN PROCESO</p>
                        <div className="flex items-center justify-center gap-2">
                          <p className="font-bold text-blue-600">{statusSummary.enProceso.toLocaleString()}</p>
                          <span className="text-xs text-blue-400 font-mono">/ {statusSummary.enProcesoTimeH.toFixed(1)}h</span>
                        </div>
                    </div>
                    <div className="text-center p-3 h-full flex flex-col justify-center">
                        <p className="text-[11px] text-gray-500 font-semibold uppercase mb-1">POR PLANIFICAR</p>
                        <div className="flex items-center justify-center gap-2">
                          <p className="font-bold text-teal-600">{statusSummary.porPlanificar.toLocaleString()}</p>
                          <span className="text-xs text-teal-400 font-mono">/ {statusSummary.porPlanificarTimeH.toFixed(1)}h</span>
                        </div>
                    </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
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
                                 <td key={col} className={`px-2 py-4 whitespace-nowrap text-sm text-gray-600 text-center font-mono font-semibold text-blue-700 ${colIndex < COLUMNS_TO_DISPLAY.length - 1 ? 'border-r border-dashed border-gray-300' : ''}`}>
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
      
      {/* Pagination Controls */}
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