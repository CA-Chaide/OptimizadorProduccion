
'use client';

import React, { useState, forwardRef, useImperativeHandle } from 'react';
import { MONTH_NUMBERS, VISIBLE_COLUMNS } from './constants';
import { computeNecesidades, normalizeMaterialCode } from './utils';
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
    const [pageSize] = useState<number>(20);
    const [page, setPage] = useState<number>(1);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [rawData, setRawData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [, setError] = useState<string>('');
    const [totalRecordsTarget, setTotalRecordsTarget] = useState<number>(0);
    const [processedRecords, setProcessedRecords] = useState<number>(0);
    const [loadingPhase, setLoadingPhase] = useState<'downloading' | 'calculating' | null>(null);
    const [batchSize] = useState<number>(10);

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
        setProcessedRecords(0);
        setTotalRecordsTarget(0);

        try {
          const mesNums = meses.map(mes => {
            const asNumber = Number(mes);
            if (!Number.isNaN(asNumber) && asNumber >= 1 && asNumber <= 12) return asNumber;
            return MONTH_NUMBERS[mes as keyof typeof MONTH_NUMBERS];
          }).filter(Boolean);
          
          const mesString = mesNums.join('&');
          let allData: any[] = [];

          for (const centro of centros) {
            const firstResponse = await serviciosService.getMaestroPorMesesYAnio(año, centro, mesString, 1, 1);
            const total = firstResponse.totalRegistros || firstResponse.data?.length || 0;
            if (total === 0) continue;

            const pagSize = 50000;
            const totalPages = Math.ceil(total / pagSize);

            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
              const response = await serviciosService.getMaestroPorMesesYAnio(año, centro, mesString, pageNum, pagSize);
              const items = response.data || [];
              allData = [...allData, ...items];
            }
          }

          // Agregación por material y preservación de stock máximo
          const dataAgrupadaMap = new Map<string, any>();
          
          allData.forEach((item: any) => {
            const code = normalizeMaterialCode(item.CodMaterial);
            const mes = String(item.Mes);
            const clase = String(item.ClaseAprovisionam || '').trim().toUpperCase();
            
            const centroFabResponsable = clase === 'F' ? '1000' : String(item.Centro).trim();
            const key = `${code}|${mes}|${centroFabResponsable}`;
            
            if (!dataAgrupadaMap.has(key)) {
              dataAgrupadaMap.set(key, { 
                ...item, 
                UnidadesProyectado: 0,
                StockActual: 0,
                StockSeguridad: 0,
                _originalCentro: item.Centro,
                _isAgregatedF: clase === 'F'
              });
            }
            
            const agg = dataAgrupadaMap.get(key)!;
            agg.UnidadesProyectado += Number(item.UnidadesProyectado || 0);
            agg.StockActual = Math.max(agg.StockActual, Number(item.StockActual || 0));
            agg.StockSeguridad = Math.max(agg.StockSeguridad, Number(item.StockSeguridad || 0));
          });

          const dataFinalAgrupada = Array.from(dataAgrupadaMap.values());
          const dataWithNecesidades = dataFinalAgrupada.map((r: any) => ({ ...r, _Necesidades: computeNecesidades(r) }));

          setLoadingPhase('calculating');

          const filasParaCalcular = dataWithNecesidades.filter((r: any) => {
            const centroFab = String(r.CentroFabricacion || r.Centro || '');
            const resp = String(r.RespCtrlProd || '');
            const aplicar1000 = centroFab === '1000' && (resp === '003' || resp === '004');
            const aplicar2000 = centroFab === '2000' && (resp === '003' || resp === '006');
            return aplicar1000 || aplicar2000;
          });

          setTotalRecordsTarget(filasParaCalcular.length);
          setProcessedRecords(0);

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
                if (res && res.data) {
                  const payload = Array.isArray(res.data) ? res.data[0] : res.data;
                  r.TiempoFabricacionNecesidad = payload?.Tiempo_Total ?? null;
                  r.PuestoCuellodeBottella = payload?.PuestoTrabajo ?? null;
                  r.TiempoPorUnidad = payload?.Tiempo_Min ?? null;
                  r.NumeroPuestos = payload?.numero_puestos ?? null;
                  r.TiempoFabricacionNecesidadHoras = r.TiempoFabricacionNecesidad != null ? Number((Number(r.TiempoFabricacionNecesidad) / 60).toFixed(3)) : null;
                }
              } catch (err) {
                console.error('Error al obtener tiempo fabricación para', CodigoMaterial, err);
              }
            },
            batchSize,
            () => setProcessedRecords(prev => prev + 1)
          );

          setRawData(dataWithNecesidades);
          if (onDataLoaded) onDataLoaded(dataWithNecesidades);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setIsLoading(false);
          setLoadingPhase(null);
        }
      }
    }), [año, meses, centros, onDataLoaded, batchSize]);

    const filteredData = rawData.filter((row: any) => {
      if (searchTerm && !String(row.CodMaterial || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });

    const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
    const pageData = filteredData.slice((page - 1) * pageSize, page * pageSize);

    if (isLoading) {
      const progressPercent = totalRecordsTarget > 0 ? Math.min((processedRecords / totalRecordsTarget) * 100, 100) : 0;
      return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="max-w-md mx-auto space-y-4">
            <h3 className="font-bold text-lg text-blue-800">
              {loadingPhase === 'downloading' ? '1. Descargando datos del backend...' : '2. Calculando tiempos por cuello de botella...'}
            </h3>
            <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
              <div className="bg-blue-600 h-full transition-all duration-300" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="text-sm text-gray-600">{processedRecords.toLocaleString()} de {totalRecordsTarget.toLocaleString()}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <input type="search" placeholder="Buscar material..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
            </div>
            <button onClick={() => ref && 'current' in ref && (ref.current as any)?.loadData()} className="bg-green-600 text-white px-4 py-2 rounded-md font-bold text-sm hover:bg-green-700 transition">
              Cargar y Agrupar
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b">
              <tr>
                {VISIBLE_COLUMNS.map(col => <th key={`head-col-${col}`} className="px-4 py-3 text-left font-semibold uppercase">{col}</th>)}
                <th className="px-4 py-3 text-right font-bold text-blue-700">Nec. Agrupada</th>
                <th className="px-4 py-3 text-left">Puesto CB</th>
                <th className="px-4 py-3 text-right">T. Fab (min)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageData.map((row, idx) => (
                <tr key={`raw-row-${row.CodMaterial}-${idx}`} className={`hover:bg-gray-50 ${row._isAgregatedF ? 'bg-blue-50/30' : ''}`}>
                  {VISIBLE_COLUMNS.map(col => <td key={`cell-${idx}-${col}`} className="px-4 py-2">{String(row[col] ?? '')}</td>)}
                  <td className="px-4 py-2 text-right font-mono font-bold text-blue-800">{Math.round(row._Necesidades).toLocaleString()}</td>
                  <td className="px-4 py-2">{row.PuestoCuellodeBottella || '-'}</td>
                  <td className="px-4 py-2 text-right font-mono">{row.TiempoFabricacionNecesidad != null ? row.TiempoFabricacionNecesidad.toLocaleString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        <div className="p-4 bg-gray-50 border-t flex justify-between items-center text-xs">
          <span>Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 border rounded bg-white">Anterior</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 border rounded bg-white">Siguiente</button>
          </div>
        </div>
      </div>
    );
  }
);

RawBackendDataTable.displayName = 'RawBackendDataTable';
