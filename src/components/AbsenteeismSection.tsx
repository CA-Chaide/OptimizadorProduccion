import React, { useState } from 'react';
import { AbsenteeismEvent, Employee, NotificationMessage } from '@/types/types';
import { AbsenteeismIcon, PlusIcon, EditIcon, DeleteIcon } from '@/constants/constants';

interface AbsenteeismSectionProps {
  events: AbsenteeismEvent[];
  setEvents: (events: AbsenteeismEvent[]) => void;
  employees: Employee[];
  addNotification: (type: NotificationMessage['type'], text: string) => void;
}

const REASON_OPTIONS: Array<AbsenteeismEvent['reason']> = ['Vacaciones', 'Cita Médica', 'Capacitaciones'];

const initialFormState: Omit<AbsenteeismEvent, 'id'> = {
  reason: 'Cita Médica',
  startDate: '',
  startTime: '',
  endDate: '',
  endTime: '',
  employeeIds: [],
  notes: '',
};

export const AbsenteeismSection: React.FC<AbsenteeismSectionProps> = ({ events, setEvents, employees, addNotification }) => {
  const [formState, setFormState] = useState(initialFormState);
  const [editingEvent, setEditingEvent] = useState<AbsenteeismEvent | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const handleEmployeeSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (formState.reason === 'Capacitaciones') {
      const selectedIds = Array.from(e.target.selectedOptions, option => option.value);
      setFormState(prev => ({ ...prev, employeeIds: selectedIds }));
    } else {
      setFormState(prev => ({ ...prev, employeeIds: [e.target.value] }));
    }
  };

  const resetForm = () => {
    setFormState(initialFormState);
    setEditingEvent(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.reason || !formState.startDate || !formState.startTime || !formState.endDate || !formState.endTime || formState.employeeIds.length === 0) {
      addNotification('warning', 'Motivo, fechas, horas y al menos un empleado son requeridos.');
      return;
    }
    
    const startDateTime = new Date(`${formState.startDate}T${formState.startTime}`);
    const endDateTime = new Date(`${formState.endDate}T${formState.endTime}`);

    if (startDateTime >= endDateTime) {
      addNotification('warning', 'La fecha y hora de fin deben ser posteriores a la de inicio.');
      return;
    }

    if (editingEvent) {
      const updatedEvents = events.map(event =>
        event.id === editingEvent.id ? { ...editingEvent, ...formState } : event
      );
      setEvents(updatedEvents);
      addNotification('success', 'Evento de ausentismo actualizado.');
    } else {
      const newEvent: AbsenteeismEvent = { id: Date.now().toString(), ...formState };
      setEvents([...events, newEvent]);
      addNotification('success', 'Nuevo evento de ausentismo registrado.');
    }
    resetForm();
  };

  const handleEdit = (event: AbsenteeismEvent) => {
    setEditingEvent(event);
    setFormState({
      reason: event.reason,
      startDate: event.startDate,
      startTime: event.startTime,
      endDate: event.endDate,
      endTime: event.endTime,
      employeeIds: event.employeeIds,
      notes: event.notes || '',
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('¿Está seguro de que desea eliminar este registro de ausencia?')) {
      setEvents(events.filter(event => event.id !== id));
      addNotification('info', 'Registro de ausencia eliminado.');
    }
  };

  const formatDateTime = (dateStr: string, timeStr: string) => {
    if (!dateStr || !timeStr) return 'N/A';
    const date = new Date(`${dateStr}T${timeStr}`);
    return date.toLocaleString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };
  
  const getEmployeeNames = (ids: string[]) => {
      if(ids.length === 0) return 'N/A';
      const names = ids.map(id => employees.find(e => e.id === id)?.name || 'Desconocido');
      return names.join(', ');
  }

  const isMultipleSelect = formState.reason === 'Capacitaciones';

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <AbsenteeismIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Gestión de Ausentismos</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{editingEvent ? 'Editar Ausencia' : 'Registrar Nueva Ausencia'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="reason" className="block text-sm font-medium text-gray-700">Motivo</label>
              <select name="reason" id="reason" value={formState.reason} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 bg-white rounded-md shadow-sm py-2 px-3 sm:text-sm">
                {REASON_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="employeeIds" className="block text-sm font-medium text-gray-700">Empleado(s)</label>
              <select 
                name="employeeIds" 
                id="employeeIds" 
                multiple={isMultipleSelect} 
                value={isMultipleSelect ? formState.employeeIds : (formState.employeeIds[0] || '')}
                onChange={handleEmployeeSelectionChange} 
                className="mt-1 block w-full border border-gray-300 bg-white rounded-md shadow-sm py-2 px-3 sm:text-sm"
                size={isMultipleSelect ? 5 : 1}
              >
                {!isMultipleSelect && <option value="">-- Seleccionar --</option>}
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
              {isMultipleSelect && <p className="text-xs text-gray-500 mt-1">Mantenga presionado Ctrl (o Cmd en Mac) para seleccionar múltiples empleados.</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                 <label htmlFor="startDate" className="block text-sm font-medium text-gray-700">Fecha Inicio</label>
                 <input type="date" name="startDate" id="startDate" value={formState.startDate} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"/>
               </div>
               <div>
                 <label htmlFor="startTime" className="block text-sm font-medium text-gray-700">Hora Inicio</label>
                 <input type="time" name="startTime" id="startTime" value={formState.startTime} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"/>
               </div>
            </div>
             <div className="grid grid-cols-2 gap-4">
               <div>
                 <label htmlFor="endDate" className="block text-sm font-medium text-gray-700">Fecha Fin</label>
                 <input type="date" name="endDate" id="endDate" value={formState.endDate} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"/>
               </div>
               <div>
                 <label htmlFor="endTime" className="block text-sm font-medium text-gray-700">Hora Fin</label>
                 <input type="time" name="endTime" id="endTime" value={formState.endTime} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"/>
               </div>
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700">Notas Adicionales</label>
              <textarea name="notes" id="notes" value={formState.notes} onChange={handleInputChange} rows={2} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 sm:text-sm"></textarea>
            </div>
            
            <div className="flex justify-end space-x-3 pt-2">
              {editingEvent && <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">Cancelar</button>}
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center">
                <PlusIcon /> {editingEvent ? 'Guardar Cambios' : 'Registrar'}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Ausencias Programadas ({events.length})</h3>
          <div className="max-h-[70vh] overflow-y-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Empleado(s)</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Motivo</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Desde</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Hasta</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {events.length > 0 ? (
                  events
                  .sort((a,b) => new Date(`${a.startDate}T${a.startTime}`).getTime() - new Date(`${b.startDate}T${b.startTime}`).getTime())
                  .map(event => (
                      <tr key={event.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-normal font-medium text-gray-900">{getEmployeeNames(event.employeeIds)}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{event.reason}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{formatDateTime(event.startDate, event.startTime)}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{formatDateTime(event.endDate, event.endTime)}</td>
                        <td className="px-4 py-2 whitespace-nowrap space-x-2">
                          <button onClick={() => handleEdit(event)} className="text-indigo-600 hover:text-indigo-800"><EditIcon /></button>
                          <button onClick={() => handleDelete(event.id)} className="text-red-500 hover:text-red-700"><DeleteIcon /></button>
                        </td>
                      </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-gray-500">No hay ausencias programadas.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
