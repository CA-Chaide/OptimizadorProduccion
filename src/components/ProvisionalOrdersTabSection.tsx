'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, RefreshCw } from 'lucide-react';
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
  const inspector = useRuntimeInspector('ProvisionalOrdersTab');
  const { addNotification } = useAppContext();

  const [orders, setOrders] = useState<ProvisionalOrder[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalRegistros: 0,
    rowsPerPage: 20,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const isMounted = useRef(false);

  // Carga de datos estable
  const fetchData = useCallback(async () => {
    if (isLoading) return;
    
    try {
      setIsLoading(true);
      // Consultamos un lote grande para permitir el filtrado dinámico local en esta fase MVP
      const response = await serviciosService.OrdenesProvisionalesPaginados(1, 10000);
      
      if (response && response.data) {
        setOrders(response.data);
        setPagination(prev => ({
          ...prev,
          totalRegistros: response.totalRegistros || response.data.length,
          currentPage: 1
        }));
        
        inspector.captureVariable('loadedOrdersCount', response.data.length);
      }
    } catch (err) {
      const errorMessage = (err as Error).message;
      addNotification('error', `Error al cargar órdenes: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector, isLoading]);

  // Cargar al montar una sola vez
  useEffect(() => {
    if (!isMounted.current) {
      fetchData();
      isMounted.current = true;
    }
  }, [fetchData]);

  // Lógica de filtrado basada en restricciones externas (RespCtrlProd y ALMACEN)
  const filteredOrders = useMemo(() => {
    if (!externalFilters || Object.keys(externalFilters).length === 0) return orders;

    return orders.filter(order => {
      return Object.entries(externalFilters).every(([filterKey, allowedValues]) => {
        if (!allowedValues || allowedValues.length === 0) return true;

        const normFilterKey = filterKey.toUpperCase().trim();
        const orderKey = Object.keys(order).find(k => k.toUpperCase().trim() === normFilterKey);
        
        if (!orderKey) return true;

        const orderValue = String(order[orderKey] ?? '').trim().toUpperCase();
        return allowedValues.some(val => val.trim().toUpperCase() === orderValue);
      });
    });
  }, [orders, externalFilters]);

  // Columnas dinámicas
  const columns = useMemo(() => {
    if (filteredOrders.length === 0) return [];
    return Object.keys(filteredOrders[0]);
  }, [filteredOrders]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pagination.rowsPerPage));
  
  const displayedOrders = useMemo(() => {
    const start = (pagination.currentPage - 1) * pagination.rowsPerPage;
    return filteredOrders.slice(start, start + pagination.rowsPerPage);
  }, [filteredOrders, pagination.currentPage, pagination.rowsPerPage]);

  // Resetear a página 1 si cambian los filtros
  useEffect(() => {
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  }, [externalFilters]);

  return (
    <div className="space-y-4">
      {/* Controles Superiores de Paginación */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-2 bg-gray-50/50 p-4 rounded-lg border">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-bold uppercase">Filas:</span>
            <select
              value={pagination.rowsPerPage}
              onChange={(e) => setPagination(prev => ({ ...prev, rowsPerPage: Number(e.target.value), currentPage: 1 }))}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={isLoading} className="h-8">
            <RefreshCw className={cn("h-3 w-3 mr-2", isLoading && "animate-spin")} />
            Actualizar
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPagination(prev => ({ ...prev, currentPage: 1 }))}
            disabled={pagination.currentPage === 1 || isLoading}
            className="h-8 w-8"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
            disabled={pagination.currentPage === 1 || isLoading}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="px-4 text-xs font-bold text-gray-700 min-w-[120px] text-center">
            Página {pagination.currentPage} de {totalPages}
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
            disabled={pagination.currentPage === totalPages || isLoading}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setPagination(prev => ({ ...prev, currentPage: totalPages }))}
            disabled={pagination.currentPage === totalPages || isLoading}
            className="h-8 w-8"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabla Dinámica con Scroll Doble */}
      <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto max-h-[60vh]">
          <table className="min-w-full divide-y divide-gray-200 border-collapse">
            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
              <tr>
                {columns.map((col) => (
                  <th 
                    key={col} 
                    className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap border-b bg-gray-50"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {isLoading && orders.length === 0 ? (
                <tr>
                  <td colSpan={columns.length || 1} className="py-24 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                      <span className="text-gray-500 font-medium">Cargando órdenes previsionales...</span>
                    </div>
                  </td>
                </tr>
              ) : displayedOrders.length > 0 ? (
                displayedOrders.map((order, idx) => (
                  <tr key={`order-row-${idx}`} className="hover:bg-blue-50/40 transition-colors">
                    {columns.map((col) => (
                      <td 
                        key={`cell-${idx}-${col}`} 
                        className="px-4 py-2.5 whitespace-nowrap text-[11px] text-gray-600 font-mono"
                      >
                        {order[col] !== null && order[col] !== undefined ? String(order[col]) : '—'}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length || 1} className="py-20 text-center text-gray-400 italic bg-gray-50/50">
                    No se encontraron órdenes que coincidan con los criterios de filtrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen Final */}
      {!isLoading && filteredOrders.length > 0 && (
        <div className="mt-2 flex justify-end text-[10px] text-gray-400 uppercase font-bold tracking-widest">
          Total {filteredOrders.length} registros filtrados de {orders.length} totales
        </div>
      )}
    </div>
  );
};