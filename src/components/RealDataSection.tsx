
'use client';

import React, { useState, useEffect, useContext } from 'react';
import { RealDataIcon } from '@/constants/constants';
import { PresupuestoItem, TiempoEnsambleItem, NotificationMessage } from '@/types/types';
import { NotificationContext } from '@/app/(app)/page';

// --- Reusable Table Component ---
interface DataTableProps<T> {
    title: string;
    data: T[];
    isLoading: boolean;
    error: string | null;
}

const DataTable = <T extends object>({ title, data, isLoading, error }: DataTableProps<T>) => {
    const headers = data.length > 0 ? Object.keys(data[0]) : [];

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
            {isLoading && <p className="text-gray-500">Cargando datos...</p>}
            {error && <p className="text-red-500">Error: {error}</p>}
            {!isLoading && !error && data.length === 0 && <p className="text-gray-500">No se encontraron datos.</p>}
            {!isLoading && !error && data.length > 0 && (
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
    const [presupuestoData, setPresupuestoData] = useState<PresupuestoItem[]>([]);
    const [tiempoData, setTiempoData] = useState<TiempoEnsambleItem[]>([]);
    const [presupuestoLoading, setPresupuestoLoading] = useState(true);
    const [tiempoLoading, setTiempoLoading] = useState(true);
    const [presupuestoError, setPresupuestoError] = useState<string | null>(null);
    const [tiempoError, setTiempoError] = useState<string | null>(null);
    
    const addNotification = useContext(NotificationContext);

    useEffect(() => {
        const API_TOKEN = 'SmGjjVAzURYKthfwGdY8riSK3U3mMCCBQBMiImGMRPuAo7BlUbwhyeemswWuP9k20gLVe3rPut4';
        const API_BASE_URL_PRESUPUESTO = 'https://intranet.chaide.com/Aplicativos/ApiOptimizadorProduccion/presupuesto/';
        const API_BASE_URL_TIEMPO = 'https://intranet.chaide.com/Aplicativos/ApiOptimizadorProduccion/tiempoensamble/';

        const fetchData = async () => {
            // Fetch Presupuesto Data
            try {
                setPresupuestoLoading(true);
                const presResponse = await fetch(API_BASE_URL_PRESUPUESTO, {
                    headers: {
                        'Authorization': `Bearer ${API_TOKEN}`,
                        'accept': 'application/json',
                    }
                });
                if (!presResponse.ok) {
                    throw new Error(`Error HTTP: ${presResponse.status} ${presResponse.statusText}`);
                }
                const presData = await presResponse.json();
                setPresupuestoData(presData);
                setPresupuestoError(null);
            } catch (error) {
                const errorMessage = (error as Error).message;
                console.error("Error fetching presupuesto data:", errorMessage);
                setPresupuestoError(errorMessage);
                addNotification('error', `No se pudo cargar los datos de presupuesto: ${errorMessage}`);
            } finally {
                setPresupuestoLoading(false);
            }

            // Fetch Tiempo Ensamble Data
            try {
                setTiempoLoading(true);
                const tiempoResponse = await fetch(API_BASE_URL_TIEMPO, {
                     headers: {
                        'Authorization': `Bearer ${API_TOKEN}`,
                        'accept': 'application/json',
                    }
                });
                if (!tiempoResponse.ok) {
                    throw new Error(`Error HTTP: ${tiempoResponse.status} ${tiempoResponse.statusText}`);
                }
                const tiempoData = await tiempoResponse.json();
                setTiempoData(tiempoData);
                setTiempoError(null);
            } catch (error) {
                const errorMessage = (error as Error).message;
                console.error("Error fetching tiempo ensamble data:", errorMessage);
                setTiempoError(errorMessage);
                addNotification('error', `No se pudo cargar los tiempos de ensamble: ${errorMessage}`);
            } finally {
                setTiempoLoading(false);
            }
        };

        fetchData();
    }, [addNotification]);

    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center space-x-3">
                <RealDataIcon />
                <h2 className="text-2xl font-semibold text-gray-700">Datos Reales desde API</h2>
            </div>
            
            <p className="text-gray-600">
                Esta sección muestra datos en vivo consultados desde las APIs externas de producción. Las tablas se actualizan cada vez que se carga la página.
            </p>

            <div className="space-y-8">
                <DataTable 
                    title="Datos de Presupuesto"
                    data={presupuestoData}
                    isLoading={presupuestoLoading}
                    error={presupuestoError}
                />
                <DataTable
                    title="Tiempos de Ensamble"
                    data={tiempoData}
                    isLoading={tiempoLoading}
                    error={tiempoError}
                />
            </div>
        </div>
    );
};
