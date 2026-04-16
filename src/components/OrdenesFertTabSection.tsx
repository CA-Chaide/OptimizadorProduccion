
'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, Search, Home, Database, LayoutGrid, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
  RESPCTRLPROD: string;
  MAQUINA: string;
  [key: string]: any;
}

export const OrdenesFertTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('OrdenesFertTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  // Estados de Datos
  const [allRawOrders, setAllRawOrders] = useState<OrdenFert[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [allRestrictions, setAllRestrictions] = useState<any[]>([]);
  
  // Estados de UI
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>("raw_view");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>("ALL");

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [groupsRes, restRes, fertRes] = await Promise.all([
        grupoService.getAll(),
        restriccionService.getAll(),
        serviciosService.getOrdenesFert()
      ]);

      const rawData = Array.isArray(fertRes?.data) ? fertRes.data : [];
      setAllRawOrders(rawData);
      setAllGroups(groupsRes?.data || []);
      setAllRestrictions(restRes?.data || []);

      const centersFromGroups = [...new Set((groupsRes?.data || []).map((g: any) => String(g.centro).trim()))].sort();
      setAvailableCenters(centersFromGroups);
      
      inspector.captureVariable('fert_raw_count', rawData.length);
      
    } catch (err) {
      addNotification('error', `Error al cargar órdenes FERT: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      loadData();
    }
  }, [loadData]);

  // Helper para obtener restricciones de un centro
  const getFiltersForCenter = useCallback((centerId: string) => {
    // Buscar grupo que contenga "ensamblado" para este centro
    const ensambladoGroup = allGroups.find(g => 
      String(g.centro).trim() === centerId && 
      String(g.nombre_grupo || '').toLowerCase().includes('ensamblado')
    );

    if (!ensambladoGroup) return { sectors: [], resps: [] };

    const centerRestrictions = allRestrictions.filter(r => 
      r.codigo_grupo === ensambladoGroup.codigo_grupo && r.estado === 'A'
    );

    const sectorRest = centerRestrictions.find(r => 
      ['SECTORES', 'SECTOR'].includes(String(r.nombre_restriccion || '').trim().toUpperCase())
    );
    const respRest = centerRestrictions.find(r => 
      ['RESP_CTRL_PROD', 'RESP_CONTROL_PROD', 'RESPCTRLPROD'].includes(String(r.nombre_restriccion || '').trim().toUpperCase())
    );

    return {
      sectors: sectorRest ? sectorRest.valor_restriccion.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean) : [],
      resps: respRest ? respRest.valor_restriccion.split(',').map((r: string) => r.trim()).filter(Boolean) : []
    };
  }, [allGroups, allRestrictions]);

  // AGRUPACIÓN PRINCIPAL POR CENTRO
  const ordersGroupedByCenter = useMemo(() => {
    const grouped: Record<string, OrdenFert[]> = {};
    
    availableCenters.forEach(centerId => {
      const centerFilters = getFiltersForCenter(centerId);
      
      grouped[centerId] = allRawOrders.filter(order => {
        // 1. Validar Centro (Chequeo multi-campo por si acaso)
        const orderCenter = String(order.CENTRO || order.Centro || order.centro || '').trim();
        if (orderCenter !== centerId) return false;

        // 2. Filtrar por Sectores de la restricción (SOLO si la restricción existe)
        if (centerFilters.sectors.length > 0) {
          const s = String(order.SECTORDESC || 'SIN SECTOR').trim().toUpperCase();
          // Permitir que si la restricción tiene un código como "01", haga match parcial con "01 COLCHONES"
          const hasMatch = centerFilters.sectors.some(filterSec => s.includes(filterSec));
          if (!hasMatch) return false;
        }

        // 3. Filtrar por Responsables (SOLO si la restricción existe)
        if (centerFilters.resps.length > 0) {
          const r = String(order.RESPCTRLPROD || '').trim();
          if (!centerFilters.resps.includes(r)) return false;
        }

        return true;
      });
    });

    return grouped;
  }, [allRawOrders, availableCenters, getFiltersForCenter]);

  // Opciones de sectores para el combo (basado en la pestaña activa)
  const availableSectors = useMemo(() => {
    const baseOrders = selectedTab === "raw_view" 
      ? allRawOrders 
      : (ordersGroupedByCenter[selectedTab] || []);
    
    const sectors = [...new Set(baseOrders.map(o => String(o.SECTORDESC || 'SIN SECTOR').trim().toUpperCase()))].sort();
    return sectors;
  }, [allRawOrders, ordersGroupedByCenter, selectedTab]);

  // Aplicar búsqueda y filtro de sector del combo
  const currentViewOrders = useMemo(() => {
    let base = selectedTab === "raw_view" 
      ? allRawOrders 
      : (ordersGroupedByCenter[selectedTab] || []);

    const term = searchTerm.toLowerCase().trim();
    
    return base.filter(o => {
      // Filtro de Sector del Combo
      if (selectedSector !== "ALL") {
        if (String(o.SECTORDESC || 'SIN SECTOR').trim().toUpperCase() !== selectedSector) return false;
      }

      // Filtro de búsqueda manual
      if (term) {
        return (
          String(o.ORDEN || '').toLowerCase().includes(term) ||
          String(o.MATERIAL || '').toLowerCase().includes(term) ||
          String(o.NOMBRE || '').toLowerCase().includes(term)
        );
      }

      return true;
    });
  }, [allRawOrders, ordersGroupedByCenter, selectedTab, searchTerm, selectedSector]);

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
            <p className="text-xs text-gray-500 mt-1">Sincronizado con centros de grupos de ensamblado</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Select value={selectedSector} onValueChange={(val) => { setSelectedSector(val); setCurrentPage(1); }}>
              <SelectTrigger className="h-9 bg-white">
                <LayoutGrid className="w-3.5 h-3.5 mr-2 text-gray-400" />
                <SelectValue placeholder="Todos los Sectores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos los Sectores</SelectItem>
                {availableSectors.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Orden, material o nombre..."
              className="pl-9 h-9"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData()}>
            Actualizar
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
          <span className="mt-4 text-gray-600 font-medium">Cargando órdenes FERT...</span>
        </div>
      ) : (
        <Tabs value={selectedTab} onValueChange={(val) => { setSelectedTab(val); setCurrentPage(1); setSelectedSector("ALL"); }} className="w-full">
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
              <div className="flex items-center gap-2">
                {selectedTab === 'raw_view' ? (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">DATOS SIN FILTRAR</Badge>
                ) : (
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">CENTRO {selectedTab}</Badge>
                )}
                <span>Filas totales: {currentViewOrders.length}</span>
              </div>
              <div className="flex items-center gap-2">
                 <AlertCircle className="w-3 h-3" />
                 <span>Mostrando registros compatibles con "Ensamblado"</span>
              </div>
            </div>

            <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
              <div style={{ transform: 'rotateX(180deg)' }}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Centro</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Orden</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Material</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">Nombre del Producto</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Programado</th>
                      <th className="px-6 py-3 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">Entregado</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Sector</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Resp. Ctrl.</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-gray-700 uppercase tracking-wider">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayedOrders.length > 0 ? displayedOrders.map((order, idx) => (
                      <tr key={`${order.ORDEN}-${idx}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-xs font-bold text-gray-400">{order.CENTRO || order.Centro || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono font-bold text-indigo-600">{order.ORDEN}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">{formatMaterial(order.MATERIAL)}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={order.NOMBRE}>{order.NOMBRE}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-gray-900">
                          {Number(order.CANTPROGRAMADA || 0).toLocaleString()} <span className="text-[10px] text-gray-400 font-normal">{order.UNIDAD}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-right text-green-600">
                          {Number(order.CANTENTREGADA || 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-[10px] font-bold text-amber-700">
                          <span className="bg-amber-50 px-2 py-0.5 rounded border border-amber-100">{order.SECTORDESC || 'SIN SECTOR'}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{order.RESPCTRLPROD || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-gray-600">{order.FECHA || '-'}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={9} className="px-6 py-12 text-center text-gray-400 italic">
                          No se encontraron registros para los criterios seleccionados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span className="text-xs font-medium text-gray-500 uppercase">Ver:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="text-sm border rounded p-1 bg-white"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-xs text-gray-400 font-medium">
                  Viendo {startIndex + 1} - {Math.min(startIndex + rowsPerPage, currentViewOrders.length)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Anterior</Button>
                <div className="px-4 py-1 bg-white border rounded text-sm font-bold text-indigo-600 min-w-[80px] text-center">{currentPage} / {totalPagesLocal}</div>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPagesLocal, p + 1))} disabled={currentPage === totalPagesLocal}>Siguiente</Button>
              </div>
            </div>
          </div>
        </Tabs>
      )}
    </div>
  );
};
