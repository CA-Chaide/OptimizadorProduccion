'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { serviciosService } from '@/services/servicios.service';
import type { Grupo } from '@/types/interfaces';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

interface TiemposEnsambladoTabProps {
    grupos: Grupo[];
}

export const TiemposEnsambladoTab: React.FC<TiemposEnsambladoTabProps> = ({ grupos }) => {
    const { addNotification } = useAppContext();
    const [selectedCentro, setSelectedCentro] = useState('');
    const [selectedGrupo, setSelectedGrupo] = useState('');
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    const handleFetch = useCallback(async () => {
        if (!selectedCentro || !selectedGrupo) {
            addNotification('warning', 'Por favor seleccione un centro y un grupo.');
            return;
        }
        setIsLoading(true);
        setData([]);
        try {
            const response = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(selectedCentro, Number(selectedGrupo));
            if (response && response.data) {
                const dataArray = Array.isArray(response.data) ? response.data : [response.data];
                setData(dataArray);
                if (dataArray.length > 0) {
                    setColumns(Object.keys(dataArray[0]));
                }
                addNotification('success', `Se encontraron ${dataArray.length} registros.`);
            } else {
                addNotification('warning', 'No se encontraron datos para la selección.');
            }
        } catch (error) {
            addNotification('error', `Error al cargar los datos: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedCentro, selectedGrupo, addNotification]);

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
    }, [data]);

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

    const centros = [...new Set(grupos.map(g => g.centro))].map(c => ({ value: c, label: c }));
    const gruposFiltrados = selectedCentro ? grupos.filter(g => g.centro === selectedCentro) : [];

    return (
        <Card>
            <CardHeader>
                <CardTitle>Consultar Tiempos de Ensamblado por Centro y Grupo</CardTitle>
                <CardDescription>Filtre por centro y grupo para ver los tiempos de ensamblado.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex gap-4 items-end mb-4 p-4 border rounded-lg bg-gray-50">
                    <div>
                        <label htmlFor="centro-select" className="block text-sm font-medium text-gray-700">Centro</label>
                        <select
                            id="centro-select"
                            value={selectedCentro}
                            onChange={(e) => {
                                setSelectedCentro(e.target.value);
                                setSelectedGrupo(''); // Reset grupo when centro changes
                            }}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                        >
                            <option value="">Seleccione Centro</option>
                            {centros.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="grupo-select" className="block text-sm font-medium text-gray-700">Grupo</label>
                        <select
                            id="grupo-select"
                            value={selectedGrupo}
                            onChange={(e) => setSelectedGrupo(e.target.value)}
                            disabled={!selectedCentro}
                            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border"
                        >
                            <option value="">Seleccione Grupo</option>
                            {gruposFiltrados.map(g => <option key={g.codigo_grupo} value={g.codigo_grupo}>{g.nombre_grupo}</option>)}
                        </select>
                    </div>
                    <Button onClick={handleFetch} disabled={isLoading || !selectedCentro || !selectedGrupo}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Consultar
                    </Button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
                ) : (
                    data.length > 0 && (
                        <>
                            <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden" style={{ height: '18px' }}>
                                <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
                            </div>
                            <div ref={tableScrollRef} onScroll={handleTableScroll} className="border rounded-lg overflow-auto max-h-[60vh]">
                                <Table ref={tableRef}>
                                    <TableHeader>
                                        <TableRow>
                                            {columns.map(col => <TableHead key={col}>{col}</TableHead>)}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.map((row, idx) => (
                                            <TableRow key={idx}>
                                                {columns.map(col => <TableCell key={`${idx}-${col}`}>{String(row[col] ?? '-')}</TableCell>)}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </>
                    )
                )}
            </CardContent>
        </Card>
    );
}
