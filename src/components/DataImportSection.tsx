

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { logger } from '@/services/LogService';
import { operationTracker } from '@/services/OperationTracker';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { SalesDataRow, NotificationMessage, PresupuestoItem, TiempoEnsambleItem } from '@/types/types';
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
    sector: string;
}

const normalizeMaterialCode = (code: string | number): string => {
    const codeStr = String(code);
    return codeStr.slice(-8);
};

const normalizeMaterialCodeTo18Digits = (code: string | number): string => {
    const eightDigitCode = String(code).slice(-8);
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
                     if (option.value.toLowerCase() === currentValue.toLowerCase()) {
                       handleSelect(option.value);
                     }
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
    const inspector = useRuntimeInspector('DataImport');
    
    const [filterOptions, setFilterOptions] = useState({
        centros: [] as {value: string, label: string}[],
        etiquetas: [] as {value: string, label: string}[],
    });

    const [filters, setFilters] = useState<{
        startYear: number;
        startMonth: number;
        monthsToLoad: number;
        centros: string[];
        etiqueta: string;
    }>({
        startYear: new Date().getFullYear(),
        startMonth: new Date().getMonth() + 1,
        monthsToLoad: 12,
        centros: [],
        etiqueta: '',
    });
    
    useEffect(() => {
      logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[DataImportSection] Cambio en filterOptions: ${JSON.stringify(filterOptions)}`);
      inspector.captureVariable('filterOptions', filterOptions, {
        description: 'Opciones disponibles para filtros (centros, etiquetas)',
        source: 'state'
      });
    }, [filterOptions]);
    
    useEffect(() => {
      logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[DataImportSection] Cambio en filters: ${JSON.stringify(filters)}`);
      inspector.captureVariable('filters', filters, {
        description: 'Filtros activos aplicados por el usuario',
        source: 'user'
      });
    }, [filters]);

  const { addNotification, isLoading: isAppLoading } = useAppContext();
  
  useEffect(() => {
    logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[DataImportSection] Montado.`);
    inspector.captureState({ mounted: true, isProcessing: false }, {}, {
      filterOptionsCount: 0,
      filtersActive: 0
    });
  }, []);

  const [loadedData, setLoadedData] = useState<SalesDataRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transferNeeds, setTransferNeeds] = useState<TransferNeed[]>([]);
  
  const handleFilterChange = (name: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [centrosData, etiquetasData] = await Promise.all([
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Centro' }),
            queryApi({ source: 'Presupuesto', operation: 'get_distinct_values', column: 'Etiqueta' })
        ]);

        const newFilterOptions = {
          centros: centrosData.map((item: any) => ({ value: String(item['Centro']), label: String(item['Centro']) })),
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
    setTransferNeeds([]);
    
    const timestamp = new Date().toLocaleTimeString();
    
    const opId = operationTracker.startOperation(
      'DataImport', 'data_load',
      `Cargando ${filters.monthsToLoad} meses de presupuesto desde ${filters.startMonth}/${filters.startYear}`,
      { ...filters }
    );
    
    const ctxId = inspector.startContext('load_budget_data', { filters, timestamp });
    
    logger.log(`[${timestamp}] --- INICIANDO CARGA DE DATOS DE PRESUPUESTO --- Filtros: ${JSON.stringify(filters)}`,'info');

    let allData: PresupuestoItem[] = [];

    try {
        addNotification('info', `Iniciando carga para ${filters.monthsToLoad} meses...`);
        operationTracker.updateOperation(opId, 'in_progress', 'Consultando API de presupuesto...');
        
        const centrosToLoad = filters.centros.length > 0 ? filters.centros : filterOptions.centros.map(c => c.value);
        const apiCallPromises: Promise<PresupuestoItem[]>[] = [];

        for (let i = 0; i < filters.monthsToLoad; i++) {
            let currentMonth = filters.startMonth + i;
            let currentYear = filters.startYear;

            while (currentMonth > 12) {
                currentMonth -= 12;
                currentYear += 1;
            }
            
            for (const centro of centrosToLoad) {
                const queryFilters: { [key: string]: any } = { 'Año': currentYear, 'Mes': currentMonth, 'Centro': centro };
                if (filters.etiqueta) {
                    queryFilters['Etiqueta'] = filters.etiqueta;
                }
                
                logger.log(`Cargando datos para ${MONTH_NAMES[currentMonth-1]} ${currentYear} - Centro: ${centro}`, 'info');

                const promise = queryApi({
                    source: 'Presupuesto',
                    operation: 'get_data',
                    filters: queryFilters,
                    pagination: { limit: 200000 }
                });
                apiCallPromises.push(promise);
            }
        }
      
      logger.log(`Realizando ${apiCallPromises.length} consultas de presupuesto a la API.`,'info');
      const responses = await Promise.all(apiCallPromises);
      logger.log('Consultas de presupuesto completadas. Procesando resultados...','info');
      
      operationTracker.updateOperation(opId, 'in_progress', 'Procesando resultados de presupuesto...', { queriesCompleted: apiCallPromises.length });
      
      responses.forEach(response => {
        if (response && response.length > 0) {
          allData = [...allData, ...response];
        }
      });
      const aggregatedData: { [key: string]: SalesDataRow } = {};
      allData.forEach((item) => {
        const centro = String(item.Centro || '1000').trim();
        const key = `${item.Año}-${item.Mes}-${centro}-${normalizeMaterialCode(item.CodMaterial)}`;
        if (!aggregatedData[key]) {
          aggregatedData[key] = {
            id: `agg-${key}`, año: item.Año, mes: item.Mes, sector: item.Sector || 'Sin Sector',
            etiqueta: item.Etiqueta || 'Sin Etiqueta', código: normalizeMaterialCode(item.CodMaterial),
            centro: centro, unidadesProyectado: 0, dolaresProyectado: 0, descripciónMaterial: item.Material,
            familia: item.Familia, marca: item.Marca, lineaProduccion: item.LineaProduccion || '',
            claseAprovisionamiento: 'N/A'
          };
        }
        aggregatedData[key].unidadesProyectado += item.UnidadesProyectado;
      });
      let mappedAndAggregatedData = Object.values(aggregatedData);
      if (mappedAndAggregatedData.length > 0) {
        addNotification('info', `Consultando reglas de aprovisionamiento desde CuboInventarios...`);
        logger.log(`Consultando reglas de aprovisionamiento desde CuboInventarios. Total de filas: ${mappedAndAggregatedData.length}`,'info');
        
        operationTracker.updateOperation(opId, 'in_progress', 'Consultando reglas de aprovisionamiento...', { aggregatedRows: mappedAndAggregatedData.length });
        
        const inventoryRulesData: any[] = await queryApi({
          source: 'CuboInventarios',
          operation: 'get_data',
          columns: ['Material', 'Centro', 'ClaseAprovisionam'],
          pagination: { limit: 500000 }
        });
        logger.log(`Respuesta de CuboInventarios obtenida con ${inventoryRulesData?.length || 0} reglas.`,'info');
        const rules = new Map<string, 'E' | 'X' | 'F'>();
        if (inventoryRulesData) {
          inventoryRulesData.forEach((item: any) => {
          if (item.Material && item.Centro && item.ClaseAprovisionam) {
            const materialCode18 = String(item.Material).trim();
            const center = String(item.Centro).trim();
            rules.set(`${materialCode18}---${center}`, item.ClaseAprovisionam);
          }
          });
        }
        logger.log(`Mapa de reglas creado con ${rules.size} entradas.`,'info');
        mappedAndAggregatedData = mappedAndAggregatedData.map((sale, index) => {
          const ts = new Date().toLocaleTimeString();
          const materialCode18 = normalizeMaterialCodeTo18Digits(sale.código);
          const center = sale.centro;
          let aprovisionamiento: SalesDataRow['claseAprovisionamiento'] = 'N/A';
          const directRuleKey = `${materialCode18}---${center}`;
          const directRule = rules.get(directRuleKey);
          if (directRule) {
            aprovisionamiento = directRule;
          } else if (center !== '1000') {
            const fallbackRuleKey = `${materialCode18}---1000`;
            const fallbackRule = rules.get(fallbackRuleKey);
            if (fallbackRule && fallbackRule === 'F') {
              aprovisionamiento = 'F';
            }
          }
          return { ...sale, claseAprovisionamiento: aprovisionamiento };
        });
        logger.log(`Datos mapeados y guardados en memoria. Muestra: ${JSON.stringify(mappedAndAggregatedData.slice(0,2))}`,'info');
        
        inspector.captureVariable('loadedData', mappedAndAggregatedData, {
          description: `Datos de presupuesto cargados (${mappedAndAggregatedData.length} filas)`,
          source: 'api',
          dependencies: ['filters', 'filterOptions']
        });
        inspector.captureVariable('totalRecords', allData.length, {
          description: 'Total de registros importados antes de consolidar',
          source: 'calculation'
        });
        inspector.captureVariable('consolidatedRows', mappedAndAggregatedData.length, {
          description: 'Total de filas después de consolidar',
          source: 'calculation'
        });
        
        setLoadedData(mappedAndAggregatedData);
        onDataImported(mappedAndAggregatedData);
        addNotification('success', `Carga completada. Se importaron ${allData.length} registros que se consolidaron en ${mappedAndAggregatedData.length} filas.`);
        logger.log(`Carga completada. Se importaron ${allData.length} registros que se consolidaron en ${mappedAndAggregatedData.length} filas.`,'success');
        
        operationTracker.completeOperation(opId, `Presupuesto cargado exitosamente: ${mappedAndAggregatedData.length} filas consolidadas`, { importedRecords: allData.length, consolidatedRows: mappedAndAggregatedData.length });
        
        inspector.updateContext(ctxId, 'completed', {
          outputs: {
            totalRecords: allData.length,
            consolidatedRows: mappedAndAggregatedData.length,
            sampleData: mappedAndAggregatedData.slice(0, 2)
          }
        });
        
        const salesRequiringTransfer = mappedAndAggregatedData.filter(sale => sale.claseAprovisionamiento === 'F' && sale.centro !== '1000');
        const aggregatedNeeds: { [productId: string]: TransferNeed } = {};
        salesRequiringTransfer.forEach(sale => {
          const productId = sale.código;
          if (!aggregatedNeeds[productId]) {
            aggregatedNeeds[productId] = { productId: productId, productName: sale.descripciónMaterial, sector: sale.sector, unitsToTransfer: 0 };
          }
          aggregatedNeeds[productId].unitsToTransfer += sale.unidadesProyectado;
        });
        const transferResults = Object.values(aggregatedNeeds).sort((a,b) => a.productName.localeCompare(b.productName));
        setTransferNeeds(transferResults);
      } else {
        addNotification('warning', 'No se encontraron registros con los filtros seleccionados.');
        logger.log('No se encontraron registros con los filtros seleccionados.','warning');
        operationTracker.failOperation(opId, 'No records found with selected filters');
        inspector.updateContext(ctxId, 'failed', { error: 'No records found with selected filters' });
      }
    } catch (error) {
      addNotification('error', `Error durante la carga de datos: ${(error as Error).message}`);
      logger.log(`Error durante la carga de datos: ${(error as Error).message}`,'error');
      operationTracker.failOperation(opId, (error as Error).message);
      inspector.updateContext(ctxId, 'failed', { 
        error: (error as Error).message,
        stackTrace: (error as Error).stack?.split('\n')
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const { tableData, monthColumns, footerTotals, grandTotal } = useMemo(() => {
    if (loadedData.length === 0) {
      return { tableData: [], monthColumns: [], footerTotals: {}, grandTotal: 0 };
    }

    const prioritySectors = new Set(["01 COLCHONES", "02 BASES-CABECERO-CAMA", "03 MUEBLES FABRICACIÓN"]);
    const dataBySectorAndMonth: { [sector: string]: { [month: number]: number; isPriority: boolean } } = {};
    const monthSet = new Set<number>();

    loadedData.forEach(row => {
      const sector = row.sector || 'Sin Sector';
      const month = row.mes;
      monthSet.add(month);

      if (!dataBySectorAndMonth[sector]) {
        dataBySectorAndMonth[sector] = { isPriority: prioritySectors.has(sector) };
      }
      dataBySectorAndMonth[sector][month] = (dataBySectorAndMonth[sector][month] || 0) + row.unidadesProyectado;
    });

    const sortedMonths = Array.from(monthSet).sort((a, b) => a - b);
    
    let tableRows: (any & { type?: 'data' | 'subtotal' })[] = Object.entries(dataBySectorAndMonth).map(([sector, monthData]) => {
      const totalSector = sortedMonths.reduce((sum, month) => sum + (monthData[month] || 0), 0);
      return { sector, ...monthData, totalSector, type: 'data' };
    });

    // Separar sectores prioritarios y otros
    const priorityRows = tableRows.filter(row => row.isPriority).sort((a,b) => a.sector.localeCompare(b.sector));
    const otherRows = tableRows.filter(row => !row.isPriority).sort((a,b) => a.sector.localeCompare(b.sector));

    // Calcular subtotal de prioritarios si existen
    if (priorityRows.length > 0) {
        const subtotal = {
            sector: 'Subtotal Fabricación',
            type: 'subtotal',
            totalSector: 0
        };
        sortedMonths.forEach(month => subtotal[month] = 0);
        
        priorityRows.forEach(row => {
            subtotal.totalSector += row.totalSector;
            sortedMonths.forEach(month => {
                subtotal[month] += (row[month] || 0);
            });
        });
        priorityRows.push(subtotal);
    }
    
    tableRows = [...priorityRows, ...otherRows];
    
    const monthTotals: { [month: number]: number } = {};
    let totalOfTotals = 0;

    tableRows.filter(r => r.type === 'data').forEach(row => {
        sortedMonths.forEach(month => {
            monthTotals[month] = (monthTotals[month] || 0) + (row[month] || 0);
        });
        totalOfTotals += row.totalSector;
    });

    return {
      tableData: tableRows,
      monthColumns: sortedMonths,
      footerTotals: monthTotals,
      grandTotal: totalOfTotals,
    };
}, [loadedData]);

    const years = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i);

  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <DataImportIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Cargar Presupuesto de Ventas desde API</h2>
      </div>
      
      <p className="text-gray-600">
        Use los filtros para definir el alcance de los datos. Si no selecciona centros, se cargarán todos.
      </p>

      {/* --- Filtros --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-start p-4 border rounded-lg bg-gray-50">
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Año de Inicio</label>
            <select value={filters.startYear} onChange={e => handleFilterChange('startYear', Number(e.target.value))} className="w-full h-10 px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm sm:text-sm">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mes de Inicio</label>
            <select value={filters.startMonth} onChange={e => handleFilterChange('startMonth', Number(e.target.value))} className="w-full h-10 px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm sm:text-sm">
                {MONTH_NAMES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
            </select>
        </div>
        <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Meses a Cargar</label>
            <input type="number" value={filters.monthsToLoad} onChange={e => handleFilterChange('monthsToLoad', Number(e.target.value))} className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm" min="1" max="24" />
        </div>
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
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
        </div>
        
        <div className="lg:col-start-5 flex flex-col justify-end">
            <button
                onClick={handleLoadData}
                disabled={isProcessing || isAppLoading}
                className="w-full h-10 px-4 py-2 bg-blue-600 text-white font-bold rounded-md shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
                {isProcessing ? 'Cargando...' : 'Cargar Datos'}
            </button>
        </div>
      </div>

      {loadedData.length > 0 && (
         <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-800">Datos de Ventas Consolidados por Sector y Mes</h3>
            <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Sector</th>
                            {monthColumns.map(month => (
                                <th key={month} className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">{MONTH_NAMES[month - 1]}</th>
                            ))}
                            <th className="px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider bg-gray-100">Total Sector</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                       {tableData.map((row, idx) => (
                            <tr key={row.sector + idx} className={`${row.type === 'subtotal' ? 'bg-blue-50 font-bold' : ''}`}>
                                <td className={`px-3 py-2 whitespace-nowrap font-medium ${row.type === 'subtotal' ? 'text-blue-800' : 'text-gray-800'}`}>{row.sector}</td>
                                {monthColumns.map(month => (
                                    <td key={`${row.sector}-${month}`} className={`px-3 py-2 text-right ${row.type === 'subtotal' ? 'text-blue-700' : 'text-gray-600'}`}>{(row[month] || 0).toLocaleString()}</td>
                                ))}
                                <td className={`px-3 py-2 text-right font-bold ${row.type === 'subtotal' ? 'text-blue-800' : 'text-gray-900'}`}>{row.totalSector.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-gray-200 sticky bottom-0 z-10">
                        <tr>
                            <th className="px-3 py-2 text-left font-bold text-gray-700 uppercase tracking-wider">TOTAL</th>
                             {monthColumns.map(month => (
                                <th key={`total-${month}`} className="px-3 py-2 text-right font-bold text-gray-700 uppercase tracking-wider">
                                    {(footerTotals[month] || 0).toLocaleString()}
                                </th>
                            ))}
                             <th className="px-3 py-2 text-right font-bold text-indigo-700 uppercase tracking-wider">
                                {grandTotal.toLocaleString()}
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
