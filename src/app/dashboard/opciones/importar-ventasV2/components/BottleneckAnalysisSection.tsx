
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { safeNumber, normalizeMaterialCode } from './utils';
import { TiempoCanonResult, TransferNeed, ViableTransfer, BottleneckAnalysisSectionProps } from './types';
import { BottleneckSummaryTable } from './BottleneckSummaryTable';
import { BottleneckClassTable } from './BottleneckClassTable';
import { bottleneckAnalysisService } from '@/services/BottleneckAnalysisService';
import { MONTH_NAMES } from './constants';

export const BottleneckAnalysisSection: React.FC<BottleneckAnalysisSectionProps> = ({ 
  data, 
  tiemposCanon, 
  numMaximoSabados, 
  maxExtrasHoras, 
  horasTrabajo, 
  horasExtrasFin, 
  onTransferNeedsConsolidatedChanged,
  onComputedDataReady,
  trasladosViables = []
}) => {
  const [transferNeedsEX, setTransferNeedsEX] = useState<TransferNeed[]>([]);
  const [computedDataEX, setComputedDataEX] = useState<any[]>([]);

  // Usar el servicio centralizado
  const analysis = useMemo(() => {
    if (data.length === 0) return null;
    return bottleneckAnalysisService.analyzeCenter2000(data, tiemposCanon);
  }, [data, tiemposCanon]);

  // Extraer datos del análisis
  const { dataEX = [], dataF = [], transferNeedsF = [], filteredDataCentro2000 = [] } = analysis || {};

  // Consolidar transferencias INCLUYENDO MES
  const transferNeedsConsolidated = useMemo(() => {
    const consolidated = new Map<string, number>();
    
    const addToMap = (item: TransferNeed) => {
      const key = `${normalizeMaterialCode(item.CodMaterial)}|${item.mes}`;
      consolidated.set(key, (consolidated.get(key) || 0) + item.necesidadTraslado);
    };

    transferNeedsEX.forEach(addToMap);
    transferNeedsF.forEach(addToMap);
    
    return Array.from(consolidated.entries()).map(([key, necesidadTraslado]) => {
      const [CodMaterial, mes] = key.split('|');
      return { CodMaterial, mes, necesidadTraslado };
    });
  }, [transferNeedsEX, transferNeedsF]);

  useEffect(() => {
    if (transferNeedsConsolidated.length > 0) {
      onTransferNeedsConsolidatedChanged?.(transferNeedsConsolidated);
    }
  }, [transferNeedsConsolidated, onTransferNeedsConsolidatedChanged]);

  // Exportar datos calculados al padre (Cerebro)
  useEffect(() => {
    if (onComputedDataReady && computedDataEX.length > 0) {
      // Unir resultados de E/X con los de F (F tiene producción 0 en Gye)
      const dataF_with_zeros = dataF.map(row => ({
        ...row,
        _prodViable: 0,
        _isPreComputed: true,
        necesidadMaximaProducirJornadaNormal: 0,
        necesidadMaximaProducirHorasExtras: 0,
        necesidadMaximaProducirSabados: 0,
        _traslado: 0, // Se llenará en el tab de resumen
        _necPropia: safeNumber(row._Necesidades),
        _necesidad: safeNumber(row._Necesidades)
      }));
      
      onComputedDataReady([...computedDataEX, ...dataF_with_zeros]);
    }
  }, [computedDataEX, dataF, onComputedDataReady]);

  if (data.length === 0) return <div className="p-4 text-center text-gray-600">Carga datos primero para iniciar el análisis.</div>;

  return (
    <div>
      <BottleneckSummaryTable 
        datosEnriquecidosE={[]}
        datosEnriquecidosX={[]}
        datosCalculados={computedDataEX}
        tiemposCanon={tiemposCanon}
        numMaximoSabados={numMaximoSabados}
        maxExtrasHoras={maxExtrasHoras}
        horasTrabajo={horasTrabajo}
        horasExtrasFin={horasExtrasFin}
      />
      
      <BottleneckClassTable 
        datos={dataEX}
        datosCompletos={filteredDataCentro2000}
        titulo="Centro 2000 - Clases E + X (Fabricación Local)"
        tiemposCanon={tiemposCanon}
        onTransferNeedsCalculated={setTransferNeedsEX}
        onComputedDataReady={setComputedDataEX}
        maxExtrasHoras={maxExtrasHoras}
        horasExtrasFin={horasExtrasFin}
        trasladosViables={trasladosViables}
      />
      
      {dataF.length > 0 && (
        <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="text-sm font-bold text-amber-900 uppercase mb-2">Materiales Clase F (Traslado Quito)</h3>
          <p className="text-xs text-amber-800 mb-4">Estos materiales se trasladan completos sin procesar en Centro 2000. Su demanda ha sido enviada a Quito.</p>
          <div className="max-h-60 overflow-y-auto border border-amber-100 rounded bg-white">
            <table className="w-full text-[10px]">
              <thead className="bg-amber-100 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Mes</th>
                  <th className="px-2 py-1 text-left">Código</th>
                  <th className="px-2 py-1 text-left">Descripción</th>
                  <th className="px-2 py-1 text-right">Necesidad Traslado</th>
                </tr>
              </thead>
              <tbody>
                {dataF.map((row, idx) => {
                  const nec = safeNumber(row._Necesidades);
                  const mesDisplay = !isNaN(parseInt(row.Mes)) ? (MONTH_NAMES[parseInt(row.Mes)] || row.Mes) : row.Mes;
                  return (
                    <tr key={idx} className="border-b border-amber-50">
                      <td className="px-2 py-1 font-bold text-indigo-900">{mesDisplay}</td>
                      <td className="px-2 py-1 font-mono">{row.CodMaterial}</td>
                      <td className="px-2 py-1 truncate max-w-xs">{row.Descripcion || row.NombreMaterial}</td>
                      <td className="px-2 py-1 text-right font-mono font-bold">{Math.round(nec).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
