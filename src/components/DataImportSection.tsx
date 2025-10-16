

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { SalesDataRow, NotificationMessage, PresupuestoItem, TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DataImportIcon, MAX_FILE_SIZE_MB, MONTH_NAMES } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';


interface DataImportSectionProps {
  onDataImported: (data: SalesDataRow[]) => void;
}

interface AggregatedData {
  [key: string]: {
    totalUnits: number;
    unitsByCenter: { [centerName: string]: number };
    dataRows: SalesDataRow[];
  };
}

interface TransferData {
  productId: string;
  productName: string;
  demandCenter: string;
  month: number;
  year: number;
  quantity: number;
}


const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

const padMaterialCode = (code: string | number): string => {
    return String(code).padStart(18, '0');
}


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
        <PopoverContent className="w-full p-0">
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
      <div className="pt-1">
        {selected.map(value => {
            const label = options.find(opt => opt.value === value)?.label;
            return (
                <Badge key={value} variant="secondary" className="mr-1 mb-1">
                {label}
                </Badge>
            );
        })}
      </div>
    </div>
  );
};


export const DataImportSection: React.FC<DataImportSectionProps> = ({ onDataImported }) => {
  const { addNotification, isLoading: isAppLoading } = useAppContext();
  
  const [filterOptions, setFilterOptions] = useState({
      años: [] as {value: string, label: string}[],
      centros: [] as {value: string, label: string}[],
      etiquetas: [] as {value: string, label: string}[],
  });

  const [filters, setFilters] = useState<{
      años: string[];
      meses: string[];
      centros: string[];
      etiqueta: string;
  }>({
      años: [new Date().getFullYear().toString()],
      meses: [],
      centros: [],
      etiqueta: '',
  });

  const [loadedData, setLoadedData] = useState<SalesDataRow[]>([]);
  const [transferData, setTransferData] = useState<TransferData[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  
  const handleFilterChange = (name: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [añosData, centrosData, etiquetasData] = await Promise.all([
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Año' }),
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Centro' }),
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Etiqueta' })
        ]);

        const newFilterOptions = {
          años: añosData.map((item: any) => ({ value: String(item['Año']), label: String(item['Año']) })).sort((a:any,b:any) => b.value - a.value),
          centros: centrosData.map((item: any) => ({ value: item['Centro'], label: item['Centro'] })),
          etiquetas: etiquetasData.map((item: any) => ({ value: item['Etiqueta'], label: item['Etiqueta'] })),
        };
        setFilterOptions(newFilterOptions);
      } catch (error) {
        addNotification('error', 'No se pudieron cargar las opciones para los filtros desde la API.');
      }
    };
    loadFilterOptions();
  }, [addNotification]);
  
  const handleLoadData = async () => {
    setIsProcessing(true);
    setLoadedData([]);
    setTransferData([]);
    
    if (filters.años.length === 0) {
        addNotification('warning', 'Por favor, seleccione al menos un año.');
        setIsProcessing(false);
        return;
    }

    try {
        // --- 1. Fetch Sales Data ---
        addNotification('info', `Iniciando carga de presupuesto... Años: ${filters.años.join(', ')}.`);
        const salesItems: PresupuestoItem[] = await queryApi({
            source: 'Presupuesto',
            operation: 'get_data',
            filters: {
                'Año': filters.años.map(Number),
                ...(filters.meses.length > 0 && { 'Mes': filters.meses.map(Number) }),
                ...(filters.centros.length > 0 && { 'Centro': filters.centros }),
                ...(filters.etiqueta && { 'Etiqueta': filters.etiqueta }),
            },
            pagination: { limit: 200000 }
        });

        if (!salesItems || salesItems.length === 0) {
            addNotification('warning', 'No se encontraron registros de presupuesto con los filtros seleccionados.');
            setIsProcessing(false);
            return;
        }
        addNotification('info', `Se encontraron ${salesItems.length} registros de presupuesto. Obteniendo reglas de aprovisionamiento...`);

        // --- 2. Fetch Provisioning Rules from CuboInventarios ---
        const uniqueMaterialCodes = [...new Set(salesItems.map(item => item.CodMaterial))];
        const paddedMaterialCodes = uniqueMaterialCodes.map(padMaterialCode);

        const inventoryCubeData: TiempoEnsambleItem[] = await queryApi({
            source: 'CuboInventarios',
            operation: 'get_data',
            filters: { 'Material': paddedMaterialCodes },
            pagination: { limit: 200000 }
        });
        
        const provisioningRules = new Map<string, 'E' | 'X' | 'F'>();
        inventoryCubeData.forEach(item => {
            const key = `${normalizeMaterialCode(item.CodMaterial)}---${String(item.Centro).trim()}`;
            if(item.ClaseAprovisionamiento) {
                provisioningRules.set(key, item.ClaseAprovisionamiento);
            }
        });
        addNotification('info', `Se obtuvieron ${provisioningRules.size} reglas de aprovisionamiento. Procesando datos...`);
        
        // --- 3. Process Data and Calculate Transfers ---
        const finalSalesData: SalesDataRow[] = [];
        const calculatedTransfers: TransferData[] = [];

        for (const item of salesItems) {
            const normalizedCode = normalizeMaterialCode(item.CodMaterial);
            const demandCenter = String(item.Centro).trim();
            const ruleKey = `${normalizedCode}---${demandCenter}`;
            const provisionRule = provisioningRules.get(ruleKey) || 'E';

            let producingCenter = demandCenter;
            if (provisionRule === 'F') {
                producingCenter = '1000'; // Centralized manufacturing
                if (demandCenter !== '1000') {
                    calculatedTransfers.push({
                        productId: normalizedCode,
                        productName: item.Material,
                        demandCenter: demandCenter,
                        month: item.Mes,
                        year: item.Año,
                        quantity: item.UnidadesProyectado,
                    });
                }
            }

            finalSalesData.push({
                id: `row-${item.Año}-${item.Mes}-${item.Centro}-${normalizedCode}`,
                año: item.Año,
                mes: item.Mes,
                sector: item.Sector || 'Sin Sector',
                etiqueta: item.Etiqueta || 'Sin Etiqueta',
                código: normalizedCode,
                centro: producingCenter, // CRÍTICO: La demanda se asigna al centro de producción
                unidadesProyectado: item.UnidadesProyectado,
                dolaresProyectado: 0,
                descripciónMaterial: item.Material,
                familia: item.Familia,
                marca: item.Marca,
                lineaProduccion: item.LineaProduccion || '',
            });
        }
        
        setLoadedData(finalSalesData);
        setTransferData(calculatedTransfers);
        onDataImported(finalSalesData);
        addNotification('success', `Carga completada. Se procesaron ${finalSalesData.length} registros. Se calcularon ${calculatedTransfers.length} transferencias.`);

    } catch (error) {
        addNotification('error', `Error durante la carga de datos: ${(error as Error).message}`);
    } finally {
        setIsProcessing(false);
    }
  };

  const { aggregatedData, centers } = useMemo(() => {
    const data: AggregatedData = {};
    const centerSet = new Set<string>();

    loadedData.forEach(row => {
      const key = row.etiqueta;
      if (!data[key]) {
        data[key] = { totalUnits: 0, unitsByCenter: {}, dataRows: [] };
      }
      // CRÍTICO: Usar `row.centro` que ya fue modificado por la regla de aprovisionamiento
      const producingCenter = row.centro;
      data[key].totalUnits += row.unidadesProyectado;
      data[key].unitsByCenter[producingCenter] = (data[key].unitsByCenter[producingCenter] || 0) + row.unidadesProyectado;
      data[key].dataRows.push(row);
      centerSet.add(producingCenter);
    });

    return { aggregatedData: data, centers: Array.from(centerSet).sort() };
  }, [loadedData]);

  const footerTotals = useMemo(() => {
    const totals: { [centerName: string]: number } = {};
    let grandTotal = 0;
    Object.values(aggregatedData).forEach(group => {
      Object.entries(group.unitsByCenter).forEach(([center, units]) => {
        totals[center] = (totals[center] || 0) + units;
      });
      grandTotal += group.totalUnits;
    });
    return { ...totals, grandTotal };
  }, [aggregatedData]);

  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto y Calcular Traslados</h2>
      </div>
      
      <p className="text-gray-600">
        Use los filtros para definir el alcance de los datos. El sistema aplicará automáticamente las reglas de aprovisionamiento y calculará las transferencias necesarias.
      </p>

      {/* --- Filtros --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start p-4 border rounded-lg bg-gray-50">
        <MultiSelect 
            label="Año(s)"
            options={filterOptions.años}
            selected={filters.años}
            onChange={value => handleFilterChange('años', value)}
        />
        <MultiSelect 
            label="Mes(es)"
            options={MONTH_NAMES.map((m, i) => ({ value: String(i + 1), label: m }))}
            selected={filters.meses}
            onChange={value => handleFilterChange('meses', value)}
        />
        <MultiSelect 
            label="Centro(s) de Demanda"
            options={filterOptions.centros}
            selected={filters.centros}
            onChange={value => handleFilterChange('centros', value)}
        />
        <div>
             <label htmlFor="etiqueta" className="block text-sm font-medium text-gray-700 mb-1">Etiqueta</label>
             <select id="etiqueta" value={filters.etiqueta} onChange={e => handleFilterChange('etiqueta', e.target.value)} className="w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm h-10">
                <option value="">Todas</option>
                {filterOptions.etiquetas.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>
        
        <div className="flex flex-col pt-5">
            <button
                onClick={handleLoadData}
                disabled={isProcessing || isAppLoading || filters.años.length === 0}
                className="w-full h-10 px-4 py-2 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                {isProcessing ? 'Cargando...' : 'Cargar y Procesar'}
            </button>
        </div>
      </div>

       {loadedData.length > 0 && (
         <div className="space-y-8">
            <div>
                <h3 className="text-lg font-semibold text-gray-800">Demanda de Producción (Post-Aprovisionamiento)</h3>
                <p className="text-sm text-gray-500">Muestra la demanda asignada al centro de producción real (ej. productos 'F' se suman al centro 1000).</p>
                <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner mt-2">
                    <table className="min-w-full text-xs divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider bg-gray-100">Etiqueta</th>
                                {centers.map(center => (
                                    <th key={center} className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider bg-gray-100">{center}</th>
                                ))}
                                <th className="px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider bg-gray-100">Total Unidades</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                           {Object.entries(aggregatedData).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)).map(([etiqueta, group]) => (
                                <tr key={etiqueta}>
                                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{etiqueta}</td>
                                    {centers.map(center => (
                                        <td key={`${etiqueta}-${center}`} className="px-3 py-2 text-right text-gray-600">{group.unitsByCenter[center]?.toLocaleString() || 0}</td>
                                    ))}
                                    <td className="px-3 py-2 text-right font-bold text-gray-900">{group.totalUnits.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-200 sticky bottom-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-bold text-gray-700 uppercase tracking-wider">TOTAL</th>
                                 {centers.map(center => (
                                    <th key={`total-${center}`} className="px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider">
                                        {(footerTotals[center] || 0).toLocaleString()}
                                    </th>
                                ))}
                                 <th className="px-3 py-2 text-right font-bold text-indigo-700 uppercase tracking-wider">
                                    {footerTotals.grandTotal.toLocaleString()}
                                </th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>

            {transferData.length > 0 && (
            <div>
                <h3 className="text-lg font-semibold text-gray-800">Reporte de Transferencias Logísticas Requeridas</h3>
                 <p className="text-sm text-gray-500">Productos que deben fabricarse en el centro 1000 para ser enviados a otros centros de demanda.</p>
                <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner mt-2">
                    <table className="min-w-full text-xs divide-y divide-gray-200">
                        <thead className="bg-blue-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-blue-800 uppercase tracking-wider">Producto</th>
                                <th className="px-3 py-2 text-left font-semibold text-blue-800 uppercase tracking-wider">Cód. Material</th>
                                <th className="px-3 py-2 text-left font-semibold text-blue-800 uppercase tracking-wider">Mes Demanda</th>
                                <th className="px-3 py-2 text-right font-semibold text-blue-800 uppercase tracking-wider">Destino (Centro)</th>
                                <th className="px-3 py-2 text-right font-semibold text-blue-800 uppercase tracking-wider">Cantidad a Trasladar</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                           {transferData.sort((a,b) => a.demandCenter.localeCompare(b.demandCenter) || a.productName.localeCompare(b.productName)).map((transfer, index) => (
                                <tr key={index}>
                                    <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{transfer.productName}</td>
                                    <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-600">{transfer.productId}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{`${MONTH_NAMES[transfer.month-1]} ${transfer.year}`}</td>
                                    <td className="px-3 py-2 text-right font-medium text-gray-800">{transfer.demandCenter}</td>
                                    <td className="px-3 py-2 text-right font-bold text-indigo-700">{transfer.quantity.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            )}
        </div>
      )}
    </div>
  );
};
