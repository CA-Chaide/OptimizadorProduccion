

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
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transferReport, setTransferReport] = useState<TransferReportItem[]>([]);
  
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
    setTransferReport([]);
    
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
        
        // 1. Fetch provisioning rules from the new source of truth: 'CuboInventarios'
        addNotification('info', 'Obteniendo reglas de aprovisionamiento desde Cubo de Inventarios...');
        const inventoryCubeData: TiempoEnsambleItem[] = await queryApi({ 
            source: 'CuboInventarios', 
            operation: 'get_data',
            pagination: { limit: 200000 } // Fetch a large number to get all rules
        });
        
        // Use a composite key (product-center) to store rules for accuracy
        const provisionRules = new Map<string, {rule: 'E' | 'X' | 'F' | null, name: string}>();
        inventoryCubeData.forEach(item => {
            if (item.CodMaterial && item.Centro) {
                const materialCode = normalizeMaterialCode(item.CodMaterial);
                const centerId = String(item.Centro).trim();
                const compositeKey = `${materialCode}-${centerId}`;
                
                // Store the specific rule for each product-center combination
                if (!provisionRules.has(compositeKey)) {
                    provisionRules.set(compositeKey, { rule: item.ClaseAprovisionamiento, name: item.Material });
                }
            }
        });
        addNotification('success', `Reglas de aprovisionamiento cargadas para ${provisionRules.size} combinaciones producto-centro.`);

        // 2. Prepare API calls for sales data
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
        
        addNotification('info', `Realizando ${apiCallPromises.length} consultas de presupuesto a la API. Esto puede tardar...`);

        const responses = await Promise.all(apiCallPromises);

        addNotification('info', 'Consultas a la API completadas. Procesando resultados y aplicando reglas de negocio...');

        // 3. Process results and apply business logic for transfers
        const detailedTransferReport: TransferReportItem[] = [];

        responses.forEach(response => {
            if (response && response.length > 0) {
                 response.forEach((item, index) => {
                    const materialCode = normalizeMaterialCode(item.CodMaterial);
                    const originalDemandCenter = String(item.Centro).trim();
                    const compositeKey = `${materialCode}-${originalDemandCenter}`;
                    
                    // Get the specific provisioning rule for THIS product in THIS center
                    const provisionInfo = provisionRules.get(compositeKey);
                    
                    let producingCenter = originalDemandCenter;
                    
                    // If rule is 'F' (centralized manufacturing) and the demand is NOT from center 1000...
                    if (provisionInfo?.rule === 'F' && originalDemandCenter !== '1000') {
                        // ...then the production must happen at center 1000
                        producingCenter = '1000'; 
                        
                        // And we must generate a transfer record
                        detailedTransferReport.push({
                            id: `transfer-${item.Año}-${item.Mes}-${originalDemandCenter}-${materialCode}-${index}`,
                            mes: item.Mes,
                            año: item.Año,
                            etiqueta: item.Etiqueta || 'Sin Etiqueta',
                            productId: materialCode,
                            productName: provisionInfo?.name || item.Material,
                            fromCenter: '1000',
                            toCenter: originalDemandCenter,
                            units: item.UnidadesProyectado,
                        });
                    }

                    // The final sales data row has its 'centro' (center) field set to the PRODUCING center.
                    // This is the core of the logic: shifting the demand to where it needs to be produced.
                    const newRow: SalesDataRow = {
                        id: `row-${item.Año}-${item.Mes}-${item.Centro}-${index}`,
                        año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
                        etiqueta: item.Etiqueta || 'Sin Etiqueta',
                        código: materialCode,
                        centro: producingCenter, // The demand is now assigned to the correct producing center
                        unidadesProyectado: item.UnidadesProyectado,
                        dolaresProyectado: 0,
                        descripciónMaterial: item.Material,
                        familia: item.Familia, marca: item.Marca, 
                        lineaProduccion: item.LineaProduccion || '',
                    };
                    allData.push(newRow);
                 });
            }
        });
        
        setTransferReport(detailedTransferReport.sort((a,b) => a.mes - b.mes || a.etiqueta.localeCompare(b.etiqueta)));

        if (allData.length > 0) {
            setLoadedData(allData);
            onDataImported(allData);
            addNotification('success', `Carga completada. Se importaron y procesaron ${allData.length} registros. Se calcularon ${detailedTransferReport.length} transferencias.`);
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

  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto y Calcular Transferencias</h2>
      </div>
      
      <p className="text-gray-600">
        Use los filtros para cargar el presupuesto de ventas. El sistema consultará el **Cubo de Inventarios** para aplicar las reglas de negocio de fabricación centralizada (Clase 'F') y generará automáticamente el reporte de transferencias.
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
                <h3 className="text-lg font-semibold text-gray-800">Resumen de Demanda de Producción (Lógica Aplicada)</h3>
                <p className="text-sm text-gray-600">Muestra dónde se debe producir la demanda. Note cómo la demanda de productos 'F' se ha movido al centro 1000.</p>
                <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner mt-4">
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

            {transferReport.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-800">Reporte de Transferencias Logísticas Calculadas (Clase 'F')</h3>
                <p className="text-sm text-gray-600">Estos materiales deben ser fabricados en el centro 1000 y enviados a sus centros de demanda originales para cumplir con el presupuesto de ventas.</p>
                <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner mt-4">
                    <table className="min-w-full text-xs divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Mes</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Etiqueta</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Producto</th>
                                <th className="px-3 py-2 text-center font-semibold text-gray-600 uppercase tracking-wider">Destino</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Unidades a Transferir</th>
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
      )}
    </div>
  );
};
