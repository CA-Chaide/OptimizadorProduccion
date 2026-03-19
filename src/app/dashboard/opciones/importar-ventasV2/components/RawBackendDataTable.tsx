'use client';

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { MONTH_NUMBERS, VISIBLE_COLUMNS } from './constants';
import { computeNecesidades } from './utils';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { serviciosService } from '@/services/servicios.service';

interface RawBackendDataTableProps {
  año: string;
  meses: string[];
  centros: string[];
  onDataLoaded?: (data: any[]) => void;
}

export interface RawBackendDataTableHandle {
  loadData: () => Promise<void>;
}

export const RawBackendDataTable = forwardRef<RawBackendDataTableHandle, RawBackendDataTableProps>(
  ({ año, meses, centros, onDataLoaded }, ref) => {
    const [pageSize, setPageSize] = useState<number>(20);
    const [page, setPage] = useState<number>(1);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [rawData, setRawData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [totalRecords, setTotalRecords] = useState<number>(0);
    const [processedRecords, setProcessedRecords] = useState<number>(0);
    const [totalRecordsTarget, setTotalRecordsTarget] = useState<number>(0);
    const [loadingPhase, setLoadingPhase] = useState<'downloading' | 'calculating' | null>(null);
    const [batchSize, setBatchSize] = useState<number>(10); // Número de consultas paralelas

    // Filtros adicionales
    const [filterCentroFab, setFilterCentroFab] = useState<string[]>([]);
    const [filterSector, setFilterSector] = useState<string[]>([]);
    const [filterRespName, setFilterRespName] = useState<string[]>([]);

    // Función para procesar en lotes
    const processInBatches = async <T, R>(
      items: T[],
      processor: (item: T) => Promise<R>,
      concurrency: number,
      onProgress?: () => void
    ): Promise<R[]> => {
      const results: R[] = [];
      
      for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(
          batch.map(async (item) => {
            const result = await processor(item);
            onProgress?.();
            return result;
          })
        );
        results.push(...batchResults);
      }
      
      return results;
    };

    useImperativeHandle(ref, () => ({
      loadData: async () => {
        if (!año || meses.length === 0 || centros.length === 0) {
          alert('Faltan datos para cargar');
          return;
        }

        setIsLoading(true);
        setLoadingPhase('downloading');
        setError('');
        setRawData([]);
        setPage(1);
        setTotalRecords(0);
        setProcessedRecords(0);
        setTotalRecordsTarget(0);

        try {
          const mesNums = meses.map(mes => {
            const asNumber = Number(mes);
            if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= 12) {
              return asNumber;
            }
            return MONTH_NUMBERS[mes as keyof typeof MONTH_NUMBERS];
          }).filter(Boolean);
          
          const mesString = mesNums.join('&');
          let allData: any[] = [];

          for (const centro of centros) {
            const firstResponse = await serviciosService.getMaestroPorMesesYAnio(
              año,
              centro,
              mesString,
              1,
              1
            );

            const total = firstResponse.totalRegistros || firstResponse.data?.length || 0;

            if (total === 0) {
              continue;
            }

            setTotalRecordsTarget(prevTotal => prevTotal + total);

            const pagSize = 50000;
            const totalPages = Math.ceil(total / pagSize);

            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
              const response = await serviciosService.getMaestroPorMesesYAnio(
                año,
                centro,
                mesString,
                pageNum,
                pagSize
              );

              const items = response.data || [];
              allData = [...allData, ...items];
              setProcessedRecords(prevCount => prevCount + items.length);
            }
          }

          setTotalRecords(allData.length);

          const dataWithNecesidades = allData.map((r: any) => ({ ...r, _Necesidades: computeNecesidades(r) }));

          setLoadingPhase('calculating');

          const filasParaCalcular = dataWithNecesidades.filter((r: any) => {
            const centroFab = String(r.CentroFabricacion || r.Centro || '');
            const resp = String(r.RespCtrlProd || '');
            const aplicar1000 = centroFab === '1000' && (resp === '003' || resp === '004');
            const aplicar2000 = centroFab === '2000' && (resp === '003' || resp === '006');
            return aplicar1000 || aplicar2000;
          });

          dataWithNecesidades.forEach((r: any) => {
            const centroFab = String(r.CentroFabricacion || r.Centro || '');
            const resp = String(r.RespCtrlProd || '');
            const aplicar1000 = centroFab === '1000' && (resp === '003' || resp === '004');
            const aplicar2000 = centroFab === '2000' && (resp === '003' || resp === '006');
            if (!(aplicar1000 || aplicar2000)) {
              r.TiempoFabricacionNecesidad = null;
            }
          });

          setTotalRecordsTarget(filasParaCalcular.length);
          setProcessedRecords(0);

          // Procesar consultas en lotes paralelos (batchSize a la vez)
          await processInBatches(
            filasParaCalcular,
            async (r: any) => {
              const centroFab = String(r.CentroFabricacion || r.Centro || '');
              const CodigoMaterial = String(r.CodMaterial || '');
              const LineaFabricacion = String(r.LineaFabricacion || '');
              const Categoria = String(r.Categoria || r.ClaseAprovisionam || '');
              const Necesidad = Math.round(Number(r._Necesidades ?? 0));

              try {
                const res = await serviciosService.getTiempoMaximoDeFabricacionMaterial(CodigoMaterial, centroFab, LineaFabricacion, Categoria, Necesidad);
                let tiempoMin: number | null = null;
                let puestoTrabajo: string | null = null;
                let tiempoMinPorUnidad: number | null = null;
                let numeroPuestos: number | null = null;
                if (res) {
                  const payload = Array.isArray(res.data) ? res.data[0] : res.data;
                  tiempoMin = payload?.Tiempo_Total ?? payload?.TiempoTotal ?? payload?.Tiempo_Min ?? null;
                  puestoTrabajo = payload?.PuestoTrabajo ?? null;
                  tiempoMinPorUnidad = payload?.Tiempo_Min ?? null;
                  numeroPuestos = payload?.numero_puestos ?? null;
                }
                r.TiempoFabricacionNecesidad = tiempoMin;
                r.TiempoFabricacionNecesidadHoras = tiempoMin != null ? Number((Number(tiempoMin) / 60).toFixed(3)) : null;
                r.PuestoCuellodeBottella = puestoTrabajo;
                r.TiempoPorUnidad = tiempoMinPorUnidad;
                r.NumeroPuestos = numeroPuestos;
              } catch (err) {
                console.error('Error al obtener tiempo fabricación para', { CodigoMaterial, CentroFabricacion: centroFab, LineaFabricacion, Categoria, Necesidad }, err);
                r.TiempoFabricacionNecesidad = null;
                r.TiempoFabricacionNecesidadHoras = null;
                r.PuestoCuellodeBottella = null;
                r.TiempoPorUnidad = null;
                r.NumeroPuestos = null;
              }
            },
            batchSize,
            () => setProcessedRecords(prev => prev + 1)
          );

          setRawData(dataWithNecesidades);
          if (onDataLoaded) {
            onDataLoaded(dataWithNecesidades);
          }
        } catch (err) {
          const errorMsg = (err as Error).message;
          console.error('Error cargando datos:', errorMsg);
          setError(errorMsg);
        } finally {
          setIsLoading(false);
          setLoadingPhase(null);
        }
      }
    }), [año, meses, centros]);

    // Opciones derivadas de los datos cargados
    const centroFabOptions = Array.from(new Set(rawData.map((r: any) => String(r.CentroFabricacion || r.Centro || '').trim()).filter(Boolean))).map(v => ({ value: v, label: v }));
    const sectorOptions = Array.from(new Set(rawData.map((r: any) => String(r.Sector ?? '').trim()).filter(Boolean))).map(v => ({ value: v, label: v }));
    const respNameOptions = Array.from(new Set(rawData.map((r: any) => String(r.NombRespControlProd ?? r.NomRespControlProd ?? r.NombRespCtrlProd ?? r.RespCtrlProd ?? '').trim()).filter(Boolean))).map(v => ({ value: v, label: v }));

    // Filtrar datos
    const filteredData = rawData.filter((row: any) => {
      if (searchTerm) {
        const q = String(searchTerm).toLowerCase();
        if (!String(row.CodMaterial || '').toLowerCase().includes(q)) return false;
      }

      if (filterCentroFab.length > 0) {
        const val = String(row.CentroFabricacion || row.Centro || '');
        if (!filterCentroFab.includes(val)) return false;
      }

      if (filterSector.length > 0) {
        const val = String(row.Sector ?? '');
        if (!filterSector.includes(val)) return false;
      }

      if (filterRespName.length > 0) {
        const val = String(row.NombRespControlProd ?? row.NomRespControlProd ?? row.NombRespCtrlProd ?? row.RespCtrlProd ?? '');
        if (!filterRespName.includes(val)) return false;
      }

      return true;
    });

    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));

    useEffect(() => {
      if (page > totalPages) {
        setPage(totalPages);
      }
    }, [totalPages]);

    const pageData = filteredData.slice(
      (page - 1) * pageSize,
      page * pageSize
    );

    if (meses.length === 0 || centros.length === 0) {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Sin datos</h3>
          <p className="mt-1 text-sm text-gray-500">Usa los filtros de arriba y haz click en "Cargar Datos"</p>
        </div>
      );
    }

    if (isLoading) {
      const progressPercent = totalRecordsTarget > 0 ? Math.min((processedRecords / totalRecordsTarget) * 100, 100) : 0;
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="max-w-md mx-auto space-y-6">
            {/* Fase 1: Descarga */}
            <div className={`p-4 rounded-lg border-2 transition-colors ${
              loadingPhase === 'downloading' ? 'bg-blue-50 border-blue-300' : 'bg-green-50 border-green-300'
            }`}>
              <div className="flex items-center gap-3">
                {loadingPhase === 'downloading' ? (
                  <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                <span className={`font-medium ${loadingPhase === 'downloading' ? 'text-blue-700' : 'text-green-700'}`}>
                  1. Descargando datos del backend
                  {loadingPhase !== 'downloading' && totalRecords > 0 && ` (${totalRecords.toLocaleString()} registros)`}
                </span>
              </div>
            </div>

            {/* Fase 2: Cálculo */}
            <div className={`p-4 rounded-lg border-2 transition-colors ${
              loadingPhase === 'calculating' ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                {loadingPhase === 'calculating' ? (
                  <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <div className="h-5 w-5 rounded-full border-2 border-gray-300"></div>
                )}
                <div>
                  <span className={`font-medium ${loadingPhase === 'calculating' ? 'text-blue-700' : 'text-gray-400'}`}>
                    2. Calculando tiempos de fabricación
                  </span>
                  {loadingPhase === 'calculating' && (
                    <span className="ml-2 text-xs text-blue-500 bg-blue-100 px-2 py-0.5 rounded-full">
                      {batchSize} consultas en paralelo
                    </span>
                  )}
                </div>
              </div>

              {loadingPhase === 'calculating' && totalRecordsTarget > 0 && (
                <div className="ml-8">
                  <div className="flex justify-between text-sm text-gray-600 mb-1">
                    <span>{processedRecords.toLocaleString()} de {totalRecordsTarget.toLocaleString()}</span>
                    <span>{Math.round(progressPercent)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div 
                      className="bg-blue-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <svg className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-red-800">Error al cargar datos</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      );
    }

    if (rawData.length === 0 && !isLoading) {
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No hay datos</h3>
          <p className="mt-1 text-sm text-gray-500">No hay datos disponibles para los filtros seleccionados</p>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={async () => ref && 'current' in ref && ref.current?.loadData()}
                disabled={isLoading}
                className="inline-flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-md font-medium text-sm transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Recargar ({rawData.length.toLocaleString()})
              </button>

              <select 
                value={pageSize} 
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} 
                className="border border-gray-300 px-3 py-2 rounded-md text-sm bg-white"
              >
                <option value={20}>20 filas</option>
                <option value={50}>50 filas</option>
                <option value={100}>100 filas</option>
              </select>

              {/* Control de consultas paralelas */}
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600 whitespace-nowrap">Consultas paralelas:</label>
                <select 
                  value={batchSize} 
                  onChange={e => setBatchSize(Number(e.target.value))} 
                  className="border border-gray-300 px-2 py-2 rounded-md text-sm bg-white"
                  title="Número de consultas simultáneas al calcular tiempos de fabricación"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={15}>15</option>
                  <option value={20}>20</option>
                  <option value={25}>25</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-40">
                <MultiSelectDropdown
                  label="Centro"
                  options={centroFabOptions}
                  selected={filterCentroFab}
                  onChange={(v) => { setFilterCentroFab(v); setPage(1); }}
                  disabled={false}
                />
              </div>
              <div className="w-48">
                <MultiSelectDropdown
                  label="Responsable"
                  options={respNameOptions}
                  selected={filterRespName}
                  onChange={(v) => { setFilterRespName(v); setPage(1); }}
                  disabled={false}
                />
              </div>
              <div className="w-40">
                <MultiSelectDropdown
                  label="Sector"
                  options={sectorOptions}
                  selected={filterSector}
                  onChange={(v) => { setFilterSector(v); setPage(1); }}
                  disabled={false}
                />
              </div>
              <div className="relative">
                <input
                  type="search"
                  placeholder="Buscar CodMaterial..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
                  className="border border-gray-300 pl-9 pr-3 py-2 rounded-md text-sm w-48"
                />
                <svg className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-gray-50">
              <tr className="bg-gray-50 border-b border-gray-200">
                {VISIBLE_COLUMNS.map(col => (
                  <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">{col}</th>
                ))}
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Necesidades</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Puesto CB</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">T/Unidad</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap"># Puestos</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">T.Fab (min)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">T.Fab (h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageData.map((row, idx) => {
                const necesidades = computeNecesidades(row);
                const esNegativo = necesidades < 0;
                const valorMostrado = Math.max(0, Math.round(necesidades));
                
                return (
                  <tr key={`${page}-${idx}`} className="hover:bg-gray-50 transition-colors">
                    {VISIBLE_COLUMNS.map(col => (
                      <td key={`${idx}-${col}`} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{String((row as any)[col] ?? '')}</td>
                    ))}
                    <td className={`px-4 py-3 text-sm font-mono text-right ${esNegativo ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                      {valorMostrado.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {(row as any).PuestoCuellodeBottella ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                      {(row as any).TiempoPorUnidad != null
                        ? Number((row as any).TiempoPorUnidad).toLocaleString(undefined, { maximumFractionDigits: 3 })
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                      {(row as any).NumeroPuestos != null
                        ? Number((row as any).NumeroPuestos).toLocaleString(undefined, { maximumFractionDigits: 0 })
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                      {(row as any).TiempoFabricacionNecesidad != null
                        ? Number((row as any).TiempoFabricacionNecesidad).toLocaleString(undefined, { maximumFractionDigits: 3 })
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-mono text-gray-700">
                      {(row as any).TiempoFabricacionNecesidadHoras != null
                        ? Number((row as any).TiempoFabricacionNecesidadHoras).toLocaleString(undefined, { maximumFractionDigits: 3 })
                        : '-'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Mostrando {((page - 1) * pageSize) + 1} - {Math.min(page * pageSize, filteredData.length)} de {filteredData.length.toLocaleString()} registros
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setPage(1)} 
              disabled={page === 1} 
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Primera
            </button>
            <button 
              onClick={() => setPage(p => Math.max(1, p - 1))} 
              disabled={page === 1} 
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="px-3 py-1.5 text-sm text-gray-700">
              Página {page} de {totalPages}
            </span>
            <button 
              onClick={() => setPage(p => Math.min(totalPages, p + 1))} 
              disabled={page === totalPages} 
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Siguiente
            </button>
            <button 
              onClick={() => setPage(totalPages)} 
              disabled={page === totalPages} 
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Última
            </button>
          </div>
        </div>
      </div>
    );
  }
);

RawBackendDataTable.displayName = 'RawBackendDataTable';
