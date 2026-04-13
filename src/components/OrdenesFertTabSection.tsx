'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, Search, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

interface OrdenFert {
  ORDEN: string;
  MATERIAL: string;
  TEXTO_BREVE: string;
  CANTIDAD: number;
  UNIDAD: string;
  FECHA_ENTREGA: string;
  FECHA_LIBERACION: string;
  ESTADO: string;
  CENTRO: string;
  ALMACEN: string;
  [key: string]: any;
}

export const OrdenesFertTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('OrdenesFertTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  const [orders, setOrders] = useState<OrdenFert[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<OrdenFert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Paginación local
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const loadData = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    try {
      setIsLoading(true);
      setError(null);
      logger.log('[OrdenesFertTab] Cargando órdenes FERT...');
      
      const response = await serviciosService.getOrdenesFert();
      
      if (response && response.data) {
        const allData = Array.isArray(response.data) ? response.data : [];
        setOrders(allData);
        setFilteredOrders(allData);
        logger.log(`[OrdenesFertTab] Se recuperaron ${allData.length} órdenes FERT.`);
        inspector.captureVariable('fertOrdersCount', allData.length);
      } else {
        throw new Error('No se recibió información válida del servidor');
      }
    } catch (err) {
      const msg = (err as Error).message;
      logger.error(`[OrdenesFertTab] Error: ${msg}`);
      setError(msg);
      addNotification('error', `Error al cargar órdenes FERT: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Manejar búsqueda
  useEffect(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
      setFilteredOrders(orders);
    } else {
      const filtered = orders.filter(o => 
        String(o.ORDEN || '').toLowerCase().includes(term) ||
        String(o.MATERIAL || '').toLowerCase().includes(term) ||
        String(o.TEXTO_BREVE || '').toLowerCase().includes(term) ||
        String(o.ALMACEN || '').toLowerCase().includes(term)
      );
      setFilteredOrders(filtered);
    }
    setCurrentPage(1);
  }, [searchTerm, orders]);

  // Cálculos de paginación
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const displayedOrders = filteredOrders.slice(startIndex, startIndex + rowsPerPage);

  const handleExport = () => {
    addNotification('info', 'Preparando exportación de órdenes FERT...');
    // Aquí se podría implementar exportToXLSX si fuera necesario
  };

  return (
    <div className="space-y-6">
      {/* Cabecera y Controles */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <ClipboardList className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Órdenes FERT (Productos Terminados)</h3>
            <p className="text-xs text-gray-500">Visualización de órdenes de fabricación liberadas</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Buscar por orden, material..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredOrders.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Estado de Carga */}
      {isLoading && (
        <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <span className="mt-4 text-gray-600 font-medium">Recuperando órdenes del sistema...</span>
        </div>
      )}

      {/* Tabla de Resultados with top scrollbar hack */}
      {!isLoading && filteredOrders.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
            <div style={{ transform: 'rotateX(180deg)' }}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Orden</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Material</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Descripción</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Cantidad</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Entrega</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Centro</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Almacén</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {displayedOrders.map((order, idx) => (
                    <tr key={`${order.ORDEN}-${idx}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-indigo-600">{order.ORDEN}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{order.MATERIAL}</td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={order.TEXTO_BREVE}>{order.TEXTO_BREVE}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-gray-900">
                        {Number(order.CANTIDAD || 0).toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">{order.UNIDAD}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{order.FECHA_ENTREGA || '-'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{order.CENTRO}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-bold text-indigo-700 bg-indigo-50/10">{order.ALMACEN}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <Badge variant="outline" className="text-[10px] uppercase font-bold">
                          {order.ESTADO || 'LIB.'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Paginación */}
          <div className="bg-gray-50 px-6 py-4 border-t flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="text-xs font-medium text-gray-500 uppercase">Mostrar:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-sm border rounded p-1 bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-xs text-gray-400">
                Total: {filteredOrders.length.toLocaleString()} registros
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                Anterior
              </Button>
              <div className="px-4 py-1 bg-white border rounded text-sm font-bold text-indigo-600">
                {currentPage} / {totalPages}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Estado Vacío o Error */}
      {!isLoading && filteredOrders.length === 0 && (
        <div className="text-center py-20 bg-gray-50 border-2 border-dashed rounded-lg">
          <ClipboardList className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600 font-medium">No se encontraron órdenes FERT</p>
          <p className="text-sm text-gray-400 mt-1">Intenta ajustar los criterios de búsqueda o recargar los datos.</p>
          <Button 
            variant="outline" 
            size="sm" 
            className="mt-4" 
            onClick={() => {
              hasStarted.current = false;
              loadData();
            }}
          >
            Recargar Datos
          </Button>
        </div>
      )}
    </div>
  );
};
