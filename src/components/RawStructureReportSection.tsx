
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { queryApi } from '@/hooks/useApiData';
import { Loader2, Sheet } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';
import { TiempoEnsambleItem } from '@/types/types';
import { syncDataToStore } from '@/app/actions/datastore';

interface FilterState {
    CodMaterial: string;
    Centro: string;
    Linea: string;
    PuestoTrabajo: string;
}

export const RawStructureReportSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(true);
    const [rawData, setRawData] = useState<TiempoEnsambleItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [filters, setFilters] = useState<FilterState>({
        CodMaterial: '',
        Centro: '',
        Linea: '',
        PuestoTrabajo: '',
    });

    const fetchRawData = useCallback(async () => {
        setIsProcessing(true);
        setError(null);
        addNotification('info', `Consultando todos los registros de TiemposEnsamblado...`);

        try {
            const data: TiempoEnsambleItem[] = await queryApi({
                source: 'TiemposEnsamblado',
                operation: 'get_data',
                pagination: { limit: 50000 }
            });
            
            if (data) {
                setRawData(data);
                addNotification('success', `Carga completada. Se encontraron ${data.length} registros crudos.`);
                
                // Sincronizar con DataStore para que la IA pueda acceder
                try {
                    // Extraer información de líneas únicas
                    const linesMap = new Map();
                    const centersMap = new Map();
                    
                    data.forEach(item => {
                        const lineKey = `${item.Centro}-${item.Linea}`;
                        if (!linesMap.has(lineKey)) {
                            linesMap.set(lineKey, {
                                id: `pl---${item.Centro}---${item.Linea}`,
                                name: item.Linea,
                                workCenterId: String(item.Centro),
                                processType: 'Colchones',
                                isActive: true
                            });
                        }
                        
                        if (!centersMap.has(item.Centro)) {
                            centersMap.set(item.Centro, {
                                id: String(item.Centro),
                                name: `Planta ${item.Centro}`,
                                lines: []
                            });
                        }
                    });
                    
                    const rawStructureData = {
                        productionLines: Array.from(linesMap.values()),
                        workCenters: Array.from(centersMap.values()),
                        rawAssemblyData: data.slice(0, 100) // Muestra de los primeros 100
                    };
                    
                    await syncDataToStore('rawStructure', rawStructureData, 'RawStructureReportSection', {
                        totalRecords: data.length,
                        uniqueLines: linesMap.size,
                        uniqueCenters: centersMap.size,
                        timestamp: new Date().toISOString()
                    });
                    
                    console.log('[RawStructureReportSection] Datos sincronizados con DataStore');
                } catch (syncError) {
                    console.error('[RawStructureReportSection] Error sincronizando con DataStore:', syncError);
                }
            } else {
                 addNotification('warning', `La consulta a TiemposEnsamblado no devolvió datos.`);
                 setRawData([]);
            }

        } catch (err) {
            const errorMessage = `Error al consultar los datos crudos: ${(err as Error).message}`;
            setError(errorMessage);
            addNotification('error', errorMessage);
        } finally {
            setIsProcessing(false);
        }
    }, [addNotification]);
    
    useEffect(() => {
        fetchRawData();
    }, [fetchRawData]);

    const handleFilterChange = (field: keyof FilterState, value: string) => {
        setFilters(prev => ({...prev, [field]: value}));
    };
    
    const filteredData = useMemo(() => {
        return rawData.filter(item => {
            return (
                String(item.CodMaterial || '').toLowerCase().includes(filters.CodMaterial.toLowerCase()) &&
                String(item.Centro || '').toLowerCase().includes(filters.Centro.toLowerCase()) &&
                String(item.Linea || '').toLowerCase().includes(filters.Linea.toLowerCase()) &&
                String(item.PuestoTrabajo || '').toLowerCase().includes(filters.PuestoTrabajo.toLowerCase())
            );
        });
    }, [rawData, filters]);

    const FilterInput: React.FC<{column: keyof FilterState, placeholder: string}> = ({ column, placeholder }) => (
        <th className="p-1">
            <input
                type="text"
                value={filters[column]}
                onChange={e => handleFilterChange(column, e.target.value)}
                placeholder={placeholder}
                className="w-full text-xs p-1 border border-gray-300 rounded"
            />
        </th>
    );

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <Sheet />
                <h2 className="text-2xl font-semibold text-gray-700">Reporte de Estructura Cruda (TiemposEnsamblado)</h2>
            </div>
            
            <p className="text-gray-600">
                Esta tabla muestra todos los registros de la tabla `TiemposEnsamblado` sin procesar. Utilícela para auditar la información de origen y verificar por qué una línea o puesto de trabajo podría no aparecer en la estructura descubierta.
            </p>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">CodMaterial</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Línea</th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Puesto de Trabajo</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Tiempo</th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-600 uppercase tracking-wider">Aprov.</th>
                        </tr>
                        <tr>
                            <FilterInput column="CodMaterial" placeholder="Filtrar Cód..." />
                            <FilterInput column="Centro" placeholder="Filtrar Centro..." />
                            <FilterInput column="Linea" placeholder="Filtrar Línea..." />
                            <FilterInput column="PuestoTrabajo" placeholder="Filtrar Puesto..." />
                            <th className="p-1"></th>
                            <th className="p-1"></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isProcessing ? (
                            <tr>
                                <td colSpan={6} className="text-center p-8">
                                    <div className="flex justify-center items-center gap-2 text-gray-500">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Consultando...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={6} className="text-center p-8 text-red-500">
                                    {error}
                                </td>
                            </tr>
                        ) : filteredData.length > 0 ? (
                            filteredData.map((item, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-3 py-2 whitespace-nowrap font-mono">{item.CodMaterial}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.Centro}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.Linea}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.PuestoTrabajo}</td>
                                    <td className="px-3 py-2 whitespace-nowrap font-mono text-right">{Number(item.Tiempo).toFixed(4)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-center font-bold">{item.ClaseAprovisionamiento}</td>
                                </tr>
                            ))
                        ) : (
                             <tr>
                                <td colSpan={6} className="text-center p-8 text-gray-500">
                                    No se encontraron datos.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
