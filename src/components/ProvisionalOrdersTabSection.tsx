'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package, Check, ChevronsUpDown, Calendar, LayoutDashboard } from 'lucide-react';
import type { ProvisionalOrder } from '@/types/interfaces';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ProvisionalOrdersTabSectionProps {
  respCodes?: string[];
}

interface PaginationState {
  currentPage: number;
  totalRegistros: number;
  pageSize: number;
  isExploring: boolean;
  rowsPerPage: number;
}

// MultiSelect component for Date filtering
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
            <CommandEmpty>No hay resultados.</CommandEmpty>
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

export const ProvisionalOrdersTabSection: React.FC<ProvisionalOrdersTabSectionProps> = ({ respCodes }) => {
  const inspector = useRuntimeInspector('ProvisionalOrdersTab');
  const { addNotification } = useAppContext();

  const [orders, setOrders] = useState<ProvisionalOrder[]>([]);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalRegistros: 0,
    pageSize: 20000,
    isExploring: true,
    rowsPerPage: 20,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const lastScrolledRef = useRef<'top' | 'table' | null>(null);

  const COLUMNS_TO_DISPLAY = [
    'FECHAINICIO', 'Maquina', 'ORDENPREVISIONAL', 'MATERIAL', 'NOMBRE', 'CANTIDAD', 'UNIDAD', 
    'FECHAFIN', 'RESPCONTROLPROD', 'Centro', 'Almacen', 'ClaseOrden', 'CodMaterial', 'CATEGORIA'
  ];

  useEffect(() => {
    const performExploration = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await serviciosService.OrdenesProvisionalesPaginados(1, 1);
        
        if (response.data && response.data.length > 0) {
          const total = response.totalRegistros || 0;
          setPagination(prev => ({
            ...prev,
            totalRegistros: total,
            isExploring: false,
          }));

          const BATCH_SIZE = 20000;
          const pageResponse = await serviciosService.OrdenesProvisionalesPaginados(1, BATCH_SIZE);
          if (pageResponse.data) {
            const dataArray = Array.isArray(pageResponse.data) ? pageResponse.data : [pageResponse.data];
            setOrders(dataArray);
          }
        }
      } catch (err) {
        const errorMessage = (err as Error).message;
        setError(errorMessage);
        addNotification('error', `Error al cargar órdenes: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    performExploration();
  }, [addNotification, pagination.pageSize]);

  // Extract unique dates for the dropdown
  const uniqueDates = useMemo(() => {
    const dates = new Set(orders.map(o => o.FECHAINICIO));
    return Array.from(dates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
      .map(d => ({ value: d, label: d }));
  }, [orders]);

  // Filter logic
  const filteredOrders = useMemo(() => {
    const validCodes = respCodes || ['026', '033', '042', '037', '036', '044'];
    
    return orders.filter(order => {
      const respCode = String(order.RESPCONTROLPROD || '').trim();
      const codeMatch = validCodes.includes(respCode);
      const dateMatch = selectedDates.length === 0 || selectedDates.includes(order.FECHAINICIO);
      return codeMatch && dateMatch;
    });
  }, [orders, respCodes, selectedDates]);

  // Summary logic
  const totalCantidadPlanchas = useMemo(() => {
    return filteredOrders.reduce((sum, order) => sum + (Number(order.CANTIDAD) || 0), 0);
  }, [filteredOrders]);

  const totalPagesLocal = Math.ceil(filteredOrders.length / pagination.rowsPerPage);
  const startIndex = (pagination.currentPage - 1) * pagination.rowsPerPage;
  const endIndex = startIndex + pagination.rowsPerPage;
  const displayedOrders = filteredOrders.slice(startIndex, endIndex);

  // Pagination Handlers
  const handlePrevious = () => {
    if (pagination.currentPage > 1) {
      setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }));
    }
  };

  const handleNext = () => {
    if (pagination.currentPage < totalPagesLocal) {
      setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }));
    }
  };

  const handleRowsPerPageChange = (newRowsPerPage: number) => {
    setPagination(prev => ({ ...prev, rowsPerPage: newRowsPerPage, currentPage: 1 }));
  };

  // Scroll Sync logic
  const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (lastScrolledRef.current === 'table') { lastScrolledRef.current = null; return; }
    if (tableScrollRef.current) {
      lastScrolledRef.current = 'top';
      tableScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (lastScrolledRef.current === 'top') { lastScrolledRef.current = null; return; }
    if (topScrollRef.current) {
      lastScrolledRef.current = 'table';
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };
  
  useEffect(() => {
    const calculateWidth = () => {
      if (tableRef.current) setTableWidth(tableRef.current.offsetWidth);
    };
    calculateWidth();
    window.addEventListener('resize', calculateWidth);
    const resizeObserver = new ResizeObserver(calculateWidth);
    if (tableRef.current) resizeObserver.observe(tableRef.current);
    return () => {
      window.removeEventListener('resize', calculateWidth);
      if (tableRef.current) resizeObserver.unobserve(tableRef.current);
    };
  }, [displayedOrders]);


  if (isLoading && orders.length === 0) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
        <span className="ml-3 text-gray-600">Cargando Órdenes...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters and Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Date Filter Dropdown */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
          <h4 className="text-[13px] font-bold text-gray-800 mb-2 uppercase tracking-wide flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-600" /> Filtro de Fecha
          </h4>
          <MultiSelect
            options={uniqueDates}
            selected={selectedDates}
            onChange={(dates) => {
              setSelectedDates(dates);
              setPagination(prev => ({ ...prev, currentPage: 1 }));
            }}
            placeholder="Todas las fechas (FECHAINICIO)"
          />
        </div>

        {/* Quantity Summary Card */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
          <h4 className="text-[13px] font-bold text-gray-800 mb-2 uppercase tracking-wide flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4 text-indigo-600" /> Resumen Informativo
          </h4>
          <div className="bg-white border rounded-md p-3 h-full flex flex-col justify-center text-center">
            <p className="text-[11px] text-gray-500 font-semibold uppercase">TOTAL PLANCHAS (CANTIDAD)</p>
            <p className="text-2xl font-bold text-indigo-700">{totalCantidadPlanchas.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Top Scrollbar */}
      <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden" style={{ height: '18px' }}>
          <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden border">
        <div ref={tableScrollRef} onScroll={handleTableScroll} className="overflow-x-auto">
          <table ref={tableRef} className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {COLUMNS_TO_DISPLAY.map((col, index) => (
                  <th
                    key={col}
                    className={cn(
                      "px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider",
                      index < COLUMNS_TO_DISPLAY.length - 1 && "border-r border-dashed border-gray-300"
                    )}
                  >
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayedOrders.length > 0 ? displayedOrders.map((order, index) => (
                <tr key={`${order.ORDENPREVISIONAL}-${index}`} className="hover:bg-gray-50 transition-colors">
                  {COLUMNS_TO_DISPLAY.map((col, colIndex) => {
                    let displayValue = String((order as any)[col] ?? '-');
                    
                    if (col === 'MATERIAL' && displayValue !== '-') {
                      const num = parseInt(displayValue, 10);
                      if (!isNaN(num)) displayValue = num.toString();
                    }

                    return (
                      <td key={col} className={cn(
                        "px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center",
                        col === 'CANTIDAD' && "font-bold text-indigo-700",
                        colIndex < COLUMNS_TO_DISPLAY.length - 1 && "border-r border-dashed border-gray-300"
                      )}>
                        {displayValue}
                      </td>
                    );
                  })}
                </tr>
              )) : (
                <tr>
                  <td colSpan={COLUMNS_TO_DISPLAY.length} className="px-6 py-10 text-center text-gray-500 italic">
                    No se encontraron órdenes para los criterios seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">
            Mostrando {startIndex + 1} a {Math.min(endIndex, filteredOrders.length)} de {filteredOrders.length} registros.
          </span>
          <select
            value={pagination.rowsPerPage}
            onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {[10, 20, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => setPagination(prev => ({ ...prev, currentPage: 1 }))} disabled={pagination.currentPage === 1}>Primera</Button>
          <Button variant="outline" size="sm" onClick={handlePrevious} disabled={pagination.currentPage === 1}>Anterior</Button>
          <span className="text-sm text-gray-600 px-2">Página <strong>{pagination.currentPage}</strong> de <strong>{totalPagesLocal}</strong></span>
          <Button variant="outline" size="sm" onClick={handleNext} disabled={pagination.currentPage >= totalPagesLocal}>Siguiente</Button>
          <Button variant="outline" size="sm" onClick={() => setPagination(prev => ({ ...prev, currentPage: totalPagesLocal }))} disabled={pagination.currentPage >= totalPagesLocal}>Última</Button>
        </div>
      </div>
    </div>
  );
};
