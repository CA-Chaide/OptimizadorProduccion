'use client';

import React, { useState } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, exportToXLSX, seleccionarPuestoConMayorConsumo } from './utils';
import { TiempoCanonResult } from './types';

interface Centro1000SummaryTableProps {
  datosEnriquecidos: any[];
  tiemposCanon: TiempoCanonResult[];
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
}

export const Centro1000SummaryTable: React.FC<Centro1000SummaryTableProps> = ({ 
  datosEnriquecidos, 
  tiemposCanon, 
  numMaximoSabados, 
  maxExtrasHoras, 
  horasTrabajo, 
  horasExtrasFin 
}) => {
  const [selectedLinea, setSelectedLinea] = useState<string>('');
  const [selectedRespCtrlProd, setSelectedRespCtrlProd] = useState<string>('');

  const buscarTiempoCanonPorMesSummary = (mesRaw: string) => {
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

  // Paso 1: Calcular consumo por puesto (para voto mayoría)
  const consumoPorPuestoLinea: { [key: string]: { [nombreEstacion: string]: number } } = {};
  
  datosEnriquecidos.forEach(row => {
    const mes = String(row.mesRef || row.Mes || 'Sin mes');
    const linea = String(row.lineaRef || row.LineaFabricacion || 'Sin línea');
    const puestoTrabajo = String(row.PuestoCuellodeBottella || 'Sin puesto');
    const keyLinea = `${mes}|${linea}`;
    
    if (!consumoPorPuestoLinea[keyLinea]) {
      consumoPorPuestoLinea[keyLinea] = {};
    }
    
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const necesidadMax = safeNumber(row.necesidadMaximaAFabricar ?? 0);
    const consumo = tiempoPorUnidad * necesidadMax;
    
    if (!consumoPorPuestoLinea[keyLinea][puestoTrabajo]) {
      consumoPorPuestoLinea[keyLinea][puestoTrabajo] = 0;
    }
    consumoPorPuestoLinea[keyLinea][puestoTrabajo] += consumo;
  });

  // Paso 2: Construir resumen usando voto mayoría
  const resumenPorLinea: { [key: string]: {
    linea: string;
    mes: string;
    tiempoTotal: number;
    horasExtrasTotal: number;
    minutosExtrasTotal: number;
    minutosConsumidosSabados: number;
    horasConsumidosSabados: number;
    diasSabados: number;
    diasLaborables: number;
    horasPromedioPorDia: number;
    mesNumero: number;
    tiempoCanonicoInicial: number;
    minutosConExtras: number;
    minutosFinSemana: number;
    tiempoCanonicoCompleto: number;
    minutosRestantes: number;
    horasRestantes: number;
    respCtrlProd: string;
    necesidadTotal: number;
    necesidadPromedioDiaria: number;
    necesidadAFabricarTotal: number;
    necesidadAFabricarPromedioDiaria: number;
    puestoSeleccionado: string;
  }} = {};

  datosEnriquecidos.forEach(row => {
    const mes = String(row.mesRef || row.Mes || 'Sin mes');
    const linea = String(row.lineaRef || row.LineaFabricacion || 'Sin línea');
    const key = `${mes}|${linea}`;
    
    if (!resumenPorLinea[key]) {
      const tiempoCanonMes = buscarTiempoCanonPorMesSummary(mes);
      const diasSabados = tiempoCanonMes?.diasSabados ?? 0;
      const diasLaborables = tiempoCanonMes?.diasLaborables ?? 0;
      
      let tiempoCanonicoInicial = 0;
      let minutosConExtras = 0;
      let minutosFinSemana = 0;
      let puestoSeleccionado = 'Sin puesto';
      if (tiempoCanonMes?.data && Array.isArray(tiempoCanonMes.data)) {
        // Buscar registros de esta línea
        const lineaNorm = String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
        const registrosLinea = tiempoCanonMes.data.filter((item: any) => {
          const nombreLinea = String(item?.nombre_linea ?? '').toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
          return nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea) || nombreLinea === lineaNorm;
        });
        
        if (registrosLinea.length > 0) {
          // Usar voto mayoría: seleccionar el puesto con mayor consumo
          const puestoMayorConsumo = seleccionarPuestoConMayorConsumo(registrosLinea, consumoPorPuestoLinea[key] || {});
          if (puestoMayorConsumo) {
            tiempoCanonicoInicial = safeNumber(puestoMayorConsumo?.minutos_horario_normal_TOTAL ?? 0);
            minutosConExtras = safeNumber(puestoMayorConsumo?.minutos_extras_TOTAL ?? 0);
            minutosFinSemana = safeNumber(puestoMayorConsumo?.minutos_sabado_TOTAL ?? 0);
            puestoSeleccionado = String(puestoMayorConsumo?.nombre_estacion ?? 'Sin puesto');
          }
        } else {
          // Fallback: tomar el primer dato si no encuentra la línea
          const primerDato = tiempoCanonMes.data[0];
          tiempoCanonicoInicial = safeNumber(primerDato?.minutos_horario_normal_TOTAL ?? 0);
          minutosConExtras = safeNumber(primerDato?.minutos_extras_TOTAL ?? 0);
          minutosFinSemana = safeNumber(primerDato?.minutos_sabado_TOTAL ?? 0);
          puestoSeleccionado = String(primerDato?.nombre_estacion ?? 'Sin puesto');
        }
      }
      
      resumenPorLinea[key] = {
        linea,
        mes,
        tiempoTotal: 0,
        horasExtrasTotal: 0,
        minutosExtrasTotal: 0,
        minutosConsumidosSabados: 0,
        horasConsumidosSabados: 0,
        diasSabados,
        diasLaborables,
        horasPromedioPorDia: 0,
        mesNumero: tiempoCanonMes?.mesNumero ?? 0,
        tiempoCanonicoInicial,
        minutosConExtras,
        minutosFinSemana,
        tiempoCanonicoCompleto: minutosConExtras + minutosFinSemana,
        minutosRestantes: 0,
        horasRestantes: 0,
        respCtrlProd: String(row.NombRespControlProd || row.RespCtrlProd || 'Sin responsable'),
        necesidadTotal: 0,
        necesidadPromedioDiaria: 0,
        necesidadAFabricarTotal: 0,
        necesidadAFabricarPromedioDiaria: 0,
        puestoSeleccionado
      };
    }

    const tMaxProm = safeNumber(row.tMaxProm ?? 0);  // (T/U÷Puestos) * (Nec. Máx)
    const necesidadMax = safeNumber(row.necesidadMaximaAFabricar ?? 0);
    const necesidadTotal = safeNumber(row.necesidadTotal ?? 0);  // necesidadPropia + trasladoDesde2000
    resumenPorLinea[key].tiempoTotal += tMaxProm;  // Suma de T.Max Prom
    resumenPorLinea[key].necesidadTotal += necesidadTotal;  // Suma de Nec. Total
    resumenPorLinea[key].necesidadAFabricarTotal += necesidadMax;  // Suma de Nec. Máx
  });

  Object.values(resumenPorLinea).forEach(resumen => {
    if (resumen.tiempoCanonicoInicial > 0 && resumen.tiempoTotal > resumen.tiempoCanonicoInicial) {
      const minutosExtras = resumen.tiempoTotal - resumen.tiempoCanonicoInicial;
      resumen.minutosExtrasTotal = minutosExtras;
      resumen.horasExtrasTotal = minutosExtras / 60;
    }
    
    const tiempoMaximoLunesViernes = (horasTrabajo + maxExtrasHoras) * resumen.diasLaborables * 60;
    let tiempoEnSabados = Math.max(0, resumen.tiempoTotal - tiempoMaximoLunesViernes);
    const tiempoMaximoSabados = horasExtrasFin * numMaximoSabados * 60;
    resumen.minutosConsumidosSabados = Math.min(tiempoEnSabados, tiempoMaximoSabados);
    resumen.horasConsumidosSabados = resumen.minutosConsumidosSabados / 60;
    
    const techo = (resumen.minutosConExtras ?? 0) + (resumen.minutosFinSemana ?? 0);
    resumen.minutosRestantes = techo - (resumen.tiempoTotal ?? 0);
    resumen.horasRestantes = (resumen.minutosRestantes ?? 0) / 60;
    resumen.horasPromedioPorDia = resumen.diasLaborables > 0 
      ? (resumen.tiempoTotal / 60) / resumen.diasLaborables 
      : 0;
    
    // Calcular promedio diario de necesidades
    resumen.necesidadPromedioDiaria = resumen.diasLaborables > 0
      ? resumen.necesidadTotal / resumen.diasLaborables
      : 0;
    
    // Calcular promedio diario de necesidad a fabricar
    resumen.necesidadAFabricarPromedioDiaria = resumen.diasLaborables > 0
      ? resumen.necesidadAFabricarTotal / resumen.diasLaborables
      : 0;
  });

  const resumenArray = Object.values(resumenPorLinea).sort((a, b) => {
    if (a.mesNumero !== b.mesNumero) return a.mesNumero - b.mesNumero;
    return a.linea.localeCompare(b.linea);
  });

  const lineasUnicas = Array.from(new Set(resumenArray.map(r => r.linea))).sort();
  const respCtrlProdUnicos = Array.from(
    new Set(resumenArray.map(r => r.respCtrlProd).filter(v => v !== 'Sin responsable'))
  ).sort();

  const resumenFiltered = resumenArray.filter(r => {
    const matchLinea = !selectedLinea || r.linea === selectedLinea;
    const matchResp = !selectedRespCtrlProd || r.respCtrlProd === selectedRespCtrlProd;
    return matchLinea && matchResp;
  });

  const handleExportCSV = () => {
    const dataToExport = resumenFiltered.map(r => ({
      Mes: r.mes,
      Responsable: r.respCtrlProd,
      Linea: r.linea,
      DiasLaborables: r.diasLaborables,
      NecesidadTotal: r.necesidadTotal,
      NecesidadPromedioDiaria: Number(r.necesidadPromedioDiaria.toFixed(1)),
      NecesidadAFabricarTotal: r.necesidadAFabricarTotal,
      NecesidadAFabricarPromedioDiaria: Number(r.necesidadAFabricarPromedioDiaria.toFixed(1)),
      TiempoRequeridoMinutos: Number(r.tiempoTotal.toFixed(0)),
      TiempoRequeridoHoras: Number((r.tiempoTotal / 60).toFixed(2)),
      TiempoDisponibleMinutos: Number(r.tiempoCanonicoInicial.toFixed(0)),
      TiempoDisponibleHoras: Number((r.tiempoCanonicoInicial / 60).toFixed(2)),
      HorasExtrasMinutos: Number(r.minutosExtrasTotal.toFixed(0)),
      HorasExtrasHoras: Number(r.horasExtrasTotal.toFixed(2)),
      TiempoLibreMinutos: Number(r.minutosRestantes.toFixed(0)),
      TiempoLibreHoras: Number(r.horasRestantes.toFixed(2)),
      HorasPorDia: Number(r.horasPromedioPorDia.toFixed(2))
    }));
    
    exportToXLSX(dataToExport, 'Resumen_Centro1000_PorLinea');
  };

  return (
    <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Resumen por Línea de Fabricación</h3>
          <p className="text-sm text-gray-500 mt-1">Análisis de capacidad productiva - Centro 1000</p>
        </div>
        <button
          onClick={handleExportCSV}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Descargar CSV
        </button>
      </div>

      <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
        <div className="flex gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Línea:</label>
            <select 
              value={selectedLinea} 
              onChange={e => setSelectedLinea(e.target.value)} 
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Todas las líneas</option>
              {lineasUnicas.map(linea => (
                <option key={linea} value={linea}>{linea}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Responsable:</label>
            <select 
              value={selectedRespCtrlProd} 
              onChange={e => setSelectedRespCtrlProd(e.target.value)} 
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Todos</option>
              {respCtrlProdUnicos.map(resp => (
                <option key={resp} value={resp}>{resp}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Mes</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Responsable</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Línea</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Días Lab.</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-teal-600 uppercase tracking-wider" colSpan={2}>Necesidad</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-rose-600 uppercase tracking-wider" colSpan={2}>Necesidad a Fabricar</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" colSpan={2}>Tiempo Requerido</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" colSpan={2}>Disponible</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" colSpan={2}>Horas Extras</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" colSpan={2}>Tiempo Libre</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">h/día</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th colSpan={4}></th>
              <th className="px-2 py-2 text-center text-xs text-teal-500">Total</th>
              <th className="px-2 py-2 text-center text-xs text-teal-500">Prom/día</th>
              <th className="px-2 py-2 text-center text-xs text-rose-500">Total</th>
              <th className="px-2 py-2 text-center text-xs text-rose-500">Prom/día</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">min</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">h</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">min</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">h</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">min</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">h</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">min</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">h</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {resumenFiltered.map((resumen, idx) => (
              <tr key={`${resumen.mes}-${resumen.linea}-${idx}`} className="hover:bg-teal-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {(() => {
                    const mesNum = parseInt(resumen.mes);
                    return !isNaN(mesNum) && MONTH_NAMES[mesNum] ? MONTH_NAMES[mesNum] : resumen.mes;
                  })()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{resumen.respCtrlProd}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{resumen.linea}</td>
                <td className="px-4 py-3 text-sm text-center font-mono text-gray-600">{resumen.diasLaborables}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-teal-700 font-semibold">
                  {Math.round(resumen.necesidadTotal).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-teal-600">
                  {Number(resumen.necesidadPromedioDiaria).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-rose-700 font-semibold">
                  {Math.round(resumen.necesidadAFabricarTotal).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-rose-600">
                  {Number(resumen.necesidadAFabricarPromedioDiaria).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                  {Number(resumen.tiempoTotal ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                  {(Number(resumen.tiempoTotal ?? 0) / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-blue-700">
                  {Number(resumen.tiempoCanonicoCompleto ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-blue-700">
                  {(Number(resumen.tiempoCanonicoCompleto ?? 0) / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-amber-600">
                  {Number(resumen.minutosExtrasTotal ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-amber-600">
                  {Number(resumen.horasExtrasTotal ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-emerald-600">
                  {Number(resumen.minutosRestantes ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-emerald-600">
                  {Number(resumen.horasRestantes ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                  {Number(resumen.horasPromedioPorDia ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">
        {resumenFiltered.length} registros
      </div>
    </div>
  );
};
