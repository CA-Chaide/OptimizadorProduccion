
import React, { useState, useCallback, useMemo, ChangeEvent, useEffect, useRef } from 'react';
import { logger } from '@/services/LogService';
import { operationTracker } from '@/services/OperationTracker';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { 
    AppConstraints, WorkCenter, ProductionLine, LaborCostSettings, InventorySetting, 
    Bottleneck, SupplierDeliveryTime, QualityParameter, SalesDataRow, ProductProcessInfo, 
    NotificationMessage, Holiday, ProcessType, WorkstationDefinition, ShiftParameters, HolidayScope, ShiftConfigRow
} from '@/types/types';
import { ConstraintsIcon, PlusIcon, EditIcon, DeleteIcon, DataImportIcon, PROCESS_TYPE_OPTIONS, MONTH_NAMES, HOLIDAY_APPLIES_TO_OPTIONS, HOLIDAY_DAY_TYPE_OPTIONS } from '@/constants/constants';
import { MACHINE_CATALOG } from '@/lib/catalogs/machineCatalog';
import { useAppContext } from '@/context/AppProvider';
import { exportShiftsAndCostsTemplateToExcel, parseShiftsAndCostsExcel, parseHolidaysExcel } from '@/services/OptimizationService';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';


interface ConstraintConfigurationSectionProps {
  // All props are removidos, data vendrá del contexto
}

// --- Reusable Form Components ---
const InputField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; containerClassName?: string }> = ({ label, id, containerClassName, ...props }) => (
  <div className={containerClassName || "mb-3"}>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input id={id} {...props} className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${props.disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} />
  </div>
);

const SelectField: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: Array<{value: string | number; label: string}>; containerClassName?: string }> = ({ label, id, options, containerClassName, ...props }) => (
    <div className={containerClassName || "mb-3"}>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <select id={id} {...props} className={`w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${props.disabled ? 'bg-gray-100' : ''}`}>
            <option value="">Seleccione...</option>
            {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
    </div>
);

const CheckboxField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; containerClassName?: string; labelClassName?: string }> = ({ label, id, containerClassName, labelClassName, ...props }) => (
  <div className={containerClassName || "flex items-center my-1"}>
    <input id={id} type="checkbox" {...props} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
    <label htmlFor={id} className={`ml-2 block text-sm text-gray-700 ${labelClassName || ''}`}>{label}</label>
  </div>
);
// --- End Reusable Form Components ---

export const ConstraintConfigurationSection: React.FC<ConstraintConfigurationSectionProps> = () => {
    const inspector = useRuntimeInspector('ConstraintConfiguration');
    
    useEffect(() => {
      logger.log(`\n--------------------------------------------------\n##################################\n--------------------------------------------------\n[ConstraintConfigurationSection] Montado.`);
    }, []);
  const { 
    constraints, 
    setConstraints: onConstraintsUpdate,
    addNotification, 
    handleSyncAndValidate, 
    syncStatus 
  } = useAppContext();
  
  const isDataSynced = syncStatus?.isSynced || false;
  
  // Capturar estado inicial
  useEffect(() => {
    inspector.captureState({
      isDataSynced,
      constraintsLoaded: !!constraints,
      workstationsCount: constraints?.workstationDefinitions?.length || 0,
      productionLinesCount: constraints?.productionLines?.length || 0
    });
  }, [isDataSynced, constraints]);

  const [activeTab, setActiveTab] = useState<string>('syncAndConfig');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [configYear, setConfigYear] = useState<string>(new Date().getFullYear().toString());
  const [configMonth, setConfigMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [textFilters, setTextFilters] = useState({ centro: '', nombResp: '' });


  const handleSyncClick = async () => {
    setIsSyncing(true);
    
    const opId = operationTracker.startOperation(
      'Constraints',
      'api_call',
      'Sincronizando estructura y tiempos de ensamble desde la API...'
    );
    
    try {
      await handleSyncAndValidate();
      operationTracker.completeOperation(opId, 'Sincronización completada exitosamente');
    } catch (error) {
      operationTracker.failOperation(opId, (error as Error).message);
    }
    
    setIsSyncing(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    addNotification('info', `Procesando archivo ${file.name}...`);
    setIsSyncing(true); // Re-use isSyncing state for loading indicator

    const opId = operationTracker.startOperation(
      'Constraints',
      'data_import',
      `Importando configuración desde ${file.name}`
    );

    try {
      const { shiftConfigs, shiftParameters, laborCostFactors, globalBaseCostPerHour } = await parseShiftsAndCostsExcel(file);
      
      onConstraintsUpdate({
        ...constraints,
        shiftParameters,
        laborCostFactors,
        globalBaseCostPerHour,
        importedShiftConfigs: shiftConfigs,
      });

      operationTracker.completeOperation(opId, 'Configuración de costos y turnos importada correctamente.');
      addNotification('success', 'La configuración de costos y turnos se ha actualizado desde el archivo Excel.');
    
    } catch (error) {
      console.error('Error parsing shifts and costs file:', error);
      const errorMessage = (error as Error).message || 'Error desconocido al procesar el archivo.';
      operationTracker.failOperation(opId, errorMessage);
      addNotification('error', `Error al importar: ${errorMessage}`);
    } finally {
      setIsSyncing(false);
      // Reset file input to allow re-uploading the same file
      event.target.value = '';
    }
  };

    const handleHolidayFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        addNotification('info', `Procesando archivo de feriados: ${file.name}...`);
        setIsSyncing(true);
        const opId = operationTracker.startOperation('Constraints', 'data_import', `Importando feriados desde ${file.name}`);

        try {
            const holidays = await parseHolidaysExcel(file);
            onConstraintsUpdate({ ...constraints, holidays });
            operationTracker.completeOperation(opId, 'Feriados importados correctamente.', { count: holidays.length });
            addNotification('success', `${holidays.length} feriados han sido importados y configurados.`);
        } catch (error) {
            const errorMessage = (error as Error).message || 'Error desconocido al procesar el archivo de feriados.';
            operationTracker.failOperation(opId, errorMessage);
            addNotification('error', `Error al importar feriados: ${errorMessage}`);
        } finally {
            setIsSyncing(false);
            event.target.value = ''; // Reset file input
        }
    };


  const handleProcessTypeChange = (lineId: string, newProcessType: ProcessType) => {
    const updatedLines = constraints.productionLines.map(pl => 
      pl.id === lineId ? { ...pl, processType: newProcessType } : pl
    );
    onConstraintsUpdate({ ...constraints, productionLines: updatedLines });
  };

  const handleEmployeesPerWorkstationChange = (wdId: string, value: string) => {
    const numValue = parseInt(value, 10);
    const updatedWds = constraints.workstationDefinitions.map(wd => 
      wd.id === wdId ? { ...wd, employeesPerWorkstation: isNaN(numValue) || numValue < 1 ? 1 : numValue } : wd
    );
    onConstraintsUpdate({ ...constraints, workstationDefinitions: updatedWds });
  };

  const handleWorkstationQuantityInLineChange = (lineId: string, wdId: string, value: string) => {
    const numValue = parseInt(value, 10);
    const updatedLines = constraints.productionLines.map(pl => {
      if (pl.id === lineId) {
        const updatedWorkstations = pl.assignedWorkstations.map(as => 
          as.definitionId === wdId ? { ...as, quantity: isNaN(numValue) || numValue < 0 ? 0 : numValue } : as
        );
        return { ...pl, assignedWorkstations: updatedWorkstations };
      }
      return pl;
    });
    onConstraintsUpdate({ ...constraints, productionLines: updatedLines });
  };

  // --- Holidays Handlers ---

  const dynamicHolidayOptions = useMemo(() => {
    const plantOptions = constraints.workCenters.map(wc => ({
        value: wc.id,
        label: `Producción (${wc.name})`
    }));

    const lineOptions = constraints.productionLines.map(line => ({
        value: line.id,
        label: `Línea: ${line.name} (${line.workCenterId})`
    }));
    return [...HOLIDAY_APPLIES_TO_OPTIONS, ...plantOptions, ...lineOptions];
  }, [constraints.productionLines, constraints.workCenters]);

  const getHolidayAppliesToLabel = (appliesTo: HolidayScope) => {
    const option = dynamicHolidayOptions.find(opt => opt.value === appliesTo);
    return option ? option.label : appliesTo;
  };

  const handleTextFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setTextFilters(prev => ({ ...prev, [name]: value }));
  };
  
  const filterOptions = useMemo(() => {
    if (!constraints.importedShiftConfigs) {
        return { centros: [], nombResps: [] };
    }
    const centros = [...new Set(constraints.importedShiftConfigs.map(c => String(c.Centro)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const nombResps = [...new Set(constraints.importedShiftConfigs.map(c => String(c.NombRespControlProd)))].sort();
    return {
        centros: centros.map(c => ({ value: c, label: c })),
        nombResps: nombResps.map(n => ({ value: n, label: n })),
    };
  }, [constraints.importedShiftConfigs]);

  const filteredShiftConfigs = useMemo(() => {
    if (!constraints.importedShiftConfigs) return [];
    
    const lowerCentro = textFilters.centro.toLowerCase();
    const lowerNombResp = textFilters.nombResp.toLowerCase();

    return constraints.importedShiftConfigs.filter(config => {
        const yearMatch = String(config.Año) === configYear;
        const monthMatch = String(config.Mes) === configMonth;
        const centroMatch = !textFilters.centro || String(config.Centro) === textFilters.centro;
        const nombRespMatch = !textFilters.nombResp || String(config.NombRespControlProd) === textFilters.nombResp;

        return yearMatch && monthMatch && centroMatch && nombRespMatch;
    });
  }, [constraints.importedShiftConfigs, configYear, configMonth, textFilters]);
  
  const activeShiftConfig = useMemo(() => {
      return filteredShiftConfigs.length > 0 ? filteredShiftConfigs[0] : null;
  }, [filteredShiftConfigs]);


  const tabs = [
    { id: 'syncAndConfig', label: '1. Sincronización y Configuración' },
    { id: 'costsAndShifts', label: '2. Costos y Turnos' },
    { id: 'holidays', label: '3. Feriados' },
  ];

  return (
    <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center space-x-3">
            <ConstraintsIcon />
            <h2 className="text-2xl font-semibold text-gray-700">Configuración del Entorno de Producción</h2>
        </div>

        <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm
                            ${activeTab === tab.id
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </nav>
        </div>
        
        <div className="mt-6">
            {activeTab === 'syncAndConfig' && (
              <div className="space-y-8">
                <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Sincronización de Estructura y Tiempos</h3>
                    <p className="text-sm text-gray-600">
                        Presione este botón para obtener la estructura más reciente de Centros, Líneas, Puestos de Trabajo y sus respectivos tiempos de ensamble desde la API.
                        Este paso es **obligatorio** antes de generar un plan de producción. La estructura se descubrirá automáticamente. Después de sincronizar, puede ajustar los parámetros como el número de empleados o puestos por línea.
                    </p>
                    <div className="flex items-center gap-4 pt-2">
                        <button 
                            onClick={handleSyncClick} 
                            disabled={isSyncing}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center disabled:bg-blue-300"
                        >
                            <DataImportIcon/>
                            {isSyncing ? 'Sincronizando...' : 'Sincronizar y Validar Datos'}
                        </button>
                        {isDataSynced && (
                            <span className="text-sm font-medium text-green-600">✓ Estructura y tiempos sincronizados y validados correctamente.</span>
                        )}
                        {!isDataSynced && constraints.productProcessInfos.length > 0 && (
                             <span className="text-sm font-medium text-yellow-600">⚠️ La estructura podría estar desactualizada. Se recomienda sincronizar.</span>
                        )}
                    </div>
                 </div>

                <div className="bg-white p-6 rounded-xl shadow-lg">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Estructura de Producción Descubierta</h3>
                     <div className="max-h-[80vh] overflow-y-auto space-y-4">
                        {constraints.workCenters.map(wc => (
                            <div key={wc.id} className="p-4 border rounded-lg bg-gray-50">
                                <h4 className="text-md font-bold text-indigo-700">Centro: {wc.name}</h4>
                                <div className="pl-4 mt-2 space-y-3">
                                    {constraints.productionLines.filter(pl => pl.workCenterId === wc.id).map(pl => (
                                        <div key={pl.id} className="p-3 border-l-2 border-indigo-200">
                                            <div className="flex justify-between items-center">
                                                <p className="font-semibold text-gray-800">{pl.name}</p>
                                                <select 
                                                    value={pl.processType} 
                                                    onChange={(e) => handleProcessTypeChange(pl.id, e.target.value as ProcessType)}
                                                    className="border border-gray-300 rounded-md text-xs py-1"
                                                    title="Asignar tipo de proceso a esta línea"
                                                >
                                                    {PROCESS_TYPE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                                </select>
                                            </div>
                                            <div className="pl-4 mt-2 space-y-2">
                                                {pl.assignedWorkstations.map(as => {
                                                    const wd = constraints.workstationDefinitions.find(w => w.id === as.definitionId);
                                                    if (!wd) return null; // Defensive check
                                                    return (
                                                        <div key={as.definitionId} className="flex justify-between items-center text-sm p-2 bg-white rounded-md shadow-sm">
                                                            <span className="text-gray-700">{wd.name}</span>
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex items-center gap-2">
                                                                    <label htmlFor={`emp-qty-${wd.id}`} className="text-xs text-gray-600">Empl:</label>
                                                                    <input 
                                                                        type="number" 
                                                                        id={`emp-qty-${wd.id}`}
                                                                        value={wd.employeesPerWorkstation} 
                                                                        onChange={e => handleEmployeesPerWorkstationChange(wd.id, e.target.value)}
                                                                        className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm"
                                                                        min="1"
                                                                    />
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <label htmlFor={`line-qty-${pl.id}-${wd.id}`} className="text-xs text-gray-600">Cant:</label>
                                                                    <input 
                                                                        type="number"
                                                                        id={`line-qty-${pl.id}-${wd.id}`}
                                                                        value={as.quantity}
                                                                        onChange={e => handleWorkstationQuantityInLineChange(pl.id, as.definitionId, e.target.value)}
                                                                        className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm"
                                                                        min="0"
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                     </div>
                </div>

              </div>
            )}
            {activeTab === 'costsAndShifts' && (
                <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Configuración de Turnos y Costos por Excel</h3>
                    <p className="text-sm text-gray-600">
                        Utilice esta sección para cargar la configuración de turnos y costos laborales desde un archivo Excel estandarizado. Toda la configuración se gestiona ahora desde la hoja `Configuracion_Turnos`.
                    </p>
                    <div className="flex items-center justify-center pt-4 gap-4">
                        <label className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center cursor-pointer disabled:bg-gray-400 disabled:cursor-not-allowed">
                             <DataImportIcon />
                             {isSyncing ? 'Procesando...' : 'Importar Archivo de Configuración'}
                            <input 
                                type="file" 
                                className="hidden" 
                                onChange={handleFileUpload}
                                accept=".xlsx, .xls"
                                disabled={isSyncing}
                            />
                        </label>
                    </div>

                    {constraints.importedShiftConfigs && constraints.importedShiftConfigs.length > 0 && (
                        <div className="mt-6 space-y-8">
                             <div>
                                <h4 className="font-semibold text-gray-700 mb-2">Resumen de Turnos para Planificación</h4>
                                <p className="text-xs text-gray-500 mb-4">
                                  Mostrando la configuración activa para el período seleccionado (el sistema usa la primera fila encontrada).
                                </p>
                                {activeShiftConfig ? (
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="p-3 border rounded-lg bg-blue-50 text-center">
                                            <p className="text-sm font-medium text-blue-800">Horas Normales</p>
                                            <p className="text-2xl font-bold text-blue-900">{activeShiftConfig['Horas Normales']}h</p>
                                            <p className="text-xs text-blue-600">(Lunes a Viernes)</p>
                                        </div>
                                        <div className="p-3 border rounded-lg bg-blue-50 text-center">
                                            <p className="text-sm font-medium text-blue-800">Horas Extra Máximas</p>
                                            <p className="text-2xl font-bold text-blue-900">{activeShiftConfig['H.E. 50% (Diurnas)']}h</p>
                                            <p className="text-xs text-blue-600">(Lunes a Viernes)</p>
                                        </div>
                                        <div className="p-3 border rounded-lg bg-blue-50 text-center">
                                            <p className="text-sm font-medium text-blue-800">Horas Sábado/Feriado</p>
                                            <p className="text-2xl font-bold text-blue-900">{activeShiftConfig['H.E. 100% (Sab-Dom/Fer)']}h</p>
                                            <p className="text-xs text-blue-600">(Jornada especial)</p>
                                        </div>
                                        <div className="p-3 border rounded-lg bg-blue-50 text-center">
                                            <p className="text-sm font-medium text-blue-800"># Turnos</p>
                                            <p className="text-2xl font-bold text-blue-900">{activeShiftConfig['# Turnos']}</p>
                                            <p className="text-xs text-blue-600">(Planificados)</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-4 text-gray-500">
                                        No hay configuración de turnos para el Año y Mes seleccionados.
                                    </div>
                                )}
                            </div>
                            
                            <div className="mt-6">
                                <h4 className="font-semibold text-gray-700 mb-2">Factores de Costo</h4>
                                 {activeShiftConfig ? (
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="p-3 border rounded-lg bg-gray-50">
                                            <p className="text-xs text-gray-500">Costo Base/Hora</p>
                                            <p className="text-lg font-bold text-gray-800">${activeShiftConfig['Costo Horas Normales'].toFixed(2)}</p>
                                        </div>
                                        <div className="p-3 border rounded-lg bg-gray-50">
                                            <p className="text-xs text-gray-500">Recargo Extra Diurno</p>
                                            <p className="text-lg font-bold text-gray-800">{activeShiftConfig['Costo H.E. 50% (Diurnas)']}%</p>
                                        </div>
                                         <div className="p-3 border rounded-lg bg-gray-50">
                                            <p className="text-xs text-gray-500">Recargo Nocturno</p>
                                            <p className="text-lg font-bold text-gray-800">{activeShiftConfig['Costo Recargo Jornada Nocturna (%)']}%</p>
                                        </div>
                                        <div className="p-3 border rounded-lg bg-gray-50">
                                            <p className="text-xs text-gray-500">Recargo FDS/Feriado</p>
                                            <p className="text-lg font-bold text-gray-800">{activeShiftConfig['Costo H.E. 100% (Sab-Dom/Fer)']}%</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="text-center py-4 text-gray-500">
                                        No hay configuración de costos para el Año y Mes seleccionados.
                                    </div>
                                )}
                            </div>

                            <div>
                                <h4 className="font-semibold text-gray-700 mb-2">Detalle de Configuración</h4>
                                <div className="flex flex-wrap items-end space-x-2 mb-4 p-4 border rounded-lg bg-gray-50">
                                  <div>
                                     <label htmlFor="configYear" className="block text-sm font-medium text-gray-700">Año</label>
                                     <select id="configYear" value={configYear} onChange={e => setConfigYear(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border">
                                        {[...new Set((constraints.importedShiftConfigs || []).map(c => c.Año))].sort().map(y => <option key={y} value={String(y)}>{y}</option>)}
                                     </select>
                                  </div>
                                  <div>
                                     <label htmlFor="configMonth" className="block text-sm font-medium text-gray-700">Mes</label>
                                     <select id="configMonth" value={configMonth} onChange={e => setConfigMonth(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border">
                                         {MONTH_NAMES.map((m, i) => <option key={i+1} value={String(i+1)}>{m}</option>)}
                                     </select>
                                  </div>
                                  <div className="flex-grow">
                                     <label htmlFor="filterCentro" className="block text-sm font-medium text-gray-700">Centro</label>
                                     <select id="filterCentro" name="centro" value={textFilters.centro} onChange={handleTextFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border">
                                        <option value="">Todos</option>
                                        {filterOptions.centros.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                     </select>
                                  </div>
                                   <div className="flex-grow">
                                     <label htmlFor="filterNombResp" className="block text-sm font-medium text-gray-700">Nombre Resp.</label>
                                      <select id="filterNombResp" name="nombResp" value={textFilters.nombResp} onChange={handleTextFilterChange} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md border">
                                        <option value="">Todos</option>
                                        {filterOptions.nombResps.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                     </select>
                                  </div>
                                </div>

                                <div className="border rounded-lg overflow-auto max-h-[60vh]">
                                  <table className="min-w-full text-xs divide-y divide-gray-200">
                                    <thead className="bg-gray-100 sticky top-0">
                                      <tr>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Centro</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Resp. Ctrl. Prod.</th>
                                        <th className="px-2 py-2 text-left font-semibold text-gray-600">Nombre Resp.</th>
                                        <th className="px-2 py-2 text-right font-semibold text-gray-600">H. Normales</th>
                                        <th className="px-2 py-2 text-right font-semibold text-gray-600">H.E. 50%</th>
                                        <th className="px-2 py-2 text-right font-semibold text-gray-600">H.E. 100%</th>
                                        <th className="px-2 py-2 text-right font-semibold text-gray-600"># Turnos</th>
                                        <th className="px-2 py-2 text-right font-semibold text-gray-600">Costo H. Normal</th>
                                        <th className="px-2 py-2 text-right font-semibold text-gray-600">Rec. HE 50%</th>
                                        <th className="px-2 py-2 text-right font-semibold text-gray-600">Rec. Nocturno %</th>
                                        <th className="px-2 py-2 text-right font-semibold text-gray-600">Rec. FDS/Fer %</th>
                                      </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                      {filteredShiftConfigs.map((config, index) => (
                                        <tr key={index}>
                                          <td className="px-2 py-2">{config.Centro}</td>
                                          <td className="px-2 py-2">{config.RespCtrlProd}</td>
                                          <td className="px-2 py-2">{config.NombRespControlProd}</td>
                                          <td className="px-2 py-2 text-right font-mono">{config['Horas Normales']}</td>
                                          <td className="px-2 py-2 text-right font-mono">{config['H.E. 50% (Diurnas)']}</td>
                                          <td className="px-2 py-2 text-right font-mono">{config['H.E. 100% (Sab-Dom/Fer)']}</td>
                                          <td className="px-2 py-2 text-right font-mono">{config['# Turnos']}</td>
                                          <td className="px-2 py-2 text-right font-mono">${config['Costo Horas Normales'].toFixed(2)}</td>
                                          <td className="px-2 py-2 text-right font-mono">{config['Costo H.E. 50% (Diurnas)']}%</td>
                                          <td className="px-2 py-2 text-right font-mono">{config['Costo Recargo Jornada Nocturna (%)']}%</td>
                                          <td className="px-2 py-2 text-right font-mono">{config['Costo H.E. 100% (Sab-Dom/Fer)']}%</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            )}
             {activeTab === 'holidays' && (
                <div className="bg-white p-6 rounded-xl shadow-lg space-y-6">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-800">Gestión de Feriados por Excel</h3>
                        <p className="text-sm text-gray-600 mt-1">
                            Utilice esta sección para cargar la configuración de feriados desde un archivo Excel (`Plantilla_Feriados.xlsx`). Asegúrese de que el archivo contenga la hoja `Feriados` y las columnas `Nombre del Feriado`, `Día de Descanso (Puente)` y `Procesos Aplica`.
                        </p>
                        <div className="flex items-center pt-4 gap-4">
                            <label className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center cursor-pointer disabled:bg-gray-400">
                                <DataImportIcon />
                                Importar Feriados
                                <input
                                    type="file"
                                    className="hidden"
                                    onChange={handleHolidayFileUpload}
                                    accept=".xlsx, .xls"
                                    disabled={isSyncing}
                                />
                            </label>
                        </div>
                    </div>

                    <div className="space-y-3 pt-4">
                      <h3 className="text-lg font-semibold text-gray-800">Feriados Cargados ({constraints.holidays.length})</h3>
                      <div className="max-h-96 overflow-y-auto border rounded-lg">
                          <ul className="divide-y divide-gray-200">
                            {constraints.holidays.sort((a,b) => a.date.localeCompare(b.date)).map(h => (
                               <li key={h.id} className="p-3">
                                  <div className="flex justify-between items-center">
                                     <div>
                                        <p className="font-medium text-gray-900">{h.name}</p>
                                        <p className="text-sm text-gray-500">{h.date} (Aplica: {getHolidayAppliesToLabel(h.appliesTo)})</p>
                                     </div>
                                      <div>
                                        <Badge variant={h.dayType === 'asueto' ? 'destructive' : 'secondary'}>
                                            {HOLIDAY_DAY_TYPE_OPTIONS.find(opt => opt.value === h.dayType)?.label || h.dayType}
                                        </Badge>
                                      </div>
                                  </div>
                               </li>
                            ))}
                          </ul>
                      </div>
                    </div>
                </div>
             )}
        </div>
    </div>
  );
};
