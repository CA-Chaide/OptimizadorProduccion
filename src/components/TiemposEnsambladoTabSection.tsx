'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { Clock, Loader2, Search, Home, Database, AlertCircle, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface TiempoEnsamblado {
  CodMaterial: string;
  Centro: string;
  PuestoTrabajoLinea: string;
  Linea: string;
  PuestoTrabajo: string;
  Tiempo_Min: number;
  StockActual: number;
  StockSeguridad: number;
  StockMaximo: number;
  GrupoCompras: string;
  ClaseAprovisionam: string;
  TamLoteMin: number;
  TamLoteMax: number;
  RespCtrlProd: string;
  NombRespControlProd: string;
}

export const TiemposEnsambladoTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('TiemposEnsambladoTab');
  const { addNotification } = useAppContext();
  const hasStarted = useRef(false);

  const [allData, setAllData] = useState<TiempoEnsamblado[]>([]);
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedResponsable, setSelectedResponsable] = useState<string>("ALL");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Obtener centros oficiales de los grupos
      const groupsRes = await grupoService.getAll();
      const centersFromGroups = [...new Set((groupsRes?.data || []).map((g: any) => String(g.centro).trim()))].sort();
      setAvailableCenters(centersFromGroups);
      if (centersFromGroups.length > 0 && !selectedCenter) setSelectedCenter(centersFromGroups[0]);

      // 2. Cargar datos de tiempos (Paginado a 10k para cubrir la mayoría de registros técnicos)
      const response = await serviciosService.getTiemposEnsamblado(1, 10000);
      const rawData = Array.isArray(response?.data) ? response.data : [];
      setAllData(rawData);

      inspector.captureVariable('tiempos_raw_count', rawData.length);
    } catch (err) {
      addNotification('error', `Error al cargar tiempos de ensamblado: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, inspector, selectedCenter]);

  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      loadData();
    }
  }, [loadData]);

  // Lista de responsables únicos para el centro seleccionado
  const responsablesDisponibles = useMemo(() => {
    const centerData = allData.filter(row => String(row.Centro || '').trim() === selectedCenter);
    const unique = [...new Set(centerData.map(row => String(row.NombRespControlProd || '').trim()))]
      .filter(Boolean)
      .sort();
    return unique;
  }, [allData, selectedCenter]);

  // Filtrado por Centro, Responsable y Búsqueda
  const currentViewData = useMemo(() => {
    let base = allData.filter(row => String(row.Centro || '').trim() === selectedCenter);

    // Filtro de Responsable
    if (selectedResponsable !== "ALL") {
      base = base.filter(row => String(row.NombRespControlProd || '').trim() === selectedResponsable);
    }

    const term = searchTerm.toLowerCase().trim();
    if (!term) return base;

    return base.filter(row => 
      String(row.CodMaterial || '').toLowerCase().includes(term) ||
      String(row.Linea || '').toLowerCase().includes(term) ||
      String(row.PuestoTrabajo || '').toLowerCase().includes(term) ||
      String(row.NombRespControlProd || '').toLowerCase().includes(term)
    );
  }, [allData, selectedCenter, selectedResponsable, searchTerm]);

  const totalPagesLocal = Math.max(1, Math.ceil(currentViewData.length / rowsPerPage));
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const displayedData = currentViewData.slice(startIndex, endIndex);

  const formatMaterial = (mat: string) => String(mat || '').replace(/^0+/, '');

  if (isLoading && allData.length === 0) {
    return (
      <div className="flex flex-col justify-center items-center py-20 bg-white rounded-lg border border-dashed">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
        <span className="mt-4 text-gray-600 font-medium">Cargando tiempos técnicos...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Clock className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Tiempos de Ensamblado / Muebles</h3>
            <p className="text-xs text-gray-500 mt-1">Matriz técnica de tiempos unitarios y parámetros de lote</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro Responsable */}
          <Select value={selectedResponsable} onValueChange={(val) => { setSelectedResponsable(val); setCurrentPage(1); }}>
            <SelectTrigger className="h-9 w-64 bg-white">
              <UserCircle className="w-3.5 h-3.5 mr-2 text-gray-400" />
              <SelectValue placeholder="Filtrar por Responsable" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los Responsables</SelectItem>
              {responsablesDisponibles.map(resp => (
                <SelectItem key={resp} value={resp}>{resp}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Material, línea, puesto..."
              className="pl-9 h-9 text-xs"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => { hasStarted.current = false; loadData(); }}>
            Actualizar
          </Button>
        </div>
      </div>

      <Tabs value={selectedCenter} onValueChange={(val) => { setSelectedCenter(val); setCurrentPage(1); setSelectedResponsable("ALL"); }} className="w-full">
        <TabsList className="flex flex-wrap h-auto bg-gray-100/50 p-1 mb-4">
          {availableCenters.map(center => (
            <TabsTrigger 
              key={center} 
              value={center}
              className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm px-4 py-2 text-xs font-bold uppercase tracking-wider"
            >
              <Home className="w-3 h-3 mr-2" />
              Centro {center} ({allData.filter(d => String(d.Centro || '').trim() === center).length})
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          {/* Scroll Horizontal Superior */}
          <div className="overflow-x-auto" style={{ transform: 'rotateX(180deg)' }}>
            <div style={{ transform: 'rotateX(180deg)' }}>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Material</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Línea</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Puesto Trabajo</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-50/30">Tiempo (min)</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock Act.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Stock Seg.</th>
                    <th className="px-4 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">Aprov.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lote Mín.</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider">Lote Máx.</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold text-gray-500 uppercase tracking-wider">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {displayedData.length > 0 ? displayedData.map((row, idx) => (
                    <tr key={`${row.CodMaterial}-${idx}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-mono font-bold text-gray-900">{formatMaterial(row.CodMaterial)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">{row.Linea}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[10px] text-gray-500 font-medium">{row.PuestoTrabajo}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-right text-indigo-600 bg-indigo-50/10">
                        {Number(row.Tiempo_Min || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 3 })}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-right text-gray-500">{row.StockActual}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-right text-gray-700 font-semibold">{row.StockSeguridad}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <Badge variant="outline" className="text-[10px] font-bold bg-blue-50 text-blue-700">{row.ClaseAprovisionam}</Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-[10px] text-right text-gray-500">{row.TamLoteMin}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[10px] text-right text-gray-500">{row.TamLoteMax || '-'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-[10px] text-gray-600 truncate max-w-[150px]" title={row.NombRespControlProd}>
                        {row.NombRespControlProd} <span className="text-gray-400 font-mono">({row.RespCtrlProd})</span>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={10} className="px-6 py-12 text-center text-gray-400 italic">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <AlertCircle className="w-8 h-8 text-gray-300" />
                          <span>No se encontraron registros de tiempos para los criterios seleccionados.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer / Paginación */}
          <div className="bg-gray-50 px-6 py-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4 text-xs">
              <span className="font-medium text-gray-500 uppercase">Ver:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="border rounded p-1 bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-gray-400">
                {startIndex + 1} - {Math.min(endIndex, currentViewData.length)} de {currentViewData.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Anterior</Button>
              <div className="px-4 py-1 bg-white border rounded text-xs font-bold text-indigo-600 min-w-[80px] text-center">{currentPage} / {totalPagesLocal}</div>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPagesLocal, p + 1))} disabled={currentPage === totalPagesLocal}>Siguiente</Button>
            </div>
          </div>
        </div>
      </Tabs>
    </div>
  );
};
