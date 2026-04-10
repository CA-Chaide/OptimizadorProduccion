'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package } from 'lucide-react';

interface OrdenFert {
  [key: string]: any;
}

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

export const OrdenesFertTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('OrdenesFertTab');
  const { addNotification } = useAppContext();

  const [orders, setOrders] = useState<OrdenFert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[1]);

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      setError(null);
      logger.log('[OrdenesFertTab] Fetching FERT orders...');
      try {
        const response = await serviciosService.getOrdenesFert();
        if (response.data) {
          const dataArray = Array.isArray(response.data) ? response.data : [response.data];
          setOrders(dataArray);
          logger.log(`[OrdenesFertTab] Loaded ${dataArray.length} FERT orders.`);
          if (dataArray.length > 0) {
            setColumns(Object.keys(dataArray[0]));
          }
          addNotification('success', `Se cargaron ${dataArray.length} órdenes FERT.`);
        } else {
          setOrders([]);
          addNotification('warning', 'No se encontraron órdenes FERT.');
        }
      } catch (err) {
        const errorMessage = (err as Error).message;
        logger.error(`[OrdenesFertTab] Error fetching orders: ${errorMessage}`);
        setError(errorMessage);
        addNotification('error', `Error al cargar órdenes FERT: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [addNotification]);

  const totalPages = Math.ceil(orders.length / rowsPerPage);
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * rowsPerPage;
    return orders.slice(startIndex, startIndex + rowsPerPage);
  }, [orders, currentPage, rowsPerPage]);

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRowsPerPage(Number(e.target.value));
    setCurrentPage(1); // Reset to first page
  };

  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;

  if (isLoading) {
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
      {/* Pagination Controls */}
      {!isLoading && orders.length > 0 && (
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-600">
                        Mostrando {startIndex + 1} a {Math.min(endIndex, orders.length)} de {orders.length} órdenes.
                    </span>
                    <label className="text-sm font-semibold text-gray-700">Filas por página:</label>
                    <select
                    value={rowsPerPage}
                    onChange={handleRowsPerPageChange}
                    className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                    {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                    </select>
                </div>

                <div className="flex items-center space-x-4">
                    <button
                    onClick={() => goToPage(1)}
                    disabled={currentPage === 1 || isLoading}
                    className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
                    >
                    Primera
                    </button>
                    <button
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1 || isLoading}
                    className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
                    >
                    ← Anterior
                    </button>

                    <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">
                        Página <span className="font-bold">{currentPage}</span> de <span className="font-bold">{totalPages}</span>
                    </span>
                    </div>

                    <button
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages || isLoading}
                    className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
                    >
                    Siguiente →
                    </button>
                    <button
                    onClick={() => goToPage(totalPages)}
                    disabled={currentPage === totalPages || isLoading}
                    className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
                    >
                    Última
                    </button>
                </div>
            </div>
      )}

      {/* Table */}
      {!isLoading && orders.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  {columns.map((col, index) => (
                    <th
                      key={col}
                      className={`px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider ${index < columns.length - 1 ? 'border-r border-dashed border-gray-300' : ''}`}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedOrders.map((order, index) => (
                  <tr key={`${order.ORDEN_PRODUCCION}-${index}`} className="hover:bg-gray-50">
                    {columns.map((col, colIndex) => (
                         <td key={col} className={`px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center ${colIndex < columns.length - 1 ? 'border-r border-dashed border-gray-300' : ''}`}>
                           {String(order[col] ?? '-')}
                         </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
