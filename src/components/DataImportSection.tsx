

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
    // Inicializar RuntimeInspector para este componente
    const inspector = useRuntimeInspector('DataImport');
    
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
      logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[DataImportSection] Cambio en filterOptions: ${JSON.stringify(filterOptions)}`);
      // Capturar variable en RuntimeInspector
      inspector.captureVariable('filterOptions', filterOptions, {
        description: 'Opciones disponibles para filtros (años, centros, etiquetas)',
        source: 'state'
      });
    }, [filterOptions]);
    useEffect(() => {
      logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[DataImportSection] Cambio en filters: ${JSON.stringify(filters)}`);
      // Capturar variable en RuntimeInspector
      inspector.captureVariable('filters', filters, {
        description: 'Filtros activos aplicados por el usuario',
        source: 'user'
      });
    }, [filters]);
  const { addNotification, isLoading: isAppLoading } = useAppContext();
  useEffect(() => {
    logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[DataImportSection] Montado.`);
    // Capturar estado inicial
    inspector.captureState({ mounted: true, isProcessing: false }, {}, {
      filterOptionsCount: 0,
      filtersActive: 0
    });
  }, []);
  


  const [loadedData, setLoadedData] = useState<SalesDataRow[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [transferNeeds, setTransferNeeds] = useState<TransferNeed[]>([]);
  
  const [tableFilters, setTableFilters] = useState({
    etiqueta: '', mes: '', código: '', centro: '', descripciónMaterial: '', claseAprovisionamiento: ''
  });
  
  const [transferFilters, setTransferFilters] = useState({
    productId: '',
    productName: '',
    sector: '',
  });

  const handleFilterChange = (name: keyof typeof filters, value: any) => {
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleTableFilterChange = (name: keyof typeof tableFilters, value: string) => {
    setTableFilters(prev => ({ ...prev, [name]: value }));
  };
  
  const handleTransferFilterChange = (name: keyof typeof transferFilters, value: string) => {
    setTransferFilters(prev => ({ ...prev, [name]: value }));
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
    
    // Registrar operación de carga
    const opId = operationTracker.startOperation(
      'DataImport',
      'data_load',
      `Cargando presupuesto de ventas con filtros: años=${filters.años.join(',')}, centros=${filters.centros.length > 0 ? filters.centros.join(',') : 'todos'}`,
      { años: filters.años, meses: filters.meses, centros: filters.centros, etiqueta: filters.etiqueta }
    );
    
    // Capturar contexto de ejecución en RuntimeInspector
    const ctxId = inspector.startContext('load_budget_data', {
      filters: filters,
      timestamp: timestamp
    });
    
    logger.log(`[${timestamp}] --- INICIANDO CARGA DE DATOS DE PRESUPUESTO --- Filtros: años=${filters.años.join(',')}, meses=${filters.meses.join(',')}, centros=${filters.centros.join(',')}, etiqueta=${filters.etiqueta}`,'info');

    if (filters.años.length === 0) {
      addNotification('warning', 'Por favor, seleccione al menos un año.');
      logger.log('Carga de datos cancelada: no se seleccionó ningún año.','warning');
      operationTracker.failOperation(opId, 'No year selected');
      inspector.updateContext(ctxId, 'failed', { error: 'No year selected' });
      setIsProcessing(false);
      return;
    }

    let allData: PresupuestoItem[] = [];
    const yearsToLoad = filters.años.map(Number);
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;

    try {
      addNotification('info', `Iniciando carga de datos de presupuesto... Años: ${yearsToLoad.join(', ')}.`);
      logger.log(`Realizando consultas de presupuesto a la API. Años: ${yearsToLoad.join(', ')}, Meses: ${filters.meses.join(',')}, Centros: ${filters.centros.join(',')}, Etiqueta: ${filters.etiqueta}`,'info');
      
      operationTracker.updateOperation(opId, 'in_progress', 'Consultando API de presupuesto...');
      
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
            const promise = queryApi({ source: 'Presupuesto', operation: 'get_data', filters: queryFilters, pagination: { limit: 200000 } });
            apiCallPromises.push(promise);
          }
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
        
        // Capturar variables importantes en RuntimeInspector
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
        
        // Completar contexto de ejecución
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

    const filteredData = useMemo(() => {
        if (loadedData.length === 0) return [];
        return loadedData.filter(item => {
            return (
                item.etiqueta.toLowerCase().includes(tableFilters.etiqueta.toLowerCase()) &&
                MONTH_NAMES[item.mes - 1].toLowerCase().includes(tableFilters.mes.toLowerCase()) &&
                item.código.toLowerCase().includes(tableFilters.código.toLowerCase()) &&
                item.centro.toLowerCase().includes(tableFilters.centro.toLowerCase()) &&
                item.descripciónMaterial.toLowerCase().includes(tableFilters.descripciónMaterial.toLowerCase()) &&
                (item.claseAprovisionamiento || 'N/A').toLowerCase().includes(tableFilters.claseAprovisionamiento.toLowerCase())
            );
        });
    }, [loadedData, tableFilters]);

    const grandTotal = useMemo(() => {
        return filteredData.reduce((sum, row) => sum + row.unidadesProyectado, 0);
    }, [filteredData]);
    
    const filteredTransferNeeds = useMemo(() => {
        return transferNeeds.filter(item => 
            item.productId.toLowerCase().includes(transferFilters.productId.toLowerCase()) &&
            item.productName.toLowerCase().includes(transferFilters.productName.toLowerCase()) &&
            item.sector.toLowerCase().includes(transferFilters.sector.toLowerCase())
        );
    }, [transferNeeds, transferFilters]);

    const transferTotal = useMemo(() => {
        return filteredTransferNeeds.reduce((sum, item) => sum + item.unitsToTransfer, 0);
    }, [filteredTransferNeeds]);


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
                <h3 className="text-lg font-semibold text-gray-800">Datos de Ventas Cargados y Consolidados</h3>
                <div className="relative max-h-[60vh] overflow-y-auto border rounded-lg shadow-inner mt-2">
                    <table className="min-w-full text-xs divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Etiqueta</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Mes</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Código</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Descripción Material</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Clase de Aprovisionamiento</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Unidades</th>
                            </tr>
                            <tr>
                                <th className="p-1"><input type="text" value={tableFilters.etiqueta} onChange={e => handleTableFilterChange('etiqueta', e.target.value)} className="w-full text-xs p-1 border border-gray-300 rounded" /></th>
                                <th className="p-1"><input type="text" value={tableFilters.mes} onChange={e => handleTableFilterChange('mes', e.target.value)} className="w-full text-xs p-1 border border-gray-300 rounded" /></th>
                                <th className="p-1"><input type="text" value={tableFilters.código} onChange={e => handleTableFilterChange('código', e.target.value)} className="w-full text-xs p-1 border border-gray-300 rounded" /></th>
                                <th className="p-1"><input type="text" value={tableFilters.centro} onChange={e => handleTableFilterChange('centro', e.target.value)} className="w-full text-xs p-1 border border-gray-300 rounded" /></th>
                                <th className="p-1"><input type="text" value={tableFilters.descripciónMaterial} onChange={e => handleTableFilterChange('descripciónMaterial', e.target.value)} className="w-full text-xs p-1 border border-gray-300 rounded" /></th>
                                <th className="p-1"><input type="text" value={tableFilters.claseAprovisionamiento} onChange={e => handleTableFilterChange('claseAprovisionamiento', e.target.value)} className="w-full text-xs p-1 border border-gray-300 rounded" /></th>
                                <th className="p-1"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                           {filteredData.map((item) => (
                              <tr key={item.id}>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-800">{item.etiqueta}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{MONTH_NAMES[item.mes - 1]}</td>
                                  <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-700">{item.código}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{item.centro}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-gray-800">{item.descripciónMaterial}</td>
                                  <td className="px-3 py-2 whitespace-nowrap text-center font-semibold text-gray-700">{item.claseAprovisionamiento}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900">{item.unidadesProyectado.toLocaleString()}</td>
                              </tr>
                            ))}
                        </tbody>
                         <tfoot className="bg-gray-800 text-white sticky bottom-0 z-10">
                            <tr>
                                <th colSpan={6} className="px-3 py-2 text-left font-bold uppercase tracking-wider">TOTAL FILTRADO</th>
                                <th className="px-3 py-2 text-right font-bold uppercase tracking-wider">
                                    {grandTotal.toLocaleString()}
                                </th>
                            </tr>
                        </tfoot>
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
                                    <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Sector</th>
                                    <th className="px-4 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Unidades a Trasladar</th>
                                </tr>
                                <tr>
                                  <th className="p-1"><input type="text" placeholder="Filtrar código..." value={transferFilters.productId} onChange={e => handleTransferFilterChange('productId', e.target.value)} className="w-full text-xs p-1 border border-gray-300 rounded" /></th>
                                  <th className="p-1"><input type="text" placeholder="Filtrar descripción..." value={transferFilters.productName} onChange={e => handleTransferFilterChange('productName', e.target.value)} className="w-full text-xs p-1 border border-gray-300 rounded" /></th>
                                  <th className="p-1"><input type="text" placeholder="Filtrar sector..." value={transferFilters.sector} onChange={e => handleTransferFilterChange('sector', e.target.value)} className="w-full text-xs p-1 border border-gray-300 rounded" /></th>
                                  <th className="p-1"></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredTransferNeeds.map((item) => (
                                    <tr key={item.productId} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 whitespace-nowrap font-mono">{item.productId}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">{item.productName}</td>
                                        <td className="px-4 py-2 whitespace-nowrap">{item.sector}</td>
                                        <td className="px-4 py-2 whitespace-nowrap font-mono text-right font-bold text-blue-700">{item.unitsToTransfer.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                             <tfoot className="bg-gray-800 text-white sticky bottom-0 z-10">
                                <tr>
                                    <th colSpan={3} className="px-3 py-2 text-left font-bold uppercase tracking-wider">TOTAL FILTRADO</th>
                                    <th className="px-3 py-2 text-right font-bold uppercase tracking-wider">
                                        {transferTotal.toLocaleString()}
                                    </th>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}
        </div>
      )}
    </div>
  );
};
