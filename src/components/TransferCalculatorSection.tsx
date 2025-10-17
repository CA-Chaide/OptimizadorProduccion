'use client';

import React, { useState, useEffect } from 'react';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

interface InventoryRecord {
    CodMaterial: string;
    ClaseAprovisionamiento: 'E' | 'F' | 'X' | null;
    Centro: string;
}

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(true);
    const [inventoryData, setInventoryData] = useState<InventoryRecord[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchInventoryData = async () => {
            setIsProcessing(true);
            setError(null);
            addNotification('info', 'Consultando datos para el material 20000182...');

            try {
                // El material debe tener 18 dígitos, rellenamos con ceros a la izquierda.
                const materialCode = '20000182'.padStart(18, '0');

                const queryResult = await queryApi({
                    source: 'CuboInventarios',
                    operation: 'get_data',
                    filters: { 'CodMaterial': materialCode },
                    columns: ['CodMaterial', 'ClaseAprovisionamiento', 'Centro']
                });

                if (queryResult && queryResult.length > 0) {
                    setInventoryData(queryResult);
                    addNotification('success', `Se encontraron ${queryResult.length} registros para el material.`);
                } else {
                    setInventoryData([]);
                    addNotification('warning', 'No se encontraron registros para el material especificado.');
                }

            } catch (err) {
                const errorMessage = `Error durante la consulta: ${(err as Error).message}`;
                setError(errorMessage);
                addNotification('error', errorMessage);
            } finally {
                setIsProcessing(false);
            }
        };

        fetchInventoryData();
    }, [addNotification]);


    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <DatabaseZap />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Cubo de Inventarios</h2>
            </div>
            
            <p className="text-gray-600">
                Mostrando resultados para el material <span className="font-mono bg-gray-100 p-1 rounded">20000182</span>.
            </p>

            <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase de Aprovisionamiento</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isProcessing ? (
                            <tr>
                                <td colSpan={3} className="text-center p-8">
                                    <div className="flex justify-center items-center gap-2 text-gray-500">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Consultando...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={3} className="text-center p-8 text-red-500">
                                    {error}
                                </td>
                            </tr>
                        ) : inventoryData.length > 0 ? (
                            inventoryData.map((item, index) => (
                                <tr key={`${item.CodMaterial}-${item.Centro}-${index}`} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap font-mono text-indigo-700">{item.CodMaterial}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{item.Centro}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{item.ClaseAprovisionamiento || 'N/D'}</td>
                                </tr>
                            ))
                        ) : (
                             <tr>
                                <td colSpan={3} className="text-center p-8 text-gray-500">
                                    No se encontraron datos para el material especificado.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
