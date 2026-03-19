'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber } from './utils';
import { TiempoCanonResult, TransferNeed } from './types';
import { BottleneckSummaryTable } from './BottleneckSummaryTable';
import { BottleneckClassTable } from './BottleneckClassTable';

// Función para normalizar y limpiar valores de clase de aprovisionamiento
function normalizarClase(valor: any): string {
  return String(valor || '').trim().toUpperCase();
}

// Función compartida: enriquecer datos de una clase con participación, necesidad máxima, etc.
function enriquecerDatosClase(
  datos: any[],
  tiemposCanon: any[],
  tiempoConsumidoAnterior: { [mesLinea: string]: number } = {}
) {
  const computeNec = (row: any) => {
    const up = safeNumber(row.UnidadesProyectado ?? 0);
    const ss = safeNumber(row.StockSeguridad ?? 0);
    const sa = safeNumber(row.StockActual ?? 0);
    return Math.max(0, up - sa + ss);
  };

  const buscarTiempoCanon = (mesRaw: string) => {
    let found = tiemposCanon.find((t: any) => t.mes === mesRaw);
    if (found) return found;
    const mesNum = parseInt(mesRaw);
    if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
      const mesNombre = MONTH_NAMES[mesNum];
      found = tiemposCanon.find((t: any) => t.mes === mesNombre);
      if (found) return found;
      found = tiemposCanon.find((t: any) => t.mesNumero === mesNum);
      if (found) return found;
    }
    return null;
  };

  // Función para normalizar nombres de líneas para comparación
  const normalizarLinea = (linea: string): string => {
    return String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
  };

  const obtenerTiempoDisp = (mes: string, linea: string, puesto: string | null) => {
    const tc = buscarTiempoCanon(mes);
    if (!tc || !tc.data || !Array.isArray(tc.data)) return null;

    const lineaNorm = normalizarLinea(linea);
    
    // Primero filtrar por línea
    const registrosLinea = tc.data.filter((item: any) => {
      const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
      return nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
    });

    // Si no encontramos registros de la línea, intentar buscar por puesto en todos los datos
    if (registrosLinea.length === 0) {
      if (puesto && puesto !== '-' && puesto !== '') {
        const pn = String(puesto).toLowerCase().trim();
        const dp = tc.data.find((item: any) => {
          const nombreEstacion = String(item?.nombre_estacion ?? '').toLowerCase().trim();
          return nombreEstacion.includes(pn) || pn.includes(nombreEstacion);
        });
        if (dp) {
          return {
            minutos_horario_normal: safeNumber(dp?.minutos_horario_normal_CON_PUESTOS ?? dp?.minutos_horario_normal_TOTAL ?? 0),
            minutos_con_extras: safeNumber(dp?.minutos_extras_CON_PUESTOS ?? dp?.minutos_extras_TOTAL ?? 0),
            minutos_fin_semana: safeNumber(dp?.minutos_sabado_CON_PUESTOS ?? dp?.minutos_sabado_TOTAL ?? 0),
            diasLaborables: tc.diasLaborables,
            diasSabados: tc.diasSabados
          };
        }
      }
      return null;
    }

    // Sumar todos los tiempos de las estaciones de esa línea
    let minutos_horario_normal = 0;
    let minutos_con_extras = 0;
    let minutos_fin_semana = 0;
    
    registrosLinea.forEach((dato: any) => {
      minutos_horario_normal += safeNumber(dato?.minutos_horario_normal_CON_PUESTOS ?? dato?.minutos_horario_normal_TOTAL ?? 0);
      minutos_con_extras += safeNumber(dato?.minutos_extras_CON_PUESTOS ?? dato?.minutos_extras_TOTAL ?? 0);
      minutos_fin_semana += safeNumber(dato?.minutos_sabado_CON_PUESTOS ?? dato?.minutos_sabado_TOTAL ?? 0);
    });

    return {
      minutos_horario_normal,
      minutos_con_extras,
      minutos_fin_semana,
      diasLaborables: tc.diasLaborables,
      diasSabados: tc.diasSabados
    };
  };

  // Mapa de necesidades por línea para participación
  const mapa: { [k: string]: number } = {};
  datos.forEach(row => {
    const k = `${String(row.Mes ?? 'Sin mes')}|${String(row.LineaFabricacion ?? 'Sin línea')}`;
    mapa[k] = (mapa[k] || 0) + computeNec(row);
  });

  return datos.map(row => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const key = `${mes}|${linea}`;
    const necesidad = computeNec(row);
    const sumaNecLinea = mapa[key] ?? necesidad;
    const participacionIndividual = sumaNecLinea > 0 ? (necesidad / sumaNecLinea) * 100 : 0;
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const tiempoTotalNecesidad = necesidad * tiempoPorUnidad;
    const tiempoDisp = obtenerTiempoDisp(mes, linea, row.PuestoCuellodeBottella);

    let necesidadMaximaAFabricar = 0;
    let horasExtrasUsadas = 0;

    if (tiempoDisp && tiempoPorUnidad > 0) {
      const techoAbsoluto = tiempoDisp.minutos_con_extras + tiempoDisp.minutos_fin_semana;
      const consumidoPrev = tiempoConsumidoAnterior?.[key] ?? 0;
      const tiempoMaxDisp = Math.max(0, techoAbsoluto - consumidoPrev);
      const tiempoParaMaterial = (participacionIndividual / 100) * tiempoMaxDisp;
      // Nunca fabricar más de lo que se necesita
      necesidadMaximaAFabricar = Math.min(necesidad, Math.floor(tiempoParaMaterial / tiempoPorUnidad));

      const tiempoNormalRest = Math.max(0, tiempoDisp.minutos_horario_normal - consumidoPrev);
      const tiempoNormalParaMaterial = (participacionIndividual / 100) * tiempoNormalRest;
      const tiempoRealUsado = Math.min(necesidad, necesidadMaximaAFabricar) * tiempoPorUnidad;
      if (tiempoRealUsado > tiempoNormalParaMaterial) {
        horasExtrasUsadas = (tiempoRealUsado - tiempoNormalParaMaterial) / 60;
      }
    }

    return {
      ...row,
      participacionIndividual: participacionIndividual.toFixed(2),
      tiempoTotalNecesidad,
      necesidadMaximaAFabricar,
      horasExtrasUsadas: horasExtrasUsadas.toFixed(2),
      mesRef: mes,
      lineaRef: linea
    };
  });
}

interface BottleneckAnalysisSectionProps {
  data: any[];
  tiemposCanon: TiempoCanonResult[];
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
  onTransferNeedsConsolidatedChanged?: (needs: TransferNeed[]) => void;
}

export const BottleneckAnalysisSection: React.FC<BottleneckAnalysisSectionProps> = ({ 
  data, 
  tiemposCanon, 
  numMaximoSabados, 
  maxExtrasHoras, 
  horasTrabajo, 
  horasExtrasFin, 
  onTransferNeedsConsolidatedChanged 
}) => {
  // =====================================================
  // === TODOS LOS HOOKS AL INICIO (antes de returns) ===
  // =====================================================
  
  const [transferNeedsE, setTransferNeedsE] = useState<TransferNeed[]>([]);
  const [transferNeedsX, setTransferNeedsX] = useState<TransferNeed[]>([]);
  const [transferNeedsF, setTransferNeedsF] = useState<TransferNeed[]>([]);
  
  // Función para calcular necesidad
  const computeNecesidad = (row: any) => {
    const up = safeNumber(row.UnidadesProyectado ?? 0);
    const ss = safeNumber(row.StockSeguridad ?? 0);
    const sa = safeNumber(row.StockActual ?? 0);
    return Math.max(0, up - sa + ss);
  };

  // Filtrar centro 2000
  const filteredDataCentro2000 = useMemo(() => {
    return data.filter(row => 
      String(row.Centro) === '2000'
    );
  }, [data]);

  // Filtrar por clases (todo en hooks)
  const dataE = useMemo(() => {
    return filteredDataCentro2000.filter(row => 
      normalizarClase(row.ClaseAprovisionam) === 'E'
    );
  }, [filteredDataCentro2000]);

  const dataX = useMemo(() => {
    return filteredDataCentro2000.filter(row => 
      normalizarClase(row.ClaseAprovisionam) === 'X'
    );
  }, [filteredDataCentro2000]);

  const dataF = useMemo(() => {
    return filteredDataCentro2000.filter(row => 
      normalizarClase(row.ClaseAprovisionam) === 'F'
    );
  }, [filteredDataCentro2000]);

  // Enriquecer datos E y X
  const datosEnriquecidosE = useMemo(() => {
    return enriquecerDatosClase(dataE, tiemposCanon, {});
  }, [dataE, tiemposCanon]);

  const tiempoConsumidoPorE = useMemo(() => {
    const result: { [mesLinea: string]: number } = {};
    datosEnriquecidosE.forEach(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
      result[key] = (result[key] || 0) + (row.necesidadMaximaAFabricar * tiempoPorUnidad);
    });
    return result;
  }, [datosEnriquecidosE]);

  const datosEnriquecidosX = useMemo(() => {
    return enriquecerDatosClase(dataX, tiemposCanon, tiempoConsumidoPorE);
  }, [dataX, tiemposCanon, tiempoConsumidoPorE]);

  // Consolidar traslados
  const transferNeedsConsolidated = useMemo(() => {
    const consolidated = new Map<string, number>();
    
    transferNeedsE.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });
    
    transferNeedsX.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });

    transferNeedsF.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });
    
    return Array.from(consolidated.entries())
      .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
      .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));
  }, [transferNeedsE, transferNeedsX, transferNeedsF]);

  // Notificar cambios
  useEffect(() => {
    if (onTransferNeedsConsolidatedChanged && transferNeedsConsolidated.length > 0) {
      onTransferNeedsConsolidatedChanged(transferNeedsConsolidated);
    }
  }, [transferNeedsConsolidated, onTransferNeedsConsolidatedChanged]);

  // Calcular transferencias F (sin lógica de asignación, directo a Quito)
  useEffect(() => {
    if (dataF.length > 0) {
      const transferMap = new Map<string, number>();
      dataF.forEach(row => {
        const codMaterial = String(row.CodMaterial ?? '');
        const necesidad = computeNecesidad(row);
        const current = transferMap.get(codMaterial) || 0;
        transferMap.set(codMaterial, Math.max(current, necesidad));
      });

      const transferNeedsF_array = Array.from(transferMap.entries())
        .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
        .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));
      
      console.log('[BottleneckAnalysis] Transfer Needs F (enviando a Quito):', transferNeedsF_array.length, 'materiales');
      setTransferNeedsF(transferNeedsF_array);
    } else {
      setTransferNeedsF([]);
    }
  }, [dataF]);

  // Debug
  useEffect(() => {
    if (typeof window !== 'undefined' && data.length > 0) {
      console.log('=== [BottleneckAnalysis DEBUG] ===');
      console.log('Total registros:', data.length, '| Centro 2000:', filteredDataCentro2000.length);
      console.log('Clase E:', dataE.length, '| X:', dataX.length, '| F:', dataF.length);
    }
  }, [data, filteredDataCentro2000, dataE, dataX, dataF]);

  // =====================================================
  // === DESPUÉS DE HOOKS: EARLY RETURN SI NO HAY DATA ===
  // =====================================================
  
  if (data.length === 0) {
    return <div className="p-4 text-center text-gray-600">Carga datos primero desde la pestaña "Datos del Backend - Necesidades"</div>;
  }

  return (
    <div>
      <BottleneckSummaryTable 
        datosEnriquecidosE={datosEnriquecidosE}
        datosEnriquecidosX={datosEnriquecidosX}
        tiemposCanon={tiemposCanon}
        numMaximoSabados={numMaximoSabados}
        maxExtrasHoras={maxExtrasHoras}
        horasTrabajo={horasTrabajo}
        horasExtrasFin={horasExtrasFin}
      />
      
      <BottleneckClassTable 
        datos={dataE}
        datosCompletos={filteredDataCentro2000}
        titulo="Clase de Aprovisionamiento: E"
        tiemposCanon={tiemposCanon}
        tiempoConsumidoAnterior={{}}
        onTransferNeedsCalculated={setTransferNeedsE}
      />
      <BottleneckClassTable 
        datos={dataX}
        datosCompletos={filteredDataCentro2000}
        titulo="Clase de Aprovisionamiento: X"
        tiemposCanon={tiemposCanon}
        tiempoConsumidoAnterior={tiempoConsumidoPorE}
        onTransferNeedsCalculated={setTransferNeedsX}
      />
      
      {dataF.length > 0 && (
        <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-grow">
              <h3 className="text-lg font-semibold text-amber-900">Clase de Aprovisionamiento: F (Traslado a Quito)</h3>
              <p className="text-sm text-amber-800 mt-2">
                Los siguientes {dataF.length} material{dataF.length !== 1 ? 'es' : ''} con clase F se trasladan completos a plantas de Quito sin asignación de fabricación en Centro 2000.
              </p>
              
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-amber-200 bg-white rounded">
                  <thead className="bg-amber-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Código Material</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Línea</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Sector</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-amber-900">Necesidad (Traslado a Quito)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {dataF.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-amber-50">
                        <td className="px-4 py-2 text-sm text-gray-800 font-mono">{row.CodMaterial || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{row.LineaFabricacion || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{row.Sector || '-'}</td>
                        <td className="px-4 py-2 text-sm text-right font-semibold text-amber-900">
                          {computeNecesidad(row).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-3 text-xs text-amber-700">
                <strong>Total unidades a trasladar:</strong> {dataF.reduce((sum, row) => sum + computeNecesidad(row), 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
