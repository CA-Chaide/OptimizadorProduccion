

import React, { useState, useMemo, useEffect } from 'react';
import { logger } from '@/services/LogService';
import { operationTracker } from '@/services/OperationTracker';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { 
    ProductionPlan, AppConstraints, WorkCenter, ProductionLine, 
    PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment, DetailedProductionPlan, SalesDataRow, ProductionPlanItem, ProcessType, WeeklyPlanItem, MonthlyProductionPlanItem, DemandAnalysisResult, Holiday 
} from '@/types/types';
import { PlanIcon, DataImportIcon, MONTH_NAMES, PROCESS_TYPE_OPTIONS } from '@/constants/constants';
import { exportDailyPlanToExcel, exportMonthlyPlanToExcel, analyzeSalesDemand } from '@/services/OptimizationService';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppProvider';
import { Loader2, Check, ChevronsUpDown, Download } from 'lucide-react';
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";


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


const MonthlySummaryTable: React.FC<{ 
  planItems: MonthlyProductionPlanItem[], 
  title: string,
  planningMonths: { year: number, month: number }[] 
}> = ({ planItems, title, planningMonths }) => {

  const dataBySector = useMemo(() => {
    const sectors: Record<string, {
      byMonth: Record<string, {
        initialStock: number;
        production: number;
        transfersIn: number;
        transfersOut: number;
        dispatches: number;
        finalStock: number;
      }>
    }> = {};

    planItems.forEach(item => {
        // Asumiendo una agregación global por ahora
        const sector = "Global";
        if (!sectors[sector]) {
            sectors[sector] = { byMonth: {} };
        }
        const monthKey = `${item.year}-${String(item.month).padStart(2, '0')}`;
        if (!sectors[sector].byMonth[monthKey]) {
            sectors[sector].byMonth[monthKey] = {
                initialStock: 0, production: 0, dispatches: 0, transfersIn: 0, transfersOut: 0, finalStock: 0
            };
        }
    });

    // Aggregate data
    planItems.forEach(item => {
        const sector = "Global";
        const monthKey = `${item.year}-${String(item.month).padStart(2, '0')}`;
        const monthData = sectors[sector].byMonth[monthKey];
        
        monthData.production += item.totalQuantityToProduce;
        monthData.dispatches += item.dispatches;
        if(item.netTransfers > 0) monthData.transfersIn += item.netTransfers;
        if(item.netTransfers < 0) monthData.transfersOut += Math.abs(item.netTransfers);
    });

    // Calculate initial and final stocks sequentially
    Object.keys(sectors).forEach(sector => {
        let lastMonthStock: number | null = null;
        planningMonths.forEach(({ year, month }) => {
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            const monthData = sectors[sector].byMonth[monthKey];

            if (lastMonthStock !== null) {
                monthData.initialStock = lastMonthStock;
            } else {
                 monthData.initialStock = planItems
                    .filter(p => p.year === year && p.month === month)
                    .reduce((sum, p) => sum + p.initialStock, 0);
            }
            
            monthData.finalStock = monthData.initialStock + monthData.production + monthData.transfersIn - monthData.transfersOut - monthData.dispatches;
            lastMonthStock = monthData.finalStock;
        });
    });

    return sectors;
}, [planItems, planningMonths]);


  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      <div className="relative max-h-[70vh] overflow-y-auto border rounded-lg shadow-inner">
        <table className="min-w-full text-xs divide-y divide-gray-200">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider bg-gray-100 sticky left-0 z-20">Flujo de Inventario</th>
              {planningMonths.map(({year, month}) => (
                <th key={`${year}-${month}`} className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">
                  {MONTH_NAMES[month-1].substring(0,3)} {year}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {Object.entries(dataBySector).map(([sector, sectorData]) => (
                <React.Fragment key={sector}>
                    <tr className="bg-gray-200 font-bold"><td colSpan={planningMonths.length + 1} className="px-3 py-2">{sector}</td></tr>
                    {[
                        { label: 'Saldo Inicial', key: 'initialStock' },
                        { label: '(+) Producción', key: 'production' },
                        { label: '(+) Traslados Entrantes', key: 'transfersIn' },
                        { label: '(-) Despachos', key: 'dispatches' },
                        { label: '(-) Traslados Salientes', key: 'transfersOut' },
                        { label: 'Saldo Final', key: 'finalStock' },
                    ].map(flow => (
                      <tr key={flow.label} className="hover:bg-gray-50">
                        <td className={`px-3 py-2 whitespace-nowrap sticky left-0 bg-white group-hover:bg-gray-50 ${flow.key === 'finalStock' ? 'font-bold': ''}`}>{flow.label}</td>
                        {planningMonths.map(({year, month}) => {
                          const monthKey = `${year}-${String(month).padStart(2, '0')}`;
                          const val = sectorData.byMonth[monthKey]?.[flow.key as keyof typeof sectorData.byMonth[typeof monthKey]] || 0;
                          
                          return (
                            <td key={monthKey} className="px-3 py-2 text-right text-gray-600 font-mono">
                               {Math.round(val).toLocaleString()}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};



export const ProductionPlanSection: React.FC = () => {
  const inspector = useRuntimeInspector('ProductionPlan');
  
  useEffect(() => {
    logger.log(`[ProductionPlanSection] Montado.`);
  }, []);
  
  const { 
    productionPlan, 
    handleGeneratePlan, 
    isLoading, 
    constraints, 
    syncStatus,
    salesData,
    planningProgress,
    planningStep,
    dispatch,
    demandAnalysis,
    apiCuboInventariosData,
    handleContinueToStep2,
    handleContinueToStep3,
  } = useAppContext();

  const isDataSynced = syncStatus?.isSynced || false;
  
  useEffect(() => {
    inspector.captureState({
      isDataSynced,
      isLoading,
      planningStep,
      hasPlan: !!(productionPlan.monthlyPlan.length || productionPlan.weeklyPlan.length || productionPlan.dailyPlan.length),
      salesDataCount: salesData.length,
      demandAnalysisPresent: !!demandAnalysis
    });
  }, [isDataSynced, isLoading, planningStep, productionPlan, salesData, demandAnalysis, inspector]);
  
  const { monthlyPlan = [] } = productionPlan || { monthlyPlan: [] };

  const handleExportMonthly = () => {
    if (monthlyPlan.length > 0) {
      exportMonthlyPlanToExcel(monthlyPlan);
    }
  };

  const handleStartPlanning = async () => {
      if (!isDataSynced) {
        logger.log("Error: Datos de ensamble no sincronizados.", 'error');
        return;
      }
      if (salesData.length === 0) {
        logger.log("Error: No hay datos de ventas.", 'error');
        return;
      }
      if (apiCuboInventariosData.length === 0) {
        logger.log("Error: Los datos de la API de CuboInventarios no están cargados en el contexto.", 'error');
        return;
      }
      dispatch({ type: 'SET_IS_LOADING', payload: true });
      try {
        const analysisResult = await analyzeSalesDemand(salesData, apiCuboInventariosData, constraints);
        dispatch({ type: 'SET_DEMAND_ANALYSIS', payload: analysisResult });
        dispatch({ type: 'SET_PLANNING_STEP', payload: 1 });
      } catch (error) {
        logger.log(`Error en análisis de demanda: ${(error as Error).message}`, 'error');
      } finally {
        dispatch({ type: 'SET_IS_LOADING', payload: false });
      }
  };

  const resetPlanning = () => {
    dispatch({ type: 'RESET_PLANNING' });
  };
  
  const planningMonths = useMemo(() => {
     if (salesData.length === 0) return [];
     const monthSet = new Set<string>();
     salesData.forEach(d => monthSet.add(`${d.año}-${d.mes}`));
     return Array.from(monthSet).sort().map(m => {
       const [year, month] = m.split('-').map(Number);
       return { year, month };
     });
  }, [salesData]);

    const getMonthlyCapacityDetails = (year: number, month: number) => {
        const daysInMonth = new Date(year, month, 0).getDate();
        let workingWeekdays = 0;
        let workingSaturdays = 0;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();
            const holiday = constraints.holidays.find(h => h.date === date.toISOString().split('T')[0]);

            if (holiday && holiday.dayType === 'asueto') continue;

            if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Lunes a Viernes
                 if (!holiday || holiday.isProductionAllowed) workingWeekdays++;
            } else if (dayOfWeek === 6) { // Sábado
                if (!holiday || holiday.isProductionAllowed) workingSaturdays++;
            }
        }
        return { workingWeekdays, workingSaturdays };
    };

    const getLineCapacity = (line: ProductionLine, year: number, month: number): number => {
        const { workingWeekdays, workingSaturdays } = getMonthlyCapacityDetails(year, month);
        const { regularHoursPerDay, extraHoursPerDay, saturdayAndHolidayHours } = constraints.shiftParameters;
        const totalHours = (workingWeekdays * (regularHoursPerDay + extraHoursPerDay)) + (workingSaturdays * saturdayAndHolidayHours);
        return totalHours * 0.87; // Assuming 87% efficiency
    };


  const renderPlanWizard = () => {
    if (planningStep === 0) {
      return (
        <div className="text-center py-10">
          <h3 className="text-lg font-medium text-gray-900">Listo para Planificar</h3>
          <p className="mt-1 text-sm text-gray-500">
            El proceso se realizará en varios pasos para validar los datos agregados.
          </p>
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

    if (planningStep === 1 && demandAnalysis) {
      const { totalDemand, demandByGroup, unclassifiedMaterials } = demandAnalysis;
      return (
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Paso 1: Validación de Demanda de Ventas Bruta</h3>
            <p className="text-sm text-gray-600">
              A continuación se muestra el total de unidades de venta cargadas, agregadas por Clase de Aprovisionamiento, Centro de Demanda y Sector. Verifique que estos totales coincidan con sus expectativas antes de continuar.
            </p>
            <div className="overflow-auto max-h-[50vh] border rounded-lg mt-4">
              <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="bg-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Clase Aprov.</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Centro Demanda</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600">Sector</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600">Total Unidades</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {demandByGroup.map((item, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className={`px-3 py-2 font-mono ${item.claseAprovisionamiento === 'F' ? 'text-blue-600 font-bold' : ''}`}>
                        {item.claseAprovisionamiento}
                      </td>
                      <td className="px-3 py-2">{item.centro}</td>
                      <td className="px-3 py-2">{item.sector}</td>
                      <td className="px-3 py-2 text-right font-semibold">{Math.round(item.totalUnidades).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-800 text-white sticky bottom-0">
                  <tr>
                    <th colSpan={3} className="px-3 py-2 text-left font-bold uppercase">Total General Demanda</th>
                    <th className="px-3 py-2 text-right font-bold uppercase">{Math.round(totalDemand).toLocaleString()}</th>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {unclassifiedMaterials.length > 0 && (
            <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-lg">
                <h4 className="text-md font-semibold text-yellow-800">⚠️ Alerta: Materiales Fabricables sin Clase de Aprovisionamiento</h4>
                <p className="text-xs text-yellow-700 mt-1 mb-3">
                    Los siguientes materiales (código inicia con '3' o '4') no tienen una regla de aprovisionamiento ('E', 'F', 'X') definida en `CuboInventarios` y no podrán ser planificados. Esto puede indicar un error en los datos maestros. Los productos comprados (que no inician con 3 o 4) son omitidos correctamente.
                </p>
                <div className="overflow-auto max-h-48 border rounded-md bg-white">
                    <table className="min-w-full text-xs divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0">
                            <tr>
                                <th className="px-2 py-1 text-left font-semibold text-gray-600">Material</th>
                                <th className="px-2 py-1 text-left font-semibold text-gray-600">Centro</th>
                                <th className="px-2 py-1 text-left font-semibold text-gray-600">Sector</th>
                                <th className="px-2 py-1 text-right font-semibold text-gray-600">Unidades</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {unclassifiedMaterials.map((item, index) => (
                                <tr key={index} className="hover:bg-yellow-100">
                                    <td className="px-2 py-1">
                                        <div className="font-mono text-gray-800">{item.productId}</div>
                                        <div className="text-gray-500">{item.productName}</div>
                                    </td>
                                    <td className="px-2 py-1">{item.centerId}</td>
                                    <td className="px-2 py-1">{item.sector}</td>
                                    <td className="px-2 py-1 text-right font-mono">{Math.round(item.demand).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
          )}

          <div className="flex justify-end space-x-4 pt-4">
            <Button variant="outline" onClick={resetPlanning}>Cancelar y Reiniciar</Button>
            <Button onClick={handleContinueToStep2}>Aceptar y Continuar al Paso 2</Button>
          </div>
        </div>
      );
    }
    
    if (planningStep === 2) {
      return (
        <div className="space-y-6">
          <h3 className="text-lg font-semibold text-gray-800">Paso 2: Validación de Capacidad Instalada (Horas)</h3>
          <p className="text-sm text-gray-600">
            A continuación se muestra un desglose de la capacidad neta disponible (en horas, ya aplicado el 87% de eficiencia) para cada línea de producción en cada mes del horizonte. Verifique que los días y horas por turno sean los correctos.
          </p>
          <div className="overflow-auto max-h-[70vh] border rounded-lg">
             <Accordion type="multiple" className="w-full">
                {planningMonths.map(({year, month}) => {
                    const monthDetails = getMonthlyCapacityDetails(year, month);
                    return (
                        <AccordionItem value={`${year}-${month}`} key={`${year}-${month}`}>
                            <AccordionTrigger className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-t-md">
                                {MONTH_NAMES[month-1]} {year}
                            </AccordionTrigger>
                            <AccordionContent className="p-0">
                                <table className="min-w-full text-xs divide-y divide-gray-200">
                                    <thead className="bg-gray-50">
                                        <tr>
                                            <th className="px-3 py-2 text-left font-semibold text-gray-600">Línea de Producción (Centro)</th>
                                            <th className="px-3 py-2 text-center font-semibold text-gray-600">Días L-V</th>
                                            <th className="px-3 py-2 text-center font-semibold text-gray-600">Sáb/Fer.</th>
                                            <th className="px-3 py-2 text-center font-semibold text-gray-600">Horas/Día (L-V)</th>
                                            <th className="px-3 py-2 text-center font-semibold text-gray-600">Horas/Día (Sáb)</th>
                                            <th className="px-3 py-2 text-right font-bold text-gray-700">Capacidad Neta Total (Horas)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {constraints.productionLines.filter(line => line.isActive).map(line => (
                                            <tr key={line.id}>
                                                <td className="px-3 py-2 font-medium">{line.name} ({line.workCenterId})</td>
                                                <td className="px-3 py-2 text-center">{monthDetails.workingWeekdays}</td>
                                                <td className="px-3 py-2 text-center">{monthDetails.workingSaturdays}</td>
                                                <td className="px-3 py-2 text-center">{constraints.shiftParameters.regularHoursPerDay + constraints.shiftParameters.extraHoursPerDay}</td>
                                                <td className="px-3 py-2 text-center">{constraints.shiftParameters.saturdayAndHolidayHours}</td>
                                                <td className="px-3 py-2 text-right font-bold">{Math.round(getLineCapacity(line, year, month)).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </AccordionContent>
                        </AccordionItem>
                    );
                })}
             </Accordion>
          </div>
          <div className="flex justify-end space-x-4 pt-4">
              <Button variant="outline" onClick={() => dispatch({type: 'SET_PLANNING_STEP', payload: 1})}>Volver al Paso 1</Button>
              <Button onClick={() => dispatch({type: 'SET_PLANNING_STEP', payload: 3})}>Aceptar y Continuar al Paso 3</Button>
          </div>
        </div>
      );
    }

    if (planningStep === 3 && demandAnalysis) {
        const { transfers } = demandAnalysis;
        return (
            <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-800">Paso 3: Validación de Transferencias (Clase 'F')</h3>
                <p className="text-sm text-gray-600">
                    Se ha identificado la siguiente demanda para productos de Clase 'F' en centros de distribución. Esta demanda será planificada en el centro 1000 y luego transferida. Verifique que las cantidades sean correctas.
                </p>
                <div className="overflow-auto max-h-[60vh] border rounded-lg">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-100 sticky top-0 z-10">
                            <tr>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Centro Destino</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Sector</th>
                                <th className="px-3 py-2 text-left font-semibold text-gray-600">Etiqueta</th>
                                <th className="px-3 py-2 text-right font-semibold text-gray-600">Total Unidades a Transferir</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {transfers.map((item, index) => (
                                <tr key={index} className="hover:bg-gray-50">
                                    <td className="px-3 py-2">{item.centro}</td>
                                    <td className="px-3 py-2">{item.sector}</td>
                                    <td className="px-3 py-2">{item.etiqueta}</td>
                                    <td className="px-3 py-2 text-right font-semibold">{Math.round(item.totalUnidades).toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                         <tfoot className="bg-gray-800 text-white sticky bottom-0">
                            <tr>
                                <th colSpan={3} className="px-3 py-2 text-left font-bold uppercase">Total General a Transferir</th>
                                <th className="px-3 py-2 text-right font-bold uppercase">{Math.round(transfers.reduce((sum, item) => sum + item.totalUnidades, 0)).toLocaleString()}</th>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                 <div className="flex justify-end space-x-4 pt-4">
                    <Button variant="outline" onClick={() => dispatch({type: 'SET_PLANNING_STEP', payload: 2})}>Volver al Paso 2</Button>
                    <Button onClick={handleContinueToStep3}>Aceptar y Generar Plan de Producción</Button>
                </div>
            </div>
        );
    }
    
    return null;
  }
  
  // Render main view
  if (monthlyPlan.length > 0 && !isLoading) {
    return (
       <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div className="flex items-center space-x-3">
              <PlanIcon />
              <h2 className="text-2xl font-semibold text-gray-700">Resultados del Plan de Producción</h2>
          </div>
          <div className="flex items-center space-x-4 mt-4 md:mt-0">
              <Button onClick={handleExportMonthly} variant="outline">
                <Download className="mr-2 h-4 w-4" /> Exportar Resumen
              </Button>
              <Button onClick={resetPlanning} variant="destructive">
                Iniciar Nueva Planificación
              </Button>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-lg">
           <MonthlySummaryTable 
              planItems={monthlyPlan} 
              title="Resumen Ejecutivo de Flujo de Inventario" 
              planningMonths={planningMonths}
            />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div className="flex items-center space-x-3">
            <PlanIcon />
            <h2 className="text-2xl font-semibold text-gray-700">Asistente de Planificación a Mediano Plazo</h2>
        </div>
        <div className="flex items-center space-x-4 mt-4 md:mt-0">
            <Button
                onClick={handleStartPlanning}
                disabled={isLoading || !isDataSynced || salesData.length === 0}
                title={!isDataSynced ? 'Debe sincronizar los datos de ensamble primero' : (salesData.length === 0 ? 'Debe importar datos de ventas primero' : 'Iniciar el asistente de planificación')}
            >
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analizando...</> : 'Paso 1: Analizar Demanda'}
            </Button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg min-h-[60vh]">
         {isLoading ? (
             <div className="text-center py-10 flex flex-col items-center justify-center h-full">
                <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mb-4" />
                <h3 className="text-lg font-medium text-gray-900">{planningProgress ? planningProgress.message : 'Analizando...'}</h3>
                 {planningProgress && (
                    <div className="w-full max-w-sm mt-4">
                        <Progress value={(planningProgress.current / planningProgress.total) * 100} />
                        <p className="text-sm text-gray-500 mt-2">{planningProgress.current} de {planningProgress.total}</p>
                    </div>
                )}
            </div>
         ) : renderPlanWizard()}
      </div>
    </div>
  );
};
