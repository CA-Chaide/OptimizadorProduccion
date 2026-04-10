'use client';

import React, { useState, useEffect } from 'react';
import { TacticalSchedulingIcon } from '@/constants/constants';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { OrdenesFertTabSection } from './OrdenesFertTabSection';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { useAppContext } from '@/context/AppProvider';

// Componente para la tabla de Grupos
const GruposTab: React.FC = () => {
    const [grupos, setGrupos] = useState<Grupo[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { addNotification } = useAppContext();

    useEffect(() => {
        const fetchGrupos = async () => {
            try {
                const response = await grupoService.getAll();
                // Filter for groups with "muebles" in the name
                const mueblesGrupos = (response.data || []).filter(g => 
                    g.nombre_grupo.toLowerCase().includes('muebles')
                );
                setGrupos(mueblesGrupos);
            } catch (error) {
                addNotification('error', `Error al cargar grupos: ${(error as Error).message}`);
            } finally {
                setIsLoading(false);
            }
        };
        fetchGrupos();
    }, [addNotification]);

    if (isLoading) {
        return <div className="flex justify-center items-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Listado de Grupos de Muebles</CardTitle>
                <CardDescription>Grupos operativos para la fabricación de muebles.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg overflow-auto max-h-[60vh]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Código</TableHead>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Centro</TableHead>
                                <TableHead>Estado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {grupos.map(grupo => (
                                <TableRow key={grupo.codigo_grupo}>
                                    <TableCell>{grupo.codigo_grupo}</TableCell>
                                    <TableCell>{grupo.nombre_grupo}</TableCell>
                                    <TableCell>{grupo.centro}</TableCell>
                                    <TableCell>{grupo.estado === 'A' ? 'Activo' : 'Inactivo'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};

// Componente para la tabla de Restricciones
const RestriccionesTab: React.FC = () => {
    const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const { addNotification } = useAppContext();

    useEffect(() => {
        const fetchRestricciones = async () => {
            try {
                const [restriccionesRes, gruposRes] = await Promise.all([
                    restriccionService.getAll(),
                    grupoService.getAll()
                ]);

                const allRestricciones = restriccionesRes.data || [];
                const allGrupos = gruposRes.data || [];

                // Find the group "Muebles"
                const mueblesGrupo = allGrupos.find(g => g.nombre_grupo.toLowerCase().includes('muebles'));

                if (mueblesGrupo) {
                    const filteredRestricciones = allRestricciones.filter(r => r.codigo_grupo === mueblesGrupo.codigo_grupo);
                    // Add group name to restrictions for display
                    const restriccionesConGrupo = filteredRestricciones.map(r => ({
                        ...r,
                        grupo: mueblesGrupo
                    }));
                    setRestricciones(restriccionesConGrupo);
                } else {
                    addNotification('warning', 'No se encontró el grupo "Muebles" para filtrar las restricciones.');
                    setRestricciones([]);
                }
            } catch (error) {
                addNotification('error', `Error al cargar restricciones: ${(error as Error).message}`);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRestricciones();
    }, [addNotification]);

    if (isLoading) {
        return <div className="flex justify-center items-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Listado de Restricciones para Muebles</CardTitle>
                <CardDescription>Restricciones de producción para el grupo de Muebles.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="border rounded-lg overflow-auto max-h-[60vh]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Grupo</TableHead>
                                <TableHead>Nombre Restricción</TableHead>
                                <TableHead>Valor</TableHead>
                                <TableHead>Descripción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {restricciones.map(restriccion => (
                                <TableRow key={restriccion.codigo_restriccion}>
                                    <TableCell>{restriccion.grupo?.nombre_grupo || restriccion.codigo_grupo}</TableCell>
                                    <TableCell>{restriccion.nombre_restriccion}</TableCell>
                                    <TableCell>{restriccion.valor_restriccion}</TableCell>
                                    <TableCell>{restriccion.descripcion}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
        </Card>
    );
};


export const TacticalPlanMueblesSection: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <TacticalSchedulingIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica muebles</h2>
      </div>

      <Tabs defaultValue="ordenes" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="grupos">Grupos</TabsTrigger>
            <TabsTrigger value="restricciones">Restricciones</TabsTrigger>
            <TabsTrigger value="ordenes">Órdenes Previsionales</TabsTrigger>
            <TabsTrigger value="ordenesFert">Órdenes Fert</TabsTrigger>
        </TabsList>
        <TabsContent value="grupos" className="mt-4">
            <GruposTab />
        </TabsContent>
        <TabsContent value="restricciones" className="mt-4">
            <RestriccionesTab />
        </TabsContent>
        <TabsContent value="ordenes" className="mt-4">
            <Card>
                <CardHeader>
                    <CardTitle>Datos de Órdenes Previsionales</CardTitle>
                    <CardDescription>
                        Visualización y exploración de todas las órdenes previsionales disponibles en el sistema, filtrado para almacenes 1011 y 1015.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <ProvisionalOrdersTabSection />
                </CardContent>
            </Card>
        </TabsContent>
        <TabsContent value="ordenesFert" className="mt-4">
            <Card>
                <CardHeader>
                    <CardTitle>Datos de Órdenes Fert</CardTitle>
                    <CardDescription>
                        Visualización de las órdenes de fabricación (FERT).
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <OrdenesFertTabSection />
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
