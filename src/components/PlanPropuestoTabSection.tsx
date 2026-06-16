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
  ArrowRightLeft,
  Search,
  Scale,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

interface ProposedPlanRow {
  material: string;
  descripcion: string;
  linea: string;
  cantidadOriginal: number;
  cantidadPropuesta: number;
  diferencia: number;
  tiempoTotalPropuesto: number;
  esAjustable: boolean;
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
  
  // Parámetros de Simulación (desde localStorage)
  const [programmingDate, setProgrammingDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [provisionalDate, setProvisionalDate] = useState<string>(new Date().toISOString().split('T')[0]);
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
      setFertOrders(Array.isArray(fertRes?.data) ? fertRes.data : []);
      setProvisionalOrders(Array.isArray(prevRes?.data) ? prevRes.data : []);

    } catch (err) {
      addNotification('error', `Error al cargar datos: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, selectedCenter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ALGORITMO DE BALANCEO BASADO EN TIEMPO DISPONIBLE Y MATERIALES DE BALANCEO
  const proposedPlan = useMemo((): ProposedPlanRow[] => {
    if (!technicalData.length || !selectedCenter) return [];

    // 1. Cargar Configuración de Balanceo y Puestos Editados
    const matBalanceoRaw = localStorage.getItem('material_balanceo_lineas_data');
    const matBalanceoPool = matBalanceoRaw ? JSON.parse(matBalanceoRaw) : [];
    const enabledMaterials = new Set(matBalanceoPool.filter((m: any) => m.habilitado).map((m: any) => normalizeMaterialCode(m.material)));

    const simPuestosT1 = JSON.parse(localStorage.getItem('sim_puestos_t1') || '{}');
    const simPuestosT2 = JSON.parse(localStorage.getItem('sim_puestos_t2') || '{}');
    const simHorasT1 = Number(localStorage.getItem('sim_horas_t1') || 8);
    const simHorasT2 = Number(localStorage.getItem('sim_horas_t2') || 0);

    const lineTargetHours = new Map<string, number>();
    const lineCurrentFixedHours = new Map<string, number>();
    const lineMaterials = new Map<string, { material: string, desc: string, fixedQty: number, flexQty: number, tUnit: number }[]>();

    const targetDateISO = normalizeDateISO(programmingDate);
    const prevDateISO = normalizeDateISO(provisionalDate);

    // Identificar el puesto de referencia (Armado) para determinar la capacidad de la línea
    const centerTechnical = technicalData.filter(d => String(d.Centro || '').trim() === selectedCenter);
    
    // Agrupar demandas por línea
    const allLines = ['LINEA 1', 'LINEA 2', 'LINEA 3', 'LINEA 5'];
    
    allLines.forEach(lineName => {
      const keyRef = `${selectedCenter}|${lineName}|Armado`;
      const t1 = simPuestosT1[keyRef] || 0;
      const t2 = simPuestosT2[keyRef] || 0;
      const available = (t1 * simHorasT1) + (t2 * simHorasT2);
      lineTargetHours.set(lineName, available);
    });

    // 2. Procesar todos los materiales técnicos para el centro
    centerTechnical.forEach(row => {
      const linea = String(row.Linea || '').trim().toUpperCase();
      const puesto = String(row.PuestoTrabajo || '').trim();
      const material = normalizeMaterialCode(row.CodMaterial);
      
      // Solo procesamos basado en el puesto de Armado para el cálculo de capacidad grupal
      if (puesto !== 'Armado') return;

      const matKey = `${linea}|${material}`;
      
      // Calcular demanda fija (FERT) y flexible (OrdPrev)
      let qFixed = 0;
      fertOrders.forEach(o => {
        if (normalizeDateISO(o.FECHA || o.fecha) === targetDateISO && normalizeMaterialCode(o.MATERIAL) === material && String(o.CENTRO).trim() === selectedCenter) {
          qFixed += Number(o.CANTPENDIENTE || 0);
        }
      });

      let qFlex = 0;
      provisionalOrders.forEach(o => {
        if (normalizeDateISO(o.FECHAINICIO || o.fecha_inicio) === prevDateISO && normalizeMaterialCode(o.MATERIAL || o.CodMaterial) === material && String(o.Centro).trim() === selectedCenter) {
          qFlex += Number(o.CANTIDAD || 0);
        }
      });

      const tUnit = Number(row.Tiempo_Min || 0);
      let rend = 1;
      if (linea.includes('1')) rend = rendLinea1;
      else if (linea.includes('2')) rend = rendLinea2;
      else if (linea.includes('3')) rend = rendLinea3;
      else if (linea.includes('5')) rend = rendLinea5;

      const effectiveTUnit = (tUnit / 60) * rend;

      if (!lineMaterials.has(linea)) lineMaterials.set(linea, []);
      lineMaterials.get(linea)!.push({
        material,
        desc: row.Material || row.NombreMaterial || `Material ${material}`,
        fixedQty: qFixed,
        flexQty: qFlex,
        tUnit: effectiveTUnit
      });

      lineCurrentFixedHours.set(linea, (lineCurrentFixedHours.get(linea) || 0) + (qFixed * effectiveTUnit));
    });

    // 3. Ejecutar Iteración de Balanceo
    const results: ProposedPlanRow[] = [];

    lineMaterials.forEach((mats, linea) => {
      const target = lineTargetHours.get(linea) || 0;
      const fixedHours = lineCurrentFixedHours.get(linea) || 0;
      const remainingHours = target - fixedHours;

      // Filtrar materiales de la línea que están en el pool de balanceo habilitado
      const flexPool = mats.filter(m => enabledMaterials.has(m.material));
      const totalFlexTimeAtBase = flexPool.reduce((sum, m) => sum + (m.flexQty * m.tUnit), 0);

      let scaleFactor = 1;
      if (totalFlexTimeAtBase > 0) {
        scaleFactor = remainingHours / totalFlexTimeAtBase;
      } else if (flexPool.length > 0 && remainingHours > 0) {
        // Si no hay demanda previsional pero hay materiales habilitados, repartir las horas equitativamente
        const hoursPerMat = remainingHours / flexPool.length;
        flexPool.forEach(m => { m.flexQty = 1; }); // Darle una base de 1 para que el cálculo funcione
        const newFlexTime = flexPool.reduce((sum, m) => sum + (m.flexQty * m.tUnit), 0);
        scaleFactor = remainingHours / newFlexTime;
      }

      mats.forEach(m => {
        const isAdj = enabledMaterials.has(m.material);
        const finalQty = isAdj ? Math.round(m.flexQty * scaleFactor) : 0;
        const totalQty = m.fixedQty + finalQty;

        results.push({
          material: m.material,
          descripcion: m.desc,
          linea: linea,
          cantidadOriginal: m.fixedQty + m.flexQty,
          cantidadPropuesta: totalQty,
          diferencia: totalQty - (m.fixedQty + m.flexQty),
          tiempoTotalPropuesto: totalQty * m.tUnit,
          esAjustable: isAdj
        });
      });
    });

    return results.sort((a, b) => a.linea.localeCompare(b.linea) || a.material.localeCompare(b.material));
  }, [technicalData, fertOrders, provisionalOrders, selectedCenter, programmingDate, provisionalDate, rendLinea1, rendLinea2, rendLinea3, rendLinea5]);

  const filteredResults = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return proposedPlan;
    return proposedPlan.filter(r => 
      r.material.toLowerCase().includes(q) || 
      r.descripcion.toLowerCase().includes(q)
    );
  }, [proposedPlan, searchTerm]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filteredResults.map(r => ({
      'Centro': selectedCenter,
      'Línea': r.linea,
      'Material': r.material,
      'Descripción': r.descripcion,
      'Es Ajustable (Mat Balanceo)': r.esAjustable ? 'SI' : 'NO',
      'Cant. Actual': r.cantidadOriginal,
      'Cant. PROPUESTA': r.cantidadPropuesta,
      'Diferencia': r.diferencia,
      'Tiempo Resultante (h)': Number(r.tiempoTotalPropuesto.toFixed(2))
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plan Propuesto");
    XLSX.writeFile(wb, `Plan_Optimizado_${selectedCenter}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Scale className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Plan de Producción Propuesto (Optimizado)</h3>
            <p className="text-xs text-gray-500">Balanceo de carga basado en Tiempo Disponible y Materiales Habilitados</p>
          </div>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredResults.length === 0}>
                <Download className="w-4 h-4 mr-2" /> Exportar Excel
            </Button>
            <Button variant="outline" size="sm" onClick={() => loadData()}>
                <ArrowRightLeft className="w-4 h-4 mr-2" /> Recalcular Todo
            </Button>
        </div>
      </div>

      <Tabs value={selectedCenter} onValueChange={setSelectedCenter} className="w-full">
        <TabsList className="flex h-auto bg-gray-100/50 p-1 mb-4">
          {availableCenters.map(center => (
            <TabsTrigger key={center} value={center} className="px-6 py-2 text-xs font-bold uppercase data-[state=active]:bg-white data-[state=active]:text-indigo-700">
              <Home className="w-3 h-3 mr-2" /> Centro {center}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 bg-gray-50 border rounded-xl shadow-sm mb-6">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Fecha FERT:</label>
            <input type="date" value={programmingDate} onChange={e => setProgrammingDate(e.target.value)} className="text-xs border rounded-md px-2 py-2 outline-none h-9 font-medium text-indigo-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Fecha PREV:</label>
            <input type="date" value={provisionalDate} onChange={e => setProvisionalDate(e.target.value)} className="text-xs border rounded-md px-2 py-2 outline-none h-9 font-medium text-indigo-700" />
          </div>
          <div className="flex flex-col gap-1 lg:col-span-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Búsqueda:</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input type="text" placeholder="Filtrar por código o nombre..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="text-xs border rounded-md pl-7 pr-2 py-2 outline-none h-9 w-full" />
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2 lg:col-span-2">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-[10px] text-blue-800 leading-tight">
              <b>Nota:</b> La optimización ajusta las cantidades de los materiales marcados en <b>"Mat Balanceo"</b> para alcanzar las horas disponibles configuradas en <b>"Rev Capacidad"</b>.
            </p>
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
                  <th className="px-4 py-3 text-center">Tipo</th>
                  <th className="px-4 py-3 text-right">Cant. Actual</th>
                  <th className="px-4 py-3 text-right text-indigo-700 bg-indigo-50/30">Cant. PROPUESTA</th>
                  <th className="px-4 py-3 text-right">Ajuste (±)</th>
                  <th className="px-4 py-3 text-right bg-indigo-50/30">Tiempo (h)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-500"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> Generando propuesta óptima...</td></tr>
                ) : filteredResults.length > 0 ? (() => {
                  const items: React.ReactNode[] = [];
                  const lines = [...new Set(filteredResults.map(r => r.linea))];
                  lines.forEach(lineName => {
                    const lineRows = filteredResults.filter(r => r.linea === lineName);
                    lineRows.forEach((row, idx) => {
                      items.push(
                        <tr key={`${lineName}-${row.material}-${idx}`} className={cn("hover:bg-gray-50 transition-colors", row.esAjustable && "bg-emerald-50/30")}>
                          {idx === 0 && <td rowSpan={lineRows.length} className="px-4 py-3 font-bold text-gray-900 border-r align-top bg-gray-50/10">{lineName}</td>}
                          <td className="px-4 py-3 font-mono font-medium text-gray-700">{row.material}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={row.descripcion}>{row.descripcion}</td>
                          <td className="px-4 py-3 text-center">
                            {row.esAjustable ? 
                              <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] uppercase font-bold">Ajustable</Badge> : 
                              <Badge variant="outline" className="text-[9px] uppercase font-bold opacity-50">Fijo</Badge>
                            }
                          </td>
                          <td className="px-4 py-3 text-right text-gray-400">{row.cantidadOriginal.toLocaleString()}</td>
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
                  <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-400 italic">No hay datos para optimizar con los filtros actuales.</td></tr>
                )}
              </tbody>
              {filteredResults.length > 0 && (
                <tfoot className="bg-gray-800 text-white font-bold text-[10px]">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-right uppercase border-r border-gray-700">Totales Plan Propuesto:</td>
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
