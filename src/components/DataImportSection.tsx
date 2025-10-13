

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

interface TransferMaterial {
    code: string;
    description: string;
    units: number;
}

interface TransferAnalysisGroup {
    subtotal: number;
    materials: TransferMaterial[];
}

type GroupedTransferAnalysisData = Record<string, TransferAnalysisGroup>;

interface ProvisioningInfo {
    code: string;
    description: string;
    center: string;
    provisioningClass: string;
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
      sectores: [] as {value: string, label: string}[],
  });

  const [filters, setFilters] = useState<{
      años: string[];
      meses: string[];
      centros: string[];
      etiqueta: string;
      sectores: string[];
  }>({
      años: [],
      meses: [],
      centros: [],
      etiqueta: '',
      sectores: [],
  });

  const [loadedData, setLoadedData] = useState<SalesDataRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transferAnalysisData, setTransferAnalysisData] = useState<GroupedTransferAnalysisData>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [provisioningAnalysisData, setProvisioningAnalysisData] = useState<ProvisioningInfo[]>([]);
  const [isProvisioningAnalyzing, setIsProvisioningAnalyzing] = useState(false);
  
  const [provisioningFilters, setProvisioningFilters] = useState({
    code: '',
    description: '',
    center: '',
    provisioningClass: '',
  });

  const handleFilterChange = (name: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [añosData, centrosData, etiquetasData, sectoresData] = await Promise.all([
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Año' }),
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Centro' }),
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Etiqueta' }),
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Sector' })
        ]);

        const newFilterOptions = {
          años: añosData.map((item: any) => ({ value: String(item['Año']), label: String(item['Año']) })).sort((a:any,b:any) => b.value - a.value),
          centros: centrosData.map((item: any) => ({ value: item['Centro'], label: item['Centro'] })),
          etiquetas: etiquetasData.map((item: any) => ({ value: item['Etiqueta'], label: item['Etiqueta'] })),
          sectores: sectoresData.map((item: any) => ({ value: item['Sector'], label: item['Sector'] })),
        };
        setFilterOptions(newFilterOptions);
        setFilters(prev => ({ ...prev, años: [new Date().getFullYear().toString()] }));

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

    try {
        addNotification('info', `Iniciando carga de datos... Años: ${yearsToLoad.join(', ')}.`);
        
        const monthsToLoad = filters.meses.length > 0 ? filters.meses.map(Number) : Array.from({length: 12}, (_, i) => i + 1);
        const centrosToLoad = filters.centros.length > 0 ? filters.centros : filterOptions.centros.map(c => c.value);
        const sectoresToLoad = filters.sectores.length > 0 ? filters.sectores.map(s => s.value) : filterOptions.sectores.map(s => s.value);


        const apiCallPromises: Promise<PresupuestoItem[]>[] = [];

        for (const year of yearsToLoad) {
            for (const month of monthsToLoad) {
                for (const centro of centrosToLoad) {
                    for (const sector of sectoresToLoad) {
                        const queryFilters: { [key: string]: any } = { 
                            'Año': year, 
                            'Mes': month, 
                            'Centro': centro,
                            'Sector': sector
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
        }
        
        addNotification('info', `Realizando ${apiCallPromises.length} consultas a la API. Esto puede tardar...`);

        const responses = await Promise.all(apiCallPromises);

        addNotification('info', 'Consultas a la API completadas. Procesando resultados...');

        responses.forEach(response => {
            if (response && response.length > 0) {
                 const mappedData: SalesDataRow[] = response.map((item, index) => ({
                    id: `row-${item.Año}-${item.Mes}-${item.Centro}-${item.Sector}-${index}`,
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
        setTransferAnalysisData({});
        
        if (loadedData.length === 0) {
            addNotification('warning', 'Por favor, cargue primero los datos de ventas para analizar los traslados necesarios.');
            setIsAnalyzing(false);
            return;
        }

        addNotification('info', 'Analizando traslados requeridos según las reglas de negocio...');

        try {
            // Step 1: Get all assembly rules to identify 'F' class materials
            const assemblyRules = await queryApi({
                source: 'TiemposEnsamblado',
                operation: 'get_data',
                pagination: { limit: 50000 }
            }) as TiempoEnsambleItem[];

            if (!assemblyRules || assemblyRules.length === 0) {
                addNotification('warning', 'No se encontraron reglas de negocio en TiemposEnsamblado.');
                setIsAnalyzing(false);
                return;
            }

            const codesWithRuleF = new Set<string>();
            assemblyRules.forEach(rule => {
                if (rule.ClaseAprovisionamiento === 'F') {
                    codesWithRuleF.add(normalizeMaterialCode(rule.CodMaterial));
                }
            });

            if (codesWithRuleF.size === 0) {
                addNotification('info', 'No se encontraron materiales con regla de aprovisionamiento "F".');
                setIsAnalyzing(false);
                return;
            }
            
            addNotification('info', `Se encontraron ${codesWithRuleF.size} materiales con regla 'F'. Cruzando con los ${loadedData.length} registros de ventas cargados...`);

            // Step 2: Iterate over the ALREADY LOADED sales data to find transfer needs
            const transferUnitsByCode: Record<string, { units: number, etiqueta: string, description: string }> = {};

            loadedData.forEach(sale => {
                const code = sale.código;
                // A transfer is needed if the sale is NOT in center 1000 AND the material has rule 'F'
                if (sale.centro !== '1000' && codesWithRuleF.has(code)) {
                    if (!transferUnitsByCode[code]) {
                        transferUnitsByCode[code] = { units: 0, etiqueta: sale.etiqueta, description: sale.descripciónMaterial };
                    }
                    transferUnitsByCode[code].units += sale.unidadesProyectado;
                }
            });

            // Step 3: Group the results by 'etiqueta' for display
            const groupedData: GroupedTransferAnalysisData = {};
            
            Object.entries(transferUnitsByCode).forEach(([code, data]) => {
                const { etiqueta, description, units } = data;
                if (!groupedData[etiqueta]) {
                    groupedData[etiqueta] = { subtotal: 0, materials: [] };
                }
                
                groupedData[etiqueta].materials.push({
                    code,
                    description,
                    units,
                });
                groupedData[etiqueta].subtotal += units;
            });
    
            const sortedGroupedData = Object.entries(groupedData)
                .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
                .reduce((acc, [key, val]) => {
                    val.materials.sort((a,b) => a.code.localeCompare(b.code));
                    acc[key] = val;
                    return acc;
                }, {} as GroupedTransferAnalysisData);
            
            setTransferAnalysisData(sortedGroupedData);
            const totalMaterialsFound = Object.keys(transferUnitsByCode).length;
            if(totalMaterialsFound > 0) {
              addNotification('success', `Análisis de traslados completado. Se encontraron ${totalMaterialsFound} materiales que requieren traslado.`);
            } else {
              addNotification('warning', `Análisis completado. No se encontraron materiales que requieran traslado con los filtros actuales.`);
            }
    
        } catch (error) {
            addNotification('error', `Error durante el análisis de traslados: ${(error as Error).message}`);
        } finally {
            setIsAnalyzing(false);
        }
    };
    
    const handleAnalyzeProvisioning = async () => {
        setIsProvisioningAnalyzing(true);
        setProvisioningAnalysisData([]);
        addNotification('info', `Analizando aprovisionamiento para etiqueta: ${filters.etiqueta || 'Todas'}...`);
    
        try {
            const [assemblyData, budgetData] = await Promise.all([
                queryApi({ source: 'TiemposEnsamblado', operation: 'get_data', pagination: { limit: 50000 } }) as Promise<TiempoEnsambleItem[]>,
                queryApi({ source: 'Presupuesto', operation: 'get_data', pagination: { limit: 500000 } }) as Promise<PresupuestoItem[]>
            ]);
    
            const materialInfoMap = new Map<string, { etiqueta: string; description: string }>();
            budgetData.forEach(item => {
                const code = normalizeMaterialCode(item.CodMaterial);
                const currentInfo = materialInfoMap.get(code);
                const hasNewLabel = item.Etiqueta && item.Etiqueta.trim() !== '';

                if (!currentInfo || (hasNewLabel && currentInfo.etiqueta === 'Sin Etiqueta') || !currentInfo.etiqueta) {
                     materialInfoMap.set(code, {
                        etiqueta: hasNewLabel ? item.Etiqueta : (currentInfo?.etiqueta || 'Sin Etiqueta'),
                        description: item.Material || currentInfo?.description || 'Descripción no encontrada',
                    });
                }
            });
    
            const enrichedRules = new Map<string, ProvisioningInfo>();
            assemblyData.forEach(item => {
                const code = normalizeMaterialCode(item.CodMaterial);
                const center = String(item.Centro).trim();
                const key = `${code}-${center}`;

                if (enrichedRules.has(key)) return;

                const info = materialInfoMap.get(code) || { etiqueta: 'Sin Etiqueta', description: 'Descripción no encontrada en Presupuesto' };

                if (filters.etiqueta && info.etiqueta !== filters.etiqueta) {
                    return;
                }

                enrichedRules.set(key, {
                    code: code,
                    description: info.description,
                    center: center,
                    provisioningClass: item.ClaseAprovisionamiento || 'N/D',
                });
            });

            const finalData = Array.from(enrichedRules.values());
            finalData.sort((a, b) => {
                if (a.code < b.code) return -1;
                if (a.code > b.code) return 1;
                if (a.center < b.center) return -1;
                if (a.center > b.center) return 1;
                return 0;
            });
            
            setProvisioningAnalysisData(finalData);
            if (finalData.length > 0) {
                addNotification('success', `Análisis completado. Se encontraron ${finalData.length} reglas de aprovisionamiento únicas.`);
            } else {
                addNotification('warning', `No se encontraron reglas de aprovisionamiento para la etiqueta seleccionada.`);
            }
    
        } catch (error) {
            addNotification('error', `Error durante el análisis de aprovisionamiento: ${(error as Error).message}`);
        } finally {
            setIsProvisioningAnalyzing(false);
        }
    };
    
    const handleProvisioningFilterChange = (field: keyof typeof provisioningFilters, value: string) => {
        setProvisioningFilters(prev => ({...prev, [field]: value}));
    };

    const filteredProvisioningData = useMemo(() => {
        return provisioningAnalysisData.filter(item => {
            return (
                item.code.toLowerCase().includes(provisioningFilters.code.toLowerCase()) &&
                item.description.toLowerCase().includes(provisioningFilters.description.toLowerCase()) &&
                item.center.toLowerCase().includes(provisioningFilters.center.toLowerCase()) &&
                item.provisioningClass.toLowerCase().includes(provisioningFilters.provisioningClass.toLowerCase())
            );
        });
    }, [provisioningAnalysisData, provisioningFilters]);


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
    return Object.values(transferAnalysisData).reduce((sum, group) => sum + group.subtotal, 0);
  }, [transferAnalysisData]);


  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Use los filtros para definir el alcance de los datos. Si no selecciona meses, centros o sectores, se cargarán todos para los años seleccionados.
      </p>

      {/* --- Filtros --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 items-start p-4 border rounded-lg bg-gray-50">
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
         <MultiSelect 
            label="Sector(es)"
            options={filterOptions.sectores}
            selected={filters.sectores}
            onChange={value => handleFilterChange('sectores', value)}
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
           Esta herramienta lista los materiales que, según las reglas de negocio, deben fabricarse en el centro 1000 (Clase 'F') para satisfacer la demanda de otros centros, basado en los datos de ventas actualmente cargados.
        </p>
        <div>
            <Button onClick={handleAnalyzeTransfers} disabled={isAnalyzing || loadedData.length === 0}>
            {isAnalyzing ? 'Analizando...' : 'Analizar Materiales con Regla "F"'}
            </Button>
        </div>
        {Object.keys(transferAnalysisData).length > 0 && (
            <div>
                <h4 className="font-semibold mb-2">Materiales con Fabricación Centralizada (Regla 'F')</h4>
                <div className="border rounded-md max-h-[60vh] overflow-y-auto">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">Código Material / Etiqueta</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">Descripción</th>
                                <th className="px-4 py-2 text-right font-semibold text-gray-600">Unidades a Trasladar</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {Object.entries(transferAnalysisData).map(([etiqueta, group]) => (
                                <React.Fragment key={etiqueta}>
                                    <tr className="bg-gray-100">
                                        <td className="px-4 py-2 font-bold text-gray-800" colSpan={2}>{etiqueta}</td>
                                        <td className="px-4 py-2 text-right font-bold text-gray-800">{group.subtotal.toLocaleString()}</td>
                                    </tr>
                                    {group.materials.map(item => (
                                        <tr key={item.code}>
                                            <td className="pl-8 pr-4 py-2 font-mono">{item.code}</td>
                                            <td className="px-4 py-2 text-gray-600">{item.description}</td>
                                            <td className="px-4 py-2 text-right font-semibold">{item.units.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                        <tfoot className="bg-gray-200 sticky bottom-0">
                           <tr>
                                <th className="px-4 py-2 text-left font-bold text-gray-700 uppercase" colSpan={2}>TOTAL GENERAL</th>
                                <th className="px-4 py-2 text-right font-bold text-indigo-700 uppercase">{transferTotalUnits.toLocaleString()}</th>
                           </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        )}
      </div>

       {/* --- Sección de Análisis de Aprovisionamiento --- */}
      <div className="p-4 border rounded-lg bg-gray-50 mt-6 space-y-4">
        <h3 className="text-lg font-semibold text-gray-700">Análisis de Aprovisionamiento por Etiqueta</h3>
        <p className="text-sm text-gray-600">
            Esta herramienta consulta las reglas de negocio para todos los materiales de la etiqueta seleccionada en el filtro principal. Muestra la "Clase de Aprovisionamiento" ('E', 'F', 'X') definida para cada código en cada centro.
        </p>
        <div>
            <Button onClick={handleAnalyzeProvisioning} disabled={isProvisioningAnalyzing}>
            {isProvisioningAnalyzing ? 'Analizando...' : `Analizar Aprovisionamiento para "${filters.etiqueta || 'Todas'}"`}
            </Button>
        </div>
        {provisioningAnalysisData.length > 0 && (
            <div>
                <h4 className="font-semibold mb-2">Reglas de Aprovisionamiento para la Etiqueta: <span className="text-indigo-600">{filters.etiqueta || 'Todas'}</span></h4>
                <div className="border rounded-md max-h-[60vh] overflow-y-auto">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">
                                    Código Material
                                    <input type="text" placeholder="Filtrar..." className="w-full mt-1 p-1 text-xs border rounded" value={provisioningFilters.code} onChange={(e) => handleProvisioningFilterChange('code', e.target.value)} />
                                </th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">
                                    Descripción
                                    <input type="text" placeholder="Filtrar..." className="w-full mt-1 p-1 text-xs border rounded" value={provisioningFilters.description} onChange={(e) => handleProvisioningFilterChange('description', e.target.value)} />
                                </th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600">
                                    Centro
                                    <input type="text" placeholder="Filtrar..." className="w-full mt-1 p-1 text-xs border rounded" value={provisioningFilters.center} onChange={(e) => handleProvisioningFilterChange('center', e.target.value)} />
                                </th>
                                <th className="px-4 py-2 text-center font-semibold text-gray-600">
                                    Clase Aprov.
                                    <input type="text" placeholder="Filtrar..." className="w-full mt-1 p-1 text-xs border rounded" value={provisioningFilters.provisioningClass} onChange={(e) => handleProvisioningFilterChange('provisioningClass', e.target.value)} />
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredProvisioningData.map((item, index) => (
                                <tr key={`${item.code}-${item.center}-${index}`}>
                                    <td className="px-4 py-2 font-mono">{item.code}</td>
                                    <td className="px-4 py-2 text-gray-600">{item.description}</td>
                                    <td className="px-4 py-2 text-gray-800">{item.center}</td>
                                    <td className="px-4 py-2 text-center font-bold">{item.provisioningClass}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}
      </div>

    </div>
  );
};
