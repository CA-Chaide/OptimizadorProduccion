'use client';

import React, { useState, useMemo } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, exportToXLSX } from './utils';
import { TiempoCanonResult, TransferNeed } from './types';
import { BottleneckSummaryTable } from './BottleneckSummaryTable';
import { BottleneckClassTable } from './BottleneckClassTable';

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
  // === HOOKS (antes de cualquier early return) ===
  const [transferNeeds, setTransferNeeds] = useState<TransferNeed[]>([]);
  const [computedDataC1000, setComputedDataC1000] = useState<any[]>([]);

  // Mapa de traslados: déficit general de E/X + necesidad completa de F (desde Centro 2000)
  const trasladosMap = useMemo(() => {
    const map = new Map<string, number>();
    trasladosDesdeCentro2000.forEach(item => {
      map.set(item.CodMaterial, (map.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });
    return map;
  }, [trasladosDesdeCentro2000]);

  // Filtrar Centro 1000 aplicando TRIM para evitar fallos por espacios
  const filteredDataCentro1000 = useMemo(() => {
    const rawRows = data
      .filter(row => {
        const cFab = String(row.CentroFabricacion || '').trim();
        const cDem = String(row.Centro || '').trim();
        return cFab === '1000' || (cFab === '' && cDem === '1000');
      })
      .map(row => ({ ...row, Centro: '' })); 

    // Agregación por material
    const porMaterial = new Map<string, any>();
    rawRows.forEach(row => {
      const cod = String(row.CodMaterial ?? '');
      if (!porMaterial.has(cod)) {
        porMaterial.set(cod, { ...row, UnidadesProyectado: 0 });
      }
      const agg = porMaterial.get(cod)!;
      agg.UnidadesProyectado = safeNumber(agg.UnidadesProyectado) + safeNumber(row.UnidadesProyectado ?? 0);
    });

    return Array.from(porMaterial.values());
  }, [data]);

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

  const normalizarLinea = (linea: string): string => {
    return String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
  };

  const obtenerTiempoDisp = (mes: string, linea: string, puesto: string | null, centro: string = '') => {
    const tc = buscarTiempoCanon(mes);
    if (!tc || !tc.data || !Array.isArray(tc.data)) return null;

    const lineaNorm = normalizarLinea(linea);
    const centroCodigo = String(centro).trim();
    
    let registrosLinea = tc.data.filter((item: any) => {
      const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
      const itemCentro = String(item?.centro ?? item?.Centro ?? '');
      const lineaMatches = nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      const centroMatches = centroCodigo === '' || itemCentro === centroCodigo;
      return lineaMatches && centroMatches;
    });
    
    if (registrosLinea.length === 0 && centroCodigo !== '') {
      registrosLinea = tc.data.filter((item: any) => {
        const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
        return nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      });
    }

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

    let puestoBotellaDato: any = null;
    if (puesto && puesto !== '-' && puesto !== '') {
      const pn = String(puesto).toLowerCase().trim();
      puestoBotellaDato = registrosLinea.find((dato: any) => {
        const nombreEstacion = String(dato?.nombre_estacion ?? '').toLowerCase().trim();
        return nombreEstacion === pn || nombreEstacion.includes(pn) || pn.includes(nombreEstacion);
      }) ?? null;
    }

    if (!puestoBotellaDato) {
      const estacionesMap = new Map<string, any>();
      registrosLinea.forEach((dato: any) => {
        const nombreEstacion = String(dato?.nombre_estacion ?? '-');
        if (!estacionesMap.has(nombreEstacion)) {
          estacionesMap.set(nombreEstacion, { count: 0, dato });
        }
        estacionesMap.get(nombreEstacion)!.count += 1;
      });
      let maxFrequencia = 0;
      estacionesMap.forEach(({ count, dato }) => {
        if (count > maxFrequencia) { maxFrequencia = count; puestoBotellaDato = dato; }
      });
    }

    if (!puestoBotellaDato) return null;

    return {
      minutos_horario_normal: safeNumber(puestoBotellaDato?.minutos_horario_normal_TOTAL ?? 0),
      minutos_con_extras: safeNumber(puestoBotellaDato?.minutos_extras_TOTAL ?? 0),
      minutos_fin_semana: safeNumber(puestoBotellaDato?.minutos_sabado_TOTAL ?? 0),
      diasLaborables: tc.diasLaborables,
      diasSabados: tc.diasSabados
    };
  };

  const datosEnriquecidos = useMemo(() => {
    const mapa: { [k: string]: number } = {};
    filteredDataCentro1000.forEach(row => {
      const k = `${String(row.Mes ?? 'Sin mes')}|${String(row.LineaFabricacion ?? 'Sin línea')}`;
      const codMaterial = String(row.CodMaterial ?? '');
      const traslado = trasladosMap.get(codMaterial) || 0;
      const necesidadTotal = computeNec(row) + traslado;
      mapa[k] = (mapa[k] || 0) + necesidadTotal;
    });

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
      sumaTiempoNecPorLinea[key] = (sumaTiempoNecPorLinea[key] || 0) + (tiempoUnitarioPorPuesto * necesidadTotal);

      if (tiempoDispGlobalPorLinea[key] === undefined) {
        const tiempoDisp = obtenerTiempoDisp(mes, linea, row.PuestoCuellodeBottella, row.Centro);
        tiempoDispGlobalPorLinea[key] = tiempoDisp?.minutos_horario_normal ?? 0;
      }
    });

    return filteredDataCentro1000.map(row => {
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
      const tiempoDisp = obtenerTiempoDisp(mes, linea, row.PuestoCuellodeBottella, row.Centro);

      let necesidadMaximaAFabricar = 0;
      let tMaxProm = 0;
      let tiempoParaMaterial = 0;

      if (tiempoDisp && tiempoPorUnidad > 0) {
        const tiempoDisponibleBase = tiempoDisp.minutos_horario_normal;
        tiempoParaMaterial = (participacionIndividual / 100) * tiempoDisponibleBase;
        
        const sumaTiempoNecLinea = sumaTiempoNecPorLinea[key] || 0;
        const tiempoDispGlobal = tiempoDispGlobalPorLinea[key] || 0;
        
        if (sumaTiempoNecLinea <= tiempoDispGlobal) {
          necesidadMaximaAFabricar = necesidadTotal;
        } else {
          necesidadMaximaAFabricar = tiempoUnitarioPorPuesto > 0 
            ? Math.floor(tiempoParaMaterial / tiempoUnitarioPorPuesto) 
            : 0;
        }
        tMaxProm = tiempoUnitarioPorPuesto * necesidadMaximaAFabricar;
      }

      return {
        ...row,
        trasladoDesde2000: traslado,
        necesidadPropia,
        necesidadTotal,
        participacionIndividual,
        tiempoTotalNecesidad: tiempoUnitarioPorPuesto * necesidadTotal,
        tiempoParaMaterial,
        necesidadMaximaAFabricar,
        tMaxProm,
        horasExtrasUsadas: '0.00',
        mesRef: mes,
        lineaRef: linea
      };
    });
  }, [filteredDataCentro1000, trasladosMap, tiemposCanon]);

  const exportSheetC1000 = useMemo(() => {
    const result: any[] = [];
    const sum = (arr: any[], field: string) => arr.reduce((s: number, r: any) => s + safeNumber(r[field] ?? 0), 0);

    const grouped: { [k: string]: any[] } = {};
    datosEnriquecidos.forEach((row: any) => {
      const linea = String(row.lineaRef || 'Sin línea');
      if (!grouped[linea]) grouped[linea] = [];
      grouped[linea].push(row);
    });
    const lineasOrd = Object.keys(grouped).sort();

    lineasOrd.forEach(linea => {
      const fl = grouped[linea];
      fl.forEach((row: any) => {
        const numeroPuestos = Math.max(1, safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1));
        const tupp = safeNumber(row.TiempoPorUnidad ?? 0) / numeroPuestos;
        const deficit = Math.max(0, safeNumber(row.necesidadTotal ?? 0) - safeNumber(row.necesidadMaximaAFabricar ?? 0));
        result.push({
          'CodMaterial': row.CodMaterial ?? '',
          'Descripcion': row.Descripcion || row.NombreMaterial || row.CodMaterial || '',
          'Linea': row.lineaRef || row.LineaFabricacion || '',
          'Puesto': row.PuestoCuellodeBottella || '',
          'N.Puestos': safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 0),
          'Sector': row.Sector || '',
          'Responsable': row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '',
          'T.Unit/Puestos': tupp,
          'Traslado C.2000': safeNumber(row.trasladoDesde2000 ?? 0),
          'Nec. Propia': safeNumber(row.necesidadPropia ?? 0),
          'Necesidad Total': safeNumber(row.necesidadTotal ?? 0),
          'T.Total Nec': safeNumber(row.tiempoTotalNecesidad ?? 0),
          'Partic.%': safeNumber(row.participacionIndividual ?? 0),
          'T.Disponible': safeNumber(row.tiempoParaMaterial ?? 0),
          'Máx.Producir': safeNumber(row.necesidadMaximaAFabricar ?? 0),
          'Déficit General': deficit,
        });
      });
    });

    return result;
  }, [datosEnriquecidos]);

  if (data.length === 0) {
    return <div className="p-4 text-center text-gray-600">Carga datos primero desde la pestaña "Datos del Backend - Necesidades"</div>;
  }

  if (filteredDataCentro1000.length === 0) {
    return <div className="p-4 text-center text-gray-600">No hay datos para el Centro 1000</div>;
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => exportToXLSX(exportSheetC1000, 'Analisis_Centro1000')}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 border border-teal-700 rounded-lg hover:bg-teal-700 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Descargar Excel (Todo Centro 1000)
        </button>
      </div>

      <BottleneckSummaryTable 
        datosEnriquecidosE={datosEnriquecidos}
        datosEnriquecidosX={[]}
        datosCalculados={computedDataC1000}
        tiemposCanon={tiemposCanon}
        numMaximoSabados={numMaximoSabados}
        maxExtrasHoras={maxExtrasHoras}
        horasTrabajo={horasTrabajo}
        horasExtrasFin={horasExtrasFin}
        centroLabel="Centro 1000"
        isCentro1000={true}
      />
      
      <BottleneckClassTable 
        datos={filteredDataCentro1000}
        datosCompletos={filteredDataCentro1000}
        titulo="Centro 1000 - Análisis de Cuello de Botella"
        tiemposCanon={tiemposCanon}
        tiempoConsumidoAnterior={{}}
        onTransferNeedsCalculated={setTransferNeeds}
        onComputedDataReady={setComputedDataC1000}
        maxExtrasHoras={maxExtrasHoras}
        horasExtrasFin={horasExtrasFin}
        trasladosDesdeCentro2000={trasladosDesdeCentro2000}
        isCentro1000={true}
      />
    </div>
  );
};
