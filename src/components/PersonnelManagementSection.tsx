import React, { useState, useContext, useMemo } from 'react';
import { Employee, EmployeeSkill, WorkstationDefinition, NotificationMessage, ProcessType } from '@/types/types';
import { PersonnelIcon, PlusIcon, EditIcon, DeleteIcon, PROCESS_TYPE_OPTIONS } from '@/constants/constants';
import { NotificationContext } from '@/app/(app)/page';

interface PersonnelManagementSectionProps {
  employees: Employee[];
  setEmployees: (employees: Employee[]) => void;
  skills: EmployeeSkill[];
  setSkills: (skills: EmployeeSkill[]) => void;
  workstationDefinitions: WorkstationDefinition[];
  productionLines: any[]; // Simplified for prop drilling, consider context for deeper nesting
}

const ROLE_OPTIONS: Array<EmployeeSkill['role']> = ['Operador', 'Ayudante'];

export const PersonnelManagementSection: React.FC<PersonnelManagementSectionProps> = ({
  employees,
  setEmployees,
  skills,
  setSkills,
  workstationDefinitions,
  productionLines,
}) => {
  const addNotification = useContext(NotificationContext);
  
  const [employeeForm, setEmployeeForm] = useState<Omit<Employee, 'id' | 'isActive'>>({ name: '', employeeCode: '' });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

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

  const handleSkillChange = (employeeId: string, workstationId: string, role: EmployeeSkill['role'], value: number) => {
    const skillLevel = Math.max(0, Math.min(100, value || 0));
    const existingSkillIndex = skills.findIndex(s => s.employeeId === employeeId && s.workstationDefinitionId === workstationId && s.role === role);
    
    let newSkills = [...skills];
    if (existingSkillIndex > -1) {
      if (skillLevel === 0) {
        newSkills.splice(existingSkillIndex, 1);
      } else {
        newSkills[existingSkillIndex] = { ...newSkills[existingSkillIndex], skillLevel };
      }
    } else if (skillLevel > 0) {
      newSkills.push({ employeeId, workstationDefinitionId: workstationId, role, skillLevel });
    }
    setSkills(newSkills);
  };
  
  const getSkillLevel = (employeeId: string, workstationId: string, role: EmployeeSkill['role']): number => {
    return skills.find(s => s.employeeId === employeeId && s.workstationDefinitionId === workstationId && s.role === role)?.skillLevel || 0;
  };
  
  const workstationsByProcessType = useMemo(() => {
    const grouped = new Map<ProcessType, WorkstationDefinition[]>();
    PROCESS_TYPE_OPTIONS.forEach(opt => grouped.set(opt.value, []));

    workstationDefinitions.forEach(wd => {
        const line = productionLines.find(pl => pl.assignedWorkstations.some(as => as.definitionId === wd.id));
        if (line && grouped.has(line.processType)) {
            const list = grouped.get(line.processType)!;
            if (!list.some(existing => existing.id === wd.id)) {
                 list.push(wd);
            }
        }
    });
    return grouped;
  }, [workstationDefinitions, productionLines]);

  return (
    <div className="p-6 md:p-8 space-y-6">
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
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Perfil de Competencias de: <span className="text-indigo-600">{selectedEmployee.name}</span></h3>
              <div className="max-h-[75vh] overflow-y-auto space-y-6">
                {Array.from(workstationsByProcessType.entries()).map(([processType, workstations]) => (
                    workstations.length > 0 && (
                        <div key={processType}>
                            <h4 className="text-md font-semibold text-gray-700 bg-gray-100 p-2 rounded-t-md sticky top-0">{processType}</h4>
                            <div className="border border-t-0 rounded-b-md p-4">
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                {workstations.map(wd => (
                                    <div key={wd.id} className="p-2 border-b">
                                        <label className="block text-sm font-medium text-gray-800 mb-2">{wd.name}</label>
                                        <div className="space-y-2">
                                            {ROLE_OPTIONS.map(role => (
                                                <div key={role} className="flex items-center space-x-3">
                                                    <label htmlFor={`${wd.id}-${role}`} className="w-20 text-sm text-gray-600">{role}:</label>
                                                    <input
                                                        type="range"
                                                        id={`${wd.id}-${role}-range`}
                                                        min="0"
                                                        max="100"
                                                        step="5"
                                                        value={getSkillLevel(selectedEmployee.id, wd.id, role)}
                                                        onChange={e => handleSkillChange(selectedEmployee.id, wd.id, role, parseInt(e.target.value))}
                                                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                                    />
                                                    <input
                                                        type="number"
                                                        id={`${wd.id}-${role}-number`}
                                                        min="0"
                                                        max="100"
                                                        value={getSkillLevel(selectedEmployee.id, wd.id, role)}
                                                        onChange={e => handleSkillChange(selectedEmployee.id, wd.id, role, parseInt(e.target.value))}
                                                        className="w-20 px-2 py-1 border border-gray-300 rounded-md shadow-sm text-center"
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                               </div>
                            </div>
                        </div>
                    )
                ))}
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
