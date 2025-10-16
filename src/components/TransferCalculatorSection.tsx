'use client';

import React, { useState, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { TransferCalculatorIcon } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification, isLoading: isAppLoading } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [foundData, setFoundData] = useState<TiempoEnsambleItem[]>([]);
    
    const handleDebugQuery = async () => {
        setIsProcessing(true);
        setFoundData([]);
        addNotification('info', "Consultando datos maestros para el material '20000182' en 'CuboInventarios'...");
        
        try {
            const resultData: TiempoEnsambleItem[] = await queryApi({ 
                source: 'CuboInventarios', 
                operation: 'get_data',
                filters: { 
                    'CodMaterial': '20000182',
                },
                pagination: { limit: 100 }
            });
            
            const resultCount = resultData ? resultData.length : 0;
            
            if (resultCount > 0) {
                setFoundData(resultData);
                addNotification('success', `Consulta completada. Se encontraron ${resultCount} registros para el material '20000182'.`);
            } else {
                addNotification('warning', `La consulta para el material '20000182' en 'CuboInventarios' no devolvió ningún registro.`);
            }

        } catch (error) {
            addNotification('error', `Error durante la consulta de depuración: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <TransferCalculatorIcon />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de `CuboInventarios`</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta ejecuta una consulta de depuración específica para validar el acceso a la tabla `CuboInventarios` y ver los datos maestros de un material.
            </p>

            <div className="p-4 border rounded-lg bg-gray-50 flex flex-col items-center gap-4">
                <button
                    onClick={handleDebugQuery}
                    disabled={isProcessing || isAppLoading}
                    className="w-full md:w-1/2 h-12 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Consultando...' : "Buscar Material '20000182' en CuboInventarios"}
                </button>
            </div>

            {foundData.length > 0 && (
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Resultados de la Consulta</h3>
                    <div className="relative max-h-[70vh] overflow-y-auto border rounded-lg shadow-inner">
                        <table className="min-w-full text-xs divide-y divide-gray-200">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">CodMaterial</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Centro</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Clase Aprov.</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Stock Seg.</th>
                                    {/* Agregue más columnas si es necesario */}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {foundData.map((item, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 font-medium text-gray-500">{index + 1}</td>
                                        <td className="px-3 py-2 whitespace-nowrap font-mono text-indigo-700">{item.CodMaterial}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{item.Centro}</td>
                                        <td className="px-3 py-2 whitespace-nowrap font-bold">{item.ClaseAprovisionamiento}</td>
                                        <td className="px-3 py-2 text-right">{item.StockSeguridad}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
