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
  AlertCircle,
  Target,
  ArrowRightLeft
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
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
  puestosObjetivo: number;
  puestosOptimizados: number;
}

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

const RESTRICCIONES_PUESTOS: Record<string, number> = {
  'LINEA 1|Armado': 12,
  'LINEA 1|Cerrado L1': 6,
  'LINEA 2|Armado': 6,
  'LINEA 2|Cerrado1 L2': 4,
  'LINEA 2|Cerrado2 L2': 4,
  'LINEA 3|Armado': 2,
  'LINEA 3|Cerrado L3': 1,
  'LINEA 5|Armado': 2,
};

// Puestos que mandan el ritmo para el balanceo
const PUESTOS_REFERENCIA: Record<string, string> = {
  'LINEA 1': 'Armado',
  'LINEA 2': 'Armado',
  'LINEA 3': 'Armado',
  'LINEA 5': 'Armado',
};

export const RevCapacidadTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('RevCapacidadTab');
  const { addNotification } = useAppContext();

  const [technicalData, setTechnicalData] = useState<any[]>([]);
  const [fertOrders, setFertOrders] = useState<any[]>([]);
  const [provisionalOrders, setProvisionalOrders] = useState<any[]>([]);
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("1000");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const [programmingDate, setProgrammingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [provisionalDate, setProvisionalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [horasTurno1, setHorasTurno1] = useState<number>(8);
  const [horasTurno2, setHorasTurno2] = useState<number>(8);
  const [rendLinea1, setRendLinea1] = useState<number>(1.05);
  const [rendLinea2, setRendLinea2] = useState<number>(1.08);
  const [rendLinea3, setRendLinea3] = useState<number>(1.05);
  const [rendLinea5, setRendLinea5] = useState<number>(1.05);

  const hourOptions = Array.from({ length: 9 }, (_, i) => i + 4);

  useEffect(() => setIsMounted(true), []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [groupsRes, fertRes, prevRes] = await Promise.all([
        grupoService.getAll(),
        serviciosService.getOrdenesFert(1, 10000),
        serviciosService.OrdenesProvisionalesAlphaPaginados(1, 10000)
      ]);

      const centers = [...new Set((groupsRes?.data || []).map((g: any) => String(g.centro).trim()))].sort();
      setAvailableCenters(centers);
      if (centers.length > 0 && !selectedCenter) setSelectedCenter(centers[0]);

      let allTiempos: any[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 5) {
        const response = await serviciosService.getTiemposEnsamblado(page, 5000);
        const raw = Array.isArray(response?.data) ? response.data : [];
        allTiempos = [...allTiempos, ...raw];
        if (raw.length < 5000) hasMore = false; else page++;
      }
      setTechnicalData(allTiempos);

      const rawFert = Array.isArray(fertRes?.data) ? fertRes.data : [];
      const mappedFert = rawFert.map((o: any) => {
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

      const rawPrev = Array.isArray(prevRes?.data) ? prevRes.data : [];
      const mappedPrev = rawPrev.map((o: any) => {
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
      addNotification('error', `Error al cargar datos: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, selectedCenter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fertSumMap = useMemo(() => {
    const map = new Map<string, number>();
    const targetDateISO = normalizeDateISO(programmingDate);
    if (!targetDateISO || !selectedCenter) return map;

    fertOrders.forEach(o => {
      if (normalizeDateISO(o.FECHA || o.fecha) === targetDateISO && String(o.CENTRO || '').trim() === selectedCenter) {
        const key = `${o.LINEA_MAPPED}|${normalizeMaterialCode(o.MATERIAL || o.CodMaterial)}`;
        map.set(key, (map.get(key) || 0) + Number(o.CANTPENDIENTE || 0));
      }
    });
    return map;
  }, [fertOrders, programmingDate, selectedCenter]);

  const prevSumMap = useMemo(() => {
    const map = new Map<string, number>();
    const targetDateISO = normalizeDateISO(provisionalDate);
    if (!targetDateISO || !selectedCenter) return map;

    provisionalOrders.forEach(o => {
      if (normalizeDateISO(o.FECHAINICIO || o.fecha_inicio) === targetDateISO && String(o.Centro || '').trim() === selectedCenter) {
        const key = `${o.LINEA_MAPPED}|${normalizeMaterialCode(o.MATERIAL || o.CodMaterial || o.Material)}`;
        map.set(key, (map.get(key) || 0) + Number(o.CANTIDAD || 0));
      }
    });
    return map;
  }, [provisionalOrders, provisionalDate, selectedCenter]);

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
          totalCantidad: 0, totalTiempo: 0,
          puestosObjetivo: RESTRICCIONES_PUESTOS[key] || 0,
          puestosOptimizados: 0
        });
      }

      const entry = map.get(key)!;
      const qFab = fertSumMap.get(matKey) || 0;
      const qPrev = prevSumMap.get(matKey) || 0;
      const tUnit = Number(row.Tiempo_Min || 0);

      let rendFactor = 1;
      if (line.includes('LINEA 1')) rendFactor = rendLinea1;
      else if (line.includes('LINEA 2')) rendFactor = rendLinea2;
      else if (line.includes('LINEA 3')) rendFactor = rendLinea3;
      else if (line.includes('LINEA 5')) rendFactor = rendLinea5;

      if (qFab > 0) {
        entry.cantOrdFab += qFab;
        entry.tiempoOrdFab += ((qFab * tUnit) / 60) * rendFactor;
      }
      if (qPrev > 0) {
        entry.cantOrdPrev += qPrev;
        entry.tiempoOrdPrev += ((qPrev * tUnit) / 60) * rendFactor;
      }
      
      entry.totalCantidad = entry.cantOrdFab + entry.cantOrdPrev;
      entry.totalTiempo = entry.tiempoOrdFab + entry.tiempoOrdPrev;
    });

    const rows = Array.from(map.values());

    // CALCULO DE PUESTOS OPTIMIZADOS (BASADO EN BALANCEO POR PUESTO DE REFERENCIA)
    const lineFactors = new Map<string, number>();
    const linesFound = [...new Set(rows.map(r => r.linea))];

    linesFound.forEach(lName => {
      const refPuesto = PUESTOS_REFERENCIA[lName];
      const refRow = rows.find(r => r.linea === lName && r.puesto === refPuesto);
      if (refRow && refRow.totalTiempo > 0) {
        const currentCalculated = refRow.totalTiempo / horasTurno1;
        const target = refRow.puestosObjetivo;
        lineFactors.set(lName, target / currentCalculated);
      } else {
        lineFactors.set(lName, 1);
      }
    });

    return rows.map(r => {
      const factor = lineFactors.get(r.linea) || 1;
      return {
        ...r,
        puestosOptimizados: (r.totalTiempo / horasTurno1) * factor
      };
    }).sort((a, b) => a.linea.localeCompare(b.linea) || a.puesto.localeCompare(b.puesto));
  }, [technicalData, selectedCenter, fertSumMap, prevSumMap, rendLinea1, rendLinea2, rendLinea3, rendLinea5, horasTurno1]);

  const grandTotals = useMemo(() => {
    return summaryData.reduce((acc, r) => ({
      cantFab: acc.cantFab + r.cantOrdFab,
      cantPrev: acc.cantPrev + r.cantOrdPrev,
      totalCant: acc.totalCant + r.totalCantidad,
      totalTime: acc.totalTime + r.totalTiempo,
      totalPuestos: acc.totalPuestos + (r.totalTiempo / horasTurno1),
      totalObjetivo: acc.totalObjetivo + r.puestosObjetivo,
      totalOptimizados: acc.totalOptimizados + r.puestosOptimizados
    }), { cantFab: 0, cantPrev: 0, totalCant: 0, totalTime: 0, totalPuestos: 0, totalObjetivo: 0, totalOptimizados: 0 });
  }, [summaryData, horasTurno1]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Activity className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Resumen de Capacidad y Balanceo</h3>
            <p className="text-xs text-gray-500">Cálculo de puestos necesarios vs capacidad instalada</p>
          </div>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" className="bg-blue-50 text-blue-700 border-blue-200">
                <ArrowRightLeft className="w-4 h-4 mr-2" /> Equilibrar Cantidades
            </Button>
            <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                    const ws = XLSX.utils.json_to_sheet(summaryData.map(r => ({
                    'Línea': r.linea, 'Puesto Trabajo': r.puesto,
                    'Total Cant': r.totalCantidad,
                    'Total Tiempo (h)': r.totalTiempo.toFixed(2),
                    'No. Puestos': (r.totalTiempo / horasTurno1).toFixed(2),
                    'Puestos Objetivo': r.puestosObjetivo,
                    'Puestos Optimizados': r.puestosOptimizados.toFixed(2)
                    })));
                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, "Capacidad");
                    XLSX.writeFile(wb, `Capacidad_${selectedCenter}.xlsx`);
                }} 
                disabled={summaryData.length === 0}
                >
                <Download className="w-4 h-4 mr-2" /> Exportar
            </Button>
        </div>
      </div>

      <Tabs value={selectedCenter} onValueChange={(val) => setSelectedCenter(val)} className="w-full">
        <TabsList className="flex h-auto bg-gray-100/50 p-1 mb-4">
          {availableCenters.map(center => (
            <TabsTrigger key={center} value={center} className="px-6 py-2 text-xs font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-indigo-700">
              <Home className="w-3 h-3 mr-2" /> Centro {center}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 p-4 bg-gray-50 border rounded-xl shadow-sm mb-6">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Día Prog:</label>
            <input type="date" value={programmingDate} onChange={e => setProgrammingDate(e.target.value)} className="text-xs border rounded-md px-2 py-2 outline-none text-indigo-700 font-medium h-9" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Fecha Prev:</label>
            <input type="date" value={provisionalDate} onChange={e => setProvisionalDate(e.target.value)} className="text-xs border rounded-md px-2 py-2 outline-none text-indigo-700 font-medium h-9" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Horas T1:</label>
            <select value={horasTurno1} onChange={e => setHorasTurno1(Number(e.target.value))} className="text-xs border rounded-md px-2 py-1 h-9 font-bold text-indigo-700">
              {hourOptions.map(h => <option key={`t1-${h}`} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Horas T2:</label>
            <select value={horasTurno2} onChange={e => setHorasTurno2(Number(e.target.value))} className="text-xs border rounded-md px-2 py-1 h-9 font-bold text-indigo-700">
              {hourOptions.map(h => <option key={`t2-${h}`} value={h}>{h}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Rend L1:</label>
            <input type="number" step="0.01" value={rendLinea1} onChange={e => setRendLinea1(Number(e.target.value))} className="text-xs border rounded-md px-2 py-1 h-9 font-bold text-indigo-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Rend L2:</label>
            <input type="number" step="0.01" value={rendLinea2} onChange={e => setRendLinea2(Number(e.target.value))} className="text-xs border rounded-md px-2 py-1 h-9 font-bold text-indigo-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Rend L3:</label>
            <input type="number" step="0.01" value={rendLinea3} onChange={e => setRendLinea3(Number(e.target.value))} className="text-xs border rounded-md px-2 py-1 h-9 font-bold text-indigo-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Rend L5:</label>
            <input type="number" step="0.01" value={rendLinea5} onChange={e => setRendLinea5(Number(e.target.value))} className="text-xs border rounded-md px-2 py-1 h-9 font-bold text-indigo-700" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs divide-y divide-gray-200 border-collapse">
              <thead className="bg-gray-50 uppercase text-[10px] font-bold text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left border">Línea</th>
                  <th className="px-4 py-3 text-left border">Puesto Trabajo</th>
                  <th className="px-4 py-3 text-right border">Cant ordFab</th>
                  <th className="px-4 py-3 text-right border">Cant ordPrev</th>
                  <th className="px-4 py-3 text-right border bg-indigo-50/30">Total Cant</th>
                  <th className="px-4 py-3 text-right border bg-indigo-50/30">Total Tiempo (h)</th>
                  <th className="px-4 py-3 text-right border text-blue-700 bg-blue-50/30">No. Puestos</th>
                  <th className="px-4 py-3 text-right border text-indigo-700 bg-indigo-50/30">Puestos Objetivo</th>
                  <th className="px-4 py-3 text-right border text-purple-700 bg-purple-50/30">Puestos Optimizados</th>
                  <th className="px-4 py-3 text-right border">Diferencia (±)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summaryData.length > 0 ? (() => {
                  const items: React.ReactNode[] = [];
                  const lines = [...new Set(summaryData.map(r => r.linea))];
                  lines.forEach(lineName => {
                    const rows = summaryData.filter(r => r.linea === lineName);
                    rows.forEach((r, idx) => {
                      const calculatedPuestos = Number((r.totalTiempo / horasTurno1).toFixed(2));
                      const delta = r.puestosObjetivo - calculatedPuestos;
                      
                      items.push(
                        <tr key={`${lineName}-${idx}`} className="hover:bg-gray-50 group">
                          {idx === 0 && <td rowSpan={rows.length} className="px-4 py-3 font-bold text-gray-900 border align-top bg-gray-50/30">{lineName}</td>}
                          <td className="px-4 py-3 font-medium text-gray-700 border">{r.puesto}</td>
                          <td className="px-4 py-3 text-right font-mono border">{r.cantOrdFab.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-mono border">{r.cantOrdPrev.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-bold border bg-indigo-50/5">{r.totalCantidad.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-bold border bg-indigo-50/5">{r.totalTiempo.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right font-bold border text-blue-700 bg-blue-50/5">
                            {isMounted ? calculatedPuestos.toFixed(2) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-bold border text-indigo-700 bg-indigo-50/10">
                            <span className="inline-flex items-center gap-1">
                                <Target className="w-3 h-3 opacity-50" /> {r.puestosObjetivo}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-bold border text-purple-700 bg-purple-50/10">
                            {isMounted ? r.puestosOptimizados.toFixed(2) : '-'}
                          </td>
                          <td className={cn(
                            "px-4 py-3 text-right font-bold border",
                            delta < 0 ? "text-red-600 bg-red-50" : delta > 0 ? "text-green-600 bg-green-50" : "text-gray-400"
                          )}>
                            {isMounted ? (delta > 0 ? `+${delta.toFixed(2)}` : delta.toFixed(2)) : '-'}
                          </td>
                        </tr>
                      );
                    });
                  });
                  return items;
                })() : (
                  <tr><td colSpan={10} className="px-6 py-12 text-center text-gray-400 italic">Sin datos disponibles.</td></tr>
                )}
              </tbody>
              {summaryData.length > 0 && (
                <tfoot className="bg-gray-800 text-white font-bold text-[11px]">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-right uppercase border-r border-gray-700">Total General:</td>
                    <td className="px-4 py-3 text-right font-mono border-r border-gray-700">{grandTotals.cantFab.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono border-r border-gray-700">{grandTotals.cantPrev.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono border-r border-gray-700 text-indigo-300">{grandTotals.totalCant.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono border-r border-gray-700 text-indigo-300">{grandTotals.totalTime.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-mono text-blue-300 border-r border-gray-700">
                      {isMounted ? grandTotals.totalPuestos.toFixed(2) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-indigo-300 border-r border-gray-700">
                        {grandTotals.totalObjetivo}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-purple-300 border-r border-gray-700">
                        {isMounted ? grandTotals.totalOptimizados.toFixed(2) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                        {isMounted ? (grandTotals.totalObjetivo - grandTotals.totalPuestos).toFixed(2) : '-'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </Tabs>
    </div>
  );
};