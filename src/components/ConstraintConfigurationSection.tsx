
import React, { useState, useCallback, useMemo, ChangeEvent, useEffect, useRef } from 'react';
import { 
    AppConstraints, WorkCenter, ProductionLine, LaborCostSettings, InventorySetting, 
    Bottleneck, SupplierDeliveryTime, QualityParameter, SalesDataRow, ProductProcessInfo, 
    NotificationMessage, ProductionTimeImportRow, Holiday, ProcessType, WorkstationDefinition, ShiftParameters
} from '@/types/types';
import { ConstraintsIcon, PlusIcon, EditIcon, DeleteIcon, DataImportIcon, PROCESS_TYPE_OPTIONS, MONTH_NAMES, HOLIDAY_APPLIES_TO_OPTIONS } from '@/constants/constants';


interface ConstraintConfigurationSectionProps {
  constraints: AppConstraints;
  onConstraintsUpdate: (newConstraints: AppConstraints) => void;
  salesDataProducts: SalesDataRow[];
  addNotification: (type: NotificationMessage['type'], text: string, errors?: string[]) => void;
  onSyncAndValidate: () => Promise<boolean>; // New: Function to trigger validation
  isDataSynced: boolean; // New: To know if data is ready
}

// --- Reusable Form Components ---
const InputField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; containerClassName?: string }> = ({ label, id, containerClassName, ...props }) => (
  <div className={containerClassName || "mb-3"}>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <input id={id} {...props} className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${props.disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`} />
  </div>
);

const TextareaField: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; containerClassName?: string }> = ({ label, id, containerClassName, ...props }) => (
  <div className={containerClassName || "mb-3"}>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <textarea id={id} {...props} rows={2} className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${props.disabled ? 'bg-gray-100' : ''}`} />
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

// Helper function to normalize center names for reliable matching
const normalizeCenterName = (name: string): string => {
  return (name || '').toLowerCase().replace('centro', '').trim();
};


export const ConstraintConfigurationSection: React.FC<ConstraintConfigurationSectionProps> = ({ constraints, onConstraintsUpdate, salesDataProducts, addNotification, onSyncAndValidate, isDataSynced }) => {
  const [activeTab, setActiveTab] = useState<string>('workstationDefs');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // States for forms
  const [wdName, setWdName] = useState(''); // WorkstationDefinition Name
  const [wdEmployees, setWdEmployees] = useState<number>(1); // WorkstationDefinition Employees
  const [editingWd, setEditingWd] = useState<WorkstationDefinition | null>(null);

  const [wcName, setWcName] = useState('');
  const [editingWc, setEditingWc] = useState<WorkCenter | null>(null);

  const [plName, setPlName] = useState('');
  const [plWorkCenterId, setPlWorkCenterId] = useState('');
  const [plProcessType, setPlProcessType] = useState<ProcessType>(PROCESS_TYPE_OPTIONS[0].value);
  const [editingPl, setEditingPl] = useState<ProductionLine | null>(null);

  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
  const [assignedWsDefId, setAssignedWsDefId] = useState<string>(''); // ID of WorkstationDefinition to assign
  const [assignedWsQuantity, setAssignedWsQuantity] = useState<number>(1); // Quantity for this assignment
  
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
    // When the expanded line changes, reset the assignment form state for a clean slate.
    setAssignedWsDefId('');
    setAssignedWsQuantity(1);
  }, [expandedLineId]);
  
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
    } else {
      setLaborFactorsDisplay({
        factorAdicionalDiurno: '',
        factorRecargoNocturno: '',
        factorFinSemanaFeriado: '',
      });
    }
    if (constraints.shiftParameters) {
      setShiftParamsDisplay({
        regularHoursPerDay: String(constraints.shiftParameters.regularHoursPerDay),
        extraHoursPerDay: String(constraints.shiftParameters.extraHoursPerDay),
        saturdayAndHolidayHours: String(constraints.shiftParameters.saturdayAndHolidayHours),
      });
    } else {
      setShiftParamsDisplay({
        regularHoursPerDay: '',
        extraHoursPerDay: '',
        saturdayAndHolidayHours: '',
      });
    }
  }, [constraints.globalBaseCostPerHour, constraints.laborCostFactors, constraints.shiftParameters]);

  const [holidayForm, setHolidayForm] = useState<Omit<Holiday, 'id'>>({ date: '', name: '', appliesTo: 'Ambos', isProductionAllowed: false });
  const [editingHoliday, setEditingHoliday] = useState<Holiday | null>(null);

  const handleSyncClick = async () => {
    setIsSyncing(true);
    await onSyncAndValidate();
    setIsSyncing(false);
  };
  
  // --- WorkstationDefinition Management (Global) ---
  const handleSaveWorkstationDefinition = () => {
    if (!wdName.trim() || wdEmployees < 1) {
        addNotification('warning', 'Nombre de definición y empleados (>=1) son requeridos.');
        return;
    }
    const trimmedWdName = wdName.trim();
    if (editingWd) {
        if (constraints.workstationDefinitions.some(wd => wd.id !== editingWd.id && wd.name.toLowerCase() === trimmedWdName.toLowerCase())) {
            addNotification('error', `Definición de puesto '${trimmedWdName}' ya existe.`);
            return;
        }
        const updatedWds = constraints.workstationDefinitions.map(wd => 
            wd.id === editingWd.id ? { ...wd, name: trimmedWdName, employeesPerWorkstation: wdEmployees, isActive: editingWd.isActive, machineCode: wd.machineCode } : wd
        );
        onConstraintsUpdate({ ...constraints, workstationDefinitions: updatedWds });
        addNotification('success', `Definición '${trimmedWdName}' actualizada.`);
    } else {
        if (constraints.workstationDefinitions.some(wd => wd.name.toLowerCase() === trimmedWdName.toLowerCase())) {
            addNotification('error', `Definición de puesto '${trimmedWdName}' ya existe.`);
            return;
        }
        const newWd: WorkstationDefinition = { id: Date.now().toString(), name: trimmedWdName, employeesPerWorkstation: wdEmployees, isActive: true, machineCode: null };
        onConstraintsUpdate({ ...constraints, workstationDefinitions: [...constraints.workstationDefinitions, newWd] });
        addNotification('success', `Definición '${trimmedWdName}' agregada.`);
    }
    setWdName(''); setWdEmployees(1); setEditingWd(null);
  };
  const handleEditWorkstationDefinition = (wd: WorkstationDefinition) => { setEditingWd(wd); setWdName(wd.name); setWdEmployees(wd.employeesPerWorkstation); };
  const toggleWdActive = (wdId: string) => {
    onConstraintsUpdate({ ...constraints, workstationDefinitions: constraints.workstationDefinitions.map(wd => wd.id === wdId ? {...wd, isActive: !(wd.isActive ?? true)} : wd) });
  };
  const handleDeleteWorkstationDefinition = (id: string) => {
    if (constraints.productionLines.some(pl => pl.assignedWorkstations.some(as => as.definitionId === id))) {
        addNotification('error', `No se puede eliminar: Definición asignada a una o más líneas de producción.`); return;
    }
    if (constraints.productProcessInfos.some(ppi => ppi.workstationTimes.some(wt => wt.workstationDefinitionId === id))) {
        addNotification('error', `No se puede eliminar: Definición referenciada en Tiempos de Proceso.`); return;
    }
    onConstraintsUpdate({ ...constraints, workstationDefinitions: constraints.workstationDefinitions.filter(wd => wd.id !== id) });
    addNotification('info', `Definición de puesto eliminada.`);
  };


  // --- Work Center Management ---
  const handleSaveWorkCenter = () => {
    if (!wcName.trim()) { addNotification('warning', 'El nombre del centro de trabajo no puede estar vacío.'); return; }
    if (editingWc) {
        const updatedWcs = constraints.workCenters.map(wc => wc.id === editingWc.id ? {...wc, name: wcName.trim(), isActive: editingWc.isActive} : wc);
        onConstraintsUpdate({ ...constraints, workCenters: updatedWcs });
        addNotification('success', `Centro de trabajo '${wcName.trim()}' actualizado.`);
    } else {
        if (constraints.workCenters.some(wc => wc.name.toLowerCase() === wcName.trim().toLowerCase())) {
            addNotification('error', `El centro de trabajo '${wcName.trim()}' ya existe.`); return;
        }
        const newWorkCenter: WorkCenter = { id: Date.now().toString(), name: wcName.trim(), productionLineIds: [], isActive: true };
        onConstraintsUpdate({ ...constraints, workCenters: [...constraints.workCenters, newWorkCenter] });
        addNotification('success', `Centro de trabajo '${wcName.trim()}' agregado.`);
    }
    setWcName(''); setEditingWc(null);
  };
  const handleEditWorkCenter = (wc: WorkCenter) => { setEditingWc(wc); setWcName(wc.name); };
  const toggleWcActive = (wcId: string) => {
    onConstraintsUpdate({ ...constraints, workCenters: constraints.workCenters.map(wc => wc.id === wcId ? {...wc, isActive: !(wc.isActive ?? true)} : wc) });
  };
  const handleDeleteWorkCenter = (id: string) => {
    if (constraints.productionLines.some(pl => pl.workCenterId === id)) { addNotification('error', `No se puede eliminar: Centro asociado a líneas.`); return; }
    if (constraints.inventorySettings.some(is => is.centerId === id)) { addNotification('error', `No se puede eliminar: Centro en inventario.`); return; }
    onConstraintsUpdate({ ...constraints, workCenters: constraints.workCenters.filter(wc => wc.id !== id) });
    addNotification('info', `Centro de trabajo eliminado.`);
  };

  // --- Production Line Management ---
  const handleSaveProductionLine = () => { 
    if (!plName.trim() || !plWorkCenterId || !plProcessType) { addNotification('warning', 'Nombre de línea, centro y tipo de proceso son req.'); return; }
    const trimmedPlName = plName.trim();
    if (editingPl) {
        const updatedPls = constraints.productionLines.map(pl => 
            pl.id === editingPl.id ? {
                ...pl, name: trimmedPlName, workCenterId: plWorkCenterId, processType: plProcessType, isActive: editingPl.isActive,
                capacity: pl.capacity || { maxUnitsPerHour: 0, normalUnitsPerHour: 0, minUnitsPerHour: 0 },
                materialsHandled: pl.materialsHandled || [],
                assignedWorkstations: pl.assignedWorkstations || [], // Preserve assignments
            } : pl
        );
        onConstraintsUpdate({...constraints, productionLines: updatedPls});
        addNotification('success', `Línea '${trimmedPlName}' actualizada.`);
    } else {
        if (constraints.productionLines.some(pl => pl.workCenterId === plWorkCenterId && pl.name.toLowerCase() === trimmedPlName.toLowerCase())) {
            const wcName = constraints.workCenters.find(wc => wc.id === plWorkCenterId)?.name || plWorkCenterId;
            addNotification('error', `La línea '${trimmedPlName}' ya existe en '${wcName}'.`); return;
        }
        const newPL: ProductionLine = { 
            id: Date.now().toString(), name: trimmedPlName, workCenterId: plWorkCenterId, processType: plProcessType,
            assignedWorkstations: [], 
            capacity: { maxUnitsPerHour: 0, normalUnitsPerHour: 0, minUnitsPerHour: 0 }, 
            materialsHandled: [], isActive: true,
        };
        const updatedWorkCenters = constraints.workCenters.map(wc => 
            wc.id === plWorkCenterId ? { ...wc, productionLineIds: [...wc.productionLineIds, newPL.id] } : wc
        );
        onConstraintsUpdate({ ...constraints, productionLines: [...constraints.productionLines, newPL], workCenters: updatedWorkCenters });
        addNotification('success', `Línea '${trimmedPlName}' agregada.`);
    }
    setPlName(''); setPlWorkCenterId(''); setPlProcessType(PROCESS_TYPE_OPTIONS[0].value); setEditingPl(null);
  };
  const handleEditProductionLine = (pl: ProductionLine) => { 
      setEditingPl(pl); 
      setPlName(pl.name); 
      setPlWorkCenterId(pl.workCenterId); 
      setPlProcessType(pl.processType || PROCESS_TYPE_OPTIONS[0].value); 
  };
  const togglePlActive = (plId: string) => {
    onConstraintsUpdate({ ...constraints, productionLines: constraints.productionLines.map(pl => pl.id === plId ? {...pl, isActive: !(pl.isActive ?? true)} : pl) });
  };
  const handleDeleteProductionLine = (id: string) => { 
    const lineToDelete = constraints.productionLines.find(pl => pl.id === id);
    if (!lineToDelete) return;
    if (lineToDelete.assignedWorkstations.length > 0) { addNotification('error', `Elimine puestos asignados primero.`); return; }
    if (constraints.productProcessInfos.some(ppi => ppi.productionLineId === id)) { addNotification('error', `Línea en Tiempos de Proceso.`); return;}
    const updatedWorkCenters = constraints.workCenters.map(wc => wc.id === lineToDelete.workCenterId ? { ...wc, productionLineIds: wc.productionLineIds.filter(plId => plId !== id) } : wc);
    onConstraintsUpdate({ ...constraints, productionLines: constraints.productionLines.filter(pl => pl.id !== id), workCenters: updatedWorkCenters });
    if(expandedLineId === id) setExpandedLineId(null); 
    addNotification('info', `Línea eliminada.`);
  };

  // --- AssignedWorkstation Management (On ProductionLine) ---
  const handleAssignWorkstationToLine = (lineId: string) => {
    if (!lineId || !assignedWsDefId || assignedWsQuantity < 1) {
        addNotification('warning', 'Seleccione un tipo de puesto y cantidad (>=1).'); return;
    }
    const targetPlIndex = constraints.productionLines.findIndex(pl => pl.id === lineId);
    if (targetPlIndex === -1) { addNotification('error', 'Línea no encontrada.'); return; }

    const updatedProductionLines = [...constraints.productionLines];
    let targetPl = { ...updatedProductionLines[targetPlIndex] };
    
    if (targetPl.assignedWorkstations.some(as => as.definitionId === assignedWsDefId)) {
        addNotification('error', `Este tipo de puesto ya está asignado a la línea. Edite la cantidad existente.`);
        return;
    }

    targetPl.assignedWorkstations = [...targetPl.assignedWorkstations, { definitionId: assignedWsDefId, quantity: assignedWsQuantity }];
    updatedProductionLines[targetPlIndex] = targetPl;
    onConstraintsUpdate({ ...constraints, productionLines: updatedProductionLines });
    const wdName = constraints.workstationDefinitions.find(wd => wd.id === assignedWsDefId)?.name;
    addNotification('success', `Puesto '${wdName}' (x${assignedWsQuantity}) asignado a línea '${targetPl.name}'.`);
    setAssignedWsDefId(''); setAssignedWsQuantity(1);
  };
  const handleUpdateAssignedWorkstationQuantity = (lineId: string, definitionId: string, newQuantity: number) => {
    if (newQuantity < 1) { addNotification('warning', 'Cantidad debe ser >= 1.'); return; }
    const updatedPls = constraints.productionLines.map(pl => {
        if (pl.id === lineId) {
            return {
                ...pl,
                assignedWorkstations: pl.assignedWorkstations.map(as => 
                    as.definitionId === definitionId ? { ...as, quantity: newQuantity } : as
                )
            };
        }
        return pl;
    });
    onConstraintsUpdate({ ...constraints, productionLines: updatedPls });
    addNotification('info', 'Cantidad de puesto actualizada.');
  };
  const handleRemoveAssignedWorkstationFromLine = (lineId: string, definitionId: string) => {
    if (constraints.productProcessInfos.some(ppi => ppi.productionLineId === lineId && ppi.workstationTimes.some(wt => wt.workstationDefinitionId === definitionId))) {
        addNotification('error', `Este tipo de puesto está referenciado en Tiempos de Proceso para esta línea. No se puede remover.`); return;
    }
    const updatedPls = constraints.productionLines.map(pl => {
        if (pl.id === lineId) {
            return { ...pl, assignedWorkstations: pl.assignedWorkstations.filter(as => as.definitionId !== definitionId) };
        }
        return pl;
    });
    onConstraintsUpdate({ ...constraints, productionLines: updatedPls });
    addNotification('info', 'Puesto desasignado de la línea.');
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
    { id: 'workstationDefs', label: '1. Puestos Trabajo (Global)' },
    { id: 'workCentersAndLines', label: '2. Centros y Líneas' },
    { id: 'syncAndCosts', label: '3. Sincronización y Costos' },
    { id: 'holidays', label: '4. Feriados' },
  ];
  
  const activeWorkCenters = useMemo(() => constraints.workCenters.filter(wc => wc.isActive !== false), [constraints.workCenters]);
  const activeWorkstationDefs = useMemo(() => constraints.workstationDefinitions.filter(wd => wd.isActive !== false), [constraints.workstationDefinitions]);


  return (
    <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center space-x-3">
            <ConstraintsIcon />
            <h2 className="text-2xl font-semibold text-gray-700">Definir Restricciones</h2>
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
            {activeTab === 'workstationDefs' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Form */}
                  <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                      <h3 className="text-lg font-semibold text-gray-800">{editingWd ? 'Editar' : 'Agregar'} Puesto de Trabajo Global</h3>
                      <InputField label="Nombre del Puesto (Ej: Cerrador, Soldador)" id="wdName" value={wdName} onChange={e => setWdName(e.target.value)} placeholder="Cerrador"/>
                      <InputField label="Cantidad de Empleados por Puesto" id="wdEmployees" type="number" min="1" value={String(wdEmployees)} onChange={e => setWdEmployees(Number(e.target.value) || 1)} />
                      <div className="flex justify-end space-x-3">
                          {editingWd && <button onClick={() => { setEditingWd(null); setWdName(''); setWdEmployees(1); }} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">Cancelar</button>}
                          <button onClick={handleSaveWorkstationDefinition} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center"><PlusIcon /> {editingWd ? 'Guardar Cambios' : 'Agregar'}</button>
                      </div>
                  </div>
                  {/* List */}
                  <div className="bg-white p-6 rounded-xl shadow-lg space-y-3">
                      <h3 className="text-lg font-semibold text-gray-800">Puestos Globales Existentes ({constraints.workstationDefinitions.length})</h3>
                      <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                          {constraints.workstationDefinitions.map(wd => (
                              <li key={wd.id} className="py-3 flex justify-between items-center">
                                  <div>
                                      <p className={`font-medium ${wd.isActive === false ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{wd.name}</p>
                                      <p className="text-sm text-gray-500">Empleados: {wd.employeesPerWorkstation}</p>
                                  </div>
                                  <div className="flex items-center space-x-3">
                                      <CheckboxField id={`wd-active-${wd.id}`} checked={wd.isActive !== false} onChange={() => toggleWdActive(wd.id)} label="Activo" containerClassName="!my-0" />
                                      <button onClick={() => handleEditWorkstationDefinition(wd)} className="text-indigo-600 hover:text-indigo-800"><EditIcon/></button>
                                      <button onClick={() => handleDeleteWorkstationDefinition(wd.id)} className="text-red-500 hover:text-red-700"><DeleteIcon/></button>
                                  </div>
                              </li>
                          ))}
                      </ul>
                  </div>
              </div>
            )}
            {activeTab === 'workCentersAndLines' && (
              <div className="space-y-8">
                {/* --- Work Centers --- */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                      <h3 className="text-lg font-semibold text-gray-800">{editingWc ? 'Editar' : 'Agregar'} Centro de Trabajo</h3>
                      <InputField label="Nombre Centro" id="wcName" value={wcName} onChange={e => setWcName(e.target.value)} placeholder="Ej: Centro 1000" />
                      <div className="flex justify-end space-x-3">
                          {editingWc && <button onClick={() => { setEditingWc(null); setWcName(''); }} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">Cancelar</button>}
                          <button onClick={handleSaveWorkCenter} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center"><PlusIcon /> {editingWc ? 'Guardar' : 'Agregar'}</button>
                      </div>
                  </div>
                   <div className="bg-white p-6 rounded-xl shadow-lg space-y-3">
                      <h3 className="text-lg font-semibold text-gray-800">Centros Existentes ({constraints.workCenters.length})</h3>
                      <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                          {constraints.workCenters.map(wc => (
                              <li key={wc.id} className="py-3 flex justify-between items-center">
                                <p className={`font-medium ${wc.isActive === false ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{wc.name}</p>
                                <div className="flex items-center space-x-3">
                                  <CheckboxField id={`wc-active-${wc.id}`} checked={wc.isActive !== false} onChange={() => toggleWcActive(wc.id)} label="Activo" containerClassName="!my-0" />
                                  <button onClick={() => handleEditWorkCenter(wc)} className="text-indigo-600 hover:text-indigo-800"><EditIcon /></button>
                                  <button onClick={() => handleDeleteWorkCenter(wc.id)} className="text-red-500 hover:text-red-700"><DeleteIcon /></button>
                                </div>
                              </li>
                          ))}
                      </ul>
                  </div>
                </div>

                {/* --- Production Lines --- */}
                <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">{editingPl ? 'Editar' : 'Agregar'} Línea de Producción</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <SelectField label="Asignar a Centro" id="plWorkCenterId" value={plWorkCenterId} onChange={e => setPlWorkCenterId(e.target.value)} options={activeWorkCenters.map(wc => ({ value: wc.id, label: wc.name }))} />
                        <InputField label="Nombre Línea" id="plName" value={plName} onChange={e => setPlName(e.target.value)} placeholder="Ej: Línea Alpha" />
                        <SelectField label="Tipo de Proceso" id="plProcessType" value={plProcessType} onChange={e => setPlProcessType(e.target.value as ProcessType)} options={PROCESS_TYPE_OPTIONS} />
                    </div>
                     <div className="flex justify-end space-x-3">
                        {editingPl && <button onClick={() => { setEditingPl(null); setPlName(''); setPlWorkCenterId(''); setPlProcessType(PROCESS_TYPE_OPTIONS[0].value);}} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">Cancelar</button>}
                        <button onClick={handleSaveProductionLine} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center"><PlusIcon /> {editingPl ? 'Guardar' : 'Agregar'}</button>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-lg space-y-3">
                      <h3 className="text-lg font-semibold text-gray-800">Líneas Existentes ({constraints.productionLines.length})</h3>
                      <ul className="divide-y divide-gray-200">
                          {constraints.productionLines.map(pl => {
                              const wcName = constraints.workCenters.find(wc => wc.id === pl.workCenterId)?.name;
                              return (
                                <li key={pl.id} className="py-3 flex flex-col">
                                    <div className="flex justify-between items-center w-full">
                                        <div>
                                            <p className={`font-medium ${pl.isActive === false ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{pl.name}</p>
                                            <p className="text-sm text-gray-500">(Centro: {wcName}, Proceso: {pl.processType})</p>
                                        </div>
                                        <div className="flex items-center space-x-3">
                                            <button onClick={() => setExpandedLineId(expandedLineId === pl.id ? null : pl.id)} className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
                                                Administrar Puestos ({pl.assignedWorkstations.length})
                                            </button>
                                            <CheckboxField id={`pl-active-${pl.id}`} checked={pl.isActive !== false} onChange={() => togglePlActive(pl.id)} label="Activa" containerClassName="!my-0"/>
                                            <button onClick={() => handleEditProductionLine(pl)} className="text-indigo-600 hover:text-indigo-800"><EditIcon/></button>
                                            <button onClick={() => handleDeleteProductionLine(pl.id)} className="text-red-500 hover:text-red-700"><DeleteIcon/></button>
                                        </div>
                                    </div>
                                    {expandedLineId === pl.id && (
                                      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-4">
                                        <h4 className="font-semibold text-md">Asignar Puesto de Trabajo a Línea: {pl.name}</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                                            <SelectField label="Tipo de Puesto Global" id={`assign-ws-def-${pl.id}`} value={assignedWsDefId} onChange={e => setAssignedWsDefId(e.target.value)} options={activeWorkstationDefs.map(wd => ({ value: wd.id, label: wd.name }))} />
                                            <InputField label="Cantidad en esta Línea" id={`assign-ws-qty-${pl.id}`} type="number" min="1" value={String(assignedWsQuantity)} onChange={e => setAssignedWsQuantity(Number(e.target.value))} />
                                            <button onClick={() => handleAssignWorkstationToLine(pl.id)} className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 h-10">Asignar</button>
                                        </div>
                                        <h5 className="font-semibold text-sm pt-2">Puestos Asignados ({pl.assignedWorkstations.length}):</h5>
                                        {pl.assignedWorkstations.length > 0 ? (
                                            <ul className="divide-y divide-gray-200">
                                            {pl.assignedWorkstations.map(as => {
                                                const def = constraints.workstationDefinitions.find(wd => wd.id === as.definitionId);
                                                return (
                                                <li key={as.definitionId} className="py-2 flex justify-between items-center">
                                                    <p className="font-medium text-gray-700">{def?.name}</p>
                                                    <div className="flex items-center space-x-3">
                                                        <label htmlFor={`update-qty-${pl.id}-${as.definitionId}`} className="text-sm">Cantidad:</label>
                                                        <input type="number" id={`update-qty-${pl.id}-${as.definitionId}`} value={as.quantity} onChange={e => handleUpdateAssignedWorkstationQuantity(pl.id, as.definitionId, Number(e.target.value))} className="w-20 px-2 py-1 border border-gray-300 rounded-md shadow-sm sm:text-sm"/>
                                                        <button onClick={() => handleRemoveAssignedWorkstationFromLine(pl.id, as.definitionId)} className="text-red-500 hover:text-red-700"><DeleteIcon/></button>
                                                    </div>
                                                </li>
                                                )
                                            })}
                                            </ul>
                                        ) : <p className="text-sm text-gray-500">No hay puestos asignados a esta línea.</p>}
                                      </div>
                                    )}
                                </li>
                              )
                          })}
                      </ul>
                  </div>
              </div>
            )}
            {activeTab === 'syncAndCosts' && (
              <div className="space-y-8">
                 <div className="bg-white p-6 rounded-xl shadow-lg space-y-4">
                    <h3 className="text-lg font-semibold text-gray-800">Sincronización de Datos de Ensamble</h3>
                    <p className="text-sm text-gray-600">
                        Haga clic aquí para obtener los últimos tiempos de proceso, inventarios y reglas de suministro desde la API. 
                        Este paso es necesario antes de generar un plan de producción. El sistema validará los datos por usted.
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
                            <span className="text-sm font-medium text-green-600">✓ Datos sincronizados y validados correctamente.</span>
                        )}
                    </div>
                 </div>

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
