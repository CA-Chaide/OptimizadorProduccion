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
        [key: string]: any; // Allow other centers
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
                const allFields = Object.keys(resultData[0]);
                const centerKeys = [...new Set(resultData.map(d => String(d.Centro)))];
                setFieldOrder(allFields);

                const newPivotedData: PivotedData = {};

                allFields.forEach(field => {
                    newPivotedData[field] = {};
                    resultData.forEach(item => {
                        const center = String(item.Centro);
                        newPivotedData[field][center] = item[field];
                    });
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

    const centerColumns = useMemo(() => {
        if (!pivotedData) return [];
        const centers = new Set<string>();
        Object.values(pivotedData).forEach(fieldData => {
            Object.keys(fieldData).forEach(center => centers.add(center));
        });
        return Array.from(centers).sort();
    }, [pivotedData]);


    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <TransferCalculatorIcon />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Datos Maestros: `CuboInventarios`</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta ejecuta una consulta para inspeccionar y comparar la definición de un material en diferentes centros. 
                El sistema aplicará automáticamente el padding de 18 dígitos al código de material.
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
                        onKeyDown={(e) => e.key === 'Enter' && handleDebugQuery()}
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
                    <h3 className="text-lg font-semibold text-gray-800">Datos Comparativos para Material: {materialToSearch}</h3>
                     <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full text-sm divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider sticky left-0 bg-gray-100 z-10">Campo</th>
                                    {centerColumns.map(center => (
                                         <th key={center} className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Centro {center}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {fieldOrder.map(field => {
                                    const isSensitiveField = field.toLowerCase() === 'descripcion' || field.toLowerCase() === 'etiqueta';
                                    
                                    // Don't render the Material field row if we are searching by it
                                    if (field === 'Material') return null;

                                    return (
                                        <tr key={field} className="hover:bg-gray-50">
                                            <td className="px-4 py-2 font-mono text-indigo-700 sticky left-0 bg-white hover:bg-gray-50">{field}</td>
                                            {centerColumns.map(center => (
                                                <td key={center} className="px-4 py-2 text-right font-mono text-gray-800">
                                                    {isSensitiveField ? '' : (pivotedData[field]?.[center] ?? 'N/A')}
                                                 </td>
                                            ))}
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
