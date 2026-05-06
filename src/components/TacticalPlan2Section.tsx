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
   */
  const normalizeMaterialCode = useCallback((code: string | number): string => {
    if (!code) return '';
    return String(code).trim().replace(/^0+/, '');
  }, []);

  // 1. Cargar grupos y filtrar los de Colchones
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

  // 2. Cargar tiempos de producción
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
   * Resuelve la máquina priorizando identificadores que comiencen con "HR"
   */
  const getResolvedMachine = useCallback((order: any) => {
    // Escanear orden
    const orderFields = ['MAQUINA', 'Maquina', 'maquina', 'PUESTOTRABAJO', 'PuestoTrabajo'];
    for (const k of orderFields) {
      const val = order[k];
      if (val && String(val).trim() !== '' && String(val).toLowerCase() !== 'null') {
        const sVal = String(val).trim().toUpperCase();
        if (sVal.startsWith('HR')) return sVal;
      }
    }
    
    const materialRaw = order['MATERIAL'] || order['CodMaterial'] || '';
    const material = normalizeMaterialCode(materialRaw);
    if (!material) return '';

    const matches = tiemposProduccion.filter(t => 
      normalizeMaterialCode(t.CodMaterial || t.Material || '') === material
    );

    if (matches.length > 0) {
      // Escaneo total de campos en el maestro buscando identificador HR
      for (const m of matches) {
        const values = Object.values(m).map(v => String(v || '').trim().toUpperCase());
        const hrValue = values.find(v => v.startsWith('HR'));
        if (hrValue) return hrValue;
      }
      
      const best = matches.find(m => Number(m.Tiempo) > 0) || matches[0];
      return String(best.PuestoTrabajo || best.Maquina || best.nombre_estacion || '').trim().toUpperCase();
    }

    return '';
  }, [tiemposProduccion, normalizeMaterialCode]);

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
    </div>
  );
};