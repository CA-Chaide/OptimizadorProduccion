
'use client';

import React, { useState, useMemo } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, exportToXLSX } from './utils';
import { TiempoCanonResult } from './types';

interface BottleneckSummaryTableProps {
  datosEnriquecidosE: any[];
  datosEnriquecidosX: any[];
  datosCalculados?: any[];  // filasCalculadas emitidas por BottleneckClassTable (fuente real)
  tiemposCanon: TiempoCanonResult[];
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
  centroLabel?: string;
  isCentro1000?: boolean;
  showSaldos?: boolean;
}

export const BottleneckSummaryTable: React.FC<BottleneckSummaryTableProps> = ({ 
  datosEnriquecidosE, 
  datosEnriquecidosX,
  datosCalculados,
  tiemposCanon, 
  numMaximoSabados, 
  maxExtrasHoras, 
  horasTrabajo, 
  horasExtrasFin,
  centroLabel = 'Centro 2000',
  isCentro1000 = false,
  showSaldos = false
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

  // Fuente de datos: preferir datosCalculados (valores reales multi-pass) sobre legacy
  const filas = useMemo(() => {
    if (datosCalculados && datosCalculados.length > 0) return datosCalculados;
    return [...datosEnriquecidosE, ...datosEnriquecidosX];
  }, [datosCalculados, datosEnriquecidosE, datosEnriquecidosX]);

  const usaDatosCalc = !!(datosCalculados && datosCalculados.length > 0);

  // Calcular cuellos de botella DIRECTAMENTE de los datos
  const cuellosDeBottellaCalculados = useMemo(() => {
    const tablaTiempos = new Map<string, number>();
    const mapa = new Map<string, string>(); // Mes|Línea -> Puesto cuello de botella
    
    // Paso 1: Agrupar por Mes|Línea|Puesto y sumar tiempos
    filas.forEach(row => {
      const tiempoTotal = safeNumber(row.tiempoTotalNecesidad ?? 0);
      if (tiempoTotal === 0) return;
      
      const mes = String(row.mesRef || row.Mes || 'Sin mes');
      const linea = String(row.lineaRef || row.LineaFabricacion || 'Sin línea');
      const puesto = String(row.PuestoCuellodeBottella || row.PuestoTrabajo || row.puestoBotella || '');
      
      if (!puesto) return;
      
      const key = `${mes}|${linea}|${puesto}`;
      const tiempoActual = tablaTiempos.get(key) || 0;
      tablaTiempos.set(key, tiempoActual + tiempoTotal);
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
      }
    });
    
    return mapa;
  }, [filas]);

  // Construir resumen por Mes|Línea
  const resumenPorLinea: { [key: string]: {
    linea: string;
    mes: string;
    diasSabados: number;
    diasLaborables: number;
    numeroSemanas: number;
    horasPromedioPorDia: number;
    mesNumero: number;
    dispJN: number;   
    dispHE: number;   
    dispSAB: number;  
    consumidoJN: number;
    consumidoHE: number;
    consumidoSAB: number;
    libreJN: number;
    libreHE: number;
    libreSAB: number;
    respCtrlProd: string;
    necesidadTotal: number;
    necesidadPromedioDiaria: number;
    necesidadAFabricarTotal: number;
    necesidadAFabricarPromedioDiaria: number;
    envioC2000Total: number;
    quedaC1000Total: number;
    puestoSeleccionado: string;
    detalleExtras: string;
  }} = {};

  filas.forEach(row => {
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
      
      const puestoBotella = cuellosDeBottellaCalculados.get(`${mes}|${linea}`);
      
      if (tiempoCanonMes?.data && Array.isArray(tiempoCanonMes.data)) {
        let datoPuesto: any = null;
        if (puestoBotella) {
          const puestoNorm = String(puestoBotella).toLowerCase().trim();
          datoPuesto = tiempoCanonMes.data.find((item: any) => {
            const ne = String(item?.nombre_estacion ?? '').toLowerCase().trim();
            return ne === puestoNorm || ne.includes(puestoNorm) || puestoNorm.includes(ne);
          });
        }
        if (!datoPuesto) {
          const lineaNorm = String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
          const registrosLinea = tiempoCanonMes.data.filter((item: any) => {
            const nl = String(item?.nombre_linea ?? '').toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
            return nl.includes(lineaNorm) || lineaNorm.includes(nl) || nl === lineaNorm;
          });
          if (registrosLinea.length > 0) datoPuesto = registrosLinea[0];
          else if (tiempoCanonMes.data.length > 0) datoPuesto = tiempoCanonMes.data[0];
        }
        if (datoPuesto) {
          tiempoCanonicoInicial = safeNumber(datoPuesto?.minutos_horario_normal_TOTAL ?? 0);
          minutosConExtras = safeNumber(datoPuesto?.minutos_extras_TOTAL ?? 0);
          minutosFinSemana = safeNumber(datoPuesto?.minutos_sabado_TOTAL ?? 0);
          puestoSeleccionado = puestoBotella || String(datoPuesto?.nombre_estacion ?? 'Sin puesto');
        } else if (puestoBotella) {
          puestoSeleccionado = puestoBotella;
        }
      }
      
      const poolHE = Math.max(0, minutosConExtras - tiempoCanonicoInicial);

      resumenPorLinea[key] = {
        linea, mes,
        diasSabados, diasLaborables,
        numeroSemanas: Math.ceil((diasLaborables + diasSabados) / 7),
        horasPromedioPorDia: 0,
        mesNumero: tiempoCanonMes?.mesNumero ?? 0,
        dispJN: tiempoCanonicoInicial,
        dispHE: poolHE,
        dispSAB: minutosFinSemana,
        consumidoJN: 0, consumidoHE: 0, consumidoSAB: 0,
        libreJN: 0, libreHE: 0, libreSAB: 0,
        respCtrlProd: String(row.NombRespControlProd || row.RespCtrlProd || 'Sin responsable'),
        necesidadTotal: 0, necesidadPromedioDiaria: 0,
        necesidadAFabricarTotal: 0, necesidadAFabricarPromedioDiaria: 0,
        envioC2000Total: 0, quedaC1000Total: 0,
        puestoSeleccionado, detalleExtras: ''
      };
    }

    const r = resumenPorLinea[key];

    if (usaDatosCalc) {
      const tupp = safeNumber(row.tiempoUnitarioPorPuesto ?? 0);
      r.necesidadTotal += safeNumber(row._necesidad ?? 0);
      r.necesidadAFabricarTotal += safeNumber(row._prodViable ?? 0);
      r.envioC2000Total += safeNumber(row._envioC2000 ?? 0);
      r.quedaC1000Total += safeNumber(row._quedaC1000 ?? 0);
      r.consumidoJN  += safeNumber(row.necesidadMaximaProducirJornadaNormal ?? 0) * tupp;
      r.consumidoHE  += safeNumber(row.necesidadMaximaProducirHorasExtras ?? 0) * tupp;
      r.consumidoSAB += safeNumber(row.necesidadMaximaProducirSabados ?? 0) * tupp;
    } else {
      const necesidad = safeNumber(row.necesidadTotal ?? (safeNumber(row.UnidadesProyectado ?? 0) - safeNumber(row.StockActual ?? 0) + safeNumber(row.StockSeguridad ?? 0)));
      const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
      const numeroPuestos = Math.max(1, safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1));
      const tiempoUnitarioPorPuesto = tiempoPorUnidad / numeroPuestos;
      r.necesidadTotal += necesidad;
      r.necesidadAFabricarTotal += safeNumber(row.necesidadMaximaAFabricar ?? 0);
      r.consumidoJN += tiempoUnitarioPorPuesto * necesidad;
      if (isCentro1000) {
        const traslado = safeNumber(row.trasladoDesde2000 ?? 0);
        const necPropia = safeNumber(row.necesidadPropia ?? 0);
        const necTotalMat = traslado + necPropia;
        if (necTotalMat > 0) {
          const nMax = safeNumber(row.necesidadMaximaAFabricar ?? 0);
          r.envioC2000Total += Math.round(nMax * (traslado / necTotalMat));
          r.quedaC1000Total += Math.round(nMax * (necPropia / necTotalMat));
        }
      }
    }
  });

  Object.values(resumenPorLinea).forEach(resumen => {
    resumen.libreJN  = resumen.dispJN  - resumen.consumidoJN;
    resumen.libreHE  = resumen.dispHE  - resumen.consumidoHE;
    resumen.libreSAB = resumen.dispSAB - resumen.consumidoSAB;
    const totalConsumed = resumen.consumidoJN + resumen.consumidoHE + resumen.consumidoSAB;
    resumen.horasPromedioPorDia = resumen.diasLaborables > 0 ? (totalConsumed / 60) / resumen.diasLaborables : 0;
    resumen.necesidadPromedioDiaria = resumen.diasLaborables > 0 ? resumen.necesidadTotal / resumen.diasLaborables : 0;
    resumen.necesidadAFabricarPromedioDiaria = resumen.diasLaborables > 0 ? resumen.necesidadAFabricarTotal / resumen.diasLaborables : 0;
  });

  const resumenArray = Object.values(resumenPorLinea).sort((a, b) => {
    if (a.mesNumero !== b.mesNumero) return a.mesNumero - b.mesNumero;
    return a.linea.localeCompare(b.linea);
  });

  const lineasUnicas = Array.from(new Set(resumenArray.map(r => r.linea))).sort();
  const respCtrlProdUnicos = Array.from(new Set(resumenArray.map(r => r.respCtrlProd).filter(v => v !== 'Sin responsable'))).sort();

  const resumenFiltered = resumenArray.filter(r => {
    const matchLinea = !selectedLinea || r.linea === selectedLinea;
    const matchResp = !selectedRespCtrlProd || r.respCtrlProd === selectedRespCtrlProd;
    return matchLinea && matchResp;
  });

  const handleExportCSV = () => {
    const dataToExport = resumenFiltered.map(r => ({
      Mes: r.mes,
      Responsable: r.respCtrlProd,
      SemanasDelMes: r.numeroSemanas,
      Linea: r.linea,
      PuestoCuellodeBottella: r.puestoSeleccionado,
      DiasLaborables: r.diasLaborables,
      NecesidadTotal: r.necesidadTotal,
      NecesidadAFabricarTotal: r.necesidadAFabricarTotal,
      ...(isCentro1000 && !showSaldos ? { 'EnvioC2000': r.envioC2000Total, 'QuedaC1000': r.quedaC1000Total } : {}),
      'JN_ConsumidoH': Number((r.consumidoJN / 60).toFixed(2)),
      'JN_LibreH': Number((r.libreJN / 60).toFixed(2)),
      'HE_ConsumidoH': Number((r.consumidoHE / 60).toFixed(2)),
      'HE_LibreH': Number((r.libreHE / 60).toFixed(2)),
      'SAB_ConsumidoH': Number((r.consumidoSAB / 60).toFixed(2)),
      'SAB_LibreH': Number((r.libreSAB / 60).toFixed(2)),
      HorasPorDia: Number(r.horasPromedioPorDia.toFixed(2))
    }));
    exportToXLSX(dataToExport, `Resumen_${centroLabel.replace(/\s+/g, '')}_PorLinea`);
  };

  return (
    <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Resumen por Línea de Fabricación</h3>
          <p className="text-sm text-gray-500 mt-1">Resumen de tiempos de fabricación por línea - {centroLabel}</p>
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
            <select value={selectedLinea} onChange={e => setSelectedLinea(e.target.value)} className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white">
              <option value="">Todas las líneas</option>
              {lineasUnicas.map(linea => <option key={linea} value={linea}>{linea}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Responsable:</label>
            <select value={selectedRespCtrlProd} onChange={e => setSelectedRespCtrlProd(e.target.value)} className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white">
              <option value="">Todos</option>
              {respCtrlProdUnicos.map(resp => <option key={resp} value={resp}>{resp}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[500px] overflow-y-auto relative">
        <table className="w-full">
          <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
            <tr className="bg-gray-50">
              <th rowSpan={3} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Mes</th>
              <th rowSpan={3} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Responsable</th>
              <th rowSpan={3} className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Línea</th>
              <th rowSpan={3} className="px-3 py-2 text-left text-xs font-semibold text-red-700 uppercase tracking-wider border-r border-gray-200">Puesto Botella</th>
              <th rowSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Días Lab.</th>
              <th rowSpan={3} className="px-3 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200">Sem.</th>
              <th colSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-indigo-600 uppercase tracking-wider border-r border-gray-200">Necesidad</th>
              <th colSpan={2} className="px-2 py-2 text-center text-xs font-semibold text-purple-600 uppercase tracking-wider border-r border-gray-200">Nec. Fabricar</th>
              {isCentro1000 && !showSaldos && <th rowSpan={3} className="px-2 py-2 text-center text-xs font-semibold text-teal-600 uppercase tracking-wider border-r border-gray-200">Envío<br/>C.2000</th>}
              {isCentro1000 && !showSaldos && <th rowSpan={3} className="px-2 py-2 text-center text-xs font-semibold text-cyan-600 uppercase tracking-wider border-r border-gray-200">Queda<br/>C.1000</th>}
              <th colSpan={4} className="px-2 py-2 text-center text-xs font-bold text-blue-800 uppercase tracking-wider bg-blue-50 border-r border-gray-200">Jornada Normal</th>
              <th colSpan={4} className="px-2 py-2 text-center text-xs font-bold text-amber-800 uppercase tracking-wider bg-amber-50 border-r border-gray-200">Horas Extras L-V</th>
              <th colSpan={4} className="px-2 py-2 text-center text-xs font-bold text-violet-800 uppercase tracking-wider bg-violet-50 border-r border-gray-200">Sábados</th>
              <th rowSpan={3} className="px-2 py-2 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">h/día</th>
            </tr>
            <tr className="bg-gray-50">
              <th rowSpan={2} className="px-2 py-1 text-center text-[10px] text-indigo-500 border-r border-gray-100">Total</th>
              <th rowSpan={2} className="px-2 py-1 text-center text-[10px] text-indigo-500 border-r border-gray-200">Prom/día</th>
              <th rowSpan={2} className="px-2 py-1 text-center text-[10px] text-purple-500 border-r border-gray-100">Total</th>
              <th rowSpan={2} className="px-2 py-1 text-center text-[10px] text-purple-500 border-r border-gray-200">Prom/día</th>
              <th colSpan={2} className="px-1 py-1 text-center text-[10px] font-semibold text-blue-700 bg-blue-50 border-b border-blue-200">Consumido</th>
              <th colSpan={2} className="px-1 py-1 text-center text-[10px] font-semibold text-emerald-700 bg-blue-50 border-r border-gray-200 border-b border-blue-200">Libre</th>
              <th colSpan={2} className="px-1 py-1 text-center text-[10px] font-semibold text-amber-700 bg-amber-50 border-b border-amber-200">Consumido</th>
              <th colSpan={2} className="px-1 py-1 text-center text-[10px] font-semibold text-emerald-700 bg-amber-50 border-r border-gray-200 border-b border-amber-200">Libre</th>
              <th colSpan={2} className="px-1 py-1 text-center text-[10px] font-semibold text-violet-700 bg-violet-50 border-b border-violet-200">Consumido</th>
              <th colSpan={2} className="px-1 py-1 text-center text-[10px] font-semibold text-emerald-700 bg-violet-50 border-r border-gray-200 border-b border-violet-200">Libre</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-1 py-1 text-center text-[10px] text-blue-500 bg-blue-50">min</th>
              <th className="px-1 py-1 text-center text-[10px] text-blue-500 bg-blue-50">h</th>
              <th className="px-1 py-1 text-center text-[10px] text-emerald-500 bg-blue-50">min</th>
              <th className="px-1 py-1 text-center text-[10px] text-emerald-500 bg-blue-50 border-r border-gray-200">h</th>
              <th className="px-1 py-1 text-center text-[10px] text-amber-500 bg-amber-50">min</th>
              <th className="px-1 py-1 text-center text-[10px] text-amber-500 bg-amber-50">h</th>
              <th className="px-1 py-1 text-center text-[10px] text-emerald-500 bg-amber-50">min</th>
              <th className="px-1 py-1 text-center text-[10px] text-emerald-500 bg-amber-50 border-r border-gray-200">h</th>
              <th className="px-1 py-1 text-center text-[10px] text-violet-500 bg-violet-50">min</th>
              <th className="px-1 py-1 text-center text-[10px] text-violet-500 bg-violet-50">h</th>
              <th className="px-1 py-1 text-center text-[10px] text-emerald-500 bg-violet-50">min</th>
              <th className="px-1 py-1 text-center text-[10px] text-emerald-500 bg-violet-50 border-r border-gray-200">h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {resumenFiltered.map((resumen, idx) => (
              <tr key={`${resumen.mes}-${resumen.linea}-${idx}`} className="hover:bg-blue-50/50 transition-colors">
                <td className="px-3 py-2 text-sm font-medium text-gray-900">{isNaN(parseInt(resumen.mes)) ? resumen.mes : MONTH_NAMES[parseInt(resumen.mes)] || resumen.mes}</td>
                <td className="px-3 py-2 text-sm text-gray-600">{resumen.respCtrlProd}</td>
                <td className="px-3 py-2 text-sm font-medium text-gray-900">{resumen.linea}</td>
                <td className="px-3 py-2 text-sm"><span className="inline-block bg-red-100 text-red-800 px-2 py-0.5 rounded font-semibold text-xs">{resumen.puestoSeleccionado}</span></td>
                <td className="px-3 py-2 text-sm text-center font-mono text-gray-600">{resumen.diasLaborables}</td>
                <td className="px-3 py-2 text-sm text-center font-mono text-gray-600">{resumen.numeroSemanas}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-indigo-700 font-semibold">{Math.floor(resumen.necesidadTotal).toLocaleString()}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-indigo-600">{Number(resumen.necesidadPromedioDiaria).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-purple-700 font-semibold">{Math.floor(resumen.necesidadAFabricarTotal).toLocaleString()}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-purple-600">{Number(resumen.necesidadAFabricarPromedioDiaria).toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                {isCentro1000 && !showSaldos && <td className="px-2 py-2 text-sm text-right font-mono text-teal-700 font-semibold">{resumen.envioC2000Total.toLocaleString()}</td>}
                {isCentro1000 && !showSaldos && <td className="px-2 py-2 text-sm text-right font-mono text-cyan-700 font-semibold">{resumen.quedaC1000Total.toLocaleString()}</td>}
                <td className="px-2 py-2 text-sm text-right font-mono text-blue-700 bg-blue-50/30">{Number(resumen.consumidoJN).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-blue-600 bg-blue-50/30">{(resumen.consumidoJN / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className={`px-2 py-2 text-sm text-right font-mono font-semibold bg-blue-50/30 ${resumen.libreJN >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{Number(resumen.libreJN).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className={`px-2 py-2 text-sm text-right font-mono font-semibold bg-blue-50/30 ${resumen.libreJN >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(resumen.libreJN / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-amber-700 bg-amber-50/30">{resumen.consumidoHE > 0 ? Number(resumen.consumidoHE).toLocaleString(undefined, { maximumFractionDigits: 0 }) : <span className="text-gray-400">—</span>}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-amber-600 bg-amber-50/30">{resumen.consumidoHE > 0 ? (resumen.consumidoHE / 60).toLocaleString(undefined, { maximumFractionDigits: 2 }) : <span className="text-gray-400">—</span>}</td>
                <td className={`px-2 py-2 text-sm text-right font-mono font-semibold bg-amber-50/30 ${resumen.libreHE >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{Number(resumen.libreHE).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className={`px-2 py-2 text-sm text-right font-mono font-semibold bg-amber-50/30 ${resumen.libreHE >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(resumen.libreHE / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-violet-700 bg-violet-50/30">{resumen.consumidoSAB > 0 ? Number(resumen.consumidoSAB).toLocaleString(undefined, { maximumFractionDigits: 0 }) : <span className="text-gray-400">—</span>}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-violet-600 bg-violet-50/30">{resumen.consumidoSAB > 0 ? (resumen.consumidoSAB / 60).toLocaleString(undefined, { maximumFractionDigits: 2 }) : <span className="text-gray-400">—</span>}</td>
                <td className={`px-2 py-2 text-sm text-right font-mono font-semibold bg-violet-50/30 ${resumen.libreSAB >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{Number(resumen.libreSAB).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                <td className={`px-2 py-2 text-sm text-right font-mono font-semibold bg-violet-50/30 ${resumen.libreSAB >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{(resumen.libreSAB / 60).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td className="px-2 py-2 text-sm text-right font-mono text-gray-700">{Number(resumen.horasPromedioPorDia ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-sm text-gray-500">{resumenFiltered.length} registros</div>
    </div>
  );
};
