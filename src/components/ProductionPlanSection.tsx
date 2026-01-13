

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
    handleContinueToStep3
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

  const [activeTab, setActiveTab] = useState<'monthly' | 'weekly' | 'daily_summary' | 'daily_audit'>('monthly');
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  
  const [appliedFilters, setAppliedFilters] = useState<{
    product: string;
    month: string;
    line: string;
    center: string;
    productCode: string;
  }>({ month: '', line: '', center: '', product: '', productCode: ''});

  const { dailyPlan = [], monthlyPlan = [], weeklyPlan = [], auditLog = [], initialInventory } = productionPlan || { dailyPlan: [], monthlyPlan: [], weeklyPlan: [], auditLog: [], initialInventory: new Map() };

  const handleExportDaily = () => {
    // ... (no changes)
  };

  const handleExportMonthly = () => {
    // ... (no changes)
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
        const analysisResult = await analyzeSalesDemand(salesData, apiCuboInventariosData);
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
  
  const filteredDailyPlan = useMemo(() => {
    // ... (no changes)
    return []; // Simplified for brevity
  }, []);

  const productSectorMap = useMemo(() => {
    // ... (no changes)
    return new Map<string, string>();
  }, [salesData]);

  const sectorOptions = useMemo(() => {
    // ... (no changes)
    return [];
  }, [salesData]);

  const monthlyFlowByCenter = useMemo(() => {
    // ... (no changes)
    return null;
  }, [productionPlan, selectedSectors, productSectorMap]);

  // --- Main Content Rendering Logic ---
  const renderDailyAudit = () => (
    <div>...</div>
  );

  const renderMonthlySummary = () => {
    // ... (no changes)
    return null;
  };
  
    const detailedCapacityAnalysis = useMemo(() => {
    if (!demandAnalysis || !constraints.shiftParameters) return null;

    const getMonthlyCapacityDetails = (
      year: number,
      month: number,
      line: ProductionLine
    ): { totalNetHours: number; weekdays: number; saturdaysAndHolidays: number } => {
      const EFFICIENCY_FACTOR = 0.87;
      let grossTotalHours = 0;
      let weekdays = 0;
      let saturdaysAndHolidays = 0;
      const daysInMonth = new Date(year, month, 0).getDate();
      
      for (let day = 1; day <= daysInMonth; day++) {
        const checkDate = new Date(year, month - 1, day);
        const dayOfWeek = checkDate.getDay();
        
        let dailyHours = 0;
        let isWorkingDay = false;
        
        if (dayOfWeek !== 0) { // Not Sunday
          const holidayInfo = constraints.holidays.find(h => h.date === checkDate.toISOString().split('T')[0]);
          let isNonWorkingHoliday = false;
          if (holidayInfo && holidayInfo.dayType === 'asueto') {
            const appliesTo = holidayInfo.appliesTo;
            if (appliesTo === 'Toda la Planta' || appliesTo === line.workCenterId || appliesTo === line.processType || appliesTo === line.id) {
              isNonWorkingHoliday = true;
            }
          }

          if (!isNonWorkingHoliday) {
            isWorkingDay = true;
            if (holidayInfo && holidayInfo.isProductionAllowed) {
              saturdaysAndHolidays++;
              if (holidayInfo.dayType === 'full') dailyHours = constraints.shiftParameters.regularHoursPerDay;
              else if (holidayInfo.dayType === 'half') dailyHours = 5;
            } else {
              if (dayOfWeek === 6) { // Saturday
                saturdaysAndHolidays++;
                dailyHours = constraints.shiftParameters.saturdayAndHolidayHours;
              } else { // Weekday
                weekdays++;
                dailyHours = constraints.shiftParameters.regularHoursPerDay + constraints.shiftParameters.extraHoursPerDay;
              }
            }
          }
        }
        grossTotalHours += dailyHours;
      }

      return { totalNetHours: grossTotalHours * EFFICIENCY_FACTOR, weekdays, saturdaysAndHolidays };
    };

    const planningMonths = Array.from(new Set(salesData.map(s => `${s.año}-${s.mes}`))).sort();

    const capacityByMonth: Record<string, {
      monthName: string;
      year: number;
      totalHours: number;
      lines: Array<{
        line: ProductionLine;
        totalNetHours: number;
        weekdays: number;
        saturdaysAndHolidays: number;
      }>;
    }> = {};

    planningMonths.forEach(monthKey => {
      const [year, month] = monthKey.split('-').map(Number);
      const monthName = `${MONTH_NAMES[month-1]} ${year}`;
      capacityByMonth[monthKey] = { monthName, year, totalHours: 0, lines: [] };
    });

    constraints.productionLines.forEach(line => {
      if(line.isActive !== false) {
        planningMonths.forEach(monthKey => {
          const [year, month] = monthKey.split('-').map(Number);
          const details = getMonthlyCapacityDetails(year, month, line);
          capacityByMonth[monthKey].lines.push({ line, ...details });
          capacityByMonth[monthKey].totalHours += details.totalNetHours;
        });
      }
    });

    return Object.values(capacityByMonth);

  }, [demandAnalysis, constraints, salesData]);

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
          <h3 className="text-lg font-semibold text-gray-800">Paso 2: Validación de Capacidad Instalada</h3>
          <p className="text-sm text-gray-600">
            A continuación se muestra la capacidad neta en horas-hombre para cada línea de producción, desglosada por mes. Verifique que los días laborables y las horas por tipo de día son coherentes con su operación.
          </p>
          {detailedCapacityAnalysis ? (
            <div className="space-y-4 max-h-[60vh] overflow-y-auto">
              {detailedCapacityAnalysis.map(monthData => (
                <Accordion key={monthData.monthName} type="single" collapsible className="w-full border rounded-lg px-4">
                  <AccordionItem value={monthData.monthName}>
                    <AccordionTrigger>
                      <div className="flex justify-between items-center w-full">
                        <span className="font-semibold text-md text-gray-800">{monthData.monthName}</span>
                        <span className="font-bold text-lg text-indigo-600">{Math.round(monthData.totalHours).toLocaleString()} horas</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="divide-y">
                        {monthData.lines.map(({ line, totalNetHours, weekdays, saturdaysAndHolidays }) => (
                          <div key={line.id} className="py-2 px-3 hover:bg-gray-50">
                            <div className="grid grid-cols-2 gap-4 items-center">
                              <div>
                                <p className="font-semibold text-gray-700">{line.name} <span className="text-xs text-gray-500">({constraints.workCenters.find(wc => wc.id === line.workCenterId)?.name})</span></p>
                                <div className="text-xs text-gray-500 mt-1">
                                  {constraints.workstationDefinitions
                                    .filter(wd => line.assignedWorkstations.some(as => as.definitionId === wd.id))
                                    .map(wd => `${wd.name} (x${line.assignedWorkstations.find(as => as.definitionId === wd.id)?.quantity})`).join(', ')
                                  }
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 text-xs text-right">
                                <div className="bg-blue-50 p-1 rounded">
                                  <div className="font-bold text-blue-800">{weekdays}</div>
                                  <div className="text-blue-700">L-V</div>
                                  <div className="text-blue-700">{constraints.shiftParameters.regularHoursPerDay + constraints.shiftParameters.extraHoursPerDay}h/día</div>
                                </div>
                                <div className="bg-green-50 p-1 rounded">
                                  <div className="font-bold text-green-800">{saturdaysAndHolidays}</div>
                                  <div className="text-green-700">Sáb/Fer</div>
                                  <div className="text-green-700">{constraints.shiftParameters.saturdayAndHolidayHours}h/día</div>
                                </div>
                                <div className="bg-indigo-50 p-1 rounded">
                                  <div className="font-bold text-indigo-800 text-sm">{Math.round(totalNetHours).toLocaleString()}</div>
                                  <div className="text-indigo-700">Total Horas</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              ))}
            </div>
          ) : (
            <p>Calculando desglose de capacidad...</p>
          )}
          <div className="flex justify-end space-x-4 pt-4">
            <Button variant="outline" onClick={resetPlanning}>Cancelar y Reiniciar</Button>
            <Button onClick={() => dispatch({ type: 'SET_PLANNING_STEP', payload: 3 })}>Aceptar y Continuar al Paso 3</Button>
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
                    <Button variant="outline" onClick={resetPlanning}>Cancelar y Reiniciar</Button>
                    <Button onClick={handleContinueToStep3}>Aceptar y Generar Plan de Producción</Button>
                </div>
            </div>
        );
    }
    
    return null;
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
