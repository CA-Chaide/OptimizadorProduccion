'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package, Loader2 } from 'lucide-react';

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
        <div className="overflow-x-auto border rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-100">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedOrders.map((order, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    {columns.map((col) => (
                         <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                           {String(order[col] ?? '-')}
                         </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Mostrando {paginatedOrders.length > 0 ? (currentPage - 1) * rowsPerPage + 1 : 0} a {Math.min(currentPage * rowsPerPage, orders.length)} de {orders.length} órdenes.
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => goToPage(1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Primera
            </button>
            <button
              onClick={() => goToPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-sm">
              Página {currentPage} de {totalPages}
            </span>
            <button
              onClick={() => goToPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Siguiente
            </button>
             <button
              onClick={() => goToPage(totalPages)}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border rounded disabled:opacity-50"
            >
              Última
            </button>
          </div>
        </div>
    </div>
  );
};
