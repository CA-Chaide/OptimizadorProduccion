'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { queryApi } from '@/hooks/useApiData';
import { TacticalSchedulingIcon } from '@/constants/constants';
import { Wind, Users, Loader2, Package } from 'lucide-react';
import { useAppContext } from '@/context/AppProvider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TacticalPlanSection } from './TacticalPlanSection';

interface InventoryEspumasItem {
    StockActual: number;
    StockSeguridad: number;
    Centro: string;
}

export const TacticalPlanEspumasSection: React.FC = () => {
    const { addNotification, handleGenerateTacticalPlan } = useAppContext();
    const [isLoading, setIsLoading] = useState(true);
    const [inventoryData, setInventoryData] = useState<InventoryEspumasItem[]>([]);
    const [qualifiedOperatorCount, setQualifiedOperatorCount] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Para Espumas, usualmente el código de RespCtrlProd es '004'
            const [inventoryRes, skillsRes] = await Promise.all([
                queryApi({
                    source: 'CuboInventarios',
                    operation: 'get_data',
                    filters: { 'RespCtrlProd': ['004'] },
                    columns: ['StockActual', 'StockSeguridad', 'Centro']
                }),
                queryApi({
                    source: 'HabilidadesOperador',
                    operation: 'get_data',
                    filters: { 'Calificacion': 100 },
                    columns: ['Calificacion']
                })
            ]);

            if (inventoryRes) {
                setInventoryData(inventoryRes);
                addNotification('info', `Se cargaron ${inventoryRes.length} registros de inventario para Espumas.`);
            } else {
                addNotification('warning', 'No se encontraron datos de inventario para Espumas.');
            }

            if (skillsRes) {
                setQualifiedOperatorCount(skillsRes.length);
            } else {
                addNotification('warning', 'No se pudo obtener el número de operadores calificados.');
            }

        } catch (err: any) {
            const errorMessage = `Error al consultar datos para Espumas: ${err.message}`;
            setError(errorMessage);
            addNotification('error', errorMessage);
        } finally {
            setIsLoading(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <Wind className="w-6 h-6 text-blue-600" />
                    <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Diaria (Espumas)</h2>
                </div>
                <button 
                    onClick={fetchData}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                    title="Actualizar datos"
                >
                    <Loader2 className={isLoading ? "animate-spin" : ""} size={20} />
                </button>
            </div>
            
            <Tabs defaultValue="inventory">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="inventory">Resumen de Inventario (Espumas)</TabsTrigger>
                    <TabsTrigger value="planning">Planificación Táctica</TabsTrigger>
                </TabsList>
                
                <TabsContent value="inventory" className="mt-4">
                     <div className="bg-white p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-semibold text-gray-800 flex items-center">
                                <Package className="mr-2 h-5 w-5 text-gray-500" />
                                Inventario (RespCtrlProd 004)
                            </h3>
                            {qualifiedOperatorCount !== null && (
                                <div className="flex items-center p-2 bg-blue-50 border border-blue-200 rounded-lg">
                                    <Users className="mr-2 h-5 w-5 text-blue-600" />
                                    <span className="text-sm font-semibold text-blue-800">
                                        {qualifiedOperatorCount} operadores con 100% de calificación
                                    </span>
                                </div>
                            )}
                        </div>

                        {isLoading ? (
                            <div className="flex justify-center items-center h-48">
                                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                                <span className="ml-2">Cargando datos de espumas...</span>
                            </div>
                        ) : error ? (
                            <div className="text-center py-10 text-red-600">{error}</div>
                        ) : (
                            <div className="overflow-auto max-h-[60vh] border rounded-lg">
                                <table className="min-w-full text-sm divide-y divide-gray-200">
                                    <thead className="bg-gray-100 sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase">Centro</th>
                                            <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase">Stock Actual</th>
                                            <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase">Stock de Seguridad</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {inventoryData.length > 0 ? (
                                            inventoryData.map((item, index) => (
                                                <tr key={index} className="hover:bg-gray-50">
                                                    <td className="px-4 py-2 font-medium">{item.Centro}</td>
                                                    <td className="px-4 py-2 text-right font-mono">{Number(item.StockActual || 0).toLocaleString()}</td>
                                                    <td className="px-4 py-2 text-right font-mono">{Number(item.StockSeguridad || 0).toLocaleString()}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={3} className="text-center py-8 text-gray-500">No hay datos de inventario para mostrar.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </TabsContent>
                
                <TabsContent value="planning" className="mt-4">
                   <TacticalPlanSection onGeneratePlan={handleGenerateTacticalPlan} />
                </TabsContent>
            </Tabs>
        </div>
    );
};
