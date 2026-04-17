'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ShoppingCart, Users, Lock, Package, Loader2, AlertCircle, FileText } from 'lucide-react';
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
 * Pestañas: Grupos, Restricciones, Órdenes Provisionales y Órdenes Fert.
 */
export const TacticalPlanVentaExternaSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanVentaExterna');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Refs para sincronización de scroll - Órdenes Provisionales
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  // Refs para sincronización de scroll - Órdenes Fert
  const topScrollFertRef = useRef<HTMLDivElement>(null);
  const tableContainerFertRef = useRef<HTMLDivElement>(null);
  const tableFertRef = useRef<HTMLTableElement>(null);
  const [tableFertWidth, setTableFertWidth] = useState(0);

  // 1. Cargar Grupos de Venta Externa
  const fetchGruposVentaExterna = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo.toLowerCase().includes('venta externa')
      );
      setGrupos(filtered);
      inspector.captureVariable('gruposVentaExternaFiltrados', filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
      addNotification('error', 'Error al cargar grupos de venta externa');
      return [];
    }
  };

  // 2. Cargar Restricciones de esos grupos
  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      const res = await restriccionService.getAll();
      const filtered = (res.data || []).filter(r => 
        gruposIds.includes(r.codigo_grupo)
      );
      setRestricciones(filtered);
      inspector.captureVariable('restriccionesVentaExterna', filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando restricciones:', error);
      addNotification('error', 'Error al cargar restricciones');
      return [];
    }
  };

  // 3. Cargar Órdenes Provisionales
  const fetchOrdenes = async () => {
    try {
      const res = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      setOrders(res.data || []);
      inspector.captureVariable('totalOrdenesRaw', res.data?.length || 0);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    }
  };

  // 4. Cargar Órdenes Fert
  const fetchOrdenesFert = async () => {
    try {
      const res = await serviciosService.getOrdenesFert(1, 20000);
      setOrdersFert(res.data || []);
      inspector.captureVariable('totalOrdenesFertRaw', res.data?.length || 0);
    } catch (error) {
      console.error('Error cargando órdenes Fert:', error);
    }
  };

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGruposVentaExterna();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await fetchRestricciones(groupsIds);
      await Promise.all([fetchOrdenes(), fetchOrdenesFert()]);
      setIsLoading(false);
    };
    initData();
  }, []);

  // Lógica de filtrado robusta basada en restricciones
  const filtrarData = (data: any[], typeLabel: string) => {
    if (data.length === 0) return [];

    // Extraer valores de las restricciones configuradas
    const respCtrlProdValues = restricciones
      .filter(r => r.nombre_restriccion === 'RespCtrlProd')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almacenValues = restricciones
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .map(r => r.valor_restriccion.trim())
      .filter(v => v !== '');

    console.log(`[Venta Externa - Diagnóstico ${typeLabel}]`, {
      restriccionesResp: respCtrlProdValues,
      restriccionesAlmacen: almacenValues,
      totalRegistrosEntrada: data.length
    });

    return data.filter((o, index) => {
      // Manejar múltiples posibles nombres de campos que la API podría devolver
      const respVal = String(o.RESPCONTROLPROD || o.RespCtrlProd || o.Resp_Ctrl_Prod || o.RESP_CTRL_PROD || '').trim();
      const almVal = String(o.Almacen || o.ALMACEN || o.Centro_Almacen || '').trim();

      // Un registro pasa si no hay restricciones definidas para ese campo O si el valor está en la lista permitida
      const matchResp = respCtrlProdValues.length === 0 || respCtrlProdValues.includes(respVal);
      const matchAlmacen = almacenValues.length === 0 || almacenValues.includes(almVal);

      const isIncluded = matchResp && matchAlmacen;

      // Loguear solo los primeros registros para diagnóstico si no se incluye nada
      if (index < 5 && !isIncluded) {
        console.log(`Fila descartada: Resp=${respVal}, Alm=${almVal}`);
      }

      return isIncluded;
    });
  };

  const ordenesFiltradas = useMemo(() => filtrarData(ordenes, 'Provisionales'), [ordenes, restricciones]);
  const ordenesFertFiltradas = useMemo(() => filtrarData(ordenesFert, 'Fert'), [ordenesFert, restricciones]);

  // Sincronización de scroll para Órdenes Provisionales
  useEffect(() => {
    if (activeTab === 'ordenes' && tableRef.current) {
      const updateWidth = () => { if (tableRef.current) setTableWidth(tableRef.current.offsetWidth); };
      updateWidth();
      window.addEventListener('resize', updateWidth);
      const topScroll = topScrollRef.current;
      const bottomScroll = tableContainerRef.current;
      const syncBottom = () => { if (topScroll && bottomScroll) bottomScroll.scrollLeft = topScroll.scrollLeft; };
      const syncTop = () => { if (topScroll && bottomScroll) topScroll.scrollLeft = bottomScroll.scrollLeft; };
      topScroll?.addEventListener('scroll', syncBottom);
      bottomScroll?.addEventListener('scroll', syncTop);
      return () => {
        window.removeEventListener('resize', updateWidth);
        topScroll?.removeEventListener('scroll', syncBottom);
        bottomScroll?.removeEventListener('scroll', syncTop);
      };
    }
  }, [activeTab, ordenesFiltradas]);

  // Sincronización de scroll para Órdenes Fert
  useEffect(() => {
    if (activeTab === 'ordenesFert' && tableFertRef.current) {
      const updateWidth = () => { if (tableFertRef.current) setTableFertWidth(tableFertRef.current.offsetWidth); };
      updateWidth();
      window.addEventListener('resize', updateWidth);
      const topScroll = topScrollFertRef.current;
      const bottomScroll = tableContainerFertRef.current;
      const syncBottom = () => { if (topScroll && bottomScroll) bottomScroll.scrollLeft = topScroll.scrollLeft; };
      const syncTop = () => { if (topScroll && bottomScroll) topScroll.scrollLeft = bottomScroll.scrollLeft; };
      topScroll?.addEventListener('scroll', syncBottom);
      bottomScroll?.addEventListener('scroll', syncTop);
      return () => {
        window.removeEventListener('resize', updateWidth);
        topScroll?.removeEventListener('scroll', syncBottom);
        bottomScroll?.removeEventListener('scroll', syncTop);
      };
    }
  }, [activeTab, ordenesFertFiltradas]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
        <p className="text-gray-500 font-medium">Analizando configuración de Venta Externa...</p>
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
            <p className="text-sm text-gray-500">Gestión de órdenes para canales externos basada en el grupo "Venta Externa"</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            {grupos.length} Grupos
          </Badge>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            {restricciones.length} Restricciones
          </Badge>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="grupos" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Grupos
          </TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> Restricciones
          </TabsTrigger>
          <TabsTrigger value="ordenes" className="flex items-center gap-2">
            <Package className="w-4 h-4" /> Órdenes Provisionales
          </TabsTrigger>
          <TabsTrigger value="ordenesFert" className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Órdenes Fert
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Grupos: Venta Externa</CardTitle>
              <CardDescription>Grupos operativos identificados de "Venta Externa" en las plantas.</CardDescription>
            </CardHeader>
            <CardContent>
              {grupos.length === 0 ? (
                <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-lg">
                  No se encontró el grupo "Venta Externa" en la base de datos.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grupos.map(g => (
                    <div key={g.codigo_grupo} className="p-4 border rounded-lg bg-gray-50 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-green-900">{g.nombre_grupo}</span>
                        <Badge variant="secondary">{g.centro}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">ID: {g.codigo_grupo}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <CardHeader>
              <CardTitle>Reglas de Filtrado para Venta Externa</CardTitle>
              <CardDescription>Restricciones asociadas específicamente al área operativa de venta externa.</CardDescription>
            </CardHeader>
            <CardContent>
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
                          <Badge variant="outline" className="font-mono border-green-200 text-green-700">{r.valor_restriccion}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 text-center">{r.descripcion || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Órdenes Provisionales: Venta Externa</CardTitle>
                <Badge variant="outline" className="bg-green-50 text-green-700">{ordenesFiltradas.length} Órdenes</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {ordenesFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed">
                  <AlertCircle className="w-12 h-12 mb-4 text-gray-300" />
                  <p className="font-medium">No se detectaron órdenes bajo los parámetros de Venta Externa.</p>
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
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Inicio</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Almacén</th>
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
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 text-center border-r border-dashed border-gray-300">{o.FECHAINICIO}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 text-center">{o.Almacen}</td>
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
                <CardTitle>Órdenes Fert: Venta Externa</CardTitle>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">{ordenesFertFiltradas.length} Registros</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {ordenesFertFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed">
                  <FileText className="w-12 h-12 mb-4 text-gray-300" />
                  <p className="font-medium">No se detectaron órdenes Fert bajo los parámetros actuales.</p>
                  <p className="text-xs text-gray-400 mt-2">Verifique las restricciones de RespCtrlProd y ALMACEN en la pestaña anterior.</p>
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
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Inicio</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Fin</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Almacén</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {ordenesFertFiltradas.map((o, idx) => (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center border-r border-dashed border-gray-300">{o.ORDENPREVISIONAL || o.Orden || o.OrdenPrevisional || '-'}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-center border-r border-dashed border-gray-300">
                              <div className="font-mono text-xs text-blue-600">{o.MATERIAL || o.CodMaterial || o.Material}</div>
                              <div className="truncate max-w-[250px] mx-auto">{o.NOMBRE || o.Descripcion || o.DescMaterial}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-blue-700 border-r border-dashed border-gray-300">{o.CANTIDAD || o.Cantidad}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 text-center border-r border-dashed border-gray-300">{o.FECHAINICIO || o.FechaInicio}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 text-center border-r border-dashed border-gray-300">{o.FECHAFIN || o.FechaFin}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 text-center">{o.Almacen || o.ALMACEN || o.Centro_Almacen}</td>
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
      </Tabs>
    </div>
  );
};