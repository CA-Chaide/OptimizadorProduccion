'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { TransferCalculatorIcon } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification, isLoading: isAppLoading } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [masterData, setMasterData] = useState<TiempoEnsambleItem[]>([]);
    
    const handleLoadMasterData = async () => {
        setIsProcessing(true);
        setMasterData([]);
        
        try {
            addNotification('info', `Ejecutando consulta de depuración para todos los materiales del centro 2000...`);
            
            const assemblyData: TiempoEnsambleItem[] = await queryApi({ 
                source: 'TiemposEnsamblado', 
                operation: 'get_data',
                filters: {
                    'Centro': String('2000'),
                }
            });
            
            if (assemblyData && assemblyData.length > 0) {
                setMasterData(assemblyData);
                addNotification('success', `Consulta de depuración completada. Se encontraron ${assemblyData.length} registro(s) para el Centro 2000.`);
            } else {
                setMasterData([]);
                addNotification('warning', 'La consulta de depuración no devolvió ningún registro para el Centro 2000.');
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
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Datos Maestros (Tiempos de Ensamble)</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta ejecuta una consulta de depuración específica para aislar problemas en la obtención de datos desde la API. Actualmente, está configurada para traer **todos los registros del Centro 2000**.
            </p>

            <div className="p-4 border rounded-lg bg-gray-50">
                <button
                    onClick={handleLoadMasterData}
                    disabled={isProcessing || isAppLoading}
                    className="w-full md:w-1/3 h-12 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Cargando...' : 'Cargar Datos (Modo Depuración)'}
                </button>
            </div>

            {masterData.length > 0 && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-800">Resultados de la Consulta de Depuración ({masterData.length} registros)</h3>
                
                <div className="relative max-h-[70vh] overflow-y-auto border rounded-lg shadow-inner mt-4">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Cód. Material</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600 uppercase tracking-wider">Clase Aprov.</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Línea</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Puesto Trabajo</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Tiempo (min)</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Seguridad</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {masterData.map((item, index) => (
                                <tr key={`${item.CodMaterial}-${item.Centro}-${item.Linea}-${item.PuestoTrabajo}-${index}`}>
                                    <td className="px-3 py-2 whitespace-normal font-medium text-gray-800">{item.Material}</td>
                                    <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-500">{item.CodMaterial}</td>
                                    <td className="px-3 py-2 text-center font-bold text-indigo-700">{item.ClaseAprovisionamiento || '-'}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.Centro}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.Linea}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.PuestoTrabajo}</td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-900">{item.Tiempo?.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-right text-gray-700">{item.StockSeguridad?.toLocaleString()}</td>
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
