'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { UserCheck, Loader2, Search, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const HabilidadesOpTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('HabilidadesOpTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  const [data, setData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await serviciosService.getCuboHabilidadesOP();
      const rawData = Array.isArray(response?.data) ? response.data : [];
      
      setData(rawData);
      
      if (rawData.length > 0) {
        setColumns(Object.keys(rawData[0]));
      }

      inspector.captureVariable('habilidades_count', rawData.length);
    } catch (err) {
      addNotification('error', `Error al cargar habilidades OP: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      loadData();
    }
  }, [loadData]);

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return data;

    return data.filter(row => 
      Object.values(row).some(val => 
        String(val || '').toLowerCase().includes(term)
      )
    );
  }, [data, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const displayedData = filteredData.slice(startIndex, startIndex + rowsPerPage);

  if (isLoading && data.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        <span className="mt-4 text-gray-600 font-medium">Cargando habilidades...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <UserCheck className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Cubo de Habilidades OP</h3>
            <p className="text-xs text-gray-500 mt-1">Calificaciones técnicas y disponibilidad</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Buscar operador, estación..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => loadData()}>
            Actualizar
          </Button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Scroll Horizontal Superior */}
        <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
          <div style={{ transform: 'rotateX(180deg)' }}>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {columns.map(col => (
                    <th 
                      key={col} 
                      className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayedData.length > 0 ? displayedData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    {columns.map(col => {
                      const val = row[col];
                      return (
                        <td key={col} className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                          {typeof val === 'number' && col.toLowerCase().includes('calificacion') ? (
                            <span className={`font-bold ${val === 100 ? 'text-green-600' : 'text-amber-600'}`}>
                              {val}%
                            </span>
                          ) : String(val ?? '-')}
                        </td>
                      );
                    })}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={columns.length || 1} className="px-6 py-12 text-center text-gray-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="w-8 h-8 text-gray-300" />
                        <span>No se encontraron registros de habilidades.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer / Paginación */}
        <div className="bg-gray-50 px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-xs">
            <span className="font-medium text-gray-500 uppercase">Ver:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border rounded p-1 bg-white"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-gray-400">
              {startIndex + 1} - {Math.min(startIndex + rowsPerPage, filteredData.length)} de {filteredData.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
              disabled={currentPage === 1}
            >
              Anterior
            </Button>
            <div className="px-4 py-1 bg-white border rounded text-xs font-bold text-indigo-600 min-w-[80px] text-center">
              {currentPage} / {totalPages}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
              disabled={currentPage === totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
