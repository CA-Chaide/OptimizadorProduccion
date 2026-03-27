'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { safeNumber } from './utils';
import { TiempoCanonResult, TransferNeed } from './types';
import { BottleneckSummaryTable } from './BottleneckSummaryTable';
import { BottleneckClassTable } from './BottleneckClassTable';
import { bottleneckAnalysisService } from '@/services/BottleneckAnalysisService';

interface BottleneckAnalysisSectionProps {
  data: any[];
  tiemposCanon: TiempoCanonResult[];
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
  onTransferNeedsConsolidatedChanged?: (needs: TransferNeed[]) => void;
  onComputedDataReady?: (data: any[]) => void;
}

export const BottleneckAnalysisSection: React.FC<BottleneckAnalysisSectionProps> = ({ 
  data, 
  tiemposCanon, 
  numMaximoSabados, 
  maxExtrasHoras, 
  horasTrabajo, 
  horasExtrasFin, 
  onTransferNeedsConsolidatedChanged,
  onComputedDataReady
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

  // Consolidar transferencias
  const transferNeedsConsolidated = useMemo(() => {
    const consolidated = new Map<string, number>();
    transferNeedsEX.forEach(item => consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado));
    transferNeedsF.forEach(item => consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado));
    
    return Array.from(consolidated.entries()).map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }));
  }, [transferNeedsEX, transferNeedsF]);

  useEffect(() => {
    if (transferNeedsConsolidated.length > 0) {
      onTransferNeedsConsolidatedChanged?.(transferNeedsConsolidated);
    }
  }, [transferNeedsConsolidated, onTransferNeedsConsolidatedChanged]);

  // Exportar datos calculados al padre si es necesario
  useEffect(() => {
    if (onComputedDataReady && computedDataEX.length > 0) {
      onComputedDataReady(computedDataEX);
    }
  }, [computedDataEX, onComputedDataReady]);

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
        titulo="Centro 2000 - Clases E + X"
        tiemposCanon={tiemposCanon}
        onTransferNeedsCalculated={setTransferNeedsEX}
        onComputedDataReady={setComputedDataEX}
        maxExtrasHoras={maxExtrasHoras}
        horasExtrasFin={horasExtrasFin}
      />
      
      {dataF.length > 0 && (
        <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <h3 className="text-sm font-bold text-amber-900 uppercase mb-2">Materiales Clase F (Traslado Quito)</h3>
          <p className="text-xs text-amber-800 mb-4">Estos materiales se trasladan completos sin procesar en Centro 2000.</p>
          <div className="max-h-60 overflow-y-auto border border-amber-100 rounded bg-white">
            <table className="w-full text-[10px]">
              <thead className="bg-amber-100 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left">Código</th>
                  <th className="px-2 py-1 text-left">Descripción</th>
                  <th className="px-2 py-1 text-right">Necesidad Traslado</th>
                </tr>
              </thead>
              <tbody>
                {dataF.map((row, idx) => {
                  const nec = Math.max(0, safeNumber(row.UnidadesProyectado) - safeNumber(row.StockActual) + safeNumber(row.StockSeguridad));
                  return (
                    <tr key={idx} className="border-b border-amber-50">
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
