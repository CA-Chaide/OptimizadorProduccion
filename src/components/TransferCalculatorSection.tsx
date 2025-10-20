'use client';

import React, { useState, useCallback } from 'react';
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
    const [materialToQuery, setMaterialToQuery] = useState<string>('20000182');
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [inventoryData, setInventoryData] = useState<InventoryRecord[]>([]);
    const [error, setError] = useState<string | null>(null);

    const handleFetchData = async () => {
        if (!materialToQuery) {
            addNotification('warning', 'Por favor, ingrese un código de material para consultar.');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setInventoryData([]);
        addNotification('info', `Consultando Cubo de Inventarios para el material ${materialToQuery}...`);

        try {
            const materialCode = normalizeMaterialCodeTo18Digits(materialToQuery);

            const queryResult: InventoryRecord[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                filters: { 'CodMaterial': materialCode },
                columns: ['CodMaterial', 'ClaseAprovisionamiento', 'Centro']
            });

            if (!queryResult || queryResult.length === 0) {
                addNotification('warning', `No se encontraron registros para el material ${materialToQuery}.`);
                setIsProcessing(false);
                return;
            }
            
            setInventoryData(queryResult.sort((a, b) => a.Centro.localeCompare(b.Centro)));
            addNotification('success', `Consulta completada. Se encontraron ${queryResult.length} registros.`);

        } catch (err) {
            const errorMessage = `Error durante la consulta: ${(err as Error).message}`;
            setError(errorMessage);
            addNotification('error', errorMessage);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <DatabaseZap />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Cubo de Inventarios</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta consulta la <span className="font-mono bg-gray-100 p-1 rounded">ClaseAprovisionamiento</span> para un material específico en todos sus centros registrados.
            </p>

            <div className="flex items-center space-x-4 p-4 border rounded-lg bg-gray-50">
                <div className="flex-grow">
                    <label htmlFor="material-input" className="block text-sm font-medium text-gray-700">Material a consultar</label>
                    <input 
                        id="material-input"
                        type="text" 
                        value={materialToQuery}
                        onChange={(e) => setMaterialToQuery(e.target.value)}
                        className="w-full mt-1 border-gray-300 bg-white rounded-md shadow-sm py-2 px-3 sm:text-sm"
                        placeholder="Ingrese código de material"
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
                                    Ingrese un material y presione "Consultar" para buscar los datos.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
