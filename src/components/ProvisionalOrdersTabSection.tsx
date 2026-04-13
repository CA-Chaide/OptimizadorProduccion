'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package } from 'lucide-react';

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

export const ProvisionalOrdersTabSection: React.FC = () => {
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

  // Determinar las columnas dinámicamente basándose en el primer registro
  const columns = useMemo(() => {
    if (orders.length === 0) return [];
    return Object.keys(orders[0]);
  }, [orders]);

  // Initial exploration to know the total records
  useEffect(() => {
    const performExploration = async () => {
      try {
        setIsLoading(true);
        setError(null);
        logger.log('[ProvisionalOrdersTab] Iniciando exploración inicial con 1 fila...');
        
        const response = await serviciosService.OrdenesProvisionalesPaginados(1, 1);
        
        if (response.data && response.data.length > 0) {
          const total = response.totalRegistros || 0;
          logger.log(`[ProvisionalOrdersTab] Exploración completada. Total de registros: ${total}`);
          inspector.captureVariable('totalRegistros', total);
          
          setPagination(prev => ({
            ...prev,
            totalRegistros: total,
            pageSize: 20000,
            isExploring: false,
          }));

          addNotification('success', `Se encontraron ${total} órdenes previsionales. Cargando tabla...`);
          
          // Cargar la primera página después de la exploración
          setIsLoading(true);
          const pageResponse = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
          if (pageResponse.data) {
            setOrders(pageResponse.data);
            logger.log(`[ProvisionalOrdersTab] Primera página cargada con ${pageResponse.data.length} registros`);
          }
        } else {
          throw new Error('No se obtuvieron datos en la exploración');
        }
      } catch (err) {
        const errorMessage = (err as Error).message;
        logger.error(`[ProvisionalOrdersTab] Error en exploración: ${errorMessage}`);
        setError(errorMessage);
        addNotification('error', `Error al explorar órdenes: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    performExploration();
  }, [addNotification, inspector]);

  const totalPagesLocal = Math.ceil(orders.length / pagination.rowsPerPage);
  
  const startIndex = (pagination.currentPage - 1) * pagination.rowsPerPage;
  const endIndex = startIndex + pagination.rowsPerPage;
  const displayedOrders = orders.slice(startIndex, endIndex);

  const handlePrevious = () => {
    if (pagination.currentPage > 1) {
      setPagination(prev => ({
        ...prev,
        currentPage: prev.currentPage - 1,
      }));
    }
  };

  const handleNext = () => {
    if (pagination.currentPage < totalPagesLocal) {
      setPagination(prev => ({
        ...prev,
        currentPage: prev.currentPage + 1,
      }));
    }
  };

  const handleLoadPage = (page: number) => {
    setPagination(prev => ({
      ...prev,
      currentPage: page,
    }));
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
      <div className="flex items-center space-x-3">
        <Package className="w-6 h-6 text-gray-700" />
        <h3 className="text-xl font-semibold text-gray-700">Datos de Órdenes Previsionales</h3>
      </div>

      {/* Info Card */}
      {pagination.totalRegistros > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Total de registros (Base de Datos):</span> {pagination.totalRegistros.toLocaleString()} | 
            <span className="font-semibold ml-4">Registros en memoria:</span> {orders.length.toLocaleString()} | 
            <span className="font-semibold ml-4">Columnas detectadas:</span> {columns.length}
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">
            <span className="font-semibold">Error:</span> {error}
          </p>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
          <span className="ml-3 text-gray-600">Procesando datos...</span>
        </div>
      )}

      {/* Table */}
      {!isLoading && orders.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
          <div className="overflow-x-auto max-h-[600px]">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  {columns.map((col) => (
                    <th 
                      key={col} 
                      className="px-4 py-3 text-left text-[10px] font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap bg-gray-100 border-b border-gray-200"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {displayedOrders.map((order, index) => (
                  <tr key={`row-${index}`} className="hover:bg-gray-50 transition-colors">
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
      )}

      {/* Pagination Controls */}
      {!isLoading && orders.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between bg-white p-4 rounded-lg shadow border border-gray-200 gap-4">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-semibold text-gray-700">Filas por página:</label>
            <select
              value={pagination.rowsPerPage}
              onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
              className="px-3 py-1.5 border border-gray-300 rounded-md text-sm bg-white font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
            >
              ← Anterior
            </button>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600 font-medium">
                Página <span className="font-bold text-indigo-700">{pagination.currentPage}</span> de <span className="font-bold">{totalPagesLocal}</span>
              </span>
            </div>

            <button
              onClick={handleNext}
              disabled={pagination.currentPage === totalPagesLocal}
              className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente →
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && orders.length === 0 && pagination.totalRegistros === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50">
          <Package className="w-16 h-16 mb-4 text-gray-300" />
          <p className="text-lg font-medium">No hay órdenes previsionales disponibles</p>
          <p className="text-sm">Asegúrese de que el servicio esté respondiendo correctamente.</p>
        </div>
      )}
    </div>
  );
};
