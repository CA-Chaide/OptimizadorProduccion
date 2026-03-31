
'use client';

import React, { useState, useMemo, useEffect, memo } from 'react';
import { MONTH_NAMES, MONTH_NUMBERS } from './constants';
import { safeNumber, exportToXLSX, normalizeMaterialCode } from './utils';
import { TiempoCanonResult, TransferNeed, ViableTransfer, BottleneckClassTableProps } from './types';
import { Download } from 'lucide-react';
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
      <td className="px-2 py-2 text-right font-mono text-indigo-600 font-semibold border-r-2 border-gray-200">{row.tiempoUnitarioPorPuesto != null ? Number(row.tiempoUnitarioPorPuesto).toLocaleString(undefined, { maximumFractionDigits: 3 }) : '-'}</td>
      
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
      
      <td className="px-2 py-2 text-right font-mono text-purple-700 font-bold bg-purple-50/30 border-r-2 border-gray-300">{row._prodViable.toLocaleString()}</td>
      
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

  // Helper para clave cronológica
  const getTimelineKey = (row: any) => {
    const year = safeNumber(row.Año || row.año || new Date().getFullYear());
    let month = 0;
    const mesRaw = String(row.Mes || row.mesRef || '');
    const asNum = parseInt(mesRaw);
    if (!isNaN(asNum) && asNum >= 1 && asNum <= 12) month = asNum;
    else month = MONTH_NUMBERS[mesRaw as keyof typeof MONTH_NUMBERS] || 0;
    return (year * 12) + month;
  };

  const quickMaps = useMemo(() => {
    const traslados = new Map<string, number>();
    trasladosDesdeCentro2000.forEach(item => {
      const code = normalizeMaterialCode(item.CodMaterial);
      const key = `${code}|${item.mes}`;
      traslados.set(key, (traslados.get(key) || 0) + item.necesidadTraslado);
    });

    const viables = new Map<string, number>();
    trasladosViables.forEach(item => {
      const code = normalizeMaterialCode(item.CodMaterial);
      viables.set(`${code}|${item.mes}`, item.cantidad);
    });

    const tiempos = new Map<string, TiempoCanonResult>();
    tiemposCanon.forEach(t => {
      tiempos.set(t.mes, t);
      tiempos.set(String(t.mesNumero), t);
    });

    return { traslados, viables, tiempos };
  }, [trasladosDesdeCentro2000, trasladosViables, tiemposCanon]);

  const filasCalculadas = useMemo(() => {
    if (!datos || datos.length === 0) return [];

    const timeline = Array.from(new Set(datos.map(r => getTimelineKey(r))))
      .sort((a, b) => a - b);

    if (timeline.length === 0) return [];

    const stockTracker = new Map<string, number>(); 
    const todasLasFilasProcesadas: any[] = [];
    const trasladosAplicados = new Set<string>(); // Para evitar doble conteo en C1000

    for (const tKey of timeline) {
      const filasDelMes = datos.filter(r => getTimelineKey(r) === tKey);
      if (filasDelMes.length === 0) continue;

      const mesRef = String(filasDelMes[0].Mes || filasDelMes[0].mesRef || '');
      const tc = quickMaps.tiempos.get(mesRef) || quickMaps.tiempos.get(String(parseInt(mesRef)));
      if (!tc) continue;

      const poolMinutosHEPorLinea = new Map<string, number>();
      const poolMinutosSabadosPorLinea = new Map<string, number>();
      const sumaTiempoNecPorLinea = new Map<string, number>();
      const mapaAgrupamiento = new Map<string, { necesidades: number }>();
      const tiempoDispGlobalPorLinea = new Map<string, number>();

      const enriquecidosBase = filasDelMes.map(row => {
        const code = normalizeMaterialCode(row.CodMaterial ?? '');
        const cDem = String(row.Centro || '').trim();
        const keyStock = `${code}|${cDem}`;
        const linea = String(row.LineaFabricacion ?? 'Sin línea');
        const keyLinea = `${tKey}|${linea}`;

        const _stockInitial = stockTracker.has(keyStock)
          ? stockTracker.get(keyStock)!
          : safeNumber(row.StockActual);

        const ss = safeNumber(row.StockSeguridad);
        const up = safeNumber(row.UnidadesProyectado);
        
        // REGLA: El traslado desde Guayaquil solo se suma UNA VEZ por material/mes en Quito
        const trKey = `${code}|${mesRef}`;
        let _traslado = 0;
        if (isCentro1000 && !trasladosAplicados.has(trKey)) {
          _traslado = quickMaps.traslados.get(trKey) || 0;
          trasladosAplicados.add(trKey);
        }
        
        const _necPropia = Math.max(0, up - _stockInitial + ss);
        const rawNec = (isCentro1000 && cDem !== '1000') ? 0 : _necPropia;
        const _necesidad = rawNec + _traslado;

        const esF = String(row.ClaseAprovisionam || '').trim().toUpperCase() === 'F';
        const prodAqui = isCentro1000 || !esF;

        if (!mapaAgrupamiento.has(keyLinea)) mapaAgrupamiento.set(keyLinea, { necesidades: 0 });
        if (prodAqui) mapaAgrupamiento.get(keyLinea)!.necesidades += _necesidad;

        if (!tiempoDispGlobalPorLinea.has(keyLinea)) {
          const lineaNorm = String(linea).toLowerCase().replace(/\s+/g, '');
          const registrosLinea = tc.data.filter((item: any) => {
            const nl = String(item?.nombre_linea ?? '').toLowerCase().replace(/\s+/g, '');
            return nl === lineaNorm || nl.includes(lineaNorm) || lineaNorm.includes(nl);
          });
          const pBotella = registrosLinea[0];
          tiempoDispGlobalPorLinea.set(keyLinea, safeNumber(pBotella?.minutos_horario_normal_TOTAL ?? 0));
          poolMinutosHEPorLinea.set(keyLinea, (tc.diasLaborables ?? 0) * maxExtrasHoras * 60);
          poolMinutosSabadosPorLinea.set(keyLinea, (tc.diasSabados ?? 0) * horasExtrasFin * 60);
        }

        const tupp = safeNumber(row.TiempoPorUnidad ?? 0) / Math.max(1, safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1));
        if (prodAqui) sumaTiempoNecPorLinea.set(keyLinea, (sumaTiempoNecPorLinea.get(keyLinea) || 0) + (tupp * _necesidad));

        return { ...row, mesRef, lineaRef: linea, _stockInitial, _traslado, _necPropia, _necesidad, tiempoUnitarioPorPuesto: tupp, prodAqui, keyLinea, keyStock, up, ss };
      });

      const sumDefJN = new Map<string, number>();
      const sumTDefJN = new Map<string, number>();

      const pase2 = enriquecidosBase.map(r => {
        const partInd = (r.prodAqui && (mapaAgrupamiento.get(r.keyLinea)?.necesidades ?? 0) > 0) 
          ? (r._necesidad / mapaAgrupamiento.get(r.keyLinea)!.necesidades) * 100 : 0;
        
        const dispJN = tiempoDispGlobalPorLinea.get(r.keyLinea) || 0;
        let maxJN = 0;
        if (!forzarTrasladoTotal && r.prodAqui) {
          const totalNecLinea = sumaTiempoNecPorLinea.get(r.keyLinea) || 0;
          if (totalNecLinea <= dispJN) maxJN = r._necesidad;
          else maxJN = r.tiempoUnitarioPorPuesto > 0 ? Math.floor(((partInd / 100) * dispJN) / r.tiempoUnitarioPorPuesto) : 0;
        }

        const defJN = Math.max(0, r._necesidad - maxJN);
        const tDefJN = r.prodAqui ? defJN * r.tiempoUnitarioPorPuesto : 0;
        sumDefJN.set(r.keyLinea, (sumDefJN.get(r.keyLinea) || 0) + defJN);
        sumTDefJN.set(r.keyLinea, (sumTDefJN.get(r.keyLinea) || 0) + tDefJN);

        return { ...r, participacionIndividual: partInd, minutosDisponiblesJornadaNormal: (partInd / 100) * dispJN, tiempoTotalNecesidad: r.prodAqui ? r._necesidad * r.tiempoUnitarioPorPuesto : 0, necesidadMaximaProducirJornadaNormal: maxJN, deficitJornadaNormal: defJN, tiempoTotalNecesidadDeficitJN: tDefJN };
      });

      pase2.forEach(r => {
        const poolHE = poolMinutosHEPorLinea.get(r.keyLinea) || 0;
        const partDefJN = (r.prodAqui && sumDefJN.get(r.keyLinea)! > 0) ? (r.deficitJornadaNormal / sumDefJN.get(r.keyLinea)!) * 100 : 0;
        
        let maxHE = 0;
        if (r.prodAqui && sumTDefJN.get(r.keyLinea)! > 0) {
          if (sumTDefJN.get(r.keyLinea)! <= poolHE) maxHE = r.deficitJornadaNormal;
          else maxHE = r.tiempoUnitarioPorPuesto > 0 ? Math.floor(((partDefJN / 100) * poolHE) / r.tiempoUnitarioPorPuesto) : 0;
        }

        const deficitHE = Math.max(0, r.deficitJornadaNormal - maxHE);
        const poolSab = poolMinutosSabadosPorLinea.get(r.keyLinea) || 0;
        let maxSab = 0;
        if (r.prodAqui && deficitHE > 0 && poolSab > 0) {
          maxSab = r.tiempoUnitarioPorPuesto > 0 ? Math.floor(((partDefJN / 100) * poolSab) / r.tiempoUnitarioPorPuesto) : 0;
          maxSab = Math.min(maxSab, deficitHE);
        }

        const deficitSabados = Math.max(0, deficitHE - maxSab);
        const _prodViable = r.necesidadMaximaProducirJornadaNormal + maxHE + maxSab;
        const _deficitGeneral = Math.max(0, r._necesidad - _prodViable);
        
        const trKey = `${normalizeMaterialCode(r.CodMaterial)}|${r.mesRef}`;
        const trViableValue = quickMaps.viables.get(trKey) || 0;
        
        // SHIPMENT CALCULATION: Proportional share of viable production for the transfer
        const _trValorAMostrar = (trasladosViables && trasladosViables.length > 0) 
          ? trViableValue 
          : (isCentro1000 ? Math.round(_prodViable * (r._necesidad > 0 ? r._traslado / r._necesidad : 0)) : trViableValue);

        const _disponibilidad = isCentro1000 ? (r._stockInitial + _prodViable - _trValorAMostrar) : (r._stockInitial + _prodViable + _trValorAMostrar);
        const _demandaCubierta = Math.min(r.up, Math.max(0, _disponibilidad));
        const _backlogVentas = Math.min(0, _disponibilidad - r.up);
        const _saldoFinal = Math.max(0, _disponibilidad - _demandaCubierta);

        stockTracker.set(r.keyStock, _saldoFinal);

        todasLasFilasProcesadas.push({
          ...r,
          necesidadMaximaProducirHorasExtras: maxHE,
          necesidadMaximaProducirSabados: maxSab,
          deficitHorasExtras: deficitHE,
          deficitSabados,
          tiempoTotalNecesidadDeficitHE: r.prodAqui ? deficitHE * r.tiempoUnitarioPorPuesto : 0,
          tiempoTotalNecesidadDeficitSAB: r.prodAqui ? deficitSabados * r.tiempoUnitarioPorPuesto : 0,
          _prodViable, _deficitGeneral, _trValorAMostrar,
          _deficitNeto2000: Math.max(0, _deficitGeneral - trViableValue),
          _envioC2000: isCentro1000 ? _trValorAMostrar : 0,
          _quedaC1000: isCentro1000 ? Math.round(_prodViable - _trValorAMostrar) : _prodViable,
          participacionDeficitJN: partDefJN,
          minutosDisponiblesHorasExtras: (partDefJN / 100) * poolHE,
          minutosDisponiblesSabados: (partDefJN / 100) * poolSab,
          _demandaCubierta, _backlogVentas, _saldoFinal
        });
      });
    }

    return todasLasFilasProcesadas;
  }, [datos, quickMaps, isCentro1000, forzarTrasladoTotal, maxExtrasHoras, horasExtrasFin, trasladosViables]);

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

  const totals = useMemo(() => {
    const res = {
      necPropia: 0, traslados: 0, necesidad: 0, tiempoNec: 0, dispMinJN: 0, maxJN: 0, defJN: 0,
      tDefJN: 0, tMinHE: 0, maxHE: 0, defHE: 0, tDefHE: 0, tMinSAB: 0, maxSAB: 0, defSAB: 0, tDefSAB: 0, viable: 0,
      defGral: 0, trViable: 0, defNeto: 0, stockIni: 0, demCubierta: 0, backlog: 0, saldoFinal: 0,
      envio2000: 0, queda1000: 0
    };
    datosFiltrados.forEach((r: any) => {
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
      res.tDefSAB += safeNumber(r.tiempoTotalNecesidadDeficitSAB);
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

  const totalPages = Math.max(1, Math.ceil(datosFiltrados.length / itemsPerPage));

  useEffect(() => {
    if (onComputedDataReady && filasCalculadas.length > 0) onComputedDataReady(filasCalculadas);
  }, [filasCalculadas, onComputedDataReady]);

  useEffect(() => {
    if (onTransferNeedsCalculated && filasCalculadas.length > 0 && !isCentro1000) {
      onTransferNeedsCalculated(filasCalculadas.filter(r => r._deficitGeneral > 0).map(r => ({
        CodMaterial: r.CodMaterial, mes: String(r.mesRef), necesidadTraslado: r._deficitGeneral
      })));
    }
  }, [filasCalculadas, onTransferNeedsCalculated, isCentro1000]);

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
          {Array.from(new Set(filasCalculadas.map(r => r.lineaRef))).sort().map(l => <option key={l} value={l}>{l}</option>)}
        </select>
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
              <th colSpan={showSaldos ? 7 : 4} className="px-2 py-1 text-center font-bold text-purple-700 uppercase bg-purple-100 border-r-2 border-gray-300">Resultados Consolidados</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200 uppercase font-bold text-gray-500">
              <th className="px-2 py-1 text-left bg-indigo-50/50">Mes</th>
              <th className="px-2 py-1 text-left">Clase</th><th className="px-2 py-1 text-left">Material</th><th className="px-2 py-1 text-left">Descripción</th>
              <th className="px-2 py-1 text-left">Centro</th><th className="px-2 py-1 text-left">Línea</th><th className="px-2 py-1 text-left">Puesto</th>
              <th className="px-2 py-1 text-right">Puestos</th><th className="px-2 py-1 text-left">Sector</th><th className="px-2 py-1 text-left">Responsable</th>
              <th className="px-2 py-1 text-right text-indigo-600 border-r-2 border-gray-200">T.Unit</th>
              <th className="px-2 py-1 text-right text-teal-600">Traslado</th><th className="px-2 py-1 text-right text-gray-600">Nec.Propia</th>
              <th className="px-2 py-1 text-right text-blue-600 border-r-2 border-gray-300">Necesidad</th>
              <th className="px-2 py-1 text-right text-blue-600">T.Total</th><th className="px-2 py-1 text-right text-blue-600">Part.%</th>
              <th className="px-2 py-1 text-right text-blue-600">Disp.Min</th><th className="px-2 py-1 text-right text-blue-700">Max.JN</th>
              <th className="px-2 py-1 text-right text-green-600 border-r-2 border-gray-300">Def.JN</th>
              <th className="px-2 py-1 text-right text-green-600">T.Def</th><th className="px-2 py-1 text-right text-green-600">Part.%</th>
              <th className="px-2 py-1 text-right text-green-600">Disp.Min</th><th className="px-2 py-1 text-right text-green-700">Max.HE</th>
              <th className="px-2 py-1 text-right text-orange-600 border-r-2 border-gray-300">Def.HE</th>
              <th className="px-2 py-1 text-right text-orange-600">T.Def</th><th className="px-2 py-1 text-right text-orange-600">Part.%</th>
              <th className="px-2 py-1 text-right text-orange-600">Disp.Min</th><th className="px-2 py-1 text-right text-orange-700">Max.Sab</th>
              <th className="px-2 py-1 text-right text-orange-600 border-r-2 border-gray-300">Def.Sab</th>
              <th className="px-2 py-1 text-right text-purple-600">Viable</th>
              {showSaldos ? (
                <>
                  <th className="px-2 py-1 text-right text-red-600">Def.Gral</th><th className="px-2 py-1 text-right text-teal-600">{isCentro1000 ? 'Traslados Salientes' : 'Traslados Entrantes'}</th>
                  <th className="px-2 py-1 text-right text-purple-600 border-r-2 border-gray-300">Def.Neto</th><th className="px-2 py-1 text-right text-indigo-600">Stock Inicial</th>
                  <th className="px-2 py-1 text-right text-green-600">Dem. Cubierta</th><th className="px-2 py-1 text-right text-blue-600">BackLog</th>
                  <th className="px-2 py-1 text-right text-emerald-600 border-r-2 border-gray-300">Saldo Final</th>
                </>
              ) : isCentro1000 ? (
                <>
                  <th className="px-2 py-1 text-right text-teal-600">Envío 2000</th><th className="px-2 py-1 text-right text-cyan-600">Queda 1000</th>
                  <th className="px-2 py-1 text-right text-red-600 border-r-2 border-gray-300">Def.Gral</th>
                </>
              ) : (
                <>
                  <th className="px-2 py-1 text-right text-red-600">Def.Gral</th><th className="px-2 py-1 text-right text-teal-600">Traslados Entrantes</th>
                  <th className="px-2 py-1 text-right text-purple-600 border-r-2 border-gray-300">Def.Neto</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedData.map((row: any, idx: number) => (
              <DataRow key={`${row.CodMaterial}-${idx}`} row={row} idx={idx} linea={row.lineaRef} isCentro1000={isCentro1000} showSaldos={showSaldos} />
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 z-20 bg-gray-800 text-white font-bold text-[10px]">
            <tr>
              <td colSpan={11} className="px-2 py-2 border-r-2 border-gray-600">TOTALES FILTRADOS</td>
              <td className="px-2 py-2 text-right font-mono text-teal-300">{totals.traslados.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-gray-300">{totals.necPropia.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-blue-300 border-r-2 border-gray-600">{totals.necesidad.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-blue-200">{totals.tiempoNec.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td></td><td className="px-2 py-2 text-right font-mono text-blue-200">{Math.round(totals.dispMinJN).toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-blue-300">{totals.maxJN.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-green-300 border-r-2 border-gray-600">{totals.defJN.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-green-200">{totals.tDefJN.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td></td><td className="px-2 py-2 text-right font-mono text-green-200">{Math.round(totals.tMinHE).toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-green-300">{totals.maxHE.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-orange-300 border-r-2 border-gray-600">{totals.defHE.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-orange-200">{totals.tDefHE.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
              <td></td><td className="px-2 py-2 text-right font-mono text-orange-200">{Math.round(totals.tMinSAB).toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-orange-300">{totals.maxSAB.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-orange-200 border-r-2 border-gray-600">{totals.defSAB.toLocaleString()}</td>
              <td className="px-2 py-2 text-right font-mono text-purple-300 bg-purple-900/20 border-r-2 border-gray-600">{totals.viable.toLocaleString()}</td>
              {showSaldos ? (
                <>
                  <td className="px-2 py-2 text-right font-mono text-red-300">{totals.defGral.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-teal-300">{totals.trViable.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono border-r-2 border-gray-600">{totals.defNeto.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-indigo-300">{totals.stockIni.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-green-300">{totals.demCubierta.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-blue-300">{totals.backlog.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono border-r-2 border-gray-600">{totals.saldoFinal.toLocaleString()}</td>
                </>
              ) : isCentro1000 ? (
                <>
                  <td className="px-2 py-2 text-right font-mono text-teal-300">{totals.envio2000.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-cyan-300">{totals.queda1000.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono border-r-2 border-gray-600">{totals.defGral.toLocaleString()}</td>
                </>
              ) : (
                <>
                  <td className="px-2 py-2 text-right font-mono text-red-300">{totals.defGral.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono text-teal-300">{totals.trViable.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right font-mono border-r-2 border-gray-600">{totals.defNeto.toLocaleString()}</td>
                </>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
      
      {/* Paginación */}
      <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex justify-between items-center text-xs">
        <span className="text-gray-600">Página {currentPage} de {totalPages}</span>
        <div className="flex gap-1">
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-white">Anterior</button>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2 py-1 border rounded disabled:opacity-50 hover:bg-white">Siguiente</button>
        </div>
      </div>
    </div>
  );
};
