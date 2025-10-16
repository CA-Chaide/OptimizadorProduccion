'use client';

import React, { useState, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [rawData, setRawData] = useState<TiempoEnsambleItem[]>([]);
    
    const [filters, setFilters] = useState<{ [key: string]: string }>({});

    const handleFetchData = async () => {
        setIsProcessing(true);
        addNotification('info', 'Consultando CuboInventarios... Esto puede tomar un momento.');

        try {
            const data: TiempoEnsambleItem[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                pagination: { limit: 500000 }
            });

            if (!data || data.length === 0) {
                addNotification('warning', 'No se encontraron datos en CuboInventarios.');
                setRawData([]);
                return;
            }
            
            // Enrich with normalized code for potential use, but show raw data
            const processedData = data.map(item => ({
                ...item,
                CodMaterial: normalizeMaterialCode(item.CodMaterial)
            }))

            setRawData(processedData);
            addNotification('success', `Carga completada. Se obtuvieron ${data.length} registros.`);

        } catch (error) {
            addNotification('error', `Error durante la consulta a CuboInventarios: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleFilterChange = (field: keyof TiempoEnsambleItem | string, value: string) => {
        setFilters(prev => ({...prev, [field]: value}));
    };
    
    const filteredItems = useMemo(() => {
        return rawData.filter(item => {
            for (const key in filters) {
                if (filters[key]) {
                    const itemValue = (item as any)[key];
                    if (itemValue === null || itemValue === undefined || !String(itemValue).toLowerCase().includes(filters[key].toLowerCase())) {
                        return false;
                    }
                }
            }
            return true;
        });
    }, [rawData, filters]);
    
    const tableColumns: Array<{ key: keyof TiempoEnsambleItem, label: string }> = [
        { key: 'CodMaterial', label: 'Cód. Material' },
        { key: 'Centro', label: 'Centro' },
        { key: 'Linea', label: 'Línea' },
        { key: 'PuestoTrabajo', label: 'Puesto Trabajo' },
        { key: 'Tiempo', label: 'Tiempo' },
        { key: 'StockActual', label: 'Stock Actual' },
        { key: 'StockSeguridad', label: 'Stock Seguridad' },
        { key: 'StockMaximo', label: 'Stock Máximo' },
        { key: 'TamLoteMin', label: 'Lote Mínimo' },
        { key: 'TamLoteMax', label: 'Lote Máximo' },
        { key: 'GrupoCompras', label: 'Gpo. Compras' },
        { key: 'ClaseAprovisionamiento', label: 'Clase Aprov.' },
    ];


    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <DatabaseZap />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Cubo de Inventarios</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta consulta y muestra directamente los datos maestros de la tabla <strong>CuboInventarios</strong>. Use los filtros en la cabecera de la tabla para explorar la información.
            </p>

            <div className="p-4 border rounded-lg bg-gray-50 flex items-center">
                <button
                    onClick={handleFetchData}
                    disabled={isProcessing}
                    className="w-full h-10 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Consultando...' : "Consultar Cubo de Inventarios"}
                </button>
            </div>

            {rawData.length > 0 && (
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Datos de Inventario ({filteredItems.length} de {rawData.length} registros)</h3>
                     <div className="overflow-auto max-h-[70vh] border rounded-lg">
                        <table className="min-w-full text-xs divide-y divide-gray-200">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr>
                                    {tableColumns.map(col => (
                                        <th key={col.key} className="px-2 py-2 text-left font-semibold text-gray-600">
                                            {col.label}
                                            <input 
                                                type="text" 
                                                placeholder="Filtrar..." 
                                                value={filters[col.key] || ''}
                                                onChange={e => handleFilterChange(col.key, e.target.value)}
                                                className="w-full text-xs p-1 mt-1 border rounded"
                                            />
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredItems.map((item, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        {tableColumns.map(col => (
                                            <td key={col.key} className="px-2 py-1 whitespace-nowrap">
                                                {(item as any)[col.key] ?? 'N/A'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
