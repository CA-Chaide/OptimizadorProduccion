'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, AlertCircle, FileText, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';

/**
 * TacticalPlanVentaExternaSection
 * 
 * Reestructurado para mostrar el grupo específico "Venta Externa"
 * Pestañas: Grupos, Restricciones, Órdenes Provisionales, Órdenes Fert y Tiempos de Ensamblado.
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
  const [tiemposCurrentPage, setTiemposCurrentPage] = useState(1);
  const [tiemposItemsPerPage, setTiemposItemsPerPage] = useState(10);
  const [materialSearch, setMaterialSearch] = useState('');
  const [selectedResponsible, setSelectedResponsible] = useState('');

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

  // Normalizar acceso a propiedades de órdenes
  const extractOrderValue = (order: any, keys: string[]) => {
    for (const key of keys) {
      if (order[key] !== undefined && order[key] !== null) {
        return String(order[key]).trim();
      }
    }
    return '';
  };

  // Filtrar tiempos por búsqueda y responsable
  const filteredTiempos = useMemo(() => {
    return tiemposEnsamblado.filter(t => {
      const matchMaterial = !materialSearch || 
        t.CodMaterial.toLowerCase().includes(materialSearch.toLowerCase()) ||
        (t.Linea && t.Linea.toLowerCase().includes(materialSearch.toLowerCase())) ||
        (t.Centro && t.Centro.toLowerCase().includes(materialSearch.toLowerCase()));
      
      const matchResponsible = !selectedResponsible || 
        (t.NombRespControlProd && t.NombRespControlProd.toLowerCase().includes(selectedResponsible.toLowerCase())) ||
        (t.RespCtrlProd && t.RespCtrlProd.toLowerCase().includes(selectedResponsible.toLowerCase()));
      
      return matchMaterial && matchResponsible;
    });
  }, [tiemposEnsamblado, materialSearch, selectedResponsible]);

  // Obtener lista única de responsables
  const responsibleOptions = useMemo(() => {
    const unique = new Set(
      tiemposEnsamblado
        .map(t => t.NombRespControlProd || t.RespCtrlProd)
        .filter(Boolean)
    );
    return Array.from(unique).sort();
  }, [tiemposEnsamblado]);

  // 1. Cargar Grupos de Venta Externa
  const fetchGruposVentaExterna = async () => {
    try {
      setLoadingPhase('Cargando grupos...');
      const res = await grupoService.getAll();
      console.log('Respuesta Grupos:', res);
      
      if (!res.data || !Array.isArray(res.data)) {
        console.warn('Respuesta de grupos no tiene estructura esperada:', res);
        return [];
      }

      const filtered = res.data.filter(g => 
        g.nombre_grupo && g.nombre_grupo.toLowerCase().includes('venta externa')
      );
      
      console.log('Grupos filtrados:', filtered);
      setGrupos(filtered);
      inspector.captureVariable('gruposVentaExternaFiltrados', filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
      addNotification('error', `Error al cargar grupos de venta externa: ${error}`);
      return [];
    }
  };

  // 2. Cargar Restricciones
  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      setLoadingPhase('Cargando restricciones...');
      const res = await restriccionService.getAll();
      console.log('Respuesta Restricciones:', res, 'Buscando grupos:', gruposIds);
      
      if (!res.data || !Array.isArray(res.data)) {
        console.warn('Respuesta de restricciones no tiene estructura esperada:', res);
        return [];
      }

      const filtered = res.data.filter(r => 
        gruposIds.includes(r.codigo_grupo)
      );
      
      console.log('Restricciones filtradas:', filtered);
      setRestricciones(filtered);
      inspector.captureVariable('restriccionesFiltradas', filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando restricciones:', error);
      addNotification('error', `Error al cargar restricciones: ${error}`);
      return [];
    }
  };

  // 3. Cargar Tiempos de Ensamblado
  const fetchTiemposEnsamblado = async (filteredGroups: Grupo[]) => {
    setLoadingPhase('Cargando tiempos de ensamblado...');
    const allTiempos = [];
    
    for (const g of filteredGroups) {
      if (!g.centro) {
        console.warn(`Grupo ${g.codigo_grupo} (${g.nombre_grupo}) no tiene centro definido, omitiendo tiempos.`);
        continue;
      }
      console.log(`Cargando tiempos para grupo: ${g.codigo_grupo} (${g.nombre_grupo}), Centro: ${g.centro}`);
      try {
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo);
        if (res.data) {
          const data = Array.isArray(res.data) ? res.data : [res.data];
          console.log(`Tiempos para grupo ${g.codigo_grupo}:`, data);
          allTiempos.push(...data);
        }
      } catch (error) {
        console.warn(`No se encontraron tiempos de ensamblado para grupo ${g.codigo_grupo} (${g.nombre_grupo}):`, error);
      }
    }
    
    console.log('Total tiempos ensamblado:', allTiempos);
    setTiemposEnsamblado(allTiempos);
    inspector.captureVariable('tiemposEnsambladoVentaExterna', allTiempos);
  };

  const fetchOrdenes = async () => {
    try {
      setLoadingPhase('Cargando órdenes provisionales...');
      const res = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      
      if (!res.data) {
        console.warn('No hay datos de órdenes:', res);
        return [];
      }

      const datos = Array.isArray(res.data) ? res.data : [res.data];
      console.log('Órdenes cargadas:', datos.length, datos);
      setOrders(datos);
      return datos;
    } catch (error) {
      console.error('Error cargando órdenes:', error);
      addNotification('error', `Error al cargar órdenes: ${error}`);
      return [];
    }
  };

  const fetchOrdenesFert = async () => {
    try {
      setLoadingPhase('Cargando órdenes Fert...');
      const res = await serviciosService.getOrdenesFert(1, 20000);
      
      if (!res.data) {
        console.warn('No hay datos de órdenes Fert:', res);
        return [];
      }

      const datos = Array.isArray(res.data) ? res.data : [res.data];
      console.log('Órdenes Fert cargadas:', datos.length, datos);
      setOrdersFert(datos);
      return datos;
    } catch (error) {
      console.error('Error cargando órdenes Fert:', error);
      addNotification('error', `Error al cargar órdenes Fert: ${error}`);
      return [];
    }
  };

  useEffect(() => {
    const initData = async () => {
      try {
        setIsLoading(true);
        
        // PASO 1: Cargar grupos
        const filteredGroups = await fetchGruposVentaExterna();
        if (filteredGroups.length === 0) {
          console.warn('No se encontraron grupos de Venta Externa');
          addNotification('warning', 'No se encontraron grupos de Venta Externa');
          setIsLoading(false);
          return;
        }

        const groupsIds = filteredGroups.map(g => g.codigo_grupo);
        console.log('IDs de grupos a filtrar:', groupsIds);

        // PASO 2: Cargar RESTRICCIONES PRIMERO (crítico para filtrado)
        const restriccionesData = await fetchRestricciones(groupsIds);
        console.log('Restricciones cargadas ANTES que órdenes:', restriccionesData);

        // PASO 3: Cargar órdenes y tiempos en paralelo
        await Promise.all([
          fetchOrdenes(),
          fetchOrdenesFert(),
          fetchTiemposEnsamblado(filteredGroups)
        ]);

        setLoadingPhase('');
        setIsLoading(false);
      } catch (error) {
        console.error('Error en flujo de carga:', error);
        addNotification('error', 'Error al cargar datos');
        setIsLoading(false);
      }
    };

    initData();
  }, []);

  const filtrarData = (data: any[]) => {
    if (data.length === 0) return [];
    
    const respCtrlProdValues = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almacenValues = restricciones
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .map(r => r.valor_restriccion.trim())
      .filter(v => v !== '');

    console.log('Restricciones RESPCTRLPROD disponibles:', respCtrlProdValues);
    console.log('Restricciones ALMACEN disponibles:', almacenValues);
    console.log('Total registros a filtrar:', data.length);

    const filtered = data.filter(o => {
      // Probar múltiples variantes de nombre de campo para RESPCTRLPROD
      const respVal = extractOrderValue(o, ['RESPCTRLPROD', 'RESPCONTROLPROD', 'RespCtrlProd', 'respCtrlProd', 'codigo_responsable']);
      
      // Probar múltiples variantes de nombre de campo para ALMACEN
      const almVal = extractOrderValue(o, ['Almacen', 'ALMACEN', 'almacen', 'ALMACENES', 'almacenes', 'codigo_almacen']);
      
      const matchResp = respCtrlProdValues.length === 0 || respCtrlProdValues.includes(respVal);
      const matchAlmacen = almacenValues.length === 0 || almacenValues.includes(almVal);
      
      if (!matchResp || !matchAlmacen) {
        console.debug(`Filtrado fuera - Resp: ${respVal} (match: ${matchResp}), Almacén: ${almVal} (match: ${matchAlmacen})`);
      }
      
      return matchResp && matchAlmacen;
    });

    console.log('Registros después de filtro:', filtered.length);
    return filtered;
  };

  const ordenesFiltradas = useMemo(() => filtrarData(ordenes), [ordenes, restricciones]);
  const ordenesFertFiltradas = useMemo(() => filtrarData(ordenesFert), [ordenesFert, restricciones]);

  // Sincronización de scroll genérica mejorada
  const setupScrollSync = (top: HTMLDivElement | null, bottom: HTMLDivElement | null) => {
    if (!top || !bottom) {
      console.warn('Refs de scroll no disponibles');
      return;
    }

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
    if (activeTab === 'ordenes') {
      // Delay pequeño para asegurar que DOM está renderizado
      const timer = setTimeout(() => {
        if (tableRef.current) {
          const width = tableRef.current.offsetWidth;
          console.log('Tabla órdenes width:', width);
          setTableWidth(width);
        }
        setupScrollSync(topScrollRef.current, tableContainerRef.current);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, ordenesFiltradas]);

  useEffect(() => {
    if (activeTab === 'ordenesFert') {
      const timer = setTimeout(() => {
        if (tableFertRef.current) {
          const width = tableFertRef.current.offsetWidth;
          console.log('Tabla Fert width:', width);
          setTableFertWidth(width);
        }
        setupScrollSync(topScrollFertRef.current, tableContainerFertRef.current);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, ordenesFertFiltradas]);

  useEffect(() => {
    if (activeTab === 'tiempos') {
      const timer = setTimeout(() => {
        if (tableTiemposRef.current) {
          const width = tableTiemposRef.current.offsetWidth;
          console.log('Tabla tiempos width:', width);
          setTableTiemposWidth(width);
        }
        setupScrollSync(topScrollTiemposRef.current, tableContainerTiemposRef.current);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [activeTab, tiemposEnsamblado]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
        <p className="text-gray-500 font-medium">Cargando entorno de Venta Externa...</p>
        {loadingPhase && <p className="text-sm text-gray-400">{loadingPhase}</p>}
      </div>
    );
  }

  if (grupos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4 p-6">
        <AlertCircle className="w-10 h-10 text-yellow-600" />
        <p className="text-gray-600 font-medium">No se encontraron grupos de Venta Externa</p>
        <p className="text-sm text-gray-500">Revisa que exista al menos un grupo con "Venta Externa" en su nombre</p>
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
            <p className="text-sm text-gray-500">Gestión integral de órdenes y tiempos para Venta Externa</p>
          </div>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-8">
          <TabsTrigger value="grupos" className="flex items-center gap-2"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-2"><Lock className="w-4 h-4" /> Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes" className="flex items-center gap-2"><Package className="w-4 h-4" /> Órdenes Provisionales</TabsTrigger>
          <TabsTrigger value="ordenesFert" className="flex items-center gap-2"><FileText className="w-4 h-4" /> Órdenes Fert</TabsTrigger>
          <TabsTrigger value="tiempos" className="flex items-center gap-2"><Clock className="w-4 h-4" /> Tiempos de Ensamblado</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Grupos de Venta Externa</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grupos.map(g => (
                  <div key={g.codigo_grupo} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-green-900">{g.nombre_grupo}</span>
                      <Badge variant="secondary">{g.centro}</Badge>
                    </div>
                    <p className="text-xs text-gray-500">ID: {g.codigo_grupo}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Restricciones Configuradas</CardTitle>
                <Badge variant="outline" className="bg-purple-50 text-purple-700">{restricciones.length} Restricciones</Badge>
              </div>
              {restricciones.length === 0 && (
                <p className="text-sm text-yellow-600 mt-2">⚠️ Sin restricciones: Las órdenes no serán filtradas</p>
              )}
            </CardHeader>
            <CardContent>
              {restricciones.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                  <p>No hay restricciones configuradas para estos grupos</p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Parámetro</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Valor</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Descripción</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {restricciones.map(r => (
                        <tr key={r.codigo_restriccion} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-center border-r border-dashed border-gray-300">{r.nombre_restriccion}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-center border-r border-dashed border-gray-300">
                            <Badge variant="outline" className="font-mono border-purple-200 text-purple-700">{r.valor_restriccion}</Badge>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 text-center">{r.descripcion || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Órdenes Provisionales</CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700">{ordenesFiltradas.length} Filtradas</Badge>
                  <Badge variant="secondary" className="text-xs">{ordenes.length} Total</Badge>
                </div>
              </div>
              {restricciones.length > 0 && ordenesFiltradas.length === 0 && ordenes.length > 0 && (
                <p className="text-sm text-yellow-600 mt-2">⚠️ No hay órdenes que cumplan las restricciones configuradas</p>
              )}
            </CardHeader>
            <CardContent>
              {ordenesFiltradas.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                  <p>{ordenes.length === 0 ? 'No hay órdenes' : 'No hay órdenes que cumplan las restricciones'}</p>
                </div>
              ) : (
                <div className="space-y-0">
                  <div ref={topScrollRef} className="overflow-x-auto h-5 bg-gray-50 border-t border-x rounded-t-lg" style={{ marginBottom: '-1px' }}>
                    <div style={{ width: tableWidth, height: '1px' }} />
                  </div>
                  <div ref={tableContainerRef} className="overflow-x-auto border rounded-b-lg max-h-[600px]">
                    <table ref={tableRef} className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Orden</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Material</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Cantidad</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Almacén</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Responsable</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {ordenesFiltradas.map((o, idx) => (
                          <tr key={idx} className="hover:bg-green-50/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center border-r border-dashed border-gray-300">{o.ORDENPREVISIONAL}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-center border-r border-dashed border-gray-300">
                              <div className="font-mono text-xs text-green-600">{o.MATERIAL}</div>
                              <div className="truncate max-w-[250px] mx-auto">{o.NOMBRE}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-green-700 border-r border-dashed border-gray-300">{o.CANTIDAD}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 text-center border-r border-dashed border-gray-300">{extractOrderValue(o, ['Almacen', 'ALMACEN', 'almacen', 'ALMACENES', 'almacenes', 'codigo_almacen'])}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{extractOrderValue(o, ['RESPCTRLPROD', 'RESPCONTROLPROD', 'RespCtrlProd', 'respCtrlProd', 'codigo_responsable'])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenesFert">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Órdenes Fert</CardTitle>
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700">{ordenesFertFiltradas.length} Filtradas</Badge>
                  <Badge variant="secondary" className="text-xs">{ordenesFert.length} Total</Badge>
                </div>
              </div>
              {restricciones.length > 0 && ordenesFertFiltradas.length === 0 && ordenesFert.length > 0 && (
                <p className="text-sm text-yellow-600 mt-2">⚠️ No hay órdenes que cumplan las restricciones configuradas</p>
              )}
            </CardHeader>
            <CardContent>
              {ordenesFertFiltradas.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                  <p>{ordenesFert.length === 0 ? 'No hay órdenes Fert' : 'No hay órdenes que cumplan las restricciones'}</p>
                </div>
              ) : (
                <div className="space-y-0">
                  <div ref={topScrollFertRef} className="overflow-x-auto h-5 bg-gray-50 border-t border-x rounded-t-lg" style={{ marginBottom: '-1px' }}>
                    <div style={{ width: tableFertWidth, height: '1px' }} />
                  </div>
                  <div ref={tableContainerFertRef} className="overflow-x-auto border rounded-b-lg max-h-[600px]">
                    <table ref={tableFertRef} className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Orden Fert</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Material</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Cantidad</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Almacén</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Responsable</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {ordenesFertFiltradas.map((o, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center border-r border-dashed border-gray-300">{o.ORDENPREVISIONAL || o.Orden || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-center border-r border-dashed border-gray-300">
                              <div className="font-mono text-xs text-blue-600">{o.MATERIAL || o.CodMaterial}</div>
                              <div className="truncate max-w-[250px] mx-auto">{o.NOMBRE || o.Descripcion}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-blue-700 border-r border-dashed border-gray-300">{o.CANTIDAD || o.Cantidad}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 text-center border-r border-dashed border-gray-300">{extractOrderValue(o, ['Almacen', 'ALMACEN', 'almacen', 'ALMACENES', 'almacenes', 'codigo_almacen'])}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center">{extractOrderValue(o, ['RESPCTRLPROD', 'RESPCONTROLPROD', 'RespCtrlProd', 'respCtrlProd', 'codigo_responsable'])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Tiempos de Ensamblado</CardTitle>
                <Badge variant="outline" className="bg-purple-50 text-purple-700">{filteredTiempos.length} Registros</Badge>
              </div>
              {tiemposEnsamblado.length === 0 && (
                <p className="text-sm text-yellow-600 mt-2">⚠️ No hay tiempos configurados para estos grupos</p>
              )}
            </CardHeader>
            <CardContent>
              {tiemposEnsamblado.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500" />
                  <p>No hay datos de tiempos para estos grupos</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Filtros */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Buscar por Material, Línea o Centro</label>
                      <input
                        type="text"
                        placeholder="Código material, línea o centro..."
                        value={materialSearch}
                        onChange={(e) => {
                          setMaterialSearch(e.target.value);
                          setTiemposCurrentPage(1);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Filtrar por Responsable</label>
                      <select
                        value={selectedResponsible}
                        onChange={(e) => {
                          setSelectedResponsible(e.target.value);
                          setTiemposCurrentPage(1);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Todos los responsables</option>
                        {responsibleOptions.map(resp => (
                          <option key={resp} value={resp}>{resp}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Tabla */}
                  <div className="space-y-0">
                    <div ref={topScrollTiemposRef} className="overflow-x-auto h-5 bg-gray-50 border-t border-x rounded-t-lg" style={{ marginBottom: '-1px' }}>
                      <div style={{ width: tableTiemposWidth, height: '1px' }} />
                    </div>
                    <div ref={tableContainerTiemposRef} className="overflow-x-auto border rounded-b-lg max-h-[600px]">
                      <table ref={tableTiemposRef} className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Centro</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Material</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Línea</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Puesto</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Stock</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Responsable</th>
                            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tiempo (min)</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredTiempos.slice((tiemposCurrentPage - 1) * tiemposItemsPerPage, tiemposCurrentPage * tiemposItemsPerPage).map((t, idx) => (
                            <tr key={idx} className="hover:bg-purple-50/20 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center border-r border-dashed border-gray-300">{t.Centro}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center border-r border-dashed border-gray-300">{t.CodMaterial}</td>
                              <td className="px-4 py-3 text-sm text-gray-600 text-center border-r border-dashed border-gray-300 truncate max-w-[200px]">{t.Linea}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center border-r border-dashed border-gray-300">{t.PuestoTrabajo}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center border-r border-dashed border-gray-300 font-mono text-sm">{t.StockActual}</td>
                              <td className="px-4 py-3 text-sm text-gray-600 text-center border-r border-dashed border-gray-300 truncate max-w-[200px]">{t.NombRespControlProd || t.RespCtrlProd}</td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-purple-600">{t.Tiempo_Min ? t.Tiempo_Min.toFixed(4) : 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-700">Registros por página:</label>
                      <select 
                        value={tiemposItemsPerPage} 
                        onChange={(e) => {
                          setTiemposItemsPerPage(Number(e.target.value));
                          setTiemposCurrentPage(1);
                        }}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm"
                      >
                        <option value={5}>5</option>
                        <option value={10}>10</option>
                        <option value={25}>25</option>
                        <option value={50}>50</option>
                      </select>
                    </div>
                    <div className="text-sm text-gray-600">
                      Página {tiemposCurrentPage} de {Math.ceil(filteredTiempos.length / tiemposItemsPerPage) || 1}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTiemposCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={tiemposCurrentPage === 1}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Anterior
                      </button>
                      <button
                        onClick={() => setTiemposCurrentPage(prev => Math.min(Math.ceil(filteredTiempos.length / tiemposItemsPerPage), prev + 1))}
                        disabled={tiemposCurrentPage >= Math.ceil(filteredTiempos.length / tiemposItemsPerPage)}
                        className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
