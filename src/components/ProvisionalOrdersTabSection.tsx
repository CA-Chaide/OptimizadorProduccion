'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { Package, Loader2, Home, Filter, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("");
  
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalRegistros: 0,
    pageSize: 5000, 
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
      
      const centersRes = await serviciosService.getCentros();
      const centersList = (centersRes.data || []).map((c: any) => String(c.Centro || c).trim()).sort();
      setAvailableCenters(centersList);

      const fetchSize = 5000;
      const pageResponse = await serviciosService.OrdenesProvisionalesPaginados(1, fetchSize);
      
      if (pageResponse && pageResponse.data) {
        const allItems = Array.isArray(pageResponse.data) ? pageResponse.data : [];
        setOrders(allItems);
        
        const total = pageResponse.totalRegistros || allItems.length;
        setPagination(prev => ({
          ...prev,
          totalRegistros: total,
          isExploring: false,
        }));
      }
    } catch (err) {
      const errorMessage = (err as Error).message;
      setError(errorMessage);
      addNotification('error', `Error al cargar datos: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    performExploration();
  }, [performExploration]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const almacen = String(order.Almacen || '').trim();
      return almacen === '1001' || almacen === '2001';
    });
  }, [orders]);

  const ordersGroupedByCenter = useMemo(() => {
    const grouped: Record<string, ProvisionalOrder[]> = {};
    availableCenters.forEach(c => grouped[c] = []);
    
    filteredOrders.forEach(order => {
      const c = String(order.Centro || '').trim();
      if (c) {
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(order);
      }
    });

    return grouped;
  }, [filteredOrders, availableCenters]);

  const centersWithData = useMemo(() => {
    return Object.keys(ordersGroupedByCenter).filter(c => ordersGroupedByCenter[c].length > 0).sort();
  }, [ordersGroupedByCenter]);

  useEffect(() => {
    if (centersWithData.length > 0 && (!selectedCenter || !centersWithData.includes(selectedCenter))) {
      setSelectedCenter(centersWithData[0]);
    }
  }, [centersWithData, selectedCenter]);

  const currentCenterOrders = useMemo(() => {
    return ordersGroupedByCenter[selectedCenter] || [];
  }, [ordersGroupedByCenter, selectedCenter]);

  const totalPagesLocal = Math.max(1, Math.ceil(currentCenterOrders.length / pagination.rowsPerPage));
  const startIndex = (pagination.currentPage - 1) * pagination.rowsPerPage;
  const endIndex = startIndex + pagination.rowsPerPage;
  const displayedOrders = currentCenterOrders.slice(startIndex, endIndex);

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
    setPagination(prev => ({ ...prev, rowsPerPage: newRowsPerPage, currentPage: 1 }));
  };

  const handleCenterChange = (center: string) => {
    setSelectedCenter(center);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
  };

  const formatMaterial = (mat: string) => String(mat || '').replace(/^0+/, '');

  if (isLoading && orders.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        <span className="mt-4 text-gray-600 font-medium">Cargando y filtrando órdenes previsionales...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Package className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-700">Órdenes Previsionales</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-100">
                Filtro Almacenes: 1001, 2001
              </Badge>
            </div>
          </div>
        </div>
        
        {!isLoading && filteredOrders.length > 0 && (
          <div className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-100">
            Mostrando: {filteredOrders.length.toLocaleString()} registros
          </div>
        )}
      </div>

      {centersWithData.length > 0 ? (
        <Tabs value={selectedCenter} onValueChange={handleCenterChange} className="w-full">
          <TabsList className="flex flex-wrap h-auto bg-gray-100/50 p-1 mb-4">
            {centersWithData.map(center => (
              <TabsTrigger 
                key={center} 
                value={center}
                className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider"
              >
                <Home className="w-3 h-3 mr-2" />
                Centro {center} ({ordersGroupedByCenter[center]?.length || 0})
              </TabsTrigger>
            ))}
          </TabsList>

          {centersWithData.map(center => (
            <TabsContent key={center} value={center} className="mt-0">
              <div className="space-y-4">
                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  {/* Contenedor con scroll invertido */}
                  <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
                    <div style={{ transform: 'rotateX(180deg)' }}>
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Orden</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Material</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Nombre</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Cantidad</th>
                            <th className="px-6 py-3 text-center text-xs font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Almacén</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Resp. Ctrl. Prod.</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">F. Inicio</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Máquina</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {displayedOrders.map((order, idx) => (
                            <tr key={`${order.ORDENPREVISIONAL}-${idx}`} className="hover:bg-gray-50 transition-colors">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-indigo-600 font-mono">{order.ORDENPREVISIONAL}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono">{formatMaterial(order.CodMaterial || order.MATERIAL)}</td>
                              <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={order.NOMBRE}>{order.NOMBRE}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-indigo-600">{Number(order.CANTIDAD || 0).toLocaleString()}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-bold text-indigo-700 bg-indigo-50/10">{order.Almacen}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{order.RESPCONTROLPROD}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{order.FECHAINICIO}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-mono text-xs">{order.Maquina || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="bg-gray-50 px-6 py-4 border-t flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-medium text-gray-500 uppercase">Mostrar:</span>
                      <select
                        value={pagination.rowsPerPage}
                        onChange={(e) => handleRowsPerPageChange(Number(e.target.value))}
                        className="text-sm border rounded p-1 bg-white"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-xs text-gray-400 font-medium">
                        Registros {startIndex + 1}-{Math.min(endIndex, currentCenterOrders.length)} de {currentCenterOrders.length}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handlePrevious} disabled={pagination.currentPage === 1}> Anterior </Button>
                      <div className="px-4 py-1 bg-white border rounded text-sm font-bold text-indigo-600"> {pagination.currentPage} / {totalPagesLocal} </div>
                      <Button variant="outline" size="sm" onClick={handleNext} disabled={pagination.currentPage === totalPagesLocal}> Siguiente </Button>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        !isLoading && (
          <div className="text-center py-20 bg-white border-2 border-dashed rounded-lg text-gray-400">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p className="font-medium">No hay órdenes para los almacenes 1001 o 2001</p>
            <Button variant="ghost" size="sm" className="mt-4" onClick={() => { hasStarted.current = false; performExploration(); }}>
              Reintentar carga
            </Button>
          </div>
        )
      )}
    </div>
  );
};