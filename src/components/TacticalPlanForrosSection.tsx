'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarClock, Loader2, Users, Lock, Package, Timer, RefreshCw, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
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
import { cn } from '@/lib/utils';

export const TacticalPlanForrosSection: React.FC = () => {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [tiemposProduccion, setTiemposProduccion] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTiempos, setIsLoadingTiempos] = useState(false);

  // Estado para paginación de Tiempos de Producción
  const [tiemposPage, setTiemposPage] = useState(1);
  const [tiemposRowsPerPage, setTiemposRowsPerPage] = useState(20);

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
    return grupos.filter(g => (g.nombre_grupo || '').toUpperCase().includes('FORROS'));
  }, [grupos]);

  // 2. Filtrar restricciones de los grupos de forros
  const forrosRestricciones = useMemo(() => {
    const forrosGroupIds = new Set(forrosGruposList.map(g => g.codigo_grupo));
    return restricciones.filter(r => forrosGroupIds.has(r.codigo_grupo));
  }, [forrosGruposList, restricciones]);

  // 3. Extraer filtros para la tabla de órdenes (RespCtrlProd y ALMACEN)
  const externalFilters = useMemo(() => {
    const filters: Record<string, string[]> = {};
    
    forrosRestricciones.forEach(r => {
      const name = (r.nombre_restriccion || '').trim().toUpperCase();
      if (name === 'RESPCTRLPROD' || name === 'ALMACEN' || name === 'ALMACÉN') {
        const key = name === 'ALMACÉN' ? 'ALMACEN' : name;
        if (!filters[key]) filters[key] = [];
        filters[key].push(r.valor_restriccion.trim());
      }
    });
    
    return filters;
  }, [forrosRestricciones]);

  // 4. Cargar Tiempos de Producción dinámicamente
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
      setTiemposPage(1); // Reset a primera página al cargar nuevos datos
    } catch (error) {
      console.error('Error al cargar tiempos de producción:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [forrosGruposList]);

  useEffect(() => {
    if (forrosGruposList.length > 0) {
      fetchTiemposProduccion();
    }
  }, [forrosGruposList, fetchTiemposProduccion]);

  // Lógica de Paginación para Tiempos
  const tiemposColumns = useMemo(() => {
    if (tiemposProduccion.length === 0) return [];
    return Object.keys(tiemposProduccion[0]);
  }, [tiemposProduccion]);

  const totalTiemposPages = Math.max(1, Math.ceil(tiemposProduccion.length / tiemposRowsPerPage));
  
  const paginatedTiemposData = useMemo(() => {
    const start = (tiemposPage - 1) * tiemposRowsPerPage;
    return tiemposProduccion.slice(start, start + tiemposRowsPerPage);
  }, [tiemposProduccion, tiemposPage, tiemposRowsPerPage]);

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

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Grupos de Forros</CardTitle>
              <CardDescription>Grupos operativos filtrados.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Código</TableHead>
                      <TableHead>Centro</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead className="text-center">Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forrosGruposList.map((g) => (
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
                    ))}
                    {forrosGruposList.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-10 text-gray-400 italic">
                          No se encontraron grupos relacionados con Forros.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <CardHeader>
              <CardTitle>Restricciones de Forros</CardTitle>
              <CardDescription>Configuración técnica del grupo.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Nombre Restricción</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Descripción</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forrosRestricciones.map((r) => (
                      <TableRow key={r.codigo_restriccion}>
                        <TableCell className="font-semibold text-indigo-700">{r.nombre_restriccion}</TableCell>
                        <TableCell className="font-mono">{r.valor_restriccion}</TableCell>
                        <TableCell className="text-gray-500 text-xs">{r.descripcion || '-'}</TableCell>
                      </TableRow>
                    ))}
                    {forrosRestricciones.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-10 text-gray-400 italic">
                          No hay restricciones configuradas para los grupos de Forros.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card>
            <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div>
                <CardTitle>Tiempos de Producción</CardTitle>
                <CardDescription>Detalle dinámico de tiempos de ensamble ({tiemposProduccion.length} registros).</CardDescription>
              </div>
              
              {/* Controles de Paginación Superiores */}
              {!isLoadingTiempos && tiemposProduccion.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 mr-4">
                    <span className="text-xs text-gray-500 font-medium">Ver:</span>
                    <select
                      value={tiemposRowsPerPage}
                      onChange={(e) => {
                        setTiemposRowsPerPage(Number(e.target.value));
                        setTiemposPage(1);
                      }}
                      className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      {[10, 20, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setTiemposPage(1)}
                      disabled={tiemposPage === 1}
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setTiemposPage(p => Math.max(1, p - 1))}
                      disabled={tiemposPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    
                    <span className="px-3 text-xs font-semibold text-gray-700 min-w-[100px] text-center">
                      Página {tiemposPage} de {totalTiemposPages}
                    </span>

                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setTiemposPage(p => Math.min(totalTiemposPages, p + 1))}
                      disabled={tiemposPage === totalTiemposPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setTiemposPage(totalTiemposPages)}
                      disabled={tiemposPage === totalTiemposPages}
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button variant="outline" size="sm" onClick={fetchTiemposProduccion} disabled={isLoadingTiempos}>
                    <RefreshCw className={cn("h-4 w-4 mr-2", isLoadingTiempos && "animate-spin")} />
                    Recargar
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-md border overflow-hidden shadow-sm">
                <div className="overflow-x-auto overflow-y-auto max-h-[65vh]">
                  <Table className="min-w-full divide-y divide-gray-200 border-collapse">
                    <TableHeader>
                      <TableRow className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                        {tiemposColumns.map(col => (
                          <TableHead key={col} className="px-4 py-3 text-[10px] font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap border-b">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-gray-200 bg-white">
                      {isLoadingTiempos ? (
                        <TableRow>
                          <TableCell colSpan={tiemposColumns.length || 1} className="text-center py-24">
                            <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary mb-3" />
                            <span className="text-gray-500 font-medium">Consultando tiempos de producción...</span>
                          </TableCell>
                        </TableRow>
                      ) : paginatedTiemposData.length > 0 ? (
                        paginatedTiemposData.map((t, idx) => (
                          <tr key={`tiempo-${idx}`} className="hover:bg-blue-50/30 transition-colors">
                            {tiemposColumns.map(col => (
                              <td key={`cell-${idx}-${col}`} className="px-4 py-2.5 whitespace-nowrap text-[11px] text-gray-600 font-mono border-b">
                                {t[col] !== null && t[col] !== undefined ? String(t[col]) : '—'}
                              </td>
                            ))}
                          </tr>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={tiemposColumns.length || 1} className="text-center py-20 text-gray-400 italic">
                            No se encontraron registros de tiempos para estos grupos.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card>
            <CardHeader>
              <CardTitle>Órdenes Previsionales Filtradas</CardTitle>
              <CardDescription>Órdenes que cumplen con RespCtrlProd y ALMACEN del grupo de Forros.</CardDescription>
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
