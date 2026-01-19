
'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useAppContext } from '@/context/AppProvider';
import { queryApi } from '@/hooks/useApiData';
import { Sheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductionLine, WorkstationDefinition, PresupuestoItem } from '@/types/types';
import { MONTH_NAMES } from '@/constants/constants';

interface CuboInventariosRow {
    Centro: string;
    ClaseAprovisionam: string | null;
    Descripcion?: string;
    Material: string;
    StockSeguridad: number;
    StockActual: number;
    Sector?: string;
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
    Sector: string | null;
    StockSeguridad: number;
    StockActual: number;
    Linea: string | null;
    Tiempo: number | null;
    NecesidadStock: number;
    VentasMes1: number;
    TiempoTotalRequeridoStock: number | null;
    TiempoTotalRequeridoVentas: number | null;
}

// Function to normalize material codes to match sales data format
const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code).trim();
    return codeStr.slice(-8);
};

const FilterInput: React.FC<{
    column: keyof DisplayRow;
    value: string;
    onChange: (column: keyof DisplayRow, value: string) => void;
}> = ({ column, value, onChange }) => (
    <input
        type="text"
        placeholder="Filtrar..."
        className="w-full text-xs p-1 border rounded border-gray-300"
        value={value}
        onChange={(e) => onChange(column, e.target.value)}
        onClick={(e) => e.stopPropagation()}
    />
);


export const InventoryNeedsSection: React.FC = () => {
    const { addNotification, constraints } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [inventoryData, setInventoryData] = useState<DisplayRow[]>([]);
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const [startYear, setStartYear] = useState<string>(String(currentYear));
    const [startMonth, setStartMonth] = useState<string>(String(currentMonth));
    const yearOptions = [currentYear -1, currentYear, currentYear + 1, currentYear + 2];

    const [filters, setFilters] = useState<Partial<Record<keyof DisplayRow, string>>>({});


    const handleFetchData = useCallback(async () => {
        const selectedDate = new Date(Number(startYear), Number(startMonth) - 1, 1);
        const today = new Date();
        const firstDayOfCurrentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        if (selectedDate < firstDayOfCurrentMonth) {
            addNotification('warning', 'No está permitido seleccionar un mes anterior al actual.');
            return;
        }

        setIsLoading(true);
        setInventoryData([]);
        addNotification('info', `Consultando datos para ${MONTH_NAMES[Number(startMonth)-1]} ${startYear}...`);

        try {
            const [cuboData, tiemposData, presupuestoData]: [CuboInventariosRow[], TiempoEnsambleRow[], PresupuestoItem[]] = await Promise.all([
                queryApi({
                    source: 'CuboInventarios',
                    operation: 'get_data',
                    columns: ["Centro", "ClaseAprovisionam", "Descripcion", "Material", "StockSeguridad", "StockActual", "Sector"],
                    pagination: { limit: 500000 }
                }),
                queryApi({
                    source: 'TiemposEnsamblado',
                    operation: 'get_data',
                    columns: ["CodMaterial", "Centro", "Linea", "PuestoTrabajo", "Tiempo"],
                    pagination: { limit: 500000 }
                }),
                queryApi({
                    source: 'Presupuesto',
                    operation: 'get_data',
                    filters: { 'Año': Number(startYear), 'Mes': Number(startMonth) },
                    pagination: { limit: 500000 }
                })
            ]);

            if (!cuboData || cuboData.length === 0) {
                addNotification('warning', 'No se encontraron datos en CuboInventarios.');
                setIsLoading(false);
                return;
            }

            const allProductCenterPairs = new Set<string>();
            cuboData.forEach(item => {
                if (item.Material && item.Centro) {
                    allProductCenterPairs.add(`${normalizeMaterialCode(item.Material)}---${String(item.Centro).trim()}`);
                }
            });
            presupuestoData.forEach(item => {
                if (item.CodMaterial && item.Centro) {
                    allProductCenterPairs.add(`${normalizeMaterialCode(item.CodMaterial)}---${String(item.Centro).trim()}`);
                }
            });

            const transformedData = Array.from(allProductCenterPairs).map(key => {
                const [productId, centerId] = key.split('---');

                const cuboItem = cuboData.find(i => normalizeMaterialCode(i.Material) === productId && String(i.Centro).trim() === centerId) || {};
                
                const stockCenter = centerId;
                const sector = cuboItem.Sector || 'Sin Sector';
                
                let producingCenter = stockCenter;
                const primaryEntry = cuboData.find(i => normalizeMaterialCode(i.Material) === productId && String(i.Centro).trim() === stockCenter);
                if (stockCenter === '2000' && primaryEntry?.ClaseAprovisionam === 'F') {
                    producingCenter = '1000';
                }

                const possibleLines = constraints.productionLines.filter(line => 
                    line.workCenterId === producingCenter &&
                    tiemposData.some(t => 
                        normalizeMaterialCode(t.CodMaterial) === productId &&
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
                                normalizeMaterialCode(t.CodMaterial) === productId &&
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
                    }, { line: null as ProductionLine | null, bottleneckTime: Infinity });

                    if (bestPerformance.line && bestPerformance.bottleneckTime !== Infinity) {
                        bestLineInfo = { line: bestPerformance.line, bottleneckTime: bestPerformance.bottleneckTime };
                    }
                }

                const stockActual = parseFloat(String(cuboItem.StockActual || '0'));
                const stockSeguridad = parseFloat(String(cuboItem.StockSeguridad || '0'));
                const necesidad = Math.max(0, Math.round(stockSeguridad) - Math.round(stockActual));
                
                const salesDemand = presupuestoData
                    .filter(p => normalizeMaterialCode(p.CodMaterial) === productId && String(p.Centro).trim() === stockCenter)
                    .reduce((sum, p) => {
                        const unitsStr = String(p.UnidadesProyectado || '0');
                        const units = parseFloat(unitsStr);
                        return sum + (isNaN(units) ? 0 : units);
                    }, 0);

                const tiempoUnitario = bestLineInfo.bottleneckTime;
                const tiempoTotalStock = tiempoUnitario !== null ? necesidad * tiempoUnitario : null;
                const tiempoTotalVentas = tiempoUnitario !== null ? salesDemand * tiempoUnitario : null;


                return {
                    CentroStock: stockCenter,
                    CentroProduccion: producingCenter,
                    ClaseAprovisionam: cuboItem.ClaseAprovisionam || null,
                    Descripcion: cuboItem.Descripcion,
                    Material: productId,
                    Sector: sector,
                    StockActual: Math.round(stockActual),
                    StockSeguridad: Math.round(stockSeguridad),
                    Linea: bestLineInfo.line?.name || null,
                    Tiempo: tiempoUnitario,
                    NecesidadStock: necesidad,
                    VentasMes1: salesDemand,
                    TiempoTotalRequeridoStock: tiempoTotalStock,
                    TiempoTotalRequeridoVentas: tiempoTotalVentas,
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
    }, [addNotification, constraints, startYear, startMonth]);
    
    const handleFilterChange = (column: keyof DisplayRow, value: string) => {
        setFilters(prev => ({ ...prev, [column]: value }));
    };

    const filteredData = useMemo(() => {
        if (!inventoryData) return [];
        return inventoryData.filter(row => {
            return (Object.keys(filters) as Array<keyof DisplayRow>).every(key => {
                const filterValue = filters[key];
                if (!filterValue) return true;

                const rowValue = row[key];
                if (rowValue === null || rowValue === undefined) return false;

                return String(rowValue).toLowerCase().includes(filterValue.toLowerCase());
            });
        });
    }, [inventoryData, filters]);

    const footerTotals = useMemo(() => {
        const totals: Record<keyof Omit<DisplayRow, 'CentroStock' | 'CentroProduccion' | 'ClaseAprovisionam' | 'Descripcion' | 'Material' | 'Sector' | 'Linea' | 'Tiempo'>, number> = {
            StockActual: 0,
            StockSeguridad: 0,
            NecesidadStock: 0,
            VentasMes1: 0,
            TiempoTotalRequeridoStock: 0,
            TiempoTotalRequeridoVentas: 0,
        };
        filteredData.forEach(row => {
            totals.StockActual += row.StockActual || 0;
            totals.StockSeguridad += row.StockSeguridad || 0;
            totals.NecesidadStock += row.NecesidadStock || 0;
            totals.VentasMes1 += row.VentasMes1 || 0;
            totals.TiempoTotalRequeridoStock += row.TiempoTotalRequeridoStock || 0;
            totals.TiempoTotalRequeridoVentas += row.TiempoTotalRequeridoVentas || 0;
        });
        return totals;
    }, [filteredData]);

    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <Sheet />
                    <h2 className="text-2xl font-semibold text-gray-700">Necesidades de Producción para Stock de Seguridad (Primer Período)</h2>
                </div>
                 <div className="flex items-end space-x-2">
                    <div>
                        <label htmlFor="startYear" className="block text-sm font-medium text-gray-700">Año de Inicio</label>
                        <select id="startYear" value={startYear} onChange={e => setStartYear(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border">
                            {yearOptions.map(y => <option key={y} value={String(y)}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="startMonth" className="block text-sm font-medium text-gray-700">Mes de Inicio</label>
                        <select id="startMonth" value={startMonth} onChange={e => setStartMonth(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border">
                            {MONTH_NAMES.map((m, i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
                        </select>
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
            </div>
            
            <p className="text-gray-600 text-sm">
                Esta sección calcula la necesidad de producción para alcanzar los niveles de inventario de seguridad y cubrir las ventas del primer mes, antes de cualquier verificación de capacidad.
            </p>

            <div className="border rounded-lg overflow-auto max-h-[70vh]">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro Stock</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Material</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Sector</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase Aprov.</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro Producción</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Línea Prod.</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Disp. (a)</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Seg. (b)</th>
                            <th className="px-2 py-2 text-right font-semibold text-green-700 bg-green-50 uppercase tracking-wider">Necesidad Stock (C=B-A)</th>
                            <th className="px-2 py-2 text-right font-semibold text-green-700 bg-green-50 uppercase tracking-wider">Ventas Mes 1</th>
                            <th className="px-2 py-2 text-right font-semibold text-green-700 bg-green-50 uppercase tracking-wider">T. Unit. (d)</th>
                            <th className="px-2 py-2 text-right font-semibold text-green-700 bg-green-50 uppercase tracking-wider">T. Total Req. Stock (c*d)</th>
                            <th className="px-2 py-2 text-right font-semibold text-green-700 bg-green-50 uppercase tracking-wider">T. Total Req Ventas</th>
                        </tr>
                        <tr>
                            <th className="p-1"><FilterInput column="CentroStock" value={filters.CentroStock || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="Material" value={filters.Material || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="Descripcion" value={filters.Descripcion || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="Sector" value={filters.Sector || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="ClaseAprovisionam" value={filters.ClaseAprovisionam || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="CentroProduccion" value={filters.CentroProduccion || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="Linea" value={filters.Linea || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="StockActual" value={filters.StockActual || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="StockSeguridad" value={filters.StockSeguridad || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="NecesidadStock" value={filters.NecesidadStock || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="VentasMes1" value={filters.VentasMes1 || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="Tiempo" value={filters.Tiempo || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="TiempoTotalRequeridoStock" value={filters.TiempoTotalRequeridoStock || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="TiempoTotalRequeridoVentas" value={filters.TiempoTotalRequeridoVentas || ''} onChange={handleFilterChange} /></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredData.length > 0 ? (
                            filteredData.map((row, index) => (
                                <tr key={`${row.Material}-${row.CentroStock}-${index}`}>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.CentroStock}</td>
                                    <td className="px-2 py-2 whitespace-nowrap font-mono">{row.Material}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Descripcion || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Sector || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.ClaseAprovisionam || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap font-bold">{row.CentroProduccion}</td>
                                    <td className="px-2 py-2 whitespace-nowrap">{row.Linea || 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{row.StockActual.toLocaleString()}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{row.StockSeguridad.toLocaleString()}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono font-bold text-green-800 bg-green-50">{row.NecesidadStock.toLocaleString()}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono font-bold text-green-800 bg-green-50">{row.VentasMes1.toLocaleString()}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono font-bold text-green-800 bg-green-50">{row.Tiempo !== null ? row.Tiempo.toFixed(2) : 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono font-bold text-green-800 bg-green-50">{row.TiempoTotalRequeridoStock !== null ? row.TiempoTotalRequeridoStock.toFixed(2) : 'N/A'}</td>
                                    <td className="px-2 py-2 whitespace-nowrap text-right font-mono font-bold text-green-800 bg-green-50">{row.TiempoTotalRequeridoVentas !== null ? row.TiempoTotalRequeridoVentas.toFixed(2) : 'N/A'}</td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={14} className="text-center py-8 text-gray-500">
                                    {isLoading ? 'Calculando necesidades...' : 'No hay datos para mostrar. Presione el botón para calcular o ajuste los filtros.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                     <tfoot className="bg-gray-800 text-white sticky bottom-0 z-10">
                        <tr>
                            <th colSpan={7} className="px-2 py-2 text-right font-bold uppercase">TOTALES FILTRADOS:</th>
                            <td className="px-2 py-2 text-right font-mono font-bold">{footerTotals.StockActual.toLocaleString()}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{footerTotals.StockSeguridad.toLocaleString()}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{footerTotals.NecesidadStock.toLocaleString()}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{footerTotals.VentasMes1.toLocaleString()}</td>
                            <td></td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{footerTotals.TiempoTotalRequeridoStock.toFixed(2)}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{footerTotals.TiempoTotalRequeridoVentas.toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
