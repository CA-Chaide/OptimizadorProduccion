

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
    unitsByCenter: { 
        [centerName: string]: {
            E: number; // Aprovisionamiento 'E'
            F: number; // Aprovisionamiento 'F'
            Other: number; // Otros o sin definir
        } 
    };
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
            setLoadedData(allData);
            onDataImported(allData);
            addNotification('success', `Carga completada. Se importaron ${allData.length} registros. Obteniendo reglas de aprovisionamiento...`);
            
            const uniqueMaterialCodes = Array.from(new Set(allData.map(sale => sale.código)));
            const paddedMaterialCodes = uniqueMaterialCodes.map(normalizeMaterialCodeTo18Digits);

            const inventoryCubeData: TiempoEnsambleItem[] = await queryApi({
                source: 'CuboInventarios',
                operation: 'get_data',
                filters: { 'Material': paddedMaterialCodes },
                pagination: { limit: 500000 }
            });
            
            const rules = new Map<string, 'E' | 'X' | 'F'>();
            inventoryCubeData.forEach(item => {
                if (item.ClaseAprovisionam && item.Material && item.Centro) {
                    const key = `${String(item.Material).trim()}---${String(item.Centro).trim()}`;
                    rules.set(key, item.ClaseAprovisionam);
                }
            });
            setProvisioningRules(rules);
            addNotification('info', `Se obtuvieron ${rules.size} reglas de aprovisionamiento de CuboInventarios.`);

        } else {
            addNotification('warning', 'No se encontraron registros con los filtros seleccionados.');
        }

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
        data[key].totalUnits += row.unidadesProyectado;
        
        if(!data[key].unitsByCenter[row.centro]) {
            data[key].unitsByCenter[row.centro] = { E: 0, F: 0, Other: 0 };
        }
        
        const eighteenDigitCode = normalizeMaterialCodeTo18Digits(row.código);
        
        let rule = provisioningRules.get(`${eighteenDigitCode}---${row.centro}`);
        if (!rule && row.centro !== '1000') {
            const centralizedRule = provisioningRules.get(`${eighteenDigitCode}---1000`);
            if (centralizedRule === 'F') {
                rule = 'F';
            }
        }
        
        if (rule === 'E') {
            data[key].unitsByCenter[row.centro].E += row.unidadesProyectado;
        } else if (rule === 'F') {
            data[key].unitsByCenter[row.centro].F += row.unidadesProyectado;
        } else {
            data[key].unitsByCenter[row.centro].Other += row.unidadesProyectado;
        }
        
        data[key].dataRows.push(row);
        centerSet.add(row.centro);
    });

    return { aggregatedData: data, centers: Array.from(centerSet).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})) };
  }, [loadedData, provisioningRules]);


  const footerTotals = useMemo(() => {
      const totals: { [centerName: string]: { E: number; F: number; Other: number; total: number } } = {};
      let grandTotal = 0;

      Object.values(aggregatedData).forEach(group => {
          Object.entries(group.unitsByCenter).forEach(([center, values]) => {
              if (!totals[center]) {
                  totals[center] = { E: 0, F: 0, Other: 0, total: 0 };
              }
              totals[center].E += values.E;
              totals[center].F += values.F;
              totals[center].Other += values.Other;
              totals[center].total += values.E + values.F + values.Other;
          });
          grandTotal += group.totalUnits;
      });

      return { ...totals, grandTotal };
  }, [aggregatedData]);

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
            <h3 className="text-lg font-semibold text-gray-800">Datos Cargados y Agrupados por Etiqueta y Aprovisionamiento</h3>
            <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th rowSpan={2} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider bg-gray-100 align-bottom">Etiqueta</th>
                            {centers.map(center => (
                                <th key={center} colSpan={2} className="px-3 py-2 text-center font-semibold text-gray-600 uppercase tracking-wider border-b border-l">{center}</th>
                            ))}
                            <th rowSpan={2} className="px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider bg-gray-100 align-bottom border-l">Total Unidades</th>
                        </tr>
                        <tr>
                            {centers.map(center => (
                                <React.Fragment key={`${center}-sub`}>
                                    <th className="px-2 py-1 text-right font-medium text-gray-500 uppercase tracking-wider border-l">Aprov. E</th>
                                    <th className="px-2 py-1 text-right font-medium text-gray-500 uppercase tracking-wider">Aprov. F</th>
                                </React.Fragment>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                       {Object.entries(aggregatedData).sort(([keyA], [keyB]) => keyA.localeCompare(keyB)).map(([etiqueta, group]) => (
                            <tr key={etiqueta}>
                                <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{etiqueta}</td>
                                {centers.map(center => (
                                   <React.Fragment key={`${etiqueta}-${center}`}>
                                        <td className="px-2 py-2 text-right text-gray-600 border-l">{(group.unitsByCenter[center]?.E || 0).toLocaleString()}</td>
                                        <td className="px-2 py-2 text-right text-blue-700">{(group.unitsByCenter[center]?.F || 0).toLocaleString()}</td>
                                   </React.Fragment>
                                ))}
                                <td className="px-3 py-2 text-right font-bold text-gray-900 border-l">{group.totalUnits.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-200 sticky bottom-0 z-10">
                        <tr>
                            <th className="px-3 py-2 text-left font-bold text-gray-700 uppercase tracking-wider">TOTAL</th>
                             {centers.map(center => (
                                <React.Fragment key={`total-${center}`}>
                                    <th className="px-2 py-2 text-right font-bold text-gray-700 uppercase tracking-wider border-l">
                                        {(footerTotals[center]?.E || 0).toLocaleString()}
                                    </th>
                                    <th className="px-2 py-2 text-right font-bold text-blue-800 uppercase tracking-wider">
                                        {(footerTotals[center]?.F || 0).toLocaleString()}
                                    </th>
                                </React.Fragment>
                            ))}
                             <th className="px-3 py-2 text-right font-bold text-indigo-700 uppercase tracking-wider border-l">
                                {footerTotals.grandTotal.toLocaleString()}
                            </th>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
      )}
    </div>
  );
};
