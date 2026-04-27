
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
    const [data, setData] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [columns, setColumns] = useState<string[]>([]);
    
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    const handleFetch = useCallback(async () => {
        // Find the 'Muebles' group for 'Centro' 1000
        const centro = '1000';
        const grupoMuebles = grupos.find(g => 
            g.centro === centro && g.nombre_grupo.toLowerCase().includes('muebles')
        );

        if (!grupoMuebles) {
            addNotification('warning', 'No se encontró el grupo "Muebles" para el centro 1000.');
            return;
        }

        const codigoGrupo = grupoMuebles.codigo_grupo;

        setIsLoading(true);
        setData([]);
        try {
            const response = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(centro, codigoGrupo);
            if (response && response.data) {
                const dataArray = Array.isArray(response.data) ? response.data : [response.data];
                setData(dataArray);
                if (dataArray.length > 0) {
                    setColumns(Object.keys(dataArray[0]));
                }
                addNotification('success', `Se encontraron ${dataArray.length} registros para Muebles en Centro 1000.`);
            } else {
                addNotification('warning', 'No se encontraron datos para la selección.');
            }
        } catch (error) {
            addNotification('error', `Error al cargar los datos: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [grupos, addNotification]);

    // Fetch data automatically on component mount or when grupos change
    useEffect(() => {
        if (grupos.length > 0) {
            handleFetch();
        }
    }, [grupos, handleFetch]);

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

    return (
        <Card>
            <CardHeader>
                <CardTitle>Tiempos de Ensamblado - Muebles (Centro 1000)</CardTitle>
                <CardDescription>Tiempos de ensamblado para el grupo de Muebles en el centro 1000.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="flex justify-center items-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
                ) : (
                    data.length > 0 ? (
                        <>
                            <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden" style={{ height: '18px' }}>
                                <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
                            </div>
                            <div ref={tableScrollRef} onScroll={handleTableScroll} className="border rounded-lg overflow-auto max-h-[60vh]">
                                <table ref={tableRef} className="min-w-full text-xs divide-y divide-gray-200">
                                    <TableHeader>
                                        <TableRow>
                                            {columns.map(col => <TableHead key={col}>{col}</TableHead>)}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {data.map((row, idx) => (
                                            <TableRow key={idx}>
                                                {columns.map(col => {
                                                    const value = row[col];
                                                    const displayValue = (col === 'Tiempo_Min' || col === 'Tiempo') && typeof value === 'number'
                                                        ? value.toFixed(2)
                                                        : String(value ?? '-');
                                                    return <TableCell key={`${idx}-${col}`}>{displayValue}</TableCell>;
                                                })}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </table>
                            </div>
                        </>
                    ) : (
                         <div className="text-center py-8 text-gray-500">
                            No se encontraron datos de tiempos de ensamblado para Muebles en Centro 1000.
                        </div>
                    )
                )}
            </CardContent>
        </Card>
    );
}
