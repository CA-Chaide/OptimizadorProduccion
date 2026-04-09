
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, normalizeMaterialCode } from './utils';
import { TiempoCanonResult, ViableTransfer } from './types';

interface BacklogProgressiveSectionProps {
  data: any[];
  tiemposCanon: TiempoCanonResult[];
  centro: string;
  titulo: string;
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasExtrasFin: number;
  trasladosViables?: ViableTransfer[];
}

export const BacklogProgressiveSection: React.FC<BacklogProgressiveSectionProps> = ({
  data,
  tiemposCanon,
  centro,
  titulo,
  numMaximoSabados,
  maxExtrasHoras,
  horasExtrasFin,
  trasladosViables = []
}) => {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => setIsMounted(true), []);

  const simulationResults = useMemo(() => {
    if (!data || data.length === 0) return [];

    // 1. Obtener meses ordenados
    const timeline = Array.from(new Set(data.map(r => {
      const year = safeNumber(r.Año || r.año || new Date().getFullYear());
      const mesNum = parseInt(r.mesRef || r.Mes);
      return (year * 12) + mesNum;
    }))).sort((a, b) => a - b);

    // 2. Mapas de ayuda
    const viablesMap = new Map<string, number>();
    trasladosViables.forEach(tr => {
      viablesMap.set(`${normalizeMaterialCode(tr.CodMaterial)}|${tr.mes}`, tr.cantidad);
    });

    const tcMap = new Map<string, TiempoCanonResult>();
    tiemposCanon.forEach(tc => {
      tcMap.set(String(tc.mesNumero), tc);
      tcMap.set(tc.mes, tc);
    });

    const stockTracker = new Map<string, number>(); // Material -> Saldo Final anterior
    const backlogBag = new Map<string, number>();   // Material -> Backlog Acumulado anterior
    const todasLasFilas: any[] = [];

    // Simulación cronológica
    for (const tKey of timeline) {
      const year = Math.floor(tKey / 12);
      const mesNum = tKey % 12;
      const mesKey = String(mesNum);
      const tc = tcMap.get(mesKey);
      if (!tc) continue;

      const filasMes = data.filter(r => {
        const rYear = safeNumber(r.Año || r.año || new Date().getFullYear());
        const rMes = parseInt(r.mesRef || r.Mes);
        return rYear === year && rMes === mesNum;
      });

      // Calcular tiempo libre inicial por línea
      const timeUsedByLineMC = new Map<string, number>();
      const totalTimeByLine = new Map<string, number>();

      filasMes.forEach(r => {
        const linea = String(r.lineaRef || r.LineaFabricacion || 'Sin línea');
        const timeMC = (safeNumber(r.necesidadMaximaProducirJornadaNormal) + 
                        safeNumber(r.necesidadMaximaProducirHorasExtras) + 
                        safeNumber(r.necesidadMaximaProducirSabados)) * safeNumber(r.tiempoUnitarioPorPuesto);
        timeUsedByLineMC.set(linea, (timeUsedByLineMC.get(linea) || 0) + timeMC);

        if (!totalTimeByLine.has(linea)) {
          const lineaNorm = String(linea).toLowerCase().replace(/\s+/g, '');
          const dp = tc.data.find((item: any) => {
            const nl = String(item?.nombre_linea ?? '').toLowerCase().replace(/\s+/g, '');
            return nl === lineaNorm || nl.includes(lineaNorm);
          });
          const total = safeNumber(dp?.minutos_horario_normal_TOTAL || 0) + 
                        ((tc.diasLaborables * maxExtrasHoras) * 60) + 
                        ((tc.diasSabados * horasExtrasFin) * 60);
          totalTimeByLine.set(linea, total);
        }
      });

      const idleTimeByLine = new Map<string, number>();
      totalTimeByLine.forEach((total, linea) => {
        idleTimeByLine.set(linea, Math.max(0, total - (timeUsedByLineMC.get(linea) || 0)));
      });

      // Procesar cada material
      const procesadosMes = filasMes.map(r => {
        const code = normalizeMaterialCode(r.CodMaterial);
        const linea = String(r.lineaRef || r.LineaFabricacion || 'Sin línea');
        const tupp = safeNumber(r.tiempoUnitarioPorPuesto);
        
        const initialStock = stockTracker.get(code) || safeNumber(r._stockInitial);
        const backlogAnterior = backlogBag.get(code) || 0;
        
        // Entradas
        const trKey = `${code}|${mesKey}`;
        const trasladosIn = centro === '2000' ? (viablesMap.get(trKey) || 0) : 0;
        
        // Producción MC (Ya calculada en Análisis)
        const prodMC = safeNumber(r._prodViable);
        
        // Prioridad 1: Despacho MC
        const totalDisponibleParaMC = initialStock + prodMC + trasladosIn;
        const demandMC = safeNumber(r.up);
        const dispatchMC = Math.min(demandMC, totalDisponibleParaMC);
        const backlogMC = Math.max(0, demandMC - dispatchMC);
        const sobraDespuesMC = Math.max(0, totalDisponibleParaMC - dispatchMC);

        // Prioridad 2: Producción de Recuperación (BL)
        let prodBL = 0;
        if (backlogAnterior > 0 && tupp > 0 && idleTimeByLine.get(linea)! > 0) {
          const timeAvailable = idleTimeByLine.get(linea)!;
          const unitsPossible = Math.floor(timeAvailable / tupp);
          prodBL = Math.min(backlogAnterior, unitsPossible);
          
          // Descontar tiempo
          idleTimeByLine.set(linea, timeAvailable - (prodBL * tupp));
        }

        // Prioridad 3: Despacho BL
        const totalParaBL = sobraDespuesMC + prodBL;
        const dispatchBL = Math.min(backlogAnterior, totalParaBL);
        
        // Resultados Finales
        const backlogAcumulado = (backlogAnterior - dispatchBL) + backlogMC;
        const saldoFinal = backlogAcumulado === 0 ? (totalParaBL - dispatchBL) : 0;

        // Actualizar trackers para siguiente mes
        stockTracker.set(code, saldoFinal);
        backlogBag.set(code, backlogAcumulado);

        return {
          ...r,
          mesNombre: MONTH_NAMES[mesNum - 1],
          _stockInitial: initialStock,
          _traslado: trasladosIn,
          _prodMC: prodMC,
          _prodBL: prodBL,
          _viableTotal: prodMC + prodBL,
          _dispatchMC: dispatchMC,
          _dispatchBL: dispatchBL,
          _backlogMC: backlogMC,
          _backlogAcum: backlogAcumulado,
          _saldoFinal: saldoFinal,
          _idleLineTime: idleTimeByLine.get(linea)
        };
      });

      todasLasFilas.push(...procesadosMes);
    }

    return todasLasFilas;
  }, [data, tiemposCanon, centro, trasladosViables, maxExtrasHoras, horasExtrasFin]);

  const totals = useMemo(() => {
    const res = { stockIni: 0, traslados: 0, prodMC: 0, prodBL: 0, viable: 0, dispMC: 0, dispBL: 0, blMC: 0, blAcum: 0, saldo: 0 };
    simulationResults.forEach(r => {
      res.stockIni += r._stockInitial;
      res.traslados += r._traslado;
      res.prodMC += r._prodMC;
      res.prodBL += r._prodBL;
      res.viable += r._viableTotal;
      res.dispMC += r._dispatchMC;
      res.dispBL += r._dispatchBL;
      res.blMC += r._backlogMC;
      res.blAcum += r._backlogAcum;
      res.saldo += r._saldoFinal;
    });
    return res;
  }, [simulationResults]);

  const format = (val: number, decimals: number = 0) => {
    if (!isMounted) return '';
    return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
        <h3 className="text-lg font-bold text-gray-800 uppercase">{titulo}</h3>
        <Badge variant="outline" className="bg-blue-50 text-blue-700">Simulación Cronológica</Badge>
      </div>

      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-gray-100 text-[10px] uppercase font-bold text-gray-600">
            <tr className="border-b border-gray-300">
              <th colSpan={4} className="px-2 py-2 bg-gray-200 border-r">Producto</th>
              <th colSpan={2} className="px-2 py-2 bg-blue-50 text-blue-800 border-r">Entradas</th>
              <th colSpan={3} className="px-2 py-2 bg-green-50 text-green-800 border-r">Producción</th>
              <th colSpan={2} className="px-2 py-2 bg-purple-50 text-purple-800 border-r">Salidas (Despachos)</th>
              <th colSpan={2} className="px-2 py-2 bg-red-50 text-red-800 border-r">Deuda (Backlog)</th>
              <th className="px-2 py-2 bg-emerald-50 text-emerald-800">Inventario</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200 text-center">
              <th className="px-2 py-1 text-left min-w-[80px]">Mes</th>
              <th className="px-2 py-1 min-w-[50px]">Clase</th>
              <th className="px-2 py-1 min-w-[90px]">Material</th>
              <th className="px-2 py-1 text-left min-w-[150px] border-r">Descripción</th>
              
              <th className="px-2 py-1 min-w-[80px] text-blue-700">Stock Ini</th>
              <th className="px-2 py-1 min-w-[80px] text-blue-700 border-r">Traslados</th>
              
              <th className="px-2 py-1 min-w-[80px] text-green-700">Viable MC</th>
              <th className="px-2 py-1 min-w-[90px] text-green-700 bg-green-100/50">Prod. Recup. (BL)</th>
              <th className="px-2 py-1 min-w-[80px] text-green-800 font-bold border-r">Viable Total</th>
              
              <th className="px-2 py-1 min-w-[80px] text-purple-700">Despacho MC</th>
              <th className="px-2 py-1 min-w-[80px] text-purple-700 border-r">Despacho BL</th>
              
              <th className="px-2 py-1 min-w-[80px] text-red-700">Backlog MC</th>
              <th className="px-2 py-1 min-w-[90px] text-red-800 font-bold border-r">Backlog Acum</th>
              
              <th className="px-2 py-1 min-w-[90px] text-emerald-700">Saldo Final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-[11px]">
            {simulationResults.map((r, idx) => (
              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-2 py-2 font-bold text-gray-700">{r.mesNombre}</td>
                <td className="px-2 py-2 text-center">{r.ClaseAprovisionam}</td>
                <td className="px-2 py-2 font-mono">{r.CodMaterial}</td>
                <td className="px-2 py-2 truncate border-r" title={r.Descripcion}>{r.Descripcion}</td>
                
                <td className="px-2 py-2 text-right font-mono text-blue-600">{format(r._stockInitial)}</td>
                <td className="px-2 py-2 text-right font-mono text-blue-600 border-r">{format(r._traslado)}</td>
                
                <td className="px-2 py-2 text-right font-mono text-green-600">{format(r._prodMC)}</td>
                <td className="px-2 py-2 text-right font-mono text-green-700 font-bold bg-green-50">{format(r._prodBL)}</td>
                <td className="px-2 py-2 text-right font-mono text-green-800 font-bold border-r">{format(r._viableTotal)}</td>
                
                <td className="px-2 py-2 text-right font-mono text-purple-600">{format(r._dispatchMC)}</td>
                <td className="px-2 py-2 text-right font-mono text-purple-600 border-r">{format(r._dispatchBL)}</td>
                
                <td className="px-2 py-2 text-right font-mono text-red-500">{format(r._backlogMC)}</td>
                <td className={`px-2 py-2 text-right font-mono font-bold border-r ${r._backlogAcum > 0 ? 'text-red-700 bg-red-50' : 'text-gray-400'}`}>{format(r._backlogAcum)}</td>
                
                <td className={`px-2 py-2 text-right font-mono font-bold ${r._saldoFinal > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-gray-400'}`}>{format(r._saldoFinal)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-gray-800 text-white font-bold text-[10px]">
            <tr>
              <td colSpan={4} className="px-2 py-2 border-r border-gray-600">TOTALES FILTRADOS</td>
              <td className="px-2 py-2 text-right font-mono">{format(totals.stockIni)}</td>
              <td className="px-2 py-2 text-right font-mono border-r border-gray-600">{format(totals.traslados)}</td>
              <td className="px-2 py-2 text-right font-mono text-green-300">{format(totals.prodMC)}</td>
              <td className="px-2 py-2 text-right font-mono text-green-400">{format(totals.prodBL)}</td>
              <td className="px-2 py-2 text-right font-mono text-green-300 border-r border-gray-600">{format(totals.viable)}</td>
              <td className="px-2 py-2 text-right font-mono text-purple-300">{format(totals.dispMC)}</td>
              <td className="px-2 py-2 text-right font-mono text-purple-300 border-r border-gray-600">{format(totals.dispBL)}</td>
              <td className="px-2 py-2 text-right font-mono text-red-300">{format(totals.blMC)}</td>
              <td className="px-2 py-2 text-right font-mono text-red-400 border-r border-gray-600">{format(totals.blAcum)}</td>
              <td className="px-2 py-2 text-right font-mono text-emerald-300">{format(totals.saldo)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
