'use client';

import React, { useState, useMemo } from 'react';
import { CalendarRange, Search, Download, Loader2, Home, AlertCircle, Calendar, Filter, Hash } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MONTH_NAMES } from '@/constants/constants';

export const PresupuestoProdSemanalTabSection: React.FC = () => {
  const [selectedCenter, setSelectedCenter] = useState<string>("1000");
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading] = useState<boolean>(false);
  
  // Estados para los nuevos filtros
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [selectedMonth, setSelectedMonth] = useState<string>((new Date().getMonth() + 1).toString());
  const [selectedWeek, setSelectedWeek] = useState<string>("ALL");

  const centers = ["1000", "2000"];
  const years = ["2024", "2025", "2026"];
  const weeks = ["1", "2", "3", "4", "5"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <CalendarRange className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Presupuesto de Producción Semanal</h3>
            <p className="text-xs text-gray-500 mt-1">Desglose de demanda proyectada por semana y centro</p>
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
            <Hash className="w-3 h-3" /> Semana
          </label>
          <select 
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="w-full h-9 px-3 py-1 text-sm border border-gray-300 rounded-md bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            <option value="ALL">Todas las semanas</option>
            {weeks.map(w => <option key={w} value={w}>Semana {w}</option>)}
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
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Material</th>
                  <th className="px-6 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Descripción</th>
                  <th className={`px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider ${(selectedWeek !== 'ALL' && selectedWeek !== '1') ? 'opacity-30' : ''}`}>Semana 1</th>
                  <th className={`px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider ${(selectedWeek !== 'ALL' && selectedWeek !== '2') ? 'opacity-30' : ''}`}>Semana 2</th>
                  <th className={`px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider ${(selectedWeek !== 'ALL' && selectedWeek !== '3') ? 'opacity-30' : ''}`}>Semana 3</th>
                  <th className={`px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider ${(selectedWeek !== 'ALL' && selectedWeek !== '4') ? 'opacity-30' : ''}`}>Semana 4</th>
                  <th className={`px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider ${(selectedWeek !== 'ALL' && selectedWeek !== '5') ? 'opacity-30' : ''}`}>Semana 5</th>
                  <th className="px-6 py-3 text-right text-[10px] font-bold text-gray-700 uppercase tracking-wider bg-gray-100/50">Total Mes</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoading ? (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
                    </td>
                  </tr>
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400 italic">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="w-8 h-8 text-gray-300" />
                        <span>No hay datos de presupuesto semanal para {MONTH_NAMES[Number(selectedMonth)-1]} {selectedYear} en el Centro {selectedCenter}.</span>
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
