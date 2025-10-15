'use client';

import React, { useState } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { TransferCalculatorIcon } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

interface DebugResult {
    code: string;
    count: number;
}

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification, isLoading: isAppLoading } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [debugResult, setDebugResult] = useState<DebugResult | null>(null);
    
    const handleLoadMasterData = async () => {
        setIsProcessing(true);
        setDebugResult(null);
        const targetCode = '20000182';
        
        try {
            addNotification('info', `Ejecutando consulta de depuración para CodMaterial: ${targetCode}...`);
            
            const assemblyData: TiempoEnsambleItem[] = await queryApi({ 
                source: 'TiemposEnsamblado', 
                operation: 'get_data',
                filters: {
                    'CodMaterial': String(targetCode),
                }
            });
            
            const resultCount = assemblyData ? assemblyData.length : 0;
            
            setDebugResult({ code: targetCode, count: resultCount });

            if (resultCount > 0) {
                addNotification('success', `Consulta completada. Se encontraron ${resultCount} registro(s) para el código ${targetCode}.`);
            } else {
                addNotification('warning', `La consulta no devolvió ningún registro para el código ${targetCode}.`);
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
                <h2 className="text-2xl font-semibold text-gray-700">Herramienta de Depuración de Consulta</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta ejecuta una consulta de depuración específica para aislar problemas en la obtención de datos desde la API.
                Actualmente, está configurada para traer todos los registros cuyo `CodMaterial` sea exactamente '20000182'.
            </p>

            <div className="p-4 border rounded-lg bg-gray-50 flex flex-col items-center gap-4">
                <button
                    onClick={handleLoadMasterData}
                    disabled={isProcessing || isAppLoading}
                    className="w-full md:w-1/2 h-12 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Consultando...' : "Ejecutar Consulta para Cód '20000182'"}
                </button>

                {debugResult !== null && (
                     <div className="mt-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                        <p className="text-lg font-semibold text-indigo-800">Resultado de la Depuración:</p>
                        <p className="text-xl font-bold text-gray-900 mt-2">
                           El código de material <span className="font-mono bg-gray-200 px-2 py-1 rounded">{debugResult.code}</span> aparece <span className="text-indigo-600">{debugResult.count}</span> vece(s) en la respuesta de la API.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
