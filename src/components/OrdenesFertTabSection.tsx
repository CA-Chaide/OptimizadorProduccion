'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package } from 'lucide-react';
import type { OrdenFert, Restriccion } from '@/types/interfaces';

interface OrdenesFertTabSectionProps {
  restricciones: Restriccion[];
}

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

// Define static columns to ensure order and completeness
const COLUMNS_TO_DISPLAY = [
  'ORDEN_PRODUCCION', 'FECHA_ORDEN', 'HORA_ORDEN', 'CLASE_ORDEN', 'CENTRO', 
  'MATERIAL', 'CANT_PRODUCIR', 'UNIDAD_MEDIDA', 'RESP_CONTROL_PROD', 
  'FECHA_INICIO_PROG', 'FECHA_FIN_PROG', 'SECTOR', 'SECTORDESC'
];

export const OrdenesFertTabSection: React.FC<OrdenesFertTabSectionProps> = ({ restricciones }) => {
  const inspector = useRuntimeInspector('OrdenesFertTab');
  const { addNotification } = useAppContext();

  const [orders, setOrders] = useState<OrdenFert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[1]);

  useEffect(() => {
    const fetchOrders = async () => {
      setIsLoading(true);
      setError(null);
      logger.log('[OrdenesFertTab] Fetching FERT orders...');
      try {
        const ordersResponse = await serviciosService.getOrdenesFert();
        
        let dataArray = (ordersResponse.data && Array.isArray(ordersResponse.data)) ? ordersResponse.data : [];
        
        // Use the passed restrictions prop
        const sectoresRestriction = restricciones.find(r => r.nombre_restriccion === 'SECTORES');

        if (sectoresRestriction && sectoresRestriction.valor_restriccion) {
          const separator = sectoresRestriction.valor_restriccion.includes('&') ? '&' : ',';
          const sectoresToFilter = sectoresRestriction.valor_restriccion.split(separator).map(s => s.trim()).filter(s => s);
          
          if (sectoresToFilter.length > 0) {
            dataArray = dataArray.filter(order => order.SECTORDESC && sectoresToFilter.includes(order.SECTORDESC));
            addNotification('success', `Se cargaron ${dataArray.length} órdenes FERT, aplicando el filtro 'SECTORES' del grupo de Muebles con los valores: ${sectoresToFilter.join(', ')}.`);
          } else {
             addNotification('warning', `La restricción 'SECTORES' para el grupo Muebles está vacía. Mostrando todas las órdenes FERT.`);
          }
        } else {
          addNotification('info', `No se encontró la restricción 'SECTORES' para el grupo Muebles. Mostrando todas las órdenes FERT.`);
        }

        setOrders(dataArray);
        logger.log(`[OrdenesFertTab] Loaded ${dataArray.length} FERT orders.`);

      } catch (err) {
        const errorMessage = (err as Error).message;
        logger.error(`[OrdenesFertTab] Error fetching data: ${errorMessage}`);
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
          <p>No hay órdenes FERT disponibles para mostrar (posiblemente por el filtro de sector).</p>
        </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pagination Controls */}
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

      {/* Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {COLUMNS_TO_DISPLAY.map((col, index) => (
                  <th
                    key={col}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-dashed border-gray-300"
                  >
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedOrders.map((order, index) => (
                <tr key={`${order.ORDEN_PRODUCCION}-${index}`} className="hover:bg-gray-50">
                  {COLUMNS_TO_DISPLAY.map((col, colIndex) => (
                       <td key={col} className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center border-r border-dashed border-gray-300">
                         {String((order as any)[col] ?? '-')}
                       </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
