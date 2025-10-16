'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { SalesDataRow, TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { TransferCalculatorIcon, MONTH_NAMES } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

interface TransferCalculationItem {
    codMaterial: string;
    descripcion: string;
    claseAprovisionamiento: string;
    cantidad: number;
    mes: number;
    year: number;
}

const padMaterialCode = (code: string | number): string => {
    return String(code).padStart(18, '0');
};

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};


export const TransferCalculatorSection: React.FC = () => {
    const { addNotification, isLoading: isAppLoading, salesData } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [transferItems, setTransferItems] = useState<TransferCalculationItem[]>([]);
    
    const [filters, setFilters] = useState({
        codMaterial: '',
        descripcion: '',
        claseAprovisionamiento: '',
        cantidad: '',
        mes: ''
    });

    const handleCalculateTransfers = async () => {
        if (salesData.length === 0) {
            addNotification('warning', 'No hay datos de ventas cargados. Por favor, vaya a la sección "Importar Ventas" primero.');
            return;
        }

        setIsProcessing(true);
        addNotification('info', 'Calculando traslados... Obteniendo reglas de aprovisionamiento de CuboInventarios.');

        try {
            // 1. Get unique material codes from sales data
            const uniqueMaterialCodes = [...new Set(salesData.map(item => item.código))];
            const paddedMaterialCodes = uniqueMaterialCodes.map(padMaterialCode);

            // 2. Fetch provisioning rules from CuboInventarios
            const inventoryCubeData: TiempoEnsambleItem[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                filters: { 'Material': paddedMaterialCodes },
                pagination: { limit: 200000 }
            });

            const provisioningRules = new Map<string, 'E' | 'X' | 'F'>();
            inventoryCubeData.forEach(item => {
                const key = `${normalizeMaterialCode(item.CodMaterial)}---${String(item.Centro).trim()}`;
                if (item.ClaseAprovisionamiento) {
                    provisioningRules.set(key, item.ClaseAprovisionamiento);
                }
            });

            addNotification('info', `Se obtuvieron ${provisioningRules.size} reglas. Procesando transferencias...`);

            // 3. Filter sales data for transfers
            const salesRequiringTransfer = salesData.filter(sale => {
                const demandCenter = String(sale.centro).trim();
                if (demandCenter === '1000') return false; // Rule applies to non-central centers

                const ruleKey = `${sale.código}---${demandCenter}`;
                const provisionRule = provisioningRules.get(ruleKey);
                return provisionRule === 'F';
            });
            
            // 4. Aggregate quantities
            const aggregatedTransfers: { [key: string]: TransferCalculationItem } = {};

            for (const sale of salesRequiringTransfer) {
                const key = `${sale.código}-${sale.mes}-${sale.año}`;
                if (!aggregatedTransfers[key]) {
                    aggregatedTransfers[key] = {
                        codMaterial: sale.código,
                        descripcion: sale.descripciónMaterial,
                        claseAprovisionamiento: 'F',
                        cantidad: 0,
                        mes: sale.mes,
                        year: sale.año
                    };
                }
                aggregatedTransfers[key].cantidad += sale.unidadesProyectado;
            }
            
            const finalTransferList = Object.values(aggregatedTransfers);
            setTransferItems(finalTransferList);
            
            if (finalTransferList.length > 0) {
                addNotification('success', `Cálculo completado. Se generaron ${finalTransferList.length} requerimientos de traslado.`);
            } else {
                 addNotification('warning', 'No se encontraron ventas que requieran traslado según la regla de aprovisionamiento F.');
            }

        } catch (error) {
            addNotification('error', `Error durante el cálculo de traslados: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleFilterChange = (field: keyof typeof filters, value: string) => {
        setFilters(prev => ({...prev, [field]: value}));
    };
    
    const filteredItems = useMemo(() => {
        return transferItems.filter(item => {
            return (
                item.codMaterial.toLowerCase().includes(filters.codMaterial.toLowerCase()) &&
                item.descripcion.toLowerCase().includes(filters.descripcion.toLowerCase()) &&
                item.claseAprovisionamiento.toLowerCase().includes(filters.claseAprovisionamiento.toLowerCase()) &&
                String(item.cantidad).includes(filters.cantidad) &&
                MONTH_NAMES[item.mes-1].toLowerCase().includes(filters.mes.toLowerCase())
            )
        })
    }, [transferItems, filters]);


    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <TransferCalculatorIcon />
                <h2 className="text-2xl font-semibold text-gray-700">Calculador de Traslados (Comprobación)</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta analiza los datos de ventas cargados, consulta las reglas de aprovisionamiento en <strong>CuboInventarios</strong> y resume las unidades que deben fabricarse en el centro 1000 para ser transferidas a otros centros (regla 'F').
            </p>

            <div className="p-4 border rounded-lg bg-gray-50 flex items-center">
                <button
                    onClick={handleCalculateTransfers}
                    disabled={isProcessing || isAppLoading || salesData.length === 0}
                    className="w-full h-10 px-6 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isProcessing ? 'Calculando...' : "Cargar y Calcular Traslados"}
                </button>
            </div>

            {transferItems.length > 0 && (
                 <div className="space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Requerimientos de Traslado Agrupados</h3>
                     <div className="overflow-x-auto border rounded-lg">
                        <table className="min-w-full text-sm divide-y divide-gray-200">
                            <thead className="bg-gray-100">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Codigo de material</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Descripción</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Clase de Aprov.</th>
                                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Cantidad</th>
                                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Mes</th>
                                </tr>
                                 <tr className="bg-gray-200">
                                    <th className="p-1"><input type="text" placeholder="Filtrar..." value={filters.codMaterial} onChange={e => handleFilterChange('codMaterial', e.target.value)} className="w-full text-xs p-1 border rounded" /></th>
                                    <th className="p-1"><input type="text" placeholder="Filtrar..." value={filters.descripcion} onChange={e => handleFilterChange('descripcion', e.target.value)} className="w-full text-xs p-1 border rounded" /></th>
                                    <th className="p-1"><input type="text" placeholder="Filtrar..." value={filters.claseAprovisionamiento} onChange={e => handleFilterChange('claseAprovisionamiento', e.target.value)} className="w-full text-xs p-1 border rounded" /></th>
                                    <th className="p-1"><input type="text" placeholder="Filtrar..." value={filters.cantidad} onChange={e => handleFilterChange('cantidad', e.target.value)} className="w-full text-xs p-1 border rounded text-right" /></th>
                                    <th className="p-1"><input type="text" placeholder="Filtrar..." value={filters.mes} onChange={e => handleFilterChange('mes', e.target.value)} className="w-full text-xs p-1 border rounded" /></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredItems.map((item, index) => (
                                    <tr key={index} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 font-mono text-indigo-700">{item.codMaterial}</td>
                                        <td className="px-3 py-2 text-gray-800">{item.descripcion}</td>
                                        <td className="px-3 py-2 font-semibold text-center text-gray-700">{item.claseAprovisionamiento}</td>
                                        <td className="px-3 py-2 text-right font-bold text-blue-800">{item.cantidad.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-gray-600">{`${MONTH_NAMES[item.mes - 1]} ${item.year}`}</td>
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
