'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package, Filter } from 'lucide-react';

interface ProvisionalOrder {
  [key: string]: any;
}

interface PaginationState {
  currentPage: number;
  totalRegistros: number;
  pageSize: number;
  isExploring: boolean;
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
    pageSize: 1,
    isExploring: true,
    rowsPerPage: 20,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Initial exploration to know the total records and load initial set
  useEffect(() => {
    const performExploration = async () => {
      try {
        setIsLoading(true);
        setError(null);
        logger.log('[ProvisionalOrdersTab] Iniciando exploración inicial...');
        
        // Exploración para obtener el total
        const response = await serviciosService.OrdenesProvisionalesPaginados(1, 1);
        
        if (response.data) {
          const total = response.totalRegistros || 0;
          logger.log(`[ProvisionalOrdersTab] Total de registros en DB: ${total}`);
          inspector.captureVariable('totalRegistrosDB', total);
          
          // Cargar un lote grande para filtrado local (MVP: 20k registros)
          const pageResponse = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
          if (pageResponse.data) {
            setOrders(pageResponse.data);
            setPagination(prev => ({
              ...prev,
              totalRegistros: total,
              isExploring: false,
            }));
            logger.log(`[ProvisionalOrdersTab] Cargados ${pageResponse.data.length} registros para procesamiento local.`);
          }
        }
      } catch (err) {
        const errorMessage = (err as Error).message;
        logger.error(`[ProvisionalOrdersTab] Error en carga: ${errorMessage}`);
        setError(errorMessage);
        addNotification('error', `Error al cargar órdenes: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    performExploration();
  }, [addNotification, inspector]);

  // Aplicar filtros externos (Restricciones del grupo)
  const filteredOrders = useMemo(() => {
    if (!externalFilters || Object.keys(externalFilters).length === 0) return orders;

    return orders.filter(order => {
      return Object.entries(externalFilters).every(([filterKey, allowedValues]) => {
        if (!allowedValues || allowedValues.length === 0) return true;

        // Normalización para comparación insensible a mayúsculas y acentos
        const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const normFilterKey = normalize(filterKey);

        // Buscar la columna correspondiente en el objeto de la orden
        const orderKey = Object.keys(order).find(k => normalize(k) === normFilterKey);
        if (!orderKey) return true;

        const orderValue = String(order[orderKey] ?? '').trim();
        // El valor de la orden debe estar en la lista de valores permitidos por la restricción
        return allowedValues.some(val => val.trim() === orderValue);
      });
    });
  }, [orders, externalFilters]);

  // Determinar las columnas dinámicamente basándose en los registros filtrados
  const columns = useMemo(() => {
    if (filteredOrders.length === 0) return [];
    return Object.keys(filteredOrders[0]);
  }, [filteredOrders]);

  // Paginación sobre los datos filtrados
  const totalPagesLocal = Math.max(1, Math.ceil(filteredOrders.length / pagination.rowsPerPage));
  const startIndex = (pagination.currentPage - 1) * pagination.rowsPerPage;
  const endIndex = startIndex + pagination.rowsPerPage;
  const displayedOrders = filteredOrders.slice(startIndex, endIndex);

  // Asegurar que la página actual sea válida si cambian los filtros
  useEffect(() => {
    if (pagination.currentPage > totalPagesLocal) {
      setPagination(prev => ({ ...prev, currentPage: 1 }));
    }
  }, [filteredOrders.length, totalPagesLocal, pagination.currentPage]);

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
    setPagination(prev => ({
      ...prev,
      rowsPerPage: newRowsPerPage,
      currentPage: 1,
    }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Package className="w-6 h-6 text-gray-700" />
          <h3 className="text-xl font-semibold text-gray-700">Explorador de Órdenes Previsionales</h3>
        </div>
        
        {externalFilters && Object.keys(externalFilters).length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-xs font-medium text-amber-700">
            <Filter className="w-3 h-3" />
            Filtrado por restricciones de grupo ({Object.keys(externalFilters).join(', ')})
          </div>
        )}
      </div>

      {/* Info Card */}
      {!isLoading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex flex-wrap gap-y-2 gap-x-6 text-sm text-blue-800">
            <p><span className="font-semibold">Total DB:</span> {pagination.totalRegistros.toLocaleString()}</p>
            <p><span className="font-semibold">En Memoria:</span> {orders.length.toLocaleString()}</p>
            <p><span className="font-semibold">Cumplen Filtros:</span> <span className="font-bold text-indigo-700">{filteredOrders.length.toLocaleString()}</span></p>
            <p><span className="font-semibold">Columnas:</span> {columns.length}</p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800 font-medium">Error: {error}</p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col justify-center items-center py-12 space-y-4">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
          <span className="text-sm font-medium text-gray-500">Cargando y procesando órdenes...</span>
        </div>
      )}

      {/* Table */}
      {!isLoading && filteredOrders.length > 0 ? (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div className="overflow-x-auto max-h-[600px]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  {columns.map((col) => (
                    <th 
                      key={col} 
                      className="px-4 py-3 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap border-b border-gray-200"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {displayedOrders.map((order, index) => (
                  <tr key={`order-${index}`} className="hover:bg-gray-50 transition-colors">
                    {columns.map((col) => (
                      <td 
                        key={`${index}-${col}`} 
                        className="px-4 py-2.5 whitespace-nowrap text-[11px] text-gray-600 font-mono"
                      >
                        {order[col] !== null && order[col] !== undefined ? String(order[col]) : '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
          <Package className="w-16 h-16 mb-4 text-gray-300" />
          <p className="text-lg font-medium">No se encontraron órdenes</p>
          <p className="text-sm">Ajuste los filtros o las restricciones del grupo para ver resultados.</p>
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && filteredOrders.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-lg shadow border border-gray-200 gap-4">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-semibold text-gray-700">Filas por página:</label>
            <select
              value={pagination.rowsPerPage}
              onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={handlePrevious}
              disabled={pagination.currentPage === 1}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>

            <span className="text-sm text-gray-600 font-medium">
              Página <span className="text-indigo-700 font-bold">{pagination.currentPage}</span> de <span className="font-bold">{totalPagesLocal}</span>
            </span>

            <button
              onClick={handleNext}
              disabled={pagination.currentPage === totalPagesLocal}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
