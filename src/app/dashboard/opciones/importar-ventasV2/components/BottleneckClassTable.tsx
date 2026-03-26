'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, computeNecesidades, exportToXLSX } from './utils';
import { TiempoCanonResult, TransferNeed, ViableTransfer, BottleneckClassTableProps } from './types';

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

// Defaults estables
const EMPTY_TRANSFERS: TransferNeed[] = [];
const EMPTY_VIABLE_TRANSFERS: ViableTransfer[] = [];
const EMPTY_CONSUMED: { [mesLinea: string]: number } = {};

export const BottleneckClassTable: React.FC<BottleneckClassTableProps> = ({ 
  datos, 
  datosCompletos, 
  titulo, 
  tiemposCanon, 
  tiempoConsumidoAnterior = EMPTY_CONSUMED,
  onTransferNeedsCalculated,
  onExportSheetReady,
  onComputedDataReady,
  forzarTrasladoTotal = false,
  maxExtrasHoras = 2,
  horasExtrasFin = 2,
  trasladosDesdeCentro2000 = EMPTY_TRANSFERS,
  isCentro1000 = false,
  trasladosViables = EMPTY_VIABLE_TRANSFERS
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLinea, setSelectedLinea] = useState<string>('');
  const [selectedRespCtrlProd, setSelectedRespCtrlProd] = useState<string[]>([]);
  const [respDropdownOpen, setRespDropdownOpen] = useState<boolean>(false);
  const respDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedSector, setSelectedSector] = useState<string[]>([]);
  const [sectorDropdownOpen, setSectorDropdownOpen] = useState<boolean>(false);
  const sectorDropdownRef = useRef<HTMLDivElement>(null);
  
  const [selectedClaseAprov, setSelectedClaseAprov] = useState<string[]>([]);
  const [claseDropdownOpen, setClaseDropdownOpen] = useState<boolean>(false);
  const claseDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (respDropdownRef.current && !respDropdownRef.current.contains(e.target as Node)) {
        setRespDropdownOpen(false);
      }
      if (sectorDropdownRef.current && !sectorDropdownRef.current.contains(e.target as Node)) {
        setSectorDropdownOpen(false);
      }
      if (claseDropdownRef.current && !claseDropdownRef.current.contains(e.target as Node)) {
        setClaseDropdownOpen(false);
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

  // Mapa de traslados viables recibidos (desde Quito para el Resumen C2000)
  const viableTransfersMap = useMemo(() => {
    const map = new Map<string, number>();
    trasladosViables.forEach(item => {
      const key = `${item.CodMaterial}|${item.mes}`;
      map.set(key, (map.get(key) || 0) + item.cantidad);
    });
    return map;
  }, [trasladosViables]);

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
      
      // Lógica de corrección: Sólo sumar necesidades si el material se produce en este centro
      const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const seProduceAqui = isCentro1000 || !esClaseF;

      if (seProduceAqui) {
        const necesidad = computeNecesidadesLocal(row);
        mapa[key].necesidades += necesidad;
      }
      mapa[key].count += 1;
    });
    
    return mapa;
  }, [datos, trasladosMap, isCentro1000]);

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
    
    let registrosLinea = tiempoCanon.data.filter((item: any) => {
      const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
      const itemCentro = String(item?.centro ?? item?.Centro ?? '');
      const lineaMatches = nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      const centroMatches = centroCodigo === '' || itemCentro === centroCodigo;
      return lineaMatches && centroMatches;
    });
    
    if (registrosLinea.length === 0 && centroCodigo !== '') {
      registrosLinea = tiempoCanon.data.filter((item: any) => {
        const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
        return nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      });
    }

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

    let maxFrequencia = 0;
    let puestoBotellaDato: any = null;
    estacionesMap.forEach(({ count, dato }) => {
      if (count > maxFrequencia) {
        maxFrequencia = count;
        puestoBotellaDato = dato;
      }
    });

    if (!puestoBotellaDato) return null;

    return {
      minutos_horario_normal: safeNumber(puestoBotellaDato?.minutos_horario_normal_TOTAL ?? 0),
      minutos_con_extras: safeNumber(puestoBotellaDato?.minutos_extras_TOTAL ?? 0),
      minutos_fin_semana: safeNumber(puestoBotellaDato?.minutos_sabado_TOTAL ?? 0),
      minutos_horario_normal_total: safeNumber(puestoBotellaDato?.minutos_horario_normal_TOTAL ?? 0),
      diasLaborables: tiempoCanon.diasLaborables,
      diasSabados: tiempoCanon.diasSabados
    };
  };

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

    const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
    const seProduceAqui = isCentro1000 || !esClaseF;

    if (seProduceAqui) {
      sumaTiempoNecPorLinea[key] = (sumaTiempoNecPorLinea[key] || 0) + tiempoTotalNecesidad;
    }

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
    
    const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
    const seProduceAqui = isCentro1000 || !esClaseF;

    let participacionIndividual = 0;
    if (seProduceAqui) {
      const mapaLinea = mapaAgrupamiento[key];
      const sumaNecesidadesEnLinea = mapaLinea?.necesidades ?? necesidad;
      participacionIndividual = sumaNecesidadesEnLinea > 0 
        ? (necesidad / sumaNecesidadesEnLinea) * 100 
        : 0;
    }
    
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    
    const tiempoTotalNecesidad = seProduceAqui ? tiempoUnitarioPorPuesto * necesidad : 0;
    const tiempoDisp = obtenerTiempoDisponible(mes, linea, row.PuestoCuellodeBottella, row.Centro);
    
    let necesidadMaximaAFabricar = 0;
    let horasExtrasUsadas = 0;
    let tMaxProm = 0;
    let tiempoParaMaterial = 0;
    let minutosDisponiblesJornadaNormal = 0;
    let necesidadMaximaProducirJornadaNormal = 0;
    
    if (forzarTrasladoTotal || !seProduceAqui) {
      necesidadMaximaAFabricar = 0;
      tMaxProm = 0;
      horasExtrasUsadas = 0;
      minutosDisponiblesJornadaNormal = 0;
      necesidadMaximaProducirJornadaNormal = 0;
    } else if (tiempoDisp && tiempoPorUnidad > 0) {
      let tiempoConsumidoPrevio = tiempoConsumidoAnterior[key] || 0;
      
      if (tiempoConsumidoPrevio === 0 && Object.keys(tiempoConsumidoAnterior).length > 0) {
        const mesNum = parseInt(mes);
        const mesNombre = !isNaN(mesNum) && MONTH_NAMES[mesNum] ? MONTH_NAMES[mesNum] : mes;
        const keyAlternativa1 = `${mesNombre}|${linea}`;
        const keyAlternativa2 = `${mesNum}|${linea}`;
        tiempoConsumidoPrevio = tiempoConsumidoAnterior[keyAlternativa1] || 
                                tiempoConsumidoAnterior[keyAlternativa2] || 0;
      }
      
      const tiempoMaxDisponibleBase = tiempoDisp.minutos_horario_normal;
      const tiempoMaxDisponibleReal = Math.max(0, tiempoMaxDisponibleBase - tiempoConsumidoPrevio);
      tiempoParaMaterial = (participacionIndividual / 100) * tiempoMaxDisponibleReal;
      minutosDisponiblesJornadaNormal = (participacionIndividual / 100) * tiempoMaxDisponibleBase;
      
      const sumaTiempoNecLinea = sumaTiempoNecPorLinea[key] || 0;
      
      if (sumaTiempoNecLinea <= tiempoMaxDisponibleBase) {
        necesidadMaximaAFabricar = necesidad;
        necesidadMaximaProducirJornadaNormal = necesidad;
      } else {
        necesidadMaximaAFabricar = Math.min(necesidad, tiempoUnitarioPorPuesto > 0 
          ? Math.floor(minutosDisponiblesJornadaNormal / tiempoUnitarioPorPuesto) 
          : 0);
        necesidadMaximaProducirJornadaNormal = necesidadMaximaAFabricar;
      }
      
      tMaxProm = tiempoUnitarioPorPuesto * necesidadMaximaAFabricar;
    }
    
    const deficitJornadaNormal = Math.max(0, necesidad - necesidadMaximaProducirJornadaNormal);
    const tiempoTotalNecesidadDeficitJN = seProduceAqui ? (deficitJornadaNormal * tiempoUnitarioPorPuesto) : 0;
    
    // Buscar traslados viables (si aplica)
    const _trasladosViablesARecibir = !isCentro1000 ? (viableTransfersMap.get(`${row.CodMaterial}|${mes}`) || 0) : 0;

    return {
      ...row,
      _necesidad: necesidad,
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
      _trasladosViablesARecibir,
      horasExtrasUsadas: '0.00',
      horasExtrasDetalle: '-',
      mesRef: mes,
      lineaRef: linea
    };
  };

  const datosEnriquecidosBase = useMemo(() => {
    const enriquecidos = datos.map(enriquecerFila);
    
    const sumaDeficitJNPorLinea: { [k: string]: number } = {};
    const sumaTiempoNecDeficitJNPorLinea: { [k: string]: number } = {};
    enriquecidos.forEach(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const seProduceAqui = isCentro1000 || !esClaseF;

      if (seProduceAqui) {
        sumaDeficitJNPorLinea[key] = (sumaDeficitJNPorLinea[key] || 0) + (row.deficitJornadaNormal ?? 0);
        sumaTiempoNecDeficitJNPorLinea[key] = (sumaTiempoNecDeficitJNPorLinea[key] || 0) + (row.tiempoTotalNecesidadDeficitJN ?? 0);
      }
    });
    
    const conSeccion2 = enriquecidos.map(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const seProduceAqui = isCentro1000 || !esClaseF;

      const sumaDeficitJNLinea = sumaDeficitJNPorLinea[key] || 0;
      const poolHE = poolMinutosHEPorLinea[key] || 0;
      
      const participacionDeficitJN = (seProduceAqui && sumaDeficitJNLinea > 0)
        ? (row.deficitJornadaNormal / sumaDeficitJNLinea) * 100
        : 0;
      
      const minutosDisponiblesHorasExtras = (participacionDeficitJN / 100) * poolHE;
      
      let necesidadMaximaProducirHorasExtras = 0;
      const sumaTiempoNecDeficitJNLinea = sumaTiempoNecDeficitJNPorLinea[key] || 0;

      if (seProduceAqui) {
        if (sumaTiempoNecDeficitJNLinea <= poolHE && sumaTiempoNecDeficitJNLinea > 0) {
          necesidadMaximaProducirHorasExtras = row.deficitJornadaNormal;
        } else if (sumaTiempoNecDeficitJNLinea > poolHE) {
          necesidadMaximaProducirHorasExtras = Math.min(row.deficitJornadaNormal, row.tiempoUnitarioPorPuesto > 0
            ? Math.floor(minutosDisponiblesHorasExtras / row.tiempoUnitarioPorPuesto)
            : 0);
        }
      }
      
      const deficitHorasExtras = Math.max(0, row.deficitJornadaNormal - necesidadMaximaProducirHorasExtras);
      const tiempoTotalNecesidadDeficitHE = seProduceAqui ? (deficitHorasExtras * (row.tiempoUnitarioPorPuesto ?? 0)) : 0;
      
      return {
        ...row,
        participacionDeficitJN,
        minutosDisponiblesHorasExtras,
        necesidadMaximaProducirHorasExtras,
        deficitHorasExtras,
        tiempoTotalNecesidadDeficitHE,
      };
    });
    
    const sumaDeficitHEPorLinea: { [k: string]: number } = {};
    const sumaTiempoNecDeficitHEPorLinea: { [k: string]: number } = {};
    conSeccion2.forEach(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const seProduceAqui = isCentro1000 || !esClaseF;

      if (seProduceAqui) {
        sumaDeficitHEPorLinea[key] = (sumaDeficitHEPorLinea[key] || 0) + (row.deficitHorasExtras ?? 0);
        sumaTiempoNecDeficitHEPorLinea[key] = (sumaTiempoNecDeficitHEPorLinea[key] || 0) + (row.tiempoTotalNecesidadDeficitHE ?? 0);
      }
    });
    
    return conSeccion2.map(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const seProduceAqui = isCentro1000 || !esClaseF;

      const sumaDeficitHELinea = sumaDeficitHEPorLinea[key] || 0;
      const poolSab = poolMinutosSabadosPorLinea[key] || 0;
      
      const participacionDeficitHE = (seProduceAqui && sumaDeficitHELinea > 0)
        ? (row.deficitHorasExtras / sumaDeficitHELinea) * 100
        : 0;
      
      const minutosDisponiblesSabados = (participacionDeficitHE / 100) * poolSab;
      
      let necesidadMaximaProducirSabados = 0;
      const sumaTiempoNecDeficitHELinea = sumaTiempoNecDeficitHEPorLinea[key] || 0;

      if (seProduceAqui) {
        if (sumaTiempoNecDeficitHELinea <= poolSab && sumaTiempoNecDeficitHELinea > 0) {
          necesidadMaximaProducirSabados = row.deficitHorasExtras;
        } else if (sumaTiempoNecDeficitHELinea > poolSab) {
          necesidadMaximaProducirSabados = Math.min(row.deficitHorasExtras, row.tiempoUnitarioPorPuesto > 0
            ? Math.floor(minutosDisponiblesSabados / row.tiempoUnitarioPorPuesto)
            : 0);
        }
      }
      
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
  }, [datos, trasladosMap, isCentro1000, viableTransfersMap]);

  const datosEnriquecidos = useMemo(() => {
    if (forzarTrasladoTotal) return datosEnriquecidosBase;

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

    const deficitPorLinea: { [key: string]: number } = {};
    datosEnriquecidosBase.forEach(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const seProduceAqui = isCentro1000 || !esClaseF;

      if (seProduceAqui) {
        const nec = computeNecesidadesLocal(row);
        const fabricadoActual = safeNumber(row.necesidadMaximaAFabricar ?? 0);
        if (nec > fabricadoActual) {
          const tupp = safeNumber(row.tiempoUnitarioPorPuesto ?? 0);
          deficitPorLinea[key] = (deficitPorLinea[key] || 0) + (nec - fabricadoActual) * tupp;
        }
      }
    });

    const extrasParaLinea: { [key: string]: { minutosAdicionales: number; horasConsumidas: number; detalle: string } } = {};
    Object.entries(deficitPorLinea).forEach(([key, deficit]) => {
      const disponible = poolMinutos[key] || 0;
      if (disponible <= 0 || deficit <= 0) return;

      const incrementoMin = maxExtrasHoras * 60;
      let consumido = 0;
      while (consumido < deficit && consumido < disponible) {
        consumido = Math.min(consumido + incrementoMin, disponible);
      }

      if (consumido <= 0) return;

      const tc = tcPorKey[key];
      const detalle = tc ? computarDetalleConsumoInMemoria(tc, consumido, maxExtrasHoras, horasExtrasFin) : `${(consumido/60).toFixed(1)}h`;
      extrasParaLinea[key] = { minutosAdicionales: consumido, horasConsumidas: consumido / 60, detalle };
    });

    return datosEnriquecidosBase.map(row => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const extras = extrasParaLinea[key];
      if (!extras || extras.minutosAdicionales === 0) return row;

      const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const seProduceAqui = isCentro1000 || !esClaseF;

      if (!seProduceAqui) return row;

      const necesidad = computeNecesidadesLocal(row);
      const fabricadoActual = safeNumber(row.necesidadMaximaAFabricar ?? 0);
      const participacion = safeNumber(row.participacionIndividual ?? 0);
      const tupp = safeNumber(row.tiempoUnitarioPorPuesto ?? 0);

      if (necesidad <= fabricadoActual) {
        return { ...row, horasExtrasDetalle: extras.detalle, horasExtrasTotalLinea: (extras.horasConsumidas).toFixed(1) };
      }

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
  }, [datosEnriquecidosBase, forzarTrasladoTotal, maxExtrasHoras, horasExtrasFin, tiemposCanon, isCentro1000]);

  const filasCalculadas = useMemo(() =>
    datosEnriquecidos.map((row: any) => {
      const _traslado  = trasladosMap.get(String(row.CodMaterial ?? '')) || 0;
      const _necPropia = Math.max(0, safeNumber(row.UnidadesProyectado??0) - safeNumber(row.StockActual??0) + safeNumber(row.StockSeguridad??0));
      const _necesidad = _necPropia + _traslado;
      const _prodViable = safeNumber(row.necesidadMaximaProducirJornadaNormal??0)
                        + safeNumber(row.necesidadMaximaProducirHorasExtras??0)
                        + safeNumber(row.necesidadMaximaProducirSabados??0);
      const _deficitGeneral = Math.max(0, _necesidad - _prodViable);
      const _ratioTraslado = _necesidad > 0 ? _traslado / _necesidad : 0;
      const _ratioPropia   = _necesidad > 0 ? _necPropia / _necesidad : 0;
      const _envioC2000    = Math.round(_prodViable * _ratioTraslado);
      const _quedaC1000    = Math.round(_prodViable * _ratioPropia);
      const _deficitNeto2000 = Math.max(0, _deficitGeneral - row._trasladosViablesARecibir);
      return { ...row, _traslado, _necPropia, _necesidad, _prodViable,
               _deficitGeneral, _envioC2000, _quedaC1000, _deficitNeto2000 };
    })
  , [datosEnriquecidos, trasladosMap]);

  const lastComputedJsonRef = useRef<string>('');
  useEffect(() => {
    if (!onComputedDataReady) return;
    const json = JSON.stringify(filasCalculadas.map(r => ({
      mesRef: r.mesRef, lineaRef: r.lineaRef,
      ClaseAprovisionam: r.ClaseAprovisionam,
      _necesidad: r._necesidad, _prodViable: r._prodViable, _deficitGeneral: r._deficitGeneral,
      _traslado: r._traslado, _necPropia: r._necPropia,
      _envioC2000: r._envioC2000, _quedaC1000: r._quedaC1000,
      _deficitNeto2000: r._deficitNeto2000,
      tiempoTotalNecesidad: r.tiempoTotalNecesidad,
      tiempoUnitarioPorPuesto: r.tiempoUnitarioPorPuesto,
      TiempoPorUnidad: r.TiempoPorUnidad,
      necesidadMaximaProducirJornadaNormal: r.necesidadMaximaProducirJornadaNormal,
      necesidadMaximaProducirHorasExtras: r.necesidadMaximaProducirHorasExtras,
      necesidadMaximaProducirSabados: r.necesidadMaximaProducirSabados,
      horasExtrasUsadas: r.horasExtrasUsadas,
      horasExtrasDetalle: r.horasExtrasDetalle,
      PuestoCuellodeBottella: r.PuestoCuellodeBottella,
      NombRespControlProd: r.NombRespControlProd, RespCtrlProd: r.RespCtrlProd,
    })));
    if (json === lastComputedJsonRef.current) return;
    lastComputedJsonRef.current = json;
    onComputedDataReady(filasCalculadas);
  }, [filasCalculadas, onComputedDataReady]);

  const lastTransferJsonRef = useRef<string>('');
  useEffect(() => {
    if (!onTransferNeedsCalculated) return;
    const transferNeedsMapByMes = new Map<string, number>();

    filasCalculadas.forEach((row: any) => {
      const codMaterial = String(row.CodMaterial ?? '');
      const mes = String(row.mesRef ?? row.Mes ?? '');
      const key = `${codMaterial}|${mes}`;
      const necesidadTraslado = safeNumber(row._deficitGeneral ?? 0);
      if (necesidadTraslado > 0) {
        if (!transferNeedsMapByMes.has(key) || transferNeedsMapByMes.get(key)! < necesidadTraslado) {
          transferNeedsMapByMes.set(key, necesidadTraslado);
        }
      }
    });

    const transferNeedsMap = new Map<string, number>();
    transferNeedsMapByMes.forEach((value, key) => {
      const codMaterial = key.split('|')[0];
      transferNeedsMap.set(codMaterial, (transferNeedsMap.get(codMaterial) || 0) + value);
    });

    const transferNeedsArray = Array.from(transferNeedsMap.entries())
      .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
      .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));

    const json = JSON.stringify(transferNeedsArray);
    if (json === lastTransferJsonRef.current) return;
    lastTransferJsonRef.current = json;
    onTransferNeedsCalculated(transferNeedsArray);
  }, [filasCalculadas, onTransferNeedsCalculated]);

  const lineasUnicas = useMemo(() =>
    Array.from(new Set(filasCalculadas.map(r => String(r.lineaRef || r.LineaFabricacion || 'Sin línea').trim()))).sort()
  , [filasCalculadas]);

  const sectoresUnicos = useMemo(() => {
    const conNombre = Array.from(
      new Set(filasCalculadas.map(r => String((r as any).Sector || '').trim()).filter(v => v !== ''))
    ).sort();
    const haySinSector = filasCalculadas.some(r => !String((r as any).Sector || '').trim());
    return haySinSector ? [...conNombre, '(Sin sector)'] : conNombre;
  }, [filasCalculadas]);

  const respCtrlProdUnicos = useMemo(() => {
    const conNombre = Array.from(
      new Set(filasCalculadas.map(r => String(r.NombRespControlProd || r.RespCtrlProd || '').trim()).filter(v => v !== ''))
    ).sort();
    const haySinResponsable = filasCalculadas.some(r => !String(r.NombRespControlProd || r.RespCtrlProd || '').trim());
    return haySinResponsable ? [...conNombre, '(Sin responsable)'] : conNombre;
  }, [filasCalculadas]);
  
  const clasesUnicas = useMemo(() => 
    Array.from(new Set(filasCalculadas.map(r => String(r.ClaseAprovisionam || '').trim().toUpperCase()))).filter(Boolean).sort()
  , [filasCalculadas]);

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
      const claseRow = String(row.ClaseAprovisionam || '').trim().toUpperCase();
      const matchClase = selectedClaseAprov.length === 0 || selectedClaseAprov.includes(claseRow);
      return matchSearchTerm && matchLinea && matchRespCtrlProd && matchSector && matchClase;
    })
  , [filasCalculadas, searchTerm, selectedLinea, selectedRespCtrlProd, selectedSector, selectedClaseAprov]);

  const datosAgrupados = useMemo(() =>
    datosFiltrados.reduce((acc: any, row: any) => {
      const linea = String(row.lineaRef || row.LineaFabricacion || 'Sin línea');
      if (!acc[linea]) acc[linea] = [];
      acc[linea].push(row);
      return acc;
    }, {} as { [key: string]: any[] })
  , [datosFiltrados]);

  const lineasOrdenadas = useMemo(() => Object.keys(datosAgrupados).sort(), [datosAgrupados]);

  const exportSheet = useMemo(() => {
    const result: any[] = [];
    const sum = (arr: any[], field: string) => arr.reduce((s: number, r: any) => s + safeNumber(r[field] ?? 0), 0);
    const rowToExcel = (row: any) => ({
      'Clase': String(row.ClaseAprovisionam || '').trim().toUpperCase(),
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
      ...(isCentro1000 ? { '[RES] Fracción C.2000': row._envioC2000, '[RES] Fracción C.1000': row._quedaC1000 } : { 'Traslados viables a recibir': row._trasladosViablesARecibir, 'Déficit Neto Necesidades 2000': row._deficitNeto2000 }),
      '[RES] Deficit General': row._deficitGeneral,
    });

    lineasOrdenadas.forEach(linea => {
      const filasLinea: any[] = datosAgrupados[linea];
      filasLinea.forEach(row => result.push(rowToExcel(row)));
      const totalNec = filasLinea.reduce((s: number, r: any) => s + safeNumber(r._necesidad ?? 0), 0);
      const totalTrasladosLinea = filasLinea.reduce((s: number, r: any) => s + safeNumber(r._traslado ?? 0), 0);
      const prodViableSub = sum(filasLinea, 'necesidadMaximaProducirJornadaNormal') + sum(filasLinea, 'necesidadMaximaProducirHorasExtras') + sum(filasLinea, 'necesidadMaximaProducirSabados');
      result.push({
        'Clase': '',
        'CodMaterial': `** Subtotal ${linea} **`,
        'Descripcion': '', 'Centro': '', 'Linea': linea, 'Puesto': '', 'N.Puestos': '', 'Sector': '', 'Responsable': '', 'T.Unit/Puestos': '',
        'Traslado C.2000': totalTrasladosLinea,
        'Nec. Propia': Math.floor(totalNec - totalTrasladosLinea),
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
        ...(isCentro1000 ? { '[RES] Fracción C.2000': sum(filasLinea, '_envioC2000'), '[RES] Fracción C.1000': sum(filasLinea, '_quedaC1000') } : { 'Traslados viables a recibir': sum(filasLinea, '_trasladosViablesARecibir'), 'Déficit Neto Necesidades 2000': sum(filasLinea, '_deficitNeto2000') }),
        '[RES] Deficit General': Math.max(0, totalNec - prodViableSub),
      });
    });

    const totalNecGlobal = datosFiltrados.reduce((s: number, r: any) => s + safeNumber(r._necesidad ?? 0), 0);
    const totalTrasladosGlobal = filasCalculadas.reduce((s: number, r: any) => s + safeNumber(r._traslado ?? 0), 0);
    const prodViableGlobal = sum(datosFiltrados, 'necesidadMaximaProducirJornadaNormal') + sum(datosFiltrados, 'necesidadMaximaProducirHorasExtras') + sum(datosFiltrados, 'necesidadMaximaProducirSabados');
    result.push({
      'Clase': '',
      'CodMaterial': `*** TOTAL GENERAL (${datosFiltrados.length} registros) ***`,
      'Descripcion': '', 'Centro': '', 'Linea': '', 'Puesto': '', 'N.Puestos': '', 'Sector': '', 'Responsable': '', 'T.Unit/Puestos': '',
      'Traslado C.2000': totalTrasladosGlobal,
      'Nec. Propia': Math.floor(totalNecGlobal - totalTrasladosGlobal),
      '[JN] NECESIDAD': Math.floor(totalNecGlobal),
      '[JN] T.Total Nec': sum(datosFiltrados, 'tiempoTotalNecesidad'),
      '[JN] Partic.%': '-',
      '[JN] MIN.DISP': sum(datosFiltrados, 'minutosDisponiblesJornadaNormal'),
      '[JN] MAX.PRODUCIR': sum(datosFiltrados, 'complexityUnits'),
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
      ...(isCentro1000 ? { '[RES] Fracción C.2000': sum(datosFiltrados, '_envioC2000'), '[RES] Fracción C.1000': sum(datosFiltrados, '_quedaC1000') } : { 'Traslados viables a recibir': sum(datosFiltrados, '_trasladosViablesARecibir'), 'Déficit Neto Necesidades 2000': sum(datosFiltrados, '_deficitNeto2000') }),
      '[RES] Deficit General': Math.max(0, totalNecGlobal - prodViableGlobal),
    });

    return result;
  }, [datosAgrupados, lineasOrdenadas, datosFiltrados, isCentro1000, filasCalculadas]);

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

          <div className="flex items-center gap-2 relative" ref={claseDropdownRef}>
            <label className="text-sm font-medium text-gray-600">Clase:</label>
            <button
              type="button"
              onClick={() => setClaseDropdownOpen(o => !o)}
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-w-[120px] text-left flex items-center justify-between gap-2"
            >
              <span className="truncate">
                {selectedClaseAprov.length === 0
                  ? 'Todas'
                  : selectedClaseAprov.length === 1
                  ? selectedClaseAprov[0]
                  : `${selectedClaseAprov.length} sel.`}
              </span>
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${claseDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {claseDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 min-w-[150px] max-h-64 overflow-y-auto">
                <div className="p-2 border-b border-gray-100 flex gap-2">
                  <button type="button" onClick={() => setSelectedClaseAprov([])} className="text-xs text-blue-600 hover:underline">Todas</button>
                  <span className="text-gray-300">|</span>
                  <button type="button" onClick={() => setSelectedClaseAprov([...clasesUnicas])} className="text-xs text-blue-600 hover:underline">Todas</button>
                </div>
                {clasesUnicas.map(clase => (
                  <label key={clase} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={selectedClaseAprov.includes(clase)}
                      onChange={e => {
                        setSelectedClaseAprov(prev =>
                          e.target.checked ? [...prev, clase] : prev.filter(c => c !== clase)
                        );
                      }}
                      className="rounded border-gray-300 text-blue-600"
                    />
                    <span className="truncate">{clase}</span>
                  </label>
                ))}
              </div>
            )}
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

          <span className="text-xs text-gray-500">{datosFiltrados.length} de {filasCalculadas.length} registros</span>
          {(searchTerm || selectedLinea || selectedRespCtrlProd.length > 0 || selectedSector.length > 0 || selectedClaseAprov.length > 0) && (
            <button
              type="button"
              onClick={() => { setSearchTerm(''); setSelectedLinea(''); setSelectedRespCtrlProd([]); setSelectedSector([]); setSelectedClaseAprov([]); }}
              className="text-xs text-red-600 hover:text-red-800 hover:underline flex items-center gap-1"
            >
              <svg className="w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
            <tr className="border-b border-gray-300">
              <th colSpan={12} className="px-3 py-2 text-center text-xs font-bold text-gray-700 uppercase bg-gray-100 border-r-2 border-gray-300">Información General</th>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold text-blue-700 uppercase bg-blue-50 border-r-2 border-blue-300">Sección Jornada Normal</th>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold text-green-700 uppercase bg-green-50 border-r-2 border-green-300">Sección Horas Extras (L-V)</th>
              <th colSpan={5} className="px-3 py-2 text-center text-xs font-bold text-orange-700 uppercase bg-orange-50 border-r-2 border-orange-300">Sección Sábados</th>
              <th colSpan={isCentro1000 ? 4 : 5} className="px-3 py-2 text-center text-xs font-bold text-purple-700 uppercase bg-purple-50">Resultados Consolidados</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2 text-left text-xs font-semibold text-gray-600 uppercase">Clase</th>
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
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 uppercase">Necesidad</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 uppercase">T.Total Nec.</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 uppercase">Partic.%</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-600 uppercase">Min.Disp. JN</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-blue-700 uppercase border-r-2 border-blue-300">Máx.Producir JN</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-600 uppercase">Déficit JN</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-600 uppercase">T.Total Nec.</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-600 uppercase">Partic.%</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-600 uppercase">Min.Disp. HE</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-green-700 uppercase border-r-2 border-green-300">Máx.Producir HE</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-600 uppercase">Déficit HE</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-600 uppercase">T.Total Nec.</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-600 uppercase">Partic.%</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-600 uppercase">Min.Disp. Sáb</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-orange-700 uppercase border-r-2 border-orange-300">Máx.Producir Sáb</th>
              <th className="px-2 py-2 text-right text-xs font-semibold text-purple-600 uppercase">Prod.Viable (S1+S2+S3)</th>
              {isCentro1000 ? (
                <>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-teal-600 uppercase">Fracción C.2000</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-cyan-600 uppercase">Fracción C.1000</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-purple-600 uppercase">Déficit General</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-purple-600 uppercase">Déficit General</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-teal-600 uppercase">Traslados viables a recibir</th>
                  <th className="px-2 py-2 text-right text-xs font-semibold text-purple-600 uppercase">Déficit Neto Necesidades 2000</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineasOrdenadas.map((linea) => (
              <React.Fragment key={linea}>
                <tr className="bg-blue-50">
                  <td colSpan={isCentro1000 ? 31 : 32} className="px-4 py-2 font-semibold text-blue-800 text-sm">
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
                      <td className="px-2 py-2 text-sm font-medium text-gray-600">{String(row.ClaseAprovisionam || '-').trim().toUpperCase()}</td>
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
                      <td className="px-2 py-2 text-sm text-right font-mono text-purple-700 font-semibold">
                        {row._prodViable.toLocaleString()}
                      </td>
                      {isCentro1000 ? (
                        <>
                          <td className="px-2 py-2 text-sm text-right font-mono text-teal-700 font-semibold">
                            {row._envioC2000.toLocaleString()}
                          </td>
                          <td className="px-2 py-2 text-sm text-right font-mono text-cyan-700 font-semibold">
                            {row._quedaC1000.toLocaleString()}
                          </td>
                          <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${row._deficitGeneral > 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {row._deficitGeneral.toLocaleString()}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${row._deficitGeneral > 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {row._deficitGeneral.toLocaleString()}
                          </td>
                          <td className="px-2 py-2 text-sm text-right font-mono text-teal-700 font-semibold">
                            {row._trasladosViablesARecibir.toLocaleString()}
                          </td>
                          <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${row._deficitNeto2000 > 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {row._deficitNeto2000.toLocaleString()}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
                {(() => {
                  const filasLinea = datosAgrupados[linea];
                  const f = (field: string) => filasLinea.reduce((s: number, r: any) => s + safeNumber(r[field] ?? 0), 0);
                  const totalNecesidades = filasLinea.reduce((s: number, r: any) => s + safeNumber(r._necesidad ?? 0), 0);
                  const totalTrasladosLinea = filasLinea.reduce((s: number, r: any) => s + safeNumber(r._traslado ?? 0), 0);
                  const totalNecPropiaLinea = totalNecesidades - totalTrasladosLinea;
                  return (
                    <tr className="bg-gray-100 font-semibold">
                      <td colSpan={10} className="px-2 py-2 text-sm text-gray-700">Subtotal {linea}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-teal-700">{totalTrasladosLinea.toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-gray-800 border-r-2 border-gray-300">{Math.floor(totalNecPropiaLinea).toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{Math.floor(totalNecesidades).toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{f('tiempoTotalNecesidad').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{f('participacionIndividual').toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{f('minutosDisponiblesJornadaNormal').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-blue-800 border-r-2 border-blue-300">{f('necesidadMaximaProducirJornadaNormal').toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">{f('deficitJornadaNormal').toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">{f('tiempoTotalNecesidadDeficitJN').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">-</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">{f('minutosDisponiblesHorasExtras').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-green-800 border-r-2 border-green-300">{f('necesidadMaximaProducirHorasExtras').toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">{f('deficitHorasExtras').toLocaleString()}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">{f('tiempoTotalNecesidadDeficitHE').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">-</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">{f('minutosDisponiblesSabados').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                      <td className="px-2 py-2 text-sm text-right font-mono text-orange-800 border-r-2 border-orange-300">{f('necesidadMaximaProducirSabados').toLocaleString()}</td>
                      {(() => {
                        const prodViableSub = f('necesidadMaximaProducirJornadaNormal') + f('necesidadMaximaProducirHorasExtras') + f('necesidadMaximaProducirSabados');
                        const envioC2000Sub = f('_envioC2000');
                        const quedaC1000Sub = f('_quedaC1000');
                        const trasladosRecibidosSub = f('_trasladosViablesARecibir');
                        const deficitNetoSub = f('_deficitNeto2000');
                        const deficitGralSub = Math.max(0, totalNecesidades - prodViableSub);
                        return (
                          <>
                            <td className="px-2 py-2 text-sm text-right font-mono text-purple-800 font-semibold">{prodViableSub.toLocaleString()}</td>
                            {isCentro1000 ? (
                              <>
                                <td className="px-2 py-2 text-sm text-right font-mono text-teal-700 font-semibold">{envioC2000Sub.toLocaleString()}</td>
                                <td className="px-2 py-2 text-sm text-right font-mono text-cyan-700 font-semibold">{quedaC1000Sub.toLocaleString()}</td>
                                <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${deficitGralSub > 0 ? 'text-red-700' : 'text-green-700'}`}>{deficitGralSub.toLocaleString()}</td>
                              </>
                            ) : (
                              <>
                                <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${deficitGralSub > 0 ? 'text-red-700' : 'text-green-700'}`}>{deficitGralSub.toLocaleString()}</td>
                                <td className="px-2 py-2 text-sm text-right font-mono text-teal-700 font-semibold">{trasladosRecibidosSub.toLocaleString()}</td>
                                <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${deficitNetoSub > 0 ? 'text-red-700' : 'text-green-700'}`}>{deficitNetoSub.toLocaleString()}</td>
                              </>
                            )}
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
              const totalTrasladosGlobal = filasCalculadas.reduce((s: number, r: any) => s + safeNumber(r._traslado ?? 0), 0);
              const totalNecPropiaGlobal = totalNecesidadesGlobal - totalTrasladosGlobal;
              return (
                <tr className="bg-gray-800 text-white">
                  <td colSpan={10} className="px-2 py-3 text-sm font-bold">TOTAL GENERAL ({datosFiltrados.length} registros)</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-teal-300">{totalTrasladosGlobal.toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold border-r-2 border-gray-600">{Math.floor(totalNecPropiaGlobal).toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold">{Math.floor(totalNecesidadesGlobal).toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold">{g('tiempoTotalNecesidad').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold">{g('participacionIndividual').toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-blue-300">{g('minutosDisponiblesJornadaNormal').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-blue-300 border-r-2 border-blue-800">{g('necesidadMaximaProducirJornadaNormal').toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300">{g('deficitJornadaNormal').toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300">{g('tiempoTotalNecesidadDeficitJN').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300">-</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300 border-r-2 border-green-800">{g('minutosDisponiblesHorasExtras').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-green-300 border-r-2 border-green-800">{g('necesidadMaximaProducirHorasExtras').toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300">{g('deficitHorasExtras').toLocaleString()}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300">{g('tiempoTotalNecesidadDeficitHE').toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300">-</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300">{g('minutosDisponiblesSabados').toLocaleString(undefined, { maximumFractionDigits: 1 })} min</td>
                  <td className="px-2 py-3 text-sm text-right font-mono font-bold text-orange-300 border-r-2 border-orange-800">{g('necesidadMaximaProducirSabados').toLocaleString()}</td>
                  {(() => {
                    const prodViableTotal = g('necesidadMaximaProducirJornadaNormal') + g('necesidadMaximaProducirHorasExtras') + g('necesidadMaximaProducirSabados');
                    const envioC2000Total = g('_envioC2000');
                    const quedaC1000Total = g('_quedaC1000');
                    const trasladosViablesTotal = g('_trasladosViablesARecibir');
                    const deficitNetoTotal = g('_deficitNeto2000');
                    const deficitGralTotal = Math.max(0, totalNecesidadesGlobal - prodViableTotal);
                    return (
                      <>
                        <td className="px-2 py-3 text-sm text-right font-mono font-bold text-purple-300">{prodViableTotal.toLocaleString()}</td>
                        {isCentro1000 ? (
                          <>
                            <td className="px-2 py-3 text-sm text-right font-mono font-bold text-teal-300">{envioC2000Total.toLocaleString()}</td>
                            <td className="px-2 py-3 text-sm text-right font-mono font-bold text-cyan-300">{quedaC1000Total.toLocaleString()}</td>
                            <td className={`px-2 py-3 text-sm text-right font-mono font-bold ${deficitGralTotal > 0 ? 'text-red-300' : 'text-green-300'}`}>{deficitGralTotal.toLocaleString()}</td>
                          </>
                        ) : (
                          <>
                            <td className={`px-2 py-3 text-sm text-right font-mono font-bold ${deficitGralTotal > 0 ? 'text-red-300' : 'text-green-300'}`}>{deficitGralTotal.toLocaleString()}</td>
                            <td className="px-2 py-3 text-sm text-right font-mono font-bold text-teal-300">{trasladosViablesTotal.toLocaleString()}</td>
                            <td className={`px-2 py-3 text-sm text-right font-mono font-bold ${deficitNetoTotal > 0 ? 'text-red-300' : 'text-green-300'}`}>{deficitNetoTotal.toLocaleString()}</td>
                          </>
                        )}
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
