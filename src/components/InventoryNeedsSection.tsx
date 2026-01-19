'use client';

import React, { useState, useCallback } from 'react';
import { useAppContext } from '@/context/AppProvider';
import { queryApi } from '@/hooks/useApiData';
import { Sheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CuboInventariosRow {
    Centro: string;
    ClaseAprovisionam: string | null;
    Descripcion?: string;
    Material: string;
    StockSeguridad: number;
    StockActual: number;
}

interface TiempoEnsambleRow {
    CodMaterial: string;
    Centro: string;
    Linea: string;
    Tiempo: number;
}

interface DisplayRow extends CuboInventariosRow {
    Linea: string | null;
    Tiempo: number | null;
}

// Function to normalize material codes to match sales data format
const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code).trim();
    return codeStr.slice(-8);
};

export const InventoryNeedsSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [inventoryData, setInventoryData] = useState<DisplayRow[]>([]);

    const handleFetchData = useCallback(async () => {
        setIsLoading(true);
        setInventoryData([]);
        addNotification('info', 'Consultando datos de CuboInventarios y TiemposEnsamblado...');

        try {
            const [cuboData, tiemposData]: [CuboInventariosRow[], TiempoEnsambleRow[]] = await Promise.all([
                queryApi({
                    source: 'CuboInventarios',
                    operation: 'get_data',
                    columns: ["Centro", "ClaseAprovisionam", "Descripcion", "Material", "StockSeguridad", "StockActual"],
                    pagination: { limit: 500000 }
                }),
                queryApi({
                    source: 'TiemposEnsamblado',
                    operation: 'get_data',
                    columns: ["CodMaterial", "Centro", "Linea", "Tiempo"],
                    pagination: { limit: 500000 }
                })
            ]);

            if (!cuboData || cuboData.length === 0) {
                addNotification('warning', 'No se encontraron datos en CuboInventarios.');
                setIsLoading(false);
                return;
            }
             if (!tiemposData || tiemposData.length === 0) {
                addNotification('warning', 'No se encontraron datos en TiemposEnsamblado. No se puede determinar Línea y Tiempo.');
                // We can still show inventory data, just without line/time info.
            }

            const transformedData = cuboData.map(item => {
                const normalizedMaterial = normalizeMaterialCode(item.Material);
                
                let searchCenter = item.Centro;
                // Special rule for Center 2000 and Class 'F'
                if (item.Centro === '2000' && item.ClaseAprovisionam === 'F') {
                    searchCenter = '1000';
                }

                const relevantTiempos = tiemposData.filter(t => 
                    normalizeMaterialCode(t.CodMaterial) === normalizedMaterial &&
                    String(t.Centro).trim() === searchCenter
                );

                let bestTiempoEntry: TiempoEnsambleRow | null = null;
                if (relevantTiempos.length > 0) {
                    // Find the entry with the minimum time
                    bestTiempoEntry = relevantTiempos.reduce((min, current) => {
                        return (current.Tiempo < min.Tiempo) ? current : min;
                    }, relevantTiempos[0]);
                }

                return {
                    ...item,
                    Material: normalizedMaterial,
                    StockActual: Math.round(item.StockActual || 0),
                    StockSeguridad: Math.round(item.StockSeguridad || 0),
                    Linea: bestTiempoEntry?.Linea || null,
                    Tiempo: bestTiempoEntry?.Tiempo || null,
                };
            });
            
            setInventoryData(transformedData);
            addNotification('success', `Se cargaron y procesaron ${cuboData.length} registros de inventario.`);
            
        } catch (error: any) {
            addNotification('error', `Error al consultar datos: ${error.message}`);
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [addNotification]);
    
    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <Sheet />
                    <h2 className="text-2xl font-semibold text-gray-700">Consulta de Inventario</h2>
                </div>
                <Button onClick={handleFetchData} disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Cargando...
                        </>
                    ) : (
                        'Cargar Datos de Inventario'
                    )}
                </Button>
            </div>
            
            <p className="text-gray-600 text-sm">
                Esta sección muestra los datos brutos obtenidos de la tabla `CuboInventarios` y los cruza con `TiemposEnsamblado` para obtener la línea y el tiempo de producción.
            </p>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase Aprov.</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Línea</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Tiempo</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Actual</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Seguridad</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {inventoryData.length > 0 ? (
                            inventoryData.map((row, index) => (
                                <tr key={`${row.Material}-${row.Centro}-${index}`}>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Centro}</td>
                                    <td className="px-2 py-2 whitespace-nowrap font-mono">{row.Material}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Descripcion || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.ClaseAprovisionam || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Linea || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{row.Tiempo !== null ? row.Tiempo.toFixed(2) : 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{(row.StockActual || 0).toLocaleString()}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{(row.StockSeguridad || 0).toLocaleString()}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={8} className="text-center py-8 text-gray-500">
                                    {isLoading ? 'Cargando datos...' : 'No hay datos para mostrar. Presione el botón para cargar.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
