'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { serviciosService } from '@/services/servicios.service';

import { MultiSelectDropdown } from '../../importar-ventasV2/components/MultiSelectDropdown';
import {
  RawBackendDataTable,
  type RawBackendDataTableHandle,
} from '../../importar-ventasV2/components/RawBackendDataTable';
import { DemandWeeklyAdjustmentSection } from '../../importar-ventasV2/components/DemandWeeklyAdjustmentSection';
import { buildPioMap } from '../../importar-ventasV2/components/pioCompute';
import { calculateWorkDays, getMesNombre, normalizeMaterialCode } from '../../importar-ventasV2/components/utils';
import { getWeekSegments } from '../../plan-semanal/components/weeklyCalendar';
import type {
  FilterOptions,
  SelectedFilters,
  TiempoCanonResult,
  PioMap,
} from '../../importar-ventasV2/components/types';
import { SaturdayWeeklyEditor } from '../../importar-ventasV4/components/SaturdayWeeklyEditor';
import {
  buildSaturdayProposalByMonth,
  getSystemIdentifiedSatKeys,
  mergeProposalForCenter,
  pruneSelectionToCentros,
  applySaturdayChange,
  countSelectedSatInMonth as countSelectedSatInMonthHelper,
} from '../../importar-ventasV4/components/saturdayPlannerV4';

import { Iv5StockCapEditor } from './Iv5StockCapEditor';
import { Iv5DiagnosticPanel } from './Iv5DiagnosticPanel';
import { Iv5ResultsTable } from './Iv5ResultsTable';
import { Iv5VersionsPanel } from './Iv5VersionsPanel';
import { Iv5StockEvolutionPanel } from './Iv5StockEvolutionPanel';
import { ProduccionDiariaSection } from './ProduccionDiariaSection';
import { useToast } from '@/hooks/use-toast';
import { computeC2000Deficits } from './iv5C2000Deficit';
import { exportIv5Excel } from './iv5ExcelExport';
import { saveIv5ToPlanGlobal } from './iv5Persistence';
import { iv5SelfCheck } from './iv5SelfCheck';
import type { Iv5Version } from './iv5Types';
import {
  IV5_DEFAULT_CAP_C1000,
  IV5_DEFAULT_CAP_C2000,
  IV5_DEFAULT_MAX_SABADOS_MES,
  IV5_SECTORES_TOPE_AGREGADO,
  IV5_STOCK_CAPS_STORAGE_KEY,
  IV5_MAX_SABADOS_STORAGE_KEY,
  IV5_DEFAULT_TRANSPORT_UDS_DIA,
  IV5_TRANSPORT_CAP_STORAGE_KEY,
} from './iv5Constants';
import type { Iv5DiagnosticEntry, Iv5MonthlySnapshot, Iv5RunResult, Iv5StockCap, Iv5TransportCap, Iv5WeeklyRow } from './iv5Types';
import { aggregateTrasladoSalienteFromLedger, runIv5Engine } from './iv5Engine';
import { runIv5EngineRediseñadoAsync, type Iv5XESinLineaC1000 } from './iv5EngineRediseñado';
import { estacionService } from '@/services/estacion.service';
import { lineaService } from '@/services/linea.service';
import { puestosEfectivo, type PuestosOverrides } from './RecursosDisponiblesSection';

interface Props {
  filterOptions: FilterOptions;
  isLoadingOptions: boolean;
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
  /** Factores de ajuste horas base -> netas (multiplicadores, 1 = sin ajuste),
   *  por centro: { '1000': {normal,extra,sabado}, '2000': {...} }. */
  factoresAjustePorCentro: Record<string, { normal: number; extra: number; sabado: number }>;
  restriccionesPIO: any[];
  getMesNumero: (m: string) => number | null;
  /** Publica la demanda efectiva cargada (read-only) hacia la página, para que
   *  otras pestañas (Inventario objetivo) deriven el catálogo de etiquetas. */
  onEffectiveDataChange?: (rows: any[]) => void;
  /** Overrides de puestos (de "Recursos disponibles") para recalcular el cuello
   *  de botella por material en la carga (vía `n_puestos`). */
  puestosOverrides?: PuestosOverrides;
  /** Señal para re-disparar la carga de datos (auto-recarga al cambiar puestos). */
  reloadSignal?: number;
}

function loadStockCap(): Iv5StockCap {
  try {
    const raw = localStorage.getItem(IV5_STOCK_CAPS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Iv5StockCap>;
      return {
        centro1000: Number(parsed.centro1000 ?? IV5_DEFAULT_CAP_C1000),
        centro2000: Number(parsed.centro2000 ?? IV5_DEFAULT_CAP_C2000),
        sectoresAplicables:
          Array.isArray(parsed.sectoresAplicables) && parsed.sectoresAplicables.length > 0
            ? parsed.sectoresAplicables.map(String)
            : [...IV5_SECTORES_TOPE_AGREGADO],
      };
    }
  } catch {
    // ignore corrupt entry
  }
  return {
    centro1000: IV5_DEFAULT_CAP_C1000,
    centro2000: IV5_DEFAULT_CAP_C2000,
    sectoresAplicables: [...IV5_SECTORES_TOPE_AGREGADO],
  };
}

function loadMaxSabados(): number {
  try {
    const raw = localStorage.getItem(IV5_MAX_SABADOS_STORAGE_KEY);
    if (raw) {
      const n = Number(JSON.parse(raw));
      if (Number.isFinite(n) && n >= 0 && n <= 5) return n;
    }
  } catch {
    // ignore corrupt entry
  }
  return IV5_DEFAULT_MAX_SABADOS_MES;
}

function loadTransportCap(): Iv5TransportCap {
  try {
    const raw = localStorage.getItem(IV5_TRANSPORT_CAP_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Iv5TransportCap>;
      const uds = Number(parsed.udsPorDia);
      return {
        udsPorDia: Number.isFinite(uds) && uds >= 0 ? uds : IV5_DEFAULT_TRANSPORT_UDS_DIA,
        sectoresAplicables:
          Array.isArray(parsed.sectoresAplicables) && parsed.sectoresAplicables.length > 0
            ? parsed.sectoresAplicables.map(String)
            : [...IV5_SECTORES_TOPE_AGREGADO],
      };
    }
  } catch {
    // ignore corrupt entry
  }
  return {
    udsPorDia: IV5_DEFAULT_TRANSPORT_UDS_DIA,
    sectoresAplicables: [...IV5_SECTORES_TOPE_AGREGADO],
  };
}

/** Normaliza nombres de línea para cruzar `LineaFabricacion` (demanda) con `nombre_linea` (maestro). */
function normLineaIv5(s: string): string {
  return String(s ?? '').toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
}

export const ImportarVentas5Section: React.FC<Props> = ({
  filterOptions,
  isLoadingOptions,
  numMaximoSabados,
  maxExtrasHoras,
  horasTrabajo,
  horasExtrasFin,
  factoresAjustePorCentro,
  restriccionesPIO,
  getMesNumero,
  onEffectiveDataChange,
  puestosOverrides = {},
  reloadSignal,
}) => {
  const [filters, setFilters] = useState<SelectedFilters>({ año: '', meses: [], centros: [] });
  const [rawData, setRawData] = useState<any[]>([]);
  const [adjustedData, setAdjustedData] = useState<any[]>([]);
  const [tiemposCanonResults, setTiemposCanonResults] = useState<TiempoCanonResult[]>([]);
  const [loadingCanon, setLoadingCanon] = useState(false);

  const [stockCap, setStockCap] = useState<Iv5StockCap>(() => loadStockCap());
  const [maxSabadosMes, setMaxSabadosMes] = useState<number>(() => loadMaxSabados());
  const [transportCap, setTransportCap] = useState<Iv5TransportCap>(() => loadTransportCap());

  const [activeSatKeysByCenter, setActiveSatKeysByCenter] = useState<Record<string, Set<string>>>({});
  const [draftActiveSatKeysByCenter, setDraftActiveSatKeysByCenter] = useState<Record<string, Set<string>>>({});

  const [resultC2000, setResultC2000] = useState<Iv5RunResult | null>(null);
  const [resultC1000, setResultC1000] = useState<Iv5RunResult | null>(null);
  const [view, setView] = useState<'mensual' | 'semanal'>('mensual');
  const [resultCenters, setResultCenters] = useState<string[]>([]);
  // Filtros de la seccion 4 (Resultados). La tabla solo se muestra si hay al
  // menos un filtro aplicado (centro, linea, material o mes).
  const [resultLinea, setResultLinea] = useState<string>('');
  const [resultMaterial, setResultMaterial] = useState<string>('');
  const [resultMes, setResultMes] = useState<string>('');
  const [computing, setComputing] = useState(false);
  /** Avance del motor para la barra de progreso (0-100 + etapa actual). */
  const [computeProgress, setComputeProgress] = useState<{ pct: number; etapa: string }>({
    pct: 0,
    etapa: '',
  });
  // Firma de la seleccion de sabados usada en el ultimo calculo, para avisar
  // cuando el usuario cambio los sabados y aun no recalculo (resultado obsoleto).
  const [lastComputedSatSig, setLastComputedSatSig] = useState<string | null>(null);

  const [savingPlanGlobal, setSavingPlanGlobal] = useState(false);
  const [saveProgress, setSaveProgress] = useState<{ done: number; total: number } | null>(null);
  const [saveMsg, setSaveMsg] = useState<string>('');
  const { toast } = useToast();

  const [extraDiagnostics, setExtraDiagnostics] = useState<Iv5DiagnosticEntry[]>([]);
  const [xeSinLineaC1000, setXeSinLineaC1000] = useState<Iv5XESinLineaC1000[]>([]);

  /**
   * Toggle para alternar entre el motor IV5 ORIGINAL (default) y el motor
   * REDISEÑADO (modelo integrado semana a semana con anticipación y reservas).
   * Estado actual del motor rediseñado: esqueleto en construcción.
   */
  // IV5 usa SIEMPRE el motor rediseñado (BETA). El motor anterior quedó
  // deshabilitado en la UI; su rama en handleCompute permanece intacta pero
  // inalcanzable (no se borra para conservar la lógica).
  const usarMotorRediseñado = true;

  const tableRef = useRef<RawBackendDataTableHandle>(null);

  useEffect(() => {
    try {
      localStorage.setItem(IV5_STOCK_CAPS_STORAGE_KEY, JSON.stringify(stockCap));
    } catch {
      // storage may be unavailable (private mode)
    }
  }, [stockCap]);

  useEffect(() => {
    try {
      localStorage.setItem(IV5_MAX_SABADOS_STORAGE_KEY, JSON.stringify(maxSabadosMes));
    } catch {
      // storage may be unavailable
    }
  }, [maxSabadosMes]);

  useEffect(() => {
    try {
      localStorage.setItem(IV5_TRANSPORT_CAP_STORAGE_KEY, JSON.stringify(transportCap));
    } catch {
      // storage may be unavailable
    }
  }, [transportCap]);

  /** Demanda efectiva: ajustada por usuario si existe; caso contrario, cruda. */
  const effectiveData = useMemo(
    () => (adjustedData.length > 0 ? adjustedData : rawData),
    [adjustedData, rawData],
  );

  // Publica la demanda efectiva hacia la página (para el catálogo de etiquetas).
  useEffect(() => { onEffectiveDataChange?.(effectiveData); }, [effectiveData, onEffectiveDataChange]);

  // Factores de ajuste de horas para un centro (default 1 = sin ajuste).
  const factorCentro = useCallback((centro: string) => {
    const f = factoresAjustePorCentro?.[String(centro)] ?? { normal: 1, extra: 1, sabado: 1 };
    return {
      factorAjusteNormal: f.normal ?? 1,
      factorAjusteExtra: f.extra ?? 1,
      factorAjusteSabado: f.sabado ?? 1,
    };
  }, [factoresAjustePorCentro]);

  // --- Override de puestos: recálculo del cuello de botella vía n_puestos ---
  const [estacionesMaster, setEstacionesMaster] = useState<any[]>([]);
  const [lineasMaster, setLineasMaster] = useState<any[]>([]);
  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const [eRes, lRes] = await Promise.all([estacionService.getAll(), lineaService.getAll()]);
        if (cancel) return;
        setEstacionesMaster(eRes.data ?? []);
        setLineasMaster(lRes.data ?? []);
      } catch (e) {
        console.error('[IV5] Error cargando maestros estacion/linea:', e);
      }
    })();
    return () => { cancel = true; };
  }, []);

  // Estaciones agrupadas por `${centro}|${linea normalizada}`. Se incluye el
  // CENTRO porque hay nombres de línea repetidos entre C1000 y C2000 (Linea 1,
  // Linea 2, GRAPADO, TRANSFER, ...); sin el centro se mezclarían estaciones de
  // ambos y el n_puestos podría enviarse al centro equivocado (el SP lo ignora).
  const estacionesPorLinea = useMemo(() => {
    const nombreLineaPorCod = new Map<number, string>();
    const centroPorCod = new Map<number, string>();
    for (const l of lineasMaster) {
      nombreLineaPorCod.set(l.codigo_linea, l.nombre_linea);
      centroPorCod.set(l.codigo_linea, String(l?.grupo?.centro ?? '').trim());
    }
    const m = new Map<string, { codigo_estacion: number; nombre_estacion: string; numero_puestos: number }[]>();
    for (const e of estacionesMaster) {
      const nombreLinea = nombreLineaPorCod.get(e.codigo_linea) ?? e?.linea?.nombre_linea ?? '';
      const centro = centroPorCod.get(e.codigo_linea) ?? String(e?.linea?.grupo?.centro ?? '').trim();
      const k = normLineaIv5(nombreLinea);
      if (!k) continue;
      const key = `${centro}|${k}`;
      const arr = m.get(key) ?? [];
      arr.push({ codigo_estacion: e.codigo_estacion, nombre_estacion: e.nombre_estacion, numero_puestos: Number(e.numero_puestos) || 0 });
      m.set(key, arr);
    }
    return m;
  }, [estacionesMaster, lineasMaster]);

  // Resolver de `n_puestos` por fila (material, mes): estaciones de la línea del
  // material cuyo puesto EFECTIVO (override) difiere del default, para el
  // (año, mes) de la fila. Si no hay cambios → undefined (no se manda n_puestos).
  // Diagnóstico de la última carga: cuántas filas enviaron n_puestos + muestras.
  const nPuestosStatsRef = useRef<{ enviadas: number; sinLinea: number; muestras: any[] }>({ enviadas: 0, sinLinea: 0, muestras: [] });
  const [nPuestosStats, setNPuestosStats] = useState<{ enviadas: number; sinLinea: number; muestras: any[] }>({ enviadas: 0, sinLinea: 0, muestras: [] });

  // Evita mismatch de hidratación: la parte de la UI que depende de localStorage
  // (overrides de puestos) solo se muestra tras montar en el cliente.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const resolveNPuestos = useCallback((row: any): { puesto: string; valor: string }[] | undefined => {
    // Año y mes de LA FILA (cada fila es (material, mes, centro)). Se prioriza
    // `row.Año` (fuente de verdad por fila, igual que iv5Necesidad) con fallback
    // al año del filtro, para que el override se evalúe contra el mes correcto.
    const anio = Number(row?.Año ?? row?.['año']) || parseInt(filters.año, 10);
    const mes = getMesNumero(String(row?.Mes ?? ''));
    if (!Number.isFinite(anio) || !mes) return undefined;
    // Centro de la fila = el MISMO que se envía al SP (CentroFabricacion||Centro).
    const centro = String(row?.CentroFabricacion ?? row?.Centro ?? '').trim();
    const lineaNorm = normLineaIv5(String(row?.LineaFabricacion ?? ''));
    const ests = estacionesPorLinea.get(`${centro}|${lineaNorm}`);
    if (!ests || ests.length === 0) {
      nPuestosStatsRef.current.sinLinea++;
      return undefined;
    }
    const out: { puesto: string; valor: string }[] = [];
    for (const e of ests) {
      const ef = puestosEfectivo(e.codigo_estacion, e.numero_puestos, anio, mes, puestosOverrides);
      if (ef !== e.numero_puestos) out.push({ puesto: e.nombre_estacion, valor: String(ef) });
    }
    if (out.length > 0) {
      const s = nPuestosStatsRef.current;
      s.enviadas++;
      if (s.muestras.length < 5) s.muestras.push({ material: row?.CodMaterial, centro, mes, n_puestos: out });
    }
    return out.length > 0 ? out : undefined;
  }, [filters.año, getMesNumero, estacionesPorLinea, puestosOverrides]);

  // Resetea el diagnóstico al iniciar una carga (lo lee onDataLoaded al terminar).
  const resetNPuestosStats = useCallback(() => {
    nPuestosStatsRef.current = { enviadas: 0, sinLinea: 0, muestras: [] };
  }, []);

  // ---------------------------------------------------------------------------
  // LÍNEAS ALTERNATIVAS (colchones C2000) — consumo del método backend.
  // Se corre DESPUÉS de "Importar Ventas" (cuando ya hay datos y línea principal).
  // Por ahora solo consulta y muestra; no afecta el motor (Pieza 3).
  // ---------------------------------------------------------------------------
  interface LineaAltInfo { linea: string; tupp: number; numeroPuestos: number; cuello: string; esPrincipal: boolean; }
  const [lineasAltData, setLineasAltData] = useState<Map<string, LineaAltInfo[]>>(new Map());
  const [cargandoLineasAlt, setCargandoLineasAlt] = useState(false);
  const [lineasAltMsg, setLineasAltMsg] = useState('');
  /**
   * Detalle (tabla) del resultado de 3b: contraido por defecto para no alargar
   * la pantalla. El paso y su boton siempre quedan visibles; esto solo oculta
   * los datos resultantes hasta que el usuario pulsa "Ver detalle".
   */
  const [lineasAltExpandido, setLineasAltExpandido] = useState(false);

  // Solo las SECUNDARIAS (con tupp válido), en el shape que espera el motor Beta.
  const lineasSecundarias = useMemo(() => {
    const m = new Map<string, { linea: string; tupp: number }[]>();
    for (const [mat, infos] of lineasAltData) {
      const secs = infos.filter((x) => !x.esPrincipal && x.tupp > 0).map((x) => ({ linea: x.linea, tupp: x.tupp }));
      if (secs.length) m.set(mat, secs);
    }
    return m;
  }, [lineasAltData]);

  /** Resumen para el encabezado de 3b cuando esta contraida. */
  const materialesConSecundarias = lineasSecundarias.size;

  // n_puestos (override) de las estaciones de una línea concreta, para (año, mes).
  const nPuestosLinea = useCallback(
    (centro: string, lineaNombre: string, anio: number, mes: number): { puesto: string; valor: string }[] => {
      const ests = estacionesPorLinea.get(`${centro}|${normLineaIv5(lineaNombre)}`);
      if (!ests || ests.length === 0) return [];
      const out: { puesto: string; valor: string }[] = [];
      for (const e of ests) {
        const ef = puestosEfectivo(e.codigo_estacion, e.numero_puestos, anio, mes, puestosOverrides);
        if (ef !== e.numero_puestos) out.push({ puesto: e.nombre_estacion, valor: String(ef) });
      }
      return out;
    },
    [estacionesPorLinea, puestosOverrides],
  );

  const handleCargarLineasAlt = useCallback(async () => {
    const anio = parseInt(filters.año, 10) || 0;
    const mesRep = getMesNumero(filters.meses[0] ?? '') ?? 1; // mes representativo para n_puestos
    // Materiales colchón de C2000 (únicos) con volumen por línea (para la principal),
    // categoría y necesidad representativa.
    const porMat = new Map<string, { codigo: string; categoria: string; volPorLinea: Map<string, number>; necesidad: number }>();
    for (const r of effectiveData) {
      const centro = String(r.CentroFabricacion ?? r.Centro ?? '').trim();
      if (centro !== '2000') continue;
      if (String(r.Sector ?? '').trim() !== '01 COLCHONES') continue;
      const codigo = String(r.CodMaterial ?? '').trim();
      if (!codigo) continue;
      const linea = String(r.LineaFabricacion ?? '').trim();
      const cat = String(r.Categoria ?? r.ClaseAprovisionam ?? '').trim();
      let m = porMat.get(codigo);
      if (!m) { m = { codigo, categoria: cat, volPorLinea: new Map(), necesidad: 0 }; porMat.set(codigo, m); }
      m.volPorLinea.set(linea, (m.volPorLinea.get(linea) ?? 0) + (Number(r.UnidadesProyectado) || 0));
      m.necesidad += Math.round(Number(r._Necesidades ?? 0));
      if (!m.categoria && cat) m.categoria = cat;
    }
    if (porMat.size === 0) {
      setLineasAltMsg('No hay materiales colchón de C2000 en los datos cargados. Pulsá "Importar Ventas" primero.');
      return;
    }

    setCargandoLineasAlt(true);
    setLineasAltMsg('Consultando líneas por material...');
    const resultado = new Map<string, LineaAltInfo[]>();
    try {
      for (const m of porMat.values()) {
        // Principal por volumen (misma regla que pickLineaFija).
        let principal = ''; let mejorVol = -1;
        for (const [l, v] of m.volPorLinea) if (v > mejorVol) { mejorVol = v; principal = l; }
        // Todas las líneas donde se fabrica (método backend).
        const res = await serviciosService.getLineasFabricacionMaterialByCentroMaterial('2000', m.codigo);
        const lineas = ((res.data ?? []) as any[]).map((x) => String(x.Linea ?? '').trim()).filter(Boolean);
        const infos: LineaAltInfo[] = [];
        for (const linea of lineas) {
          const nP = nPuestosLinea('2000', linea, anio, mesRep);
          let tupp = 0, puestos = 0, cuello = '';
          try {
            const t = await serviciosService.getTiempoMaximoDeFabricacionMaterial(
              m.codigo, '2000', linea, m.categoria, m.necesidad || 1, nP.length ? nP : undefined,
            );
            const p = Array.isArray(t.data) ? t.data[0] : t.data;
            tupp = Number(p?.Tiempo_Min ?? 0);
            puestos = Number(p?.numero_puestos ?? 0);
            cuello = String(p?.PuestoTrabajo ?? '');
          } catch { /* deja 0 si falla la consulta de tiempo */ }
          infos.push({ linea, tupp, numeroPuestos: puestos, cuello, esPrincipal: normLineaIv5(linea) === normLineaIv5(principal) });
        }
        // Clave NORMALIZada (últimos 8) para que coincida con `n.material` del motor.
        resultado.set(normalizeMaterialCode(m.codigo), infos);
      }
      setLineasAltData(resultado);
      const conSec = Array.from(resultado.values()).filter((a) => a.some((x) => !x.esPrincipal)).length;
      setLineasAltMsg(`Consultados ${resultado.size} materiales colchón C2000 · con líneas secundarias: ${conSec}.`);
    } catch (e) {
      console.error('[IV5] Error al consultar líneas alternativas:', e);
      setLineasAltMsg('Error al consultar líneas: ' + ((e as Error).message ?? ''));
    } finally {
      setCargandoLineasAlt(false);
    }
  }, [effectiveData, filters.año, filters.meses, getMesNumero, nPuestosLinea]);

  // Auto-recarga: cuando la página sube `reloadSignal` (cambio de puestos estando
  // en la pestaña IV5), re-dispara la carga si hay filtros suficientes.
  const reloadFirstRef = useRef(true);
  useEffect(() => {
    if (reloadFirstRef.current) { reloadFirstRef.current = false; return; }
    if (filters.año && filters.meses.length > 0 && filters.centros.length > 0) {
      resetNPuestosStats();
      tableRef.current?.loadData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadSignal]);

  const pioMap = useMemo<PioMap>(() => {
    if (!effectiveData.length || !tiemposCanonResults.length || !restriccionesPIO.length) {
      return new Map();
    }
    const firstThreeMeses = filters.meses
      .slice(0, 3)
      .map((m) => getMesNumero(m))
      .filter((n): n is number => n != null && n > 0);
    return buildPioMap(effectiveData, tiemposCanonResults, restriccionesPIO, firstThreeMeses);
  }, [effectiveData, tiemposCanonResults, restriccionesPIO, filters.meses, getMesNumero]);

  const loadTimesCanon = useCallback(
    async (año: string, meses: string[]) => {
      if (!año || meses.length === 0) return;
      setLoadingCanon(true);
      try {
        const yearNum = parseInt(año, 10);
        const out: TiempoCanonResult[] = [];
        for (const mesInput of meses) {
          const mesNum = getMesNumero(mesInput);
          if (!mesNum) continue;
          const wd = await calculateWorkDays(yearNum, mesNum);
          // IV5: sabados disponibles para el motor = los que el usuario podra activar
          // (max parametrizable por mes). El motor se queda con los ACTIVADOS por la UI.
          const diasSabadosDisponibles = Math.max(0, wd.diasSabados - numMaximoSabados);
          const response = await serviciosService.getTiemposCanonPorPuestoDeTrabajo(
            String(wd.diasLaborables),
            String(diasSabadosDisponibles),
          );
          out.push({
            mes: getMesNombre(mesNum),
            mesNumero: mesNum,
            diasLaborables: wd.diasLaborables,
            diasSabados: diasSabadosDisponibles,
            diasFeriados: wd.diasFeriados,
            data: response.data || [],
            error: null,
          });
        }
        setTiemposCanonResults(out);
      } finally {
        setLoadingCanon(false);
      }
    },
    [getMesNumero, numMaximoSabados],
  );

  const handleLoad = useCallback(async () => {
    if (!filters.año || filters.meses.length === 0) {
      alert('Selecciona año y meses.');
      return;
    }
    resetNPuestosStats();
    await Promise.all([
      loadTimesCanon(filters.año, filters.meses),
      filters.centros.length > 0
        ? tableRef.current?.loadData() ?? Promise.resolve()
        : Promise.resolve(),
    ]);
  }, [filters, loadTimesCanon, resetNPuestosStats]);

  const weekSegments = useMemo(() => {
    const anioNum = Number(filters.año || 0);
    if (!anioNum) return [];
    const list = filters.meses
      .map((m) => ({ mes: getMesNumero(m) || Number(m), anio: anioNum }))
      .filter((x) => Number.isFinite(x.mes) && x.mes >= 1 && x.mes <= 12);
    return getWeekSegments(list);
  }, [filters.año, filters.meses, getMesNumero]);

  const saturdayProposal = useMemo(() => {
    const anio = parseInt(filters.año, 10) || 0;
    const meses = filters.meses
      .map((m) => getMesNumero(m) || Number(m))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);
    return buildSaturdayProposalByMonth({
      tiemposCanon: tiemposCanonResults,
      weekSegments,
      meses,
      anio,
      horasExtrasFin,
    });
  }, [tiemposCanonResults, filters.año, filters.meses, horasExtrasFin, weekSegments, getMesNumero]);

  const systemIdentifiedSatKeys = useMemo(
    () => getSystemIdentifiedSatKeys(saturdayProposal),
    [saturdayProposal],
  );

  const applySaturdayProposal = useCallback(
    (centro: string) => {
      setDraftActiveSatKeysByCenter((prevDraft) => {
        const merged = mergeProposalForCenter(prevDraft, filters.centros, centro, saturdayProposal);
        setActiveSatKeysByCenter(pruneSelectionToCentros(merged, filters.centros));
        return merged;
      });
    },
    [filters.centros, saturdayProposal],
  );

  const toggleSaturday = useCallback((centro: string, satKey: string) => {
    setDraftActiveSatKeysByCenter((prev) => applySaturdayChange(prev, centro, satKey, 'toggle'));
  }, []);

  const centrosOrdenados = useMemo(
    () => [...filters.centros].map((c) => String(c)).sort(),
    [filters.centros],
  );

  const satKeysSig = useCallback(
    (rec: Record<string, Set<string>>, centros: string[]): string =>
      centros.map((c) => `${c}:${[...(rec[c] ?? new Set<string>())].sort().join(',')}`).join('|'),
    [],
  );
  const committedSig = useMemo(
    () => satKeysSig(activeSatKeysByCenter, centrosOrdenados),
    [centrosOrdenados, activeSatKeysByCenter, satKeysSig],
  );
  const draftSig = useMemo(
    () => satKeysSig(draftActiveSatKeysByCenter, centrosOrdenados),
    [centrosOrdenados, draftActiveSatKeysByCenter, satKeysSig],
  );
  const selectionDirty = committedSig !== draftSig;

  // Resultado obsoleto: hay resultados en pantalla pero la seleccion de sabados
  // confirmada cambio respecto de la que se uso en el ultimo calculo.
  const resultadoDesactualizado =
    (!!resultC1000 || !!resultC2000) &&
    lastComputedSatSig !== null &&
    committedSig !== lastComputedSatSig;

  const centrosPendientesSabado = useMemo(() => {
    if (!filters.centros.length) return [];
    const monthsWithSat = Array.from(saturdayProposal.values()).some((c) => c.satKeys.length > 0);
    if (!monthsWithSat) return [];
    return filters.centros.filter((c) => {
      const sel = activeSatKeysByCenter[c];
      return !sel || sel.size === 0;
    });
  }, [filters.centros, saturdayProposal, activeSatKeysByCenter]);

  const onConfirmSelection = useCallback(() => {
    if (selectionDirty) {
      setActiveSatKeysByCenter(pruneSelectionToCentros(draftActiveSatKeysByCenter, filters.centros));
    }
  }, [selectionDirty, draftActiveSatKeysByCenter, filters.centros]);

  const countSelectedSatInMonth = useCallback(
    (centro: string, mesNumero: number, anio: number): number =>
      countSelectedSatInMonthHelper({
        weekSegments,
        byCenter: activeSatKeysByCenter,
        centro,
        mes: mesNumero,
        anio,
      }),
    [weekSegments, activeSatKeysByCenter],
  );

  const canCompute =
    centrosPendientesSabado.length === 0 &&
    effectiveData.length > 0 &&
    weekSegments.length > 0 &&
    tiemposCanonResults.length > 0;
  const pioCount = pioMap.size;

  const handleCompute = useCallback(() => {
    if (!canCompute) {
      alert('Importa las ventas, espera los tiempos canonicos y selecciona sabados para todos los centros.');
      return;
    }
    setComputing(true);
    setComputeProgress({ pct: 0, etapa: 'Iniciando el calculo...' });
    // Registra la seleccion de sabados con la que se corre este calculo.
    setLastComputedSatSig(committedSig);
    setResultC2000(null);
    setResultC1000(null);
    setExtraDiagnostics([]);
    setXeSinLineaC1000([]);
    // Deferimos al siguiente tick para que la UI repinte el spinner.
    setTimeout(async () => {
      try {
        const wantC2000 = filters.centros.includes('2000');
        const wantC1000 = filters.centros.includes('1000');

        // ====================================================================
        // RAMA: Motor REDISEÑADO (BETA) — ÚNICO motor activo de IV5.
        // `usarMotorRediseñado` es constante true (se quitó el toggle de la UI).
        // La rama del motor anterior (más abajo) queda intacta pero inalcanzable.
        // ====================================================================
        if (usarMotorRediseñado) {
          const r = await runIv5EngineRediseñadoAsync(
            {
              weekSegments,
              effectiveData,
              tiemposCanon: tiemposCanonResults,
              activeSatKeysC1000: activeSatKeysByCenter['1000'] ?? new Set<string>(),
              activeSatKeysC2000: activeSatKeysByCenter['2000'] ?? new Set<string>(),
              horasTrabajo,
              maxExtrasHoras,
              horasExtrasFin,
              factoresAjustePorCentro,
              pioMap,
              stockCap,
              transportCap,
              lineasSecundarias,
              maxSabadosMes,
              wantC1000,
              wantC2000,
            },
            // Avance real reportado por el motor en cada hito del calculo.
            (p) => setComputeProgress({ pct: p.pct, etapa: p.etapa }),
          );
          if (r.resultC1000) setResultC1000(r.resultC1000);
          if (r.resultC2000) setResultC2000(r.resultC2000);
          if (r.diagnosticos.length > 0) {
            setExtraDiagnostics((prev) => [...prev, ...r.diagnosticos]);
          }
          setXeSinLineaC1000(r.xeSinLineaC1000 ?? []);
          return;
        }
        // ====================================================================
        // RAMA: Motor ORIGINAL (default, lógica histórica)
        // ====================================================================

        // Orden nuevo (3 pasos):
        //  0) Pre-pase C2000: calcula el deficit semanal real de C2000
        //     (clase F y X/E) usando stock rolling y capacidad propia
        //     estimada. Produce `deficitC2000ByMatWeek` que se pasa a
        //     C1000 como necesidadTraslado por (material, semana).
        //  1) C1000 corre con ese deficit como entrada (reemplaza el
        //     calculo viejo "demanda bruta clase F"). Devuelve
        //     `trasladoSaliente` real por (material, semana).
        //  2) C2000 corre recibiendo ese traslado real como
        //     `trasladoEntranteByMatWeek`. Cubre la demanda clase F y el
        //     deficit X/E con suministro entrante en lugar de capacidad propia.
        let r1000: Iv5RunResult | null = null;
        let trasladoEntranteC2000: Map<string, number> | undefined;
        let deficitC2000ByMatWeek: Map<string, number> | undefined;
        const prePaseDiagnostics: Iv5DiagnosticEntry[] = [];

        if (wantC2000) {
          const preC2000 = computeC2000Deficits({
            effectiveData,
            weekSegments,
            pioMap,
            tiemposCanon: tiemposCanonResults,
            activeSatKeysC2000: activeSatKeysByCenter['2000'] ?? new Set<string>(),
            maxExtrasHoras,
            horasExtrasFin,
            maxSabadosMes,
            ...factorCentro('2000'),
          });
          deficitC2000ByMatWeek = preC2000.deficitByMatWeek;
          prePaseDiagnostics.push(...preC2000.diagnostics);
        }

        if (wantC1000) {
          r1000 = runIv5Engine({
            centro: '1000',
            weekSegments,
            effectiveData,
            tiemposCanon: tiemposCanonResults,
            activeSatKeys: activeSatKeysByCenter['1000'] ?? new Set<string>(),
            horasTrabajo,
            maxExtrasHoras,
            horasExtrasFin,
            ...factorCentro('1000'),
            pioMap,
            stockCap,
            maxSabadosMes,
            deficitC2000ByMatWeek,
          });
          trasladoEntranteC2000 = aggregateTrasladoSalienteFromLedger(r1000.ledger);
          setResultC1000(r1000);
        }

        if (wantC2000) {
          const r2000 = runIv5Engine({
            centro: '2000',
            weekSegments,
            effectiveData,
            tiemposCanon: tiemposCanonResults,
            activeSatKeys: activeSatKeysByCenter['2000'] ?? new Set<string>(),
            horasTrabajo,
            maxExtrasHoras,
            horasExtrasFin,
            ...factorCentro('2000'),
            pioMap,
            stockCap,
            maxSabadosMes,
            trasladoEntranteByMatWeek: trasladoEntranteC2000,
          });
          setResultC2000(r2000);
        }

        // Inyecta los diagnosticos del pre-pase C2000 al panel global.
        if (prePaseDiagnostics.length > 0) {
          setExtraDiagnostics((prev) => [...prev, ...prePaseDiagnostics]);
        }
      } catch (err) {
        console.error('[IV5] Error al calcular motor:', err);
        alert('Ocurrio un error al calcular el plan de produccion. Revisa la consola.');
      } finally {
        setComputing(false);
        setComputeProgress({ pct: 0, etapa: '' });
      }
    }, 0);
  }, [
    canCompute,
    filters.centros,
    weekSegments,
    effectiveData,
    tiemposCanonResults,
    activeSatKeysByCenter,
    horasTrabajo,
    maxExtrasHoras,
    horasExtrasFin,
    factorCentro,
    factoresAjustePorCentro,
    pioMap,
    stockCap,
    transportCap,
    lineasSecundarias,
    maxSabadosMes,
    usarMotorRediseñado,
    committedSig,
  ]);

  const monthlyRows = useMemo<Iv5MonthlySnapshot[]>(() => {
    const out: Iv5MonthlySnapshot[] = [];
    if (resultC1000 && (!resultCenters.length || resultCenters.includes('1000'))) out.push(...resultC1000.monthly);
    if (resultC2000 && (!resultCenters.length || resultCenters.includes('2000'))) out.push(...resultC2000.monthly);
    return out;
  }, [resultC1000, resultC2000, resultCenters]);

  const weeklyRows = useMemo<Iv5WeeklyRow[]>(() => {
    const out: Iv5WeeklyRow[] = [];
    if (resultC1000 && (!resultCenters.length || resultCenters.includes('1000'))) out.push(...resultC1000.ledger);
    if (resultC2000 && (!resultCenters.length || resultCenters.includes('2000'))) out.push(...resultC2000.ledger);
    return out;
  }, [resultC1000, resultC2000, resultCenters]);

  const diagnostics = useMemo<Iv5DiagnosticEntry[]>(() => {
    const out: Iv5DiagnosticEntry[] = [];
    if (resultC1000 && (!resultCenters.length || resultCenters.includes('1000'))) out.push(...resultC1000.diagnostics);
    if (resultC2000 && (!resultCenters.length || resultCenters.includes('2000'))) out.push(...resultC2000.diagnostics);
    out.push(...extraDiagnostics);
    return out;
  }, [resultC1000, resultC2000, resultCenters, extraDiagnostics]);

  // ¿El usuario aplicó algún filtro en la sección 4? Si no, la tabla no se muestra.
  const hasResultFilter =
    resultCenters.length > 0 ||
    resultLinea.trim() !== '' ||
    resultMaterial.trim() !== '' ||
    resultMes !== '';

  // Filtro fila-a-fila por línea/material/mes (el centro ya lo aplican monthlyRows/weeklyRows).
  const matchResultFilters = useCallback(
    (r: { linea: string; material: string; mes: number }) => {
      const lin = resultLinea.trim().toLowerCase();
      if (lin && !String(r.linea).toLowerCase().includes(lin)) return false;
      const mat = resultMaterial.trim().toLowerCase();
      if (mat && !String(r.material).toLowerCase().includes(mat)) return false;
      if (resultMes && String(r.mes) !== resultMes) return false;
      return true;
    },
    [resultLinea, resultMaterial, resultMes],
  );

  const filteredMonthlyRows = useMemo(
    () => (hasResultFilter ? monthlyRows.filter(matchResultFilters) : []),
    [hasResultFilter, monthlyRows, matchResultFilters],
  );
  const filteredWeeklyRows = useMemo(
    () => (hasResultFilter ? weeklyRows.filter(matchResultFilters) : []),
    [hasResultFilter, weeklyRows, matchResultFilters],
  );

  // Opciones para el select de Mes (derivadas de las filas mensuales del resultado).
  const resultMesOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of monthlyRows) m.set(String(r.mes), r.mesNombre);
    return Array.from(m.entries()).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [monthlyRows]);

  const handleSelfCheck = useCallback(() => {
    const weeklyAll = [
      ...(resultC1000?.ledger ?? []),
      ...(resultC2000?.ledger ?? []),
    ];
    const monthlyAll = [
      ...(resultC1000?.monthly ?? []),
      ...(resultC2000?.monthly ?? []),
    ];
    const result = iv5SelfCheck({ weeklyAll, monthlyAll });
    setExtraDiagnostics(result);
  }, [resultC1000, resultC2000]);

  const availableResultCenters = useMemo(() => {
    const set = new Set<string>();
    if (resultC1000) set.add('1000');
    if (resultC2000) set.add('2000');
    return Array.from(set).sort();
  }, [resultC1000, resultC2000]);

  // Bloquea el scroll del body cuando el overlay de guardado esta visible.
  useEffect(() => {
    if (!savingPlanGlobal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [savingPlanGlobal]);

  /**
   * Construye un snapshot serializable de la version IV5 actual (para localStorage).
   * Se omiten `id`, `savedAt`, `nota` (los inyecta `Iv5VersionsPanel`).
   */
  const buildSnapshot = useCallback((): Omit<Iv5Version, 'id' | 'savedAt' | 'nota'> | null => {
    if (!resultC1000 && !resultC2000) return null;
    const saturdays: Record<string, string[]> = {};
    for (const [centro, set] of Object.entries(activeSatKeysByCenter)) {
      saturdays[centro] = Array.from(set);
    }
    let demSig = 0;
    for (const r of effectiveData) demSig += Number(r?.UnidadesProyectado) || 0;
    return {
      filters: { año: filters.año, meses: filters.meses, centros: filters.centros },
      stockCap,
      maxSabadosMes,
      saturdays,
      demandaAjustadaSig: `${effectiveData.length}:${demSig}`,
      ledgerC1000: resultC1000?.ledger ?? [],
      ledgerC2000: resultC2000?.ledger ?? [],
      monthlyC1000: resultC1000?.monthly ?? [],
      monthlyC2000: resultC2000?.monthly ?? [],
      diagnostics: [
        ...(resultC1000?.diagnostics ?? []),
        ...(resultC2000?.diagnostics ?? []),
      ],
      savedToDB: false,
    };
  }, [
    activeSatKeysByCenter,
    effectiveData,
    filters.año,
    filters.meses,
    filters.centros,
    stockCap,
    maxSabadosMes,
    resultC1000,
    resultC2000,
  ]);

  const handleSaveToPlanGlobal = useCallback(async () => {
    if (!resultC1000 && !resultC2000) {
      alert('No hay resultados del plan para guardar.');
      return;
    }
    const totalRows = (resultC1000?.ledger.length ?? 0) + (resultC2000?.ledger.length ?? 0);
    if (totalRows === 0) {
      alert('El detalle semanal del plan esta vacio.');
      return;
    }
    if (!confirm(`Guardar ${totalRows.toLocaleString('es-EC')} registros del plan en el Plan Global?`)) {
      return;
    }
    const anioNum = parseInt(filters.año, 10) || new Date().getFullYear();
    const mesesSel = filters.meses
      .map((m) => getMesNumero(m) || Number(m))
      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12)
      .sort((a, b) => a - b);
    const fechaInicio = new Date(anioNum, (mesesSel[0] ?? 1) - 1, 1);
    const fechaFin = new Date(anioNum, mesesSel.length ? mesesSel[mesesSel.length - 1] : 12, 0);
    setSavingPlanGlobal(true);
    setSaveProgress({ done: 0, total: totalRows });
    setSaveMsg('Iniciando guardado...');
    try {
      const res = await saveIv5ToPlanGlobal({
        resultC1000,
        resultC2000,
        fechaInicio,
        fechaFin,
        usuarioCreacion: 'IV5',
        onProgress: (done, total) => {
          setSaveProgress({ done, total });
          setSaveMsg(`Guardando ${done.toLocaleString('es-EC')} / ${total.toLocaleString('es-EC')}...`);
        },
      });
      setSaveMsg(
        `Plan ${res.identificador} guardado (codigo ${res.codigoPlan}, ${res.totalRegistros.toLocaleString('es-EC')} registros).`,
      );
      toast({
        title: 'Plan Global guardado',
        description: `Plan ${res.identificador} guardado (código ${res.codigoPlan}, ${res.totalRegistros.toLocaleString('es-EC')} registros).`,
        variant: 'success',
      });
    } catch (err) {
      console.error('[IV5] Error al guardar Plan Global:', err);
      setSaveMsg(`Error al guardar: ${(err as Error).message}`);
      toast({
        title: 'Error al guardar el Plan Global',
        description: (err as Error).message,
        variant: 'destructive',
      });
    } finally {
      setTimeout(() => {
        setSavingPlanGlobal(false);
        setSaveProgress(null);
      }, 1200);
    }
  }, [resultC1000, resultC2000, filters.año, filters.meses, getMesNumero, toast]);

  const handleLoadVersion = useCallback((v: Iv5Version) => {
    setFilters({ año: v.filters.año, meses: v.filters.meses, centros: v.filters.centros });
    setStockCap(v.stockCap);
    setMaxSabadosMes(v.maxSabadosMes);
    const sat: Record<string, Set<string>> = {};
    for (const [centro, keys] of Object.entries(v.saturdays)) sat[centro] = new Set(keys);
    setActiveSatKeysByCenter(sat);
    setDraftActiveSatKeysByCenter(sat);
    setResultC1000({ centro: '1000', ledger: v.ledgerC1000, monthly: v.monthlyC1000, diagnostics: v.diagnostics.filter((d) => d.centro === '1000') });
    setResultC2000({ centro: '2000', ledger: v.ledgerC2000, monthly: v.monthlyC2000, diagnostics: v.diagnostics.filter((d) => d.centro === '2000') });
  }, []);

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Importar Ventas</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Año</label>
            <select
              value={filters.año}
              onChange={(e) => setFilters((prev) => ({ ...prev, año: e.target.value }))}
              disabled={isLoadingOptions}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">Seleccionar...</option>
              {filterOptions.años.map((y) => (
                <option key={y.value} value={y.value}>
                  {y.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <MultiSelectDropdown
              label="Meses"
              options={filterOptions.meses}
              selected={filters.meses}
              onChange={(meses) => setFilters((prev) => ({ ...prev, meses }))}
              disabled={isLoadingOptions}
            />
          </div>
          <div>
            <MultiSelectDropdown
              label="Centros"
              options={filterOptions.centros}
              selected={filters.centros}
              onChange={(centros) => setFilters((prev) => ({ ...prev, centros }))}
              disabled={isLoadingOptions}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={handleLoad}
              className="w-full bg-blue-600 text-white rounded-md px-4 py-2.5 text-sm font-medium hover:bg-blue-700"
            >
              Importar Ventas
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-2">1. Revision y ajuste de la demanda</h4>
        <p className="text-[11px] text-gray-600 mb-3">
          La demanda usada por todo el plan es la <strong>ajustada por el usuario</strong> si la hay; si no, la cruda
          del backend. Pulsa <strong>Importar Ventas</strong> para refrescar datos y tiempos canonicos.
        </p>
        {rawData.length > 0 && (
          <div className="mb-4">
            <DemandWeeklyAdjustmentSection
              rawData={rawData}
              year={filters.año}
              meses={filters.meses}
              getMesNumero={getMesNumero}
              onAdjustedDataChange={setAdjustedData}
            />
          </div>
        )}
        <RawBackendDataTable
          ref={tableRef}
          año={filters.año}
          meses={filters.meses}
          centros={filters.centros}
          resolveNPuestos={resolveNPuestos}
          hideDetailUntilFilter
          onDataLoaded={(rows) => {
            setRawData(rows);
            setAdjustedData(rows);
            const s = nPuestosStatsRef.current;
            setNPuestosStats({ ...s, muestras: [...s.muestras] });
            console.debug('[IV5] n_puestos enviados:', s.enviadas, 'filas | sin línea match:', s.sinLinea, '| muestras:', s.muestras);
          }}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-2">2. Sabados por centro y semana</h4>
        <SaturdayWeeklyEditor
          centros={centrosOrdenados}
          proposal={saturdayProposal}
          systemIdentifiedSatKeys={systemIdentifiedSatKeys}
          draftByCenter={draftActiveSatKeysByCenter}
          committedByCenter={activeSatKeysByCenter}
          satMinutos={Math.round(horasExtrasFin * 60)}
          maxSabadosMes={maxSabadosMes}
          selectionDirty={selectionDirty}
          centrosPendientes={centrosPendientesSabado}
          onToggle={toggleSaturday}
          onApplyProposal={applySaturdayProposal}
          onConfirm={onConfirmSelection}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-2">3. Parametros del plan</h4>
        <p className="text-[11px] text-gray-600 mb-3">
          Topes agregados de stock final para los sectores 01 COLCHONES, 02 BASES-CABECEROS-CAMA y 03 MUEBLES
          FABRICACION. Editables y persistentes en este navegador. Tope max de sabados/mes parametrizable.
          El tope de transporte C1000→C2000 (uds/día) limita cuánto puede trasladarse por día: si un mes supera el tope, el motor Beta adelanta esas necesidades a meses previos (F primero, luego X/E) mientras haya capacidad; el sobrante se traslada igual con alerta.
        </p>
        <Iv5StockCapEditor
          value={stockCap}
          maxSabadosMes={maxSabadosMes}
          transportCap={transportCap}
          onChange={setStockCap}
          onMaxSabadosChange={setMaxSabadosMes}
          onTransportCapChange={setTransportCap}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h4 className="text-sm font-semibold text-gray-800">3b. Líneas alternativas (colchones C2000)</h4>
          <button
            type="button"
            onClick={handleCargarLineasAlt}
            disabled={cargandoLineasAlt || effectiveData.length === 0}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {cargandoLineasAlt ? 'Consultando...' : 'Cargar líneas alternativas'}
          </button>
        </div>
        <p className="text-[11px] text-gray-600 mb-2">
          Consulta, por cada colchón de C2000, todas las líneas donde se fabrica y el tiempo propio de cada una.
          La <strong>principal</strong> es la de más volumen; las demás son <strong>secundarias</strong> (ayudan cuando la
          principal se llena). Solo consulta y muestra — aún sin efecto en el motor.
        </p>
        {lineasAltMsg && (
          <div className="text-[11px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-3 py-1.5 mb-2">{lineasAltMsg}</div>
        )}
        {lineasAltData.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button
              type="button"
              onClick={() => setLineasAltExpandido((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-blue-700 hover:underline"
              title={lineasAltExpandido ? 'Contraer el detalle' : 'Ver el detalle por material'}
            >
              <span className="text-[10px]">{lineasAltExpandido ? '▼' : '▶'}</span>
              {lineasAltExpandido ? 'Ocultar detalle' : 'Ver detalle'}
            </button>
            <span className="text-[11px] text-gray-500">
              {materialesConSecundarias} material(es) con línea secundaria
            </span>
          </div>
        )}
        {lineasAltData.size > 0 && lineasAltExpandido && (
          <div className="overflow-x-auto max-h-64 overflow-y-auto border border-gray-200 rounded">
            <table className="w-full text-[11px]">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-1 text-left font-semibold text-gray-600">Material</th>
                  <th className="px-2 py-1 text-left font-semibold text-gray-600">Línea</th>
                  <th className="px-2 py-1 text-center font-semibold text-gray-600">Tipo</th>
                  <th className="px-2 py-1 text-right font-semibold text-gray-600">Tiempo/uds</th>
                  <th className="px-2 py-1 text-right font-semibold text-gray-600">Puestos</th>
                  <th className="px-2 py-1 text-left font-semibold text-gray-600">Cuello</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {Array.from(lineasAltData.entries())
                  .filter(([, infos]) => infos.some((x) => !x.esPrincipal))
                  .slice(0, 100)
                  .flatMap(([mat, infos]) =>
                    infos.map((info, i) => (
                      <tr key={`${mat}-${info.linea}`} className={info.esPrincipal ? 'bg-white' : 'bg-blue-50/40'}>
                        <td className="px-2 py-1 font-mono text-gray-700">{i === 0 ? mat : ''}</td>
                        <td className="px-2 py-1 text-gray-800">{info.linea}</td>
                        <td className="px-2 py-1 text-center">
                          {info.esPrincipal
                            ? <span className="text-gray-500">principal</span>
                            : <span className="text-blue-700 font-medium">secundaria</span>}
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{info.tupp.toFixed(3)}</td>
                        <td className="px-2 py-1 text-right font-mono">{info.numeroPuestos}</td>
                        <td className="px-2 py-1 text-gray-500">{info.cuello}</td>
                      </tr>
                    )),
                  )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
          <h4 className="text-sm font-semibold text-gray-800">4. Resultados del plan de produccion</h4>
          <div className="flex gap-1 items-center flex-wrap">
            <button
              type="button"
              onClick={handleCompute}
              disabled={!canCompute || computing}
              className={`text-xs px-3 py-1.5 rounded text-white disabled:opacity-40 disabled:cursor-not-allowed ${
                resultadoDesactualizado ? 'bg-amber-600 hover:bg-amber-700 ring-2 ring-amber-300' : 'bg-blue-600 hover:bg-blue-700'
              }`}
            >
              {computing
                ? `Calculando... ${computeProgress.pct}%`
                : resultadoDesactualizado
                ? 'Recalcular (sábados cambiaron)'
                : 'Calcular Plan de produccion'}
            </button>
            {resultadoDesactualizado && !computing && (
              <span className="text-[11px] text-amber-700">
                ⚠️ Cambiaste la selección de sábados. Pulsá <strong>Recalcular</strong> para actualizar los resultados.
              </span>
            )}
            <button
              type="button"
              onClick={() =>
                exportIv5Excel({ resultC1000, resultC2000, effectiveData, filenamePrefix: 'PlanProduccion' })
              }
              disabled={!resultC1000 && !resultC2000}
              className="text-xs px-3 py-1.5 rounded border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:text-gray-400 disabled:border-gray-300 disabled:hover:bg-white"
            >
              Descargar Excel
            </button>
            <button
              type="button"
              onClick={handleSaveToPlanGlobal}
              disabled={(!resultC1000 && !resultC2000) || savingPlanGlobal}
              className="text-xs px-3 py-1.5 rounded bg-blue-800 text-white hover:bg-blue-900 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {savingPlanGlobal ? 'Guardando...' : 'Guardar en Plan Global'}
            </button>
            <button
              type="button"
              onClick={() => setView('mensual')}
              className={`text-xs px-3 py-1.5 rounded ${view === 'mensual' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}
            >
              Vista mensual
            </button>
            <button
              type="button"
              onClick={() => setView('semanal')}
              className={`text-xs px-3 py-1.5 rounded ${view === 'semanal' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}
            >
              Vista semanal
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px] mb-3">
          <div className="rounded border border-gray-200 p-2 bg-gray-50">
            <div className="text-gray-500">Filas demanda efectiva</div>
            <div className="font-mono text-gray-900">{effectiveData.length.toLocaleString('es-EC')}</div>
          </div>
          <div className="rounded border border-gray-200 p-2 bg-gray-50">
            <div className="text-gray-500">Semanas (segments)</div>
            <div className="font-mono text-gray-900">{weekSegments.length}</div>
          </div>
          <div className="rounded border border-gray-200 p-2 bg-gray-50">
            <div className="text-gray-500">Tiempos canon (meses)</div>
            <div className="font-mono text-gray-900">{tiemposCanonResults.length}</div>
          </div>
          <div className="rounded border border-gray-200 p-2 bg-gray-50">
            <div className="text-gray-500">PIO mapeado</div>
            <div className="font-mono text-gray-900">{pioCount}</div>
          </div>
        </div>
        {loadingCanon && (
          <p className="text-[11px] text-blue-700 mb-2">Calculando tiempos canonicos...</p>
        )}

        {!resultC1000 && !resultC2000 ? (
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            Pulsa <strong>Calcular Plan de produccion</strong> para correr el motor sobre los centros seleccionados.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-2 items-end">
              <div>
                <MultiSelectDropdown
                  label="Centro (resultados)"
                  options={availableResultCenters.map((c) => ({ value: c, label: c }))}
                  selected={resultCenters}
                  onChange={setResultCenters}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Línea</label>
                <input
                  type="search"
                  placeholder="Filtrar por línea..."
                  value={resultLinea}
                  onChange={(e) => setResultLinea(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Material</label>
                <input
                  type="search"
                  placeholder="Filtrar por material..."
                  value={resultMaterial}
                  onChange={(e) => setResultMaterial(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Mes</label>
                <select
                  value={resultMes}
                  onChange={(e) => setResultMes(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white"
                >
                  <option value="">Todos</option>
                  {resultMesOptions.map(([num, nombre]) => (
                    <option key={num} value={num}>{nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {hasResultFilter ? (
              <>
                <div className="text-[11px] text-gray-600 mb-2">
                  Filas mensual: {filteredMonthlyRows.length.toLocaleString('es-EC')}. Filas semanal:
                  {' '}{filteredWeeklyRows.length.toLocaleString('es-EC')}. Diagnostico: {diagnostics.length}.
                </div>
                <Iv5ResultsTable
                  view={view}
                  monthlyRows={filteredMonthlyRows}
                  weeklyRows={filteredWeeklyRows}
                />
                <p className="text-[10px] text-gray-500 mt-2 italic">
                  Identidad auditable: <strong>StockFinal = StockInicial + ProduccionTotal + TraslEntrantes
                  - Despachos - TraslSalientes</strong>. El motor cierra drift week-vs-month al final.
                </p>
              </>
            ) : (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                El plan se calculó correctamente. Aplicá un filtro (<strong>centro, línea, material o mes</strong>)
                para ver el detalle de resultados.
              </div>
            )}
          </>
        )}
        <p className="text-[10px] text-gray-400 mt-2">
          Restricciones: HORAS_TRABAJO={horasTrabajo}, MAX_EXTRAS_HORAS={maxExtrasHoras},
          HORAS_EXTRAS_FIN_SEMANA={horasExtrasFin}, NUMERO_MAXIMO_SABADOS={numMaximoSabados}.
          Sabados activos C1000 (mes 1)={countSelectedSatInMonth('1000', 1, parseInt(filters.año, 10) || 0)}.
        </p>
        {filters.centros.map((c) => {
          const fc = factorCentro(String(c));
          return (
            <p key={c} className="text-[10px] text-gray-400 mt-1">
              Factores horas netas C{c}: normal ×{fc.factorAjusteNormal.toFixed(4)} ({(horasTrabajo * fc.factorAjusteNormal).toFixed(3)}h),
              extra ×{fc.factorAjusteExtra.toFixed(4)} ({(maxExtrasHoras * fc.factorAjusteExtra).toFixed(3)}h),
              sabado ×{fc.factorAjusteSabado.toFixed(4)} ({(horasExtrasFin * fc.factorAjusteSabado).toFixed(3)}h).
            </p>
          );
        })}
        <p className={`text-[10px] mt-1 ${nPuestosStats.enviadas > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
          Override de puestos: <strong>{nPuestosStats.enviadas}</strong> fila(s) enviaron n_puestos al recálculo del cuello
          {nPuestosStats.sinLinea > 0 && <> · {nPuestosStats.sinLinea} fila(s) sin match de línea/centro</>}.
          {mounted && nPuestosStats.enviadas === 0 && Object.keys(puestosOverrides).length > 0 && (
            <> ⚠️ Hay overrides guardados pero ninguno aplicó: revisá que el período (mes/año) y el centro de la estación coincidan con los datos cargados.</>
          )}
        </p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-2">
          4b. Balance mensual de stock por centro
        </h4>
        <p className="text-[11px] text-gray-600 mb-3">
          Una tabla por centro, con el balance físico mes a mes. Viene filtrado a los sectores{' '}
          <strong>01, 02 y 03</strong> y podés cambiar el filtro:{' '}
          <span className="font-mono">
            Stock inicial + Producción + Traslado entrante − Despachos − Traslado saliente = Stock final
          </span>
          . La columna de traslado cambia según el centro porque el flujo es C1000→C2000:{' '}
          <strong>C1000</strong> muestra el traslado <strong>saliente</strong> y <strong>C2000</strong> el{' '}
          <strong>entrante</strong>. El stock es el <strong>físico</strong> (incluye las unidades reservadas
          por anticipación). Selecciona una version guardada en el panel de Versiones para ver el delta
          bajo cada cifra.
        </p>
        <Iv5StockEvolutionPanel
          monthlyC1000={resultC1000?.monthly ?? []}
          monthlyC2000={resultC2000?.monthly ?? []}
        />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-2">
          4c. Produccion diaria por centro (sectores 01+02+03)
        </h4>
        <p className="text-[11px] text-gray-600 mb-3">
          Producción planificada <strong>día por día</strong> para cada centro, sumando los sectores
          {' '}<strong>01, 02, 03</strong>. Como el motor planifica por semana, cada día
          <strong> lunes a viernes</strong> muestra el promedio de la semana (producción L-V ÷ días
          laborables); el <strong>sábado</strong> se muestra aparte con su propia producción. Las
          <strong> horas usadas</strong> son los minutos de trabajo (producción × tiempo unitario) / 60.
          Incluye subtotal por semana y total por mes.
        </p>
        <ProduccionDiariaSection weeklyRows={weeklyRows} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-gray-800">5. Diagnostico del plan</h4>
          <button
            type="button"
            onClick={handleSelfCheck}
            disabled={!resultC1000 && !resultC2000}
            className="text-xs px-3 py-1.5 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:text-gray-400 disabled:border-gray-300 disabled:hover:bg-white"
          >
            Validar cuadre
          </button>
        </div>
        <Iv5DiagnosticPanel diagnostics={diagnostics} />
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-2">6. Versiones del plan (locales)</h4>
        <p className="text-[11px] text-gray-600 mb-3">
          Guarda snapshots del plan en este navegador para comparar escenarios sin tocar el backend. El boton
          <strong> Guardar en Plan Global</strong> de arriba persiste el detalle semanal en la base de datos
          (no afecta planes existentes).
        </p>
        <Iv5VersionsPanel buildSnapshot={buildSnapshot} onLoadVersion={handleLoadVersion} />
      </div>

      {usarMotorRediseñado && (resultC1000 || resultC2000) && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-800 mb-2">
            7. Materiales X/E sin línea en C1000 (no respaldables)
          </h4>
          <p className="text-[11px] text-gray-600 mb-3">
            Materiales X/E con déficit operativo en C2000 que no pudieron pedirse como traslado a C1000
            porque no tienen línea productiva en C1000. La cantidad es el faltante operativo
            (demanda + backlog) acumulado en todo el horizonte que quedó sin posibilidad de respaldo.
          </p>
          {xeSinLineaC1000.length === 0 ? (
            <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
              Todos los materiales con déficit en C2000 X/E fueron considerados en la capacidad de C1000.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50 text-gray-700">
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold">
                      Código de material
                    </th>
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold">
                      Descripción
                    </th>
                    <th className="border border-gray-200 px-3 py-1.5 text-right font-semibold">
                      Cantidad
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {xeSinLineaC1000.map((m) => (
                    <tr key={m.material} className="hover:bg-gray-50">
                      <td className="border border-gray-200 px-3 py-1.5 font-mono">{m.material}</td>
                      <td className="border border-gray-200 px-3 py-1.5">{m.descripcion || '—'}</td>
                      <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums">
                        {m.cantidad.toLocaleString('es-EC')}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 font-semibold text-gray-800">
                    <td className="border border-gray-200 px-3 py-1.5" colSpan={2}>
                      Total ({xeSinLineaC1000.length} materiales)
                    </td>
                    <td className="border border-gray-200 px-3 py-1.5 text-right tabular-nums">
                      {xeSinLineaC1000
                        .reduce((s, m) => s + m.cantidad, 0)
                        .toLocaleString('es-EC')}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {computing && typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm"
          >
            <div className="bg-white rounded-lg shadow-2xl border border-gray-200 max-w-md w-[92%] p-5">
              <h3 className="text-base font-semibold text-gray-800 mb-2">Calculando Plan de produccion</h3>
              <p className="text-xs text-gray-600 mb-4">
                El motor está procesando demanda, capacidades, traslados y anticipaciones. No cierres la
                pestaña; esto puede tardar unos segundos.
              </p>
              <div className="flex items-center gap-3">
                <span className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-[11px] text-gray-600">
                      {computeProgress.etapa || 'Procesando…'}
                    </span>
                    <span className="text-xs font-semibold text-blue-700 tabular-nums">
                      {computeProgress.pct}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded h-2 overflow-hidden">
                    <div
                      className="h-2 bg-blue-600 transition-all duration-200"
                      style={{ width: `${Math.min(100, Math.max(0, computeProgress.pct))}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {savingPlanGlobal && typeof document !== 'undefined' &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm"
          >
            <div className="bg-white rounded-lg shadow-2xl border border-gray-200 max-w-md w-[92%] p-5">
              <h3 className="text-base font-semibold text-gray-800 mb-2">Guardando el plan en Plan Global</h3>
              <p className="text-xs text-gray-600 mb-3">
                Este proceso bloquea la pantalla hasta terminar para evitar interrumpir los lotes hacia el
                backend. No cierres la pestana.
              </p>
              <div className="w-full bg-gray-200 rounded h-2 overflow-hidden mb-2">
                <div
                  className="h-2 bg-blue-600 transition-all duration-300"
                  style={{
                    width: saveProgress && saveProgress.total > 0
                      ? `${Math.min(100, (saveProgress.done / saveProgress.total) * 100).toFixed(1)}%`
                      : '0%',
                  }}
                />
              </div>
              <p className="text-[11px] text-gray-700 font-mono">
                {saveProgress
                  ? `${saveProgress.done.toLocaleString('es-EC')} / ${saveProgress.total.toLocaleString('es-EC')} registros`
                  : 'Preparando...'}
              </p>
              {saveMsg && <p className="text-[11px] text-gray-500 mt-1">{saveMsg}</p>}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};

export default ImportarVentas5Section;
