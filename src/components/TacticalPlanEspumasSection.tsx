'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wind, Users, Lock, Package, Loader2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [tiemposCurrentPage, setTiemposCurrentPage] = useState(1);
  const [tiemposItemsPerPage, setTiemposItemsPerPage] = useState(10);

  // Refs para sincronización de scroll (Órdenes)
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  // Refs para sincronización de scroll (Tiempos)
  const topScrollTiemposRef = useRef<HTMLDivElement>(null);
  const tableContainerTiemposRef = useRef<HTMLDivElement>(null);
  const tableTiemposRef = useRef<HTMLTableElement>(null);
  const [tableTiemposWidth, setTableTiemposWidth] = useState(0);

  const fetchGruposEspumas = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo.toLowerCase().includes('espuma')
      );
      setGrupos(filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
      return [];
    }
  };

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

  const fetchTiemposEnsamblado = async (filteredGroups: Grupo[]) => {
    try {
      const allTiempos = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo);
        if (res.data) {
          const data = Array.isArray(res.data) ? res.data : [res.data];
          allTiempos.push(...data);
        }
      }
      setTiemposEnsamblado(allTiempos);
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

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGruposEspumas();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await Promise.all([
        fetchRestricciones(groupsIds),
        fetchOrdenes(),
        fetchTiemposEnsamblado(filteredGroups)
      ]);
      setIsLoading(false);
    };
    initData();
  }, []);

  const ordenesFiltradas = useMemo(() => {
    if (ordenes.length === 0) return [];
    
    const respCtrlProdValues = restricciones
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almacenValues = restricciones
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .map(r => r.valor_restriccion.trim())
      .filter(v => v !== '');

    if (respCtrlProdValues.length === 0 && almacenValues.length === 0) return ordenes;

    return ordenes.filter(o => {
      const respVal = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || '').trim();
      const almVal = String(o.Almacen || o.ALMACEN || '').trim();
      const matchResp = respCtrlProdValues.length === 0 || respCtrlProdValues.includes(respVal);
      const matchAlmacen = almacenValues.length === 0 || almacenValues.includes(almVal);
      return matchResp && matchAlmacen;
    });
  }, [ordenes, restricciones]);

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
    if (activeTab === 'tiempos' && tableTiemposRef.current) {
      setTableTiemposWidth(tableTiemposRef.current.offsetWidth);
      return setupScrollSync(topScrollTiemposRef.current, tableContainerTiemposRef.current);
    }
  }, [activeTab, tiemposEnsamblado]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-gray-500 font-medium">Analizando configuración de Corte Espuma...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Wind className="w-8 h-8 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Programación Táctica Corte Espuma</h2>
            <p className="text-sm text-gray-500">Gestión de procesos para el grupo operativo de espumas</p>
          </div>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex w-full bg-gray-100/50 p-1 rounded-lg mb-8 border border-gray-200">
          <TabsTrigger value="grupos" className="flex-1 flex items-center justify-center gap-2 py-2.5"><Users className="w-4 h-4" /> Grupos</TabsTrigger>
          <TabsTrigger value="restricciones" className="flex-1 flex items-center justify-center gap-2 py-2.5"><Lock className="w-4 h-4" /> Restricciones</TabsTrigger>
          <TabsTrigger value="ordenes" className="flex-1 flex items-center justify-center gap-2 py-2.5"><Package className="w-4 h-4" /> Órdenes Provisionales</TabsTrigger>
          <TabsTrigger value="tiempos" className="flex-1 flex items-center justify-center gap-2 py-2.5"><Clock className="w-4 h-4" /> Tiempos de Ensamblado</TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Grupos Asignados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {grupos.map(g => (
                  <div key={g.codigo_grupo} className="p-4 border rounded-lg bg-gray-50">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-bold text-blue-900">{g.nombre_grupo}</span>
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
              <CardTitle>Restricciones de Operación</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase border-r border-dashed border-gray-300">Parámetro</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase border-r border-dashed border-gray-300">Valor</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Descripción</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200 text-center">
                    {restricciones.map(r => (
                      <tr key={r.codigo_restriccion} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 border-r border-dashed border-gray-300">{r.nombre_restriccion}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm border-r border-dashed border-gray-300">
                          <Badge variant="outline" className="font-mono border-blue-200 text-blue-700">{r.valor_restriccion}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{r.descripcion || '—'}</td>
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
                <CardTitle>Órdenes Provisionales Filtradas</CardTitle>
                <Badge variant="outline" className="bg-blue-50 text-blue-700">{ordenesFiltradas.length} Registros</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                <div ref={topScrollRef} className="overflow-x-auto h-5 bg-gray-50 border-t border-x rounded-t-lg" style={{ marginBottom: '-1px' }}>
                  <div style={{ width: tableWidth, height: '1px' }} />
                </div>
                <div ref={tableContainerRef} className="overflow-x-auto border rounded-b-lg max-h-[600px]">
                  <table ref={tableRef} className="min-w-full divide-y divide-gray-200 text-center">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase border-r border-dashed border-gray-300">Orden</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase border-r border-dashed border-gray-300">Material</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase border-r border-dashed border-gray-300">Cantidad</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {ordenesFiltradas.map((o, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-dashed border-gray-300">{o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 border-r border-dashed border-gray-300">
                            <div className="font-mono text-xs text-blue-600">{o.MATERIAL}</div>
                            <div className="truncate max-w-[250px] mx-auto">{o.NOMBRE}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-blue-700 border-r border-dashed border-gray-300">{o.CANTIDAD}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700">{o.Almacen}</td>
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
                <CardTitle>Tiempos Estándar de Ensamblado</CardTitle>
                <Badge variant="outline" className="bg-purple-50 text-purple-700">{tiemposEnsamblado.length} Registros</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-0">
                <div ref={topScrollTiemposRef} className="overflow-x-auto h-5 bg-gray-50 border-t border-x rounded-t-lg" style={{ marginBottom: '-1px' }}>
                  <div style={{ width: tableTiemposWidth, height: '1px' }} />
                </div>
                <div ref={tableContainerTiemposRef} className="overflow-x-auto border rounded-b-lg max-h-[600px]">
                  <table ref={tableTiemposRef} className="min-w-full divide-y divide-gray-200 text-center">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase border-r border-dashed border-gray-300">CodMaterial</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase border-r border-dashed border-gray-300">Línea</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase border-r border-dashed border-gray-300">Puesto</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase border-r border-dashed border-gray-300">Tiempo (min)</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase border-r border-dashed border-gray-300">Stock Actual</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase border-r border-dashed border-gray-300">Seguridad</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-700 uppercase">Resp. Prod.</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {tiemposEnsamblado.map((t, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/20 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-bold border-r border-dashed border-gray-300">{t.CodMaterial}</td>
                          <td className="px-4 py-3 text-xs border-r border-dashed border-gray-300">{t.Linea}</td>
                          <td className="px-4 py-3 text-xs border-r border-dashed border-gray-300">{t.PuestoTrabajo}</td>
                          <td className="px-4 py-3 font-mono text-sm text-purple-700 font-bold border-r border-dashed border-gray-300">{t.Tiempo_Min?.toFixed(4)}</td>
                          <td className="px-4 py-3 text-sm border-r border-dashed border-gray-300">{t.StockActual}</td>
                          <td className="px-4 py-3 text-sm border-r border-dashed border-gray-300">{t.StockSeguridad}</td>
                          <td className="px-4 py-3 text-xs font-medium text-gray-600">{t.RespCtrlProd}</td>
                        </tr>
                      ))}
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
