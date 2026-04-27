
'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Grupo } from '@/types/interfaces';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

interface TiemposEnsambladoTabProps {
    data: any[];
    isLoading: boolean;
}

export const TiemposEnsambladoTab: React.FC<TiemposEnsambladoTabProps> = ({ data, isLoading }) => {
    const [columns, setColumns] = useState<string[]>([]);
    
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

    useEffect(() => {
        if (data.length > 0) {
            setColumns(Object.keys(data[0]));
        }
    }, [data]);

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
                                            {columns.map(col => <TableHead key={col}>{col === 'CodMaterial' ? 'MATERIAL' : col}</TableHead>)}
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
