
'use client';

import React, { useState, useMemo } from 'react';
import { TiempoCanonResult, ViableTransfer } from './types';
import { BottleneckSummaryTable } from './BottleneckSummaryTable';
import { BottleneckClassTable } from './BottleneckClassTable';

interface BottleneckMonthlySummaryC1000SectionProps {
  data: any[];
  tiemposCanon: TiempoCanonResult[];
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
}

export const BottleneckMonthlySummaryC1000Section: React.FC<BottleneckMonthlySummaryC1000SectionProps> = ({ 
  data, 
  tiemposCanon, 
  numMaximoSabados, 
  maxExtrasHoras, 
  horasTrabajo, 
  horasExtrasFin
}) => {
  const [computedDataEXF, setComputedDataEXF] = useState<any[]>([]);

  // Filtrar solo datos del Centro 1000 para este resumen
  const filteredDataCentro1000 = useMemo(() => {
    return data.filter(row => {
      const cFab = String(row.CentroFabricacion || '').trim();
      const cDem = String(row.Centro || '').trim();
      return cFab === '1000' || (cFab === '' && cDem === '1000');
    });
  }, [data]);

  const dataEXF = useMemo(() => {
    return filteredDataCentro1000.filter(row => {
      const clase = String(row.ClaseAprovisionam || '').trim().toUpperCase();
      return ['E', 'X', 'F'].includes(clase);
    });
  }, [filteredDataCentro1000]);

  if (data.length === 0) {
    return <div className="p-4 text-center text-gray-600">Carga datos primero desde la pestaña "Datos del Backend"</div>;
  }

  return (
    <div>
      <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-teal-900">Resumen Mensual Unificado C1000</h3>
            <p className="text-sm text-teal-800 mt-1">
              Esta sección presenta una visión consolidada de todos los materiales demandados en el Centro 1000, 
              incluyendo las Clases E, X y F (que para Quito son fabricación propia).
            </p>
          </div>
        </div>
      </div>

      <BottleneckSummaryTable 
        datosEnriquecidosE={[]}
        datosEnriquecidosX={[]}
        datosCalculados={computedDataEXF}
        tiemposCanon={tiemposCanon}
        numMaximoSabados={numMaximoSabados}
        maxExtrasHoras={maxExtrasHoras}
        horasTrabajo={horasTrabajo}
        horasExtrasFin={horasExtrasFin}
        centroLabel="Centro 1000 (Quito)"
        isCentro1000={true}
        showSaldos={true}
      />
      
      <BottleneckClassTable 
        datos={dataEXF}
        datosCompletos={filteredDataCentro1000}
        titulo="Visión Unificada: Clases E + X + F (Quito)"
        tiemposCanon={tiemposCanon}
        tiempoConsumidoAnterior={{}}
        onComputedDataReady={setComputedDataEXF}
        maxExtrasHoras={maxExtrasHoras}
        horasExtrasFin={horasExtrasFin}
        isCentro1000={true}
        showSaldos={true}
        trasladosViables={[]} // C1000 no recibe traslados
      />
    </div>
  );
};
