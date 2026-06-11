
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { 
  CheckCircle2, 
  Loader2, 
  Home, 
  Calendar as CalendarIcon, 
  Download,
  AlertCircle,
  ArrowRightLeft,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from '@/components/ui/input';
import * as XLSX from 'xlsx';

interface ProposedPlanRow {
  material: string;
  descripcion: string;
  linea: string;
  cantidadOriginal: number;
  cantidadPropuesta: number;
  diferencia: number;
  tiempoTotalPropuesto: number;
}

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

export const PlanPropuestoTabSection: React.FC = () => {
  const inspector = useRuntimeInspector('PlanPropuestoTab');
  const { addNotification } = useAppContext();

  // Estados de Datos
  const [technicalData, setTechnicalData] = useState<any[]>([]);
  const [fertOrders, setFertOrders] = useState<any[]>([]);
  const [provisionalOrders, setProvisionalOrders] = useState<any[]>([]);
  const [availableCenters, setAvailableCenters] = useState<string[]>([]);
  const [selectedCenter, setSelectedCenter] = useState<string>("1000");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filtros de Configuración
  const [programmingDate, setProgrammingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [provisionalDate, setProvisionalDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [horasTurno1, setHorasTurno1] = useState<number>(8);
  const [rendLinea1, setRendLinea1] = useState<number>(1.05);
  const [rendLinea2, setRendLinea2] = useState<number>(1.08);
  const [rendLinea3, setRendLinea3] = useState<number>(1.05);
  const [rendLinea5, setRendLinea5] = useState<number>(1.05);

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

      // Cargar Tiempos de Ensamblado (Misma fuente que Prog Tiempos)
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

      // Cargar y mapear FERT (Misma lógica que Prog Tiempos)
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

      // Cargar y mapear PREVISIONALES (Misma lógica que Prog Tiempos)
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

  // MAPAS DE AGREGACIÓN DE DEMANDA (IDÉNTICOS A PROG TIEMPOS)
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

  // ALGORITMO DE OPTIMIZACIÓN BASADO EXCLUSIVAMENTE EN DATOS TÉCNICOS Y DEMANDA AGREGADA
  const proposedPlan = useMemo((): ProposedPlanRow[] => {
    if (!technicalData.length || !selectedCenter) return [];

    const materialDemands = new Map<string, { material: string, descripcion: string, linea: string, qty: number, tUnit: number }>();
    const lineLoad = new Map<string, { currentHours: number, targetHours: number }>();

    // Filtrar técnicos por centro
    const centerTechnical = technicalData.filter(d => String(d.Centro || '').trim() === selectedCenter);
    
    // Identificar el puesto de referencia para cada línea
    const lineRefWorkstation: Record<string, string> = {
      'LINEA 1': 'Armado',
      'LINEA 2': 'Armado',
      'LINEA 3': 'Armado',
      'LINEA 5': 'Armado'
    };

    // Iterar sobre los materiales de la pestaña técnica
    centerTechnical.forEach(row => {
      const linea = String(row.Linea || '').trim().toUpperCase();
      const puesto = String(row.PuestoTrabajo || '').trim();
      const material = normalizeMaterialCode(row.CodMaterial);
      
      // Solo nos interesa el puesto de referencia para el cálculo de capacidad
      if (puesto !== lineRefWorkstation[linea]) return;

      const matKey = `${linea}|${material}`;
      
      // Obtener demanda agregada (FERT + PREV)
      const qFab = fertSumMap.get(matKey) || 0;
      const qPrev = prevSumMap.get(matKey) || 0;
      const totalQty = qFab + qPrev;

      if (totalQty <= 0) return;

      const tUnit = Number(row.Tiempo_Min || 0);
      let rend = 1;
      if (linea.includes('1')) rend = rendLinea1;
      else if (linea.includes('2')) rend = rendLinea2;
      else if (linea.includes('3')) rend = rendLinea3;
      else if (linea.includes('5')) rend = rendLinea5;

      const hours = ((totalQty * tUnit) / 60) * rend;

      materialDemands.set(matKey, {
        material,
        descripcion: row.Material || row.NombreMaterial || `Material ${material}`,
        linea,
        qty: totalQty,
        tUnit
      });

      // Acumular carga de la línea
      const current = lineLoad.get(linea) || { currentHours: 0, targetHours: 0 };
      current.currentHours += hours;
      current.targetHours = (RESTRICCIONES_PUESTOS[`${linea}|${puesto}`] || 0) * horasTurno1;
      lineLoad.set(linea, current);
    });

    // 2. Aplicar iteración de balanceo: Cantidad PROPUESTA = Cantidad Original * (Horas Objetivo / Horas Actuales)
    const results: ProposedPlanRow[] = [];

    materialDemands.forEach((data, key) => {
      const [linea] = key.split('|');
      const load = lineLoad.get(linea);
      
      let factor = 1;
      if (load && load.currentHours > 0) {
        factor = load.targetHours / load.currentHours;
      }

      const proposedQty = Math.round(data.qty * factor);
      
      let rend = 1;
      if (linea.includes('1')) rend = rendLinea1;
      else if (linea.includes('2')) rend = rendLinea2;
      else if (linea.includes('3')) rend = rendLinea3;
      else if (linea.includes('5')) rend = rendLinea5;

      results.push({
        material: data.material,
        descripcion: data.descripcion,
        linea: data.linea,
        cantidadOriginal: data.qty,
        cantidadPropuesta: proposedQty,
        diferencia: proposedQty - data.qty,
        tiempoTotalPropuesto: ((proposedQty * data.tUnit) / 60) * rend
      });
    });

    return results.sort((a, b) => a.linea.localeCompare(b.linea) || a.material.localeCompare(b.material));
  }, [technicalData, fertSumMap, prevSumMap, selectedCenter, programmingDate, provisionalDate, horasTurno1, rendLinea1, rendLinea2, rendLinea3, rendLinea5]);

  const filteredResults = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return proposedPlan;
    return proposedPlan.filter(r => 
      r.material.toLowerCase().includes(q) || 
      r.descripcion.toLowerCase().includes(q) ||
      r.linea.toLowerCase().includes(q)
    );
  }, [proposedPlan, searchTerm]);

  const handleExport = () => {
    const dataToExport = filteredResults.map(r => ({
      'Centro': selectedCenter,
      'Línea': r.linea,
      'Código Material': r.material,
      'Descripción': r.descripcion,
      'Cant. Original': r.cantidadOriginal,
      'Cant. PROPUESTA': r.cantidadPropuesta,
      'Diferencia (±)': r.diferencia,
      'Tiempo Estimado (h)': Number(r.tiempoTotalPropuesto.toFixed(2))
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plan Propuesto");
    XLSX.writeFile(wb, `Plan_Propuesto_${selectedCenter}_${programmingDate}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Propuesta de Producción Óptima</h3>
            <p className="text-xs text-gray-500">Basado estrictamente en la matriz técnica y demanda agregada</p>
          </div>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredResults.length === 0}>
                <Download className="w-4 h-4 mr-2" /> Exportar Plan
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setFertOrders([]); setProvisionalOrders([]); loadData(); }}>
                <ArrowRightLeft className="w-4 h-4 mr-2" /> Recalcular
            </Button>
        </div>
      </div>

      <Tabs value={selectedCenter} onValueChange={setSelectedCenter} className="w-full">
        <TabsList className="flex h-auto bg-gray-100/50 p-1 mb-4">
          {availableCenters.map(center => (
            <TabsTrigger key={center} value={center} className="px-6 py-2 text-xs font-bold uppercase tracking-wider data-[state=active]:bg-white data-[state=active]:text-indigo-700">
              <Home className="w-3 h-3 mr-2" /> Centro {center}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4 p-4 bg-gray-50 border rounded-xl shadow-sm mb-6">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">FERT (Prog):</label>
            <input type="date" value={programmingDate} onChange={e => setProgrammingDate(e.target.value)} className="text-xs border rounded-md px-2 py-2 outline-none h-9 font-medium text-indigo-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Prev (Fecha):</label>
            <input type="date" value={provisionalDate} onChange={e => setProvisionalDate(e.target.value)} className="text-xs border rounded-md px-2 py-2 outline-none h-9 font-medium text-indigo-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Horas T1:</label>
            <select value={horasTurno1} onChange={e => setHorasTurno1(Number(e.target.value))} className="text-xs border rounded-md px-2 py-1 h-9 font-bold text-indigo-700">
              {Array.from({ length: 9 }, (_, i) => i + 4).map(h => <option key={`t1-${h}`} value={h}>{h}</option>)}
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
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Búsqueda:</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input type="text" placeholder="Filtrar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="text-xs border rounded-md pl-7 pr-2 py-2 outline-none h-9 w-full" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs divide-y divide-gray-200">
              <thead className="bg-gray-50 uppercase text-[10px] font-bold text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">Línea</th>
                  <th className="px-4 py-3 text-left">Material</th>
                  <th className="px-4 py-3 text-left">Descripción</th>
                  <th className="px-4 py-3 text-right">Cant. Original</th>
                  <th className="px-4 py-3 text-right text-indigo-700 bg-indigo-50/30">Cant. PROPUESTA</th>
                  <th className="px-4 py-3 text-right">Diferencia</th>
                  <th className="px-4 py-3 text-right bg-indigo-50/30">Tiempo Est. (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> Calculando propuesta óptima...</td></tr>
                ) : filteredResults.length > 0 ? (() => {
                  const items: React.ReactNode[] = [];
                  const lines = [...new Set(filteredResults.map(r => r.linea))];
                  lines.forEach(lineName => {
                    const lineRows = filteredResults.filter(r => r.linea === lineName);
                    lineRows.forEach((row, idx) => {
                      items.push(
                        <tr key={`${lineName}-${row.material}-${idx}`} className="hover:bg-gray-50">
                          {idx === 0 && <td rowSpan={lineRows.length} className="px-4 py-3 font-bold text-gray-900 border-r align-top bg-gray-50/10">{lineName}</td>}
                          <td className="px-4 py-3 font-mono font-medium text-gray-700">{row.material}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={row.descripcion}>{row.descripcion}</td>
                          <td className="px-4 py-3 text-right text-gray-400 line-through">{row.cantidadOriginal.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right font-bold text-indigo-700 bg-indigo-50/5">{row.cantidadPropuesta.toLocaleString()}</td>
                          <td className={`px-4 py-3 text-right font-medium ${row.diferencia > 0 ? 'text-green-600' : row.diferencia < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                            {row.diferencia > 0 ? `+${row.diferencia.toLocaleString()}` : row.diferencia.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-indigo-800 bg-indigo-50/5">{row.tiempoTotalPropuesto.toFixed(2)}h</td>
                        </tr>
                      );
                    });
                  });
                  return items;
                })() : (
                  <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-400 italic">No hay demanda activa que coincida con la matriz técnica para este centro y fechas.</td></tr>
                )}
              </tbody>
              {filteredResults.length > 0 && (
                <tfoot className="bg-gray-800 text-white font-bold text-[10px]">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right uppercase border-r border-gray-700">Totales Propuesta:</td>
                    <td className="px-4 py-3 text-right border-r border-gray-700">{filteredResults.reduce((sum, r) => sum + r.cantidadOriginal, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-indigo-300 border-r border-gray-700">{filteredResults.reduce((sum, r) => sum + r.cantidadPropuesta, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right border-r border-gray-700">{filteredResults.reduce((sum, r) => sum + r.diferencia, 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-indigo-300">{filteredResults.reduce((sum, r) => sum + r.tiempoTotalPropuesto, 0).toFixed(2)}h</td>
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
