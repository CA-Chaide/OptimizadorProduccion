import React, { useState, useMemo } from 'react';
import { 
    ProductionPlanItem, AppConstraints, MaintenanceEvent, 
    Employee, EmployeeSkill 
} from '@/types/types';
import { TacticalSchedulingIcon } from '@/constants/constants';

interface TacticalSchedulingSectionProps {
  dailyPlan: ProductionPlanItem[];
  constraints: AppConstraints;
  maintenanceEvents: MaintenanceEvent[];
  employees: Employee[];
  employeeSkills: EmployeeSkill[];
}

// Helper to format date to YYYY-MM-DD for input default
const getTodayString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const TacticalSchedulingSection: React.FC<TacticalSchedulingSectionProps> = ({
  dailyPlan,
  constraints,
  maintenanceEvents,
  employees,
  employeeSkills,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(getTodayString());

  const dailySchedule = useMemo(() => {
    if (!selectedDate) return [];
    
    const [year, month, day] = selectedDate.split('-').map(Number);
    
    return dailyPlan.filter(item => 
      item.year === year && 
      item.month === month && 
      item.day === day &&
      item.quantityToProduce > 0 // Only show actual production orders
    );
  }, [selectedDate, dailyPlan]);

  const getRequiredWorkstationsForLine = (lineName: string) => {
    const line = constraints.productionLines.find(l => l.name === lineName);
    if (!line) return [];
    return line.assignedWorkstations;
  };

  const getQualifiedEmployeesForWorkstation = (workstationDefId: string) => {
    return employeeSkills
      .filter(skill => skill.workstationDefinitionId === workstationDefId)
      .map(skill => {
        const employee = employees.find(emp => emp.id === skill.employeeId);
        return employee ? { ...employee, skillLevel: skill.skillLevel } : null;
      })
      .filter((emp): emp is Employee & { skillLevel: number } => emp !== null)
      .sort((a, b) => b.skillLevel - a.skillLevel);
  };
  
  const getMaintenanceForLineOnDate = (lineName: string, dateStr: string) => {
    const line = constraints.productionLines.find(l => l.name === lineName);
    if(!line) return [];
    
    const selectedDateTime = new Date(dateStr).getTime();

    return maintenanceEvents.filter(event => {
        if(event.productionLineId !== line.id) return false;
        const start = new Date(event.startDate).getTime();
        const end = new Date(event.endDate).getTime();
        return selectedDateTime >= start && selectedDateTime <= end;
    });
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center space-x-3">
        <TacticalSchedulingIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Programación Táctica Diaria</h2>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center space-y-2 md:space-y-0 md:space-x-4">
          <label htmlFor="schedule-date" className="font-medium text-gray-700">Seleccionar Fecha:</label>
          <input
            type="date"
            id="schedule-date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
      </div>

      <div className="space-y-6">
        {dailySchedule.length > 0 ? (
          dailySchedule.map(order => {
            const lineName = order.assignedLineId || 'N/A';
            const requiredWorkstations = getRequiredWorkstationsForLine(lineName);
            const maintenanceForLine = getMaintenanceForLineOnDate(lineName, selectedDate);
            return (
              <div key={order.id} className="bg-white p-6 rounded-xl shadow-lg border-l-4 border-indigo-500">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800">{order.productName} ({order.productId})</h3>
                    <p className="text-md text-indigo-700 font-semibold">Producir: {Math.round(order.quantityToProduce)} unidades</p>
                    <p className="text-sm text-gray-500">Línea: {lineName} | Centro: {order.producingCenterId}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Horas Requeridas: {order.hoursWorked.toFixed(2)}h</p>
                  </div>
                </div>
                
                {maintenanceForLine.length > 0 && (
                    <div className="mt-4 p-3 bg-yellow-100 border border-yellow-300 rounded-md">
                        <p className="font-bold text-yellow-800">¡Alerta de Mantenimiento!</p>
                        <ul className="list-disc list-inside text-sm text-yellow-700">
                            {maintenanceForLine.map(m => <li key={m.id}>{m.title}</li>)}
                        </ul>
                    </div>
                )}
                
                <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-md font-semibold text-gray-700 mb-2">Puestos y Personal Calificado:</h4>
                    <div className="space-y-3">
                        {requiredWorkstations.length > 0 ? requiredWorkstations.map(ws => {
                           const workstationDef = constraints.workstationDefinitions.find(def => def.id === ws.definitionId);
                           const qualifiedEmployees = getQualifiedEmployeesForWorkstation(ws.definitionId);
                           return (
                             <div key={ws.definitionId} className="p-3 bg-gray-50 rounded-md">
                               <p className="font-semibold text-gray-800">{workstationDef?.name || 'N/A'} <span className="text-gray-500 font-normal">(Requiere: {ws.quantity})</span></p>
                               {qualifiedEmployees.length > 0 ? (
                                  <ul className="text-sm list-disc list-inside ml-4 mt-1">
                                    {qualifiedEmployees.map(emp => (
                                       <li key={emp.id}>{emp.name} - <span className="font-medium">Calificación: {emp.skillLevel}%</span></li>
                                    ))}
                                  </ul>
                               ) : (
                                  <p className="text-sm text-red-600 ml-4 mt-1">No hay personal calificado asignado para este puesto.</p>
                               )}
                             </div>
                           )
                        }) : <p className="text-sm text-gray-500">No hay puestos de trabajo definidos para esta línea.</p>}
                    </div>
                </div>
              </div>
            )
          })
        ) : (
          <div className="text-center py-10 bg-white rounded-xl shadow-lg">
            <h3 className="text-lg font-medium text-gray-900">Sin Producción Programada</h3>
            <p className="mt-1 text-sm text-gray-500">No hay órdenes de producción en el plan de mediano plazo para la fecha seleccionada.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TacticalSchedulingSection;
