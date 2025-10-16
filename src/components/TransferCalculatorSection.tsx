'use client';

import React, { useState, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { TransferCalculatorIcon } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification, isLoading: isAppLoading } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [foundData, setFoundData] = useState<any[]>([]);
    const [availableFields, setAvailableFields] = useState<string[]>([]);
    
    const handleDebugQuery = async () => {
        setIsProcessing(true);
        setFoundData([]);
        setAvailableFields([]);
        addNotification('info', "Consultando un registro de 'CuboInventarios' para el material '20000182' para inspeccionar sus campos...");
        
        try {
            const resultData: any[] = await queryApi({ 
                source: 'CuboInventarios', 
                operation: 'get_data',
                filters: { 
                    'CodMaterial': '20000182',
                },
                pagination: { limit: 1 } // Solo necesitamos 1 registro para ver los campos
            });
            
            const resultCount = resultData ? resultData.length : 0;
            
            if (resultCount > 0) {
                const firstRecord = resultData[0];
                const fields = Object.keys(firstRecord);
                setAvailableFields(fields);
                addNotification('success', `Consulta completada. Se encontraron los siguientes campos en la tabla 'CuboInventarios'.`);
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
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Datos: `CuboInventarios`</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta ejecuta una consulta de depuración para inspeccionar la estructura de la nueva tabla `CuboInventarios`.
            </p>

            <div className="p-4 border rounded-lg bg-gray-50 flex flex-col items-center gap-4">
                <button
                    onClick={handleDebugQuery}
                    disabled={isProcessing || isAppLoading}
                    className="w-full md:w-1/2 h-12 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Consultando...' : "Inspeccionar Campos de 'CuboInventarios'"}
                </button>
            </div>

            {availableFields.length > 0 && (
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Campos Disponibles en `CuboInventarios`</h3>
                    <div className="p-4 border rounded-lg bg-gray-50">
                        <ul className="list-disc list-inside space-y-2">
                            {availableFields.map((field, index) => (
                                <li key={index} className="font-mono text-indigo-700 text-lg">
                                    {field}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
};
