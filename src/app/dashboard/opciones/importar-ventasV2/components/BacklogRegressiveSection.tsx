
'use client';

import React, { useState, useMemo, useEffect, memo } from 'react';
import { MONTH_NAMES, MONTH_NUMBERS } from './constants';
import { safeNumber, normalizeMaterialCode } from './utils';
import { TiempoCanonResult, ViableTransfer } from './types';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowDownToLine, ArrowUpRight } from 'lucide-react';

interface BacklogRegressiveSectionProps {
  data: any[];
  tiemposCanon: TiempoCanonResult[];
  centro: string;
  titulo: string;
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasExtrasFin: number;
  trasladosViables?: ViableTransfer[];
}

const DataRow = memo(({ r, isMounted, format, centro }: { r: any, isMounted: boolean, format: (v: number, d?: number) => string, centro: string }) => {
  return (
    <tr className="hover:bg-gray-50 transition-colors border-b border-gray-100">
      <td className="px-2 py-2 font-bold text-gray-700 bg-gray-50/50">{r.mesNombre}</td>
      <td className="px-2 py-2 text-center text-[10px] font-bold text-gray-500">{r.ClaseAprovisionam}</td>
      <td className="px-2 py-2 font-mono text-blue-700">{r.CodMaterial}</td>
      <td className="px-2 py-2 truncate border-r max-w-[180px] text-gray-600" title={r.Descripcion}>{r.Descripcion}</td>
      
      {/* Inventario Base */}
      <td className="px-2 py-2 text-right font-mono text-indigo-600 bg-indigo-50/20">{format(r._stockInitial)}</td>
      <td className="px-2 py-2 text-right font-mono text-gray-700 border-r">{format(r._demandaMes)}</td>
      
      {/* Regresivo (Futuro) */}
      <td className={`px-2 py-2 text-right font-mono ${r._backlogFuturo > 0 ? 'text-orange-600 font-bold' : 'text-gray-300'}`}>{format(r._backlogFuturo)}</td>
      <td className="px-2 py-2 text-right font-mono text-emerald-700 font-bold bg-emerald-50">
        {r._prodAdelantada > 0 && <span className="mr-1 text-[9px]"><ArrowDownToLine className="inline w-3 h-3" /></span>}
        {format(r._prodAdelantada)}
      </td>
      
      {/* Progresivo (Pasado) */}
      <td className={`px-2 py-2 text-right font-mono border-l ${r._backlogPasado > 0 ? 'text-red-500 font-bold' : 'text-gray-300'}`}>{format(r._backlogPasado)}</td>
      <td className="px-2 py-2 text-right font-mono text-blue-700 font-bold bg-blue-50 border-r">
        {r._prodRecuperada > 0 && <span className="mr-1 text-[9px]"><ArrowUpRight className="inline w-3 h-3" /></span>}
        {format(r._prodRecuperada)}
      </td>
      
      {/* Totales y Cierre */}
      <td className="px-2 py-2 text-right font-mono text-purple-700 font-bold bg-purple-50/30">{format(r._prodViableTotal)}</td>
      <td className="px-2 py-2 text-right font-mono text-gray-800 font-semibold">{format(r._despachosReales)}</td>
      <td className={`px-2 py-2 text-right font-mono font-bold ${r._backlogFinal > 0 ? 'text-red-700 bg-red-50' : 'text-gray-300'}`}>{format(r._backlogFinal)}</td>
      <td className={`px-2 py-2 text-right font-mono font-bold border-l-2 border-gray-200 ${r._saldoFinal > 0 ? 'text-emerald-700 bg-emerald-50' : 'text-gray-400'}`}>{format(r._saldoFinal)}</td>
    </tr>
  );
});
DataRow.displayName = 'DataRow';

export const BacklogRegressiveSection: React.FC<BacklogRegressiveSectionProps> = ({
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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMes, setSelectedMes] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  useEffect(() => setIsMounted(true), []);

  const getMesNumerico = (mesRaw: any): number => {
    if (!mesRaw) return 0;
    const val = String(mesRaw).trim();
    const asNum = parseInt(val);
    if (!isNaN(asNum) && asNum >= 1 && asNum <= 12) return asNum;
    return MONTH_NUMBERS[val as keyof typeof MONTH_NUMBERS] || 0;
  };

  const results = useMemo(() => {
    if (!data || data.length === 0) return [];

    const isC1000 = centro === '1000';
    const timeline = Array.from(new Set(data.map(r => {
      const year = safeNumber(r.Año || r.año || new Date().getFullYear());
      const mesNum = getMesNumerico(r.mesRef || r.Mes);
      return (year * 12) + (mesNum - 1);
    }))).sort((a, b) => a - b);

    const tcMap = new Map<string, TiempoCanonResult>();
    tiemposCanon.forEach(tc => {
      tcMap.set(String(tc.mesNumero), tc);
      tcMap.set(tc.mes, tc);
    });

    // 1. MAPA INICIAL DE DATOS
    const rowsByMaterialMonth = new Map<string, any>();
    data.forEach(r => {
      const code = normalizeMaterialCode(r.CodMaterial);
      const year = safeNumber(r.Año || r.año || new Date().getFullYear());
      const mesNum = getMesNumerico(r.mesRef || r.Mes);
      const key = `${code}|${year}|${mesNum}`;
      
      const demVenta = safeNumber(r.UnidadesProyectado);
      const demTraslado = isC1000 ? safeNumber(r._envioC2000) : 0;
      const demTotal = demVenta + demTraslado;

      rowsByMaterialMonth.set(key, {
        ...r,
        _demandaMes: demTotal,
        _prodBase: safeNumber(r._prodViable),
        _prodAdelantada: 0,
        _prodRecuperada: 0,
        _backlogIdentificado: safeNumber(r._backlogVentas),
        _tupp: safeNumber(r.tiempoUnitarioPorPuesto)
      });
    });

    // 2. CÁLCULO DE CAPACIDAD OCIOSA INICIAL
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
          const nl = String(item?.nombre_linea ?? '').toLowerCase().replace(/\s+/g, '');
          return nl === lineaNorm || nl.includes(lineaNorm);
        });

        const capBase = safeNumber(dp?.minutos_horario_normal_TOTAL || 0);
        const capExtras = (tc.diasLaborables * maxExtrasHoras * 60) + (tc.diasSabados * horasExtrasFin * 60);
        const totalMinutos = capBase + capExtras;

        const minutesUsedBase = data
          .filter(row => String(row.lineaRef || row.LineaFabricacion) === linea && getMesNumerico(row.mesRef || row.Mes) === mesNum)
          .reduce((sum, row) => sum + (safeNumber(row._prodViable) * safeNumber(row.tiempoUnitarioPorPuesto)), 0);

        idleTimeByLineMonth.set(lKey, Math.max(0, totalMinutos - minutesUsedBase));
      });
    });

    // 3. LÓGICA REGRESIVA: ADELANTAR PRODUCCIÓN (DE FUTURO A PRESENTE)
    const materials = Array.from(new Set(data.map(r => normalizeMaterialCode(r.CodMaterial))));
    
    materials.forEach(code => {
      for (let i = timeline.length - 1; i >= 0; i--) {
        const tKey = timeline[i];
        const year = Math.floor(tKey / 12);
        const mesNum = (tKey % 12) + 1;
        const currentKey = `${code}|${year}|${mesNum}`;
        const row = rowsByMaterialMonth.get(currentKey);
        
        if (!row) continue;

        // Simulamos si hay backlog en este mes futuro basándonos en el resumen
        let backlogAFijar = row._backlogIdentificado;
        
        if (backlogAFijar > 0) {
          // Buscamos capacidad en meses anteriores (j-1 hasta 0)
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
              const unitsToAdelantar = Math.min(backlogAFijar, Math.floor(availableMin / prevRow._tupp));
              if (unitsToAdelantar > 0) {
                prevRow._prodAdelantada += unitsToAdelantar;
                idleTimeByLineMonth.set(lKey, availableMin - (unitsToAdelantar * prevRow._tupp));
                backlogAFijar -= unitsToAdelantar;
              }
            }
          }
        }
      }
    });

    // 4. LÓGICA PROGRESIVA Y BALANCE FINAL (DE PRESENTE A FUTURO)
    const stockTracker = new Map<string, number>();
    const backlogTracker = new Map<string, number>();
    const finalData: any[] = [];

    for (const tKey of timeline) {
      const year = Math.floor(tKey / 12);
      const mesNum = (tKey % 12) + 1;
      
      materials.forEach(code => {
        const key = `${code}|${year}|${mesNum}`;
        const r = rowsByMaterialMonth.get(key);
        if (!r) return;

        const initialStock = stockTracker.get(code) ?? safeNumber(r.StockActual);
        const backlogPasado = backlogTracker.get(code) || 0;
        
        // Intentar recuperar backlog pasado con el tiempo que queda después de los adelantos
        let prodRecuperada = 0;
        const lKey = `${r.lineaRef || r.LineaFabricacion || 'Sin línea'}|${year}|${mesNum}`;
        const minutesLeft = idleTimeByLineMonth.get(lKey) || 0;
        
        if (backlogPasado > 0 && r._tupp > 0 && minutesLeft > 0) {
          const unitsPossible = Math.min(backlogPasado, Math.floor(minutesLeft / r._tupp));
          prodRecuperada = unitsPossible;
          idleTimeByLineMonth.set(lKey, minutesLeft - (prodRecuperada * r._tupp));
        }

        const prodTotal = r._prodBase + r._prodAdelantada + prodRecuperada;
        const trRecibido = !isC1000 ? (trasladosViables.find(v => normalizeMaterialCode(v.CodMaterial) === code && getMesNumerico(v.mes) === mesNum)?.cantidad || 0) : 0;
        
        const disponibleTotal = initialStock + prodTotal + trRecibido;
        const despachosReales = Math.min(disponibleTotal, r._demandaMes + backlogPasado);
        
        const backlogFinal = Math.max(0, (r._demandaMes + backlogPasado) - despachosReales);
        const finalStock = Math.max(0, disponibleTotal - despachosReales);

        stockTracker.set(code, finalStock);
        backlogTracker.set(code, backlogFinal);

        finalData.push({
          ...r,
          mesNombre: MONTH_NAMES[mesNum],
          _stockInitial: initialStock,
          _prodRecuperada: prodRecuperada,
          _prodViableTotal: prodTotal,
          _backlogPasado: backlogPasado,
          _backlogFuturo: r._backlogIdentificado - (r._prodAdelantada > 0 ? r._prodAdelantada : 0), // Simplificado para visualización
          _despachosReales: despachosReales,
          _backlogFinal: backlogFinal,
          _saldoFinal: finalStock
        });
      });
    }

    return finalData;
  }, [data, tiemposCanon, centro, maxExtrasHoras, horasExtrasFin, trasladosViables]);

  const filteredResults = useMemo(() => {
    let list = results;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(r => String(r.CodMaterial).toLowerCase().includes(q) || String(r.Descripcion).toLowerCase().includes(q));
    }
    if (selectedMes) {
      list = list.filter(r => r.mesNombre === selectedMes);
    }
    return list;
  }, [results, searchTerm, selectedMes]);

  const paginated = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredResults.slice(start, start + itemsPerPage);
  }, [filteredResults, currentPage]);

  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);

  const format = (v: number) => isMounted ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '';

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex flex-col md:flex-row justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800 uppercase">{titulo}</h3>
          <p className="text-xs text-gray-500">Lógica de Nivelación: Adelanto de producción futura + Recuperación de deuda pasada</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input 
            type="text" 
            placeholder="Buscar material..." 
            className="px-3 py-1.5 border rounded-md text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full md:w-48"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
          <select 
            className="px-3 py-1.5 border rounded-md text-sm bg-white outline-none"
            value={selectedMes}
            onChange={e => { setSelectedMes(e.target.value); setCurrentPage(1); }}
          >
            <option value="">Todos los meses</option>
            {Array.from(new Set(results.map(r => r.mesNombre))).map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[65vh]">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-gray-100 text-[10px] uppercase font-bold text-gray-600 shadow-sm">
            <tr>
              <th colSpan={4} className="px-2 py-2 border-r bg-gray-200">Producto</th>
              <th colSpan={2} className="px-2 py-2 border-r bg-indigo-50 text-indigo-800">Necesidad</th>
              <th colSpan={2} className="px-2 py-2 border-r bg-emerald-50 text-emerald-800">Regresivo (Adelanto)</th>
              <th colSpan={2} className="px-2 py-2 border-r bg-blue-50 text-blue-800">Progresivo (Deuda)</th>
              <th colSpan={4} className="px-2 py-2 bg-purple-50 text-purple-800">Resultados Finales</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-1 text-left min-w-[80px]">Mes</th>
              <th className="px-2 py-1 min-w-[40px]">Cl</th>
              <th className="px-2 py-1 min-w-[90px]">Material</th>
              <th className="px-2 py-1 text-left min-w-[150px] border-r">Descripción</th>
              <th className="px-2 py-1 text-right min-w-[70px]">Stock Ini</th>
              <th className="px-2 py-1 text-right min-w-[70px] border-r">Demanda</th>
              <th className="px-2 py-1 text-right min-w-[80px]">BL Futuro</th>
              <th className="px-2 py-1 text-right min-w-[80px] border-r">Prod. Adel (+)</th>
              <th className="px-2 py-1 text-right min-w-[80px]">BL Pasado</th>
              <th className="px-2 py-1 text-right min-w-[80px] border-r">Prod. Rec (+)</th>
              <th className="px-2 py-1 text-right min-w-[80px]">Prod. Total</th>
              <th className="px-2 py-1 text-right min-w-[80px]">Despachos</th>
              <th className="px-2 py-1 text-right min-w-[80px]">Backlog Fin</th>
              <th className="px-2 py-1 text-right min-w-[80px]">S. Final</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-[11px]">
            {paginated.map((r, idx) => (
              <DataRow key={`${r.CodMaterial}-${r.mesRef}-${idx}`} r={r} isMounted={isMounted} format={format} centro={centro} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
        <div className="text-xs text-gray-500 font-medium">
          Registros: <span className="text-gray-800">{filteredResults.length}</span> | Pág {currentPage} de {totalPages}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-1.5 border rounded bg-white hover:bg-gray-100 disabled:opacity-30"><ChevronsLeft className="w-4 h-4" /></button>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 border rounded bg-white hover:bg-gray-100 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <div className="px-4 text-sm font-bold text-blue-700">{currentPage}</div>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 border rounded bg-white hover:bg-gray-100 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-1.5 border rounded bg-white hover:bg-gray-100 disabled:opacity-30"><ChevronsRight className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
};
