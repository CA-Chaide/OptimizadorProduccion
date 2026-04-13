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

export function TacticalPlanForrosSection() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [loadingGrupos, setLoadingGrupos] = useState(true);
  const [loadingRestricciones, setLoadingRestricciones] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [gRes, rRes] = await Promise.all([
          grupoService.getAll(),
          restriccionService.getAll()
        ]);
        setGrupos(gRes.data || []);
        setRestricciones(rRes.data || []);
      } catch (error) {
        console.error('Error fetching tactical plan forros data:', error);
      } finally {
        setLoadingGrupos(false);
        setLoadingRestricciones(false);
      }
    }
    fetchData();
  }, []);

  // Filtrar restricciones para el grupo "FORROS"
  const forrosRestricciones = useMemo(() => {
    const groupForros = grupos.find(g => g.nombre_grupo.toUpperCase().includes('FORROS'));
    if (!groupForros) return [];
    return restricciones.filter(r => r.codigo_grupo === groupForros.codigo_grupo);
  }, [grupos, restricciones]);

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
            <Package className="w-4 h-4" /> Ordenes Previsionales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Grupos de Trabajo</CardTitle>
              <CardDescription>Listado de grupos operativos configurados en el sistema.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingGrupos ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Centro</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {grupos.map((g) => (
                        <TableRow key={g.codigo_grupo}>
                          <TableCell className="font-mono">{g.codigo_grupo}</TableCell>
                          <TableCell>{g.centro}</TableCell>
                          <TableCell>{g.nombre_grupo}</TableCell>
                          <TableCell>
                            <Badge 
                              variant={g.estado === 'A' ? 'default' : 'secondary'} 
                              className={g.estado === 'A' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
                            >
                              {g.estado === 'A' ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {grupos.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-8 text-gray-500">
                            No hay grupos disponibles
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <CardHeader>
              <CardTitle>Restricciones de Producción (Forros)</CardTitle>
              <CardDescription>Parámetros y límites técnicos definidos específicamente para el grupo de Forros.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingRestricciones ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead>Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {forrosRestricciones.map((r) => (
                        <TableRow key={r.codigo_restriccion}>
                          <TableCell className="font-mono">{r.codigo_restriccion}</TableCell>
                          <TableCell className="font-medium">{r.nombre_restriccion}</TableCell>
                          <TableCell>{r.valor_restriccion}</TableCell>
                          <TableCell className="max-w-xs truncate" title={r.descripcion}>
                            {r.descripcion || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={r.estado === 'A' ? 'default' : 'secondary'} 
                              className={r.estado === 'A' ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
                            >
                              {r.estado === 'A' ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                      {forrosRestricciones.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                            No se encontraron restricciones para el grupo "FORROS"
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card>
            <CardHeader>
              <CardTitle>Datos de Órdenes Previsionales (Forros)</CardTitle>
              <CardDescription>
                Visualización y exploración de las órdenes previsionales disponibles para el área de forros.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProvisionalOrdersTabSection />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
