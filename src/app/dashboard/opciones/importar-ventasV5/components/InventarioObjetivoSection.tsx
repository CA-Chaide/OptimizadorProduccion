'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { restriccionService } from '@/services/restriccion.service';

/**
 * Pestaña "Inventario objetivo" de IV5.
 *
 * Muestra y permite ajustar los DÍAS de inventario objetivo definidos en las
 * restricciones `DIAS_INV_OBJETIVO_<etiqueta>` (una fila por grupo; el centro
 * sale de `grupo.centro`). El grano editable es (etiqueta × centro): los días
 * son uniformes entre los grupos de un mismo centro, así que al editar una
 * celda se actualizan TODAS las filas de esa etiqueta en los grupos del centro.
 *
 * También expone `TOP_N_INV_OBJETIVO` como un valor global (IV5 lo lee con la
 * primera coincidencia). Los cambios se escriben a la BD (upsert por
 * `codigo_restriccion`) SOLO al pulsar "Guardar cambios" y previa confirmación.
 * Tras guardar invoca `onSaved` para que IV5 recargue los valores.
 */
export interface InventarioObjetivoSectionProps {
  /** Permite a la página padre recargar las restricciones que usa IV5 tras guardar. */
  onSaved?: () => void;
  /**
   * Demanda efectiva cargada por IV5 (read-only). Se usa para derivar el
   * catálogo de etiquetas (sector colchones) que el usuario puede crear. Es la
   * MISMA fuente que matchea `pioCompute` (r.Sector === colchones, r.Etiqueta),
   * así la etiqueta creada coincide exacto y IV5 la asocia.
   */
  demandData?: any[];
}

const PREFIX = 'DIAS_INV_OBJETIVO_';
const TOP_N_NAME = 'TOP_N_INV_OBJETIVO';
/** Mismo literal que `pioCompute.ts` (no exportado allí). */
const SECTOR_COLCHONES = '01 COLCHONES';

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

/** Clave de celda editable. */
const cellKey = (etiqueta: string, centro: string) => `${centro}|${etiqueta}`;

export const InventarioObjetivoSection: React.FC<InventarioObjetivoSectionProps> = ({ onSaved, demandData = [] }) => {
  const [rows, setRows] = useState<Restr[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [ok, setOk] = useState<string>('');

  // Valores editados: `${centro}|${etiqueta}` -> días (string del input). Y top-N.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [topNEdit, setTopNEdit] = useState<string>('');

  // Alta de nueva etiqueta: nombre + días por centro.
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState<string>('');
  const [nuevoDias, setNuevoDias] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<boolean>(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    setOk('');
    setEdits({});
    setTopNEdit('');
    try {
      const res = await restriccionService.getAll();
      const all = (res.data ?? []) as Restr[];
      setRows(all.filter((r) =>
        String(r.nombre_restriccion ?? '').startsWith(PREFIX) || r.nombre_restriccion === TOP_N_NAME,
      ));
    } catch (e) {
      console.error('Error al recuperar restricciones de inventario objetivo:', e);
      setError((e as Error).message || 'Error al recuperar las restricciones.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Etiquetas y centros presentes.
  const etiquetas = useMemo(
    () => Array.from(new Set(rows.filter((r) => r.nombre_restriccion.startsWith(PREFIX))
      .map((r) => r.nombre_restriccion.replace(PREFIX, '').trim()))).sort(),
    [rows],
  );
  const centros = useMemo(
    () => Array.from(new Set(rows.map((r) => String(r.grupo?.centro ?? '').trim()).filter(Boolean))).sort(),
    [rows],
  );

  // Set canónico de grupos (con su centro) presentes en las DIAS_INV_OBJETIVO.
  // Se usa para crear una etiqueta nueva en los mismos grupos que las existentes.
  const gruposInfo = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of rows) {
      if (!r.nombre_restriccion.startsWith(PREFIX)) continue;
      const c = String(r.grupo?.centro ?? '').trim();
      if (c && !m.has(r.codigo_grupo)) m.set(r.codigo_grupo, c);
    }
    return Array.from(m.entries()).map(([codigo_grupo, centro]) => ({ codigo_grupo, centro }));
  }, [rows]);

  // Etiquetas (sector colchones) presentes en la demanda cargada por IV5.
  const etiquetasColchones = useMemo(() => {
    const s = new Set<string>();
    for (const r of demandData) {
      if (String(r?.Sector ?? '').trim() !== SECTOR_COLCHONES) continue;
      const et = String(r?.Etiqueta ?? '').trim();
      if (et) s.add(et);
    }
    return Array.from(s).sort();
  }, [demandData]);

  // Candidatas a crear: colchones que AÚN no tienen restricción.
  const etiquetasSinRestriccion = useMemo(() => {
    const existentes = new Set(etiquetas.map((e) => e.toLowerCase()));
    return etiquetasColchones.filter((e) => !existentes.has(e.toLowerCase()));
  }, [etiquetasColchones, etiquetas]);

  // Si la etiqueta elegida deja de ser candidata (p.ej. tras crearla), límpiala.
  useEffect(() => {
    if (nuevaEtiqueta && !etiquetasSinRestriccion.includes(nuevaEtiqueta)) setNuevaEtiqueta('');
  }, [etiquetasSinRestriccion, nuevaEtiqueta]);

  // Valor BD vigente por (etiqueta, centro): toma la primera fila que matchea
  // (uniforme entre grupos del centro). Devuelve número o null.
  const valorBD = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (!r.nombre_restriccion.startsWith(PREFIX)) continue;
      const et = r.nombre_restriccion.replace(PREFIX, '').trim();
      const c = String(r.grupo?.centro ?? '').trim();
      if (!c) continue;
      const k = cellKey(et, c);
      if (!m.has(k)) m.set(k, parseInt(r.valor_restriccion, 10) || 0);
    }
    return m;
  }, [rows]);

  const topNBD = useMemo(() => {
    const r = rows.find((x) => x.nombre_restriccion === TOP_N_NAME);
    return r ? (parseInt(r.valor_restriccion, 10) || 0) : null;
  }, [rows]);

  // Valor mostrado en un input = edición si existe, sino el de BD.
  const valorCelda = (et: string, c: string): string => {
    const k = cellKey(et, c);
    if (k in edits) return edits[k];
    const v = valorBD.get(k);
    return v == null ? '' : String(v);
  };
  const setCelda = (et: string, c: string, val: string) => {
    setOk('');
    setEdits((prev) => ({ ...prev, [cellKey(et, c)]: val.replace(/[^0-9]/g, '') }));
  };

  const topNValor = topNEdit !== '' || topNBD == null ? topNEdit : String(topNBD);

  // Cambios pendientes (celda cuyo valor difiere de BD) + top-N.
  const cambios = useMemo(() => {
    const out: { etiqueta: string; centro: string; nuevo: number; viejo: number }[] = [];
    for (const k of Object.keys(edits)) {
      const sep = k.indexOf('|');
      const centro = k.slice(0, sep);
      const etiqueta = k.slice(sep + 1);
      const raw = edits[k];
      if (raw === '') continue;
      const nuevo = parseInt(raw, 10);
      const viejo = valorBD.get(k) ?? -1;
      if (Number.isFinite(nuevo) && nuevo !== viejo) out.push({ etiqueta, centro, nuevo, viejo });
    }
    return out;
  }, [edits, valorBD]);

  const topNCambio = useMemo(() => {
    if (topNEdit === '') return null;
    const nuevo = parseInt(topNEdit, 10);
    if (!Number.isFinite(nuevo) || nuevo === topNBD) return null;
    return { nuevo, viejo: topNBD ?? -1 };
  }, [topNEdit, topNBD]);

  const totalCambios = cambios.length + (topNCambio ? 1 : 0);

  const guardar = useCallback(async () => {
    if (totalCambios === 0) return;
    const resumen = [
      ...cambios.map((c) => `• ${c.etiqueta} (C${c.centro}): ${c.viejo} → ${c.nuevo} días`),
      ...(topNCambio ? [`• Top-N: ${topNCambio.viejo} → ${topNCambio.nuevo}`] : []),
    ].join('\n');
    if (!confirm(`Se actualizarán ${totalCambios} restriccion(es) en la base de datos:\n\n${resumen}\n\n¿Continuar?`)) return;

    setSaving(true);
    setError('');
    setOk('');
    try {
      // Para cada celda cambiada: actualiza TODAS las filas de esa etiqueta en
      // grupos del centro. Para top-N: todas las filas TOP_N_INV_OBJETIVO.
      const updates: Restr[] = [];
      for (const c of cambios) {
        const nombre = `${PREFIX}${c.etiqueta}`;
        for (const r of rows) {
          if (r.nombre_restriccion === nombre && String(r.grupo?.centro ?? '').trim() === c.centro) {
            updates.push({ ...r, valor_restriccion: String(c.nuevo) });
          }
        }
      }
      if (topNCambio) {
        for (const r of rows) {
          if (r.nombre_restriccion === TOP_N_NAME) updates.push({ ...r, valor_restriccion: String(topNCambio.nuevo) });
        }
      }

      for (const u of updates) {
        await restriccionService.save({
          codigo_restriccion: u.codigo_restriccion,
          codigo_grupo: u.codigo_grupo,
          nombre_restriccion: u.nombre_restriccion,
          valor_restriccion: u.valor_restriccion,
          descripcion: u.descripcion ?? 'Creada automáticamente por módulo PIO',
          estado: u.estado ?? 'A',
          usuario_modificacion: 'sistema',
        } as any);
      }

      setOk(`Guardado: ${updates.length} fila(s) actualizada(s) (${totalCambios} cambio(s)).`);
      await cargar();
      onSaved?.();
    } catch (e) {
      console.error('Error al guardar inventario objetivo:', e);
      setError((e as Error).message || 'Error al guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }, [cambios, topNCambio, totalCambios, rows, cargar, onSaved]);

  const descartar = () => { setEdits({}); setTopNEdit(''); setOk(''); };

  const crear = useCallback(async () => {
    const et = nuevaEtiqueta.trim();
    setOk('');
    if (!et) { setError('Ingresá un nombre de etiqueta.'); return; }
    if (etiquetas.some((e) => e.toLowerCase() === et.toLowerCase())) {
      setError(`La etiqueta "${et}" ya existe; editala en la tabla.`); return;
    }
    if (gruposInfo.length === 0) { setError('No hay grupos de referencia para crear la restricción.'); return; }
    // Días por centro: requeridos para todos los centros presentes.
    const diasPorCentro: Record<string, number> = {};
    for (const c of centros) {
      const raw = (nuevoDias[c] ?? '').trim();
      if (raw === '') { setError(`Ingresá los días para el Centro ${c}.`); return; }
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0) { setError(`Días inválidos para el Centro ${c}.`); return; }
      diasPorCentro[c] = n;
    }
    const resumen = centros.map((c) => `Centro ${c}: ${diasPorCentro[c]} días`).join(' · ');
    if (!confirm(`Crear restricción "${PREFIX}${et}" en ${gruposInfo.length} grupos (${resumen})?`)) return;

    setCreating(true);
    setError('');
    try {
      const nombre = `${PREFIX}${et}`;
      let n = 0;
      for (const g of gruposInfo) {
        await restriccionService.save({
          codigo_restriccion: 0,
          codigo_grupo: g.codigo_grupo,
          nombre_restriccion: nombre,
          valor_restriccion: String(diasPorCentro[g.centro] ?? 0),
          descripcion: 'Creada automáticamente por módulo PIO',
          estado: 'A',
          usuario_modificacion: 'sistema',
        } as any);
        n++;
      }
      setOk(`Etiqueta "${et}" creada en ${n} grupos.`);
      setNuevaEtiqueta('');
      setNuevoDias({});
      await cargar();
      onSaved?.();
    } catch (e) {
      console.error('Error al crear etiqueta de inventario objetivo:', e);
      setError((e as Error).message || 'Error al crear la nueva restricción.');
    } finally {
      setCreating(false);
    }
  }, [nuevaEtiqueta, etiquetas, gruposInfo, centros, nuevoDias, cargar, onSaved]);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Inventario objetivo — días por etiqueta y centro</h3>
            <p className="text-xs text-gray-500">
              Ajustá los días de inventario objetivo (restricciones <code>DIAS_INV_OBJETIVO_*</code>). Los cambios se
              escriben a la base de datos al pulsar <strong>Guardar</strong> y alimentan el cálculo de IV5.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <button type="button" onClick={cargar} disabled={loading || saving}
              className="text-xs px-3 py-1.5 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:text-gray-400 disabled:border-gray-300">
              {loading ? 'Cargando...' : 'Refrescar'}
            </button>
            <button type="button" onClick={descartar} disabled={saving || totalCambios === 0}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:text-gray-300 disabled:border-gray-200">
              Descartar
            </button>
            <button type="button" onClick={guardar} disabled={saving || totalCambios === 0}
              className="text-xs px-3 py-1.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-gray-300">
              {saving ? 'Guardando...' : `Guardar cambios${totalCambios ? ` (${totalCambios})` : ''}`}
            </button>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</div>
        )}
        {ok && (
          <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2 mb-3">{ok}</div>
        )}

        {/* Top-N global */}
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-gray-600">Top-N por centro (materiales con inventario objetivo):</span>
          <input type="number" min={0} value={topNValor}
            onChange={(e) => { setOk(''); setTopNEdit(e.target.value.replace(/[^0-9]/g, '')); }}
            className={`border rounded px-2 py-1 w-16 text-right ${topNCambio ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`} />
          {topNBD != null && <span className="text-gray-400">(BD: {topNBD})</span>}
        </div>

        {etiquetas.length === 0 ? (
          <div className="text-xs text-gray-500 italic px-3 py-4 text-center">
            {loading ? 'Cargando datos...' : 'No se encontraron restricciones DIAS_INV_OBJETIVO_*.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-gray-200">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Etiqueta</th>
                  {centros.map((c) => (
                    <th key={c} className="px-3 py-2 text-center font-semibold text-gray-600">Centro {c} (días)</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {etiquetas.map((et) => (
                  <tr key={et} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-gray-800">{et}</td>
                    {centros.map((c) => {
                      const existe = valorBD.has(cellKey(et, c));
                      const k = cellKey(et, c);
                      const cambiado = k in edits && edits[k] !== '' && parseInt(edits[k], 10) !== (valorBD.get(k) ?? -1);
                      return (
                        <td key={c} className="px-3 py-2 text-center">
                          {existe ? (
                            <input type="number" min={0} value={valorCelda(et, c)}
                              onChange={(e) => setCelda(et, c, e.target.value)}
                              className={`border rounded px-2 py-1 w-20 text-right ${cambiado ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`} />
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] text-gray-400 mt-2">
          {etiquetas.length} etiquetas · {centros.length} centros · {rows.filter((r) => r.nombre_restriccion.startsWith(PREFIX)).length} filas DIAS_INV_OBJETIVO.
          Al guardar, una celda actualiza todas las filas de esa etiqueta en los grupos del centro.
        </p>
      </div>

      {/* Alta de nueva etiqueta */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-base font-semibold text-gray-800 mb-1">Crear nueva restricción de inventario objetivo</h3>
        <p className="text-xs text-gray-500 mb-3">
          Elegí una etiqueta (sector colchones de los datos cargados en IV5) y sus días por centro. Se creará en los
          {' '}{gruposInfo.length} grupos existentes (el valor por grupo sale de su centro). Solo se listan etiquetas
          que AÚN no tienen restricción; las existentes se editan en la tabla de arriba.
        </p>

        {demandData.length === 0 ? (
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Cargá los datos en la pestaña <strong>IV5</strong> para ver las etiquetas disponibles.
          </div>
        ) : etiquetasSinRestriccion.length === 0 ? (
          <div className="text-xs text-gray-500 italic">
            Todas las etiquetas colchones de los datos cargados ya tienen restricción.
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-[11px] text-gray-600">
              Etiqueta ({etiquetasSinRestriccion.length} sin restricción)
              <select value={nuevaEtiqueta} onChange={(e) => { setOk(''); setNuevaEtiqueta(e.target.value); }}
                className="block border border-gray-300 rounded px-2 py-1 text-xs mt-0.5 w-56">
                <option value="">— Seleccioná una etiqueta —</option>
                {etiquetasSinRestriccion.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            {centros.map((c) => (
              <label key={c} className="text-[11px] text-gray-600">
                Centro {c} (días)
                <input type="number" min={0} value={nuevoDias[c] ?? ''}
                  onChange={(e) => { setOk(''); setNuevoDias((prev) => ({ ...prev, [c]: e.target.value.replace(/[^0-9]/g, '') })); }}
                  className="block border border-gray-300 rounded px-2 py-1 text-xs mt-0.5 w-24 text-right" />
              </label>
            ))}
            <button type="button" onClick={crear} disabled={creating || loading || !nuevaEtiqueta}
              className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-300">
              {creating ? 'Creando...' : 'Crear etiqueta'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventarioObjetivoSection;
