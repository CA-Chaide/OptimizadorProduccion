'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, AlertCircle, FileText, Clock, Search, Filter, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/**
 * TacticalPlanVentaExternaSection
 * 
 * Vista optimizada para el grupo "Venta Externa"
 * - Pestañas alineadas uniformemente.
 * - Filtros de búsqueda por material y responsable.
 * - Doble scroll sincronizado para navegación técnica.
 */
export const TacticalPlanVentaExternaSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanVentaExterna');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingPhase, setLoadingPhase] = useState<string>('Inicializando...');

  // Estados de filtrado por búsqueda
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRespFilter, setSelectedRespFilter] = useState('');

  // Refs para sincronización de scroll
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  const topScrollFertRef = useRef<HTMLDivElement>(null);
  const tableContainerFertRef = useRef<HTMLDivElement>(null);
  const tableFertRef = useRef<HTMLTableElement>(null);
  const [tableFertWidth, setTableFertWidth] = useState(0);

  const topScrollTiemposRef = useRef<HTMLDivElement>(null);
  const tableContainerTiemposRef = useRef<HTMLDivElement>(null);
  const tableTiemposRef = useRef<HTMLTableElement>(null);
  const [tableTiemposWidth, setTableTiemposWidth] = useState(0);

  const extractOrderValue = (order: any, keys: string[]) => {
    for (const key of keys) {
      if (order[key] !== undefined && order[key] !== null) {
        return String(order[key]).trim();
      }
    }
    return '';
  };

  // 1. Cargar Grupos
  const fetchGruposVentaExterna = async () => {
    try {
      setLoadingPhase('Cargando grupos...');
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo && g.nombre_grupo.toLowerCase().includes('venta externa')
      );
      setGrupos(filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
      return [];
    }
  };

  // 2. Cargar Restricciones (Filtro por RESPCTRLPROD)
  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      setLoadingPhase('Cargando restricciones...');
      const res = await restriccionService.getAll();
      const filtered = (res.data || []).filter(r => 
        gruposIds.includes(r.codigo_grupo)
      );
      setRestricciones(filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando restricciones:', error);
      return [];
    }
  };

  // 3. Cargar Tiempos
  const fetchTiemposEnsamblado = async (filteredGroups: Grupo[]) => {
    setLoadingPhase('Cargando tiempos...');
    const allTiempos = [];
    for (const g of filteredGroups) {
      if (!g.centro) continue;
      try {
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo);
        if (res.data && Array.isArray(res.data)) {
          allTiempos.push(...res.data);
        }
      } catch (error) {
        console.warn(`Sin tiempos para grupo ${g.codigo_grupo}`);
      }
    }
    setTiemposEnsamblado(allTiempos);
  };

  const fetchOrdenes = async () => {
    try {
      setLoadingPhase('Cargando órdenes provisionales...');
      const res = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (error) { console.error(error); }
  };

  const fetchOrdenesFert = async () => {
    try {
      setLoadingPhase('Cargando órdenes fert...');
      const res = await serviciosService.getOrdenesFert(1, 20000);
      setOrdersFert(Array.isArray(res.data) ? res.data : []);
    } catch (error) { console.error(error); }
  };

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGruposVentaExterna();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await fetchRestricciones(groupsIds);
      await Promise.all([fetchOrdenes(), fetchOrdenesFert(), fetchTiemposEnsamblado(filteredGroups)]);
      setIsLoading(false);
    };
    initData();
  }, []);

  // Lógica de filtrado base por restricciones
  const filtrarDataPorRestriccion = (data: any[]) => {
    const respCtrlProdValues = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almacenValues = restricciones
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .map(r => r.valor_restriccion.trim())
      .filter(v => v !== '');

    if (respCtrlProdValues.length === 0 && almacenValues.length === 0) return data;

    return data.filter(o => {
      const respVal = extractOrderValue(o, ['RESPCTRLPROD', 'RESPCONTROLPROD', 'RespCtrlProd', 'respCtrlProd']);
      const almVal = extractOrderValue(o, ['Almacen', 'ALMACEN', 'almacen']);
      
      const matchResp = respCtrlProdValues.length === 0 || respCtrlProdValues.includes(respVal);
      const matchAlmacen = almacenValues.length === 0 || almacenValues.includes(almVal);
      
      return matchResp && matchAlmacen;
    });
  };

  // Filtrado final por búsqueda de usuario
  const applyUserFilters = (data: any[]) => {
    return data.filter(item => {
      const material = extractOrderValue(item, ['CodMaterial', 'MATERIAL', 'Material', 'Cod_Material', 'NOMBRE', 'Nombre']).toLowerCase();
      const responsable = extractOrderValue(item, ['NombRespControlProd', 'RespCtrlProd', 'RESPCTRLPROD', 'NOMBRESPCONTROLPROD']).toLowerCase();
      
      const matchSearch = !searchQuery || material.includes(searchQuery.toLowerCase());
      const matchResp = !selectedRespFilter || responsable === selectedRespFilter.toLowerCase();
      
      return matchSearch && matchResp;
    });
  };

  const ordenesFinales = useMemo(() => applyUserFilters(filtrarDataPorRestriccion(ordenes)), [ordenes, restricciones, searchQuery, selectedRespFilter]);
  const ordenesFertFinales = useMemo(() => applyUserFilters(filtrarDataPorRestriccion(ordenesFert)), [ordenesFert, restricciones, searchQuery, selectedRespFilter]);
  const tiemposFinales = useMemo(() => applyUserFilters(tiemposEnsamblado), [tiemposEnsamblado, searchQuery, selectedRespFilter]);

  // Lista de responsables para el select de filtro
  const uniqueResponsibles = useMemo(() => {
    const resps = new Set<string>();
    [...ordenes, ...ordenesFert, ...tiemposEnsamblado].forEach(o => {
      const val = extractOrderValue(o, ['NombRespControlProd', 'RespCtrlProd', 'RESPCTRLPROD', 'NOMBRESPCONTROLPROD']);
      if (val) resps.add(val);
    });
    return Array.from(resps).sort();
  }, [ordenes, ordenesFert, tiemposEnsamblado]);

  // Sincronización de scroll
  const setupScrollSync = (top: HTMLDivElement | null, bottom: HTMLDivElement | null) => {
    if (!top || !bottom) return;
    const syncBottom = () => { bottom.scrollLeft = top.scrollLeft; };
    const syncTop = () => { top.scrollLeft = bottom.scrollLeft; };
    top.addEventListener('scroll', syncBottom);
    bottom.addEventListener('scroll', syncTop);
    return () => {
      top.removeEventListener('scroll', syncBottom);
      bottom.removeEventListener('scroll', syncTop);
    };
  };

  useEffect(() => {
    if (activeTab === 'ordenes' && tableRef.current) {
      setTableWidth(tableRef.current.offsetWidth);
      return setupScrollSync(topScrollRef.current, tableContainerRef.current);
    }
  }, [activeTab, ordenesFinales]);

  useEffect(() => {
    if (activeTab === 'ordenesFert' && tableFertRef.current) {
      setTableFertWidth(tableFertRef.current.offsetWidth);
      return setupScrollSync(topScrollFertRef.current, tableContainerFertRef.current);
    }
  }, [activeTab, ordenesFertFinales]);

  useEffect(() => {
    if (activeTab === 'tiempos' && tableTiemposRef.current) {
      setTableTiemposWidth(tableTiemposRef.current.offsetWidth);
      return setupScrollSync(topScrollTiemposRef.current, tableContainerTiemposRef.current);
    }
  }, [activeTab, tiemposFinales]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
        <p className="text-gray-500 font-medium">{loadingPhase}</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ShoppingCart className="w-8 h-8 text-green-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Programación Táctica Venta Externa</h2>
            <p className="text-sm text-gray-500">Gestión de órdenes, restricciones y tiempos estándar</p>
          </div>
        </div>
      </div>
      
      {/* Barra de Filtros Globales (Search Bar) */}
      <div className="bg-white p-4 border rounded-xl shadow-sm flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[250px] space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
            <Search className="w-3 h-3" /> Buscar Material
          </label>
          <div className="relative">
            <Input 
              placeholder="Código o descripción..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          </div>
        </div>
        
        <div className="w-64 space-y-1.5">
          <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1.5">
            <Filter className="w-3 h-3" /> Responsable
          </label>
          <select 
            value={selectedRespFilter}
            onChange={(e) => setSelectedRespFilter(e.target.value)}
            className="w-full h-10 border rounded-md px-3 text-sm focus:ring-2 focus:ring-green-500 outline-none"
          >
            <option value="">Todos los responsables</option>
            {uniqueResponsibles.map(resp => (
              <option key={resp} value={resp}>{resp}</option>
            ))}
          </select>
        </div>

        <Button 
          variant="outline" 
          onClick={() => { setSearchQuery(''); setSelectedRespFilter(''); }}
          className="h-10 text-gray-500"
        >
          <X className="w-4 h-4 mr-2" /> Limpiar
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        {/* TabsList con alineación corregida */}
        <TabsList className="flex w-full bg-gray-100/80 p-1 rounded-xl mb-8 border border-gray-200">
          <TabsTrigger value="grupos" className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg"><Lock className="w-4 h-4" /> Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes" className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg"><Package className="w-4 h-4" /> Provisionales</TabsTrigger>
          <TabsTrigger value="ordenesFert" className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg"><FileText className="w-4 h-4" /> Órdenes Fert</TabsTrigger>
          <TabsTrigger value="tiempos" className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm rounded-lg"><Clock className="w-4 h-4" /> Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Grupos Identificados</CardTitle>
              <CardDescription>Áreas de Venta Externa mapeadas en el sistema</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grupos.map(g => (
                  <div key={g.codigo_grupo} className="p-5 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50 hover:border-green-300 hover:bg-green-50/30 transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="font-bold text-lg text-green-900">{g.nombre_grupo}</span>
                      <Badge className="bg-green-100 text-green-800 border-green-200">{g.centro}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 font-mono">
                      <span className="px-2 py-0.5 bg-white border rounded">ID: {g.codigo_grupo}</span>
                      <span className="px-2 py-0.5 bg-white border rounded">Estado: Activo</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <CardHeader>
              <CardTitle>Criterios de Filtrado (Restricciones)</CardTitle>
              <CardDescription>Parámetros técnicos utilizados para segmentar las órdenes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded-xl bg-white">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-dashed border-gray-200">Parámetro</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-dashed border-gray-200">Valor</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {restricciones.map(r => (
                      <tr key={r.codigo_restriccion} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-center border-r border-dashed border-gray-200">{r.nombre_restriccion}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center border-r border-dashed border-gray-200">
                          <Badge variant="outline" className="font-mono border-green-200 text-green-700 bg-green-50 px-3">{r.valor_restriccion}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 text-center">{r.descripcion || 'Sin descripción técnica'}</td>
                      </tr>
                    ))}
                    {restricciones.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-10 text-center text-gray-400 italic">No hay restricciones configuradas para Venta Externa.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab de Órdenes Provisionales con contenido centrado y scroll */}
        <TabsContent value="ordenes">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Órdenes Provisionales</CardTitle>
                <CardDescription>Lista de pedidos pendientes de programación</CardDescription>
              </div>
              <Badge variant="outline" className="h-7 border-green-200 text-green-700 bg-green-50">{ordenesFinales.length} Registros</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                <div ref={topScrollRef} className="overflow-x-auto h-4 bg-gray-50 border-t border-x rounded-t-lg" style={{ marginBottom: '-1px' }}>
                  <div style={{ width: tableWidth, height: '1px' }} />
                </div>
                <div ref={tableContainerRef} className="overflow-x-auto border rounded-b-lg max-h-[600px] bg-white">
                  <table ref={tableRef} className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Orden</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Material</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Cantidad</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Almacén</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Responsable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {ordenesFinales.map((o, idx) => (
                        <tr key={idx} className="hover:bg-green-50/30 transition-colors">
                          <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 border-r border-dashed border-gray-200">{o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-3 text-center border-r border-dashed border-gray-200">
                            <div className="font-mono text-xs text-green-700 font-bold">{o.MATERIAL}</div>
                            <div className="text-xs text-gray-500 truncate max-w-[250px] mx-auto">{o.NOMBRE}</div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-green-800 border-r border-dashed border-gray-200">{o.CANTIDAD}</td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600 border-r border-dashed border-gray-200">{o.Almacen || o.ALMACEN}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{o.NombRespControlProd || o.RespCtrlProd || o.RESPCTRLPROD}</td>
                        </tr>
                      ))}
                      {ordenesFinales.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-20 text-center text-gray-400 italic">No se encontraron órdenes que coincidan con la búsqueda.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab de Órdenes Fert */}
        <TabsContent value="ordenesFert">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Órdenes Fert</CardTitle>
                <CardDescription>Órdenes de producto terminado filtradas</CardDescription>
              </div>
              <Badge variant="outline" className="h-7 border-blue-200 text-blue-700 bg-blue-50">{ordenesFertFinales.length} Registros</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                <div ref={topScrollFertRef} className="overflow-x-auto h-4 bg-gray-50 border-t border-x rounded-t-lg" style={{ marginBottom: '-1px' }}>
                  <div style={{ width: tableFertWidth, height: '1px' }} />
                </div>
                <div ref={tableContainerFertRef} className="overflow-x-auto border rounded-b-lg max-h-[600px] bg-white">
                  <table ref={tableFertRef} className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Orden Fert</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Material</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Cantidad</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Almacén</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Responsable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {ordenesFertFinales.map((o, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 border-r border-dashed border-gray-200">{o.Orden || o.ORDENFERT}</td>
                          <td className="px-4 py-3 text-center border-r border-dashed border-gray-200">
                            <div className="font-mono text-xs text-blue-700 font-bold">{o.CodMaterial || o.MATERIAL}</div>
                            <div className="text-xs text-gray-500 truncate max-w-[250px] mx-auto">{o.Descripcion || o.NOMBRE}</div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-blue-800 border-r border-dashed border-gray-200">{o.Cantidad || o.CANTIDAD}</td>
                          <td className="px-4 py-3 text-center text-sm text-gray-600 border-r border-dashed border-gray-200">{o.Almacen || o.ALMACEN}</td>
                          <td className="px-4 py-3 text-center text-xs text-gray-500">{o.NombRespControlProd || o.RespCtrlProd || o.RESPCTRLPROD}</td>
                        </tr>
                      ))}
                      {ordenesFertFinales.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-20 text-center text-gray-400 italic">No se encontraron órdenes Fert para mostrar.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab de Tiempos de Ensamblado */}
        <TabsContent value="tiempos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tiempos de Ensamblado</CardTitle>
                <CardDescription>Catálogo de tiempos estándar por material y proceso</CardDescription>
              </div>
              <Badge variant="outline" className="h-7 border-purple-200 text-purple-700 bg-purple-50">{tiemposFinales.length} Registros</Badge>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                <div ref={topScrollTiemposRef} className="overflow-x-auto h-4 bg-gray-50 border-t border-x rounded-t-lg" style={{ marginBottom: '-1px' }}>
                  <div style={{ width: tableTiemposWidth, height: '1px' }} />
                </div>
                <div ref={tableContainerTiemposRef} className="overflow-x-auto border rounded-b-lg max-h-[600px] bg-white">
                  <table ref={tableTiemposRef} className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Material</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Línea - Puesto</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Tiempo (min)</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase border-r border-dashed border-gray-200">Stock</th>
                        <th className="px-4 py-3 text-center text-xs font-bold text-gray-600 uppercase">Clase</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {tiemposFinales.map((t, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                          <td className="px-4 py-3 text-center text-sm font-bold text-gray-900 border-r border-dashed border-gray-200 font-mono">{t.CodMaterial}</td>
                          <td className="px-4 py-3 text-center border-r border-dashed border-gray-200">
                            <div className="text-xs font-semibold text-gray-700">{t.Linea}</div>
                            <div className="text-[10px] text-gray-500">{t.PuestoTrabajo}</div>
                          </td>
                          <td className="px-4 py-3 text-center text-sm font-bold text-purple-700 border-r border-dashed border-gray-200">
                            {t.Tiempo_Min ? t.Tiempo_Min.toFixed(4) : '0.0000'}
                          </td>
                          <td className="px-4 py-3 text-center border-r border-dashed border-gray-200">
                            <div className="text-xs font-mono">Act: {t.StockActual || 0}</div>
                            <div className="text-[10px] text-gray-400 font-mono">Seg: {t.StockSeguridad || 0}</div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className="text-[10px] font-bold uppercase">{t.ClaseAprovisionam || 'E'}</Badge>
                          </td>
                        </tr>
                      ))}
                      {tiemposFinales.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-20 text-center text-gray-400 italic">No hay datos de tiempos para mostrar.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
