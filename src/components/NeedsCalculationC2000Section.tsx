
'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useAppContext } from '@/context/AppProvider';
import { SalesDataRow, CuboInventariosItem, AppConstraints, ProductProcessInfo, TiempoEnsambleItem, ProductionLine } from '@/types/types';
import { Button } from '@/components/ui/button';
import { Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { NeedsCalculationIcon, MONTH_NAMES } from '@/constants/constants';
import { queryApi } from '@/hooks/useApiData';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

// Helper functions
const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
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
                    breakdown[workstationDef.id] = (tiempoEntry.Tiempo / 60);
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
            bottleneckTime: bestPerformance.bottleneckTime,
            workstationHourBreakdown: bestPerformance.workstationHourBreakdown
        };
    }

    return { bestLine: null, bottleneckTime: null, workstationHourBreakdown: {} };
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

// Filter Components
const FilterInput: React.FC<{
    column: keyof NeedsRow;
    value: string;
    onChange: (column: keyof NeedsRow, value: string) => void;
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

const MultiSelectFilter: React.FC<{
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}> = ({ options, selected, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  return (
    <div className="flex flex-col items-start w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-7 text-xs font-normal"
          >
            <span className="truncate">
              {selected.length === 0
                ? placeholder || 'Seleccionar...'
                : `${selected.length} sel.`}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder="Buscar..." className="h-9 text-xs" />
            <CommandEmpty>No hay resultados.</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    const matchingOption = options.find(opt => opt.value.toLowerCase() === currentValue.toLowerCase());
                    if (matchingOption) {
                      handleSelect(matchingOption.value);
                    }
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected.includes(option.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="text-xs">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
          <div className="pt-1 text-left w-full min-h-[18px]">
            {selected.slice(0, 1).map(value => (
                <Badge key={value} variant="secondary" className="mr-1 mb-1 max-w-[100px] truncate" title={options.find(opt => opt.value === value)?.label || value}>
                    {options.find(opt => opt.value === value)?.label || value}
                </Badge>
            ))}
            {selected.length > 1 && <Badge variant="secondary">+{selected.length - 1}</Badge>}
          </div>
      )}
    </div>
  );
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
    
    const [filters, setFilters] = useState<Partial<Record<keyof NeedsRow, string | string[]>>>({});
    const [filterOptions, setFilterOptions] = useState<Record<string, { value: string, label: string }[]>>({});

    useEffect(() => {
        if (results.length > 0) {
            const columnsToFilter: Array<keyof NeedsRow> = ['provisionClass'];
            const options: Record<string, Set<string>> = {};
            columnsToFilter.forEach(col => options[col] = new Set());
            
            results.forEach(row => {
               columnsToFilter.forEach(col => {
                    const value = row[col];
                    if (value !== null && value !== undefined && String(value).trim() !== '' && value !== 'N/A') {
                        options[col].add(String(value));
                    }
               });
            });

            const formattedOptions: Record<string, { value: string, label: string }[]> = {};
            for (const key in options) {
                formattedOptions[key] = Array.from(options[key]).sort().map(val => ({ value: val, label: val }));
            }
            setFilterOptions(formattedOptions);
        }
    }, [results]);

    const handleFilterChange = (column: keyof NeedsRow, value: string) => {
        setFilters(prev => ({ ...prev, [column]: value }));
    };

    const handleMultiSelectFilterChange = (column: keyof NeedsRow, value: string[]) => {
        setFilters(prev => ({ ...prev, [column]: value }));
    };

    const filteredData = useMemo(() => {
        if (!results) return [];
        return results.filter(row => {
             return Object.keys(filters).every(key => {
                const filterValue = filters[key as keyof typeof filters];
                if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return true;

                const rowValue = row[key as keyof typeof row];
                if (rowValue === null || rowValue === undefined) return false;

                if (Array.isArray(filterValue)) { // Multi-select
                    return filterValue.includes(String(rowValue));
                } else { // Text filter
                    return String(rowValue).toLowerCase().includes(String(filterValue).toLowerCase());
                }
            });
        });
    }, [results, filters]);
    
    const footerTotals = useMemo(() => {
        const initialTotals = {
            salesNeed: 0, safetyStock: 0, initialStock: 0, totalNeed: 0,
            viableProductionC2000: 0, capacityDeficitC2000: 0,
            transferNeedF: 0, totalTransferNeed: 0,
        };
        if (!filteredData) return initialTotals;
        return filteredData.reduce((acc, row) => {
            acc.salesNeed += row.salesNeed || 0;
            acc.safetyStock += row.safetyStock || 0;
            acc.initialStock += row.initialStock || 0;
            acc.totalNeed += row.totalNeed || 0;
            acc.viableProductionC2000 += row.viableProductionC2000 || 0;
            acc.capacityDeficitC2000 += row.capacityDeficitC2000 || 0;
            acc.transferNeedF += row.transferNeedF || 0;
            acc.totalTransferNeed += row.totalTransferNeed || 0;
            return acc;
        }, initialTotals);
    }, [filteredData]);


    const handleCalculate = useCallback(async () => {
        setIsLoading(true);
        addNotification('info', 'Iniciando cálculo de necesidades para Centro 2000...');

        const year = parseInt(planningYear, 10);
        const month = parseInt(planningMonth, 10);
        
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
        const salesThisMonthC2000 = salesData.filter(s => String(s.centro).trim() === '2000' && s.año === year && s.mes === month);
        
        const allProductIds = new Set(salesThisMonthC2000.map(s => normalizeMaterialCode(s.código)));
        apiCuboInventariosData.forEach(item => {
            if (String(item.Centro).trim() === '2000') {
                allProductIds.add(normalizeMaterialCode(item.Material));
            }
        });

        allProductIds.forEach(productId => {
            const sale = salesThisMonthC2000.find(s => normalizeMaterialCode(s.código) === productId);
            const inventoryItem = apiCuboInventariosData.find(i => normalizeMaterialCode(i.Material) === productId && String(i.Centro).trim() === '2000');
            
            const salesNeed = sale ? sale.unidadesProyectado : 0;
            const initialStock = Number(inventoryItem?.StockActual) || 0;
            const safetyStock = Number(inventoryItem?.StockSeguridad) || 0;
            const totalNeed = Math.max(0, (salesNeed + safetyStock) - initialStock);

            const productName = sale?.descripciónMaterial || inventoryItem?.Descripcion || 'N/A';

            const provisionClass: NeedsRow['provisionClass'] = inventoryItem?.ClaseAprovisionam || 'N/A';
            
            // Check for producibility is now part of getBestLineForProduct, which returns null if not producible.
            // This is cleaner than the previous explicit check here.

            materials.set(productId, { productId, productName, salesNeed, initialStock, safetyStock, backlog: 0, totalNeed, provisionClass, viableProductionC2000: 0, capacityDeficitC2000: 0, transferNeedF: 0, totalTransferNeed: 0 });
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
            }).filter(n => n.isProducible);

            let currentNeeds = detailedNeeds.map(n => ({ ...n, qtyToProduce: n.totalNeed }));
            
            for (let i = 0; i < 15; i++) {
                const requiredHours: Record<string, number> = {};
                let bottleneck = { wsId: '', deficit: 0 };
                
                currentNeeds.forEach(need => {
                    Object.entries(need.workstationHoursPerUnit).forEach(([wsId, hoursPerUnit]) => {
                        if (!requiredHours[wsId]) requiredHours[wsId] = 0;
                        requiredHours[wsId] += need.qtyToProduce * hoursPerUnit;
                    });
                });
                
                Object.entries(requiredHours).forEach(([wsId, hours]) => {
                    const deficit = hours - (availableCapacity[wsId] || 0);
                    if (deficit > bottleneck.deficit) {
                        bottleneck = { wsId, deficit };
                    }
                });

                if (bottleneck.deficit <= 0.01) {
                    break;
                }
                
                const hoursInBottleneck = requiredHours[bottleneck.wsId];
                currentNeeds.forEach(need => {
                    if (need.workstationHoursPerUnit[bottleneck.wsId]) {
                        const productHoursInBottleneck = (need.workstationHoursPerUnit[bottleneck.wsId] || 0) * need.qtyToProduce;
                        const participation = hoursInBottleneck > 0 ? productHoursInBottleneck / hoursInBottleneck : 0;
                        const hoursToCut = bottleneck.deficit * participation;
                        const unitsToCut = (need.workstationHoursPerUnit[bottleneck.wsId]) > 0
                            ? hoursToCut / (need.workstationHoursPerUnit[bottleneck.wsId])
                            : 0;
                        need.qtyToProduce = Math.max(0, need.qtyToProduce - unitsToCut);
                    }
                });
            }

            const viable = new Map<string, number>();
            const finalRequiredHours: Record<string, number> = {};
            currentNeeds.forEach(need => {
                const finalQty = Math.floor(need.qtyToProduce);
                viable.set(need.productId, finalQty);
                Object.entries(need.workstationHoursPerUnit).forEach(([wsId, hoursPerUnit]) => {
                    if (!finalRequiredHours[wsId]) finalRequiredHours[wsId] = 0;
                    finalRequiredHours[wsId] += finalQty * hoursPerUnit;
                });
            });

            return { viable, hours: finalRequiredHours };
        };
        
        const workstationsC2000 = constraints.workstationDefinitions.filter(wd => 
            constraints.productionLines.some(line => line.workCenterId === '2000' && line.assignedWorkstations.some(as => as.definitionId === wd.id))
        );
        const capacityByWorkstation: Record<string, number> = {};
        workstationsC2000.forEach(ws => {
            capacityByWorkstation[ws.id] = getMonthlyCapacityForWorkstation(ws.id, year, month, constraints);
        });

        // Stage 1: Plan 'E' materials
        const needsE = Array.from(materials.values()).filter(m => m.provisionClass === 'E' && m.totalNeed > 0);
        const { viable: viableE, hours: hoursE } = calculateViable(needsE, capacityByWorkstation, tiemposData, constraints);
        
        // Stage 2: Plan 'X' materials with remaining capacity
        const remainingCapacity = { ...capacityByWorkstation };
        Object.keys(hoursE).forEach(wsId => {
            remainingCapacity[wsId] = Math.max(0, remainingCapacity[wsId] - hoursE[wsId]);
        });
        const needsX = Array.from(materials.values()).filter(m => m.provisionClass === 'X' && m.totalNeed > 0);
        const { viable: viableX, hours: hoursX } = calculateViable(needsX, remainingCapacity, tiemposData, constraints);
        
        const requiredHours: Record<string, number> = {};
        Object.keys(hoursE).forEach(k => requiredHours[k] = (requiredHours[k] || 0) + hoursE[k]);
        Object.keys(hoursX).forEach(k => requiredHours[k] = (requiredHours[k] || 0) + hoursX[k]);

        materials.forEach(row => {
            if (row.provisionClass === 'E') {
                row.viableProductionC2000 = viableE.get(row.productId) || 0;
            } else if (row.provisionClass === 'X') {
                row.viableProductionC2000 = viableX.get(row.productId) || 0;
            }

            // A material might not be producible in C2000 even if it's E or X
            const { isProducible } = getBestLineForProduct(row.productId, '2000', tiemposData, constraints);
            if (!isProducible && (row.provisionClass === 'E' || row.provisionClass === 'X')) {
                row.viableProductionC2000 = 0;
                row.provisionClass = 'F'; // Treat as 'F' if not producible locally
            }

            if (row.provisionClass === 'E' || row.provisionClass === 'X') {
                row.capacityDeficitC2000 = Math.max(0, row.totalNeed - row.viableProductionC2000);
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
                        <tr>
                            <th className="p-1"><FilterInput column="productId" value={(filters.productId as string | undefined) || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"><FilterInput column="productName" value={(filters.productName as string | undefined) || ''} onChange={handleFilterChange} /></th>
                            <th className="p-1"></th>
                            <th className="p-1"></th>
                            <th className="p-1"></th>
                            <th className="p-1"></th>
                            <th className="p-1 w-32"><MultiSelectFilter placeholder="Clase" options={filterOptions.provisionClass || []} selected={(filters.provisionClass as string[] | undefined) || []} onChange={(value) => handleMultiSelectFilterChange('provisionClass', value)} /></th>
                            <th className="p-1"></th>
                            <th className="p-1"></th>
                            <th className="p-1"></th>
                            <th className="p-1"></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredData.map(row => (
                            <tr key={row.productId}>
                                <td className="px-2 py-2 font-mono">{row.productId}</td>
                                <td className="px-2 py-2">{row.productName}</td>
                                <td className="px-2 py-2 text-right font-mono">{Math.round(row.salesNeed).toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono">{Math.round(row.safetyStock).toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono">{Math.round(row.initialStock).toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-blue-800 bg-blue-50">{Math.round(row.totalNeed).toLocaleString()}</td>
                                <td className="px-2 py-2 text-center font-bold">{row.provisionClass}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-green-800 bg-green-50">{Math.round(row.viableProductionC2000).toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-red-800 bg-red-50">{Math.round(row.capacityDeficitC2000).toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-orange-800 bg-orange-50">{Math.round(row.transferNeedF).toLocaleString()}</td>
                                <td className="px-2 py-2 text-right font-mono font-bold text-purple-800 bg-purple-50">{Math.round(row.totalTransferNeed).toLocaleString()}</td>
                            </tr>
                        ))}
                         {results.length > 0 && filteredData.length === 0 && (
                            <tr>
                                <td colSpan={11} className="text-center py-8 text-gray-500">
                                    No hay resultados que coincidan con los filtros aplicados.
                                </td>
                            </tr>
                         )}
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
                    <tfoot className="bg-gray-800 text-white sticky bottom-0 z-10">
                        <tr>
                            <th colSpan={2} className="px-2 py-2 text-right font-bold uppercase">TOTALES FILTRADOS:</th>
                            <td className="px-2 py-2 text-right font-mono font-bold">{Math.round(footerTotals.salesNeed).toLocaleString()}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{Math.round(footerTotals.safetyStock).toLocaleString()}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{Math.round(footerTotals.initialStock).toLocaleString()}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{Math.round(footerTotals.totalNeed).toLocaleString()}</td>
                            <td></td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{Math.round(footerTotals.viableProductionC2000).toLocaleString()}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{Math.round(footerTotals.capacityDeficitC2000).toLocaleString()}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{Math.round(footerTotals.transferNeedF).toLocaleString()}</td>
                            <td className="px-2 py-2 text-right font-mono font-bold">{Math.round(footerTotals.totalTransferNeed).toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
    );
};
