

import React, { useState, useMemo, useEffect } from 'react';
import { logger } from '@/services/LogService';
import { operationTracker } from '@/services/OperationTracker';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { 
    ProductionPlan, AppConstraints, WorkCenter, ProductionLine, 
    PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment, DetailedProductionPlan, SalesDataRow, ProductionPlanItem, ProcessType, WeeklyPlanItem 
} from '@/types/types';
import { PlanIcon, DataImportIcon, MONTH_NAMES, PROCESS_TYPE_OPTIONS } from '@/constants/constants';
import { exportDailyPlanToExcel, exportMonthlyPlanToExcel } from '@/services/OptimizationService';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppProvider';
import { Loader2, Check, ChevronsUpDown, Download } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';


// --- Reusable MultiSelect Component ---
// ...existing code...
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
  const inspector = useRuntimeInspector('ProductionPlan');
  
  // Ejemplo: log de cambios en filtros y generación de plan
  const [localFilter, setLocalFilter] = useState<string>("");
  const [prorateCurrentMonth, setProrateCurrentMonth] = useState<boolean>(true);

  useEffect(() => {
    logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[ProductionPlanSection] Cambio en localFilter: ${localFilter}`);
    inspector.captureVariable('localFilter', localFilter);
  }, [localFilter]);
  useEffect(() => {
    logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[ProductionPlanSection] Cambio en prorateCurrentMonth: ${prorateCurrentMonth}`);
    inspector.captureVariable('prorateCurrentMonth', prorateCurrentMonth);
  }, [prorateCurrentMonth]);

  useEffect(() => {
    logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[ProductionPlanSection] Montado.`);
  }, []);
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
  
  useEffect(() => {
    inspector.captureState({
      isDataSynced,
      isLoading,
      prorateCurrentMonth,
      hasPlan: !!(productionPlan.monthlyPlan.length || productionPlan.weeklyPlan.length || productionPlan.dailyPlan.length),
      monthlyPlanCount: productionPlan.monthlyPlan.length,
      weeklyPlanCount: productionPlan.weeklyPlan.length,
      dailyPlanCount: productionPlan.dailyPlan.length,
      salesDataCount: salesData.length
    });
  }, [isDataSynced, isLoading, prorateCurrentMonth, productionPlan, salesData]);

  const [activeTab, setActiveTab] = useState<'monthly' | 'weekly' | 'daily'>('monthly');
  
  const [filterInputs, setFilterInputs] = useState<{
    centers: string[];
    processType: string;
    lines: string[];
  }>({ centers: [], processType: '', lines: [] });

  const [appliedFilters, setAppliedFilters] = useState<{
    product: string;
    month: string;
    line: string;
    center: string;
    productCode: string;
  }>({ month: '', line: '', center: '', product: '', productCode: ''});

  const productSectorMap = useMemo(() => {
    const map = new Map<string, string>();
    salesData.forEach(sale => {
      if (!map.has(sale.código)) {
        map.set(sale.código, sale.sector);
      }
    });
    return map;
  }, [salesData]);
  
  const prioritySectors = useMemo(() => new Set(['01 COLCHONES', '02 BASES-CABECERO-CAMA', '03 MUEBLES FABRICACIÓN']), []);

  const { dailyPlan = [], monthlyPlan = [], weeklyPlan = [], auditLog = [], initialInventory } = productionPlan || { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog: [], initialInventory: new Map() };
  
    useEffect(() => {
      if (productionPlan?.initialInventory && productionPlan.initialInventory.size > 0) {
          let totalStockCentro1000 = 0;
          for (const [key, value] of productionPlan.initialInventory.entries()) {
              if (key.endsWith('---1000')) {
                  totalStockCentro1000 += value;
              }
          }
      }
  }, [productionPlan?.initialInventory]);

  const handleExportDaily = () => {
    if (filteredDailyPlan.length > 0) {
      const { logger } = require('@/services/LogService');
      const opId = operationTracker.startOperation(
        'ProductionPlan',
        'data_export',
        `Exportando plan diario a Excel (${filteredDailyPlan.length} filas)`
      );
      logger.log(`Exportando plan diario a Excel. Filas: ${filteredDailyPlan.length}`,'info');
      exportDailyPlanToExcel(filteredDailyPlan, constraints);
      operationTracker.completeOperation(opId, 'Plan diario exportado a Excel');
      logger.log('Exportación de plan diario completada.','success');
    }
  };

  const handleExportMonthly = () => {
    if (monthlyPlan.length > 0) {
      const { logger } = require('@/services/LogService');
      const opId = operationTracker.startOperation(
        'ProductionPlan',
        'data_export',
        `Exportando plan mensual a Excel (${monthlyPlan.length} filas)`
      );
      logger.log(`Exportando plan mensual a Excel. Filas: ${monthlyPlan.length}`,'info');
      exportMonthlyPlanToExcel(monthlyPlan);
      operationTracker.completeOperation(opId, 'Plan mensual exportado a Excel');
      logger.log('Exportación de plan mensual completada.','success');
    }
  };

  const handleStartPlanning = async () => {
    const { logger } = require('@/services/LogService');
    logger.log(`Iniciando generación de plan de producción (prorrateo: ${prorateCurrentMonth}).`,'info');
    
    const opId = operationTracker.startOperation(
      'ProductionPlan',
      'plan_generation',
      `Generando plan (prorrateo: ${prorateCurrentMonth ? 'activado' : 'desactivado'})`,
      { year: new Date().getFullYear(), prorate: prorateCurrentMonth }
    );
    
    const success = await handleGeneratePlan(prorateCurrentMonth);
    
    if (success) {
      operationTracker.completeOperation(opId, 'Plan de producción generado exitosamente');
    } else {
      operationTracker.failOperation(opId, 'Plan generation failed');
    }
    
    logger.log(`Generación de plan de producción finalizada. Éxito: ${success}`,'success');
  };
  
  const handleApplyDailyFilters = () => {
    setAppliedFilters(appliedFilters);
  };
  
  const filteredDailyPlan = useMemo(() => {
    if (!dailyPlan) return [];
    
    const sectorFilteredPlan = dailyPlan.filter(item => {
        const sector = productSectorMap.get(item.productId);
        return sector && prioritySectors.has(sector);
    });

    const { product, month, line, center, productCode } = appliedFilters;
    
    const productNameFilter = product.toLowerCase().trim();
    const productCodeFilter = productCode.toLowerCase().trim();
    const monthFilter = month.toLowerCase().trim();
    const lineFilter = line.toLowerCase().trim();
    const centerFilter = center.toLowerCase().trim();

    if (!productNameFilter && !productCodeFilter && !monthFilter && !lineFilter && !centerFilter) {
      return sectorFilteredPlan;
    }

    const lineNamesMap = new Map(constraints.productionLines.map(l => [l.id, l.name]));

    return sectorFilteredPlan.filter(item => {
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
  }, [dailyPlan, appliedFilters, constraints.productionLines, productSectorMap, prioritySectors]);

  const getFilteredLineIds = useMemo(() => {
    if (filterInputs.centers.length === 0 && !filterInputs.processType && filterInputs.lines.length === 0) {
        return new Set<string>(); // Return empty set if no filters are active, to signal "show all"
    }

    let relevantLineIds: Set<string> | null = null; // Use null to signify "all lines from selected centers"

    if (filterInputs.centers.length > 0) {
        relevantLineIds = new Set<string>(
            constraints.productionLines
                .filter(line => filterInputs.centers.includes(line.workCenterId))
                .map(line => line.id)
        );
    }
    
    if (filterInputs.processType) {
        const linesForProcess = new Set<string>(
            constraints.productionLines
                .filter(line => line.processType === filterInputs.processType)
                .map(line => line.id)
        );

        if (relevantLineIds) {
            relevantLineIds = new Set([...relevantLineIds].filter(id => linesForProcess.has(id)));
        } else {
            relevantLineIds = linesForProcess;
        }
    }
  
    if (filterInputs.lines.length > 0) {
        const selectedLineIds = new Set(filterInputs.lines);
        if (relevantLineIds) {
            relevantLineIds = new Set([...relevantLineIds].filter(id => selectedLineIds.has(id)));
        } else {
            relevantLineIds = selectedLineIds;
        }
    }

    return relevantLineIds ?? new Set<string>();
}, [filterInputs.centers, filterInputs.processType, filterInputs.lines, constraints.productionLines]);

  const monthlyFlowByCenter = useMemo(() => {
    const { monthlyPlan } = productionPlan || { monthlyPlan: [] };
    if (!monthlyPlan || monthlyPlan.length === 0) return null;

    const result: Record<string, { monthKeys: string[], rows: { label: string, values: Record<string, number> }[] }> = {};
    const centerIdsToDisplay = filterInputs.centers.length > 0 ? filterInputs.centers : constraints.workCenters.map(c => c.id);
    const filteredLineIds = getFilteredLineIds;
    
    const monthKeys = Array.from(new Set(monthlyPlan.map(d => `${d.year}-${String(d.month).padStart(2,'0')}`))).sort();

    for(const centerId of centerIdsToDisplay) {
        const aggregatedData: Record<string, Record<string, number>> = {
            'Saldo Inicial': {}, 'Producción': {}, 'Traslados (Neto)': {}, 'Ventas': {}, 'Saldo Final': {}, 'Faltante (Backlog)': {}
        };

        for (const monthKey of monthKeys) {
            const monthItemsForCenter = monthlyPlan.filter(item => 
                item.centerId === centerId &&
                `${item.year}-${String(item.month).padStart(2, '0')}` === monthKey &&
                (filteredLineIds.size === 0 || !item.assignedLineId || filteredLineIds.has(item.assignedLineId)) &&
                (productSectorMap.get(item.productId) && prioritySectors.has(productSectorMap.get(item.productId)!))
            );

            aggregatedData['Saldo Inicial'][monthKey] = monthItemsForCenter.reduce((sum, item) => sum + item.initialStock, 0);
            aggregatedData['Producción'][monthKey] = monthItemsForCenter.reduce((sum, item) => sum + item.totalQuantityToProduce, 0);
            aggregatedData['Ventas'][monthKey] = monthItemsForCenter.reduce((sum, item) => sum + item.totalDemand, 0);
            aggregatedData['Traslados (Neto)'][monthKey] = monthItemsForCenter.reduce((sum, item) => sum + item.netTransfers, 0);
            aggregatedData['Faltante (Backlog)'][monthKey] = monthItemsForCenter.reduce((sum, item) => sum + item.unmetDemand, 0);
            aggregatedData['Saldo Final'][monthKey] = monthItemsForCenter.reduce((sum, item) => sum + item.finalStock, 0);
        }

        const rowOrder = ['Saldo Inicial', 'Producción', 'Traslados (Neto)', 'Ventas', 'Faltante (Backlog)', 'Saldo Final'];
        const rows = rowOrder.map(label => ({ label, values: aggregatedData[label] }));
        result[centerId] = { monthKeys, rows };
    }
    
    return result;
  }, [filterInputs.centers, productionPlan, getFilteredLineIds, constraints.workCenters, productSectorMap, prioritySectors]);
  
  const weeklyFlow = useMemo(() => {
      const { weeklyPlan } = productionPlan || { weeklyPlan: [] };
      if (filterInputs.centers.length === 0 || !weeklyPlan || weeklyPlan.length === 0) return null;

      const result: Record<string, { weekKeys: string[], rows: { label: string, values: Record<string, number> }[] }> = {};
      const filteredLineIds = getFilteredLineIds;
      
      const filteredWeeklyPlan = weeklyPlan.filter(item => {
        const sector = productSectorMap.get(item.productId);
        return sector && prioritySectors.has(sector);
      });

      for(const centerId of filterInputs.centers) {
          const filteredData = filteredWeeklyPlan.filter(item => 
            (item.workCenterId === centerId) &&
            (filteredLineIds.size === 0 || filteredLineIds.has(item.lineId))
          );
          if (filteredData.length === 0) continue;

          const weekKeys = Array.from(new Set(filteredData.map(d => `${d.year}-W${String(d.week).padStart(2,'0')}`))).sort();
          const aggregatedData: Record<string, Record<string, number>> = {
              'Saldo Inicial': {}, 'Producción': {}, 'Ventas': {}, 'Traslados (Neto)': {}, 'Faltante (Backlog)': {}, 'Saldo Final': {}
          };

          weekKeys.forEach(weekKey => {
            const weekItems = filteredData.filter(d => `${d.year}-W${String(d.week).padStart(2,'0')}` === weekKey);
            aggregatedData['Producción'][weekKey] = weekItems.reduce((sum, item) => sum + item.production, 0);
            aggregatedData['Ventas'][weekKey] = weekItems.reduce((sum, item) => sum + item.sales, 0);
            aggregatedData['Traslados (Neto)'][weekKey] = weekItems.reduce((sum, item) => sum + item.netTransfers, 0);
            aggregatedData['Faltante (Backlog)'][weekKey] = weekItems.reduce((sum, item) => sum + (item.unmetDemand || 0), 0);
            
            aggregatedData['Saldo Inicial'][weekKey] = weekItems.reduce((sum, item) => sum + item.initialStock, 0);
            aggregatedData['Saldo Final'][weekKey] = weekItems.reduce((sum, item) => sum + item.finalStock, 0);
          });
          
          const rowOrder = ['Saldo Inicial', 'Producción', 'Traslados (Neto)', 'Ventas', 'Faltante (Backlog)', 'Saldo Final'];
          const rows = rowOrder.map(label => ({ label, values: aggregatedData[label] }));
          result[centerId] = { weekKeys, rows };
      }
      return result;
  }, [filterInputs.centers, productionPlan, getFilteredLineIds, productSectorMap, prioritySectors]);

  const availableLinesForFilter = useMemo(() => {
    let lines = constraints.productionLines;
    if (filterInputs.centers.length > 0) {
      lines = lines.filter(line => filterInputs.centers.includes(line.workCenterId));
    }
    if (filterInputs.processType) {
      lines = lines.filter(line => line.processType === filterInputs.processType);
    }
    return lines.map(line => ({
        value: line.id,
        label: `${line.name} (${line.workCenterId})`
    }));
  }, [filterInputs.centers, filterInputs.processType, constraints.productionLines]);

  const renderContentForTab = (tab: 'monthly' | 'weekly' | 'daily') => {
      switch (tab) {
          case 'monthly': return renderMonthlySummary();
          case 'weekly': return renderWeeklySummary();
          case 'daily': return renderDailyPlan();
          default: return null;
      }
  };


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

  const renderSummaryView = (
      flowByCenter: Record<string, { monthKeys?: string[], weekKeys?: string[], rows: { label: string, values: Record<string, number> }[] }> | null,
      type: 'monthly' | 'weekly'
  ) => {
    if (filterInputs.centers.length === 0) {
      return <div className="text-center py-10 text-gray-500">Por favor, seleccione uno o más centros para ver el resumen.</div>;
    }
    if (!flowByCenter || Object.keys(flowByCenter).length === 0) {
        return <div className="text-center py-10 text-gray-500">No hay datos de planificación para la combinación de filtros seleccionada.</div>;
    }
    
    return (
        <div className="space-y-6">
            {filterInputs.centers.map(centerId => {
                const flow = (flowByCenter as any)[centerId];
                if (!flow) return null;

                const keys = type === 'monthly' ? flow.monthKeys : flow.weekKeys;
                const keyPrefix = type === 'monthly' ? '' : 'S';

                return (
                    <div key={centerId}>
                        <h4 className="text-lg font-semibold text-gray-800 mb-2">Resumen para Centro: {constraints.workCenters.find(c => c.id === centerId)?.name || centerId}</h4>
                        <div className="overflow-x-auto border rounded-lg">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-100">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-100 z-10">Métrica</th>
                                {keys.map((key: string) => {
                                    const [year, num] = key.split(type === 'monthly' ? '-' : '-W');
                                    const label = type === 'monthly' ? `${MONTH_NAMES[parseInt(num,10) -1].substring(0,3)} '${year.slice(-2)}` : `${keyPrefix}${num}`;
                                    return <th key={key} className="px-3 py-2 text-right font-semibold text-gray-600">{label}</th>;
                                })}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {flow.rows.map((row: any) => (
                                <tr key={row.label} className="hover:bg-gray-50 group">
                                  <td className={`px-3 py-2 font-medium sticky left-0 bg-white group-hover:bg-gray-50 z-10 ${row.label === 'Saldo Final' ? 'font-bold' : ''} ${row.label === 'Faltante (Backlog)' ? 'text-red-700' : ''}`}>{row.label}</td>
                                  {keys.map((key: string) => (
                                    <td key={`${row.label}-${key}`} className={`px-3 py-2 text-right ${row.label === 'Saldo Final' ? 'font-bold bg-gray-50' : ''} ${row.label === 'Traslados (Neto)' && (row.values[key] || 0) < 0 ? 'text-orange-600' : (row.label === 'Traslados (Neto)' && (row.values[key] || 0) > 0 ? 'text-blue-600' : (row.label === 'Faltante (Backlog)' && (row.values[key] || 0) > 0 ? 'text-red-700 font-bold' : 'text-gray-700'))}`}>
                                       {(isNaN(row.values[key])) ? 'N/A' : (row.label === 'Faltante (Backlog)' && (row.values[key] || 0) > 0 ? '-' : '') + Math.round(row.values[key] || 0).toLocaleString()}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };
  
  const renderMonthlySummary = () => (
     <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 border rounded-lg bg-gray-50 items-start">
         <FilterControls />
      </div>
      {renderSummaryView(monthlyFlowByCenter, 'monthly')}
    </div>
  );

  const renderWeeklySummary = () => (
     <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 border rounded-lg bg-gray-50 items-start">
         <FilterControls />
      </div>
      {renderSummaryView(weeklyFlow, 'weekly')}
    </div>
  );

  const FilterControls = () => (
      <>
        <div>
            <MultiSelect
                label="Centro(s) de Trabajo"
                options={constraints.workCenters.map(c => ({ value: c.id, label: c.name }))}
                selected={filterInputs.centers}
                onChange={selectedCenters => setFilterInputs({ ...filterInputs, centers: selectedCenters, processType: '', lines: [] })}
                placeholder="Seleccione Centro(s)"
            />
        </div>
        <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Tipo de Proceso</label>
            <select value={filterInputs.processType} onChange={e => setFilterInputs({ ...filterInputs, processType: e.target.value, lines: [] })} className="w-full text-xs p-2 mt-1 border border-gray-300 rounded h-9" disabled={filterInputs.centers.length === 0}>
                <option value="">Todos</option>
                {PROCESS_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
        </div>
        <div>
            <MultiSelect
                label="Línea(s) de Producción"
                options={availableLinesForFilter}
                selected={filterInputs.lines}
                onChange={selectedLines => setFilterInputs({ ...filterInputs, lines: selectedLines })}
                placeholder="Todas las Líneas"
                className={availableLinesForFilter.length === 0 ? 'opacity-50' : ''}
            />
        </div>
      </>
  );
  
  const renderPlanResult = () => {
      const noPlanGenerated = weeklyPlan.length === 0 && dailyPlan.length === 0 && monthlyPlan.length === 0;

      if (noPlanGenerated && auditLog.length === 0) {
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
      
      if (noPlanGenerated && auditLog.length > 0) {
          return (
              <div className="p-4">
                  <h3 className="text-lg font-medium text-red-700">El plan de producción está vacío o contiene errores.</h3>
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
                    <button onClick={() => setActiveTab('monthly')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'monthly' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Resumen Mensual por Línea</button>
                    <button onClick={() => setActiveTab('weekly')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'weekly' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Resumen Semanal por Línea</button>
                    <button onClick={() => setActiveTab('daily')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'daily' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Auditoría Diaria (Avanzado)</button>
                </nav>
                 <div>
                    {activeTab === 'monthly' && monthlyPlan.length > 0 && 
                        <Button onClick={handleExportMonthly} variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />Exportar Mensual</Button>}
                    {activeTab === 'daily' && dailyPlan.length > 0 && 
                        <Button onClick={handleExportDaily} variant="outline" size="sm"><Download className="mr-2 h-4 w-4" />Exportar Diario</Button>}
                </div>
            </div>
            {renderContentForTab(activeTab)}
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
        <div className="flex items-center space-x-4 mt-4 md:mt-0">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="prorate-checkbox"
                checked={prorateCurrentMonth}
                onCheckedChange={(checked) => setProrateCurrentMonth(checked as boolean)}
                disabled={isLoading}
              />
              <label htmlFor="prorate-checkbox" className="text-sm font-medium text-gray-700 cursor-pointer">
                Prorratear mes actual según días restantes
              </label>
            </div>
            <Button
                onClick={handleStartPlanning}
                disabled={isLoading || !isDataSynced || salesData.length === 0}
                title={!isDataSynced ? 'Debe sincronizar los datos de ensamble en la pestaña de restricciones primero' : (salesData.length === 0 ? 'Debe importar datos de ventas primero' : 'Generar o regenerar el plan de producción')}
            >
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analizando...</> : (productionPlan.dailyPlan.length > 0 || productionPlan.weeklyPlan.length > 0 ? 'Regenerar Plan' : 'Iniciar Planificación')}
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
