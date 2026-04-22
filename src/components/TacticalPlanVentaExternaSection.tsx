
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, FileText, Clock, Search, Filter, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * TacticalPlanVentaExternaSection
 * 
 * Vista optimizada para el grupo "Venta Externa"
 * - Pestañas alineadas uniformemente.
 * - Filtros de búsqueda global por material y responsable.
 * - Doble scroll sincronizado para todas las tablas de datos.
 * - Filtrado dinámico basado estrictamente en la restricción RESPCTRLPROD.
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

  // Refs para sincronización de scroll (Doble Scroll)
  const syncRefs = {
    ordenes: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) },
    fert: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) },
    tiempos: { top: useRef<HTMLDivElement>(null), bottom: useRef<HTMLDivElement>(null), table: useRef<HTMLTableElement>(null), width: useState(0) }
  };

  const extractValue = (item: any, keys: string[]) => {
    for (const key of keys) {
      if (item[key] !== undefined && item[key] !== null) return String(item[key]).trim();
    }
    return '';
  };

  // 1. Cargar Grupos de Venta Externa
  const fetchGrupos = async () => {
    try {
      setLoadingPhase('Cargando grupos operativos...');
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo && g.nombre_grupo.toLowerCase().includes('venta externa')
      );
      setGrupos(filtered);
      inspector.captureVariable('gruposVentaExternaDetectados', filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
      return [];
    }
  };

  // 2. Cargar Restricciones del Grupo
  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      setLoadingPhase('Cargando restricciones de filtrado...');
      const res = await restriccionService.getAll();
      const filtered = (res.data || []).filter(r => gruposIds.includes(r.codigo_grupo));
      setRestricciones(filtered);
      inspector.captureVariable('restriccionesVentaExterna', filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando restricciones:', error);
      return [];
    }
  };

  // 3. Cargar Órdenes y Tiempos
  const loadData = async (filteredGroups: Grupo[]) => {
    try {
      setLoadingPhase('Cargando órdenes provisionales...');
      const provRes = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      setOrders(Array.isArray(provRes.data) ? provRes.data : []);

      setLoadingPhase('Cargando órdenes fert...');
      const fertRes = await serviciosService.getOrdenesFert(1, 20000);
      setOrdersFert(Array.isArray(fertRes.data) ? fertRes.data : []);

      setLoadingPhase('Cargando tiempos de ensamblado...');
      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        console.log(`[Venta Externa] Consultando tiempos para Centro: ${g.centro}, Grupo: ${g.codigo_grupo}`);
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo);
        
        // Manejar estructura { data: [], length }
        const dataArray = res.data ? (Array.isArray(res.data) ? res.data : [res.data]) : [];
        if (dataArray.length > 0) {
          allTiempos.push(...dataArray);
        }
      }
      setTiemposEnsamblado(allTiempos);
      console.log(`[Venta Externa - Tiempos] Total registros cargados: ${allTiempos.length}`);
      inspector.captureVariable('tiemposEnsambladoVentaExterna', allTiempos);
    } catch (error) {
      console.error('Error cargando datos operativos:', error);
      addNotification('error', 'Error al recuperar datos de la API');
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGrupos();
      const ids = filteredGroups.map(g => g.codigo_grupo);
      await fetchRestricciones(ids);
      await loadData(filteredGroups);
      setIsLoading(false);
    };
    init();
  }, []);

  // Lógica de filtrado dinámico
  const filterByRestriccionAndSearch = (data: any[]) => {
    // 1. Obtener valores de RESPCTRLPROD configurados
    const respCodes = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    // 2. Aplicar filtros
    return data.filter(item => {
      const itemResp = extractValue(item, ['RESPCTRLPROD', 'RESPCONTROLPROD', 'RespCtrlProd', 'respCtrlProd', 'NombRespControlProd']);
      const itemMat = extractValue(item, ['CodMaterial', 'MATERIAL', 'Material', 'NOMBRE', 'Nombre', 'Descripcion']).toLowerCase();
      const itemNameResp = extractValue(item, ['NombRespControlProd', 'RespCtrlProd', 'RESPCTRLPROD']).toLowerCase();

      // Coincidencia con restricciones (solo si hay códigos configurados)
      const matchesRestriccion = respCodes.length === 0 || respCodes.includes(itemResp);
      
      // Coincidencia con buscador de usuario
      const matchesSearch = !searchQuery || itemMat.includes(searchQuery.toLowerCase());
      const matchesRespFilter = !selectedRespFilter || itemNameResp === selectedRespFilter.toLowerCase() || itemResp === selectedRespFilter;

      return matchesRestriccion && matchesSearch && matchesRespFilter;
    });
  };

  const filteredOrders = useMemo(() => filterByRestriccionAndSearch(ordenes), [ordenes, restricciones, searchQuery, selectedRespFilter]);
  const filteredFert = useMemo(() => filterByRestriccionAndSearch(ordenesFert), [ordenesFert, restricciones, searchQuery, selectedRespFilter]);
  const filteredTiempos = useMemo(() => filterByRestriccionAndSearch(tiemposEnsamblado), [tiemposEnsamblado, restricciones, searchQuery, selectedRespFilter]);

  const uniqueResponsibles = useMemo(() => {
    const resps = new Set<string>();
    [...ordenes, ...ordenesFert, ...tiemposEnsamblado].forEach(o => {
      const name = extractValue(o, ['NombRespControlProd']);
      const code = extractValue(o, ['RespCtrlProd', 'RESPCTRLPROD']);
      if (name) resps.add(name);
      else if (code) resps.add(code);
    });
    return Array.from(resps).sort();
  }, [ordenes, ordenesFert, tiemposEnsamblado]);

  // Sincronización de scroll
  const setupScroll = (refGroup: any) => {
    if (!refGroup.top.current || !refGroup.bottom.current) return;
    const syncB = () => { refGroup.bottom.current.scrollLeft = refGroup.top.current.scrollLeft; };
    const syncT = () => { refGroup.top.current.scrollLeft = refGroup.bottom.current.scrollLeft; };
    refGroup.top.current.addEventListener('scroll', syncB);
    refGroup.bottom.current.addEventListener('scroll', syncT);
    return () => {
      refGroup.top.current?.removeEventListener('scroll', syncB);
      refGroup.bottom.current?.removeEventListener('scroll', syncT);
    };
  };

  useEffect(() => {
    if (activeTab === 'ordenes' && syncRefs.ordenes.table.current) {
      syncRefs.ordenes.width[1](syncRefs.ordenes.table.current.offsetWidth);
      return setupScroll(syncRefs.ordenes);
    }
    if (activeTab === 'ordenesFert' && syncRefs.fert.table.current) {
      syncRefs.fert.width[1](syncRefs.fert.table.current.offsetWidth);
      return setupScroll(syncRefs.fert);
    }
    if (activeTab === 'tiempos' && syncRefs.tiempos.table.current) {
      syncRefs.tiempos.width[1](syncRefs.tiempos.table.current.offsetWidth);
      return setupScroll(syncRefs.tiempos);
    }
  }, [activeTab, filteredOrders, filteredFert, filteredTiempos]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-green-600" />
        <p className="text-gray-500 font-semibold">{loadingPhase}</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <ShoppingCart className="w-10 h-10 text-green-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Programación Táctica Venta Externa</h2>
            <p className="text-sm text-gray-500 font-medium">Panel de gestión técnica y operativa</p>
          </div>
        </div>
      </div>
      
      {/* Barra de Filtros Inteligente */}
      <div className="bg-white p-5 border rounded-2xl shadow-sm flex flex-wrap gap-5 items-end">
        <div className="flex-1 min-w-[300px] space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
            <Search className="w-3.5 h-3.5" /> Buscar Material / Código
          </label>
          <div className="relative">
            <Input 
              placeholder="Ej: 20005178 o Sábana..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 border-gray-200 focus:ring-green-500 rounded-xl"
            />
            <Search className="absolute left-3.5 top-3.5 w-4.5 h-4.5 text-gray-400" />
          </div>
        </div>
        
        <div className="w-72 space-y-2">
          <label className="text-xs font-bold text-gray-400 uppercase flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" /> Responsable de Área
          </label>
          <select 
            value={selectedRespFilter}
            onChange={(e) => setSelectedRespFilter(e.target.value)}
            className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white transition-all"
          >
            <option value="">Todos los responsables</option>
            {uniqueResponsibles.map(resp => (
              <option key={resp} value={resp}>{resp}</option>
            ))}
          </select>
        </div>

        <Button 
          variant="ghost" 
          onClick={() => { setSearchQuery(''); setSelectedRespFilter(''); }}
          className="h-11 px-5 text-gray-500 hover:bg-gray-100 rounded-xl font-semibold"
        >
          <X className="w-4 h-4 mr-2" /> Limpiar Filtros
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full bg-gray-100/60 p-1.5 rounded-2xl mb-8 border border-gray-200">
          <TabsTrigger value="grupos" className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl"><Lock className="w-4 h-4" /> Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes" className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl"><Package className="w-4 h-4" /> Provisionales</TabsTrigger>
          <TabsTrigger value="ordenesFert" className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl"><FileText className="w-4 h-4" /> Órdenes Fert</TabsTrigger>
          <TabsTrigger value="tiempos" className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all data-[state=active]:bg-white data-[state=active]:shadow-md rounded-xl"><Clock className="w-4 h-4" /> Tiempos</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-gray-50/50 border-b">
              <CardTitle>Grupos Operativos Detectados</CardTitle>
              <CardDescription>Áreas asignadas para Venta Externa</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {grupos.length === 0 ? (
                  <div className="col-span-full p-8 text-center text-gray-500 border-2 border-dashed rounded-2xl">
                    No se detectaron grupos con el nombre "Venta Externa"
                  </div>
                ) : (
                  grupos.map(g => (
                    <div key={g.codigo_grupo} className="p-6 border-2 border-dashed border-gray-200 rounded-2xl bg-white hover:border-green-400 hover:shadow-xl transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <span className="font-bold text-xl text-gray-800 group-hover:text-green-700 transition-colors">{g.nombre_grupo}</span>
                        <Badge className="bg-green-100 text-green-800 border-green-200 font-bold px-3 py-1">CENTRO {g.centro}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
                        <span className="px-3 py-1 bg-gray-50 rounded-lg border">ID: {g.codigo_grupo}</span>
                        <span className="px-3 py-1 bg-gray-50 rounded-lg border text-green-600 font-bold">Activo</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="bg-gray-50/50 border-b">
              <CardTitle>Configuración de Restricciones</CardTitle>
              <CardDescription>Parámetros técnicos de filtrado (RESPCTRLPROD)</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50/80">
                  <tr className="text-gray-500 text-xs font-bold uppercase">
                    <th className="px-6 py-4 text-center border-r border-dashed border-gray-200">Restricción</th>
                    <th className="px-6 py-4 text-center border-r border-dashed border-gray-200">Valor Configurado</th>
                    <th className="px-6 py-4 text-center">Propósito Técnico</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white text-center">
                  {restricciones.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-6 py-12 text-gray-400 italic">No hay restricciones configuradas para los grupos detectados</td>
                    </tr>
                  ) : (
                    restricciones.map(r => (
                      <tr key={r.codigo_restriccion} className="hover:bg-green-50/30 transition-colors">
                        <td className="px-6 py-5 font-bold text-gray-900 border-r border-dashed border-gray-200">{r.nombre_restriccion}</td>
                        <td className="px-6 py-5 border-r border-dashed border-gray-200">
                          <Badge variant="outline" className="font-mono border-green-200 text-green-700 bg-green-50 px-4 py-1 text-sm shadow-sm">{r.valor_restriccion}</Badge>
                        </td>
                        <td className="px-6 py-5 text-sm text-gray-500 italic">{r.descripcion || 'Configuración estándar para filtrado operativo.'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Órdenes Provisionales */}
        <TabsContent value="ordenes">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between bg-gray-50/50 border-b">
              <div>
                <CardTitle>Órdenes Provisionales</CardTitle>
                <CardDescription>Pedidos pendientes según restricciones</CardDescription>
              </div>
              <Badge className="bg-green-600 text-white px-4 py-1 rounded-full font-bold">{filteredOrders.length} Registros</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={syncRefs.ordenes.top} className="overflow-x-auto h-4 bg-gray-100/50 border-b">
                <div style={{ width: syncRefs.ordenes.width[0], height: '1px' }} />
              </div>
              <div ref={syncRefs.ordenes.bottom} className="overflow-x-auto max-h-[600px] bg-white">
                <table ref={syncRefs.ordenes.table} className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 shadow-sm z-10 text-center">
                    <tr className="text-gray-500 text-[10px] font-bold uppercase">
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material / Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Cantidad</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Almacén</th>
                      <th className="px-4 py-3">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-center">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-gray-400">No se encontraron órdenes que coincidan con los filtros</td>
                      </tr>
                    ) : (
                      filteredOrders.map((o, idx) => (
                        <tr key={idx} className="hover:bg-green-50/40 transition-colors">
                          <td className="px-4 py-4 text-sm font-bold text-gray-900 border-r border-dashed border-gray-200">{o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-200">
                            <div className="font-mono text-xs text-green-700 font-bold mb-1">{o.MATERIAL}</div>
                            <div className="text-[11px] text-gray-500 truncate max-w-[300px] mx-auto uppercase">{o.NOMBRE}</div>
                          </td>
                          <td className="px-4 py-4 text-sm font-bold text-gray-800 border-r border-dashed border-gray-200">{o.CANTIDAD}</td>
                          <td className="px-4 py-4 text-sm text-gray-600 border-r border-dashed border-gray-200 font-medium">{o.Almacen || o.ALMACEN}</td>
                          <td className="px-4 py-4 text-[11px] text-gray-400 font-medium">{o.NombRespControlProd || o.RespCtrlProd || o.RESPCTRLPROD}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Órdenes Fert */}
        <TabsContent value="ordenesFert">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between bg-gray-50/50 border-b">
              <div>
                <CardTitle>Órdenes Fert (Producto Terminado)</CardTitle>
                <CardDescription>Carga operativa del grupo</CardDescription>
              </div>
              <Badge className="bg-blue-600 text-white px-4 py-1 rounded-full font-bold">{filteredFert.length} Registros</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={syncRefs.fert.top} className="overflow-x-auto h-4 bg-gray-100/50 border-b">
                <div style={{ width: syncRefs.fert.width[0], height: '1px' }} />
              </div>
              <div ref={syncRefs.fert.bottom} className="overflow-x-auto max-h-[600px] bg-white">
                <table ref={syncRefs.fert.table} className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 shadow-sm z-10 text-center">
                    <tr className="text-gray-500 text-[10px] font-bold uppercase">
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Orden Fert</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material / Descripción</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Cantidad</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Almacén</th>
                      <th className="px-4 py-3">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-center">
                    {filteredFert.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-12 text-gray-400">No se encontraron órdenes Fert</td>
                      </tr>
                    ) : (
                      filteredFert.map((o, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                          <td className="px-4 py-4 text-sm font-bold text-gray-900 border-r border-dashed border-gray-200">{o.Orden || o.ORDENFERT}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-200">
                            <div className="font-mono text-xs text-blue-700 font-bold mb-1">{o.CodMaterial || o.MATERIAL}</div>
                            <div className="text-[11px] text-gray-500 truncate max-w-[300px] mx-auto uppercase">{o.Descripcion || o.NOMBRE}</div>
                          </td>
                          <td className="px-4 py-4 text-sm font-bold text-blue-800 border-r border-dashed border-gray-200">{o.Cantidad || o.CANTIDAD}</td>
                          <td className="px-4 py-4 text-sm text-gray-600 border-r border-dashed border-gray-200 font-medium">{o.Almacen || o.ALMACEN}</td>
                          <td className="px-4 py-4 text-[11px] text-gray-400 font-medium">{o.NombRespControlProd || o.RespCtrlProd || o.RESPCTRLPROD}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Tiempos de Ensamblado */}
        <TabsContent value="tiempos">
          <Card className="border-none shadow-lg rounded-2xl overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between bg-gray-50/50 border-b">
              <div>
                <CardTitle>Tiempos Estándar de Ensamblado</CardTitle>
                <CardDescription>Catálogo técnico por material y puesto</CardDescription>
              </div>
              <Badge className="bg-purple-600 text-white px-4 py-1 rounded-full font-bold">{filteredTiempos.length} Registros</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <div ref={syncRefs.tiempos.top} className="overflow-x-auto h-4 bg-gray-100/50 border-b">
                <div style={{ width: syncRefs.tiempos.width[0], height: '1px' }} />
              </div>
              <div ref={syncRefs.tiempos.bottom} className="overflow-x-auto max-h-[600px] bg-white">
                <table ref={syncRefs.tiempos.table} className="w-full border-collapse">
                  <thead className="bg-gray-50 sticky top-0 shadow-sm z-10 text-center">
                    <tr className="text-gray-500 text-[10px] font-bold uppercase">
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Material</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Línea / Puesto</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Tiempo (min)</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Stock Actual</th>
                      <th className="px-4 py-3 border-r border-dashed border-gray-200">Stock Seg.</th>
                      <th className="px-4 py-3">Responsable</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-center">
                    {filteredTiempos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-gray-400">No se encontraron tiempos de ensamblado para este grupo</td>
                      </tr>
                    ) : (
                      filteredTiempos.map((t, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/40 transition-colors">
                          <td className="px-4 py-4 text-sm font-bold text-gray-900 border-r border-dashed border-gray-200 font-mono">{t.CodMaterial}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-200">
                            <div className="text-xs font-bold text-gray-700 mb-0.5">{t.Linea || t.PuestoTrabajoLinea}</div>
                            <div className="text-[10px] text-gray-400 font-medium">{t.PuestoTrabajo}</div>
                          </td>
                          <td className="px-4 py-4 text-sm font-bold text-purple-700 border-r border-dashed border-gray-200">
                            {t.Tiempo_Min ? Number(t.Tiempo_Min).toFixed(4) : '0.0000'}
                          </td>
                          <td className="px-4 py-4 text-sm font-mono font-semibold text-gray-600 border-r border-dashed border-gray-200">{t.StockActual || 0}</td>
                          <td className="px-4 py-4 text-sm font-mono font-semibold text-gray-400 border-r border-dashed border-gray-200">{t.StockSeguridad || 0}</td>
                          <td className="px-4 py-4 text-[10px] font-medium text-gray-400">{t.NombRespControlProd || t.RespCtrlProd}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
