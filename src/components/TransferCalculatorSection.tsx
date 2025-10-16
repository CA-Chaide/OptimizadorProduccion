'use client';

import React, { useState, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { TransferCalculatorIcon } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

interface PivotedData {
    [key: string]: {
        '1000'?: any;
        '2000'?: any;
    };
}

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification, isLoading: isAppLoading } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [pivotedData, setPivotedData] = useState<PivotedData | null>(null);
    const [fieldOrder, setFieldOrder] = useState<string[]>([]);
    const [materialToSearch, setMaterialToSearch] = useState<string>('20000182');
    
    const handleDebugQuery = async () => {
        if (!materialToSearch || materialToSearch.trim().length === 0) {
            addNotification('warning', 'Por favor, ingrese un código de material para buscar.');
            return;
        }

        setIsProcessing(true);
        setPivotedData(null);
        setFieldOrder([]);
        
        // REGLA DE NEGOCIO: Rellenar con ceros a la izquierda hasta 18 dígitos.
        const materialCodeWithPadding = materialToSearch.trim().padStart(18, '0');
        
        addNotification('info', `Consultando datos maestros para el material '${materialCodeWithPadding}' desde 'CuboInventarios'...`);
        
        try {
            const resultData: any[] = await queryApi({ 
                source: 'CuboInventarios', 
                operation: 'get_data',
                filters: { 
                    'Material': materialCodeWithPadding,
                },
            });
            
            if (resultData && resultData.length > 0) {
                const dataFor1000 = resultData.find(d => String(d.Centro) === '1000');
                const dataFor2000 = resultData.find(d => String(d.Centro) === '2000');

                if (!dataFor1000 && !dataFor2000) {
                    addNotification('warning', `No se encontraron datos para el material '${materialCodeWithPadding}' en los centros 1000 o 2000.`);
                    return;
                }

                const allFields = Object.keys(resultData[0]);
                setFieldOrder(allFields);

                const newPivotedData: PivotedData = {};
                allFields.forEach(field => {
                    newPivotedData[field] = {
                        '1000': dataFor1000 ? dataFor1000[field] : undefined,
                        '2000': dataFor2000 ? dataFor2000[field] : undefined,
                    };
                });
                
                setPivotedData(newPivotedData);
                addNotification('success', `Consulta completada. Mostrando datos comparativos para ${materialCodeWithPadding}.`);

            } else {
                addNotification('warning', `La consulta para el material '${materialCodeWithPadding}' en 'CuboInventarios' no devolvió ningún registro.`);
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
                Esta herramienta ejecuta una consulta para inspeccionar y comparar la definición de un material en diferentes centros.
            </p>

            <div className="p-4 border rounded-lg bg-gray-50 flex flex-col md:flex-row items-end gap-4">
                 <div className="w-full md:w-2/3">
                    <label htmlFor="material-input" className="block text-sm font-medium text-gray-700 mb-1">Código de Material</label>
                    <input
                        id="material-input"
                        type="text"
                        value={materialToSearch}
                        onChange={(e) => setMaterialToSearch(e.target.value)}
                        className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        placeholder="Ingrese el código de material..."
                    />
                 </div>
                <button
                    onClick={handleDebugQuery}
                    disabled={isProcessing || isAppLoading}
                    className="w-full md:w-1/3 h-10 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Consultando...' : "Inspeccionar Material"}
                </button>
            </div>

            {pivotedData && (
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Datos Comparativos para Material: {materialToSearch.padStart(18, '0')}</h3>
                     <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full text-sm divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Campo</th>
                                    <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Centro 1000</th>
                                    <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Centro 2000</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {fieldOrder.map(field => {
                                    const isSensitiveField = field.toLowerCase() === 'descripcion' || field.toLowerCase() === 'etiqueta';
                                    const value1000 = pivotedData[field]?.['1000'];
                                    const value2000 = pivotedData[field]?.['2000'];

                                    return (
                                        <tr key={field}>
                                            <td className="px-4 py-2 font-mono text-indigo-700">{field}</td>
                                            <td className="px-4 py-2 text-right font-mono text-gray-800">
                                                {isSensitiveField ? '' : (value1000 ?? 'N/A')}
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono text-gray-800">
                                                {isSensitiveField ? '' : (value2000 ?? 'N/A')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};