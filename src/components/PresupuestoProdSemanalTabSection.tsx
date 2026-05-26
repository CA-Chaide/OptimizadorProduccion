'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { CalendarRange, Search, Download, Loader2, Home, AlertCircle, Calendar, Filter, Hash } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MONTH_NAMES } from '@/constants/constants';

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
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  for (let d = new Date(firstDay); d <= lastDay; d.setDate(d.getDate() + 1)) {
    weeks.add(getISOWeek(new Date(d)));
  }
  return Array.from(weeks).sort((a, b) => a - b);
}

export const PresupuestoProdSemanalTabSection: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [selectedCenter, setSelectedCenter] = useState<string>("1000");
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading] = useState<boolean>(false);
  
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [selectedWeek, setSelectedWeek] = useState<string>("ALL");

  useEffect(() => {
    setMounted(true);
  }, []);

  const centers = ["1000", "2000"];
  const years = ["2024", "2025", "2026"];

  // Calcular semanas disponibles para el mes y año seleccionados
  const availableWeeks = useMemo(() => {
    if (!mounted) return [];
    return getWeeksInMonth(Number(selectedYear), Number(selectedMonth));
  }, [selectedYear, selectedMonth, mounted]);

  // Si la semana seleccionada ya no está en el mes al cambiar de mes, resetear a ALL
  useEffect(() => {
    if (selectedWeek !== "ALL" && !availableWeeks.includes(Number(selectedWeek))) {
      setSelectedWeek("ALL");
    }
  }, [availableWeeks, selectedWeek]);

  if (!mounted) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <CalendarRange className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Presupuesto de Producción Semanal</h3>
            <p className="text-xs text-gray-500 mt-1">Demanda proyectada por número de semana del año</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Buscar material..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Barra de Filtros Superiores */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-gray-50 border rounded-xl shadow-sm">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
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
          <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
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
          <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
            <Hash className="w-3 h-3" /> Semana (del Año)
          </label>
          <select 
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
          >
            <option value="ALL">Todas las semanas de este mes</option>
            {availableWeeks.map(w => (
              <option key={w} value={String(w)}>Semana {w}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <div className="flex h-9 bg-gray-200/50 p-1 rounded-lg w-full">
            {centers.map(center => (
              <button
                key={center}
                onClick={() => setSelectedCenter(center)}
                className={`flex-1 flex items-center justify-center text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${
                  selectedCenter === center 
                    ? "bg-white text-indigo-700 shadow-sm" 
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <Home className="w-3 h-3 mr-1.5" />
                Centro {center}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 text-center">
                <tr>
                  <th rowSpan={2} className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-100 border-r">Material</th>
                  <th rowSpan={2} className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider bg-gray-100 border-r">Descripción</th>
                  <th colSpan={availableWeeks.length} className="px-4 py-2 text-center text-[10px] font-bold text-indigo-700 uppercase tracking-wider border-b border-r">Demanda por Semana del Año</th>
                  <th rowSpan={2} className="px-6 py-3 text-right text-[10px] font-bold text-gray-700 uppercase tracking-wider bg-gray-100/50">Total Mes</th>
                </tr>
                <tr>
                  {availableWeeks.map(weekNum => {
                    const isSelected = selectedWeek === "ALL" || selectedWeek === String(weekNum);
                    return (
                      <th 
                        key={weekNum} 
                        className={`px-4 py-2 text-right text-[10px] font-bold text-indigo-600 uppercase tracking-wider border-r ${!isSelected ? 'opacity-30 bg-gray-50' : 'bg-indigo-50/30'}`}
                      >
                        Sem {weekNum}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={availableWeeks.length + 3} className="px-6 py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={availableWeeks.length + 3} className="px-6 py-12 text-center text-gray-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="w-8 h-8 text-gray-300" />
                        <span>No hay datos de presupuesto para las semanas {availableWeeks.join(', ')} de {MONTH_NAMES[Number(selectedMonth)-1]} {selectedYear} en el Centro {selectedCenter}.</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};