

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { SalesDataRow, NotificationMessage, PresupuestoItem } from '@/types/types';
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

interface SectorRow {
    sector: string;
    stockByCenter: { [center: string]: number };
    totalStock: number;
}

interface DisplayRow {
    type: 'data' | 'subtotal' | 'total';
    sector: string;
    stockByCenter: { [center: string]: number };
    totalStock: number;
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


const MonthlyReportTable: React.FC<{
  monthData: SalesDataRow[],
  title: string
}> = ({ monthData, title }) => {

  const { displayRows, centers, footerTotals } = useMemo(() => {
    if (monthData.length === 0) return { displayRows: [], centers: [], footerTotals: { grandTotal: 0 } };

    const dataBySectorAndCenter: { [sector: string]: { [center: string]: number } } = {};
    const centerSet = new Set<string>();

    monthData.forEach(row => {
        const sector = row.sector || 'Sin Sector';
        const center = String(row.centro).trim();
        centerSet.add(center);

        if (!dataBySectorAndCenter[sector]) {
            dataBySectorAndCenter[sector] = {};
        }
        if (!dataBySectorAndCenter[sector][center]) {
            dataBySectorAndCenter[sector][center] = 0;
        }
        dataBySectorAndCenter[sector][center] += row.unidadesProyectado;
    });
    
    const sortedCenters = Array.from(centerSet).sort();

    const priorityOrder = ['01 COLCHONES', '02 BASES-CABECERO-CAMA', '03 MUEBLES FABRICACIÓN'];
    const prioritySectors: DisplayRow[] = [];
    const otherSectors: DisplayRow[] = [];

    Object.entries(dataBySectorAndCenter).forEach(([sector, stockByCenter]) => {
        const totalStock = Object.values(stockByCenter).reduce((sum, val) => sum + val, 0);
        const displayRow: DisplayRow = { type: 'data', sector, stockByCenter, totalStock };
        
        if (priorityOrder.includes(sector)) {
            prioritySectors.push(displayRow);
        } else {
            otherSectors.push(displayRow);
        }
    });

    prioritySectors.sort((a, b) => priorityOrder.indexOf(a.sector) - priorityOrder.indexOf(b.sector));
    otherSectors.sort((a, b) => a.sector.localeCompare(b.sector));
    
    const allDisplayRows: DisplayRow[] = [];
    const footerTotals: { [key: string]: number; grandTotal: number; } = { grandTotal: 0 };
    
    if (prioritySectors.length > 0) {
        allDisplayRows.push(...prioritySectors);
        const subtotalFabricacion: DisplayRow = {
            type: 'subtotal', sector: 'Subtotal Fabricación', stockByCenter: {}, totalStock: 0
        };
        prioritySectors.forEach(pSector => {
            subtotalFabricacion.totalStock += pSector.totalStock;
            Object.entries(pSector.stockByCenter).forEach(([center, stock]) => {
                subtotalFabricacion.stockByCenter[center] = (subtotalFabricacion.stockByCenter[center] || 0) + stock;
            });
        });
        allDisplayRows.push(subtotalFabricacion);
    }
    
    if (otherSectors.length > 0) {
        allDisplayRows.push(...otherSectors);
    }

    allDisplayRows.forEach(row => {
        if (row.type === 'data') {
            footerTotals.grandTotal += row.totalStock;
            sortedCenters.forEach(center => {
                footerTotals[center] = (footerTotals[center] || 0) + (row.stockByCenter[center] || 0);
            });
        }
    });

    return { displayRows: allDisplayRows, centers: sortedCenters, footerTotals };
  }, [monthData]);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner">
        <table className="min-w-full text-xs divide-y divide-gray-200">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider bg-gray-100 sticky left-0 z-20">Sector</th>
              {centers.map(center => (
                <th key={center} className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">{center}</th>
              ))}
              <th className="px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider bg-gray-100 sticky right-0 z-20">Total Unidades</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {displayRows.map((row) => (
              <tr key={row.sector} className={`group ${row.type === 'subtotal' ? 'bg-blue-50 font-bold' : 'hover:bg-gray-50'}`}>
                <td className={`px-3 py-2 whitespace-nowrap sticky left-0 group-hover:bg-gray-50 z-10 ${row.type === 'subtotal' ? 'bg-blue-50' : 'bg-white'}`}>{row.sector}</td>
                {centers.map(center => (
                  <td key={`${row.sector}-${center}`} className="px-3 py-2 text-right text-gray-600">{Math.round(row.stockByCenter[center] || 0).toLocaleString()}</td>
                ))}
                <td className={`px-3 py-2 text-right font-bold text-gray-900 sticky right-0 group-hover:bg-gray-50 z-10 ${row.type === 'subtotal' ? 'bg-blue-50' : 'bg-white'}`}>
                  {Math.round(row.totalStock).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-200 sticky bottom-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-bold text-gray-700 uppercase tracking-wider sticky left-0 bg-gray-200 z-20">TOTAL GENERAL</th>
              {centers.map(center => (
                <th key={`total-${center}`} className="px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider">
                  {Math.round(footerTotals[center] || 0).toLocaleString()}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-bold text-indigo-700 uppercase tracking-wider sticky right-0 bg-gray-200 z-20">
                {Math.round(footerTotals.grandTotal).toLocaleString()}
              </th>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}


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
        
        const monthsToLoad = filters.meses.length > 0 ? filters.meses.map(Number) : Array.from({length: 12}, (_, i) => i + 1);
        const centrosToLoad = filters.centros.length > 0 ? filters.centros : filterOptions.centros.map(c => c.value);

        const apiCallPromises: Promise<PresupuestoItem[]>[] = [];

        for (const year of yearsToLoad) {
            for (const month of monthsToLoad) {
                
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
                    unidadesProyectado: parseFloat(String(item.UnidadesProyectado)) || 0,
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

  const dataByMonth = useMemo(() => {
    const grouped: Record<string, SalesDataRow[]> = {};
    loadedData.forEach(row => {
      const key = `${row.año}-${String(row.mes).padStart(2, '0')}`;
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(row);
    });
    return Object.entries(grouped).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4 items-start p-4 border rounded-lg bg-gray-50">
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
        
        <div className="flex flex-col justify-end h-full">
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
         <div className="space-y-8 mt-6">
           {dataByMonth.map(([monthKey, monthData]) => {
             const [year, monthNum] = monthKey.split('-');
             const title = `Ventas Consolidadas para ${MONTH_NAMES[parseInt(monthNum, 10) - 1]} ${year}`;
             return (
               <MonthlyReportTable key={monthKey} monthData={monthData} title={title} />
             );
           })}
        </div>
      )}
    </div>
  );
};
