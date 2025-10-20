'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { queryApi } from '@/hooks/useApiData';
import { Truck, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';
import { SalesDataRow } from '@/types/types';

// Tipado para la data de inventario de la API
interface InventoryRule {
    Material: string;
    Centro: string;
    ClaseAprovisionam: 'E' | 'X' | 'F' | null;
}

// Tipado para el resultado agregado que mostraremos en la tabla
interface TransferNeed {
    productId: string;
    productName: string;
    unitsToTransfer: number;
}

const normalizeMaterialCodeTo18Digits = (code: string | number): string => {
    const eightDigitCode = String(code).slice(-8);
    return eightDigitCode.padStart(18, '0');
};

export const TransferCalculatorSection: React.FC = () => {
    const { salesData, addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [transferNeeds, setTransferNeeds] = useState<TransferNeed[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const calculateTransferNeeds = async () => {
            if (salesData.length === 0) {
                setTransferNeeds([]);
                return;
            }

            setIsProcessing(true);
            setError(null);
            addNotification('info', 'Calculando necesidades de traslado basadas en los datos de ventas cargados...');

            try {
                // 1. Obtener códigos de material únicos de los datos de ventas
                const uniqueMaterialCodes = Array.from(new Set(salesData.map(sale => sale.código)));
                const paddedMaterialCodes = uniqueMaterialCodes.map(normalizeMaterialCodeTo18Digits);

                // 2. Consultar CuboInventarios para todas las reglas de aprovisionamiento necesarias
                const inventoryRules: InventoryRule[] = await queryApi({
                    source: 'CuboInventarios',
                    operation: 'get_data',
                    filters: { 'Material': paddedMaterialCodes },
                    columns: ['Material', 'Centro', 'ClaseAprovisionam'],
                    pagination: { limit: 500000 }
                });
                
                const rulesMap = new Map<string, 'E' | 'X' | 'F'>();
                inventoryRules.forEach(rule => {
                    if (rule.Material && rule.Centro && rule.ClaseAprovisionam) {
                        const key = `${String(rule.Material).trim()}---${String(rule.Centro).trim()}`;
                        rulesMap.set(key, rule.ClaseAprovisionam);
                    }
                });

                // 3. Filtrar ventas que requieren traslado
                const salesRequiringTransfer = salesData.filter(sale => {
                    const materialCode18 = normalizeMaterialCodeTo18Digits(sale.código);
                    const center = String(sale.centro).trim();
                    
                    // La regla solo aplica si el centro de demanda NO es 1000
                    if (center === '1000') {
                        return false;
                    }

                    // La regla de aprovisionamiento debe ser 'F' para el centro 1000
                    const ruleKeyForCenter1000 = `${materialCode18}---1000`;
                    const rule = rulesMap.get(ruleKeyForCenter1000);
                    
                    return rule === 'F';
                });

                // 4. Agregar las unidades a trasladar
                const aggregatedNeeds: { [productId: string]: TransferNeed } = {};

                salesRequiringTransfer.forEach(sale => {
                    const productId = sale.código;
                    if (!aggregatedNeeds[productId]) {
                        aggregatedNeeds[productId] = {
                            productId: productId,
                            productName: sale.descripciónMaterial,
                            unitsToTransfer: 0
                        };
                    }
                    aggregatedNeeds[productId].unitsToTransfer += sale.unidadesProyectado;
                });
                
                const results = Object.values(aggregatedNeeds).sort((a,b) => a.productName.localeCompare(b.productName));
                setTransferNeeds(results);

                if (results.length > 0) {
                    addNotification('success', `Cálculo completado. Se identificaron ${results.length} productos que requieren traslados.`);
                } else {
                    addNotification('info', 'No se identificaron necesidades de traslado con los datos de ventas actuales.');
                }

            } catch (err) {
                const errorMessage = `Error durante el cálculo de traslados: ${(err as Error).message}`;
                setError(errorMessage);
                addNotification('error', errorMessage);
            } finally {
                setIsProcessing(false);
            }
        };

        calculateTransferNeeds();
    }, [salesData, addNotification]);

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <Truck />
                <h2 className="text-2xl font-semibold text-gray-700">Reporte de Necesidades de Traslado</h2>
            </div>
            
            <p className="text-gray-600">
                Este reporte analiza los datos de ventas cargados y muestra la cantidad total de unidades por producto que deben ser fabricadas en el centro 1000 y trasladadas a otros centros de demanda (Aprovisionamiento 'F').
            </p>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Código Material</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                            <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Unidades a Trasladar</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isProcessing ? (
                            <tr>
                                <td colSpan={3} className="text-center p-8">
                                    <div className="flex justify-center items-center gap-2 text-gray-500">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Calculando...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={3} className="text-center p-8 text-red-500">
                                    {error}
                                </td>
                            </tr>
                        ) : transferNeeds.length > 0 ? (
                            transferNeeds.map((item) => (
                                <tr key={item.productId} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 whitespace-nowrap font-mono">{item.productId}</td>
                                    <td className="px-4 py-2 whitespace-nowrap">{item.productName}</td>
                                    <td className="px-4 py-2 whitespace-nowrap font-mono text-right font-bold text-blue-700">{item.unitsToTransfer.toLocaleString()}</td>
                                </tr>
                            ))
                        ) : (
                             <tr>
                                <td colSpan={3} className="text-center p-8 text-gray-500">
                                    {salesData.length > 0 ? 'No se encontraron necesidades de traslado para los datos cargados.' : 'No hay datos de ventas cargados. Por favor, vaya a la sección "Importar Ventas".'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
