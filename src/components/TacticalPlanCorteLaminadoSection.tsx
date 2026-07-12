
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Scissors,
  Package,
  Loader2,
  LayoutDashboard,
  RefreshCw,
  Database,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Info,
  ShoppingCart,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  AlertCircle,
  ClipboardList,
  Download,
  Boxes
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { planGrupoService } from '@/services/plangrupo.service';
import { detalleTacticoService } from '@/services/detalletactico.service';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { MaestroMaterialesExplosionSection } from './MaestroMaterialesExplosionSection';

// --- CONSTANTES TÉCNICAS PLANTA ---
const BLOCK_SIZE = 40;
const SETUP_TIME_PER_RUN = 128; // 128 minutos de preparación por cada bloque físico
// Proceso "lámina convoluted": 1 lámina base pasada por el proceso alterno (otra máquina) devuelve
// 2 láminas CONV de menor espesor del mismo recorrido. La necesidad/plan de la variante CONV se
// deriva multiplicando por este factor la de su lámina base, en vez de calcularse por participación propia.
const CONV_SPLIT_FACTOR = 2;

const isConvDescripcion = (desc: string): boolean => {
  const u = desc.toUpperCase();
  return u.includes('CONV') || u.includes('CV');
};

interface UnifiedNeedRow {
  material: string;
  descripcion: string;
  densidad: string;
  altura: number;
  espesor: number;
  distancia: number;
  peso: number;
  consumoKg: number;
  consumoUn: number;
  nroRollos: number;
  consumoKgHalb: number;
  nroRollosHalb: number;
  totalConsumoKg: number; 
  totalNroRollos: number; 
  stock1006: number;
  stock1008: number;
  stock1015: number;
  stockUN1006: number;
  stockUN1008: number;
  stockUN1015: number;
  totalStockKg: number;
  totalStockUN: number;
  looperPesoUN: number;
  looperDensidad: string;
  looperEspesor: number;
  looperTRolloMin: number;
  apertura: string;
  porcentajeNecesidad: number;
  planUn: number;
  planKg: number;
  tProceso: number; 
  hasDeficit: boolean;
  unidades: number;
  bomParentMaterial?: string; // Solo en variantes CONV: código de la lámina base (BOM) de la que se producen; permite anidarlas y agruparlas en el mismo bloque de corridas
}

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const getProp = (obj: any, keys: string[]): string => {
  if (!obj) return '';
  const rowKeys = Object.keys(obj);
  for (const k of keys) {
    const found = rowKeys.find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
    if (found) return String(obj[found]).trim();
  }
  return '';
};

const parseDimensionsEnhanced = (desc: string) => {
  const d = desc.toUpperCase();
  const densMatch = d.match(/D-?\s*(\d+(?:\.\d+)?(?:\s*[A-Z]+)*)/);
  const densidad = densMatch ? densMatch[1].trim() : '—';

  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
  const alturaOriginal = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const espesor = dimMatch ? parseFloat(dimMatch[2]) : 0;
  
  let alturaFinal = alturaOriginal;
  if (alturaOriginal === 204 && espesor <= 1.2) {
    alturaFinal = 206;
  }
  
  let distancia = 100; 
  if (espesor === 1.0) distancia = 110;
  else if (espesor === 3.5) distancia = 60;
  else if (espesor === 1.2) distancia = 100;
  
  return { densidad, distancia, altura: alturaFinal, espesor };
};

const extractAperture = (desc: string): string => {
  const d = String(desc || '').toUpperCase();
  const match = d.match(/(194\.5|200|206|214|219|228|244)/);
  if (match) return match[0];
  return '—';
};

const getDensityColor = (dens: string) => {
  const d = dens.toLowerCase();
  if (d.includes('15')) return 'border-l-blue-600 bg-blue-50 text-blue-900';
  if (d.includes('18')) return 'border-l-emerald-600 bg-emerald-50 text-emerald-900';
  if (d.includes('20')) return 'border-l-purple-600 bg-purple-50 text-purple-900';
  if (d.includes('22') || d.includes('23')) return 'border-l-amber-600 bg-amber-50 text-amber-900';
  if (d.includes('25')) return 'border-l-pink-600 bg-pink-50 text-pink-900';
  if (d.includes('26')) return 'border-l-teal-600 bg-teal-50 text-teal-900';
  if (d.includes('30')) return 'border-l-orange-600 bg-orange-50 text-orange-900';
  return 'border-l-slate-400 bg-slate-50 text-slate-900';
};

const formatNum = (val: any, decimals: number = 2): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

interface NecesidadPlantaRow {
  codigo_material: number;
  cantidad_produccion_neta: string;
  fecha_inicio: string;
}

// Cantidad viene como texto desde DetalleTactico (p.ej. "120.5000"); se limpia igual que en
// el tab homólogo de Corte Espuma para poder sumarla de forma segura en el resumen consolidado.
const parseQty = (val: any): number => {
  const n = Number(String(val || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

interface AlmacenBreakdown {
  nombre: string;
  cantidad: number;
  nroLineas: number;
  porcentaje: number;
}

interface MaterialSummaryRow {
  codigo_material: number;
  cantidadTotal: number;
  nroLineas: number;
  almacenes: AlmacenBreakdown[];
}

// Resumen consolidado: en la tabla cruda un mismo código de material aparece repetido en
// varias líneas (una por cada PlanGrupo/fecha) con cantidades distintas. Este bloque agrupa
// por material y suma la cantidad de producción neta para dar una sola cifra por material.
// El desglose por almacén (área ALMACEN_CONSUMO) se calcula aparte y sólo se muestra al expandir.
const MaterialSummaryTable: React.FC<{ data: Record<string, NecesidadPlantaRow[]> }> = ({ data }) => {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [expandedMaterials, setExpandedMaterials] = useState<Set<number>>(new Set());

  const summary = useMemo(() => {
    const map = new Map<number, { codigo_material: number; cantidadTotal: number; nroLineas: number; almacenes: Map<string, { cantidad: number; nroLineas: number }> }>();
    Object.entries(data).forEach(([almacen, rows]) => {
      rows.forEach(row => {
        const cod = row.codigo_material;
        if (!map.has(cod)) map.set(cod, { codigo_material: cod, cantidadTotal: 0, nroLineas: 0, almacenes: new Map() });
        const entry = map.get(cod)!;
        const qty = parseQty(row.cantidad_produccion_neta);
        entry.cantidadTotal += qty;
        entry.nroLineas += 1;
        if (!entry.almacenes.has(almacen)) entry.almacenes.set(almacen, { cantidad: 0, nroLineas: 0 });
        const almEntry = entry.almacenes.get(almacen)!;
        almEntry.cantidad += qty;
        almEntry.nroLineas += 1;
      });
    });
    return Array.from(map.values())
      .map((entry): MaterialSummaryRow => ({
        codigo_material: entry.codigo_material,
        cantidadTotal: entry.cantidadTotal,
        nroLineas: entry.nroLineas,
        // % de participación por almacén = cantidad consumida por ese almacén / cantidad total del material.
        // (No se usa el conteo de líneas: un almacén con 1 línea de 962 y otro con 1 línea de 0.32
        // no participan por igual, aunque ambos tengan el mismo número de ítems).
        almacenes: Array.from(entry.almacenes.entries())
          .map(([nombre, v]) => ({
            nombre,
            cantidad: v.cantidad,
            nroLineas: v.nroLineas,
            porcentaje: entry.cantidadTotal > 0 ? (v.cantidad / entry.cantidadTotal) * 100 : 0
          }))
          .sort((a, b) => b.cantidad - a.cantidad)
      }))
      .sort((a, b) => b.cantidadTotal - a.cantidadTotal);
  }, [data]);

  useEffect(() => { setPage(1); }, [summary]);

  const totalPages = Math.max(1, Math.ceil(summary.length / pageSize));
  const paginated = useMemo(() => summary.slice((page - 1) * pageSize, page * pageSize), [summary, page]);

  const toggleMaterial = (cod: number) => {
    setExpandedMaterials(prev => {
      const next = new Set(prev);
      if (next.has(cod)) { next.delete(cod); } else { next.add(cod); }
      return next;
    });
  };

  return (
    <div className="space-y-4 text-left">
      <h3 className="text-xs font-black uppercase text-slate-800 tracking-widest flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> Resumen Consolidado por Material ({summary.length})
      </h3>
      <div className="border border-slate-100 rounded-[2.5rem] overflow-hidden bg-white shadow-xl">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-center border-collapse text-[10px]">
            <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter sticky top-0 z-20 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 border-r border-white/5 text-left">Código Material</th>
                <th className="px-6 py-4 border-r border-white/5 font-black text-yellow-400">Cantidad Total Consumo</th>
                <th className="px-6 py-4 border-r border-white/5">Nro. Líneas</th>
                <th className="px-6 py-4 text-left">Almacenes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
              {paginated.length === 0 ? (
                <tr><td colSpan={4} className="py-16 text-slate-300 uppercase font-black tracking-widest italic opacity-50 text-center">Sin registros</td></tr>
              ) : paginated.map((row) => {
                const isExp = expandedMaterials.has(row.codigo_material);
                const almacenNames = row.almacenes.map(a => a.nombre).join(', ');
                return (
                  <React.Fragment key={row.codigo_material}>
                    <tr onClick={() => toggleMaterial(row.codigo_material)} className="hover:bg-slate-50 transition-colors font-mono text-[10px] cursor-pointer">
                      <td className="px-6 py-3 border-r border-slate-50 text-left text-indigo-600 font-black">
                        <span className="inline-flex items-center gap-2">
                          {isExp ? <Minus className="w-3 h-3 text-red-500 shrink-0" /> : <Plus className="w-3 h-3 text-indigo-500 shrink-0" />}
                          {row.codigo_material}
                        </span>
                      </td>
                      <td className="px-6 py-3 border-r border-slate-50 text-slate-900 font-black bg-yellow-500/5">{row.cantidadTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-3 border-r border-slate-50 text-slate-500">{row.nroLineas}</td>
                      <td className="px-6 py-3 text-left text-slate-400 truncate max-w-[280px]" title={almacenNames}>{almacenNames}</td>
                    </tr>
                    {isExp && (
                      <tr>
                        <td colSpan={4} className="p-0 bg-slate-50/60 border-b border-slate-100">
                          <div className="px-6 py-4">
                            <table className="w-full text-center border-collapse text-[9px]">
                              <thead>
                                <tr className="bg-slate-800 text-white uppercase font-black tracking-tighter">
                                  <th className="px-4 py-2 border-r border-white/10 text-left">Almacén</th>
                                  <th className="px-4 py-2 border-r border-white/10">Cantidad</th>
                                  <th className="px-4 py-2 border-r border-white/10">Nro. Ítems</th>
                                  <th className="px-4 py-2">% Participación</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200 font-bold text-slate-700 bg-white">
                                {row.almacenes.map(alm => (
                                  <tr key={alm.nombre}>
                                    <td className="px-4 py-2 border-r border-slate-100 text-left uppercase">{alm.nombre}</td>
                                    <td className="px-4 py-2 border-r border-slate-100 font-mono">{alm.cantidad.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                    <td className="px-4 py-2 border-r border-slate-100 font-mono">{alm.nroLineas}</td>
                                    <td className="px-4 py-2 font-mono">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(alm.porcentaje, 100)}%` }} /></div>
                                        <span className="w-12 text-right">{alm.porcentaje.toFixed(1)}%</span>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-2">
          <button onClick={() => setPage(1)} disabled={page === 1} className="p-2 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Primera página"><ChevronsLeft className="w-4 h-4" /></button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Página anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span className="min-w-[90px] text-center text-[10px] font-black uppercase text-slate-500">Página {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="p-2 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Página siguiente"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="p-2 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors" title="Última página"><ChevronsRight className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
};

export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [kpiLooperData, setKpiLooperData] = useState<any[]>([]);
  const [inventarioSAP, setInventarioSAP] = useState<any[]>([]);
  const [operadoresLaminado, setOperadoresLaminado] = useState<any[]>([]);
  const [mantenimientosSAP, setMantenimientosSAP] = useState<any[]>([]);
  const [, setIsLoading] = useState(true);
  const [necesidadesPlantaData, setNecesidadesPlantaData] = useState<Record<string, NecesidadPlantaRow[]>>({});
  const [necesidadesPlantaLoading, setNecesidadesPlantaLoading] = useState(false);

  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState<Date>(new Date()); 
  
  const [unifiedNeeds, setUnifiedNeeds] = useState<UnifiedNeedRow[]>([]);
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  
  const [planManualOverrides, setPlanOverrides] = useState<Record<string, number>>({});

  const [corridaFechas, setCorridaFechas] = useState<Record<string, string>>({});

  const [assignedPersonnel, setAssignedPersonnel] = useState({
    diaOp1: '',
    diaOp2: '',
    nocheOp1: '',
    nocheOp2: ''
  });

  const [selectedDiaShift, setSelectedDiaShift] = useState('H1');
  const [selectedNocheShift, setSelectedNocheShift] = useState('EMPTY');

  const diaShiftOptions = [
    { v: 'EMPTY', l: 'VACÍO', h: 0 },
    { v: 'H1', l: '07:00 - 15:45', h: 8.75 },
    { v: 'H2', l: '07:00 - 17:00', h: 10 },
    { v: 'H3', l: '07:00 - 18:00', h: 11 },
    { v: 'H4', l: '07:00 - 19:00', h: 12 }
  ];

  const nocheShiftOptions = [
    { v: 'EMPTY', l: 'VACÍO', h: 0 },
    { v: 'H1', l: '21:00 - 05:30', h: 8.5 },
    { v: 'H2', l: '19:00 - 05:30', h: 10.5 }
  ];

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    setViewDate(today);
    setSelectedDates(new Set([format(today, 'yyyy-MM-dd')]));
  }, []);

  const calendarDaysList = useMemo(() => {
    if (!mounted) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    const allOrders = [...ordenes, ...ordenesFert];
    allOrders.forEach(o => {
      const d = getProp(o, ['FECHAINICIO', 'FECHA', 'fecha_inicio']).trim();
      if (d && d !== 'null') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes, ordenesFert, mounted]);

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = getProp(item, ['MATERIAL', 'Material', 'CodMaterial', 'MATERIAL_ID', 'CODIGO']);
    const nameStr = getProp(item, ['NOMBRE', 'NombreMaterial', 'Descripcion', 'NomMaterial', 'DESCRIPCION']);
    
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    return { code, desc };
  }, []);

  const initData = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return (name.includes('corte y laminado') || name.includes('laminado'));
      });
      setGrupos(filteredGroups);
      const ids = filteredGroups.map(g => g.codigo_grupo);
      
      const [restrs, provs, kpiLooper, invSAP, ferts, skills, maint] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getKPIMAestroLooper().catch(() => ({ data: [] })),
        serviciosService.getInventarioAñoActual().catch(() => ({ data: [] })),
        serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getCuboHabilidadesOP().catch(() => ({ data: [] })),
        serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] }))
      ]);

      setRestriccionesArray((restrs.data || []).filter((r: any) => ids.includes(r.codigo_grupo)));
      setOrders(provs.data?.data || provs.data || []);
      setOrdersFert(ferts.data?.data || ferts.data || []);
      setKpiLooperData(kpiLooper?.data || []);
      setInventarioSAP(Array.isArray(invSAP?.data) ? invSAP.data : (invSAP?.data?.data || []));
      setMantenimientosSAP(Array.isArray(maint?.data) ? maint.data : (maint?.data?.data || []));

      // Filtrar Operadores por Laminado Cilíndrico usando el nuevo método
      const skillRows = Array.isArray(skills.data) ? skills.data : [];
      const laminadoOps = skillRows.filter((s: any) => 
        String(getProp(s, ['LineaProceso', 'LINEA_PROCESO'])).toUpperCase().includes('LAMINADO CILINDRICO')
      );
      setOperadoresLaminado(laminadoOps);

    } catch (e) {
      console.error('Error init TacticalPlanLaminado:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Mismo criterio del tab "Necesidades Planta" de Corte Espuma: filtra los grupos referenciados
  // por la restricción ALMACEN_CONSUMO, ubica sus PlanGrupo activos de "Plan Táctico - Centro <centro> - P2"
  // y trae el DetalleTactico asociado, agrupado por área (nombre de grupo).
  const fetchNecesidadesPlanta = useCallback(async () => {
    setNecesidadesPlantaLoading(true);
    try {
      const [restrsRes, gruposRes] = await Promise.all([
        restriccionService.getAll(),
        grupoService.getAll()
      ]);

      const normalizeName = (s: any) => String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();

      const almacenConsumoNames = (restrsRes.data || [])
        .filter((r: any) => r.nombre_restriccion === 'ALMACEN_CONSUMO')
        .flatMap((r: any) => String(r.valor_restriccion || '').split(/[,&]/).map((v: string) => normalizeName(v)))
        .filter((v: string) => v !== '');

      const gruposFiltrados = (gruposRes.data || []).filter((g: any) => almacenConsumoNames.includes(normalizeName(g.nombre_grupo)));
      const gruposCodigos = gruposFiltrados.map((g: any) => g.codigo_grupo);
      const grupoPorCodigo = new Map(gruposFiltrados.map((g: any) => [g.codigo_grupo, g]));

      if (gruposCodigos.length === 0) {
        setNecesidadesPlantaData({});
        return;
      }

      const planGruposRes = await planGrupoService.getAll();
      const planesActivos = (planGruposRes.data || []).filter((pg: any) => {
        const valor = String(pg.valor || '').trim();
        return pg.estado === 'A' && gruposCodigos.includes(pg.codigo_grupo) && /plan\s*t[aá]ctico.*centro.*p2/i.test(valor);
      });

      const planGrupoCodigos = planesActivos.map((pg: any) => pg.codigo_plan_grupo);
      const planPorCodigo = new Map(planesActivos.map((pg: any) => [pg.codigo_plan_grupo, pg]));

      if (planGrupoCodigos.length === 0) {
        setNecesidadesPlantaData({});
        return;
      }

      const detallesRes = await detalleTacticoService.getAll();
      const detalles = (detallesRes.data || []).filter((d: any) => planGrupoCodigos.includes(d.codigo_plan_grupo));

      const grouped: Record<string, NecesidadPlantaRow[]> = {};
      detalles.forEach((d: any) => {
        const plan = planPorCodigo.get(d.codigo_plan_grupo);
        const grupo = plan ? grupoPorCodigo.get(plan.codigo_grupo) : undefined;
        const area = grupo?.nombre_grupo || 'Sin Área Asignada';
        if (!grouped[area]) grouped[area] = [];
        grouped[area].push({
          codigo_material: d.codigo_material,
          cantidad_produccion_neta: d.cantidad_produccion_neta,
          fecha_inicio: plan?.fecha_inicio_plan ? String(plan.fecha_inicio_plan).split('T')[0] : '—'
        });
      });

      setNecesidadesPlantaData(grouped);
    } catch (e) {
      console.error('Error al recuperar necesidades de planta', e);
      setNecesidadesPlantaData({});
    } finally {
      setNecesidadesPlantaLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) { initData(); fetchNecesidadesPlanta(); }
  }, [mounted, initData, fetchNecesidadesPlanta]);

  // Kg totales por material desde el resumen consolidado del tab "Necesidades Planta"
  // (mismo cálculo que MaterialSummaryTable), usado sólo para las columnas informativas
  // NEC. PLANTA [Kg]/[Un] del tab "Resumen Necesidades" — no alimenta ningún otro cálculo.
  const materialNecesidadesPlantaMap = useMemo(() => {
    const map = new Map<string, number>();
    Object.values(necesidadesPlantaData).flat().forEach(row => {
      const key = String(Number(row.codigo_material));
      map.set(key, (map.get(key) || 0) + parseQty(row.cantidad_produccion_neta));
    });
    return map;
  }, [necesidadesPlantaData]);

  const filteredOrders = useMemo(() => {
    const relevantGroups = grupos.map(g => g.codigo_grupo);
    const allowedResps = restriccionesArray
      .filter(r => (r.nombre_restriccion === 'RESPCTRLPROD' || r.nombre_restriccion === 'Hojas_Rutas_Materiales') && relevantGroups.includes(r.codigo_grupo))
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return ordenes.filter(o => {
      const centro = getProp(o, ['CENTRO', 'Centro', 'centro']).trim();
      if (centro === '2000') return false; 
      const responsable = getProp(o, ['RESPCONTROLPROD', 'RESPCTRLPROD', 'RespControlProd', 'RESP_CONTROL_PROD', 'RESPONSABLE']).trim();
      if (allowedResps.length > 0 && !allowedResps.includes(responsable)) return false;
      
      if (selectedDates.size > 0) {
        const dateRaw = getProp(o, ['FECHAINICIO', 'FECHA']).trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        if (!selectedDates.has(date)) return false;
      }
      return true;
    });
  }, [ordenes, selectedDates, grupos, restriccionesArray]);

  const filteredFertOrders = useMemo(() => {
    const relevantGroups = grupos.map(g => g.codigo_grupo);
    const allowedResps = restriccionesArray
      .filter(r => (r.nombre_restriccion === 'RESPCTRLPROD' || r.nombre_restriccion === 'Hojas_Rutas_Materiales') && relevantGroups.includes(r.codigo_grupo))
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return ordenesFert.filter(o => {
      const centro = getProp(o, ['CENTRO', 'Centro', 'centro']).trim();
      if (centro === '2000') return false; 
      const responsable = getProp(o, ['RESPCTRLPROD', 'RESP_CONTROL_PROD', 'RESPCONTROLPROD', 'RespControlProd', 'RESPONSABLE']).trim();
      if (allowedResps.length > 0 && !allowedResps.includes(responsable)) return false;
      
      if (selectedDates.size > 0) {
        const dateRaw = getProp(o, ['FECHA', 'FECHAINICIO', 'FECHA_INICIO']).trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        if (!selectedDates.has(date)) return false;
      }
      return true;
    });
  }, [ordenesFert, selectedDates, grupos, restriccionesArray]);

  const handleProcessResumen = useCallback(async () => {
    if (filteredOrders.length === 0 && filteredFertOrders.length === 0) {
      setUnifiedNeeds([]);
      return;
    }
    
    setIsProcessingResumen(true);
    const materialGroupsProv = new Map<string, number>();
    filteredOrders.forEach(order => {
      const matRaw = getProp(order, ['MATERIAL', 'CodMaterial']).trim();
      const match = matRaw.match(/^(\d+)/);
      const matCode = match ? match[1] : matRaw;
      if (!matCode) return;
      const orderQty = safeNum(getProp(order, ['CANTPROGRAMADA', 'CANTIDAD']));
      materialGroupsProv.set(matCode, (materialGroupsProv.get(matCode) || 0) + orderQty);
    });

    const materialGroupsHalb = new Map<string, number>();
    filteredFertOrders.forEach(order => {
      const matRaw = getProp(order, ['MATERIAL', 'CodMaterial']).trim();
      const match = matRaw.match(/^(\d+)/);
      const matCode = match ? match[1] : matRaw;
      if (!matCode) return;
      const orderQty = safeNum(getProp(order, ['CANTPENDIENTE', 'CANTPROGRAMADA', 'CANTIDAD']));
      materialGroupsHalb.set(matCode, (materialGroupsHalb.get(matCode) || 0) + orderQty);
    });

    const allMaterials = Array.from(new Set([...materialGroupsProv.keys(), ...materialGroupsHalb.keys()]));
    setResumenProgress({ current: 0, total: allMaterials.length });
    const consolidatedMap = new Map<string, UnifiedNeedRow>();
    
    for (let i = 0; i < allMaterials.length; i++) {
      const matCode = allMaterials[i];
      const fullCode = matCode.padStart(18, '0');
      const qtyProv = materialGroupsProv.get(matCode) || 0;
      const qtyHalb = materialGroupsHalb.get(matCode) || 0;
      
      try {
        const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 500);
        const rawData = response?.data?.data || response?.data || [];
        if (Array.isArray(rawData)) {
          const laminaRows = rawData.filter(row => (row.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('LAMINA CILINDRICA'));
          
          laminaRows.forEach(comp => {
            const compCode = cleanCode(comp.COMPONENTE);
            const desc = String(comp.DESCRIPCION_COMPONENTE || '').toUpperCase();
            const isConvRow = desc.includes('CONV') || desc.includes('CV');

            // Las variantes CONV no se cortan directo de un BLOQUE FORMULADO: se producen consumiendo
            // la lámina base (otra máquina, nivel posterior). Por eso, para heredar la MISMA apertura/
            // densidad/distancia que su lámina base (y así caer en el mismo bloque de corridas), se ubica
            // primero esa lámina base en el árbol BOM: la fila donde MATERIAL_PADRE = código CONV y el
            // componente es otra "LAMINA CILINDRICA" (no CONV).
            let baseLaminaRow: any = null;
            if (isConvRow) {
              baseLaminaRow = rawData.find(r => {
                const rDesc = (r.DESCRIPCION_COMPONENTE || '').toUpperCase();
                return cleanCode(r.MATERIAL_PADRE) === compCode &&
                  rDesc.includes('LAMINA CILINDRICA') &&
                  !rDesc.includes('CONV') && !rDesc.includes('CV');
              });
            }

            const dimsSourceCode = baseLaminaRow ? cleanCode(baseLaminaRow.COMPONENTE) : compCode;
            const dimsSourceDesc = baseLaminaRow ? String(baseLaminaRow.DESCRIPCION_COMPONENTE || '').toUpperCase() : desc;

            const blockComp = rawData.find(r =>
              cleanCode(r.MATERIAL_PADRE) === dimsSourceCode &&
              (r.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('BLOQUE FORMULADO')
            );

            const blockDesc = blockComp ? String(blockComp.DESCRIPCION_COMPONENTE).toUpperCase() : '';
            const dims = parseDimensionsEnhanced(desc);
            const dimsSource = baseLaminaRow ? parseDimensionsEnhanced(dimsSourceDesc) : dims;
            const blockDims = blockDesc ? parseDimensionsEnhanced(blockDesc) : null;
            const finalDens = blockDims && blockDims.densidad !== '—' ? blockDims.densidad : dimsSource.densidad;
            const finalAperture = blockDesc ? extractAperture(blockDesc) : extractAperture(dimsSourceDesc);
            const finalDistancia = blockDims && blockDims.distancia > 0 ? blockDims.distancia : dimsSource.distancia;

            const cantAcum = safeNum(comp.CANTIDAD_ACUMULADA || comp.CANTIDAD_UNITARIA || 0);
            const kgProv = qtyProv * cantAcum;
            const kgHalb = qtyHalb * cantAcum;

            if (consolidatedMap.has(compCode)) {
              const existingRow = consolidatedMap.get(compCode)!;
              existingRow.consumoKg += kgProv;
              existingRow.consumoKgHalb += kgHalb;
              existingRow.totalConsumoKg = existingRow.consumoKg + existingRow.consumoKgHalb;
              existingRow.unidades += qtyProv; // PROV units
              // FERT units contribution also needed for total rollos calculation
              const rollosContributionHalb = existingRow.peso > 0 ? kgHalb / existingRow.peso : 0;
              existingRow.nroRollosHalb += rollosContributionHalb;
            } else {
              const pesoTeorico = (finalDistancia * dims.altura * dims.espesor * safeNum(finalDens)) / 10000;
              const looperMatch = kpiLooperData.find(k => cleanCode(k.Material) === compCode);
              const finalPeso = looperMatch ? safeNum(looperMatch.PesoUN) : pesoTeorico;

              const getStockKg = (alm: string) => {
                return inventarioSAP
                  .filter(inv => cleanCode(inv.MATERIAL) === compCode && String(inv.ALMACEN).trim() === alm)
                  .reduce((sum, item) => sum + safeNum(item.LIBREUTILIZACION), 0);
              };

              const s1006 = getStockKg('1006');
              const s1008 = getStockKg('1008');
              const s1015 = getStockKg('1015');
              const tStockKg = s1006 + s1008 + s1015;
              const tStockUN = finalPeso > 0 ? tStockKg / finalPeso : 0;

              consolidatedMap.set(compCode, {
                material: compCode,
                descripcion: desc,
                densidad: finalDens,
                altura: dims.altura,
                espesor: dims.espesor,
                distancia: finalDistancia,
                peso: finalPeso,
                consumoKg: kgProv,
                consumoUn: 0,
                nroRollos: 0,
                consumoKgHalb: kgHalb,
                nroRollosHalb: 0,
                totalConsumoKg: kgProv + kgHalb,
                totalNroRollos: 0,
                stock1006: s1006,
                stock1008: s1008,
                stock1015: s1015,
                stockUN1006: finalPeso > 0 ? s1006 / finalPeso : 0,
                stockUN1008: finalPeso > 0 ? s1008 / finalPeso : 0,
                stockUN1015: finalPeso > 0 ? s1015 / finalPeso : 0,
                totalStockKg: tStockKg,
                totalStockUN: tStockUN,
                looperPesoUN: looperMatch ? safeNum(looperMatch.PesoUN) : 0,
                looperDensidad: looperMatch ? String(looperMatch.Densidad) : '—',
                looperEspesor: looperMatch ? safeNum(looperMatch.Espesor) : 0,
                looperTRolloMin: looperMatch ? safeNum(looperMatch.TiempoRolloMin) : 0,
                apertura: finalAperture,
                porcentajeNecesidad: 0,
                planUn: 0,
                planKg: 0,
                tProceso: 0,
                hasDeficit: false,
                unidades: qtyProv,
                bomParentMaterial: baseLaminaRow ? dimsSourceCode : undefined
              });
            }
          });
        }
      } catch (e) {
        console.warn(`Error material ${matCode}:`, (e as Error).message);
      }
      setResumenProgress({ current: i + 1, total: allMaterials.length });
    }

    const finalArray = Array.from(consolidatedMap.values()).map(row => {
      const cUn = row.peso > 0 ? row.consumoKg / row.peso : 0;
      const cUnHalb = row.peso > 0 ? row.consumoKgHalb / row.peso : 0;
      const totalNecRollos = cUn + cUnHalb;
      return {
        ...row,
        consumoUn: cUn,
        nroRollos: cUn,
        nroRollosHalb: cUnHalb,
        totalNroRollos: totalNecRollos,
        hasDeficit: totalNecRollos > row.totalStockUN
      };
    });
    
    const groupMap = new Map<string, UnifiedNeedRow[]>();
    finalArray.forEach(row => {
      const k = `${row.apertura}|${row.densidad}`;
      if(!groupMap.has(k)) groupMap.set(k, []);
      groupMap.get(k)!.push(row);
    });
    
    groupMap.forEach(items => {
      const standardItems = items.filter(it => !isConvDescripcion(it.descripcion));
      const convItems = items.filter(it => isConvDescripcion(it.descripcion));

      // La participación (porcentajeNecesidad) que reparte el plan/corridas del bloque se calcula
      // solo entre las láminas estándar. Las variantes CONV no aportan al total ni reciben
      // participación propia: su necesidad viene del nivel superior (ver más abajo).
      const totalKgGroup = standardItems.reduce((s, r) => s + r.totalConsumoKg, 0);
      standardItems.forEach(row => {
        row.porcentajeNecesidad = totalKgGroup > 0 ? (row.totalConsumoKg / totalKgGroup) : 0;
      });
      convItems.forEach(row => { row.porcentajeNecesidad = 0; });

      let runsNeeded = 0;
      const needsReplenishment = standardItems.some(r => r.totalStockUN < r.totalNroRollos);

      if (needsReplenishment) {
        runsNeeded = 1;
        let allCovered = false;
        while (!allCovered && runsNeeded < 25) {
          const totalProposedUnits = runsNeeded * BLOCK_SIZE;
          const allItemsCovered = standardItems.every(r => {
            const proposedContribution = totalProposedUnits * r.porcentajeNecesidad;
            return (r.totalStockUN + proposedContribution) >= (r.totalNroRollos - 0.01);
          });

          if (allItemsCovered) {
            allCovered = true;
          } else {
            runsNeeded++;
          }
        }
      }

      const totalUnitsInPlan = runsNeeded * BLOCK_SIZE;
      standardItems.forEach(row => {
        const key = `${row.material}|${row.apertura}|${row.densidad}`;
        const planUn = planManualOverrides[key] !== undefined ? planManualOverrides[key] : Math.round(totalUnitsInPlan * row.porcentajeNecesidad);

        row.planUn = planUn;
        row.planKg = planUn * row.peso;
        const groupRuns = runsNeeded;
        const setupContribution = (groupRuns > 0) ? (SETUP_TIME_PER_RUN * groupRuns * row.porcentajeNecesidad) : 0;
        row.tProceso = ((row.looperTRolloMin || 0) * planUn + setupContribution) / 60;
      });

      // Las variantes CONV no corren corrida propia: su necesidad/plan se deriva de la lámina base
      // (proceso "lámina convoluted": 1 lámina base -> 2 láminas CONV del mismo recorrido), no de una
      // participación propia dentro del bloque.
      convItems.forEach(row => {
        const key = `${row.material}|${row.apertura}|${row.densidad}`;
        const parent = row.bomParentMaterial ? standardItems.find(p => p.material === row.bomParentMaterial) : undefined;
        const derivedPlanUn = parent ? Math.round(parent.planUn * CONV_SPLIT_FACTOR) : 0;
        const planUn = planManualOverrides[key] !== undefined ? planManualOverrides[key] : derivedPlanUn;

        row.planUn = planUn;
        row.planKg = planUn * row.peso;
        row.tProceso = ((row.looperTRolloMin || 0) * planUn) / 60;
      });
    });

    setUnifiedNeeds(finalArray);
    setIsProcessingResumen(false);
  }, [filteredOrders, filteredFertOrders, kpiLooperData, inventarioSAP, extractMaterialInfo, planManualOverrides]);

  const handleUpdatePlanUn = (material: string, apertura: string, densidad: string, newValue: number) => {
    const key = `${material}|${apertura}|${densidad}`;
    setPlanOverrides(prev => ({ ...prev, [key]: newValue }));

    setUnifiedNeeds(prev => prev.map(row => {
      const rowKey = `${row.material}|${row.apertura}|${row.densidad}`;
      if (rowKey === key) {
        const planKg = newValue * row.peso;
        const runs = Math.ceil(newValue / (BLOCK_SIZE * row.porcentajeNecesidad)) || (newValue > 0 ? 1 : 0);
        const setupContribution = (runs > 0) ? (SETUP_TIME_PER_RUN * runs * row.porcentajeNecesidad) : 0;
        const tProceso = ((row.looperTRolloMin || 0) * newValue + setupContribution) / 60;
        return { ...row, planUn: newValue, planKg, tProceso };
      }
      // La variante CONV hereda automáticamente el plan de su lámina base (proceso alterno: x2),
      // salvo que ella misma tenga una anulación manual propia.
      if (isConvDescripcion(row.descripcion) && row.bomParentMaterial === material && row.apertura === apertura && row.densidad === densidad) {
        const convKey = `${row.material}|${row.apertura}|${row.densidad}`;
        if (planManualOverrides[convKey] === undefined) {
          const derivedPlanUn = Math.round(newValue * CONV_SPLIT_FACTOR);
          const planKg = derivedPlanUn * row.peso;
          const tProceso = ((row.looperTRolloMin || 0) * derivedPlanUn) / 60;
          return { ...row, planUn: derivedPlanUn, planKg, tProceso };
        }
      }
      return row;
    }));
  };

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedGroups(next);
  };

  // Anida las variantes "CONV" (se procesan en otra máquina y por eso no generan corrida propia,
  // pero sí se contabilizan como necesidad) bajo la lámina base de la que provienen según el árbol
  // BOM real (comp.MATERIAL_PADRE), en vez de mostrarlas como filas sueltas del bloque.
  const buildDisplayOrder = (items: UnifiedNeedRow[]): { item: UnifiedNeedRow; nested: boolean }[] => {
    const standardItems = items.filter(it => !isConvDescripcion(it.descripcion));
    const convItems = items.filter(it => isConvDescripcion(it.descripcion));
    const childrenByParent = new Map<string, UnifiedNeedRow[]>();
    const orphanConv: UnifiedNeedRow[] = [];

    convItems.forEach(conv => {
      // conv.bomParentMaterial ya trae el código de la lámina base de la que se produce
      // (resuelto en handleProcessResumen recorriendo el árbol BOM de la explosión SAP).
      const parentCode = conv.bomParentMaterial;
      const parent = parentCode ? standardItems.find(p => p.material === parentCode) : undefined;
      if (parent) {
        if (!childrenByParent.has(parent.material)) childrenByParent.set(parent.material, []);
        childrenByParent.get(parent.material)!.push(conv);
      } else {
        orphanConv.push(conv);
      }
    });

    const ordered: { item: UnifiedNeedRow; nested: boolean }[] = [];
    standardItems.forEach(item => {
      ordered.push({ item, nested: false });
      (childrenByParent.get(item.material) || []).forEach(child => ordered.push({ item: child, nested: true }));
    });
    orphanConv.forEach(item => ordered.push({ item, nested: false }));
    return ordered;
  };

  const groupedNeeds = useMemo(() => {
    const map = new Map<string, { 
      densidad: string; apertura: string; items: UnifiedNeedRow[]; totalKg: number; totalUn: number;
      total1006: number; total1008: number; total1015: number; totalPlanUn: number; totalPlanKg: number;
      totalUN1006: number; totalUN1008: number; totalUN1015: number; totalTProceso: number;
      totalRollos: number; totalKgHalb: number; totalRollosHalb: number; totalConsumoKg: number; totalNroRollos: number;
      totalStockKg: number; totalStockUN: number; hasGroupDeficit: boolean; runs: number;
    }>();

    unifiedNeeds.forEach(item => {
      const key = `${item.apertura}|${item.densidad}`;
      if (!map.has(key)) {
        map.set(key, {
          densidad: item.densidad, apertura: item.apertura, items: [], totalKg: 0, totalUn: 0,
          total1006: 0, total1008: 0, total1015: 0, totalPlanUn: 0, totalPlanKg: 0,
          totalUN1006: 0, totalUN1008: 0, totalUN1015: 0, totalTProceso: 0, totalRollos: 0,
          totalKgHalb: 0, totalRollosHalb: 0, totalConsumoKg: 0, totalNroRollos: 0,
          totalStockKg: 0, totalStockUN: 0, hasGroupDeficit: false, runs: 0
        });
      }
      const group = map.get(key)!;
      group.items.push(item);
      group.totalKg += item.consumoKg;
      group.totalKgHalb += item.consumoKgHalb;
      group.totalConsumoKg += item.totalConsumoKg;
      group.totalUn += item.unidades; // Suma unidades originales PROV
      group.totalRollos += item.nroRollos;
      group.totalRollosHalb += item.nroRollosHalb;
      group.totalNroRollos += item.totalNroRollos;
      group.total1006 += item.stock1006;
      group.total1008 += item.stock1008;
      group.total1015 += item.stock1015;
      group.totalUN1006 += item.stockUN1006;
      group.totalUN1008 += item.stockUN1008;
      group.totalUN1015 += item.stockUN1015;
      group.totalStockKg += item.totalStockKg;
      group.totalStockUN += item.totalStockUN;
      // El total de la corrida (PLAN UN/KG y T.PROCESO del bloque) excluye las variantes CONV:
      // no ocupan cupo de corrida propio, su valor ya se refleja en su propia fila anidada.
      if (!isConvDescripcion(item.descripcion)) {
        group.totalPlanUn += item.planUn;
        group.totalPlanKg += item.planKg;
        group.totalTProceso += item.tProceso;
      }
      if (item.hasDeficit) group.hasGroupDeficit = true;
    });

    map.forEach(group => {
      group.runs = Math.ceil(group.totalPlanUn / BLOCK_SIZE);
    });

    return Array.from(map.values()).sort((a, b) => {
        const apA = parseFloat(a.apertura) || 0;
        const apB = parseFloat(b.apertura) || 0;
        if (apA !== apB) return apA - apB;
        const dEA = parseFloat(a.densidad) || 0;
        const dEB = parseFloat(b.densidad) || 0;
        return dEA - dEB;
    });
  }, [unifiedNeeds]);

  const totalsUnified = useMemo(() => {
    const base = unifiedNeeds.reduce((acc, row) => ({
      kg: acc.kg + row.consumoKg,
      kgHalb: acc.kgHalb + row.consumoKgHalb,
      totalKg: acc.totalKg + row.totalConsumoKg,
      un: acc.un + row.unidades, // Fix: Sumar unidades base
      rollos: acc.rollos + row.nroRollos,
      rollosHalb: acc.rollosHalb + row.nroRollosHalb,
      totalRollos: acc.totalRollos + row.totalNroRollos,
      planUn: acc.planUn + row.planUn,
      planKg: acc.planKg + row.planKg,
      stock1006: acc.stock1006 + row.stock1006,
      stock1008: acc.stock1008 + row.stock1008,
      stock1015: acc.stock1015 + row.stock1015,
      stockUN1006: acc.stockUN1006 + row.stockUN1006,
      stockUN1008: acc.stockUN1008 + row.stockUN1008,
      stockUN1015: acc.stockUN1015 + row.stockUN1015,
      totalStockKg: acc.totalStockKg + row.totalStockKg,
      totalStockUN: acc.totalStockUN + row.totalStockUN,
      tProceso: acc.tProceso + row.tProceso
    }), { kg: 0, kgHalb: 0, totalKg: 0, un: 0, rollos: 0, rollosHalb: 0, totalRollos: 0, planUn: 0, planKg: 0, stock1006: 0, stock1008: 0, stock1015: 0, stockUN1006: 0, stockUN1008: 0, stockUN1015: 0, totalStockKg: 0, totalStockUN: 0, tProceso: 0 });

    const totalRuns = groupedNeeds.reduce((acc, group) => {
      const hasOnlyConv = group.items.every(it => it.descripcion.toUpperCase().includes('CONV') || it.descripcion.toUpperCase().includes('CV'));
      if (hasOnlyConv) return acc;
      return acc + group.runs;
    }, 0);

    return { ...base, totalRuns };
  }, [unifiedNeeds, groupedNeeds]);

  // Operación Adicional: agrupa las tareas de MTTO preventivo de la Laminadora Looper Fecken
  // y el Transportador de ingreso a Looper (ambas contienen "LOOPER" en la maestra SAP)
  const mttoPreventivoTasks = useMemo(() => {
    return mantenimientosSAP
      .filter(m => String(getProp(m, ['MAQUINA'])).toUpperCase().includes('LOOPER'))
      .filter(m => {
        if (selectedDates.size === 0) return true;
        const iniStr = getProp(m, ['FECHA_OT_PRG_INI']).trim();
        const d = iniStr.includes('T') ? iniStr.split('T')[0] : iniStr;
        return selectedDates.has(d);
      })
      .map(m => {
        const iniStr = getProp(m, ['FECHA_OT_PRG_INI']).trim();
        const finStr = getProp(m, ['FECHA_OT_PRG_FIN']).trim();
        const ini = new Date(iniStr);
        const fin = new Date(finStr);
        const horas = safeNum(getProp(m, ['T_MTTO_PLANIFICADO', 't_mtto_planificado']))
          || (isValid(ini) && isValid(fin) ? (fin.getTime() - ini.getTime()) / 3600000 : 0);
        return {
          maquina: getProp(m, ['MAQUINA']),
          fecha: iniStr.includes('T') ? iniStr.split('T')[0] : iniStr,
          horas
        };
      });
  }, [mantenimientosSAP, selectedDates]);

  const mttoPreventivoHoras = useMemo(
    () => mttoPreventivoTasks.reduce((sum, t) => sum + t.horas, 0),
    [mttoPreventivoTasks]
  );

  const tDisponible = useMemo(() => {
    const diaH = diaShiftOptions.find(o => o.v === selectedDiaShift)?.h || 0;
    const nocheH = nocheShiftOptions.find(o => o.v === selectedNocheShift)?.h || 0;
    const horasBrutas = diaH + nocheH;
    const horasNetasOEE = horasBrutas * 0.87; // Se descuenta 13% de pérdidas estándar (OEE) sobre las horas brutas
    return Math.max(0, horasNetasOEE - mttoPreventivoHoras); // + descuento del MTTO Preventivo (Operación Adicional)
  }, [selectedDiaShift, selectedNocheShift, mttoPreventivoHoras]);

  const ocupacionPorc = useMemo(() => {
    if (tDisponible <= 0) return 0;
    return (totalsUnified.tProceso / tDisponible) * 100;
  }, [tDisponible, totalsUnified.tProceso]);

  // Empaqueta los materiales de un grupo dentro de sus N corridas (bins de 40 un.) usando
  // Best-Fit-Decreasing: cada material entra ENTERO en la corrida donde mejor quepa, y solo
  // se fracciona entre varias corridas si su necesidad por sí sola supera el tamaño de un bloque.
  // Esto unifica las necesidades menores en un único ciclo en vez de repartirlas parejo entre todas las corridas.
  const distributeItemsIntoRuns = (items: UnifiedNeedRow[], totalRuns: number, blockSize: number) => {
    const bins = Array.from({ length: totalRuns }, () => ({
      remaining: blockSize,
      allocations: [] as { material: string; planUn: number }[]
    }));

    const sorted = [...items].filter(it => it.planUn > 0).sort((a, b) => b.planUn - a.planUn);

    sorted.forEach(item => {
      let qtyLeft = Math.round(item.planUn);

      while (qtyLeft > 0) {
        // Best-fit: el bin con menor espacio libre que aún alcance a cubrir qtyLeft completo
        let bestBinIdx = -1;
        let bestRemaining = Infinity;
        bins.forEach((bin, idx) => {
          if (bin.remaining >= qtyLeft && bin.remaining < bestRemaining) {
            bestBinIdx = idx;
            bestRemaining = bin.remaining;
          }
        });

        if (bestBinIdx >= 0) {
          bins[bestBinIdx].allocations.push({ material: item.material, planUn: qtyLeft });
          bins[bestBinIdx].remaining -= qtyLeft;
          qtyLeft = 0;
        } else {
          // No cabe entero en ninguna corrida: solo aquí se fracciona, en el bin con más espacio disponible
          let maxBinIdx = 0;
          bins.forEach((bin, idx) => { if (bin.remaining > bins[maxBinIdx].remaining) maxBinIdx = idx; });
          const take = Math.min(qtyLeft, bins[maxBinIdx].remaining);
          if (take <= 0) break;
          bins[maxBinIdx].allocations.push({ material: item.material, planUn: take });
          bins[maxBinIdx].remaining -= take;
          qtyLeft -= take;
        }
      }
    });

    return bins;
  };

  // Plan de Salida: prioriza corridas por impacto en la necesidad (déficit de stock primero,
  // luego % de déficit, luego mayor consumo total) y reparte las corridas de cada grupo en
  // round-robin para no dejar todas las corridas de un mismo grupo consecutivas.
  const outputPlanRows = useMemo(() => {
    const defaultDate = selectedDates.size > 0 ? Array.from(selectedDates).sort()[0] : format(new Date(), 'yyyy-MM-dd');

    const eligibleGroups = groupedNeeds.filter(g => {
      const isConvOnly = g.items.every(it => it.descripcion.toUpperCase().includes('CONV') || it.descripcion.toUpperCase().includes('CV'));
      return !isConvOnly && g.runs > 0;
    });

    const scored = eligibleGroups.map(g => {
      const deficitUnits = Math.max(0, g.totalNroRollos - g.totalStockUN);
      const deficitRatio = g.totalNroRollos > 0 ? deficitUnits / g.totalNroRollos : 0;
      const score = (g.hasGroupDeficit ? 1_000_000 : 0) + deficitRatio * 100_000 + g.totalConsumoKg;
      return { group: g, score, remaining: g.runs, totalRuns: g.runs };
    }).sort((a, b) => b.score - a.score);

    // El empaquetado de cada grupo se calcula una sola vez (no por cada corrida). Las variantes CONV
    // se excluyen del empaquetado: no ocupan cupo físico de la corrida del Looper, se producen aparte
    // en el proceso alterno (otra máquina) a partir de la lámina base ya empacada.
    const groupBins = new Map<string, ReturnType<typeof distributeItemsIntoRuns>>();
    scored.forEach(gw => {
      const key = `${gw.group.apertura}|${gw.group.densidad}`;
      const runnableItems = gw.group.items.filter(it => !isConvDescripcion(it.descripcion));
      groupBins.set(key, distributeItemsIntoRuns(runnableItems, gw.totalRuns, BLOCK_SIZE));
    });

    const corridaSequence: { group: typeof scored[0]['group']; runIndex: number; totalRuns: number }[] = [];
    let anyLeft = true;
    while (anyLeft) {
      anyLeft = false;
      for (const gw of scored) {
        if (gw.remaining > 0) {
          const runIndex = gw.totalRuns - gw.remaining + 1;
          corridaSequence.push({ group: gw.group, runIndex, totalRuns: gw.totalRuns });
          gw.remaining--;
          anyLeft = true;
        }
      }
    }

    const rows: any[] = [];
    corridaSequence.forEach((c, seqIdx) => {
      const prioridad = seqIdx + 1;
      const groupKey = `${c.group.apertura}|${c.group.densidad}`;
      const corridaId = `${groupKey}|r${c.runIndex}`;
      const corridaLabel = `D${c.group.densidad}-${c.group.apertura} (Corrida ${c.runIndex}/${c.totalRuns})`;
      const fecha = corridaFechas[corridaId] || defaultDate;

      const bin = groupBins.get(groupKey)?.[c.runIndex - 1];
      if (!bin) return;

      bin.allocations.forEach(alloc => {
        const item = c.group.items.find(it => it.material === alloc.material);
        if (!item || alloc.planUn <= 0) return;
        rows.push({
          corridaId,
          fecha,
          corrida: corridaLabel,
          material: item.material,
          descripcion: item.descripcion,
          planUn: alloc.planUn,
          planKg: alloc.planUn * item.peso,
          prioridad,
          isConvNested: false
        });

        // Las variantes CONV no ocupan cupo propio de corrida (no están en el bin), pero se
        // muestran informativamente junto a la corrida de su lámina base: por cada UN asignada
        // acá de la base, el proceso alterno devuelve el doble en la variante CONV.
        const convChildren = c.group.items.filter(it => isConvDescripcion(it.descripcion) && it.bomParentMaterial === item.material);
        convChildren.forEach(conv => {
          const convPlanUn = Math.round(alloc.planUn * CONV_SPLIT_FACTOR);
          if (convPlanUn <= 0) return;
          rows.push({
            corridaId,
            fecha,
            corrida: corridaLabel,
            material: conv.material,
            descripcion: conv.descripcion,
            planUn: convPlanUn,
            planKg: convPlanUn * conv.peso,
            prioridad,
            isConvNested: true
          });
        });
      });
    });

    return rows;
  }, [groupedNeeds, selectedDates, corridaFechas]);

  const handleUpdateCorridaFecha = (corridaId: string, fecha: string) => {
    setCorridaFechas(prev => ({ ...prev, [corridaId]: fecha }));
  };

  const handleExportTxt = () => {
    const rows = outputPlanRows;
    if (rows.length === 0) {
      addNotification('warning', 'No hay datos para exportar.');
      return;
    }
    const header = ['FECHA', 'CORRIDA/APERTURA', 'MATERIAL', 'DESCRIPCIÓN', 'PLAN(UN)', 'PLAN(KG)', 'PRIORIDAD'].join('\t');
    const lines = rows.map(r => [r.fecha, r.corrida, r.material, r.descripcion, Math.round(r.planUn), r.planKg.toFixed(2), r.prioridad].join('\t'));
    const content = [header, ...lines].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PlanSalidaLaminado_${format(new Date(), 'yyyyMMdd_HHmm')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderTopConsolidation = () => {
    const isSaturated = totalsUnified.totalRuns > 6;
    
    return (
      <div className="bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl overflow-hidden mb-8 font-sans text-white">
        <div className="grid grid-cols-12 border-b border-slate-700">
          {/* 1. Demanda Consolidada (2 cols) */}
          <div className="col-span-2 p-3 border-r border-slate-700 flex flex-col justify-center min-h-[120px]">
            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest text-center mb-3">DEMANDA CONSOLIDADA</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 font-bold text-[9px]">
                <p className="text-slate-500 uppercase text-center border-b border-slate-700 pb-1 mb-2">KG</p>
                <div className="flex justify-between px-1 text-slate-400"><span>PROV:</span> <span className="text-red-400">{formatNum(totalsUnified.kg, 0)}</span></div>
                <div className="flex justify-between px-1 text-slate-400"><span>HALB:</span> <span className="text-blue-400">{formatNum(totalsUnified.kgHalb, 0)}</span></div>
                <div className="flex justify-between px-1 pt-1 border-t border-slate-700 mt-1"><span className="font-black">TOTAL:</span> <span>{formatNum(totalsUnified.totalKg, 0)}</span></div>
              </div>
              <div className="space-y-1 font-bold text-[9px]">
                <p className="text-slate-500 uppercase text-center border-b border-slate-700 pb-1 mb-2">UN</p>
                <div className="flex justify-between px-1 text-slate-400"><span>PROV:</span> <span className="text-red-400">{formatNum(totalsUnified.un, 0)}</span></div>
                <div className="flex justify-between px-1 text-slate-400"><span>HALB:</span> <span className="text-blue-400">{formatNum(totalsUnified.totalRollos - totalsUnified.un, 0)}</span></div>
                <div className="flex justify-between px-1 pt-1 border-t border-slate-700 mt-1"><span className="font-black">TOTAL:</span> <span>{formatNum(totalsUnified.totalRollos, 0)}</span></div>
              </div>
            </div>
          </div>

          {/* 2. Plan (2 cols - Reducido) */}
          <div className="col-span-2 grid grid-cols-2 border-r border-slate-700">
            <div className="p-3 border-r border-slate-700 flex flex-col items-center justify-center text-center bg-indigo-900/20">
              <p className="text-[8px] font-black uppercase text-slate-500 tracking-tighter mb-4">ROLLOS REQ. (KG)</p>
              <span className="text-lg font-black text-indigo-400 tracking-tighter leading-none">{formatNum(totalsUnified.planKg, 0)}</span>
            </div>
            <div className="p-3 flex flex-col items-center justify-center text-center bg-black/10">
              <p className="text-[8px] font-black uppercase text-slate-500 tracking-tighter mb-4">ROLLOS REQ. (UN)</p>
              <span className="text-xl font-black text-white tracking-tighter leading-none">{Math.round(totalsUnified.planUn).toLocaleString()}</span>
            </div>
          </div>

          {/* 3. Corridas LOOPER (1 col - Reducido) */}
          <div className={cn(
            "p-3 border-r border-slate-700 flex flex-col items-center justify-center text-center transition-all",
            isSaturated ? "bg-red-600 animate-pulse" : "bg-cyan-900/30"
          )}>
            <p className="text-[8px] font-black uppercase text-white tracking-tighter mb-4">CORRIDAS LOOPER</p>
            <span className="text-3xl font-black text-white tracking-tighter leading-none">{totalsUnified.totalRuns}</span>
            {isSaturated && <span className="text-[7px] font-black uppercase text-white mt-2">ALERTA CAPACIDAD</span>}
          </div>

          {/* 4. Gestión de Tiempos (2 cols - Ampliada) */}
          <div className="col-span-2 p-3 border-r border-slate-700 flex flex-col justify-center">
            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-4 text-center">GESTIÓN DE TIEMPOS</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-slate-400 w-12">DÍA:</span>
                <select value={selectedDiaShift} onChange={(e) => setSelectedDiaShift(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] text-yellow-500 flex-1 font-black outline-none appearance-none cursor-pointer">
                  {diaShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-slate-400 w-12">NOCHE:</span>
                <select value={selectedNocheShift} onChange={(e) => setSelectedNocheShift(e.target.value)} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-[10px] text-yellow-500 flex-1 font-black outline-none appearance-none cursor-pointer">
                  {nocheShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-slate-400 w-12">MTTO:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="flex-1 bg-indigo-900/30 border border-indigo-500/30 rounded-lg px-2 py-1.5 flex items-center justify-between hover:bg-indigo-900/50 transition-colors cursor-pointer">
                      <span className="text-[8px] font-black text-indigo-300 uppercase flex items-center gap-1"><Info className="w-3 h-3" /> MTTO PREVENTIVO</span>
                      <span className="text-[10px] font-black text-indigo-300">{mttoPreventivoHoras.toFixed(2)} H</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-4 bg-[#0f172a] border border-indigo-500/30 rounded-2xl text-white" align="start">
                    <p className="text-[9px] font-black uppercase text-indigo-300 tracking-widest mb-1">Operación Adicional — Looper</p>
                    <p className="text-[8px] text-slate-500 font-bold uppercase mb-3">Tareas de mantenimiento preventivo programadas</p>
                    {mttoPreventivoTasks.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic">Sin mantenimientos programados para la(s) fecha(s) seleccionada(s)</p>
                    ) : (
                      <div className="space-y-2">
                        {mttoPreventivoTasks.map((t, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-[9px] border-b border-slate-700/50 pb-1.5">
                            <span className="font-bold uppercase text-slate-300 truncate max-w-[140px]" title={t.maquina}>{t.maquina}</span>
                            <span className="text-slate-500 font-mono">{t.fecha || '—'}</span>
                            <span className="font-black text-indigo-300 whitespace-nowrap">{t.horas.toFixed(2)}h</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-1 text-[9px]">
                          <span className="font-black uppercase text-white">Total</span>
                          <span className="font-black text-indigo-300">{mttoPreventivoHoras.toFixed(2)}h</span>
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* 5. Personal Asignado (5 cols - Ampliada) */}
          <div className="col-span-5 p-4 flex flex-col justify-center bg-slate-800/40">
            <p className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-4 text-center">PERSONAL ASIGNADO — LAMINADO CILÍNDRICO</p>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2 border-l-2 border-indigo-500 pl-4">
                <p className="text-[8px] text-indigo-400 uppercase font-black tracking-widest mb-2">TURNO DÍA</p>
                <div className="space-y-3">
                   <div className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-3 text-[8px] text-slate-600 font-black">OP-01</span>
                      <select value={assignedPersonnel.diaOp1} onChange={(e) => setAssignedPersonnel(p => ({ ...p, diaOp1: e.target.value }))}
                        className="col-span-9 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[9px] text-yellow-500 font-black outline-none focus:border-indigo-500">
                        <option value="">— SELECCIONAR —</option>
                        {operadoresLaminado.map((op, i) => (
                          <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>
                            {getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])} — [{getProp(op, ['Calificacion', 'CALIFICACION'])}]
                          </option>
                        ))}
                      </select>
                   </div>
                   <div className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-3 text-[8px] text-slate-600 font-black">OP-02</span>
                      <select value={assignedPersonnel.diaOp2} onChange={(e) => setAssignedPersonnel(p => ({ ...p, diaOp2: e.target.value }))}
                        className="col-span-9 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[9px] text-yellow-500 font-black outline-none focus:border-indigo-500">
                        <option value="">— SELECCIONAR —</option>
                        {operadoresLaminado.map((op, i) => (
                          <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>
                            {getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])} — [{getProp(op, ['Calificacion', 'CALIFICACION'])}]
                          </option>
                        ))}
                      </select>
                   </div>
                </div>
              </div>

              <div className="space-y-2 border-l-2 border-purple-500 pl-4">
                <p className="text-[8px] text-purple-400 uppercase font-black tracking-widest mb-2">TURNO NOCHE</p>
                <div className="space-y-3">
                   <div className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-3 text-[8px] text-slate-600 font-black">OP-01</span>
                      <select value={assignedPersonnel.nocheOp1} onChange={(e) => setAssignedPersonnel(p => ({ ...p, nocheOp1: e.target.value }))}
                        className="col-span-9 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[9px] text-yellow-500 font-black outline-none focus:border-purple-500">
                        <option value="">— SELECCIONAR —</option>
                        {operadoresLaminado.map((op, i) => (
                          <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>
                            {getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])} — [{getProp(op, ['Calificacion', 'CALIFICACION'])}]
                          </option>
                        ))}
                      </select>
                   </div>
                   <div className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-3 text-[8px] text-slate-600 font-black">OP-02</span>
                      <select value={assignedPersonnel.nocheOp2} onChange={(e) => setAssignedPersonnel(p => ({ ...p, nocheOp2: e.target.value }))}
                        className="col-span-9 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[9px] text-yellow-500 font-black outline-none focus:border-purple-500">
                        <option value="">— SELECCIONAR —</option>
                        {operadoresLaminado.map((op, i) => (
                          <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>
                            {getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])} — [{getProp(op, ['Calificacion', 'CALIFICACION'])}]
                          </option>
                        ))}
                      </select>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 bg-slate-900/60 border-t border-slate-700">
          <div className="col-span-3 p-4 border-r border-slate-700 flex items-center justify-center gap-6">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">OCUPACIÓN REAL (%)</div>
            <div className="flex items-center gap-3">
              <div className={cn("w-3 h-3 rounded-full shadow-[0_0_10px]", ocupacionPorc > 100 ? "bg-red-500 shadow-red-500 animate-pulse" : "bg-emerald-500 shadow-emerald-500")} />
              <span className={cn("text-2xl font-black tabular-nums", ocupacionPorc > 100 ? "text-red-400" : "text-emerald-400")}>{ocupacionPorc.toFixed(1)}%</span>
            </div>
          </div>
          <div className="col-span-2 p-4 border-r border-slate-700 flex flex-col items-center justify-center">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter mb-1">TIEMPO OPERATIVO (H)</p>
            <span className="text-2xl font-black text-emerald-400 leading-none tabular-nums">{totalsUnified.tProceso.toFixed(2)}</span>
          </div>
          <div className="col-span-2 p-4 border-r border-slate-700 flex flex-col items-center justify-center">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter mb-1">DISPONIBILIDAD TOTAL (H)</p>
            <span className="text-2xl font-black text-yellow-400 leading-none tabular-nums">{tDisponible.toFixed(2)}</span>
            <p className="text-[7px] font-bold text-slate-600 uppercase tracking-tighter mt-1">Bruto -13% OEE -{mttoPreventivoHoras.toFixed(2)}h MTTO</p>
          </div>
          <div className="col-span-5 flex items-center px-6">
             {isSaturated && (
               <div className="flex items-center gap-3 text-red-400 animate-pulse">
                  <AlertCircle className="w-6 h-6 flex-shrink-0" />
                  <p className="text-[10px] font-black uppercase leading-tight">Capacidad Crítica: Evaluar minimización de corridas para optimizar ocupación.</p>
               </div>
             )}
          </div>
        </div>
      </div>
    );
  };

  if (!mounted) return <div className="p-4 md:p-6 min-h-screen bg-white" />;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl shadow-inner"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Laminado</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Setup: {SETUP_TIME_PER_RUN}min | Auditoría Multialmacén SAP</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <Button onClick={handleProcessResumen} disabled={isProcessingResumen} className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2">
              {isProcessingResumen ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} ACTUALIZAR AUDITORÍA
           </Button>
           <Popover>
            <PopoverTrigger asChild>
              <button className="h-10 px-5 rounded-2xl border border-gray-200 bg-white hover:border-red-500/50 flex items-center gap-3 font-black text-[11px] uppercase shadow-sm transition-all">
                <Filter className="w-4 h-4 text-red-500" /> 
                {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} días seleccionados`}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-3" align="end">
              <div className="bg-white p-5 font-sans text-left">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xs font-black text-slate-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                  <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => subMonths(prev, 1))} className="h-8 w-8 hover:bg-white"><ChevronLeft className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => addMonths(prev, 1))} className="h-8 w-8 hover:bg-white"><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1.5 text-center mb-4">
                  {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[10px] font-black text-slate-300 py-1">{d}</div>)}
                  {calendarDaysList.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dStr = format(day, 'yyyy-MM-dd');
                    const isSelected = selectedDates.has(dStr);
                    return (
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); if (isSelected) { n.delete(dStr); } else { n.add(dStr); } setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-red-600 text-white shadow-md shadow-red-200" : "hover:bg-slate-50")}>
                        <span className={cn("text-xs font-black", isSelected ? "text-white" : (datesWithOrders.has(dStr) ? "text-slate-700" : "text-slate-200"))}>{format(day, 'd')}</span>
                        {datesWithOrders.has(dStr) && !isSelected && <div className="absolute bottom-1.5 w-1 h-1 bg-red-400 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-red-600 h-9 mt-1 rounded-xl tracking-widest" onClick={() => setSelectedDates(new Set())}>Ver Todo el Plan</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-6 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[
            { v: 'resumen', l: 'Resumen Necesidades', i: LayoutDashboard },
            { v: 'necesidadesPlanta', l: 'Necesidades Planta', i: Boxes },
            { v: 'ordenes', l: 'Provisionales', i: Package },
            { v: 'ordenesFert', l: 'Órdenes FERT', i: ShoppingCart },
            { v: 'inventario', l: 'Inventarios SAP', i: Database },
            { v: 'salida', l: 'Salida de Datos', i: ClipboardList }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-red-600 rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
          {renderTopConsolidation()}
          <div className="border-2 border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white mt-8">
            <div className="overflow-x-auto max-h-[600px] relative text-left">
              <table className="w-full border-collapse font-sans text-[11px] text-center">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-[#ffff00] text-black uppercase font-black tracking-tighter text-[10px] border-b-2 border-black/10">
                    <th className="px-4 py-4 border-r border-black/5 text-left w-32">Material</th>
                    <th className="px-6 py-4 border-r border-black/5 text-left min-w-[200px]">Descripción</th>
                    <th className="px-2 py-4 border-r border-black/5 text-slate-700">Peso (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 text-slate-700">Dens.</th>
                    <th className="px-2 py-4 border-r border-black/5 text-slate-700">T. Rollo (Min)</th>
                    <th className="px-3 py-4 border-r border-black/5 text-slate-700">Stock 1006 (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 text-slate-700">UN 1006</th>
                    <th className="px-3 py-4 border-r border-black/5 text-slate-700">Stock 1008 (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 text-slate-700">UN 1008</th>
                    <th className="px-3 py-4 border-r border-black/5 text-slate-700">Stock 1015 (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 text-slate-700">UN 1015</th>
                    <th className="px-3 py-4 border-r border-black/10 bg-indigo-900 text-white uppercase">T. ROLLOS BODEGAS UN</th>
                    <th className="px-3 py-4 border-r border-black/10 bg-indigo-900 text-white uppercase">T. ROLLOS BODEGAS KG</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right text-slate-700 uppercase">OF_PROV [Kg]</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right text-slate-700 uppercase">OF_HALB [Kg]</th>
                    <th className="px-4 py-4 border-r border-black/10 text-right bg-slate-900 text-white font-black uppercase">T. NECESIDADES [Kg]</th>
                    <th className="px-3 py-4 border-r border-black/5 text-indigo-900 uppercase">PROV [Un]</th>
                    <th className="px-3 py-4 border-r border-black/5 text-slate-700 uppercase">HALB [Un]</th>
                    <th className="px-3 py-4 border-r border-black/10 bg-[#1e293b] text-[#facc15] font-black uppercase">T. NECESIDADES [Un]</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right text-teal-800 bg-teal-50/60 uppercase">NEC. PLANTA [Kg]</th>
                    <th className="px-3 py-4 border-r border-black/5 text-teal-800 bg-teal-50/60 uppercase">NEC. PLANTA [Un]</th>
                    <th className="px-3 py-4 border-r border-black/5 text-center uppercase">semaforo % Nec.</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right font-black bg-[#fee2e2] text-red-900 uppercase">PLAN (UN)</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right font-black bg-[#fee2e2] text-red-900 uppercase">PLAN (KG)</th>
                    <th className="px-4 py-4 text-right font-black bg-indigo-900 text-white uppercase">T. PROCESO (H)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {isProcessingResumen ? (
                    <tr><td colSpan={25} className="py-20 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-red-500 mb-3" /><p className="text-[10px] font-black uppercase text-slate-400">Ejecutando Auditoría Técnica BOM: {resumenProgress.current} / {resumenProgress.total}</p></td></tr>
                  ) : (
                    groupedNeeds.map((group) => {
                      const groupKey = `${group.apertura}|${group.densidad}`;
                      const isExp = expandedGroups.has(groupKey);
                      return (
                        <React.Fragment key={groupKey}>
                          <tr className={cn("hover:brightness-95 cursor-pointer transition-all border-l-4 font-black", getDensityColor(group.densidad))} onClick={() => toggleGroup(groupKey)}>
                            <td className="px-4 py-4 text-left border-r border-gray-100/10 flex items-center gap-2">
                               {isExp ? <Minus className="w-3 h-3 text-red-500" /> : <Plus className="w-3 h-3 text-indigo-500" />}
                               <span className="font-black text-[10px] uppercase tracking-widest text-slate-700">{group.apertura} - D{group.densidad}</span>
                            </td>
                            <td className="px-6 py-4 text-left font-black uppercase">
                               <div className="flex items-center gap-3">
                                  {group.hasGroupDeficit ? (
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" /><span className="text-red-700">BLOQUE CRÍTICO</span></div>
                                  ) : (
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-indigo-900">BLOQUE OK</span></div>
                                  )}
                                  <span className="text-[10px] text-slate-700 ml-auto font-black uppercase">Subtotal / corridas ( {group.runs} )</span>
                               </div>
                            </td>
                            <td colSpan={9} className="border-r border-gray-100/10"></td>
                            <td className="px-3 py-4 bg-indigo-900 text-white font-mono border-r border-gray-100/10">{formatNum(group.totalStockUN, 0)}</td>
                            <td className="px-3 py-4 bg-indigo-900 text-white font-mono border-r border-gray-100/10">{formatNum(group.totalStockKg, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-slate-700 bg-indigo-50/50 border-r border-gray-100/10">{formatNum(group.totalKg, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-slate-700 bg-indigo-50/50 border-r border-gray-100/10">{formatNum(group.totalKgHalb, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-white bg-slate-900 border-r border-gray-100/10">{formatNum(group.totalConsumoKg, 0)}</td>
                            <td className="px-3 py-4 bg-[#cfe2f3]/50 font-mono text-indigo-900 border-r border-gray-100/10">{formatNum(group.totalRollos, 0)}</td>
                            <td className="px-3 py-4 bg-[#d1d5db]/50 font-mono text-slate-800 border-r border-gray-100/10">{formatNum(group.totalRollosHalb, 0)}</td>
                            <td className="px-3 py-4 bg-[#1e293b] font-mono text-[#facc15] border-r border-gray-100/10">{formatNum(group.totalNroRollos, 0)}</td>
                            <td colSpan={3} className="border-r border-gray-100/10"></td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-[#fee2e2] border-r border-gray-100/10">{formatNum(group.totalPlanUn, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-[#fee2e2] border-r border-gray-100/10">{formatNum(group.totalPlanKg, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-white bg-indigo-900">{formatNum(group.totalTProceso, 1)}</td>
                          </tr>
                          {isExp && buildDisplayOrder(group.items).map(({ item, nested }, iIdx) => (
                            <tr key={`${groupKey}-${iIdx}`} className={cn("transition-colors font-bold text-slate-700", nested ? "bg-slate-50/70 hover:bg-slate-100" : "bg-white hover:bg-blue-50")}>
                              <td className={cn("px-4 py-3 border-r border-gray-100 font-mono font-black text-indigo-600 text-left", nested ? "pl-16" : "pl-10")}>
                                {nested && <span className="text-slate-300 mr-1">↳</span>}
                                {item.material}
                              </td>
                              <td className="px-6 py-3 border-r border-gray-100 text-left text-slate-900 font-black uppercase leading-tight truncate max-w-[250px]">
                                {item.descripcion}
                                {nested && <span className="ml-2 text-[8px] font-black normal-case tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 align-middle whitespace-nowrap">Otra máquina · no cuenta corrida</span>}
                              </td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-slate-700">{item.peso.toFixed(2)}</td>
                              <td className="px-2 py-3 border-r border-gray-100 text-slate-700">{item.densidad}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-slate-700">{item.looperTRolloMin || '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-700">{item.stock1006 > 0 ? item.stock1006.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-indigo-900">{item.stockUN1006 > 0 ? Math.round(item.stockUN1006).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-700">{item.stock1008 > 0 ? item.stock1008.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-indigo-900">{item.stockUN1008 > 0 ? Math.round(item.stockUN1008).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-700">{item.stock1015 > 0 ? item.stock1015.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-indigo-900">{item.stockUN1015 > 0 ? Math.round(item.stockUN1015).toLocaleString() : '—'}</td>
                              <td className="px-3 py-4 border-r border-gray-100 font-mono text-indigo-900 bg-indigo-50/10">{Math.round(item.totalStockUN).toLocaleString()}</td>
                              <td className="px-3 py-4 border-r border-gray-100 font-mono text-indigo-900 bg-indigo-50/10">{Math.round(item.totalStockKg).toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono text-slate-700">{item.consumoKg.toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono text-slate-700">{item.consumoKgHalb.toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono text-slate-900 font-black">{item.totalConsumoKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="px-3 py-3 border-r border-gray-100 bg-[#cfe2f3]/10 font-mono text-indigo-900">{Math.round(item.consumoUn).toLocaleString()}</td>
                              <td className="px-3 py-3 border-r border-gray-100 bg-[#d1d5db]/10 font-mono text-slate-900">{Math.round(item.nroRollosHalb).toLocaleString()}</td>
                              <td className="px-3 py-3 border-r border-gray-100 bg-slate-100/10 font-mono text-slate-900 font-black">{Math.round(item.totalNroRollos).toLocaleString()}</td>
                              {(() => {
                                const necPlantaKg = materialNecesidadesPlantaMap.get(String(Number(item.material))) || 0;
                                const necPlantaUn = item.peso > 0 ? necPlantaKg / item.peso : 0;
                                return (
                                  <>
                                    <td className="px-4 py-3 border-r border-gray-100 text-right font-mono text-teal-800 bg-teal-50/30">{necPlantaKg > 0 ? necPlantaKg.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'}</td>
                                    <td className="px-3 py-3 border-r border-gray-100 font-mono text-teal-900 bg-teal-50/30 font-black">{necPlantaUn > 0 ? Math.round(necPlantaUn).toLocaleString() : '—'}</td>
                                  </>
                                );
                              })()}
                              <td className="px-3 py-3 border-r border-gray-100 text-center font-black">
                                 <div className="flex flex-col items-center gap-1">
                                    <div className={cn("w-3 h-3 rounded-full", item.hasDeficit ? "bg-red-500 shadow-[0_0_8px_#ef4444]" : "bg-green-500")} />
                                    <span className={cn("text-[8px] font-black uppercase tracking-tighter", item.hasDeficit ? "text-red-700" : "text-green-700")}>{item.hasDeficit ? "STOCK BAJO" : "STOCK OK"}</span>
                                    <span className="text-[9px] text-slate-900 font-black font-mono">{(item.porcentajeNecesidad * 100).toFixed(1)}%</span>
                                 </div>
                              </td>
                              <td className="px-2 py-3 border-r border-black/10 bg-[#fee2e2]/20">
                                 <input 
                                   type="number" 
                                   value={item.planUn} 
                                   onChange={(e) => handleUpdatePlanUn(item.material, item.apertura, item.densidad, parseInt(e.target.value) || 0)}
                                   className="w-16 bg-white border border-red-200 rounded px-1 text-center font-black text-red-900 focus:outline-none focus:ring-2 focus:ring-red-400"
                                 />
                              </td>
                              <td className="px-4 py-3 border-r border-black/10 text-right font-mono text-red-900 bg-[#fee2e2]/20">{item.planKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-indigo-900 bg-indigo-50/10">{formatNum(item.tProceso, 1)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="necesidadesPlanta" className="animate-in fade-in duration-300 space-y-10 text-left">
          {necesidadesPlantaLoading ? (
            <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : Object.keys(necesidadesPlantaData).length === 0 ? (
            <div className="py-24 text-center text-slate-300 uppercase font-black tracking-widest italic opacity-50">Sin necesidades de planta detectadas</div>
          ) : (
            <MaterialSummaryTable data={necesidadesPlantaData} />
          )}
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-6 animate-in fade-in duration-300 text-left">
          <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border-collapse font-sans text-[11px] text-center">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5">Orden</th>
                    <th className="px-6 py-5 border-r border-white/5">Fecha Inicio</th>
                    <th className="px-6 py-5 border-r border-white/5">Código FERT</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Descripción del Producto</th>
                    <th className="px-6 py-5 border-r border-white/5">Cantidad</th>
                    <th className="px-6 py-5 border-r border-white/5">Responsable</th>
                    <th className="px-6 py-5 border-r border-white/5">Máquina</th>
                    <th className="px-6 py-5">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-slate-300 font-black uppercase tracking-widest italic text-center">No se detectaron órdenes para los criterios aplicados</td></tr>
                  ) : (
                    filteredOrders.map((o, i) => {
                      const { code, desc } = extractMaterialInfo(o);
                      const resp = getProp(o, ['RESPCONTROLPROD', 'RESPCTRLPROD', 'RespControlProd', 'RESP_CONTROL_PROD', 'RESPONSABLE']);
                      return (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50">{getProp(o, ['ORDENPREVISIONAL', 'ORDEN']) || '—'}</td>
                          <td className="px-6 py-4 border-r border-gray-50 font-mono text-[9px] text-slate-500 text-center">{getProp(o, ['FECHAINICIO', 'FECHA']) || '—'}</td>
                          <td className="px-6 py-4 font-mono font-black text-red-600 border-r border-gray-50 tracking-tighter text-sm text-center">{code}</td>
                          <td className="px-6 py-4 text-left border-r border-gray-100 text-slate-800 font-black uppercase leading-tight max-w-[450px]">{desc}</td>
                          <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 font-mono text-sm text-center">{Number(getProp(o, ['CANTPROGRAMADA', 'CANTIDAD', 'CANT_PROG']) || 0).toLocaleString()}</td>
                          <td className="px-6 py-4 border-r border-gray-50 text-center"><Badge variant="outline" className="text-[10px] font-black bg-blue-50 text-blue-700 border-blue-100">{resp || '—'}</Badge></td>
                          <td className="px-6 py-4 font-bold text-slate-600 border-r border-gray-50 text-[10px] uppercase text-center">{getProp(o, ['MAQUINA', 'RECURSO', 'ID_MAQUINA']) || '—'}</td>
                          <td className="px-6 py-4 font-bold text-slate-400 text-[10px] text-center">{getProp(o, ['Almacen', 'ALMACEN']) || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ordenesFert" className="space-y-6 animate-in fade-in duration-300 text-left">
          <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border-collapse font-sans text-[11px] text-center">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5">Orden FERT</th>
                    <th className="px-6 py-5 border-r border-white/5">Fecha</th>
                    <th className="px-6 py-5 border-r border-white/5">Código FERT</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Descripción del Producto</th>
                    <th className="px-6 py-5 border-r border-white/5">Cant. Pendiente</th>
                    <th className="px-6 py-5 border-r border-white/5">Responsable</th>
                    <th className="px-6 py-5 border-r border-white/5">Máquina</th>
                    <th className="px-6 py-5">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
                  {filteredFertOrders.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-slate-300 font-black uppercase tracking-widest italic text-center">No se detectaron órdenes FERT para los criterios aplicados</td></tr>
                  ) : (
                    filteredFertOrders.map((o, i) => {
                      const { code, desc } = extractMaterialInfo(o);
                      const orderNum = getProp(o, ['ORDEN', 'ORDEN_PROCESO', 'ORDEN_FERT']) || '—';
                      const date = getProp(o, ['FECHA', 'FECHAINICIO', 'FECHA_INICIO']);
                      const qty = Number(getProp(o, ['CANTPENDIENTE', 'CANT_PEND', 'CANTIDAD', 'CANT_PROG']) || 0);
                      const resp = getProp(o, ['RESPCTRLPROD', 'RESP_CONTROL_PROD', 'RESPONSABLE']);
                      const mach = getProp(o, ['MAQUINA', 'RECURSO', 'ID_MAQUINA']);
                      const alm = getProp(o, ['ALMACEN', 'CENTRO', 'Almacen']);
                      
                      return (
                        <tr key={i} className="hover:bg-indigo-50/20 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 text-center">{orderNum}</td>
                          <td className="px-6 py-4 border-r border-gray-50 font-mono text-[9px] text-slate-500 text-center">{date}</td>
                          <td className="px-6 py-4 font-mono font-black text-red-600 border-r border-gray-50 tracking-tighter text-sm text-center">{code}</td>
                          <td className="px-6 py-4 text-left border-r border-white/10 text-slate-800 font-black uppercase leading-tight max-w-[450px]">{desc}</td>
                          <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 font-mono text-sm text-center">{qty.toLocaleString()}</td>
                          <td className="px-6 py-4 border-r border-gray-50 text-center"><Badge variant="outline" className="text-[10px] font-black bg-indigo-50 text-indigo-700 border-indigo-100">{String(resp || '—')}</Badge></td>
                          <td className="px-6 py-4 font-bold text-slate-600 border-r border-gray-50 text-[10px] uppercase text-center">{mach || '—'}</td>
                          <td className="px-6 py-4 font-bold text-slate-400 text-[10px] text-center">{alm || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="inventario" className="animate-in fade-in duration-300 space-y-4 text-left">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3 text-left">
              <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg"><Database className="w-4 h-4" /></div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Inventario SAP Año Actual (Auditado)</h3>
            </div>
          </div>
          <Card className="rounded-3xl border border-blue-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative text-center">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-5 border-r border-white/5">Material</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Nombre</th>
                    <th className="px-3 py-5 border-r border-white/5">Centro</th>
                    <th className="px-3 py-5 border-r border-white/5 text-indigo-300">ALM.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-green-500/30 text-green-300">Libre Utiliz.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-blue-500/30 text-blue-200">En Traslado</th>
                    <th className="px-3 py-5 border-r border-white/5">Insp. Calidad</th>
                    <th className="px-3 py-5 border-r border-white/5 text-red-300">Bloqueado</th>
                    <th className="px-3 py-5 border-r border-white/5">Punto Pedido</th>
                    <th className="px-3 py-5">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px] font-black text-slate-700">
                  {inventarioSAP.filter(row => String(row.NOMBRE || row.DESCRIPCION || '').toUpperCase().includes('LAMINA CILINDRICA')).length === 0 ? (
                    <tr><td colSpan={10} className="py-24 text-slate-300 font-black uppercase tracking-widest italic text-center">No hay inventario registrado en los almacenes configurados</td></tr>
                  ) : (
                    inventarioSAP.filter(row => String(row.NOMBRE || row.DESCRIPCION || '').toUpperCase().includes('LAMINA CILINDRICA')).map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/10 transition-colors">
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 font-mono text-blue-700 text-center font-black">{cleanCode(row.MATERIAL)}</td>
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 text-left uppercase text-slate-700 font-black truncate max-w-[200px]" title={row.NOMBRE}>{row.NOMBRE || '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 text-center">{row.CENTRO}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 text-indigo-700 font-black bg-indigo-50/30 text-center">{row.ALMACEN}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-green-700 bg-green-50/30 text-center font-black">{Number(row.LIBREUTILIZACION || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-blue-700 bg-blue-50/30 text-center font-black">{Number(row.ENTRASLADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-slate-500 text-center">{Number(row.INSPECCCALIDAD || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-red-700 text-center">{Number(row.BLOQUEADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-indigo-600 text-center">{Number(row.PUNTOPEDIDO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-[10px] text-slate-400 text-center uppercase font-bold">{row.TIPO_MATERIAL}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="salida" className="animate-in fade-in duration-300 space-y-4 text-left">
          <div className="flex items-center justify-between px-2 flex-wrap gap-3">
            <div className="flex items-center gap-3 text-left">
              <div className="p-2 bg-red-600 rounded-xl text-white shadow-lg"><ClipboardList className="w-4 h-4" /></div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Plan de Salida — Corridas Looper</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                  Prioridad: 1) Déficit de stock &nbsp;2) % de déficit &nbsp;3) Mayor consumo (Kg) — corridas intercaladas por grupo
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleExportTxt} className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar TXT
              </Button>
            </div>
          </div>

          <div className="border-2 border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse font-sans text-[11px] text-center">
                <thead className="sticky top-0 z-20 bg-[#1e293b] text-white uppercase font-black tracking-widest text-[9px]">
                  <tr>
                    <th className="px-4 py-4 border-r border-white/5">Fecha</th>
                    <th className="px-6 py-4 border-r border-white/5 text-left">Corrida / Apertura</th>
                    <th className="px-4 py-4 border-r border-white/5">Material</th>
                    <th className="px-6 py-4 border-r border-white/5 text-left min-w-[220px]">Descripción</th>
                    <th className="px-4 py-4 border-r border-white/5">Plan (Un)</th>
                    <th className="px-4 py-4 border-r border-white/5">Plan (Kg)</th>
                    <th className="px-4 py-4 bg-red-900/60 text-red-200">Prioridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold text-slate-700">
                  {outputPlanRows.length === 0 ? (
                    <tr><td colSpan={7} className="py-24 text-slate-300 font-black uppercase tracking-widest italic text-center">No hay corridas calculadas para los criterios actuales</td></tr>
                  ) : (
                    outputPlanRows.map((row, i) => {
                      const isFirstOfCorrida = i === 0 || outputPlanRows[i - 1].corridaId !== row.corridaId;
                      return (
                        <tr key={`${row.corridaId}-${row.material}-${i}`} className={cn("transition-colors", row.isConvNested ? "bg-slate-50/70 hover:bg-slate-100" : "hover:bg-red-50/20")}>
                          <td className="px-4 py-3 border-r border-gray-100">
                            {isFirstOfCorrida ? (
                              <input
                                type="date"
                                value={row.fecha}
                                onChange={(e) => handleUpdateCorridaFecha(row.corridaId, e.target.value)}
                                className="bg-white border border-gray-200 rounded-lg px-2 py-1 text-[10px] font-black text-slate-700 outline-none focus:border-red-400"
                              />
                            ) : (
                              <span className="text-[9px] text-slate-300 font-mono">{row.fecha}</span>
                            )}
                          </td>
                          <td className="px-6 py-3 border-r border-gray-100 text-left font-black uppercase text-slate-800">{row.corrida}</td>
                          <td className={cn("px-4 py-3 border-r border-gray-100 font-mono font-black text-indigo-600", row.isConvNested && "pl-8")}>
                            {row.isConvNested && <span className="text-slate-300 mr-1">↳</span>}
                            {row.material}
                          </td>
                          <td className="px-6 py-3 border-r border-gray-100 text-left uppercase leading-tight truncate max-w-[280px]" title={row.descripcion}>
                            {row.descripcion}
                            {row.isConvNested && <span className="ml-2 text-[8px] font-black normal-case tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 align-middle whitespace-nowrap">Otra máquina · no cuenta corrida</span>}
                          </td>
                          <td className="px-4 py-3 border-r border-gray-100 font-mono text-red-900 bg-[#fee2e2]/30">{Math.round(row.planUn).toLocaleString()}</td>
                          <td className="px-4 py-3 border-r border-gray-100 font-mono text-red-900 bg-[#fee2e2]/30">{formatNum(row.planKg, 1)}</td>
                          <td className="px-4 py-3 bg-slate-900 text-yellow-400 font-black">{row.isConvNested ? '—' : row.prioridad}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* MAESTRO MATERIALES EXPLOSIÓN (Solo consulta externa) */}
      <div className="mt-12 hidden">
        <MaestroMaterialesExplosionSection ordenes={filteredOrders} />
      </div>
    </div>
  );
};
