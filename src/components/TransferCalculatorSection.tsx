'use client';

import React, { useState, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { TransferCalculatorIcon } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification, isLoading: isAppLoading } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [allDataForCenter, setAllDataForCenter] = useState<TiempoEnsambleItem[]>([]);
    const [materialCodeFilter, setMaterialCodeFilter] = useState<string>('');

    const handleLoadMasterData = async () => {
        setIsProcessing(true);
        setAllDataForCenter([]);
        setMaterialCodeFilter('');
        addNotification('info', "Iniciando consulta de datos para el Centro 2000...");
        
        try {
            const assemblyData: TiempoEnsambleItem[] = await queryApi({ 
                source: 'TiemposEnsamblado', 
                operation: 'get_data',
                filters: { 'Centro': '2000' },
                pagination: { limit: 1000 } // Aumentar límite para obtener todos los datos
            });
            
            const resultCount = assemblyData ? assemblyData.length : 0;
            
            if (resultCount > 0) {
                setAllDataForCenter(assemblyData || []);
                addNotification('success', `Consulta completada. Se recibieron ${resultCount} registros para el Centro 2000.`);
            } else {
                addNotification('warning', `La consulta para el Centro 2000 no devolvió ningún registro.`);
            }

        } catch (error) {
            addNotification('error', `Error durante la consulta de datos: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
        }
    };
    
    const filteredData = useMemo(() => {
        if (allDataForCenter.length === 0) return [];
        if (!materialCodeFilter.trim()) return allDataForCenter;
        
        return allDataForCenter.filter(item => 
            String(item.CodMaterial).includes(materialCodeFilter.trim())
        );
    }, [allDataForCenter, materialCodeFilter]);

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <TransferCalculatorIcon />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Datos Maestros</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta carga todos los registros de la tabla de Tiempos de Ensamble para un centro específico y permite explorarlos. Útil para validar la integridad de los datos directamente desde la API.
            </p>

            <div className="p-4 border rounded-lg bg-gray-50 flex flex-col items-center gap-4">
                <button
                    onClick={handleLoadMasterData}
                    disabled={isProcessing || isAppLoading}
                    className="w-full md:w-1/2 h-12 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Consultando...' : "Cargar Datos del Centro 2000"}
                </button>
            </div>

            {allDataForCenter.length > 0 && (
                 <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-semibold text-gray-800">Resultados para Centro 2000 ({filteredData.length} de {allDataForCenter.length} registros)</h3>
                        <div>
                            <label htmlFor="material-filter" className="text-sm font-medium text-gray-700 mr-2">Filtrar por Cód. Material:</label>
                            <input
                                id="material-filter"
                                type="text"
                                value={materialCodeFilter}
                                onChange={e => setMaterialCodeFilter(e.target.value)}
                                className="px-3 py-1 border border-gray-300 rounded-md shadow-sm sm:text-sm"
                                placeholder="Ej: 20000182"
                            />
                        </div>
                    </div>
                    <div className="relative max-h-[70vh] overflow-y-auto border rounded-lg shadow-inner">
                        <table className="min-w-full text-xs divide-y divide-gray-200">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">CodMaterial</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Centro</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Clase Aprov.</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Linea</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Puesto Trabajo</th>
                                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Tiempo</th>
                                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Stock Seg.</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredData.map((item, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 font-medium text-gray-500">{index + 1}</td>
                                        <td className="px-3 py-2 whitespace-nowrap font-mono text-indigo-700">{item.CodMaterial}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{item.Centro}</td>
                                        <td className="px-3 py-2 whitespace-nowrap font-bold">{item.ClaseAprovisionamiento}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{item.Linea}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">{item.PuestoTrabajo}</td>
                                        <td className="px-3 py-2 text-right">{item.Tiempo}</td>
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
