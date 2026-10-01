/**
 * Verificacion del reporte 4b (balance mensual por centro).
 *
 * Replica el calculo del panel `Iv5StockEvolutionPanel` sobre escenarios con
 * traslados C1000->C2000 Y anticipaciones vivas (reservas) para comprobar:
 *   1. La identidad cierra en CADA mes:
 *      iniFisico + produccion + entrante - despachos - saliente = finFisico
 *   2. El stock encadena: finFisico(mes) == iniFisico(mes+1).
 *   3. El traslado saliente total de C1000 == entrante total de C2000.
 *
 * Usa los MISMOS constructores sinteticos que `reproAnticipacion.ts`.
 *
 * Correr con:  npx tsx src/app/dashboard/opciones/importar-ventasV5/fixtures/verifBalance4b.ts
 */

import { runIv5EngineRediseñado } from '../components/iv5EngineRediseñado';
import type { WeekSegment } from '../../plan-semanal/components/types';
import type { Iv5MonthlySnapshot } from '../components/iv5Types';

const MESES = [6, 7, 8, 9, 10, 11, 12];

function makeWeekSegments(weeksPerMonth = 1): WeekSegment[] {
  const segs: WeekSegment[] = [];
  let iso = 1;
  for (const m of MESES) {
    for (let w = 0; w < weeksPerMonth; w++) {
      segs.push({
        isoWeek: iso,
        isoYear: 2026,
        mes: m,
        anio: 2026,
        diasLaborales: Math.round(20 / weeksPerMonth),
        tieneSabado: false,
        label: `M${m}-S${w + 1}`,
        weekKey: `2026W${iso}|2026-${m}`,
        satKey: `2026W${iso}`,
      });
      iso++;
    }
  }
  return segs;
}

function makeTiemposCanonMultiLinea(capByLineMonth: Record<string, Record<number, number>>): any[] {
  const lineas = Object.keys(capByLineMonth);
  return MESES.map((m) => ({
    mesNumero: m,
    mes: m,
    data: lineas.map((l) => ({
      nombre_linea: l,
      minutos_horario_normal_TOTAL: capByLineMonth[l][m] ?? 0,
    })),
  }));
}

function makeRows(o: {
  cod: string;
  centro: string;
  linea: string;
  demandByMonth: Record<number, number>;
  stockInicial: number;
  stockSeguridad: number;
  clase?: string;
  sector?: string;
}): any[] {
  return MESES.map((m) => ({
    CodMaterial: o.cod,
    Mes: m,
    ['Año']: 2026,
    Centro: o.centro,
    LineaFabricacion: o.linea,
    Sector: o.sector ?? '01 COLCHONES',
    NombreMaterial: `Material ${o.cod}`,
    NumeroPuestos: 1,
    TiempoPorUnidad: 1,
    UnidadesProyectado: o.demandByMonth[m] ?? 0,
    StockActual: o.stockInicial,
    StockSeguridad: o.stockSeguridad,
    ClaseAprovisionam: o.clase ?? 'X',
  }));
}

/**
 * Mismo agregado que el panel 4b. `sectores` = filtro (undefined = todos),
 * igual que el MultiSelect de sectores del panel.
 */
function balancePorMes(monthly: Iv5MonthlySnapshot[], sectores?: string[]) {
  const sel = sectores ? new Set(sectores) : null;
  const m = new Map<number, any>();
  for (const r of monthly) {
    if (sel && !sel.has(String(r.sectorRef ?? '').trim())) continue;
    const k = r.anio * 12 + r.mes;
    let b = m.get(k);
    if (!b) {
      b = { mes: r.mes, ini: 0, prod: 0, ent: 0, sal: 0, desp: 0, fin: 0 };
      m.set(k, b);
    }
    b.ini += Number(r.stockInicialFisicoMes ?? r.stockInicialMes) || 0;
    b.prod +=
      (r.produccionBase || 0) +
      (r.produccionAlternativa || 0) +
      (r.produccionAdelanto || 0) +
      (r.produccionPio || 0);
    b.ent += r.trasladoEntrante || 0;
    b.sal += r.trasladoSaliente || 0;
    b.desp += r.despachosVentas || 0;
    b.fin += Number(r.stockFinalFisicoMes ?? r.stockFinalMes) || 0;
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => v);
}

function reportar(
  titulo: string,
  monthly: Iv5MonthlySnapshot[],
  colTraslado: 'ent' | 'sal',
  sectores?: string[],
): number {
  const filas = balancePorMes(monthly, sectores);
  console.log(`\n  ${titulo}`);
  console.log(
    '  Mes | StockIniFis | ProduccionTot | ' +
      (colTraslado === 'sal' ? 'TrasladoSal' : 'TrasladoEnt') +
      ' | Despachos | StockFinFis | descuadre | encadena',
  );
  let peorDesc = 0;
  let peorEnc = 0;
  filas.forEach((f, i) => {
    const desc = Math.round(f.ini + f.prod + f.ent - f.desp - f.sal - f.fin);
    const enc = i === 0 ? 0 : Math.round(filas[i - 1].fin - f.ini);
    peorDesc = Math.max(peorDesc, Math.abs(desc));
    peorEnc = Math.max(peorEnc, Math.abs(enc));
    console.log(
      `   ${String(f.mes).padStart(2)} | ${String(Math.round(f.ini)).padStart(11)} | ` +
        `${String(Math.round(f.prod)).padStart(13)} | ` +
        `${String(Math.round(colTraslado === 'sal' ? f.sal : f.ent)).padStart(11)} | ` +
        `${String(Math.round(f.desp)).padStart(9)} | ${String(Math.round(f.fin)).padStart(11)} | ` +
        `${String(desc).padStart(9)} | ${String(enc).padStart(8)}`,
    );
  });
  console.log(`   >> descuadre max = ${peorDesc}  ${peorDesc === 0 ? '✓ OK' : '✗ FALLA'}`);
  console.log(`   >> ruptura de encadenamiento max = ${peorEnc}  ${peorEnc === 0 ? '✓ OK' : '✗ FALLA'}`);
  return peorDesc + peorEnc;
}

// ---------------------------------------------------------------------------
// Escenario (= esc2 del repro): C2000 saturado todo el año => depende de los
// traslados de C1000; C1000 con ocioso temprano => genera anticipaciones vivas
// (reservas) que cruzan de mes. Es el caso que rompe la identidad si el stock
// inicial fisico del mes ignora las reservas.
// ---------------------------------------------------------------------------
const weekSegments = makeWeekSegments(4);
const tiemposCanon = makeTiemposCanonMultiLinea({
  'LINEA 1': { 6: 120, 7: 120, 8: 120, 9: 120, 10: 120, 11: 120, 12: 120 },
  'LINEA 2': { 6: 50, 7: 50, 8: 50, 9: 50, 10: 50, 11: 50, 12: 50 },
});
const rowsC1000 = makeRows({
  cod: 'M1', centro: '1000', linea: 'LINEA 1',
  demandByMonth: { 6: 40, 7: 40, 8: 40, 9: 45, 10: 50, 11: 70, 12: 90 },
  stockInicial: 100, stockSeguridad: 100, clase: 'X',
});
const rowsC2000 = makeRows({
  cod: 'M1', centro: '2000', linea: 'LINEA 2',
  demandByMonth: { 6: 50, 7: 50, 8: 50, 9: 50, 10: 50, 11: 80, 12: 100 },
  stockInicial: 100, stockSeguridad: 100, clase: 'X',
});
// Segundo material en OTRO sector, para probar el filtro de sectores del panel.
const rowsC1000Sec02 = makeRows({
  cod: 'M2', centro: '1000', linea: 'LINEA 1',
  demandByMonth: { 6: 10, 7: 10, 8: 10, 9: 10, 10: 10, 11: 10, 12: 10 },
  stockInicial: 50, stockSeguridad: 20, clase: 'X', sector: '02 BASES-CABECEROS-CAMA',
});

const r = runIv5EngineRediseñado({
  weekSegments,
  effectiveData: [...rowsC1000, ...rowsC2000, ...rowsC1000Sec02],
  tiemposCanon: tiemposCanon as any,
  activeSatKeysC1000: new Set<string>(),
  activeSatKeysC2000: new Set<string>(),
  horasTrabajo: 8,
  maxExtrasHoras: 0,
  horasExtrasFin: 0,
  pioMap: new Map() as any,
  stockCap: { centro1000: 9_999_999, centro2000: 9_999_999, sectoresAplicables: ['01 COLCHONES'] },
  maxSabadosMes: 0,
  wantC1000: true,
  wantC2000: true,
});

console.log('═'.repeat(100));
console.log('  VERIFICACION REPORTE 4b — Balance mensual por centro (con reservas de anticipacion)');
console.log('═'.repeat(100));

const SEC01 = '01 COLCHONES';
const SEC02 = '02 BASES-CABECEROS-CAMA';
const TODOS = [SEC01, SEC02];

let fallas = 0;

console.log('\n\n--- (1) SIN filtro de sector (todos) ---');
if (r.resultC1000) fallas += reportar('CENTRO 1000 (traslado SALIENTE)', r.resultC1000.monthly, 'sal', TODOS);
if (r.resultC2000) fallas += reportar('CENTRO 2000 (traslado ENTRANTE)', r.resultC2000.monthly, 'ent', TODOS);

console.log('\n\n--- (2) Filtrado a SECTOR 01 (el default del panel incluye 01+02+03) ---');
if (r.resultC1000) fallas += reportar('CENTRO 1000 solo sector 01', r.resultC1000.monthly, 'sal', [SEC01]);

console.log('\n\n--- (3) Filtrado a SECTOR 02 ---');
if (r.resultC1000) fallas += reportar('CENTRO 1000 solo sector 02', r.resultC1000.monthly, 'sal', [SEC02]);

// Aditividad: la suma de los sectores por separado debe dar el total sin filtro.
const sumaCol = (rows: any[], col: string) => rows.reduce((s, f) => s + f[col], 0);
const m1000 = r.resultC1000?.monthly ?? [];
for (const col of ['ini', 'prod', 'sal', 'desp', 'fin']) {
  const total = sumaCol(balancePorMes(m1000, TODOS), col);
  const partes = sumaCol(balancePorMes(m1000, [SEC01]), col) + sumaCol(balancePorMes(m1000, [SEC02]), col);
  const ok = Math.round(total) === Math.round(partes);
  console.log(
    `  aditividad C1000 [${col}]: total=${Math.round(total)} vs 01+02=${Math.round(partes)} ${ok ? '✓' : '✗ FALLA'}`,
  );
  if (!ok) fallas += 1;
}

const salC1000 = sumaCol(balancePorMes(m1000, TODOS), 'sal');
const entC2000 = sumaCol(balancePorMes(r.resultC2000?.monthly ?? [], TODOS), 'ent');
const trasladoOk = Math.round(salC1000) === Math.round(entC2000);
console.log(
  `\n  Traslado total C1000 saliente = ${Math.round(salC1000)} | C2000 entrante = ${Math.round(entC2000)} ` +
    `${trasladoOk ? '✓ OK' : '✗ FALLA'}`,
);
if (!trasladoOk) fallas += 1;

console.log(`\n  RESULTADO: ${fallas === 0 ? '✓ TODO OK' : `✗ ${fallas} problema(s)`}\n`);
