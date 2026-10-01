'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { restriccionService } from '@/services/restriccion.service';

/**
 * Pestaña "Ajuste de horas" de IV5.
 *
 * Permite editar los factores `FACTOR_AJUSTE_*` que convierten las horas BASE
 * (jornada normal, extras, sábados) en horas NETAS que el motor consume, de
 * forma INDEPENDIENTE POR CENTRO (1000 / 2000). El usuario ingresa las HORAS
 * NETAS y el componente calcula el porcentaje (= (neto/base − 1) × 100), que es
 * lo que se guarda en la BD. Cada factor existe en varias filas (una por grupo;
 * el centro sale de `grupo.centro`); al guardar una celda se actualizan TODAS
 * las filas de ese factor en los grupos del centro. Tras guardar invoca
 * `onSaved` para que IV5 recargue los valores.
 */
export interface AjusteHorasSectionProps {
  /** Horas base por tipo (desde HORAS_TRABAJO / MAX_EXTRAS_HORAS / HORAS_EXTRAS_FIN_SEMANA). */
  horasTrabajo: number;
  maxExtrasHoras: number;
  horasExtrasFin: number;
  /** Permite a la página recargar las restricciones que usa IV5 tras guardar. */
  onSaved?: () => void;
}

interface Restr {
  codigo_restriccion: number;
  codigo_grupo: number;
  nombre_restriccion: string;
  valor_restriccion: string;
  descripcion?: string;
  estado?: string;
  usuario_modificacion?: string;
  grupo?: { centro?: string };
}

interface FactorDef {
  name: string;
  label: string;
  base: number;
  descripcion: string;
}

const round = (n: number, dec = 2) => Number(n.toFixed(dec));
const cellKey = (name: string, centro: string) => `${centro}|${name}`;

export const AjusteHorasSection: React.FC<AjusteHorasSectionProps> = ({
  horasTrabajo,
  maxExtrasHoras,
  horasExtrasFin,
  onSaved,
}) => {
  const [rows, setRows] = useState<Restr[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [ok, setOk] = useState<string>('');

  // Edición: `${centro}|${nombre_factor}` -> horas netas (string del input).
  const [edits, setEdits] = useState<Record<string, string>>({});

  const factores = useMemo<FactorDef[]>(() => [
    { name: 'FACTOR_AJUSTE_HORAS_NORMALES', label: 'Horas normales (jornada)', base: horasTrabajo, descripcion: 'Factor de ajuste (%) de horas normales: convierte la jornada base en horas netas para IV5.' },
    { name: 'FACTOR_AJUSTE_HORAS_EXTRAS', label: 'Horas extras', base: maxExtrasHoras, descripcion: 'Factor de ajuste (%) de horas extras: convierte las horas extra base en horas netas para IV5.' },
    { name: 'FACTOR_AJUSTE_SABADOS', label: 'Sábados', base: horasExtrasFin, descripcion: 'Factor de ajuste (%) de horas de sábado: convierte las horas de sábado base en horas netas para IV5.' },
  ], [horasTrabajo, maxExtrasHoras, horasExtrasFin]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    setOk('');
    setEdits({});
    try {
      const res = await restriccionService.getAll();
      const all = (res.data ?? []) as Restr[];
      setRows(all.filter((r) => String(r.nombre_restriccion ?? '').startsWith('FACTOR_AJUSTE_')));
    } catch (e) {
      console.error('Error al recuperar factores de ajuste:', e);
      setError((e as Error).message || 'Error al recuperar las restricciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const centros = useMemo(
    () => Array.from(new Set(rows.map((r) => String(r.grupo?.centro ?? '').trim()).filter(Boolean))).sort(),
    [rows],
  );

  // Porcentaje vigente en BD por (factor, centro): primera fila que matchea.
  const pctBD = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const c = String(r.grupo?.centro ?? '').trim();
      if (!c) continue;
      const k = cellKey(r.nombre_restriccion, c);
      if (!m.has(k)) {
        const v = Number(r.valor_restriccion);
        m.set(k, Number.isFinite(v) ? v : 0);
      }
    }
    return m;
  }, [rows]);

  // Horas netas vigentes para (factor, centro) = base × (1 + pct/100).
  const netasBD = (f: FactorDef, c: string): number | null => {
    const pct = pctBD.get(cellKey(f.name, c));
    if (pct == null) return null;
    return round(f.base * (1 + pct / 100), 3);
  };

  const valorNetas = (f: FactorDef, c: string): string => {
    const k = cellKey(f.name, c);
    if (k in edits) return edits[k];
    const n = netasBD(f, c);
    return n == null ? '' : String(n);
  };

  // Porcentaje resultante de las horas netas ingresadas para (factor, centro).
  const pctDesdeNetas = (f: FactorDef, c: string): number | null => {
    const raw = valorNetas(f, c);
    if (raw === '' || f.base <= 0) return null;
    const netas = Number(raw);
    if (!Number.isFinite(netas)) return null;
    return round((netas / f.base - 1) * 100, 2);
  };

  // Cambios pendientes por (factor, centro).
  const cambios = useMemo(() => {
    const out: { name: string; label: string; centro: string; pctNuevo: number; pctViejo: number; netas: number }[] = [];
    for (const f of factores) {
      for (const c of centros) {
        const k = cellKey(f.name, c);
        if (!(k in edits)) continue;
        const pctNuevo = pctDesdeNetas(f, c);
        if (pctNuevo == null) continue;
        const pctViejo = pctBD.get(k) ?? 0;
        if (pctNuevo !== pctViejo) out.push({ name: f.name, label: f.label, centro: c, pctNuevo, pctViejo, netas: Number(edits[k]) });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edits, factores, centros, pctBD]);

  const guardar = useCallback(async () => {
    if (cambios.length === 0) return;
    const resumen = cambios.map((c) =>
      `• ${c.label} (C${c.centro}): ${c.pctViejo}% → ${c.pctNuevo}%  (${c.netas} h netas)`,
    ).join('\n');
    if (!confirm(`Se actualizarán ${cambios.length} factor(es) en la base de datos:\n\n${resumen}\n\n¿Continuar?`)) return;

    setSaving(true);
    setError('');
    setOk('');
    try {
      // Para cada (factor, centro) cambiado: actualiza TODAS las filas de ese
      // factor en grupos de ese centro.
      const cambioPorCelda = new Map(cambios.map((c) => [cellKey(c.name, c.centro), c]));
      let n = 0;
      for (const r of rows) {
        const c = String(r.grupo?.centro ?? '').trim();
        const cambio = cambioPorCelda.get(cellKey(r.nombre_restriccion, c));
        if (!cambio) continue;
        const def = factores.find((f) => f.name === r.nombre_restriccion);
        await restriccionService.save({
          codigo_restriccion: r.codigo_restriccion,
          codigo_grupo: r.codigo_grupo,
          nombre_restriccion: r.nombre_restriccion,
          valor_restriccion: String(cambio.pctNuevo),
          descripcion: r.descripcion ?? def?.descripcion ?? '',
          estado: r.estado ?? 'A',
          usuario_modificacion: 'sistema',
        } as any);
        n++;
      }
      setOk(`Guardado: ${n} fila(s) actualizada(s) (${cambios.length} cambio(s)).`);
      await cargar();
      onSaved?.();
    } catch (e) {
      console.error('Error al guardar factores de ajuste:', e);
      setError((e as Error).message || 'Error al guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }, [cambios, rows, factores, cargar, onSaved]);

  const descartar = () => { setEdits({}); setOk(''); };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Ajuste de horas — horas netas que consume IV5 (por centro)</h3>
            <p className="text-xs text-gray-500 max-w-2xl">
              Ingresá las <strong>horas netas</strong> reales por tipo de jornada y centro. El sistema calcula el
              porcentaje de ajuste y lo guarda en las restricciones <code>FACTOR_AJUSTE_*</code>. IV5 multiplica el
              tiempo disponible de cada centro por su factor (las horas base no cambian).
            </p>
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={cargar} disabled={loading || saving}
              className="text-xs px-3 py-1.5 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:text-gray-400 disabled:border-gray-300">
              {loading ? 'Cargando...' : 'Refrescar'}
            </button>
            <button type="button" onClick={descartar} disabled={saving || cambios.length === 0}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:border-gray-200">
              Descartar
            </button>
            <button type="button" onClick={guardar} disabled={saving || cambios.length === 0}
              className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300">
              {saving ? 'Guardando...' : `Guardar cambios${cambios.length ? ` (${cambios.length})` : ''}`}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</div>
        )}
        {ok && (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">{ok}</div>
        )}

        {centros.length === 0 ? (
          <div className="text-xs text-gray-500 italic px-3 py-4 text-center">
            {loading ? 'Cargando datos...' : 'No se encontraron restricciones FACTOR_AJUSTE_*.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th rowSpan={2} className="px-3 py-2 text-left font-semibold text-gray-600 align-bottom">Tipo de jornada</th>
                  <th rowSpan={2} className="px-3 py-2 text-center font-semibold text-gray-600 align-bottom">Horas base</th>
                  {centros.map((c) => (
                    <th key={c} colSpan={2} className="px-3 py-2 text-center font-semibold text-gray-600 border-l border-gray-200">Centro {c}</th>
                  ))}
                </tr>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {centros.map((c) => (
                    <React.Fragment key={c}>
                      <th className="px-3 py-1 text-center font-medium text-gray-500 border-l border-gray-200">Horas netas</th>
                      <th className="px-3 py-1 text-center font-medium text-gray-500">Factor</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {factores.map((f) => (
                  <tr key={f.name} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{f.label}</td>
                    <td className="px-3 py-2 text-center font-mono text-gray-700">{f.base || '—'}</td>
                    {centros.map((c) => {
                      const k = cellKey(f.name, c);
                      const existe = pctBD.has(k);
                      const pctNuevo = pctDesdeNetas(f, c);
                      const pctViejo = pctBD.get(k) ?? 0;
                      const cambiado = k in edits && pctNuevo != null && pctNuevo !== pctViejo;
                      return (
                        <React.Fragment key={c}>
                          <td className="px-3 py-2 text-center border-l border-gray-200">
                            {existe && f.base > 0 ? (
                              <input type="number" min={0} step="0.001" value={valorNetas(f, c)}
                                onChange={(e) => { setOk(''); setEdits((p) => ({ ...p, [k]: e.target.value })); }}
                                className={`border rounded px-2 py-1 w-24 text-right ${cambiado ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`} />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center font-mono">
                            {pctNuevo == null ? (
                              <span className="text-gray-300">—</span>
                            ) : (
                              <span className={cambiado ? 'text-amber-700 font-semibold' : 'text-gray-600'}>
                                {pctNuevo > 0 ? '+' : ''}{pctNuevo}%
                              </span>
                            )}
                          </td>
                        </React.Fragment>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-2">
          Factor = (horas netas ÷ horas base − 1) × 100. Negativo = producís menos que lo nominal; positivo = más.
          Cada factor se guarda por centro (todas las filas de ese factor en los grupos del centro).
        </p>
      </div>
    </div>
  );
};

export default AjusteHorasSection;
