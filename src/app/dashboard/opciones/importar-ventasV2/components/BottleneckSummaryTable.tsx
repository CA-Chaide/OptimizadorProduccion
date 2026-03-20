'use client';

import React, { useState, useMemo } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, exportToXLSX, seleccionarPuestoConMayorConsumo } from './utils';
import { TiempoCanonResult } from './types';

interface BottleneckSummaryTableProps {
  datosEnriquecidosE: any[];
  datosEnriquecidosX: any[];
  tiemposCanon: TiempoCanonResult[];
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
}

export const BottleneckSummaryTable: React.FC<BottleneckSummaryTableProps> = ({ 
  datosEnriquecidosE, 
  datosEnriquecidosX, 
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

  const todosLosDatos = [...datosEnriquecidosE, ...datosEnriquecidosX];

  // Calcular cuellos de botella DIRECTAMENTE de los datos (no usando localStorage)
  const cuellosDeBottellaCalculados = useMemo(() => {
    const tablaTiempos = new Map<string, number>();
    const mapa = new Map<string, string>(); // Mes|Línea -> Puesto cuello de botella
    
    const computeNecLocal = (row: any) => {
      const up = safeNumber(row.UnidadesProyectado ?? 0);
      const ss = safeNumber(row.StockSeguridad ?? 0);
      const sa = safeNumber(row.StockActual ?? 0);
      return Math.max(0, up - sa + ss);
    };
    
    // Paso 1: Agrupar por Mes|Línea|Puesto y sumar tiempos
    todosLosDatos.forEach(row => {
      const necesidad = computeNecLocal(row);
      if (necesidad === 0) return;
      
      const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
      const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
      const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
      const tiempoTotalMaterial = tiempoUnitarioPorPuesto * necesidad;
      
      const mes = String(row.mesRef || row.Mes || 'Sin mes');
      const linea = String(row.lineaRef || row.LineaFabricacion || 'Sin línea');
      const puesto = String(row.PuestoCuellodeBottella || row.PuestoTrabajo || row.puestoBotella || '');
      
      if (!puesto) return;
      
      const key = `${mes}|${linea}|${puesto}`;
      const tiempoActual = tablaTiempos.get(key) || 0;
      tablaTiempos.set(key, tiempoActual + tiempoTotalMaterial);
    });
    
    // Paso 2: Identificar cuello de botella por Mes|Línea (puesto con mayor tiempo)
    tablaTiempos.forEach((tiempo, key) => {
      const [mes, linea, puesto] = key.split('|');
      const lineaKey = `${mes}|${linea}`;
      
      const actualPuesto = mapa.get(lineaKey);
      let actualTiempo = 0;
      if (actualPuesto) {
        const actualKey = `${mes}|${linea}|${actualPuesto}`;
        actualTiempo = tablaTiempos.get(actualKey) || 0;
      }
      
      if (tiempo > actualTiempo) {
        mapa.set(lineaKey, puesto);
        console.log(`[BottleneckSummaryTable] Cuello de botella: Mes=${mes}, Línea=${linea}, Puesto=${puesto}, Tiempo=${tiempo.toFixed(2)}`);
      }
    });
    
    return mapa;
  }, [todosLosDatos]);

  // Paso 1: Calcular consumo por puesto (para la búsqueda del registro en tiemposCanon)
  const consumoPorPuestoLinea: { [key: string]: { [nombreEstacion: string]: number } } = {};
  
  todosLosDatos.forEach(row => {
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

  todosLosDatos.forEach(row => {
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
      
      // Obtener el cuello de botella identificado (calculado directamente)
      const puestoBotella = cuellosDeBottellaCalculados.get(`${mes}|${linea}`);
      
      if (tiempoCanonMes?.data && Array.isArray(tiempoCanonMes.data)) {
        let datoPuesto = null;
        
        // Si tenemos cuello de botella identificado, buscarlo en tiemposCanon
        if (puestoBotella) {
          const puestoNorm = String(puestoBotella).toLowerCase().trim();
          datoPuesto = tiempoCanonMes.data.find((item: any) => {
            const nombreEstacion = String(item?.nombre_estacion ?? '').toLowerCase().trim();
            return nombreEstacion === puestoNorm || nombreEstacion.includes(puestoNorm) || puestoNorm.includes(nombreEstacion);
          });
        }
        
        // Si no encontramos el puesto específico, buscar en la línea
        if (!datoPuesto) {
          const lineaNorm = String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
          const registrosLinea = tiempoCanonMes.data.filter((item: any) => {
            const nombreLinea = String(item?.nombre_linea ?? '').toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
            return nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea) || nombreLinea === lineaNorm;
          });
          
          if (registrosLinea.length > 0) {
            datoPuesto = registrosLinea[0];
          } else if (tiempoCanonMes.data.length > 0) {
            datoPuesto = tiempoCanonMes.data[0];
          }
        }
        
        if (datoPuesto) {
          tiempoCanonicoInicial = safeNumber(datoPuesto?.minutos_horario_normal_TOTAL ?? 0);
          minutosConExtras = safeNumber(datoPuesto?.minutos_extras_TOTAL ?? 0);
          minutosFinSemana = safeNumber(datoPuesto?.minutos_sabado_TOTAL ?? 0);
          // USAR EL CUELLO DE BOTELLA CALCULADO, no el de tiemposCanon
          puestoSeleccionado = puestoBotella || String(datoPuesto?.nombre_estacion ?? 'Sin puesto');
        } else if (puestoBotella) {
          // Si no encontramos datoPuesto pero tenemos cuello de botella, usarlo
          puestoSeleccionado = puestoBotella;
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

    // Usar los valores enriquecidos correctamente
    // Para el resumen, necesitamos el tiempo total real que se consume: Necesidad × T/U
    const necesidad = safeNumber(row.necesidadTotal ?? safeNumber(row.UnidadesProyectado ?? 0) - safeNumber(row.StockActual ?? 0) + safeNumber(row.StockSeguridad ?? 0));
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const tiempoTotalRequerido = necesidad * tiempoPorUnidad;  // Necesidad × T/U
    const necesidadMax = safeNumber(row.necesidadMaximaAFabricar ?? 0);
    
    resumenPorLinea[key].tiempoTotal += tiempoTotalRequerido;  // Suma de (Necesidad × T/U)
    resumenPorLinea[key].necesidadTotal += necesidad;  // Suma de Necesidades Centro 2000
    resumenPorLinea[key].necesidadAFabricarTotal += necesidadMax;  // Suma de Necesidad Requerida
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
      PuestoCuellodeBottella: r.puestoSeleccionado,
      DiasLaborables: r.diasLaborables,
      NecesidadTotal: r.necesidadTotal,
      NecesidadPromedioDiaria: Number(r.necesidadPromedioDiaria.toFixed(1)),
      NecesidadAFabricarTotal: r.necesidadAFabricarTotal,
      NecesidadAFabricarPromedioDiaria: Number(r.necesidadAFabricarPromedioDiaria.toFixed(1)),
      TiempoRequeridoMinutos: Number(r.tiempoTotal.toFixed(0)),
      TiempoRequeridoHoras: Number((r.tiempoTotal / 60).toFixed(2)),
      DisponibleCuelloBotellaMinutos: Number(r.tiempoCanonicoInicial.toFixed(0)),
      DisponibleCuelloBotellaHoras: Number((r.tiempoCanonicoInicial / 60).toFixed(2)),
      DisponibleTotalMinutos: Number(r.tiempoCanonicoCompleto.toFixed(0)),
      DisponibleTotalHoras: Number((r.tiempoCanonicoCompleto / 60).toFixed(2)),
      HorasExtrasMinutos: Number(r.minutosExtrasTotal.toFixed(0)),
      HorasExtrasHoras: Number(r.horasExtrasTotal.toFixed(2)),
      TiempoLibreMinutos: Number(r.minutosRestantes.toFixed(0)),
      TiempoLibreHoras: Number(r.horasRestantes.toFixed(2)),
      HorasPorDia: Number(r.horasPromedioPorDia.toFixed(2))
    }));
    
    exportToXLSX(dataToExport, 'Resumen_Centro2000_PorLinea');
  };

  return (
    <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Resumen por Línea de Fabricación</h3>
          <p className="text-sm text-gray-500 mt-1">Resumen de tiempos de fabricación por línea - Centro 2000</p>
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
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              {respCtrlProdUnicos.map(resp => (
                <option key={resp} value={resp}>{resp}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[500px] overflow-y-auto relative">
        <table className="w-full">
          <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Mes</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Responsable</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Línea</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-red-700 uppercase tracking-wider">Puesto Botella</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Días Lab.</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-indigo-600 uppercase tracking-wider" colSpan={2}>Necesidad</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-purple-600 uppercase tracking-wider" colSpan={2}>Necesidad a Fabricar</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" colSpan={2}>Tiempo Requerido</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" colSpan={2}>Disponible</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" colSpan={2}>Horas Extras</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider" colSpan={2}>Tiempo Libre</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">h/día</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th colSpan={5}></th>
              <th className="px-2 py-2 text-center text-xs text-indigo-500">Total</th>
              <th className="px-2 py-2 text-center text-xs text-indigo-500">Prom/día</th>
              <th className="px-2 py-2 text-center text-xs text-purple-500">Total</th>
              <th className="px-2 py-2 text-center text-xs text-purple-500">Prom/día</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">min</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">h</th>
              <th className="px-2 py-2 text-center text-xs text-red-500 font-semibold">min</th>
              <th className="px-2 py-2 text-center text-xs text-red-500 font-semibold">h</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">min</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">h</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">min</th>
              <th className="px-2 py-2 text-center text-xs text-gray-500">h</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {resumenFiltered.map((resumen, idx) => (
              <tr key={`${resumen.mes}-${resumen.linea}-${idx}`} className="hover:bg-blue-50/50 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {(() => {
                    const mesNum = parseInt(resumen.mes);
                    return !isNaN(mesNum) && MONTH_NAMES[mesNum] ? MONTH_NAMES[mesNum] : resumen.mes;
                  })()}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{resumen.respCtrlProd}</td>
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{resumen.linea}</td>
                <td className="px-4 py-3 text-sm">
                  <span className="inline-block bg-red-100 text-red-800 px-2.5 py-1 rounded font-semibold text-xs">
                    {resumen.puestoSeleccionado}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm text-center font-mono text-gray-600">{resumen.diasLaborables}</td>
                <td className="px-4 py-3 text-sm text-right font-mono text-indigo-700 font-semibold">
                  {Math.floor(resumen.necesidadTotal).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-indigo-600">
                  {Number(resumen.necesidadPromedioDiaria).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-purple-700 font-semibold">
                  {Math.floor(resumen.necesidadAFabricarTotal).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-purple-600">
                  {Number(resumen.necesidadAFabricarPromedioDiaria).toLocaleString(undefined, { maximumFractionDigits: 1 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                  {Number(resumen.tiempoTotal ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                  {(Number(resumen.tiempoTotal ?? 0) / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-red-700 font-semibold bg-red-50">
                  {Number(resumen.tiempoCanonicoInicial ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </td>
                <td className="px-4 py-3 text-sm text-right font-mono text-red-700 font-semibold bg-red-50">
                  {(Number(resumen.tiempoCanonicoInicial ?? 0) / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })}
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
