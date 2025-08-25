
'use client';

import React from 'react';
import { RealDataIcon } from '@/constants/constants';
import { PresupuestoItem, TiempoEnsambleItem } from '@/types/types';
import { usePresupuestoData, useTiempoEnsambleData } from '@/hooks/useApiData';

// --- Reusable Table Component ---
interface DataTableProps<T> {
    title: string;
    data: T[] | undefined;
    isLoading: boolean;
    error: Error | undefined;
}

const DataTable = <T extends object>({ title, data, isLoading, error }: DataTableProps<T>) => {
    const headers = data && data.length > 0 ? Object.keys(data[0]) : [];

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
            {isLoading && <p className="text-gray-500">Cargando datos...</p>}
            {error && <p className="text-red-500">Error al cargar datos: {error.message}</p>}
            {!isLoading && !error && (!data || data.length === 0) && <p className="text-gray-500">No se encontraron datos.</p>}
            {!isLoading && !error && data && data.length > 0 && (
                <div className="overflow-x-auto max-h-[60vh] border rounded-lg">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                {headers.map(header => (
                                    <th key={header} className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">{header}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {data.map((row, rowIndex) => (
                                <tr key={rowIndex} className="hover:bg-gray-50">
                                    {headers.map(header => (
                                        <td key={`${rowIndex}-${header}`} className="px-4 py-2 whitespace-nowrap">
                                            {String((row as any)[header])}
                                        </td>
                                    ))}
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
                <h2 className="text-2xl font-semibold text-gray-700">Datos Reales desde API</h2>
            </div>
            
            <p className="text-gray-600">
                Esta sección muestra datos en vivo consultados desde las APIs externas de producción. Las tablas se actualizan automáticamente según las mejores prácticas de SWR.
            </p>

            <div className="space-y-8">
                <DataTable 
                    title="Datos de Presupuesto"
                    data={presupuestoData}
                    isLoading={isPresupuestoLoading}
                    error={presupuestoError}
                />
                <DataTable
                    title="Tiempos de Ensamble"
                    data={tiempoData}
                    isLoading={isTiempoLoading}
                    error={tiempoError}
                />
            </div>
        </div>
    );
};
