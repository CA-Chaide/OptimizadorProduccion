
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, Search, Home, Filter, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  SECTOR?: string;
  RESP_CTRL_PROD?: string;
  RESPCONTROLPROD?: string;
  [key: string]: any;
}

export const OrdenesFertTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('OrdenesFertTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  const [orders, setOrders] = useState<OrdenFert[]>([]);
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Estados de restricciones
  const [appliedFilters, setAppliedFilters] = useState<{ sectors: string[], resps: string[] }>({
    sectors: [],
    resps: []
  });

  // Paginación local
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const loadData = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    try {
      setIsLoading(true);
      setError(null);
      logger.log('[OrdenesFertTab] Iniciando carga de datos y filtros...');
      
      // 1. Cargar Centros, Grupos y Restricciones en paralelo
      const [centersRes, groupsRes, restRes, fertRes] = await Promise.all([
        serviciosService.getCentros(),
        grupoService.getAll(),
        restriccionService.getAll(),
        serviciosService.getOrdenesFert()
      ]);

      // 2. Identificar filtros del grupo "Ensamblado"
      const ensambladoGroups = (groupsRes?.data || []).filter((g: any) => 
        String(g.nombre_grupo || '').toLowerCase().includes('ensamblado')
      );
      
      const groupIds = ensambladoGroups.map((g: any) => g.codigo_grupo);
      
      const ensambladoRestrictions = (restRes?.data || []).filter((r: any) => 
        groupIds.includes(r.codigo_grupo) && r.estado === 'A'
      );

      // Extraer sectores (ej: "01,02,03")
      const sectorRest = ensambladoRestrictions.find((r: any) => r.nombre_restriccion === 'SECTORES');
      const respRest = ensambladoRestrictions.find((r: any) => r.nombre_restriccion === 'RESP_CTRL_PROD');

      const sectors = sectorRest ? sectorRest.valor_restriccion.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
      const resps = respRest ? respRest.valor_restriccion.split(',').map((r: string) => r.trim()).filter(Boolean) : [];

      setAppliedFilters({ sectors, resps });
      logger.log(`[OrdenesFertTab] Filtros detectados - Sectores: [${sectors.join(', ')}], Resps: [${resps.join(', ')}]`);

      // 3. Procesar Órdenes FERT y Filtrar
      let rawOrders = Array.isArray(fertRes?.data) ? fertRes.data : [];
      logger.log(`[OrdenesFertTab] Órdenes brutas recibidas: ${rawOrders.length}`);

      // Filtrar por restricciones SOLO si existen restricciones definidas
      let filteredOrders = rawOrders;
      if (sectors.length > 0) {
        filteredOrders = filteredOrders.filter((o: any) => {
          const s = String(o.SECTOR || '').trim();
          return sectors.includes(s);
        });
        logger.log(`[OrdenesFertTab] Órdenes tras filtro SECTORES: ${filteredOrders.length}`);
      }
      
      if (resps.length > 0) {
        filteredOrders = filteredOrders.filter((o: any) => {
          const r = String(o.RESP_CTRL_PROD || o.RESPCONTROLPROD || '').trim();
          return resps.includes(r);
        });
        logger.log(`[OrdenesFertTab] Órdenes tras filtro RESP_CTRL_PROD: ${filteredOrders.length}`);
      }

      setOrders(filteredOrders);
      inspector.captureVariable('fertOrdersFilteredCount', filteredOrders.length);

      // 4. Procesar Centros - Combinar oficiales con centros encontrados en las órdenes
      const officialCenters = (centersRes?.data || []).map((c: any) => String(c.Centro || c).trim()).filter(Boolean);
      const dataCenters = [...new Set(filteredOrders.map(o => String(o.CENTRO || o.Centro || '').trim()))].filter(Boolean);
      
      const finalCentersList = [...new Set([...officialCenters, ...dataCenters])].sort();
      
      setAvailableCenters(finalCentersList);
      if (finalCentersList.length > 0) {
        setSelectedCenter(finalCentersList[0]);
      }
      
    } catch (err) {
      const msg = (err as Error).message;
      logger.error(`[OrdenesFertTab] Error crítico: ${msg}`);
      setError(msg);
      addNotification('error', `Error al cargar órdenes FERT: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Agrupación por centro
  const ordersGroupedByCenter = useMemo(() => {
    const grouped: Record<string, OrdenFert[]> = {};
    availableCenters.forEach(c => grouped[c] = []);
    
    orders.forEach(order => {
      const c = String(order.CENTRO || order.Centro || '').trim();
      if (grouped[c]) {
        grouped[c].push(order);
      } else if (c) {
        // Centro no listado pero presente en data
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(order);
      }
    });
    return grouped;
  }, [orders, availableCenters]);

  // Búsqueda y filtrado final para el centro seleccionado
  const currentCenterOrders = useMemo(() => {
    const base = ordersGroupedByCenter[selectedCenter] || [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return base;
    
    return base.filter(o => 
      String(o.ORDEN || '').toLowerCase().includes(term) ||
      String(o.MATERIAL || '').toLowerCase().includes(term) ||
      String(o.TEXTO_BREVE || '').toLowerCase().includes(term)
    );
  }, [ordersGroupedByCenter, selectedCenter, searchTerm]);

  // Cálculos de paginación
  const totalPagesLocal = Math.max(1, Math.ceil(currentCenterOrders.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedOrders = currentCenterOrders.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Cabecera y Filtros Informativos */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <ClipboardList className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Órdenes FERT por Centro</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-100">
                <Filter className="w-3 h-3 mr-1" />
                Sectores: {appliedFilters.sectors.length > 0 ? appliedFilters.sectors.join(', ') : 'Todos'}
              </Badge>
              {appliedFilters.resps.length > 0 && (
                <Badge variant="secondary" className="text-[10px] bg-amber-50 text-amber-700 border-amber-100">
                  Resps: {appliedFilters.resps.join(', ')}
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Buscar en este centro..."
              className="pl-9 h-9"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => { hasStarted.current = false; loadData(); }}>
            Actualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <span className="mt-4 text-gray-600 font-medium">Cargando y aplicando filtros de Ensamblado...</span>
        </div>
      ) : availableCenters.length > 0 ? (
        <Tabs value={selectedCenter} onValueChange={(val) => { setSelectedCenter(val); setCurrentPage(1); }} className="w-full">
          <TabsList className="flex flex-wrap h-auto bg-gray-100/50 p-1 mb-4">
            {availableCenters.map(center => (
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

          {availableCenters.map(center => (
            <TabsContent key={center} value={center} className="mt-0 outline-none focus:ring-0">
              {currentCenterOrders.length > 0 ? (
                <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
                  {/* Table with top scrollbar hack */}
                  <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
                    <div style={{ transform: 'rotateX(180deg)' }}>
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Orden</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Material</th>
                            <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Descripción</th>
                            <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Cantidad</th>
                            <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Sector</th>
                            <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Almacén</th>
                            <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Resp. Ctrl.</th>
                            <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Entrega</th>
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
                              <td className="px-6 py-4 whitespace-nowrap text-center text-xs font-medium text-amber-700 bg-amber-50/20">{order.SECTOR || '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{order.ALMACEN}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{order.RESP_CTRL_PROD || order.RESPCONTROLPROD || '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{order.FECHA_ENTREGA || '-'}</td>
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
                  <div className="bg-gray-50 px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-medium text-gray-500 uppercase">Mostrar:</span>
                      <select
                        value={rowsPerPage}
                        onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                        className="text-sm border rounded p-1 bg-white"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                      <span className="text-xs text-gray-400">
                        {startIndex + 1}-{Math.min(endIndex, currentCenterOrders.length)} de {currentCenterOrders.length} registros
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Anterior</Button>
                      <div className="px-4 py-1 bg-white border rounded text-sm font-bold text-indigo-600 min-w-[80px] text-center">{currentPage} / {totalPagesLocal}</div>
                      <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPagesLocal, p + 1))} disabled={currentPage === totalPagesLocal}>Siguiente</Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-20 bg-gray-50 border-2 border-dashed rounded-lg text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                  <p className="font-medium">No se encontraron órdenes para el Centro {center} con los filtros actuales</p>
                  <p className="text-xs mt-1">Intenta realizar una búsqueda diferente o actualiza los datos.</p>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <div className="text-center py-20 bg-white border rounded-lg">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-amber-500 opacity-50" />
          <p className="text-gray-600 font-medium">No se encontraron órdenes Fert cargadas.</p>
          <Button variant="link" onClick={() => { hasStarted.current = false; loadData(); }}>
            Click aquí para reintentar carga
          </Button>
        </div>
      )}
    </div>
  );
};
