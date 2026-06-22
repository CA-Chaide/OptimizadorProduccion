'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Package, Loader2, Search, Info } from 'lucide-react';
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
    const [allRawData, setAllRawData] = useState<any[]>([]); 
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(ROWS_PER_PAGE_OPTIONS[1]);
    const [downloadProgress, setDownloadProgress] = useState({ current: 0, total: 0 });

    // Refs para el sistema de scrollbar doble
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    // 1. Obtención literal de códigos de responsabilidad desde las restricciones (RespCtrlProd)
    const validRespCodes = useMemo(() => {
        const respRestriccion = restricciones.find(r => r.nombre_restriccion === 'RespCtrlProd');
        if (!respRestriccion || !respRestriccion.valor_restriccion) return [];
        
        return respRestriccion.valor_restriccion
            .split(/[&,]/)
            .map(code => String(code).trim())
            .filter(Boolean);
    }, [restricciones]);

    // 2. Obtención y parseo de la restricción HRNP (Hoja de Ruta No Permitida)
    // Formato: [CODIGO:{MAQUINA}] o [CODIGO:{MAQ1,MAQ2}]
    const forbiddenMachinesMap = useMemo(() => {
        const hrnpRestriccion = restricciones.find(r => r.nombre_restriccion === 'HRNP');
        if (!hrnpRestriccion || !hrnpRestriccion.valor_restriccion) return new Map<string, string[]>();
        
        const map = new Map<string, string[]>();
        // Regex para capturar [CODIGO:{VALORES}]
        const regex = /\[([^:]+):\{([^}]+)\}\]/g;
        let match;
        
        const rawValue = hrnpRestriccion.valor_restriccion;
        while ((match = regex.exec(rawValue)) !== null) {
            const respCode = match[1].trim();
            const machines = match[2].split(',').map(m => m.trim()).filter(Boolean);
            map.set(respCode, machines);
        }
        return map;
    }, [restricciones]);

    // Función para cargar ABSOLUTAMENTE TODOS los datos del servidor
    const fetchAllData = async () => {
        setIsLoading(true);
        setDownloadProgress({ current: 0, total: 0 });
        try {
            const exploreRes = await serviciosService.getOrdenesProvisionalesAlphaPaginados(1, 1);
            const total = exploreRes.totalRegistros || 0;
            
            if (total === 0) {
                setAllRawData([]);
                setIsLoading(false);
                return;
            }

            setDownloadProgress({ current: 0, total });

            const BATCH_SIZE = 20000;
            const totalPages = Math.ceil(total / BATCH_SIZE);
            let combinedData: any[] = [];

            for (let i = 1; i <= totalPages; i++) {
                const res = await serviciosService.getOrdenesProvisionalesAlphaPaginados(i, BATCH_SIZE);
                if (res && res.data) {
                    const batch = Array.isArray(res.data) ? res.data : [res.data];
                    combinedData = combinedData.concat(batch);
                    setDownloadProgress({ current: combinedData.length, total });
                    
                    if (combinedData.length > 0 && columns.length === 0) {
                        setColumns(Object.keys(combinedData[0]));
                    }
                }
            }

            setAllRawData(combinedData);
            addNotification('success', `Se descargaron ${combinedData.length} registros totales del servidor.`);
        } catch (error) {
            console.error('Error al cargar datos alpha:', error);
            addNotification('error', 'Error crítico al descargar el set completo de datos Alpha.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchAllData();
    }, []);

    // FILTRADO SOBRE EL SET COMPLETO
    const filteredData = useMemo(() => {
        if (!allRawData || allRawData.length === 0) return [];
        
        return allRawData.filter(row => {
            const rowResp = String(row.RESPCONTROLPROD || '').trim();

            // 1. Filtrado por Responsable (Literal desde restricciones RespCtrlProd)
            if (validRespCodes.length > 0) {
                if (!validRespCodes.includes(rowResp)) return false;
            }

            // 2. Filtrado por HRNP (Hoja de Ruta No Permitida)
            // Soporta múltiples valores separados por coma: [CODIGO:{MAQ1,MAQ2}]
            if (forbiddenMachinesMap.has(rowResp)) {
                const rowMachine = String(row.MAQUINA || row.Maquina || '').trim();
                const forbiddenOnes = forbiddenMachinesMap.get(rowResp);
                if (forbiddenOnes?.includes(rowMachine)) {
                    return false; // Excluir si la máquina está en la lista negra para este responsable
                }
            }

            // 3. Filtrado por término de búsqueda manual
            if (!searchTerm.trim()) return true;
            const term = searchTerm.toLowerCase();
            return Object.values(row).some(val => 
                String(val).toLowerCase().includes(term)
            );
        });
    }, [allRawData, searchTerm, validRespCodes, forbiddenMachinesMap]);

    // PAGINACIÓN LOCAL (Sobre el set ya filtrado)
    const totalFilteredRecords = filteredData.length;
    const totalPages = Math.max(1, Math.ceil(totalFilteredRecords / rowsPerPage));
    
    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * rowsPerPage;
        return filteredData.slice(start, start + rowsPerPage);
    }, [filteredData, currentPage, rowsPerPage]);

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
    }, [paginatedData]);

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
                            placeholder="Buscar en todo el set de datos..." 
                            className="pl-10 h-9"
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                        />
                    </div>
                    
                    <div className="flex flex-wrap gap-4 items-center">
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
                        
                        {forbiddenMachinesMap.size > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Exclusiones (HRNP):</span>
                                <div className="flex gap-1">
                                    {Array.from(forbiddenMachinesMap.entries()).map(([resp, machines]) => (
                                        <Badge key={resp} variant="outline" className="text-red-600 border-red-200 bg-red-50 text-[10px] px-2 py-0" title={`Excluye: ${machines.join(', ')}`}>
                                            {resp}: {machines.length > 2 ? `${machines.slice(0, 2).join(', ')}...` : machines.join(', ')}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                    <div className="text-[11px] text-gray-500 bg-gray-50 px-3 py-1.5 rounded-md border flex items-center gap-2">
                        <Info className="w-3 h-3 text-blue-500" />
                        <span>Total Descargado: <strong>{allRawData.length.toLocaleString()}</strong></span>
                        <span className="text-gray-300">|</span>
                        <span>Coincidencias: <strong>{totalFilteredRecords.toLocaleString()}</strong></span>
                    </div>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={fetchAllData} 
                        disabled={isLoading}
                        className="text-[10px] h-6 text-blue-600 hover:text-blue-800"
                    >
                        Actualizar Todo
                    </Button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 bg-gray-50 rounded-xl border-2 border-dashed gap-4">
                    <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
                    <div className="text-center">
                        <p className="text-sm font-bold text-gray-700">Descargando set de datos completo...</p>
                        <p className="text-xs text-gray-500 mt-1">
                            Procesados {downloadProgress.current.toLocaleString()} de {downloadProgress.total.toLocaleString()} registros
                        </p>
                    </div>
                </div>
            ) : allRawData.length > 0 ? (
                <>
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
                                {paginatedData.map((row, idx) => (
                                    <tr key={idx} className="hover:bg-indigo-50/30 transition-colors">
                                        {columns.map((col, cIdx) => (
                                          <TableCell key={`${idx}-${cIdx}`} className="px-4 py-2 text-center border-r border-dashed border-gray-200 last:border-r-0 whitespace-nowrap text-gray-600">
                                              {row[col] ?? '-'}
                                          </TableCell>
                                        ))}
                                    </tr>
                                ))}
                                {paginatedData.length === 0 && (
                                    <tr>
                                        <td colSpan={columns.length} className="py-24 text-center text-gray-500 italic bg-gray-50/50">
                                            No hay registros que coincidan con los filtros de responsabilidad y exclusión.
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
                                Mostrando <strong>{((currentPage - 1) * rowsPerPage) + 1}</strong> - <strong>{Math.min(currentPage * rowsPerPage, totalFilteredRecords)}</strong> de <strong>{totalFilteredRecords.toLocaleString()}</strong> coincidencias
                            </span>
                            <div className="flex gap-1 ml-4">
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>Primera</Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Ant.</Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>Sig.</Button>
                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(totalPages)} disabled={currentPage >= totalPages}>Última</Button>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center py-20 bg-gray-50 border-2 border-dashed rounded-xl shadow-inner">
                    <Package className="w-12 h-12 text-gray-300 mb-4" />
                    <p className="text-gray-500 font-medium text-center">
                        No se encontraron datos en el servidor.<br/>
                        <span className="text-xs text-gray-400">Verifica la conexión o los parámetros del API.</span>
                    </p>
                </div>
            )}
        </div>
    );
};