
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { SalesDataRow, NotificationMessage, PresupuestoItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { DataImportIcon, MONTH_NAMES } from '@/constants/constants';
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

  const [totalLoadedRecords, setTotalLoadedRecords] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [colchonesBasesMueblesSum, setColchonesBasesMueblesSum] = useState<number | null>(null);
  
  const handleFilterChange = (name: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        // Sequential requests to avoid server overload
        const añosData = await queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Año' });
        const centrosData = await queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Centro' });
        const etiquetasData = await queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Etiqueta' });

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
    setTotalLoadedRecords(0);
    setColchonesBasesMueblesSum(null);
    
    if (filters.años.length === 0) {
        addNotification('warning', 'Por favor, seleccione al menos un año.');
        setIsProcessing(false);
        return;
    }

    let allData: SalesDataRow[] = [];
    let sumForReport = 0;
    const yearsToLoad = filters.años.map(Number);

    try {
        addNotification('info', `Iniciando carga de datos para año(s): ${yearsToLoad.join(', ')}.`);
        
        const monthsToLoad = filters.meses.length > 0 ? filters.meses.map(Number) : Array.from({length: 12}, (_, i) => i + 1);
        
        let queryCount = 0;
        for (const year of yearsToLoad) {
            for (const month of monthsToLoad) {
                queryCount++;
                addNotification('info', `Consultando... (Petición #${queryCount}) Año: ${year}, Mes: ${MONTH_NAMES[month-1]}`);
                
                const queryFilters: { [key: string]: any } = { 'Año': year, 'Mes': month };
                if (filters.etiqueta) {
                    queryFilters['Etiqueta'] = filters.etiqueta;
                }
                
                try {
                    const response: PresupuestoItem[] = await queryApi({
                        source: 'Presupuesto',
                        operation: 'get_data',
                        filters: queryFilters,
                        pagination: { limit: 500000 } // Increased limit
                    });

                    if (response && response.length > 0) {
                         const centerFilteredResponse = filters.centros.length > 0
                            ? response.filter(item => filters.centros.includes(String(item.Centro).trim()))
                            : response;
                        
                        sumForReport += centerFilteredResponse
                            .filter(item => {
                                if (!item.Sector) return false;
                                const sectorStr = String(item.Sector).trim();
                                return sectorStr.startsWith('01') || sectorStr.startsWith('02') || sectorStr.startsWith('03');
                            })
                            .reduce((sum, item) => sum + (parseFloat(String(item.UnidadesProyectado)) || 0), 0);

                         const mappedData: SalesDataRow[] = centerFilteredResponse.map((item, index) => ({
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
                } catch (e) {
                    console.error(`Fallo en consulta para ${year}-${month}`, e);
                    addNotification('error', `Fallo la consulta para ${MONTH_NAMES[month-1]} ${year}. Continuando...`);
                }
            }
        }
        
        if (allData.length > 0) {
            setTotalLoadedRecords(allData.length);
            setColchonesBasesMueblesSum(sumForReport);
            onDataImported(allData);
            addNotification('success', `Carga completada. Se importaron ${allData.length} registros.`);
        } else {
            addNotification('warning', 'No se encontraron registros con los filtros seleccionados.');
            onDataImported([]); // Clear data if nothing found
        }

    } catch (error) {
        addNotification('error', `Error durante la carga de datos: ${(error as Error).message}`);
    } finally {
        setIsProcessing(false);
    }
  };
  
  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Use los filtros para definir el alcance de los datos. Si no selecciona meses o centros, se cargarán todos para los años seleccionados. Una vez cargados, la aplicación los tendrá en memoria para el resto de los pasos.
      </p>

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
        
        <div className="flex flex-col justify-end h-full pt-1">
            <button
                onClick={handleLoadData}
                disabled={isProcessing || isAppLoading || filters.años.length === 0}
                className="w-full h-10 px-4 py-2 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                {isProcessing ? 'Cargando...' : 'Cargar Datos'}
            </button>
        </div>
      </div>

       {totalLoadedRecords > 0 && !isProcessing && (
         <div className="mt-6 text-center p-6 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-xl font-semibold text-green-800">
                ¡Carga Completada!
            </h3>
            <p className="text-green-700 mt-2">
                Se han cargado <span className="font-bold">{totalLoadedRecords.toLocaleString()}</span> registros de ventas en la memoria de la aplicación.
            </p>
            {colchonesBasesMueblesSum !== null && (
                <p className="text-green-700 mt-2">
                    Suma para Colchones, Bases y Muebles (01, 02, 03): <span className="font-bold">{colchonesBasesMueblesSum.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </p>
            )}
            <p className="text-green-600 mt-1 text-sm">
                Ahora puede proceder a las demás secciones para configurar y generar el plan de producción.
            </p>
        </div>
      )}
    </div>
  );
};
