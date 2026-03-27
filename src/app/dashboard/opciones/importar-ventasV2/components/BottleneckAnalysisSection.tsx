
'use client';

import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { safeNumber, exportToXLSXMultiSheet } from './utils';
import { TiempoCanonResult, TransferNeed } from './types';
import { BottleneckSummaryTable } from './BottleneckSummaryTable';
import { BottleneckClassTable } from './BottleneckClassTable';
import { dataStore } from '@/services/DataStore';

function normalizarClase(valor: any): string {
  return String(valor || '').trim().toUpperCase();
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
  // 1. Filtrado de datos por Centro 2000 (Operación Única)
  const filteredDataCentro2000 = useMemo(() => {
    return data.filter(row => String(row.Centro || '').trim() === '2000');
  }, [data]);

  // 2. Clasificación de datos
  const { dataEX, dataF } = useMemo(() => {
    const ex: any[] = [];
    const f: any[] = [];
    filteredDataCentro2000.forEach(row => {
      const clase = normalizarClase(row.ClaseAprovisionam);
      if (clase === 'E' || clase === 'X') ex.push(row);
      else if (clase === 'F') f.push(row);
    });
    return { dataEX: ex, dataF: f };
  }, [filteredDataCentro2000]);

  const [transferNeedsEX, setTransferNeedsEX] = useState<TransferNeed[]>([]);
  const [computedDataEX, setComputedDataEX] = useState<any[]>([]);

  // 3. Cálculo de transferencias F (Simplificado)
  const transferNeedsF = useMemo(() => {
    const map = new Map<string, number>();
    dataF.forEach(row => {
      const cod = String(row.CodMaterial ?? '');
      const up = safeNumber(row.UnidadesProyectado ?? 0);
      const ss = safeNumber(row.StockSeguridad ?? 0);
      const sa = safeNumber(row.StockActual ?? 0);
      const nec = Math.max(0, up - sa + ss);
      map.set(cod, (map.get(cod) || 0) + nec);
    });
    return Array.from(map.entries()).map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }));
  }, [dataF]);

  // 4. Consolidación y sincronización con DataStore
  const transferNeedsConsolidated = useMemo(() => {
    const consolidated = new Map<string, number>();
    transferNeedsEX.forEach(item => consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado));
    transferNeedsF.forEach(item => consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado));
    
    return Array.from(consolidated.entries()).map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }));
  }, [transferNeedsEX, transferNeedsF]);

  useEffect(() => {
    if (transferNeedsConsolidated.length > 0) {
      dataStore.setData('trasladosRequeridosC2000', transferNeedsConsolidated, 'BottleneckAnalysisSection');
      onTransferNeedsConsolidatedChanged?.(transferNeedsConsolidated);
    }
  }, [transferNeedsConsolidated, onTransferNeedsConsolidatedChanged]);

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
