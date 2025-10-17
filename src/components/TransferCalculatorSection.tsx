'use client';

import React, { useState, useEffect } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(true);
    const [results, setResults] = useState<TiempoEnsambleItem[]>([]);

    useEffect(() => {
        const handleFetchData = async () => {
            setIsProcessing(true);
            addNotification('info', 'Consultando datos para el material 20000181...');

            try {
                // El código de material se rellena con ceros a la izquierda hasta completar 18 caracteres.
                const materialCode = '20000181'.padStart(18, '0');
                
                const data: TiempoEnsambleItem[] = await queryApi({
                    source: 'CuboInventarios',
                    operation: 'get_data',
                    filters: { 'CodMaterial': materialCode }
                });

                if (!data || data.length === 0) {
                    addNotification('warning', `No se encontraron datos para el material ${materialCode}.`);
                    setResults([]);
                } else {
                    setResults(data);
                    addNotification('success', `Carga completada. Se encontraron ${data.length} registros para el material.`);
                }

            } catch (error) {
                addNotification('error', `Error durante la consulta a CuboInventarios: ${(error as Error).message}`);
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
                Resultados de la consulta para el material específico <span className="font-mono bg-gray-100 p-1 rounded">20000181</span>.
            </p>

            <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase Aprovisionamiento</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isProcessing ? (
                            <tr>
                                <td colSpan={3} className="text-center p-8">
                                    <div className="flex justify-center items-center gap-2 text-gray-500">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Consultando datos...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : results.length > 0 ? (
                            results.map((item, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap font-mono">{item.CodMaterial}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{item.Centro}</td>
                                    <td className="px-4 py-3 whitespace-nowrap font-medium">{item.ClaseAprovisionamiento}</td>
                                </tr>
                            ))
                        ) : (
                             <tr>
                                <td colSpan={3} className="text-center p-8 text-gray-500">
                                    No se encontraron resultados para la consulta.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
