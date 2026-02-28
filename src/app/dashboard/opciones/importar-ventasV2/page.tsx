'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { DataImportSection } from '@/components';
import { serviciosService } from '@/services/servicios.service';

export default function ImportarVentasPage() {
  const [filters, setFilters] = useState({ años: ['2026'], meses: [], centros: [] });

  return (
    <div>
      <DataImportSection onDataImported={() => {}} onFiltersChange={setFilters} />
      <div className="p-6 md:p-8">
        <h3 className="text-lg font-semibold mb-4">Datos importados del Backend - CRUDOS</h3>
        <RawBackendDataTable filters={filters} />
      </div>
    </div>
  );
}

const safeNumber = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function computeNecesidades(row: any) {
  const unidadesProy = safeNumber(row.UnidadesProyectado ?? 0);
  const stockSeg = safeNumber(row.StockSeguridad ?? 0);
  const stockAct = safeNumber(row.StockActual ?? 0);
  return unidadesProy + Math.max(0, stockSeg - stockAct);
}

const MONTH_NAMES_TABLE = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const RawBackendDataTable: React.FC<{ filters: { años: string[]; meses: string[]; centros: string[] } }> = ({ filters: externalFilters }) => {
  const [pageSize, setPageSize] = useState<number>(20);
  const [page, setPage] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [rawData, setRawData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [localMeses, setLocalMeses] = useState<string[]>([]);

  // Usar meses locales si están seleccionados, sino usar los externos
  const filters = { ...externalFilters, meses: localMeses.length > 0 ? localMeses : externalFilters.meses };

  const VISIBLE_COLUMNS = ['Mes', 'CodMaterial', 'Centro', 'CentroFabricacion', 'ClaseAprovisionam', 'UnidadesProyectado', 'StockActual', 'StockSeguridad', 'Sector', 'LineaFabricacion'];

  useEffect(() => {
    // Solo cargar si hay meses específicamente seleccionados
    if (localMeses.length === 0) {
      setRawData([]);
      return;
    }

    const loadData = async () => {
      setIsLoading(true);
      setError('');
      try {
        // Preparar filtros
        const yearsToLoad = filters.años.length > 0 ? filters.años.map(Number) : [2026];
        const monthsToLoad = localMeses.map(m => String(Number(m)));
        const centrosToLoad = filters.centros.length > 0 ? filters.centros : ['1000'];

        let allData: any[] = [];

        // Iterar sobre años, meses y centros
        for (const year of yearsToLoad) {
          for (const month of monthsToLoad) {
            for (const centro of centrosToLoad) {
              let pageNum = 1;
              let hasMoreData = true;
              
              while (hasMoreData) {
                const response = await serviciosService.getMaestroPorMesesYAnio(
                  String(year),
                  centro,
                  month,
                  pageNum,
                  50000
                );
                
                const items = response.data || [];
                if (items.length > 0) {
                  allData = [...allData, ...items];
                  if (items.length < 50000) {
                    hasMoreData = false;
                  } else {
                    pageNum++;
                  }
                } else {
                  hasMoreData = false;
                }
              }
            }
          }
        }

        setRawData(allData);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [localMeses]);

  const filteredData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [] as any[];
    const q = String(searchTerm || '').trim().toLowerCase();
    if (q === '') return rawData;
    return rawData.filter((row: any) => {
      return String(row.CodMaterial || '').toLowerCase().includes(q);
    });
  }, [rawData, searchTerm]);

  const totalPages = Math.max(1, Math.ceil((filteredData?.length || 0) / pageSize));
  if (page > totalPages) setPage(totalPages);

  const pageData = useMemo(() => {
    const start = (page - 1) * pageSize;
    return (filteredData || []).slice(start, start + pageSize);
  }, [filteredData, page, pageSize]);

  if (rawData.length === 0 && filters.meses.length === 0) {
    return <div className="p-4 text-center text-gray-600">Selecciona un mes para ver los datos</div>;
  }

  if (isLoading) {
    return <div className="p-4 text-center">Cargando datos crudos del backend...</div>;
  }

  if (error) {
    return <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded">Error: {error}</div>;
  }

  if (rawData.length === 0) {
    return <div className="p-4 text-center text-gray-600">No hay datos disponibles para el mes seleccionado</div>;
  }

  return (
    <div className="bg-white border rounded shadow-sm p-4">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="flex items-center space-x-2">
          <label className="text-sm font-medium">Mes:</label>
          <select 
            value={localMeses.length > 0 ? localMeses[0] : ''} 
            onChange={(e) => {
              const mes = e.target.value;
              setLocalMeses(mes ? [mes] : []);
              setPage(1);
            }} 
            className="border px-3 py-1 rounded text-sm"
          >
            <option value="">Todos los meses</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={String(i + 1)}>
                {i + 1} - {MONTH_NAMES_TABLE[i]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <label className="text-sm">Filas por página:</label>
          <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }} className="border px-2 py-1 rounded">
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>

        <div className="flex items-center space-x-3 ml-auto">
          <input
            type="search"
            placeholder="Buscar por CodMaterial"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            className="border px-2 py-1 rounded text-sm"
          />
          <div className="text-sm text-gray-600">Total registros: {filteredData?.length ?? 0}</div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm table-auto border-collapse">
          <thead className="bg-gray-100 sticky top-0">
            <tr>
              {VISIBLE_COLUMNS.map(col => (
                <th key={col} className="p-2 text-left border border-gray-300 whitespace-nowrap">{col}</th>
              ))}
              <th className="p-2 text-left border border-gray-300 whitespace-nowrap">Necesidades de fabricacion</th>
            </tr>
          </thead>
          <tbody>
            {pageData.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                {VISIBLE_COLUMNS.map(col => (
                  <td key={`${idx}-${col}`} className="p-2 border border-gray-300">{String((row as any)[col] ?? '')}</td>
                ))}
                <td className="p-2 border border-gray-300 font-mono text-right">{Math.round(computeNecesidades(row)).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3">
        <div className="text-sm">Página {page} / {totalPages}</div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 border rounded disabled:opacity-50">Primera</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 border rounded disabled:opacity-50">Anterior</button>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 border rounded disabled:opacity-50">Siguiente</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 border rounded disabled:opacity-50">Última</button>
        </div>
      </div>
    </div>
  );
};
