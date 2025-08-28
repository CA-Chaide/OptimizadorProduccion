
import React, { useState, useMemo } from 'react';
import { ProductionPlan, ProductionPlanItem, AppConstraints, MonthlyProductionPlanItem, WorkCenter, ProductionLine } from '@/types/types';
import { PlanIcon, DataImportIcon } from '@/constants/constants';
import { exportDailyPlanToExcel, exportMonthlyPlanToExcel } from '@/services/OptimizationService';
import { MONTH_NAMES } from '@/constants/constants';

interface ProductionPlanSectionProps {
  plan: ProductionPlan;
  onGeneratePlan: () => void;
  isLoading: boolean;
  constraints: AppConstraints;
  isDataSynced: boolean; // New prop
}

interface CenterSummary {
    center: WorkCenter;
    lines: Array<{
        line: ProductionLine;
        totalProduction: number;
    }>;
    totalCenterProduction: number;
}


export const ProductionPlanSection: React.FC<ProductionPlanSectionProps> = ({ plan, onGeneratePlan, isLoading, constraints, isDataSynced }) => {
  const [activeTab, setActiveTab] = useState<'summary' | 'daily' | 'monthly' | 'log'>('summary');

  const { dailyPlan = [], monthlyPlan = [], auditLog = [] } = plan || {};
  
  const handleExportDaily = () => exportDailyPlanToExcel(dailyPlan, constraints);
  const handleExportMonthly = () => exportMonthlyPlanToExcel(monthlyPlan);

  const centerSummaryData = useMemo<CenterSummary[]>(() => {
    if (!dailyPlan || dailyPlan.length === 0 || !constraints.workCenters || constraints.workCenters.length === 0) return [];
    
    const summaryMap = new Map<string, CenterSummary>();

    // Initialize map with all centers to ensure they appear even if they have no production
    constraints.workCenters.forEach(center => {
        summaryMap.set(center.id, {
            center,
            lines: [],
            totalCenterProduction: 0,
        });
    });
    
    // This map will correctly accumulate production per line ID
    const lineProductionMap = new Map<string, number>(); // key: lineId, value: totalProduction

    dailyPlan.forEach(item => {
        if (!item.producingCenterId || !item.assignedLineId || item.quantityToProduce <= 0) return;

        const producingCenter = constraints.workCenters.find(c => c.name === item.producingCenterId);
        if (!producingCenter) return;

        const assignedLineNames = item.assignedLineId.split(',').map(name => name.trim());
        
        const linesForThisItem = constraints.productionLines.filter(l => 
            l.workCenterId === producingCenter.id && assignedLineNames.includes(l.name)
        );

        if (linesForThisItem.length > 0) {
            const productionPerLine = item.quantityToProduce / linesForThisItem.length;
            
            linesForThisItem.forEach(line => {
                const currentTotal = lineProductionMap.get(line.id) || 0;
                lineProductionMap.set(line.id, currentTotal + productionPerLine);
            });
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


  const renderSummary = () => (
    <div className="space-y-6">
        {centerSummaryData.map(({ center, lines, totalCenterProduction }) => (
            <div key={center.id} className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <div className="flex justify-between items-baseline mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Centro {center.name}</h3>
                    <p className="text-lg font-semibold text-indigo-600">
                        Subtotal: {Math.round(totalCenterProduction).toLocaleString()} Unidades
                    </p>
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
        {grandTotalProduction > 0 && (
            <div className="mt-8 pt-4 border-t-2 border-dashed">
                 <div className="flex justify-end items-baseline">
                    <h3 className="text-2xl font-bold text-gray-900">Total General Planificado:</h3>
                    <p className="text-2xl font-bold text-green-700 ml-4">
                        {Math.round(grandTotalProduction).toLocaleString()} Unidades
                    </p>
                 </div>
            </div>
        )}
    </div>
  );

  const renderDailyPlan = () => (
    <div className="overflow-x-auto">
       <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Fecha</th>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto</th>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Inicial</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Demanda</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Producción</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Stock Final</th>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Línea(s) Asignada(s)</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Horas</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Costo Laboral ($)</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {dailyPlan.map(item => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-2 py-1 whitespace-nowrap">{`${item.day}/${item.month}/${item.year}`}</td>
              <td className="px-2 py-1 whitespace-normal font-medium text-gray-800">{item.productName}</td>
              <td className="px-2 py-1 whitespace-nowrap">{item.producingCenterId}</td>
              <td className="px-2 py-1 text-right">{Math.round(item.initialStockOnDay)}</td>
              <td className="px-2 py-1 text-right text-red-600">{Math.round(item.demandOnDay)}</td>
              <td className="px-2 py-1 text-right text-green-600 font-bold">{Math.round(item.quantityToProduce)}</td>
              <td className="px-2 py-1 text-right">{Math.round(item.finalStockOnDay)}</td>
              <td className="px-2 py-1 whitespace-nowrap">{item.assignedLineId || 'N/A'}</td>
              <td className="px-2 py-1 text-right">{item.hoursWorked.toFixed(2)}</td>
              <td className="px-2 py-1 text-right">{item.estimatedLaborCost.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  
  const renderMonthlyPlan = () => (
     <div className="overflow-x-auto">
       <table className="min-w-full text-sm divide-y divide-gray-200">
        <thead className="bg-gray-50 sticky top-0">
          <tr>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Mes</th>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Código Material</th>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Producto</th>
            <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Producción Total</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Horas Totales</th>
            <th className="px-2 py-2 text-right font-semibold text-gray-600">Costo Laboral Total ($)</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {monthlyPlan.map(item => (
            <tr key={item.id} className="hover:bg-gray-50">
              <td className="px-2 py-1 whitespace-nowrap">{`${MONTH_NAMES[item.month-1]} ${item.year}`}</td>
              <td className="px-2 py-1 whitespace-nowrap font-mono text-gray-600">{item.productId}</td>
              <td className="px-2 py-1 whitespace-normal font-medium text-gray-800">{item.productName}</td>
              <td className="px-2 py-1 whitespace-nowrap">{item.producingCenterId}</td>
              <td className="px-2 py-1 text-right font-bold">{Math.round(item.totalQuantityToProduce)}</td>
              <td className="px-2 py-1 text-right">{item.totalHoursWorked.toFixed(2)}</td>
              <td className="px-2 py-1 text-right">{item.totalEstimatedLaborCost.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderAuditLog = () => (
    <div className="p-4 bg-gray-900 text-white font-mono text-xs rounded-lg max-h-[70vh] overflow-y-auto">
      <pre>{auditLog.join('\n')}</pre>
    </div>
  );
  
  const renderContent = () => {
    if (dailyPlan.length === 0 && activeTab !== 'log') {
        return (
            <div className="text-center py-10">
                <h3 className="text-lg font-medium text-gray-900">El plan de producción está vacío.</h3>
                <p className="mt-1 text-sm text-gray-500">Sincronice los datos y genere un plan para ver los resultados aquí.</p>
            </div>
        );
    }
    
    switch (activeTab) {
        case 'summary':
            return renderSummary();
        case 'daily':
            return renderDailyPlan();
        case 'monthly':
            return renderMonthlyPlan();
        case 'log':
            return renderAuditLog();
        default:
            return renderSummary(); // Default to summary view
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
        <div className="flex items-center space-x-3">
            <PlanIcon />
            <h2 className="text-2xl font-semibold text-gray-700">Plan de Producción a Mediano Plazo</h2>
        </div>
        <div className="flex items-center space-x-2 mt-4 md:mt-0">
          <button
              onClick={handleExportDaily}
              disabled={dailyPlan.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center font-semibold disabled:bg-green-300 disabled:cursor-not-allowed"
              title="Descargar el plan detallado a Excel"
          >
              <DataImportIcon />
              <span className="ml-2">Descargar Plan (Excel)</span>
          </button>
          <button
            onClick={onGeneratePlan}
            disabled={isLoading || !isDataSynced}
            className={`px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center justify-center font-semibold
              ${isLoading || !isDataSynced ? 'bg-indigo-300 cursor-not-allowed' : ''}`}
            title={!isDataSynced ? 'Debe sincronizar los datos de ensamble en la pestaña de restricciones primero' : 'Generar plan de producción'}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generando...
              </>
            ) : 'Generar / Regenerar Plan'}
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg">
        <div className="flex justify-between items-center border-b border-gray-200 pb-3 mb-4">
             <nav className="flex space-x-2" aria-label="Tabs">
                <button onClick={() => setActiveTab('summary')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'summary' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                    Resumen por Centro y Línea
                </button>
                <button onClick={() => setActiveTab('daily')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'daily' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                    Plan Diario ({dailyPlan.length})
                </button>
                <button onClick={() => setActiveTab('monthly')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'monthly' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                    Resumen Mensual ({monthlyPlan.length})
                </button>
                <button onClick={() => setActiveTab('log')} className={`px-3 py-2 font-medium text-sm rounded-md ${activeTab === 'log' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}>
                    Bitácora del Planificador
                </button>
            </nav>
            {activeTab === 'daily' && dailyPlan.length > 0 && (
                 <button onClick={handleExportDaily} className="px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 flex items-center">
                    <DataImportIcon/> Exportar Diario
                 </button>
            )}
             {activeTab === 'monthly' && monthlyPlan.length > 0 && (
                 <button onClick={handleExportMonthly} className="px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 flex items-center">
                    <DataImportIcon/> Exportar Mensual
                 </button>
            )}
        </div>
        
        {renderContent()}

      </div>
    </div>
  );
};
