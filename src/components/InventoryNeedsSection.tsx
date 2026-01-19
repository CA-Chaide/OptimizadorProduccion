'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useAppContext } from '@/context/AppProvider';
import { Sheet } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { MONTH_NAMES } from '@/constants/constants';
import { Input } from '@/components/ui/input';

// Data structure for the table
interface InventoryNeedRow {
    centro: string;
    codigoMaterial: string;
    claseAprovisionamiento: string;
    lineaProduccion: string;
    stockDisponible: number;
    stockSeguridad: number;
    necesidadStock: number;
    tiempoUnitario: number;
    tiempoTotalRequerido: number;
}

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code).trim();
    return codeStr.slice(-8);
};

// Re-usable MultiSelect component
const MultiSelect: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
}> = ({ label, options, selected, onChange, className }) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-10"
          >
            <span className="truncate">
              {selected.length === 0
                ? `Seleccionar ${label}...`
                : selected.length === 1
                ? options.find(opt => opt.value === selected[0])?.label
                : `${selected.length} seleccionados`}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder={`Buscar ${label}...`} />
            <CommandEmpty>No hay resultados.</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    handleSelect(option.value);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected.includes(option.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export const InventoryNeedsSection: React.FC = () => {
    const { constraints, apiCuboInventariosData } = useAppContext();
    const [isLoading, setIsLoading] = useState(true);
    const [rows, setRows] = useState<InventoryNeedRow[]>([]);
    
    // Filter states
    const [filters, setFilters] = useState({
        centro: [] as string[],
        codigoMaterial: '',
        claseAprovisionamiento: [] as string[],
        lineaProduccion: [] as string[],
    });

    const [filterOptions, setFilterOptions] = useState<{
        centro: {value: string, label: string}[],
        claseAprovisionamiento: {value: string, label: string}[],
        lineaProduccion: {value: string, label: string}[],
    }>({
        centro: [],
        claseAprovisionamiento: [],
        lineaProduccion: [],
    });

    // Data processing effect
    useEffect(() => {
        setIsLoading(true);
        if (apiCuboInventariosData.length > 0 && constraints.productProcessInfos.length > 0) {

            const processedRows: InventoryNeedRow[] = apiCuboInventariosData
                .map(item => {
                    const stockDisponible = Number(item.StockActual) || 0;
                    const stockSeguridad = Number(item.StockSeguridad) || 0;
                    const necesidadStock = Math.max(0, stockSeguridad - stockDisponible);

                    if (necesidadStock > 0 && item.Material && item.Centro) {
                        const codigoMaterialNormalized = normalizeMaterialCode(item.Material);
                        const centroDeNecesidad = String(item.Centro).trim();
                        const claseAprov = item.ClaseAprovisionam || 'E'; // Default to 'E' if not specified

                        // Determine the production center based on business rules
                        const centroDeProduccion = claseAprov === 'F' ? '1000' : centroDeNecesidad;
                        
                        // Find the process info for this product in the correct PRODUCTION center
                        const ppi = constraints.productProcessInfos.find(p => {
                            if (normalizeMaterialCode(p.productId) !== codigoMaterialNormalized) {
                                return false;
                            }
                            const lineForPpi = constraints.productionLines.find(l => l.id === p.productionLineId);
                            return lineForPpi?.workCenterId === centroDeProduccion;
                        });

                        const linea = ppi ? constraints.productionLines.find(l => l.id === ppi.productionLineId) : undefined;
                        const tiempoUnitario = (ppi?.totalManufacturingTimeHours || 0) * 60; // Convert to minutes

                        return {
                            centro: centroDeNecesidad, // The center with the need
                            codigoMaterial: String(item.Material),
                            claseAprovisionamiento: item.ClaseAprovisionam || 'N/A',
                            lineaProduccion: linea?.name || 'N/A',
                            stockDisponible,
                            stockSeguridad,
                            necesidadStock,
                            tiempoUnitario,
                            tiempoTotalRequerido: necesidadStock * tiempoUnitario,
                        };
                    }
                    return null;
                })
                .filter((row): row is InventoryNeedRow => row !== null);

            setRows(processedRows);

            setFilterOptions({
                centro: [...new Set(processedRows.map(r => r.centro))].sort().map(c => ({ value: c, label: c })),
                claseAprovisionamiento: [...new Set(processedRows.map(r => r.claseAprovisionamiento))].sort().map(c => ({ value: c, label: c })),
                lineaProduccion: [...new Set(processedRows.map(r => r.lineaProduccion))].filter(l => l !== 'N/A').sort().map(l => ({ value: l, label: l })),
            });
        }
        setIsLoading(false);
    }, [apiCuboInventariosData, constraints]);

    const handleFilterChange = (name: keyof typeof filters, value: string[] | string) => {
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const filteredRows = useMemo(() => {
        return rows.filter(row => {
            const centroMatch = filters.centro.length === 0 || filters.centro.includes(row.centro);
            const claseMatch = filters.claseAprovisionamiento.length === 0 || filters.claseAprovisionamiento.includes(row.claseAprovisionamiento);
            const lineaMatch = filters.lineaProduccion.length === 0 || filters.lineaProduccion.includes(row.lineaProduccion);
            const materialMatch = filters.codigoMaterial === '' || row.codigoMaterial.toLowerCase().includes(filters.codigoMaterial.toLowerCase());
            return centroMatch && claseMatch && lineaMatch && materialMatch;
        });
    }, [rows, filters]);
    
    const totals = useMemo(() => {
        return filteredRows.reduce((acc, row) => {
            acc.stockDisponible += row.stockDisponible;
            acc.stockSeguridad += row.stockSeguridad;
            acc.necesidadStock += row.necesidadStock;
            acc.tiempoTotalRequerido += row.tiempoTotalRequerido;
            return acc;
        }, { stockDisponible: 0, stockSeguridad: 0, necesidadStock: 0, tiempoTotalRequerido: 0 });
    }, [filteredRows]);

    if (isLoading) {
        return (
            <div className="p-6 md:p-8 flex justify-center items-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                <span className="ml-2 text-gray-600">Cargando datos de inventario...</span>
            </div>
        );
    }
    
    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center space-x-3">
                <Sheet />
                <h2 className="text-2xl font-semibold text-gray-700">Necesidades para Nivel de Inventario de Seguridad</h2>
            </div>
            
            <p className="text-gray-600 text-sm">
                Este reporte muestra los materiales cuyo stock disponible es inferior al stock de seguridad definido, generando una necesidad de producción para cubrir la diferencia.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 border rounded-lg bg-gray-50 items-start">
                <MultiSelect label="Centro" options={filterOptions.centro} selected={filters.centro} onChange={v => handleFilterChange('centro', v)} />
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Código Material</label>
                    <Input placeholder="Filtrar por código..." value={filters.codigoMaterial} onChange={e => handleFilterChange('codigoMaterial', e.target.value)} />
                </div>
                <MultiSelect label="Clase Aprov." options={filterOptions.claseAprovisionamiento} selected={filters.claseAprovisionamiento} onChange={v => handleFilterChange('claseAprovisionamiento', v)} />
                <MultiSelect label="Línea Prod." options={filterOptions.lineaProduccion} selected={filters.lineaProduccion} onChange={v => handleFilterChange('lineaProduccion', v)} />
            </div>

            <div className="border rounded-lg overflow-auto max-h-[60vh]">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Código Material</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase Aprov.</th>
                            <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Línea Prod.</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Disp. (A)</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Stock Seg. (B)</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Necesidad (C=B-A)</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">T. Unitario (D)</th>
                            <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">T. Total Req. (CXD)</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredRows.map((row, index) => (
                            <tr key={index}>
                                <td className="px-2 py-2 whitespace-nowrap">{row.centro}</td>
                                <td className="px-2 py-2 whitespace-nowrap font-mono">{row.codigoMaterial}</td>
                                <td className="px-2 py-2 whitespace-nowrap">{row.claseAprovisionamiento}</td>
                                <td className="px-2 py-2 whitespace-nowrap">{row.lineaProduccion}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{row.stockDisponible.toLocaleString()}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{row.stockSeguridad.toLocaleString()}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-right font-mono text-red-600 font-bold">{row.necesidadStock.toLocaleString()}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-right font-mono">{row.tiempoUnitario.toFixed(2)}</td>
                                <td className="px-2 py-2 whitespace-nowrap text-right font-mono text-blue-600 font-bold">{Math.round(row.tiempoTotalRequerido).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-200 sticky bottom-0 z-10 font-bold">
                        <tr>
                            <td colSpan={4} className="px-2 py-2 text-right">TOTALES</td>
                            <td className="px-2 py-2 text-right">{totals.stockDisponible.toLocaleString()}</td>
                            <td className="px-2 py-2 text-right">{totals.stockSeguridad.toLocaleString()}</td>
                            <td className="px-2 py-2 text-right text-red-600">{totals.necesidadStock.toLocaleString()}</td>
                            <td className="px-2 py-2"></td>
                            <td className="px-2 py-2 text-right text-blue-600">{Math.round(totals.tiempoTotalRequerido).toLocaleString()}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
             <p className="text-xs text-gray-500 pt-2">Nota: Tiempos de fabricación y totales están expresados en minutos.</p>
        </div>
    );
};
