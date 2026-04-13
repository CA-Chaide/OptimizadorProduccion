
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, Search, Home, Filter, AlertCircle, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface OrdenFert {
  CENTRO: string;
  ORDEN: string;
  MATERIAL: string;
  SECTORDESC: string;
  CATEGORIA: string;
  NOMBRE: string;
  CANTPROGRAMADA: number;
  CANTENTREGADA: number;
  CANTNOTIFICADA: number;
  CANTRECHAZO: number;
  UNIDAD: string;
  FECHA: string;
  ANIO: number;
  MES: number;
  DIA: number;
  SEMANA: number;
  RESPCTRLPROD: string;
  PRIORIDAD: number;
  ENLINEA: number;
  MAQUINA: string;
  PEDIDO: string;
  CANTPROGPESONETO: number;
  [key: string]: any;
}

export const OrdenesFertTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('OrdenesFertTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  const [allRawOrders, setAllRawOrders] = useState<OrdenFert[]>([]);
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("raw_view");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [appliedFilters, setAppliedFilters] = useState<{ sectors: string[], resps: string[] }>({
    sectors: [],
    resps: []
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const loadData = useCallback(async () => {
    if (hasStarted.current) return;
    hasStarted.current = true;

    try {
      setIsLoading(true);
      setError(null);
      logger.log('[OrdenesFertTab] Cargando datos y configuraciones...');
      
      const [centersRes, groupsRes, restRes, fertRes] = await Promise.all([
        serviciosService.getCentros(),
        grupoService.getAll(),
        restriccionService.getAll(),
        serviciosService.getOrdenesFert()
      ]);

      const rawData = Array.isArray(fertRes?.data) ? fertRes.data : [];
      setAllRawOrders(rawData);
      logger.log(`[OrdenesFertTab] Órdenes recibidas: ${rawData.length}`);

      const ensambladoGroups = (groupsRes?.data || []).filter((g: any) => 
        String(g.nombre_grupo || '').toLowerCase().includes('ensamblado')
      );
      
      const groupIds = ensambladoGroups.map((g: any) => g.codigo_grupo);
      
      const ensambladoRestrictions = (restRes?.data || []).filter((r: any) => 
        groupIds.includes(r.codigo_grupo) && r.estado === 'A'
      );

      const sectorRest = ensambladoRestrictions.find((r: any) => 
        ['SECTORES', 'SECTOR'].includes(String(r.nombre_restriccion).toUpperCase())
      );
      const respRest = ensambladoRestrictions.find((r: any) => 
        ['RESP_CTRL_PROD', 'RESP_CONTROL_PROD', 'RESPCTRLPROD'].includes(String(r.nombre_restriccion).toUpperCase())
      );

      const sectors = sectorRest ? sectorRest.valor_restriccion.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean) : [];
      const resps = respRest ? respRest.valor_restriccion.split(',').map((r: string) => r.trim()).filter(Boolean) : [];

      setAppliedFilters({ sectors, resps });
      
      const officialCenters = (centersRes?.data || []).map((c: any) => String(c.Centro || c).trim()).filter(Boolean);
      const dataCenters = [...new Set(rawData.map(o => String(o.CENTRO || '').trim()))].filter(Boolean);
      const finalCentersList = [...new Set([...officialCenters, ...dataCenters])].sort();
      
      setAvailableCenters(finalCentersList);
      
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      addNotification('error', `Error al cargar órdenes FERT: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredOrders = useMemo(() => {
    return allRawOrders.filter(order => {
      if (appliedFilters.sectors.length > 0) {
        const s = String(order.SECTORDESC || '').trim().toUpperCase();
        if (!appliedFilters.sectors.includes(s)) return false;
      }

      if (appliedFilters.resps.length > 0) {
        const r = String(order.RESPCTRLPROD || '').trim();
        if (!appliedFilters.resps.includes(r)) return false;
      }

      return true;
    });
  }, [allRawOrders, appliedFilters]);

  const ordersGroupedByCenter = useMemo(() => {
    const grouped: Record<string, OrdenFert[]> = {};
    availableCenters.forEach(c => grouped[c] = []);
    
    filteredOrders.forEach(order => {
      const c = String(order.CENTRO || '').trim();
      if (grouped[c]) {
        grouped[c].push(order);
      } else if (c) {
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(order);
      }
    });
    return grouped;
  }, [filteredOrders, availableCenters]);

  const currentViewOrders = useMemo(() => {
    let base = [];
    if (selectedCenter === "raw_view") {
      base = allRawOrders;
    } else {
      base = ordersGroupedByCenter[selectedCenter] || [];
    }

    const term = searchTerm.toLowerCase().trim();
    if (!term) return base;
    
    return base.filter(o => 
      String(o.ORDEN || '').toLowerCase().includes(term) ||
      String(o.MATERIAL || '').toLowerCase().includes(term) ||
      String(o.NOMBRE || '').toLowerCase().includes(term) ||
      String(o.SECTORDESC || '').toLowerCase().includes(term)
    );
  }, [allRawOrders, ordersGroupedByCenter, selectedCenter, searchTerm]);

  const totalPagesLocal = Math.max(1, Math.ceil(currentViewOrders.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const displayedOrders = currentViewOrders.slice(startIndex, startIndex + rowsPerPage);

  const formatMaterial = (mat: string) => String(mat || '').replace(/^0+/, '');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <ClipboardList className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Órdenes FERT</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-[10px] bg-indigo-50 text-indigo-700 border-indigo-100">
                <Filter className="w-3 h-3 mr-1" />
                Filtro Activo: {appliedFilters.sectors.length > 0 || appliedFilters.resps.length > 0 ? 'Restricciones Ensamblado' : 'Ninguno'}
              </Badge>
              {appliedFilters.sectors.length > 0 && (
                <span className="text-[10px] text-gray-500">Sectores: {appliedFilters.sectors.join(', ')}</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Buscar..."
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
          <span className="mt-4 text-gray-600 font-medium">Procesando Órdenes Fert...</span>
        </div>
      ) : (
        <Tabs value={selectedCenter} onValueChange={(val) => { setSelectedCenter(val); setCurrentPage(1); }} className="w-full">
          <TabsList className="flex flex-wrap h-auto bg-gray-100/50 p-1 mb-4">
            <TabsTrigger 
              value="raw_view"
              className="data-[state=active]:bg-amber-100 data-[state=active]:text-amber-800 px-4 py-2 text-xs font-bold uppercase tracking-wider border-r border-gray-200"
            >
              <Database className="w-3 h-3 mr-2" />
              Vista Bruta ({allRawOrders.length})
            </TabsTrigger>
            
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

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="p-2 bg-indigo-50/30 border-b flex items-center justify-between text-[10px] font-bold text-indigo-600 uppercase px-4">
              <span>{selectedCenter === 'raw_view' ? 'Todos los datos sin filtrar' : `Filtrado por Centro ${selectedCenter} + Restricciones`}</span>
              <span>{currentViewOrders.length} registros</span>
            </div>

            {currentViewOrders.length > 0 ? (
              <div className="flex flex-col">
                <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
                  <div style={{ transform: 'rotateX(180deg)' }}>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Orden</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Material</th>
                          <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Nombre</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Cant. Programada</th>
                          <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Cant. Entregada</th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Centro</th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Sector</th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Resp. Ctrl.</th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Fecha</th>
                          <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Máquina</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {displayedOrders.map((order, idx) => (
                          <tr key={`${order.ORDEN}-${idx}`} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-indigo-600">{order.ORDEN}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{formatMaterial(order.MATERIAL)}</td>
                            <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={order.NOMBRE}>{order.NOMBRE}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-gray-900">
                              {Number(order.CANTPROGRAMADA || 0).toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">{order.UNIDAD}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-green-600">
                              {Number(order.CANTENTREGADA || 0).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-xs font-bold text-gray-500">{order.CENTRO || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-center text-xs font-medium text-amber-700 bg-amber-50/20">{order.SECTORDESC || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{order.RESPCTRLPROD || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{order.FECHA || '-'}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-center font-mono text-indigo-500">{order.MAQUINA || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

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
                      Registros {startIndex + 1}-{Math.min(startIndex + rowsPerPage, currentViewOrders.length)} de {currentViewOrders.length}
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
              <div className="text-center py-20 bg-gray-50 border-2 border-dashed rounded-lg text-gray-400 m-4">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p className="font-medium">No hay órdenes que coincidan con los filtros de Ensamblado en este centro</p>
                <p className="text-xs mt-1">Revisa la pestaña "Vista Bruta" para verificar la carga total.</p>
              </div>
            )}
          </div>
        </Tabs>
      )}
    </div>
  );
};
