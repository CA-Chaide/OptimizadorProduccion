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

export const InventoryNeedsSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [inventoryData, setInventoryData] = useState<CuboInventariosRow[]>([]);

    const handleFetchData = useCallback(async () => {
        setIsLoading(true);
        setInventoryData([]);
        addNotification('info', 'Consultando datos de CuboInventarios...');

        try {
            const data = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                columns: ["Centro", "ClaseAprovisionam", "Descripcion", "Material", "StockSeguridad", "StockActual"],
                pagination: { limit: 500000 }
            });

            if (data && data.length > 0) {
                setInventoryData(data);
                addNotification('success', `Se cargaron ${data.length} registros de inventario.`);
            } else {
                addNotification('warning', 'No se encontraron datos en CuboInventarios.');
            }
        } catch (error: any) {
            addNotification('error', `Error al consultar inventario: ${error.message}`);
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
                Esta sección muestra los datos brutos obtenidos de la tabla `CuboInventarios`.
                Presione el botón para iniciar la consulta.
            </p>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase Aprov.</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Actual</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Seguridad</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {inventoryData.length > 0 ? (
                            inventoryData.map((row, index) => (
                                <tr key={index}>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Centro}</td>
                                    <td className="px-2 py-2 whitespace-nowrap font-mono">{row.Material}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Descripcion || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.ClaseAprovisionam || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{(row.StockActual || 0).toLocaleString()}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{(row.StockSeguridad || 0).toLocaleString()}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={6} className="text-center py-8 text-gray-500">
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
