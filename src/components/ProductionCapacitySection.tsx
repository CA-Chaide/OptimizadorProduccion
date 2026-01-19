
'use client';

import React, { useMemo } from 'react';
import { useAppContext } from '@/context/AppProvider';
import { Activity } from 'lucide-react';
import { AppConstraints, Holiday, ProductionLine, ShiftParameters, WorkCenter, WorkstationDefinition } from '@/types/types';
import { MONTH_NAMES } from '@/constants/constants';

// Helper function to calculate working days in a month
const getWorkingDays = (year: number, month: number, holidays: Holiday[]): { weekdays: number; saturdays: number } => {
    const daysInMonth = new Date(year, month, 0).getDate();
    let weekdays = 0;
    let saturdays = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month - 1, day);
        const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

        const holiday = holidays.find(h => h.date === date.toISOString().split('T')[0]);

        if (holiday && holiday.dayType === 'asueto' && holiday.appliesTo !== 'Distribucion') {
            continue; // Skip non-working holidays for production
        }

        if (dayOfWeek >= 1 && dayOfWeek <= 5) { // Monday to Friday
            weekdays++;
        } else if (dayOfWeek === 6) { // Saturday
            saturdays++;
        }
    }
    return { weekdays, saturdays };
};

interface CapacityRow {
    center: WorkCenter;
    line: ProductionLine;
    workstation: WorkstationDefinition;
    numPuestos: number;
    numPersonasPorPuesto: number;
    totalPersonas: number;
    horasDisponibles: number;
    horasRequeridas: number; // Placeholder for now
    saldoHoras: number;
    ocupacion: number; // Placeholder for now
}

export const ProductionCapacitySection: React.FC = () => {
    const { constraints, planningYear, planningMonth } = useAppContext();

    const capacityData = useMemo((): CapacityRow[] => {
        const year = parseInt(planningYear, 10);
        const month = parseInt(planningMonth, 10);

        if (isNaN(year) || isNaN(month) || !constraints.shiftParameters) {
            return [];
        }

        const { weekdays, saturdays } = getWorkingDays(year, month, constraints.holidays);
        const { regularHoursPerDay, extraHoursPerDay, saturdayAndHolidayHours } = constraints.shiftParameters;
        
        const rows: CapacityRow[] = [];

        constraints.workCenters.forEach(center => {
            const linesInCenter = constraints.productionLines.filter(line => line.workCenterId === center.id);

            linesInCenter.forEach(line => {
                line.assignedWorkstations.forEach(assignedWs => {
                    const workstation = constraints.workstationDefinitions.find(wd => wd.id === assignedWs.definitionId);
                    if (!workstation) return;

                    const numPuestos = assignedWs.quantity;
                    const numPersonasPorPuesto = workstation.employeesPerWorkstation;
                    const totalPersonas = numPuestos * numPersonasPorPuesto;
                    
                    const horasDisponibles = totalPersonas * ((weekdays * (regularHoursPerDay + extraHoursPerDay)) + (saturdays * saturdayAndHolidayHours));

                    rows.push({
                        center,
                        line,
                        workstation,
                        numPuestos,
                        numPersonasPorPuesto,
                        totalPersonas,
                        horasDisponibles,
                        horasRequeridas: 0, // Placeholder
                        saldoHoras: horasDisponibles, // Placeholder
                        ocupacion: 0, // Placeholder
                    });
                });
            });
        });

        return rows.sort((a,b) => 
            a.center.id.localeCompare(b.center.id) || 
            a.line.name.localeCompare(b.line.name) ||
            a.workstation.name.localeCompare(b.workstation.name)
        );
    }, [planningYear, planningMonth, constraints]);
    
    const tableHierarchy = useMemo(() => {
        const hierarchy = new Map<string, { center: WorkCenter, lines: Map<string, { line: ProductionLine, workstations: CapacityRow[] }> }>();

        capacityData.forEach(row => {
            if (!hierarchy.has(row.center.id)) {
                hierarchy.set(row.center.id, { center: row.center, lines: new Map() });
            }
            const centerNode = hierarchy.get(row.center.id)!;

            if (!centerNode.lines.has(row.line.id)) {
                centerNode.lines.set(row.line.id, { line: row.line, workstations: [] });
            }
            const lineNode = centerNode.lines.get(row.line.id)!;
            lineNode.workstations.push(row);
        });

        return Array.from(hierarchy.values());
    }, [capacityData]);

    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center space-x-3">
                <Activity />
                <h2 className="text-2xl font-semibold text-gray-700">Análisis de Capacidad de Producción</h2>
            </div>
            
            <p className="text-gray-600 text-sm">
                Esta tabla desglosa la capacidad de producción disponible por centro, línea y puesto de trabajo para el mes seleccionado ({MONTH_NAMES[Number(planningMonth)-1]}/{planningYear}).
            </p>

            <div className="border rounded-lg overflow-auto max-h-[75vh]">
                <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Puesto de Trabajo</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Nro. Puestos</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Nro. Personas x Puesto</th>
                            <th className="px-3 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Total Personas</th>
                            <th className="px-3 py-2 text-right font-bold text-blue-700 uppercase tracking-wider bg-blue-50">Horas Disponibles</th>
                            <th className="px-3 py-2 text-right font-bold text-orange-700 uppercase tracking-wider bg-orange-50">Horas Requeridas</th>
                            <th className="px-3 py-2 text-right font-bold text-green-700 uppercase tracking-wider bg-green-50">Saldo Horas</th>
                            <th className="px-3 py-2 text-right font-bold text-purple-700 uppercase tracking-wider bg-purple-50">% Ocupación</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {tableHierarchy.length > 0 ? (
                            tableHierarchy.map(({ center, lines }) => (
                                <React.Fragment key={center.id}>
                                    <tr className="bg-gray-200 font-bold">
                                        <td colSpan={8} className="px-3 py-2 text-gray-800">Centro: {center.name}</td>
                                    </tr>
                                    {Array.from(lines.values()).map(({ line, workstations }) => (
                                        <React.Fragment key={line.id}>
                                            <tr className="bg-gray-100 font-semibold">
                                                <td colSpan={8} className="px-3 py-2 text-indigo-800 pl-6">Línea: {line.name}</td>
                                            </tr>
                                            {workstations.map(ws => (
                                                <tr key={ws.workstation.id}>
                                                    <td className="px-3 py-2 pl-12 text-gray-700">{ws.workstation.name}</td>
                                                    <td className="px-3 py-2 text-right font-mono">{ws.numPuestos}</td>
                                                    <td className="px-3 py-2 text-right font-mono">{ws.numPersonasPorPuesto}</td>
                                                    <td className="px-3 py-2 text-right font-mono font-semibold">{ws.totalPersonas}</td>
                                                    <td className="px-3 py-2 text-right font-mono font-bold text-blue-800 bg-blue-50">{Math.round(ws.horasDisponibles).toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-right font-mono font-bold text-orange-800 bg-orange-50">{ws.horasRequeridas.toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-right font-mono font-bold text-green-800 bg-green-50">{Math.round(ws.saldoHoras).toLocaleString()}</td>
                                                    <td className="px-3 py-2 text-right font-mono font-bold text-purple-800 bg-purple-50">{ws.ocupacion.toFixed(1)}%</td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </React.Fragment>
                            ))
                        ) : (
                            <tr>
                                <td colSpan={8} className="text-center py-8 text-gray-500">
                                    No hay datos de capacidad para mostrar. Verifique la configuración de restricciones y el mes seleccionado.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
