'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Database, Loader2, Search } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MaterialBrutoItem {
  [key: string]: any;
}

const ROWS_PER_PAGE_OPTIONS = [20, 50, 100, 200];

export const MaterialesBrutosTab: React.FC = () => {
    const { addNotification } = useAppContext();
    const [allData, setAllData] = useState<MaterialBrutoItem[]>([]); 
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[1]); 
    const [totalRecords, setTotalRecords] = useState(0);

    // Refs para scrollbar doble
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    // Carga de datos por bloque (página de API)
    const loadBlock = async (page: number, rows: number) => {
        setIsLoading(true);
        try {
            const response = await serviciosService.getMaterialesBrutosPorMaterialMateriaPrima(page, rows);
            if (response && response.data) {
                const dataArray = Array.isArray(response.data) ? response.data : [response.data];
                
                if (page === 1) {
                    setTotalRecords(response.totalRegistros || response.totalRecords || dataArray.length);
                    if (dataArray.length > 0) {
                        setColumns(Object.keys(dataArray[0]));
                    }
                }

                setAllData(dataArray);
                return dataArray;
            }
        } catch (error) {
            console.error('Error al cargar datos:', error);
            addNotification('error', 'Error al cargar datos de materiales brutos');
        } finally {
            setIsLoading(false);
        }
        return null;
    };

    // Carga inicial y cuando cambia la página o el tamaño
    useEffect(() => {
        loadBlock(currentPage, rowsPerPage);
    }, [currentPage, rowsPerPage]);

    const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));

    const handlePageChange = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setRowsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    // Sincronización de scrollbars
    useEffect(() => {
        const calculateWidth = () => {
            if (tableRef.current) setTableWidth(tableRef.current.offsetWidth);
        };
        calculateWidth();
        window.addEventListener('resize', calculateWidth);
        const resizeObserver = new ResizeObserver(calculateWidth);
        if (tableRef.current) resizeObserver.observe(tableRef.current);
        return () => {
            window.removeEventListener('resize', calculateWidth);
            if (tableRef.current) resizeObserver.unobserve(tableRef.current);
        };
    }, [allData]);

    const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (lastScrolledRef.current === 'table') { lastScrolledRef.current = null; return; }
        if (tableScrollRef.current) {
            lastScrolledRef.current = 'top';
            tableScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (lastScrolledRef.current === 'top') { lastScrolledRef.current = null; return; }
        if (topScrollRef.current) {
            lastScrolledRef.current = 'table';
            topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    // Filtrado local por FERT_PRINCIPAL
    const filteredRows = useMemo(() => {
        if (!searchTerm.trim()) return allData;
        const term = searchTerm.toLowerCase();
        return allData.filter(r => 
            String(r.FERT_PRINCIPAL || '').toLowerCase().includes(term)
        );
    }, [allData, searchTerm]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-lg shadow-sm border">
                <div className="flex items-center gap-4 flex-1">
                  <div className="relative w-full md:w-80">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input 
                          placeholder="Buscar por FERT_PRINCIPAL..." 
                          className="pl-10 h-10"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                      />
                  </div>
                  {isLoading && (
                      <div className="flex items-center gap-2 text-xs text-blue-600 animate-pulse">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Consultando base de datos...
                      </div>
                  )}
                </div>
            </div>

            {allData.length > 0 ? (
                <>
                    {/* Barra de desplazamiento superior sincronizada */}
                    <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden h-[18px]">
                        <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
                    </div>

                    <div ref={tableScrollRef} onScroll={handleTableScroll} className="border rounded-lg overflow-auto max-h-[60vh]">
                        <table ref={tableRef} className="min-w-full text-[11px] border-collapse">
                            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                                <tr className="border-b-2 border-gray-300">
                                    {columns.map(col => (
                                        <TableHead key={col} className="text-center font-bold text-gray-700 uppercase tracking-wider px-4 py-2 border-r border-dashed border-gray-300 last:border-r-0 whitespace-nowrap">
                                            {col}
                                        </TableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredRows.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        {columns.map((col, cIdx) => (
                                          <TableCell key={`${idx}-${cIdx}`} className="px-4 py-2 text-center border-r border-dashed border-gray-200 last:border-r-0 whitespace-nowrap">
                                              {String(row[col] ?? '-')}
                                          </TableCell>
                                        ))}
                                    </tr>
                                ))}
                                {filteredRows.length === 0 && (
                                    <tr>
                                        <td colSpan={columns.length} className="py-10 text-center text-gray-500 italic">
                                            No se encontraron coincidencias para "{searchTerm}" en esta página.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-600">Filas por página:</span>
                            <select
                                value={rowsPerPage}
                                onChange={handleRowsPerPageChange}
                                className="px-3 py-1.5 border rounded-md text-xs bg-white"
                            >
                                {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-600 font-medium">
                                Página {currentPage} de {totalPages} ({totalRecords.toLocaleString()} registros totales)
                            </span>
                            <div className="flex gap-1 ml-4">
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(1)} disabled={currentPage === 1 || isLoading}>Primera</Button>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1 || isLoading}>Anterior</Button>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages || isLoading}>Siguiente</Button>
                                <Button variant="outline" size="sm" onClick={() => handlePageChange(totalPages)} disabled={currentPage >= totalPages || isLoading}>Última</Button>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-gray-50 border-2 border-dashed rounded-xl">
                    {isLoading ? (
                        <>
                            <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                            <p className="text-blue-800 font-semibold text-sm">Consultando base de datos...</p>
                        </>
                    ) : (
                        <>
                            <Database className="w-12 h-12 text-gray-300 mb-4" />
                            <p className="text-gray-500 text-sm">No se han encontrado registros.</p>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};