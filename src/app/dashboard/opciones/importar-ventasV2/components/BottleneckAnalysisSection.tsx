'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, generarFilasHorasExtras, guardarHorasExtrasEnStorage, obtenerHorasExtrasDeStorage, consumirHorasExtras } from './utils';
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
  minutosExtrasPorLinea: { [mesLinea: string]: number } = {}
) {
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
    
    transferNeedsE.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });
    
    transferNeedsX.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });

    transferNeedsF.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });
    
    return Array.from(consolidated.entries())
      .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
      .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));
  }, [transferNeedsE, transferNeedsX, transferNeedsF]);

  // Notificar cambios
  useEffect(() => {
    if (onTransferNeedsConsolidatedChanged && transferNeedsConsolidated.length > 0) {
      onTransferNeedsConsolidatedChanged(transferNeedsConsolidated);
    }
  }, [transferNeedsConsolidated, onTransferNeedsConsolidatedChanged]);

  // Calcular transferencias F (sin lógica de asignación, directo a Quito)
  useEffect(() => {
    if (dataF.length > 0) {
      const transferMap = new Map<string, number>();
      dataF.forEach(row => {
        const codMaterial = String(row.CodMaterial ?? '');
        const necesidad = computeNecesidad(row);
        const current = transferMap.get(codMaterial) || 0;
        transferMap.set(codMaterial, Math.max(current, necesidad));
      });

      const transferNeedsF_array = Array.from(transferMap.entries())
        .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
        .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));
      
      console.log('[BottleneckAnalysis] Transfer Needs F (enviando a Quito):', transferNeedsF_array.length, 'materiales');
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
    }
  }, [data, filteredDataCentro2000, dataE, dataX, dataF]);

  // =====================================================
  // === DESPUÉS DE HOOKS: EARLY RETURN SI NO HAY DATA ===
  // =====================================================
  
  if (data.length === 0) {
    return <div className="p-4 text-center text-gray-600">Carga datos primero desde la pestaña "Datos del Backend - Necesidades"</div>;
  }

  return (
    <div>
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
        maxExtrasHoras={maxExtrasHoras}
        horasExtrasFin={horasExtrasFin}
      />
      
      {dataF.length > 0 && (
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
              
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-amber-200 bg-white rounded">
                  <thead className="bg-amber-100">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Código Material</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Línea</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-amber-900">Sector</th>
                      <th className="px-4 py-2 text-right text-xs font-semibold text-amber-900">Necesidad (Traslado a Quito)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {dataF.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-amber-50">
                        <td className="px-4 py-2 text-sm text-gray-800 font-mono">{row.CodMaterial || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{row.LineaFabricacion || '-'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{row.Sector || '-'}</td>
                        <td className="px-4 py-2 text-sm text-right font-semibold text-amber-900">
                          {computeNecesidad(row).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="mt-3 text-xs text-amber-700">
                <strong>Total unidades a trasladar:</strong> {dataF.reduce((sum, row) => sum + computeNecesidad(row), 0).toLocaleString()}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
