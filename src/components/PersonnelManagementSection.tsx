
import React, { useState, useContext, useMemo } from 'react';
import { Employee, EmployeeSkill, NotificationMessage, Machine } from '@/types/types';
import { PersonnelIcon, PlusIcon, EditIcon, DeleteIcon } from '@/constants/constants';
import { NotificationContext } from '@/app/(app)/page';
import { MACHINE_CATALOG } from '@/lib/catalogs/machineCatalog';

interface PersonnelManagementSectionProps {
  employees: Employee[];
  setEmployees: (employees: Employee[]) => void;
  skills: EmployeeSkill[];
  setSkills: (skills: EmployeeSkill[]) => void;
}

const ROLE_OPTIONS: Array<EmployeeSkill['role']> = ['Operador', 'Ayudante'];

// --- Modal Component for Skill Editing ---
const SkillEditModal: React.FC<{
  employee: Employee;
  existingSkills: EmployeeSkill[];
  availableMachines: Machine[];
  onSave: (newSkills: { role: EmployeeSkill['role']; skillLevel: number }[], machineCode: string) => void;
  onClose: () => void;
  initialSkillToEdit?: { machineCode: string };
}> = ({ employee, existingSkills, availableMachines, onSave, onClose, initialSkillToEdit }) => {
  
  const [selectedMachineCode, setSelectedMachineCode] = useState<string>(initialSkillToEdit?.machineCode || '');
  const [operatorSkill, setOperatorSkill] = useState<number>(0);
  const [ayudanteSkill, setAyudanteSkill] = useState<number>(0);

  React.useEffect(() => {
    if (selectedMachineCode) {
      const opSkill = existingSkills.find(s => s.machineCode === selectedMachineCode && s.role === 'Operador')?.skillLevel || 0;
      const aySkill = existingSkills.find(s => s.machineCode === selectedMachineCode && s.role === 'Ayudante')?.skillLevel || 0;
      setOperatorSkill(opSkill);
      setAyudanteSkill(aySkill);
    }
  }, [selectedMachineCode, existingSkills]);

  const handleSave = () => {
    if (!selectedMachineCode) return;
    const newSkills: { role: EmployeeSkill['role']; skillLevel: number }[] = [];
    if (operatorSkill > 0) newSkills.push({ role: 'Operador', skillLevel: operatorSkill });
    if (ayudanteSkill > 0) newSkills.push({ role: 'Ayudante', skillLevel: ayudanteSkill });
    onSave(newSkills, selectedMachineCode);
    onClose();
  };

  const selectedMachine = MACHINE_CATALOG.find(m => m.code === selectedMachineCode);
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-lg">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">
          {initialSkillToEdit ? 'Editar' : 'Añadir'} Competencia para: <span className="text-indigo-600">{employee.name}</span>
        </h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="machine-select" className="block text-sm font-medium text-gray-700">Máquina</label>
            {initialSkillToEdit ? (
               <input type="text" value={selectedMachine?.name || ''} disabled className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm bg-gray-100" />
            ) : (
              <select 
                id="machine-select" 
                value={selectedMachineCode} 
                onChange={e => setSelectedMachineCode(e.target.value)}
                className="mt-1 block w-full border border-gray-300 bg-white rounded-md shadow-sm py-2 px-3 sm:text-sm"
              >
                <option value="">-- Seleccionar Máquina --</option>
                {availableMachines.map(machine => (
                  <option key={machine.code} value={machine.code}>{machine.name} ({machine.processType})</option>
                ))}
              </select>
            )}
          </div>
          {selectedMachineCode && (
            <div className="p-4 border rounded-md bg-gray-50 space-y-3">
               <div>
                  <label className="block text-sm font-medium text-gray-700">Calificación como Operador (0-100)</label>
                  <input type="number" min="0" max="100" value={operatorSkill} onChange={e => setOperatorSkill(Math.max(0, Math.min(100, Number(e.target.value))))} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"/>
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700">Calificación como Ayudante (0-100)</label>
                  <input type="number" min="0" max="100" value={ayudanteSkill} onChange={e => setAyudanteSkill(Math.max(0, Math.min(100, Number(e.target.value))))} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"/>
               </div>
            </div>
          )}
        </div>
        <div className="flex justify-end space-x-3 mt-6">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">Cancelar</button>
          <button onClick={handleSave} disabled={!selectedMachineCode} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300">Guardar Cambios</button>
        </div>
      </div>
    </div>
  );
};


export const PersonnelManagementSection: React.FC<PersonnelManagementSectionProps> = ({
  employees,
  setEmployees,
  skills,
  setSkills,
}) => {
  const addNotification = useContext(NotificationContext);
  
  const [employeeForm, setEmployeeForm] = useState<Omit<Employee, 'id' | 'isActive'>>({ name: '', employeeCode: '' });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  
  const [isSkillModalOpen, setIsSkillModalOpen] = useState(false);
  const [skillToEdit, setSkillToEdit] = useState<{ machineCode: string } | undefined>(undefined);

  const resetEmployeeForm = () => {
    setEmployeeForm({ name: '', employeeCode: '' });
    setEditingEmployee(null);
  };

  const handleEmployeeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeForm.name.trim() || !employeeForm.employeeCode.trim()) {
      addNotification('warning', 'Nombre y código de empleado son requeridos.');
      return;
    }
    const trimmedCode = employeeForm.employeeCode.trim();

    if (editingEmployee) {
      if (employees.some(emp => emp.id !== editingEmployee.id && emp.employeeCode === trimmedCode)) {
        addNotification('error', `El código de empleado '${trimmedCode}' ya existe.`);
        return;
      }
      const updatedEmployees = employees.map(emp =>
        emp.id === editingEmployee.id ? { ...editingEmployee, ...employeeForm, employeeCode: trimmedCode } : emp
      );
      setEmployees(updatedEmployees);
      if (selectedEmployee?.id === editingEmployee.id) {
        setSelectedEmployee(updatedEmployees.find(e => e.id === editingEmployee.id) || null);
      }
      addNotification('success', 'Empleado actualizado.');
      resetEmployeeForm();

    } else {
      if (employees.some(emp => emp.employeeCode === trimmedCode)) {
        addNotification('error', `El código de empleado '${trimmedCode}' ya existe.`);
        return;
      }
      const newEmployee: Employee = { id: Date.now().toString(), ...employeeForm, employeeCode: trimmedCode, isActive: true };
      const updatedEmployees = [...employees, newEmployee];
      setEmployees(updatedEmployees);
      addNotification('success', 'Nuevo empleado agregado. Defina sus competencias.');
      setSelectedEmployee(newEmployee);
      resetEmployeeForm();
    }
  };
  
  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setEmployeeForm({ name: employee.name, employeeCode: employee.employeeCode });
  };
  
  const handleDeleteEmployee = (id: string) => {
    if (window.confirm('¿Está seguro? Esto también eliminará todas las competencias asignadas a este empleado.')) {
      setEmployees(employees.filter(emp => emp.id !== id));
      setSkills(skills.filter(skill => skill.employeeId !== id));
      addNotification('info', 'Empleado eliminado.');
      if(selectedEmployee?.id === id) setSelectedEmployee(null);
    }
  };

  const handleSaveSkill = (
    newSkillsForMachine: { role: EmployeeSkill['role']; skillLevel: number }[],
    machineCode: string
  ) => {
    if (!selectedEmployee) return;

    // Remove all existing skills for this employee on this machine
    let updatedSkills = skills.filter(s => !(s.employeeId === selectedEmployee.id && s.machineCode === machineCode));

    // Add the new/updated skills
    newSkillsForMachine.forEach(newSkill => {
      updatedSkills.push({
        employeeId: selectedEmployee.id,
        machineCode: machineCode,
        role: newSkill.role,
        skillLevel: newSkill.skillLevel
      });
    });

    setSkills(updatedSkills);
    addNotification('success', `Competencias para ${MACHINE_CATALOG.find(m=>m.code===machineCode)?.name} actualizadas.`);
  };

  const handleOpenSkillModal = (machineCode?: string) => {
    if (machineCode) {
      setSkillToEdit({ machineCode });
    } else {
      setSkillToEdit(undefined);
    }
    setIsSkillModalOpen(true);
  };
  
  const employeeSkills = useMemo(() => {
      if (!selectedEmployee) return [];
      return skills.filter(s => s.employeeId === selectedEmployee.id);
  }, [selectedEmployee, skills]);

  const employeeMachines = useMemo(() => {
      const machineCodes = new Set(employeeSkills.map(s => s.machineCode));
      return MACHINE_CATALOG.filter(m => machineCodes.has(m.code));
  }, [employeeSkills]);

  const availableMachinesForNewSkill = useMemo(() => {
    if (!selectedEmployee) return [];
    const assignedMachineCodes = new Set(skills.filter(s => s.employeeId === selectedEmployee.id).map(s => s.machineCode));
    return MACHINE_CATALOG.filter(m => !assignedMachineCodes.has(m.code));
  }, [selectedEmployee, skills]);


  return (
    <div className="p-6 md:p-8 space-y-6">
      {isSkillModalOpen && selectedEmployee && (
        <SkillEditModal 
          employee={selectedEmployee}
          existingSkills={employeeSkills}
          availableMachines={availableMachinesForNewSkill}
          onSave={handleSaveSkill}
          onClose={() => setIsSkillModalOpen(false)}
          initialSkillToEdit={skillToEdit}
        />
      )}
      <div className="flex items-center space-x-3">
        <PersonnelIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Calificación Técnica del Personal</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Employee List and Form */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Lista de Empleados ({employees.length})</h3>
            <div className="max-h-[40vh] overflow-y-auto border rounded-md">
                {employees.sort((a,b) => a.name.localeCompare(b.name)).map(emp => (
                    <div key={emp.id} 
                         className={`p-3 cursor-pointer border-b last:border-b-0 ${selectedEmployee?.id === emp.id ? 'bg-indigo-100' : 'hover:bg-gray-50'}`}
                         onClick={() => setSelectedEmployee(emp)}>
                        <div className="flex justify-between items-center">
                            <div>
                                <p className="font-medium text-gray-900">{emp.name}</p>
                                <p className="text-sm text-gray-500">Código: {emp.employeeCode}</p>
                            </div>
                            <div className="flex space-x-2">
                                <button onClick={(e) => {e.stopPropagation(); handleEditEmployee(emp);}} className="text-indigo-600 hover:text-indigo-800 p-1 rounded-full"><EditIcon /></button>
                                <button onClick={(e) => {e.stopPropagation(); handleDeleteEmployee(emp.id);}} className="text-red-500 hover:text-red-700 p-1 rounded-full"><DeleteIcon /></button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4 border-t pt-4">{editingEmployee ? 'Editar Empleado' : 'Agregar Nuevo Empleado'}</h3>
            <form onSubmit={handleEmployeeSubmit} className="space-y-4">
              <div>
                <label htmlFor="employeeName" className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                <input type="text" name="name" id="employeeName" value={employeeForm.name} onChange={e => setEmployeeForm({...employeeForm, name: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" placeholder="Ej: Juan Pérez"/>
              </div>
              <div>
                <label htmlFor="employeeCode" className="block text-sm font-medium text-gray-700">Código de Empleado</label>
                <input type="text" name="employeeCode" id="employeeCode" value={employeeForm.employeeCode} onChange={e => setEmployeeForm({...employeeForm, employeeCode: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm" placeholder="Ej: 12345"/>
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                {editingEmployee && <button type="button" onClick={resetEmployeeForm} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">Cancelar</button>}
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center"><PlusIcon /> {editingEmployee ? 'Guardar Cambios' : 'Agregar'}</button>
              </div>
            </form>
          </div>
        </div>

        {/* Competency Profile */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
          {selectedEmployee ? (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">Competencias por Máquina de: <span className="text-indigo-600">{selectedEmployee.name}</span></h3>
                <button onClick={() => handleOpenSkillModal()} className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center">
                  <PlusIcon /> Añadir Competencia
                </button>
              </div>
              <div className="max-h-[75vh] overflow-y-auto space-y-3">
                 {employeeMachines.length > 0 ? (
                    employeeMachines.map(machine => {
                        const opSkill = employeeSkills.find(s => s.machineCode === machine.code && s.role === 'Operador');
                        const aySkill = employeeSkills.find(s => s.machineCode === machine.code && s.role === 'Ayudante');
                        return (
                            <div key={machine.code} className="bg-gray-50 p-4 rounded-lg border flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-gray-800">{machine.name}</p>
                                    <div className="flex space-x-4 mt-1 text-sm">
                                        {opSkill && <span>Operador: <span className="font-semibold text-blue-600">{opSkill.skillLevel}%</span></span>}
                                        {aySkill && <span>Ayudante: <span className="font-semibold text-green-600">{aySkill.skillLevel}%</span></span>}
                                    </div>
                                </div>
                                <button onClick={() => handleOpenSkillModal(machine.code)} className="text-indigo-600 hover:text-indigo-800"><EditIcon /></button>
                            </div>
                        )
                    })
                 ) : (
                    <div className="text-center py-10">
                        <p className="text-gray-500">Este empleado aún no tiene competencias registradas.</p>
                        <p className="text-sm text-gray-400">Haga clic en "Añadir Competencia" para empezar.</p>
                    </div>
                 )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <PersonnelIcon />
                <p className="mt-2 text-lg text-gray-600">Seleccione un empleado de la lista</p>
                <p className="text-sm text-gray-400">o agregue uno nuevo para definir sus competencias.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
