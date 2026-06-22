'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { logger } from '@/services/LogService';
import { ClipboardList, Loader2, Search, Package, LayoutDashboard, AlertCircle, Info } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Restriccion } from '@/types/interfaces';

interface OrderAlphaItem {
  [key: string]: any;
}

interface ProvisionalOrdersAlphaTabProps {
  restricciones?: Restriccion[];
}

const ROWS_PER_PAGE_OPTIONS = [20, 50, 100, 500];

export const ProvisionalOrdersAlphaTab: React.FC<ProvisionalOrdersAlphaTabProps> = ({ restricciones = [] }) => {
    const { addNotification } = useAppContext();
    const [isMounted, setIsMounted] = useState(false);
    const [data, setData] = useState<OrderAlphaItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [totalRecords, setTotalRecords] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[0]);

    // Refs para scrollbar doble
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    const fetchData = async (page: number, rows: number) => {
        setIsLoading(true);
        try {
            logger.log(`[PlanTáctico] Consultando página ${page} con ${rows} registros...`, 'info');
            const response = await serviciosService.getOrdenesProvisionalesAlphaPaginados(page, rows);
            
            if (response && response.data) {
                const dataArray = Array.isArray(response.data) ? response.data : [response.data];
                setData(dataArray);
                setTotalRecords(response.totalRegistros || response.length || dataArray.length);
                
                if (dataArray.length > 0) {
                    const keys = Object.keys(dataArray[0]);
                    setColumns(keys);
                    logger.log(`[PlanTáctico] Datos recibidos: ${dataArray.length} registros. Campos detectados: ${keys.join(', ')}`, 'success');
                } else {
                    logger.log(`[PlanTáctico] El API respondió exitosamente pero no devolvió registros para esta página.`, 'warning');
                }
            } else {
                setData([]);
                setTotalRecords(0);
            }
        } catch (error) {
            console.error('Error al cargar órdenes alpha:', error);
            const msg = error instanceof Error ? error.message : 'Error de red';
            addNotification('error', `Error al cargar el plan táctico: ${msg}`);
            logger.log(`[PlanTáctico] ❌ ERROR: ${msg}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isMounted) {
            fetchData(currentPage, rowsPerPage);
        }
    }, [currentPage, rowsPerPage, isMounted]);

    // Obtener códigos válidos de responsabilidad desde las restricciones
    const validRespCodes = useMemo(() => {
        const respRestriccion = restricciones.find(r => r.nombre_restriccion === 'RespCtrlProd');
        if (!respRestriccion || !respRestriccion.valor_restriccion) return [];
        
        return respRestriccion.valor_restriccion
            .split(/[&,]/)
            .map(code => String(code).trim())
            .filter(Boolean);
    }, [restricciones]);

    // Lógica de filtrado robusta
    const filteredData = useMemo(() => {
        if (!data || data.length === 0) return [];
        
        return data.filter(row => {
            // 1. Filtro por responsables (RespCtrlProd)
            if (validRespCodes.length > 0) {
                // Buscamos en todos los posibles nombres de campo para el responsable
                const rowResp = String(
                    row.RESPCONTROLPROD || 
                    row.RespControlProd || 
                    row.RESP_CTRL_PROD || 
                    row.RESPCTRLPROD || 
                    row.RespCtrlProd || 
                    ''
                ).trim();

                // Normalización para comparación numérica (ej: "019" -> "19")
                const normalize = (s: string) => s.replace(/^0+/, '');
                const normalizedRowResp = normalize(rowResp);
                const normalizedValidCodes = validRespCodes.map(normalize);

                const matchesResponsible = validRespCodes.includes(rowResp) || 
                                           normalizedValidCodes.includes(normalizedRowResp);

                if (!matchesResponsible) return false;
            }

            // 2. Filtro por buscador manual (searchTerm)
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return Object.values(row).some(val => 
                String(val).toLowerCase().includes(term)
            );
        });
    }, [data, searchTerm, validRespCodes]);

    const totalPages = Math.max(1, Math.ceil(totalRecords / rowsPerPage));

    // Sincronización de scrollbars
    useEffect(() => {
        if (!isMounted) return;
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
    }, [filteredData, isMounted]);

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

    // Columnas prioritarias para mostrar primero si existen
    const PRIORITY_COLUMNS = ['ORDENPREVISIONAL', 'MATERIAL', 'NOMBRE', 'CATEGORIA', 'CANTIDAD', 'UNIDAD', 'FECHAINICIO', 'FECHAFIN', 'RESPCONTROLPROD'];
    const sortedColumns = useMemo(() => {
        if (columns.length === 0) return PRIORITY_COLUMNS;
        const remaining = columns.filter(c => !PRIORITY_COLUMNS.includes(c));
        return [...columns.filter(c => PRIORITY_COLUMNS.includes(c)), ...remaining];
    }, [columns]);

    if (!isMounted) return null;

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
                    <div className="flex items-center gap-4">
                        {validRespCodes.length > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Responsables:</span>
                                <div className="flex gap-1">
                                    {validRespCodes.map(code => (
                                        <Badge key={code} variant="secondary" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-2 py-0">
                                            {code}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                        {isLoading && (
                            <div className="flex items-center gap-2 text-xs text-blue-600 animate-pulse font-medium">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Actualizando datos...
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                     <div className="text-[11px] text-gray-500 bg-gray-100 px-2 py-1 rounded-md border border-gray-200 flex items-center gap-2">
                        <Info className="w-3 h-3 text-blue-500" />
                        <span>Total Global: <strong>{totalRecords.toLocaleString()}</strong></span>
                        <span className="text-gray-300">|</span>
                        <span>Filtrados: <strong>{filteredData.length}</strong></span>
                    </div>
                </div>
            </div>

            {isLoading && data.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 bg-gray-50 rounded-xl border-2 border-dashed">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-4" />
                    <p className="text-gray-600 font-medium">Consultando Plan Táctico Alpha...</p>
                    <p className="text-xs text-gray-400 mt-1">Este proceso puede tardar unos segundos.</p>
                </div>
            ) : data.length > 0 ? (
                <>
                    <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden h-[18px]">
                        <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
                    </div>

                    <div ref={tableScrollRef} onScroll={handleTableScroll} className="border rounded-lg overflow-auto max-h-[60vh] bg-white shadow-sm">
                        <table ref={tableRef} className="min-w-full text-[11px] border-collapse">
                            <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
                                <tr className="border-b-2 border-gray-300">
                                    {sortedColumns.map(col => (
                                        <TableHead key={col} className="text-center font-bold text-gray-700 uppercase tracking-wider px-4 py-2 border-r border-dashed border-gray-300 last:border-r-0 whitespace-nowrap">
                                            {col.replace(/_/g, ' ')}
                                        </TableHead>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                        {sortedColumns.map((col, cIdx) => {
                                          let val = row[col];
                                          const isNumeric = typeof val === 'number';
                                          
                                          return (
                                            <TableCell key={`${idx}-${cIdx}`} className={cn(
                                                "px-4 py-2 text-center border-r border-dashed border-gray-200 last:border-r-0 whitespace-nowrap text-gray-600",
                                                col === 'ORDENPREVISIONAL' && "font-bold text-indigo-700 bg-indigo-50/20",
                                                isNumeric && "font-mono text-gray-800 font-semibold"
                                            )}>
                                                {val ?? '-'}
                                            </TableCell>
                                          );
                                        })}
                                    </tr>
                                ))}
                                {filteredData.length === 0 && (
                                    <tr>
                                        <td colSpan={sortedColumns.length} className="py-24 text-center text-gray-500 italic bg-gray-50/50">
                                            <div className="flex flex-col items-center gap-3">
                                                <AlertCircle className="w-8 h-8 text-amber-500 opacity-50" />
                                                <p>No se encontraron registros que coincidan con los responsables ({validRespCodes.join(', ')}) en esta página.</p>
                                                <p className="text-[10px] text-gray-400">Pruebe navegando a la siguiente página o revise la configuración de responsables del grupo.</p>
                                            </div>
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
                    <Button 
                        variant="outline" 
                        className="mt-4 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                        onClick={() => fetchData(1, rowsPerPage)}
                    >
                        Reintentar Consulta
                    </Button>
                </div>
            )}
        </div>
    );
};
