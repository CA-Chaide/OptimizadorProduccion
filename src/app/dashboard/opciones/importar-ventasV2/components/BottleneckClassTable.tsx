'use client';

import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, exportToXLSX } from './utils';
import { TiempoCanonResult, TransferNeed, ViableTransfer, BottleneckClassTableProps } from './types';

// Componente de fila memoizado para mejorar el rendimiento del scroll
const DataRow = memo(({ row, idx, linea, isCentro1000 }: { row: any, idx: number, linea: string, isCentro1000: boolean }) => {
  return (
    <tr key={`${linea}-${idx}`} className="hover:bg-gray-50 transition-colors">
      <td className="px-2 py-2 text-sm font-medium text-gray-600">{String(row.ClaseAprovisionam || '-').trim().toUpperCase()}</td>
      <td className="px-2 py-2 text-sm font-medium text-gray-900">{row.CodMaterial ?? '-'}</td>
      <td className="px-2 py-2 text-sm text-gray-600 max-w-40 truncate" title={row.Descripcion ?? ''}>{row.Descripcion ?? '-'}</td>
      <td className="px-2 py-2 text-sm text-gray-600">{row.CentroFabricacion || row.Centro || '-'}</td>
      <td className="px-2 py-2 text-sm text-gray-600">{row.LineaFabricacion ?? '-'}</td>
      <td className="px-2 py-2 text-sm text-gray-600">{row.PuestoCuellodeBottella ?? '-'}</td>
      <td className="px-2 py-2 text-sm text-right font-mono text-gray-600">{row.NumeroPuestos ?? row.numero_puestos ?? '-'}</td>
      <td className="px-2 py-2 text-sm text-gray-600">{row.Sector ?? '-'}</td>
      <td className="px-2 py-2 text-sm text-gray-600">{row.NombRespControlProd ?? row.RespCtrlProd ?? '-'}</td>
      <td className="px-2 py-2 text-sm text-right font-mono text-indigo-600 font-semibold">
        {row.tiempoUnitarioPorPuesto != null ? Number(row.tiempoUnitarioPorPuesto).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '-'}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-teal-700 font-semibold">
        {row._traslado.toLocaleString()}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-gray-700 border-r-2 border-gray-200">
        {row._necPropia.toLocaleString()}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-blue-700">{Math.floor(row._necesidad).toLocaleString()}</td>
      <td className="px-2 py-2 text-sm text-right font-mono text-blue-600">
        {row.tiempoTotalNecesidad != null ? Number(row.tiempoTotalNecesidad).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-blue-600">
        {Number(row.participacionIndividual ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-blue-600">
        {row.minutosDisponiblesJornadaNormal != null ? Number(row.minutosDisponiblesJornadaNormal).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'} min
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-blue-800 font-semibold border-r-2 border-blue-200">
        {row.necesidadMaximaProducirJornadaNormal != null ? Number(row.necesidadMaximaProducirJornadaNormal).toLocaleString() : '-'}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-green-700">
        {row.deficitJornadaNormal != null ? Number(row.deficitJornadaNormal).toLocaleString() : '-'}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-green-600">
        {row.tiempoTotalNecesidadDeficitJN != null ? Number(row.tiempoTotalNecesidadDeficitJN).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-green-600">
        {Number(row.participacionDeficitJN ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-green-600">
        {row.minutosDisponiblesHorasExtras != null ? Number(row.minutosDisponiblesHorasExtras).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'} min
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-green-800 font-semibold border-r-2 border-green-300">
        {row.necesidadMaximaProducirHorasExtras != null ? Number(row.necesidadMaximaProducirHorasExtras).toLocaleString() : '-'}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-orange-700">
        {row.deficitHorasExtras != null ? Number(row.deficitHorasExtras).toLocaleString() : '-'}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-orange-600">
        {row.tiempoTotalNecesidadDeficitHE != null ? Number(row.tiempoTotalNecesidadDeficitHE).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-orange-600">
        {Number(row.participacionDeficitHE ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-orange-600">
        {row.minutosDisponiblesSabados != null ? Number(row.minutosDisponiblesSabados).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'} min
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-orange-800 font-semibold border-r-2 border-orange-300">
        {row.necesidadMaximaProducirSabados != null ? Number(row.necesidadMaximaProducirSabados).toLocaleString() : '-'}
      </td>
      <td className="px-2 py-2 text-sm text-right font-mono text-purple-700 font-semibold">
        {row._prodViable.toLocaleString()}
      </td>
      {isCentro1000 ? (
        <>
          <td className="px-2 py-2 text-sm text-right font-mono text-teal-700 font-semibold">
            {row._envioC2000.toLocaleString()}
          </td>
          <td className="px-2 py-2 text-sm text-right font-mono text-cyan-700 font-semibold">
            {row._quedaC1000.toLocaleString()}
          </td>
          <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${row._deficitGeneral > 0 ? 'text-red-700' : 'text-green-700'}`}>
            {row._deficitGeneral.toLocaleString()}
          </td>
        </>
      ) : (
        <>
          <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${row._deficitGeneral > 0 ? 'text-red-700' : 'text-green-700'}`}>
            {row._deficitGeneral.toLocaleString()}
          </td>
          <td className="px-2 py-2 text-sm text-right font-mono text-teal-700 font-semibold">
            {row._trasladosViablesARecibir.toLocaleString()}
          </td>
          <td className={`px-2 py-2 text-sm text-right font-mono font-semibold ${row._deficitNeto2000 > 0 ? 'text-red-700' : 'text-green-700'}`}>
            {row._deficitNeto2000.toLocaleString()}
          </td>
        </>
      )}
    </tr>
  );
});
DataRow.displayName = 'DataRow';

// Helpers para computar extras en memoria (sin localStorage)
function computarDetalleConsumoInMemoria(tc: TiempoCanonResult, minutosConsumir: number, maxExtrasHoras: number, horasExtrasFin: number): string {
  const semanasNorm = Math.floor((tc.diasLaborables ?? 0) / 5);
  const diasExtra = (tc.diasLaborables ?? 0) % 5;
  const diasSabados = tc.diasSabados ?? 0;
  let restantes = minutosConsumir;
  const partes: string[] = [];
  for (let i = 0; i < semanasNorm && restantes > 0; i++) {
    const minmax = 5 * maxExtrasHoras * 60;
    const minc = Math.min(minmax, restantes);
    if (minc > 0) { partes.push(`S${i+1}: ${(minc/60 % 1 === 0 ? minc/60 : (minc/60).toFixed(1))}h`); restantes -= minc; }
  }
  if (diasExtra > 0 && restantes > 0) {
    const minmax = diasExtra * maxExtrasHoras * 60;
    const minc = Math.min(minmax, restantes);
    if (minc > 0) { partes.push(`ExLV: ${(minc/60 % 1 === 0 ? minc/60 : (minc/60).toFixed(1))}h`); restantes -= minc; }
  }
  for (let i = 0; i < diasSabados && restantes > 0; i++) {
    const minmax = horasExtrasFin * 60;
    const minc = Math.min(minmax, restantes);
    if (minc > 0) { partes.push(`Sáb${i+1}: ${(minc/60 % 1 === 0 ? minc/60 : (minc/60).toFixed(1))}h`); restantes -= minc; }
  }
  return partes.join(', ') || '-';
}

const EMPTY_TRANSFERS: TransferNeed[] = [];
const EMPTY_VIABLE_TRANSFERS: ViableTransfer[] = [];
const EMPTY_CONSUMED: { [mesLinea: string]: number } = {};

export const BottleneckClassTable: React.FC<BottleneckClassTableProps> = ({ 
  datos, 
  datosCompletos, 
  titulo, 
  tiemposCanon, 
  tiempoConsumidoAnterior = EMPTY_CONSUMED,
  onTransferNeedsCalculated,
  onExportSheetReady,
  onComputedDataReady,
  forzarTrasladoTotal = false,
  maxExtrasHoras = 2,
  horasExtrasFin = 2,
  trasladosDesdeCentro2000 = EMPTY_TRANSFERS,
  isCentro1000 = false,
  trasladosViables = EMPTY_VIABLE_TRANSFERS
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLinea, setSelectedLinea] = useState<string>('');
  const [selectedRespCtrlProd, setSelectedRespCtrlProd] = useState<string[]>([]);
  const [respDropdownOpen, setRespDropdownOpen] = useState<boolean>(false);
  const respDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedSector, setSelectedSector] = useState<string[]>([]);
  const [sectorDropdownOpen, setSectorDropdownOpen] = useState<boolean>(false);
  const sectorDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedClaseAprov, setSelectedClaseAprov] = useState<string[]>([]);
  const [claseDropdownOpen, setClaseDropdownOpen] = useState<boolean>(false);
  const claseDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (respDropdownRef.current && !respDropdownRef.current.contains(e.target as Node)) {
        setRespDropdownOpen(false);
      }
      if (sectorDropdownRef.current && !sectorDropdownRef.current.contains(e.target as Node)) {
        setSectorDropdownOpen(false);
      }
      if (claseDropdownRef.current && !claseDropdownRef.current.contains(e.target as Node)) {
        setClaseDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const trasladosMap = useMemo(() => {
    const map = new Map<string, number>();
    trasladosDesdeCentro2000.forEach(item => {
      map.set(item.CodMaterial, (map.get(item.CodMaterial) || 0) + item.necesidadTraslado);
    });
    return map;
  }, [trasladosDesdeCentro2000]);

  const viableTransfersMap = useMemo(() => {
    const map = new Map<string, number>();
    trasladosViables.forEach(item => {
      const key = `${item.CodMaterial}|${item.mes}`;
      map.set(key, (map.get(key) || 0) + item.cantidad);
    });
    return map;
  }, [trasladosViables]);

  const computeNecesidadesLocal = (row: any) => {
    const unidadesProy = safeNumber(row.UnidadesProyectado ?? 0);
    const stockSeg = safeNumber(row.StockSeguridad ?? 0);
    const stockAct = safeNumber(row.StockActual ?? 0);
    const necesidadPropia = Math.max(0, unidadesProy - stockAct + stockSeg);
    const traslado = trasladosMap.get(String(row.CodMaterial ?? '')) || 0;
    return necesidadPropia + traslado;
  };

  const buscarTiempoCanonPorMes = (mesRaw: string) => {
    let found = tiemposCanon.find(t => t.mes === mesRaw);
    if (found) return found;
    const mesNum = parseInt(mesRaw);
    if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
      const mesNombre = MONTH_NAMES[mesNum];
      found = tiemposCanon.find(t => t.mes === mesNombre);
      if (found) return found;
      found = tiemposCanon.find(t => t.mesNumero === mesNum);
      if (found) return found;
    }
    return null;
  };

  const mapaAgrupamiento = useMemo(() => {
    const mapa: { [mesLinea: string]: { necesidades: number; count: number; mes: string; linea: string } } = {};
    datos.forEach(row => {
      const mes = String(row.Mes ?? 'Sin mes');
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${mes}|${linea}`;
      if (!mapa[key]) {
        mapa[key] = { necesidades: 0, count: 0, mes, linea };
      }
      const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const seProduceAqui = isCentro1000 || !esClaseF;
      if (seProduceAqui) {
        mapa[key].necesidades += computeNecesidadesLocal(row);
      }
      mapa[key].count += 1;
    });
    return mapa;
  }, [datos, trasladosMap, isCentro1000]);

  const normalizarLinea = (linea: string): string => {
    return String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
  };

  const obtenerTiempoDisponible = (mes: string, linea: string, puestoTrabajo: string | null, centro: string = '') => {
    const tiempoCanon = buscarTiempoCanonPorMes(mes);
    if (!tiempoCanon || !tiempoCanon.data || !Array.isArray(tiempoCanon.data)) return null;
    const lineaNorm = normalizarLinea(linea);
    const centroCodigo = String(centro).trim();
    let registrosLinea = tiempoCanon.data.filter((item: any) => {
      const nl = normalizarLinea(item?.nombre_linea ?? '');
      const itemCentro = String(item?.centro ?? item?.Centro ?? '');
      return (nl === lineaNorm || nl.includes(lineaNorm) || lineaNorm.includes(nl)) && (centroCodigo === '' || itemCentro === centroCodigo);
    });
    if (registrosLinea.length === 0 && centroCodigo !== '') {
      registrosLinea = tiempoCanon.data.filter((item: any) => {
        const nl = normalizarLinea(item?.nombre_linea ?? '');
        return nl === lineaNorm || nl.includes(lineaNorm) || lineaNorm.includes(nl);
      });
    }
    if (registrosLinea.length === 0) {
      if (puestoTrabajo && puestoTrabajo !== '-' && puestoTrabajo !== '') {
        const pn = String(puestoTrabajo).toLowerCase().trim();
        const dp = tiempoCanon.data.find((item: any) => {
          const ne = String(item?.nombre_estacion ?? '').toLowerCase().trim();
          return ne.includes(pn) || pn.includes(ne);
        });
        if (dp) return {
          minutos_horario_normal: safeNumber(dp?.minutos_horario_normal_TOTAL ?? 0),
          diasLaborables: tiempoCanon.diasLaborables,
          diasSabados: tiempoCanon.diasSabados
        };
      }
      return null;
    }
    let pBotella: any = null;
    if (puestoTrabajo && puestoTrabajo !== '-' && puestoTrabajo !== '') {
      const pn = String(puestoTrabajo).toLowerCase().trim();
      pBotella = registrosLinea.find((d: any) => {
        const ne = String(d?.nombre_estacion ?? '').toLowerCase().trim();
        return ne === pn || ne.includes(pn) || pn.includes(ne);
      });
    }
    if (!pBotella) {
      let maxF = 0;
      const freq = new Map();
      registrosLinea.forEach((d: any) => {
        const ne = String(d?.nombre_estacion ?? '-');
        freq.set(ne, (freq.get(ne) || 0) + 1);
        if (freq.get(ne) > maxF) { maxF = freq.get(ne); pBotella = d; }
      });
    }
    return pBotella ? {
      minutos_horario_normal: safeNumber(pBotella?.minutos_horario_normal_TOTAL ?? 0),
      diasLaborables: tiempoCanon.diasLaborables,
      diasSabados: tiempoCanon.diasSabados
    } : null;
  };

  const sumaTiempoNecPorLinea: { [k: string]: number } = {};
  const tiempoDispGlobalPorLinea: { [k: string]: number } = {};
  const poolMinutosHEPorLinea: { [k: string]: number } = {};
  const poolMinutosSabadosPorLinea: { [k: string]: number } = {};

  datos.forEach(row => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const key = `${mes}|${linea}`;
    const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
    const seProduceAqui = isCentro1000 || !esClaseF;
    if (seProduceAqui) {
      const tupp = safeNumber(row.TiempoPorUnidad ?? 0) / Math.max(1, safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1));
      sumaTiempoNecPorLinea[key] = (sumaTiempoNecPorLinea[key] || 0) + (tupp * computeNecesidadesLocal(row));
    }
    if (tiempoDispGlobalPorLinea[key] === undefined) {
      const td = obtenerTiempoDisponible(mes, linea, row.PuestoCuellodeBottella, row.Centro);
      const cp = tiempoConsumidoAnterior[key] || 0;
      tiempoDispGlobalPorLinea[key] = Math.max(0, (td?.minutos_horario_normal ?? 0) - cp);
      poolMinutosHEPorLinea[key] = (td?.diasLaborables ?? 0) * maxExtrasHoras * 60;
      poolMinutosSabadosPorLinea[key] = (td?.diasSabados ?? 0) * horasExtrasFin * 60;
    }
  });

  const enriquecerFila = (row: any) => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const key = `${mes}|${linea}`;
    const esClaseF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
    const seProduceAqui = isCentro1000 || !esClaseF;
    const necesidad = computeNecesidadesLocal(row);
    const tupp = safeNumber(row.TiempoPorUnidad ?? 0) / Math.max(1, safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1));
    
    let partInd = 0;
    if (seProduceAqui) {
      const sumLinea = mapaAgrupamiento[key]?.necesidades ?? necesidad;
      partInd = sumLinea > 0 ? (necesidad / sumLinea) * 100 : 0;
    }
    
    let maxJN = 0;
    if (!forzarTrasladoTotal && seProduceAqui) {
      const dispJN = tiempoDispGlobalPorLinea[key] || 0;
      const totalNecLinea = sumaTiempoNecPorLinea[key] || 0;
      if (totalNecLinea <= dispJN) {
        maxJN = necesidad;
      } else {
        const tParaMat = (partInd / 100) * dispJN;
        maxJN = tupp > 0 ? Math.floor(tParaMat / tupp) : 0;
      }
    }
    
    const defJN = Math.max(0, necesidad - maxJN);
    const tDefJN = seProduceAqui ? defJN * tupp : 0;
    const trViables = !isCentro1000 ? (viableTransfersMap.get(`${row.CodMaterial}|${mes}`) || 0) : 0;

    return {
      ...row, _necesidad: necesidad, participacionIndividual: partInd, tiempoUnitarioPorPuesto: tupp,
      tiempoTotalNecesidad: seProduceAqui ? tupp * necesidad : 0, minutosDisponiblesJornadaNormal: (partInd / 100) * (tiempoDispGlobalPorLinea[key] || 0),
      necesidadMaximaProducirJornadaNormal: maxJN, deficitJornadaNormal: defJN, tiempoTotalNecesidadDeficitJN: tDefJN,
      _trasladosViablesARecibir: trViables, mesRef: mes, lineaRef: linea
    };
  };

  const datosEnriquecidosBase = useMemo(() => {
    const enriquecidos = datos.map(enriquecerFila);
    const sumDefJN = {};
    const sumTDefJN = {};
    enriquecidos.forEach(r => {
      const k = `${r.mesRef}|${r.lineaRef}`;
      if (isCentro1000 || String(r.ClaseAprovisionam || '').trim().toUpperCase() !== 'F') {
        sumDefJN[k] = (sumDefJN[k] || 0) + r.deficitJornadaNormal;
        sumTDefJN[k] = (sumTDefJN[k] || 0) + r.tiempoTotalNecesidadDeficitJN;
      }
    });
    
    const conHE = enriquecidos.map(r => {
      const k = `${r.mesRef}|${r.lineaRef}`;
      const esF = String(r.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const prodAqui = isCentro1000 || !esF;
      const partDef = (prodAqui && sumDefJN[k] > 0) ? (r.deficitJornadaNormal / sumDefJN[k]) * 100 : 0;
      const poolHE = poolMinutosHEPorLinea[k] || 0;
      let maxHE = 0;
      if (prodAqui) {
        if (sumTDefJN[k] <= poolHE && sumTDefJN[k] > 0) maxHE = r.deficitJornadaNormal;
        else if (sumTDefJN[k] > poolHE) maxHE = r.tiempoUnitarioPorPuesto > 0 ? Math.floor(((partDef / 100) * poolHE) / r.tiempoUnitarioPorPuesto) : 0;
      }
      const defHE = Math.max(0, r.deficitJornadaNormal - maxHE);
      return { ...r, participacionDeficitJN: partDef, necesidadMaximaProducirHorasExtras: maxHE, deficitHorasExtras: defHE, tiempoTotalNecesidadDeficitHE: prodAqui ? defHE * r.tiempoUnitarioPorPuesto : 0 };
    });
    
    const sumDefHE = {};
    const sumTDefHE = {};
    conHE.forEach(r => {
      const k = `${r.mesRef}|${r.lineaRef}`;
      if (isCentro1000 || String(r.ClaseAprovisionam || '').trim().toUpperCase() !== 'F') {
        sumDefHE[k] = (sumDefHE[k] || 0) + r.deficitHorasExtras;
        sumTDefHE[k] = (sumTDefHE[k] || 0) + r.tiempoTotalNecesidadDeficitHE;
      }
    });
    
    return conHE.map(r => {
      const k = `${r.mesRef}|${r.lineaRef}`;
      const prodAqui = isCentro1000 || String(r.ClaseAprovisionam || '').trim().toUpperCase() !== 'F';
      const partHE = (prodAqui && sumDefHE[k] > 0) ? (r.deficitHorasExtras / sumDefHE[k]) * 100 : 0;
      const poolSab = poolMinutosSabadosPorLinea[k] || 0;
      let maxSab = 0;
      if (prodAqui) {
        if (sumTDefHE[k] <= poolSab && sumTDefHE[k] > 0) maxSab = r.deficitHorasExtras;
        else if (sumTDefHE[k] > poolSab) maxSab = r.tiempoUnitarioPorPuesto > 0 ? Math.floor(((partHE / 100) * poolSab) / r.tiempoUnitarioPorPuesto) : 0;
      }
      return { ...r, participacionDeficitHE: partHE, necesidadMaximaProducirSabados: maxSab, _prodViable: r.necesidadMaximaProducirJornadaNormal + r.necesidadMaximaProducirHorasExtras + maxSab };
    });
  }, [datos, trasladosMap, isCentro1000, viableTransfersMap]);

  const filasCalculadas = useMemo(() =>
    datosEnriquecidosBase.map((row: any) => {
      const _traslado = trasladosMap.get(String(row.CodMaterial ?? '')) || 0;
      const _necPropia = Math.max(0, safeNumber(row.UnidadesProyectado??0) - safeNumber(row.StockActual??0) + safeNumber(row.StockSeguridad??0));
      const _necesidad = _necPropia + _traslado;
      const _prodViable = row._prodViable;
      const _deficitGeneral = Math.max(0, _necesidad - _prodViable);
      const _ratioTraslado = _necesidad > 0 ? _traslado / _necesidad : 0;
      const _ratioPropia = _necesidad > 0 ? _necPropia / _necesidad : 0;
      return { ...row, _traslado, _necPropia, _necesidad, _prodViable, _deficitGeneral,
               _envioC2000: Math.round(_prodViable * _ratioTraslado),
               _quedaC1000: Math.round(_prodViable * _ratioPropia),
               _deficitNeto2000: Math.max(0, _deficitGeneral - row._trasladosViablesARecibir) };
    })
  , [datosEnriquecidosBase, trasladosMap]);

  // Sincronización optimizada con el padre usando refs para evitar loops
  const lastSyncRef = useRef<string>('');
  useEffect(() => {
    if (!onComputedDataReady || filasCalculadas.length === 0) return;
    const json = JSON.stringify(filasCalculadas.map(r => ({ id: r.id, v: r._prodViable, d: r._deficitGeneral })));
    if (json === lastSyncRef.current) return;
    lastSyncRef.current = json;
    onComputedDataReady(filasCalculadas);
  }, [filasCalculadas, onComputedDataReady]);

  const lastExportReadyRef = useRef<string>('');
  useEffect(() => {
    if (!onExportSheetReady) return;
    const json = JSON.stringify(filasCalculadas.length);
    if (json === lastExportReadyRef.current) return;
    lastExportReadyRef.current = json;
    onExportSheetReady(filasCalculadas);
  }, [filasCalculadas, onExportSheetReady]);

  const lineasUnicas = useMemo(() => Array.from(new Set(filasCalculadas.map(r => String(r.lineaRef || 'Sin línea').trim()))).sort(), [filasCalculadas]);
  const sectoresUnicos = useMemo(() => Array.from(new Set(filasCalculadas.map(r => String(r.Sector || '').trim()))).sort(), [filasCalculadas]);
  const respCtrlProdUnicos = useMemo(() => Array.from(new Set(filasCalculadas.map(r => String(r.NombRespControlProd || r.RespCtrlProd || '').trim()))).sort(), [filasCalculadas]);
  const clasesUnicas = useMemo(() => Array.from(new Set(filasCalculadas.map(r => String(r.ClaseAprovisionam || '').trim().toUpperCase()))).filter(Boolean).sort(), [filasCalculadas]);

  const datosFiltrados = useMemo(() =>
    filasCalculadas.filter((row: any) => {
      const matchSearch = !searchTerm || String(row.CodMaterial || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchLinea = !selectedLinea || String(row.lineaRef || '').trim() === selectedLinea.trim();
      const respRow = String(row.NombRespControlProd || row.RespCtrlProd || '').trim();
      const matchResp = selectedRespCtrlProd.length === 0 || selectedRespCtrlProd.includes(respRow);
      const sectorRow = String(row.Sector || '').trim();
      const matchSector = selectedSector.length === 0 || selectedSector.includes(sectorRow);
      const claseRow = String(row.ClaseAprovisionam || '').trim().toUpperCase();
      const matchClase = selectedClaseAprov.length === 0 || selectedClaseAprov.includes(claseRow);
      return matchSearch && matchLinea && matchResp && matchSector && matchClase;
    })
  , [filasCalculadas, searchTerm, selectedLinea, selectedRespCtrlProd, selectedSector, selectedClaseAprov]);

  const datosAgrupados = useMemo(() =>
    datosFiltrados.reduce((acc: any, row: any) => {
      const l = row.lineaRef || 'Sin línea';
      if (!acc[l]) acc[l] = [];
      acc[l].push(row);
      return acc;
    }, {}), [datosFiltrados]);

  const lineasOrdenadas = useMemo(() => Object.keys(datosAgrupados).sort(), [datosAgrupados]);

  return (
    <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{titulo}</h3>
          <p className="text-sm text-gray-500 mt-1">{datosFiltrados.length} registros encontrados</p>
        </div>
        <button onClick={() => exportToXLSX(filasCalculadas, `Detalle_${titulo.replace(/\s+/g, '_')}`)} className="inline-flex items-center px-3 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors">
          <Download className="w-4 h-4 mr-2" /> Descargar CSV
        </button>
      </div>

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex gap-4 flex-wrap items-center">
        <select value={selectedLinea} onChange={e => setSelectedLinea(e.target.value)} className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500">
          <option value="">Todas las líneas</option>
          {lineasUnicas.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        {/* Filtros simplificados para mejorar performance de renderizado */}
        <input type="search" placeholder="Buscar CodMaterial..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 w-48" />
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
            <tr className="border-b border-gray-300">
              <th colSpan={12} className="px-3 py-2 text-center font-bold text-gray-700 uppercase bg-gray-100 border-r-2 border-gray-300">Información General</th>
              <th colSpan={5} className="px-3 py-2 text-center font-bold text-blue-700 uppercase bg-blue-50 border-r-2 border-blue-300">Sección Jornada Normal</th>
              <th colSpan={5} className="px-3 py-2 text-center font-bold text-green-700 uppercase bg-green-50 border-r-2 border-green-300">Sección Horas Extras (L-V)</th>
              <th colSpan={5} className="px-3 py-2 text-center font-bold text-orange-700 uppercase bg-orange-50 border-r-2 border-orange-300">Sección Sábados</th>
              <th colSpan={isCentro1000 ? 3 : 3} className="px-3 py-2 text-center font-bold text-purple-700 uppercase bg-purple-50">Resultados Consolidados</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-2 py-2 text-left uppercase">Clase</th>
              <th className="px-2 py-2 text-left uppercase">CodMaterial</th>
              <th className="px-2 py-2 text-left uppercase">Descripción</th>
              <th className="px-2 py-2 text-left uppercase">Centro</th>
              <th className="px-2 py-2 text-left uppercase">Línea</th>
              <th className="px-2 py-2 text-left uppercase">Puesto</th>
              <th className="px-2 py-2 text-right uppercase">N.Puestos</th>
              <th className="px-2 py-2 text-left uppercase">Sector</th>
              <th className="px-2 py-2 text-left uppercase">Responsable</th>
              <th className="px-2 py-2 text-right text-indigo-600 uppercase">T.Unit/Puestos</th>
              <th className="px-2 py-2 text-right text-teal-600 uppercase">Traslado C.2000</th>
              <th className="px-2 py-2 text-right uppercase border-r-2 border-gray-300">Nec. Propia</th>
              <th className="px-2 py-2 text-right text-blue-600 uppercase">Necesidad</th>
              <th className="px-2 py-2 text-right text-blue-600 uppercase">T.Total Nec.</th>
              <th className="px-2 py-2 text-right text-blue-600 uppercase">Partic.%</th>
              <th className="px-2 py-2 text-right text-blue-600 uppercase">Min.Disp. JN</th>
              <th className="px-2 py-2 text-right text-blue-700 uppercase border-r-2 border-blue-300">Máx.Producir JN</th>
              <th className="px-2 py-2 text-right text-green-600 uppercase">Déficit JN</th>
              <th className="px-2 py-2 text-right text-green-600 uppercase">T.Total Nec.</th>
              <th className="px-2 py-2 text-right text-green-600 uppercase">Partic.%</th>
              <th className="px-2 py-2 text-right text-green-600 uppercase">Min.Disp. HE</th>
              <th className="px-2 py-2 text-right text-green-700 uppercase border-r-2 border-green-300">Máx.Producir HE</th>
              <th className="px-2 py-2 text-right text-orange-600 uppercase">Déficit HE</th>
              <th className="px-2 py-2 text-right text-orange-600 uppercase">T.Total Nec.</th>
              <th className="px-2 py-2 text-right text-orange-600 uppercase">Partic.%</th>
              <th className="px-2 py-2 text-right text-orange-600 uppercase">Min.Disp. Sáb</th>
              <th className="px-2 py-2 text-right text-orange-700 uppercase border-r-2 border-orange-300">Máx.Producir Sáb</th>
              <th className="px-2 py-2 text-right text-purple-600 uppercase">Prod.Viable</th>
              {!isCentro1000 ? (
                <>
                  <th className="px-2 py-2 text-right text-purple-600 uppercase">Déficit General</th>
                  <th className="px-2 py-2 text-right text-teal-600 uppercase">Traslados viables</th>
                  <th className="px-2 py-2 text-right text-purple-600 uppercase">Déficit Neto 2000</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-2 text-right text-teal-600 uppercase">Envío C.2000</th>
                  <th className="px-2 py-2 text-right text-cyan-600 uppercase">Queda C.1000</th>
                  <th className="px-2 py-2 text-right text-purple-600 uppercase">Déficit General</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineasOrdenadas.map((linea) => (
              <React.Fragment key={linea}>
                <tr className="bg-blue-50/50">
                  <td colSpan={31} className="px-4 py-2 font-semibold text-blue-800 text-sm">Línea: {linea}</td>
                </tr>
                {datosAgrupados[linea].map((row: any, idx: number) => (
                  <DataRow key={row.id || `${linea}-${idx}`} row={row} idx={idx} linea={linea} isCentro1000={isCentro1000} />
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const Download = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);
