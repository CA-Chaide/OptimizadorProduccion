'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FilterOptions } from '../../importar-ventasV2/components/types';
import { grupoService } from '@/services/grupo.service';
import { lineaService } from '@/services/linea.service';
import { estacionService } from '@/services/estacion.service';
import type { Grupo, Linea, Estacion } from '@/types/interfaces';

/**
 * Pestaña "Recursos disponibles" de IV5.
 *
 * Recupera la estructura productiva (Grupo → Línea → Estación) del backend y
 * permite EDITAR el número de puestos por estación con VIGENCIAS por rango de
 * AÑO+MES (desde-hasta). Una vigencia puede arrancar en un año y continuar en
 * otro(s), porque el horizonte de planificación puede cruzar de año. El valor
 * por defecto es el del backend. Los cambios se guardan SOLO en localStorage
 * (clave global, no por año) y alimentarán el cálculo de capacidad de IV5 por
 * mes (Etapa 2).
 */
export interface RecursosDisponiblesSectionProps {
  filterOptions: FilterOptions;
  isLoadingOptions: boolean;
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
  getMesNumero: (mes: string) => number | null;
  /** Notifica a la página cada vez que cambian los overrides (para que IV5
   *  recalcule el cuello de botella con los puestos nuevos). */
  onOverridesChange?: (ov: PuestosOverrides) => void;
}

const MESES = [
  { n: 1, label: 'Ene' }, { n: 2, label: 'Feb' }, { n: 3, label: 'Mar' }, { n: 4, label: 'Abr' },
  { n: 5, label: 'May' }, { n: 6, label: 'Jun' }, { n: 7, label: 'Jul' }, { n: 8, label: 'Ago' },
  { n: 9, label: 'Sep' }, { n: 10, label: 'Oct' }, { n: 11, label: 'Nov' }, { n: 12, label: 'Dic' },
];

/** Índice absoluto año+mes para comparar rangos que cruzan de año. */
const ym = (anio: number, mes: number) => anio * 12 + (mes - 1);

/** Una vigencia: número de puestos vigente entre [desde, hasta] en año+mes absolutos. */
export interface VigenciaPuestos {
  desdeAnio: number;
  desdeMes: number; // 1-12
  hastaAnio: number;
  hastaMes: number; // 1-12
  /** Si es true, la vigencia no tiene fin: aplica desde [desde] en adelante (se ignora hasta). */
  permanente?: boolean;
  puestos: number;
}
/** Overrides por estación (codigo_estacion → lista de vigencias). */
export type PuestosOverrides = Record<number, VigenciaPuestos[]>;

interface RecursoFila {
  codigo_estacion: number;
  centro: string;
  grupo: string;
  codigo_linea: number;
  linea: string;
  estacion: string;
  habilidad: string;
  numeroPuestos: number; // default backend
  estado: string;
}

/** Clave global: las vigencias ya llevan el año adentro, no se particiona por año. */
const STORAGE_KEY = 'iv5_puestos_override';

export function loadPuestosOverrides(): PuestosOverrides {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as PuestosOverrides) : {};
  } catch {
    return {};
  }
}
function savePuestosOverrides(ov: PuestosOverrides): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ov));
  } catch {
    /* noop */
  }
}

/**
 * Puestos efectivos de una estación en un (año, mes): primera vigencia cuyo
 * rango año+mes cubra el punto, sino el default del backend.
 */
export function puestosEfectivo(
  codigoEstacion: number,
  defaultPuestos: number,
  anio: number,
  mes: number,
  ov: PuestosOverrides,
): number {
  const rangos = ov[codigoEstacion];
  if (rangos) {
    const p = ym(anio, mes);
    for (const r of rangos) {
      if (p < ym(r.desdeAnio, r.desdeMes)) continue;
      if (r.permanente || p <= ym(r.hastaAnio, r.hastaMes)) return r.puestos;
    }
  }
  return defaultPuestos;
}

export const RecursosDisponiblesSection: React.FC<RecursosDisponiblesSectionProps> = ({ filterOptions, onOverridesChange }) => {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const [anio, setAnio] = useState<number>(() => new Date().getFullYear());
  const [overrides, setOverrides] = useState<PuestosOverrides>({});
  const [filterCentro, setFilterCentro] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const cargar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [gRes, lRes, eRes] = await Promise.all([
        grupoService.getAll(),
        lineaService.getAll(),
        estacionService.getAll(),
      ]);
      setGrupos(gRes.data ?? []);
      setLineas(lRes.data ?? []);
      setEstaciones(eRes.data ?? []);
    } catch (e) {
      console.error('Error al recuperar grupo/línea/estación:', e);
      setError((e as Error).message || 'Error al recuperar las tablas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Carga overrides una sola vez (clave global; las vigencias llevan el año adentro).
  useEffect(() => { setOverrides(loadPuestosOverrides()); }, []);

  // Año de la VISTA (tira de meses de preview) = el más reciente de los filtros.
  useEffect(() => {
    const first = filterOptions.años?.[0]?.value;
    if (first) setAnio(Number(first));
  }, [filterOptions.años]);

  // Persiste y actualiza overrides.
  const actualizarOverrides = useCallback((next: PuestosOverrides) => {
    setOverrides(next);
    savePuestosOverrides(next);
    onOverridesChange?.(next);
  }, [onOverridesChange]);

  // Une estación → línea → grupo.
  const filas = useMemo<RecursoFila[]>(() => {
    const lineaPorId = new Map<number, Linea>();
    for (const l of lineas) lineaPorId.set(l.codigo_linea, l);
    const grupoPorId = new Map<number, Grupo>();
    for (const g of grupos) grupoPorId.set(g.codigo_grupo, g);

    const out: RecursoFila[] = estaciones.map((e) => {
      const l = lineaPorId.get(e.codigo_linea) ?? e.linea;
      const g = l ? (grupoPorId.get(l.codigo_grupo) ?? l.grupo) : undefined;
      return {
        codigo_estacion: e.codigo_estacion,
        centro: g?.centro ?? '',
        grupo: g?.nombre_grupo ?? '',
        codigo_linea: e.codigo_linea,
        linea: l?.nombre_linea ?? '',
        estacion: e.nombre_estacion,
        habilidad: (e as any).puesto_habilidades ?? '',
        numeroPuestos: e.numero_puestos,
        estado: e.estado,
      };
    });
    out.sort((a, b) =>
      String(a.centro).localeCompare(String(b.centro)) ||
      String(a.grupo).localeCompare(String(b.grupo)) ||
      String(a.linea).localeCompare(String(b.linea)) ||
      String(a.estacion).localeCompare(String(b.estacion)),
    );
    return out;
  }, [grupos, lineas, estaciones]);

  const centros = useMemo(() => Array.from(new Set(filas.map((f) => f.centro).filter(Boolean))).sort(), [filas]);

  // Años seleccionables en las vigencias: los de los filtros + año vista y siguientes
  // (para horizontes que cruzan de año) + cualquier año ya usado en overrides.
  const aniosVigencia = useMemo(() => {
    const set = new Set<number>();
    for (const a of filterOptions.años ?? []) {
      const n = Number(a.value);
      if (Number.isFinite(n)) set.add(n);
    }
    set.add(anio); set.add(anio + 1); set.add(anio + 2);
    for (const arr of Object.values(overrides)) {
      for (const r of arr ?? []) { set.add(r.desdeAnio); set.add(r.hastaAnio); }
    }
    return Array.from(set).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  }, [filterOptions.años, anio, overrides]);

  // Filtra y agrupa por línea (`${centro}|${grupo}|${linea}`).
  const grupos2 = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtradas = filas.filter((f) => {
      if (filterCentro && f.centro !== filterCentro) return false;
      if (q && !(`${f.linea} ${f.estacion} ${f.grupo} ${f.habilidad}`.toLowerCase().includes(q))) return false;
      return true;
    });
    const map = new Map<string, { centro: string; grupo: string; linea: string; estaciones: RecursoFila[] }>();
    for (const f of filtradas) {
      const k = `${f.centro}|${f.grupo}|${f.linea}`;
      let g = map.get(k);
      if (!g) { g = { centro: f.centro, grupo: f.grupo, linea: f.linea, estaciones: [] }; map.set(k, g); }
      g.estaciones.push(f);
    }
    return Array.from(map.entries()).map(([key, v]) => ({ key, ...v }));
  }, [filas, filterCentro, search]);

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // --- Handlers de vigencias ---
  const addVigencia = (cod: number, def: number) => {
    const nueva: VigenciaPuestos = { desdeAnio: anio, desdeMes: 1, hastaAnio: anio, hastaMes: 12, puestos: def };
    actualizarOverrides({ ...overrides, [cod]: [...(overrides[cod] ?? []), nueva] });
  };
  const updateVigencia = (cod: number, idx: number, patch: Partial<VigenciaPuestos>) => {
    const arr = [...(overrides[cod] ?? [])];
    let v = { ...arr[idx], ...patch };
    // Normaliza solo si tiene fin: si el inicio queda después del fin, empuja el fin al inicio.
    if (!v.permanente && ym(v.desdeAnio, v.desdeMes) > ym(v.hastaAnio, v.hastaMes)) {
      v = { ...v, hastaAnio: v.desdeAnio, hastaMes: v.desdeMes };
    }
    arr[idx] = v;
    actualizarOverrides({ ...overrides, [cod]: arr });
  };
  const removeVigencia = (cod: number, idx: number) => {
    const arr = (overrides[cod] ?? []).filter((_, i) => i !== idx);
    const next = { ...overrides };
    if (arr.length) next[cod] = arr; else delete next[cod];
    actualizarOverrides(next);
  };
  const resetTodo = () => {
    if (!confirm('¿Restablecer TODOS los puestos al valor del backend? Se borran todas las vigencias guardadas.')) return;
    actualizarOverrides({});
  };

  const totalOverrides = Object.values(overrides).reduce((s, arr) => s + (arr?.length ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold text-gray-800">Recursos disponibles — puestos por estación</h3>
            <p className="text-xs text-gray-500">
              Editá el N° de puestos por vigencia (desde mes/año hasta mes/año). Una vigencia puede cruzar de año.
              El default es del backend; los cambios se guardan en este navegador y alimentarán la capacidad de IV5.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-[11px] text-gray-600">
              Año (vista)
              <select
                value={anio}
                onChange={(e) => setAnio(Number(e.target.value))}
                className="block border border-gray-300 rounded px-2 py-1 text-xs mt-0.5"
              >
                {aniosVigencia.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={cargar} disabled={loading}
              className="text-xs px-3 py-1.5 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:text-gray-400 disabled:border-gray-300">
              {loading ? 'Cargando...' : 'Refrescar'}
            </button>
            <button type="button" onClick={resetTodo}
              className="text-xs px-3 py-1.5 rounded border border-red-300 text-red-700 hover:bg-red-50">
              Restablecer todo
            </button>
          </div>
        </div>

        {error && (
          <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</div>
        )}

        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select value={filterCentro} onChange={(e) => setFilterCentro(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-xs">
            <option value="">Todos los centros</option>
            {centros.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar línea / estación..."
            className="border border-gray-300 rounded px-2 py-1 text-xs flex-1 min-w-[180px]" />
          <span className="text-[11px] text-gray-500">
            {estaciones.length} estaciones · {grupos2.length} líneas · {totalOverrides} vigencias guardadas
          </span>
        </div>

        <div className="space-y-2">
          {grupos2.map((g) => {
            const abierto = expanded.has(g.key);
            return (
              <div key={g.key} className="border border-gray-200 rounded">
                <button type="button" onClick={() => toggle(g.key)}
                  className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left">
                  <span className="text-xs font-medium text-gray-800">
                    <span className="text-gray-400">C{g.centro} · {g.grupo} ·</span> {g.linea}
                  </span>
                  <span className="text-[11px] text-gray-500">{g.estaciones.length} estaciones {abierto ? '▾' : '▸'}</span>
                </button>
                {abierto && (
                  <div className="p-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {g.estaciones.map((f) => {
                      const rangos = overrides[f.codigo_estacion] ?? [];
                      return (
                        <div key={f.codigo_estacion} className="border border-gray-200 rounded-lg p-3 bg-white">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-sm font-semibold text-gray-800">{f.estacion}</div>
                              {f.habilidad && <div className="text-[10px] text-gray-400">{f.habilidad}</div>}
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] text-gray-500">default</div>
                              <div className="text-sm font-mono text-gray-700">{f.numeroPuestos}</div>
                            </div>
                          </div>

                          {/* Strip de meses del año vista: puestos efectivos */}
                          <div className="text-[9px] text-gray-400 mt-2">Puestos por mes · {anio}</div>
                          <div className="grid grid-cols-12 gap-px mt-0.5 mb-2">
                            {MESES.map((m) => {
                              const ef = puestosEfectivo(f.codigo_estacion, f.numeroPuestos, anio, m.n, overrides);
                              const cambiado = ef !== f.numeroPuestos;
                              return (
                                <div key={m.n} title={`${m.label} ${anio}: ${ef} puestos`}
                                  className={`text-center leading-tight py-0.5 rounded-sm ${
                                    cambiado ? 'bg-indigo-100 text-indigo-800 font-semibold' : 'bg-gray-50 text-gray-500'
                                  }`}>
                                  <div className="text-[8px] uppercase opacity-70">{m.label}</div>
                                  <div className="text-[9px]">{ef}</div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Vigencias */}
                          <div className="space-y-1.5">
                            {rangos.map((r, idx) => (
                              <div key={idx} className="border border-gray-200 rounded p-1.5 space-y-1">
                                <div className="flex items-center gap-1 text-[11px] flex-wrap">
                                  <span className="text-gray-500">Desde</span>
                                  <select value={r.desdeMes} onChange={(e) => updateVigencia(f.codigo_estacion, idx, { desdeMes: Number(e.target.value) })}
                                    className="border border-gray-300 rounded px-1 py-0.5">
                                    {MESES.map((m) => <option key={m.n} value={m.n}>{m.label}</option>)}
                                  </select>
                                  <select value={r.desdeAnio} onChange={(e) => updateVigencia(f.codigo_estacion, idx, { desdeAnio: Number(e.target.value) })}
                                    className="border border-gray-300 rounded px-1 py-0.5">
                                    {aniosVigencia.map((y) => <option key={y} value={y}>{y}</option>)}
                                  </select>
                                  <span className="text-gray-500">hasta</span>
                                  {r.permanente ? (
                                    <span className="italic text-gray-500 px-1">en adelante</span>
                                  ) : (
                                    <>
                                      <select value={r.hastaMes} onChange={(e) => updateVigencia(f.codigo_estacion, idx, { hastaMes: Number(e.target.value) })}
                                        className="border border-gray-300 rounded px-1 py-0.5">
                                        {MESES.map((m) => <option key={m.n} value={m.n}>{m.label}</option>)}
                                      </select>
                                      <select value={r.hastaAnio} onChange={(e) => updateVigencia(f.codigo_estacion, idx, { hastaAnio: Number(e.target.value) })}
                                        className="border border-gray-300 rounded px-1 py-0.5">
                                        {aniosVigencia.map((y) => <option key={y} value={y}>{y}</option>)}
                                      </select>
                                    </>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 text-[11px]">
                                  <input type="number" min={0} value={r.puestos}
                                    onChange={(e) => updateVigencia(f.codigo_estacion, idx, { puestos: Math.max(0, Number(e.target.value)) })}
                                    className="border border-gray-300 rounded px-1 py-0.5 w-14 text-right" />
                                  <span className="text-gray-500">puestos</span>
                                  <label className="ml-2 flex items-center gap-1 text-gray-600 cursor-pointer" title="Sin fecha de fin: aplica desde el inicio en adelante">
                                    <input type="checkbox" checked={!!r.permanente}
                                      onChange={(e) => updateVigencia(f.codigo_estacion, idx, { permanente: e.target.checked })} />
                                    Permanente
                                  </label>
                                  <button type="button" onClick={() => removeVigencia(f.codigo_estacion, idx)}
                                    className="ml-auto text-red-500 hover:text-red-700" title="Quitar vigencia">✕</button>
                                </div>
                              </div>
                            ))}
                            <button type="button" onClick={() => addVigencia(f.codigo_estacion, f.numeroPuestos)}
                              className="text-[11px] px-2 py-0.5 rounded border border-indigo-300 text-indigo-700 hover:bg-indigo-50">
                              + Agregar vigencia
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {grupos2.length === 0 && (
            <div className="text-xs text-gray-500 italic px-3 py-4 text-center">
              {loading ? 'Cargando datos...' : 'Sin datos con los filtros actuales.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RecursosDisponiblesSection;
