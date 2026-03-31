'use client';

import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, exportToXLSX, getMesNumero, normalizeMaterialCode } from './utils';
import { TiempoCanonResult, TransferNeed, ViableTransfer, BottleneckClassTableProps } from './types';
import { Download } from 'lucide-react';
import { logger } from '@/services/LogService';
import { Badge } from '@/components/ui/badge';

// Componente de fila altamente optimizado
const DataRow = memo(({ row, idx, linea, isCentro1000, showSaldos }: { row: any, idx: number, linea: string, isCentro1000: boolean, showSaldos: boolean }) => {
  const mesDisplay = !isNaN(parseInt(row.mesRef)) ? (MONTH_NAMES[parseInt(row.mesRef)] || row.mesRef) : row.mesRef;

  return (
    <tr key={`${linea}-${idx}`} className="hover:bg-gray-50 transition-colors text-[11px]">
      <td className="px-2 py-2 font-bold text-indigo-900 bg-indigo-50/30 whitespace-nowrap">{mesDisplay}</td>
      <td className="px-2 py-2 font-medium text-gray-600">{String(row.ClaseAprovisionam || '-').trim().toUpperCase()}</td>
      <td className="px-2 py-2 font-medium text-gray-900 font-mono">{row.CodMaterial ?? '-'}</td>
      <td className="px-2 py-2 text-gray-600 max-w-40 truncate" title={row.Descripcion ?? ''}>{row.Descripcion ?? '-'}</td>
      <td className="px-2 py-2 text-gray-600">{row.CentroFabricacion || row.Centro || '-'}</td>
      <td className="px-2 py-2 text-gray-600">{row.LineaFabricacion ?? '-'}</td>
      <td className="px-2 py-2 text-gray-600">{row.PuestoCuellodeBottella ?? '-'}</td>
      <td className="px-2 py-2 text-right font-mono text-gray-600">{row.NumeroPuestos ?? row.numero_puestos ?? '-'}</td>
      <td className="px-2 py-2 text-gray-600">{row.Sector ?? '-'}</td>
      <td className="px-2 py-2 text-gray-600">{row.NombRespControlProd ?? row.RespCtrlProd ?? '-'}</td>
      <td className="px-2 py-2 text-right font-mono text-indigo-600 font-semibold">{row.tiempoUnitarioPorPuesto != null ? Number(row.tiempoUnitarioPorPuesto).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '-'}</td>
      
      <td className="px-2 py-2 text-right font-mono text-teal-700 font-semibold">{row._traslado.toLocaleString()}</td>
      <td className="px-2 py-2 text-right font-mono text-gray-700">{row._necPropia.toLocaleString()}</td>
      <td className="px-2 py-2 text-right font-mono text-blue-700 border-r-2 border-gray-300">{Math.floor(row._necesidad).toLocaleString()}</td>
      
      <td className="px-2 py-2 text-right font-mono text-blue-600">{row.tiempoTotalNecesidad != null ? Number(row.tiempoTotalNecesidad).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</td>
      <td className="px-2 py-2 text-right font-mono text-blue-600">{Number(row.participacionIndividual ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
      <td className="px-2 py-2 text-right font-mono text-blue-600">{row.minutosDisponiblesJornadaNormal != null ? Number(row.minutosDisponiblesJornadaNormal).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'} min</td>
      <td className="px-2 py-2 text-right font-mono text-blue-800 font-semibold">{row.necesidadMaximaProducirJornadaNormal != null ? Number(row.necesidadMaximaProducirJornadaNormal).toLocaleString() : '-'}</td>
      <td className="px-2 py-2 text-right font-mono text-green-700 border-r-2 border-gray-300">{row.deficitJornadaNormal != null ? Number(row.deficitJornadaNormal).toLocaleString() : '-'}</td>
      
      <td className="px-2 py-2 text-right font-mono text-green-600">{row.tiempoTotalNecesidadDeficitJN != null ? Number(row.tiempoTotalNecesidadDeficitJN).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</td>
      <td className="px-2 py-2 text-right font-mono text-green-600">{Number(row.participacionDeficitJN ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
      <td className="px-2 py-2 text-right font-mono text-green-600">{row.minutosDisponiblesHorasExtras != null ? Number(row.minutosDisponiblesHorasExtras).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'} min</td>
      <td className="px-2 py-2 text-right font-mono text-green-700">{row.necesidadMaximaProducirHorasExtras != null ? Number(row.necesidadMaximaProducirHorasExtras).toLocaleString() : '-'}</td>
      <td className="px-2 py-2 text-right font-mono text-orange-700 border-r-2 border-gray-300">{row.deficitHorasExtras != null ? Number(row.deficitHorasExtras).toLocaleString() : '-'}</td>
      
      <td className="px-2 py-2 text-right font-mono text-orange-600">{row.tiempoTotalNecesidadDeficitHE != null ? Number(row.tiempoTotalNecesidadDeficitHE).toLocaleString(undefined, { maximumFractionDigits: 2 }) : '-'}</td>
      <td className="px-2 py-2 text-right font-mono text-orange-600">{Number(row.participacionDeficitHE ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
      <td className="px-2 py-2 text-right font-mono text-orange-600">{row.minutosDisponiblesSabados != null ? Number(row.minutosDisponiblesSabados).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '-'} min</td>
      <td className="px-2 py-2 text-right font-mono text-orange-800 font-semibold">{row.necesidadMaximaProducirSabados != null ? Number(row.necesidadMaximaProducirSabados).toLocaleString() : '-'}</td>
      <td className="px-2 py-2 text-right font-mono text-orange-700 border-r-2 border-gray-300">{row.deficitSabados != null ? Number(row.deficitSabados).toLocaleString() : '-'}</td>
      
      <td className="px-2 py-2 text-right font-mono text-purple-700 font-bold bg-purple-50/30">{row._prodViable.toLocaleString()}</td>
      
      {showSaldos ? (
        <>
          <td className={`px-2 py-2 text-right font-mono font-semibold ${row._deficitGeneral > 0 ? 'text-red-700' : 'text-green-700'} bg-red-50/10`}>{row._deficitGeneral.toLocaleString()}</td>
          <td className="px-2 py-2 text-right font-mono text-teal-700 font-semibold bg-teal-50/20">{row._trValorAMostrar.toLocaleString()}</td>
          <td className={`px-2 py-2 text-right font-mono font-bold ${row._deficitNeto2000 > 0 ? 'text-red-700' : 'text-green-700'} border-r-2 border-gray-300 bg-purple-50/20`}>{row._deficitNeto2000.toLocaleString()}</td>
          <td className="px-2 py-2 text-right font-mono text-indigo-700 font-semibold bg-indigo-50/30">{row._stockInitial.toLocaleString()}</td>
          <td className="px-2 py-2 text-right font-mono text-green-700 font-bold bg-green-50/30">{row._demandaCubierta.toLocaleString()}</td>
          <td className={`px-2 py-2 text-right font-mono font-bold bg-blue-50/30 ${row._backlogVentas < 0 ? 'text-red-600' : 'text-blue-700'}`}>{row._backlogVentas.toLocaleString()}</td>
          <td className={`px-2 py-2 text-right font-mono font-bold border-r-2 border-gray-300 bg-emerald-50/30 ${row._saldoFinal < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{row._saldoFinal.toLocaleString()}</td>
        </>
      ) : isCentro1000 ? (
        <>
          <td className="px-2 py-2 text-right font-mono text-teal-700 font-semibold bg-teal-50/10">{row._envioC2000.toLocaleString()}</td>
          <td className="px-2 py-2 text-right font-mono text-cyan-700 font-semibold bg-cyan-50/10">{row._quedaC1000.toLocaleString()}</td>
          <td className={`px-2 py-2 text-right font-mono font-semibold ${row._deficitGeneral > 0 ? 'text-red-700' : 'text-green-700'} border-r-2 border-gray-300`}>{row._deficitGeneral.toLocaleString()}</td>
        </>
      ) : (
        <>
          <td className={`px-2 py-2 text-right font-mono font-semibold ${row._deficitGeneral > 0 ? 'text-red-700' : 'text-green-700'} bg-red-50/10`}>{row._deficitGeneral.toLocaleString()}</td>
          <td className="px-2 py-2 text-right font-mono text-teal-700 font-semibold bg-teal-50/20">{row._trValorAMostrar.toLocaleString()}</td>
          <td className={`px-2 py-2 text-right font-mono font-bold ${row._deficitNeto2000 > 0 ? 'text-red-700' : 'text-green-700'} border-r-2 border-gray-300 bg-purple-50/20`}>{row._deficitNeto2000.toLocaleString()}</td>
        </>
      )}
    </tr>
  );
});
DataRow.displayName = 'DataRow';

export const BottleneckClassTable: React.FC<BottleneckClassTableProps & { showSaldos?: boolean }> = ({ 
  datos, 
  datosCompletos,
  titulo, 
  tiemposCanon, 
  onExportSheetReady,
  onComputedDataReady,
  onTransferNeedsCalculated,
  forzarTrasladoTotal = false,
  maxExtrasHoras = 2,
  horasExtrasFin = 2,
  trasladosDesdeCentro2000 = [],
  isCentro1000 = false,
  trasladosViables = [],
  showSaldos = false
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLinea, setSelectedLinea] = useState<string>('');
  const [selectedRespCtrlProd, setSelectedRespCtrlProd] = useState<string[]>([]);
  const [selectedSector, setSelectedSector] = useState<string[]>([]);
  const [selectedClaseAprov, setSelectedClaseAprov] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;

  // 1. Mapas de búsqueda rápida (MEMOIZADOS)
  const quickMaps = useMemo(() => {
    const traslados = new Map<string, number>();
    trasladosDesdeCentro2000.forEach(item => {
      traslados.set(`${normalizeMaterialCode(item.CodMaterial)}|${item.mes}`, (traslados.get(`${normalizeMaterialCode(item.CodMaterial)}|${item.mes}`) || 0) + item.necesidadTraslado);
    });

    const viables = new Map<string, number>();
    trasladosViables.forEach(item => {
      viables.set(`${normalizeMaterialCode(item.CodMaterial)}|${parseInt(item.mes)}`, (viables.get(`${normalizeMaterialCode(item.CodMaterial)}|${parseInt(item.mes)}`) || 0) + item.cantidad);
    });

    const tiempos = new Map<string, TiempoCanonResult>();
    tiemposCanon.forEach(t => {
      tiempos.set(t.mes, t);
      tiempos.set(String(t.mesNumero), t);
    });

    return { traslados, viables, tiempos };
  }, [trasladosDesdeCentro2000, trasladosViables, tiemposCanon]);

  // 2. Lógica de cálculo pesado (SOLO CUANDO CAMBIAN LOS DATOS DE ENTRADA)
  const filasCalculadas = useMemo(() => {
    if (!datos || datos.length === 0) return [];

    const computeNecLocal = (row: any) => {
      if (row._Necesidades !== undefined && row._Necesidades !== null) return safeNumber(row._Necesidades);
      const up = safeNumber(row.UnidadesProyectado ?? 0);
      const ss = safeNumber(row.StockSeguridad ?? 0);
      const sa = safeNumber(row.StockActual ?? 0);
      return Math.max(0, up - sa + ss);
    };

    const mapaAgrupamiento = new Map<string, { necesidades: number }>();
    const sumaTiempoNecPorLinea = new Map<string, number>();
    const tiempoDispGlobalPorLinea = new Map<string, number>();
    const poolMinutosHEPorLinea = new Map<string, number>();
    const poolMinutosSabadosPorLinea = new Map<string, number>();

    const sourceDataForAggr = (datosCompletos && datosCompletos.length > 0) ? datosCompletos : datos;
    
    // PRE-AGREGACIÓN para evitar doble contabilidad de traslados en el total de la línea
    const uniqueSourceMap = new Map<string, any>();
    sourceDataForAggr.forEach(row => {
      const code = normalizeMaterialCode(row.CodMaterial ?? '');
      const mes = String(row.Mes ?? 'Sin mes');
      const cDem = String(row.Centro || '').trim();
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${code}|${mes}|${cDem}|${linea}`;
      
      if (!uniqueSourceMap.has(key)) {
        uniqueSourceMap.set(key, { ...row, _unidadesSum: 0, _necSum: 0 });
      }
      const existing = uniqueSourceMap.get(key)!;
      existing._unidadesSum += safeNumber(row.UnidadesProyectado ?? 0);
      existing._necSum += computeNecLocal(row);
    });

    uniqueSourceMap.forEach(row => {
      const mes = String(row.Mes ?? 'Sin mes');
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${mes}|${linea}`;
      const code = normalizeMaterialCode(row.CodMaterial ?? '');
      const cDem = String(row.Centro || '').trim();
      
      const trKey = `${code}|${mes}`;
      const traslado = quickMaps.traslados.get(trKey) || 0;
      const necPropia = row._isAggregated ? (row._necPropia ?? row._necSum) : (isCentro1000 && cDem !== '1000' ? 0 : row._necSum);
      const necesidad = necPropia + traslado;
      const esF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const prodAqui = isCentro1000 || !esF;

      if (!mapaAgrupamiento.has(key)) mapaAgrupamiento.set(key, { necesidades: 0 });
      if (prodAqui) mapaAgrupamiento.get(key)!.necesidades += necesidad;

      if (!tiempoDispGlobalPorLinea.has(key)) {
        const tc = quickMaps.tiempos.get(mes);
        if (tc && tc.data) {
          const lineaNorm = String(linea).toLowerCase().replace(/\s+/g, '');
          const registrosLinea = tc.data.filter((item: any) => {
            const nl = String(item?.nombre_linea ?? '').toLowerCase().replace(/\s+/g, '');
            return nl === lineaNorm || nl.includes(lineaNorm) || lineaNorm.includes(nl);
          });
          
          let pBotella = registrosLinea[0];
          const disp = safeNumber(pBotella?.minutos_horario_normal_TOTAL ?? 0);
          tiempoDispGlobalPorLinea.set(key, disp);
          poolMinutosHEPorLinea.set(key, (tc.diasLaborables ?? 0) * maxExtrasHoras * 60);
          poolMinutosSabadosPorLinea.set(key, (tc.diasSabados ?? 0) * horasExtrasFin * 60);
        }
      }

      if (prodAqui) {
        const tupp = safeNumber(row.TiempoPorUnidad ?? 0) / Math.max(1, safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1));
        sumaTiempoNecPorLinea.set(key, (sumaTiempoNecPorLinea.get(key) || 0) + (tupp * necesidad));
      }
    });

    const enriquecidos = datos.map(row => {
      const mes = String(row.Mes ?? 'Sin mes');
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${mes}|${linea}`;
      const code = normalizeMaterialCode(row.CodMaterial ?? '');
      const cDem = String(row.Centro || '').trim();
      
      const trKey = `${code}|${mes}`;
      const traslado = quickMaps.traslados.get(trKey) || 0;
      const rawNec = computeNecLocal(row);
      const necPropia = row._isAggregated ? (row._necPropia ?? rawNec) : (isCentro1000 && cDem !== '1000' ? 0 : rawNec);
      const necesidad = necPropia + traslado;
      const esF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const prodAqui = isCentro1000 || !esF;
      
      const tupp = safeNumber(row.TiempoPorUnidad ?? 0) / Math.max(1, safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1));
      const partInd = (prodAqui && (mapaAgrupamiento.get(key)?.necesidades ?? 0) > 0) ? (necesidad / mapaAgrupamiento.get(key)!.necesidades) * 100 : 0;
      
      const dispJN = tiempoDispGlobalPorLinea.get(key) || 0;
      let maxJN = 0;
      if (!forzarTrasladoTotal && prodAqui) {
        const totalNecLinea = sumaTiempoNecPorLinea.get(key) || 0;
        if (totalNecLinea <= dispJN) maxJN = necesidad;
        else maxJN = tupp > 0 ? Math.floor(((partInd / 100) * dispJN) / tupp) : 0;
      }

      return {
        ...row, 
        _necPropia: necPropia, 
        _traslado: traslado, 
        _necesidad: necesidad,
        tiempoUnitarioPorPuesto: tupp, 
        participacionIndividual: partInd,
        minutosDisponiblesJornadaNormal: (partInd / 100) * dispJN,
        tiempoTotalNecesidad: prodAqui ? necesidad * tupp : 0,
        necesidadMaximaProducirJornadaNormal: maxJN, 
        deficitJornadaNormal: Math.max(0, necesidad - maxJN),
        tiempoTotalNecesidadDeficitJN: prodAqui ? Math.max(0, necesidad - maxJN) * tupp : 0,
        mesRef: mes, 
        lineaRef: linea
      };
    });

    const sumDefJN = new Map();
    const sumTDefJN = new Map();
    enriquecidos.forEach(r => {
      const k = `${r.mesRef}|${r.lineaRef}`;
      sumDefJN.set(k, (sumDefJN.get(k) || 0) + r.deficitJornadaNormal);
      sumTDefJN.set(k, (sumTDefJN.get(k) || 0) + r.tiempoTotalNecesidadDeficitJN);
    });

    return enriquecidos.map(r => {
      const k = `${r.mesRef}|${r.lineaRef}`;
      const esF = String(r.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const prodAqui = isCentro1000 || !esF;
      const partDefJN = (prodAqui && sumDefJN.get(k) > 0) ? (r.deficitJornadaNormal / sumDefJN.get(k)) * 100 : 0;
      
      const poolHE = poolMinutosHEPorLinea.get(k) || 0;
      let maxHE = 0;
      if (prodAqui && sumTDefJN.get(k) > 0) {
        if (sumTDefJN.get(k) <= poolHE) maxHE = r.deficitJornadaNormal;
        else maxHE = r.tiempoUnitarioPorPuesto > 0 ? Math.floor(((partDefJN / 100) * poolHE) / r.tiempoUnitarioPorPuesto) : 0;
      }

      const deficitHE = Math.max(0, r.deficitJornadaNormal - maxHE);
      const poolSab = poolMinutosSabadosPorLinea.get(k) || 0;
      let maxSab = 0;
      if (prodAqui && deficitHE > 0) {
        if (poolSab > 0) maxSab = r.tiempoUnitarioPorPuesto > 0 ? Math.floor(((partDefJN / 100) * poolSab) / r.tiempoUnitarioPorPuesto) : 0;
        maxSab = Math.min(maxSab, deficitHE);
      }

      const deficitSabados = Math.max(0, deficitHE - maxSab);
      const _prodViable = r.necesidadMaximaProducirJornadaNormal + maxHE + maxSab;
      const _deficitGeneral = Math.max(0, r._necesidad - _prodViable);
      
      const ratioTr = r._necesidad > 0 ? r._traslado / r._necesidad : 0;
      const _envioC2000 = Math.round(_prodViable * ratioTr);

      const mesNum = getMesNumero(r.mesRef);
      const code = normalizeMaterialCode(r.CodMaterial);
      const jointKey = `${code}|${mesNum}`;
      const trViableValue = (quickMaps.viables.get(jointKey) || 0);
      
      const _trValorAMostrar = isCentro1000 ? _envioC2000 : trViableValue;

      // LÓGICA DE SALDOS
      const _stockInitial = safeNumber(r.StockActual);
      const _demanda = safeNumber(r.UnidadesProyectado);
      const _disponibilidad = (isCentro1000)
        ? (_stockInitial + _prodViable - _envioC2000) 
        : (_stockInitial + _prodViable + _trValorAMostrar);

      const _demandaCubierta = Math.min(_demanda, Math.max(0, _disponibilidad));
      const _diffBacklog = _disponibilidad - _demanda;
      const _backlogVentas = _diffBacklog >= 0 ? 0 : _diffBacklog;
      const _saldoFinal = Math.max(0, _disponibilidad - _demandaCubierta);

      return {
        ...r,
        necesidadMaximaProducirHorasExtras: maxHE,
        necesidadMaximaProducirSabados: maxSab,
        deficitHorasExtras: deficitHE,
        deficitSabados,
        tiempoTotalNecesidadDeficitHE: prodAqui ? deficitHE * r.tiempoUnitarioPorPuesto : 0,
        _prodViable, _deficitGeneral,
        _envioC2000,
        _quedaC1000: Math.round(_prodViable * (r._necesidad > 0 ? r._necPropia / r._necesidad : 0)),
        _trasladosViablesARecibir: trViableValue,
        _trValorAMostrar,
        _deficitNeto2000: Math.max(0, _deficitGeneral - trViableValue),
        participacionDeficitJN: partDefJN,
        participacionDeficitHE: (prodAqui && deficitHE > 0) ? (deficitHE / (sumDefJN.get(k) || 1)) * 100 : 0,
        minutosDisponiblesHorasExtras: (partDefJN / 100) * poolHE,
        minutosDisponiblesSabados: (partDefJN / 100) * poolSab,
        _stockInitial,
        _demandaCubierta,
        _backlogVentas,
        _saldoFinal
      };
    });
  }, [datos, datosCompletos, quickMaps, isCentro1000, forzarTrasladoTotal, maxExtrasHoras, horasExtrasFin]);

  // 3. Filtrado de la tabla (INSTANTÁNEO)
  const datosFiltrados = useMemo(() => {
    if (!searchTerm && !selectedLinea && selectedRespCtrlProd.length === 0 && selectedSector.length === 0 && selectedClaseAprov.length === 0) return filasCalculadas;
    
    const q = searchTerm.toLowerCase();
    return filasCalculadas.filter((row: any) => {
      if (q && !String(row.CodMaterial || '').toLowerCase().includes(q) && !String(row.Descripcion || '').toLowerCase().includes(q)) return false;
      if (selectedLinea && row.lineaRef !== selectedLinea) return false;
      if (selectedRespCtrlProd.length > 0 && !selectedRespCtrlProd.includes(String(row.NombRespControlProd || row.RespCtrlProd || '').trim())) return false;
      if (selectedSector.length > 0 && !selectedSector.includes(String(row.Sector || '').trim())) return false;
      if (selectedClaseAprov.length > 0 && !selectedClaseAprov.includes(String(row.ClaseAprovisionam || '').trim().toUpperCase())) return false;
      return true;
    });
  }, [filasCalculadas, searchTerm, selectedLinea, selectedRespCtrlProd, selectedSector, selectedClaseAprov]);

  // 4. Totales del Pie de Página (PRE-CALCULADOS)
  const totals = useMemo(() => {
    const res = {
      necPropia: 0, traslados: 0, necesidad: 0, tiempoNec: 0, dispMinJN: 0, maxJN: 0, defJN: 0,
      tDefJN: 0, tMinHE: 0, maxHE: 0, defHE: 0, tDefHE: 0, tMinSAB: 0, maxSAB: 0, defSAB: 0, viable: 0,
      defGral: 0, trViable: 0, defNeto: 0, stockIni: 0, demCubierta: 0, backlog: 0, saldoFinal: 0,
      envio2000: 0, queda1000: 0
    };
    
    datosFiltrados.forEach((r: any) => {
      if (!Number.isFinite(res.necPropia)) res.necPropia = 0;
      res.necPropia += safeNumber(r._necPropia);
      res.traslados += safeNumber(r._traslado);
      res.necesidad += safeNumber(r._necesidad);
      res.tiempoNec += safeNumber(r.tiempoTotalNecesidad);
      res.dispMinJN += safeNumber(r.minutosDisponiblesJornadaNormal);
      res.maxJN += safeNumber(r.necesidadMaximaProducirJornadaNormal);
      res.defJN += safeNumber(r.deficitJornadaNormal);
      res.tDefJN += safeNumber(r.tiempoTotalNecesidadDeficitJN);
      res.tMinHE += safeNumber(r.minutosDisponiblesHorasExtras);
      res.maxHE += safeNumber(r.necesidadMaximaProducirHorasExtras);
      res.defHE += safeNumber(r.deficitHorasExtras);
      res.tDefHE += safeNumber(r.tiempoTotalNecesidadDeficitHE);
      res.tMinSAB += safeNumber(r.minutosDisponiblesSabados);
      res.maxSAB += safeNumber(r.necesidadMaximaProducirSabados);
      res.defSAB += safeNumber(r.deficitSabados);
      res.viable += safeNumber(r._prodViable);
      res.defGral += safeNumber(r._deficitGeneral);
      res.trViable += safeNumber(r._trValorAMostrar);
      res.defNeto += safeNumber(r._deficitNeto2000);
      res.envio2000 += safeNumber(r._envioC2000);
      res.queda1000 += safeNumber(r._quedaC1000);
      res.stockIni += safeNumber(r._stockInitial);
      res.demCubierta += safeNumber(r._demandaCubierta);
      res.backlog += safeNumber(r._backlogVentas);
      res.saldoFinal += safeNumber(r._saldoFinal);
    });
    return res;
  }, [datosFiltrados]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return datosFiltrados.slice(start, start + itemsPerPage);
  }, [datosFiltrados, currentPage]);

  const totalPages = Math.ceil(datosFiltrados.length / itemsPerPage);

  // Emisión de datos calculados
  useEffect(() => {
    if (onComputedDataReady && filasCalculadas.length > 0) {
      onComputedDataReady(filasCalculadas);
    }
  }, [filasCalculadas, onComputedDataReady]);

  useEffect(() => {
    if (onTransferNeedsCalculated && filasCalculadas.length > 0 && !isCentro1000) {
      onTransferNeedsCalculated(filasCalculadas.filter(r => r._deficitGeneral > 0).map(r => ({
        CodMaterial: r.CodMaterial, mes: String(r.Mes || r.mesRef), necesidadTraslado: r._deficitGeneral
      })));
    }
  }, [filasCalculadas, onTransferNeedsCalculated, isCentro1000]);

  const options = useMemo(() => {
    const lineas = new Set<string>();
    const resps = new Set<string>();
    const sectores = new Set<string>();
    const clases = new Set<string>();
    filasCalculadas.forEach(r => {
      lineas.add(r.lineaRef);
      resps.add(String(r.NombRespControlProd || r.RespCtrlProd || '').trim());
      sectores.add(String(r.Sector || '').trim());
      clases.add(String(r.ClaseAprovisionam || '').trim().toUpperCase());
    });
    return {
      lineas: Array.from(lineas).sort(),
      resps: Array.from(resps).filter(Boolean).sort(),
      sectores: Array.from(sectores).filter(Boolean).sort(),
      clases: Array.from(clases).filter(Boolean).sort()
    };
  }, [filasCalculadas]);

  return (
    <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <div>
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">{titulo}</h3>
          <p className="text-[10px] text-gray-500">{datosFiltrados.length} registros</p>
        </div>
        <button onClick={() => exportToXLSX(filasCalculadas, `Detalle_${titulo.replace(/\s+/g, '_')}`)} className="p-1.5 text-green-700 hover:bg-green-100 rounded-md transition-colors">
          <Download className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-2 bg-white border-b border-gray-100 flex gap-2 flex-wrap items-center text-xs">
        <input type="search" placeholder="Buscar material..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="border border-gray-300 px-2 py-1.5 rounded-md text-xs w-48" />
        <select value={selectedLinea} onChange={e => setSelectedLinea(e.target.value)} className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white">
          <option value="">Línea: Todas</option>
          {options.lineas.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <div className="flex gap-2">
          {selectedClaseAprov.length > 0 && <Badge variant="secondary">{selectedClaseAprov.length} Clases</Badge>}
          {selectedSector.length > 0 && <Badge variant="secondary">{selectedSector.length} Sectores</Badge>}
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-20 bg-gray-100 shadow-sm text-[10px]">
            <tr className="border-b border-gray-300">
              <th colSpan={11} className="px-2 py-1 text-center font-bold text-gray-700 uppercase bg-gray-200">Información General</th>
              <th colSpan={3} className="px-2 py-1 text-center font-bold text-teal-700 uppercase bg-teal-50 border-r-2 border-gray-300">Aprovisionamiento</th>
              <th colSpan={5} className="px-2 py-1 text-center font-bold text-blue-700 uppercase bg-blue-100 border-r-2 border-gray-300">Jornada Normal</th>
              <th colSpan={5} className="px-2 py-1 text-center font-bold text-green-700 uppercase bg-green-100 border-r-2 border-gray-300">Horas Extras</th>
              <th colSpan={5} className="px-2 py-1 text-center font-bold text-orange-700 uppercase bg-orange-100 border-r-2 border-gray-300">Sábados</th>
              <th colSpan={showSaldos ? 8 : 4} className="px-2 py-1 text-center font-bold text-purple-700 uppercase bg-purple-100 border-r-2 border-gray-300">Resultados Consolidados</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200 uppercase font-bold text-gray-500">
              <th className="px-2 py-1 text-left bg-indigo-50/50">Mes</th>
              <th className="px-2 py-1 text-left">Clase</th>
              <th className="px-2 py-1 text-left">Material</th>
              <th className="px-2 py-1 text-left">Descripción</th>
              <th className="px-2 py-1 text-left">Centro</th>
              <th className="px-2 py-1 text-left">Línea</th>
              <th className="px-2 py-1 text-left">Puesto</th>
              <th className="px-2 py-1 text-right">Puestos</th>
              <th className="px-2 py-1 text-left">Sector</th>
              <th className="px-2 py-1 text-left">Responsable</th>
              <th className="px-2 py-1 text-right text-indigo-600">T.Unit</th>
              <th className="px-2 py-1 text-right text-teal-600">Traslado</th>
              <th className="px-2 py-1 text-right text-gray-600">Nec.Propia</th>
              <th className="px-2 py-1 text-right text-blue-600 border-r-2 border-gray-300">Necesidad</th>
              <th className="px-2 py-1 text-right text-blue-600">T.Total</th>
              <th className="px-2 py-1 text-right text-blue-600">Part.%</th>
              <th className="px-2 py-1 text-right text-blue-600">Disp.Min</th>
              <th className="px-2 py-1 text-right text-blue-700">Max.JN</th>
              <th className="px-2 py-1 text-right text-green-600 border-r-2 border-gray-300">Def.JN</th>
              <th className="px-2 py-1 text-right text-green-600">T.Def</th>
              <th className="px-2 py-1 text-right text-green-600">Part.%</th>
              <th className="px-2 py-1 text-right text-green-600">Disp.Min</th>
              <th className="px-2 py-1 text-right text-green-700">Max.HE</th>
              <th className="px-2 py-1 text-right text-orange-600 border-r-2 border-gray-300">Def.HE</th>
              <th className="px-2 py-1 text-right text-orange-600">T.Def</th>
              <th className="px-2 py-1 text-right text-orange-600">Part.%</th>
              <th className="px-2 py-1 text-right text-orange-600">Disp.Min</th>
              <th className="px-2 py-1 text-right text-orange-700">Max.Sab</th>
              <th className="px-2 py-1 text-right text-orange-600 border-r-2 border-gray-300">Def.Sab</th>
              <th className="px-2 py-1 text-right text-purple-600">Viable</th>
              {showSaldos ? (
                <>
                  <th className="px-2 py-1 text-right text-red-600">Def.Gral</th>
                  <th className="px-2 py-1 text-right text-teal-600">{isCentro1000 ? 'Traslados Salientes' : 'Traslados Entrantes'}</th>
                  <th className="px-2 py-1 text-right text-purple-600 border-r-2 border-gray-300">Def.Neto</th>
                  <th className="px-2 py-1 text-right text-indigo-600">Stock Inicial</th>
                  <th className="px-2 py-1 text-right text-green-600">Dem. Cubierta</th>
                  <th className="px-2 py-1 text-right text-blue-600">BackLogVentas</th>
                  <th className="px-2 py-1 text-right text-emerald-600 border-r-2 border-gray-300">Saldo Final</th>
                </>
              ) : isCentro1000 ? (
                <>
                  <th className="px-2 py-1 text-right text-teal-600">Envío 2000</th>
                  <th className="px-2 py-1 text-right text-cyan-600">Queda 1000</th>
                  <th className="px-2 py-1 text-right text-red-600 border-r-2 border-gray-300">Def.Gral</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-1 text-right text-red-600">Def.Gral</th>
                  <th className="px-2 py-1 text-right text-teal-600">Traslados Entrantes</th>
                  <th className="px-2 py-1 text-right text-purple-600 border-r-2 border-gray-300">Def.Neto</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedData.map((row: any, idx: number) => (
              <DataRow key={`${row.CodMaterial}-${row.mesRef}-${idx}`} row={row} idx={idx} linea={row.lineaRef} isCentro1000={isCentro1000} showSaldos={showSaldos} />
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-gray-800 text-white font-bold text-[10px]">
            <tr>
              <td colSpan={11} className="px-2 py-2">TOTAL</td>
              <td className="px-2 py-2 text-right font-mono text-teal-300">{totals.traslados.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-gray-300">{totals.necPropia.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-blue-300 border-r-2 border-gray-300">{totals.necesidad.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-blue-200">{totals.tiempoNec.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right font-mono text-blue-200">{Math.round(totals.dispMinJN).toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-blue-300">{totals.maxJN.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-green-300 border-r-2 border-gray-300">{totals.defJN.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-green-200">{totals.tDefJN.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right font-mono text-green-200">{Math.round(totals.tMinHE).toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-green-300">{totals.maxHE.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-orange-300 border-r-2 border-gray-300">{totals.defHE.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-orange-200">{totals.tDefHE.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td className="px-2 py-2"></td>
              <td className="px-2 py-2 text-right font-mono text-orange-200">{Math.round(totals.tMinSAB).toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-orange-300">{totals.maxSAB.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-orange-200 border-r-2 border-gray-300">{totals.defSAB.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-purple-300 bg-purple-900/20">{totals.viable.toLocaleString()}</td>
              {showSaldos ? (
                <>
                  <td className="px-2 py-2 text-right font-mono text-red-300">{totals.defGral.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-teal-300">{totals.trViable.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono border-r-2 border-gray-300">{totals.defNeto.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-indigo-300">{totals.stockIni.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-green-300">{totals.demCubierta.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-blue-300">{totals.backlog.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono border-r-2 border-gray-300">{totals.saldoFinal.toLocaleString()}</td>
                </>
              ) : isCentro1000 ? (
                <>
                  <td className="px-2 py-2 text-right font-mono text-teal-300">{totals.envio2000.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-cyan-300">{totals.queda1000.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono border-r-2 border-gray-300">{totals.defGral.toLocaleString()}</td>
                </>
              ) : (
                <>
                  <td className="px-2 py-2 text-right font-mono text-red-300">{totals.defGral.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-teal-300">{totals.trViable.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono border-r-2 border-gray-300">{totals.defNeto.toLocaleString()}</td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};
