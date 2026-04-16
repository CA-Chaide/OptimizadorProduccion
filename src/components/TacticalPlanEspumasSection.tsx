'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Wind, Users, Lock, Package, Loader2, AlertCircle } from 'lucide-react';
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
 * TacticalPlanEspumasSection
 * 
 * Muestra 3 pestañas:
 * 1. Grupos: Filtrados por "Espumas"
 * 2. Restricciones: Pertenecientes a esos grupos
 * 3. Órdenes Provisionales: Filtradas por RespCtrlProd y ALMACEN de las restricciones
 */
export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('grupos');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

    inspector.captureVariable('filtrosAplicados', { respCtrlProdValues, almacenValues });

    return ordenes.filter(o => {
      const matchResp = respCtrlProdValues.length === 0 || respCtrlProdValues.includes(o.RESPCONTROLPROD);
      const matchAlmacen = almacenValues.length === 0 || almacenValues.includes(o.Almacen);
      return matchResp && matchAlmacen;
    });
  }, [ordenes, restricciones, inspector]);

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
            <p className="text-sm text-gray-500">Gestión de producción basada en restricciones de planta</p>
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
            <Users className="w-4 h-4" /> Grupos de Espumas
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
                      <p className="text-xs text-gray-500">Código Grupo: {g.codigo_grupo}</p>
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
              <CardTitle>Parámetros de Control (Restricciones)</CardTitle>
              <CardDescription>Reglas de negocio que definen el comportamiento del filtrado de órdenes.</CardDescription>
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
                    {restricciones.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-8 text-center text-gray-400">
                          No hay restricciones definidas para los grupos seleccionados.
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
                  <CardTitle>Resultados de Órdenes Previsionales</CardTitle>
                  <CardDescription>Filtradas automáticamente por Responsable y Almacén según restricciones.</CardDescription>
                </div>
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  {ordenesFiltradas.length} Registros Encontrados
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {ordenesFiltradas.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed">
                  <AlertCircle className="w-12 h-12 mb-4 text-gray-300" />
                  <p className="font-medium">No hay órdenes que coincidan con las restricciones actuales.</p>
                  <p className="text-sm">Verifique las restricciones de 'RespCtrlProd' y 'ALMACEN'.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-lg max-h-[600px]">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                      <tr>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Orden</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Material</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Cant.</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Inicio</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Fin</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase border-r border-dashed border-gray-300">Resp.</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">Almacén</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {ordenesFiltradas.map((o, idx) => (
                        <tr key={idx} className="hover:bg-blue-50 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 text-center border-r border-dashed border-gray-300">{o.ORDENPREVISIONAL}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 text-center border-r border-dashed border-gray-300">
                            <div className="font-mono text-xs mx-auto">{o.MATERIAL}</div>
                            <div className="truncate max-w-[200px] mx-auto">{o.NOMBRE}</div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-blue-700 text-center border-r border-dashed border-gray-300">{o.CANTIDAD}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 text-center border-r border-dashed border-gray-300">{o.FECHAINICIO}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500 text-center border-r border-dashed border-gray-300">{o.FECHAFIN}</td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm text-center border-r border-dashed border-gray-300">
                            <Badge variant="outline" className="font-mono mx-auto">{o.RESPCONTROLPROD}</Badge>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-700 text-center">{o.Almacen}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
