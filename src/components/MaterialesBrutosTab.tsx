'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Database, Loader2, Search } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface MaterialBrutoItem {
  [key: string]: any;
}

const ROWS_PER_PAGE_OPTIONS = [20, 50, 100, 200];
const BLOCK_SIZE = 5000; // Bloques de carga para el API

export const MaterialesBrutosTab: React.FC = () => {
    const { addNotification } = useAppContext();
    const [allData, setAllData] = useState<MaterialBrutoItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[0]);
    const [totalRecords, setTotalRecords] = useState(0);
    const [loadedBlocks, setLoadedBlocks] = useState<Set<number>>(new Set());

    // Refs para scrollbar doble
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    const loadBlock = async (blockPage: number) => {
        if (loadedBlocks.has(blockPage)) return;

        setIsLoading(true);
        try {
            const response = await serviciosService.getMaterialesBrutosPorMaterialMateriaPrima(blockPage, BLOCK_SIZE);
            if (response && response.data) {
                const dataArray = Array.isArray(response.data) ? response.data : [response.data];
                
                if (blockPage === 1) {
                    setTotalRecords(response.totalRegistros || response.totalRecords || dataArray.length);
                    if (dataArray.length > 0) {
                        setColumns(Object.keys(dataArray[0]));
                    }
                }

                setAllData(prev => [...prev, ...dataArray]);
                setLoadedBlocks(prev => new Set([...prev, blockPage]));
            }
        } catch (error) {
            addNotification('error', `Error al cargar materiales brutos: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadBlock(1);
    }, []);

    // Filtrado dinámico
    const filteredData = useMemo(() => {
        if (!searchTerm.trim()) return allData;
        const term = searchTerm.toLowerCase();
        return allData.filter(row => 
            Object.values(row).some(val => String(val).toLowerCase().includes(term))
        );
    }, [allData, searchTerm]);

    const totalPages = Math.max(1, Math.ceil((searchTerm ? filteredData.length : totalRecords) / rowsPerPage));

    const displayedData = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredData.slice(start, start + rowsPerPage);
    }, [filteredData, currentPage, rowsPerPage]);

    const handlePageChange = (page: number) => {
        const newPage = Math.max(1, Math.min(page, totalPages));
        setCurrentPage(newPage);

        // Lógica de carga bajo demanda si el usuario navega más allá de lo cargado
        const requiredIdx = (newPage - 1) * rowsPerPage + rowsPerPage;
        if (requiredIdx > allData.length && allData.length < totalRecords && !searchTerm) {
            const blockPageNeeded = Math.ceil(requiredIdx / BLOCK_SIZE);
            loadBlock(blockPageNeeded);
        }
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
                        placeholder="Buscar por código de producto o materia prima..." 
                        className="pl-10"
                        value={searchTerm}
                        onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                    />
                </div>
                {isLoading && (
                    <div className="flex items-center gap-2 text-sm text-blue-600 animate-pulse">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Cargando datos...
                    </div>
                )}
            </div>

            <div className="bg-blue-50 border border-blue-200 p-3 rounded-md">
                <p className="text-xs text-blue-800">
                    Use esta pestaña para ver la relación entre los productos terminados del <strong>PLAN</strong> y sus consumos de <strong>Cascos</strong>, <strong>Telas</strong> y otras materias primas.
                </p>
            </div>

            <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden h-[18px]">
                <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
            </div>

            <div ref={tableScrollRef} onScroll={handleTableScroll} className="border rounded-lg overflow-auto max-h-[60vh]">
                <table ref={tableRef} className="min-w-full text-xs border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <TableRow className="border-b-2 border-gray-300">
                            {columns.map(col => (
                                <TableHead key={col} className="text-center font-bold text-gray-700 uppercase tracking-wider px-4 py-2 border-r border-dashed border-gray-300 last:border-r-0">
                                    {col}
                                </TableHead>
                            ))}
                        </TableRow>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {displayedData.length > 0 ? displayedData.map((row, idx) => (
                            <TableRow key={idx} className="hover:bg-gray-50">
                                {columns.map((col, cIdx) => {
                                    let displayValue = String(row[col] ?? '-');
                                    
                                    // Eliminar los primeros 2 ceros de las columnas solicitadas
                                    if (['FERT_PRINCIPAL', 'MATERIAL_PADRE', 'COMPONENTE'].includes(col)) {
                                        displayValue = displayValue.replace(/^0{2}/, '');
                                    }

                                    return (
                                        <TableCell key={`${idx}-${cIdx}`} className="px-4 py-2 text-center border-r border-dashed border-gray-200 last:border-r-0">
                                            {displayValue}
                                        </TableCell>
                                    );
                                })}
                            </TableRow>
                        )) : (
                            <TableRow>
                                <td colSpan={columns.length || 1} className="py-10 text-center text-gray-500">
                                    {isLoading ? 'Cargando información...' : 'No se encontraron registros.'}
                                </td>
                            </TableRow>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="flex items-center justify-between mt-4">
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">Filas por página:</span>
                    <select
                        value={rowsPerPage}
                        onChange={(e) => setRowsPerPage(Number(e.target.value))}
                        className="px-3 py-2 border rounded-md text-sm bg-white"
                    >
                        {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                    </select>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-600">
                        Página {currentPage} de {totalPages} ({searchTerm ? filteredData.length : totalRecords} registros)
                    </span>
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(1)} disabled={currentPage === 1}>Primera</Button>
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1}>Anterior</Button>
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage >= totalPages}>Siguiente</Button>
                    <Button variant="outline" size="sm" onClick={() => handlePageChange(totalPages)} disabled={currentPage >= totalPages}>Última</Button>
                </div>
            </div>
        </div>
    );
};
