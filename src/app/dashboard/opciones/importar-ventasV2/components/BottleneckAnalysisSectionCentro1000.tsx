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

  const obtenerTiempoDisp = (mes: string, linea: string, puesto: string | null, centro: string = '') => {
    const tc = buscarTiempoCanon(mes);
    if (!tc || !tc.data || !Array.isArray(tc.data)) return null;

    const lineaNorm = normalizarLinea(linea);
    const centroCodigo = String(centro).trim();
    
    // Primero filtrar por línea Y centro
    let registrosLinea = tc.data.filter((item: any) => {
      const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
      const itemCentro = String(item?.centro ?? item?.Centro ?? '');
      const lineaMatches = nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      const centroMatches = centroCodigo === '' || itemCentro === centroCodigo;
      return lineaMatches && centroMatches;
    });
    
    // Si no encontramos registros CON centro específico, intentar sin el filtro de centro
    if (registrosLinea.length === 0 && centroCodigo !== '') {
      registrosLinea = tc.data.filter((item: any) => {
        const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
        return nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      });
    }

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
            minutos_horario_normal: safeNumber(dp?.minutos_horario_normal_TOTAL ?? 0),
            minutos_con_extras: safeNumber(dp?.minutos_extras_TOTAL ?? 0),
            minutos_fin_semana: safeNumber(dp?.minutos_sabado_TOTAL ?? 0),
            diasLaborables: tc.diasLaborables,
            diasSabados: tc.diasSabados
          };
        }
      }
      return null;
    }

    // Sumar todos los tiempos de las estaciones de esa línea
    // NOTA: Esta lógica ha sido CORREGIDA (antes sumaba todos)
    // Ahora: Identificar el puesto de botella (el que MÁS se repite) y usar SOLO su tiempo
    
    // Contar frecuencia de estaciones en los registros de la línea
    const estacionesMap = new Map<string, any>();
    registrosLinea.forEach((dato: any) => {
      const nombreEstacion = String(dato?.nombre_estacion ?? '-');
      if (!estacionesMap.has(nombreEstacion)) {
        estacionesMap.set(nombreEstacion, {
          count: 0,
          dato: dato
        });
      }
      const current = estacionesMap.get(nombreEstacion)!;
      current.count += 1;
    });

    // Encontrar estación con mayor frecuencia (cuello de botella)
    let maxFrequencia = 0;
    let puestoBotellaDato: any = null;
    estacionesMap.forEach(({ count, dato }) => {
      if (count > maxFrequencia) {
        maxFrequencia = count;
        puestoBotellaDato = dato;
      }
    });

    // Si no encontramos puesto de botella, retornar null
    if (!puestoBotellaDato) {
      console.warn(`[obtenerTiempoDisp Centro1000] No se encontró puesto de botella para Línea: ${linea}, Mes: ${mes}`);
      return null;
    }

    // Usar SOLO el tiempo del puesto de botella con minutos_horario_normal_TOTAL (consistente con Centro 2000)
    const minutos_horario_normal = safeNumber(puestoBotellaDato?.minutos_horario_normal_TOTAL ?? 0);
    const minutos_con_extras = safeNumber(puestoBotellaDato?.minutos_extras_TOTAL ?? 0);
    const minutos_fin_semana = safeNumber(puestoBotellaDato?.minutos_sabado_TOTAL ?? 0);

    console.log(`[obtenerTiempoDisp-CORREGIDO Centro1000] Mes: ${mes}, Centro: ${centro}, Línea: ${linea}, Puesto Botella: ${puestoBotellaDato?.nombre_estacion}`, {
      minutos_horario_normal,
      minutos_con_extras,
      minutos_fin_semana,
      frecuencia: maxFrequencia,
      totalEstacionesEnLinea: estacionesMap.size
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

  // Paso previo: calcular suma de T. Total Necesidad Inicial por (mes, línea)
  // y obtener el T. Disponible global (minutos_horario_normal_TOTAL) por (mes, línea)
  const sumaTiempoNecPorLinea: { [k: string]: number } = {};
  const tiempoDispGlobalPorLinea: { [k: string]: number } = {};

  filteredDataCentro1000.forEach(row => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const key = `${mes}|${linea}`;
    const codMaterial = String(row.CodMaterial ?? '');
    const traslado = trasladosMap.get(codMaterial) || 0;
    const necesidadTotal = computeNec(row) + traslado;
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    const tiempoTotalNecesidad = tiempoUnitarioPorPuesto * necesidadTotal;

    sumaTiempoNecPorLinea[key] = (sumaTiempoNecPorLinea[key] || 0) + tiempoTotalNecesidad;

    // Obtener T. Disponible global solo una vez por línea
    if (tiempoDispGlobalPorLinea[key] === undefined) {
      const tiempoDisp = obtenerTiempoDisp(mes, linea, row.PuestoCuellodeBottella, row.Centro);
      tiempoDispGlobalPorLinea[key] = tiempoDisp?.minutos_horario_normal ?? 0;
    }
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
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    // T. Total necesidad inicial = (Tiempo Unitarío / Puestos) * Necesidades
    const tiempoTotalNecesidad = tiempoUnitarioPorPuesto * necesidadTotal;
    const tiempoDisp = obtenerTiempoDisp(mes, linea, row.PuestoCuellodeBottella, row.Centro);

    let necesidadMaximaAFabricar = 0;
    let horasExtrasUsadas = 0;
    let tMaxProm = 0;
    let tiempoParaMaterial = 0;

    if (tiempoDisp && tiempoPorUnidad > 0) {
      const tiempoDisponibleBase = tiempoDisp.minutos_horario_normal;
      
      // Calcular tiempo disponible para este material según su participación con base en horario normal
      tiempoParaMaterial = (participacionIndividual / 100) * tiempoDisponibleBase;
      
      // Decisión GLOBAL: comparar suma de T. Total Necesidad Inicial de TODA la línea vs T. Disponible global
      const sumaTiempoNecLinea = sumaTiempoNecPorLinea[key] || 0;
      const tiempoDispGlobal = tiempoDispGlobalPorLinea[key] || 0;
      
      if (sumaTiempoNecLinea <= tiempoDispGlobal) {
        // Si el tiempo total de toda la línea cabe en el disponible => fabricar todo
        necesidadMaximaAFabricar = necesidadTotal;
      } else {
        // Si no alcanza: Necesidad Requerida = T. Disponible (por material) / (Tiempo Unitario / Puestos)
        necesidadMaximaAFabricar = tiempoUnitarioPorPuesto > 0 
          ? Math.floor(tiempoParaMaterial / tiempoUnitarioPorPuesto) 
          : 0;
      }

      // Calcular Tiempo Requerido: (Tiempo Unitarío / Puestos) * (Necesidad Requerida)
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
      participacionIndividual,  // Mantener como número
      tiempoTotalNecesidad,
      tiempoParaMaterial,
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
