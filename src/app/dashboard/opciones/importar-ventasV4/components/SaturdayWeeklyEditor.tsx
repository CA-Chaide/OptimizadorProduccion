'use client';

import React, { useMemo } from 'react';
import type { SaturdayProposalByMonth } from './saturdayPlannerV4';

interface Props {
  centros: string[];
  proposal: SaturdayProposalByMonth;
  systemIdentifiedSatKeys: Set<string>;
  draftByCenter: Record<string, Set<string>>;
  committedByCenter: Record<string, Set<string>>;
  /** Minutos que aporta un sabado activo (= horasExtrasFin * 60). */
  satMinutos: number;
  /**
   * Tope fisico de sabados/mes (por centro). Si el usuario marca mas de este
   * numero en un mes, el motor solo cuenta los primeros N (por fecha) e ignora
   * los sobrantes. Opcional: si no se pasa, no se aplica el aviso (IV4).
   */
  maxSabadosMes?: number;
  /** Si hay diferencia entre borrador y confirmacion. */
  selectionDirty: boolean;
  /** Centros sin ningun sabado seleccionado en lo confirmado. */
  centrosPendientes: string[];
  onToggle: (centro: string, satKey: string) => void;
  onApplyProposal: (centro: string) => void;
  onConfirm: () => void;
}

export const SaturdayWeeklyEditor: React.FC<Props> = ({
  centros,
  proposal,
  systemIdentifiedSatKeys,
  draftByCenter,
  committedByCenter,
  satMinutos,
  maxSabadosMes,
  selectionDirty,
  centrosPendientes,
  onToggle,
  onApplyProposal,
  onConfirm,
}) => {
  const months = useMemo(() => Array.from(proposal.entries()), [proposal]);

  if (centros.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic p-3 border border-gray-200 rounded">
        Selecciona al menos un centro y carga los datos para ver semanas con sabado.
      </div>
    );
  }

  if (months.length === 0) {
    return (
      <div className="text-xs text-gray-500 italic p-3 border border-gray-200 rounded">
        Aun no hay meses con propuesta de sabados (carga tiempos canonicos).
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="text-[11px] text-gray-700">
          Cada sabado activado aporta <strong>+{satMinutos} min</strong> a la semana.
          Las marcadas como <strong className="text-blue-700">Identificada</strong> son las que el sistema
          eligio para la propuesta automatica; puedes activar otras adicionales o desactivar.
        </p>
        {selectionDirty ? (
          <button
            type="button"
            onClick={onConfirm}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 shrink-0"
            title="Aplica el borrador de sabados a la seleccion confirmada. Luego pulsa Calcular Plan de produccion para recalcular."
          >
            Confirmar seleccion de sabados
          </button>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-300 shrink-0"
            title="Tu seleccion de sabados esta confirmada. Pulsa Calcular Plan de produccion para ver el resultado con estos sabados."
          >
            <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-current" aria-hidden="true">
              <path d="M7.5 13.5l-3-3 1.4-1.4 1.6 1.6 5.1-5.1 1.4 1.4z" />
            </svg>
            Seleccion de sabados confirmada
          </span>
        )}
      </div>

      {centrosPendientes.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900">
          Centros sin sabado seleccionado: <strong>{centrosPendientes.join(', ')}</strong>.
          Aplica la propuesta o marca al menos una semana en el borrador y confirma.
        </div>
      )}

      {centros.map(centro => {
        const draftSat = draftByCenter[centro] ?? new Set<string>();
        const committedSat = committedByCenter[centro] ?? new Set<string>();
        const totalSemActivas = draftSat.size;
        const minutosAgregados = totalSemActivas * satMinutos;
        return (
          <div key={centro} className="border border-gray-200 bg-gray-50 rounded p-3">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <div className="text-xs font-semibold text-gray-800">
                Centro {centro}
                <span className="ml-2 font-normal text-gray-600">
                  Borrador: {totalSemActivas} sabado(s) - +{minutosAgregados} min total
                </span>
              </div>
              <button
                type="button"
                onClick={() => onApplyProposal(centro)}
                className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                title="Une la propuesta automatica con tu seleccion manual de este centro"
              >
                Aplicar propuesta
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {months.map(([month, cfg]) => {
                // Sabados marcados en este mes (ya en orden cronologico, como cfg.satKeys).
                const seleccionadosMes = cfg.satKeys.filter((sk) => draftSat.has(sk));
                // Tope fisico: el motor solo cuenta los primeros N por fecha; el
                // resto se ignora (capSab = 0). Sin tope definido -> Infinity.
                const topeMes =
                  typeof maxSabadosMes === 'number' && Number.isFinite(maxSabadosMes)
                    ? maxSabadosMes
                    : Infinity;
                const ignorados = new Set(seleccionadosMes.slice(Math.max(0, topeMes)));
                return (
                <div key={`${centro}-${month}`} className="border border-gray-200 bg-white rounded p-2">
                  <div className="text-[11px] font-semibold text-gray-700 mb-1">
                    {month} - Requeridos: {cfg.required} de {cfg.satKeys.length} disponibles
                    {Number.isFinite(topeMes) && (
                      <span className="ml-1 font-normal text-gray-500">
                        (marcados: {seleccionadosMes.length} / tope: {topeMes})
                      </span>
                    )}
                  </div>
                  {ignorados.size > 0 && (
                    <div className="mb-1 rounded border border-red-300 bg-red-50 px-2 py-1 text-[10px] text-red-800">
                      Marcaste <strong>{seleccionadosMes.length}</strong> sabados en {month} pero el
                      tope es <strong>{topeMes}</strong>. El motor usara solo los <strong>{topeMes}</strong>{' '}
                      primeros (por fecha); los <strong>{ignorados.size}</strong> restantes{' '}
                      <strong>no aportaran horas</strong>.
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {cfg.satKeys.length === 0 ? (
                      <span className="text-[10px] text-gray-500">Sin sabados disponibles.</span>
                    ) : (
                      cfg.satKeys.map(sk => {
                        const identified = systemIdentifiedSatKeys.has(sk);
                        const enDraft = draftSat.has(sk);
                        const enConfirmado = committedSat.has(sk);
                        const dirtyCell = enDraft !== enConfirmado;
                        const ignorado = ignorados.has(sk);
                        return (
                          <button
                            key={`${centro}-${sk}`}
                            type="button"
                            onClick={() => onToggle(centro, sk)}
                            title={
                              `${sk}` +
                              (identified ? ' - Identificada por el sistema' : '') +
                              (enDraft && !ignorado ? ` - Aporta +${satMinutos} min` : '') +
                              (ignorado ? ' - Sobre el tope: el motor lo ignora (0 min)' : '') +
                              (dirtyCell ? ' - Sin confirmar' : '')
                            }
                            className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] rounded border transition-colors ${
                              ignorado
                                ? 'bg-red-100 border-red-400 text-red-800'
                                : enDraft
                                ? 'bg-blue-600 border-blue-700 text-white hover:bg-blue-700'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400'
                            } ${identified ? 'ring-1 ring-blue-400 ring-offset-1' : ''} ${
                              dirtyCell ? 'outline outline-1 outline-amber-500' : ''
                            }`}
                          >
                            <span className={`leading-tight ${ignorado ? 'line-through' : ''}`}>{sk}</span>
                            <span className={`text-[8px] ${enDraft && !ignorado ? 'text-blue-100' : 'text-gray-500'}`}>
                              {ignorado ? '0 (tope)' : enDraft ? `+${satMinutos}` : '-'}
                            </span>
                            {identified && !ignorado && (
                              <span
                                className={`text-[7px] font-semibold ${enDraft ? 'text-blue-100' : 'text-blue-700'}`}
                              >
                                Identificada
                              </span>
                            )}
                            {ignorado && (
                              <span className="text-[7px] font-semibold text-red-700">No cuenta</span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
