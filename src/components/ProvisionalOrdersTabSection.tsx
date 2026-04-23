'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { runtimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProvisionalOrder {
  [key: string]: any;
}

interface PaginationState {
  currentPage: number;
  totalRegistros: number;
  rowsPerPage: number;
}

interface ProvisionalOrdersTabSectionProps {
  readonly externalFilters?: Record<string, string[]>;
}

export const ProvisionalOrdersTabSection: React.FC<ProvisionalOrdersTabSectionProps> = ({ externalFilters }) => {
  const { addNotification } = useAppContext();

  const [orders, setOrders] = useState<ProvisionalOrder[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalRegistros: 0,
    rowsPerPage: 20,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isInitialLoadDone = useRef(false);

  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({
    MATERIAL: '',
    CATEGORIA: '',
    FECHAINICIO: '',
    RESPCONTROLPROD: '',
    MAQUINA: '',
  });

  /**
   * FUNCIÓN MAESTRA: Extrae las partes de la fecha SIN usar el objeto Date de JS.
   * Esto garantiza que el día sea el mismo que está en la base de datos (p.ej. 2026-04-29).
   */
  const safeParseDateParts = (value: any) => {
    if (!value) return null;
    const str = String(value).trim();
    
    // Intenta formato YYYY-MM-DD (captura los primeros 10 caracteres)
    const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymd) return { y: ymd[1], m: ymd[2], d: ymd[3] };
    
    // Intenta formato DD/MM/YYYY
    const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmy) return { y: dmy[3], m: dmy[2].padStart(2, '0'), d: dmy[1].padStart(2, '0') };
    
    return null;
  };

  const formatValueForDisplay = (col: string, value: any): string => {
    if (value === null || value === undefined) return '—';
    const upperCol = col.toUpperCase().trim();
    
    if (upperCol.includes('FECHA')) {
      const parts = safeParseDateParts(value);
      if (parts) {
        // Retornamos el formato legible DD/MM/YYYY extraído directamente del texto
        return `${parts.d}/${parts.m}/${parts.y}`;
      }
      return String(value);
    }
    
    return String(value);
  };

  const handleColumnFilterChange = (column: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [column.toUpperCase()]: value }));
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const fetchData = useCallback(async () => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      const response = await serviciosService.OrdenesProvisionalesPaginados(1, 10000);
      
      if (response && response.data) {
        setOrders(response.data);
        setPagination(prev => ({
          ...prev,
          totalRegistros: response.totalRegistros || response.data.length,
          currentPage: 1
        }));
        
        runtimeInspector.captureVariable('ProvisionalOrdersTab', 'component', 'loadedOrdersCount', response.data.length);
      }
    } catch (err) {
      const errorMessage = (err as Error).message;
      addNotification('error', `Error al cargar órdenes: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, isLoading]);

  useEffect(() => {
    if (!isInitialLoadDone.current) {
      fetchData();
      isInitialLoadDone.current = true;
    }
  }, [fetchData]);

  const filteredOrders = useMemo(() => {
    let result = orders;

    if (externalFilters && Object.keys(externalFilters).length > 0) {
      result = result.filter(order => {
        return Object.entries(externalFilters).every(([filterKey, allowedValues]) => {
          if (!allowedValues || allowedValues.length === 0) return true;
          const normFilterKey = filterKey.toUpperCase().trim();
          const orderKey = Object.keys(order).find(k => k.toUpperCase().trim() === normFilterKey);
          if (!orderKey) return true;
          const orderValue = String(order[orderKey] ?? '').trim().toUpperCase();
          return allowedValues.some(val => val.trim().toUpperCase() === orderValue);
        });
      });
    }

    result = result.filter(order => {
      return Object.entries(columnFilters).every(([filterKey, filterValue]) => {
        if (!filterValue) return true;
        const orderKey = Object.keys(order).find(k => k.toUpperCase().trim() === filterKey);
        if (!orderKey) return true;
        const orderValue = formatValueForDisplay(orderKey, order[orderKey]).toLowerCase();
        return orderValue.includes(filterValue.toLowerCase());
      });
    });

    return result;
  }, [orders, externalFilters, columnFilters]);

  const columns = useMemo(() => {
    if (filteredOrders.length === 0) return [];
    const allKeys = Object.keys(filteredOrders[0]);
    // RAW_FECHA_BACKEND es una columna virtual de diagnóstico
    const priority = ['ORDENPREVISIONAL', 'MATERIAL', 'TEXTOMATERIAL', 'FECHAINICIO', 'RAW_FECHA_BACKEND', 'CATEGORIA', 'CANTIDAD', 'UNIDAD', 'FECHAFIN'];
    return [...priority.filter(k => allKeys.includes(k) || k === 'RAW_FECHA_BACKEND'), ...allKeys.filter(k => !priority.includes(k))];
  }, [filteredOrders]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pagination.rowsPerPage));
  
  const displayedOrders = useMemo(() => {
    const start = (pagination.currentPage - 1) * pagination.rowsPerPage;
    return filteredOrders.slice(start, start + pagination.rowsPerPage);
  }, [filteredOrders, pagination.currentPage, pagination.rowsPerPage]);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
          <table className="min-w-full divide-y divide-gray-200 border-collapse">
            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
              <tr>
                {columns.map((col) => (
                  <th 
                    key={col} 
                    className={cn(
                      "px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider whitespace-nowrap bg-gray-50 border-b",
                      col === 'RAW_FECHA_BACKEND' ? "text-red-600 bg-red-50" : "text-gray-600"
                    )}
                  >
                    {col === 'RAW_FECHA_BACKEND' ? 'FECHA (RAW JSON)' : col}
                  </th>
                ))}
              </tr>
              <tr className="bg-gray-50/50">
                {columns.map((col) => {
                  const upperCol = col.toUpperCase().trim();
                  const isFilterable = ['MATERIAL', 'CATEGORIA', 'FECHAINICIO', 'RESPCONTROLPROD', 'MAQUINA'].includes(upperCol);
                  
                  return (
                    <th key={`filter-${col}`} className="px-2 py-2 bg-gray-50 border-b border-gray-200">
                      {isFilterable ? (
                        <div className="relative">
                          <Search className="absolute left-2 top-1.5 h-3 w-3 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Buscar..."
                            value={columnFilters[upperCol] || ''}
                            onChange={(e) => handleColumnFilterChange(upperCol, e.target.value)}
                            className="w-full text-[10px] pl-7 pr-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary outline-none font-normal bg-white"
                          />
                        </div>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {isLoading && orders.length === 0 ? (
                <tr>
                  <td colSpan={columns.length || 1} className="py-24 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-2" />
                    <span className="text-gray-500 font-medium">Consultando servidor...</span>
                  </td>
                </tr>
              ) : displayedOrders.length > 0 ? (
                displayedOrders.map((order, idx) => (
                  <tr key={`order-row-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                    {columns.map((col) => (
                      <td 
                        key={`cell-${idx}-${col}`} 
                        className={cn(
                          "px-4 py-2.5 whitespace-nowrap text-[11px] font-mono",
                          col === 'RAW_FECHA_BACKEND' ? "text-red-700 bg-red-50/30" : "text-gray-600"
                        )}
                      >
                        {col === 'RAW_FECHA_BACKEND' 
                          ? JSON.stringify(order['FECHAINICIO']) 
                          : formatValueForDisplay(col, order[col])}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length || 1} className="py-20 text-center text-gray-400 italic bg-gray-50/50">
                    No se encontraron registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-3 px-4 bg-gray-50 rounded-lg border border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Filas:</span>
            <select
              value={pagination.rowsPerPage}
              onChange={(e) => setPagination(prev => ({ ...prev, rowsPerPage: Number(e.target.value), currentPage: 1 }))}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              {[20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">
            {filteredOrders.length} registros filtrados
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" onClick={() => setPagination(prev => ({ ...prev, currentPage: 1 }))} disabled={pagination.currentPage === 1} className="h-8 w-8"><ChevronsLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))} disabled={pagination.currentPage === 1} className="h-8 w-8"><ChevronLeft className="h-4 w-4" /></Button>
            <div className="px-4 text-[11px] font-bold text-gray-700 min-w-[120px] text-center border-x py-1 bg-white rounded">Página {pagination.currentPage} de {totalPages}</div>
            <Button variant="outline" size="icon" onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))} disabled={pagination.currentPage === totalPages} className="h-8 w-8"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => setPagination(prev => ({ ...prev, currentPage: totalPages }))} disabled={pagination.currentPage === totalPages} className="h-8 w-8"><ChevronsRight className="h-4 w-4" /></Button>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading} className="h-8 px-4 bg-white" title="Actualizar datos"><RefreshCw className={cn("h-3 w-3 mr-2", isLoading && "animate-spin")} /> Actualizar</Button>
        </div>
      </div>
    </div>
  );
};
