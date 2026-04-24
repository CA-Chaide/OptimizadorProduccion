
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Package, Loader2 } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';

interface CuboInventariosItem {
  [key: string]: any;
}

const ROWS_PER_PAGE_OPTIONS = [20, 50, 100, 200];

export const CuboInventariosTelasTab: React.FC = () => {
    const { addNotification } = useAppContext();
    const [allData, setAllData] = useState<CuboInventariosItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[0]);

    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    useEffect(() => {
        const fetchAllInventario = async () => {
            setIsLoading(true);
            try {
                const exploreResponse = await serviciosService.getCuboInventarios(1, 1);
                const totalRecords = exploreResponse.totalRegistros || 0;

                if (totalRecords === 0) {
                    setAllData([]);
                    addNotification('info', 'No se encontraron datos en Cubo de Inventarios.');
                    setIsLoading(false);
                    return;
                }
                
                const BATCH_SIZE = 10000;
                const totalPagesToFetch = Math.ceil(totalRecords / BATCH_SIZE);
                let fetchedData: CuboInventariosItem[] = [];

                for (let i = 1; i <= totalPagesToFetch; i++) {
                    addNotification('info', `Cargando lote ${i} de ${totalPagesToFetch} de inventario...`);
                    const pageResponse = await serviciosService.getCuboInventarios(i, BATCH_SIZE);
                    if (pageResponse.data && Array.isArray(pageResponse.data)) {
                        fetchedData = fetchedData.concat(pageResponse.data);
                    }
                }

                setAllData(fetchedData);
                addNotification('success', `Se cargaron ${fetchedData.length} registros de inventario.`);

                if (fetchedData.length > 0 && columns.length === 0) {
                    let originalColumns = Object.keys(fetchedData[0]);
                    const stockActualCol = 'StockActual';
                    const descripcionCol = 'Descripcion';
                    const stockActualIndex = originalColumns.indexOf(stockActualCol);
                    if (stockActualIndex > -1) {
                        originalColumns.splice(stockActualIndex, 1);
                    }
                    const descripcionIndex = originalColumns.indexOf(descripcionCol);
                    const targetIndex = descripcionIndex !== -1 ? descripcionIndex + 1 : 2;
                    originalColumns.splice(targetIndex, 0, stockActualCol);
                    setColumns(originalColumns);
                }

            } catch (error) {
                addNotification('error', `Error al cargar datos de inventario: ${(error as Error).message}`);
                setAllData([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAllInventario();
    }, [addNotification, columns.length]);

    const filteredData = useMemo(() => {
        return allData.filter(row => 
            row.Descripcion && String(row.Descripcion).toUpperCase().includes('TELA')
        );
    }, [allData]);

    const totalRecords = filteredData.length;
    const totalPages = totalRecords > 0 ? Math.ceil(totalRecords / rowsPerPage) : 1;

    const displayedData = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredData.slice(start, start + rowsPerPage);
    }, [filteredData, currentPage, rowsPerPage]);

    const goToPage = (page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, totalPages)));
    };

    const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setRowsPerPage(Number(e.target.value));
        setCurrentPage(1);
    };

    useEffect(() => {
        const calculateWidth = () => {
            if (tableRef.current) {
                setTableWidth(tableRef.current.offsetWidth);
            }
        };
        calculateWidth();
        window.addEventListener('resize', calculateWidth);
        
        const resizeObserver = new ResizeObserver(calculateWidth);
        if (tableRef.current) {
            resizeObserver.observe(tableRef.current);
        }

        return () => {
            window.removeEventListener('resize', calculateWidth);
            if (tableRef.current) {
                resizeObserver.unobserve(tableRef.current);
            }
        };
    }, [displayedData]);

    const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (lastScrolledRef.current === 'table') {
            lastScrolledRef.current = null;
            return;
        }
        if (tableScrollRef.current) {
            lastScrolledRef.current = 'top';
            tableScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };

    const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
        if (lastScrolledRef.current === 'top') {
            lastScrolledRef.current = null;
            return;
        }
        if (topScrollRef.current) {
            lastScrolledRef.current = 'table';
            topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }
    };
    
    if (isLoading && allData.length === 0) {
        return (
            <div className="flex justify-center items-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <span className="ml-3 text-gray-600">Cargando Inventario de Telas...</span>
            </div>
        );
    }

    if (!isLoading && allData.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Package className="w-12 h-12 mb-4 text-gray-300" />
              <p>No hay datos de inventario para mostrar.</p>
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
             <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden" style={{ height: '18px' }}>
                <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
            </div>
             <div ref={tableScrollRef} onScroll={handleTableScroll} className="border rounded-lg overflow-auto max-h-[60vh]">
                 <table ref={tableRef} className="min-w-full text-xs divide-y divide-gray-200">
                     <TableHeader className="bg-gray-100 sticky top-0">
                         <TableRow>
                             {columns.map(col => <TableHead key={col}>{col}</TableHead>)}
                         </TableRow>
                     </TableHeader>
                     <TableBody>
                        {displayedData.map((row, idx) => (
                           <TableRow key={idx}>
                                {columns.map(col => {
                                    let displayValue = String(row[col] ?? '-');
                                    if (col === 'Material') {
                                        displayValue = displayValue.slice(-8);
                                    }
                                    return (
                                        <TableCell key={`${idx}-${col}`}>{displayValue}</TableCell>
                                    );
                                })}
                           </TableRow>
                        ))}
                     </TableBody>
                 </table>
            </div>
            {/* Pagination Controls */}
            <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Filas por página:</span>
                    <select
                        value={rowsPerPage}
                        onChange={handleRowsPerPageChange}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                    >
                        {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                     <span className="text-sm text-gray-600">Página {currentPage} de {totalPages}</span>
                     <Button variant="outline" size="sm" onClick={() => goToPage(1)} disabled={currentPage === 1}>Primera</Button>
                     <Button variant="outline" size="sm" onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}>Anterior</Button>
                     <Button variant="outline" size="sm" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>Siguiente</Button>
                     <Button variant="outline" size="sm" onClick={() => goToPage(totalPages)} disabled={currentPage >= totalPages}>Última</Button>
                </div>
           </div>
        </div>
    );
};
