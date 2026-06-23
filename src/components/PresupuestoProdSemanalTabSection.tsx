
'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  CalendarRange, 
  Search, 
  Download, 
  Loader2, 
  Home, 
  AlertCircle, 
  Calendar, 
  Filter, 
  Hash,
  PlayCircle,
  Database,
  X,
  Check,
  ChevronsUpDown
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { MONTH_NAMES } from '@/constants/constants';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import * as XLSX from 'xlsx';

// Helper para obtener el número de semana del año (ISO-8601)
function getISOWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

// Obtener las semanas del año que pertenecen a un mes específico
function getWeeksInMonth(year: number, month: number) {
  const weeks = new Set<number>();
  // JS Months are 0-indexed, so month-1
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  const current = new Date(firstDay);
  while (current <= lastDay) {
    weeks.add(getISOWeek(new Date(current)));
    current.setDate(current.getDate() + 1);
  }
  return Array.from(weeks).sort((a, b) => a - b);
}

export const PresupuestoProdSemanalTabSection: React.FC = () => {
  const { addNotification } = useAppContext();
  const [mounted, setMounted] = useState(false);
  const [selectedCenter, setSelectedCenter] = useState<string>("1000");
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>([]);
  const [isWeeksPopoverOpen, setIsWeeksPopoverOpen] = useState(false);

  const [presupuestoData, setPresupuestoData] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const years = ["2024", "2025", "2026"];

  // Calcular semanas disponibles para el mes y año seleccionados
  const availableWeeks = useMemo(() => {
    if (!mounted) return [];
    return getWeeksInMonth(Number(selectedYear), Number(selectedMonth));
  }, [selectedYear, selectedMonth, mounted]);

  // Sincronizar semanas seleccionadas cuando cambia el mes o año
  useEffect(() => {
    if (mounted && availableWeeks.length > 0) {
      // Filtrar semanas seleccionadas que ya no están disponibles en el nuevo mes/año
      setSelectedWeeks(prev => prev.filter(w => availableWeeks.includes(Number(w))));
    }
  }, [availableWeeks, mounted]);

  const toggleWeek = (week: string) => {
    setSelectedWeeks(prev => 
      prev.includes(week) ? prev.filter(w => w !== week) : [...prev, week]
    );
  };

  const handleFetchPresupuesto = async () => {
    if (selectedWeeks.length === 0) {
      addNotification('warning', 'Por favor selecciona al menos una semana.');
      return;
    }

    setIsLoading(true);
    setPresupuestoData([]);
    
    try {
      let combinedData: any[] = [];
      
      // Consultar cada semana seleccionada
      for (const week of selectedWeeks) {
        const response = await serviciosService.getProduccionEstimadaPorIntervalo(
          selectedYear,
          selectedMonth,
          week
        );
        const data = Array.isArray(response?.data) ? response.data : [];
        combinedData = [...combinedData, ...data];
      }

      // Consolidar por material, centro y línea para mostrar totales del período
      const consolidatedMap = new Map<string, any>();
      combinedData.forEach(item => {
          const key = `${item.codigo_material}|${item.centro}|${item.linea_produccion}`;
          if (consolidatedMap.has(key)) {
              const existing = consolidatedMap.get(key);
              existing.cantidad_proyectada = (Number(existing.cantidad_proyectada) || 0) + (Number(item.cantidad_proyectada) || 0);
              existing.cantidad_producir = (Number(existing.cantidad_producir) || 0) + (Number(item.cantidad_producir) || 0);
          } else {
              consolidatedMap.set(key, { ...item });
          }
      });

      const finalData = Array.from(consolidatedMap.values());
      setPresupuestoData(finalData);
      
      if (finalData.length > 0) {
        addNotification('success', `Se recuperaron y consolidaron ${combinedData.length} registros de ${selectedWeeks.length} semanas.`);
      } else {
        addNotification('info', 'No se encontraron datos para los criterios seleccionados.');
      }
    } catch (error) {
      console.error('Error fetching presupuesto:', error);
      addNotification('error', 'Error al consultar el presupuesto de producción.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredData = useMemo(() => {
    return presupuestoData.filter(item => {
      if (selectedCenter !== "ALL" && String(item.centro || '').trim() !== selectedCenter) {
        return false;
      }

      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
      return (
        String(item.codigo_material || '').toLowerCase().includes(term) ||
        String(item.linea_produccion || '').toLowerCase().includes(term) ||
        String(item.nombre || '').toLowerCase().includes(term)
      );
    });
  }, [presupuestoData, selectedCenter, searchTerm]);

  const totals = useMemo(() => {
    return filteredData.reduce((acc, item) => ({
      proyectada: acc.proyectada + (Number(item.cantidad_proyectada) || 0),
      producir: acc.producir + (Number(item.cantidad_producir) || 0)
    }), { proyectada: 0, producir: 0 });
  }, [filteredData]);

  const handleExport = () => {
    if (filteredData.length === 0) return;
    
    const exportData = filteredData.map(item => ({
      'Material': String(item.codigo_material || '').replace(/^0+/, ''),
      'Descripción': item.nombre || '',
      'Centro': item.centro || '',
      'Línea': item.linea_produccion || '',
      'Cant. Proyectada': item.cantidad_proyectada || 0,
      'Cant. a Producir': item.cantidad_producir || 0
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Presupuesto");
    XLSX.writeFile(wb, `Presupuesto_Semanas_${selectedWeeks.join('-')}_${selectedYear}.xlsx`);
  };

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <CalendarRange className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Presupuesto de Producción Semanal</h3>
            <p className="text-xs text-gray-500 mt-1">Consolidación de producción estimada por semanas técnicas</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Filtrar por material o línea..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredData.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-gray-50 border rounded-xl shadow-sm">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
            <Calendar className="w-3 h-3" /> Año
          </label>
          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
            <Filter className="w-3 h-3" /> Mes
          </label>
          <select 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={String(i + 1)}>{m}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
            <Hash className="w-3 h-3" /> Semanas (del Año)
          </label>
          <Popover open={isWeeksPopoverOpen} onOpenChange={setIsWeeksPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                className="w-full justify-between h-9 font-normal text-xs bg-white border-gray-300 text-indigo-700"
              >
                <span className="truncate">
                  {selectedWeeks.length === 0
                    ? "Seleccionar..."
                    : selectedWeeks.length === 1
                    ? `${selectedWeeks[0]}`
                    : `${selectedWeeks.length} seleccionadas`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Buscar semana..." className="h-8 text-xs" />
                <CommandEmpty>No encontrada.</CommandEmpty>
                <CommandGroup className="max-h-60 overflow-y-auto">
                  {availableWeeks.map((week) => (
                    <CommandItem
                      key={week}
                      value={String(week)}
                      onSelect={() => toggleWeek(String(week))}
                      className="text-xs"
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedWeeks.includes(String(week)) ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {week}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </Command>
            </PopoverContent>
          </Popover>
          {selectedWeeks.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {selectedWeeks.map(w => (
                <Badge key={w} variant="secondary" className="text-[9px] px-1 bg-indigo-50 text-indigo-700 border-indigo-100">
                  {w}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
            <Home className="w-3 h-3" /> Centro
          </label>
          <select 
            value={selectedCenter}
            onChange={(e) => setSelectedCenter(e.target.value)}
            className="w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="ALL">Todos</option>
            <option value="1000">1000</option>
            <option value="2000">2000</option>
          </select>
        </div>

        <div className="flex items-end">
          <Button 
            onClick={handleFetchPresupuesto} 
            disabled={isLoading || selectedWeeks.length === 0}
            className="w-full h-9 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <><PlayCircle className="w-4 h-4 mr-2" /> Consultar</>
            )}
          </Button>
        </div>
      </div>

      {filteredData.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-white border-l-4 border-l-blue-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase">Materiales Consolidados</p>
                <p className="text-2xl font-mono font-bold text-blue-700">{filteredData.length}</p>
              </div>
              <Database className="w-8 h-8 text-blue-100" />
            </CardContent>
          </Card>
          <Card className="bg-white border-l-4 border-l-indigo-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase">Total Proyectado (Período)</p>
                <p className="text-2xl font-mono font-bold text-indigo-700">{totals.proyectada.toLocaleString()}</p>
              </div>
              <CalendarRange className="w-8 h-8 text-indigo-100" />
            </CardContent>
          </Card>
          <Card className="bg-white border-l-4 border-l-emerald-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-gray-500 uppercase">Total a Producir (Período)</p>
                <p className="text-2xl font-mono font-bold text-emerald-700">{totals.producir.toLocaleString()}</p>
              </div>
              <PlayCircle className="w-8 h-8 text-emerald-100" />
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border shadow-sm overflow-hidden bg-white">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[600px]">
            <table className="min-w-full text-xs divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider border-r">Material</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider border-r">Descripción</th>
                  <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider border-r">Centro</th>
                  <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider border-r">Línea Prod.</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider border-r bg-indigo-50/30">Cant. Proyectada</th>
                  <th className="px-4 py-3 text-right text-[10px] font-bold text-emerald-700 uppercase tracking-wider bg-emerald-50/30">Cant. a Producir</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                        <span className="text-sm font-medium text-gray-500">Consultando y consolidando presupuesto...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredData.length > 0 ? (
                  filteredData.map((item, idx) => (
                    <tr key={`${item.codigo_material}-${idx}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 whitespace-nowrap text-xs font-mono font-bold text-gray-900">{String(item.codigo_material || '').replace(/^0+/, '')}</td>
                      <td className="px-6 py-3 text-xs text-gray-600 max-w-xs truncate" title={item.nombre}>{item.nombre || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <Badge variant="outline" className="font-mono text-[10px] bg-gray-50">{item.centro}</Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-gray-700">
                        {item.linea_produccion || <span className="text-gray-400 italic">No asignada</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-indigo-600 bg-indigo-50/10">
                        {Number(item.cantidad_proyectada || 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right font-mono font-bold text-emerald-600 bg-emerald-50/10">
                        {Number(item.cantidad_producir || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="w-8 h-8 text-gray-300" />
                        <span>
                          {presupuestoData.length === 0 
                            ? "Haz clic en 'Consultar' para cargar los datos del presupuesto semanal." 
                            : "No hay datos que coincidan con los filtros aplicados."}
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredData.length > 0 && (
                <tfoot className="bg-gray-800 text-white font-bold text-[10px] sticky bottom-0 z-10">
                  <tr>
                    <td colSpan={4} className="px-6 py-3 text-right uppercase border-r border-gray-700">Totales Consolidados ({selectedWeeks.length} selec):</td>
                    <td className="px-4 py-3 text-right font-mono text-indigo-300 border-r border-gray-700">{totals.proyectada.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-emerald-300">{totals.producir.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
