
'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useAppContext } from '@/context/AppProvider';
import { Activity, Check, ChevronsUpDown } from 'lucide-react';
import { AppConstraints, Holiday, ProductionLine, ShiftParameters, WorkCenter, WorkstationDefinition, DailyCapacityRow as OriginalDailyCapacityRow } from '@/types/types';
import { MONTH_NAMES } from '@/constants/constants';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface CapacityRow {
    center: WorkCenter;
    line: ProductionLine;
    workstation: WorkstationDefinition;
    numPuestos: number;
    numPersonasPorPuesto: number;
    totalPersonas: number;
    horasDisponibles: number;
    horasRequeridas: number;
    saldoHoras: number;
    ocupacion: number;
}

// Renombrar para evitar conflicto en el ámbito del archivo
type DailyCapacityRow = OriginalDailyCapacityRow & { mes: string; año: number };

const EFFICIENCY_FACTOR = 0.87;

// Helper to get hours for a specific day
const getDailyHours = (date: Date, constraints: AppConstraints): number => {
    const { holidays, shiftParameters } = constraints;
    if (!shiftParameters) return 0;
    
    const dateString = date.toISOString().split('T')[0];
    const holiday = holidays.find(h => h.date === dateString && h.appliesTo !== 'Distribucion');
    const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat

    let rawHours = 0;
    if (holiday) {
        if (holiday.dayType === 'asueto') {
            rawHours = 0;
        } else if (holiday.dayType === 'half') {
            rawHours = shiftParameters.saturdayAndHolidayHours;
        } else {
            rawHours = shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay;
        }
    } else {
        if (dayOfWeek === 0) { // Sunday
            rawHours = 0;
        } else if (dayOfWeek === 6) { // Saturday
            rawHours = shiftParameters.saturdayAndHolidayHours;
        } else { // Weekday
            rawHours = shiftParameters.regularHoursPerDay + shiftParameters.extraHoursPerDay;
        }
    }
    
    return rawHours * EFFICIENCY_FACTOR;
};

const MultiSelectFilter: React.FC<{
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}> = ({ options, selected, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  return (
    <div className="flex flex-col items-start w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-7 text-xs font-normal"
          >
            <span className="truncate">
              {selected.length === 0
                ? placeholder || 'Seleccionar...'
                : `${selected.length} sel.`}
            </span>
            <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[200px] p-0">
          <Command>
            <CommandInput placeholder="Buscar..." className="h-9 text-xs" />
            <CommandEmpty>No hay resultados.</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={(currentValue) => {
                    const matchingOption = options.find(opt => opt.value.toLowerCase() === currentValue.toLowerCase());
                    if (matchingOption) {
                      handleSelect(matchingOption.value);
                    }
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected.includes(option.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="text-xs">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
          <div className="pt-1 text-left w-full min-h-[18px]">
            {selected.slice(0, 1).map(value => (
                <Badge key={value} variant="secondary" className="mr-1 mb-1 max-w-[100px] truncate" title={options.find(opt => opt.value === value)?.label || value}>
                    {options.find(opt => opt.value === value)?.label || value}
                </Badge>
            ))}
            {selected.length > 1 && <Badge variant="secondary">+{selected.length - 1}</Badge>}
          </div>
      )}
    </div>
  );
};


export const ProductionCapacitySection: React.FC = () => {
    const { constraints, planningYear, planningMonth, c2000RequiredHours } = useAppContext();

    const [dailyFilters, setDailyFilters] = useState<Partial<Record<keyof DailyCapacityRow, string | string[]>>>({});
    const [dailyFilterOptions, setDailyFilterOptions] = useState<Record<string, { value: string, label: string }[]>>({});

    const monthlyCapacityData = useMemo((): CapacityRow[] => {
        const year = parseInt(planningYear, 10);
        const month = parseInt(planningMonth, 10);

        if (isNaN(year) || isNaN(month) || !constraints.shiftParameters) {
            return [];
        }
        
        let totalHoursInMonth = 0;
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month - 1, day);
            totalHoursInMonth += getDailyHours(date, constraints);
        }
        
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
                    
                    const horasDisponibles = numPuestos * totalHoursInMonth;
                    const horasRequeridas = c2000RequiredHours[workstation.id] || 0;
                    const saldoHoras = horasDisponibles - horasRequeridas;
                    const ocupacion = horasDisponibles > 0 ? (horasRequeridas / horasDisponibles) * 100 : 0;

                    rows.push({
                        center,
                        line,
                        workstation,
                        numPuestos,
                        numPersonasPorPuesto,
                        totalPersonas,
                        horasDisponibles,
                        horasRequeridas,
                        saldoHoras,
                        ocupacion,
                    });
                });
            });
        });

        return rows.sort((a,b) => 
            a.center.id.localeCompare(b.center.id) || 
            a.line.name.localeCompare(b.line.name) ||
            a.workstation.name.localeCompare(b.workstation.name)
        );
    }, [planningYear, planningMonth, constraints, c2000RequiredHours]);
    
    const monthlyTableHierarchy = useMemo(() => {
        const hierarchy = new Map<string, { center: WorkCenter, lines: Map<string, { line: ProductionLine, workstations: CapacityRow[] }> }>();

        monthlyCapacityData.forEach(row => {
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
    }, [monthlyCapacityData]);

    const dailyCapacityData = useMemo((): DailyCapacityRow[] => {
        if (!constraints.shiftParameters) {
            return [];
        }

        const dailyRows: DailyCapacityRow[] = [];
        const weekdaysEs = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const today = new Date();
        const startMonthDate = new Date(today.getFullYear(), today.getMonth(), 1);

        for (let m = 0; m < 17; m++) {
            const currentProcessingDate = new Date(startMonthDate);
            currentProcessingDate.setMonth(startMonthDate.getMonth() + m);

            const year = currentProcessingDate.getFullYear();
            const month = currentProcessingDate.getMonth() + 1;
            const monthName = MONTH_NAMES[month - 1];

            const daysInMonth = new Date(year, month, 0).getDate();

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month - 1, day);

                constraints.workCenters.forEach(center => {
                    const linesInCenter = constraints.productionLines.filter(line => line.workCenterId === center.id && line.isActive);
                    linesInCenter.forEach(line => {
                        line.assignedWorkstations.forEach(assignedWs => {
                            const workstation = constraints.workstationDefinitions.find(wd => wd.id === assignedWs.definitionId);
                            if (!workstation) return;
                            
                            const maxHorasJornada = getDailyHours(date, constraints);
                            const cantidadPuestos = assignedWs.quantity;
                            const horasMaxDisponibles = maxHorasJornada * cantidadPuestos;

                            dailyRows.push({
                                centro: center.id,
                                mes: monthName,
                                año: year,
                                fecha: date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
                                dia: weekdaysEs[date.getDay()],
                                esFeriado: constraints.holidays.some(h => h.date === date.toISOString().split('T')[0] && h.dayType === 'asueto' && h.appliesTo !== 'Distribucion') ? 'Si' : 'No',
                                maxHorasJornada,
                                puestoDeTrabajo: workstation.name,
                                linea: line.name,
                                cantidadPuestos,
                                horasMaxDisponibles
                            });
                        });
                    });
                });
            }
        }
        return dailyRows;
    }, [constraints]);
    
    useEffect(() => {
        if (dailyCapacityData.length > 0) {
            const columnsToFilter: Array<keyof DailyCapacityRow> = ['centro', 'mes', 'año', 'fecha', 'dia', 'linea', 'puestoDeTrabajo'];
            const options: Record<string, Set<string>> = {};
            columnsToFilter.forEach(col => options[col] = new Set());
            
            dailyCapacityData.forEach(row => {
               columnsToFilter.forEach(col => {
                    const value = row[col];
                    if (value !== null && value !== undefined && String(value).trim() !== '') {
                        options[col].add(String(value));
                    }
               });
            });

            const formattedOptions: Record<string, { value: string, label: string }[]> = {};
            for (const key in options) {
                formattedOptions[key] = Array.from(options[key]).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).map(val => ({ value: val, label: val }));
            }
            setDailyFilterOptions(formattedOptions);
        }
    }, [dailyCapacityData]);

    const handleDailyMultiSelectFilterChange = (column: keyof DailyCapacityRow, value: string[]) => {
        setDailyFilters(prev => ({ ...prev, [column]: value }));
    };

    const filteredDailyData = useMemo(() => {
        if (!dailyCapacityData) return [];
        return dailyCapacityData.filter(row => {
             return Object.keys(dailyFilters).every(key => {
                const filterValue = dailyFilters[key as keyof typeof dailyFilters];
                if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) return true;

                const rowValue = row[key as keyof DailyCapacityRow];
                if (rowValue === null || rowValue === undefined) return false;

                if (Array.isArray(filterValue)) { // Multi-select
                    return filterValue.includes(String(rowValue));
                } else { // Text filter
                    return String(rowValue).toLowerCase().includes(String(filterValue).toLowerCase());
                }
            });
        });
    }, [dailyCapacityData, dailyFilters]);

    const dailyFooterTotals = useMemo(() => {
        return filteredDailyData.reduce((acc, row) => {
            acc.horasMaxDisponibles += row.horasMaxDisponibles || 0;
            return acc;
        }, { horasMaxDisponibles: 0 });
    }, [filteredDailyData]);


    return (
        <div className="p-6 md:p-8 space-y-6">
            <div className="flex items-center space-x-3">
                <Activity />
                <h2 className="text-2xl font-semibold text-gray-700">Análisis de Capacidad de Producción</h2>
            </div>
            
             <p className="text-gray-600 text-sm">
                Esta sección desglosa la capacidad de producción disponible, tanto en una vista resumida mensual como en un detalle diario para los próximos 17 meses. 
                Se aplica un factor de eficiencia del <span className="font-bold text-blue-600">{(EFFICIENCY_FACTOR * 100).toFixed(0)}%</span> sobre las horas de jornada.
            </p>

            <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="summary">Resumen Mensual</TabsTrigger>
                    <TabsTrigger value="details">Detalle Diario</TabsTrigger>
                </TabsList>
                
                <TabsContent value="summary" className="mt-4">
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
                                {monthlyTableHierarchy.length > 0 ? (
                                    monthlyTableHierarchy.map(({ center, lines }) => (
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
                </TabsContent>
                
                <TabsContent value="details" className="mt-4">
                     <div className="border rounded-lg overflow-auto max-h-[75vh]">
                        <table className="min-w-full text-xs divide-y divide-gray-200">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Centro</th>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Mes</th>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Año</th>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Fecha</th>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Día</th>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Línea</th>
                                    <th className="px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider">Puesto de Trabajo</th>
                                    <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Feriado</th>
                                    <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Máx. Horas Jornada</th>
                                    <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider">Cant. Puestos</th>
                                    <th className="px-2 py-2 text-right font-bold text-blue-700 uppercase tracking-wider bg-blue-50">Horas Máx. Disponibles</th>
                                </tr>
                                <tr>
                                    <th className="p-1"><MultiSelectFilter placeholder="Centro" options={dailyFilterOptions.centro || []} selected={(dailyFilters.centro as string[] | undefined) || []} onChange={(value) => handleDailyMultiSelectFilterChange('centro', value)} /></th>
                                    <th className="p-1"><MultiSelectFilter placeholder="Mes" options={dailyFilterOptions.mes || []} selected={(dailyFilters.mes as string[] | undefined) || []} onChange={(value) => handleDailyMultiSelectFilterChange('mes', value)} /></th>
                                    <th className="p-1"><MultiSelectFilter placeholder="Año" options={dailyFilterOptions.año || []} selected={(dailyFilters.año as string[] | undefined) || []} onChange={(value) => handleDailyMultiSelectFilterChange('año', value)} /></th>
                                    <th className="p-1"><MultiSelectFilter placeholder="Fecha" options={dailyFilterOptions.fecha || []} selected={(dailyFilters.fecha as string[] | undefined) || []} onChange={(value) => handleDailyMultiSelectFilterChange('fecha', value)} /></th>
                                    <th className="p-1"><MultiSelectFilter placeholder="Día" options={dailyFilterOptions.dia || []} selected={(dailyFilters.dia as string[] | undefined) || []} onChange={(value) => handleDailyMultiSelectFilterChange('dia', value)} /></th>
                                    <th className="p-1"><MultiSelectFilter placeholder="Línea" options={dailyFilterOptions.linea || []} selected={(dailyFilters.linea as string[] | undefined) || []} onChange={(value) => handleDailyMultiSelectFilterChange('linea', value)} /></th>
                                    <th className="p-1"><MultiSelectFilter placeholder="Puesto" options={dailyFilterOptions.puestoDeTrabajo || []} selected={(dailyFilters.puestoDeTrabajo as string[] | undefined) || []} onChange={(value) => handleDailyMultiSelectFilterChange('puestoDeTrabajo', value)} /></th>
                                    <th className="p-1" colSpan={4}></th>
                                </tr>
                            </thead>
                             <tbody className="bg-white divide-y divide-gray-200">
                                {filteredDailyData.length > 0 ? (
                                    filteredDailyData.map((row, index) => (
                                        <tr key={index} className="hover:bg-gray-50">
                                            <td className="px-2 py-2 whitespace-nowrap">{row.centro}</td>
                                            <td className="px-2 py-2 whitespace-nowrap">{row.mes}</td>
                                            <td className="px-2 py-2 whitespace-nowrap">{row.año}</td>
                                            <td className="px-2 py-2 whitespace-nowrap">{row.fecha}</td>
                                            <td className="px-2 py-2 whitespace-nowrap">{row.dia}</td>
                                            <td className="px-2 py-2 whitespace-nowrap">{row.linea}</td>
                                            <td className="px-2 py-2 whitespace-nowrap">{row.puestoDeTrabajo}</td>
                                            <td className="px-2 py-2 text-right whitespace-nowrap">{row.esFeriado}</td>
                                            <td className="px-2 py-2 text-right font-mono">{row.maxHorasJornada.toFixed(2)}</td>
                                            <td className="px-2 py-2 text-right font-mono">{row.cantidadPuestos}</td>
                                            <td className="px-2 py-2 text-right font-mono font-bold text-blue-800 bg-blue-50">{row.horasMaxDisponibles.toFixed(2)}</td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={11} className="text-center py-8 text-gray-500">
                                            No hay datos para mostrar con los filtros seleccionados.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                             <tfoot className="bg-gray-800 text-white sticky bottom-0 font-bold">
                                <tr>
                                    <th colSpan={10} className="px-2 py-2 text-right">TOTAL HORAS DISPONIBLES FILTRADAS:</th>
                                    <td className="px-2 py-2 text-right font-mono">{dailyFooterTotals.horasMaxDisponibles.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};
