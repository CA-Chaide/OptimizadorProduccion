'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CalendarClock, Users, Lock, Package, MountainSnow, TreePalm, Loader2, ClipboardList, UserCheck, Clock, ListChecks, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { OrdenesFertTabSection } from './OrdenesFertTabSection';
import { HabilidadesOpTabSection } from './HabilidadesOpTabSection';
import { TiemposEnsambladoTabSection } from './TiemposEnsambladoTabSection';
import { ProgDiariaTabSection } from './ProgDiariaTabSection';
import { HorariosTabSection } from './HorariosTabSection';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import type { Grupo, Restriccion } from '@/types/interfaces';

const CENTROS = [
  { codigo: 1000, nombre: 'Quito', Icon: MountainSnow },
  { codigo: 2000, nombre: 'Guayaquil', Icon: TreePalm },
];

export const TacticalPlan2Section: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [isLoadingGrupos, setIsLoadingGrupos] = useState(false);
  const [isLoadingRestricciones, setIsLoadingRestricciones] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadGrupos();
    loadRestricciones();
  }, []);

  const loadGrupos = async () => {
    setIsLoadingGrupos(true);
    try {
      const res = await grupoService.getAll();
      setGrupos(res.data || []);
    } catch (error) {
      console.error('Error loading groups:', error);
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
      console.error('Error loading restrictions:', error);
    } finally {
      setIsLoadingRestricciones(false);
    }
  };

  const gruposFiltrados = useMemo(() => {
    return grupos.filter(g => 
      g.nombre_grupo.toLowerCase().includes('ensamblado')
    );
  }, [grupos]);

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

  if (!mounted) return null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <CalendarClock className="w-6 h-6 text-indigo-600" />
          <h2 className="text-2xl font-bold text-gray-800">Programación Táctica colchones</h2>
        </div>
      </div>
      
      <Tabs defaultValue="grupos" className="w-full">
        <TabsList className="grid w-full grid-cols-8 mb-8">
          <TabsTrigger value="grupos" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Grupos
          </TabsTrigger>
          <TabsTrigger value="restricciones" className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            Restricciones
          </TabsTrigger>
          <TabsTrigger value="habilidades" className="flex items-center gap-2">
            <UserCheck className="w-4 h-4" />
            Habilidades
          </TabsTrigger>
          <TabsTrigger value="tiempos" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Tiempos
          </TabsTrigger>
          <TabsTrigger value="ordenes" className="flex items-center gap-2">
            <Package className="w-4 h-4" />
            Previsionales
          </TabsTrigger>
          <TabsTrigger value="fert" className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Fert
          </TabsTrigger>
          <TabsTrigger value="prog_turnos" className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            prog Turnos
          </TabsTrigger>
          <TabsTrigger value="prog_diaria" className="flex items-center gap-2">
            <ListChecks className="w-4 h-4" />
            prog Diaria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="grupos">
          <Card>
            <CardHeader>
              <CardTitle>Grupos Operativos (Ensamblado)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingGrupos ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
                    <div style={{ transform: 'rotateX(180deg)' }}>
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
                          {gruposFiltrados.map((g) => {
                            const centro = resolveCentro(g.centro);
                            return (
                              <TableRow key={g.codigo_grupo}>
                                <TableCell className="font-mono font-bold text-indigo-600">{g.codigo_grupo}</TableCell>
                                <TableCell>{centro?.nombre || '-'}</TableCell>
                                <TableCell className="font-medium">{g.nombre_grupo}</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={g.estado === 'A' ? 'default' : 'destructive'} className={g.estado === 'A' ? 'bg-green-600' : ''}>
                                    {g.estado === 'A' ? 'Activo' : 'Inactivo'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card>
            <CardHeader>
              <CardTitle>Restricciones de Producción (Ensamblado)</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoadingRestricciones ? (
                <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
                    <div style={{ transform: 'rotateX(180deg)' }}>
                      <Table>
                        <TableHeader className="bg-gray-50">
                          <TableRow>
                            <TableHead>Nombre Restricción</TableHead>
                            <TableHead className="text-center">Valor</TableHead>
                            <TableHead>Grupo Asociado</TableHead>
                            <TableHead className="text-center">Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {restriccionesFiltradas.map((r) => {
                            const grupo = grupos.find(g => g.codigo_grupo === r.codigo_grupo);
                            return (
                              <TableRow key={r.codigo_restriccion}>
                                <TableCell className="font-semibold text-gray-700">{r.nombre_restriccion}</TableCell>
                                <TableCell className="text-center font-mono bg-blue-50/50">{r.valor_restriccion}</TableCell>
                                <TableCell>{grupo?.nombre_grupo} ({grupo?.centro})</TableCell>
                                <TableCell className="text-center">
                                  <Badge variant={r.estado === 'A' ? 'default' : 'destructive'} className={r.estado === 'A' ? 'bg-green-600' : ''}>
                                    {r.estado === 'A' ? 'Activo' : 'Inactivo'}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="habilidades">
          <Card>
            <CardHeader>
              <CardTitle>Habilidades OP</CardTitle>
            </CardHeader>
            <CardContent>
              <HabilidadesOpTabSection groups={grupos} restrictions={restricciones} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos">
          <Card>
            <CardHeader>
              <CardTitle>Tiempos de Ensamblado</CardTitle>
            </CardHeader>
            <CardContent>
              <TiemposEnsambladoTabSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes">
          <Card>
            <CardHeader>
              <CardTitle>Órdenes Previsionales</CardTitle>
            </CardHeader>
            <CardContent>
              <ProvisionalOrdersTabSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fert">
          <Card>
            <CardHeader>
              <CardTitle>Órdenes Fert</CardTitle>
            </CardHeader>
            <CardContent>
              <OrdenesFertTabSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prog_turnos">
          <Card>
            <CardHeader>
              <CardTitle>Programación de Turnos</CardTitle>
            </CardHeader>
            <CardContent>
              <HorariosTabSection />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prog_diaria">
          <Card>
            <CardHeader>
              <CardTitle>Programación Diaria de Planta</CardTitle>
              <CardDescription>Configuración de Hojas de Ruta activas por Centro.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProgDiariaTabSection groups={grupos} restrictions={restricciones} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
