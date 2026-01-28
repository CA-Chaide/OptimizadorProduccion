
'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useAppContext } from '@/context/AppProvider';
import { SalesDataRow, CuboInventariosItem, AppConstraints, ProductProcessInfo, TiempoEnsambleItem, ProductionLine } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { NeedsCalculationIcon, MONTH_NAMES } from '@/constants/constants';
import { queryApi } from '@/hooks/useApiData';

// Helper functions
const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

const getMonthlyCapacityForWorkstation = (workstationId: string, year: number, month: number, constraints: AppConstraints): number => {
    const { holidays, shiftParameters, productionLines, workstationDefinitions } = constraints;
    if (!shiftParameters) return 0;
    
    let totalHours = 0;
    const daysInMonth = new Date(year, month, 0).getDate();

    const workstation = workstationDefinitions.find(wd => wd.id === workstationId);
    if (!workstation) return 0;

    let totalAssignedQuantity = 0;
    productionLines.forEach(line => {
        const assigned = line.assignedWorkstations.find(as => as.definitionId === workstationId);
        if (assigned) {
            totalAssignedQuantity += assigned.quantity;
        }
    });

    if (totalAssignedQuantity === 0) return 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dateString = date.toISOString().split('T')[0];
        const holiday = holidays.find(h => h.date === dateString && h.appliesTo !== 'Distribucion');
        const dayOfWeek = date.getDay();

        let dailyHours = 0;
        if (holiday) {
            if (holiday.dayType === 'asueto') dailyHours = 0;
            else if (holiday.dayType === 'half') dailyHours = shiftParameters.saturdayAndHolidayHours;
            else dailyHours = shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay;
        } else {
            if (dayOfWeek === 0) dailyHours = 0;
            else if (dayOfWeek === 6) dailyHours = shiftParameters.saturdayAndHolidayHours;
            else dailyHours = shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay;
        }
        totalHours += dailyHours; 
    }

    return totalHours * totalAssignedQuantity * 0.87; 
};

interface NeedsRow {
    productId: string;
    productName: string;
    backlog: number;
    salesNeed: number;
    safetyStock: number;
    initialStock: number;
    totalNeed: number;
    provisionClass: 'E' | 'X' | 'F' | 'N/A';
    viableProductionC2000: number;
    capacityDeficitC2000: number;
    transferNeedF: number;
    totalTransferNeed: number;
}


const getBestLineForProduct = (
    productId: string,
    producingCenterId: string,
    tiemposData: TiempoEnsambleItem[],
    constraints: AppConstraints
): { bestLine: ProductionLine | null; bottleneckTime: number | null; workstationHourBreakdown: Record<string, number> } => {

    const possibleLines = constraints.productionLines.filter(line =>
        line.workCenterId === producingCenterId && line.isActive &&
        tiemposData.some(t =>
            normalizeMaterialCode(t.CodMaterial) === productId &&
            String(t.Centro).trim() === producingCenterId &&
            t.Linea.trim() === line.name
        )
    );

    if (possibleLines.length === 0) {
        return { bestLine: null, bottleneckTime: null, workstationHourBreakdown: {} };
    }

    const linePerformances = possibleLines.map(line => {
        const workstationEffectiveTimes: { time: number, wsId: string }[] = [];

        line.assignedWorkstations.forEach(assignedWs => {
            const workstationDef = constraints.workstationDefinitions.find(wd => wd.id === assignedWs.definitionId);
            if (!workstationDef) return;

            const tiempoEntry = tiemposData.find(t =>
                normalizeMaterialCode(t.CodMaterial) === productId &&
                String(t.Centro).trim() === producingCenterId &&
                t.Linea.trim() === line.name &&
                t.PuestoTrabajo.trim() === workstationDef.name
            );

            if (tiempoEntry && tiempoEntry.Tiempo > 0) {
                const quantityOfStations = assignedWs.quantity > 0 ? assignedWs.quantity : 1;
                const effectiveTime = tiempoEntry.Tiempo / quantityOfStations; // Time in minutes
                workstationEffectiveTimes.push({ time: effectiveTime, wsId: workstationDef.id });
            }
        });

        const lineBottleneck = workstationEffectiveTimes.length > 0 ? Math.max(...workstationEffectiveTimes.map(wet => wet.time)) : Infinity;

        const breakdown: Record<string, number> = {};
        if (workstationEffectiveTimes.length > 0) {
            // Recalculate breakdown based on the line bottleneck, not individual times
            const totalTimePerUnitOnLine = lineBottleneck / 60; // in hours
             line.assignedWorkstations.forEach(assignedWs => {
                const workstationDef = constraints.workstationDefinitions.find(wd => wd.id === assignedWs.definitionId);
                if (!workstationDef) return;
                const tiempoEntry = tiemposData.find(t =>
                    normalizeMaterialCode(t.CodMaterial) === productId &&
                    String(t.Centro).trim() === producingCenterId &&
                    t.Linea.trim() === line.name &&
                    t.PuestoTrabajo.trim() === workstationDef.name
                );
                if (tiempoEntry && tiempoEntry.Tiempo > 0) {
                    breakdown[workstationDef.id] = (tiempoEntry.Tiempo / 60); // Time in hours for ONE post
                }
            });
        }
        
        return { line, bottleneckTime: lineBottleneck, workstationHourBreakdown: breakdown };
    });

    const bestPerformance = linePerformances.reduce((best, current) => {
        return (current.bottleneckTime < best.bottleneckTime) ? current : best;
    }, { line: null as ProductionLine | null, bottleneckTime: Infinity, workstationHourBreakdown: {} });

    if (bestPerformance.line && bestPerformance.bottleneckTime !== Infinity) {
        return {
            bestLine: bestPerformance.line,
            bottleneckTime: bestPerformance.bottleneckTime, // in minutes
            workstationHourBreakdown: bestPerformance.workstationHourBreakdown // in hours/unit
        };
    }

    return { bestLine: null, bottleneckTime: null, workstationHourBreakdown: {} };
};


export const NeedsCalculationC2000Section: React.FC = () => {
    const { 
        salesData, 
        constraints, 
        apiCuboInventariosData, 
        planningYear, 
        planningMonth,
        addNotification,
        setC2000RequiredHours
    } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [results, setResults] = useState<NeedsRow[]>([]);

    const handleCalculate = useCallback(async () => {
        setIsLoading(true);
        addNotification('info', 'Iniciando cálculo de necesidades para Centro 2000...');

        const year = parseInt(planningYear, 10);
        const month = parseInt(planningMonth, 10);
        
        // Fetch assembly times
        let tiemposData: TiempoEnsambleItem[] = [];
        try {
            tiemposData = await queryApi({
                source: 'TiemposEnsamblado',
                operation: 'get_data',
                pagination: { limit: 500000 }
            });
            if (!tiemposData || tiemposData.length === 0) {
                addNotification('error', 'No se pudieron cargar los tiempos de ensamble. El cálculo no puede continuar.');
                setIsLoading(false);
                return;
            }
        } catch (error) {
            addNotification('error', `Error al cargar tiempos de ensamble: ${(error as Error).message}`);
            setIsLoading(false);
            return;
        }


        const materials = new Map<string, NeedsRow>();

        // 1. Initialize materials from sales and inventory
        const salesThisMonthC2000 = salesData.filter(s => String(s.centro).trim() === '2000' && s.año === year && s.mes === month);
        
        salesThisMonthC2000.forEach(s => {
            const productId = normalizeMaterialCode(s.código);
            if (!materials.has(productId)) {
                materials.set(productId, { productId, productName: s.descripciónMaterial, salesNeed: 0, initialStock: 0, safetyStock: 0, backlog: 0, totalNeed: 0, provisionClass: 'N/A', viableProductionC2000: 0, capacityDeficitC2000: 0, transferNeedF: 0, totalTransferNeed: 0 });
            }
            materials.get(productId)!.salesNeed += s.unidadesProyectado;
        });

        apiCuboInventariosData.forEach(item => {
            if (String(item.Centro).trim() === '2000') {
                const productId = normalizeMaterialCode(item.Material);
                if (materials.has(productId)) {
                    materials.get(productId)!.initialStock = Number(item.StockActual) || 0;
                    materials.get(productId)!.safetyStock = Number(item.StockSeguridad) || 0;
                }
            }
        });

        // 2. Calculate Total Need and Provisioning Class
        materials.forEach(row => {
            row.totalNeed = (row.salesNeed + row.safetyStock) - row.initialStock;
            if (row.totalNeed < 0) row.totalNeed = 0;
            
            const primaryEntry = apiCuboInventariosData.find(item => normalizeMaterialCode(item.Material) === row.productId && String(item.Centro).trim() === '2000');
            const fallbackEntry = apiCuboInventariosData.find(item => normalizeMaterialCode(item.Material) === row.productId && String(item.Centro).trim() === '1000');

            if (primaryEntry?.ClaseAprovisionam) {
                row.provisionClass = primaryEntry.ClaseAprovisionam;
            } else if (fallbackEntry?.ClaseAprovisionam === 'F') {
                row.provisionClass = 'F';
            }
        });

        // 3. Calculate Viable Production C2000
        const needsE = Array.from(materials.values()).filter(m => m.provisionClass === 'E' && m.totalNeed > 0);
        const needsX = Array.from(materials.values()).filter(m => m.provisionClass === 'X' && m.totalNeed > 0);
        
        const workstationsC2000 = constraints.workstationDefinitions.filter(wd => 
            constraints.productionLines.some(line => line.workCenterId === '2000' && line.assignedWorkstations.some(as => as.definitionId === wd.id))
        );
        const capacityByWorkstation: Record<string, number> = {};
        workstationsC2000.forEach(ws => {
            capacityByWorkstation[ws.id] = getMonthlyCapacityForWorkstation(ws.id, year, month, constraints);
        });

        const calculateViable = (
            needs: NeedsRow[],
            availableCapacity: Record<string, number>,
            tiemposData: TiempoEnsambleItem[],
            constraints: AppConstraints
        ): { viable: Map<string, number>; hours: Record<string, number> } => {

            const detailedNeeds = needs.map(need => {
                 const { bottleneckTime, workstationHourBreakdown } = getBestLineForProduct(need.productId, '2000', tiemposData, constraints);
                 const isProducible = bottleneckTime !== null && bottleneckTime !== Infinity;

                 return { ...need, isProducible, workstationHoursPerUnit: workstationHourBreakdown };
            }).filter(n => n.isProducible); // Only consider producible items

            let currentNeeds = detailedNeeds.map(n => ({ ...n, qtyToProduce: n.totalNeed }));
            
            let iterations = 0;
            while (iterations < 10) {
                iterations++;
                const requiredHours: Record<string, number> = {};
                const bottleneck = { wsId: '', deficit: 0 };
                
                // Calculate load for current quantities
                currentNeeds.forEach(need => {
                    Object.entries(need.workstationHoursPerUnit).forEach(([wsId, hoursPerUnit]) => {
                        if (!requiredHours[wsId]) requiredHours[wsId] = 0;
                        requiredHours[wsId] += need.qtyToProduce * hoursPerUnit;
                    });
                });
                
                // Find this iteration's bottleneck
                Object.entries(requiredHours).forEach(([wsId, hours]) => {
                    const deficit = hours - (availableCapacity[wsId] || 0);
                    if (deficit > bottleneck.deficit) {
                        bottleneck.wsId = wsId;
                        bottleneck.deficit = deficit;
                    }
                });

                if (bottleneck.deficit <= 0.001) { // Exit if no significant bottleneck
                    break;
                }
                
                // Adjust quantities based on bottleneck
                const hoursInBottleneck = requiredHours[bottleneck.wsId];
                currentNeeds.forEach(need => {
                    const productHoursInBottleneck = (need.workstationHoursPerUnit[bottleneck.wsId] || 0) * need.qtyToProduce;
                    const participation = hoursInBottleneck > 0 ? productHoursInBottleneck / hoursInBottleneck : 0;
                    const hoursToCut = bottleneck.deficit * participation;
                    const unitsToCut = (need.workstationHoursPerUnit[bottleneck.wsId] || 1) > 0
                        ? hoursToCut / (need.workstationHoursPerUnit[bottleneck.wsId])
                        : 0;
                    need.qtyToProduce = Math.max(0, Math.floor(need.qtyToProduce - unitsToCut));
                });
            }

            const viable = new Map<string, number>();
            const finalRequiredHours: Record<string, number> = {};
            currentNeeds.forEach(need => {
                viable.set(need.productId, need.qtyToProduce);
                Object.entries(need.workstationHoursPerUnit).forEach(([wsId, hoursPerUnit]) => {
                    if (!finalRequiredHours[wsId]) finalRequiredHours[wsId] = 0;
                    finalRequiredHours[wsId] += need.qtyToProduce * hoursPerUnit;
                });
            });

            return { viable, hours: finalRequiredHours };
        };


        const { viable: viableE, hours: hoursE } = calculateViable(needsE, capacityByWorkstation, tiemposData, constraints);
        
        const remainingCapacity = { ...capacityByWorkstation };
        Object.keys(hoursE).forEach(wsId => {
            remainingCapacity[wsId] -= hoursE[wsId];
        });

        const { viable: viableX, hours: hoursX } = calculateViable(needsX, remainingCapacity, tiemposData, constraints);
        
        const requiredHours: Record<string, number> = {};
        Object.keys(hoursE).forEach(k => requiredHours[k] = (requiredHours[k] || 0) + hoursE[k]);
        Object.keys(hoursX).forEach(k => requiredHours[k] = (requiredHours[k] || 0) + hoursX[k]);

        // 4. Finalize rows
        materials.forEach(row => {
            if (row.provisionClass === 'E') {
                row.viableProductionC2000 = viableE.get(row.productId) || 0;
            } else if (row.provisionClass === 'X') {
                row.viableProductionC2000 = viableX.get(row.productId) || 0;
            }

            if (row.provisionClass === 'E' || row.provisionClass === 'X') {
                row.capacityDeficitC2000 = row.totalNeed - row.viableProductionC2000;
            }
            
            if (row.provisionClass === 'F') {
                row.transferNeedF = row.totalNeed;
            }
            
            row.totalTransferNeed = row.capacityDeficitC2000 + row.transferNeedF;
        });
        
        setC2000RequiredHours(requiredHours);
        setResults(Array.from(materials.values()));
        setIsLoading(false);
        addNotification('success', `Cálculo para ${materials.size} materiales completado.`);
    }, [planningYear, planningMonth, salesData, apiCuboInventariosData, constraints, addNotification, setC2000RequiredHours]);

    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
                 <div className="flex items-center space-x-3">
                    <NeedsCalculationIcon />
                    <h2 className="text-2xl font-semibold text-gray-700">Cálculo de Necesidades y Traslados - Centro 2000</h2>
                </div>
                <Button onClick={handleCalculate} disabled={isLoading}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Calcular para {MONTH_NAMES[parseInt(planningMonth,10)-1]} {planningYear}
                </Button>
            </div>
            <p className="text-sm text-gray-500">
                Esta sección calcula la producción viable en el Centro 2000 y determina las necesidades de traslado hacia el Centro 1000.
            </p>
            <div className="border rounded-lg overflow-auto max-h-[75vh]">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600">Material</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600">Descripción</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600">Necesidad Ventas</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Seg.</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Inicial</th>
                            <th className="px-2 py-2 text-right font-semibold text-blue-700 bg-blue-50">Total Necesidad</th>
                            <th className="px-2 py-2 text-center font-semibold text-gray-600">Clase Aprov.</th>
                            <th className="px-2 py-2 text-right font-semibold text-green-700 bg-green-50">Prod. Viable C2000</th>
                            <th className="px-2 py-2 text-right font-semibold text-red-700 bg-red-50">Déficit Cap. C2000</th>
                            <th className="px-2 py-2 text-right font-semibold text-orange-700 bg-orange-50">Nec. Traslado (F)</th>
                            <th className="px-2 py-2 text-right font-semibold text-purple-700 bg-purple-50">Total Traslado a C1000</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {results.map(row => (
                            <tr key={row.productId}>
                                <td className="px-2 py-2 font-mono">{row.productId}</td>
                                <td className="px-2 py-2">{row.productName}</td>
                                <td className="px-2 py-2 text-right font-mono">{row.salesNeed.toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono">{row.safetyStock.toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono">{row.initialStock.toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-blue-800 bg-blue-50">{row.totalNeed.toLocaleString()}</td>
                                <td className="px-2 py-2 text-center font-bold">{row.provisionClass}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-green-800 bg-green-50">{row.viableProductionC2000.toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-red-800 bg-red-50">{row.capacityDeficitC2000.toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-orange-800 bg-orange-50">{row.transferNeedF.toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-purple-800 bg-purple-50">{row.totalTransferNeed.toLocaleString()}</td>
                            </tr>
                        ))}
                         {results.length === 0 && !isLoading && (
                            <tr>
                                <td colSpan={11} className="text-center py-8 text-gray-500">
                                    Presione el botón "Calcular" para ver los resultados.
                                </td>
                            </tr>
                        )}
                        {isLoading && (
                             <tr>
                                <td colSpan={11} className="text-center py-8 text-gray-500">
                                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
