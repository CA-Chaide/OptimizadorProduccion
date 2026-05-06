'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, AlertTriangle, DatabaseZap, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MaterialExplosionItem {
  NIVEL: number;
  CENTRO: string;
  FERT_PRINCIPAL: string;
  DESCRIPCION_FERT: string;
  MATERIAL_PADRE: string;
  DESCRIPCION_PADRE: string;
  COMPONENTE: string;
  DESCRIPCION_COMPONENTE: string;
  CANTIDAD_UNITARIA: number;
  CANTIDAD_ACUMULADA: number;
}

export const MaestroMaterialesExplosionSection: React.FC = () => {
  const inspector = useRuntimeInspector('MaestroMaterialesExplosion');
  const { addNotification } = useAppContext();

  const [hasStarted, setHasStarted] = useState(false);
  const [data, setData] = useState<MaterialExplosionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [error, setError] = useState<string | null>(null);
  
  // Estado para búsqueda específica (ej: 30000440)
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const fetchData = useCallback(async (page: number, limit: number, search: string) => {
    setIsLoading(true);
    setError(null);
    try {
      logger.log(`[MaestroMateriales] Consultando API - Página ${page}${search ? ` - Filtro: ${search}` : ''}...`);
      
      // Pasamos el término de búsqueda a la API (el servicio ahora lo soporta)
      const response = await serviciosService.getMaestroMaterialesExplosion(page, limit, search);
      
      if (response && response.data) {
        setData(response.data);
        setTotalRecords(response.totalRegistros || 0);
        inspector.captureVariable('maestroMaterialesCount', response.data.length);
        inspector.captureVariable('filtroActivo', search);
      } else {
        setData([]);
        setTotalRecords(0);
      }
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      addNotification('error', `Error al cargar maestro de materiales: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector]);

  useEffect(() => {
    if (hasStarted) {
      fetchData(currentPage, rowsPerPage, activeSearch);
    }
  }, [currentPage, rowsPerPage, fetchData, hasStarted, activeSearch]);

  const totalPages = Math.ceil(totalRecords / rowsPerPage);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.max(1, Math.min(newPage, totalPages)));
  };

  const handleStartLoad = () => {
    setHasStarted(true);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchTerm);
    setCurrentPage(1); // Reset a la primera página al buscar
    if (!hasStarted) setHasStarted(true);
  };

  const clearSearch = () => {
    setSearchTerm('');
    setActiveSearch('');
    setCurrentPage(1);
  };

  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-bold text-gray-800 uppercase tracking-tight">Maestro Materiales (Explosión BOM)</h3>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Buscador de Material Principal */}
          <form onSubmit={handleSearch} className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Buscar Cod. FERT (ej: 30000440)" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-10 h-9 w-64 rounded-xl border-gray-200 focus:ring-indigo-500 text-xs font-bold uppercase"
            />
            {searchTerm && (
              <button 
                type="button" 
                onClick={clearSearch}
                className="absolute right-3 p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="w-3 h-3 text-gray-400" />
              </button>
            )}
            <Button type="submit" variant="ghost" className="hidden">Buscar</Button>
          </form>

          {hasStarted && (
            <div className="flex items-center gap-4 border-l pl-4 border-gray-100">
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                Total: <span className="text-indigo-600 font-black">{totalRecords.toLocaleString()}</span>
              </div>
              <select 
                value={rowsPerPage} 
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="text-[10px] font-bold border rounded-md px-2 py-1 bg-white uppercase focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {[20, 50, 100].map(n => <option key={n} value={n}>{n} filas</option>)}
              </select>
            </div>
          )}
        </div>
      </div>

      {!hasStarted ? (
        <div className="py-24 text-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 space-y-4">
          <DatabaseZap className="w-12 h-12 text-indigo-200 mx-auto" />
          <div className="max-w-sm mx-auto">
            <h3 className="text-sm font-bold text-gray-600 uppercase tracking-tight">Explosión de Materiales</h3>
            <p className="text-xs text-gray-400 mt-1 mb-6">Consulta la estructura jerárquica de componentes. Puedes buscar un código específico o cargar la lista general.</p>
            <div className="flex justify-center gap-3">
              <Button 
                onClick={handleStartLoad}
                className="rounded-xl px-8 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 font-bold uppercase text-[10px] tracking-widest h-10"
              >
                Cargar Lista General
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full border-collapse text-center text-[10px]">
              <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-100">
                <tr className="uppercase font-black text-gray-500 tracking-tighter">
                  <th className="px-3 py-4 border-r border-dashed">Nivel</th>
                  <th className="px-3 py-4 border-r border-dashed">Centro</th>
                  <th className="px-3 py-4 border-r border-dashed text-indigo-600">FERT Principal</th>
                  <th className="px-3 py-4 border-r border-dashed text-left">Descripción FERT</th>
                  <th className="px-3 py-4 border-r border-dashed">Mat. Padre</th>
                  <th className="px-3 py-4 border-r border-dashed text-left">Descripción Padre</th>
                  <th className="px-3 py-4 border-r border-dashed text-orange-600">Componente</th>
                  <th className="px-3 py-4 border-r border-dashed text-left">Descripción Componente</th>
                  <th className="px-3 py-4 border-r border-dashed text-right bg-slate-50">Cant. Unitaria</th>
                  <th className="px-3 py-4 text-right bg-slate-50">Cant. Acumulada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={10} className="py-24 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest animate-pulse">Consultando estructura de materiales...</p>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={10} className="py-24 text-center">
                      <div className="flex flex-col items-center justify-center gap-3 px-10">
                        <AlertTriangle className="w-10 h-10 text-red-500" />
                        <p className="text-sm font-bold text-red-600 uppercase">Error de Conexión</p>
                        <p className="text-xs text-gray-500">{error}</p>
                        <Button variant="outline" size="sm" onClick={() => fetchData(currentPage, rowsPerPage, activeSearch)} className="mt-2 rounded-xl">
                          Reintentar Carga
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-24 text-center text-gray-400 space-y-2">
                      <p className="italic">No se encontraron registros para "{activeSearch || 'esta página'}"</p>
                      {activeSearch && <Button variant="link" onClick={clearSearch} className="text-indigo-600">Limpiar filtros</Button>}
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => (
                    <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-3 py-3 border-r border-dashed font-bold bg-gray-50/30">{item.NIVEL}</td>
                      <td className="px-3 py-3 border-r border-dashed font-mono text-gray-400">{item.CENTRO || '—'}</td>
                      <td className="px-3 py-3 border-r border-dashed font-mono font-bold text-indigo-600">{String(item.FERT_PRINCIPAL || '').slice(-8)}</td>
                      <td className="px-3 py-3 border-r border-dashed max-w-[180px] truncate uppercase font-medium text-left">{item.DESCRIPCION_FERT}</td>
                      <td className="px-3 py-3 border-r border-dashed font-mono text-gray-400">{String(item.MATERIAL_PADRE || '').slice(-8)}</td>
                      <td className="px-3 py-3 border-r border-dashed max-w-[180px] truncate uppercase text-gray-400 text-left text-[9px]">{item.DESCRIPCION_PADRE}</td>
                      <td className="px-3 py-3 border-r border-dashed font-mono font-bold text-orange-600 bg-orange-50/10">{String(item.COMPONENTE || '').slice(-8)}</td>
                      <td className="px-3 py-3 border-r border-dashed max-w-[220px] truncate uppercase font-bold text-gray-700 text-left">{item.DESCRIPCION_COMPONENTE}</td>
                      <td className="px-3 py-3 border-r border-dashed text-right font-mono font-bold text-indigo-700 bg-slate-50/30">{Number(item.CANTIDAD_UNITARIA || 0).toFixed(3)}</td>
                      <td className="px-3 py-3 text-right font-mono font-bold text-slate-800 bg-slate-50/30">{Number(item.CANTIDAD_ACUMULADA || 0).toFixed(3)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasStarted && !isLoading && !error && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2 pb-6">
          <Button variant="outline" size="icon" onClick={() => handlePageChange(1)} disabled={currentPage === 1} className="h-8 w-8 rounded-xl border-gray-200 hover:bg-indigo-50 hover:border-indigo-200"><ChevronsLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="h-8 w-8 rounded-xl border-gray-200 hover:bg-indigo-50 hover:border-indigo-200"><ChevronLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-1 mx-4">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">Página</span>
            <span className="text-xs font-black text-indigo-600">{currentPage}</span>
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter">de {totalPages}</span>
          </div>
          <Button variant="outline" size="icon" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-8 w-8 rounded-xl border-gray-200 hover:bg-indigo-50 hover:border-indigo-200"><ChevronRight className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages} className="h-8 w-8 rounded-xl border-gray-200 hover:bg-indigo-50 hover:border-indigo-200"><ChevronsRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
};
