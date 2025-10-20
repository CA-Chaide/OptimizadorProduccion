'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

interface InventoryRecord {
    CodMaterial: string;
    ClaseAprovisionamiento: 'E' | 'F' | 'X' | null;
    Centro: string;
}

const normalizeMaterialCodeTo18Digits = (code: string | number): string => {
    return String(code).padStart(18, '0');
};

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [inventoryData, setInventoryData] = useState<InventoryRecord[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleFetchData = useCallback(async () => {
        setIsProcessing(true);
        setError(null);
        setInventoryData([]);
        addNotification('info', 'Consultando Cubo de Inventarios para el material 20000182...');

        try {
            const materialCode = normalizeMaterialCodeTo18Digits('20000182');

            const queryResult: InventoryRecord[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                filters: { 'CodMaterial': materialCode },
                columns: ['CodMaterial', 'ClaseAprovisionamiento', 'Centro']
            });

            if (!queryResult || queryResult.length === 0) {
                addNotification('warning', 'No se encontraron registros para el material especificado.');
                setIsProcessing(false);
                return;
            }
            
            const allKnownCenters = new Set(queryResult.map(r => r.Centro));
            ['1000', '2000'].forEach(c => allKnownCenters.add(c));

            const ruleForCenter1000 = queryResult.find(r => r.Centro === '1000');
            const isCentralized = ruleForCenter1000?.ClaseAprovisionamiento === 'F';
            
            const processedData: InventoryRecord[] = [];
            allKnownCenters.forEach(center => {
                let record = queryResult.find(r => r.Centro === center);
                if (!record) {
                    processedData.push({
                        CodMaterial: materialCode,
                        Centro: center,
                        ClaseAprovisionamiento: isCentralized ? 'F' : null
                    });
                } else {
                    processedData.push(record);
                }
            });


            setInventoryData(processedData.sort((a, b) => a.Centro.localeCompare(b.Centro)));
            addNotification('success', `Consulta completada. Se procesaron ${processedData.length} registros.`);

        } catch (err) {
            const errorMessage = `Error durante la consulta: ${(err as Error).message}`;
            setError(errorMessage);
            addNotification('error', errorMessage);
        } finally {
            setIsProcessing(false);
        }
    }, [addNotification]);

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <DatabaseZap />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Cubo de Inventarios</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta consulta la <span className="font-mono bg-gray-100 p-1 rounded">ClaseAprovisionamiento</span> para un material específico en todos sus centros, aplicando la lógica de fabricación centralizada ('F') desde el centro 1000 si es necesario.
            </p>

            <div className="flex items-center space-x-4 p-4 border rounded-lg bg-gray-50">
                <div className="flex-grow">
                    <label className="block text-sm font-medium text-gray-700">Material a consultar</label>
                    <input 
                        type="text" 
                        readOnly 
                        value="20000182"
                        className="w-full mt-1 border-gray-300 bg-gray-100 rounded-md shadow-sm py-2 px-3 sm:text-sm"
                    />
                </div>
                <button
                    onClick={handleFetchData}
                    disabled={isProcessing}
                    className="self-end h-10 px-6 py-2 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Consultar'}
                </button>
            </div>

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
                                <tr key={`${item.Centro}-${index}`} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap font-mono text-indigo-700">{item.CodMaterial || 'N/D'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{item.Centro || 'N/D'}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">{item.ClaseAprovisionamiento || 'N/D'}</td>
                                </tr>
                            ))
                        ) : (
                             <tr>
                                <td colSpan={3} className="text-center p-8 text-gray-500">
                                    Presione "Consultar" para buscar los datos.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
