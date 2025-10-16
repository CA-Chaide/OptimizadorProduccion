'use client';

import React, { useState, useMemo } from 'react';
import { TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DatabaseZap } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

interface PivotedInventoryItem {
    codMaterial: string;
    descripcion: string;
    // Common properties
    tamLoteMin: number;
    grupoCompras: string;
    // Pivoted properties by center
    centers: {
        [centerId: string]: {
            stockActual: number;
            stockSeguridad: number;
            stockMaximo: number;
            claseAprovisionamiento: string;
        }
    }
}

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [inventoryData, setInventoryData] = useState<PivotedInventoryItem[]>([]);
    const [allCenters, setAllCenters] = useState<string[]>([]);
    
    const [filters, setFilters] = useState<{ [key: string]: string }>({
        codMaterial: '',
        descripcion: '',
        tamLoteMin: '',
        grupoCompras: ''
    });

    const handleFetchData = async () => {
        setIsProcessing(true);
        addNotification('info', 'Consultando CuboInventarios... Esto puede tomar un momento.');

        try {
            const rawData: TiempoEnsambleItem[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                pagination: { limit: 500000 }
            });

            if (!rawData || rawData.length === 0) {
                addNotification('warning', 'No se encontraron datos en CuboInventarios.');
                setInventoryData([]);
                setAllCenters([]);
                return;
            }
            
            const uniqueCenters = Array.from(new Set(rawData.map(item => String(item.Centro).trim()))).sort();
            setAllCenters(uniqueCenters);

            const pivotedData: { [codMaterial: string]: PivotedInventoryItem } = {};

            for (const item of rawData) {
                const codMaterial = normalizeMaterialCode(item.CodMaterial);
                
                if (!pivotedData[codMaterial]) {
                    // Find a row with a material description to use as the main one
                    const materialInfoRow = rawData.find(r => normalizeMaterialCode(r.CodMaterial) === codMaterial && (r as any).Material);
                    
                    pivotedData[codMaterial] = {
                        codMaterial: codMaterial,
                        descripcion: materialInfoRow ? (materialInfoRow as any).Material : 'N/A',
                        tamLoteMin: item.TamLoteMin || 0,
                        grupoCompras: item.GrupoCompras || 'N/A',
                        centers: {}
                    };
                }

                const centerId = String(item.Centro).trim();
                pivotedData[codMaterial].centers[centerId] = {
                    stockActual: item.StockActual || 0,
                    stockSeguridad: item.StockSeguridad || 0,
                    stockMaximo: item.StockMaximo || 0,
                    claseAprovisionamiento: item.ClaseAprovisionamiento || 'N/A'
                };
            }
            
            const finalPivotedList = Object.values(pivotedData);
            setInventoryData(finalPivotedList);
            addNotification('success', `Carga completada. Se procesaron ${finalPivotedList.length} materiales únicos a través de ${uniqueCenters.length} centros.`);

        } catch (error) {
            addNotification('error', `Error durante la consulta a CuboInventarios: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleFilterChange = (field: string, value: string) => {
        setFilters(prev => ({...prev, [field]: value}));
    };
    
    const filteredItems = useMemo(() => {
        return inventoryData.filter(item => {
            // Check main properties
            if (filters.codMaterial && !item.codMaterial.toLowerCase().includes(filters.codMaterial.toLowerCase())) return false;
            if (filters.descripcion && !item.descripcion.toLowerCase().includes(filters.descripcion.toLowerCase())) return false;
            if (filters.tamLoteMin && !String(item.tamLoteMin).includes(filters.tamLoteMin)) return false;
            if (filters.grupoCompras && !item.grupoCompras.toLowerCase().includes(filters.grupoCompras.toLowerCase())) return false;

            // Check pivoted center properties
            for (const centerId of allCenters) {
                 const centerData = item.centers[centerId];
                 const filterClase = filters[`clase_${centerId}`];
                 if (filterClase && (!centerData || !centerData.claseAprovisionamiento.toLowerCase().includes(filterClase.toLowerCase()))) {
                     return false;
                 }
            }
            return true;
        });
    }, [inventoryData, filters, allCenters]);


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

            {inventoryData.length > 0 && (
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Datos de Inventario ({filteredItems.length} materiales)</h3>
                     <div className="overflow-auto max-h-[70vh] border rounded-lg">
                        <table className="min-w-full text-xs divide-y divide-gray-200">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600" style={{minWidth: '120px'}}>Cód. Material</th>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600" style={{minWidth: '250px'}}>Descripción</th>
                                    <th className="px-2 py-2 text-right font-semibold text-gray-600" style={{minWidth: '80px'}}>Lote Mín.</th>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600" style={{minWidth: '100px'}}>Gpo. Compras</th>
                                    {allCenters.map(centerId => (
                                        <th key={centerId} className="px-2 py-2 text-center font-bold text-indigo-700 border-l" colSpan={4}>{centerId}</th>
                                    ))}
                                </tr>
                                <tr className="bg-gray-200">
                                    <th className="p-1"><input type="text" placeholder="Filtrar..." value={filters.codMaterial} onChange={e => handleFilterChange('codMaterial', e.target.value)} className="w-full text-xs p-1 border rounded" /></th>
                                    <th className="p-1"><input type="text" placeholder="Filtrar..." value={filters.descripcion} onChange={e => handleFilterChange('descripcion', e.target.value)} className="w-full text-xs p-1 border rounded" /></th>
                                    <th className="p-1"><input type="text" placeholder="Filtrar..." value={filters.tamLoteMin} onChange={e => handleFilterChange('tamLoteMin', e.target.value)} className="w-full text-xs p-1 border rounded text-right" /></th>
                                    <th className="p-1"><input type="text" placeholder="Filtrar..." value={filters.grupoCompras} onChange={e => handleFilterChange('grupoCompras', e.target.value)} className="w-full text-xs p-1 border rounded" /></th>
                                    {allCenters.map(centerId => (
                                        <React.Fragment key={centerId}>
                                            <th className="px-2 py-1 text-right font-semibold text-gray-600 border-l" style={{minWidth: '80px'}}>Stock</th>
                                            <th className="px-2 py-1 text-right font-semibold text-gray-600" style={{minWidth: '80px'}}>Seguridad</th>
                                            <th className="px-2 py-1 text-right font-semibold text-gray-600" style={{minWidth: '80px'}}>Máximo</th>
                                            <th className="px-2 py-1 text-center font-semibold text-gray-600" style={{minWidth: '90px'}}>
                                                <input type="text" placeholder="Clase Aprov." value={filters[`clase_${centerId}`] || ''} onChange={e => handleFilterChange(`clase_${centerId}`, e.target.value)} className="w-full text-xs p-1 border rounded text-center" />
                                            </th>
                                        </React.Fragment>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredItems.map(item => (
                                    <tr key={item.codMaterial} className="hover:bg-gray-50">
                                        <td className="px-2 py-1 font-mono text-indigo-700">{item.codMaterial}</td>
                                        <td className="px-2 py-1 text-gray-800 truncate">{item.descripcion}</td>
                                        <td className="px-2 py-1 text-right text-gray-600">{item.tamLoteMin.toLocaleString()}</td>
                                        <td className="px-2 py-1 text-gray-600">{item.grupoCompras}</td>
                                        {allCenters.map(centerId => {
                                            const centerData = item.centers[centerId];
                                            return (
                                                <React.Fragment key={centerId}>
                                                    <td className="px-2 py-1 text-right font-bold text-blue-800 border-l">{centerData?.stockActual.toLocaleString() || '0'}</td>
                                                    <td className="px-2 py-1 text-right text-orange-600">{centerData?.stockSeguridad.toLocaleString() || '0'}</td>
                                                    <td className="px-2 py-1 text-right text-red-600">{centerData?.stockMaximo.toLocaleString() || '0'}</td>
                                                    <td className="px-2 py-1 text-center font-semibold">{centerData?.claseAprovisionamiento || '-'}</td>
                                                </React.Fragment>
                                            )
                                        })}
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
