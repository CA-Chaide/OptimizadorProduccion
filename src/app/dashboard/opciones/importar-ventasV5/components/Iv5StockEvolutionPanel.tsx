'use client';

/**
 * Iv5StockEvolutionPanel
 *
 * Balance fisico mensual por centro (una tabla por centro):
 *
 *   StockInicialFisico + ProduccionTotal + TrasladoEntrante
 *     - Despachos - TrasladoSaliente = StockFinalFisico
 *
 * La columna de traslado que se MUESTRA cambia segun el centro, porque el
 * flujo es C1000 -> C2000:
 *   - C1000 (origen)  -> Traslado SALIENTE (lo que despacha al otro centro).
 *   - C2000 (destino) -> Traslado ENTRANTE (lo que recibe de C1000).
 *
 * Filtrable por SECTOR (arranca preseleccionado en 01, 02 y 03; el usuario
 * puede elegir otros, todos o ninguno) y soporta comparacion contra una version
 * guardada en `Iv5VersionsPanel` (muestra el delta bajo cada cifra).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IV5_SECTORES_TOPE_AGREGADO } from './iv5Constants';
import { loadIv5Versions } from './iv5Persistence';
import { MultiSelectDropdown } from '../../importar-ventasV2/components/MultiSelectDropdown';
import type { Centro, Iv5MonthlySnapshot, Iv5Version } from './iv5Types';

interface Props {
  monthlyC1000: Iv5MonthlySnapshot[];
  monthlyC2000: Iv5MonthlySnapshot[];
}

/** Fila del reporte: un mes de un centro, ya agregado sobre todos los materiales. */
interface BalanceMes {
  mesEpoch: number;
  mesNombre: string;
  anio: number;
  stockInicialFisico: number;
  produccionTotal: number;
  trasladoEntrante: number;
  trasladoSaliente: number;
  despachos: number;
  stockFinalFisico: number;
  /** Descuadre de la identidad fisica (deberia ser 0). */
  desbalance: number;
}

/** Codigo lider del sector ("01 COLCHONES" -> "01"). Vacio si no arranca con digitos. */
function leadingSectorCode(sector: string): string {
  const m = String(sector ?? '').trim().match(/^(\d{1,2})/);
  return m ? m[1].padStart(2, '0') : '';
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return '-';
  return Math.round(n).toLocaleString('es-EC');
}

function fmtSigned(n: number): string {
  if (!Number.isFinite(n)) return '-';
  const v = Math.round(n);
  if (v === 0) return '0';
  return v > 0 ? `+${v.toLocaleString('es-EC')}` : v.toLocaleString('es-EC');
}

/**
 * El stock fisico incluye las reservas de anticipacion. Si el motor no las
 * reporta (motor original), cae al stock regular.
 */
function iniFisico(r: Iv5MonthlySnapshot): number {
  return Number(r.stockInicialFisicoMes ?? r.stockInicialMes) || 0;
}

function finFisico(r: Iv5MonthlySnapshot): number {
  return Number(r.stockFinalFisicoMes ?? r.stockFinalMes) || 0;
}

/** Agrega el detalle material-mes a un balance por (centro, mes). */
function buildBalance(monthly: Iv5MonthlySnapshot[]): Map<Centro, BalanceMes[]> {
  const porCentro = new Map<Centro, Map<number, BalanceMes>>();

  for (const r of monthly) {
    const mesEpoch = r.anio * 12 + r.mes;
    let meses = porCentro.get(r.centro);
    if (!meses) {
      meses = new Map<number, BalanceMes>();
      porCentro.set(r.centro, meses);
    }
    let b = meses.get(mesEpoch);
    if (!b) {
      b = {
        mesEpoch,
        mesNombre: r.mesNombre,
        anio: r.anio,
        stockInicialFisico: 0,
        produccionTotal: 0,
        trasladoEntrante: 0,
        trasladoSaliente: 0,
        despachos: 0,
        stockFinalFisico: 0,
        desbalance: 0,
      };
      meses.set(mesEpoch, b);
    }
    b.stockInicialFisico += iniFisico(r);
    b.produccionTotal +=
      (Number(r.produccionBase) || 0) +
      (Number(r.produccionAlternativa) || 0) +
      (Number(r.produccionAdelanto) || 0) +
      (Number(r.produccionPio) || 0);
    b.trasladoEntrante += Number(r.trasladoEntrante) || 0;
    b.trasladoSaliente += Number(r.trasladoSaliente) || 0;
    b.despachos += Number(r.despachosVentas) || 0;
    b.stockFinalFisico += finFisico(r);
  }

  const out = new Map<Centro, BalanceMes[]>();
  for (const [centro, meses] of porCentro) {
    const filas = Array.from(meses.values()).sort((a, b) => a.mesEpoch - b.mesEpoch);
    for (const f of filas) {
      f.desbalance = Math.round(
        f.stockInicialFisico +
          f.produccionTotal +
          f.trasladoEntrante -
          f.despachos -
          f.trasladoSaliente -
          f.stockFinalFisico,
      );
    }
    out.set(centro, filas);
  }
  return out;
}

/**
 * Traslado a mostrar segun el centro: el destino (2000) reporta lo ENTRANTE,
 * el resto (origen) reporta lo SALIENTE.
 */
function columnaTraslado(centro: Centro): { key: 'trasladoEntrante' | 'trasladoSaliente'; label: string } {
  return String(centro) === '2000'
    ? { key: 'trasladoEntrante', label: 'Traslado entrante' }
    : { key: 'trasladoSaliente', label: 'Traslado saliente' };
}

const cellNum = 'px-3 py-1.5 text-right font-mono whitespace-nowrap tabular-nums';
const cellHead =
  'px-3 py-1.5 text-[11px] text-right font-semibold text-gray-700 bg-gray-50 border-b border-gray-200 whitespace-nowrap';

export const Iv5StockEvolutionPanel: React.FC<Props> = ({ monthlyC1000, monthlyC2000 }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [compareVersionId, setCompareVersionId] = useState<string>('');
  const [versions, setVersions] = useState<Iv5Version[]>([]);

  useEffect(() => {
    setVersions(loadIv5Versions());
  }, []);

  const refreshVersions = () => setVersions(loadIv5Versions());

  const currentMonthly = useMemo(
    () => [...monthlyC1000, ...monthlyC2000],
    [monthlyC1000, monthlyC2000],
  );

  // --- Filtro por sector -----------------------------------------------------
  const [sectoresSel, setSectoresSel] = useState<string[]>([]);

  const sectoresDisponibles = useMemo(
    () => Array.from(new Set(currentMonthly.map((r) => String(r.sectorRef ?? '').trim()))).sort(),
    [currentMonthly],
  );

  /**
   * Seleccion por defecto: solo los sectores 01, 02 y 03 (fabricacion propia).
   * Si el dataset no trae ninguno de esos, se preseleccionan todos.
   */
  const sectoresPorDefecto = useCallback((disponibles: string[]) => {
    const base = disponibles.filter((s) =>
      (IV5_SECTORES_TOPE_AGREGADO as readonly string[]).includes(leadingSectorCode(s)),
    );
    return base.length > 0 ? base : [...disponibles];
  }, []);

  useEffect(() => {
    setSectoresSel(sectoresPorDefecto(sectoresDisponibles));
  }, [sectoresDisponibles, sectoresPorDefecto]);

  const filtrarPorSector = useCallback(
    (rows: Iv5MonthlySnapshot[]) => {
      const sel = new Set(sectoresSel);
      return rows.filter((r) => sel.has(String(r.sectorRef ?? '').trim()));
    },
    [sectoresSel],
  );

  const monthlyFiltrado = useMemo(
    () => filtrarPorSector(currentMonthly),
    [currentMonthly, filtrarPorSector],
  );

  const balanceActual = useMemo(() => buildBalance(monthlyFiltrado), [monthlyFiltrado]);

  const compareVersion = useMemo(
    () => versions.find((v) => v.id === compareVersionId) ?? null,
    [versions, compareVersionId],
  );

  const balanceComparar = useMemo(() => {
    if (!compareVersion) return null;
    // Se aplica el MISMO filtro de sector a la version, para comparar lo comparable.
    return buildBalance(
      filtrarPorSector([...compareVersion.monthlyC1000, ...compareVersion.monthlyC2000]),
    );
  }, [compareVersion, filtrarPorSector]);

  const centros = useMemo(() => Array.from(balanceActual.keys()).sort(), [balanceActual]);

  if (currentMonthly.length === 0) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        Sin datos mensuales. Calcula el plan de produccion para ver el balance de stock.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
          >
            {collapsed ? 'Expandir tabla' : 'Colapsar tabla'}
          </button>
          <span className="text-[11px] text-gray-500">
            {centros.length} centro(s), {balanceActual.get(centros[0])?.length ?? 0} mes(es)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[11px] text-gray-700">Comparar con:</label>
          <select
            value={compareVersionId}
            onChange={(e) => setCompareVersionId(e.target.value)}
            className="text-[11px] border border-gray-300 rounded px-2 py-1 bg-white"
          >
            <option value="">— Solo corrida actual —</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id} {v.nota ? `(${v.nota})` : ''} — {new Date(v.savedAt).toLocaleString('es-EC')}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={refreshVersions}
            className="text-[11px] px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
            title="Recargar lista de versiones guardadas"
          >
            ↻
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-3 border-t border-gray-100 pt-2">
        <div className="min-w-[220px] [&>div>label]:text-[11px] [&>div>label]:font-semibold [&>div>label]:text-gray-600 [&>div>label]:mb-1 [&>div>button]:py-1 [&>div>button]:text-[11px] [&>div>.mt-2]:max-h-24 [&>div>.mt-2]:overflow-auto">
          <MultiSelectDropdown
            label="Sectores"
            options={sectoresDisponibles.map((s) => ({ value: s, label: s }))}
            selected={sectoresSel}
            onChange={setSectoresSel}
          />
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSectoresSel([...sectoresDisponibles])}
              className="text-[10px] text-blue-700 hover:underline"
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setSectoresSel(sectoresPorDefecto(sectoresDisponibles))}
              className="text-[10px] text-blue-700 hover:underline"
              title="Volver a la seleccion inicial: sectores 01, 02 y 03"
            >
              01 + 02 + 03
            </button>
            <button
              type="button"
              onClick={() => setSectoresSel([])}
              className="text-[10px] text-gray-600 hover:underline"
            >
              Limpiar
            </button>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 max-w-md pt-5">
          Las cifras son la suma de los sectores seleccionados ({sectoresSel.length} de{' '}
          {sectoresDisponibles.length}). Al cambiar el filtro cambian tambien los stocks, porque solo
          se acumulan los materiales de esos sectores.
        </p>
      </div>

      {sectoresSel.length === 0 ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900">
          No hay sectores seleccionados, por eso no se muestra ningun dato. Elegi al menos un sector
          (o pulsa <strong>01 + 02 + 03</strong> para volver al filtro inicial).
        </div>
      ) : (
        !collapsed && (
          <div className="space-y-3">
            {centros.map((centro) => (
              <CentroBalanceTable
                key={centro}
                centro={centro}
                filas={balanceActual.get(centro) ?? []}
                filasComparar={balanceComparar?.get(centro) ?? null}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
};

interface CentroBalanceTableProps {
  centro: Centro;
  filas: BalanceMes[];
  filasComparar: BalanceMes[] | null;
}

const CentroBalanceTable: React.FC<CentroBalanceTableProps> = ({ centro, filas, filasComparar }) => {
  const traslado = columnaTraslado(centro);
  const comparando = filasComparar !== null;
  const prevPorMes = useMemo(() => {
    const m = new Map<number, BalanceMes>();
    for (const f of filasComparar ?? []) m.set(f.mesEpoch, f);
    return m;
  }, [filasComparar]);

  // Totales del periodo: los flujos se suman; el stock NO se suma (se toma el
  // inicial del primer mes y el final del ultimo).
  const total = useMemo(() => {
    if (filas.length === 0) return null;
    return {
      stockInicialFisico: filas[0].stockInicialFisico,
      produccionTotal: filas.reduce((s, f) => s + f.produccionTotal, 0),
      trasladoEntrante: filas.reduce((s, f) => s + f.trasladoEntrante, 0),
      trasladoSaliente: filas.reduce((s, f) => s + f.trasladoSaliente, 0),
      despachos: filas.reduce((s, f) => s + f.despachos, 0),
      stockFinalFisico: filas[filas.length - 1].stockFinalFisico,
    };
  }, [filas]);

  const desbalanceMax = useMemo(
    () => filas.reduce((mx, f) => Math.max(mx, Math.abs(f.desbalance)), 0),
    [filas],
  );

  /** Celda numerica; en modo comparacion agrega el delta vs la version. */
  const Celda: React.FC<{ valor: number; previo?: number }> = ({ valor, previo }) => {
    const delta = previo === undefined ? 0 : valor - previo;
    return (
      <td className={cellNum}>
        <div>{fmt(valor)}</div>
        {comparando && (
          <div
            className={`text-[9px] ${
              delta > 0 ? 'text-emerald-700' : delta < 0 ? 'text-red-700' : 'text-gray-400'
            }`}
          >
            {fmtSigned(delta)}
          </div>
        )}
      </td>
    );
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-slate-800 text-white px-3 py-1.5 text-xs font-semibold">
        Centro {centro}
        {comparando && ' — con delta vs version guardada'}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[11px]">
          <thead>
            <tr>
              <th className={`${cellHead} text-left`}>Mes</th>
              <th className={cellHead}>Stock inicial fisico</th>
              <th className={cellHead}>Produccion total</th>
              <th className={cellHead}>{traslado.label}</th>
              <th className={cellHead}>Despachos</th>
              <th className={cellHead}>Stock final fisico</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => {
              const prev = prevPorMes.get(f.mesEpoch);
              return (
                <tr key={f.mesEpoch} className="odd:bg-white even:bg-gray-50">
                  <td className="px-3 py-1.5 font-medium text-gray-800 whitespace-nowrap">
                    {f.mesNombre} {f.anio}
                  </td>
                  <Celda valor={f.stockInicialFisico} previo={prev?.stockInicialFisico} />
                  <Celda valor={f.produccionTotal} previo={prev?.produccionTotal} />
                  <Celda valor={f[traslado.key]} previo={prev?.[traslado.key]} />
                  <Celda valor={f.despachos} previo={prev?.despachos} />
                  <Celda valor={f.stockFinalFisico} previo={prev?.stockFinalFisico} />
                </tr>
              );
            })}
            {total && (
              <tr className="bg-slate-100 font-semibold text-gray-900 border-t border-gray-300">
                <td className="px-3 py-1.5 whitespace-nowrap">TOTAL periodo</td>
                <td className={cellNum} title="Stock inicial del primer mes (no es una suma)">
                  {fmt(total.stockInicialFisico)}
                </td>
                <td className={cellNum}>{fmt(total.produccionTotal)}</td>
                <td className={cellNum}>{fmt(total[traslado.key])}</td>
                <td className={cellNum}>{fmt(total.despachos)}</td>
                <td className={cellNum} title="Stock final del ultimo mes (no es una suma)">
                  {fmt(total.stockFinalFisico)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {desbalanceMax !== 0 && (
        <div className="px-3 py-1.5 text-[10px] text-red-800 bg-red-50 border-t border-red-200">
          ⚠️ La identidad de balance no cierra en algun mes (descuadre max: {fmt(desbalanceMax)} uds).
          Stock final fisico deberia ser: inicial + produccion + entrante − despachos − saliente.
        </div>
      )}
    </div>
  );
};
