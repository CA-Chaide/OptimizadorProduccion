'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

  const [hasStarted, setHasStarted] = useState(true);
  const [data, setData] = useState<MaterialExplosionItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [error, setError] = useState<string | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('30001338');
  const [activeSearch, setActiveSearch] = useState('30001338');

  // Función para rellenar con ceros a la izquierda (total 18 dígitos)
  const padMaterialCode = (code: string): string => {
    if (!code) return '';
    const trimmed = code.trim();
    if (trimmed.length >= 18) return trimmed;
    return trimmed.padStart(18, '0');
  };

  const fetchData = useCallback(async (page: number, limit: number, search: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const paddedSearch = padMaterialCode(search);
      logger.log(`[MaestroMateriales] Consultando Explosión BOM para material: ${paddedSearch}...`);
      
      const response = await serviciosService.getMaestroMaterialesExplosion(page, limit, paddedSearch);
      
      // La API devuelve { data: [...], totalRegistros: 1043976 }
      if (response && response.data) {
        const actualData = Array.isArray(response.data) ? response.data : [];
        setData(actualData);
        setTotalRecords(response.totalRegistros || 0);
        
        inspector.captureVariable('maestroMaterialesCount', actualData.length);
        inspector.captureVariable('totalRegistrosDB', response.totalRegistros);
      } else {
        setData([]);
        setTotalRecords(0);
      }
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      addNotification('error', `Error de carga: ${msg}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector]);

  useEffect(() => {
    if (hasStarted && activeSearch) {
      fetchData(currentPage, rowsPerPage, activeSearch);
    }
  }, [currentPage, rowsPerPage, fetchData, hasStarted, activeSearch]);

  const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.max(1, Math.min(newPage, totalPages)));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setActiveSearch(searchTerm.trim());
    setCurrentPage(1);
    setHasStarted(true);
  };

  const clearSearch = () => {
    setSearchTerm('');
    setActiveSearch('');
    setData([]);
    setTotalRecords(0);
    setHasStarted(false);
  };

  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600"><ClipboardList className="w-5 h-5" /></div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 uppercase tracking-tight">Maestro Materiales (Explosión BOM)</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Consulta de Estructura Técnica</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <form onSubmit={handleSearch} className="relative flex items-center">
            <Search className="absolute left-3 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Cod. FERT (ej: 30001338)" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-10 h-9 w-64 rounded-xl border-gray-200 focus:ring-indigo-500 text-xs font-bold uppercase shadow-sm"
            />
            {searchTerm && (
              <button 
                type="button" 
                onClick={clearSearch}
                className="absolute right-3 p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-3 h-3 text-gray-400" />
              </button>
            )}
            <Button type="submit" variant="ghost" className="hidden">Buscar</Button>
          </form>

          {hasStarted && totalRecords > 0 && (
            <div className="flex items-center gap-4 border-l pl-4 border-gray-100">
              <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                Total Registros: <span className="text-indigo-600 font-black">{totalRecords.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {!hasStarted ? (
        <div className="py-24 text-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 space-y-4">
          <DatabaseZap className="w-12 h-12 text-indigo-200 mx-auto" />
          <div className="max-w-sm mx-auto">
            <h3 className="text-sm font-bold text-gray-600 uppercase tracking-tight">Consultar Explosión de Materiales</h3>
            <p className="text-xs text-gray-400 mt-1 mb-6">Ingrese un código para ver su estructura técnica de componentes.</p>
            <div className="flex justify-center">
              <Button 
                onClick={() => { setSearchTerm('30001338'); setActiveSearch('30001338'); setHasStarted(true); }}
                className="rounded-xl px-8 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200 font-black uppercase text-[10px] tracking-widest h-10"
              >
                Cargar "30001338"
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="border rounded-xl overflow-hidden bg-white shadow-xl border-gray-100">
          <div className="overflow-x-auto max-h-[600px] relative">
            <table className="w-full border-collapse text-center text-[10px] font-sans">
              <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
                <tr className="uppercase font-black text-gray-500 tracking-tighter">
                  <th className="px-2 py-4 border-r border-dashed w-12">NIVEL</th>
                  <th className="px-2 py-4 border-r border-dashed text-indigo-600 w-24">FERT PRINCIPAL</th>
                  <th className="px-3 py-4 border-r border-dashed text-left w-[15%]">DESCRIPCIÓN FERT</th>
                  <th className="px-2 py-4 border-r border-dashed text-slate-500 w-24">MAT. PADRE</th>
                  <th className="px-3 py-4 border-r border-dashed text-left w-[15%]">DESC. PADRE</th>
                  <th className="px-2 py-4 border-r border-dashed text-orange-600 w-24">COMPONENTE</th>
                  <th className="px-3 py-4 border-r border-dashed text-left w-[15%]">DESC. COMPONENTE</th>
                  <th className="px-2 py-4 border-r border-dashed text-right bg-slate-50">CANT. UNIT.</th>
                  <th className="px-2 py-4 text-right bg-slate-50">CANT. ACUM.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="py-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest animate-pulse">Consultando base de datos técnica...</p>
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={9} className="py-32 text-center">
                      <div className="flex flex-col items-center justify-center gap-3 px-10">
                        <AlertTriangle className="w-12 h-12 text-red-500" />
                        <p className="text-sm font-bold text-red-600 uppercase">Fallo en la comunicación con el servidor</p>
                        <p className="text-xs text-gray-500 font-medium">{error}</p>
                        <Button variant="outline" size="sm" onClick={() => fetchData(currentPage, rowsPerPage, activeSearch)} className="mt-4 rounded-xl border-red-200 hover:bg-red-50 text-red-600 font-bold uppercase text-[9px]">
                          Reintentar Carga
                        </Button>
                      </div>
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-32 text-center text-gray-400 space-y-4">
                      <div className="p-4 bg-gray-50 rounded-full w-16 h-16 flex items-center justify-center mx-auto">
                        <Search className="w-8 h-8 text-gray-200" />
                      </div>
                      <p className="font-bold uppercase tracking-widest text-[10px]">Sin resultados para "{activeSearch}"</p>
                    </td>
                  </tr>
                ) : (
                  data.map((item, idx) => (
                    <tr key={idx} className="hover:bg-indigo-50/20 transition-all group">
                      <td className="px-2 py-3 border-r border-dashed font-black text-gray-800 bg-gray-50/30">
                        <div className="flex items-center justify-center gap-1">
                          {item.NIVEL > 1 && <div className="w-2 h-[1px] bg-indigo-200" />}
                          {item.NIVEL}
                        </div>
                      </td>
                      <td className="px-2 py-3 border-r border-dashed font-mono font-bold text-indigo-600 tracking-tighter">
                        {String(item.FERT_PRINCIPAL || '').slice(-8)}
                      </td>
                      <td className="px-3 py-3 border-r border-dashed text-left font-bold text-gray-400 uppercase text-[9px] truncate max-w-[120px]" title={item.DESCRIPCION_FERT}>
                        {item.DESCRIPCION_FERT}
                      </td>
                      <td className="px-2 py-3 border-r border-dashed font-mono text-gray-400 tracking-tighter">
                        {String(item.MATERIAL_PADRE || '').slice(-8)}
                      </td>
                      <td className="px-3 py-3 border-r border-dashed text-left text-gray-400 text-[8px] truncate max-w-[120px]" title={item.DESCRIPCION_PADRE}>
                        {item.DESCRIPCION_PADRE}
                      </td>
                      <td className="px-2 py-3 border-r border-dashed font-mono font-black text-orange-600 bg-orange-50/5 tracking-tighter">
                        {String(item.COMPONENTE || '').slice(-8)}
                      </td>
                      <td className="px-3 py-3 border-r border-dashed text-left font-black text-gray-700 uppercase tracking-tight">
                        {item.DESCRIPCION_COMPONENTE}
                      </td>
                      <td className="px-2 py-3 border-r border-dashed text-right font-mono font-black text-indigo-700 bg-slate-50/30">
                        {Number(item.CANTIDAD_UNITARIA || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-2 py-3 text-right font-mono font-black text-slate-800 bg-slate-50/50">
                        {Number(item.CANTIDAD_ACUMULADA || 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {hasStarted && !isLoading && !error && totalPages > 1 && (
        <div className="flex items-center justify-between px-2 pt-4 pb-6 bg-gray-50/50 rounded-xl p-4 border border-gray-100 shadow-inner">
          <div className="flex items-center gap-4">
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Mostrando {data.length} de {totalRecords.toLocaleString()} registros
            </div>
            <select 
              value={rowsPerPage} 
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="text-[10px] font-bold uppercase border-gray-200 rounded-lg h-7 bg-white shadow-sm"
            >
              {[20, 50, 100, 200].map(v => <option key={v} value={v}>{v} por pág.</option>)}
            </select>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => handlePageChange(1)} disabled={currentPage === 1} className="h-8 w-8 rounded-xl border-gray-200 hover:bg-indigo-50"><ChevronsLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="h-8 w-8 rounded-xl border-gray-200 hover:bg-indigo-50"><ChevronLeft className="h-4 w-4" /></Button>
            
            <div className="flex items-center gap-2 mx-4 px-4 py-1 bg-white border border-gray-100 rounded-xl shadow-sm">
              <span className="text-[9px] font-black text-gray-400 uppercase">Pág</span>
              <span className="text-xs font-black text-indigo-600">{currentPage}</span>
              <span className="text-[9px] font-black text-gray-400 uppercase">/ {totalPages}</span>
            </div>

            <Button variant="outline" size="icon" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="h-8 w-8 rounded-xl border-gray-200 hover:bg-indigo-50"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" onClick={() => handlePageChange(totalPages)} disabled={currentPage === totalPages} className="h-8 w-8 rounded-xl border-gray-200 hover:bg-indigo-50"><ChevronsRight className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
};
