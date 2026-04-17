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

  // 2. Cargar Restricciones
  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
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

  // 3. Cargar Tiempos de Ensamblado
  const fetchTiemposEnsamblado = async (filteredGroups: Grupo[]) => {
    try {
      const allTiempos = [];
      for (const g of filteredGroups) {
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo);
        if (res.data) {
          const data = Array.isArray(res.data) ? res.data : [res.data];
          allTiempos.push(...data);
        }
      }
      setTiemposEnsamblado(allTiempos);
      inspector.captureVariable('tiemposEnsambladoVentaExterna', allTiempos);
    } catch (error) {
      console.error('Error cargando tiempos de ensamblado:', error);
    }
  };

  const fetchOrdenes = async () => {
    try {
      const res = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      setOrders(res.data || []);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    }
  };

  const fetchOrdenesFert = async () => {
    try {
      const res = await serviciosService.getOrdenesFert(1, 20000);
      setOrdersFert(res.data || []);
    } catch (error) {
      console.error('Error cargando órdenes Fert:', error);
    }
  };

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGruposVentaExterna();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await Promise.all([
        fetchRestricciones(groupsIds),
        fetchOrdenes(),
        fetchOrdenesFert(),
        fetchTiemposEnsamblado(filteredGroups)
      ]);
      setIsLoading(false);
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

    return data.filter(o => {
      const respVal = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || '').trim();
      const almVal = String(o.Almacen || o.ALMACEN || '').trim();
      const matchResp = respCtrlProdValues.length === 0 || respCtrlProdValues.includes(respVal);
      const matchAlmacen = almacenValues.length === 0 || almacenValues.includes(almVal);
      return matchResp && matchAlmacen;
    });
  };

  const ordenesFiltradas = useMemo(() => filtrarData(ordenes), [ordenes, restricciones]);
  const ordenesFertFiltradas = useMemo(() => filtrarData(ordenesFert), [ordenesFert, restricciones]);

  // Sincronización de scroll genérica
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
  }, [activeTab, ordenesFiltradas]);

  useEffect(() => {
    if (activeTab === 'ordenesFert' && tableFertRef.current) {
      setTableFertWidth(tableFertRef.current.offsetWidth);
      return setupScrollSync(topScrollFertRef.current, tableContainerFertRef.current);
    }
  }, [activeTab, ordenesFertFiltradas]);

  useEffect(() => {
    if (activeTab === 'tiempos' && tableTiemposRef.current) {
      setTableTiemposWidth(tableTiemposRef.current.offsetWidth);
      return setupScrollSync(topScrollTiemposRef.current, tableContainerTiemposRef.current);
    }
  }, [activeTab, tiemposEnsamblado]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-green-600" />
        <p className="text-gray-500 font-medium">Cargando entorno de Venta Externa...</p>
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
              <CardTitle>Restricciones Configuradas</CardTitle>
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
                <CardTitle>Órdenes Provisionales</CardTitle>
                <Badge variant="outline" className="bg-green-50 text-green-700">{ordenesFiltradas.length} Registros</Badge>
              </div>
            </CardHeader>
            <CardContent>
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
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 text-center">{o.Almacen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenesFert">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Órdenes Fert</CardTitle>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">{ordenesFertFiltradas.length} Registros</Badge>
              </div>
            </CardHeader>
            <CardContent>
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
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Almacén</th>
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
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 text-center">{o.Almacen || o.ALMACEN}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>Tiempos de Ensamblado</CardTitle>
                <Badge variant="outline" className="bg-purple-50 text-purple-700">{tiemposEnsamblado.length} Registros</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                <div ref={topScrollTiemposRef} className="overflow-x-auto h-5 bg-gray-50 border-t border-x rounded-t-lg" style={{ marginBottom: '-1px' }}>
                  <div style={{ width: tableTiemposWidth, height: '1px' }} />
                </div>
                <div ref={tableContainerTiemposRef} className="overflow-x-auto border rounded-b-lg max-h-[600px]">
                  <table ref={tableTiemposRef} className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Material</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Descripción</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Línea</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Puesto</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tiempo (min)</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tiemposEnsamblado.map((t, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/20 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center border-r border-dashed border-gray-300">{t.CodMaterial}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-center border-r border-dashed border-gray-300 truncate max-w-[300px]">{t.Material || t.Descripcion}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center border-r border-dashed border-gray-300">{t.Linea}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 text-center border-r border-dashed border-gray-300">{t.PuestoTrabajo}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-blue-600">{t.Tiempo}</td>
                        </tr>
                      ))}
                      {tiemposEnsamblado.length === 0 && (
                        <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No hay datos de tiempos para estos grupos.</td></tr>
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
