'use client';

import React, { useState, useMemo, useEffect, useRef, memo } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, exportToXLSX, getMesNumero, normalizeMaterialCode } from './utils';
import { TiempoCanonResult, TransferNeed, ViableTransfer, BottleneckClassTableProps } from './types';
import { Download } from 'lucide-react';
import { logger } from '@/services/LogService';

// Componente de fila altamente optimizado
const DataRow = memo(({ row, idx, linea, isCentro1000, showSaldos }: { row: any, idx: number, linea: string, isCentro1000: boolean, showSaldos: boolean }) => {
  // Traducir mes si es número
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
      <td className="px-2 py-2 text-right font-mono text-orange-800 font-semibold border-r-2 border-gray-300">{row.necesidadMaximaProducirSabados != null ? Number(row.necesidadMaximaProducirSabados).toLocaleString() : '-'}</td>
      
      <td className="px-2 py-2 text-right font-mono text-purple-700 font-bold bg-purple-50/30">{row._prodViable.toLocaleString()}</td>
      
      {showSaldos ? (
        <>
          <td className={`px-2 py-2 text-right font-mono font-semibold ${row._deficitGeneral > 0 ? 'text-red-700' : 'text-green-700'} bg-red-50/10`}>{row._deficitGeneral.toLocaleString()}</td>
          <td className="px-2 py-2 text-right font-mono text-teal-700 font-semibold bg-teal-50/20">{row._trValorAMostrar.toLocaleString()}</td>
          <td className={`px-2 py-2 text-right font-mono font-bold ${row._deficitNeto2000 > 0 ? 'text-red-700' : 'text-green-700'} border-r-2 border-gray-300 bg-purple-50/20`}>{row._deficitNeto2000.toLocaleString()}</td>
          <td className="px-2 py-2 text-right font-mono text-indigo-700 font-semibold bg-indigo-50/30">{row._stockInicial.toLocaleString()}</td>
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

  // 1. Mapas de búsqueda rápida
  const trasladosMap = useMemo(() => {
    const map = new Map<string, number>();
    trasladosDesdeCentro2000.forEach(item => {
      const code = normalizeMaterialCode(item.CodMaterial);
      map.set(code, (map.get(code) || 0) + item.necesidadTraslado);
    });
    return map;
  }, [trasladosDesdeCentro2000]);

  const viableTransfersMap = useMemo(() => {
    const map = new Map<string, number>();
    trasladosViables.forEach(item => {
      const mesNum = parseInt(item.mes);
      const code = normalizeMaterialCode(item.CodMaterial);
      const key = `${code}|${mesNum}`;
      map.set(key, (map.get(key) || 0) + item.cantidad);
    });
    return map;
  }, [trasladosViables]);

  const tiemposCanonMap = useMemo(() => {
    const map = new Map<string, TiempoCanonResult>();
    tiemposCanon.forEach(t => {
      map.set(t.mes, t);
      map.set(String(t.mesNumero), t);
    });
    return map;
  }, [tiemposCanon]);

  // 2. Lógica de cálculo pesado
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
    
    sourceDataForAggr.forEach(row => {
      const mes = String(row.Mes ?? 'Sin mes');
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${mes}|${linea}`;
      const code = normalizeMaterialCode(row.CodMaterial ?? '');
      const cDem = String(row.Centro || '').trim();
      
      const traslado = trasladosMap.get(code) || 0;
      const rawNec = computeNecLocal(row);
      const necPropia = row._isAggregated ? (row._necPropia ?? rawNec) : (isCentro1000 && cDem !== '1000' ? 0 : rawNec);
      const necesidad = necPropia + traslado;
      const esF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const prodAqui = isCentro1000 || !esF;

      if (!mapaAgrupamiento.has(key)) mapaAgrupamiento.set(key, { necesidades: 0 });
      if (prodAqui) mapaAgrupamiento.get(key)!.necesidades += necesidad;

      if (!tiempoDispGlobalPorLinea.has(key)) {
        const tc = tiemposCanonMap.get(mes);
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
      
      const traslado = trasladosMap.get(code) || 0;
      const rawNec = computeNecLocal(row);
      const necPropia = row._isAggregated ? (row._necPropia ?? rawNec) : (isCentro1000 && cDem !== '1000' ? 0 : rawNec);
      const necesidad = necPropia + traslado;
      const esF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
      const prodAqui = isCentro1000 || !esF;
      
      const tupp = safeNumber(row.TiempoPorUnidad ?? 0) / Math.max(1, safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1));
      const partInd = (prodAqui && (mapaAgrupamiento.get(key)?.necesidades ?? 0) > 0) ? (necesidad / mapaAgrupamiento.get(key)!.necesidades) * 100 : 0;
      
      let maxJN = 0;
      if (!forzarTrasladoTotal && prodAqui) {
        const dispJN = tiempoDispGlobalPorLinea.get(key) || 0;
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

      const _prodViable = r.necesidadMaximaProducirJornadaNormal + maxHE + maxSab;
      const _deficitGeneral = Math.max(0, r._necesidad - _prodViable);
      
      const ratioTr = r._necesidad > 0 ? r._traslado / r._necesidad : 0;
      const _envioC2000 = Math.round(_prodViable * ratioTr);

      const mesNum = getMesNumero(r.mesRef);
      const code = normalizeMaterialCode(r.CodMaterial);
      const jointKey = `${code}|${mesNum}`;
      const trViableValue = (viableTransfersMap.get(jointKey) || 0);
      
      const _trValorAMostrar = isCentro1000 ? _envioC2000 : trViableValue;

      // LÓGICA DE SALDOS
      const _stockInicial = safeNumber(r.StockActual);
      const _demanda = safeNumber(r.UnidadesProyectado);
      const _disponibilidad = (isCentro1000)
        ? (_stockInicial + _prodViable - _envioC2000) 
        : (_stockInicial + _prodViable + _trValorAMostrar);

      const _diffBacklog = _disponibilidad - _demanda;
      const _backlogVentas = _diffBacklog >= 0 ? 0 : _diffBacklog;
      const _demandaCubierta = Math.min(_demanda, Math.max(0, _disponibilidad));
      const _saldoFinal = Math.max(0, _disponibilidad - _demandaCubierta);

      return {
        ...r,
        necesidadMaximaProducirHorasExtras: maxHE,
        necesidadMaximaProducirSabados: maxSab,
        deficitHorasExtras: deficitHE,
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
        _stockInicial,
        _demandaCubierta,
        _backlogVentas,
        _saldoFinal
      };
    });
  }, [datos, datosCompletos, trasladosMap, isCentro1000, viableTransfersMap, tiemposCanonMap, forzarTrasladoTotal, maxExtrasHoras, horasExtrasFin]);

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

  const totalPages = Math.ceil(datosFiltrados.length / itemsPerPage);
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return datosFiltrados.slice(start, start + itemsPerPage);
  }, [datosFiltrados, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedLinea, selectedRespCtrlProd, selectedSector, selectedClaseAprov]);

  const lastSyncRef = useRef<string>('');
  useEffect(() => {
    if (!onComputedDataReady || filasCalculadas.length === 0) return;
    
    const sumViable = filasCalculadas.reduce((s, r) => s + r._prodViable, 0);
    const currentFingerprint = `${filasCalculadas.length}-${sumViable}`;
    
    if (currentFingerprint === lastSyncRef.current) return;
    lastSyncRef.current = currentFingerprint;
    onComputedDataReady(filasCalculadas);
  }, [filasCalculadas, onComputedDataReady]);

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
        <input 
          type="search" 
          placeholder="Buscar material o descripción..." 
          value={searchTerm} 
          onChange={e => setSearchTerm(e.target.value)} 
          className="border border-gray-300 px-2 py-1.5 rounded-md text-xs w-48" 
        />
        
        <select 
          value={selectedLinea} 
          onChange={e => setSelectedLinea(e.target.value)} 
          className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white"
        >
          <option value="">Línea: Todas</option>
          {options.lineas.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        <div className="flex items-center gap-1">
          <span className="text-gray-600">Clase:</span>
          <select 
            value="" 
            onChange={(e) => {
              const val = e.target.value;
              if (val && !selectedClaseAprov.includes(val)) {
                setSelectedClaseAprov([...selectedClaseAprov, val]);
              }
            }} 
            className="border border-gray-300 px-2 py-1.5 rounded-md text-xs bg-white"
          >
            <option value="">+ Agregar</option>
            {options.clases.map(c => (
              !selectedClaseAprov.includes(c) && <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {selectedClaseAprov.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {selectedClaseAprov.map(c => (
                <span key={c} className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                  {c}
                  <button onClick={() => setSelectedClaseAprov(selectedClaseAprov.filter(x => x !== c))} className="hover:text-purple-900 font-bold">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-gray-600">Sector:</span>
          <select 
            value="" 
            onChange={(e) => {
              const val = e.target.value;
              if (val && !selectedSector.includes(val)) {
                setSelectedSector([...selectedSector, val]);
              }
            }} 
            className="border border-gray-300 px-2 py-1.5 rounded-md text-xs bg-white"
          >
            <option value="">+ Agregar</option>
            {options.sectores.map(s => (
              !selectedSector.includes(s) && <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {selectedSector.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {selectedSector.map(s => (
                <span key={s} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                  {s}
                  <button onClick={() => setSelectedSector(selectedSector.filter(x => x !== s))} className="hover:text-blue-900 font-bold">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-gray-600">Resp:</span>
          <select 
            value="" 
            onChange={(e) => {
              const val = e.target.value;
              if (val && !selectedRespCtrlProd.includes(val)) {
                setSelectedRespCtrlProd([...selectedRespCtrlProd, val]);
              }
            }} 
            className="border border-gray-300 px-2 py-1.5 rounded-md text-xs bg-white"
          >
            <option value="">+ Agregar</option>
            {options.resps.map(r => (
              !selectedRespCtrlProd.includes(r) && <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {selectedRespCtrlProd.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {selectedRespCtrlProd.map(r => (
                <span key={r} className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                  {r}
                  <button onClick={() => setSelectedRespCtrlProd(selectedRespCtrlProd.filter(x => x !== r))} className="hover:text-amber-900 font-bold">×</button>
                </span>
              ))}
            </div>
          )}
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
              <th colSpan={4} className="px-2 py-1 text-center font-bold text-orange-700 uppercase bg-orange-100 border-r-2 border-gray-300">Sábados</th>
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
              <th className="px-2 py-1 text-right text-orange-700 border-r-2 border-gray-300">Max.Sab</th>
              
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
              <DataRow key={row.id || `${row.CodMaterial}-${currentPage}-${idx}`} row={row} idx={idx} linea={row.lineaRef} isCentro1000={isCentro1000} showSaldos={showSaldos} />
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            {(() => {
              const totalNecPropia = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._necPropia ?? 0), 0);
              const totalTraslados = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._traslado ?? 0), 0);
              const totalNecesidad = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._necesidad ?? 0), 0);
              const totalTiempoNecesidad = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.tiempoTotalNecesidad ?? 0), 0);
              const totalMinutosDisponibles = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.minutosDisponiblesJornadaNormal ?? 0), 0);
              const totalNecesidadMaxima = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.necesidadMaximaProducirJornadaNormal ?? 0), 0);
              const totalDeficitJN = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.deficitJornadaNormal ?? 0), 0);
              const totalTDefJN = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.tiempoTotalNecesidadDeficitJN ?? 0), 0);
              const totalMaxHE = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.necesidadMaximaProducirHorasExtras ?? 0), 0);
              const totalDefHE = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.deficitHorasExtras ?? 0), 0);
              const totalTDefHE = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.tiempoTotalNecesidadDeficitHE ?? 0), 0);
              const totalMaxSab = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.necesidadMaximaProducirSabados ?? 0), 0);
              const totalProducible = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._prodViable ?? 0), 0);
              const totalDeficitGral = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._deficitGeneral ?? 0), 0);
              const totalTrViable = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._trValorAMostrar ?? 0), 0);
              const totalDeficitNeto = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._deficitNeto2000 ?? 0), 0);
              const totalEnvio2000 = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._envioC2000 ?? 0), 0);
              const totalQueda1000 = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._quedaC1000 ?? 0), 0);
              const totalStockInicial = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._stockInicial ?? 0), 0);
              const totalDemandaCubierta = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._demandaCubierta ?? 0), 0);
              const totalBacklog = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._backlogVentas ?? 0), 0);
              const totalSaldoFinal = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row._saldoFinal ?? 0), 0);
              const totalTMinHE = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.minutosDisponiblesHorasExtras ?? 0), 0);
              const totalTMinSAB = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.minutosDisponiblesSabados ?? 0), 0);
              
              return (
                <tr className="bg-gray-800 text-white font-bold text-[10px]">
                  <td colSpan={11} className="px-2 py-2">TOTAL</td>
                  
                  <td className="px-2 py-2 text-right font-mono text-teal-300">{totalTraslados.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-gray-300">{totalNecPropia.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-blue-300 border-r-2 border-gray-300">{totalNecesidad.toLocaleString()}</td>
                  
                  <td className="px-2 py-2 text-right font-mono text-blue-200">{totalTiempoNecesidad.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-right font-mono text-blue-200">{Math.round(totalMinutosDisponibles).toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-blue-300">{totalNecesidadMaxima.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-green-300 border-r-2 border-gray-300">{totalDeficitJN.toLocaleString()}</td>
                  
                  <td className="px-2 py-2 text-right font-mono text-green-200">{totalTDefJN.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-right font-mono text-green-200">{Math.round(totalTMinHE).toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-green-300">{totalMaxHE.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-orange-300 border-r-2 border-gray-300">{totalDefHE.toLocaleString()}</td>
                  
                  <td className="px-2 py-2 text-right font-mono text-orange-200">{totalTDefHE.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                  <td className="px-2 py-2"></td>
                  <td className="px-2 py-2 text-right font-mono text-orange-200">{Math.round(totalTMinSAB).toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-orange-300 border-r-2 border-gray-300">{totalMaxSab.toLocaleString()}</td>
                  
                  <td className="px-2 py-2 text-right font-mono text-purple-300 bg-purple-900/20">{totalProducible.toLocaleString()}</td>
                  
                  {showSaldos ? (
                    <>
                      <td className={`px-2 py-2 text-right font-mono bg-red-900/20 ${totalDeficitGral > 0 ? 'text-red-300' : 'text-green-300'}`}>{totalDeficitGral.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono text-teal-300 bg-teal-900/20">{totalTrViable.toLocaleString()}</td>
                      <td className={`px-2 py-2 text-right font-mono border-r-2 border-gray-300 bg-purple-900/30 ${totalDeficitNeto > 0 ? 'text-red-300' : 'text-green-300'}`}>{totalDeficitNeto.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono text-indigo-300 bg-indigo-900/20">{totalStockInicial.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono text-green-300 bg-green-900/20">{totalDemandaCubierta.toLocaleString()}</td>
                      <td className={`px-2 py-2 text-right font-mono bg-blue-900/50 ${totalBacklog < 0 ? 'text-red-300' : 'text-blue-300'}`}>{totalBacklog.toLocaleString()}</td>
                      <td className={`px-2 py-2 text-right font-mono border-r-2 border-gray-300 bg-emerald-900/20 ${totalSaldoFinal < 0 ? 'text-red-300' : 'text-emerald-300'}`}>{totalSaldoFinal.toLocaleString()}</td>
                    </>
                  ) : isCentro1000 ? (
                    <>
                      <td className="px-2 py-2 text-right font-mono text-teal-300 bg-teal-900/20">{totalEnvio2000.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono text-cyan-300 bg-cyan-900/20">{totalQueda1000.toLocaleString()}</td>
                      <td className={`px-2 py-2 text-right font-mono border-r-2 border-gray-300 ${totalDeficitGral > 0 ? 'text-red-300' : 'text-green-300'}`}>{totalDeficitGral.toLocaleString()}</td>
                    </>
                  ) : (
                    <>
                      <td className={`px-2 py-2 text-right font-mono bg-red-900/20 ${totalDeficitGral > 0 ? 'text-red-300' : 'text-green-300'}`}>{totalDeficitGral.toLocaleString()}</td>
                      <td className="px-2 py-2 text-right font-mono text-teal-300 bg-teal-900/20">{totalTrViable.toLocaleString()}</td>
                      <td className={`px-2 py-2 text-right font-mono border-r-2 border-gray-300 bg-purple-900/30 ${totalDeficitNeto > 0 ? 'text-red-300' : 'text-green-300'}`}>{totalDeficitNeto.toLocaleString()}</td>
                    </>
                  )}
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs">
        <div className="text-gray-600">
          Mostrando <span className="font-semibold">{Math.min(currentPage * itemsPerPage - itemsPerPage + 1, datosFiltrados.length)}</span> a <span className="font-semibold">{Math.min(currentPage * itemsPerPage, datosFiltrados.length)}</span> de <span className="font-semibold">{datosFiltrados.length}</span> registros
        </div>
        <div className="flex gap-2 items-center">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ⟨⟨
          </button>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ⟨
          </button>
          
          <div className="flex items-center gap-1">
            <span>Página</span>
            <input
              type="number"
              min="1"
              max={totalPages}
              value={currentPage}
              onChange={(e) => {
                const page = parseInt(e.target.value) || 1;
                if (page >= 1 && page <= totalPages) setCurrentPage(page);
              }}
              className="w-12 border border-gray-300 rounded px-1 py-1 text-center"
            />
            <span>de {totalPages}</span>
          </div>

          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ⟩
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages}
            className="px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ⟩⟩
          </button>
        </div>
      </div>
    </div>
  );
};