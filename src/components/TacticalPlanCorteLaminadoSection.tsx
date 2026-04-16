'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Scissors, Users, Lock, Package, Loader2, AlertCircle } from 'lucide-react';
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
 * TacticalPlanCorteLaminadoSection
 * 
 * Reestructurado para replicar el comportamiento de Espumas:
 * 1. Grupos: Filtrados por "Laminado" o "Corte"
 * 2. Restricciones: Pertenecientes a esos grupos
 * 3. Órdenes Provisionales: Filtradas por RespCtrlProd y ALMACEN de las restricciones
 * 
 * Incluye:
 * - Columnas separadas por líneas entrecortadas
 * - Contenido centrado
 * - Doble scroll sincronizado (superior e inferior)
 */
export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanLaminado');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Refs para sincronización de scroll
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  // 1. Cargar Grupos de Corte y Laminado (Quito y Guayaquil)
  const fetchGruposLaminado = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo.toLowerCase().includes('laminado') || 
        g.nombre_grupo.toLowerCase().includes('corte')
      );
      setGrupos(filtered);
      inspector.captureVariable('gruposLaminado', filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
      addNotification('error', 'Error al cargar grupos de laminado');
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
      inspector.captureVariable('restriccionesLaminado', filtered);
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

  useEffect(() => {
    const initData = async () => {
      setIsLoading(true);
      const filteredGroups = await fetchGruposLaminado();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await fetchRestricciones(groupsIds);
      await fetchOrdenes();
      setIsLoading(false);
    };
    initData();
  }, []);

  // Lógica de filtrado para Órdenes Provisionales basada en restricciones
  const ordenesFiltradas = useMemo(() => {
    if (ordenes.length === 0) return [];

    // Extraer valores de las restricciones
    const respCtrlProdValues = restricciones
      .filter(r => r.nombre_restriccion === 'RespCtrlProd')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()));
    
    const almacenValues = restricciones
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .map(r => r.valor_restriccion.trim());

    return ordenes.filter(o => {
      const matchResp = respCtrlProdValues.length === 0 || respCtrlProdValues.includes(o.RESPCONTROLPROD);
      const matchAlmacen = almacenValues.length === 0 || almacenValues.includes(o.Almacen);
      return matchResp && matchAlmacen;
    });
  }, [ordenes, restricciones]);

  // Efecto para medir el ancho de la tabla y sincronizar scroll
  useEffect(() => {
    if (activeTab === 'ordenes' && tableRef.current) {
      const updateWidth = () => {
        if (tableRef.current) {
          setTableWidth(tableRef.current.offsetWidth);
        }
      };
      
      updateWidth();
      window.addEventListener('resize', updateWidth);
      
      const topScroll = topScrollRef.current;
      const bottomScroll = tableContainerRef.current;

      const syncBottom = () => {
        if (topScroll && bottomScroll) {
          bottomScroll.scrollLeft = topScroll.scrollLeft;
        }
      };

      const syncTop = () => {
        if (topScroll && bottomScroll) {
          topScroll.scrollLeft = bottomScroll.scrollLeft;
        }
      };

      topScroll?.addEventListener('scroll', syncBottom);
      bottomScroll?.addEventListener('scroll', syncTop);

      return () => {
        window.removeEventListener('resize', updateWidth);
        topScroll?.removeEventListener('scroll', syncBottom);
        bottomScroll?.removeEventListener('scroll', syncTop);
      };
    }
  }, [activeTab, ordenesFiltradas]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-red-600" />
        <p className="text-gray-500 font-medium">Analizando configuración de Laminado...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Scissors className="w-8 h-8 text-red-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Programación Táctica Laminado</h2>
            <p className="text-sm text-gray-500">Gestión de procesos de laminación y corte (Quito y Guayaquil)</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            {grupos.length} Grupos
          </Badge>
          <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
            {restricciones.length} Restricciones
          </Badge>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="grupos" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Grupos
          </TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> Restricciones
          </TabsTrigger>
          <TabsTrigger value="ordenes" className="flex items-center gap-2">
            <Package className="w-4 h-4" /> Órdenes Provisionales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Áreas de Corte y Laminado</CardTitle>
              <CardDescription>Grupos operativos involucrados en procesos de laminación en todas las plantas.</CardDescription>
            </CardHeader>
            <CardContent>
              {grupos.length === 0 ? (
                <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-lg">
                  No se encontraron grupos de "Corte" o "Laminado".
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grupos.map(g => (
                    <div key={g.codigo_grupo} className="p-4 border rounded-lg bg-gray-50 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-red-900">{g.nombre_grupo}</span>
                        <Badge variant="secondary">{g.centro}</Badge>
                      </div>
                      <p className="text-xs text-gray-500">ID: {g.codigo_grupo}</p>
                      <div className="mt-3 flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${g.estado === 'A' ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-xs font-medium">{g.estado === 'A' ? 'Activo' : 'Inactivo'}</span>
                      </div>
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
              <CardTitle>Reglas de Filtrado</CardTitle>
              <CardDescription>Restricciones que comandan el flujo de órdenes de laminado.</CardDescription>
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 text-center border-r border-dashed border-gray-300">
                          {r.nombre_restriccion}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-center border-r border-dashed border-gray-300">
                          <Badge variant="outline" className="font-mono border-red-200 text-red-700">{r.valor_restriccion}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 text-center">
                          {r.descripcion || '—'}
                        </td>
                      </tr>
                    ))}
                    {restricciones.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
                          Configure restricciones para los grupos de laminado.
                        </td>
                      </tr>
                    )}
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
                <div>
                  <CardTitle>Órdenes Previsionales para Laminado</CardTitle>
                  <CardDescription>Visualización filtrada según Responsable y Almacén.</CardDescription>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  {ordenesFiltradas.length} Órdenes
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {ordenesFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed">
                  <AlertCircle className="w-12 h-12 mb-4 text-gray-300" />
                  <p className="font-medium">No se detectaron órdenes bajo los parámetros actuales.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {/* Scroll superior sincronizado */}
                  <div 
                    ref={topScrollRef} 
                    className="overflow-x-auto h-5 bg-gray-50 border-t border-x rounded-t-lg"
                    style={{ marginBottom: '-1px' }}
                  >
                    <div style={{ width: tableWidth, height: '1px' }} />
                  </div>

                  <div 
                    ref={tableContainerRef}
                    className="overflow-x-auto border rounded-b-lg max-h-[600px]"
                  >
                    <table ref={tableRef} className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Orden</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Material</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Cantidad</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Inicio</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Responsable</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Almacén</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {ordenesFiltradas.map((o, idx) => (
                          <tr key={idx} className="hover:bg-red-50/30 transition-colors">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center border-r border-dashed border-gray-300">{o.ORDENPREVISIONAL}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 text-center border-r border-dashed border-gray-300">
                              <div className="font-mono text-xs text-red-600">{o.MATERIAL}</div>
                              <div className="truncate max-w-[250px] mx-auto">{o.NOMBRE}</div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-red-700 border-r border-dashed border-gray-300">{o.CANTIDAD}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 text-center border-r border-dashed border-gray-300">{o.FECHAINICIO}</td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-center border-r border-dashed border-gray-300">
                              <Badge variant="outline" className="mx-auto">{o.RESPCONTROLPROD}</Badge>
                            </td>
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
      </Tabs>
    </div>
  );
};