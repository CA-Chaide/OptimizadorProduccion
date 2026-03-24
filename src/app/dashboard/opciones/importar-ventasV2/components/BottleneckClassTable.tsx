'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, computeNecesidades, exportToXLSX } from './utils';
import { TiempoCanonResult, TransferNeed } from './types';

// Helpers para computar extras en memoria (sin localStorage)
function computarDetalleConsumoInMemoria(tc: TiempoCanonResult, minutosConsumir: number, maxExtrasHoras: number, horasExtrasFin: number): string {
  const semanasNorm = Math.floor((tc.diasLaborables ?? 0) / 5);
  const diasExtra = (tc.diasLaborables ?? 0) % 5;
  const diasSabados = tc.diasSabados ?? 0;
  let restantes = minutosConsumir;
  const partes: string[] = [];
  for (let i = 0; i < semanasNorm && restantes > 0; i++) {
    const minmax = 5 * maxExtrasHoras * 60;
    const minc = Math.min(minmax, restantes);
    if (minc > 0) { partes.push(`S${i+1}: ${(minc/60 % 1 === 0 ? minc/60 : (minc/60).toFixed(1))}h`); restantes -= minc; }
  }
  if (diasExtra > 0 && restantes > 0) {
    const minmax = diasExtra * maxExtrasHoras * 60;
    const minc = Math.min(minmax, restantes);
    if (minc > 0) { partes.push(`ExLV: ${(minc/60 % 1 === 0 ? minc/60 : (minc/60).toFixed(1))}h`); restantes -= minc; }
  }
  for (let i = 0; i < diasSabados && restantes > 0; i++) {
    const minmax = horasExtrasFin * 60;
    const minc = Math.min(minmax, restantes);
    if (minc > 0) { partes.push(`Sáb${i+1}: ${(minc/60 % 1 === 0 ? minc/60 : (minc/60).toFixed(1))}h`); restantes -= minc; }
  }
  return partes.join(', ') || '-';
}

interface BottleneckClassTableProps {
  datos: any[];
  datosCompletos: any[];
  titulo: string;
  tiemposCanon: TiempoCanonResult[];
  tiempoConsumidoAnterior?: { [mesLinea: string]: number };
  onTransferNeedsCalculated?: (transferNeeds: TransferNeed[]) => void;
  forzarTrasladoTotal?: boolean;
  maxExtrasHoras?: number;
  horasExtrasFin?: number;
}

export const BottleneckClassTable: React.FC<BottleneckClassTableProps> = ({ 
  datos, 
  datosCompletos, 
  titulo, 
  tiemposCanon, 
  tiempoConsumidoAnterior = {}, 
  onTransferNeedsCalculated,
  forzarTrasladoTotal = false,
  maxExtrasHoras = 2,
  horasExtrasFin = 2
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLinea, setSelectedLinea] = useState<string>('');
  const [selectedRespCtrlProd, setSelectedRespCtrlProd] = useState<string>('');

  const computeNecesidadesLocal = (row: any) => {
    const unidadesProy = safeNumber(row.UnidadesProyectado ?? 0);
    const stockSeg = safeNumber(row.StockSeguridad ?? 0);
    const stockAct = safeNumber(row.StockActual ?? 0);
    return Math.max(0, unidadesProy - stockAct + stockSeg);
  };

  const buscarTiempoCanonPorMes = (mesRaw: string) => {
    let found = tiemposCanon.find(t => t.mes === mesRaw);
    if (found) return found;
    
    const mesNum = parseInt(mesRaw);
    if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
      const mesNombre = MONTH_NAMES[mesNum];
      found = tiemposCanon.find(t => t.mes === mesNombre);
      if (found) return found;
      
      found = tiemposCanon.find(t => t.mesNumero === mesNum);
      if (found) return found;
    }
    
    return null;
  };

  // Mapa de agrupamiento calculado con useMemo
  const mapaAgrupamiento = useMemo(() => {
    const mapa: { [mesLinea: string]: { necesidades: number; count: number; mes: string; linea: string } } = {};
    
    datos.forEach(row => {
      const mes = String(row.Mes ?? 'Sin mes');
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${mes}|${linea}`;
      
      if (!mapa[key]) {
        mapa[key] = { necesidades: 0, count: 0, mes, linea };
      }
      
      const necesidad = computeNecesidadesLocal(row);
      mapa[key].necesidades += necesidad;
      mapa[key].count += 1;
    });
    
    return mapa;
  }, [datos]);

  // Función para normalizar nombres de líneas para comparación
  const normalizarLinea = (linea: string): string => {
    return String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
  };

  const obtenerTiempoDisponible = (mes: string, linea: string, puestoTrabajo: string | null, centro: string = '') => {
    const tiempoCanon = buscarTiempoCanonPorMes(mes);
    if (!tiempoCanon || !tiempoCanon.data || !Array.isArray(tiempoCanon.data)) {
      return null;
    }
    
    const lineaNorm = normalizarLinea(linea);
    const centroCodigo = String(centro).trim();
    
    // Primero filtrar por línea Y centro
    let registrosLinea = tiempoCanon.data.filter((item: any) => {
      const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
      const itemCentro = String(item?.centro ?? item?.Centro ?? '');
      const lineaMatches = nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      const centroMatches = centroCodigo === '' || itemCentro === centroCodigo;
      return lineaMatches && centroMatches;
    });
    
    // Si no encontramos registros CON centro específico, intentar sin el filtro de centro
    if (registrosLinea.length === 0 && centroCodigo !== '') {
      registrosLinea = tiempoCanon.data.filter((item: any) => {
        const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
        return nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      });
    }

    // Si no encontramos registros de la línea, intentar buscar por puesto en todos los datos
    if (registrosLinea.length === 0) {
      if (puestoTrabajo && puestoTrabajo !== '-' && puestoTrabajo !== '') {
        const pn = String(puestoTrabajo).toLowerCase().trim();
        const dp = tiempoCanon.data.find((item: any) => {
          const nombreEstacion = String(item?.nombre_estacion ?? '').toLowerCase().trim();
          return nombreEstacion.includes(pn) || pn.includes(nombreEstacion);
        });
        if (dp) {
          return {
            minutos_horario_normal: safeNumber(dp?.minutos_horario_normal_TOTAL ?? 0),
            minutos_con_extras: safeNumber(dp?.minutos_extras_TOTAL ?? 0),
            minutos_fin_semana: safeNumber(dp?.minutos_sabado_TOTAL ?? 0),
            minutos_horario_normal_total: safeNumber(dp?.minutos_horario_normal_TOTAL ?? 0),
            diasLaborables: tiempoCanon.diasLaborables,
            diasSabados: tiempoCanon.diasSabados
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
      console.warn(`[obtenerTiempoDisponible] No se encontró puesto de botella para Línea: ${linea}, Mes: ${mes}`);
      return null;
    }

    // Usar SOLO el tiempo del puesto de botella con minutos_horario_normal_TOTAL (mismo que BottleneckSummaryTable)
    const minutos_horario_normal = safeNumber(puestoBotellaDato?.minutos_horario_normal_TOTAL ?? 0);
    const minutos_con_extras = safeNumber(puestoBotellaDato?.minutos_extras_TOTAL ?? 0);
    const minutos_fin_semana = safeNumber(puestoBotellaDato?.minutos_sabado_TOTAL ?? 0);
    const minutos_horario_normal_total = safeNumber(puestoBotellaDato?.minutos_horario_normal_TOTAL ?? 0);

    console.log(`[obtenerTiempoDisponible-CORREGIDO] Mes: ${mes}, Centro: ${centro}, Línea: ${linea}, Puesto Botella: ${puestoBotellaDato?.nombre_estacion}`, {
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
      minutos_horario_normal_total,
      diasLaborables: tiempoCanon.diasLaborables,
      diasSabados: tiempoCanon.diasSabados
    };
  };

  // Paso previo: calcular suma de T. Total Necesidad Inicial por (mes, línea)
  // y obtener el T. Disponible global (minutos_horario_normal_TOTAL - consumo anterior) por (mes, línea)
  // También inicializar suma de Deficit Jornada Normal por línea
  const sumaTiempoNecPorLinea: { [k: string]: number } = {};
  const tiempoDispGlobalPorLinea: { [k: string]: number } = {};
  const poolMinutosHEPorLinea: { [k: string]: number } = {};
  const poolMinutosSabadosPorLinea: { [k: string]: number } = {};

  datos.forEach(row => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const key = `${mes}|${linea}`;
    const necesidad = computeNecesidadesLocal(row);
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    const tiempoTotalNecesidad = tiempoUnitarioPorPuesto * necesidad;

    sumaTiempoNecPorLinea[key] = (sumaTiempoNecPorLinea[key] || 0) + tiempoTotalNecesidad;

    if (tiempoDispGlobalPorLinea[key] === undefined) {
      const tiempoDisp = obtenerTiempoDisponible(mes, linea, row.PuestoCuellodeBottella, row.Centro);
      let tiempoConsumidoPrevio = tiempoConsumidoAnterior[key] || 0;
      if (tiempoConsumidoPrevio === 0 && Object.keys(tiempoConsumidoAnterior).length > 0) {
        const mesNum = parseInt(mes);
        const mesNombre = !isNaN(mesNum) && MONTH_NAMES[mesNum] ? MONTH_NAMES[mesNum] : mes;
        tiempoConsumidoPrevio = tiempoConsumidoAnterior[`${mesNombre}|${linea}`] || 
                                tiempoConsumidoAnterior[`${mesNum}|${linea}`] || 0;
      }
      const base = tiempoDisp?.minutos_horario_normal ?? 0;
      tiempoDispGlobalPorLinea[key] = Math.max(0, base - tiempoConsumidoPrevio);

      // Pools de minutos para horas extras (L-V) y sábados
      const diasLab = tiempoDisp?.diasLaborables ?? 0;
      const diasSab = tiempoDisp?.diasSabados ?? 0;
      poolMinutosHEPorLinea[key] = diasLab * maxExtrasHoras * 60;
      poolMinutosSabadosPorLinea[key] = diasSab * horasExtrasFin * 60;
    }
  });

  const enriquecerFila = (row: any) => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const key = `${mes}|${linea}`;
    const necesidad = computeNecesidadesLocal(row);
    
    const mapaLinea = mapaAgrupamiento[key];
    const sumaNecesidadesEnLinea = mapaLinea?.necesidades ?? necesidad;
    
    const participacionIndividual = sumaNecesidadesEnLinea > 0 
      ? (necesidad / sumaNecesidadesEnLinea) * 100 
      : 0;
    
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    
    // T. Total necesidad inicial = (Tiempo Unitarío / Puestos) * Necesidades
    const tiempoTotalNecesidad = tiempoUnitarioPorPuesto * necesidad;
    
    const tiempoDisp = obtenerTiempoDisponible(mes, linea, row.PuestoCuellodeBottella, row.Centro);
    
    let necesidadMaximaAFabricar = 0;
    let horasExtrasUsadas = 0;
    let tMaxProm = 0;
    let tiempoParaMaterial = 0;
    let minutosDisponiblesJornadaNormal = 0;
    let necesidadMaximaProducirJornadaNormal = 0;
    
    // Si forzarTrasladoTotal = true (ej. clase F), NO se fabrica nada: todo se traslada
    if (forzarTrasladoTotal) {
      necesidadMaximaAFabricar = 0;
      tMaxProm = 0;
      horasExtrasUsadas = 0;
    } else if (tiempoDisp && tiempoPorUnidad > 0) {
      // Obtener tiempo ya consumido por clases anteriores (ej: E consume antes que X)
      // Intentar con múltiples formatos de key para matches
      let tiempoConsumidoPrevio = tiempoConsumidoAnterior[key] || 0;
      
      // Si no encontramos con la key directa, buscar con el mes como número o nombre
      if (tiempoConsumidoPrevio === 0 && Object.keys(tiempoConsumidoAnterior).length > 0) {
        const mesNum = parseInt(mes);
        const mesNombre = !isNaN(mesNum) && MONTH_NAMES[mesNum] ? MONTH_NAMES[mesNum] : mes;
        const keyAlternativa1 = `${mesNombre}|${linea}`;
        const keyAlternativa2 = `${mesNum}|${linea}`;
        
        tiempoConsumidoPrevio = tiempoConsumidoAnterior[keyAlternativa1] || 
                                tiempoConsumidoAnterior[keyAlternativa2] || 0;
        
        console.log(`[BottleneckClassTable] Buscando tiempoConsumido:`, {
          keyOriginal: key,
          keyAlternativa1,
          keyAlternativa2,
          keysDisponibles: Object.keys(tiempoConsumidoAnterior),
          tiempoConsumidoPrevio
        });
      }
      
      // T. DISPONIBLE = (minutos_horario_normal - tiempo_consumido_anterior) × (participación / 100)
      const tiempoMaxDisponibleBase = tiempoDisp.minutos_horario_normal;
      const tiempoMaxDisponibleReal = Math.max(0, tiempoMaxDisponibleBase - tiempoConsumidoPrevio);
      tiempoParaMaterial = (participacionIndividual / 100) * tiempoMaxDisponibleReal;
      
      // MINUTOS DISPONIBLES EN JORNADA NORMAL = participacion × minutos_horario_normal_TOTAL
      minutosDisponiblesJornadaNormal = (participacionIndividual / 100) * tiempoMaxDisponibleBase;
      
      // REGLA GLOBAL (SIEMPRE SE APLICA): Comparar suma de T. Total Necesidad Inicial de TODA la línea vs T. Disponible base
      const sumaTiempoNecLinea = sumaTiempoNecPorLinea[key] || 0;
      
      if (sumaTiempoNecLinea <= tiempoMaxDisponibleBase) {
        // Si el tiempo total de toda la línea cabe en el disponible => fabricar todo
        necesidadMaximaAFabricar = necesidad;
      } else {
        // Si no alcanza: fabrico proporcional a mi participación en la jornada normal
        necesidadMaximaAFabricar = tiempoUnitarioPorPuesto > 0 
          ? Math.floor(minutosDisponiblesJornadaNormal / tiempoUnitarioPorPuesto) 
          : 0;
      }
      
      // Reutilizar sumaTiempoNecLinea y tiempoMaxDisponibleBase para la segunda regla
      if (sumaTiempoNecLinea <= tiempoMaxDisponibleBase) {
        // Si hay suficiente tiempo: fabrico mi necesidad completa
        necesidadMaximaProducirJornadaNormal = necesidad;
      } else {
        // Si NO hay suficiente: fabrico proporcional a mi participación
        necesidadMaximaProducirJornadaNormal = tiempoUnitarioPorPuesto > 0 
          ? Math.floor(minutosDisponiblesJornadaNormal / tiempoUnitarioPorPuesto)
          : 0;
      }
      
      // Calcular Tiempo Requerido: (Tiempo Unitarío / Puestos) * (Necesidad Requerida)
      tMaxProm = tiempoUnitarioPorPuesto * necesidadMaximaAFabricar;
      
      // Usar el tiempo disponible REAL (descontando consumo anterior) para calcular extras
      const tiempoNormalParaEsteMaterial = (participacionIndividual / 100) * tiempoMaxDisponibleReal;
      const tiempoRealUsado = Math.min(necesidad, necesidadMaximaAFabricar) * tiempoPorUnidad;
      
      // Horas extras temporalmente deshabilitadas (se mantiene valor 0)
      if (tiempoRealUsado > tiempoNormalParaEsteMaterial) {
        horasExtrasUsadas = 0;
      }
    }
    
    // DEFICIT JORNADA NORMAL = Necesidades - Necesidad Máxima a Producir Jornada Normal
    const deficitJornadaNormal = Math.max(0, necesidad - necesidadMaximaProducirJornadaNormal);
    
    // T. TOTAL NECESIDAD DEL DEFICIT JN = deficit × tiempoUnitarioPorPuesto
    const tiempoTotalNecesidadDeficitJN = deficitJornadaNormal * tiempoUnitarioPorPuesto;
    
    return {
      ...row,
      participacionIndividual,
      tiempoTotalNecesidad,
      tiempoUnitarioPorPuesto,
      minutosDisponiblesJornadaNormal,
      necesidadMaximaProducirJornadaNormal,
      deficitJornadaNormal,
      tiempoTotalNecesidadDeficitJN,
      tiempoParaMaterial,
      tMaxProm,
      necesidadMaximaAFabricar,
      horasExtrasUsadas: '0.00',
      horasExtrasDetalle: '-',
      mesRef: mes,
      lineaRef: linea
    };
  };

  // Sistema de 5 pasadas para calcular las 3 secciones
  const datosEnriquecidosBase = useMemo(() => {
    // ===== PASADA 1: Sección 1 (Jornada Normal) =====
    const enriquecidos = datos.map(enriquecerFila);
    
    // ===== PASADA 2: Sumar déficits JN y tiempos por línea =====
    const sumaDeficitJNPorLinea: { [k: string]: number } = {};
    const sumaTiempoNecDeficitJNPorLinea: { [k: string]: number } = {};
    enriquecidos.forEach(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      sumaDeficitJNPorLinea[key] = (sumaDeficitJNPorLinea[key] || 0) + (row.deficitJornadaNormal ?? 0);
      sumaTiempoNecDeficitJNPorLinea[key] = (sumaTiempoNecDeficitJNPorLinea[key] || 0) + (row.tiempoTotalNecesidadDeficitJN ?? 0);
    });
    
    // ===== PASADA 3: Sección 2 (Horas Extras L-V) =====
    const conSeccion2 = enriquecidos.map(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const sumaDeficitJNLinea = sumaDeficitJNPorLinea[key] || 0;
      const sumaTiempoNecDeficitJNLinea = sumaTiempoNecDeficitJNPorLinea[key] || 0;
      const poolHE = poolMinutosHEPorLinea[key] || 0;
      
      // Participación del déficit JN en la línea
      const participacionDeficitJN = sumaDeficitJNLinea > 0
        ? (row.deficitJornadaNormal / sumaDeficitJNLinea) * 100
        : 0;
      
      // Minutos disponibles HE proporcionales a participación del déficit
      const minutosDisponiblesHorasExtras = (participacionDeficitJN / 100) * poolHE;
      
      // Regla condicional: si el tiempo total de déficit cabe en el pool HE
      let necesidadMaximaProducirHorasExtras = 0;
      if (sumaTiempoNecDeficitJNLinea <= poolHE && sumaTiempoNecDeficitJNLinea > 0) {
        necesidadMaximaProducirHorasExtras = row.deficitJornadaNormal;
      } else if (sumaTiempoNecDeficitJNLinea > poolHE) {
        necesidadMaximaProducirHorasExtras = row.tiempoUnitarioPorPuesto > 0
          ? Math.floor(minutosDisponiblesHorasExtras / row.tiempoUnitarioPorPuesto)
          : 0;
      }
      
      const deficitHorasExtras = Math.max(0, row.deficitJornadaNormal - necesidadMaximaProducirHorasExtras);
      const tiempoTotalNecesidadDeficitHE = deficitHorasExtras * (row.tiempoUnitarioPorPuesto ?? 0);
      
      return {
        ...row,
        participacionDeficitJN,
        minutosDisponiblesHorasExtras,
        necesidadMaximaProducirHorasExtras,
        deficitHorasExtras,
        tiempoTotalNecesidadDeficitHE,
      };
    });
    
    // ===== PASADA 4: Sumar déficits HE y tiempos por línea =====
    const sumaDeficitHEPorLinea: { [k: string]: number } = {};
    const sumaTiempoNecDeficitHEPorLinea: { [k: string]: number } = {};
    conSeccion2.forEach(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      sumaDeficitHEPorLinea[key] = (sumaDeficitHEPorLinea[key] || 0) + (row.deficitHorasExtras ?? 0);
      sumaTiempoNecDeficitHEPorLinea[key] = (sumaTiempoNecDeficitHEPorLinea[key] || 0) + (row.tiempoTotalNecesidadDeficitHE ?? 0);
    });
    
    // ===== PASADA 5: Sección 3 (Sábados) =====
    return conSeccion2.map(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const sumaDeficitHELinea = sumaDeficitHEPorLinea[key] || 0;
      const sumaTiempoNecDeficitHELinea = sumaTiempoNecDeficitHEPorLinea[key] || 0;
      const poolSab = poolMinutosSabadosPorLinea[key] || 0;
      
      // Participación del déficit HE en la línea
      const participacionDeficitHE = sumaDeficitHELinea > 0
        ? (row.deficitHorasExtras / sumaDeficitHELinea) * 100
        : 0;
      
      // Minutos disponibles sábados proporcionales a participación del déficit HE
      const minutosDisponiblesSabados = (participacionDeficitHE / 100) * poolSab;
      
      // Regla condicional: si el tiempo total de déficit HE cabe en el pool de sábados
      let necesidadMaximaProducirSabados = 0;
      if (sumaTiempoNecDeficitHELinea <= poolSab && sumaTiempoNecDeficitHELinea > 0) {
        necesidadMaximaProducirSabados = row.deficitHorasExtras;
      } else if (sumaTiempoNecDeficitHELinea > poolSab) {
        necesidadMaximaProducirSabados = row.tiempoUnitarioPorPuesto > 0
          ? Math.floor(minutosDisponiblesSabados / row.tiempoUnitarioPorPuesto)
          : 0;
      }
      
      // Actualizar necesidadMaximaAFabricar = JN + HE + Sábados (para traslados)
      const totalFabricable = (row.necesidadMaximaProducirJornadaNormal ?? 0) + 
                               (row.necesidadMaximaProducirHorasExtras ?? 0) + 
                               necesidadMaximaProducirSabados;
      
      return {
        ...row,
        participacionDeficitHE,
        minutosDisponiblesSabados,
        necesidadMaximaProducirSabados,
        necesidadMaximaAFabricar: totalFabricable,
      };
    });
  }, [datos]);

  // Segunda pasada: aplicar horas extras por línea si hay déficit — COMPUTACIÓN EN MEMORIA (sin localStorage)
  const datosEnriquecidos = useMemo(() => {
    if (forzarTrasladoTotal) {
      return datosEnriquecidosBase; // Clase F no usa extras
    }

    // PASO 1: Construir pool disponible per mes|linea desde tiemposCanon
    const poolMinutos: { [key: string]: number } = {};
    const tcPorKey: { [key: string]: TiempoCanonResult } = {};
    datosEnriquecidosBase.forEach(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      if (poolMinutos[key] === undefined) {
        const tc = buscarTiempoCanonPorMes(row.mesRef);
        if (tc && maxExtrasHoras > 0) {
          poolMinutos[key] = ((tc.diasLaborables ?? 0) * maxExtrasHoras + (tc.diasSabados ?? 0) * horasExtrasFin) * 60;
          tcPorKey[key] = tc;
        } else {
          poolMinutos[key] = 0;
        }
      }
    });

    // PASO 2: Déficit por mes|linea (minutos que faltan para cubrir necesidad)
    const deficitPorLinea: { [key: string]: number } = {};
    datosEnriquecidosBase.forEach(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const nec = computeNecesidadesLocal(row);
      const fab = safeNumber(row.necesidadMaximaAFabricar ?? 0);
      if (nec > fab) {
        const tupp = safeNumber(row.tiempoUnitarioPorPuesto ?? 0);
        deficitPorLinea[key] = (deficitPorLinea[key] || 0) + (nec - fab) * tupp;
      }
    });

    // PASO 3: Consumir del pool en incrementos de maxExtrasHoras*60 min hasta cubrir déficit o agotar pool
    const extrasParaLinea: { [key: string]: { minutosAdicionales: number; horasConsumidas: number; detalle: string } } = {};
    Object.entries(deficitPorLinea).forEach(([key, deficit]) => {
      const disponible = poolMinutos[key] || 0;
      if (disponible <= 0 || deficit <= 0) return;

      // Consumir en incrementos de maxExtrasHoras horas (2h, 4h, 6h…)
      const incrementoMin = maxExtrasHoras * 60;
      let consumido = 0;
      while (consumido < deficit && consumido < disponible) {
        consumido = Math.min(consumido + incrementoMin, disponible);
      }

      if (consumido <= 0) return;

      const tc = tcPorKey[key];
      const detalle = tc ? computarDetalleConsumoInMemoria(tc, consumido, maxExtrasHoras, horasExtrasFin) : `${(consumido/60).toFixed(1)}h`;

      extrasParaLinea[key] = { minutosAdicionales: consumido, horasConsumidas: consumido / 60, detalle };
      console.log(`[HorasExtras] ${key}: déficit ${deficit.toFixed(0)}min → +${consumido}min (${detalle})`);
    });

    // PASO 4: Recalcular materiales con tiempo adicional
    return datosEnriquecidosBase.map(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const extras = extrasParaLinea[key];

      if (!extras || extras.minutosAdicionales === 0) return row;

      const necesidad = computeNecesidadesLocal(row);
      const fabricadoActual = safeNumber(row.necesidadMaximaAFabricar ?? 0);
      const participacion = safeNumber(row.participacionIndividual ?? 0);
      const tupp = safeNumber(row.tiempoUnitarioPorPuesto ?? 0);

      if (necesidad <= fabricadoActual) {
        // Ya fabricaba todo — solo anotar que la línea consumió extras
        return { ...row, horasExtrasDetalle: extras.detalle, horasExtrasTotalLinea: (extras.horasConsumidas).toFixed(1) };
      }

      // Tiempo adicional proporcional a la participación del material en la línea
      const minutosAdicionalesMaterial = (participacion / 100) * extras.minutosAdicionales;
      const unidadesAdicionales = tupp > 0 ? Math.floor(minutosAdicionalesMaterial / tupp) : 0;
      const nuevaNecesidadMax = Math.min(necesidad, fabricadoActual + unidadesAdicionales);
      const horasExtrasUsadas = (participacion / 100) * extras.horasConsumidas;

      return {
        ...row,
        necesidadMaximaAFabricar: nuevaNecesidadMax,
        tMaxProm: tupp * nuevaNecesidadMax,
        horasExtrasUsadas: horasExtrasUsadas.toFixed(2),
        horasExtrasDetalle: extras.detalle,
        horasExtrasTotalLinea: extras.horasConsumidas.toFixed(1)
      };
    });
  }, [datosEnriquecidosBase, forzarTrasladoTotal, maxExtrasHoras, horasExtrasFin, tiemposCanon]);

  const lastDataLengthRef = useRef<number>(0);

  useEffect(() => {
    if (onTransferNeedsCalculated && datos.length !== lastDataLengthRef.current) {
      lastDataLengthRef.current = datos.length;
      
      const transferNeedsMap = new Map<string, number>();
      
      datosEnriquecidos.forEach((row: any) => {
        const codMaterial = String(row.CodMaterial ?? '');
        const necesidades = computeNecesidadesLocal(row);
        const necesidadMaximaAFabricar = safeNumber(row.necesidadMaximaAFabricar ?? 0);
        const necesidadTraslado = Math.max(0, necesidades - necesidadMaximaAFabricar);
        
        if (!transferNeedsMap.has(codMaterial) || transferNeedsMap.get(codMaterial)! < necesidadTraslado) {
          transferNeedsMap.set(codMaterial, necesidadTraslado);
        }
      });
      
      const transferNeedsArray = Array.from(transferNeedsMap.entries())
        .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
        .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));
      
      onTransferNeedsCalculated(transferNeedsArray);
    }
  }, [datos.length]);

  const lineasUnicas = Array.from(new Set(datosEnriquecidos.map(r => String(r.lineaRef || r.LineaFabricacion || 'Sin línea')))).sort();

  const respCtrlProdUnicos = Array.from(
    new Set(datosEnriquecidos.map(r => String(r.NombRespControlProd || r.RespCtrlProd || 'Sin responsable')).filter(v => v !== 'Sin responsable'))
  ).sort();

  const datosFiltrados = datosEnriquecidos.filter((row: any) => {
    const matchSearchTerm = !searchTerm || String(row.CodMaterial || '').toLowerCase().includes(String(searchTerm).toLowerCase());
    const matchLinea = !selectedLinea || String(row.lineaRef || row.LineaFabricacion || '').trim() === selectedLinea.trim();
    const matchRespCtrlProd = !selectedRespCtrlProd || String(row.NombRespControlProd || row.RespCtrlProd || '').trim() === selectedRespCtrlProd.trim();
    return matchSearchTerm && matchLinea && matchRespCtrlProd;
  });

  const datosAgrupados = datosFiltrados.reduce((acc: any, row: any) => {
    const linea = String(row.lineaRef || row.LineaFabricacion || 'Sin línea');
    if (!acc[linea]) {
      acc[linea] = [];
    }
    acc[linea].push(row);
    return acc;
  }, {} as { [key: string]: any[] });

  const lineasOrdenadas = Object.keys(datosAgrupados).sort();

  const handleExportCSV = () => {
    const dataToExport = datosFiltrados.map((row: any) => ({
      CodMaterial: row.CodMaterial || '',
      Descripcion: row.NombreMaterial || row.CodMaterial || '',
      Centro: row.CentroFabricacion || row.Centro || '',
      Linea: row.lineaRef || row.LineaFabricacion || '',
      PuestoTrabajo: row.PuestoCuellodeBottella || '',
      NumeroPuestos: safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 0),
      Sector: row.Sector || '',
      Responsable: row.NombRespControlProd || row.RespCtrlProd || '',
      NecesidadTotal: safeNumber(row._Necesidades ?? 0),
      TiempoPorUnidad: safeNumber(row.TiempoPorUnidad ?? 0),
      TiempoUnitarioPorPuesto: safeNumber(row.tiempoUnitarioPorPuesto ?? 0),
      TiempoTotalNecesidad: safeNumber(row.tiempoTotalNecesidad ?? 0),
      ParticipacionPorcentaje: safeNumber(row.participacionIndividual ?? 0),
      NecesidadMaximaFabricar: safeNumber(row.necesidadMaximaAFabricar ?? 0),
      TMaxProm: safeNumber(row.tMaxProm ?? 0),
      NecesidadTraslado: safeNumber(row.necesidadTraslado ?? 0)
    }));
    
    exportToXLSX(dataToExport, `Detalle_${titulo.replace(/\s+/g, '_')}`);
  };

  return (
    <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{titulo}</h3>
          <p className="text-sm text-gray-500 mt-1">{datosFiltrados.length} registros encontrados</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Descargar CSV
        </button>
      </div>

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex gap-4 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Línea:</label>
            <select 
              value={selectedLinea} 
              onChange={e => setSelectedLinea(e.target.value)} 
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todas las líneas</option>
              {lineasUnicas.map(linea => (
                <option key={linea} value={linea}>{linea}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Responsable:</label>
            <select 
              value={selectedRespCtrlProd} 
              onChange={e => setSelectedRespCtrlProd(e.target.value)} 
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              {respCtrlProdUnicos.map(resp => (
                <option key={resp} value={resp}>{resp}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Buscar CodMaterial..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
            {/* Fila 1: Encabezados de sección */}
            <tr className="border-b border-gray-300">
              <th colSpan={9} className="px-3 py-2 text-center text-xs font-bold text-gray-700 uppercase bg-gray-100 border-r-2 border-gray-300">Información General</th>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold text-blue-700 uppercase bg-blue-50 border-r-2 border-blue-300">Sección Jornada Normal</th>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold text-green-700 uppercase bg-green-50 border-r-2 border-green-300">Sección Horas Extras (L-V)</th>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold text-orange-700 uppercase bg-orange-50">Sección Sábados</th>
            </tr>
            {/* Fila 2: Columnas individuales */}
            <tr className="bg-gray-50 border-b border-gray-200">
              {/* === Información General (9 cols) === */}
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase">CodMaterial</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Descripción</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Centro</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Línea</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Puesto</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-gray-600 uppercase">N.Puestos</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Sector</th>
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Responsable</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-indigo-600 uppercase border-r-2 border-gray-300">T.Unit/Puestos</th>
              {/* === Sección 1: Jornada Normal (5 cols) === */}
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 uppercase">Necesidad</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 uppercase">T.Total Nec.</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 uppercase">Partic.%</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 uppercase">Min.Disp. JN</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-700 uppercase border-r-2 border-blue-300">Máx.Producir JN</th>
              {/* === Sección 2: Horas Extras L-V (5 cols) === */}
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-600 uppercase">Déficit JN</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-600 uppercase">T.Total Nec.</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-600 uppercase">Partic.%</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-600 uppercase">Min.Disp. HE</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-700 uppercase border-r-2 border-green-300">Máx.Producir HE</th>
              {/* === Sección 3: Sábados (5 cols) === */}
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-600 uppercase">Déficit HE</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-600 uppercase">T.Total Nec.</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-600 uppercase">Partic.%</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-600 uppercase">Min.Disp. Sáb</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-700 uppercase">Máx.Producir Sáb</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineasOrdenadas.map((linea) => (
              <React.Fragment key={linea}>
                <tr className="bg-blue-50">
                  <td colSpan={24} className="px-4 py-2 font-semibold text-blue-800 text-sm">
                    <span className="inline-flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      Línea: {linea}
                    </span>
                  </td>
                </tr>
                {datosAgrupados[linea].map((row: any, idx: number) => {
                  const necesidades = computeNecesidadesLocal(row);
                  return (
                    <tr key={`${linea}-${idx}`} className="hover:bg-gray-50 transition-colors">
                      {/* === Info General === */}
                      <td className="px-2 py-2 text-sm font-medium text-gray-900">{row.CodMaterial ?? '-'}</td>
                      <td className="px-2 py-2 text-sm text-gray-600 max-w-40 truncate" title={row.Descripcion ?? ''}>{row.Descripcion ?? '-'}</td>
                      <td className="px-2 py-2 text-sm text-gray-600">{row.CentroFabricacion || row.Centro || '-'}</td>
                      <td className="px-2 py-2 text-sm text-gray-600">{row.LineaFabricacion ?? '-'}</td>
                      <td className="px-2 py-2 text-sm text-gray-600">{row.PuestoCuellodeBottella ?? '-'}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-gray-600">{row.NumeroPuestos ?? row.numero_puestos ?? '-'}</td>
                      <td className="px-2 py-2 text-sm text-gray-600">{row.Sector ?? '-'}</td>
                      <td className="px-2 py-2 text-sm text-gray-600">{row.NombRespControlProd ?? row.RespCtrlProd ?? '-'}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-indigo-600 font-semibold border-r-2 border-gray-200">
                        {row.tiempoUnitarioPorPuesto != null ? Number(row.tiempoUnitarioPorPuesto).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '-'}
                      </td>
                      {/* === Sección 1: Jornada Normal === */}
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{Math.floor(necesidades).toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-600">
                        {row.tiempoTotalNecesidad != null ? Number(row.tiempoTotalNecesidad).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-600">
                        {Number(row.participacionIndividual ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-600">
                        {row.minutosDisponiblesJornadaNormal != null ? Number(row.minutosDisponiblesJornadaNormal).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'} min
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-800 font-semibold border-r-2 border-blue-200">
                        {row.necesidadMaximaProducirJornadaNormal != null ? Number(row.necesidadMaximaProducirJornadaNormal).toLocaleString() : '-'}
                      </td>
                      {/* === Sección 2: Horas Extras L-V === */}
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">
                        {row.deficitJornadaNormal != null ? Number(row.deficitJornadaNormal).toLocaleString() : '-'}
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-600">
                        {row.tiempoTotalNecesidadDeficitJN != null ? Number(row.tiempoTotalNecesidadDeficitJN).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-600">
                        {Number(row.participacionDeficitJN ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-600">
                        {row.minutosDisponiblesHorasExtras != null ? Number(row.minutosDisponiblesHorasExtras).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'} min
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-800 font-semibold border-r-2 border-green-200">
                        {row.necesidadMaximaProducirHorasExtras != null ? Number(row.necesidadMaximaProducirHorasExtras).toLocaleString() : '-'}
                      </td>
                      {/* === Sección 3: Sábados === */}
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">
                        {row.deficitHorasExtras != null ? Number(row.deficitHorasExtras).toLocaleString() : '-'}
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-600">
                        {row.tiempoTotalNecesidadDeficitHE != null ? Number(row.tiempoTotalNecesidadDeficitHE).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-600">
                        {Number(row.participacionDeficitHE ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-600">
                        {row.minutosDisponiblesSabados != null ? Number(row.minutosDisponiblesSabados).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'} min
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-800 font-semibold">
                        {row.necesidadMaximaProducirSabados != null ? Number(row.necesidadMaximaProducirSabados).toLocaleString() : '-'}
                      </td>
                    </tr>
                  );
                })}
                {/* === Subtotal por línea === */}
                {(() => {
                  const filasLinea = datosAgrupados[linea];
                  const f = (field: string) => filasLinea.reduce((s: number, r: any) => s + safeNumber(r[field] ?? 0), 0);
                  const totalNecesidades = filasLinea.reduce((s: number, r: any) => s + computeNecesidadesLocal(r), 0);
                  
                  return (
                    <tr className="bg-gray-100 font-semibold">
                      <td colSpan={9} className="px-2 py-2 text-sm text-gray-700 border-r-2 border-gray-300">Subtotal {linea}</td>
                      {/* Sección 1 */}
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{Math.floor(totalNecesidades).toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{f('tiempoTotalNecesidad').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{f('participacionIndividual').toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{f('minutosDisponiblesJornadaNormal').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-800 border-r-2 border-blue-300">{f('necesidadMaximaProducirJornadaNormal').toLocaleString()}</td>
                      {/* Sección 2 */}
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">{f('deficitJornadaNormal').toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">{f('tiempoTotalNecesidadDeficitJN').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">-</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">{f('minutosDisponiblesHorasExtras').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-800 border-r-2 border-green-300">{f('necesidadMaximaProducirHorasExtras').toLocaleString()}</td>
                      {/* Sección 3 */}
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">{f('deficitHorasExtras').toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">{f('tiempoTotalNecesidadDeficitHE').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">-</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">{f('minutosDisponiblesSabados').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-800">{f('necesidadMaximaProducirSabados').toLocaleString()}</td>
                    </tr>
                  );
                })()}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            {(() => {
              const g = (field: string) => datosFiltrados.reduce((s: number, r: any) => s + safeNumber(r[field] ?? 0), 0);
              const totalNecesidadesGlobal = datosFiltrados.reduce((s: number, r: any) => s + computeNecesidadesLocal(r), 0);
              
              return (
                <tr className="bg-gray-800 text-white">
                  <td colSpan={9} className="px-2 py-3 text-sm font-bold border-r-2 border-gray-600">TOTAL GENERAL</td>
                  {/* Sección 1 */}
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold">{Math.floor(totalNecesidadesGlobal).toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold">{g('tiempoTotalNecesidad').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold">{g('participacionIndividual').toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-blue-300">{g('minutosDisponiblesJornadaNormal').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-blue-300 border-r-2 border-blue-800">{g('necesidadMaximaProducirJornadaNormal').toLocaleString()}</td>
                  {/* Sección 2 */}
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300">{g('deficitJornadaNormal').toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300">{g('tiempoTotalNecesidadDeficitJN').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300">-</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300">{g('minutosDisponiblesHorasExtras').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300 border-r-2 border-green-800">{g('necesidadMaximaProducirHorasExtras').toLocaleString()}</td>
                  {/* Sección 3 */}
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300">{g('deficitHorasExtras').toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300">{g('tiempoTotalNecesidadDeficitHE').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300">-</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300">{g('minutosDisponiblesSabados').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300">{g('necesidadMaximaProducirSabados').toLocaleString()}</td>
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>
    </div>
  );
};
