'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProvisionalOrder {
  ORDENPREVISIONAL: string;
  MATERIAL: string;
  NOMBRE: string;
  CATEGORIA: string;
  CANTIDAD: number;
  UNIDAD: string;
  FECHAINICIO: string;
  FECHAFIN: string;
  RESPCONTROLPROD: string;
  Centro: string;
  Almacen: string;
  Maquina: string | null;
  ClaseOrden: string;
  CodMaterial: string;
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
  const hasStarted = useRef(false);

  const [orders, setOrders] = useState<ProvisionalOrder[]>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalRegistros: 0,
    pageSize: 5000, // Ajustado a un tamaño más seguro para evitar timeouts
    isExploring: true,
    rowsPerPage: 20,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const performExploration = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    try {
      setIsLoading(true);
      setError(null);
      logger.log('[ProvisionalOrdersTab] Iniciando exploración inicial...');
      
      // 1. Obtener el total de registros con una llamada mínima
      const response = await serviciosService.OrdenesProvisionalesPaginados(1, 1);
      
      if (response && response.data) {
        const total = response.totalRegistros || 0;
        logger.log(`[ProvisionalOrdersTab] Total de registros en backend: ${total}`);
        
        setPagination(prev => ({
          ...prev,
          totalRegistros: total,
          isExploring: false,
        }));

        // 2. Cargar un bloque razonable para filtrar
        addNotification('info', `Cargando órdenes para filtrar por Almacén 1001 y 2001...`);
        
        const fetchSize = 5000;
        const pageResponse = await serviciosService.OrdenesProvisionalesPaginados(1, fetchSize);
        
        if (pageResponse && pageResponse.data) {
          const allItems = Array.isArray(pageResponse.data) ? pageResponse.data : [];
          
          // FILTRO: Solo Almacén 1001 y 2001
          const filtered = allItems.filter((order: ProvisionalOrder) => 
            String(order.Almacen).trim() === '1001' || String(order.Almacen).trim() === '2001'
          );
          
          setOrders(filtered);
          logger.log(`[ProvisionalOrdersTab] Cargados ${allItems.length} registros. Se muestran ${filtered.length} tras filtrar.`);
          inspector.captureVariable('filteredOrdersCount', filtered.length);
        }
      } else {
        throw new Error('No se pudo conectar con el servicio de órdenes');
      }
    } catch (err) {
      const errorMessage = (err as Error).message;
      logger.error(`[ProvisionalOrdersTab] Error: ${errorMessage}`);
      setError(errorMessage);
      addNotification('error', `Error al cargar órdenes: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector]);

  useEffect(() => {
    performExploration();
  }, [performExploration]);

  const totalPagesLocal = Math.max(1, Math.ceil(orders.length / pagination.rowsPerPage));
  
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
        <div className="flex flex-col">
          <h3 className="text-xl font-semibold text-gray-700">Datos de Órdenes Previsionales</h3>
          <p className="text-xs text-indigo-600 font-medium italic">Filtrado por Almacén 1001 y 2001</p>
        </div>
      </div>

      {/* Info Card */}
      {!isLoading && orders.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <span className="font-semibold">Mostrando:</span> {orders.length.toLocaleString()} registros encontrados en el bloque actual de búsqueda.
          </p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-800">
            <span className="font-semibold">Error:</span> {error}
          </p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-2" 
            onClick={() => {
              hasStarted.current = false;
              performExploration();
            }}
          >
            Reintentar Carga
          </Button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col justify-center items-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <span className="mt-4 text-gray-600 font-medium">Cargando y filtrando órdenes previsionales...</span>
          <p className="text-xs text-gray-400 mt-2">Esto puede tomar unos segundos debido al volumen de datos.</p>
        </div>
      )}

      {/* Table with top scrollbar hack */}
      {!isLoading && orders.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border">
          <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
            <div style={{ transform: 'rotateX(180deg)' }}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Orden Previsional
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Material
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Nombre
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Categoría
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Cantidad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Unidad
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      F. Inicio
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                      F. Fin
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/50">
                      Almacén
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {displayedOrders.map((order, index) => (
                    <tr key={`${order.ORDENPREVISIONAL}-${index}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">
                        {order.ORDENPREVISIONAL}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">
                        {order.MATERIAL}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={order.NOMBRE}>
                        {order.NOMBRE}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {order.CATEGORIA}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-600">
                        {Number(order.CANTIDAD || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {order.UNIDAD}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {order.FECHAINICIO}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {order.FECHAFIN}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-700 bg-indigo-50/20">
                        {order.Almacen}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {!isLoading && orders.length > 0 && (
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow border">
          <div className="flex items-center space-x-4">
            <label className="text-xs font-semibold text-gray-500 uppercase">Filas por página:</label>
            <select
              value={pagination.rowsPerPage}
              onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
              className="px-2 py-1 border border-gray-300 rounded text-sm bg-white font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevious}
              disabled={pagination.currentPage === 1}
            >
              ← Anterior
            </Button>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                Página <span className="font-bold text-indigo-600">{pagination.currentPage}</span> de <span className="font-bold">{totalPagesLocal}</span>
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleNext}
              disabled={pagination.currentPage === totalPagesLocal}
            >
              Siguiente →
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && orders.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500 border-2 border-dashed rounded-lg bg-gray-50">
          <Package className="w-12 h-12 mb-4 text-gray-300" />
          <p className="font-medium text-lg text-gray-700">No se encontraron órdenes para procesar</p>
          <p className="text-sm mt-1 max-w-md text-center">
            No se han encontrado órdenes en los almacenes 1001 o 2001 dentro del bloque de datos consultado. 
            Verifica la conexión o intenta reintentar la carga.
          </p>
          <Button 
            className="mt-6" 
            onClick={() => {
              hasStarted.current = false;
              performExploration();
            }}
          >
            Reintentar Carga de Datos
          </Button>
        </div>
      )}
    </div>
  );
};
