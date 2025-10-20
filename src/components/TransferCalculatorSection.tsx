'use client';

import React, { useState, useEffect } from 'react';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap, Loader2, Search } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

interface InventoryRecord {
    [key: string]: any;
}

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [inventoryData, setInventoryData] = useState<InventoryRecord[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [materialInput, setMaterialInput] = useState<string>('20000182');

    const handleFetchData = async () => {
        if (!materialInput.trim()) {
            addNotification('warning', 'Por favor, ingrese un código de material.');
            return;
        }

        setIsProcessing(true);
        setError(null);
        setInventoryData([]);

        // Rellenar con ceros a la izquierda para completar 18 caracteres
        const paddedMaterialCode = materialInput.trim().padStart(18, '0');

        const query = {
            source: 'CuboInventarios',
            operation: 'get_data',
            filters: { 'Material': paddedMaterialCode },
            // Especificamos las columnas para ser eficientes
            columns: ['Material', 'Centro', 'ClaseAprovisionam'],
        };

        console.log('[DEBUG] Enviando la siguiente consulta a la API:', query);
        addNotification('info', `Consultando material: ${paddedMaterialCode}...`);

        try {
            const queryResult: InventoryRecord[] = await queryApi(query);

            console.log('[DEBUG] Respuesta recibida de la API:', queryResult);

            if (!queryResult || queryResult.length === 0) {
                addNotification('warning', `No se encontraron registros para el material ${paddedMaterialCode}.`);
            } else {
                setInventoryData(queryResult);
                addNotification('success', `Consulta completada. Se encontraron ${queryResult.length} registros.`);
            }
        } catch (err) {
            const errorMessage = `Error durante la consulta: ${(err as Error).message}`;
            console.error('[DEBUG] Error en la consulta a la API:', err);
            setError(errorMessage);
            addNotification('error', errorMessage);
        } finally {
            setIsProcessing(false);
        }
    };
    
    // Cargar datos iniciales al montar el componente
    useEffect(() => {
        handleFetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);


    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <DatabaseZap />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Cubo de Inventarios</h2>
            </div>
            
            <p className="text-gray-600">
                Ingrese un código de material para consultar su información de aprovisionamiento en los diferentes centros.
            </p>

            <div className="flex items-end gap-4 p-4 border rounded-lg bg-gray-50">
                <div className="flex-grow">
                    <label htmlFor="material-input" className="block text-sm font-medium text-gray-700 mb-1">
                        Código de Material
                    </label>
                    <input
                        id="material-input"
                        type="text"
                        value={materialInput}
                        onChange={(e) => setMaterialInput(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleFetchData()}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="Escriba el código..."
                    />
                </div>
                <button
                    onClick={handleFetchData}
                    disabled={isProcessing}
                    className="h-10 px-4 py-2 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                    {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    Consultar
                </button>
            </div>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase de Aprovisionamiento</th>
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
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 whitespace-nowrap font-mono">{String(item.Material ?? 'N/D')}</td>
                                    <td className="px-4 py-2 whitespace-nowrap font-mono">{String(item.Centro ?? 'N/D')}</td>
                                    <td className="px-4 py-2 whitespace-nowrap font-mono">{String(item.ClaseAprovisionam ?? 'N/D')}</td>
                                </tr>
                            ))
                        ) : (
                             <tr>
                                <td colSpan={3} className="text-center p-8 text-gray-500">
                                    No se encontraron datos. Ingrese un código de material y presione "Consultar".
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
