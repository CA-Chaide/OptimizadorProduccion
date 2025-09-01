

import React, { useState, useMemo, useEffect } from 'react';
import { 
    ProductionPlan, AppConstraints, WorkCenter, ProductionLine, 
    PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment, DetailedProductionPlan, SalesDataRow, ProductionPlanItem 
} from '@/types/types';
import { PlanIcon, DataImportIcon } from '@/constants/constants';
import { exportDailyPlanToExcel, exportMonthlyPlanToExcel } from '@/services/OptimizationService';
import { MONTH_NAMES, PROCESS_TYPE_OPTIONS } from '@/constants/constants';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppProvider';

type PlanningStep = 'idle' | 'groups' | 'needs' | 'assignments' | 'finalPlan';

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
    <tr key={item.id} className="hover:bg-gray-50">
        <td className="px-2 py-1">{`${String(item.day).padStart(2,'0')}/${String(item.month).padStart(2,'0')}/${item.year}`}</td>
        <td className="px-2 py-1 font-medium">{item.productName}</td>
        <td className="px-2 py-1 font-mono">{item.productId}</td>
        <td className="px-2 py-1 text-right">{Math.round(item.initialStockOnDay).toLocaleString()}</td>
        <td className="px-2 py-1 text-right text-red-600">{Math.round(item.demandOnDay).toLocaleString()}</td>
        <td className="px-2 py-1 text-right font-bold text-green-600">{Math.round(item.quantityToProduce).toLocaleString()}</td>
        <td className="px-2 py-1 text-right">{Math.round(item.finalStockOnDay).toLocaleString()}</td>
        <td className="px-2 py-1">{lineName}</td>
        <td className="px-2 py-1">{item.producingCenterId}</td>
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
    detailedProductionPlan,
    syncStatus,
    salesData,
  } = useAppContext();

  const isDataSynced = syncStatus?.isSynced || false;

  const [activeTab, setActiveTab] = useState<'daily' | 'monthly'>('daily');
  const [planningStep, setPlanningStep] = useState<PlanningStep>('idle');
  
  // Filters for each step
  const [dailyFilters, setDailyFilters] = useState({ month: '', line: '', center: '', product: ''});
  const [monthlyFilters, setMonthlyFilters] = useState({ processType: '', center: '' });
  const [groupFilters, setGroupFilters] = useState({ product: '', center: '' });
  const [needsFilters, setNeedsFilters] = useState({ product: '', center: '' });
  const [assignmentsFilters, setAssignmentsFilters] = useState({ product: '', center: '', line: '' });


  const { dailyPlan = [], monthlyPlan = [], auditLog = [] } = productionPlan || {};
  
  const handleExportDaily = () => {
    if (filteredDailyPlan.length > 0) {
      exportDailyPlanToExcel(filteredDailyPlan, constraints);
    }
  };
  const handleExportMonthly = () => {
    // This function needs to be implemented based on the final data structure of the monthly flow.
    // For now it is disabled.
    alert("Función de exportación mensual no implementada todavía.");
  };
  
  const handleStartPlanning = async () => {
    const success = await handleGeneratePlan();
    if(success) {
      setPlanningStep('groups');
    } else {
      setPlanningStep('idle');
    }
  };
  
  const handleNextStep = () => {
    setPlanningStep(prev => {
      if (prev === 'groups') return 'needs';
      if (prev === 'needs') return 'assignments';
      if (prev === 'assignments') return 'finalPlan';
      return prev;
    });
  };
  
  const handleReset = () => {
    setPlanningStep('idle');
  };

  // --- Memos for final plan display ---
  const filteredDailyPlan = useMemo(() => {
    if (!dailyPlan) return [];
    return dailyPlan.filter(item => {
        const lineName = constraints.productionLines.find(l => l.id === item.assignedLineId)?.name || item.assignedLineId;
        const monthMatch = dailyFilters.month ? MONTH_NAMES[item.month - 1].toLowerCase().includes(dailyFilters.month.toLowerCase()) : true;
        const lineMatch = dailyFilters.line ? lineName?.toLowerCase().includes(dailyFilters.line.toLowerCase()) : true;
        const centerMatch = dailyFilters.center ? item.producingCenterId?.toLowerCase().includes(dailyFilters.center.toLowerCase()) : true;
        const productMatch = dailyFilters.product
            ? item.productId.toLowerCase().includes(dailyFilters.product.toLowerCase()) || item.productName.toLowerCase().includes(dailyFilters.product.toLowerCase())
            : true;
        return monthMatch && lineMatch && centerMatch && productMatch;
    });
  }, [dailyPlan, dailyFilters, constraints.productionLines]);

  const monthlyInventoryFlow = useMemo(() => {
    if (!monthlyFilters.center || !monthlyFilters.processType) return null;

    const relevantLineIds = new Set(
        constraints.productionLines
            .filter(l => l.processType === monthlyFilters.processType && l.workCenterId === monthlyFilters.center)
            .map(l => l.id)
    );

    const relevantProductIds = new Set(
        constraints.productProcessInfos
            .filter(ppi => relevantLineIds.has(ppi.productionLineId))
            .map(ppi => ppi.productId)
    );

    const planningMonths = Array.from(new Set(salesData.map(s => `${s.año}-${String(s.mes).padStart(2, '0')}`))).sort();

    const initialStock = constraints.inventorySettings
        .filter(is => relevantProductIds.has(is.itemId) && is.centerId === monthlyFilters.center)
        .reduce((sum, is) => sum + is.currentStock, 0);

    const data: Record<string, Record<string, number>> = {
      'Saldo Inicial': {}, 'U. Planificadas': {}, 'Traslados (Neto)': {},
      'Ventas': {}, 'Saldo Final': {}
    };

    let lastMonthStock = initialStock;

    planningMonths.forEach((monthKey, index) => {
        const [yearStr, monthStr] = monthKey.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);

        data['Saldo Inicial'][monthKey] = (index === 0) ? initialStock : lastMonthStock;
        
        // **Producción: Suma del resultado del Paso 4 (dailyPlan)
        data['U. Planificadas'][monthKey] = (dailyPlan || [])
            .filter(d => 
                d.year === year && 
                d.month === month && 
                d.producingCenterId === monthlyFilters.center && 
                relevantProductIds.has(d.productId)
            )
            .reduce((sum, d) => sum + d.quantityToProduce, 0);

        // **Ventas: Suma del resultado del Paso 1 (planningGroupDetails)
        data['Ventas'][monthKey] = (detailedProductionPlan?.planningGroupDetails || [])
             .filter(d => d.year === year && d.month === month && d.centerName === monthlyFilters.center && relevantProductIds.has(d.productId))
            .reduce((sum, d) => sum + d.demand, 0);
        
        data['Traslados (Neto)'][monthKey] = 0; // Placeholder as per design

        data['Saldo Final'][monthKey] = data['Saldo Inicial'][monthKey] 
                                      + data['U. Planificadas'][monthKey] 
                                      + data['Traslados (Neto)'][monthKey]
                                      - data['Ventas'][monthKey];
        
        lastMonthStock = data['Saldo Final'][monthKey];
    });

    const rowOrder = ['Saldo Inicial', 'U. Planificadas', 'Ventas', 'Traslados (Neto)', 'Saldo Final'];
    const rows = rowOrder.map(label => ({ label, values: data[label] }));
    
    return { months: planningMonths.filter(m => data['Ventas'][m] > 0 || data['U. Planificadas'][m] > 0), rows };

  }, [monthlyFilters, constraints, salesData, detailedProductionPlan, dailyPlan]);


  // --- Memos for wizard steps display ---
  const filteredGroupDetails = useMemo(() => {
    if (!detailedProductionPlan?.planningGroupDetails) return [];
    return detailedProductionPlan.planningGroupDetails.filter(d => 
        (groupFilters.product ? d.productId.toLowerCase().includes(groupFilters.product.toLowerCase()) : true) &&
        (groupFilters.center ? d.centerName.toLowerCase().includes(groupFilters.center.toLowerCase()) : true)
    );
  }, [detailedProductionPlan?.planningGroupDetails, groupFilters]);

  const filteredNeeds = useMemo(() => {
    if (!detailedProductionPlan?.productionNeeds) return [];
    return detailedProductionPlan.productionNeeds.filter(n =>
        (needsFilters.product ? n.productId.toLowerCase().includes(needsFilters.product.toLowerCase()) : true) &&
        (needsFilters.center ? n.centerName.toLowerCase().includes(needsFilters.center.toLowerCase()) : true)
    );
  }, [detailedProductionPlan?.productionNeeds, needsFilters]);

  const filteredAssignments = useMemo(() => {
     if (!detailedProductionPlan?.monthlyAssignments) return [];
     return detailedProductionPlan.monthlyAssignments.filter(a =>
        (assignmentsFilters.product ? a.productId.toLowerCase().includes(assignmentsFilters.product.toLowerCase()) : true) &&
        (assignmentsFilters.center ? a.centerName.toLowerCase().includes(assignmentsFilters.center.toLowerCase()) : true) &&
        (assignmentsFilters.line ? a.lineName.toLowerCase().includes(assignmentsFilters.line.toLowerCase()) : true)
    );
  }, [detailedProductionPlan?.monthlyAssignments, assignmentsFilters]);

  // --- Step Rendering Components ---
  const renderStep1_Groups = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 1: Consolidación de Demanda y Stock</h3>
      <p className="text-sm text-gray-600 mb-4">
        A continuación se muestra el desglose mensual de la demanda para cada par `Producto-Centro`. Use los filtros para investigar.
      </p>
      <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-gray-50 mb-4">
        <FilterInput label="Producto" value={groupFilters.product} onChange={v => setGroupFilters(f => ({...f, product: v}))} />
        <FilterInput label="Centro" value={groupFilters.center} onChange={v => setGroupFilters(f => ({...f, center: v}))} />
      </div>
      <div className="overflow-auto max-h-[60vh] border rounded-lg">
        <table className="min-w-full text-xs divide-y divide-gray-200">
            <thead className="bg-gray-100 sticky top-0">
                <tr>
                    <th className="px-2 py-2 text-left font-semibold text-gray-600">Mes</th>
                    <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto</th>
                    <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-600">Demanda</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Inicial</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Mínimo</th>
                </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {filteredGroupDetails?.map((d, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                        <td className="px-2 py-1">{`${MONTH_NAMES[d.month-1].slice(0,3)} ${d.year}`}</td>
                        <td className="px-2 py-1">{d.productId}</td>
                        <td className="px-2 py-1">{d.centerName}</td>
                        <td className="px-2 py-1 text-right">{d.demand.toLocaleString()}</td>
                        <td className="px-2 py-1 text-right">{d.initialStock.toLocaleString()}</td>
                        <td className="px-2 py-1 text-right">{d.minStock.toLocaleString()}</td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>
    </div>
  );

  const renderStep2_Needs = () => (
    <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 2: Cálculo de Necesidades de Producción</h3>
         <p className="text-sm text-gray-600 mb-4">
            Se ha calculado la necesidad de producción neta para cada mes, considerando la demanda y los niveles de stock.
        </p>
        <div className="grid grid-cols-2 gap-3 p-3 border rounded-lg bg-gray-50 mb-4">
            <FilterInput label="Producto" value={needsFilters.product} onChange={v => setNeedsFilters(f => ({...f, product: v}))} />
            <FilterInput label="Centro" value={needsFilters.center} onChange={v => setNeedsFilters(f => ({...f, center: v}))} />
        </div>
        <div className="overflow-auto max-h-[60vh] border rounded-lg">
            <table className="min-w-full text-xs divide-y divide-gray-200">
                <thead className="bg-gray-100 sticky top-0">
                    <tr>
                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Mes</th>
                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto</th>
                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600">Producción Requerida</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {filteredNeeds?.map((n, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                            <td className="px-2 py-1">{`${MONTH_NAMES[n.month-1].slice(0,3)} ${n.year}`}</td>
                            <td className="px-2 py-1">{n.productId}</td>
                            <td className="px-2 py-1">{n.centerName}</td>
                            <td className="px-2 py-1 text-right">{Math.round(n.productionNeeded).toLocaleString()}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );
  
  const renderStep3_Assignments = () => (
    <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 3: Asignación a Líneas de Producción</h3>
        <p className="text-sm text-gray-600 mb-4">
            Las necesidades de producción han sido asignadas a las líneas más eficientes, considerando su capacidad. Aquí se puede ver la planificación mensual antes del desglose diario.
        </p>
         <div className="grid grid-cols-3 gap-3 p-3 border rounded-lg bg-gray-50 mb-4">
            <FilterInput label="Producto" value={assignmentsFilters.product} onChange={v => setAssignmentsFilters(f => ({...f, product: v}))} />
            <FilterInput label="Centro" value={assignmentsFilters.center} onChange={v => setAssignmentsFilters(f => ({...f, center: v}))} />
            <FilterInput label="Línea" value={assignmentsFilters.line} onChange={v => setAssignmentsFilters(f => ({...f, line: v}))} />
        </div>
        <div className="overflow-auto max-h-[60vh] border rounded-lg">
             <table className="min-w-full text-xs divide-y divide-gray-200">
                <thead className="bg-gray-100 sticky top-0">
                    <tr>
                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Mes</th>
                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Línea</th>
                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto</th>
                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600">U. Planificadas</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600">U. Mes</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600">U. Adelanto</th>
                        <th className="px-2 py-2 text-right font-semibold text-gray-600">Horas Req.</th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {filteredAssignments?.map((as, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                            <td className="px-2 py-1">{`${MONTH_NAMES[detailedProductionPlan!.planningGroupDetails.find(d => d.month-1 === as.monthIndex)?.month-1 || 0]?.slice(0,3)} ${detailedProductionPlan!.planningGroupDetails.find(d => d.month-1 === as.monthIndex)?.year}`}</td>
                            <td className="px-2 py-1">{as.lineName}</td>
                            <td className="px-2 py-1">{as.productId}</td>
                            <td className="px-2 py-1">{as.centerName}</td>
                            <td className="px-2 py-1 text-right">{Math.round(as.units).toLocaleString()}</td>
                            <td className="px-2 py-1 text-right">{Math.round(as.originalNeedUnits).toLocaleString()}</td>
                            <td className="px-2 py-1 text-right">{Math.round(as.advancedUnits).toLocaleString()}</td>
                            <td className="px-2 py-1 text-right">{as.totalHours.toFixed(2)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );


  const renderStep4_FinalPlan = () => (
    <div>
        <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
            <nav className="flex space-x-2" aria-label="Tabs">
                <button onClick={() => setActiveTab('daily')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'daily' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Plan Diario Detallado</button>
                <button onClick={() => setActiveTab('monthly')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'monthly' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Resumen de Flujo Mensual</button>
            </nav>
            <div>
              {activeTab === 'daily' && dailyPlan.length > 0 && <Button onClick={handleExportDaily} variant="outline" size="sm">Exportar Diario</Button>}
              {activeTab === 'monthly' && monthlyInventoryFlow && <Button onClick={handleExportMonthly} variant="outline" size="sm" disabled>Exportar Mensual</Button>}
            </div>
        </div>
        
        {activeTab === 'daily' ? renderDailyPlan() : renderMonthlySummary()}
    </div>
  );


  // --- Main Content Rendering Logic ---
  const renderDailyPlan = () => (
    <div className="space-y-4">
       <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border rounded-lg bg-gray-50">
          <FilterInput label="Mes" value={dailyFilters.month} onChange={v => setDailyFilters(f => ({...f, month: v}))} placeholder="ej: Enero" />
          <FilterInput label="Línea" value={dailyFilters.line} onChange={v => setDailyFilters(f => ({...f, line: v}))} />
          <FilterInput label="Centro" value={dailyFilters.center} onChange={v => setDailyFilters(f => ({...f, center: v}))} />
          <FilterInput label="Producto" value={dailyFilters.product} onChange={v => setDailyFilters(f => ({...f, product: v}))} />
       </div>
       <div className="overflow-auto max-h-[60vh] border rounded-lg">
         <table className="min-w-full text-xs divide-y divide-gray-200 whitespace-nowrap">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Fecha</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Nombre Producto</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto (Cód)</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Inicial</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Demanda Día</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Producción</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Final</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Línea</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Horas Req.</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
                {filteredDailyPlan.map(item => {
                    const lineName = constraints.productionLines.find(l => l.id === item.assignedLineId)?.name || item.assignedLineId || 'N/A';
                    return <DailyPlanRow key={item.id} item={item} lineName={lineName} />;
                })}
            </tbody>
          </table>
       </div>
    </div>
  );
  
  const renderMonthlySummary = () => (
     <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3 border rounded-lg bg-gray-50">
          <div>
            <label className="block text-xs font-medium text-gray-500">Tipo de Proceso</label>
            <select value={monthlyFilters.processType} onChange={e => setMonthlyFilters(f => ({...f, processType: e.target.value}))} className="w-full text-sm p-2 mt-1 border border-gray-300 rounded">
                <option value="">Seleccione un Proceso</option>
                {PROCESS_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500">Centro de Distribución</label>
             <select value={monthlyFilters.center} onChange={e => setMonthlyFilters(f => ({...f, center: e.target.value}))} className="w-full text-sm p-2 mt-1 border border-gray-300 rounded">
                <option value="">Seleccione un Centro</option>
                {constraints.workCenters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
      </div>
      
       {!monthlyFilters.center || !monthlyFilters.processType ? (
        <div className="text-center py-10 text-gray-500">Por favor, seleccione un tipo de proceso y un centro para ver el resumen.</div>
      ) : !monthlyInventoryFlow || monthlyInventoryFlow.months.length === 0 ? (
        <div className="text-center py-10 text-gray-500">No hay datos de ventas o producción para la combinación de filtros seleccionada.</div>
      ) : (
       <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600 sticky left-0 bg-gray-100 z-10">Métrica</th>
              {monthlyInventoryFlow.months.map(monthKey => {
                const [year, monthNum] = monthKey.split('-');
                return <th key={monthKey} className="px-3 py-2 text-right font-semibold text-gray-600">{`${MONTH_NAMES[parseInt(monthNum)-1].slice(0,3)} ${year.slice(-2)}`}</th>
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {monthlyInventoryFlow.rows.map(row => (
              <tr key={row.label} className="hover:bg-gray-50 group">
                <td className={`px-3 py-2 font-medium sticky left-0 bg-white group-hover:bg-gray-50 z-10 ${row.label === 'Saldo Final' ? 'font-bold' : ''}`}>{row.label}</td>
                {monthlyInventoryFlow.months.map(monthKey => (
                  <td key={`${row.label}-${monthKey}`} className={`px-3 py-2 text-right ${row.label === 'Saldo Final' ? 'font-bold bg-gray-50' : ''}`}>
                    {Math.round(row.values[monthKey] || 0).toLocaleString()}
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

  const renderAuditLog = () => (
    <div className="p-4 bg-gray-900 text-white font-mono text-xs rounded-lg max-h-[70vh] overflow-y-auto">
      <h4 className="text-md font-bold text-yellow-300 mb-4">Bitácora del Planificador</h4>
      <pre>{auditLog.join('\n')}</pre>
    </div>
  );

  const renderWizard = () => {
    switch (planningStep) {
        case 'idle':
            return (
                <div className="text-center py-10">
                    <h3 className="text-lg font-medium text-gray-900">Listo para Planificar</h3>
                    <p className="mt-1 text-sm text-gray-500">Presione "Iniciar Planificación" para comenzar el proceso de cálculo paso a paso.</p>
                     {!isDataSynced && (
                        <p className="mt-4 text-sm text-yellow-600 bg-yellow-50 p-3 rounded-md">
                           ⚠️ Atención: Los datos de configuración y tiempos no están sincronizados. Vaya a la sección de <span className="font-bold">Definir Restricciones</span> y presione el botón de sincronización antes de generar un plan.
                        </p>
                    )}
                </div>
            );
        case 'groups': return renderStep1_Groups();
        case 'needs': return renderStep2_Needs();
        case 'assignments': return renderStep3_Assignments();
        case 'finalPlan':
            if (dailyPlan.length === 0 && auditLog.length > 0) {
                return (
                    <div className="text-center py-10">
                        <h3 className="text-lg font-medium text-gray-900">El plan de producción está vacío.</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            La planificación no generó ningún resultado. Esto puede deberse a que no hay demanda en los datos de ventas o a inconsistencias en los datos maestros.
                            Revise la bitácora del planificador para más detalles.
                        </p>
                        {renderAuditLog()}
                    </div>
                );
            }
            return renderStep4_FinalPlan();
        default: return null;
    }
  };
  
  const isNextDisabled = () => {
      if (isLoading) return true;
      if (planningStep === 'groups' && (!detailedProductionPlan?.planningGroupDetails || detailedProductionPlan.planningGroupDetails.length === 0)) return true;
      if (planningStep === 'needs' && (!detailedProductionPlan?.productionNeeds || detailedProductionPlan.productionNeeds.length === 0)) return true;
      if (planningStep === 'assignments' && (!detailedProductionPlan?.monthlyAssignments || detailedProductionPlan.monthlyAssignments.length === 0)) return true;
      return false;
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div className="flex items-center space-x-3">
            <PlanIcon />
            <h2 className="text-2xl font-semibold text-gray-700">Plan de Producción a Mediano Plazo</h2>
        </div>
        <div className="flex items-center space-x-2 mt-4 md:mt-0">
          {planningStep === 'idle' && (
            <Button
                onClick={handleStartPlanning}
                disabled={isLoading || !isDataSynced}
                title={!isDataSynced ? 'Debe sincronizar los datos de ensamble en la pestaña de restricciones primero' : 'Comenzar la planificación paso a paso'}
            >
                {isLoading ? 'Analizando...' : 'Iniciar Planificación'}
            </Button>
          )}
          {planningStep !== 'idle' && planningStep !== 'finalPlan' && (
            <Button onClick={handleNextStep} disabled={isNextDisabled()}>
                Siguiente Paso
            </Button>
          )}
           {planningStep !== 'idle' && (
            <Button onClick={handleReset} variant="outline">
                Reiniciar
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg min-h-[60vh]">
        {isLoading ? <div className="text-center py-10">Cargando y procesando...</div> : renderWizard()}
      </div>

       {auditLog && auditLog.length > 0 && planningStep !== 'finalPlan' &&
         <div className="bg-white p-6 rounded-xl shadow-lg">{renderAuditLog()}</div>
       }
    </div>
  );
};

    