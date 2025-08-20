
import React, { useState, useContext } from 'react';
import { Employee, EmployeeSkill, WorkstationDefinition, NotificationMessage } from '@/types/types';
import { PersonnelIcon, PlusIcon, EditIcon, DeleteIcon } from '@/constants/constants';
import { MACHINE_CATALOG } from '@/lib/catalogs/machineCatalog';
import { NotificationContext } from '@/app/(app)/page';

interface PersonnelManagementSectionProps {
  employees: Employee[];
  setEmployees: (employees: Employee[]) => void;
  skills: EmployeeSkill[];
  setSkills: (skills: EmployeeSkill[]) => void;
  workstationDefinitions: WorkstationDefinition[];
}

const ROLE_OPTIONS: Array<Employee['role']> = ['Operador', 'Ayudante'];

export const PersonnelManagementSection: React.FC<PersonnelManagementSectionProps> = ({
  employees,
  setEmployees,
  skills,
  setSkills,
  workstationDefinitions,
}) => {
  const [activeTab, setActiveTab] = useState<'employees' | 'skills'>('employees');
  const addNotification = useContext(NotificationContext);
  
  // State for Employee form
  const [employeeForm, setEmployeeForm] = useState<Omit<Employee, 'id' | 'isActive'>>({ name: '', employeeCode: '', machine: '', role: 'Operador' });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  // State for Skill assignment
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  const resetEmployeeForm = () => {
    setEmployeeForm({ name: '', employeeCode: '', machine: '', role: 'Operador' });
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
      addNotification('success', 'Empleado actualizado.');
    } else {
        if (employees.some(emp => emp.employeeCode === trimmedCode)) {
            addNotification('error', `El código de empleado '${trimmedCode}' ya existe.`);
            return;
        }
      const newEmployee: Employee = { id: Date.now().toString(), ...employeeForm, employeeCode: trimmedCode, isActive: true };
      setEmployees([...employees, newEmployee]);
      addNotification('success', 'Nuevo empleado agregado.');
    }
    resetEmployeeForm();
  };
  
  const handleEditEmployee = (employee: Employee) => {
    setEditingEmployee(employee);
    setEmployeeForm({ name: employee.name, employeeCode: employee.employeeCode, machine: employee.machine || '', role: employee.role || 'Operador' });
  };
  
  const handleDeleteEmployee = (id: string) => {
    if (window.confirm('¿Está seguro? Esto también eliminará todas las competencias asignadas a este empleado.')) {
      setEmployees(employees.filter(emp => emp.id !== id));
      setSkills(skills.filter(skill => skill.employeeId !== id)); // Also remove skills
      addNotification('info', 'Empleado eliminado.');
      if(selectedEmployeeId === id) setSelectedEmployeeId('');
    }
  };

  const handleSkillChange = (employeeId: string, workstationId: string, value: number) => {
    const skillLevel = Math.max(0, Math.min(100, value || 0)); // Clamp between 0-100
    const existingSkillIndex = skills.findIndex(s => s.employeeId === employeeId && s.workstationDefinitionId === workstationId);
    
    let newSkills = [...skills];
    if (existingSkillIndex > -1) {
      if (skillLevel === 0) { // Remove skill if set to 0
        newSkills.splice(existingSkillIndex, 1);
      } else {
        newSkills[existingSkillIndex] = { ...newSkills[existingSkillIndex], skillLevel };
      }
    } else if (skillLevel > 0) {
      newSkills.push({ employeeId, workstationDefinitionId: workstationId, skillLevel });
    }
    setSkills(newSkills);
  };
  
  const getSkillLevel = (employeeId: string, workstationId: string): number => {
    return skills.find(s => s.employeeId === employeeId && s.workstationDefinitionId === workstationId)?.skillLevel || 0;
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <PersonnelIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Calificación Técnica Personal</h2>
      </div>

       <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-4" aria-label="Tabs">
                <button onClick={() => setActiveTab('employees')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'employees' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                    Administrar Empleados
                </button>
                <button onClick={() => setActiveTab('skills')} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'skills' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>
                    Asignar Competencias
                </button>
            </nav>
        </div>

      {activeTab === 'employees' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">{editingEmployee ? 'Editar Empleado' : 'Agregar Nuevo Empleado'}</h3>
                <form onSubmit={handleEmployeeSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="employeeName" className="block text-sm font-medium text-gray-700">Nombre Completo</label>
                        <input type="text" name="name" id="employeeName" value={employeeForm.name} onChange={e => setEmployeeForm({...employeeForm, name: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Ej: Juan Pérez"/>
                    </div>
                    <div>
                        <label htmlFor="employeeCode" className="block text-sm font-medium text-gray-700">Código de Empleado</label>
                        <input type="text" name="employeeCode" id="employeeCode" value={employeeForm.employeeCode} onChange={e => setEmployeeForm({...employeeForm, employeeCode: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Ej: 12345"/>
                    </div>
                    <div>
                        <label htmlFor="machine" className="block text-sm font-medium text-gray-700">Máquina</label>
                        <select name="machine" id="machine" value={employeeForm.machine} onChange={e => setEmployeeForm({...employeeForm, machine: e.target.value})} className="mt-1 block w-full border border-gray-300 bg-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                            <option value="">-- Sin asignar --</option>
                            {MACHINE_CATALOG.map(m => <option key={m.code} value={m.name}>{m.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="role" className="block text-sm font-medium text-gray-700">Rol</label>
                        <select name="role" id="role" value={employeeForm.role} onChange={e => setEmployeeForm({...employeeForm, role: e.target.value as Employee['role']})} className="mt-1 block w-full border border-gray-300 bg-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                            {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end space-x-3 pt-2">
                        {editingEmployee && <button type="button" onClick={resetEmployeeForm} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">Cancelar</button>}
                        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center"><PlusIcon /> {editingEmployee ? 'Guardar Cambios' : 'Agregar'}</button>
                    </div>
                </form>
            </div>
            <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Lista de Empleados ({employees.length})</h3>
                <div className="max-h-[60vh] overflow-y-auto">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Nombre</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Código</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Máquina</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Rol</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {employees.length > 0 ? (
                                employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-900">{emp.name}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{emp.employeeCode}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{emp.machine || 'N/A'}</td>
                                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{emp.role}</td>
                                        <td className="px-4 py-2 whitespace-nowrap space-x-2">
                                            <button onClick={() => handleEditEmployee(emp)} className="text-indigo-600 hover:text-indigo-800"><EditIcon /></button>
                                            <button onClick={() => handleDeleteEmployee(emp.id)} className="text-red-500 hover:text-red-700"><DeleteIcon /></button>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="text-center py-4 text-gray-500">No hay empleados registrados.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}

      {activeTab === 'skills' && (
        <div className="bg-white p-6 rounded-xl shadow-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Asignar Competencias por Puesto de Trabajo</h3>
            <div className="mb-4">
                <label htmlFor="employeeSelect" className="block text-sm font-medium text-gray-700">Seleccione un Empleado</label>
                <select id="employeeSelect" value={selectedEmployeeId} onChange={e => setSelectedEmployeeId(e.target.value)} className="mt-1 block w-full md:w-1/3 border border-gray-300 bg-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                    <option value="">-- Seleccionar --</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
            </div>
            {selectedEmployeeId && (
                <div className="max-h-[60vh] overflow-y-auto">
                    <table className="min-w-full text-sm divide-y divide-gray-200">
                        <thead className="bg-gray-50 sticky top-0">
                            <tr>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Puesto de Trabajo</th>
                                <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Calificación (1-100)</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                           {workstationDefinitions.map(wd => (
                               <tr key={wd.id} className="hover:bg-gray-50">
                                   <td className="px-4 py-2 font-medium text-gray-800">{wd.name}</td>
                                   <td className="px-4 py-2">
                                       <div className="flex items-center space-x-2">
                                          <input 
                                             type="range" 
                                             min="0" 
                                             max="100" 
                                             step="5" 
                                             value={getSkillLevel(selectedEmployeeId, wd.id)}
                                             onChange={e => handleSkillChange(selectedEmployeeId, wd.id, parseInt(e.target.value))}
                                             className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                                           />
                                           <input 
                                             type="number" 
                                             min="0" 
                                             max="100"
                                             value={getSkillLevel(selectedEmployeeId, wd.id)}
                                             onChange={e => handleSkillChange(selectedEmployeeId, wd.id, parseInt(e.target.value))}
                                             className="w-20 px-2 py-1 border border-gray-300 rounded-md shadow-sm"
                                            />
                                       </div>
                                   </td>
                               </tr>
                           ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
      )}
    </div>
  );
};
