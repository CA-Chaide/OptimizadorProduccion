'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { CalendarClock, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ProvisionalOrdersTabSection } from './ProvisionalOrdersTabSection';
import { grupoService } from '@/services/grupo.service';
import { serviciosService } from '@/services/servicios.service';
import type { Grupo } from '@/types/interfaces';
import { useAppContext } from '@/context/AppProvider';

export const TacticalPlan2Section: React.FC = () => {
  const { addNotification } = useAppContext();
  const [isMounted, setIsMounted] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [tiemposProduccion, setTiemposProduccion] = useState<any[]>([]);
  const [isLoadingTiempos, setIsLoadingTiempos] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  /**
   * Normaliza códigos de material eliminando ceros a la izquierda
   * para una comparación robusta entre diferentes fuentes.
   */
  const normalizeMaterialCode = useCallback((code: string | number): string => {
    if (!code) return '';
    return String(code).trim().replace(/^0+/, '');
  }, []);

  // 1. Cargar grupos y filtrar los de Colchones (incluyendo variaciones de nombre)
  const fetchGrupos = useCallback(async () => {
    try {
      const gRes = await grupoService.getAll();
      setGrupos(gRes.data || []);
    } catch (error) {
      console.error('Error fetching groups for mattresses:', error);
    }
  }, []);

  useEffect(() => {
    if (isMounted) fetchGrupos();
  }, [isMounted, fetchGrupos]);

  const colchonesGruposList = useMemo(() => {
    return grupos.filter(g => {
      const name = (g.nombre_grupo || '').toUpperCase();
      return name.includes('COLCHON') || name.includes('COLCHÓN');
    });
  }, [grupos]);

  // 2. Cargar tiempos de producción para los grupos de colchones
  const fetchTiemposProduccion = useCallback(async () => {
    if (colchonesGruposList.length === 0) return;
    setIsLoadingTiempos(true);
    try {
      const promises = colchonesGruposList.map(g => 
        serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo)
      );
      const responses = await Promise.all(promises);
      const allData = responses.flatMap(res => res.data || []);
      setTiemposProduccion(allData);
    } catch (error) {
      console.error('Error al cargar tiempos de producción para colchones:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [colchonesGruposList]);

  useEffect(() => {
    if (isMounted && colchonesGruposList.length > 0) {
      fetchTiemposProduccion();
    }
  }, [isMounted, colchonesGruposList, fetchTiemposProduccion]);

  /**
   * Lógica para resolver la máquina si viene null en la orden.
   * Realiza una búsqueda profunda en todos los campos del registro técnico.
   */
  const getResolvedMachine = useCallback((order: any) => {
    const rawVal = order['MAQUINA'] || order['Maquina'] || order['maquina'] || 
                   order['PUESTOTRABAJO'] || order['PuestoTrabajo'] || order['puestotrabajo'];
    
    if (rawVal !== null && rawVal !== undefined && String(rawVal).trim() !== '' && String(rawVal).toLowerCase() !== 'null') {
      return String(rawVal).trim().toUpperCase();
    }
    
    const materialRaw = order['MATERIAL'] || order['Material'] || order['material'] || 
                        order['CodMaterial'] || order['CODMATERIAL'] || order['codmaterial'] || '';
    
    const material = normalizeMaterialCode(materialRaw);
    if (!material) return '';

    // Buscar en maestros priorizando registros con tiempo definido.
    // Si no hay match en los grupos filtrados, intentamos cualquier match por material como respaldo.
    const match = tiemposProduccion.find(t => {
      const tMaterial = normalizeMaterialCode(t.CodMaterial || t.Material || '');
      return tMaterial === material && (Number(t.Tiempo) > 0);
    }) || tiemposProduccion.find(t => {
      return normalizeMaterialCode(t.CodMaterial || t.Material || '') === material;
    });

    return match ? String(match.PuestoTrabajo || match.Maquina || match.nombre_estacion || '').trim().toUpperCase() : '';
  }, [tiemposProduccion, normalizeMaterialCode]);

  // 4. Personalizar el renderizado de la celda de Máquina
  const renderResolvedProvisionalCell = useCallback((column: string, order: any) => {
    const upperCol = column.toUpperCase().trim();
    if (upperCol === 'MAQUINA') {
      const val = getResolvedMachine(order);
      return val ? (
        <span className="font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
          {val}
        </span>
      ) : (
        <span className="text-gray-400 italic">No definida</span>
      );
    }
    return undefined;
  }, [getResolvedMachine]);

  // 5. Resolver valor lógico para el agrupamiento
  const resolveLogicValue = useCallback((column: string, order: any) => {
    const upperCol = column.toUpperCase().trim();
    if (upperCol === 'MAQUINA') {
      return getResolvedMachine(order) || 'Z_SIN_MAQUINA';
    }
    return String(order[column] ?? '');
  }, [getResolvedMachine]);

  if (!isMounted) return null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <CalendarClock className="w-6 h-6 text-gray-700" />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica colchones</h2>
      </div>
      
      <Card className="border-indigo-100 shadow-sm">
        <CardHeader className="bg-gray-50/50 border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Datos de Órdenes Previsionales</CardTitle>
              <CardDescription>
                Visualización agrupada por máquina con resolución automática de datos técnicos.
              </CardDescription>
            </div>
            {isLoadingTiempos && (
              <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full border border-amber-100 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin" />
                Sincronizando maestros...
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <ProvisionalOrdersTabSection 
            renderCell={renderResolvedProvisionalCell}
            groupBy="MAQUINA"
            resolveValue={resolveLogicValue}
          />
        </CardContent>
      </Card>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
        <div className="p-2 bg-blue-100 rounded-full text-blue-700 mt-0.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-xs text-blue-800 font-medium">Nota de Resolución Técnica:</p>
          <p className="text-[11px] text-blue-700 mt-1">
            El sistema está cruzando automáticamente las órdenes con la tabla de Tiempos de Ensamblado. 
            Si la máquina aparece como "null" en el servidor, se asigna el puesto de trabajo técnico correspondiente al código de material realizando una búsqueda profunda en el maestro.
          </p>
        </div>
      </div>
    </div>
  );
};