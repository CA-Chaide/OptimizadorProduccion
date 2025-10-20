

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { SalesDataRow, NotificationMessage, PresupuestoItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DataImportIcon, MAX_FILE_SIZE_MB, MONTH_NAMES } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Check, ChevronsUpDown, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';


interface DataImportSectionProps {
  onDataImported: (data: SalesDataRow[]) => void;
}

interface TransferNeed {
    productId: string;
    productName: string;
    unitsToTransfer: number;
}

interface AggregatedData {
  [key: string]: { // The key is the 'etiqueta'
    totalUnits: number;
    dataRows: SalesDataRow[];
  };
}

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

const normalizeMaterialCodeTo18Digits = (code: string | number): string => {
    // Normaliza a 8 dígitos para quitar basura inicial
    const eightDigitCode = String(code).slice(-8);
    // Expande a 18 dígitos anteponiendo ceros
    return eightDigitCode.padStart(18, '0');
};


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
  const [provisioningRules, setProvisioningRules] = useState<Map<string, 'E' | 'X' | 'F'>>(new Map());
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transferNeeds, setTransferNeeds] = useState<TransferNeed[]>([]);
  
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
    setProvisioningRules(new Map());
    setTransferNeeds([]);
    
    if (filters.años.length === 0) {
        addNotification('warning', 'Por favor, seleccione al menos un año.');
        setIsProcessing(false);
        return;
    }

    let allData: SalesDataRow[] = [];
    const yearsToLoad = filters.años.map(Number);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    try {
        addNotification('info', `Iniciando carga de datos... Años: ${yearsToLoad.join(', ')}.`);
        
        const monthsToLoad = filters.meses.length > 0 ? filters.meses.map(Number) : Array.from({length: 12}, (_, i) => i + 1);
        const centrosToLoad = filters.centros.length > 0 ? filters.centros : filterOptions.centros.map(c => c.value);

        const apiCallPromises: Promise<PresupuestoItem[]>[] = [];

        for (const year of yearsToLoad) {
            for (const month of monthsToLoad) {
                if (filters.meses.length === 0 && year === currentYear && month < currentMonth) {
                    continue;
                }
                
                for (const centro of centrosToLoad) {
                    const queryFilters: { [key: string]: any } = { 'Año': year, 'Mes': month, 'Centro': centro };
                    if (filters.etiqueta) {
                        queryFilters['Etiqueta'] = filters.etiqueta;
                    }
                    
                    const promise = queryApi({
                        source: 'Presupuesto',
                        operation: 'get_data',
                        filters: queryFilters,
                        pagination: { limit: 200000 }
                    });
                    apiCallPromises.push(promise);
                }
            }
        }
        
        addNotification('info', `Realizando ${apiCallPromises.length} consultas a la API. Esto puede tardar...`);

        const responses = await Promise.all(apiCallPromises);

        addNotification('info', 'Consultas a la API completadas. Procesando resultados...');

        responses.forEach(response => {
            if (response && response.length > 0) {
                 const mappedData: SalesDataRow[] = response.map((item, index) => ({
                    id: `row-${item.Año}-${item.Mes}-${item.Centro}-${index}`,
                    año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
                    etiqueta: item.Etiqueta || 'Sin Etiqueta',
                    código: normalizeMaterialCode(item.CodMaterial),
                    centro: String(item.Centro).trim(), 
                    unidadesProyectado: item.UnidadesProyectado,
                    dolaresProyectado: 0,
                    descripciónMaterial: item.Material,
                    familia: item.Familia, marca: item.Marca, 
                    lineaProduccion: item.LineaProduccion || '',
                }));
                allData = [...allData, ...mappedData];
            }
        });


        if (allData.length > 0) {
            console.log('[DataImportSection] Muestra de datos mapeados y guardados en memoria:', allData.slice(0, 5));
            setLoadedData(allData);
            onDataImported(allData);
            addNotification('success', `Carga completada. Se importaron ${allData.length} registros. Obteniendo reglas de aprovisionamiento...`);
            
            const uniqueMaterialCodes = Array.from(new Set(allData.map(sale => sale.código)));
            const paddedMaterialCodes = uniqueMaterialCodes.map(normalizeMaterialCodeTo18Digits);

            const inventoryCubeData: any[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                filters: { 'Material': paddedMaterialCodes },
                pagination: { limit: 500000 }
            });
            
            const rules = new Map<string, 'E' | 'X' | 'F'>();
            inventoryCubeData.forEach(item => {
                if (item.Material && item.Centro && item.ClaseAprovisionam) {
                    const key = `${String(item.Material).trim()}---${String(item.Centro).trim()}`;
                    rules.set(key, item.ClaseAprovisionam);
                }
            });
            setProvisioningRules(rules);
            addNotification('info', `Se obtuvieron ${rules.size} reglas de aprovisionamiento de CuboInventarios. Calculando traslados...`);

            // --- CÁLCULO DE TRASLADOS ---
            const salesRequiringTransfer = allData.filter(sale => {
                const materialCode18 = normalizeMaterialCodeTo18Digits(sale.código);
                const center = String(sale.centro).trim();
                
                if (center === '1000') return false; // Traslados son desde 1000 a OTROS centros

                const ruleKeyForCenter1000 = `${materialCode18}---1000`;
                const rule = rules.get(ruleKeyForCenter1000);
                
                return rule === 'F';
            });

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
            
            const transferResults = Object.values(aggregatedNeeds).sort((a,b) => a.productName.localeCompare(b.productName));
            setTransferNeeds(transferResults);
            addNotification('success', `Cálculo de traslados completado. Se identificaron ${transferResults.length} productos.`);

        } else {
            addNotification('warning', 'No se encontraron registros con los filtros seleccionados.');
        }

    } catch (error) {
        addNotification('error', `Error durante la carga de datos: ${(error as Error).message}`);
    } finally {
        setIsProcessing(false);
    }
  };

  const { aggregatedData } = useMemo(() => {
    const data: AggregatedData = {};

    loadedData.forEach(row => {
      const key = row.etiqueta || 'Sin Etiqueta';
      if (!data[key]) {
        data[key] = { totalUnits: 0, dataRows: [] };
      }
      data[key].totalUnits += row.unidadesProyectado;
      data[key].dataRows.push(row);
    });

    Object.values(data).forEach(group => {
      group.dataRows.sort((a, b) => a.código.localeCompare(b.código));
    });

    return { aggregatedData: data };
  }, [loadedData]);

  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Use los filtros para definir el alcance de los datos. Si no selecciona meses o centros, se cargarán todos para los años seleccionados.
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
            label="Centro(s)"
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
                {isProcessing ? 'Cargando...' : 'Cargar Datos'}
            </button>
        </div>
      </div>

       {loadedData.length > 0 && (
         <div className="space-y-8">
            <div>
                <h3 className="text-lg font-semibold text-gray-800">Datos Cargados Agrupados por Etiqueta</h3>
                <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner mt-2">
                    <table className="min-w-full text-xs divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Etiqueta</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Código</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Unidades</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                           {Object.entries(aggregatedData).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)).map(([etiqueta, group]) => (
                                <React.Fragment key={etiqueta}>
                                    <tr className="bg-gray-50 font-semibold">
                                        <td colSpan={4} className="px-3 py-2 text-sm text-gray-800">{etiqueta}</td>
                                        <td className="px-3 py-2 text-right text-sm text-gray-800">{group.totalUnits.toLocaleString()}</td>
                                    </tr>
                                    {group.dataRows.map((row, index) => (
                                        <tr key={`${etiqueta}-${row.id}-${index}`}>
                                            <td></td>
                                            <td className="px-3 py-1 font-mono text-gray-700">{row.código}</td>
                                            <td className="px-3 py-1 text-gray-700">{row.centro}</td>
                                            <td className="px-3 py-1 text-gray-700">{row.descripciónMaterial}</td>
                                            <td className="px-3 py-1 text-right font-medium text-gray-800">{row.unidadesProyectado.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {transferNeeds.length > 0 && (
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                        <Truck className="w-5 h-5"/>
                        Reporte de Necesidades de Traslado (Aprov. 'F')
                    </h3>
                    <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner mt-2">
                        <table className="min-w-full text-sm divide-y divide-gray-200">
                             <thead className="bg-gray-100 sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Código Material</th>
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción</th>
                                    <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Unidades a Trasladar</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {transferNeeds.map((item) => (
                                    <tr key={item.productId} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 whitespace-nowrap font-mono">{item.productId}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">{item.productName}</td>
                                        <td className="px-4 py-2 whitespace-nowrap font-mono text-right font-bold text-blue-700">{item.unitsToTransfer.toLocaleString()}</td>
                                    </tr>
                                ))
                                }
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
