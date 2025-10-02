
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

type GroupByOption = 'sector' | 'etiqueta' | 'material';

interface AggregatedData {
  [key: string]: {
    totalUnits: number;
    unitsByCenter: { [centerName: string]: number };
    dataRows: SalesDataRow[];
  };
}

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
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
                    handleSelect(currentValue);
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
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transferAnalysisData, setTransferAnalysisData] = useState<{ code: string; units: number }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
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
        
        // Define loops for iteration
        const monthsToLoad = filters.meses.length > 0 ? filters.meses.map(Number) : Array.from({length: 12}, (_, i) => i + 1);
        const centrosToLoad = filters.centros.length > 0 ? filters.centros : filterOptions.centros.map(c => c.value);

        // Array to hold all promises
        const apiCallPromises: Promise<PresupuestoItem[]>[] = [];

        for (const year of yearsToLoad) {
            for (const month of monthsToLoad) {
                // Skip past months of the current year if all months are being loaded
                if (filters.meses.length === 0 && year === currentYear && month < currentMonth) {
                    continue;
                }
                
                for (const centro of centrosToLoad) {
                    const queryFilters: { [key: string]: any } = { 'Año': year, 'Mes': month, 'Centro': centro };
                    if (filters.etiqueta) {
                        queryFilters['Etiqueta'] = filters.etiqueta;
                    }
                    
                    console.log(`Planificando llamada a API para ${MONTH_NAMES[month-1]} ${year} - Centro: ${centro}`);
                    
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
            setLoadedData(allData);
            onDataImported(allData);
            addNotification('success', `Carga completada. Se importaron ${allData.length} registros.`);
        } else {
            addNotification('warning', 'No se encontraron registros con los filtros seleccionados.');
        }

    } catch (error) {
        addNotification('error', `Error durante la carga de datos: ${(error as Error).message}`);
    } finally {
        setIsProcessing(false);
    }
  };

  const handleAnalyzeTransfers = async () => {
    setIsAnalyzing(true);
    setTransferAnalysisData([]);
    addNotification('info', 'Analizando datos para traslados...');

    if (filters.años.length === 0) {
        addNotification('warning', 'Por favor, seleccione al menos un año para el análisis.');
        setIsAnalyzing(false);
        return;
    }

    try {
        const salesApiFilters: { [key: string]: any } = { 'Centro': '2000' };

        if(filters.años.length > 0) {
            salesApiFilters['Año'] = { in: filters.años.map(Number) };
        }
        if(filters.meses.length > 0) {
            salesApiFilters['Mes'] = { in: filters.meses.map(Number) };
        }
        if(filters.etiqueta) {
            salesApiFilters['Etiqueta'] = filters.etiqueta;
        }

        const [assemblyData, salesData] = await Promise.all([
            queryApi({ source: 'TiemposEnsamblado', operation: 'get_data', pagination: { limit: 50000 } }) as Promise<TiempoEnsambleItem[]>,
            queryApi({ source: 'Presupuesto', operation: 'get_data', filters: salesApiFilters, pagination: { limit: 200000 } }) as Promise<PresupuestoItem[]>
        ]);

        const centralizedMaterials = new Set(
            assemblyData
                .filter(item => item.ClaseAprovisionamiento === 'F')
                .map(item => normalizeMaterialCode(item.CodMaterial))
        );

        const salesInCenter2000 = salesData.filter(sale => centralizedMaterials.has(normalizeMaterialCode(sale.CodMaterial)));

        const aggregatedUnits: { [code: string]: number } = {};
        salesInCenter2000.forEach(sale => {
            const code = normalizeMaterialCode(sale.CodMaterial);
            aggregatedUnits[code] = (aggregatedUnits[code] || 0) + sale.UnidadesProyectado;
        });

        const sortedData = Object.entries(aggregatedUnits)
            .map(([code, units]) => ({ code, units }))
            .sort((a, b) => b.units - a.units);

        setTransferAnalysisData(sortedData);
        addNotification('success', `Análisis completado. Se encontraron ${sortedData.length} materiales para mostrar.`);

    } catch (error) {
        addNotification('error', `Error durante el análisis de traslados: ${(error as Error).message}`);
    } finally {
        setIsAnalyzing(false);
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
      data[key].totalUnits += row.unidadesProyectado;
      data[key].unitsByCenter[row.centro] = (data[key].unitsByCenter[row.centro] || 0) + row.unidadesProyectado;
      data[key].dataRows.push(row);
      centerSet.add(row.centro);
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

  const transferTotalUnits = useMemo(() => {
    return transferAnalysisData.reduce((sum, item) => sum + item.units, 0);
  }, [transferAnalysisData]);


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
         <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Datos Cargados y Agrupados por Etiqueta</h3>
            <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner">
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
                       {Object.entries(aggregatedData).map(([etiqueta, group]) => (
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
      )}

      {/* --- Sección de Análisis de Traslados --- */}
      <div className="p-4 border rounded-lg bg-gray-50 mt-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-700">Análisis de Traslados (Depuración)</h3>
        <p className="text-sm text-gray-600">
            Esta herramienta muestra todos los materiales vendidos en el centro 2000 que, por regla de negocio ('F'), deberían fabricarse en el centro 1000 y generar un traslado. El análisis respeta los filtros de fecha.
        </p>
        <div>
            <Button onClick={handleAnalyzeTransfers} disabled={isAnalyzing}>
            {isAnalyzing ? 'Analizando...' : 'Analizar Traslados Centro 2000'}
            </Button>
        </div>
        {transferAnalysisData.length > 0 && (
            <div>
                <h4 className="font-semibold mb-2">Materiales a Trasladar (Ventas en Centro 2000 / Fabricación en Centro 1000)</h4>
                <div className="border rounded-md max-h-[60vh] overflow-y-auto">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">Código Material</th>
                                <th className="px-4 py-2 text-right font-semibold text-gray-600">Unidades Totales a Trasladar</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {transferAnalysisData.map(item => (
                                <tr key={item.code}>
                                    <td className="px-4 py-2 font-mono">{item.code}</td>
                                    <td className="px-4 py-2 text-right font-bold">{item.units.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-200 sticky bottom-0">
                           <tr>
                                <th className="px-4 py-2 text-left font-bold text-gray-700 uppercase">TOTAL</th>
                                <th className="px-4 py-2 text-right font-bold text-indigo-700 uppercase">
                                    {transferTotalUnits.toLocaleString()}
                                </th>
                           </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        )}
      </div>

    </div>
  );

    