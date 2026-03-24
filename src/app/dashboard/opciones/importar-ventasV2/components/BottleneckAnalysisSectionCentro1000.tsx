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

  // Mapa de traslados: déficit general de E/X + necesidad completa de F (desde Centro 2000)
  const trasladosMap = useMemo(() => {
    const map = new Map<string, number>();
    trasladosDesdeCentro2000.forEach(item => {
      map.set(item.CodMaterial, (map.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });

    // === LOG DIAGNÓSTICO: lo que RECIBE Centro 1000 ===
    const totalRecibido = Array.from(map.values()).reduce((s, v) => s + v, 0);
    console.log('%c\n========================================', 'color: #2ecc71; font-weight: bold;');
    console.log('%c  CENTRO 1000: TRASLADOS RECIBIDOS', 'color: #2ecc71; font-weight: bold; font-size: 14px;');
    console.log('%c========================================', 'color: #2ecc71; font-weight: bold;');
    console.log(`Materiales recibidos: ${map.size} | Total unidades: ${totalRecibido}`);
    console.table(Array.from(map.entries()).map(([k, v]) => ({ CodMaterial: k, Traslado: v })));

    return map;
  }, [trasladosDesdeCentro2000]);

  // Filtrar Centro 1000 (todos los materiales juntos, sin separación por clase)
  // IMPORTANTE: Los tiemposCanon son los mismos del centro 2000, por lo que
  // limpiamos el campo Centro para que la búsqueda en tiemposCanon no filtre por centro
  // y simplemente busque por nombre de línea.
  // AGREGACIÓN: Un material puede aparecer en múltiples meses. Se agrupan por CodMaterial
  // sumando UnidadesProyectado y usando StockActual/StockSeguridad del primer registro
  // (son valores por material, no por mes). Así se obtiene una fila por material.
  const filteredDataCentro1000 = useMemo(() => {
    const rawRows = data
      .filter(row => String(row.CentroFabricacion || row.Centro || '') === '1000')
      .map(row => ({ ...row, Centro: '' })); // tiemposCanon aplican igual para C1000

    // Agrupar por CodMaterial
    const porMaterial = new Map<string, any>();
    rawRows.forEach(row => {
      const cod = String(row.CodMaterial ?? '');
      if (!porMaterial.has(cod)) {
        // Primera aparición: guardar fila base con UP=0, la sumamos abajo
        porMaterial.set(cod, { ...row, UnidadesProyectado: 0 });
      }
      const agg = porMaterial.get(cod)!;
      // Sumar la demanda de cada mes
      agg.UnidadesProyectado = safeNumber(agg.UnidadesProyectado) + safeNumber(row.UnidadesProyectado ?? 0);
      // StockActual y StockSeguridad son por material (no por mes): conservar del primer registro
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

    // Buscar primero el registro que coincida exactamente con el puesto de cuello de botella
    let puestoBotellaDato: any = null;
    if (puesto && puesto !== '-' && puesto !== '') {
      const pn = String(puesto).toLowerCase().trim();
      puestoBotellaDato = registrosLinea.find((dato: any) => {
        const nombreEstacion = String(dato?.nombre_estacion ?? '').toLowerCase().trim();
        return nombreEstacion === pn || nombreEstacion.includes(pn) || pn.includes(nombreEstacion);
      }) ?? null;
    }

    // Si no se encontró por nombre directo, usar frecuencia como fallback
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
    });

    return {
      minutos_horario_normal,
      minutos_con_extras,
      minutos_fin_semana,
      diasLaborables: tc.diasLaborables,
      diasSabados: tc.diasSabados
    };
  };

  // === ENRIQUECIMIENTO PARA TABLA RESUMEN (useMemo) ===
  const datosEnriquecidos = useMemo(() => {
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
      // Horas extras temporalmente deshabilitadas (se mantiene valor 0)
      const tiempoRealUsado = Math.min(necesidadTotal, necesidadMaximaAFabricar) * tiempoPorUnidad;
      horasExtrasUsadas = 0;
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
  }, [filteredDataCentro1000, trasladosMap, tiemposCanon]);

  // === LOG DIAGNÓSTICO: Asignación final en Centro 1000 ===
  useMemo(() => {
    if (datosEnriquecidos.length === 0 || trasladosMap.size === 0) return;
    const materialesC1000 = new Set(datosEnriquecidos.map((r: any) => String(r.CodMaterial ?? '')));
    const materialesTraslado = new Set(trasladosMap.keys());

    // Materiales que se recibieron como traslado pero NO existen en Centro 1000
    const huerfanos: { CodMaterial: string; Traslado: number }[] = [];
    const asignados: { CodMaterial: string; NecPropia: number; Traslado: number; NecTotal: number }[] = [];
    let totalTrasladoAsignado = 0;
    let totalTrasladoHuerfano = 0;

    materialesTraslado.forEach(cod => {
      const traslado = trasladosMap.get(cod) || 0;
      if (!materialesC1000.has(cod)) {
        huerfanos.push({ CodMaterial: cod, Traslado: traslado });
        totalTrasladoHuerfano += traslado;
      } else {
        const row = datosEnriquecidos.find((r: any) => String(r.CodMaterial) === cod);
        asignados.push({
          CodMaterial: cod,
          NecPropia: row?.necesidadPropia ?? 0,
          Traslado: traslado,
          NecTotal: row?.necesidadTotal ?? 0,
        });
        totalTrasladoAsignado += traslado;
      }
    });

    console.log('%c\n========================================', 'color: #3498db; font-weight: bold;');
    console.log('%c  CENTRO 1000: RESULTADO ASIGNACI\u00d3N', 'color: #3498db; font-weight: bold; font-size: 14px;');
    console.log('%c========================================', 'color: #3498db; font-weight: bold;');
    console.log(`Materiales en C1000: ${materialesC1000.size}`);
    console.log(`Traslados recibidos: ${materialesTraslado.size} materiales`);
    console.log(`%c\u2714 Asignados correctamente: ${asignados.length} materiales, ${totalTrasladoAsignado} unidades`, 'color: #2ecc71;');
    if (asignados.length > 0) console.table(asignados.slice(0, 30));
    if (huerfanos.length > 0) {
      console.log(`%c\u2718 HU\u00c9RFANOS (traslado recibido pero material NO existe en C1000): ${huerfanos.length} materiales, ${totalTrasladoHuerfano} unidades`, 'color: #e74c3c; font-weight: bold;');
      console.table(huerfanos);
    } else {
      console.log('%c\u2714 Sin materiales hu\u00e9rfanos \u2014 todos los traslados tienen destino en C1000', 'color: #2ecc71;');
    }

    // Resumen por sector
    const porSector: { [sector: string]: { necPropia: number; traslado: number; necTotal: number; materiales: number } } = {};
    datosEnriquecidos.forEach((row: any) => {
      const sector = String(row.Sector || 'Sin sector').trim();
      if (!porSector[sector]) porSector[sector] = { necPropia: 0, traslado: 0, necTotal: 0, materiales: 0 };
      porSector[sector].necPropia += row.necesidadPropia ?? 0;
      porSector[sector].traslado += row.trasladoDesde2000 ?? 0;
      porSector[sector].necTotal += row.necesidadTotal ?? 0;
      porSector[sector].materiales++;
    });
    console.log('\nResumen por SECTOR en Centro 1000:');
    console.table(porSector);

    const totalNecPropia = datosEnriquecidos.reduce((s: number, r: any) => s + (r.necesidadPropia ?? 0), 0);
    const totalTraslado = datosEnriquecidos.reduce((s: number, r: any) => s + (r.trasladoDesde2000 ?? 0), 0);
    const totalNecTotal = datosEnriquecidos.reduce((s: number, r: any) => s + (r.necesidadTotal ?? 0), 0);
    console.log(`%cTOTALES C1000: NecPropia=${totalNecPropia} | Traslado=${totalTraslado} | NecTotal=${totalNecTotal}`, 'font-weight: bold;');
    console.log(`%cTraslado recibido=${Array.from(trasladosMap.values()).reduce((s, v) => s + v, 0)} | Asignado=${totalTrasladoAsignado} | Hu\u00e9rfano=${totalTrasladoHuerfano}`, 'font-weight: bold;');
    console.log('%c========================================\n', 'color: #3498db; font-weight: bold;');
  }, [datosEnriquecidos, trasladosMap]);

  // Estructura de Excel: lee datosEnriquecidos COMPLETO (sin filtros).
  // A diferencia del botón dentro de BottleneckClassTable, este exporta todo.
  const exportSheetC1000 = useMemo(() => {
    const result: any[] = [];
    const sum = (arr: any[], field: string) => arr.reduce((s: number, r: any) => s + safeNumber(r[field] ?? 0), 0);

    // Agrupar por lineaRef (igual que la tabla)
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
      // Subtotal por línea
      const totalNec = sum(fl, 'necesidadTotal');
      const totalMaxProd = sum(fl, 'necesidadMaximaAFabricar');
      result.push({
        'CodMaterial': `** Subtotal ${linea} **`,
        'Descripcion': '', 'Linea': linea, 'Puesto': '', 'N.Puestos': '', 'Sector': '', 'Responsable': '', 'T.Unit/Puestos': '',
        'Traslado C.2000': sum(fl, 'trasladoDesde2000'),
        'Nec. Propia': sum(fl, 'necesidadPropia'),
        'Necesidad Total': totalNec,
        'T.Total Nec': sum(fl, 'tiempoTotalNecesidad'),
        'Partic.%': '-',
        'T.Disponible': sum(fl, 'tiempoParaMaterial'),
        'Máx.Producir': totalMaxProd,
        'Déficit General': Math.max(0, totalNec - totalMaxProd),
      });
    });

    // TOTAL GENERAL
    const totalNecGlobal = sum(datosEnriquecidos, 'necesidadTotal');
    const totalMaxProdGlobal = sum(datosEnriquecidos, 'necesidadMaximaAFabricar');
    result.push({
      'CodMaterial': `*** TOTAL GENERAL (${datosEnriquecidos.length} registros) ***`,
      'Descripcion': '', 'Linea': '', 'Puesto': '', 'N.Puestos': '', 'Sector': '', 'Responsable': '', 'T.Unit/Puestos': '',
      'Traslado C.2000': sum(datosEnriquecidos, 'trasladoDesde2000'),
      'Nec. Propia': sum(datosEnriquecidos, 'necesidadPropia'),
      'Necesidad Total': totalNecGlobal,
      'T.Total Nec': sum(datosEnriquecidos, 'tiempoTotalNecesidad'),
      'Partic.%': '-',
      'T.Disponible': sum(datosEnriquecidos, 'tiempoParaMaterial'),
      'Máx.Producir': totalMaxProdGlobal,
      'Déficit General': Math.max(0, totalNecGlobal - totalMaxProdGlobal),
    });

    return result;
  }, [datosEnriquecidos]);

  // === EARLY RETURNS ===
  if (data.length === 0) {
    return <div className="p-4 text-center text-gray-600">Carga datos primero desde la pestaña "Datos del Backend - Necesidades"</div>;
  }

  if (filteredDataCentro1000.length === 0) {
    return <div className="p-4 text-center text-gray-600">No hay datos para el Centro 1000</div>;
  }

  return (
    <div>
      {/* Botón descarga global: exporta todo datosEnriquecidos, sin filtros */}
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

      {/* Tabla resumen por línea */}
      <BottleneckSummaryTable 
        datosEnriquecidosE={datosEnriquecidos}
        datosEnriquecidosX={[]}
        tiemposCanon={tiemposCanon}
        numMaximoSabados={numMaximoSabados}
        maxExtrasHoras={maxExtrasHoras}
        horasTrabajo={horasTrabajo}
        horasExtrasFin={horasExtrasFin}
        centroLabel="Centro 1000"
      />
      
      {/* Tabla detalle única (todos los materiales, sin separación por clase) */}
      <BottleneckClassTable 
        datos={filteredDataCentro1000}
        datosCompletos={filteredDataCentro1000}
        titulo="Centro 1000 - Análisis de Cuello de Botella"
        tiemposCanon={tiemposCanon}
        tiempoConsumidoAnterior={{}}
        onTransferNeedsCalculated={setTransferNeeds}
        maxExtrasHoras={maxExtrasHoras}
        horasExtrasFin={horasExtrasFin}
        trasladosDesdeCentro2000={trasladosDesdeCentro2000}
      />
    </div>
  );
};
