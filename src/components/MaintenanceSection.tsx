import React, { useState, useEffect } from 'react';
import { MaintenanceEvent, ProductionLine, NotificationMessage } from '@/types/types';
import { MaintenanceIcon, PlusIcon, EditIcon, DeleteIcon } from '@/constants/constants';

interface MaintenanceSectionProps {
  events: MaintenanceEvent[];
  setEvents: (events: MaintenanceEvent[]) => void;
  productionLines: ProductionLine[];
  addNotification: (type: NotificationMessage['type'], text: string) => void;
}

export const MaintenanceSection: React.FC<MaintenanceSectionProps> = ({ events, setEvents, productionLines, addNotification }) => {
  const [formState, setFormState] = useState<Omit<MaintenanceEvent, 'id'>>({
    title: '',
    productionLineId: '',
    startDate: '',
    startTime: '',
    endDate: '',
    endTime: ''
  });
  const [editingEvent, setEditingEvent] = useState<MaintenanceEvent | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormState(prev => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setFormState({ title: '', productionLineId: '', startDate: '', startTime: '', endDate: '', endTime: '' });
    setEditingEvent(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formState.title || !formState.productionLineId || !formState.startDate || !formState.startTime || !formState.endDate || !formState.endTime) {
      addNotification('warning', 'Todos los campos son requeridos para crear un evento.');
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
      addNotification('success', 'Evento de mantenimiento actualizado exitosamente.');
    } else {
      const newEvent: MaintenanceEvent = {
        id: Date.now().toString(),
        ...formState
      };
      setEvents([...events, newEvent]);
      addNotification('success', 'Nuevo evento de mantenimiento programado.');
    }
    resetForm();
  };

  const handleEdit = (event: MaintenanceEvent) => {
    setEditingEvent(event);
    setFormState({
      title: event.title,
      productionLineId: event.productionLineId,
      startDate: event.startDate,
      startTime: event.startTime,
      endDate: event.endDate,
      endTime: event.endTime,
    });
  };

  const handleDelete = (id: string) => {
    if (window.confirm('¿Está seguro de que desea eliminar este evento de mantenimiento?')) {
      setEvents(events.filter(event => event.id !== id));
      addNotification('info', 'Evento de mantenimiento eliminado.');
    }
  };
  
  const formatDateTime = (dateStr: string, timeStr: string) => {
    if(!dateStr || !timeStr) return 'N/A';
    const date = new Date(`${dateStr}T${timeStr}`);
    return date.toLocaleString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <MaintenanceIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Mantenimiento Programado</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{editingEvent ? 'Editar Evento' : 'Programar Nuevo Mantenimiento'}</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">Título del Evento</label>
              <input type="text" name="title" id="title" value={formState.title} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="Ej: Cambio de rodamientos"/>
            </div>
            <div>
              <label htmlFor="productionLineId" className="block text-sm font-medium text-gray-700">Línea de Producción</label>
              <select name="productionLineId" id="productionLineId" value={formState.productionLineId} onChange={handleInputChange} className="mt-1 block w-full border border-gray-300 bg-white rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                <option value="">Seleccione una línea</option>
                {productionLines.map(line => (
                  <option key={line.id} value={line.id}>{line.name}</option>
                ))}
              </select>
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
            <div className="flex justify-end space-x-3 pt-2">
              {editingEvent && <button type="button" onClick={resetForm} className="px-4 py-2 bg-gray-300 text-gray-800 rounded-md hover:bg-gray-400">Cancelar</button>}
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 flex items-center">
                <PlusIcon /> {editingEvent ? 'Guardar Cambios' : 'Programar'}
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Eventos Programados ({events.length})</h3>
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Título</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Línea</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Desde</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Hasta</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {events.length > 0 ? (
                  events
                  .sort((a,b) => new Date(`${a.startDate}T${a.startTime}`).getTime() - new Date(`${b.startDate}T${b.startTime}`).getTime())
                  .map(event => {
                    const line = productionLines.find(l => l.id === event.productionLineId);
                    return (
                      <tr key={event.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-900">{event.title}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{line?.name || 'N/A'}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{formatDateTime(event.startDate, event.startTime)}</td>
                        <td className="px-4 py-2 whitespace-nowrap text-gray-600">{formatDateTime(event.endDate, event.endTime)}</td>
                        <td className="px-4 py-2 whitespace-nowrap space-x-2">
                          <button onClick={() => handleEdit(event)} className="text-indigo-600 hover:text-indigo-800"><EditIcon /></button>
                          <button onClick={() => handleDelete(event.id)} className="text-red-500 hover:text-red-700"><DeleteIcon /></button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="text-center py-4 text-gray-500">No hay eventos de mantenimiento programados.</td>
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
