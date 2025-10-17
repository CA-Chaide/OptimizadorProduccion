'use client';

import React, { useState, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap, Search } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';


interface FilterState {
    CodMaterial: string;
    Centro: string;
    Linea: string;
    PuestoTrabajo: string;
    ClaseAprovisionamiento: string;
}

const initialFilterState: FilterState = {
    CodMaterial: '', Centro: '', Linea: '', PuestoTrabajo: '', ClaseAprovisionamiento: ''
};

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [rawData, setRawData] = useState<TiempoEnsambleItem[]>([]);
    const [filters, setFilters] = useState<FilterState>(initialFilterState);

    const handleFetchData = async () => {
        setIsProcessing(true);
        setRawData([]);
        setFilters(initialFilterState);
        addNotification('info', 'Consultando CuboInventarios... Esto puede tomar un momento.');

        try {
            const data: TiempoEnsambleItem[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                pagination: { limit: 500000 }
            });

            if (!data || data.length === 0) {
                addNotification('warning', 'No se encontraron datos en CuboInventarios.');
                return;
            }

            setRawData(data);
            addNotification('success', `Carga completada. Se obtuvieron ${data.length} registros.`);

        } catch (error) {
            addNotification('error', `Error durante la consulta a CuboInventarios: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleFilterChange = (field: keyof FilterState, value: string) => {
        setFilters(prev => ({ ...prev, [field]: value }));
    };

    const filteredData = useMemo(() => {
        if (rawData.length === 0) return [];
        return rawData.filter(item => {
            return (
                String(item.CodMaterial || '').toLowerCase().includes(filters.CodMaterial.toLowerCase()) &&
                String(item.Centro || '').toLowerCase().includes(filters.Centro.toLowerCase()) &&
                String(item.Linea || '').toLowerCase().includes(filters.Linea.toLowerCase()) &&
                String(item.PuestoTrabajo || '').toLowerCase().includes(filters.PuestoTrabajo.toLowerCase()) &&
                String(item.ClaseAprovisionamiento || '').toLowerCase().includes(filters.ClaseAprovisionamiento.toLowerCase())
            );
        });
    }, [rawData, filters]);

    const renderTableHeaderWithFilter = (field: keyof FilterState, label: string) => (
        <th className="p-2 border-b border-gray-300">
            <div className="font-semibold text-gray-600 uppercase">{label}</div>
            <input
                type="text"
                value={filters[field]}
                onChange={e => handleFilterChange(field, e.target.value)}
                className="w-full mt-1 p-1 border border-gray-300 rounded text-xs"
                placeholder={`Filtrar...`}
                disabled={rawData.length === 0}
            />
        </th>
    );

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <DatabaseZap />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Cubo de Inventarios</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta consulta los datos maestros de `CuboInventarios` y los presenta en una tabla para su análisis y filtrado.
            </p>

            <div className="p-4 border rounded-lg bg-gray-50">
                <button
                    onClick={handleFetchData}
                    disabled={isProcessing}
                    className="w-full md:w-1/3 h-10 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Consultando...' : "Consultar Cubo de Inventarios"}
                </button>
            </div>

            {rawData.length > 0 && (
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Resultados de la Consulta ({filteredData.length} de {rawData.length} registros)</h3>
                     <div className="overflow-auto max-h-[70vh] border rounded-lg">
                        <table className="min-w-full text-xs divide-y divide-gray-200">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr>
                                    {renderTableHeaderWithFilter('CodMaterial', 'CodMaterial')}
                                    {renderTableHeaderWithFilter('Centro', 'Centro')}
                                    {renderTableHeaderWithFilter('Linea', 'Linea')}
                                    {renderTableHeaderWithFilter('PuestoTrabajo', 'PuestoTrabajo')}
                                    {renderTableHeaderWithFilter('ClaseAprovisionamiento', 'Clase Aprovisionamiento')}
                                    <th className="p-2 border-b border-gray-300 font-semibold text-gray-600 uppercase">Tiempo</th>
                                    <th className="p-2 border-b border-gray-300 font-semibold text-gray-600 uppercase">Stock Actual</th>
                                    <th className="p-2 border-b border-gray-300 font-semibold text-gray-600 uppercase">Stock Seguridad</th>
                                    <th className="p-2 border-b border-gray-300 font-semibold text-gray-600 uppercase">Lote Mínimo</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredData.slice(0, 1000).map((item, index) => ( // Limiting to 1000 rows for performance
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="p-2 whitespace-nowrap">{item.CodMaterial}</td>
                                        <td className="p-2 whitespace-nowrap">{item.Centro}</td>
                                        <td className="p-2 whitespace-nowrap">{item.Linea}</td>
                                        <td className="p-2 whitespace-nowrap">{item.PuestoTrabajo}</td>
                                        <td className="p-2 whitespace-nowrap text-center font-medium">{item.ClaseAprovisionamiento}</td>
                                        <td className="p-2 whitespace-nowrap text-right">{item.Tiempo}</td>
                                        <td className="p-2 whitespace-nowrap text-right">{item.StockActual}</td>
                                        <td className="p-2 whitespace-nowrap text-right">{item.StockSeguridad}</td>
                                        <td className="p-2 whitespace-nowrap text-right">{item.TamLoteMin}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredData.length > 1000 && 
                            <div className="p-2 text-center text-sm font-semibold text-yellow-700 bg-yellow-50">
                                Se muestran los primeros 1000 registros. Use los filtros para acotar la búsqueda.
                            </div>
                        }
                    </div>
                </div>
            )}
        </div>
    );
};
