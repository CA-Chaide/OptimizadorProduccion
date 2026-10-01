/**
 * Reporte de PRODUCCIÓN DIARIA por centro (sectores 01+02+03).
 *
 * El motor IV5 planifica por SEMANA ISO, no por día calendario. Este módulo
 * deriva un valor por día así:
 *   - Producción de lunes a viernes: se reparte UNIFORME entre los días
 *     laborables (L-V) de esa semana → cada día L-V muestra el mismo promedio.
 *   - Producción del sábado: se muestra APARTE, en su fecha. Se estima como la
 *     porción de la semana que excede la capacidad de L-V (jornada normal +
 *     horas extra entre semana), acotada por la capacidad del sábado.
 *
 * El split L-V vs sábado se hace a nivel LÍNEA (no por material) porque la
 * capacidad es compartida por todos los materiales de una línea; hacerlo por
 * fila sobreestimaría la capacidad disponible de cada material.
 *
 * "Horas utilizadas" = minutos de trabajo consumidos (producción × tupp) / 60.
 */

import type { Iv5WeeklyRow } from './iv5Types';
import { IV5_SECTORES_TOPE_AGREGADO } from './iv5Constants';

const NOMBRE_DIA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const NOMBRE_MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export interface DiaProduccion {
  centro: string;
  fecha: string; // 'YYYY-MM-DD'
  dia: number; // día del mes (1-31)
  mes: number; // 1-12
  anio: number;
  mesNombre: string;
  diaSemana: string; // 'Lun'..'Sáb'
  esSabado: boolean;
  weekKey: string;
  isoWeek: number;
  /** Producción del día (uds). L-V = promedio de la semana; sábado = su porción. */
  produccion: number;
  /** Horas de trabajo consumidas por esa producción (min/60). */
  horas: number;
}

export interface CentroProduccionDiaria {
  centro: string;
  dias: DiaProduccion[];
}

/** ¿El sectorRef pertenece a los sectores 01/02/03 del reporte? */
function esSectorReporte(sectorRef: string): boolean {
  const s = (sectorRef || '').trim();
  return IV5_SECTORES_TOPE_AGREGADO.some((code) => s.startsWith(code));
}

/** ISO week/año de una fecha (mismo criterio que weeklyCalendar.getWeekSegments). */
function getISOWeekYear(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

/** Producción total de una fila (cubre motor original y rediseñado). */
function prodTotalFila(r: Iv5WeeklyRow): number {
  return (
    (r.produccionBase || 0) +
    (r.produccionAlternativa || 0) +
    (r.produccionAdelanto || 0) +
    (r.produccionPio || 0)
  );
}

interface AggSemanaCentro {
  centro: string;
  weekKey: string;
  mes: number;
  anio: number;
  isoWeek: number;
  isoYear: number;
  diasLaborales: number;
  tieneSabado: boolean;
  /** Acumuladores repartidos entre L-V y sábado. */
  udsLV: number;
  udsSab: number;
  minLV: number;
  minSab: number;
}

/**
 * Construye la producción diaria por centro a partir del ledger semanal.
 * Filtra sectores 01/02/03 y reparte cada semana a sus días reales.
 */
export function buildProduccionDiaria(rows: Iv5WeeklyRow[]): CentroProduccionDiaria[] {
  // 1) Split L-V vs sábado a nivel (centro, línea, semana).
  type LineaBucket = {
    centro: string;
    weekKey: string;
    mes: number;
    anio: number;
    isoWeek: number;
    isoYear: number;
    diasLaborales: number;
    tieneSabado: boolean;
    capWeekday: number; // capJN + capHE
    capSab: number;
    uds: number;
    min: number; // minutos de trabajo (prod × tupp)
  };
  const lineaBuckets = new Map<string, LineaBucket>();

  for (const r of rows) {
    if (!esSectorReporte(r.sectorRef)) continue;
    const uds = prodTotalFila(r);
    // También consideramos filas con producción 0 no aportan nada; las saltamos.
    if (uds <= 0) continue;
    const k = `${r.centro}|${r.linea}|${r.weekKey}`;
    let b = lineaBuckets.get(k);
    if (!b) {
      b = {
        centro: String(r.centro),
        weekKey: r.weekKey,
        mes: r.mes,
        anio: r.anio,
        isoWeek: r.isoWeek,
        isoYear: r.isoYear,
        diasLaborales: r.diasLV,
        tieneSabado: r.sabadoActivo,
        capWeekday: (r.capJN || 0) + (r.capHE || 0),
        capSab: r.capSab || 0,
        uds: 0,
        min: 0,
      };
      lineaBuckets.set(k, b);
    }
    b.uds += uds;
    b.min += uds * (r.tupp || 0);
    // El sábado activo/tope puede variar; conservamos si alguna fila lo marca.
    if (r.sabadoActivo) b.tieneSabado = true;
  }

  // 2) De cada línea, separa L-V vs sábado y agrega a (centro, semana).
  const semanaAgg = new Map<string, AggSemanaCentro>();
  for (const b of lineaBuckets.values()) {
    // Minutos que excedieron la capacidad L-V se atribuyen al sábado (hasta su tope).
    const excedente = Math.max(0, b.min - b.capWeekday);
    const minSab = Math.min(b.capSab, excedente);
    const minLV = b.min - minSab;
    const udsSab = b.min > 0 ? (b.uds * minSab) / b.min : 0;
    const udsLV = b.uds - udsSab;

    const k = `${b.centro}|${b.weekKey}`;
    let a = semanaAgg.get(k);
    if (!a) {
      a = {
        centro: b.centro,
        weekKey: b.weekKey,
        mes: b.mes,
        anio: b.anio,
        isoWeek: b.isoWeek,
        isoYear: b.isoYear,
        diasLaborales: b.diasLaborales,
        tieneSabado: b.tieneSabado,
        udsLV: 0,
        udsSab: 0,
        minLV: 0,
        minSab: 0,
      };
      semanaAgg.set(k, a);
    }
    a.udsLV += udsLV;
    a.udsSab += udsSab;
    a.minLV += minLV;
    a.minSab += minSab;
    if (b.tieneSabado) a.tieneSabado = true;
  }

  // 3) Expande cada (centro, semana) a sus fechas reales del mes.
  const porCentro = new Map<string, DiaProduccion[]>();
  for (const a of semanaAgg.values()) {
    const dias = porCentro.get(a.centro) ?? [];
    const diasEnMes = new Date(a.anio, a.mes, 0).getDate();
    const promLV = a.diasLaborales > 0 ? a.udsLV / a.diasLaborales : 0;
    const horasLVdia = a.diasLaborales > 0 ? a.minLV / a.diasLaborales / 60 : 0;

    for (let day = 1; day <= diasEnMes; day++) {
      const date = new Date(a.anio, a.mes - 1, day);
      const dow = date.getDay(); // 0=Dom..6=Sáb
      if (dow === 0) continue; // domingo no se trabaja
      const { week, year } = getISOWeekYear(date);
      if (week !== a.isoWeek || year !== a.isoYear) continue; // solo días de ESTA semana ISO

      if (dow >= 1 && dow <= 5) {
        // Día laborable L-V: promedio de la semana.
        dias.push(makeDia(a, day, dow, promLV, horasLVdia));
      } else if (dow === 6 && a.minSab > 0) {
        // Sábado trabajado: su porción propia.
        dias.push(makeDia(a, day, dow, a.udsSab, a.minSab / 60));
      }
    }
    porCentro.set(a.centro, dias);
  }

  // 4) Ordena por fecha dentro de cada centro y arma el resultado.
  const out: CentroProduccionDiaria[] = [];
  for (const [centro, dias] of porCentro.entries()) {
    dias.sort((x, y) => x.fecha.localeCompare(y.fecha));
    out.push({ centro, dias });
  }
  out.sort((x, y) => x.centro.localeCompare(y.centro));
  return out;
}

function makeDia(
  a: AggSemanaCentro,
  day: number,
  dow: number,
  produccion: number,
  horas: number,
): DiaProduccion {
  const mm = String(a.mes).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return {
    centro: a.centro,
    fecha: `${a.anio}-${mm}-${dd}`,
    dia: day,
    mes: a.mes,
    anio: a.anio,
    mesNombre: NOMBRE_MES_CORTO[a.mes - 1] ?? String(a.mes),
    diaSemana: NOMBRE_DIA[dow] ?? '',
    esSabado: dow === 6,
    weekKey: a.weekKey,
    isoWeek: a.isoWeek,
    produccion,
    horas,
  };
}
