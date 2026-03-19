'use client';

import React, { useRef, useMemo } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber } from './utils';
import { TiempoCanonResult, TransferNeed } from './types';
import { Centro1000SummaryTable } from './Centro1000SummaryTable';
import { Centro1000DetailTable, Centro1000DetailTableHandle } from './Centro1000DetailTable';

interface BottleneckAnalysisSectionCentro1000Props {
  data: any[];
  tiemposCanon: TiempoCanonResult[];
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
  trasladosDesdeCentro2000: TransferNeed[];
}

export const BottleneckAnalysisSectionCentro1000: React.FC<BottleneckAnalysisSectionCentro1000Props> = ({ 
  data, 
  tiemposCanon, 
  numMaximoSabados, 
  maxExtrasHoras, 
  horasTrabajo, 
  horasExtrasFin, 
  trasladosDesdeCentro2000 
}) => {
  const detailTableRef = useRef<Centro1000DetailTableHandle>(null);
  const filteredDataCentro1000 = data.filter(row => 
    String(row.CentroFabricacion || row.Centro || '') === '1000'
  );

  if (data.length === 0) {
    return <div className="p-4 text-center text-gray-600">Carga datos primero desde la pestaña "Datos del Backend - Necesidades"</div>;
  }

  if (filteredDataCentro1000.length === 0) {
    return <div className="p-4 text-center text-gray-600">No hay datos para el Centro 1000</div>;
  }

  const trasladosMap = new Map<string, number>();
  trasladosDesdeCentro2000.forEach(item => {
    trasladosMap.set(item.CodMaterial, item.necesidadTraslado);
  });

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
    }
    return found || null;
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

  const mapa: { [k: string]: number } = {};
  filteredDataCentro1000.forEach(row => {
    const k = `${String(row.Mes ?? 'Sin mes')}|${String(row.LineaFabricacion ?? 'Sin línea')}`;
    const codMaterial = String(row.CodMaterial ?? '');
    const traslado = trasladosMap.get(codMaterial) || 0;
    const necesidadTotal = computeNec(row) + traslado;
    mapa[k] = (mapa[k] || 0) + necesidadTotal;
  });

  const datosEnriquecidos = filteredDataCentro1000.map(row => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const key = `${mes}|${linea}`;
    const codMaterial = String(row.CodMaterial ?? '');
    const traslado = trasladosMap.get(codMaterial) || 0;
    const necesidadPropia = computeNec(row);
    const necesidadTotal = necesidadPropia + traslado;
    const sumaNecLinea = mapa[key] ?? necesidadTotal;
    const participacionIndividual = sumaNecLinea > 0 ? (necesidadTotal / sumaNecLinea) * 100 : 0;
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const tiempoTotalNecesidad = necesidadTotal * tiempoPorUnidad;
    const tiempoDisp = obtenerTiempoDisp(mes, linea, row.PuestoCuellodeBottella);

    let necesidadMaximaAFabricar = 0;
    let horasExtrasUsadas = 0;
    let tMaxProm = 0;

    if (tiempoDisp && tiempoPorUnidad > 0) {
      const techoAbsoluto = tiempoDisp.minutos_con_extras + tiempoDisp.minutos_fin_semana;
      const tiempoMaxDisp = techoAbsoluto;
      const tiempoParaMaterial = (participacionIndividual / 100) * tiempoMaxDisp;
      necesidadMaximaAFabricar = Math.min(necesidadTotal, Math.floor(tiempoParaMaterial / tiempoPorUnidad));

      // Calcular T.MAX PROM: (T/U÷Puestos) * (Nec. Máx)
      const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
      const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
      tMaxProm = tiempoUnitarioPorPuesto * necesidadMaximaAFabricar;

      const tiempoNormalRest = tiempoDisp.minutos_horario_normal;
      const tiempoNormalParaMaterial = (participacionIndividual / 100) * tiempoNormalRest;
      const tiempoRealUsado = Math.min(necesidadTotal, necesidadMaximaAFabricar) * tiempoPorUnidad;
      if (tiempoRealUsado > tiempoNormalParaMaterial) {
        horasExtrasUsadas = (tiempoRealUsado - tiempoNormalParaMaterial) / 60;
      }
    }

    return {
      ...row,
      trasladoDesde2000: traslado,
      necesidadPropia,
      necesidadTotal,
      participacionIndividual: participacionIndividual.toFixed(2),
      tiempoTotalNecesidad,
      necesidadMaximaAFabricar,
      tMaxProm,
      horasExtrasUsadas: horasExtrasUsadas.toFixed(2),
      mesRef: mes,
      lineaRef: linea
    };
  });

  return (
    <div>
      <div className="mb-6 p-4 bg-teal-50 border border-teal-200 rounded-lg">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h4 className="font-semibold text-teal-800">Centro 1000</h4>
            <p className="text-sm text-teal-700 mt-1">
              Este análisis incluye las necesidades propias del centro 1000 más los traslados 
              requeridos desde el centro 2000 (materiales que no pudieron fabricarse completamente en el centro 2000).
            </p>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800">
                Traslados: <strong className="ml-1">{trasladosDesdeCentro2000.length}</strong> materiales
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-orange-100 text-orange-800">
                Total unidades: <strong className="ml-1">{trasladosDesdeCentro2000.reduce((sum, t) => sum + t.necesidadTraslado, 0).toLocaleString()}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      <Centro1000SummaryTable 
        datosEnriquecidos={datosEnriquecidos}
        tiemposCanon={tiemposCanon}
        numMaximoSabados={numMaximoSabados}
        maxExtrasHoras={maxExtrasHoras}
        horasTrabajo={horasTrabajo}
        horasExtrasFin={horasExtrasFin}
      />
      
      <Centro1000DetailTable 
        datos={filteredDataCentro1000}
        tiemposCanon={tiemposCanon}
        trasladosDesdeCentro2000={trasladosDesdeCentro2000}
      />
    </div>
  );
};
