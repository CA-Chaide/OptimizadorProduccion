'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { 
  Activity, 
  Loader2, 
  Home, 
  Calendar as CalendarIcon, 
  Download,
  AlertCircle 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import * as XLSX from 'xlsx';

interface SummaryRow {
  linea: string;
  puesto: string;
  cantOrdFab: number;
  cantOrdPrev: number;
  tiempoOrdFab: number;
  tiempoOrdPrev: number;
  totalCantidad: number;
  totalTiempo: number;
}

/**
 * Normaliza una cadena de fecha a formato YYYY-MM-DD
 */
const normalizeDateISO = (dateStr: any): string | null => {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  let match = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
  return null;
};

const normalizeMaterialCode = (code: string | number): string => {
  return String(code || '').trim().slice(-8);
};

export const RevCapacidadTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('RevCapacidadTab');
  const { addNotification } = useAppContext();

  const [technicalData, setTechnicalData] = useState<any[]>([]);
  const [fertOrders, setFertOrders] = useState<any[]>([]);
  const [provisionalOrders, setProvisionalOrders] = useState<any[]>([]);
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  const [programmingDate, setProgrammingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [provisionalDate, setProvisionalDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [groupsRes, fertRes, prevRes] = await Promise.all([
        grupoService.getAll(),
        serviciosService.getOrdenesFert(1, 10000),
        serviciosService.OrdenesProvisionalesAlphaPaginados(1, 10000)
      ]);

      const centersFromGroups = [...new Set((groupsRes?.data || []).map((g: any) => String(g.centro).trim()))].sort();
      setAvailableCenters(centersFromGroups);
      if (centersFromGroups.length > 0 && !selectedCenter) setSelectedCenter(centersFromGroups[0]);

      // Cargar Tiempos Técnicos (reutilizamos la lógica de paginación)
      let allTiempos: any[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 10) {
        const response = await serviciosService.getTiemposEnsamblado(page, 5000);
        const raw = Array.isArray(response?.data) ? response.data : [];
        allTiempos = [...allTiempos, ...raw];
        if (raw.length < 5000) hasMore = false; else page++;
      }
      setTechnicalData(allTiempos);

      // Mapear FERT
      const mappedFert = (Array.isArray(fertRes?.data) ? fertRes.data : []).map((o: any) => {
        const cat = String(o.CATEGORIA || '').toUpperCase();
        let calc = '';
        if (cat.includes('L1')) calc = 'LINEA 1';
        else if (cat.includes('L2')) calc = 'LINEA 2';
        else if (cat.includes('L3')) calc = 'LINEA 3';
        else if (cat.includes('L5') || cat.includes('B-B')) calc = 'LINEA 5';
        else calc = String(o.LINEA || '').trim().toUpperCase();
        return { ...o, LINEA_MAPPED: calc };
      });
      setFertOrders(mappedFert);

      // Mapear Previsionales
      const mappedPrev = (Array.isArray(prevRes?.data) ? prevRes.data : []).map((o: any) => {
        const cat = String(o.CATEGORIA || '').toUpperCase();
        let calc = '';
        if (cat.includes('L1')) calc = 'LINEA 1';
        else if (cat.includes('L2')) calc = 'LINEA 2';
        else if (cat.includes('L3')) calc = 'LINEA 3';
        else if (cat.includes('L5') || cat.includes('B-B')) calc = 'LINEA 5';
        else calc = String(o.LINEA || '').trim().toUpperCase();
        return { ...o, LINEA_MAPPED: calc };
      });
      setProvisionalOrders(mappedPrev);

    } catch (err) {
      addNotification('error', `Error al cargar datos para revisión: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, selectedCenter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Mapas de suma para optimizar
  const fertSumMap = useMemo(() => {
    const map = new Map<string, number>();
    const targetDateISO = normalizeDateISO(programmingDate);
    if (!targetDateISO) return map;

    fertOrders.forEach(o => {
      if (normalizeDateISO(o.FECHA || o.fecha) === targetDateISO) {
        const key = `${o.LINEA_MAPPED}|${normalizeMaterialCode(o.MATERIAL || o.CodMaterial)}`;
        const pend = Number(o.CANTPENDIENTE || 0) || 0;
        map.set(key, (map.get(key) || 0) + pend);
      }
    });
    return map;
  }, [fertOrders, programmingDate]);

  const prevSumMap = useMemo(() => {
    const map = new Map<string, number>();
    const targetDateISO = normalizeDateISO(provisionalDate);
    if (!targetDateISO) return map;

    provisionalOrders.forEach(o => {
      if (normalizeDateISO(o.FECHAINICIO || o.fecha_inicio) === targetDateISO) {
        const key = `${o.LINEA_MAPPED}|${normalizeMaterialCode(o.MATERIAL || o.CodMaterial)}`;
        const cant = Number(o.CANTIDAD || 0) || 0;
        map.set(key, (map.get(key) || 0) + cant);
      }
    });
    return map;
  }, [provisionalOrders, provisionalDate]);

  // Agregación de Resumen
  const summaryData = useMemo((): SummaryRow[] => {
    const map = new Map<string, SummaryRow>();
    const base = technicalData.filter(d => String(d.Centro || '').trim() === selectedCenter);
    const allowedLines = ['LINEA 1', 'LINEA 2', 'LINEA 3', 'LINEA 5'];
    const allowedWstations = ['Armado', 'Cerrado L1', 'Cerrado1 L2', 'Cerrado2 L2', 'Cerrado L3'];

    base.forEach(row => {
      const line = String(row.Linea || '').trim().toUpperCase();
      const puesto = String(row.PuestoTrabajo || '').trim();
      
      if (!allowedLines.some(l => line.includes(l))) return;
      if (!allowedWstations.includes(puesto)) return;

      const key = `${line}|${puesto}`;
      const matKey = `${line}|${normalizeMaterialCode(row.CodMaterial)}`;

      if (!map.has(key)) {
        map.set(key, { 
          linea: line, puesto, 
          cantOrdFab: 0, cantOrdPrev: 0, 
          tiempoOrdFab: 0, tiempoOrdPrev: 0,
          totalCantidad: 0, totalTiempo: 0
        });
      }

      const entry = map.get(key)!;
      const qFab = fertSumMap.get(matKey) || 0;
      const qPrev = prevSumMap.get(matKey) || 0;
      const tUnit = Number(row.Tiempo_Min || 0);

      if (qFab > 0) {
        entry.cantOrdFab += qFab;
        entry.tiempoOrdFab += (qFab * tUnit) / 60;
      }
      if (qPrev > 0) {
        entry.cantOrdPrev += qPrev;
        entry.tiempoOrdPrev += (qPrev * tUnit) / 60;
      }
      
      entry.totalCantidad = entry.cantOrdFab + entry.cantOrdPrev;
      entry.totalTiempo = entry.tiempoOrdFab + entry.tiempoOrdPrev;
    });

    return Array.from(map.values()).sort((a, b) => a.linea.localeCompare(b.linea) || a.puesto.localeCompare(b.puesto));
  }, [technicalData, selectedCenter, fertSumMap, prevSumMap]);

  const grandTotals = useMemo(() => {
    return summaryData.reduce((acc, r) => ({
      cantFab: acc.cantFab + r.cantOrdFab,
      cantPrev: acc.cantPrev + r.cantOrdPrev,
      timeFab: acc.timeFab + r.tiempoOrdFab,
      timePrev: acc.timePrev + r.tiempoOrdPrev,
      totalCant: acc.totalCant + r.totalCantidad,
      totalTime: acc.totalTime + r.totalTiempo,
    }), { cantFab: 0, cantPrev: 0, timeFab: 0, timePrev: 0, totalCant: 0, totalTime: 0 });
  }, [summaryData]);

  const handleExport = () => {
    if (summaryData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(summaryData.map(r => ({
      'Línea': r.linea, 'Puesto Trabajo': r.puesto,
      'Cant ordFab': r.cantOrdFab, 'Cant ordPrev': r.cantOrdPrev,
      'Tiempo ordFab': r.tiempoOrdFab.toFixed(2), 'Tiempo ordPrev': r.tiempoOrdPrev.toFixed(2),
      'Total Cantidad': r.totalCantidad, 'Total Tiempo (h)': r.totalTiempo.toFixed(2)
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resumen Capacidad");
    XLSX.writeFile(wb, `Resumen_Capacidad_${selectedCenter}.xlsx`);
  };

  if (isLoading && technicalData.length === 0) {
    return <div className="flex flex-col items-center py-20"><Loader2 className="animate-spin h-8 w-8 text-indigo-600" /><span>Calculando resumen...</span></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Activity className="w-6 h-6 text-indigo-600" />
          <h3 className="text-xl font-semibold text-gray-800">Resumen de Capacidad por Puesto</h3>
        </div>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={summaryData.length === 0}><Download className="w-4 h-4 mr-2" /> Exportar</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-gray-50 border rounded-xl shadow-sm">
        <div className="flex items-center gap-3 bg-white border rounded-md px-3 py-2 h-11">
          <label className="text-[10px] font-bold text-gray-400 uppercase">Día Programación:</label>
          <input type="date" value={programmingDate} onChange={e => setProgrammingDate(e.target.value)} className="text-xs border-none focus:ring-0 font-medium text-indigo-700 outline-none" />
          <CalendarIcon className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex items-center gap-3 bg-white border rounded-md px-3 py-2 h-11">
          <label className="text-[10px] font-bold text-gray-400 uppercase">Fecha Previsionales:</label>
          <input type="date" value={provisionalDate} onChange={e => setProvisionalDate(e.target.value)} className="text-xs border-none focus:ring-0 font-medium text-indigo-700 outline-none" />
          <CalendarIcon className="w-4 h-4 text-gray-400" />
        </div>
        <div className="flex items-center gap-3 bg-white border rounded-md px-3 py-2 h-11">
          <label className="text-[10px] font-bold text-gray-400 uppercase">Centro:</label>
          <select value={selectedCenter} onChange={e => setSelectedCenter(e.target.value)} className="text-xs border-none focus:ring-0 font-bold text-indigo-700 bg-transparent outline-none flex-1">
            {availableCenters.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Home className="w-4 h-4 text-gray-400" />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 border-collapse">
            <thead className="bg-gray-50">
              <tr className="text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                <th className="px-4 py-3 text-left border">Línea</th>
                <th className="px-4 py-3 text-left border">Puesto Trabajo</th>
                <th className="px-4 py-3 text-right border">Cant ordFab</th>
                <th className="px-4 py-3 text-right border">Cant ordPrev</th>
                <th className="px-4 py-3 text-right border text-indigo-700">Tiempo ordFab</th>
                <th className="px-4 py-3 text-right border text-indigo-700">Tiempo ordPrev</th>
                <th className="px-4 py-3 text-right border bg-indigo-50/30">Total Cantidad</th>
                <th className="px-4 py-3 text-right border bg-indigo-50/30">Total Tiempo (h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-xs">
              {summaryData.length > 0 ? (() => {
                const rows: React.ReactNode[] = [];
                const lines = [...new Set(summaryData.map(r => r.linea))];
                
                lines.forEach(lineName => {
                  const lineRows = summaryData.filter(r => r.linea === lineName);
                  lineRows.forEach((r, idx) => {
                    rows.push(
                      <tr key={`${lineName}-${idx}`} className="hover:bg-gray-50 transition-colors">
                        {idx === 0 && (
                          <td rowSpan={lineRows.length} className="px-4 py-3 font-bold text-gray-900 border align-top bg-gray-50/30">
                            {lineName}
                          </td>
                        )}
                        <td className="px-4 py-3 font-medium text-gray-700 border">{r.puesto}</td>
                        <td className="px-4 py-3 text-right font-mono border">{r.cantOrdFab.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono border">{r.cantOrdPrev.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-mono border text-indigo-600">{r.tiempoOrdFab.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-mono border text-indigo-600">{r.tiempoOrdPrev.toFixed(2)}</td>
                        <td className="px-4 py-3 text-right font-bold border bg-indigo-50/10">{r.totalCantidad.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right font-bold border bg-indigo-50/10">{r.totalTiempo.toFixed(2)}</td>
                      </tr>
                    );
                  });
                });
                return rows;
              })() : (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400 italic"><AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />Sin datos para los criterios seleccionados.</td></tr>
              )}
            </tbody>
            {summaryData.length > 0 && (
              <tfoot className="bg-gray-800 text-white font-bold text-xs">
                <tr>
                  <td colSpan={2} className="px-4 py-3 text-right uppercase border-r border-gray-700">Total General:</td>
                  <td className="px-4 py-3 text-right font-mono border-r border-gray-700">{grandTotals.cantFab.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono border-r border-gray-700">{grandTotals.cantPrev.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono border-r border-gray-700 text-indigo-200">{grandTotals.timeFab.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono border-r border-gray-700 text-indigo-200">{grandTotals.timePrev.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right font-mono border-r border-gray-700 text-emerald-300">{grandTotals.totalCant.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-emerald-300">{grandTotals.totalTime.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
