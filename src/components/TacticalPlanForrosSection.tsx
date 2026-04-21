
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarClock, Loader2, Users, Lock, Package, Timer, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import type { Grupo, Restriccion } from '@/types/interfaces';

export const TacticalPlanForrosSection: React.FC = () => {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [tiemposProduccion, setTiemposProduccion] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTiempos, setIsLoadingTiempos] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [gRes, rRes] = await Promise.all([
        grupoService.getAll(),
        restriccionService.getAll()
      ]);
      setGrupos(gRes.data || []);
      setRestricciones(rRes.data || []);
    } catch (error) {
      console.error('Error fetching forros data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 1. Filtrar los grupos que contienen "FORROS" en el nombre
  const forrosGruposList = useMemo(() => {
    return grupos.filter(g => g.nombre_grupo.toUpperCase().includes('FORROS'));
  }, [grupos]);

  // 2. Filtrar restricciones de TODOS los grupos que coincidan con "FORROS"
  const forrosRestricciones = useMemo(() => {
    const forrosGroupIds = new Set(forrosGruposList.map(g => g.codigo_grupo));
    return restricciones.filter(r => forrosGroupIds.has(r.codigo_grupo));
  }, [forrosGruposList, restricciones]);

  // 3. Extraer filtros para la tabla de órdenes (RespCtrlProd y ALMACEN)
  const externalFilters = useMemo(() => {
    const filters: Record<string, string[]> = {};
    
    forrosRestricciones.forEach(r => {
      const name = r.nombre_restriccion.trim().toUpperCase();
      if (name === 'RESPCTRLPROD' || name === 'ALMACEN' || name === 'ALMACÉN') {
        const key = name === 'ALMACÉN' ? 'ALMACEN' : name;
        if (!filters[key]) filters[key] = [];
        filters[key].push(r.valor_restriccion.trim());
      }
    });
    
    return filters;
  }, [forrosRestricciones]);

  // 4. Cargar Tiempos de Producción usando el método específico para cada grupo filtrado
  const fetchTiemposProduccion = useCallback(async () => {
    if (forrosGruposList.length === 0) return;
    
    setIsLoadingTiempos(true);
    try {
      const promises = forrosGruposList.map(g => 
        serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo)
      );
      
      const responses = await Promise.all(promises);
      const allTiempos = responses.flatMap(res => res.data || []);
      setTiemposProduccion(allTiempos);
    } catch (error) {
      console.error('Error al cargar tiempos de producción:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [forrosGruposList]);

  // Ejecutar carga de tiempos cuando la lista de grupos esté lista
  useEffect(() => {
    if (forrosGruposList.length > 0) {
      fetchTiemposProduccion();
    }
  }, [forrosGruposList, fetchTiemposProduccion]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-gray-500 font-medium">Cargando datos de Programación Táctica...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <CalendarClock className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Forros</h2>
      </div>

      <Tabs defaultValue="grupos" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="grupos" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Grupos
          </TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> Restricciones
          </TabsTrigger>
          <TabsTrigger value="tiempos" className="flex items-center gap-2">
            <Timer className="w-4 h-4" /> Tiempos de Producción
          </TabsTrigger>
          <TabsTrigger value="ordenes" className="flex items-center gap-2">
            <Package className="w-4 h-4" /> Órdenes Previsionales
          </TabsTrigger>
        </TabsList>

        {/* Pestaña de Grupos */}
        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Listado de Grupos (Forros)</CardTitle>
              <CardDescription>Grupos operativos que corresponden al área de Forros.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-[100px]">Código</TableHead>
                      <TableHead>Centro</TableHead>
                      <TableHead>Nombre del Grupo</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forrosGruposList.length > 0 ? (
                      forrosGruposList.map((g) => (
                        <TableRow key={g.codigo_grupo}>
                          <TableCell className="font-mono text-xs">{g.codigo_grupo}</TableCell>
                          <TableCell>{g.centro}</TableCell>
                          <TableCell className="font-medium">{g.nombre_grupo}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant={g.estado === 'A' ? 'default' : 'secondary'} className={g.estado === 'A' ? 'bg-green-600' : ''}>
                              {g.estado === 'A' ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-gray-400 italic">
                          No se encontraron grupos con el nombre "Forros".
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pestaña de Restricciones */}
        <TabsContent value="restricciones">
          <Card>
            <CardHeader>
              <CardTitle>Restricciones de Forros</CardTitle>
              <CardDescription>Configuración técnica y operativa filtrada para el área de Forros.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Nombre Restricción</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forrosRestricciones.length > 0 ? (
                      forrosRestricciones.map((r) => (
                        <TableRow key={r.codigo_restriccion}>
                          <TableCell className="font-semibold text-indigo-700">{r.nombre_restriccion}</TableCell>
                          <TableCell className="font-mono">{r.valor_restriccion}</TableCell>
                          <TableCell className="text-gray-500 text-xs max-w-xs truncate" title={r.descripcion}>
                            {r.descripcion || '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={r.estado === 'A' ? 'default' : 'secondary'} className={r.estado === 'A' ? 'bg-green-600' : ''}>
                              {r.estado === 'A' ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-gray-400 italic">
                          No hay restricciones configuradas para el área de Forros.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pestaña de Tiempos de Producción */}
        <TabsContent value="tiempos">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tiempos de Producción</CardTitle>
                <CardDescription>Tiempos de ensamble por material y estación para Forros.</CardDescription>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={fetchTiemposProduccion}
                disabled={isLoadingTiempos}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isLoadingTiempos && "animate-spin")} />
                Recargar
              </Button>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                      <TableHead>Material</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Línea</TableHead>
                      <TableHead>Puesto</TableHead>
                      <TableHead className="text-right">Tiempo (min)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingTiempos ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-20">
                          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-2" />
                          <span className="text-gray-500">Consultando tiempos de ensamble...</span>
                        </TableCell>
                      </TableRow>
                    ) : tiemposProduccion.length > 0 ? (
                      tiemposProduccion.map((t, idx) => (
                        <TableRow key={`tiempo-${idx}`}>
                          <TableCell className="font-mono text-xs font-semibold">{t.CodMaterial}</TableCell>
                          <TableCell className="text-xs max-w-xs truncate" title={t.Material}>{t.Material}</TableCell>
                          <TableCell className="text-xs">{t.Linea}</TableCell>
                          <TableCell className="text-xs">{t.PuestoTrabajo}</TableCell>
                          <TableCell className="text-right font-mono text-indigo-600 font-bold">{t.Tiempo}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-gray-400 italic">
                          No se encontraron tiempos de producción para los grupos seleccionados.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pestaña de Órdenes Previsionales */}
        <TabsContent value="ordenes">
          <Card>
            <CardHeader>
              <CardTitle>Órdenes Previsionales Filtradas</CardTitle>
              <CardDescription>Visualización dinámica de órdenes para el grupo Forros.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProvisionalOrdersTabSection externalFilters={externalFilters} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
