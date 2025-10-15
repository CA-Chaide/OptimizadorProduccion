
'use client';

import React, { useState, useEffect } from 'react';
import { PresupuestoItem, TiempoEnsambleItem } from '@/types/types';
import { queryApi } from '@/hooks/useApiData';
import { MONTH_NAMES, TransferCalculatorIcon } from '@/constants/constants';
import { useAppContext } from '@/context/AppProvider';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface TransferReportItem {
    id: string;
    mes: number;
    año: number;
    etiqueta: string;
    productId: string;
    productName: string;
    fromCenter: '1000';
    toCenter: string;
    units: number;
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
                  onSelect={() => handleSelect(option.value)}
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


export const TransferCalculatorSection: React.FC = () => {
    const { addNotification, isLoading: isAppLoading } = useAppContext();
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [transferReport, setTransferReport] = useState<TransferReportItem[]>([]);
    
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
              centros: centrosData.map((item: any) => ({ value: item['Centro'], label: item['Centro'] })).filter((c: any) => c.value !== '1000'), // Exclude center 1000
              etiquetas: etiquetasData.map((item: any) => ({ value: item['Etiqueta'], label: item['Etiqueta'] })),
            };
            setFilterOptions(newFilterOptions);
          } catch (error) {
            addNotification('error', 'No se pudieron cargar las opciones para los filtros desde la API.');
          }
        };
        loadFilterOptions();
    }, [addNotification]);
      
    const handleFilterChange = (name: keyof typeof filters, value: any) => {
        setFilters(prev => ({ ...prev, [name]: value }));
    };

    const handleCalculateTransfers = async () => {
        setIsProcessing(true);
        setTransferReport([]);
        
        if (filters.años.length === 0) {
            addNotification('warning', 'Por favor, seleccione al menos un año.');
            setIsProcessing(false);
            return;
        }

        try {
            addNotification('info', `Calculando traslados necesarios...`);
            
            // 1. Fetch ALL materials to determine F-Class provisioning rule client-side
            addNotification('info', 'Obteniendo todos los datos maestros de ensamble...');
            const assemblyData: TiempoEnsambleItem[] = await queryApi({ 
                source: 'TiemposEnsamblado', 
                operation: 'get_data',
                pagination: { limit: 50000 } // Fetch all data
            });

            const fClassMaterials = new Map<string, string>();
            assemblyData.forEach(item => {
                const materialCode = normalizeMaterialCode(item.CodMaterial);
                if (item.ClaseAprovisionamiento === 'F' && !fClassMaterials.has(materialCode) && item.Material) {
                    fClassMaterials.set(materialCode, item.Material);
                }
            });
            
            if (fClassMaterials.size === 0) {
                addNotification('warning', 'No se encontraron materiales con Clase de Aprovisionamiento "F".');
                setIsProcessing(false);
                return;
            }
            addNotification('success', `Se encontraron ${fClassMaterials.size} materiales de Clase 'F'.`);

            // 2. Prepare API calls for sales data of F-Class materials in non-1000 centers
            const yearsToLoad = filters.años.map(Number);
            const monthsToLoad = filters.meses.length > 0 ? filters.meses.map(Number) : Array.from({length: 12}, (_, i) => i + 1);
            const centrosToLoad = filters.centros.length > 0 ? filters.centros : filterOptions.centros.map(c => c.value);

            const apiCallPromises: Promise<PresupuestoItem[]>[] = [];

            for (const year of yearsToLoad) {
                for (const month of monthsToLoad) {
                    for (const centro of centrosToLoad) {
                         const queryFilters: { [key: string]: any } = { 
                            'Año': year, 
                            'Mes': month, 
                            'Centro': centro,
                        };
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
            
            addNotification('info', `Buscando demanda en ${apiCallPromises.length} combinaciones de filtro...`);

            const responses = await Promise.all(apiCallPromises);

            addNotification('info', 'Consultas completadas. Procesando resultados...');

            const detailedTransferReport: TransferReportItem[] = [];

            responses.forEach(response => {
                if (response && response.length > 0) {
                     response.forEach((item, index) => {
                        const materialCode = normalizeMaterialCode(item.CodMaterial);
                        if(fClassMaterials.has(materialCode) && item.UnidadesProyectado > 0) {
                             detailedTransferReport.push({
                                id: `transfer-${item.Año}-${item.Mes}-${item.Centro}-${materialCode}-${index}`,
                                mes: item.Mes,
                                año: item.Año,
                                etiqueta: item.Etiqueta || 'Sin Etiqueta',
                                productId: materialCode,
                                productName: fClassMaterials.get(materialCode) || item.Material,
                                fromCenter: '1000',
                                toCenter: String(item.Centro).trim(),
                                units: item.UnidadesProyectado,
                            });
                        }
                    });
                }
            });
            
            if (detailedTransferReport.length > 0) {
                setTransferReport(detailedTransferReport.sort((a,b) => a.mes - b.mes || a.etiqueta.localeCompare(b.etiqueta)));
                addNotification('success', `Cálculo completado. Se encontraron ${detailedTransferReport.length} requerimientos de traslado.`);
            } else {
                addNotification('warning', 'No se encontró demanda para materiales de Clase "F" en los centros y fechas seleccionados.');
            }

        } catch (error) {
            addNotification('error', `Error durante el cálculo de traslados: ${(error as Error).message}`);
        } finally {
            setIsProcessing(false);
        }
    };


    return (
        <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
            <div className="flex items-center space-x-3">
                <TransferCalculatorIcon />
                <h2 className="text-2xl font-semibold text-gray-700">Calculador de Traslados Logísticos (Clase 'F')</h2>
            </div>
            
            <p className="text-gray-600">
                Esta herramienta consulta la demanda de materiales de fabricación centralizada (Clase 'F') en los centros de distribución y genera un reporte de las unidades que deben ser enviadas desde la planta principal (Centro 1000).
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
                    label="Centro(s) Destino"
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
                        onClick={handleCalculateTransfers}
                        disabled={isProcessing || isAppLoading || filters.años.length === 0}
                        className="w-full h-10 px-4 py-2 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isProcessing ? 'Calculando...' : 'Calcular Traslados'}
                    </button>
                </div>
            </div>

            {transferReport.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Reporte Detallado de Traslados Requeridos</h3>
                <div className="relative max-h-[70vh] overflow-y-auto border rounded-lg shadow-inner mt-4">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Mes</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Etiqueta</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Producto</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600 uppercase tracking-wider">Centro Destino</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Unidades a Trasladar</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {transferReport.map(item => (
                                <tr key={item.id}>
                                    <td className="px-3 py-2 whitespace-nowrap">{MONTH_NAMES[item.mes - 1]} '{item.año.toString().slice(-2)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap">{item.etiqueta}</td>
                                    <td className="px-3 py-2 whitespace-normal font-medium text-gray-800">
                                        {item.productName} <span className="font-mono text-gray-500">({item.productId})</span>
                                    </td>
                                    <td className="px-3 py-2 text-center font-bold text-indigo-700">{item.toCenter}</td>
                                    <td className="px-3 py-2 text-right font-bold text-gray-900">{item.units.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
              </div>
            )}
        </div>
    );
};
