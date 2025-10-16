'use client';

import React, { useState, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap, Search } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

interface PivotedData {
    centers: string[];
    attributes: Array<{
        name: string;
        values: { [center: string]: string | number | null };
    }>;
}

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [rawData, setRawData] = useState<TiempoEnsambleItem[]>([]);
    
    const [selectedMaterial, setSelectedMaterial] = useState<string>('');
    const [materialFilter, setMaterialFilter] = useState('');

    const handleFetchData = async () => {
        setIsProcessing(true);
        setRawData([]);
        setSelectedMaterial('');
        setMaterialFilter(''); // <<< FIX: Reset filter on new fetch
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
    
    const uniqueMaterials = useMemo(() => {
        const materialSet = new Set<string>();
        rawData.forEach(item => {
            if (item.CodMaterial) {
                materialSet.add(String(item.CodMaterial));
            }
        });
        const sortedMaterials = Array.from(materialSet).sort();
        if (!materialFilter) {
            return sortedMaterials;
        }
        return sortedMaterials.filter(mat => mat.toLowerCase().includes(materialFilter.toLowerCase()));
    }, [rawData, materialFilter]);
    
    const pivotedData = useMemo<PivotedData | null>(() => {
        if (!selectedMaterial) return null;

        const materialRecords = rawData.filter(item => String(item.CodMaterial) === selectedMaterial);
        if (materialRecords.length === 0) return null;

        const centers = Array.from(new Set(materialRecords.map(rec => String(rec.Centro)))).sort();
        
        const attributeKeys: Array<keyof TiempoEnsambleItem> = [
            'Linea', 'PuestoTrabajo', 'Tiempo', 'StockActual', 'StockSeguridad',
            'StockMaximo', 'TamLoteMin', 'TamLoteMax', 'GrupoCompras', 'ClaseAprovisionamiento'
        ];
        
        const attributes = attributeKeys.map(key => {
            const values: { [center: string]: string | number | null } = {};
            centers.forEach(center => {
                const record = materialRecords.find(rec => String(rec.Centro) === center);
                values[center] = record ? (record[key] ?? 'N/A') : 'N/A';
            });
            return { name: key, values };
        });
        
        return { centers, attributes };

    }, [selectedMaterial, rawData]);

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <DatabaseZap />
                <h2 className="text-2xl font-semibold text-gray-700">Explorador de Cubo de Inventarios</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta consulta los datos maestros de `CuboInventarios` y los presenta en una tabla pivotante para su análisis.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end p-4 border rounded-lg bg-gray-50">
                <button
                    onClick={handleFetchData}
                    disabled={isProcessing}
                    className="w-full h-10 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Consultando...' : "1. Consultar Cubo de Inventarios"}
                </button>
                <div>
                     <label htmlFor="material-select" className="block text-sm font-medium text-gray-700">2. Seleccione un Material para Analizar</label>
                     <div className="relative mt-1">
                        <input
                            type="text"
                            placeholder="Filtrar materiales..."
                            value={materialFilter}
                            onChange={e => setMaterialFilter(e.target.value)}
                            disabled={rawData.length === 0}
                            className="w-full pl-3 pr-10 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm disabled:bg-gray-100"
                        />
                         <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                    </div>
                     <select 
                        id="material-select"
                        value={selectedMaterial}
                        onChange={e => setSelectedMaterial(e.target.value)}
                        disabled={rawData.length === 0}
                        className="mt-1 block w-full border border-gray-300 bg-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm disabled:bg-gray-100"
                        size={5}
                     >
                        {uniqueMaterials.map(mat => (
                            <option key={mat} value={mat}>{mat}</option>
                        ))}
                     </select>
                </div>
            </div>

            {pivotedData && (
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Análisis para el Material: <span className="font-bold text-indigo-700 font-mono">{selectedMaterial}</span></h3>
                     <div className="overflow-auto max-h-[70vh] border rounded-lg">
                        <table className="min-w-full text-sm divide-y divide-gray-200">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-100 z-20">Atributo</th>
                                     {pivotedData.centers.map(center => (
                                        <th key={center} className="px-3 py-2 text-center font-semibold text-gray-600">{center}</th>
                                     ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {pivotedData.attributes.map(attr => (
                                    <tr key={attr.name} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800 sticky left-0 bg-white z-10">{attr.name}</td>
                                        {pivotedData.centers.map(center => (
                                            <td key={`${attr.name}-${center}`} className="px-3 py-2 text-center whitespace-nowrap text-gray-600">
                                                {attr.values[center]}
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
