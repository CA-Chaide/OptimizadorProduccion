'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Package, Loader2, Search, Table as TableIcon } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CuboInventariosItem {
  [key: string]: any;
}

const ROWS_PER_PAGE_OPTIONS = [20, 50, 100, 200];

const normalizeMaterialCode = (code: string | number): string => {
  const codeStr = String(code).trim();
  // Quitar ceros a la izquierda para el buscador pero mantener consistencia
  return codeStr.replace(/^0+/, '');
};

export const CuboInventariosGeneralTab: React.FC = () => {
    const { addNotification } = useAppContext();
    const [allData, setAllData] = useState<CuboInventariosItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[1]); // Default 50

    // Refs para sincronización de scrollbar doble
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    useEffect(() => {
        const fetchAllInventario = async () => {
            setIsLoading(true);
            try {
                // Consultamos el total primero
                const exploreResponse = await serviciosService.getCuboInventarios(1, 1);
                const totalRecords = exploreResponse.totalRegistros || 0;

                if (totalRecords === 0) {
                    setAllData([]);
                    setIsLoading(false);
                    return;
                }
                
                // Descarga masiva en bloques de 20,000 para eficiencia
                const BATCH_SIZE = 20000;
                const totalPagesToFetch = Math.ceil(totalRecords / BATCH_SIZE);
                let fetchedData: CuboInventariosItem[] = [];

                for (let i = 1; i <= totalPagesToFetch; i++) {
                    const pageResponse = await serviciosService.getCuboInventarios(i, BATCH_SIZE);
                    if (pageResponse.data && Array.isArray(pageResponse.data)) {
                        fetchedData = fetchedData.concat(pageResponse.data);
                    }
                }

                setAllData(fetchedData);

                // Configuración dinámica de columnas
                if (fetchedData.length > 0) {
                    const originalColumns = Object.keys(fetchedData[0]);
                    // Reorganizar: Material, Descripcion y StockActual primero
                    const priority = ['Material', 'Descripcion', 'StockActual', 'Centro', 'ClaseAprovisionam'];
                    const others = originalColumns.filter(c => !priority.includes(c));
                    setColumns([...priority, ...others]);
                }

            } catch (error) {
                console.error('Error al cargar inventario:', error);
                addNotification('error', 'Error al cargar datos globales de inventario.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchAllInventario();
    }, [addNotification]);

    // Filtrado local sobre el set descargado
    const filteredData = useMemo(() => {
        if (!searchTerm.trim()) return allData;
        const term = searchTerm.toLowerCase();
        return allData.filter(row => 
            String(row.Material || '').toLowerCase().includes(term) ||
            String(row.Descripcion || '').toLowerCase().includes(term)
        );
    }, [allData, searchTerm]);

    const totalRecords = filteredData.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));

    const displayedData = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredData.slice(start, start + rowsPerPage);
    }, [filteredData, currentPage, rowsPerPage]);

    const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setRowsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    // Sincronización de scroll
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
    }, [displayedData]);

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

    return (
        <div className="space-y-4">
             <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input 
                        placeholder="Buscar por código o descripción..." 
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 font-medium">
                    <TableIcon className="w-4 h-4" />
                    <span>Resultados: <strong>{totalRecords.toLocaleString()}</strong> de {allData.length.toLocaleString()}</span>
                </div>
            </div>

            {isLoading && allData.length === 0 ? (
                <div className="flex flex-col justify-center items-center py-20 gap-4">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                    <span className="text-gray-600 font-medium">Sincronizando Cubo de Inventarios...</span>
                </div>
            ) : (
                <>
                    <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden" style={{ height: '18px' }}>
                        <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
                    </div>

                    <div ref={tableScrollRef} onScroll={handleTableScroll} className="border rounded-lg overflow-auto max-h-[60vh] bg-white shadow-sm">
                        <table ref={tableRef} className="min-w-full text-xs border-collapse">
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
                                {displayedData.length > 0 ? displayedData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        {columns.map((col, colIndex) => {
                                            let val = row[col];
                                            if (col === 'Material') val = String(val).replace(/^0+/, '');
                                            return (
                                                <TableCell key={`${idx}-${col}`} className={cn(
                                                    "px-4 py-2 text-center border-r border-dashed border-gray-200 last:border-r-0 whitespace-nowrap",
                                                    col === 'StockActual' && Number(val) > 0 && "font-bold text-green-700",
                                                    col === 'Material' && "font-mono font-bold text-indigo-700"
                                                )}>
                                                    {String(val ?? '-')}
                                                </TableCell>
                                            );
                                        })}
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={columns.length || 1} className="py-20 text-center text-gray-500 italic">
                                            No se encontraron registros de inventario.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between mt-4 bg-gray-50 p-3 rounded-lg border">
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-600">Mostrar:</span>
                            <select
                                value={rowsPerPage}
                                onChange={handleRowsPerPageChange}
                                className="px-2 py-1 border rounded-md text-xs bg-white focus:ring-blue-500"
                            >
                                {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center space-x-2">
                             <span className="text-xs text-gray-600 font-medium">Página <strong>{currentPage}</strong> de {totalPages}</span>
                             <div className="flex gap-1 ml-4">
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || isLoading}>Primera</Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading}>Ant.</Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || isLoading}>Sig.</Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages || isLoading}>Última</Button>
                             </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
