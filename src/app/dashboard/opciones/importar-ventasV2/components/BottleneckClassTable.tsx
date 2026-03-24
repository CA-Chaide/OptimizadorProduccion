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

// Defaults estables: evitan que cada render cree nuevas referencias → rompe ciclos de re-render
const EMPTY_TRANSFERS: TransferNeed[] = [];
const EMPTY_CONSUMED: { [mesLinea: string]: number } = {};

interface BottleneckClassTableProps {
  datos: any[];
  datosCompletos: any[];
  titulo: string;
  tiemposCanon: TiempoCanonResult[];
  tiempoConsumidoAnterior?: { [mesLinea: string]: number };
  onTransferNeedsCalculated?: (transferNeeds: TransferNeed[]) => void;
  onExportSheetReady?: (rows: any[]) => void;
  forzarTrasladoTotal?: boolean;
  maxExtrasHoras?: number;
  horasExtrasFin?: number;
  trasladosDesdeCentro2000?: TransferNeed[];
}

export const BottleneckClassTable: React.FC<BottleneckClassTableProps> = ({ 
  datos, 
  datosCompletos, 
  titulo, 
  tiemposCanon, 
  tiempoConsumidoAnterior = EMPTY_CONSUMED,
  onTransferNeedsCalculated,
  onExportSheetReady,
  forzarTrasladoTotal = false,
  maxExtrasHoras = 2,
  horasExtrasFin = 2,
  trasladosDesdeCentro2000 = EMPTY_TRANSFERS
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLinea, setSelectedLinea] = useState<string>('');
  const [selectedRespCtrlProd, setSelectedRespCtrlProd] = useState<string[]>([]);
  const [respDropdownOpen, setRespDropdownOpen] = useState<boolean>(false);
  const respDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedSector, setSelectedSector] = useState<string[]>([]);
  const [sectorDropdownOpen, setSectorDropdownOpen] = useState<boolean>(false);
  const sectorDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (respDropdownRef.current && !respDropdownRef.current.contains(e.target as Node)) {
        setRespDropdownOpen(false);
      }
      if (sectorDropdownRef.current && !sectorDropdownRef.current.contains(e.target as Node)) {
        setSectorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Mapa de traslados desde Centro 2000 (para Centro 1000)
  const trasladosMap = useMemo(() => {
    const map = new Map<string, number>();
    trasladosDesdeCentro2000.forEach(item => {
      map.set(item.CodMaterial, (map.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });
    return map;
  }, [trasladosDesdeCentro2000]);

  const computeNecesidadesLocal = (row: any) => {
    const unidadesProy = safeNumber(row.UnidadesProyectado ?? 0);
    const stockSeg = safeNumber(row.StockSeguridad ?? 0);
    const stockAct = safeNumber(row.StockActual ?? 0);
    const necesidadPropia = Math.max(0, unidadesProy - stockAct + stockSeg);
    const traslado = trasladosMap.get(String(row.CodMaterial ?? '')) || 0;
    return necesidadPropia + traslado;
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
        // TOPE: nunca producir más allá de la necesidad
        necesidadMaximaAFabricar = Math.min(necesidad, tiempoUnitarioPorPuesto > 0 
          ? Math.floor(minutosDisponiblesJornadaNormal / tiempoUnitarioPorPuesto) 
          : 0);
      }
      
      // Reutilizar sumaTiempoNecLinea y tiempoMaxDisponibleBase para la segunda regla
      if (sumaTiempoNecLinea <= tiempoMaxDisponibleBase) {
        // Si hay suficiente tiempo: fabrico mi necesidad completa
        necesidadMaximaProducirJornadaNormal = necesidad;
      } else {
        // Si NO hay suficiente: fabrico proporcional a mi participación
        // TOPE: nunca producir más allá de la necesidad
        necesidadMaximaProducirJornadaNormal = Math.min(necesidad, tiempoUnitarioPorPuesto > 0 
          ? Math.floor(minutosDisponiblesJornadaNormal / tiempoUnitarioPorPuesto)
          : 0);
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
      _necesidad: necesidad,          // almacenado una sola vez; evita recálculo en export
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
      // TOPE: nunca producir más allá del déficit de jornada normal
      let necesidadMaximaProducirHorasExtras = 0;
      if (sumaTiempoNecDeficitJNLinea <= poolHE && sumaTiempoNecDeficitJNLinea > 0) {
        necesidadMaximaProducirHorasExtras = row.deficitJornadaNormal;
      } else if (sumaTiempoNecDeficitJNLinea > poolHE) {
        necesidadMaximaProducirHorasExtras = Math.min(row.deficitJornadaNormal, row.tiempoUnitarioPorPuesto > 0
          ? Math.floor(minutosDisponiblesHorasExtras / row.tiempoUnitarioPorPuesto)
          : 0);
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
      // TOPE: nunca producir más allá del déficit de horas extras
      let necesidadMaximaProducirSabados = 0;
      if (sumaTiempoNecDeficitHELinea <= poolSab && sumaTiempoNecDeficitHELinea > 0) {
        necesidadMaximaProducirSabados = row.deficitHorasExtras;
      } else if (sumaTiempoNecDeficitHELinea > poolSab) {
        necesidadMaximaProducirSabados = Math.min(row.deficitHorasExtras, row.tiempoUnitarioPorPuesto > 0
          ? Math.floor(minutosDisponiblesSabados / row.tiempoUnitarioPorPuesto)
          : 0);
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

  // Pasada final: estampa en cada fila los 5 valores derivados que tabla y export comparten.
  // Calculados UNA sola vez; ni la tabla ni el export vuelven a recalcularlos.
  const filasCalculadas = useMemo(() =>
    datosEnriquecidos.map((row: any) => {
      const _traslado  = trasladosMap.get(String(row.CodMaterial ?? '')) || 0;
      const _necPropia = Math.max(0, safeNumber(row.UnidadesProyectado??0) - safeNumber(row.StockActual??0) + safeNumber(row.StockSeguridad??0));
      const _necesidad = _necPropia + _traslado;
      const _prodViable = safeNumber(row.necesidadMaximaProducirJornadaNormal??0)
                        + safeNumber(row.necesidadMaximaProducirHorasExtras??0)
                        + safeNumber(row.necesidadMaximaProducirSabados??0);
      return { ...row, _traslado, _necPropia, _necesidad, _prodViable,
               _deficitGeneral: Math.max(0, _necesidad - _prodViable) };
    })
  , [datosEnriquecidos, trasladosMap]);

  const lastDataLengthRef = useRef<number>(0);
  const lastTransferJsonRef = useRef<string>('');

  useEffect(() => {
    if (!onTransferNeedsCalculated) return;
    lastDataLengthRef.current = datos.length;

    // Sumar el déficit por (CodMaterial, Mes) — cada fila es un material en un mes específico.
    // CORRECCIÓN: usar _deficitGeneral directamente (= _necesidad - _prodViable) que es
    // exactamente lo que la tabla muestra como "Déficit General".
    // Antes se usaba necesidadMaximaAFabricar que incluye una 2ª pasada legacy de extras
    // que inflaba la capacidad → el traslado era menor que el déficit visible.
    const transferNeedsMapByMes = new Map<string, number>();

    filasCalculadas.forEach((row: any) => {
      const codMaterial = String(row.CodMaterial ?? '');
      const mes = String(row.mesRef ?? row.Mes ?? '');
      const key = `${codMaterial}|${mes}`;
      const necesidadTraslado = safeNumber(row._deficitGeneral ?? 0);
      // Tomar el máximo dentro del mismo (material, mes) para evitar duplicados
      if (necesidadTraslado > 0) {
        if (!transferNeedsMapByMes.has(key) || transferNeedsMapByMes.get(key)! < necesidadTraslado) {
          transferNeedsMapByMes.set(key, necesidadTraslado);
        }
      }
    });

    // Colapsar: sumar todos los meses por CodMaterial
    const transferNeedsMap = new Map<string, number>();
    transferNeedsMapByMes.forEach((value, key) => {
      const codMaterial = key.split('|')[0];
      transferNeedsMap.set(codMaterial, (transferNeedsMap.get(codMaterial) || 0) + value);
    });

    const transferNeedsArray = Array.from(transferNeedsMap.entries())
      .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
      .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));

    // === LOG DIAGNÓSTICO: Traslados emitidos por esta clase ===
    const totalTraslado = transferNeedsArray.reduce((s, r) => s + r.necesidadTraslado, 0);
    console.log(`%c=== [TRASLADOS ${titulo}] ===`, 'color: #e67e22; font-weight: bold;');
    console.log(`Materiales con d\u00e9ficit: ${transferNeedsArray.length} | Total unidades a trasladar: ${totalTraslado}`);
    console.log('Detalle por CodMaterial|Mes (antes de colapsar):');
    console.table(Array.from(transferNeedsMapByMes.entries()).map(([k, v]) => {
      const [cod, mes] = k.split('|');
      return { CodMaterial: cod, Mes: mes, TransferNeed: v };
    }));
    console.log('Resultado colapsado por material:');
    console.table(transferNeedsArray.slice(0, 50));
    if (transferNeedsArray.length > 50) console.log(`... y ${transferNeedsArray.length - 50} m\u00e1s`);

    // Guard: solo notificar si realmente cambi\u00f3 (evita loops de re-render)
    const json = JSON.stringify(transferNeedsArray);
    if (json === lastTransferJsonRef.current) return;
    lastTransferJsonRef.current = json;

    onTransferNeedsCalculated(transferNeedsArray);
  }, [filasCalculadas]);

  const lineasUnicas = useMemo(() =>
    Array.from(new Set(datosEnriquecidos.map(r => String(r.lineaRef || r.LineaFabricacion || 'Sin línea').trim()))).sort()
  , [datosEnriquecidos]);

  const sectoresUnicos = useMemo(() => {
    const conNombre = Array.from(
      new Set(datosEnriquecidos.map(r => String((r as any).Sector || '').trim()).filter(v => v !== ''))
    ).sort();
    const haySinSector = datosEnriquecidos.some(r => !String((r as any).Sector || '').trim());
    return haySinSector ? [...conNombre, '(Sin sector)'] : conNombre;
  }, [datosEnriquecidos]);

  const respCtrlProdUnicos = useMemo(() => {
    const conNombre = Array.from(
      new Set(datosEnriquecidos.map(r => String(r.NombRespControlProd || r.RespCtrlProd || '').trim()).filter(v => v !== ''))
    ).sort();
    const haySinResponsable = datosEnriquecidos.some(r => !String(r.NombRespControlProd || r.RespCtrlProd || '').trim());
    return haySinResponsable ? [...conNombre, '(Sin responsable)'] : conNombre;
  }, [datosEnriquecidos]);

  const datosFiltrados = useMemo(() =>
    filasCalculadas.filter((row: any) => {
      const matchSearchTerm = !searchTerm || String(row.CodMaterial || '').toLowerCase().includes(String(searchTerm).toLowerCase());
      const matchLinea = !selectedLinea || String(row.lineaRef || row.LineaFabricacion || '').trim() === selectedLinea.trim();
      const respRow = String(row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '').trim();
      const matchRespCtrlProd = selectedRespCtrlProd.length === 0 || 
        selectedRespCtrlProd.includes(respRow) ||
        (selectedRespCtrlProd.includes('(Sin responsable)') && respRow === '');
      const sectorRow = String((row as any).Sector || '').trim();
      const matchSector = selectedSector.length === 0 ||
        selectedSector.includes(sectorRow) ||
        (selectedSector.includes('(Sin sector)') && sectorRow === '');
      return matchSearchTerm && matchLinea && matchRespCtrlProd && matchSector;
    })
  , [filasCalculadas, searchTerm, selectedLinea, selectedRespCtrlProd, selectedSector]);

  const datosAgrupados = useMemo(() =>
    datosFiltrados.reduce((acc: any, row: any) => {
      const linea = String(row.lineaRef || row.LineaFabricacion || 'Sin línea');
      if (!acc[linea]) acc[linea] = [];
      acc[linea].push(row);
      return acc;
    }, {} as { [key: string]: any[] })
  , [datosFiltrados]);

  const lineasOrdenadas = useMemo(() => Object.keys(datosAgrupados).sort(), [datosAgrupados]);

  // Estructura de Excel calculada una sola vez como useMemo.
  // Al cambiar filtros/datos se recalcula; al pulsar "Descargar" solo se escribe el fichero.
  const exportSheet = useMemo(() => {
    const result: any[] = [];
    const sum = (arr: any[], field: string) => arr.reduce((s: number, r: any) => s + safeNumber(r[field] ?? 0), 0);
    // Lee directamente los campos pre-calculados — cero cálculos aquí
    const rowToExcel = (row: any) => ({
      'CodMaterial': row.CodMaterial ?? '',
      'Descripcion': row.Descripcion || row.NombreMaterial || row.CodMaterial || '',
      'Centro': row.CentroFabricacion || row.Centro || '',
      'Linea': row.lineaRef || row.LineaFabricacion || '',
      'Puesto': row.PuestoCuellodeBottella || '',
      'N.Puestos': safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 0),
      'Sector': row.Sector || '',
      'Responsable': row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '',
      'T.Unit/Puestos': safeNumber(row.tiempoUnitarioPorPuesto ?? 0),
      'Traslado C.2000': row._traslado,
      'Nec. Propia': row._necPropia,
      '[JN] NECESIDAD': Math.floor(row._necesidad),
      '[JN] T.Total Nec': safeNumber(row.tiempoTotalNecesidad ?? 0),
      '[JN] Partic.%': safeNumber(row.participacionIndividual ?? 0),
      '[JN] MIN.DISP': safeNumber(row.minutosDisponiblesJornadaNormal ?? 0),
      '[JN] MAX.PRODUCIR': safeNumber(row.necesidadMaximaProducirJornadaNormal ?? 0),
      '[HE] Deficit JN': safeNumber(row.deficitJornadaNormal ?? 0),
      '[HE] T.Total Nec': safeNumber(row.tiempoTotalNecesidadDeficitJN ?? 0),
      '[HE] Partic.%': safeNumber(row.participacionDeficitJN ?? 0),
      '[HE] MIN.DISP': safeNumber(row.minutosDisponiblesHorasExtras ?? 0),
      '[HE] MAX.PRODUCIR': safeNumber(row.necesidadMaximaProducirHorasExtras ?? 0),
      '[SAB] Deficit HE': safeNumber(row.deficitHorasExtras ?? 0),
      '[SAB] T.Total Nec': safeNumber(row.tiempoTotalNecesidadDeficitHE ?? 0),
      '[SAB] Partic.%': safeNumber(row.participacionDeficitHE ?? 0),
      '[SAB] MIN.DISP': safeNumber(row.minutosDisponiblesSabados ?? 0),
      '[SAB] MAX.PRODUCIR': safeNumber(row.necesidadMaximaProducirSabados ?? 0),
      '[RES] Prod.Viable': row._prodViable,
      '[RES] Deficit General': row._deficitGeneral,
    });

    // Iterar exactamente como la tabla: lineasOrdenadas → datosAgrupados[linea]
    lineasOrdenadas.forEach(linea => {
      const filasLinea: any[] = datosAgrupados[linea];
      // Filas de datos
      filasLinea.forEach(row => result.push(rowToExcel(row)));
      // Subtotal (igual al <tr> gris de la tabla)
      // _necesidad y _traslado ya están en cada fila — lectura directa
      const totalNec = filasLinea.reduce((s: number, r: any) => s + safeNumber(r._necesidad ?? 0), 0);
      const totalTraslados = filasLinea.reduce((s: number, r: any) => s + safeNumber(r._traslado ?? 0), 0);
      const prodViableSub = sum(filasLinea, 'necesidadMaximaProducirJornadaNormal') + sum(filasLinea, 'necesidadMaximaProducirHorasExtras') + sum(filasLinea, 'necesidadMaximaProducirSabados');
      result.push({
        'CodMaterial': `** Subtotal ${linea} **`,
        'Descripcion': '', 'Centro': '', 'Linea': linea, 'Puesto': '', 'N.Puestos': '', 'Sector': '', 'Responsable': '', 'T.Unit/Puestos': '',
        'Traslado C.2000': totalTraslados,
        'Nec. Propia': Math.floor(totalNec - totalTraslados),
        '[JN] NECESIDAD': Math.floor(totalNec),
        '[JN] T.Total Nec': sum(filasLinea, 'tiempoTotalNecesidad'),
        '[JN] Partic.%': '-',
        '[JN] MIN.DISP': sum(filasLinea, 'minutosDisponiblesJornadaNormal'),
        '[JN] MAX.PRODUCIR': sum(filasLinea, 'necesidadMaximaProducirJornadaNormal'),
        '[HE] Deficit JN': sum(filasLinea, 'deficitJornadaNormal'),
        '[HE] T.Total Nec': sum(filasLinea, 'tiempoTotalNecesidadDeficitJN'),
        '[HE] Partic.%': '-',
        '[HE] MIN.DISP': sum(filasLinea, 'minutosDisponiblesHorasExtras'),
        '[HE] MAX.PRODUCIR': sum(filasLinea, 'necesidadMaximaProducirHorasExtras'),
        '[SAB] Deficit HE': sum(filasLinea, 'deficitHorasExtras'),
        '[SAB] T.Total Nec': sum(filasLinea, 'tiempoTotalNecesidadDeficitHE'),
        '[SAB] Partic.%': '-',
        '[SAB] MIN.DISP': sum(filasLinea, 'minutosDisponiblesSabados'),
        '[SAB] MAX.PRODUCIR': sum(filasLinea, 'necesidadMaximaProducirSabados'),
        '[RES] Prod.Viable': prodViableSub,
        '[RES] Deficit General': Math.max(0, totalNec - prodViableSub),
      });
    });

    // TOTAL GENERAL (igual al <tfoot> negro de la tabla)
    const totalNecGlobal = datosFiltrados.reduce((s: number, r: any) => s + safeNumber(r._necesidad ?? 0), 0);
    const totalTrasladosGlobal = datosFiltrados.reduce((s: number, r: any) => s + safeNumber(r._traslado ?? 0), 0);
    const prodViableGlobal = sum(datosFiltrados, 'necesidadMaximaProducirJornadaNormal') + sum(datosFiltrados, 'necesidadMaximaProducirHorasExtras') + sum(datosFiltrados, 'necesidadMaximaProducirSabados');
    result.push({
      'CodMaterial': `*** TOTAL GENERAL (${datosFiltrados.length} registros) ***`,
      'Descripcion': '', 'Centro': '', 'Linea': '', 'Puesto': '', 'N.Puestos': '', 'Sector': '', 'Responsable': '', 'T.Unit/Puestos': '',
      'Traslado C.2000': totalTrasladosGlobal,
      'Nec. Propia': Math.floor(totalNecGlobal - totalTrasladosGlobal),
      '[JN] NECESIDAD': Math.floor(totalNecGlobal),
      '[JN] T.Total Nec': sum(datosFiltrados, 'tiempoTotalNecesidad'),
      '[JN] Partic.%': '-',
      '[JN] MIN.DISP': sum(datosFiltrados, 'minutosDisponiblesJornadaNormal'),
      '[JN] MAX.PRODUCIR': sum(datosFiltrados, 'necesidadMaximaProducirJornadaNormal'),
      '[HE] Deficit JN': sum(datosFiltrados, 'deficitJornadaNormal'),
      '[HE] T.Total Nec': sum(datosFiltrados, 'tiempoTotalNecesidadDeficitJN'),
      '[HE] Partic.%': '-',
      '[HE] MIN.DISP': sum(datosFiltrados, 'minutosDisponiblesHorasExtras'),
      '[HE] MAX.PRODUCIR': sum(datosFiltrados, 'necesidadMaximaProducirHorasExtras'),
      '[SAB] Deficit HE': sum(datosFiltrados, 'deficitHorasExtras'),
      '[SAB] T.Total Nec': sum(datosFiltrados, 'tiempoTotalNecesidadDeficitHE'),
      '[SAB] Partic.%': '-',
      '[SAB] MIN.DISP': sum(datosFiltrados, 'minutosDisponiblesSabados'),
      '[SAB] MAX.PRODUCIR': sum(datosFiltrados, 'necesidadMaximaProducirSabados'),
      '[RES] Prod.Viable': prodViableGlobal,
      '[RES] Deficit General': Math.max(0, totalNecGlobal - prodViableGlobal),
    });

    return result;
  }, [datosAgrupados, lineasOrdenadas, datosFiltrados]);

  const lastExportJsonRef = useRef<string>('');

  useEffect(() => {
    if (!onExportSheetReady) return;
    const json = JSON.stringify(exportSheet);
    if (json === lastExportJsonRef.current) return;
    lastExportJsonRef.current = json;
    onExportSheetReady(exportSheet);
  }, [exportSheet, onExportSheetReady]);

  const handleExportCSV = () => {
    exportToXLSX(exportSheet, `Detalle_${titulo.replace(/\s+/g, '_')}`);
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

          <div className="flex items-center gap-2 relative" ref={sectorDropdownRef}>
            <label className="text-sm font-medium text-gray-600">Sector:</label>
            <button
              type="button"
              onClick={() => setSectorDropdownOpen(o => !o)}
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[160px] text-left flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {selectedSector.length === 0
                  ? 'Todos'
                  : selectedSector.length === 1
                  ? selectedSector[0]
                  : `${selectedSector.length} seleccionados`}
              </span>
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${sectorDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {sectorDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-64 overflow-y-auto">
                <div className="p-2 border-b border-gray-100 flex gap-2">
                  <button type="button" onClick={() => setSelectedSector([])} className="text-xs text-blue-600 hover:underline">Todos</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={() => setSelectedSector([...sectoresUnicos])} className="text-xs text-blue-600 hover:underline">Seleccionar todos</button>
                </div>
                {sectoresUnicos.map(sec => (
                  <label key={sec} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedSector.includes(sec)}
                      onChange={e => {
                        setSelectedSector(prev =>
                          e.target.checked ? [...prev, sec] : prev.filter(s => s !== sec)
                        );
                      }}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    <span className="truncate">{sec}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 relative" ref={respDropdownRef}>
            <label className="text-sm font-medium text-gray-600">Responsable:</label>
            <button
              type="button"
              onClick={() => setRespDropdownOpen(o => !o)}
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[180px] text-left flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {selectedRespCtrlProd.length === 0
                  ? 'Todos'
                  : selectedRespCtrlProd.length === 1
                  ? selectedRespCtrlProd[0]
                  : `${selectedRespCtrlProd.length} seleccionados`}
              </span>
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${respDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {respDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[220px] max-h-64 overflow-y-auto">
                <div className="p-2 border-b border-gray-100 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRespCtrlProd([])}
                    className="text-xs text-blue-600 hover:underline"
                  >Todos</button>
                  <span className="text-gray-300">|</span>
                  <button
                    type="button"
                    onClick={() => setSelectedRespCtrlProd([...respCtrlProdUnicos])}
                    className="text-xs text-blue-600 hover:underline"
                  >Seleccionar todos</button>
                </div>
                {respCtrlProdUnicos.map(resp => (
                  <label key={resp} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedRespCtrlProd.includes(resp)}
                      onChange={e => {
                        setSelectedRespCtrlProd(prev =>
                          e.target.checked ? [...prev, resp] : prev.filter(r => r !== resp)
                        );
                      }}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    <span className="truncate">{resp}</span>
                  </label>
                ))}
              </div>
            )}
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

          {/* Contador + limpiar filtros */}
          <span className="text-xs text-gray-500">{datosFiltrados.length} de {datosEnriquecidos.length} registros</span>
          {(searchTerm || selectedLinea || selectedRespCtrlProd.length > 0 || selectedSector.length > 0) && (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setSelectedLinea(''); setSelectedRespCtrlProd([]); setSelectedSector([]); }}
              className="text-xs text-red-600 hover:text-red-800 hover:underline flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
            {/* Fila 1: Encabezados de sección */}
            <tr className="border-b border-gray-300">
              <th colSpan={11} className="px-3 py-2 text-center text-xs font-bold text-gray-700 uppercase bg-gray-100 border-r-2 border-gray-300">Información General</th>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold text-blue-700 uppercase bg-blue-50 border-r-2 border-blue-300">Sección Jornada Normal</th>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold text-green-700 uppercase bg-green-50 border-r-2 border-green-300">Sección Horas Extras (L-V)</th>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold text-orange-700 uppercase bg-orange-50 border-r-2 border-orange-300">Sección Sábados</th>
              <th colSpan={2} className="px-3 py-2 text-center text-xs font-bold text-purple-700 uppercase bg-purple-50">Resultados Consolidados</th>
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
              <th className="px-2 py-2 text-right text-xs font-semibold text-indigo-600 uppercase">T.Unit/Puestos</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-teal-600 uppercase">Traslado C.2000</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-gray-600 uppercase border-r-2 border-gray-300">Nec. Propia</th>
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
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-700 uppercase border-r-2 border-orange-300">Máx.Producir Sáb</th>
              {/* === Sección 4: Resultados Consolidados (2 cols) === */}
              <th className="px-2 py-2 text-right text-xs font-semibold text-purple-600 uppercase">Prod.Viable (S1+S2+S3)</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-purple-600 uppercase">Déficit General</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineasOrdenadas.map((linea) => (
              <React.Fragment key={linea}>
                <tr className="bg-blue-50">
                  <td colSpan={28} className="px-4 py-2 font-semibold text-blue-800 text-sm">
                    <span className="inline-flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      Línea: {linea}
                    </span>
                  </td>
                </tr>
                {datosAgrupados[linea].map((row: any, idx: number) => {
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
                      <td className="px-2 py-2 text-sm text-right font-mono text-indigo-600 font-semibold">
                        {row.tiempoUnitarioPorPuesto != null ? Number(row.tiempoUnitarioPorPuesto).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '-'}
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-teal-700 font-semibold">
                        {row._traslado.toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-gray-700 border-r-2 border-gray-200">
                        {row._necPropia.toLocaleString()}
                      </td>
                      {/* === Sección 1: Jornada Normal === */}
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{Math.floor(row._necesidad).toLocaleString()}</td>
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
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-800 font-semibold border-r-2 border-orange-200">
                        {row.necesidadMaximaProducirSabados != null ? Number(row.necesidadMaximaProducirSabados).toLocaleString() : '-'}
                      </td>
                      {/* === Sección 4: Resultados Consolidados === */}
                      <td className="px-2 py-2 text-sm text-right font-mono text-purple-700 font-semibold">
                        {row._prodViable.toLocaleString()}
                      </td>
                      <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${row._deficitGeneral > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {row._deficitGeneral.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
                {/* === Subtotal por línea === */}
                {(() => {
                  const filasLinea = datosAgrupados[linea];
                  const f = (field: string) => filasLinea.reduce((s: number, r: any) => s + safeNumber(r[field] ?? 0), 0);
                  const totalNecesidades = filasLinea.reduce((s: number, r: any) => s + safeNumber(r._necesidad ?? 0), 0);
                  const totalTrasladosLinea = filasLinea.reduce((s: number, r: any) => s + safeNumber(r._traslado ?? 0), 0);
                  const totalNecPropiaLinea = totalNecesidades - totalTrasladosLinea;
                  
                  return (
                    <tr className="bg-gray-100 font-semibold">
                      <td colSpan={9} className="px-2 py-2 text-sm text-gray-700">Subtotal {linea}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-teal-700">{totalTrasladosLinea.toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-gray-800 border-r-2 border-gray-300">{Math.floor(totalNecPropiaLinea).toLocaleString()}</td>
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
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-800 border-r-2 border-orange-300">{f('necesidadMaximaProducirSabados').toLocaleString()}</td>
                      {/* Sección 4 subtotal */}
                      {(() => {
                        const prodViableSub = f('necesidadMaximaProducirJornadaNormal') + f('necesidadMaximaProducirHorasExtras') + f('necesidadMaximaProducirSabados');
                        const deficitGralSub = Math.max(0, totalNecesidades - prodViableSub);
                        return (
                          <>
                            <td className="px-2 py-2 text-sm text-right font-mono text-purple-800 font-semibold">{prodViableSub.toLocaleString()}</td>
                            <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${deficitGralSub > 0 ? 'text-red-700' : 'text-green-700'}`}>{deficitGralSub.toLocaleString()}</td>
                          </>
                        );
                      })()}
                    </tr>
                  );
                })()}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            {(() => {
              const g = (field: string) => datosFiltrados.reduce((s: number, r: any) => s + safeNumber(r[field] ?? 0), 0);
              const totalNecesidadesGlobal = datosFiltrados.reduce((s: number, r: any) => s + safeNumber(r._necesidad ?? 0), 0);
              const totalTrasladosGlobal = datosFiltrados.reduce((s: number, r: any) => s + safeNumber(r._traslado ?? 0), 0);
              const totalNecPropiaGlobal = totalNecesidadesGlobal - totalTrasladosGlobal;
              
              return (
                <tr className="bg-gray-800 text-white">
                  <td colSpan={9} className="px-2 py-3 text-sm font-bold">TOTAL GENERAL ({datosFiltrados.length} registros)</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-teal-300">{totalTrasladosGlobal.toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold border-r-2 border-gray-600">{Math.floor(totalNecPropiaGlobal).toLocaleString()}</td>
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
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300 border-r-2 border-orange-800">{g('necesidadMaximaProducirSabados').toLocaleString()}</td>
                  {/* Sección 4 TOTAL */}
                  {(() => {
                    const prodViableTotal = g('necesidadMaximaProducirJornadaNormal') + g('necesidadMaximaProducirHorasExtras') + g('necesidadMaximaProducirSabados');
                    const deficitGralTotal = Math.max(0, totalNecesidadesGlobal - prodViableTotal);
                    return (
                      <>
                        <td className="px-2 py-3 text-sm text-right font-mono font-bold text-purple-300">{prodViableTotal.toLocaleString()}</td>
                        <td className={`px-2 py-3 text-sm text-right font-mono font-bold ${deficitGralTotal > 0 ? 'text-red-300' : 'text-green-300'}`}>{deficitGralTotal.toLocaleString()}</td>
                      </>
                    );
                  })()}
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>
    </div>
  );
};
