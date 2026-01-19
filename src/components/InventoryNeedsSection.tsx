
'use client';

import React, { useState, useCallback } from 'react';
import { useAppContext } from '@/context/AppProvider';
import { queryApi } from '@/hooks/useApiData';
import { Sheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductionLine } from '@/types/types';

interface CuboInventariosRow {
    Centro: string;
    ClaseAprovisionam: string | null;
    Descripcion?: string;
    Material: string;
    StockSeguridad: number;
    StockActual: number;
}

interface TiempoEnsambleRow {
    CodMaterial: string;
    Centro: string;
    Linea: string;
    PuestoTrabajo: string;
    Tiempo: number;
}

interface DisplayRow {
    CentroStock: string;
    CentroProduccion: string;
    ClaseAprovisionam: string | null;
    Descripcion?: string;
    Material: string;
    StockSeguridad: number;
    StockActual: number;
    Linea: string | null;
    Tiempo: number | null;
    NecesidadStock: number;
    TiempoTotalRequerido: number | null;
}

// Function to normalize material codes to match sales data format
const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code).trim();
    return codeStr.slice(-8);
};

export const InventoryNeedsSection: React.FC = () => {
    const { addNotification, constraints } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [inventoryData, setInventoryData] = useState<DisplayRow[]>([]);

    const handleFetchData = useCallback(async () => {
        setIsLoading(true);
        setInventoryData([]);
        addNotification('info', 'Consultando datos de CuboInventarios y TiemposEnsamblado...');

        try {
            const [cuboData, tiemposData]: [CuboInventariosRow[], TiempoEnsambleRow[]] = await Promise.all([
                queryApi({
                    source: 'CuboInventarios',
                    operation: 'get_data',
                    columns: ["Centro", "ClaseAprovisionam", "Descripcion", "Material", "StockSeguridad", "StockActual"],
                    pagination: { limit: 500000 }
                }),
                queryApi({
                    source: 'TiemposEnsamblado',
                    operation: 'get_data',
                    columns: ["CodMaterial", "Centro", "Linea", "PuestoTrabajo", "Tiempo"],
                    pagination: { limit: 500000 }
                })
            ]);

            if (!cuboData || cuboData.length === 0) {
                addNotification('warning', 'No se encontraron datos en CuboInventarios.');
                setIsLoading(false);
                return;
            }

            const transformedData = cuboData.map(item => {
                const normalizedMaterial = normalizeMaterialCode(item.Material);
                const stockCenter = String(item.Centro).trim();
                
                let producingCenter = stockCenter;
                if (stockCenter === '2000' && item.ClaseAprovisionam === 'F') {
                    producingCenter = '1000';
                }

                const possibleLines = constraints.productionLines.filter(line => 
                    line.workCenterId === producingCenter &&
                    tiemposData.some(t => 
                        normalizeMaterialCode(t.CodMaterial) === normalizedMaterial &&
                        String(t.Centro).trim() === producingCenter &&
                        t.Linea.trim() === line.name
                    )
                );

                let bestLineInfo: { line: ProductionLine | null; bottleneckTime: number | null } = { line: null, bottleneckTime: null };

                if (possibleLines.length > 0) {
                    const linePerformances = possibleLines.map(line => {
                        const workstationEffectiveTimes: number[] = [];

                        line.assignedWorkstations.forEach(assignedWs => {
                            const workstationDef = constraints.workstationDefinitions.find(wd => wd.id === assignedWs.definitionId);
                            if (!workstationDef) return;

                            const tiempoEntry = tiemposData.find(t => 
                                normalizeMaterialCode(t.CodMaterial) === normalizedMaterial &&
                                String(t.Centro).trim() === producingCenter &&
                                t.Linea.trim() === line.name &&
                                t.PuestoTrabajo.trim() === workstationDef.name
                            );
                            
                            if (tiempoEntry && tiempoEntry.Tiempo > 0) {
                                const quantityOfStations = assignedWs.quantity > 0 ? assignedWs.quantity : 1;
                                const effectiveTime = tiempoEntry.Tiempo / quantityOfStations;
                                workstationEffectiveTimes.push(effectiveTime);
                            }
                        });

                        const lineBottleneck = workstationEffectiveTimes.length > 0 ? Math.max(...workstationEffectiveTimes) : Infinity;

                        return { line, bottleneckTime: lineBottleneck };
                    });
                    
                    const bestPerformance = linePerformances.reduce((best, current) => {
                        return (current.bottleneckTime < best.bottleneckTime) ? current : best;
                    }, { line: null, bottleneckTime: Infinity });

                    if (bestPerformance.line && bestPerformance.bottleneckTime !== Infinity) {
                        bestLineInfo = {
                            line: bestPerformance.line,
                            bottleneckTime: bestPerformance.bottleneckTime,
                        };
                    }
                }

                const necesidad = Math.max(0, Math.round(item.StockSeguridad || 0) - Math.round(item.StockActual || 0));
                const tiempoUnitario = bestLineInfo.bottleneckTime;
                const tiempoTotal = tiempoUnitario !== null ? necesidad * tiempoUnitario : null;

                return {
                    CentroStock: stockCenter,
                    CentroProduccion: producingCenter,
                    ClaseAprovisionam: item.ClaseAprovisionam,
                    Descripcion: item.Descripcion,
                    Material: normalizedMaterial,
                    StockActual: Math.round(item.StockActual || 0),
                    StockSeguridad: Math.round(item.StockSeguridad || 0),
                    Linea: bestLineInfo.line?.name || null,
                    Tiempo: tiempoUnitario,
                    NecesidadStock: necesidad,
                    TiempoTotalRequerido: tiempoTotal,
                };
            });
            
            const finalData = transformedData.filter(item => item.Tiempo !== null);

            setInventoryData(finalData);
            addNotification('success', `Se procesaron ${finalData.length} registros con tiempos de producción definidos.`);
            
        } catch (error: any) {
            addNotification('error', `Error al consultar datos: ${error.message}`);
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [addNotification, constraints]);
    
    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <Sheet />
                    <h2 className="text-2xl font-semibold text-gray-700">Necesidades de Producción para Stock de Seguridad (Primer Período)</h2>
                </div>
                <Button onClick={handleFetchData} disabled={isLoading}>
                    {isLoading ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Calculando...
                        </>
                    ) : (
                        'Calcular Necesidades'
                    )}
                </Button>
            </div>
            
            <p className="text-gray-600 text-sm">
                Esta sección calcula la necesidad de producción para alcanzar los niveles de inventario de seguridad, antes de cualquier verificación de capacidad. Es el cálculo inicial para el primer mes del análisis.
            </p>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro Stock</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase Aprov.</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro Producción</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Línea Prod.</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Disp. (a)</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Seg. (b)</th>
                            <th className="px-2 py-2 text-right font-semibold text-green-700 bg-green-50 uppercase tracking-wider">Necesidad (c=b-a)</th>
                            <th className="px-2 py-2 text-right font-semibold text-green-700 bg-green-50 uppercase tracking-wider">T. Unit. (d)</th>
                            <th className="px-2 py-2 text-right font-semibold text-green-700 bg-green-50 uppercase tracking-wider">T. Total Req. (c*d)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {inventoryData.length > 0 ? (
                            inventoryData.map((row, index) => (
                                <tr key={`${row.Material}-${row.CentroStock}-${index}`}>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.CentroStock}</td>
                                    <td className="px-2 py-2 whitespace-nowrap font-mono">{row.Material}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Descripcion || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.ClaseAprovisionam || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap font-bold">{row.CentroProduccion}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Linea || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{(row.StockActual || 0).toLocaleString()}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{(row.StockSeguridad || 0).toLocaleString()}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono font-bold text-green-800 bg-green-50">{(row.NecesidadStock).toLocaleString()}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono font-bold text-green-800 bg-green-50">{row.Tiempo !== null ? row.Tiempo.toFixed(2) : 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono font-bold text-green-800 bg-green-50">{row.TiempoTotalRequerido !== null ? row.TiempoTotalRequerido.toFixed(2) : 'N/A'}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={11} className="text-center py-8 text-gray-500">
                                    {isLoading ? 'Calculando necesidades...' : 'No hay datos para mostrar. Presione el botón para calcular.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
