

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

interface ProductionPlanSectionProps {
  // Props removed, data comes from context now
}

// --- Reusable Filter Input ---
const FilterInput: React.FC<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  containerClassName?: string;
}> = ({ label, value, onChange, placeholder, containerClassName }) => (
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


export const ProductionPlanSection: React.FC<ProductionPlanSectionProps> = () => {
  const { 
    productionPlan, 
    handleGeneratePlan, 
    isLoading, 
    constraints, 
    detailedProductionPlan,
    syncStatus,
    salesData, // Need sales data for the monthly summary
  } = useAppContext();

  const isDataSynced = syncStatus?.isSynced || false;

  const [activeTab, setActiveTab] = useState<'summary' | 'daily' | 'monthly' | 'log'>('summary');
  const [planningStep, setPlanningStep] = useState<PlanningStep>('idle');
  const [dailyFilters, setDailyFilters] = useState({ month: '', line: '', center: '', product: ''});
  const [monthlyFilters, setMonthlyFilters] = useState({ processType: '', center: '' });


  const { dailyPlan = [], monthlyPlan = [], auditLog = [] } = productionPlan || {};
  
  const handleExportDaily = () => exportDailyPlanToExcel(dailyPlan, constraints);
  const handleExportMonthly = () => exportMonthlyPlanToExcel(monthlyPlan);
  
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
      const monthMatch = dailyFilters.month ? MONTH_NAMES[item.month - 1].toLowerCase().includes(dailyFilters.month.toLowerCase()) : true;
      const lineMatch = dailyFilters.line ? item.assignedLineId?.toLowerCase().includes(dailyFilters.line.toLowerCase()) : true;
      const centerMatch = dailyFilters.center ? item.producingCenterId?.toLowerCase().includes(dailyFilters.center.toLowerCase()) : true;
      const productMatch = dailyFilters.product ? (item.productId.includes(dailyFilters.product) || item.productName.toLowerCase().includes(dailyFilters.product.toLowerCase())) : true;
      return monthMatch && lineMatch && centerMatch && productMatch;
    });
  }, [dailyPlan, dailyFilters]);

  const monthlyInventoryFlow = useMemo(() => {
    if (!monthlyFilters.center || !monthlyFilters.processType) return null;
    
    // 1. Identify relevant products for the selected filters
    const relevantLineIds = new Set(constraints.productionLines
        .filter(l => l.processType === monthlyFilters.processType)
        .map(l => l.id)
    );
    const relevantProductIds = new Set(constraints.productProcessInfos
        .filter(ppi => relevantLineIds.has(ppi.productionLineId))
        .map(ppi => ppi.productId)
    );

    // 2. Get planning horizon from sales data for these products
    const filteredSales = salesData.filter(s => relevantProductIds.has(s.código) && String(s.centro) === monthlyFilters.center);
    if(filteredSales.length === 0) return { months: [], rows: [] };
    
    const planningMonths = Array.from(new Set(filteredSales.map(s => `${s.año}-${String(s.mes).padStart(2, '0')}`))).sort();

    // 3. Initialize metrics
    const initialStock = constraints.inventorySettings
        .filter(is => relevantProductIds.has(is.itemId) && is.centerId === monthlyFilters.center)
        .reduce((sum, is) => sum + is.currentStock, 0);

    const data: Record<string, Record<string, number>> = {
      'Saldo Inicial': {}, 'Producción': {}, 'Traslados Recibidos': {},
      'Ventas': {}, 'Traslados Enviados': {}, 'Saldo Final': {}
    };

    let lastMonthStock = initialStock;

    // 4. Calculate metrics for each month
    planningMonths.forEach((monthKey, index) => {
        const [yearStr, monthStr] = monthKey.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);

        data['Saldo Inicial'][monthKey] = (index === 0) ? initialStock : lastMonthStock;
        
        data['Producción'][monthKey] = dailyPlan
            .filter(dp => dp.year === year && dp.month === month && dp.producingCenterId === monthlyFilters.center && relevantProductIds.has(dp.productId))
            .reduce((sum, dp) => sum + dp.quantityToProduce, 0);

        data['Ventas'][monthKey] = salesData
             .filter(s => s.año === year && s.mes === month && String(s.centro) === monthlyFilters.center && relevantProductIds.has(s.código))
            .reduce((sum, s) => sum + s.unidadesProyectado, 0);
        
        // Placeholder for transfers
        data['Traslados Recibidos'][monthKey] = 0;
        data['Traslados Enviados'][monthKey] = 0;

        data['Saldo Final'][monthKey] = data['Saldo Inicial'][monthKey] 
                                      + data['Producción'][monthKey] 
                                      + data['Traslados Recibidos'][monthKey]
                                      - data['Ventas'][monthKey]
                                      - data['Traslados Enviados'][monthKey];
        
        lastMonthStock = data['Saldo Final'][monthKey];
    });

    const rowOrder = ['Saldo Inicial', 'Producción', 'Traslados Recibidos', 'Ventas', 'Traslados Enviados', 'Saldo Final'];
    const rows = rowOrder.map(label => ({ label, values: data[label] }));
    
    return { months: planningMonths, rows };

  }, [monthlyFilters, constraints, salesData, dailyPlan]);


  // --- Step Rendering Components ---
  const renderStep1_Groups = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 1: Consolidación de Demanda y Stock</h3>
      <p className="text-sm text-gray-600 mb-4">
        A continuación se muestra el desglose mensual de la demanda para cada par `Producto-Centro`. Use los filtros para investigar.
      </p>
    </div>
  );

  const renderStep2_Needs = () => (
    <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 2: Cálculo de Necesidades de Producción</h3>
    </div>
  );
  
  const renderStep3_Assignments = () => {
    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 3: Asignación a Líneas de Producción</h3>
        </div>
    );
};


  const renderStep4_FinalPlan = () => (
    <div>
        <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
            <nav className="flex space-x-2" aria-label="Tabs">
                <button onClick={() => setActiveTab('daily')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'daily' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Plan Diario Detallado</button>
                <button onClick={() => setActiveTab('monthly')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'monthly' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Resumen de Flujo Mensual</button>
            </nav>
            <div>
              {activeTab === 'daily' && dailyPlan.length > 0 && <Button onClick={handleExportDaily} variant="outline" size="sm">Exportar Diario</Button>}
            </div>
        </div>
        
        {renderContent()}
    </div>
  );


  // --- Main Content Rendering Logic ---
  const renderContent = () => {
    if (planningStep === 'finalPlan' && dailyPlan.length === 0) {
        return (
            <div className="text-center py-10">
                <h3 className="text-lg font-medium text-gray-900">El plan de producción está vacío.</h3>
                <p className="mt-1 text-sm text-gray-500">
                    La planificación no generó ningún resultado. Esto puede deberse a que no hay demanda en los datos de ventas o a inconsistencias en los datos maestros.
                    Revise la bitácora del planificador para más detalles.
                </p>
                {auditLog.length > 0 && renderAuditLog()}
            </div>
        );
    }
    
    switch (activeTab) {
        case 'daily': return renderDailyPlan();
        case 'monthly': return renderMonthlySummary();
        default: return renderDailyPlan();
    }
  };

  const renderDailyPlan = () => (
    <div className="space-y-4">
       <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 border rounded-lg bg-gray-50">
          <FilterInput label="Mes" value={dailyFilters.month} onChange={v => setDailyFilters(f => ({...f, month: v}))} />
          <FilterInput label="Línea" value={dailyFilters.line} onChange={v => setDailyFilters(f => ({...f, line: v}))} />
          <FilterInput label="Centro" value={dailyFilters.center} onChange={v => setDailyFilters(f => ({...f, center: v}))} />
          <FilterInput label="Producto" value={dailyFilters.product} onChange={v => setDailyFilters(f => ({...f, product: v}))} />
       </div>
       <div className="overflow-auto max-h-[60vh] border rounded-lg">
         <table className="min-w-full text-xs divide-y divide-gray-200 whitespace-nowrap">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Fecha</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Línea</th>
                <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Inicial</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Demanda Día</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Producción</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Final</th>
                <th className="px-2 py-2 text-right font-semibold text-gray-600">Horas Req.</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredDailyPlan.map(item => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1">{`${String(item.day).padStart(2,'0')}/${String(item.month).padStart(2,'0')}/${item.year}`}</td>
                  <td className="px-2 py-1 font-medium">{item.productName} ({item.productId})</td>
                  <td className="px-2 py-1">{item.assignedLineId}</td>
                  <td className="px-2 py-1">{item.producingCenterId}</td>
                  <td className="px-2 py-1 text-right">{Math.round(item.initialStockOnDay).toLocaleString()}</td>
                  <td className="px-2 py-1 text-right text-red-600">{Math.round(item.demandOnDay).toLocaleString()}</td>
                  <td className="px-2 py-1 text-right font-bold text-green-600">{Math.round(item.quantityToProduce).toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{Math.round(item.finalStockOnDay).toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{item.hoursWorked.toFixed(2)}</td>
                </tr>
              ))}
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
        <div className="text-center py-10 text-gray-500">No hay datos de ventas para la combinación de filtros seleccionada.</div>
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
              <tr key={row.label} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium sticky left-0 bg-white group-hover:bg-gray-50 z-10">{row.label}</td>
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
                </div>
            );
        case 'groups': return renderStep1_Groups();
        case 'needs': return renderStep2_Needs();
        case 'assignments': return renderStep3_Assignments();
        case 'finalPlan': return renderStep4_FinalPlan();
        default: return null;
    }
  };
  
  const isNextDisabled = () => {
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
        {renderWizard()}
      </div>

       {auditLog && auditLog.length > 0 && planningStep !== 'finalPlan' &&
         <div className="bg-white p-6 rounded-xl shadow-lg">{renderAuditLog()}</div>
       }
    </div>
  );
};
