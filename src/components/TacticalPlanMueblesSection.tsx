'use client';

import React, { useState, useEffect } from 'react';
import { TacticalSchedulingIcon } from '@/constants/constants';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { OrdenesFertTabSection } from './OrdenesFertTabSection';
import { TiemposEnsambladoTab } from './TiemposEnsambladoTab';
import { CuboInventariosTab } from './CuboInventariosTab';
import { CuboInventariosTelasTab } from './CuboInventariosTelasTab';
import { MaterialesBrutosTab } from './MaterialesBrutosTab';
import { HabilidadesMueblesTab } from './HabilidadesMueblesTab';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { useAppContext } from '@/context/AppProvider';

// Componente para la tabla de Grupos
const GruposTab: React.FC<{ grupos: Grupo[]; isLoading: boolean }> = ({ grupos, isLoading }) => {
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
                                <TableHead className="text-center border-r border-dashed border-gray-300">Código</TableHead>
                                <TableHead className="text-center border-r border-dashed border-gray-300">Nombre</TableHead>
                                <TableHead className="text-center border-r border-dashed border-gray-300">Centro</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {grupos.map(grupo => (
                                <TableRow key={grupo.codigo_grupo}>
                                    <TableCell className="text-center border-r border-dashed border-gray-300">{grupo.codigo_grupo}</TableCell>
                                    <TableCell className="text-center border-r border-dashed border-gray-300">{grupo.nombre_grupo}</TableCell>
                                    <TableCell className="text-center border-r border-dashed border-gray-300">{grupo.centro}</TableCell>
                                    <TableCell className="text-center">{grupo.estado === 'A' ? 'Activo' : 'Inactivo'}</TableCell>
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
const RestriccionesTab: React.FC<{ restricciones: (Restriccion & { grupo?: Grupo })[]; isLoading: boolean }> = ({ restricciones, isLoading }) => {
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
                                <TableHead className="text-center border-r border-dashed border-gray-300">Grupo</TableHead>
                                <TableHead className="text-center border-r border-dashed border-gray-300">Nombre Restricción</TableHead>
                                <TableHead className="text-center border-r border-dashed border-gray-300">Valor</TableHead>
                                <TableHead className="text-center">Descripción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {restricciones.map(restriccion => (
                                <TableRow key={restriccion.codigo_restriccion}>
                                    <TableCell className="text-center border-r border-dashed border-gray-300">{restriccion.grupo?.nombre_grupo || restriccion.codigo_grupo}</TableCell>
                                    <TableCell className="text-center border-r border-dashed border-gray-300">{restriccion.nombre_restriccion}</TableCell>
                                    <TableCell className="text-center border-r border-dashed border-gray-300">{restriccion.valor_restriccion}</TableCell>
                                    <TableCell className="text-center">{restriccion.descripcion}</TableCell>
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
    const { addNotification } = useAppContext();
    const [mounted, setMounted] = useState(false);
    const [gruposMuebles, setGruposMuebles] = useState<Grupo[]>([]);
    const [restriccionesMuebles, setRestriccionesMuebles] = useState<Restriccion[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [tiemposMueblesData, setTiemposMueblesData] = useState<any[]>([]);
    const [isTiemposLoading, setIsTiemposLoading] = useState(true);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        if (!mounted) return;

        const fetchInitialData = async () => {
            setIsLoading(true);
            try {
                const [gruposRes, restriccionesRes] = await Promise.all([
                    grupoService.getAll(),
                    restriccionService.getAll()
                ]);

                const allGrupos = gruposRes.data || [];
                const allRestricciones = restriccionesRes.data || [];

                // Filter for "Muebles" group
                const mueblesGrupos = allGrupos.filter(g => 
                    g.nombre_grupo.toLowerCase().includes('muebles')
                );
                setGruposMuebles(mueblesGrupos);

                // Filter restrictions for "Muebles" groups
                if (mueblesGrupos.length > 0) {
                    const mueblesGrupoIds = new Set(mueblesGrupos.map(g => g.codigo_grupo));
                    const filteredRestricciones = allRestricciones.filter(r => 
                        mueblesGrupoIds.has(r.codigo_grupo)
                    );
                    
                    // Add group name to restrictions for display
                    const restriccionesConGrupo = filteredRestricciones.map(r => {
                        const grupo = allGrupos.find(g => g.codigo_grupo === r.codigo_grupo);
                        return { ...r, grupo };
                    });
                    setRestriccionesMuebles(restriccionesConGrupo);
                } else {
                    addNotification('warning', 'No se encontró ningún grupo "Muebles" para filtrar las restricciones.');
                    setRestriccionesMuebles([]);
                }

            } catch (error) {
                addNotification('error', `Error al cargar datos iniciales: ${(error as Error).message}`);
            } finally {
                setIsLoading(false);
            }
        };
        fetchInitialData();
    }, [addNotification, mounted]);

    useEffect(() => {
        if (!mounted || gruposMuebles.length === 0) {
            if(mounted && !isLoading) setIsTiemposLoading(false);
            return;
        }
        
        const fetchTiemposData = async () => {
            setIsTiemposLoading(true);
            const centro = '1000';
            const grupoMuebles = gruposMuebles.find(g => 
                g.centro === centro && g.nombre_grupo.toLowerCase().includes('muebles')
            );

            if (!grupoMuebles) {
                addNotification('warning', 'No se encontró el grupo "Muebles" para el centro 1000 para cargar tiempos.');
                setIsTiemposLoading(false);
                return;
            }

            const codigoGrupo = grupoMuebles.codigo_grupo;

            try {
                const response = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(centro, codigoGrupo);
                if (response && response.data) {
                    const dataArray = Array.isArray(response.data) ? response.data : [response.data];
                    setTiemposMueblesData(dataArray);
                } else {
                    addNotification('warning', 'No se encontraron datos de tiempos para Muebles.');
                }
            } catch (error) {
                addNotification('error', `Error al cargar tiempos de Muebles: ${(error as Error).message}`);
            } finally {
                setIsTiemposLoading(false);
            }
        };

        fetchTiemposData();
    }, [gruposMuebles, addNotification, isLoading, mounted]);

  if (!mounted) {
    return (
      <div className="p-6 md:p-8 flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <TacticalSchedulingIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica muebles</h2>
      </div>

      <Tabs defaultValue="plan" className="w-full">
          <TabsList className="grid w-full grid-cols-10 h-auto p-1 bg-muted border border-dashed border-gray-300 rounded-lg">
              <TabsTrigger value="grupos" className="border-r border-dashed border-gray-300 last:border-r-0">Grupos</TabsTrigger>
              <TabsTrigger value="restricciones" className="border-r border-dashed border-gray-300 last:border-r-0">Restricciones</TabsTrigger>
              <TabsTrigger value="ordenes" className="border-r border-dashed border-gray-300 last:border-r-0">Ord. Prev.</TabsTrigger>
              <TabsTrigger value="ordenesFert" className="border-r border-dashed border-gray-300 last:border-r-0">Ord. Fert</TabsTrigger>
              <TabsTrigger value="tiemposMuebles" className="border-r border-dashed border-gray-300 last:border-r-0">Tiempos</TabsTrigger>
              <TabsTrigger value="habilidades" className="border-r border-dashed border-gray-300 last:border-r-0">Habilidades</TabsTrigger>
              <TabsTrigger value="cascos" className="border-r border-dashed border-gray-300 last:border-r-0">Cascos</TabsTrigger>
              <TabsTrigger value="telas" className="border-r border-dashed border-gray-300 last:border-r-0">Telas</TabsTrigger>
              <TabsTrigger value="materialesBrutos" className="border-r border-dashed border-gray-300 last:border-r-0">Mat. Brutos</TabsTrigger>
              <TabsTrigger value="plan" className="last:border-r-0">PLAN</TabsTrigger>
          </TabsList>
          <TabsContent value="grupos" className="mt-4">
              <GruposTab grupos={gruposMuebles} isLoading={isLoading} />
          </TabsContent>
          <TabsContent value="restricciones" className="mt-4">
              <RestriccionesTab restricciones={restriccionesMuebles} isLoading={isLoading} />
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
                      <CardTitle>Órdenes FERT</CardTitle>
                      <CardDescription>
                          Listado completo de órdenes FERT registradas en el sistema para el área de Muebles.
                      </CardDescription>
                  </CardHeader>
                  <CardContent>
                      <OrdenesFertTabSection 
                        restricciones={restriccionesMuebles} 
                        displayMode="full"
                      />
                  </CardContent>
              </Card>
          </TabsContent>
          <TabsContent value="tiemposMuebles" className="mt-4">
              <TiemposEnsambladoTab data={tiemposMueblesData} isLoading={isTiemposLoading} />
          </TabsContent>
          <TabsContent value="habilidades" className="mt-4">
              <Card>
                  <CardHeader>
                      <CardTitle>Habilidades del Personal (CuboHabilidadesOP)</CardTitle>
                      <CardDescription>
                          Consulta de competencias y calificaciones técnicas para el personal del área de Muebles.
                      </CardDescription>
                  </CardHeader>
                  <CardContent>
                      <HabilidadesMueblesTab />
                  </CardContent>
              </Card>
          </TabsContent>
          <TabsContent value="cascos" className="mt-4">
              <Card>
                  <CardHeader>
                      <CardTitle>Inventario Cascos</CardTitle>
                      <CardDescription>
                          Visualización de los datos de inventario filtrados por "CASCO".
                      </CardDescription>
                  </CardHeader>
                  <CardContent>
                      <CuboInventariosTab />
                  </CardContent>
              </Card>
          </TabsContent>
           <TabsContent value="telas" className="mt-4">
              <Card>
                  <CardHeader>
                      <CardTitle>Inventario Telas</CardTitle>
                      <CardDescription>
                          Visualización de los datos de inventario filtrados por "TELA".
                      </CardDescription>
                  </CardHeader>
                  <CardContent>
                      <CuboInventariosTelasTab />
                  </CardContent>
              </Card>
          </TabsContent>
          <TabsContent value="materialesBrutos" className="mt-4">
              <Card>
                  <CardHeader>
                      <CardTitle>Explosión de Materiales Brutos</CardTitle>
                      <CardDescription>
                          Consumo de materias primas por producto terminado. Relacione el código de material del PLAN con esta tabla para saber qué insumos requiere.
                      </CardDescription>
                  </CardHeader>
                  <CardContent>
                      <MaterialesBrutosTab />
                  </CardContent>
              </Card>
          </TabsContent>
          <TabsContent value="plan" className="mt-4">
              <Card>
                  <CardHeader>
                      <CardTitle>PLAN</CardTitle>
                      <CardDescription>
                          Visualización de capacidad por fecha
                      </CardDescription>
                  </CardHeader>
                  <CardContent>
                      <OrdenesFertTabSection 
                        restricciones={restriccionesMuebles} 
                        columns={['FECHA', 'ORDEN', 'MATERIAL', 'NOMBRE', 'PUESTOTRABAJO', 'CANTPROGRAMADA', 'TIEMPO']}
                        hideControls={false}
                        tiemposData={tiemposMueblesData}
                        displayMode="plan"
                      />
                  </CardContent>
              </Card>
          </TabsContent>
      </Tabs>
    </div>
  );
};