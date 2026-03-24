'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, generarFilasHorasExtras, guardarHorasExtrasEnStorage, obtenerHorasExtrasDeStorage, consumirHorasExtras, exportToXLSXMultiSheet } from './utils';
import { TiempoCanonResult, TransferNeed, HorasExtrasPorMesCentro } from './types';
import { BottleneckSummaryTable } from './BottleneckSummaryTable';
import { BottleneckClassTable } from './BottleneckClassTable';

// Función para normalizar y limpiar valores de clase de aprovisionamiento
function normalizarClase(valor: any): string {
  return String(valor || '').trim().toUpperCase();
}

// Función compartida: enriquecer datos de una clase con participación, necesidad máxima, etc.
// minutosExtrasPorLinea: resultado de consumir horas extras del pool, indexado por "mes|linea"
function enriquecerDatosClase(
  datos: any[],
  tiemposCanon: any[],
  tiempoConsumidoAnterior: { [mesLinea: string]: number } = {},
  minutosExtrasPorLinea: { [mesLinea: string]: number } = {},
  trasladosMap: Map<string, number> = new Map()
) {
  const computeNec = (row: any) => {
    const up = safeNumber(row.UnidadesProyectado ?? 0);
    const ss = safeNumber(row.StockSeguridad ?? 0);
    const sa = safeNumber(row.StockActual ?? 0);
    const necesidadPropia = Math.max(0, up - sa + ss);
    const traslado = trasladosMap.get(String(row.CodMaterial ?? '')) || 0;
    return necesidadPropia + traslado;
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
      if (found) return found;
    }
    return null;
  };

  const normalizarLinea = (linea: string): string => {
    return String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
  };

  // PASO 1: Construir tabla de agrupación (Centro|Línea|PuestoTrabajo → Suma Tiempo_Total)
  const tablaTiempos = new Map<string, number>();
  
  datos.forEach(row => {
    const necesidad = computeNec(row);
    if (necesidad === 0) return;
    
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    
    const tiempoTotalMaterial = tiempoUnitarioPorPuesto * necesidad;
    
    const centro = String(row.Centro ?? '');
    const linea = String(row.LineaFabricacion ?? '');
    const puesto = String(row.PuestoTrabajo ?? '');
    const key = `${centro}|${linea}|${puesto}`;
    
    const tiempoActual = tablaTiempos.get(key) || 0;
    tablaTiempos.set(key, tiempoActual + tiempoTotalMaterial);
  });

  // PASO 2: Identificar cuello de botella por (Centro, Línea) - el puesto con mayor suma
  const cuellosDeBottella = new Map<string, string>();
  
  tablaTiempos.forEach((tiempo, key) => {
    const [centro, linea, puesto] = key.split('|');
    const lineaKey = `${centro}|${linea}`;
    
    const actualPuesto = cuellosDeBottella.get(lineaKey);
    let actualTiempo = 0;
    if (actualPuesto) {
      const actualKey = `${centro}|${linea}|${actualPuesto}`;
      actualTiempo = tablaTiempos.get(actualKey) || 0;
    }
    
    if (tiempo > actualTiempo) {
      cuellosDeBottella.set(lineaKey, puesto);
    }
  });

  // PASO 3: Función para obtener minutos_horario_normal_TOTAL del cuello de botella
  const obtenerTiempoDisp = (mes: string, centro: string, linea: string, puestoTrabajo: string) => {
    const tc = buscarTiempoCanon(mes);
    if (!tc || !tc.data || !Array.isArray(tc.data)) return null;

    const lineaNorm = normalizarLinea(linea);
    const puestoNorm = String(puestoTrabajo).toLowerCase().trim();
    const centroCodigo = String(centro).trim();
    
    const registro = tc.data.find((item: any) => {
      const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
      const itemCentro = String(item?.centro ?? item?.Centro ?? '');
      const nombreEstacion = String(item?.nombre_estacion ?? '').toLowerCase().trim();
      
      const lineaMatches = nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      const centroMatches = centroCodigo === '' || itemCentro === centroCodigo;
      const puestoMatches = nombreEstacion === puestoNorm || nombreEstacion.includes(puestoNorm) || puestoNorm.includes(nombreEstacion);
      
      return lineaMatches && centroMatches && puestoMatches;
    });

    if (!registro) return null;

    return {
      minutos_horario_normal: safeNumber(registro?.minutos_horario_normal_TOTAL ?? 0),
      diasLaborables: tc.diasLaborables,
      diasSabados: tc.diasSabados
    };
  };

  // Mapa de necesidades por línea para participación
  const mapa: { [k: string]: number } = {};
  datos.forEach(row => {
    const k = `${String(row.Mes ?? 'Sin mes')}|${String(row.LineaFabricacion ?? 'Sin línea')}`;
    mapa[k] = (mapa[k] || 0) + computeNec(row);
  });

  // Calcular suma de T. Total Necesidad Inicial por (mes, línea)
  // y T. Disponible global = normal - consumido_anterior + extras_consumidos
  const sumaTiempoNecPorLinea: { [k: string]: number } = {};
  const tiempoDispGlobalPorLinea: { [k: string]: number } = {};

  datos.forEach(row => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const centro = String(row.Centro ?? '');
    const key = `${mes}|${linea}`;
    const necesidad = computeNec(row);
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    const tiempoTotalNecesidad = tiempoUnitarioPorPuesto * necesidad;

    sumaTiempoNecPorLinea[key] = (sumaTiempoNecPorLinea[key] || 0) + tiempoTotalNecesidad;

    if (tiempoDispGlobalPorLinea[key] === undefined) {
      const lineaKey = `${centro}|${linea}`;
      const puestoBotella = cuellosDeBottella.get(lineaKey) || 'DESCONOCIDO';
      const tiempoDisp = obtenerTiempoDisp(mes, centro, linea, puestoBotella);
      const tiempoConsumidoPrevio = tiempoConsumidoAnterior[key] || 0;
      const minutosExtras = minutosExtrasPorLinea[key] || 0;
      const base = tiempoDisp?.minutos_horario_normal ?? 0;
      // Tiempo disponible total = normal - consumido_por_clase_anterior + extras_consumidos_de_pool
      tiempoDispGlobalPorLinea[key] = Math.max(0, base - tiempoConsumidoPrevio + minutosExtras);
    }
  });

  // PASO 4: Procesar cada registro
  return datos.map(row => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const centro = String(row.Centro ?? '');
    const key = `${mes}|${linea}`;
    
    const necesidad = computeNec(row);
    const sumaNecLinea = mapa[key] ?? necesidad;
    const participacionIndividual = sumaNecLinea > 0 ? (necesidad / sumaNecLinea) * 100 : 0;
    
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    const tiempoTotalNecesidad = tiempoUnitarioPorPuesto * necesidad;
    
    const lineaKey = `${centro}|${linea}`;
    const puestoBotella = cuellosDeBottella.get(lineaKey) || 'DESCONOCIDO';
    const tiempoDisp = obtenerTiempoDisp(mes, centro, linea, puestoBotella);

    let necesidadMaximaAFabricar = 0;
    let horasExtrasUsadas = 0;
    let tiempoParaMaterial = 0;

    if (tiempoDisp && tiempoPorUnidad > 0) {
      const tiempoConsumidoPrevio = tiempoConsumidoAnterior[key] || 0;
      const minutosExtrasLinea = minutosExtrasPorLinea[key] || 0;

      const tiempoNormalBase = tiempoDisp.minutos_horario_normal;
      const tiempoNormalReal = Math.max(0, tiempoNormalBase - tiempoConsumidoPrevio);
      
      // Tiempo total disponible para esta línea = normal + extras consumidos del pool
      const tiempoTotalDisponibleLinea = tiempoNormalReal + minutosExtrasLinea;
      
      // Tiempo asignado a este material según su participación
      tiempoParaMaterial = (participacionIndividual / 100) * tiempoTotalDisponibleLinea;
      
      const sumaTiempoNecLinea = sumaTiempoNecPorLinea[key] || 0;
      const tiempoDispGlobal = tiempoDispGlobalPorLinea[key] || 0;
      
      if (sumaTiempoNecLinea <= tiempoDispGlobal) {
        necesidadMaximaAFabricar = necesidad;
      } else {
        necesidadMaximaAFabricar = tiempoUnitarioPorPuesto > 0 
          ? Math.floor(tiempoParaMaterial / tiempoUnitarioPorPuesto) 
          : 0;
      }

      // Horas extras usadas = parte proporcional de los minutos extras que le corresponden a este material
      const minutosExtrasMaterial = (participacionIndividual / 100) * minutosExtrasLinea;
      horasExtrasUsadas = minutosExtrasMaterial / 60;
    }

    return {
      ...row,
      participacionIndividual,
      tiempoTotalNecesidad,
      tiempoParaMaterial,
      necesidadMaximaAFabricar,
      horasExtrasUsadas: horasExtrasUsadas.toFixed(2),
      mesRef: mes,
      lineaRef: linea,
      puestoBotella,
      centro
    };
  });
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
  // =====================================================
  // === TODOS LOS HOOKS AL INICIO (antes de returns) ===
  // =====================================================
  
  const [transferNeedsE, setTransferNeedsE] = useState<TransferNeed[]>([]);
  const [transferNeedsX, setTransferNeedsX] = useState<TransferNeed[]>([]);
  const [transferNeedsF, setTransferNeedsF] = useState<TransferNeed[]>([]);
  // Export sheets capturados desde BottleneckClassTable (tienen todos los cálculos correctos)
  const [exportSheetEData, setExportSheetEData] = useState<any[]>([]);
  const [exportSheetXData, setExportSheetXData] = useState<any[]>([]);

  // Filtros tabla F
  const [fSearchTerm, setFSearchTerm] = useState<string>('');
  const [fSelectedLinea, setFSelectedLinea] = useState<string>('');
  const [fSelectedResp, setFSelectedResp] = useState<string[]>([]);
  const [fRespDropdownOpen, setFRespDropdownOpen] = useState<boolean>(false);
  const fRespDropdownRef = useRef<HTMLDivElement>(null);
  const [fSelectedSector, setFSelectedSector] = useState<string[]>([]);
  const [fSectorDropdownOpen, setFSectorDropdownOpen] = useState<boolean>(false);
  const fSectorDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fRespDropdownRef.current && !fRespDropdownRef.current.contains(e.target as Node)) {
        setFRespDropdownOpen(false);
      }
      if (fSectorDropdownRef.current && !fSectorDropdownRef.current.contains(e.target as Node)) {
        setFSectorDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Minutos extras consumidos del pool de horas extras, indexado por "mes|linea"
  // Se calcula en useEffect y se usa en el enriquecimiento final
  const [minutosExtrasE, setMinutosExtrasE] = useState<{ [mesLinea: string]: number }>({});
  const [minutosExtrasX, setMinutosExtrasX] = useState<{ [mesLinea: string]: number }>({});
  
  // Función para calcular necesidad
  const computeNecesidad = (row: any) => {
    const up = safeNumber(row.UnidadesProyectado ?? 0);
    const ss = safeNumber(row.StockSeguridad ?? 0);
    const sa = safeNumber(row.StockActual ?? 0);
    return Math.max(0, up - sa + ss);
  };

  // Filtrar centro 2000
  const filteredDataCentro2000 = useMemo(() => {
    return data.filter(row => 
      String(row.Centro) === '2000'
    );
  }, [data]);

  // Filtrar por clases (todo en hooks)
  const dataE = useMemo(() => {
    return filteredDataCentro2000.filter(row => 
      normalizarClase(row.ClaseAprovisionam) === 'E'
    );
  }, [filteredDataCentro2000]);

  const dataX = useMemo(() => {
    return filteredDataCentro2000.filter(row => 
      normalizarClase(row.ClaseAprovisionam) === 'X'
    );
  }, [filteredDataCentro2000]);

  const dataF = useMemo(() => {
    return filteredDataCentro2000.filter(row => 
      normalizarClase(row.ClaseAprovisionam) === 'F'
    );
  }, [filteredDataCentro2000]);

  // PRE-PASS: enriquecer sin extras para calcular déficit por línea
  const datosEnriquecidosEBase = useMemo(() => {
    return enriquecerDatosClase(dataE, tiemposCanon, {}, {});
  }, [dataE, tiemposCanon]);

  // useEffect: INIT localStorage + consumir extras para clase E (en secuencia garantizada)
  useEffect(() => {
    if (typeof window === 'undefined' || datosEnriquecidosEBase.length === 0 || tiemposCanon.length === 0) return;

    // PASO 1: Inicializar estructura localStorage para cada mes|linea
    const lineasPorMes = new Map<string, Set<string>>();
    datosEnriquecidosEBase.forEach((row: any) => {
      const mes = String(row.mesRef ?? '');
      const linea = String(row.lineaRef ?? '');
      if (!mes || !linea) return;
      if (!lineasPorMes.has(mes)) lineasPorMes.set(mes, new Set());
      lineasPorMes.get(mes)!.add(linea);
    });

    lineasPorMes.forEach((lineas, mes) => {
      const tc = tiemposCanon.find(t => t.mes === mes || String(t.mesNumero) === mes);
      if (!tc) return;
      const centro = '2000';
      const stored = obtenerHorasExtrasDeStorage(mes, centro);
      const filasBase = generarFilasHorasExtras(tc.diasLaborables ?? 0, tc.diasSabados ?? 0, maxExtrasHoras, horasExtrasFin);
      if (!stored) {
        const nueva: HorasExtrasPorMesCentro = { mes, centro, lineas: {} };
        lineas.forEach(l => { nueva.lineas[l] = JSON.parse(JSON.stringify(filasBase)); });
        guardarHorasExtrasEnStorage(nueva);
      } else {
        let actualizado = false;
        lineas.forEach(l => {
          if (!stored.lineas[l]) { stored.lineas[l] = JSON.parse(JSON.stringify(filasBase)); actualizado = true; }
        });
        if (actualizado) guardarHorasExtrasEnStorage(stored);
      }
    });

    // PASO 2: Calcular déficit y consumir del pool (ahora sí existe en localStorage)
    const deficitPorLinea: { [key: string]: { mes: string; centro: string; linea: string; minutos: number } } = {};
    datosEnriquecidosEBase.forEach((row: any) => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      if (!deficitPorLinea[key]) {
        deficitPorLinea[key] = { mes: String(row.mesRef ?? ''), centro: '2000', linea: String(row.lineaRef ?? ''), minutos: 0 };
      }
      const deficit = Math.max(0, safeNumber(row.tiempoTotalNecesidad ?? 0) - safeNumber(row.tiempoParaMaterial ?? 0));
      deficitPorLinea[key].minutos += deficit;
    });

    const nuevosExtras: { [key: string]: number } = {};
    Object.values(deficitPorLinea).forEach(({ mes, centro, linea, minutos }) => {
      if (minutos <= 0) return;
      const resultado = consumirHorasExtras(mes, centro, linea, minutos, maxExtrasHoras, true);
      if (resultado.minutosAdicionales > 0) {
        nuevosExtras[`${mes}|${linea}`] = resultado.minutosAdicionales;
        console.log(`[HorasExtras E] ${linea}/${mes}: déficit ${minutos.toFixed(0)}min → +${resultado.minutosAdicionales}min (${resultado.detalleConsumo.join(', ')})`);
      }
    });

    setMinutosExtrasE(nuevosExtras);
  }, [datosEnriquecidosEBase, tiemposCanon, maxExtrasHoras, horasExtrasFin]);

  // PASS FINAL: enriquecer con extras ya consumidos
  const datosEnriquecidosE = useMemo(() => {
    return enriquecerDatosClase(dataE, tiemposCanon, {}, minutosExtrasE);
  }, [dataE, tiemposCanon, minutosExtrasE]);

  const tiempoConsumidoPorE = useMemo(() => {
    const result: { [mesLinea: string]: number } = {};
    datosEnriquecidosE.forEach((row: any) => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
      result[key] = (result[key] || 0) + (row.necesidadMaximaAFabricar * tiempoPorUnidad);
    });
    return result;
  }, [datosEnriquecidosE]);

  // PRE-PASS clase X sin extras
  const datosEnriquecidosXBase = useMemo(() => {
    return enriquecerDatosClase(dataX, tiemposCanon, tiempoConsumidoPorE, {});
  }, [dataX, tiemposCanon, tiempoConsumidoPorE]);

  // useEffect: INIT localStorage + consumir extras para clase X (en secuencia garantizada)
  useEffect(() => {
    if (typeof window === 'undefined' || datosEnriquecidosXBase.length === 0 || tiemposCanon.length === 0) return;

    // PASO 1: Asegurar estructura localStorage para líneas de X (puede que ya exista de E)
    const lineasPorMes = new Map<string, Set<string>>();
    datosEnriquecidosXBase.forEach((row: any) => {
      const mes = String(row.mesRef ?? '');
      const linea = String(row.lineaRef ?? '');
      if (!mes || !linea) return;
      if (!lineasPorMes.has(mes)) lineasPorMes.set(mes, new Set());
      lineasPorMes.get(mes)!.add(linea);
    });

    lineasPorMes.forEach((lineas, mes) => {
      const tc = tiemposCanon.find(t => t.mes === mes || String(t.mesNumero) === mes);
      if (!tc) return;
      const centro = '2000';
      const stored = obtenerHorasExtrasDeStorage(mes, centro);
      const filasBase = generarFilasHorasExtras(tc.diasLaborables ?? 0, tc.diasSabados ?? 0, maxExtrasHoras, horasExtrasFin);
      if (!stored) {
        const nueva: HorasExtrasPorMesCentro = { mes, centro, lineas: {} };
        lineas.forEach(l => { nueva.lineas[l] = JSON.parse(JSON.stringify(filasBase)); });
        guardarHorasExtrasEnStorage(nueva);
      } else {
        let actualizado = false;
        lineas.forEach(l => {
          if (!stored.lineas[l]) { stored.lineas[l] = JSON.parse(JSON.stringify(filasBase)); actualizado = true; }
        });
        if (actualizado) guardarHorasExtrasEnStorage(stored);
      }
    });

    // PASO 2: Calcular déficit y consumir lo que queda del pool tras clase E
    const deficitPorLinea: { [key: string]: { mes: string; centro: string; linea: string; minutos: number } } = {};
    datosEnriquecidosXBase.forEach((row: any) => {
      const key = `${row.mesRef}|${row.lineaRef}`;
      if (!deficitPorLinea[key]) {
        deficitPorLinea[key] = { mes: String(row.mesRef ?? ''), centro: '2000', linea: String(row.lineaRef ?? ''), minutos: 0 };
      }
      const deficit = Math.max(0, safeNumber(row.tiempoTotalNecesidad ?? 0) - safeNumber(row.tiempoParaMaterial ?? 0));
      deficitPorLinea[key].minutos += deficit;
    });

    const nuevosExtras: { [key: string]: number } = {};
    Object.values(deficitPorLinea).forEach(({ mes, centro, linea, minutos }) => {
      if (minutos <= 0) return;
      const resultado = consumirHorasExtras(mes, centro, linea, minutos, maxExtrasHoras, true);
      if (resultado.minutosAdicionales > 0) {
        nuevosExtras[`${mes}|${linea}`] = resultado.minutosAdicionales;
        console.log(`[HorasExtras X] ${linea}/${mes}: déficit ${minutos.toFixed(0)}min → +${resultado.minutosAdicionales}min (${resultado.detalleConsumo.join(', ')})`);
      }
    });

    setMinutosExtrasX(nuevosExtras);
  }, [datosEnriquecidosXBase, tiemposCanon, maxExtrasHoras, horasExtrasFin]);

  const datosEnriquecidosX = useMemo(() => {
    return enriquecerDatosClase(dataX, tiemposCanon, tiempoConsumidoPorE, minutosExtrasX);
  }, [dataX, tiemposCanon, tiempoConsumidoPorE, minutosExtrasX]);

  // Consolidar traslados
  const transferNeedsConsolidated = useMemo(() => {
    const consolidated = new Map<string, number>();
    const porClase = { E: 0, X: 0, F: 0, totalE: 0, totalX: 0, totalF: 0 };
    
    transferNeedsE.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
      porClase.totalE += item.necesidadTraslado;
    });
    porClase.E = transferNeedsE.length;
    
    transferNeedsX.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
      porClase.totalX += item.necesidadTraslado;
    });
    porClase.X = transferNeedsX.length;

    transferNeedsF.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
      porClase.totalF += item.necesidadTraslado;
    });
    porClase.F = transferNeedsF.length;

    const result = Array.from(consolidated.entries())
      .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
      .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));

    // === LOG DIAGNÓSTICO CONSOLIDADO ===
    const totalConsolidado = result.reduce((s, r) => s + r.necesidadTraslado, 0);
    console.log('%c\n========================================', 'color: #e74c3c; font-weight: bold;');
    console.log('%c  TRASLADOS CONSOLIDADOS (C2000 → C1000)', 'color: #e74c3c; font-weight: bold; font-size: 14px;');
    console.log('%c========================================', 'color: #e74c3c; font-weight: bold;');
    console.log(`Clase E: ${porClase.E} materiales, ${porClase.totalE} unidades`);
    console.log(`Clase X: ${porClase.X} materiales, ${porClase.totalX} unidades`);
    console.log(`Clase F: ${porClase.F} materiales, ${porClase.totalF} unidades`);
    console.log(`%cTOTAL CONSOLIDADO: ${result.length} materiales \u00fanicos, ${totalConsolidado} unidades`, 'font-weight: bold;');
    console.log('Lista completa de traslados enviados al Centro 1000:');
    console.table(result);
    console.log('%c========================================\n', 'color: #e74c3c; font-weight: bold;');

    return result;
  }, [transferNeedsE, transferNeedsX, transferNeedsF]);

  // Notificar cambios — con guard para evitar loops de re-render
  const lastConsolidatedJsonRef = useRef<string>('');
  useEffect(() => {
    if (onTransferNeedsConsolidatedChanged && transferNeedsConsolidated.length > 0) {
      const json = JSON.stringify(transferNeedsConsolidated);
      if (json === lastConsolidatedJsonRef.current) return;
      lastConsolidatedJsonRef.current = json;
      onTransferNeedsConsolidatedChanged(transferNeedsConsolidated);
    }
  }, [transferNeedsConsolidated, onTransferNeedsConsolidatedChanged]);

  // Calcular transferencias F (sin lógica de asignación, directo a Quito)
  // FIX: usar misma lógica que E/X — per (material, mes) tomar max para duplicados,
  // luego SUMAR todos los meses por CodMaterial.
  useEffect(() => {
    if (dataF.length > 0) {
      // Paso 1: agrupar por (CodMaterial, Mes) — max para duplicados dentro del mismo mes
      const transferMapByMes = new Map<string, number>();
      dataF.forEach(row => {
        const codMaterial = String(row.CodMaterial ?? '');
        const mes = String(row.Mes ?? '');
        const key = `${codMaterial}|${mes}`;
        const necesidad = computeNecesidad(row);
        if (!transferMapByMes.has(key) || transferMapByMes.get(key)! < necesidad) {
          transferMapByMes.set(key, necesidad);
        }
      });

      // Paso 2: colapsar por CodMaterial sumando todos los meses
      const transferMap = new Map<string, number>();
      transferMapByMes.forEach((value, key) => {
        const codMaterial = key.split('|')[0];
        transferMap.set(codMaterial, (transferMap.get(codMaterial) || 0) + value);
      });

      const transferNeedsF_array = Array.from(transferMap.entries())
        .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
        .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));
      
      const totalF = transferNeedsF_array.reduce((s, r) => s + r.necesidadTraslado, 0);
      console.log(`%c=== [TRASLADOS Clase F] ===`, 'color: #9b59b6; font-weight: bold;');
      console.log(`Materiales F: ${transferNeedsF_array.length} | Total unidades: ${totalF}`);
      console.log('Detalle por (CodMaterial, Mes):');
      console.table(Array.from(transferMapByMes.entries()).map(([k, v]) => {
        const [cod, mes] = k.split('|');
        return { CodMaterial: cod, Mes: mes, Necesidad: v };
      }));
      console.log('Colapsado por material:');
      console.table(transferNeedsF_array.slice(0, 50));

      setTransferNeedsF(transferNeedsF_array);
    } else {
      setTransferNeedsF([]);
    }
  }, [dataF]);

  // Debug
  useEffect(() => {
    if (typeof window !== 'undefined' && data.length > 0) {
      console.log('=== [BottleneckAnalysis DEBUG] ===');
      console.log('Total registros:', data.length, '| Centro 2000:', filteredDataCentro2000.length);
      console.log('Clase E:', dataE.length, '| X:', dataX.length, '| F:', dataF.length);
      console.log('Enriquecidos E:', datosEnriquecidosE.length, '| X:', datosEnriquecidosX.length);
    }
  }, [data, filteredDataCentro2000, dataE, dataX, dataF, datosEnriquecidosE, datosEnriquecidosX]);

  // =====================================================
  // === DESPUÉS DE HOOKS: EARLY RETURN SI NO HAY DATA ===
  // =====================================================
  
  if (data.length === 0) {
    return <div className="p-4 text-center text-gray-600">Carga datos primero desde la pestaña "Datos del Backend - Necesidades"</div>;
  }

  // Proyectar las columnas limpias (las 12 clave) desde los datos completos de BottleneckClassTable
  // Los campos '[JN] MAX.PRODUCIR' etc. son calculados por BottleneckClassTable → siempre correctos
  const projectCleanColumns = (rows: any[], clase: string) =>
    rows
      .filter((r: any) => !String(r['CodMaterial'] || '').startsWith('**'))
      .map((r: any) => ({
        'Clase':             clase,
        'CodMaterial':       r['CodMaterial'] ?? '',
        'Descripcion':       r['Descripcion'] ?? '',
        'Linea':             r['Linea'] ?? '',
        'Sector':            r['Sector'] ?? '',
        'Responsable':       r['Responsable'] ?? '',
        'Necesidad':         r['[JN] NECESIDAD'] ?? 0,
        'Prod.Viable JN':    r['[JN] MAX.PRODUCIR'] ?? 0,
        'Prod.Viable HE':    r['[HE] MAX.PRODUCIR'] ?? 0,
        'Prod.Viable Sab':   r['[SAB] MAX.PRODUCIR'] ?? 0,
        'Prod.Viable TOTAL': r['[RES] Prod.Viable'] ?? 0,
        'Deficit General':   r['[RES] Deficit General'] ?? 0,
      }));

  // Hoja resumen: E + X + F (solo filas de datos, sin subtotales)
  const buildResumenSheet = () => {
    const rowsF = dataF.map((row: any) => {
      const necesidad = Math.floor(computeNecesidad(row));
      return {
        'Clase': 'F',
        'CodMaterial': row.CodMaterial ?? '',
        'Descripcion': row.Descripcion || row.NombreMaterial || '',
        'Linea': row.LineaFabricacion || '',
        'Sector': row.Sector || '',
        'Responsable': row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '',
        'Necesidad': necesidad,
        'Prod.Viable JN': 0, 'Prod.Viable HE': 0, 'Prod.Viable Sab': 0,
        'Prod.Viable TOTAL': 0, 'Deficit General': necesidad,
      };
    });
    return [
      ...projectCleanColumns(exportSheetEData, 'E'),
      ...projectCleanColumns(exportSheetXData, 'X'),
      ...rowsF,
    ];
  };

  const handleExportTodo = () => {
    exportToXLSXMultiSheet([
      { sheetName: 'Resumen E+X+F', data: buildResumenSheet() },
      // Sheets de detalle completo — todos los campos calculados por BottleneckClassTable
      { sheetName: 'Clase E', data: exportSheetEData },
      { sheetName: 'Clase X', data: exportSheetXData },
      { sheetName: 'Clase F', data: dataF.map((row: any) => ({
          'Clase': 'F',
          'CodMaterial':  row.CodMaterial ?? '',
          'Descripcion':  row.Descripcion || row.NombreMaterial || '',
          'Linea':        row.LineaFabricacion || '',
          'Sector':       row.Sector || '',
          'Responsable':  row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '',
          'Necesidad (Traslado total)': Math.floor(computeNecesidad(row)),
        })) },
    ], 'Analisis_Centro2000');
  };

  return (
    <div>
      <div className="flex justify-end px-2 pb-2">
        <button
          onClick={handleExportTodo}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Descargar Excel (Clases E + X + F)
        </button>
      </div>
      <BottleneckSummaryTable 
        datosEnriquecidosE={datosEnriquecidosE}
        datosEnriquecidosX={datosEnriquecidosX}
        tiemposCanon={tiemposCanon}
        numMaximoSabados={numMaximoSabados}
        maxExtrasHoras={maxExtrasHoras}
        horasTrabajo={horasTrabajo}
        horasExtrasFin={horasExtrasFin}
      />
      
      <BottleneckClassTable 
        datos={dataE}
        datosCompletos={filteredDataCentro2000}
        titulo="Clase de Aprovisionamiento: E"
        tiemposCanon={tiemposCanon}
        tiempoConsumidoAnterior={{}}
        onTransferNeedsCalculated={setTransferNeedsE}
        onExportSheetReady={setExportSheetEData}
        maxExtrasHoras={maxExtrasHoras}
        horasExtrasFin={horasExtrasFin}
      />
      <BottleneckClassTable 
        datos={dataX}
        datosCompletos={filteredDataCentro2000}
        titulo="Clase de Aprovisionamiento: X"
        tiemposCanon={tiemposCanon}
        tiempoConsumidoAnterior={tiempoConsumidoPorE}
        onTransferNeedsCalculated={setTransferNeedsX}
        onExportSheetReady={setExportSheetXData}
        maxExtrasHoras={maxExtrasHoras}
        horasExtrasFin={horasExtrasFin}
      />
      
      {dataF.length > 0 && (() => {
        const fLineasUnicas = Array.from(new Set(dataF.map((r: any) => String(r.LineaFabricacion || '')))).filter(Boolean).sort();
        const fRespUnicos = Array.from(new Set(dataF.map((r: any) => String(r.NombRespControlProd || r.RespCtrlProd || r.RespControlProd || '').trim()))).filter(Boolean).sort();
        const fSectoresUnicos = Array.from(new Set(dataF.map((r: any) => String(r.Sector || '').trim()))).filter(Boolean).sort();
        const fFiltrados = dataF.filter((row: any) => {
          const term = fSearchTerm.toLowerCase();
          const matchSearch = !term ||
            String(row.CodMaterial || '').toLowerCase().includes(term) ||
            String(row.Descripcion || row.NombreMaterial || '').toLowerCase().includes(term);
          const matchLinea = !fSelectedLinea || String(row.LineaFabricacion || '') === fSelectedLinea;
          const matchResp = fSelectedResp.length === 0 || fSelectedResp.includes(String(row.NombRespControlProd || row.RespCtrlProd || row.RespControlProd || '').trim());
          const sectorRow = String(row.Sector || '').trim();
          const matchSector = fSelectedSector.length === 0 ||
            fSelectedSector.includes(sectorRow) ||
            (fSelectedSector.includes('(Sin sector)') && sectorRow === '');
          return matchSearch && matchLinea && matchResp && matchSector;
        });
        const totalFiltrado = fFiltrados.reduce((sum: number, row: any) => sum + computeNecesidad(row), 0);
        return (
        <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-grow">
              <h3 className="text-lg font-semibold text-amber-900">Clase de Aprovisionamiento: F (Traslado a Quito)</h3>
              <p className="text-sm text-amber-800 mt-2">
                Los siguientes {dataF.length} material{dataF.length !== 1 ? 'es' : ''} con clase F se trasladan completos a plantas de Quito sin asignación de fabricación en Centro 2000.
              </p>

              {/* Filtros */}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {/* Línea */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium text-amber-800">Línea:</label>
                  <select
                    value={fSelectedLinea}
                    onChange={e => setFSelectedLinea(e.target.value)}
                    className="border border-amber-300 px-2 py-1 rounded text-xs bg-white focus:ring-2 focus:ring-amber-400"
                  >
                    <option value="">Todas</option>
                    {fLineasUnicas.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                {/* Responsable multi-select */}
                <div className="flex items-center gap-2 relative" ref={fRespDropdownRef}>
                  <label className="text-xs font-medium text-amber-800">Responsable:</label>
                  <button
                    type="button"
                    onClick={() => setFRespDropdownOpen(o => !o)}
                    className="border border-amber-300 px-2 py-1 rounded text-xs bg-white min-w-[160px] text-left flex items-center justify-between gap-1 focus:ring-2 focus:ring-amber-400"
                  >
                    <span className="truncate">
                      {fSelectedResp.length === 0 ? 'Todos' : fSelectedResp.length === 1 ? fSelectedResp[0] : `${fSelectedResp.length} seleccionados`}
                    </span>
                    <svg className={`w-3 h-3 text-amber-500 flex-shrink-0 transition-transform ${fRespDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {fRespDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-amber-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-56 overflow-y-auto">
                      <div className="p-2 border-b border-amber-100 flex gap-2">
                        <button type="button" onClick={() => setFSelectedResp([])} className="text-xs text-amber-700 hover:underline">Todos</button>
                        <span className="text-amber-200">|</span>
                        <button type="button" onClick={() => setFSelectedResp([...fRespUnicos])} className="text-xs text-amber-700 hover:underline">Seleccionar todos</button>
                      </div>
                      {fRespUnicos.map(r => (
                        <label key={r} className="flex items-center gap-2 px-3 py-1.5 hover:bg-amber-50 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={fSelectedResp.includes(r)}
                            onChange={e => setFSelectedResp(prev => e.target.checked ? [...prev, r] : prev.filter(x => x !== r))}
                            className="rounded border-amber-300 text-amber-600"
                          />
                          <span className="truncate">{r}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {/* Sector multi-select */}
                <div className="flex items-center gap-2 relative" ref={fSectorDropdownRef}>
                  <label className="text-xs font-medium text-amber-800">Sector:</label>
                  <button
                    type="button"
                    onClick={() => setFSectorDropdownOpen(o => !o)}
                    className="border border-amber-300 px-2 py-1 rounded text-xs bg-white min-w-[140px] text-left flex items-center justify-between gap-1 focus:ring-2 focus:ring-amber-400"
                  >
                    <span className="truncate">
                      {fSelectedSector.length === 0 ? 'Todos' : fSelectedSector.length === 1 ? fSelectedSector[0] : `${fSelectedSector.length} seleccionados`}
                    </span>
                    <svg className={`w-3 h-3 text-amber-500 flex-shrink-0 transition-transform ${fSectorDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {fSectorDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-amber-200 rounded-lg shadow-lg z-50 min-w-[180px] max-h-56 overflow-y-auto">
                      <div className="p-2 border-b border-amber-100 flex gap-2">
                        <button type="button" onClick={() => setFSelectedSector([])} className="text-xs text-amber-700 hover:underline">Todos</button>
                        <span className="text-amber-200">|</span>
                        <button type="button" onClick={() => setFSelectedSector([...fSectoresUnicos])} className="text-xs text-amber-700 hover:underline">Seleccionar todos</button>
                      </div>
                      {fSectoresUnicos.map(s => (
                        <label key={s} className="flex items-center gap-2 px-3 py-1.5 hover:bg-amber-50 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={fSelectedSector.includes(s)}
                            onChange={e => setFSelectedSector(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                            className="rounded border-amber-300 text-amber-600"
                          />
                          <span className="truncate">{s}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                {/* Búsqueda */}
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    placeholder="Buscar código o descripción..."
                    value={fSearchTerm}
                    onChange={e => setFSearchTerm(e.target.value)}
                    className="border border-amber-300 px-2 py-1 rounded text-xs bg-white w-52 focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                {/* Contador */}
                <span className="text-xs text-amber-700">{fFiltrados.length} de {dataF.length} registros</span>
              </div>

              <div className="mt-3 overflow-x-auto max-h-[500px] overflow-y-auto rounded border border-amber-200">
                <table className="min-w-full divide-y divide-amber-200 bg-white text-xs">
                  <thead className="bg-amber-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Código Material</th>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Descripción</th>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Línea</th>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Sector</th>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Responsable</th>
                      <th className="px-3 py-2 text-right font-semibold text-amber-900">Necesidad (Traslado a Quito)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {fFiltrados.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-amber-50">
                        <td className="px-3 py-2 text-gray-800 font-mono">{row.CodMaterial || '-'}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={row.Descripcion || row.NombreMaterial || ''}>{row.Descripcion || row.NombreMaterial || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.LineaFabricacion || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.Sector || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-900">{computeNecesidad(row).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-amber-100 sticky bottom-0">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 font-bold text-amber-900 text-xs">Total{fFiltrados.length < dataF.length ? ` (filtrado)` : ''}</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-900">{totalFiltrado.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};
