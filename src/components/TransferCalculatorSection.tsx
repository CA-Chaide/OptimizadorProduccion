'use client';

import React, { useState, useEffect } from 'react';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

interface InventoryRecord {
    [key: string]: any; // Permite cualquier campo
}

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(true);
    const [inventoryData, setInventoryData] = useState<InventoryRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);

    useEffect(() => {
        const handleFetchData = async () => {
            setIsProcessing(true);
            setError(null);
            setInventoryData([]);
            addNotification('info', `Consultando todos los registros de Cubo de Inventarios...`);

            try {
                const queryResult: InventoryRecord[] = await queryApi({
                    source: 'CuboInventarios',
                    operation: 'get_data',
                    pagination: { limit: 5000 }
                });

                if (!queryResult || queryResult.length === 0) {
                    addNotification('warning', `No se encontraron registros en CuboInventarios.`);
                    setIsProcessing(false);
                    return;
                }
                
                // Extraer cabeceras del primer objeto
                const firstItemHeaders = Object.keys(queryResult[0]);
                setHeaders(firstItemHeaders);

                setInventoryData(queryResult);
                addNotification('success', `Consulta completada. Se encontraron ${queryResult.length} registros.`);

            } catch (err) {
                const errorMessage = `Error durante la consulta: ${(err as Error).message}`;
                setError(errorMessage);
                addNotification('error', errorMessage);
            } finally {
                setIsProcessing(false);
            }
        };

        handleFetchData();
    }, [addNotification]);

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <DatabaseZap />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Cubo de Inventarios</h2>
            </div>
            
            <p className="text-gray-600">
                Mostrando todos los registros encontrados en la fuente de datos <span className="font-mono bg-gray-100 p-1 rounded">CuboInventarios</span>.
            </p>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            {headers.map(header => (
                                <th key={header} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">
                                    {header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isProcessing ? (
                            <tr>
                                <td colSpan={headers.length || 1} className="text-center p-8">
                                    <div className="flex justify-center items-center gap-2 text-gray-500">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Consultando...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={headers.length || 1} className="text-center p-8 text-red-500">
                                    {error}
                                </td>
                            </tr>
                        ) : inventoryData.length > 0 ? (
                            inventoryData.map((item, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    {headers.map(header => (
                                        <td key={header} className="px-3 py-2 whitespace-nowrap">
                                            {String(item[header] ?? 'N/D')}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        ) : (
                             <tr>
                                <td colSpan={headers.length || 1} className="text-center p-8 text-gray-500">
                                    No se encontraron datos para mostrar.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
