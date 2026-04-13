'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Users, Lock, Package, MountainSnow, TreePalm, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { useToast } from '@/hooks/use-toast';

const CENTROS = [
  { codigo: 1000, nombre: 'Quito', Icon: MountainSnow },
  { codigo: 2000, nombre: 'Guayaquil', Icon: TreePalm },
];

export const TacticalPlan2Section: React.FC = () => {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [isLoadingGrupos, setIsLoadingGrupos] = useState(false);
  const [isLoadingRestricciones, setIsLoadingRestricciones] = useState(false);
  const { toast } = useToast();

  const loadGrupos = async () => {
    setIsLoadingGrupos(true);
    try {
      const res = await grupoService.getAll();
      setGrupos(res.data || []);
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar los grupos', variant: 'destructive' });
    } finally {
      setIsLoadingGrupos(false);
    }
  };

  const loadRestricciones = async () => {
    setIsLoadingRestricciones(true);
    try {
      const res = await restriccionService.getAll();
      setRestricciones(res.data || []);
    } catch (error) {
      toast({ title: 'Error', description: 'No se pudieron cargar las restricciones', variant: 'destructive' });
    } finally {
      setIsLoadingRestricciones(false);
    }
  };

  useEffect(() => {
    loadGrupos();
    loadRestricciones();
  }, []);

  // Filtrar grupos que contengan "Ensamblado"
  const gruposFiltrados = useMemo(() => {
    return grupos.filter(g => 
      g.nombre_grupo.toLowerCase().includes('ensamblado')
    );
  }, [grupos]);

  // Filtrar restricciones que pertenezcan a un grupo llamado "Ensamblado"
  const restriccionesFiltradas = useMemo(() => {
    return restricciones.filter(r => {
      const grupoAsociado = grupos.find(g => g.codigo_grupo === r.codigo_grupo);
      return grupoAsociado && grupoAsociado.nombre_grupo.toLowerCase().includes('ensamblado');
    });
  }, [restricciones, grupos]);

  const resolveCentro = (codigoOrValue?: any) => {
    if (codigoOrValue == null) return null;
    const codigo = Number(codigoOrValue);
    return CENTROS.find(x => x.codigo === codigo) || null;
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CalendarClock className="w-6 h-6 text-indigo-600" />
          <h2 className="text-2xl font-bold text-gray-800">Programación Táctica Colchones</h2>
        </div>
      </div>
      
      <Tabs defaultValue="grupos" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-8">
          <TabsTrigger value="grupos" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Grupos
          </TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Restricciones
          </TabsTrigger>
          <TabsTrigger value="ordenes" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Ordenes Previsionales
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: GRUPOS */}
        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Grupos Operativos (Ensamblado)</CardTitle>
              <CardDescription>Mostrando únicamente los grupos relacionados con el área de Ensamblado.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingGrupos ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead className="w-24">Código</TableHead>
                        <TableHead>Centro</TableHead>
                        <TableHead>Nombre del Grupo</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {gruposFiltrados.length > 0 ? gruposFiltrados.map((g) => {
                        const centro = resolveCentro(g.centro);
                        const Icon = centro?.Icon;
                        return (
                          <TableRow key={g.codigo_grupo}>
                            <TableCell className="font-mono font-bold text-indigo-600">{g.codigo_grupo}</TableCell>
                            <TableCell>
                              {centro ? (
                                <div className="flex items-center gap-2">
                                  {Icon && <Icon className="w-4 h-4 text-gray-500" />}
                                  <span>{centro.nombre}</span>
                                </div>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="font-medium">{g.nombre_grupo}</TableCell>
                            <TableCell className="text-center">
                              <Badge variant={g.estado === 'A' ? 'default' : 'destructive'} className={g.estado === 'A' ? 'bg-green-600' : ''}>
                                {g.estado === 'A' ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-gray-500">No se encontraron grupos de "Ensamblado"</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: RESTRICCIONES */}
        <TabsContent value="restricciones">
          <Card>
            <CardHeader>
              <CardTitle>Restricciones de Producción (Ensamblado)</CardTitle>
              <CardDescription>Parámetros y límites operativos filtrados para el área de Ensamblado.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingRestricciones ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-gray-50">
                      <TableRow>
                        <TableHead>Nombre Restricción</TableHead>
                        <TableHead className="text-center">Valor</TableHead>
                        <TableHead>Grupo Asociado</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-center">Estado</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {restriccionesFiltradas.length > 0 ? restriccionesFiltradas.map((r) => {
                        const grupo = grupos.find(g => g.codigo_grupo === r.codigo_grupo);
                        return (
                          <TableRow key={r.codigo_restriccion}>
                            <TableCell className="font-semibold text-gray-700">{r.nombre_restriccion}</TableCell>
                            <TableCell className="text-center font-mono bg-blue-50/50">{r.valor_restriccion}</TableCell>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="font-medium text-xs text-indigo-700">{grupo?.nombre_grupo || 'N/A'}</span>
                                <span className="text-[10px] text-gray-500">Centro: {grupo?.centro || '-'}</span>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-xs text-gray-600" title={r.descripcion}>
                              {r.descripcion || '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant={r.estado === 'A' ? 'default' : 'destructive'} className={r.estado === 'A' ? 'bg-green-600 text-[10px]' : 'text-[10px]'}>
                                {r.estado === 'A' ? 'Activo' : 'Inactivo'}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      }) : (
                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-gray-500">No hay restricciones para el área de Ensamblado</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: ORDENES PREVISIONALES */}
        <TabsContent value="ordenes">
          <Card>
            <CardHeader>
              <CardTitle>Backend Previsionales</CardTitle>
              <CardDescription>
                Visualización y exploración de todas las órdenes previsionales disponibles en el sistema.
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
};
