

import React, { useState, useMemo, useEffect } from 'react';
import { 
    ProductionPlan, AppConstraints, WorkCenter, ProductionLine, 
    PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment, DetailedProductionPlan, SalesDataRow, ProductionPlanItem, ProcessType 
} from '@/types/types';
import { PlanIcon, DataImportIcon, MONTH_NAMES, PROCESS_TYPE_OPTIONS } from '@/constants/constants';
import { exportDailyPlanToExcel, exportMonthlyPlanToExcel } from '@/services/OptimizationService';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppProvider';
import { Loader2, Check, ChevronsUpDown } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';


// --- Reusable MultiSelect Component ---
const MultiSelect: React.FC<{
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  className?: string;
  placeholder?: string;
}> = ({ label, options, selected, onChange, className, placeholder }) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 font-normal text-xs"
          >
            <span className="truncate">
              {selected.length === 0
                ? (placeholder || `Seleccionar ${label}...`)
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
                    handleSelect(option.value); // Use option.value directly
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
      <div className="pt-1 min-h-[18px]">
        {selected.map(value => {
            const label = options.find(opt => opt.value === value)?.label;
            return (
                <Badge key={value} variant="secondary" className="mr-1 mb-1 text-xs">
                {label}
                </Badge>
            );
        })}
      </div>
    </div>
  );
};


interface FilterInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  containerClassName?: string;
}

// --- Reusable Filter Input ---
const FilterInput: React.FC<FilterInputProps> = ({ label, value, onChange, placeholder, containerClassName }) => (
  <div className={containerClassName}>
    <label className="block text-xs font-medium text-gray-500">{label}</label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-xs p-1 mt-1 border border-gray-300 rounded"
      placeholder={placeholder || `Filtrar ${label}...`}
    />
  </div>
);

// --- Memoized Row for Performance ---
const DailyPlanRow = React.memo(({ item, lineName }: { item: ProductionPlanItem; lineName: string }) => (
    <tr key={item.id} className={`hover:bg-gray-50 ${item.quantityToProduce > 0 ? 'bg-green-50' : ''} ${item.isTransfer ? 'bg-blue-50' : ''}`}>
        <td className="px-2 py-1">{`${String(item.day).padStart(2,'0')}/${String(item.month).padStart(2,'0')}/${item.year}`}</td>
        <td className="px-2 py-1 font-medium">{item.productName}</td>
        <td className="px-2 py-1 font-mono">{item.productId}</td>
        <td className="px-2 py-1 text-right">{Math.round(item.initialStockOnDay).toLocaleString()}</td>
        <td className="px-2 py-1 text-right text-green-600 font-bold">{item.isTransfer ? 0 : Math.round(item.quantityToProduce).toLocaleString()}</td>
        <td className="px-2 py-1 text-right text-blue-600">{item.isTransfer && item.transferDestinationCenterId === item.demandCenterId ? Math.round(item.quantityToProduce).toLocaleString() : 0}</td>
        <td className="px-2 py-1 text-right text-orange-600">{item.isTransfer && item.transferSourceCenterId === item.demandCenterId ? Math.round(item.quantityToProduce).toLocaleString() : 0}</td>
        <td className="px-2 py-1 text-right text-red-600">{Math.round(item.demandOnDay).toLocaleString()}</td>
        <td className="px-2 py-1 text-right font-bold">{Math.round(item.finalStockOnDay).toLocaleString()}</td>
        <td className="px-2 py-1">{lineName}</td>
        <td className="px-2 py-1">{item.producingCenterId}</td>
        <td className="px-2 py-1">{item.demandCenterId}</td>
        <td className="px-2 py-1 text-right">{item.hoursWorked.toFixed(2)}</td>
    </tr>
));
DailyPlanRow.displayName = 'DailyPlanRow';


export const ProductionPlanSection: React.FC = () => {
  const { 
    productionPlan, 
    handleGeneratePlan, 
    isLoading, 
    constraints, 
    syncStatus,
    salesData,
    planningProgress,
  } = useAppContext();

  const isDataSynced = syncStatus?.isSynced || false;

  const [activeTab, setActiveTab] = useState<'weekly' | 'daily'>('weekly');
  
  const [filterInputs, setFilterInputs] = useState<{
    center: string;
    processType: string;
    lines: string[];
  }>({ center: '', processType: '', lines: [] });

  const [appliedFilters, setAppliedFilters] = useState<{
    product: string;
    month: string;
    line: string;
    center: string;
    productCode: string;
  }>({ month: '', line: '', center: '', product: '', productCode: ''});


  const { dailyPlan = [], monthlyPlan = [], weeklyPlan = [], auditLog = [] } = productionPlan || { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog: [] };
  
  const handleExportDaily = () => {
    if (filteredDailyPlan.length > 0) {
      exportDailyPlanToExcel(filteredDailyPlan, constraints);
    }
  };

  const handleStartPlanning = async () => {
    const success = await handleGeneratePlan();
  };
  
  const handleApplyDailyFilters = () => {
    setAppliedFilters(appliedFilters);
  };
  
  const filteredDailyPlan = useMemo(() => {
    if (!dailyPlan) return [];
    
    const { product, month, line, center, productCode } = appliedFilters;
    
    const productNameFilter = product.toLowerCase().trim();
    const productCodeFilter = productCode.toLowerCase().trim();
    const monthFilter = month.toLowerCase().trim();
    const lineFilter = line.toLowerCase().trim();
    const centerFilter = center.toLowerCase().trim();

    if (!productNameFilter && !productCodeFilter && !monthFilter && !lineFilter && !centerFilter) {
      return dailyPlan;
    }

    const lineNamesMap = new Map(constraints.productionLines.map(l => [l.id, l.name]));

    return dailyPlan.filter(item => {
        if (monthFilter && !MONTH_NAMES[item.month - 1].toLowerCase().includes(monthFilter)) {
            return false;
        }

        const lineName = lineNamesMap.get(item.assignedLineId || '') || '';
        if (lineFilter && !lineName.toLowerCase().includes(lineFilter)) {
            return false;
        }
        
        if (centerFilter && 
            !(
                (item.producingCenterId || '').toLowerCase().includes(centerFilter) || 
                (item.demandCenterId || '').toLowerCase().includes(centerFilter)
            )
        ) {
            return false;
        }

        if (productNameFilter && !item.productName.toLowerCase().includes(productNameFilter)) {
            return false;
        }
        
        if (productCodeFilter && !item.productId.toLowerCase().includes(productCodeFilter)) {
            return false;
        }

        return true;
    });
  }, [dailyPlan, appliedFilters, constraints.productionLines]);

  
  const weeklyFlow = useMemo(() => {
      const { weeklyPlan } = productionPlan || { weeklyPlan: [] };
      if (!filterInputs.center || filterInputs.lines.length === 0 || !weeklyPlan || weeklyPlan.length === 0) return null;

      const filteredData = weeklyPlan.filter(
          item => item.workCenterId === filterInputs.center && filterInputs.lines.includes(item.lineId)
      );
      
      if (filteredData.length === 0) return null;
      
      const weekKeys = Array.from(new Set(filteredData.map(d => `${d.year}-W${d.week}`))).sort();
      
      const aggregatedData: Record<string, Record<string, number>> = {
          'Saldo Inicial': {}, 'Producción': {}, 'Ventas': {}, 'Traslados (Neto)': {}, 'Saldo Final': {}
      };

      weekKeys.forEach(weekKey => {
        const stockKey = `${filterInputs.center}-${filterInputs.lines.join(',')}`;
        const weekItems = filteredData.filter(d => `${d.year}-W${d.week}` === weekKey);
        
        aggregatedData['Producción'][weekKey] = weekItems.reduce((sum, item) => sum + item.production, 0);
        aggregatedData['Ventas'][weekKey] = weekItems.reduce((sum, item) => sum + item.sales, 0);
        aggregatedData['Traslados (Neto)'][weekKey] = weekItems.reduce((sum, item) => sum + item.netTransfers, 0);
      });
      
      let lastFinalStock = 0;
      const initialStocksForLines = filterInputs.lines.map(lineId => {
          const firstWeekData = filteredData.find(d => d.lineId === lineId);
          return firstWeekData ? firstWeekData.initialStock : 0;
      });
      lastFinalStock = initialStocksForLines.reduce((sum, stock) => sum + stock, 0);


      weekKeys.forEach(weekKey => {
          aggregatedData['Saldo Inicial'][weekKey] = lastFinalStock;
          const finalStock = lastFinalStock 
                             + (aggregatedData['Producción'][weekKey] || 0)
                             + (aggregatedData['Traslados (Neto)'][weekKey] || 0)
                             - (aggregatedData['Ventas'][weekKey] || 0);
          aggregatedData['Saldo Final'][weekKey] = finalStock;
          lastFinalStock = finalStock;
      });

      const rowOrder = ['Saldo Inicial', 'Producción', 'Ventas', 'Traslados (Neto)', 'Saldo Final'];
      const rows = rowOrder.map(label => ({ label, values: aggregatedData[label] }));

      return { weekKeys, rows };
  }, [filterInputs, productionPlan]);

  const availableLinesForFilter = useMemo(() => {
      if (!filterInputs.center || !filterInputs.processType) return [];
      return constraints.productionLines.filter(line => line.workCenterId === filterInputs.center && line.processType === filterInputs.processType);
  }, [filterInputs.center, filterInputs.processType, constraints.productionLines]);


  // --- Main Content Rendering Logic ---
  const renderDailyPlan = () => (
    <div className="space-y-4">
       <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end p-4 border rounded-lg bg-gray-50">
          <FilterInput label="Mes" value={appliedFilters.month} onChange={v => setAppliedFilters(f => ({...f, month: v}))} placeholder="ej: Enero" />
          <FilterInput label="Línea" value={appliedFilters.line} onChange={v => setAppliedFilters(f => ({...f, line: v}))} />
          <FilterInput label="Centro" value={appliedFilters.center} onChange={v => setAppliedFilters(f => ({...f, center: v}))} />
          <FilterInput label="Nombre Producto" value={appliedFilters.product} onChange={v => setAppliedFilters(f => ({...f, product: v}))} />
          <FilterInput label="Producto (Cód)" value={appliedFilters.productCode} onChange={v => setAppliedFilters(f => ({...f, productCode: v}))} />
          <Button onClick={handleApplyDailyFilters} className="w-full h-9">Aplicar Filtros</Button>
       </div>
       <p className="text-xs text-gray-500">Esta es una vista de auditoría avanzada que muestra el detalle de cada día. Puede ser lenta de cargar.</p>
       <div className="overflow-auto max-h-[60vh] border rounded-lg">
         <table className="min-w-full text-xs divide-y divide-gray-200 whitespace-nowrap">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Fecha</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Nombre Producto</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto (Cód)</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Inicial</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Producción</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">T. Entrante</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">T. Saliente</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Demanda</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Final</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Línea</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro Prod.</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro Demanda</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Horas Req.</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {filteredDailyPlan.map(item => {
                    const lineName = constraints.productionLines.find(l => l.id === item.assignedLineId)?.name || 'N/A';
                    return <DailyPlanRow key={item.id} item={item} lineName={lineName} />;
                })}
            </tbody>
          </table>
       </div>
    </div>
  );
  
  const renderWeeklySummary = () => (
     <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 border rounded-lg bg-gray-50 items-start">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Centro de Trabajo</label>
             <select value={filterInputs.center} onChange={e => setFilterInputs({ ...filterInputs, center: e.target.value, processType: '', lines: [] })} className="w-full text-xs p-2 mt-1 border border-gray-300 rounded h-9">
                <option value="">Seleccione Centro</option>
                {constraints.workCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de Proceso</label>
             <select value={filterInputs.processType} onChange={e => setFilterInputs({ ...filterInputs, processType: e.target.value, lines: [] })} className="w-full text-xs p-2 mt-1 border border-gray-300 rounded h-9" disabled={!filterInputs.center}>
                <option value="">Seleccione Proceso</option>
                {PROCESS_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
           <div>
              <MultiSelect
                label="Línea(s) de Producción"
                options={availableLinesForFilter.map(l => ({ value: l.id, label: l.name }))}
                selected={filterInputs.lines}
                onChange={selectedLines => setFilterInputs({ ...filterInputs, lines: selectedLines })}
                placeholder="Seleccione Línea(s)"
                className={!filterInputs.processType ? 'opacity-50' : ''}
              />
          </div>
      </div>
      
       {!filterInputs.center || filterInputs.lines.length === 0 ? (
        <div className="text-center py-10 text-gray-500">Por favor, seleccione un centro, tipo de proceso y una o más líneas para ver el resumen.</div>
      ) : !weeklyFlow || weeklyFlow.weekKeys.length === 0 ? (
        <div className="text-center py-10 text-gray-500">No hay datos de planificación para la combinación de filtros seleccionada.</div>
      ) : (
       <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-100 z-10">Métrica</th>
              {weeklyFlow.weekKeys.map(weekKey => {
                  const [year, weekNum] = weekKey.split('-W');
                  return <th key={weekKey} className="px-3 py-2 text-right font-semibold text-gray-600">{`Sem ${weekNum} '${year.slice(-2)}`}</th>
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {weeklyFlow.rows.map(row => (
              <tr key={row.label} className="hover:bg-gray-50 group">
                <td className={`px-3 py-2 font-medium sticky left-0 bg-white group-hover:bg-gray-50 z-10 ${row.label === 'Saldo Final' ? 'font-bold' : ''}`}>{row.label}</td>
                {weeklyFlow.weekKeys.map(weekKey => (
                  <td key={`${row.label}-${weekKey}`} className={`px-3 py-2 text-right ${row.label === 'Saldo Final' ? 'font-bold bg-gray-50' : ''}`}>
                    {Math.round(row.values[weekKey] || 0).toLocaleString()}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
       </div>
      )}
    </div>
  );
  
  const renderPlanResult = () => {
      if (dailyPlan.length === 0 && auditLog.length === 0) {
          return (
            <div className="text-center py-10">
                <h3 className="text-lg font-medium text-gray-900">Listo para Planificar</h3>
                <p className="mt-1 text-sm text-gray-500">Presione "Iniciar Planificación" para comenzar el proceso de cálculo.</p>
                 {!isDataSynced && (
                    <p className="mt-4 text-sm text-yellow-600 bg-yellow-50 p-3 rounded-md">
                       ⚠️ Atención: Los datos de configuración y tiempos no están sincronizados. Vaya a la sección de <span className="font-bold">Definir Restricciones</span> y presione el botón de sincronización antes de generar un plan.
                    </p>
                )}
                 {isDataSynced && salesData.length === 0 && (
                    <p className="mt-4 text-sm text-yellow-600 bg-yellow-50 p-3 rounded-md">
                       ⚠️ Atención: No se han cargado datos de ventas. Por favor, vaya a la sección de <span className="font-bold">Importar Ventas</span>.
                    </p>
                 )}
            </div>
          );
      }
      
      if (dailyPlan.length === 0 && auditLog.length > 0) {
          return (
              <div className="text-center py-10">
                  <h3 className="text-lg font-medium text-gray-900">El plan de producción está vacío.</h3>
                  <p className="mt-1 text-sm text-gray-500">
                      La planificación no generó ningún resultado. Esto puede deberse a que no hay demanda en los datos de ventas o a inconsistencias en los datos maestros.
                      Revise la bitácora del planificador para más detalles.
                  </p>
                  <div className="p-4 bg-gray-900 text-white font-mono text-xs rounded-lg max-h-[40vh] overflow-y-auto mt-4 text-left">
                    <pre>{auditLog.join('\n')}</pre>
                  </div>
              </div>
          );
      }

      return (
         <div>
            <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
                <nav className="flex space-x-2" aria-label="Tabs">
                    <button onClick={() => setActiveTab('weekly')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'weekly' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Resumen Semanal por Línea</button>
                    <button onClick={() => setActiveTab('daily')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'daily' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Auditoría Diaria (Avanzado)</button>
                </nav>
                 <div>
                  {activeTab === 'daily' && dailyPlan.length > 0 && <Button onClick={handleExportDaily} variant="outline" size="sm">Exportar Diario</Button>}
                </div>
            </div>
            {activeTab === 'weekly' ? renderWeeklySummary() : renderDailyPlan()}
         </div>
      );
  };
  
  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div className="flex items-center space-x-3">
            <PlanIcon />
            <h2 className="text-2xl font-semibold text-gray-700">Plan de Producción a Mediano Plazo</h2>
        </div>
        <div className="flex items-center space-x-2 mt-4 md:mt-0">
            <Button
                onClick={handleStartPlanning}
                disabled={isLoading || !isDataSynced || salesData.length === 0}
                title={!isDataSynced ? 'Debe sincronizar los datos de ensamble en la pestaña de restricciones primero' : (salesData.length === 0 ? 'Debe importar datos de ventas primero' : 'Generar o regenerar el plan de producción')}
            >
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analizando...</> : (productionPlan.dailyPlan.length > 0 ? 'Regenerar Plan' : 'Iniciar Planificación')}
            </Button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg min-h-[60vh]">
         {isLoading ? (
             <div className="text-center py-10 flex flex-col items-center justify-center h-full">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                <h3 className="text-lg font-medium text-gray-900">Procesando Plan de Producción...</h3>
                {planningProgress && (
                    <div className="mt-4 w-full max-w-md text-left">
                        <p className="text-sm text-gray-600 font-medium">{planningProgress.message}</p>
                        <Progress value={(planningProgress.current / planningProgress.total) * 100} className="w-full mt-2" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                            <span>{planningProgress.step === 'monthly' ? `Mes: ${planningProgress.current}/${planningProgress.total}` : `Día: ${planningProgress.current}/${planningProgress.total}`}</span>
                        </div>
                    </div>
                )}
            </div>
         ) : renderPlanResult()}
      </div>
    </div>
  );
};
