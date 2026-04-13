'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package } from 'lucide-react';
import type { ProvisionalOrder } from '@/types/interfaces';


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

  // Define static columns to ensure order and completeness
  const columns = [
    'ORDENPREVISIONAL', 'MATERIAL', 'NOMBRE', 'CATEGORIA', 'CANTIDAD', 'UNIDAD', 
    'FECHAINICIO', 'FECHAFIN', 'RESPCONTROLPROD', 'Centro', 'Almacen', 
    'Maquina', 'ClaseOrden', 'CodMaterial'
  ];

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
            isExploring: false,
          }));

          addNotification('success', `Se encontraron ${total} órdenes previsionales. Cargando tabla...`);
          
          // Cargar la primera página después de la exploración
          setIsLoading(true);
          const pageResponse = await serviciosService.OrdenesProvisionalesPaginados(1, pagination.pageSize);
          if (pageResponse.data) {
            const dataArray = Array.isArray(pageResponse.data) ? pageResponse.data : [pageResponse.data];
            setOrders(dataArray);
            logger.log(`[ProvisionalOrdersTab] Primera página cargada con ${dataArray.length} registros`);
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
  }, [addNotification, inspector, pagination.pageSize]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => order.Almacen === '1011' || order.Almacen === '1015');
  }, [orders]);
  
  const totalPagesLocal = Math.ceil(filteredOrders.length / pagination.rowsPerPage);
  
  const startIndex = (pagination.currentPage - 1) * pagination.rowsPerPage;
  const endIndex = startIndex + pagination.rowsPerPage;
  const displayedOrders = filteredOrders.slice(startIndex, endIndex);

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

  // Sync scrollbars
  useEffect(() => {
    const topDiv = topScrollRef.current;
    const tableDiv = tableScrollRef.current;
    if (!topDiv || !tableDiv) return;

    let ignoreTop = false;
    let ignoreTable = false;

    const handleTopScroll = () => {
        if (ignoreTop) {
            ignoreTop = false;
            return;
        }
        ignoreTable = true;
        tableDiv.scrollLeft = topDiv.scrollLeft;
    };

    const handleTableScroll = () => {
        if (ignoreTable) {
            ignoreTable = false;
            return;
        }
        ignoreTop = true;
        topDiv.scrollLeft = tableDiv.scrollLeft;
    };

    topDiv.addEventListener('scroll', handleTopScroll);
    tableDiv.addEventListener('scroll', handleTableScroll);

    return () => {
        if (topDiv) topDiv.removeEventListener('scroll', handleTopScroll);
        if (tableDiv) tableDiv.removeEventListener('scroll', handleTableScroll);
    };
  }, []);

  // Update table width for the top scrollbar sizer
  useEffect(() => {
      const calculateWidth = () => {
          if (tableRef.current) {
              setTableWidth(tableRef.current.offsetWidth);
          }
      };
      calculateWidth();
      window.addEventListener('resize', calculateWidth);
      
      const resizeObserver = new ResizeObserver(calculateWidth);
      if (tableRef.current) {
          resizeObserver.observe(tableRef.current);
      }

      return () => {
          window.removeEventListener('resize', calculateWidth);
          if (tableRef.current) {
              resizeObserver.unobserve(tableRef.current);
          }
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
          <p>No hay órdenes previsionales disponibles para mostrar.</p>
        </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Pagination Controls */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">
            Mostrando {startIndex + 1} a {Math.min(endIndex, filteredOrders.length)} de {filteredOrders.length} órdenes.
          </span>
          <label className="text-sm font-semibold text-gray-700">Filas por página:</label>
          <select
            value={pagination.rowsPerPage}
            onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        <div className="flex items-center space-x-4">
          <button
            onClick={handlePrevious}
            disabled={pagination.currentPage === 1 || isLoading}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">
              Página <span className="font-bold">{pagination.currentPage}</span> de <span className="font-bold">{totalPagesLocal}</span>
            </span>
          </div>
          <button
            onClick={handleNext}
            disabled={pagination.currentPage === totalPagesLocal || isLoading}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      </div>

      {/* Top Scrollbar */}
      <div ref={topScrollRef} className="overflow-x-auto overflow-y-hidden" style={{ height: '18px' }}>
          <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        <div ref={tableScrollRef} className="overflow-x-auto">
          <table ref={tableRef} className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {columns.map((col, index) => (
                  <th
                    key={col}
                    className={`px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider ${index < columns.length - 1 ? 'border-r border-dashed border-gray-300' : ''}`}
                  >
                    {col.replace(/_/g, ' ')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayedOrders.map((order, index) => (
                <tr key={`${order.ORDENPREVISIONAL}-${index}`} className="hover:bg-gray-50">
                  {columns.map((col, colIndex) => (
                       <td key={col} className={`px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-center ${colIndex < columns.length - 1 ? 'border-r border-dashed border-gray-300' : ''}`}>
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
