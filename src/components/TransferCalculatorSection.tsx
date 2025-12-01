'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { logger } from '@/services/LogService';
import { queryApi } from '@/hooks/useApiData';
import { Truck, Loader2 } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';

// Tipado para la data de inventario de la API
interface InventoryRule {
    Material: string;
    Centro: string;
    ClaseAprovisionam: 'E' | 'X' | 'F' | null;
}

const normalizeMaterialCodeTo18Digits = (code: string | number): string => {
    const eightDigitCode = String(code).slice(-8);
    return eightDigitCode.padStart(18, '0');
};

export const TransferCalculatorSection: React.FC = () => {
    const { addNotification } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [inventoryRules, setInventoryRules] = useState<InventoryRule[]>([]);
    const [error, setError] = useState<string | null>(null);
        // Log de montaje del componente
        useEffect(() => {
            logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[TransferCalculatorSection] Montado.`);
        }, []);

    const fetchInventoryRules = useCallback(async () => {
        setIsProcessing(true);
        setError(null);
        const materialCode = '20000182';
        addNotification('info', `Consultando reglas de aprovisionamiento para el material ${materialCode}...`);

        try {
            const paddedMaterialCode = normalizeMaterialCodeTo18Digits(materialCode);
            
            const rulesData: InventoryRule[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                filters: { 'Material': paddedMaterialCode },
                columns: ['Material', 'Centro', 'ClaseAprovisionam'],
                pagination: { limit: 100 }
            });
            
            setInventoryRules(rulesData);

            if (rulesData.length > 0) {
                addNotification('success', `Consulta completada. Se encontraron ${rulesData.length} reglas para el material ${materialCode}.`);
            } else {
                addNotification('warning', `No se encontraron reglas de aprovisionamiento para el material ${materialCode}.`);
            }

        } catch (err) {
            const errorMessage = `Error durante la consulta: ${(err as Error).message}`;
            setError(errorMessage);
            addNotification('error', errorMessage);
        } finally {
            setIsProcessing(false);
        }
    }, [addNotification]);
    
    useEffect(() => {
        fetchInventoryRules();
    }, [fetchInventoryRules]);

    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <Truck />
                <h2 className="text-2xl font-semibold text-gray-700">Consulta de Aprovisionamiento</h2>
            </div>
            
            <p className="text-gray-600">
                Esta pantalla muestra las reglas de aprovisionamiento (`ClaseAprovisionam`) para el material de ejemplo **20000182** en los diferentes centros, consultando directamente la tabla `CuboInventarios`.
            </p>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Material (API)</th>
                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase de Aprovisionamiento</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {isProcessing ? (
                            <tr>
                                <td colSpan={3} className="text-center p-8">
                                    <div className="flex justify-center items-center gap-2 text-gray-500">
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        <span>Consultando...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : error ? (
                            <tr>
                                <td colSpan={3} className="text-center p-8 text-red-500">
                                    {error}
                                </td>
                            </tr>
                        ) : inventoryRules.length > 0 ? (
                            inventoryRules.map((rule, index) => (
                                <tr key={`${rule.Material}-${rule.Centro}-${index}`} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 whitespace-nowrap font-mono">{rule.Centro}</td>
                                    <td className="px-4 py-2 whitespace-nowrap font-mono">{rule.Material}</td>
                                    <td className="px-4 py-2 whitespace-nowrap font-mono text-center font-bold text-blue-700">{rule.ClaseAprovisionam}</td>
                                </tr>
                            ))
                        ) : (
                             <tr>
                                <td colSpan={3} className="text-center p-8 text-gray-500">
                                    No se encontraron reglas para el material consultado.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};