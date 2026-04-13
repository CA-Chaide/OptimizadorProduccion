'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const [error, setError] = useState<string | null>(null);

  // Carga inicial de datos
  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Consultamos un lote representativo para filtrado local (MVP: 10k registros)
        // Esto evita múltiples llamadas lentas a la API mientras se navega localmente
        const response = await serviciosService.OrdenesProvisionalesPaginados(1, 10000);
        
        if (response && response.data) {
          setOrders(response.data);
          setPagination(prev => ({
            ...prev,
            totalRegistros: response.totalRegistros || response.data.length,
          }));
          
          inspector.captureVariable('loadedOrdersCount', response.data.length);
        }
      } catch (err) {
        const errorMessage = (err as Error).message;
        setError(errorMessage);
        addNotification('error', `Error al cargar órdenes: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [addNotification, inspector]);

  // Lógica de filtrado basada en restricciones externas (RespCtrlProd y ALMACEN)
  const filteredOrders = useMemo(() => {
    if (!externalFilters || Object.keys(externalFilters).length === 0) return orders;

    return orders.filter(order => {
      return Object.entries(externalFilters).every(([filterKey, allowedValues]) => {
        if (!allowedValues || allowedValues.length === 0) return true;

        // Normalización básica para búsqueda de columnas
        const normFilterKey = filterKey.toUpperCase().trim();
        
        // Buscamos la columna en la orden que coincida con el nombre de la restricción
        const orderKey = Object.keys(order).find(k => k.toUpperCase().trim() === normFilterKey);
        if (!orderKey) return true;

        const orderValue = String(order[orderKey] ?? '').trim().toUpperCase();
        
        // El valor de la celda debe estar en la lista de valores de la restricción
        return allowedValues.some(val => val.trim().toUpperCase() === orderValue);
      });
    });
  }, [orders, externalFilters]);

  // Columnas dinámicas basadas en los datos filtrados
  const columns = useMemo(() => {
    if (filteredOrders.length === 0) return [];
    // Obtenemos todas las llaves del primer objeto para las cabeceras
    return Object.keys(filteredOrders[0]);
  }, [filteredOrders]);

  // Paginación local sobre datos filtrados
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pagination.rowsPerPage));
  const displayedOrders = useMemo(() => {
    const start = (pagination.currentPage - 1) * pagination.rowsPerPage;
    return filteredOrders.slice(start, start + pagination.rowsPerPage);
  }, [filteredOrders, pagination.currentPage, pagination.rowsPerPage]);

  // Resetear a página 1 si cambian los filtros
  useEffect(() => {
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  }, [externalFilters]);

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-gray-500 font-medium">Cargando órdenes previsionales...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Resumen de Filtros Aplicados */}
      {externalFilters && Object.keys(externalFilters).length > 0 && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <Filter className="w-4 h-4 text-amber-600" />
          <div className="flex flex-wrap gap-2">
            <span className="text-xs font-semibold text-amber-800 uppercase">Filtros Activos:</span>
            {Object.entries(externalFilters).map(([key, values]) => (
              <Badge key={key} variant="outline" className="bg-white border-amber-300 text-amber-700 text-[10px]">
                {key}: {values.join(', ')}
              </Badge>
            ))}
          </div>
          <span className="ml-auto text-xs font-bold text-amber-700">
            {filteredOrders.length.toLocaleString()} resultados
          </span>
        </div>
      )}

      {/* Tabla con scroll y cabecera pegajosa */}
      <div className="bg-white rounded-md border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[65vh]">
          <table className="min-w-full divide-y divide-gray-200 border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
              <tr>
                {columns.map((col) => (
                  <th 
                    key={col} 
                    className="px-4 py-3 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap border-b"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {displayedOrders.length > 0 ? (
                displayedOrders.map((order, idx) => (
                  <tr key={`order-row-${idx}`} className="hover:bg-blue-50/30 transition-colors">
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
                  <td colSpan={columns.length || 1} className="py-20 text-center text-gray-400 italic">
                    No se encontraron órdenes que coincidan con los criterios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Controles de Paginación */}
      {filteredOrders.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-medium">Filas por página:</span>
            <select
              value={pagination.rowsPerPage}
              onChange={(e) => setPagination(prev => ({ ...prev, rowsPerPage: Number(e.target.value), currentPage: 1 }))}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, currentPage: 1 }))}
              disabled={pagination.currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage - 1 }))}
              disabled={pagination.currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="px-4 text-xs font-semibold text-gray-700">
              Página {pagination.currentPage} de {totalPages}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, currentPage: prev.currentPage + 1 }))}
              disabled={pagination.currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPagination(prev => ({ ...prev, currentPage: totalPages }))}
              disabled={pagination.currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
