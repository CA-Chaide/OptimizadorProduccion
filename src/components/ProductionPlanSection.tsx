

import React, { useState, useMemo } from 'react';
import { 
    ProductionPlan, AppConstraints, WorkCenter, ProductionLine, 
    PlanningGroupMonthlyDetail, MonthlyNeed, MonthlyAssignment, DetailedProductionPlan 
} from '@/types/types';
import { PlanIcon, DataImportIcon } from '@/constants/constants';
import { exportDailyPlanToExcel, exportMonthlyPlanToExcel } from '@/services/OptimizationService';
import { MONTH_NAMES } from '@/constants/constants';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/context/AppProvider';

type PlanningStep = 'idle' | 'groups' | 'needs' | 'assignments' | 'finalPlan';

interface ProductionPlanSectionProps {
  // Props removed, data comes from context now
}

export const ProductionPlanSection: React.FC<ProductionPlanSectionProps> = () => {
  const { 
    productionPlan, 
    handleGeneratePlan, 
    isLoading, 
    constraints, 
    detailedProductionPlan,
    syncStatus,
  } = useAppContext();

  const isDataSynced = syncStatus?.isSynced || false;

  const [activeTab, setActiveTab] = useState<'summary' | 'daily' | 'monthly' | 'log'>('summary');
  const [planningStep, setPlanningStep] = useState<PlanningStep>('idle');
  const [filters, setFilters] = useState<Record<string, string>>({});

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
    setFilters({}); // Reset filters when moving to the next step
  };
  
  const handleReset = () => {
    setPlanningStep('idle');
    setFilters({});
  };

  const centerSummaryData = useMemo(() => {
    if (!dailyPlan || dailyPlan.length === 0 || !constraints.workCenters || constraints.workCenters.length === 0) return [];
    
    const summaryMap = new Map<string, any>();
    constraints.workCenters.forEach(center => {
        summaryMap.set(center.id, { center, lines: [], totalCenterProduction: 0 });
    });
    
    const lineProductionMap = new Map<string, number>();
    dailyPlan.forEach(item => {
        if (!item.producingCenterId || !item.assignedLineId || item.quantityToProduce <= 0) return;
        const line = constraints.productionLines.find(l => l.name === item.assignedLineId && l.workCenterId === item.producingCenterId);
        if(line) {
            const currentTotal = lineProductionMap.get(line.id) || 0;
            lineProductionMap.set(line.id, currentTotal + item.quantityToProduce);
        }
    });

    lineProductionMap.forEach((totalProduction, lineId) => {
        const line = constraints.productionLines.find(l => l.id === lineId);
        if (line) {
            const centerSummary = summaryMap.get(line.workCenterId);
            if (centerSummary) {
                centerSummary.lines.push({ line, totalProduction });
                centerSummary.totalCenterProduction += totalProduction;
            }
        }
    });
    
    return Array.from(summaryMap.values())
        .filter(summary => summary.totalCenterProduction > 0)
        .sort((a,b) => a.center.name.localeCompare(b.center.name));
        
  }, [dailyPlan, constraints.workCenters, constraints.productionLines]);


  const grandTotalProduction = useMemo(() => {
    return centerSummaryData.reduce((acc, curr) => acc + curr.totalCenterProduction, 0);
  }, [centerSummaryData]);

  // --- Filtered Data Memos ---
  const filteredPlanningGroups = useMemo(() => {
    if (!detailedProductionPlan?.planningGroupDetails) return [];
    let data = detailedProductionPlan.planningGroupDetails;
    Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        data = data.filter(row => String(row[key as keyof PlanningGroupMonthlyDetail]).toLowerCase().includes(value.toLowerCase()));
      }
    });
    return data;
  }, [detailedProductionPlan?.planningGroupDetails, filters]);

  const filteredProductionNeeds = useMemo(() => {
    if (!detailedProductionPlan?.productionNeeds) return [];
    let data = detailedProductionPlan.productionNeeds;
     Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        data = data.filter(row => String(row[key as keyof MonthlyNeed]).toLowerCase().includes(value.toLowerCase()));
      }
    });
    return data;
  }, [detailedProductionPlan?.productionNeeds, filters]);

  const filteredMonthlyAssignments = useMemo(() => {
    if (!detailedProductionPlan?.monthlyAssignments) return [];
    let data = detailedProductionPlan.monthlyAssignments;
     Object.entries(filters).forEach(([key, value]) => {
      if (value) {
        data = data.filter(row => {
          if (key === 'monthIndex') {
             const monthName = MONTH_NAMES[row.monthIndex].toLowerCase();
             return monthName.includes(value.toLowerCase());
          }
          return String(row[key as keyof MonthlyAssignment]).toLowerCase().includes(value.toLowerCase())
        });
      }
    });
    return data.sort((a,b) => a.monthIndex - b.monthIndex || a.lineName.localeCompare(b.lineName));
  }, [detailedProductionPlan?.monthlyAssignments, filters]);

  const handleFilterChange = (columnId: string, value: string) => {
    setFilters(prev => ({ ...prev, [columnId]: value }));
  };


  // --- Step Rendering Components ---
  const renderStep1_Groups = () => (
    <div>
      <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 1: Consolidación de Demanda y Stock</h3>
      <p className="text-sm text-gray-600 mb-4">
        A continuación se muestra el desglose mensual de la demanda para cada par `Producto-Centro`. Use los filtros para investigar.
        Si esta tabla está vacía, el sistema no pudo encontrar una coincidencia válida entre los datos de ventas y los de producción/inventario.
      </p>
      <div className="overflow-y-auto max-h-[60vh] border rounded-lg">
        <table className="min-w-full text-sm divide-y divide-gray-200">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              {['productId', 'centerName', 'year', 'month', 'demand', 'initialStock', 'minStock'].map(col => (
                <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase">
                  <div>{col.replace('Name', '').replace('Id','')}</div>
                  <input
                    type="text"
                    value={filters[col] || ''}
                    onChange={(e) => handleFilterChange(col, e.target.value)}
                    className="w-full text-xs p-1 mt-1 border border-gray-300 rounded"
                    placeholder={`Filtrar ${col}...`}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredPlanningGroups && filteredPlanningGroups.length > 0 ? (
              filteredPlanningGroups.map((group, index) => (
                <tr key={`${group.pairKey}-${group.month}-${index}`}>
                  <td className="px-3 py-2 font-mono">{group.productId}</td>
                  <td className="px-3 py-2">{group.centerName}</td>
                  <td className="px-3 py-2">{group.year}</td>
                  <td className="px-3 py-2">{MONTH_NAMES[group.month - 1]}</td>
                  <td className="px-3 py-2 text-right font-bold text-blue-600">{group.demand.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{group.initialStock.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{group.minStock.toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="text-center py-4 text-red-600 font-bold">
                  Se han consolidado 0 grupos de planificación. El proceso no puede continuar.
                  <span className="block font-normal text-gray-600">Causa probable: No hay coincidencia entre el `CodMaterial` y `Centro` de los datos de ventas y los datos de Tiempos de Ensamble/Inventario. Verifique la normalización de datos.</span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStep2_Needs = () => (
    <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 2: Cálculo de Necesidades de Producción</h3>
        <p className="text-sm text-gray-600 mb-4">
            Basado en la demanda y políticas de stock, el sistema ha calculado la cantidad de unidades que se deben producir cada mes.
        </p>
         <div className="overflow-y-auto max-h-[60vh] border rounded-lg">
            <table className="min-w-full text-sm divide-y divide-gray-200">
                <thead className="bg-gray-100 sticky top-0">
                    <tr>
                         {['productId', 'centerName', 'year', 'month', 'productionNeeded'].map(col => (
                            <th key={col} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase">
                              <div>{col.replace('Name', '').replace('Id','')}</div>
                              <input
                                type="text"
                                value={filters[col] || ''}
                                onChange={(e) => handleFilterChange(col, e.target.value)}
                                className="w-full text-xs p-1 mt-1 border border-gray-300 rounded"
                                placeholder={`Filtrar ${col}...`}
                              />
                            </th>
                          ))}
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {filteredProductionNeeds && filteredProductionNeeds.length > 0 ? (
                    filteredProductionNeeds.map((need, index) => (
                        <tr key={`${need.pairKey}-${need.month}-${index}`}>
                            <td className="px-3 py-2 font-mono">{need.productId}</td>
                            <td className="px-3 py-2">{need.centerName}</td>
                            <td className="px-3 py-2">{need.year}</td>
                            <td className="px-3 py-2">{MONTH_NAMES[need.month - 1]}</td>
                            <td className="px-3 py-2 text-right font-bold text-green-600">{Math.round(need.productionNeeded).toLocaleString()}</td>
                        </tr>
                    ))
                    ) : (
                    <tr><td colSpan={5} className="text-center py-4 text-gray-500">No se calcularon necesidades de producción.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    </div>
  );
  
  const renderStep3_Assignments = () => {
    const columns: (keyof MonthlyAssignment | 'custom')[] = ['monthIndex', 'lineName', 'productId', 'centerName', 'units', 'originalNeedUnits', 'advancedUnits', 'totalHours'];
    const columnLabels: Record<string, string> = {
        monthIndex: 'Mes',
        lineName: 'Línea',
        productId: 'Producto',
        centerName: 'Centro',
        units: 'U. Planificadas',
        originalNeedUnits: 'U. Mes',
        advancedUnits: 'U. Adelanto',
        totalHours: 'Horas Totales',
    };

    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 3: Asignación a Líneas de Producción</h3>
            <p className="text-sm text-gray-600 mb-4">
                Las necesidades de producción se han asignado a las líneas más eficientes disponibles en cada centro, considerando la capacidad de horas.
            </p>
            <div className="overflow-y-auto max-h-[60vh] border rounded-lg">
                <table className="min-w-full text-sm divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            {columns.map(col => (
                                <th key={String(col)} className="px-3 py-2 text-left font-semibold text-gray-600 uppercase">
                                    <div>{columnLabels[String(col)]}</div>
                                    <input
                                        type="text"
                                        value={filters[String(col)] || ''}
                                        onChange={(e) => handleFilterChange(String(col), e.target.value)}
                                        className="w-full text-xs p-1 mt-1 border border-gray-300 rounded"
                                        placeholder={`Filtrar...`}
                                    />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredMonthlyAssignments && filteredMonthlyAssignments.length > 0 ? (
                            filteredMonthlyAssignments.map(as => (
                                <tr key={as.assignmentKey}>
                                    <td className="px-3 py-2">{MONTH_NAMES[as.monthIndex]}</td>
                                    <td className="px-3 py-2">{as.lineName}</td>
                                    <td className="px-3 py-2 font-mono">{as.productId}</td>
                                    <td className="px-3 py-2">{as.centerName}</td>
                                    <td className="px-3 py-2 text-right font-bold">{as.units.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td className="px-3 py-2 text-right text-blue-600">{as.originalNeedUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td className="px-3 py-2 text-right text-purple-600">{as.advancedUnits.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                    <td className="px-3 py-2 text-right">{as.totalHours.toFixed(2)}</td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={columns.length} className="text-center py-4 text-gray-500">No se realizaron asignaciones de producción a las líneas.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};


  const renderStep4_FinalPlan = () => (
    <div>
        <h3 className="text-lg font-semibold text-gray-800 mb-2">Paso 4: Plan Detallado (Diario y Mensual)</h3>
        <p className="text-sm text-gray-600 mb-4">Este es el resultado final del plan de producción, listo para ser exportado.</p>
        
        <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
            <nav className="flex space-x-2" aria-label="Tabs">
                <button onClick={() => setActiveTab('summary')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'summary' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Resumen</button>
                <button onClick={() => setActiveTab('daily')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'daily' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Plan Diario ({dailyPlan.length})</button>
                <button onClick={() => setActiveTab('monthly')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'monthly' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Resumen Mensual ({monthlyPlan.length})</button>
                <button onClick={() => setActiveTab('log')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'log' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>Bitácora</button>
            </nav>
        </div>
        
        {renderContent()}
    </div>
  );


  // --- Main Content Rendering Logic ---
  const renderContent = () => {
    if (dailyPlan.length === 0 && activeTab !== 'log') {
        return (
            <div className="text-center py-10">
                <h3 className="text-lg font-medium text-gray-900">El plan de producción está vacío.</h3>
                <p className="mt-1 text-sm text-gray-500">Inicie el proceso de planificación paso a paso para diagnosticar el problema.</p>
            </div>
        );
    }
    
    switch (activeTab) {
        case 'summary': return renderSummary();
        case 'daily': return renderDailyPlan();
        case 'monthly': return renderMonthlyPlan();
        case 'log': return renderAuditLog();
        default: return renderSummary();
    }
  };

  const renderSummary = () => (
    <div className="space-y-6">
        {centerSummaryData.map(({ center, lines, totalCenterProduction }) => (
            <div key={center.id} className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <div className="flex justify-between items-baseline mb-4">
                    <h3 className="text-xl font-bold text-gray-800">{center.name}</h3>
                    <p className="text-lg font-semibold text-indigo-600">Subtotal: {Math.round(totalCenterProduction).toLocaleString()} Unidades</p>
                </div>
                <div className="space-y-3">
                    {lines.sort((a,b) => a.line.name.localeCompare(b.line.name)).map(({ line, totalProduction }) => (
                         <div key={line.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                            <span className="font-medium text-gray-700">{line.name}</span>
                            <span className="font-mono text-gray-900">{Math.round(totalProduction).toLocaleString()} unid.</span>
                        </div>
                    ))}
                </div>
            </div>
        ))}
    </div>
  );

  const renderDailyPlan = () => (
    <div className="overflow-y-auto max-h-[60vh]">
       <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Fecha</th>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Producción</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {dailyPlan.map(item => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-2 py-1 whitespace-nowrap">{`${item.day}/${item.month}/${item.year}`}</td>
              <td className="px-2 py-1 whitespace-normal font-medium text-gray-800">{item.productName}</td>
              <td className="px-2 py-1 text-right text-green-600 font-bold">{Math.round(item.quantityToProduce)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  
  const renderMonthlyPlan = () => (
     <div className="overflow-y-auto max-h-[60vh]">
       <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Mes</th>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Producción Total</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {monthlyPlan.map(item => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-2 py-1 whitespace-nowrap">{`${MONTH_NAMES[item.month-1]} ${item.year}`}</td>
              <td className="px-2 py-1 whitespace-normal font-medium text-gray-800">{item.productName}</td>
              <td className="px-2 py-1 text-right font-bold">{Math.round(item.totalQuantityToProduce)}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
          {planningStep === 'finalPlan' && (
            <Button onClick={handleExportDaily} disabled={dailyPlan.length === 0}>
                <DataImportIcon /> Exportar Plan
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg min-h-[50vh]">
        {renderWizard()}
      </div>

       {detailedProductionPlan?.finalPlan?.auditLog && detailedProductionPlan.finalPlan.auditLog.length > 0 && 
         <div className="bg-white p-6 rounded-xl shadow-lg">{renderAuditLog()}</div>
       }
    </div>
  );
};
