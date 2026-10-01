'use client';

/**
 * ProduccionDiariaSection (seccion 4c)
 *
 * Produccion planificada dia por dia, presentada como arbol colapsable de tres
 * niveles para no saturar la pantalla:
 *
 *   Centro  (contraido por defecto)
 *     └─ Mes      (se expande al abrir el centro)
 *          └─ Semana  (se expande al abrir el mes)
 *               └─ Dias  (fechas reales; el sabado va aparte)
 *
 * Cada nivel muestra su total de unidades y de horas usadas, asi el usuario ve
 * las cifras agregadas sin necesidad de desplegar el detalle.
 */

import React, { useMemo, useState } from 'react';
import type { Iv5WeeklyRow } from './iv5Types';
import { buildProduccionDiaria, type DiaProduccion } from './iv5ProduccionDiaria';

interface Props {
  weeklyRows: Iv5WeeklyRow[];
}

const fmt0 = (n: number) => Math.round(n).toLocaleString('es-EC');
const fmt1 = (n: number) => n.toLocaleString('es-EC', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

interface SemanaNodo {
  key: string; // weekKey
  etiqueta: string; // 'Sem 36'
  dias: DiaProduccion[];
  produccion: number;
  horas: number;
}

interface MesNodo {
  key: string; // 'anio-mes'
  etiqueta: string; // 'Septiembre 2026'
  semanas: SemanaNodo[];
  produccion: number;
  horas: number;
}

/** Agrupa los dias de un centro en meses -> semanas, acumulando totales. */
function agruparPorMesYSemana(dias: DiaProduccion[]): MesNodo[] {
  const meses = new Map<string, MesNodo>();
  for (const d of dias) {
    const mesKey = `${d.anio}-${String(d.mes).padStart(2, '0')}`;
    let mes = meses.get(mesKey);
    if (!mes) {
      mes = { key: mesKey, etiqueta: `${d.mesNombre} ${d.anio}`, semanas: [], produccion: 0, horas: 0 };
      meses.set(mesKey, mes);
    }
    let sem = mes.semanas.find((s) => s.key === d.weekKey);
    if (!sem) {
      sem = { key: d.weekKey, etiqueta: `Sem ${d.isoWeek}`, dias: [], produccion: 0, horas: 0 };
      mes.semanas.push(sem);
    }
    sem.dias.push(d);
    sem.produccion += d.produccion;
    sem.horas += d.horas;
    mes.produccion += d.produccion;
    mes.horas += d.horas;
  }
  return Array.from(meses.values());
}

export const ProduccionDiariaSection: React.FC<Props> = ({ weeklyRows }) => {
  const data = useMemo(() => buildProduccionDiaria(weeklyRows), [weeklyRows]);

  // Todo arranca CONTRAIDO: sets vacios = nada expandido.
  const [centrosAbiertos, setCentrosAbiertos] = useState<Set<string>>(new Set());
  const [mesesAbiertos, setMesesAbiertos] = useState<Set<string>>(new Set());
  const [semanasAbiertas, setSemanasAbiertas] = useState<Set<string>>(new Set());

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const porCentro = useMemo(
    () => data.map((c) => ({ centro: c.centro, meses: agruparPorMesYSemana(c.dias), dias: c.dias })),
    [data],
  );

  if (data.length === 0) {
    return (
      <p className="text-[11px] text-gray-500 italic">
        Calculá el plan para ver la producción diaria (sectores 01+02+03) por centro.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-gray-500">
        Pulsá cada nivel para desplegarlo: <strong>centro</strong> → <strong>mes</strong> →{' '}
        <strong>semana</strong> → días.
      </p>

      {porCentro.map((c) => {
        const centroAbierto = centrosAbiertos.has(c.centro);
        const totalProd = c.dias.reduce((s, d) => s + d.produccion, 0);
        const totalHoras = c.dias.reduce((s, d) => s + d.horas, 0);

        return (
          <div key={c.centro} className="border border-gray-200 rounded overflow-hidden">
            {/* Nivel 1 — CENTRO */}
            <button
              type="button"
              onClick={() => toggle(centrosAbiertos, setCentrosAbiertos, c.centro)}
              className="w-full flex items-center justify-between bg-gray-50 hover:bg-gray-100 px-3 py-2 border-b border-gray-200 text-left"
              title={centroAbierto ? 'Contraer centro' : 'Expandir meses del centro'}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                <span className="text-[10px] text-gray-500 w-3">{centroAbierto ? '▼' : '▶'}</span>
                Centro {c.centro}
                <span className="font-normal text-gray-500">({c.meses.length} mes(es))</span>
              </span>
              <span className="text-[11px] text-gray-600">
                Total: <strong>{fmt0(totalProd)}</strong> uds · <strong>{fmt1(totalHoras)}</strong> h
              </span>
            </button>

            {centroAbierto && (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-white border-b border-gray-200 text-gray-600">
                      <th className="text-left px-3 py-1.5 font-medium">Periodo / Fecha</th>
                      <th className="text-left px-3 py-1.5 font-medium">Día</th>
                      <th className="text-right px-3 py-1.5 font-medium">Producción (uds)</th>
                      <th className="text-right px-3 py-1.5 font-medium">Horas usadas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.meses.map((mes) => {
                      const mesKey = `${c.centro}|${mes.key}`;
                      const mesAbierto = mesesAbiertos.has(mesKey);
                      return (
                        <React.Fragment key={mesKey}>
                          {/* Nivel 2 — MES */}
                          <tr
                            className="bg-slate-100 font-semibold text-slate-900 border-b border-slate-200 cursor-pointer hover:bg-slate-200"
                            onClick={() => toggle(mesesAbiertos, setMesesAbiertos, mesKey)}
                          >
                            <td className="px-3 py-1" colSpan={2}>
                              <span className="text-[10px] text-slate-500 mr-1.5">
                                {mesAbierto ? '▼' : '▶'}
                              </span>
                              {mes.etiqueta}
                              <span className="ml-2 font-normal text-slate-500">
                                ({mes.semanas.length} semana(s))
                              </span>
                            </td>
                            <td className="px-3 py-1 text-right tabular-nums">{fmt0(mes.produccion)}</td>
                            <td className="px-3 py-1 text-right tabular-nums">{fmt1(mes.horas)}</td>
                          </tr>

                          {mesAbierto &&
                            mes.semanas.map((sem) => {
                              const semKey = `${c.centro}|${sem.key}`;
                              const semAbierta = semanasAbiertas.has(semKey);
                              return (
                                <React.Fragment key={semKey}>
                                  {/* Nivel 3 — SEMANA */}
                                  <tr
                                    className="bg-gray-100 text-gray-700 border-b border-gray-200 cursor-pointer hover:bg-gray-200"
                                    onClick={() => toggle(semanasAbiertas, setSemanasAbiertas, semKey)}
                                  >
                                    <td className="px-3 py-1 pl-7" colSpan={2}>
                                      <span className="text-[10px] text-gray-500 mr-1.5">
                                        {semAbierta ? '▼' : '▶'}
                                      </span>
                                      {sem.etiqueta}
                                      <span className="ml-2 text-gray-500">({sem.dias.length} día(s))</span>
                                    </td>
                                    <td className="px-3 py-1 text-right tabular-nums">{fmt0(sem.produccion)}</td>
                                    <td className="px-3 py-1 text-right tabular-nums">{fmt1(sem.horas)}</td>
                                  </tr>

                                  {/* Nivel 4 — DIAS */}
                                  {semAbierta &&
                                    sem.dias.map((d) => (
                                      <tr
                                        key={`${c.centro}-${d.fecha}`}
                                        className={`border-b border-gray-100 ${d.esSabado ? 'bg-blue-50' : ''}`}
                                      >
                                        <td className="px-3 py-1 pl-11 text-gray-700">
                                          {String(d.dia).padStart(2, '0')} {d.mesNombre}
                                        </td>
                                        <td
                                          className={`px-3 py-1 ${
                                            d.esSabado ? 'font-semibold text-blue-800' : 'text-gray-600'
                                          }`}
                                        >
                                          {d.diaSemana}
                                          {d.esSabado && (
                                            <span className="ml-1 text-[9px] text-blue-700">(sábado)</span>
                                          )}
                                        </td>
                                        <td className="px-3 py-1 text-right tabular-nums text-gray-900">
                                          {fmt0(d.produccion)}
                                        </td>
                                        <td className="px-3 py-1 text-right tabular-nums text-gray-700">
                                          {fmt1(d.horas)}
                                        </td>
                                      </tr>
                                    ))}
                                </React.Fragment>
                              );
                            })}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
