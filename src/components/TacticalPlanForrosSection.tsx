'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Loader2, Users, Lock, Package } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import type { Grupo, Restriccion } from '@/types/interfaces';

export const TacticalPlanForrosSection: React.FC = () => {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
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
    }
    fetchData();
  }, []);

  // 1. Identificar el grupo de FORROS
  const forrosGroup = useMemo(() => {
    return grupos.find(g => g.nombre_grupo.toUpperCase().includes('FORROS'));
  }, [grupos]);

  // 2. Filtrar restricciones específicas del grupo FORROS
  const forrosRestricciones = useMemo(() => {
    if (!forrosGroup) return [];
    return restricciones.filter(r => r.codigo_grupo === forrosGroup.codigo_grupo);
  }, [forrosGroup, restricciones]);

  // 3. Extraer filtros para la tabla de órdenes (RespCtrlProd y ALMACÉN)
  const externalFilters = useMemo(() => {
    const filters: Record<string, string[]> = {};
    
    forrosRestricciones.forEach(r => {
      const name = r.nombre_restriccion.trim().toUpperCase();
      // Mapeamos los nombres técnicos que esperamos en la tabla de órdenes
      if (name === 'RESPCTRLPROD' || name === 'ALMACEN' || name === 'ALMACÉN') {
        const key = name === 'ALMACÉN' ? 'ALMACEN' : name;
        if (!filters[key]) filters[key] = [];
        filters[key].push(r.valor_restriccion.trim());
      }
    });
    
    return filters;
  }, [forrosRestricciones]);

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
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="grupos" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Grupos
          </TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-2">
            <Lock className="w-4 h-4" /> Restricciones
          </TabsTrigger>
          <TabsTrigger value="ordenes" className="flex items-center gap-2">
            <Package className="w-4 h-4" /> Órdenes Previsionales
          </TabsTrigger>
        </TabsList>

        {/* Pestaña de Grupos */}
        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Listado de Grupos</CardTitle>
              <CardDescription>Grupos operativos registrados en el sistema.</CardDescription>
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
                    {grupos.map((g) => (
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
              <CardTitle>Restricciones Grupo: {forrosGroup?.nombre_grupo || 'FORROS'}</CardTitle>
              <CardDescription>Configuración técnica y operativa para el área de forros.</CardDescription>
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
                          No hay restricciones configuradas para el grupo de forros.
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
              <CardTitle>Explorador de Órdenes Previsionales</CardTitle>
              <CardDescription>Visualización dinámica de órdenes filtradas por los criterios del grupo.</CardDescription>
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
