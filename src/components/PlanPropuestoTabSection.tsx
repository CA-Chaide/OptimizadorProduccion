
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
  Download,
  ArrowRightLeft,
  Search,
  Scale,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  LayoutGrid
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
  puestoTrabajo: string;
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
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  
  // Filtros Multicolumna
  const [filters, setFilters] = useState({
    linea: '',
    material: '',
    descripcion: '',
    puesto: '',
    tipo: 'ALL'
  });
  
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
      
      // Sincronizar fecha de programación desde localStorage si existe (Centro 1000)
      const savedProgDates = localStorage.getItem('sim_prog_dates');
      if (savedProgDates) {
        try {
          const parsed = JSON.parse(savedProgDates);
          if (parsed['1000']) setProgrammingDate(parsed['1000']);
        } catch(e) {}
      }

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
      setFertOrders(Array.isArray(fertRes?.data) ? fertRes.data : []);
      setProvisionalOrders(Array.isArray(prevRes?.data) ? prevRes.data : []);

    } catch (err) {
      addNotification('error', `Error al cargar datos: ${(err as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Helper para mapear líneas según categoría (L1, L2, L3, L5)
  const mapOrderLine = (order: any): string => {
    const cat = String(order.CATEGORIA || order.Categoria || '').toUpperCase();
    if (cat.includes('L1')) return 'LINEA 1';
    if (cat.includes('L2')) return 'LINEA 2';
    if (cat.includes('L3')) return 'LINEA 3';
    if (cat.includes('L5') || cat.includes('B-B')) return 'LINEA 5';
    return String(order.LINEA || order.Linea || order.linea || '').trim().toUpperCase();
  };

  // ALGORITMO DE BALANCEO MEJORADO: Filtra pedidos por línea técnica específica
  const proposedPlan = useMemo((): ProposedPlanRow[] => {
    if (!technicalData.length || !selectedCenter) return [];

    // 1. Cargar Configuración de Balanceo y Puestos Editados
    const matBalanceoRaw = typeof window !== 'undefined' ? localStorage.getItem('material_balanceo_lineas_data') : null;
    const matBalanceoPool = matBalanceoRaw ? JSON.parse(matBalanceoRaw) : [];
    const enabledMaterials = new Set(matBalanceoPool.filter((m: any) => m.habilitado).map((m: any) => normalizeMaterialCode(m.material)));

    const simPuestosT1 = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sim_puestos_t1') || '{}') : {};
    const simPuestosT2 = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sim_puestos_t2') || '{}') : {};
    const savedH1 = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sim_horas_t1_by_center') || '{}') : {};
    const savedH2 = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('sim_horas_t2_by_center') || '{}') : {};
    
    const simHorasT1 = savedH1[selectedCenter] ?? 8.75;
    const simHorasT2 = savedH2[selectedCenter] ?? 0;

    const lineTargetHours = new Map<string, number>();
    const lineCurrentFixedHours = new Map<string, number>();
    const lineMaterials = new Map<string, { material: string, desc: string, puesto: string, fixedQty: number, flexQty: number, tUnit: number }[]>();

    const targetDateISO = normalizeDateISO(programmingDate);
    const prevDateISO = normalizeDateISO(provisionalDate);

    // Mapear órdenes con sus líneas detectadas para eficiencia
    const mappedFertOrders = fertOrders.map(o => ({ ...o, _mappedLinea: mapOrderLine(o) }));
    const mappedPrevOrders = provisionalOrders.map(o => ({ ...o, _mappedLinea: mapOrderLine(o) }));

    const centerTechnical = technicalData.filter(d => String(d.Centro || '').trim() === selectedCenter);
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
      
      // Solo procesamos basado en el puesto de Armado para el cálculo de capacidad grupal y evitar repeticiones por puesto
      if (puesto !== 'Armado') return;

      // Calcular demanda fija (FERT) validando que la línea del pedido coincida con la línea técnica
      let qFixed = 0;
      mappedFertOrders.forEach(o => {
        if (normalizeDateISO(o.FECHA || o.fecha) === targetDateISO && 
            normalizeMaterialCode(o.MATERIAL) === material && 
            String(o.CENTRO).trim() === selectedCenter &&
            o._mappedLinea === linea) {
          qFixed += Number(o.CANTPENDIENTE || 0);
        }
      });

      // Calcular demanda flexible (OrdPrev) validando que la línea coincida
      let qFlex = 0;
      mappedPrevOrders.forEach(o => {
        if (normalizeDateISO(o.FECHAINICIO || o.fecha_inicio) === prevDateISO && 
            normalizeMaterialCode(o.MATERIAL || o.CodMaterial) === material && 
            String(o.Centro).trim() === selectedCenter &&
            o._mappedLinea === linea) {
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
        puesto,
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
        const newFlexTime = flexPool.reduce((sum, m) => sum + (1 * m.tUnit), 0);
        scaleFactor = remainingHours / newFlexTime;
      }

      mats.forEach(m => {
        const isAdj = enabledMaterials.has(m.material);
        const finalQty = isAdj ? Math.round((m.flexQty || 0) * scaleFactor) : 0;
        const totalQty = m.fixedQty + finalQty;

        if (totalQty > 0 || m.flexQty > 0 || m.fixedQty > 0) {
          results.push({
            material: m.material,
            descripcion: m.desc,
            linea: linea,
            puestoTrabajo: m.puesto,
            cantidadOriginal: m.fixedQty + m.flexQty,
            cantidadPropuesta: totalQty,
            diferencia: totalQty - (m.fixedQty + m.flexQty),
            tiempoTotalPropuesto: totalQty * m.tUnit,
            esAjustable: isAdj
          });
        }
      });
    });

    return results.sort((a, b) => a.linea.localeCompare(b.linea) || a.material.localeCompare(b.material));
  }, [technicalData, fertOrders, provisionalOrders, selectedCenter, programmingDate, provisionalDate, rendLinea1, rendLinea2, rendLinea3, rendLinea5]);

  // FILTRADO DINÁMICO POR COLUMNAS
  const filteredResults = useMemo(() => {
    return proposedPlan.filter(r => {
      const matchLinea = filters.linea === '' || r.linea.toLowerCase().includes(filters.linea.toLowerCase());
      const matchMaterial = filters.material === '' || r.material.toLowerCase().includes(filters.material.toLowerCase());
      const matchDesc = filters.descripcion === '' || r.descripcion.toLowerCase().includes(filters.descripcion.toLowerCase());
      const matchPuesto = filters.puesto === '' || r.puestoTrabajo.toLowerCase().includes(filters.puesto.toLowerCase());
      const matchTipo = filters.tipo === 'ALL' || (filters.tipo === 'ADJ' ? r.esAjustable : !r.esAjustable);

      return matchLinea && matchMaterial && matchDesc && matchPuesto && matchTipo;
    });
  }, [proposedPlan, filters]);

  // TOTALES DINÁMICOS BASADOS EN FILTRO
  const grandTotals = useMemo(() => {
    return filteredResults.reduce((acc, r) => ({
      totalCantActual: acc.totalCantActual + r.cantidadOriginal,
      totalCantPropuesta: acc.totalCantPropuesta + r.cantidadPropuesta,
      totalDiferencia: acc.totalDiferencia + r.diferencia,
      totalTime: acc.totalTime + r.tiempoTotalPropuesto,
    }), { totalCantActual: 0, totalCantPropuesta: 0, totalDiferencia: 0, totalTime: 0 });
  }, [filteredResults]);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(filteredResults.length / rowsPerPage));
  const paginatedResults = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredResults.slice(start, start + rowsPerPage);
  }, [filteredResults, currentPage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, selectedCenter, rowsPerPage]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filteredResults.map(r => ({
      'Centro': selectedCenter,
      'Línea': r.linea,
      'Puesto Trabajo': r.puestoTrabajo,
      'Material': r.material,
      'Descripción': r.descripcion,
      'Es Ajustable (Mat Balanceo)': r.esAjustable ? 'SI' : 'NO',
      'Cant. Actual': r.cantidadOriginal,
      'Cant. PROPUESTA': r.cantidadPropuesta,
      'Diferencia (±)': r.diferencia,
      'Tiempo Resultante (h)': Number(r.tiempoTotalPropuesto.toFixed(2))
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plan Propuesto");
    XLSX.writeFile(wb, `Plan_Optimizado_${selectedCenter}.xlsx`);
  };

  const handleFilterChange = (field: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const clearAllFilters = () => {
    setFilters({
      linea: '',
      material: '',
      descripcion: '',
      puesto: '',
      tipo: 'ALL'
    });
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Scale className="w-6 h-6 text-green-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Plan de Producción Propuesto (Optimizado)</h3>
            <p className="text-xs text-gray-500">Ajuste dinámico de cantidades basado en carga de tiempo objetivo</p>
          </div>
        </div>
        <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={filteredResults.length === 0} className="border-green-200 text-green-700 bg-green-50 hover:bg-green-100">
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

        <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4 p-4 bg-gray-50 border rounded-xl shadow-sm mb-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Fecha FERT:</label>
            <input type="date" value={programmingDate} onChange={e => setProgrammingDate(e.target.value)} className="text-xs border rounded-md px-2 py-2 outline-none h-9 font-medium text-indigo-700" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-400 uppercase ml-1">Fecha PREV:</label>
            <input type="date" value={provisionalDate} onChange={e => setProvisionalDate(e.target.value)} className="text-xs border rounded-md px-2 py-2 outline-none h-9 font-medium text-indigo-700" />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex items-center gap-2 lg:col-span-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div className="text-[10px] text-blue-800 leading-tight">
              <p><b>Balanceo Automático:</b> El sistema ajusta las cantidades de materiales <b>Ajustables</b> para que el Tiempo Total coincida con el Tiempo Disponible configurado.</p>
              <p className="mt-0.5">Los totales al pie de la tabla se actualizan según los filtros aplicados.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs divide-y divide-gray-200 border-collapse">
              <thead className="bg-gray-50 uppercase text-[10px] font-bold text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left border-b">Línea</th>
                  <th className="px-4 py-3 text-left border-b">Material</th>
                  <th className="px-4 py-3 text-left border-b">Descripción</th>
                  <th className="px-4 py-3 text-left border-b">Puesto Trabajo</th>
                  <th className="px-4 py-3 text-center border-b">Tipo</th>
                  <th className="px-4 py-3 text-right border-b">Cant. Actual</th>
                  <th className="px-4 py-3 text-right text-indigo-700 bg-indigo-50/30 border-b">Cant. PROPUESTA</th>
                  <th className="px-4 py-3 text-right border-b">Ajuste (±)</th>
                  <th className="px-4 py-3 text-right bg-indigo-50/30 border-b">Tiempo (h)</th>
                </tr>
                <tr className="bg-white">
                  <th className="px-2 py-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-1.5 h-3 w-3 text-gray-400" />
                      <input 
                        type="text" 
                        value={filters.linea} 
                        onChange={e => handleFilterChange('linea', e.target.value)}
                        placeholder="Filtrar..." 
                        className="w-full pl-6 pr-1 py-1 text-[10px] border rounded font-normal lowercase outline-none focus:ring-1 focus:ring-indigo-500" 
                      />
                    </div>
                  </th>
                  <th className="px-2 py-2 border-b">
                    <input 
                      type="text" 
                      value={filters.material} 
                      onChange={e => handleFilterChange('material', e.target.value)}
                      placeholder="Cod..." 
                      className="w-full px-2 py-1 text-[10px] border rounded font-normal lowercase outline-none focus:ring-1 focus:ring-indigo-500" 
                    />
                  </th>
                  <th className="px-2 py-2 border-b">
                    <input 
                      type="text" 
                      value={filters.descripcion} 
                      onChange={e => handleFilterChange('descripcion', e.target.value)}
                      placeholder="Buscar desc..." 
                      className="w-full px-2 py-1 text-[10px] border rounded font-normal lowercase outline-none focus:ring-1 focus:ring-indigo-500" 
                    />
                  </th>
                  <th className="px-2 py-2 border-b">
                    <input 
                      type="text" 
                      value={filters.puesto} 
                      onChange={e => handleFilterChange('puesto', e.target.value)}
                      placeholder="Puesto..." 
                      className="w-full px-2 py-1 text-[10px] border rounded font-normal lowercase outline-none focus:ring-1 focus:ring-indigo-500" 
                    />
                  </th>
                  <th className="px-2 py-2 border-b">
                    <select 
                      value={filters.tipo} 
                      onChange={e => handleFilterChange('tipo', e.target.value)}
                      className="w-full px-1 py-1 text-[9px] border rounded font-bold outline-none"
                    >
                      <option value="ALL">TODOS</option>
                      <option value="ADJ">AJUSTABLE</option>
                      <option value="FIX">FIJO</option>
                    </select>
                  </th>
                  <th className="px-2 py-2 border-b text-center" colSpan={4}>
                    <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-6 text-[9px] text-red-500 hover:text-red-700 hover:bg-red-50 font-bold uppercase p-0">
                      <X className="w-3 h-3 mr-1" /> Limpiar Filtros
                    </Button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr><td colSpan={9} className="px-6 py-12 text-center text-gray-500"><Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" /> Calculando propuesta óptima...</td></tr>
                ) : filteredResults.length > 0 ? (() => {
                  const rows: React.ReactNode[] = [];
                  let lastLine = "";

                  paginatedResults.forEach((row, idx) => {
                    const isNewLine = row.linea !== lastLine;
                    if (isNewLine) {
                      rows.push(
                        <tr key={`header-${row.linea}`} className="bg-gray-50/80">
                          <td colSpan={9} className="px-4 py-1.5 font-bold text-indigo-900 border-b border-t text-[11px] uppercase tracking-wide flex items-center gap-2">
                            <LayoutGrid className="w-3.5 h-3.5 opacity-50" /> {row.linea}
                          </td>
                        </tr>
                      );
                      lastLine = row.linea;
                    }

                    rows.push(
                      <tr key={`${row.linea}-${row.material}-${idx}`} className={cn("hover:bg-gray-50 transition-colors", row.esAjustable && "bg-emerald-50/10")}>
                        <td className="px-4 py-2.5 text-gray-400 font-medium italic">{row.linea}</td>
                        <td className="px-4 py-2.5 font-mono font-bold text-gray-700">{row.material}</td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-xs truncate" title={row.descripcion}>{row.descripcion}</td>
                        <td className="px-4 py-2.5 text-gray-500 font-medium">{row.puestoTrabajo}</td>
                        <td className="px-4 py-2.5 text-center">
                          {row.esAjustable ? 
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[9px] uppercase font-bold px-1.5">Ajustable</Badge> : 
                            <Badge variant="outline" className="text-[9px] uppercase font-bold px-1.5 opacity-30 border-gray-300">Fijo</Badge>
                          }
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-400 font-mono">{row.cantidadOriginal.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right font-bold text-indigo-700 bg-indigo-50/5 font-mono">{row.cantidadPropuesta.toLocaleString()}</td>
                        <td className={`px-4 py-2.5 text-right font-bold font-mono ${row.diferencia > 0 ? 'text-green-600' : row.diferencia < 0 ? 'text-red-600' : 'text-gray-300'}`}>
                          {row.diferencia > 0 ? `+${row.diferencia.toLocaleString()}` : row.diferencia.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-800 bg-indigo-50/5">{row.tiempoTotalPropuesto.toFixed(2)}h</td>
                      </tr>
                    );
                  });
                  return rows;
                })() : (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-400 italic">
                      <div className="flex flex-col items-center gap-2">
                        <Filter className="w-8 h-8 text-gray-200" />
                        <span>No hay datos que coincidan con los filtros aplicados en el Centro {selectedCenter}.</span>
                        <Button variant="link" size="sm" onClick={clearAllFilters} className="text-indigo-600 font-bold">Quitar todos los filtros</Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredResults.length > 0 && (
                <tfoot className="bg-gray-800 text-white font-bold text-[10px] sticky bottom-0">
                  <tr>
                    <td colSpan={5} className="px-4 py-3 text-right uppercase border-r border-gray-700">Totales Filtrados ({filteredResults.length} regs):</td>
                    <td className="px-4 py-3 text-right border-r border-gray-700 font-mono">{grandTotals.totalCantActual.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-indigo-300 border-r border-gray-700 font-mono">{grandTotals.totalCantPropuesta.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right border-r border-gray-700 font-mono">
                      {grandTotals.totalDiferencia > 0 ? `+${grandTotals.totalDiferencia.toLocaleString()}` : grandTotals.totalDiferencia.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-emerald-300 font-mono">{grandTotals.totalTime.toFixed(2)}h</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-4 px-2 py-2 bg-gray-50 border rounded-lg">
            <div className="flex items-center gap-4 text-[10px]">
              <span className="font-bold text-gray-400 uppercase">Mostrar:</span>
              <select
                value={rowsPerPage}
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="border rounded p-1 bg-white text-gray-700 font-bold outline-none"
              >
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
              </select>
              <span className="text-gray-400 font-bold">
                Pág. {currentPage} de {totalPages} | Total {filteredResults.length} registros
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                disabled={currentPage === 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = currentPage;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "ghost"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className="h-8 w-8 p-0 text-xs font-bold"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setCurrentPage(p => Math.min(totalPagesLocal, p + 1))} 
                disabled={currentPage === totalPagesLocal}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Tabs>

      {/* Botón Flotante para Aplicar Plan */}
      <div className="fixed bottom-10 right-10 z-[100]">
        <Button 
          size="lg" 
          className="bg-green-600 hover:bg-green-700 text-white rounded-full h-16 w-16 shadow-2xl flex items-center justify-center border-2 border-white transition-all hover:scale-110 active:scale-95"
          onClick={() => addNotification('success', 'Plan propuesto aplicado correctamente (simulado).')}
          title="Aplicar Plan Propuesto"
        >
          <CheckCircle2 className="w-8 h-8" />
        </Button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-3 mt-4">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-blue-800 space-y-1">
          <p><b>Asignación Técnica:</b> El sistema ahora vincula los pedidos únicamente a las líneas de fabricación definidas para cada material en el maestro de tiempos.</p>
          <p><b>Balanceo Automático:</b> El ajuste de cantidades se aplica sobre los materiales <b>Ajustables</b> para que la carga horaria total no exceda la capacidad definida en Rev Capacidad.</p>
        </div>
      </div>
    </div>
  );
};
