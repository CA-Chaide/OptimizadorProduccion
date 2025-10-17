'use client';

import React, { useState, useEffect } from 'react';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

interface ColumnInfo {
    column_name: string;
    friendly_name: string;
    description: string;
    sample_value: string;
}

interface SourceInfo {
    description: string;
    columns: ColumnInfo[];
}

interface Documentation {
    [sourceName: string]: SourceInfo;
}

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(true);
    const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null);

    useEffect(() => {
        const handleFetchSchema = async () => {
            setIsProcessing(true);
            addNotification('info', 'Consultando el esquema de la fuente de datos CuboInventarios...');

            try {
                const docData: Documentation = await queryApi({
                    operation: 'get_documentation'
                });

                if (!docData || !docData['CuboInventarios']) {
                    addNotification('warning', `No se encontró la documentación para la fuente de datos 'CuboInventarios'.`);
                    setSourceInfo(null);
                } else {
                    setSourceInfo(docData['CuboInventarios']);
                    addNotification('success', `Esquema cargado exitosamente.`);
                }

            } catch (error) {
                addNotification('error', `Error durante la consulta del esquema: ${(error as Error).message}`);
            } finally {
                setIsProcessing(false);
            }
        };

        handleFetchSchema();
    }, [addNotification]);


    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <DatabaseZap />
                <h2 className="text-2xl font-semibold text-gray-700">Diccionario de Datos: CuboInventarios</h2>
            </div>
            
            <p className="text-gray-600">
                A continuación se listan todos los campos disponibles en la fuente de datos <span className="font-mono bg-gray-100 p-1 rounded">CuboInventarios</span>, según la documentación de la API.
            </p>

            <div className="border rounded-lg overflow-hidden">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-100">
                        <tr>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Nombre de Columna (API)</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600 uppercase tracking-wider">Valor de Ejemplo</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isProcessing ? (
                            <tr>
                                <td colSpan={3} className="text-center p-8">
                                    <div className="flex justify-center items-center gap-2 text-gray-500">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Consultando esquema...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : sourceInfo && sourceInfo.columns.length > 0 ? (
                            sourceInfo.columns.map((col) => (
                                <tr key={col.column_name} className="hover:bg-gray-50">
                                    <td className="px-4 py-3 whitespace-nowrap font-mono text-indigo-700">{col.column_name}</td>
                                    <td className="px-4 py-3 whitespace-normal">{col.description}</td>
                                    <td className="px-4 py-3 whitespace-nowrap font-mono text-gray-500">{col.sample_value || 'N/A'}</td>
                                </tr>
                            ))
                        ) : (
                             <tr>
                                <td colSpan={3} className="text-center p-8 text-gray-500">
                                    No se encontró el esquema para esta fuente de datos.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
