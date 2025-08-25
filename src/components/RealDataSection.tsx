
'use client';

import React from 'react';
import { RealDataIcon } from '@/constants/constants';
import { PresupuestoItem, TiempoEnsambleItem } from '@/types/types';
import { usePresupuestoData, useTiempoEnsambleData } from '@/hooks/useApiData';

// --- Reusable Dictionary Component ---
interface DataDictionaryProps<T> {
    title: string;
    data: T[] | undefined;
    isLoading: boolean;
    error: Error | undefined;
}

const DataDictionary = <T extends object>({ title, data, isLoading, error }: DataDictionaryProps<T>) => {
    const sampleData = data && data.length > 0 ? data[0] : null;
    const headers = sampleData ? Object.keys(sampleData) : [];

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
            {isLoading && <p className="text-gray-500 animate-pulse">Consultando esquema de la fuente de datos...</p>}
            {error && <p className="text-red-500">Error al cargar el esquema: {error.message}</p>}
            {!isLoading && !error && (!data || data.length === 0) && <p className="text-gray-500">No se encontraron datos para definir el diccionario.</p>}
            {!isLoading && !error && sampleData && (
                <div className="overflow-x-auto max-h-[60vh] border rounded-lg bg-gray-50">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider w-1/2">Nombre de Columna (Campo)</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Ejemplo de Dato</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {headers.map(header => (
                                <tr key={header} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 whitespace-nowrap font-mono text-indigo-700">{header}</td>
                                    <td className="px-4 py-2 whitespace-nowrap text-gray-600">
                                        <span className="bg-gray-200 px-2 py-1 rounded-sm text-xs">
                                          {String((sampleData as any)[header])}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};


export const RealDataSection: React.FC = () => {
    const { data: presupuestoData, error: presupuestoError, isLoading: isPresupuestoLoading } = usePresupuestoData();
    const { data: tiempoData, error: tiempoError, isLoading: isTiempoLoading } = useTiempoEnsambleData();

    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center space-x-3">
                <RealDataIcon />
                <h2 className="text-2xl font-semibold text-gray-700">Diccionario de Datos</h2>
            </div>
            
            <p className="text-gray-600 text-sm">
                Esta sección muestra los esquemas de las fuentes de datos disponibles. Cada tabla lista las columnas que se pueden consultar y un ejemplo del tipo de dato que contienen.
                Utiliza esta información para solicitar cambios en la aplicación, por ejemplo: "En la pantalla de restricciones, puebla el campo 'Materiales' con los valores de la columna 'Material' de la tabla 'Datos de Presupuesto'".
            </p>

            <div className="space-y-8">
                <DataDictionary 
                    title="Tabla: Datos de Presupuesto"
                    data={presupuestoData}
                    isLoading={isPresupuestoLoading}
                    error={presupuestoError}
                />
                <DataDictionary
                    title="Tabla: Tiempos de Ensamble"
                    data={tiempoData}
                    isLoading={isTiempoLoading}
                    error={tiempoError}
                />
            </div>
        </div>
    );
};
