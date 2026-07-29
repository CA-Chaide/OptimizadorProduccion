'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Boxes, Loader2, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ExplosionMaterialItem {
  [key: string]: any;
}

const BLOCK_SIZE = 5000;

export const ExplosionMaterialesTabSection: React.FC = () => {
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  const [allItems, setAllItems] = useState<ExplosionMaterialItem[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadedBlocks, setLoadedBlocks] = useState<Set<number>>(new Set());
  const [actualBlockSize, setActualBlockSize] = useState(BLOCK_SIZE);

  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const loadBlock = useCallback(async (blockPage: number) => {
    if (loadedBlocks.has(blockPage)) return;

    setIsLoading(true);
    try {
      const response = await serviciosService.getExplosionMateriales(blockPage, BLOCK_SIZE);
      const dataArray: ExplosionMaterialItem[] = Array.isArray(response?.data) ? response.data : [];
      const receivedCount = dataArray.length;

      if (blockPage === 1) {
        const anyResponse = response as any;
        setTotalRecords(anyResponse?.totalRegistros ?? anyResponse?.totalRecords ?? anyResponse?.totalRows ?? receivedCount);
        if (dataArray.length > 0) setColumns(Object.keys(dataArray[0]));
        if (receivedCount > 0) setActualBlockSize(receivedCount);
      }

      setAllItems(prev => [...prev, ...dataArray]);
      setLoadedBlocks(prev => new Set([...prev, blockPage]));
    } catch (err) {
      addNotification('error', `Error al cargar explosión de materiales: ${(err as Error).message}`);
      if (blockPage === 1) {
        setAllItems([]);
        setTotalRecords(0);
      }
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, loadedBlocks]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      loadBlock(1);
    }
  }, [loadBlock]);

  const filteredItems = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return allItems;
    return allItems.filter(item =>
      columns.some(col => String(item[col] ?? '').toLowerCase().includes(term))
    );
  }, [allItems, columns, searchTerm]);

  const totalPagesLocal = Math.max(1, Math.ceil(filteredItems.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedItems = filteredItems.slice(startIndex, endIndex);

  // Si la página actual necesita datos de un bloque aún no cargado (sin filtro de búsqueda activo), lo solicita.
  useEffect(() => {
    if (searchTerm.trim()) return;
    const requiredIdx = currentPage * rowsPerPage;
    if (requiredIdx > allItems.length && allItems.length < totalRecords) {
      const blockPageNeeded = Math.ceil(requiredIdx / actualBlockSize);
      if (!loadedBlocks.has(blockPageNeeded)) {
        loadBlock(blockPageNeeded);
      }
    }
  }, [currentPage, rowsPerPage, allItems.length, totalRecords, actualBlockSize, loadedBlocks, searchTerm, loadBlock]);

  const handleRefresh = () => {
    hasStarted.current = false;
    setAllItems([]);
    setColumns([]);
    setTotalRecords(0);
    setLoadedBlocks(new Set());
    setActualBlockSize(BLOCK_SIZE);
    setCurrentPage(1);
    loadBlock(1);
  };

  if (isLoading && allItems.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        <span className="mt-4 text-gray-600 font-medium">Cargando explosión de materiales...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Boxes className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-700">Explosión de Materiales</h3>
            <p className="text-xs text-gray-500">Datos de la tabla ReporteExplosionMateriales</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Buscar..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            Actualizar
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map(col => (
                  <th key={col} className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayedItems.length > 0 ? displayedItems.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  {columns.map(col => (
                    <td key={col} className="px-4 py-2 whitespace-nowrap text-xs text-gray-600">
                      {typeof item[col] === 'object' ? JSON.stringify(item[col]) : String(item[col] ?? '-')}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr>
                  <td colSpan={Math.max(columns.length, 1)} className="px-6 py-12 text-center text-gray-400 italic">
                    No se encontraron registros de explosión de materiales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-gray-50 px-6 py-4 border-t flex items-center justify-between rounded-lg">
        <div className="flex items-center gap-4">
          <span className="text-xs font-medium text-gray-500 uppercase">Ver:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
            className="text-sm border rounded p-1 bg-white"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
          <span className="text-xs text-gray-400 font-medium">
            Viendo {filteredItems.length === 0 ? 0 : startIndex + 1} - {Math.min(endIndex, filteredItems.length)} de {filteredItems.length}
            {isLoading && <Loader2 className="inline-block w-3 h-3 ml-2 animate-spin" />}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}> Anterior </Button>
          <div className="px-4 py-1 bg-white border rounded text-sm font-bold text-indigo-600 min-w-[80px] text-center"> {currentPage} / {totalPagesLocal} </div>
          <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPagesLocal, p + 1))} disabled={currentPage === totalPagesLocal}> Siguiente </Button>
        </div>
      </div>
    </div>
  );
};
