'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { MONTH_NAMES } from './constants';
import { safeNumber, computeNecesidades, exportToXLSX } from './utils';
import { TiempoCanonResult, TransferNeed } from './types';

interface BottleneckClassTableProps {
  datos: any[];
  datosCompletos: any[];
  titulo: string;
  tiemposCanon: TiempoCanonResult[];
  tiempoConsumidoAnterior?: { [mesLinea: string]: number };
  onTransferNeedsCalculated?: (transferNeeds: TransferNeed[]) => void;
  forzarTrasladoTotal?: boolean;
}

export const BottleneckClassTable: React.FC<BottleneckClassTableProps> = ({ 
  datos, 
  datosCompletos, 
  titulo, 
  tiemposCanon, 
  tiempoConsumidoAnterior = {}, 
  onTransferNeedsCalculated,
  forzarTrasladoTotal = false
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedLinea, setSelectedLinea] = useState<string>('');
  const [selectedRespCtrlProd, setSelectedRespCtrlProd] = useState<string>('');

  const computeNecesidadesLocal = (row: any) => {
    const unidadesProy = safeNumber(row.UnidadesProyectado ?? 0);
    const stockSeg = safeNumber(row.StockSeguridad ?? 0);
    const stockAct = safeNumber(row.StockActual ?? 0);
    return Math.max(0, unidadesProy - stockAct + stockSeg);
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

  const crearMapaAgrupamiento = () => {
    const mapa: { [mesLinea: string]: { necesidades: number; count: number; mes: string; linea: string } } = {};
    
    datos.forEach(row => {
      const mes = String(row.Mes ?? 'Sin mes');
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${mes}|${linea}`;
      
      if (!mapa[key]) {
        mapa[key] = { necesidades: 0, count: 0, mes, linea };
      }
      
      const necesidad = computeNecesidadesLocal(row);
      mapa[key].necesidades += necesidad;
      mapa[key].count += 1;
    });
    
    return mapa;
  };

  const mapaAgrupamiento = crearMapaAgrupamiento();

  // Función para normalizar nombres de líneas para comparación
  const normalizarLinea = (linea: string): string => {
    return String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
  };

  const obtenerTiempoDisponible = (mes: string, linea: string, puestoTrabajo: string | null) => {
    const tiempoCanon = buscarTiempoCanonPorMes(mes);
    if (!tiempoCanon || !tiempoCanon.data || !Array.isArray(tiempoCanon.data)) {
      return null;
    }
    
    const lineaNorm = normalizarLinea(linea);
    
    // Primero filtrar por línea
    const registrosLinea = tiempoCanon.data.filter((item: any) => {
      const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
      return nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
    });

    // Si no encontramos registros de la línea, intentar buscar por puesto en todos los datos
    if (registrosLinea.length === 0) {
      if (puestoTrabajo && puestoTrabajo !== '-' && puestoTrabajo !== '') {
        const pn = String(puestoTrabajo).toLowerCase().trim();
        const dp = tiempoCanon.data.find((item: any) => {
          const nombreEstacion = String(item?.nombre_estacion ?? '').toLowerCase().trim();
          return nombreEstacion.includes(pn) || pn.includes(nombreEstacion);
        });
        if (dp) {
          return {
            minutos_horario_normal: safeNumber(dp?.minutos_horario_normal_CON_PUESTOS ?? dp?.minutos_horario_normal_TOTAL ?? 0),
            minutos_con_extras: safeNumber(dp?.minutos_extras_CON_PUESTOS ?? dp?.minutos_extras_TOTAL ?? 0),
            minutos_fin_semana: safeNumber(dp?.minutos_sabado_CON_PUESTOS ?? dp?.minutos_sabado_TOTAL ?? 0),
            minutos_horario_normal_total: safeNumber(dp?.minutos_horario_normal_TOTAL ?? 0),
            diasLaborables: tiempoCanon.diasLaborables,
            diasSabados: tiempoCanon.diasSabados
          };
        }
      }
      return null;
    }

    // Sumar todos los tiempos de las estaciones de esa línea
    let minutos_horario_normal = 0;
    let minutos_con_extras = 0;
    let minutos_fin_semana = 0;
    let minutos_horario_normal_total = 0;
    
    registrosLinea.forEach((dato: any) => {
      minutos_horario_normal += safeNumber(dato?.minutos_horario_normal_CON_PUESTOS ?? dato?.minutos_horario_normal_TOTAL ?? 0);
      minutos_con_extras += safeNumber(dato?.minutos_extras_CON_PUESTOS ?? dato?.minutos_extras_TOTAL ?? 0);
      minutos_fin_semana += safeNumber(dato?.minutos_sabado_CON_PUESTOS ?? dato?.minutos_sabado_TOTAL ?? 0);
      minutos_horario_normal_total += safeNumber(dato?.minutos_horario_normal_TOTAL ?? 0);
    });

    return {
      minutos_horario_normal,
      minutos_con_extras,
      minutos_fin_semana,
      minutos_horario_normal_total,
      diasLaborables: tiempoCanon.diasLaborables,
      diasSabados: tiempoCanon.diasSabados
    };
  };

  const enriquecerFila = (row: any) => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const key = `${mes}|${linea}`;
    const necesidad = computeNecesidadesLocal(row);
    
    const mapaLinea = mapaAgrupamiento[key];
    const sumaNecesidadesEnLinea = mapaLinea?.necesidades ?? necesidad;
    
    const participacionIndividual = sumaNecesidadesEnLinea > 0 
      ? (necesidad / sumaNecesidadesEnLinea) * 100 
      : 0;
    
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    
    const tiempoTotalNecesidad = necesidad * tiempoPorUnidad;
    
    const tiempoDisp = obtenerTiempoDisponible(mes, linea, row.PuestoCuellodeBottella);
    
    let necesidadMaximaAFabricar = 0;
    let horasExtrasUsadas = 0;
    let tMaxProm = 0;
    
    // Si forzarTrasladoTotal = true (ej. clase F), NO se fabrica nada: todo se traslada
    if (forzarTrasladoTotal) {
      necesidadMaximaAFabricar = 0;
      tMaxProm = 0;
      horasExtrasUsadas = 0;
    } else if (tiempoDisp && tiempoPorUnidad > 0) {
      const techoAbsolutoLinea = tiempoDisp.minutos_con_extras + tiempoDisp.minutos_fin_semana;
      const tiempoConsumidoPreviamente = tiempoConsumidoAnterior?.[key] ?? 0;
      const tiempoMaxDisponible = Math.max(0, techoAbsolutoLinea - tiempoConsumidoPreviamente);
      const tiempoParaEsteMaterial = (participacionIndividual / 100) * tiempoMaxDisponible;
      
      necesidadMaximaAFabricar = Math.min(necesidad, Math.floor(tiempoParaEsteMaterial / tiempoPorUnidad));
      
      // Calcular T.MAX PROM: (T/U÷Puestos) * (Nec. Máx)
      tMaxProm = tiempoUnitarioPorPuesto * necesidadMaximaAFabricar;
      
      const tiempoNormalRestante = Math.max(0, tiempoDisp.minutos_horario_normal - tiempoConsumidoPreviamente);
      const tiempoNormalParaEsteMaterial = (participacionIndividual / 100) * tiempoNormalRestante;
      const tiempoRealUsado = Math.min(necesidad, necesidadMaximaAFabricar) * tiempoPorUnidad;
      
      if (tiempoRealUsado > tiempoNormalParaEsteMaterial) {
        horasExtrasUsadas = (tiempoRealUsado - tiempoNormalParaEsteMaterial) / 60;
      }
    }
    
    return {
      ...row,
      participacionIndividual: participacionIndividual.toFixed(2),
      tiempoTotalNecesidad,
      tiempoUnitarioPorPuesto,
      tMaxProm,
      necesidadMaximaAFabricar,
      horasExtrasUsadas: horasExtrasUsadas.toFixed(2),
      mesRef: mes,
      lineaRef: linea
    };
  };

  const datosEnriquecidos = useMemo(() => datos.map(enriquecerFila), [datos]);

  const lastDataLengthRef = useRef<number>(0);

  useEffect(() => {
    if (onTransferNeedsCalculated && datos.length !== lastDataLengthRef.current) {
      lastDataLengthRef.current = datos.length;
      
      const transferNeedsMap = new Map<string, number>();
      
      datosEnriquecidos.forEach((row: any) => {
        const codMaterial = String(row.CodMaterial ?? '');
        const necesidades = computeNecesidadesLocal(row);
        const necesidadMaximaAFabricar = safeNumber(row.necesidadMaximaAFabricar ?? 0);
        const necesidadTraslado = Math.max(0, necesidades - necesidadMaximaAFabricar);
        
        if (!transferNeedsMap.has(codMaterial) || transferNeedsMap.get(codMaterial)! < necesidadTraslado) {
          transferNeedsMap.set(codMaterial, necesidadTraslado);
        }
      });
      
      const transferNeedsArray = Array.from(transferNeedsMap.entries())
        .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
        .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));
      
      onTransferNeedsCalculated(transferNeedsArray);
    }
  }, [datos.length]);

  const lineasUnicas = Array.from(new Set(datosEnriquecidos.map(r => String(r.lineaRef || r.LineaFabricacion || 'Sin línea')))).sort();

  const respCtrlProdUnicos = Array.from(
    new Set(datosEnriquecidos.map(r => String(r.NombRespControlProd || r.RespCtrlProd || 'Sin responsable')).filter(v => v !== 'Sin responsable'))
  ).sort();

  const datosFiltrados = datosEnriquecidos.filter((row: any) => {
    const matchSearchTerm = !searchTerm || String(row.CodMaterial || '').toLowerCase().includes(String(searchTerm).toLowerCase());
    const matchLinea = !selectedLinea || String(row.lineaRef || row.LineaFabricacion || '').trim() === selectedLinea.trim();
    const matchRespCtrlProd = !selectedRespCtrlProd || String(row.NombRespControlProd || row.RespCtrlProd || '').trim() === selectedRespCtrlProd.trim();
    return matchSearchTerm && matchLinea && matchRespCtrlProd;
  });

  const datosAgrupados = datosFiltrados.reduce((acc: any, row: any) => {
    const linea = String(row.lineaRef || row.LineaFabricacion || 'Sin línea');
    if (!acc[linea]) {
      acc[linea] = [];
    }
    acc[linea].push(row);
    return acc;
  }, {} as { [key: string]: any[] });

  const lineasOrdenadas = Object.keys(datosAgrupados).sort();

  const handleExportCSV = () => {
    const dataToExport = datosFiltrados.map((row: any) => ({
      CodMaterial: row.CodMaterial || '',
      Descripcion: row.NombreMaterial || row.CodMaterial || '',
      Centro: row.CentroFabricacion || row.Centro || '',
      Linea: row.lineaRef || row.LineaFabricacion || '',
      PuestoTrabajo: row.PuestoCuellodeBottella || '',
      NumeroPuestos: safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 0),
      Sector: row.Sector || '',
      Responsable: row.NombRespControlProd || row.RespCtrlProd || '',
      NecesidadTotal: safeNumber(row._Necesidades ?? 0),
      TiempoPorUnidad: safeNumber(row.TiempoPorUnidad ?? 0),
      TiempoUnitarioPorPuesto: safeNumber(row.tiempoUnitarioPorPuesto ?? 0),
      TiempoTotalNecesidad: safeNumber(row.tiempoTotalNecesidad ?? 0),
      ParticipacionPorcentaje: safeNumber(row.participacionIndividual ?? 0),
      NecesidadMaximaFabricar: safeNumber(row.necesidadMaximaAFabricar ?? 0),
      TMaxProm: safeNumber(row.tMaxProm ?? 0),
      NecesidadTraslado: safeNumber(row.necesidadTraslado ?? 0)
    }));
    
    exportToXLSX(dataToExport, `Detalle_${titulo.replace(/\s+/g, '_')}`);
  };

  return (
    <div className="mb-8 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">{titulo}</h3>
          <p className="text-sm text-gray-500 mt-1">{datosFiltrados.length} registros encontrados</p>
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
        <div className="flex gap-4 flex-wrap items-center">
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

          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Buscar CodMaterial..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="border border-gray-300 px-3 py-1.5 rounded-md text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-48"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">CodMaterial</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Línea</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Puesto Trabajo</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Num Puestos</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Sector</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Responsable</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Necesidades</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">T/Unidad</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-indigo-600 uppercase tracking-wider">T/U÷Puestos</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">T. Total</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Partic. %</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Nec. Máx</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Traslado</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">T. Máx.</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-orange-600 uppercase tracking-wider">T.Max Prom</th>
              <th className="px-3 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">H. Extras</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {lineasOrdenadas.map((linea) => (
              <React.Fragment key={linea}>
                <tr className="bg-blue-50">
                  <td colSpan={18} className="px-4 py-2 font-semibold text-blue-800 text-sm">
                    <span className="inline-flex items-center">
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      Línea: {linea}
                    </span>
                  </td>
                </tr>
                {datosAgrupados[linea].map((row: any, idx: number) => {
                  const necesidades = computeNecesidadesLocal(row);
                  const necesidadTraslado = Math.max(0, Math.round(necesidades) - row.necesidadMaximaAFabricar);
                  return (
                    <tr key={`${linea}-${idx}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{row.CodMaterial ?? '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-600 max-w-48 truncate" title={row.Descripcion ?? ''}>{row.Descripcion ?? '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-600">{row.CentroFabricacion || row.Centro || '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-600">{row.LineaFabricacion ?? '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-600">{row.PuestoCuellodeBottella ?? '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-gray-600">{row.NumeroPuestos ?? row.numero_puestos ?? '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-600">{row.Sector ?? '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-gray-600">{row.NombRespControlProd ?? row.RespCtrlProd ?? '-'}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-gray-700">{Math.round(necesidades).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-gray-600">
                        {row.TiempoPorUnidad != null
                          ? Number(row.TiempoPorUnidad).toLocaleString(undefined, { maximumFractionDigits: 3 })
                          : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-indigo-600 font-semibold">
                        {row.tiempoUnitarioPorPuesto != null
                          ? Number(row.tiempoUnitarioPorPuesto).toLocaleString(undefined, { maximumFractionDigits: 3 })
                          : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-gray-600">
                        {row.tiempoTotalNecesidad != null
                          ? Number(row.tiempoTotalNecesidad).toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-gray-600">{row.participacionIndividual}%</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-emerald-600 font-medium">{row.necesidadMaximaAFabricar.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono">
                        {necesidadTraslado > 0 ? (
                          <span className="text-amber-600 font-medium">{necesidadTraslado.toLocaleString()}</span>
                        ) : (
                          <span className="text-gray-400">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-blue-600">
                        {(safeNumber(row.TiempoPorUnidad ?? 0) * safeNumber(row.necesidadMaximaAFabricar ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-orange-600 font-semibold">
                        {row.tMaxProm != null
                          ? Number(row.tMaxProm).toLocaleString(undefined, { maximumFractionDigits: 2 })
                          : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono text-purple-600">{Number(row.horasExtrasUsadas).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
                {(() => {
                  const filasLinea = datosAgrupados[linea];
                  const totalNecesidades = filasLinea.reduce((sum: number, row: any) => sum + computeNecesidadesLocal(row), 0);
                  const totalTiempoPorUnidad = filasLinea.reduce((sum: number, row: any) => sum + safeNumber(row.TiempoPorUnidad ?? 0), 0);
                  const totalTiempoUnitarioPorPuesto = filasLinea.reduce((sum: number, row: any) => sum + safeNumber(row.tiempoUnitarioPorPuesto ?? 0), 0);
                  const totalTiempoNecesidad = filasLinea.reduce((sum: number, row: any) => sum + safeNumber(row.tiempoTotalNecesidad ?? 0), 0);
                  const totalParticipacion = filasLinea.reduce((sum: number, row: any) => sum + safeNumber(row.participacionIndividual ?? 0), 0);
                  const totalNecesidadMax = filasLinea.reduce((sum: number, row: any) => sum + safeNumber(row.necesidadMaximaAFabricar ?? 0), 0);
                  const totalTiempoNecMax = filasLinea.reduce((sum: number, row: any) => sum + safeNumber(row.TiempoPorUnidad ?? 0) * safeNumber(row.necesidadMaximaAFabricar ?? 0), 0);
                  const totalTMaxProm = filasLinea.reduce((sum: number, row: any) => sum + safeNumber(row.tMaxProm ?? 0), 0);
                  const totalHorasExtras = filasLinea.reduce((sum: number, row: any) => sum + safeNumber(row.horasExtrasUsadas ?? 0), 0);
                  const totalNecesidadTraslado = Math.max(0, totalNecesidades - totalNecesidadMax);
                  
                  return (
                    <tr className="bg-gray-100">
                      <td colSpan={8} className="px-3 py-2.5 text-sm font-semibold text-gray-700">Subtotal {linea}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-gray-700">{Math.round(totalNecesidades).toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-gray-700">{totalTiempoPorUnidad.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-indigo-700">{totalTiempoUnitarioPorPuesto.toLocaleString(undefined, { maximumFractionDigits: 3 })}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-gray-700">{totalTiempoNecesidad.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-gray-700">{totalParticipacion.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-emerald-700">{totalNecesidadMax.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-amber-700">{totalNecesidadTraslado.toLocaleString()}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-blue-700">{totalTiempoNecMax.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-orange-700">{totalTMaxProm.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 text-sm text-right font-mono font-semibold text-purple-700">{totalHorasExtras.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })()}
              </React.Fragment>
            ))}
          </tbody>
          <tfoot>
            {(() => {
              const totalNecesidadesGlobal = datosFiltrados.reduce((sum: number, row: any) => sum + computeNecesidadesLocal(row), 0);
              const totalTiempoNecesidadGlobal = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.tiempoTotalNecesidad ?? 0), 0);
              const totalParticipacionGlobal = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.participacionIndividual ?? 0), 0);
              const totalNecesidadMaxGlobal = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.necesidadMaximaAFabricar ?? 0), 0);
              const totalTiempoNecMaxGlobal = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.TiempoPorUnidad ?? 0) * safeNumber(row.necesidadMaximaAFabricar ?? 0), 0);
              const totalHorasExtrasGlobal = datosFiltrados.reduce((sum: number, row: any) => sum + safeNumber(row.horasExtrasUsadas ?? 0), 0);
              const totalNecesidadTrasladoGlobal = Math.max(0, totalNecesidadesGlobal - totalNecesidadMaxGlobal);
              
              return (
                <tr className="bg-gray-800 text-white">
                  <td colSpan={6} className="px-3 py-3 text-sm font-bold">TOTAL GENERAL</td>
                  <td className="px-3 py-3 text-sm text-right font-mono font-bold">{Math.round(totalNecesidadesGlobal).toLocaleString()}</td>
                  <td className="px-3 py-3"></td>
                  <td className="px-3 py-3 text-sm text-right font-mono font-bold">{totalTiempoNecesidadGlobal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-3 text-sm text-right font-mono font-bold">{totalParticipacionGlobal.toLocaleString(undefined, { maximumFractionDigits: 2 })}%</td>
                  <td className="px-3 py-3 text-sm text-right font-mono font-bold text-emerald-300">{totalNecesidadMaxGlobal.toLocaleString()}</td>
                  <td className="px-3 py-3 text-sm text-right font-mono font-bold text-amber-300">{totalNecesidadTrasladoGlobal.toLocaleString()}</td>
                  <td className="px-3 py-3 text-sm text-right font-mono font-bold text-blue-300">{totalTiempoNecMaxGlobal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                  <td className="px-3 py-3 text-sm text-right font-mono font-bold text-purple-300">{totalHorasExtrasGlobal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                </tr>
              );
            })()}
          </tfoot>
        </table>
      </div>
    </div>
  );
};
