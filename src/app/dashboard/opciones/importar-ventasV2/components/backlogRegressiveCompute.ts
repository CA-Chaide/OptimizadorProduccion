/**
 * Cálculo compartido del backlog regresivo (misma lógica que BacklogRegressiveSection).
 * Extraído para reutilizar en el reporte de totales mensuales sin duplicar reglas.
 *
 * C1000: despacho con prioridad **ventas primero**, luego traslado plan hacia C2000.
 * Backlog de ventas y de traslado se llevan por separado.
 */

import { MONTH_NAMES, MONTH_NUMBERS } from './constants';
import { safeNumber, normalizeMaterialCode } from './utils';
import type { TiempoCanonResult, ViableTransfer } from './types';

function getMesNumerico(mesRaw: unknown): number {
  if (!mesRaw) return 0;
  const val = String(mesRaw).trim();
  const asNum = parseInt(val, 10);
  if (!isNaN(asNum) && asNum >= 1 && asNum <= 12) return asNum;
  return MONTH_NUMBERS[val as keyof typeof MONTH_NUMBERS] || 0;
}

export interface ComputeBacklogRegressiveParams {
  data: any[];
  tiemposCanon: TiempoCanonResult[];
  centro: string;
  maxExtrasHoras: number;
  horasExtrasFin: number;
  trasladosViables: ViableTransfer[];
}

/** Filas finales del backlog regresivo (una por material–mes), mismos campos que usa la tabla. */
export function computeBacklogRegressiveFinalRows({
  data,
  tiemposCanon,
  centro,
  maxExtrasHoras,
  horasExtrasFin,
  trasladosViables,
}: ComputeBacklogRegressiveParams): any[] {
  if (!data || data.length === 0) return [];

  const isC1000 = centro === '1000';
  const timeline = Array.from(
    new Set(
      data.map(r => {
        const year = safeNumber(r.Año || r.año || new Date().getFullYear());
        const mesNum = getMesNumerico(r.mesRef || r.Mes);
        return year * 12 + (mesNum - 1);
      })
    )
  ).sort((a, b) => a - b);

  const tcMap = new Map<string, TiempoCanonResult>();
  tiemposCanon.forEach(tc => {
    tcMap.set(String(tc.mesNumero), tc);
    tcMap.set(tc.mes, tc);
  });

  const rowsByMaterialMonth = new Map<string, any>();
  data.forEach(r => {
    const code = normalizeMaterialCode(r.CodMaterial);
    const year = safeNumber(r.Año || r.año || new Date().getFullYear());
    const mesNum = getMesNumerico(r.mesRef || r.Mes);
    const key = `${code}|${year}|${mesNum}`;

    const demVenta = safeNumber(r.UnidadesProyectado);
    const demTrasladoPlan = isC1000 ? safeNumber(r._envioC2000Plan ?? r._envioC2000) : 0;
    const demTotal = demVenta + demTrasladoPlan;

    rowsByMaterialMonth.set(key, {
      ...r,
      _demandaMes: demTotal,
      _demandaVenta: demVenta,
      _trasladoSalienteC2000: isC1000 ? demTrasladoPlan : 0,
      _prodBase: safeNumber(r._prodViable),
      _prodAdelantada: 0,
      _prodRecuperada: 0,
      _backlogIdentificado: safeNumber(r._backlogVentas),
      _tupp: safeNumber(r.tiempoUnitarioPorPuesto),
    });
  });

  const idleTimeByLineMonth = new Map<string, number>();
  timeline.forEach(tKey => {
    const year = Math.floor(tKey / 12);
    const mesNum = (tKey % 12) + 1;
    const tc = tcMap.get(String(mesNum));
    if (!tc) return;

    const lineasProcesadas = new Set<string>();
    data.forEach(r => {
      const linea = String(r.lineaRef || r.LineaFabricacion || 'Sin línea');
      const lKey = `${linea}|${year}|${mesNum}`;
      if (lineasProcesadas.has(lKey)) return;
      lineasProcesadas.add(lKey);

      const lineaNorm = String(linea).toLowerCase().replace(/\s+/g, '');
      const dp = tc.data.find((item: any) => {
        const nl = String(item?.nombre_linea ?? '')
          .toLowerCase()
          .replace(/\s+/g, '');
        return nl === lineaNorm || nl.includes(lineaNorm);
      });

      const capBase = safeNumber(dp?.minutos_horario_normal_TOTAL || 0);
      const capExtras =
        tc.diasLaborables * maxExtrasHoras * 60 + tc.diasSabados * horasExtrasFin * 60;
      const totalMinutos = capBase + capExtras;

      const minutesUsedBase = data
        .filter(
          row =>
            String(row.lineaRef || row.LineaFabricacion) === linea &&
            getMesNumerico(row.mesRef || row.Mes) === mesNum
        )
        .reduce(
          (sum, row) => sum + safeNumber(row._prodViable) * safeNumber(row.tiempoUnitarioPorPuesto),
          0
        );

      idleTimeByLineMonth.set(lKey, Math.max(0, totalMinutos - minutesUsedBase));
    });
  });

  const materials = Array.from(new Set(data.map(r => normalizeMaterialCode(r.CodMaterial))));

  materials.forEach(code => {
    for (let i = timeline.length - 1; i >= 0; i--) {
      const tKey = timeline[i];
      const year = Math.floor(tKey / 12);
      const mesNum = (tKey % 12) + 1;
      const currentKey = `${code}|${year}|${mesNum}`;
      const row = rowsByMaterialMonth.get(currentKey);

      if (!row) continue;

      let backlogAFijar = row._backlogIdentificado;

      if (backlogAFijar > 0) {
        for (let j = i - 1; j >= 0 && backlogAFijar > 0; j--) {
          const prevTKey = timeline[j];
          const pYear = Math.floor(prevTKey / 12);
          const pMesNum = (prevTKey % 12) + 1;
          const prevRowKey = `${code}|${pYear}|${pMesNum}`;
          const prevRow = rowsByMaterialMonth.get(prevRowKey);

          if (!prevRow || prevRow._tupp <= 0) continue;

          const lKey = `${prevRow.lineaRef || prevRow.LineaFabricacion || 'Sin línea'}|${pYear}|${pMesNum}`;
          const availableMin = idleTimeByLineMonth.get(lKey) || 0;

          if (availableMin > 0) {
            const unitsToAdelantar = Math.min(
              backlogAFijar,
              Math.floor(availableMin / prevRow._tupp)
            );
            if (unitsToAdelantar > 0) {
              prevRow._prodAdelantada += unitsToAdelantar;
              idleTimeByLineMonth.set(lKey, availableMin - unitsToAdelantar * prevRow._tupp);
              backlogAFijar -= unitsToAdelantar;
            }
          }
        }
      }
    }
  });

  const stockTracker = new Map<string, number>();
  const backlogVentasByMat = new Map<string, number>();
  const backlogTrasladoByMat = new Map<string, number>();
  const backlogC2000ByMat = new Map<string, number>();
  const finalData: any[] = [];

  for (const tKey of timeline) {
    const year = Math.floor(tKey / 12);
    const mesNum = (tKey % 12) + 1;

    materials.forEach(code => {
      const key = `${code}|${year}|${mesNum}`;
      const r = rowsByMaterialMonth.get(key);
      if (!r) return;

      const initialStock = stockTracker.get(code) ?? safeNumber(r.StockActual);
      const demVenta = safeNumber(r._demandaVenta);
      const demTrasladoPlan = safeNumber(r._trasladoSalienteC2000);

      let prodRecuperada = 0;
      const lKey = `${r.lineaRef || r.LineaFabricacion || 'Sin línea'}|${year}|${mesNum}`;
      const minutesLeft = idleTimeByLineMonth.get(lKey) || 0;

      let despachosReales = 0;
      let despachosVentas = 0;
      let despachosTraslado = 0;
      let backlogFinalVentas = 0;
      let backlogFinalTraslado = 0;
      let backlogFinal = 0;
      let backlogPasadoVentas = 0;
      let backlogPasadoTraslado = 0;
      let backlogPasadoTotal = 0;

      if (isC1000) {
        backlogPasadoVentas = backlogVentasByMat.get(code) || 0;
        backlogPasadoTraslado = backlogTrasladoByMat.get(code) || 0;
        backlogPasadoTotal = backlogPasadoVentas + backlogPasadoTraslado;

        if (backlogPasadoTotal > 0 && r._tupp > 0 && minutesLeft > 0) {
          const unitsPossible = Math.min(backlogPasadoTotal, Math.floor(minutesLeft / r._tupp));
          prodRecuperada = unitsPossible;
          idleTimeByLineMonth.set(lKey, minutesLeft - prodRecuperada * r._tupp);
        }

        const prodTotal = r._prodBase + r._prodAdelantada + prodRecuperada;
        const viableCantidad = safeNumber(
          trasladosViables.find(
            v =>
              normalizeMaterialCode(v.CodMaterial) === code && getMesNumerico(v.mes) === mesNum
          )?.cantidad
        );

        const disponibleTotal = initialStock + prodTotal;
        const needV = demVenta + backlogPasadoVentas;
        const needT = demTrasladoPlan + backlogPasadoTraslado;

        despachosVentas = Math.min(disponibleTotal, needV);
        const rem = Math.max(0, disponibleTotal - despachosVentas);
        despachosTraslado = Math.min(rem, needT);
        despachosReales = despachosVentas + despachosTraslado;
        const trasladoConsistente = Math.abs(despachosTraslado - viableCantidad) < 0.5;

        backlogFinalVentas = Math.max(0, needV - despachosVentas);
        backlogFinalTraslado = Math.max(0, needT - despachosTraslado);
        backlogFinal = backlogFinalVentas + backlogFinalTraslado;
        const finalStock = Math.max(0, disponibleTotal - despachosReales);

        stockTracker.set(code, finalStock);
        backlogVentasByMat.set(code, backlogFinalVentas);
        backlogTrasladoByMat.set(code, backlogFinalTraslado);

        finalData.push({
          ...r,
          mesNombre: MONTH_NAMES[mesNum],
          _mesNumero: mesNum,
          _anioFila: year,
          _stockInitial: initialStock,
          _trasladoEntranteDesdeC1000: 0,
          _trasladoIntercentroConsistente: trasladoConsistente,
          _prodRecuperada: prodRecuperada,
          _prodViableTotal: prodTotal,
          _backlogPasado: backlogPasadoTotal,
          _backlogPasadoVentas: backlogPasadoVentas,
          _backlogPasadoTraslado: backlogPasadoTraslado,
          _backlogFuturo: r._backlogIdentificado - (r._prodAdelantada > 0 ? r._prodAdelantada : 0),
          _despachosReales: despachosReales,
          _despachosVentas: despachosVentas,
          _despachosTraslado: despachosTraslado,
          _backlogFinal: backlogFinal,
          _backlogFinalVentas: backlogFinalVentas,
          _backlogFinalTraslado: backlogFinalTraslado,
          _saldoFinal: finalStock,
        });
      } else {
        const backlogPasado = backlogC2000ByMat.get(code) || 0;

        if (backlogPasado > 0 && r._tupp > 0 && minutesLeft > 0) {
          const unitsPossible = Math.min(backlogPasado, Math.floor(minutesLeft / r._tupp));
          prodRecuperada = unitsPossible;
          idleTimeByLineMonth.set(lKey, minutesLeft - prodRecuperada * r._tupp);
        }

        const prodTotal = r._prodBase + r._prodAdelantada + prodRecuperada;
        const viableCantidad = safeNumber(
          trasladosViables.find(
            v =>
              normalizeMaterialCode(v.CodMaterial) === code && getMesNumerico(v.mes) === mesNum
          )?.cantidad
        );
        const trRecibido = viableCantidad;
        const trasladoConsistente = Math.abs(trRecibido - viableCantidad) < 0.5;

        const disponibleTotal = initialStock + prodTotal + trRecibido;
        despachosReales = Math.min(disponibleTotal, r._demandaMes + backlogPasado);
        backlogFinal = Math.max(0, r._demandaMes + backlogPasado - despachosReales);
        const finalStock = Math.max(0, disponibleTotal - despachosReales);

        stockTracker.set(code, finalStock);
        backlogC2000ByMat.set(code, backlogFinal);

        despachosVentas = despachosReales;
        despachosTraslado = 0;
        backlogFinalVentas = backlogFinal;
        backlogFinalTraslado = 0;

        finalData.push({
          ...r,
          mesNombre: MONTH_NAMES[mesNum],
          _mesNumero: mesNum,
          _anioFila: year,
          _stockInitial: initialStock,
          _trasladoEntranteDesdeC1000: trRecibido,
          _trasladoIntercentroConsistente: trasladoConsistente,
          _prodRecuperada: prodRecuperada,
          _prodViableTotal: prodTotal,
          _backlogPasado: backlogPasado,
          _backlogPasadoVentas: backlogPasado,
          _backlogPasadoTraslado: 0,
          _backlogFuturo: r._backlogIdentificado - (r._prodAdelantada > 0 ? r._prodAdelantada : 0),
          _despachosReales: despachosReales,
          _despachosVentas: despachosVentas,
          _despachosTraslado: despachosTraslado,
          _backlogFinal: backlogFinal,
          _backlogFinalVentas: backlogFinalVentas,
          _backlogFinalTraslado: backlogFinalTraslado,
          _saldoFinal: finalStock,
        });
      }
    });
  }

  return finalData;
}
