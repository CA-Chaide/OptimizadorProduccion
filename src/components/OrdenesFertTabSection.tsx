'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, Search, Home, Database, LayoutGrid, UserCheck, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

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
  CANTPENDIENTE: number;
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
  T_PROD?: number; // Nueva columna para tiempo de producción
  [key: string]: any;
}

export const OrdenesFertTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('OrdenesFertTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  // Estados de Datos
  const [allRawOrders, setAllRawOrders] = useState<OrdenFert[]>([]);
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [restrictions, setRestrictions] = useState<any[]>([]);
  
  // Estados de UI
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
      // 1. Consulta exploratoria para obtener el total de registros
      console.log('[OrdenesFert] Iniciando consulta exploratoria...');
      const exploratoryRes = await serviciosService.getOrdenesFert(1, 1);
      const total = exploratoryRes.totalRegistros || 0;
      
      let allData: OrdenFert[] = [];
      
      if (total > 0) {
        const BATCH_SIZE = 10000;
        const totalPages = Math.ceil(total / BATCH_SIZE);
        console.log(`[OrdenesFert] Detectados ${total} registros. Cargando en ${totalPages} bloques de ${BATCH_SIZE}...`);
        
        // 2. Cargar todos los bloques
        for (let i = 1; i <= totalPages; i++) {
          console.log(`[OrdenesFert] Descargando bloque ${i}/${totalPages}...`);
          const res = await serviciosService.getOrdenesFert(i, BATCH_SIZE);
          if (res?.data) {
            const pageData = Array.isArray(res.data) ? res.data : [res.data];
            allData = [...allData, ...pageData];
          }
        }
      }

      // 3. Cargar grupos y restricciones para filtros
      const [groupsRes, restRes] = await Promise.all([
        grupoService.getAll(),
        restriccionService.getAll()
      ]);

      setAllRawOrders(allData);
      setGroups(groupsRes?.data || []);
      setRestrictions(restRes?.data || []);

      const centersFromGroups = [...new Set((groupsRes?.data || []).map((g: any) => String(g.centro).trim()))].sort();
      setAvailableCenters(centersFromGroups);
      
      inspector.captureVariable('fert_raw_count', allData.length);
      inspector.captureVariable('restrictions_count', (restRes?.data || []).length);
      
      console.log('[OrdenesFert] Carga completa finalizada.');
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

  // Helper para parsear responsables (separados por , o &)
  const parseResponsables = (value: string): string[] => {
    if (!value) return [];
    return value.split(/[,&]/).map(v => v.trim()).filter(Boolean);
  };

  // Obtener responsables configurados para un centro específico
  const getResponsablesPorCentro = (centerId: string) => {
    const groupForCenter = groups.find(g => String(g.centro).trim() === centerId);
    if (!groupForCenter) return [];
    
    const restriction = restrictions.find(r => 
      r.codigo_grupo === groupForCenter.codigo_grupo && 
      r.nombre_restriccion === 'RespCtrlProd'
    );
    
    return parseResponsables(restriction?.valor_restriccion || '');
  };

  // AGRUPACIÓN Y FILTRADO PRINCIPAL
  const filteredDataByCenter = useMemo(() => {
    const grouped: Record<string, OrdenFert[]> = {};
    
    availableCenters.forEach(centerId => {
      // 1. Filtrar por Centro
      let centerOrders = allRawOrders.filter(order => {
        const orderCenter = String(order.CENTRO || order.Centro || order.centro || '').trim();
        return orderCenter === centerId;
      });

      // 2. Filtrar por Responsables (RespCtrlProd) configurados en restricciones
      const allowedResps = getResponsablesPorCentro(centerId);
      if (allowedResps.length > 0) {
        centerOrders = centerOrders.filter(order => 
          allowedResps.includes(String(order.RESPCTRLPROD).trim())
        );
      }

      grouped[centerId] = centerOrders;
    });

    return grouped;
  }, [allRawOrders, availableCenters, groups, restrictions]);

  // Sectores disponibles en la vista actual
  const availableSectors = useMemo(() => {
    const baseOrders = selectedTab === "raw_view" 
      ? allRawOrders 
      : (filteredDataByCenter[selectedTab] || []);
    
    return [...new Set(baseOrders.map(o => String(o.SECTORDESC || 'SIN SECTOR').trim().toUpperCase()))].sort();
  }, [allRawOrders, filteredDataByCenter, selectedTab]);

  // Aplicación de filtros de UI (Búsqueda y Combo de Sectores)
  const currentViewOrders = useMemo(() => {
    let base = selectedTab === "raw_view" 
      ? allRawOrders 
      : (filteredDataByCenter[selectedTab] || []);

    const term = searchTerm.toLowerCase().trim();
    
    return base.filter(o => {
      if (selectedSector !== "ALL") {
        if (String(o.SECTORDESC || 'SIN SECTOR').trim().toUpperCase() !== selectedSector) return false;
      }
      if (term) {
        return (
          String(o.ORDEN || '').toLowerCase().includes(term) ||
          String(o.MATERIAL || '').toLowerCase().includes(term) ||
          String(o.NOMBRE || '').toLowerCase().includes(term) ||
          String(o.PEDIDO || '').toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [allRawOrders, filteredDataByCenter, selectedTab, searchTerm, selectedSector]);

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
            <h3 className="text-xl font-semibold text-gray-800">Órdenes FERT (Detalle Completo)</h3>
            <p className="text-xs text-gray-500 mt-1">Filtrado dinámico por Centro y Responsables</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-56">
            <Select value={selectedSector} onValueChange={(val) => { setSelectedSector(val); setCurrentPage(1); }}>
              <SelectTrigger className="h-9 bg-white">
                <LayoutGrid className="w-3.5 h-3.5 mr-2 text-gray-400" />
                <SelectValue placeholder="Sector" />
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
              placeholder="Orden, material, pedido..."
              className="pl-9 h-9 text-xs"
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
          <span className="mt-4 text-gray-600 font-medium">Cargando datos...</span>
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
                Centro {center} ({filteredDataByCenter[center]?.length || 0})
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Label de Responsables Activos para el Centro */}
          {selectedTab !== "raw_view" && (
            <div className="mb-4 px-4 py-3 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center gap-3">
              <UserCheck className="w-5 h-5 text-indigo-600 shrink-0" />
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs font-bold text-indigo-800 uppercase tracking-tight">Responsables Activos:</span>
                {(() => {
                  const resps = getResponsablesPorCentro(selectedTab);
                  return resps.length > 0 ? (
                    resps.map(r => (
                      <Badge key={r} variant="secondary" className="bg-indigo-100 text-indigo-700 text-[10px] font-mono border-indigo-200">
                        {r}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-[10px] text-indigo-400 italic">Todos los responsables (Sin restricción)</span>
                  );
                })()}
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {/* Contenedor para Scroll Horizontal Superior */}
            <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
              <div style={{ transform: 'rotateX(180deg)' }}>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Centro</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Orden</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Material</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Categoría</th>
                      <th className="px-3 py-3 text-left text-[10px] font-bold text-gray-500 uppercase">Nombre</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase bg-indigo-50/30">T. Prod</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-gray-500 uppercase">Prog.</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-gray-500 uppercase">Entreg.</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-blue-600 uppercase">Notif.</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-red-600 uppercase">Rech.</th>
                      <th className="px-3 py-3 text-right text-[10px] font-bold text-amber-600 uppercase">Pend.</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">Resp.</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">Sector</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">Pri.</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">Máquina</th>
                      <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {displayedOrders.length > 0 ? displayedOrders.map((order, idx) => (
                      <tr key={`${order.ORDEN}-${idx}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-4 whitespace-nowrap text-[10px] font-bold text-gray-400">{order.CENTRO}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-mono font-bold text-indigo-600">{order.ORDEN}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-mono text-gray-600">{formatMaterial(order.MATERIAL)}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-[10px] text-gray-500">{order.CATEGORIA}</td>
                        <td className="px-3 py-4 text-xs text-gray-600 max-w-xs truncate font-medium" title={order.NOMBRE}>{order.NOMBRE}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-indigo-600 bg-indigo-50/10">
                          {order.T_PROD ? Number(order.T_PROD).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-gray-900">{order.CANTPROGRAMADA}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-green-600">{order.CANTENTREGADA}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-blue-600 bg-blue-50/30">{order.CANTNOTIFICADA}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-red-600 bg-red-50/30">{order.CANTRECHAZO}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-xs font-bold text-right text-amber-600 bg-amber-50/20">{order.CANTPENDIENTE || 0}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-center">
                          <Badge variant="outline" className="text-[10px] font-mono border-gray-100 bg-gray-50 text-gray-400">{order.RESPCTRLPROD}</Badge>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-center">
                          <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-100 text-[10px] font-bold uppercase">
                            {order.SECTORDESC || 'SIN SECTOR'}
                          </span>
                        </td>
                        <td className="px-3 py-4 whitespace-nowrap text-center text-[10px] font-mono">{order.PRIORIDAD}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-[10px] text-center text-gray-500 font-mono">{order.MAQUINA || '-'}</td>
                        <td className="px-3 py-4 whitespace-nowrap text-[10px] text-center text-gray-600">{order.FECHA}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={16} className="px-6 py-12 text-center text-gray-400 italic">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <AlertCircle className="w-8 h-8 text-gray-300" />
                            <span>No hay órdenes para los filtros configurados (Centro + Responsables).</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-gray-50 px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 text-xs">
                <span className="font-medium text-gray-500 uppercase">Mostrar:</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="border rounded p-1 bg-white"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
                <span className="text-gray-400">
                  {startIndex + 1} - {Math.min(startIndex + rowsPerPage, currentViewOrders.length)} de {currentViewOrders.length}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Ant.</Button>
                <div className="px-4 py-1 bg-white border rounded text-xs font-bold text-indigo-600 min-w-[80px] text-center">{currentPage} / {totalPagesLocal}</div>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPagesLocal, p + 1))} disabled={currentPage === totalPagesLocal}>Sig.</Button>
              </div>
            </div>
          </div>
        </Tabs>
      )}
    </div>
  );
};
