'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Package, Loader2, Search, Info, Check, ChevronsUpDown } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Restriccion } from '@/types/interfaces';

interface ProvisionalOrdersAlphaTabProps {
  restricciones: Restriccion[];
}

const ROWS_PER_PAGE_OPTIONS = [20, 50, 100, 500];

export const ProvisionalOrdersAlphaTab: React.FC<ProvisionalOrdersAlphaTabProps> = ({ restricciones }) => {
    const { addNotification } = useAppContext();
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [totalRecords, setTotalRecords] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[0]);

    // Refs para el sistema de scrollbar doble
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    // Obtención literal de códigos de responsabilidad desde las restricciones
    const validRespCodes = useMemo(() => {
        const respRestriccion = restricciones.find(r => r.nombre_restriccion === 'RespCtrlProd');
        if (!respRestriccion || !respRestriccion.valor_restriccion) return [];
        
        return respRestriccion.valor_restriccion
            .split(/[&,]/)
            .map(code => String(code).trim())
            .filter(Boolean);
    }, [restricciones]);

    // Carga de datos base desde el servidor
    const fetchData = async (page: number, rows: number) => {
        setIsLoading(true);
        try {
            const response = await serviciosService.getOrdenesProvisionalesAlphaPaginados(page, rows);
            
            if (response && response.data) {
                const dataArray = Array.isArray(response.data) ? response.data : [response.data];
                setData(dataArray);
                setTotalRecords(response.totalRegistros || dataArray.length);
                
                // Extraer columnas dinámicamente del primer registro si no existen
                if (dataArray.length > 0 && columns.length === 0) {
                    setColumns(Object.keys(dataArray[0]));
                }
            } else {
                setData([]);
                setTotalRecords(0);
            }
        } catch (error) {
            console.error('Error al cargar órdenes alpha:', error);
            addNotification('error', 'Error al obtener el plan táctico desde el servidor.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData(currentPage, rowsPerPage);
    }, [currentPage, rowsPerPage]);

    // Filtrado Combinado: Restricción de Responsable + Término de Búsqueda
    const filteredData = useMemo(() => {
        if (!data || data.length === 0) return [];
        
        return data.filter(row => {
            // 1. Filtrado por Responsable (RespCtrlProd literal)
            // Si hay códigos definidos en las restricciones, aplicamos el filtro
            if (validRespCodes.length > 0) {
                const rowResp = String(row.RESPCONTROLPROD || '').trim();
                if (!validRespCodes.includes(rowResp)) return false;
            }

            // 2. Filtrado por término de búsqueda manual
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return Object.values(row).some(val => 
                String(val).toLowerCase().includes(term)
            );
        });
    }, [data, searchTerm, validRespCodes]);

    const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));

    // Lógica de sincronización de barras de desplazamiento
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
    }, [filteredData]);

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
                <div className="flex flex-col gap-2 flex-1">
                    <div className="relative w-full md:w-96">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input 
                            placeholder="Buscar en el plan táctico..." 
                            className="pl-10 h-9"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {validRespCodes.length > 0 ? (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Responsables (Literal):</span>
                            <div className="flex gap-1">
                                {validRespCodes.map(code => (
                                    <Badge key={code} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-2 py-0">
                                        {code}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <span className="text-[10px] text-amber-600 font-semibold italic">
                            ⚠️ No se encontró la restricción "RespCtrlProd". Mostrando todos los datos.
                        </span>
                    )}
                </div>
                <div className="text-[11px] text-gray-500 bg-gray-50 px-3 py-1.5 rounded-md border flex items-center gap-2">
                    <Info className="w-3 h-3 text-blue-500" />
                    <span>Registros Página: <strong>{data.length}</strong></span>
                    <span className="text-gray-300">|</span>
                    <span>Tras Filtro: <strong>{filteredData.length}</strong></span>
                </div>
            </div>

            {isLoading && data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed">
                    <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
                    <p className="text-sm text-gray-600 font-medium">Cargando Plan Táctico Alpha...</p>
                </div>
            ) : data.length > 0 ? (
                <>
                    {/* Scrollbar Superior */}
                    <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden h-[18px]">
                        <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
                    </div>

                    <div ref={tableScrollRef} onScroll={handleTableScroll} className="border rounded-lg overflow-auto max-h-[60vh] bg-white shadow-sm">
                        <table ref={tableRef} className="min-w-full text-[11px] border-collapse">
                            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                                <tr className="border-b-2 border-gray-300">
                                    {columns.map(col => (
                                        <TableHead key={col} className="text-center font-bold text-gray-700 uppercase tracking-wider px-4 py-2 border-r border-dashed border-gray-300 last:border-r-0 whitespace-nowrap">
                                            {col.replace(/_/g, ' ')}
                                        </TableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                        {columns.map((col, cIdx) => (
                                          <TableCell key={`${idx}-${cIdx}`} className="px-4 py-2 text-center border-r border-dashed border-gray-200 last:border-r-0 whitespace-nowrap text-gray-600">
                                              {row[col] ?? '-'}
                                          </TableCell>
                                        ))}
                                    </tr>
                                ))}
                                {filteredData.length === 0 && (
                                    <tr>
                                        <td colSpan={columns.length} className="py-24 text-center text-gray-500 italic bg-gray-50/50">
                                            No se encontraron registros que coincidan con los responsables configurados en las restricciones.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between mt-4 bg-white p-3 rounded-lg border shadow-sm">
                        <div className="flex items-center space-x-3">
                            <span className="text-xs text-gray-600 font-medium">Filas por página:</span>
                            <select
                                value={rowsPerPage}
                                onChange={(e) => {
                                    setRowsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="px-2 py-1 border rounded-md text-xs bg-white focus:ring-indigo-500"
                            >
                                {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
                            </select>
                        </div>
                        <div className="flex items-center space-x-2">
                            <span className="text-xs text-gray-600 font-medium">
                                Página <strong className="text-indigo-700">{currentPage}</strong> de <strong>{totalPages}</strong>
                            </span>
                            <div className="flex gap-1 ml-4">
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1 || isLoading}>Primera</Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading}>Ant.</Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || isLoading}>Sig.</Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages || isLoading}>Última</Button>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-gray-50 border-2 border-dashed rounded-xl shadow-inner">
                    <Package className="w-12 h-12 text-gray-300 mb-4" />
                    <p className="text-gray-500 font-medium">No se encontraron datos en el Plan Táctico Alpha.</p>
                </div>
            )}
        </div>
    );
};
