'use client';

import React, { useState, useEffect } from 'react';
import { Layers, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { TiemposEnsambladoTab } from './TiemposEnsambladoTab';
import { grupoService } from '@/services/grupo.service';
import { serviciosService } from '@/services/servicios.service';
import type { Grupo } from '@/types/interfaces';
import { useAppContext } from '@/context/AppProvider';

/**
 * Componente de sección para la Programación Táctica de Planchas Mixtas.
 * Incluye visualización de órdenes previsionales y tiempos de fabricación.
 */
export const TacticalPlanPlanchasMixtasSection: React.FC = () => {
  const { addNotification } = useAppContext();
  const [gruposPlanchas, setGruposPlanchas] = useState<Grupo[]>([]);
  const [tiemposPlanchasData, setTiemposPlanchasData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTiemposLoading, setIsTiemposLoading] = useState(false);

  // Cargar grupos para identificar el código de grupo de Planchas
  useEffect(() => {
    const fetchInitialData = async () => {
      setIsLoading(true);
      try {
        const res = await grupoService.getAll();
        const allGrupos = res.data || [];
        
        // Buscamos grupos relacionados con Planchas o Mixtas
        const filtered = allGrupos.filter(g => 
          g.nombre_grupo.toLowerCase().includes('plancha') || 
          g.nombre_grupo.toLowerCase().includes('mixta')
        );
        setGruposPlanchas(filtered);
      } catch (error) {
        addNotification('error', `Error al cargar grupos: ${(error as Error).message}`);
      } finally {
        setIsLoading(false);
      }
    };
    fetchInitialData();
  }, [addNotification]);

  // Cargar Tiempos de Fabricación basados en el grupo encontrado
  useEffect(() => {
    const fetchTiempos = async () => {
      if (gruposPlanchas.length === 0) {
        if (!isLoading) setIsTiemposLoading(false);
        return;
      }

      setIsTiemposLoading(true);
      // Tomamos el primer grupo como referencia (usualmente 1000 - Planchas)
      const targetGroup = gruposPlanchas[0];
      const centro = targetGroup.centro || '1000';
      const codigoGrupo = targetGroup.codigo_grupo;

      try {
        const response = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(centro, codigoGrupo);
        if (response && response.data) {
          const dataArray = Array.isArray(response.data) ? response.data : [response.data];
          
          // Filtrar por responsables 015 y 016 como solicitó el usuario
          const filtered = dataArray.filter((item: any) => {
            const resp = String(item.RespControlProd || item.RESPCONTROLPROD || '').trim();
            return resp === '015' || resp === '016';
          });
          
          // Si el API no devuelve el campo de responsable, mostramos los datos del grupo completo
          setTiemposPlanchasData(filtered.length > 0 ? filtered : dataArray);
        } else {
          setTiemposPlanchasData([]);
        }
      } catch (error) {
        console.error("Error cargando tiempos de Planchas", error);
      } finally {
        setIsTiemposLoading(false);
      }
    };

    fetchTiempos();
  }, [gruposPlanchas, addNotification, isLoading]);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <Layers className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Planchas Mixtas</h2>
      </div>
      
      <Tabs defaultValue="ordenes" className="w-full">
        <TabsList className="grid w-full grid-cols-2 h-auto p-1 bg-muted border border-dashed border-gray-300 rounded-lg">
          <TabsTrigger value="ordenes" className="border-r border-dashed border-gray-300">
            Ord. Prev. (015/016)
          </TabsTrigger>
          <TabsTrigger value="tiempos">
            Tiempos de Fabricación
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ordenes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Datos de Órdenes Previsionales</CardTitle>
              <CardDescription>
                Visualización y exploración de todas las órdenes previsionales correspondientes al área de Planchas Mixtas (Responsables 015 y 016).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProvisionalOrdersTabSection respCodes={['015', '016']} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos" className="mt-4">
          <TiemposEnsambladoTab 
            data={tiemposPlanchasData} 
            isLoading={isTiemposLoading} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};