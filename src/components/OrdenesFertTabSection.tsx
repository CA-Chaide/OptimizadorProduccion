
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
            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
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
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
      <div className="pt-1 text-left w-full min-h-[22px]">
        {selected.slice(0, 3).map(value => (
          <Badge key={value} variant="secondary" className="mr-1 mb-1 max-w-[100px] truncate" title={value}>
            {value}
          </Badge>
        ))}
        {selected.length > 3 && <Badge variant="secondary">+{selected.length - 3}</Badge>}
      </div>
    </div>
  );
};

export const OrdenesFertTabSection: React.FC<OrdenesFertTabSectionProps> = ({ restricciones, columns, hideControls = false, tiemposData = [] }) => {
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

  const tiemposMap = useMemo(() => {
    if (!tiemposData || tiemposData.length === 0) {
        return new Map<string, number>();
    }
    const map = new Map<string, number>();
    tiemposData.forEach(item => {
        const materialCode = normalizeMaterialCode(item.CodMaterial);
        const tiempo = item.Tiempo_Min ?? item.Tiempo ?? 0;
        if (materialCode && tiempo > 0) {
            if (!map.has(materialCode)) {
                map.set(materialCode, tiempo);
            }
        }
    });
    return map;
  }, [tiemposData]);

  // Define static columns to ensure order and completeness
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

  const filteredOrders = useMemo(() => {
    return orders
      .filter(order => 
        (order.RESPCTRLPROD === '019' || order.RESPCTRLPROD === '006') &&
        order.CENTRO === '1000'
      )
      .filter(order => {
        if (selectedDates.length === 0) return true;
        return selectedDates.includes(order.FECHA);
      });
  }, [orders, selectedDates]);
  
  const totalCantidadPendiente = useMemo(() => {
    return filteredOrders.reduce((sum, order) => sum + (Number(order.CANTPENDIENTE) || 0), 0);
  }, [filteredOrders]);
  
  const totalCantidadPendienteGeneral = useMemo(() => {
    return orders
      .filter(order => 
        (order.RESPCTRLPROD === '019' || order.RESPCTRLPROD === '006') &&
        order.CENTRO === '1000'
      )
      .reduce((sum, order) => sum + (Number(order.CANTPENDIENTE) || 0), 0);
  }, [orders]);

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
      {/* Controls */}
      {!hideControls && (
        <div className="flex items-start justify-between mb-4">
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
            <div className="flex items-center space-x-3 bg-indigo-50 border border-indigo-200 rounded-lg p-3 shadow-sm mt-6">
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
          </div>
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
                    className={`px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider ${index < COLUMNS_TO_DISPLAY.length - 1 ? 'border-r border-dashed border-gray-300' : ''}`}
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
                                 <td key={col} className={`px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center font-mono font-semibold text-blue-700 ${colIndex < COLUMNS_TO_DISPLAY.length - 1 ? 'border-r border-dashed border-gray-300' : ''}`}>
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
                           <td key={col} className={`px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center ${colIndex < COLUMNS_TO_DISPLAY.length - 1 ? 'border-r border-dashed border-gray-300' : ''}`}>
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
