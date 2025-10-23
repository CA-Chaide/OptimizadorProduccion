
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { queryApi } from '@/hooks/useApiData';
import { Package, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

interface InventoryItem {
    Sector: string;
    StockActual: number;
}

interface SectorTotal {
    sector: string;
    totalStock: number;
}

interface DisplayRow {
    type: 'data' | 'subtotal';
    sector: string;
    totalStock: number;
}

export const InventorySummarySection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(true);
    const [displayRows, setDisplayRows] = useState<DisplayRow[]>([]);
    const [error, setError] = useState<string | null>(null);

    const fetchInventorySummary = useCallback(async () => {
        setIsProcessing(true);
        setError(null);
        addNotification('info', `Consultando stock total por sector desde CuboInventarios...`);

        try {
            const inventoryData: InventoryItem[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                columns: ['Sector', 'StockActual'],
                pagination: { limit: 500000 } // Fetch all data
            });
            
            if (inventoryData) {
                const totals: { [sector: string]: number } = {};
                inventoryData.forEach(item => {
                    if (item.Sector && item.StockActual) {
                        const sector = item.Sector || 'Sin Sector';
                        totals[sector] = (totals[sector] || 0) + Number(item.StockActual);
                    }
                });

                const allSectorTotals = Object.entries(totals).map(([sector, totalStock]) => ({ sector, totalStock }));
                
                const priorityOrder = ['Colchones', 'Bases-cabeceros-cama', 'Muebles de fabricación'];
                const prioritySectors: DisplayRow[] = [];
                const otherSectors: SectorTotal[] = [];
                
                allSectorTotals.forEach(item => {
                    if (priorityOrder.includes(item.sector)) {
                        prioritySectors.push({ type: 'data', ...item });
                    } else {
                        otherSectors.push(item);
                    }
                });
                
                prioritySectors.sort((a, b) => priorityOrder.indexOf(a.sector) - priorityOrder.indexOf(b.sector));
                
                const subtotal = prioritySectors.reduce((sum, item) => sum + item.totalStock, 0);
                const subtotalRow: DisplayRow = { type: 'subtotal', sector: 'Subtotal Fabricación', totalStock: subtotal };
                
                otherSectors.sort((a, b) => b.totalStock - a.totalStock);
                const otherDisplayRows: DisplayRow[] = otherSectors.map(item => ({ type: 'data', ...item }));

                setDisplayRows([...prioritySectors, subtotalRow, ...otherDisplayRows]);
                addNotification('success', `Resumen de inventario por sector cargado correctamente.`);

            } else {
                 addNotification('warning', `La consulta a CuboInventarios no devolvió datos.`);
            }

        } catch (err) {
            const errorMessage = `Error al consultar el resumen de inventario: ${(err as Error).message}`;
            setError(errorMessage);
            addNotification('error', errorMessage);
        } finally {
            setIsProcessing(false);
        }
    }, [addNotification]);
    
    useEffect(() => {
        fetchInventorySummary();
    }, [fetchInventorySummary]);
    
    const grandTotal = useMemo(() => {
        return displayRows.filter(row => row.type === 'data').reduce((sum, item) => sum + item.totalStock, 0);
    }, [displayRows]);

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <Package />
                <h2 className="text-2xl font-semibold text-gray-700">Resumen de Inventario por Sector</h2>
            </div>
            
            <p className="text-gray-600">
                Este reporte muestra la suma total del campo `StockActual` agrupado por `Sector`, consultado directamente desde la tabla `CuboInventarios` sin ningún filtro.
                Utilícelo para verificar el saldo inicial total del plan de producción.
            </p>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Sector</th>
                            <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Total (Unidades)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isProcessing ? (
                            <tr>
                                <td colSpan={2} className="text-center p-8">
                                    <div className="flex justify-center items-center gap-2 text-gray-500">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Consultando...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={2} className="text-center p-8 text-red-500">
                                    {error}
                                </td>
                            </tr>
                        ) : displayRows.length > 0 ? (
                            displayRows.map((row, index) => {
                                if (row.type === 'subtotal') {
                                    return (
                                        <tr key={`subtotal-${index}`} className="bg-gray-100 font-bold">
                                            <td className="px-4 py-2 text-right text-gray-700">{row.sector}</td>
                                            <td className="px-4 py-2 whitespace-nowrap font-mono text-right text-gray-800">{Math.round(row.totalStock).toLocaleString()}</td>
                                        </tr>
                                    );
                                }
                                return (
                                    <tr key={row.sector} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 whitespace-nowrap font-medium">{row.sector}</td>
                                        <td className="px-4 py-2 whitespace-nowrap font-mono text-right font-bold text-blue-700">{Math.round(row.totalStock).toLocaleString()}</td>
                                    </tr>
                                );
                            })
                        ) : (
                             <tr>
                                <td colSpan={2} className="text-center p-8 text-gray-500">
                                    No se encontraron datos de inventario.
                                </td>
                            </tr>
                        )}
                    </tbody>
                     <tfoot className="bg-gray-800 text-white sticky bottom-0 z-10">
                        <tr>
                            <th className="px-3 py-2 text-left font-bold uppercase tracking-wider">TOTAL GENERAL</th>
                            <th className="px-3 py-2 text-right font-bold uppercase tracking-wider">
                                {Math.round(grandTotal).toLocaleString()}
                            </th>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
