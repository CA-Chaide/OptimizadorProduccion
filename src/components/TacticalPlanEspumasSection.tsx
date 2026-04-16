'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Wind, Users, Lock, Package, Loader2, AlertCircle, Search, Download, FileSpreadsheet } from 'lucide-react';
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
import { exportToXLSX } from '@/app/dashboard/opciones/importar-ventasV2/components/utils';

/**
 * TacticalPlanEspumasSection
 * 
 * Interfaz mejorada para la gestión de Espumas con búsqueda y estadísticas.
 */
export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Refs para sincronización de scroll
  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);

  // 1. Cargar Grupos de Espumas
  const fetchGruposEspumas = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo.toLowerCase().includes('espuma')
      );
      setGrupos(filtered);
      inspector.captureVariable('gruposEspumas', filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
      addNotification('error', 'Error al cargar grupos de espumas');
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
      inspector.captureVariable('restriccionesEspumas', filtered);
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
      const filteredGroups = await fetchGruposEspumas();
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      await fetchRestricciones(groupsIds);
      await fetchOrdenes();
      setIsLoading(false);
    };
    initData();
  }, []);

  // Lógica de filtrado para Órdenes Provisionales
  const ordenesFiltradas = useMemo(() => {
    if (ordenes.length === 0) return [];

    const respCtrlProdValues = restricciones
      .filter(r => r.nombre_restriccion === 'RespCtrlProd')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()));
    
    const almacenValues = restricciones
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .map(r => r.valor_restriccion.trim());

    let filtered = ordenes.filter(o => {
      const matchResp = respCtrlProdValues.length === 0 || respCtrlProdValues.includes(o.RESPCONTROLPROD);
      const matchAlmacen = almacenValues.length === 0 || almacenValues.includes(o.Almacen);
      return matchResp && matchAlmacen;
    });

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(o => 
        o.ORDENPREVISIONAL.toLowerCase().includes(q) ||
        o.MATERIAL.toLowerCase().includes(q) ||
        o.NOMBRE.toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [ordenes, restricciones, searchTerm]);

  // Estadísticas rápidas
  const stats = useMemo(() => {
    return {
      total: ordenesFiltradas.length,
      unidades: ordenesFiltradas.reduce((sum, o) => sum + (Number(o.CANTIDAD) || 0), 0)
    };
  }, [ordenesFiltradas]);

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

  const handleExport = () => {
    if (ordenesFiltradas.length === 0) return;
    exportToXLSX(ordenesFiltradas, 'Ordenes_Previsionales_Espumas');
    addNotification('success', 'Archivo de órdenes exportado correctamente');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
        <p className="text-gray-500 font-medium">Analizando configuración de Espumas...</p>
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
            <p className="text-sm text-gray-500">Gestión avanzada de producción para el área de espumas</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            {grupos.length} Grupos
          </Badge>
          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
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
              <CardTitle>Áreas Operativas de Espumas</CardTitle>
              <CardDescription>Grupos identificados en el sistema con procesos de espumación.</CardDescription>
            </CardHeader>
            <CardContent>
              {grupos.length === 0 ? (
                <div className="text-center py-12 text-gray-400 border-2 border-dashed rounded-lg">
                  No se encontraron grupos con el nombre "Espumas".
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {grupos.map(g => (
                    <div key={g.codigo_grupo} className="p-4 border rounded-lg bg-gray-50 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-blue-900">{g.nombre_grupo}</span>
                        <Badge>{g.centro}</Badge>
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
              <CardTitle>Parámetros de Control</CardTitle>
              <CardDescription>Reglas de negocio que definen el comportamiento del filtrado.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Restricción</th>
                      <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-dashed border-gray-300">Valor Configurado</th>
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
                          <Badge variant="secondary" className="font-mono">{r.valor_restriccion}</Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 text-center">
                          {r.descripcion || 'Sin descripción'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <div className="space-y-4">
            {/* Toolbar de búsqueda y acciones */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg border shadow-sm">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input 
                  placeholder="Buscar por orden o material..." 
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="flex gap-2">
                  <div className="px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-md text-center min-w-[100px]">
                    <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Órdenes</p>
                    <p className="text-sm font-bold text-blue-800">{stats.total.toLocaleString()}</p>
                  </div>
                  <div className="px-3 py-1.5 bg-green-50 border border-green-100 rounded-md text-center min-w-[100px]">
                    <p className="text-[10px] text-green-600 font-bold uppercase tracking-wider">Unidades</p>
                    <p className="text-sm font-bold text-green-800">{stats.unidades.toLocaleString()}</p>
                  </div>
                </div>
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="gap-2 border-green-200 text-green-700 hover:bg-green-50"
                  onClick={handleExport}
                  disabled={ordenesFiltradas.length === 0}
                >
                  <FileSpreadsheet className="w-4 h-4" /> Exportar
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="pt-6">
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
                      className="overflow-x-auto border rounded-b-lg max-h-[600px] shadow-inner"
                    >
                      <table ref={tableRef} className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                          <tr>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase border-r border-dashed border-gray-300">Orden</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase border-r border-dashed border-gray-300">Material</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase border-r border-dashed border-gray-300">Cantidad</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase border-r border-dashed border-gray-300">F. Inicio</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase border-r border-dashed border-gray-300">Resp.</th>
                            <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-600 uppercase">Almacén</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {ordenesFiltradas.map((o, idx) => (
                            <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-semibold text-gray-900 text-center border-r border-dashed border-gray-300">
                                {o.ORDENPREVISIONAL}
                              </td>
                              <td className="px-4 py-3 text-sm text-center border-r border-dashed border-gray-300">
                                <div className="font-bold text-blue-900 text-xs">{o.MATERIAL}</div>
                                <div className="truncate max-w-[250px] mx-auto text-gray-500 text-[11px]">{o.NOMBRE}</div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-center text-blue-700 border-r border-dashed border-gray-300 bg-blue-50/20">
                                {Number(o.CANTIDAD).toLocaleString()}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 text-center border-r border-dashed border-gray-300">
                                {o.FECHAINICIO}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-center border-r border-dashed border-gray-300">
                                <Badge variant="outline" className="font-mono mx-auto text-[10px] bg-white">{o.RESPCONTROLPROD}</Badge>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 text-center">
                                <Badge variant="secondary" className="bg-gray-100">{o.Almacen}</Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
