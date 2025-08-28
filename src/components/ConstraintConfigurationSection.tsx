

import React, { useState, useCallback, useMemo, ChangeEvent, useEffect, useRef } from 'react';
import { 
    AppConstraints, WorkCenter, ProductionLine, LaborCostSettings, InventorySetting, 
    Bottleneck, SupplierDeliveryTime, QualityParameter, SalesDataRow, ProductProcessInfo, 
    NotificationMessage, ProductionTimeImportRow, Holiday, ProcessType, WorkstationDefinition, ShiftParameters
} from '@/types/types';
import { ConstraintsIcon, PlusIcon, EditIcon, DeleteIcon, DataImportIcon, PROCESS_TYPE_OPTIONS, MONTH_NAMES, HOLIDAY_APPLIES_TO_OPTIONS } from '@/constants/constants';
import { MACHINE_CATALOG } from '@/lib/catalogs/machineCatalog';
import { useAppContext } from '@/context/AppProvider';


interface ConstraintConfigurationSectionProps {
  // All props are removed, data will come from context
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
  const { 
    constraints, 
    setConstraints: onConstraintsUpdate, // Renaming for clarity within the component
    addNotification, 
    handleSyncAndValidate, 
    syncStatus 
  } = useAppContext();
  
  const isDataSynced = syncStatus?.isSynced || false;

  const [activeTab, setActiveTab] = useState<string>('syncAndConfig');
  const [isSyncing, setIsSyncing] = useState(false);
  
  const [globalBaseCostDisplay, setGlobalBaseCostDisplay] = useState<string>('');
  const [laborFactorsDisplay, setLaborFactorsDisplay] = useState({
    factorAdicionalDiurno: '',
    factorRecargoNocturno: '',
    factorFinSemanaFeriado: '',
  });
  
  const [shiftParamsDisplay, setShiftParamsDisplay] = useState({
    regularHoursPerDay: '',
    extraHoursPerDay: '',
    saturdayAndHolidayHours: '',
  });

  useEffect(() => {
    setGlobalBaseCostDisplay(
      constraints.globalBaseCostPerHour === null || constraints.globalBaseCostPerHour === undefined
        ? ''
        : String(constraints.globalBaseCostPerHour)
    );
    if (constraints.laborCostFactors) {
      setLaborFactorsDisplay({
        factorAdicionalDiurno: String(constraints.laborCostFactors.factorAdicionalDiurno),
        factorRecargoNocturno: String(constraints.laborCostFactors.factorRecargoNocturno),
        factorFinSemanaFeriado: String(constraints.laborCostFactors.factorFinSemanaFeriado),
      });
    }
    if (constraints.shiftParameters) {
      setShiftParamsDisplay({
        regularHoursPerDay: String(constraints.shiftParameters.regularHoursPerDay),
        extraHoursPerDay: String(constraints.shiftParameters.extraHoursPerDay),
        saturdayAndHolidayHours: String(constraints.shiftParameters.saturdayAndHolidayHours),
      });
    }
  }, [constraints.globalBaseCostPerHour, constraints.laborCostFactors, constraints.shiftParameters]);

  const [holidayForm, setHolidayForm] = useState<Omit<Holiday, 'id'>>({ date: '', name: '', appliesTo: 'Ambos', isProductionAllowed: false });
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);

  const handleSyncClick = async () => {
    setIsSyncing(true);
    await handleSyncAndValidate();
    setIsSyncing(false);
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
          as.definitionId === wdId ? { ...as, quantity: isNaN(numValue) || numValue < 1 ? 1 : numValue } : as
        );
        return { ...pl, assignedWorkstations: updatedWorkstations };
      }
      return pl;
    });
    onConstraintsUpdate({ ...constraints, productionLines: updatedLines });
  };
  
  const handleSaveGlobalCosts = () => {
    const baseCost = parseFloat(globalBaseCostDisplay);
    const factors: LaborCostSettings = {
        factorAdicionalDiurno: parseFloat(laborFactorsDisplay.factorAdicionalDiurno),
        factorRecargoNocturno: parseFloat(laborFactorsDisplay.factorRecargoNocturno),
        factorFinSemanaFeriado: parseFloat(laborFactorsDisplay.factorFinSemanaFeriado),
    };
    if (isNaN(baseCost) || baseCost <= 0) { addNotification('warning', 'El costo base por hora debe ser un número positivo.'); return; }
    if (isNaN(factors.factorAdicionalDiurno) || isNaN(factors.factorRecargoNocturno) || isNaN(factors.factorFinSemanaFeriado)) { addNotification('warning', 'Todos los factores de costo deben ser números válidos.'); return; }
    onConstraintsUpdate({ ...constraints, globalBaseCostPerHour: baseCost, laborCostFactors: factors });
    addNotification('success', 'Costos globales actualizados.');
  };

  const handleSaveShiftParams = () => {
    const params: ShiftParameters = {
        regularHoursPerDay: parseFloat(shiftParamsDisplay.regularHoursPerDay),
        extraHoursPerDay: parseFloat(shiftParamsDisplay.extraHoursPerDay),
        saturdayAndHolidayHours: parseFloat(shiftParamsDisplay.saturdayAndHolidayHours),
    };
    if (isNaN(params.regularHoursPerDay) || isNaN(params.extraHoursPerDay) || isNaN(params.saturdayAndHolidayHours)) {
        addNotification('warning', 'Todos los parámetros de turno deben ser números válidos.'); return;
    }
    if (params.regularHoursPerDay < 0 || params.extraHoursPerDay < 0 || params.saturdayAndHolidayHours < 0) {
        addNotification('warning', 'Los valores de horas no pueden ser negativos.'); return;
    }
    onConstraintsUpdate({ ...constraints, shiftParameters: params });
    addNotification('success', 'Parámetros de turno actualizados.');
  };

  // --- Holidays Handlers ---
  const handleSaveHoliday = () => {
    if (!holidayForm.name.trim() || !holidayForm.date || !holidayForm.appliesTo) { addNotification('warning', 'Nombre, fecha y a qué aplica el feriado son requeridos.'); return; }
    if (editingHoliday) {
        onConstraintsUpdate({ ...constraints, holidays: constraints.holidays.map(h => h.id === editingHoliday.id ? { ...editingHoliday, ...holidayForm } : h) });
        addNotification('success', `Feriado '${holidayForm.name}' actualizado.`);
    } else {
        const newHoliday: Holiday = { id: Date.now().toString(), ...holidayForm };
        onConstraintsUpdate({ ...constraints, holidays: [...constraints.holidays, newHoliday] });
        addNotification('success', `Feriado '${holidayForm.name}' agregado.`);
    }
    setHolidayForm({ date: '', name: '', appliesTo: 'Ambos', isProductionAllowed: false });
    setEditingHoliday(null);
  };
  const handleEditHoliday = (holiday: Holiday) => { 
    setEditingHoliday(holiday); 
    setHolidayForm({ name: holiday.name, date: holiday.date, appliesTo: holiday.appliesTo, isProductionAllowed: holiday.isProductionAllowed }); 
  };
  const handleDeleteHoliday = (id: string) => { onConstraintsUpdate({ ...constraints, holidays: constraints.holidays.filter(h => h.id !== id) }); addNotification('info', 'Feriado eliminado.'); };

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
                                                    return (
                                                        <div key={as.definitionId} className="flex justify-between items-center text-sm p-2 bg-white rounded-md shadow-sm">
                                                            <span className="text-gray-700">{wd?.name || 'Puesto desconocido'}</span>
                                                            <div className="flex items-center gap-4">
                                                                <div className="flex items-center gap-2">
                                                                    <label htmlFor={`emp-qty-${wd?.id}`} className="text-xs text-gray-600">Empl:</label>
                                                                    <input 
                                                                        type="number" 
                                                                        id={`emp-qty-${wd?.id}`}
                                                                        value={wd?.employeesPerWorkstation} 
                                                                        onChange={e => handleEmployeesPerWorkstationChange(wd!.id, e.target.value)}
                                                                        className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm"
                                                                        min="1"
                                                                    />
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <label htmlFor={`line-qty-${pl.id}-${wd?.id}`} className="text-xs text-gray-600">Cant:</label>
                                                                    <input 
                                                                        type="number"
                                                                        id={`line-qty-${pl.id}-${wd?.id}`}
                                                                        value={as.quantity}
                                                                        onChange={e => handleWorkstationQuantityInLineChange(pl.id, as.definitionId, e.target.value)}
                                                                        className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm"
                                                                        min="1"
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
              <div className="space-y-8">
                 <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Parámetros de Turnos de Trabajo</h3>
                     <p className="text-sm text-gray-600">Define las horas base para cada tipo de día. Estos valores serán usados por el planificador de producción.</p>
                     <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <InputField label="Horas Jornada Normal (L-V)" id="regularHours" type="number" placeholder="8" value={shiftParamsDisplay.regularHoursPerDay} onChange={e => setShiftParamsDisplay({...shiftParamsDisplay, regularHoursPerDay: e.target.value})} />
                        <InputField label="Horas Extra Máximas (L-V)" id="extraHours" type="number" placeholder="2" value={shiftParamsDisplay.extraHoursPerDay} onChange={e => setShiftParamsDisplay({...shiftParamsDisplay, extraHoursPerDay: e.target.value})} />
                        <InputField label="Horas en Sábado/Feriado" id="holidayHours" type="number" placeholder="5" value={shiftParamsDisplay.saturdayAndHolidayHours} onChange={e => setShiftParamsDisplay({...shiftParamsDisplay, saturdayAndHolidayHours: e.target.value})} />
                     </div>
                      <div className="flex justify-end">
                      <button onClick={handleSaveShiftParams} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Guardar Parámetros de Turno</button>
                    </div>
                 </div>

                 <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Costos Laborales Globales</h3>
                    <p className="text-sm text-gray-600">Estos factores se aplicarán sobre los horarios de trabajo para calcular el costo del plan.</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <InputField label="Costo Base Global por Hora ($)" id="globalBaseCost" type="number" placeholder="10.00" value={globalBaseCostDisplay} onChange={e => setGlobalBaseCostDisplay(e.target.value)} />
                        <InputField label="Factor Recargo Extra (%)" id="factorDiurno" type="number" placeholder="25" title="Recargo para horas extra de Lunes a Viernes." value={laborFactorsDisplay.factorAdicionalDiurno} onChange={e => setLaborFactorsDisplay({...laborFactorsDisplay, factorAdicionalDiurno: e.target.value})} />
                        <InputField label="Factor Recargo Nocturno (%)" id="factorNocturno" type="number" placeholder="50" value={laborFactorsDisplay.factorRecargoNocturno} onChange={e => setLaborFactorsDisplay({...laborFactorsDisplay, factorRecargoNocturno: e.target.value})} />
                        <InputField label="Factor FDS/Feriado (%)" id="factorFeriado" type="number" placeholder="100" title="Recargo para todas las horas en Sábado o feriado productivo." value={laborFactorsDisplay.factorFinSemanaFeriado} onChange={e => setLaborFactorsDisplay({...laborFactorsDisplay, factorFinSemanaFeriado: e.target.value})} />
                    </div>
                    <div className="flex justify-end">
                      <button onClick={handleSaveGlobalCosts} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Guardar Costos</button>
                    </div>
                 </div>
              </div>
            )}
             {activeTab === 'holidays' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                      <h3 className="text-lg font-semibold text-gray-800">{editingHoliday ? 'Editar' : 'Agregar'} Feriado</h3>
                      <InputField label="Nombre del Feriado" id="holidayName" value={holidayForm.name} onChange={e => setHolidayForm({...holidayForm, name: e.target.value})} placeholder="Año Nuevo" />
                      <InputField label="Fecha" id="holidayDate" type="date" value={holidayForm.date} onChange={e => setHolidayForm({...holidayForm, date: e.target.value})} />
                      <SelectField label="Aplica a" id="holidayAppliesTo" value={holidayForm.appliesTo} onChange={e => setHolidayForm({...holidayForm, appliesTo: e.target.value as Holiday['appliesTo']})} options={HOLIDAY_APPLIES_TO_OPTIONS} />
                      <CheckboxField
                        label="Permitir producción en este feriado"
                        id="isProductionAllowed"
                        checked={holidayForm.isProductionAllowed}
                        onChange={e => setHolidayForm({ ...holidayForm, isProductionAllowed: e.target.checked })}
                        containerClassName="pt-2"
                      />
                      <div className="flex justify-end space-x-3">
                          {editingHoliday && <button onClick={() => { setEditingHoliday(null); setHolidayForm({name: '', date: '', appliesTo: 'Ambos', isProductionAllowed: false}); }} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">Cancelar</button>}
                          <button onClick={handleSaveHoliday} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700">{editingHoliday ? 'Guardar Cambios' : 'Agregar Feriado'}</button>
                      </div>
                  </div>
                  <div className="bg-white p-6 rounded-xl shadow-lg space-y-3">
                      <h3 className="text-lg font-semibold text-gray-800">Feriados Existentes ({constraints.holidays.length})</h3>
                      <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                        {constraints.holidays.sort((a,b) => a.date.localeCompare(b.date)).map(h => (
                           <li key={h.id} className="py-3 flex justify-between items-center">
                              <div>
                                <p className="font-medium text-gray-900">{h.name}</p>
                                <p className="text-sm text-gray-500">{h.date} (Aplica: {h.appliesTo})</p>
                                {h.isProductionAllowed && <p className="text-xs text-green-600 font-semibold">Producción permitida</p>}
                              </div>
                              <div className="flex items-center space-x-3">
                                <button onClick={() => handleEditHoliday(h)} className="text-indigo-600 hover:text-indigo-800"><EditIcon/></button>
                                <button onClick={() => handleDeleteHoliday(h.id)} className="text-red-500 hover:text-red-700"><DeleteIcon/></button>
                              </div>
                           </li>
                        ))}
                      </ul>
                  </div>
              </div>
             )}
        </div>
    </div>
  );
};
