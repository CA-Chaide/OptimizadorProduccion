
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Scissors,
  Package,
  Loader2,
  LayoutDashboard,
  ShoppingCart,
  RefreshCw,
  Wrench,
  Minus,
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
  AlertCircle,
  CheckCircle2,
  Database,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { serviciosService } from '@/services/servicios.service';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { planGrupoService } from '@/services/plangrupo.service';
import { detalleTacticoService } from '@/services/detalletactico.service';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

// --- CONSTANTES TÉCNICAS PLANTA ---
// Grupo propio de Corte Espuma ("Taller de Corte") — dueño de su propia fila de restricción
// ALMACEN_CONSUMO (codigo_restriccion 421), separada de la de Laminado (codigo_grupo 8).
const CODIGO_GRUPO_ESPUMA = 7;
const CAROUSEL_DIAMETER_CM = 320;
const EFFICIENCY_FACTOR = 0.87;
// TiempoCorte de KPIMaestroCarruseles viene en segundos (Tiempos Ensamblado ya viene en minutos)
// y no incluye una actividad adicional del proceso que Tiempos Ensamblado sí contempla — se
// homologa a minutos y se le suma ese 35% cuando se usa como respaldo.
const CARRUSEL_TIEMPO_CORTE_A_MINUTOS = 1 / 60;
const CARRUSEL_ACTIVIDAD_ADICIONAL_FACTOR = 1.35;

// Máquinas de cabecera del resumen (Capacidad Operativa), reutilizadas para vincular
// cada registro de Mantenimiento SAP (ID_MAQUINA) con su tarjeta correspondiente.
const MACHINES_BY_PLANTA: Record<'UIO' | 'GYE', { id: string; n: string }[]> = {
  UIO: [{ id: 'CR04', n: 'CARRUSEL 4 FECKEN' }, { id: 'CR03', n: 'CARRUSEL 3 SCHMUZIGER' }, { id: 'CR01', n: 'CARRUSEL 1 SCHMUZIGER' }, { id: 'CNC01', n: 'CORTADORA CNC GIOTTO' }],
  GYE: [{ id: 'CR02', n: 'CARRUSEL 2 FEMA' }, { id: 'CR01', n: 'CARRUSEL 1 SCHMUZIGER' }, { id: 'LA02', n: 'LAMINADORA REPOTENCIADA' }],
};

interface UnifiedRow {
  orden: string;
  fecha: string;
  fechaFin: string;
  material: string;
  descripcion: string;
  ancho: number;
  largo: number;
  esp: number;
  dens: string;
  cant: number;
  peso: number;
  alturaTotal: number;
  tIndiv: number;
  tTotal: number;
  subBloques: number; 
  nroCargas: number;  
  undBatch: number;
  apertura: string;
  categoria: string;
  centro: string;
  almacen: string;
  responsable: string;
  maquina: string;
  isAlterna: boolean;
  origenArea?: string;
  origenCodigoGrupo?: number;
  origenCodigoPlanGrupo?: number;
  origenAmbiguo?: boolean;
  origenCandidatosCount?: number;
  tIndivEstimado?: boolean;
  tIndivEstimadoNivel?: '3a' | '3b' | '3c';
}

interface NecesidadPlantaRow {
  codigo_material: number;
  cantidad_produccion_neta: string;
  fecha_inicio: string;
  fecha_fin: string;
  codigo_grupo: number;
  codigo_plan_grupo: number;
}

interface ConsolidatedNeedRow extends NecesidadPlantaRow {
  area: string;
}

// Tab "Necesidades Planta": antes mostraba una tabla independiente por área (Object.entries +
// map). Se reemplaza por una única tabla consolidada con columna "Área/Grupo". Qué áreas aparecen
// aquí (hoy solo Venta Externa) lo define la restricción ALMACEN_CONSUMO (codigo_restriccion 421,
// codigo_grupo = CODIGO_GRUPO_ESPUMA) — no hay nada hardcodeado en este archivo. Muebles y
// Ensamblado se excluyeron a propósito: su "P2" no distingue si el material ya se fabricó o sigue
// pendiente, así que no son una base confiable para la pre-auditoría de Provisionales/FERT. Venta
// Externa sí lo es (demanda de venta externa comprometida), por eso es la única fuente hoy.
const ConsolidatedNeedsTable: React.FC<{ rows: ConsolidatedNeedRow[]; areaCounts: [string, number][] }> = ({ rows, areaCounts }) => {
  const [page, setPage] = useState(1);
  const pageSize = 15;

  useEffect(() => { setPage(1); }, [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paginated = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page]);

  return (
    <div className="space-y-4 text-left">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-xs font-black uppercase text-slate-800 tracking-widest flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-600" /> Necesidades Consolidadas ({rows.length})
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          {areaCounts.map(([area, count]) => (
            <span key={area} className="text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 rounded-full px-3 py-1">{area} · {count}</span>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-center border-collapse text-[10px]">
            <thead className="bg-gray-50 sticky top-0 z-20 text-[9px] font-bold uppercase text-gray-400">
              <tr>
                <th className="px-6 py-4 border-r border-gray-100 text-left">Área / Grupo</th>
                <th className="px-6 py-4 border-r border-gray-100 text-left">Código Material</th>
                <th className="px-6 py-4 border-r border-gray-100 font-black bg-yellow-50/50 text-yellow-700">Cantidad Producción Neta</th>
                <th className="px-6 py-4 border-r border-gray-100">Plan Grupo</th>
                <th className="px-6 py-4 uppercase">Fecha Inicio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
              {paginated.length === 0 ? (
                <tr><td colSpan={5} className="py-16 text-slate-300 uppercase font-black tracking-widest italic opacity-50 text-center">Sin necesidades de planta detectadas</td></tr>
              ) : paginated.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50 transition-colors font-mono text-[10px]">
                  <td className="px-6 py-3 border-r border-slate-50 text-left">
                    <span className="font-black text-slate-900 uppercase">{row.area}</span>
                    <span className="block text-[8px] text-slate-400 font-sans normal-case">Grupo #{row.codigo_grupo}</span>
                  </td>
                  <td className="px-6 py-3 border-r border-slate-50 text-left text-indigo-600 font-black">{row.codigo_material}</td>
                  <td className="px-6 py-3 border-r border-slate-50 text-slate-900 font-black bg-yellow-50">{row.cantidad_produccion_neta}</td>
                  <td className="px-6 py-3 border-r border-slate-50 text-slate-400">#{row.codigo_plan_grupo}</td>
                  <td className="px-6 py-3 text-slate-400">{row.fecha_inicio}</td>
                </tr>
              ))}
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

// Fila cruda proveniente de endpoints SAP/servicios internos: los nombres de columna varían de
// mayúsculas/minúsculas y de endpoint a endpoint, por eso se accede siempre vía getProp/cleanCode/safeNum.
type RawApiRow = Record<string, unknown>;

interface MachineShiftConfig {
  day: string;
  night: string;
  op1D: string;
  op2D: string;
  op1N: string;
  op2N: string;
  paro1: number;
  paro2: number;
}

interface PlantaConfig {
  performance: number;
  shifts: Record<string, MachineShiftConfig>;
}

const safeNum = (val: unknown): number => {
  const n = Number(String(val || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: unknown): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const formatNum = (val: unknown, decimals: number = 2): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

const getProp = (obj: Record<string, unknown> | null | undefined, keys: string[]): string => {
  if (!obj) return '';
  const rowKeys = Object.keys(obj);
  for (const k of keys) {
    const found = rowKeys.find(rk => rk.toLowerCase().trim() === k.toLowerCase().trim());
    if (found) return String(obj[found]).trim();
  }
  return '';
};

const median = (values: number[]): number => {
  const clean = values.filter(v => v > 0).sort((a, b) => a - b);
  if (clean.length === 0) return 0;
  const mid = Math.floor(clean.length / 2);
  return clean.length % 2 === 0 ? (clean[mid - 1] + clean[mid]) / 2 : clean[mid];
};

interface MaterialGeomConocido { ancho: number; largo: number; esp: number; dens: number; tIndiv: number; }

// Tiempo estándar de corte por lámina cuando NINGÚN catálogo (Tiempos Ensamblado / Maestro
// Carruseles) tiene el material: se estima a partir de vecinos REALES del mismo batch, en vez de
// una constante fija (una constante única no representa a la vez a una lámina D18 fina y a una
// D40 gruesa — un ancla fija de "tiempo promedio" quedó demasiado lejos del orden de magnitud real
// de familias densas/anchas, ver caso 30004402 vs 30004400). Jerarquía, de mejor a peor evidencia:
//  3a) Vecino(s) de la MISMA densidad Y MISMO espesor (misma familia física real) — se escala su
//      tIndiv real por la razón de ancho×largo (el recorrido de corte cambia con esas dos
//      dimensiones, confirmado con planta), y se toma la mediana si hay más de un vecino.
//  3b) Sin vecino de la misma familia exacta: mismo densidad, espesor distinto — se agrega también
//      la razón de espesor a la escala.
//  3c) Sin ningún vecino de esa densidad en el batch: no hay mejor evidencia que la mediana global
//      de los tiempos REALES conocidos del batch (sigue siendo dato de planta, no un número
//      inventado) — se marca con menor confianza en la UI.
const estimarTiempoIndivPorVecino = (
  target: { ancho: number; largo: number; esp: number; dens: number },
  conocidos: MaterialGeomConocido[]
): { valor: number; nivel: '3a' | '3b' | '3c' } | null => {
  if (conocidos.length === 0) return null;

  const escalar = (vecino: MaterialGeomConocido, porEsp: boolean) => {
    const factorAncho = vecino.ancho > 0 ? target.ancho / vecino.ancho : 1;
    const factorLargo = vecino.largo > 0 ? target.largo / vecino.largo : 1;
    const factorEsp = porEsp && vecino.esp > 0 ? target.esp / vecino.esp : 1;
    return vecino.tIndiv * factorAncho * factorLargo * factorEsp;
  };

  const familiaExacta = conocidos.filter(c => c.dens === target.dens && c.esp === target.esp);
  const estimadoExacto = familiaExacta.length > 0 ? median(familiaExacta.map(v => escalar(v, false))) : 0;
  if (estimadoExacto > 0) return { valor: estimadoExacto, nivel: '3a' };

  const familiaDensidad = conocidos.filter(c => c.dens === target.dens);
  const estimadoDensidad = familiaDensidad.length > 0 ? median(familiaDensidad.map(v => escalar(v, true))) : 0;
  if (estimadoDensidad > 0) return { valor: estimadoDensidad, nivel: '3b' };

  const estimadoGlobal = median(conocidos.map(c => c.tIndiv));
  return estimadoGlobal > 0 ? { valor: estimadoGlobal, nivel: '3c' } : null;
};

const parseDimensions = (desc: string) => {
  const d = String(desc || '').toUpperCase();
  const densMatch = d.match(/D(\d+)/);
  const dens = densMatch ? densMatch[1] : '—';
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
  const ancho = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const largo = dimMatch ? parseFloat(dimMatch[2]) : 0;
  const esp = dimMatch && dimMatch[3] ? parseFloat(dimMatch[3]) : 0;
  
  const apertureRegex = /194\.5|206|219|228/;
  const apertureMatch = d.match(apertureRegex);
  const apertura = apertureMatch ? apertureMatch[0] : '—';

  return { dens, ancho, largo, esp, apertura };
};

// Selector de fecha individual y reutilizable (Provisionales y FERT tienen cada uno el suyo, con
// su propio rango permitido — ver isDateDisabled). Antes había un único calendario global
// compartido por todo el módulo, lo que mezclaba criterios que no aplican igual a ambos tabs.
const DateFilterPopover: React.FC<{
  label: string;
  selectedDates: Set<string>;
  onToggleDate: (dateStr: string) => void;
  onClear: () => void;
  viewDate: Date;
  setViewDate: React.Dispatch<React.SetStateAction<Date>>;
  datesWithOrders: Set<string>;
  isDateDisabled: (dateStr: string) => boolean;
}> = ({ label, selectedDates, onToggleDate, onClear, viewDate, setViewDate, datesWithOrders, isDateDisabled }) => {
  const calendarDaysList = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="h-9 px-4 rounded-2xl border border-gray-200 bg-white hover:border-red-500/50 flex items-center gap-2 font-black text-[10px] uppercase shadow-sm transition-all">
          <Filter className="w-3.5 h-3.5 text-red-500" /> {selectedDates.size === 0 ? label : `${selectedDates.size} día(s) seleccionado(s)`}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-3" align="end">
        <div className="bg-white p-5 font-sans text-left text-[11px]">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xs font-black text-slate-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
            <div className="flex gap-1 bg-gray-50 p-1 rounded-xl">
              <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => subMonths(prev, 1))} className="h-8 w-8 hover:bg-white"><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => addMonths(prev, 1))} className="h-8 w-8 hover:bg-white"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-y-1.5 text-center mb-4">
            {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[9px] font-black text-slate-300 uppercase py-1">{d}</div>)}
            {calendarDaysList.map((day, idx) => {
              if (!day) return <div key={idx} />;
              const dStr = format(day, 'yyyy-MM-dd');
              const isSelected = selectedDates.has(dStr);
              const disabled = isDateDisabled(dStr);
              return (
                <button
                  key={dStr}
                  disabled={disabled}
                  onClick={() => onToggleDate(dStr)}
                  className={cn(
                    "relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all",
                    disabled ? "opacity-20 cursor-not-allowed" : "hover:bg-slate-50",
                    isSelected && !disabled ? "bg-red-600 text-white shadow-md shadow-red-200" : ""
                  )}
                >
                  <span className={cn("text-xs font-black", isSelected && !disabled ? "text-white" : (datesWithOrders.has(dStr) ? "text-slate-800" : "text-slate-200"))}>{format(day, 'd')}</span>
                  {datesWithOrders.has(dStr) && !isSelected && !disabled && <div className="absolute bottom-1.5 w-1 h-1 bg-red-400 rounded-full" />}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-red-600 h-9 mt-1 rounded-xl tracking-widest" onClick={onClear}>Ver Todo (dentro del rango permitido)</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export const TacticalPlanEspumasSection: React.FC = () => {
  useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [isLoading, setIsLoading] = useState(true);
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<RawApiRow[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<RawApiRow[]>([]);
  const [, setInventarioSAP] = useState<RawApiRow[]>([]);
  const [kpiLooperData, setKpiLooperData] = useState<RawApiRow[]>([]);
  const [mantenimientosSAP, setMantenimientosSAP] = useState<RawApiRow[]>([]);
  const [tiemposCatalogo, setTiemposCatalogo] = useState<RawApiRow[]>([]);
  const [kpiCarruselesData, setKpiCarruselesData] = useState<RawApiRow[]>([]);
  const [operadoresCorte, setOperadoresCorte] = useState<RawApiRow[]>([]);
  const [, setGrupos] = useState<Grupo[]>([]);
  const [necesidadesPlantaData, setNecesidadesPlantaData] = useState<Record<string, NecesidadPlantaRow[]>>({});
  const [necesidadesPlantaLoading, setNecesidadesPlantaLoading] = useState(false);

  // Pre-auditoría Provisionales/FERT: cruza codigo_material contra TODAS las filas ya cargadas en
  // "Necesidades Planta" que mencionan ese material (puede haber más de una — mismo material pedido
  // por distintas áreas o por distintos Plan Grupo P2 con rangos de fecha distintos). La
  // desambiguación por fecha de la orden ocurre en auditMapper, no aquí.
  const materialAreaMap = useMemo(() => {
    const map = new Map<string, ConsolidatedNeedRow[]>();
    Object.entries(necesidadesPlantaData).forEach(([area, rows]) => {
      rows.forEach(row => {
        const key = String(Number(row.codigo_material));
        if (!key || key === 'NaN') return;
        const candidatos = map.get(key) || [];
        candidatos.push({ ...row, area });
        map.set(key, candidatos);
      });
    });
    return map;
  }, [necesidadesPlantaData]);

  // Tabla única consolidada del tab "Necesidades Planta" (ver ConsolidatedNeedsTable): aplana
  // necesidadesPlantaData (agrupado por área) en una sola lista con la columna "área" incluida.
  const necesidadesPlantaConsolidada = useMemo<ConsolidatedNeedRow[]>(() => {
    return Object.entries(necesidadesPlantaData).flatMap(([area, rows]) =>
      rows.map(row => ({ ...row, area }))
    );
  }, [necesidadesPlantaData]);

  const necesidadesPlantaAreaCounts = useMemo<[string, number][]>(() => {
    return Object.entries(necesidadesPlantaData).map(([area, rows]) => [area, rows.length]);
  }, [necesidadesPlantaData]);

  // Selectores de fecha INDIVIDUALES por tab (antes había uno solo, global, compartido por
  // Provisionales y FERT — mezclaba criterios que no aplican igual a ambos):
  // - Provisionales: solo hoy en adelante. Una orden provisional con fecha pasada no debería
  //   existir/evaluarse por lógica de sistema (no hay tal necesidad ya vencida pendiente).
  // - FERT: solo hoy hacia atrás. Son órdenes "P3" ya aprobadas/ejecutadas — se listan aquí
  //   únicamente para sumar sus horas al cálculo de ocupación de "Capacidad Operativa", no para
  //   cruzarlas contra "Necesidades Planta" (P2), por eso ese tab no tiene la columna de origen.
  const [selectedDatesProv, setSelectedDatesProv] = useState<Set<string>>(new Set());
  const [selectedDatesFert, setSelectedDatesFert] = useState<Set<string>>(new Set());
  const [viewDateProv, setViewDateProv] = useState<Date>(new Date());
  const [viewDateFert, setViewDateFert] = useState<Date>(new Date());
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  // FERT: la ventana hacia adelante no es "mañana" fijo, es el siguiente DÍA LABORABLE — si hoy es
  // viernes, el siguiente laborable es el lunes (se salta sábado y domingo), y así cada día según
  // corresponda. Viernes/sábado quedan cubiertos por este mismo cálculo sin necesitar tabla de
  // feriados: solo fines de semana (lunes-jueves => +1; viernes => +3; sábado => +2; domingo => +1).
  const nextBusinessDayStr = useMemo(() => {
    const now = new Date();
    const day = now.getDay(); // 0=domingo … 5=viernes, 6=sábado
    const addDays = day === 5 ? 3 : day === 6 ? 2 : 1;
    const next = new Date(now);
    next.setDate(now.getDate() + addDays);
    return format(next, 'yyyy-MM-dd');
  }, []);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // --- CONFIGURACIÓN DASHBOARDS ---
  const [uioConfig, setUioConfig] = useState<PlantaConfig>({
    performance: 90,
    shifts: {
      CR04: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 },
      CR03: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 },
      CR01: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 },
      CNC01: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 }
    }
  });

  const [gyeConfig, setGyeConfig] = useState<PlantaConfig>({
    performance: 75,
    shifts: {
      CR02: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 },
      CR01: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 },
      LA02: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 }
    }
  });

  const shiftOptions = [
    { v: 'EMPTY', l: 'VACÍO', h: 0 },
    { v: 'H1', l: '07:00 - 15:45', h: 8.75 },
    { v: 'H2', l: '07:00 - 17:00', h: 10 },
    { v: 'H3', l: '07:00 - 18:00', h: 11 },
    { v: 'H4', l: '07:00 - 19:00', h: 12 }
  ];

  const nightShiftOptions = [
    { v: 'EMPTY', l: 'VACÍO', h: 0 },
    { v: 'A19', l: '19:00 - 05:30', h: 10.5 },
    { v: 'B21', l: '21:00 - 05:30', h: 8.5 }
  ];

  const extractMaterialInfo = useCallback((item: RawApiRow) => {
    const matStr = getProp(item, ['MATERIAL', 'Material', 'CodMaterial', 'MATERIAL_ID', 'CODIGO']);
    const nameStr = getProp(item, ['NOMBRE', 'NombreMaterial', 'Descripcion', 'NomMaterial', 'DESCRIPCION']);
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[0].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    const dims = parseDimensions(desc);
    return { code, desc, ...dims };
  }, []);

  const auditMapper = useCallback((data: RawApiRow[], centroId: string): UnifiedRow[] => {
    // Pasada previa: resuelve tIndiv real (Tiempos Ensamblado -> Maestro Carruseles) para cada
    // fila del batch, sin el resto de columnas — sirve para armar la lista de vecinos reales
    // (ancho/largo/esp/densidad + tIndiv) que usa el 3er nivel de respaldo más abajo
    // (ver estimarTiempoIndivPorVecino).
    const prepared = data.map(o => {
      const info = extractMaterialInfo(o);
      const tMatch = tiemposCatalogo.find(t => cleanCode(t.CodMaterial) === info.code && String(t.Centro).trim() === centroId);
      let tIndivReal = tMatch ? safeNum(tMatch.Tiempo || tMatch.Tiempo_Min) : 0;
      if (!tMatch) {
        const carruselMatch = kpiCarruselesData.find(c => cleanCode(c.Material) === info.code && String(c.Centro).trim() === centroId);
        if (carruselMatch) {
          const tiempoCorteMin = safeNum(carruselMatch.TiempoCorte) * CARRUSEL_TIEMPO_CORTE_A_MINUTOS;
          tIndivReal = tiempoCorteMin * CARRUSEL_ACTIVIDAD_ADICIONAL_FACTOR;
        }
      }
      return { o, info, tIndivReal };
    });

    const conocidos: MaterialGeomConocido[] = prepared
      .filter(p => p.tIndivReal > 0)
      .map(p => ({ ancho: p.info.ancho, largo: p.info.largo, esp: p.info.esp, dens: safeNum(p.info.dens), tIndiv: p.tIndivReal }));

    return prepared.map(({ o, info, tIndivReal }) => {
      const qty = safeNum(getProp(o, ['CANTIDAD', 'CANTPROGRAMADA', 'CANTPENDIENTE']));
      const densVal = safeNum(info.dens);
      const resp = String(getProp(o, ['RESPCONTROLPROD', 'RESPCTRLPROD', 'RespControlProd', 'RESP_CONTROL_PROD', 'RESPONSABLE'])).trim();

      // REGLA: Responsables de operación alterna (039, 036, 044)
      const isAlterna = ['039', '036', '044'].includes(resp);

      // REGLA: densidad >28 = 85 altura de bloque; densidad <28=103
      const usefulHeight = densVal >= 28 ? 85 : 103;
      const hTotal = info.esp * qty;

      // REGLA: división entre la altura total por referencia entre la alturadel bloque
      const subB = usefulHeight > 0 ? hTotal / usefulHeight : 0;

      const gap = 10;
      // Capacidad de giro: nro de subbloques que caben en el carrusel como cuerdas de un polígono inscrito
      // (no como división lineal de la circunferencia, que sobreestima la capacidad real)
      const radioCarrusel = CAROUSEL_DIAMETER_CM / 2;
      const cuerdaReq = info.ancho + gap;
      const capGiro = cuerdaReq > 0 && cuerdaReq < 2 * radioCarrusel
        ? Math.floor(Math.PI / Math.asin(cuerdaReq / (2 * radioCarrusel)))
        : (cuerdaReq > 0 ? 1 : 0);
      const slicesPerBlock = info.esp > 0 ? Math.floor(usefulHeight / info.esp) : 0;

      // Unidades por batch total (todos los bloques en la mesa)
      const undBatch = slicesPerBlock * capGiro;
      // Cargas = nro de subbloques calculados / capacidad de subbloques por carga completa del carrusel
      const nLoads = capGiro > 0 ? Math.ceil(subB / capGiro) : 0;

      // REGLA: sumarle 4 ciclos por la cúpula al número de la cantidad para el cálculo
      const totalCycles = qty + (nLoads * 4);

      // 3er nivel de respaldo: si ni Tiempos Ensamblado ni Maestro Carruseles tienen el material,
      // se estima a partir de vecinos reales del batch (ver estimarTiempoIndivPorVecino) — evita
      // dejar el tiempo operativo en 0 sin recurrir a una constante fija fuera de escala.
      let tIndiv = tIndivReal;
      let tIndivEstimado = false;
      let tIndivEstimadoNivel: '3a' | '3b' | '3c' | undefined;
      if (tIndiv === 0) {
        const estimado = estimarTiempoIndivPorVecino(
          { ancho: info.ancho, largo: info.largo, esp: info.esp, dens: densVal },
          conocidos
        );
        if (estimado) {
          tIndiv = estimado.valor;
          tIndivEstimado = true;
          tIndivEstimadoNivel = estimado.nivel;
        }
      }

      const looperMatch = kpiLooperData.find(k => cleanCode(k.Material) === info.code);
      const pesoUN = looperMatch ? safeNum(looperMatch.PesoUN) : (info.ancho * info.largo * info.esp * densVal) / 1000000;

      const fechaOrden = String(getProp(o, ['FECHAINICIO', 'FECHA', 'FECHA_INICIO'])).split('T')[0];
      // La orden Provisional trae un RANGO propio (FECHAINICIO..FECHAFIN), no una fecha puntual —
      // ej. material 30005655: FECHAINICIO 2026-07-17, FECHAFIN 2026-07-21. Si no viene FECHAFIN,
      // se trata como orden de un solo día (igual a FECHAINICIO).
      const fechaOrdenFin = String(getProp(o, ['FECHAFIN', 'FECHA_FIN'])).split('T')[0] || fechaOrden;

      // Pre-auditoría: un material puede tener varias necesidades candidatas (distintas áreas o
      // distintos Plan Grupo P2 con rangos de fecha distintos). Se prioriza la que TRASLAPA con el
      // rango de ESTA orden (no basta con que la fecha de inicio de la orden caiga dentro del rango
      // del plan — el plan puede cubrir solo el tramo final de la orden, como en el ejemplo de
      // arriba: plan 07-21..07-21 traslapa con orden 07-17..07-21 en el día 07-21). Si ningún
      // candidato traslapa, se usa el primero como referencia y se marca origenAmbiguo.
      const origenCandidatos = materialAreaMap.get(String(Number(info.code))) || [];
      const origenEnRango = origenCandidatos.find(c =>
        fechaOrden && fechaOrdenFin && c.fecha_inicio !== '—' && c.fecha_fin !== '—' &&
        fechaOrden <= c.fecha_fin && fechaOrdenFin >= c.fecha_inicio
      );
      const origen = origenEnRango || origenCandidatos[0];
      const origenAmbiguo = origenCandidatos.length > 1 && !origenEnRango;

      return {
        orden: getProp(o, ['ORDENPREVISIONAL', 'ORDEN']) || '—',
        fecha: fechaOrden,
        fechaFin: fechaOrdenFin,
        material: info.code,
        descripcion: info.desc,
        ancho: info.ancho, largo: info.largo, esp: info.esp, dens: info.dens,
        cant: qty,
        peso: pesoUN * qty,
        alturaTotal: hTotal,
        subBloques: subB,
        nroCargas: nLoads,
        undBatch,
        tIndiv,
        tIndivEstimado,
        tIndivEstimadoNivel,
        tTotal: (tIndiv * totalCycles) / 60,
        apertura: info.apertura,
        categoria: getProp(o, ['CATEGORIA', 'Categoria', 'CATEGORIA_DESC']) || '—',
        centro: centroId,
        almacen: getProp(o, ['Almacen', 'ALMACEN', 'CENTRO']),
        responsable: resp,
        maquina: getProp(o, ['MAQUINA', 'RECURSO', 'ID_MAQUINA', 'Maquina']).trim(),
        isAlterna,
        origenArea: origen?.area,
        origenCodigoGrupo: origen?.codigo_grupo,
        origenCodigoPlanGrupo: origen?.codigo_plan_grupo,
        origenAmbiguo,
        origenCandidatosCount: origenCandidatos.length
      };
    });
  }, [extractMaterialInfo, tiemposCatalogo, kpiCarruselesData, kpiLooperData, materialAreaMap]);

  // boundary 'future' (Provisionales): descarta fechas pasadas SIEMPRE, sin importar qué haya
  // seleccionado el usuario — ni siquiera "Ver Todo el Plan" (selección vacía) puede traer una
  // orden provisional de ayer, porque por lógica de sistema no debería existir/evaluarse.
  // boundary 'past' (FERT): descarta lo que quede después del siguiente día laborable — no "hoy" a
  // secas — para dar la ventana de 2 días (hoy + siguiente laborable) que pidió el negocio.
  const getFilteredData = useCallback((rawData: RawApiRow[], centro: string, dates: Set<string>, boundary: 'future' | 'past') => {
    // Auditamos responsables de Corte (013, 038, 039, 044, 036, 034, 002)
    const allowed = centro === '1000' ? ['013', '038', '039', '044', '036', '034'] : ['002', '038', '039', '044', '036', '034'];
    return rawData.filter(o => {
      const c = String(getProp(o, ['Centro', 'CENTRO', 'centro'])).trim();
      const r = String(getProp(o, ['RESPCONTROLPROD', 'RESPCTRLPROD', 'RespControlProd', 'RESP_CONTROL_PROD', 'RESPONSABLE'])).trim();
      const dateRaw = String(getProp(o, ['FECHAINICIO', 'FECHA', 'FECHA_INICIO'])).trim();
      const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const dateFinRaw = String(getProp(o, ['FECHAFIN', 'FECHA_FIN'])).trim();
      const dateFin = (dateFinRaw.includes('T') ? dateFinRaw.split('T')[0] : dateFinRaw) || date;
      if (boundary === 'future' && date < todayStr) return false;
      if (boundary === 'past' && date > nextBusinessDayStr) return false;
      if (dates.size === 0) return c === centro && allowed.includes(r);
      // La orden trae un RANGO (FECHAINICIO..FECHAFIN), no una fecha puntual: coincide si CUALQUIER
      // día seleccionado en el calendario cae dentro de ese rango, no solo si coincide con el inicio.
      const enRango = Array.from(dates).some(d => d >= date && d <= dateFin);
      return c === centro && allowed.includes(r) && enRango;
    });
  }, [todayStr, nextBusinessDayStr]);

  const provAuditUIO = useMemo(() => auditMapper(getFilteredData(ordenesProvisionales, '1000', selectedDatesProv, 'future'), '1000'), [auditMapper, getFilteredData, ordenesProvisionales, selectedDatesProv]);
  const provAuditGYE = useMemo(() => auditMapper(getFilteredData(ordenesProvisionales, '2000', selectedDatesProv, 'future'), '2000'), [auditMapper, getFilteredData, ordenesProvisionales, selectedDatesProv]);
  const fertAuditUIO = useMemo(() => auditMapper(getFilteredData(ordenesFert, '1000', selectedDatesFert, 'past'), '1000'), [auditMapper, getFilteredData, ordenesFert, selectedDatesFert]);
  const fertAuditGYE = useMemo(() => auditMapper(getFilteredData(ordenesFert, '2000', selectedDatesFert, 'past'), '2000'), [auditMapper, getFilteredData, ordenesFert, selectedDatesFert]);

  // Puntos en el calendario: cada selector solo marca los días con datos de SU propia fuente
  // (antes era una sola lista combinada, mostraba puntos de FERT en el selector de Provisionales y viceversa).
  const datesWithProvOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenesProvisionales.forEach(o => {
      const d = String(getProp(o, ['FECHA', 'FECHAINICIO', 'FECHA_INICIO']) || '').trim();
      if (d && d !== 'null') dates.add(d.split('T')[0]);
    });
    return dates;
  }, [ordenesProvisionales]);

  const datesWithFertOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenesFert.forEach(o => {
      const d = String(getProp(o, ['FECHA', 'FECHAINICIO', 'FECHA_INICIO']) || '').trim();
      if (d && d !== 'null') dates.add(d.split('T')[0]);
    });
    return dates;
  }, [ordenesFert]);

  const toggleProvDate = useCallback((dStr: string) => {
    setSelectedDatesProv(prev => {
      const n = new Set(prev);
      if (n.has(dStr)) n.delete(dStr); else n.add(dStr);
      return n;
    });
  }, []);

  const toggleFertDate = useCallback((dStr: string) => {
    setSelectedDatesFert(prev => {
      const n = new Set(prev);
      if (n.has(dStr)) n.delete(dStr); else n.add(dStr);
      return n;
    });
  }, []);

  const fetchDataAsync = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return (name.includes('corte y laminado') || name.includes('laminado'));
      });
      setGrupos(filteredGroups);
      
      const [provsRes, fertsRes, invRes, timesRes, skillsRes, maintRes, kpiRes, carruselesRes] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getInventarioAñoActual().catch(() => ({ data: [] })),
        serviciosService.getTiemposEnsamblado(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getCuboHabilidadesOP().catch(() => ({ data: [] })),
        serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] })),
        serviciosService.getKPIMAestroLooper().catch(() => ({ data: [] })),
        serviciosService.getKPIMaestroCarruseles().catch(() => ({ data: [] }))
      ]);

      setOrdenesProvisionales(provsRes.data?.data || provsRes.data || []);
      setOrdenesFert(fertsRes.data?.data || fertsRes.data || []);
      setInventarioSAP(invRes.data || []);
      setTiemposCatalogo(timesRes.data?.data || timesRes.data || []);
      setMantenimientosSAP(Array.isArray(maintRes.data) ? maintRes.data : []);
      setKpiLooperData(kpiRes.data || []);
      setKpiCarruselesData(carruselesRes.data?.data || carruselesRes.data || []);
      
      const skills: RawApiRow[] = Array.isArray(skillsRes.data) ? skillsRes.data : [];
      setOperadoresCorte(skills.filter((s) => String(getProp(s, ['LineaProceso', 'LINEA_PROCESO'])).toUpperCase().includes('CORTE')));
    } catch (e) {
      console.error('Error sincronización', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchNecesidadesPlanta = useCallback(async () => {
    setNecesidadesPlantaLoading(true);
    try {
      const [restrsRes, gruposRes] = await Promise.all([
        restriccionService.getAll(),
        grupoService.getAll()
      ]);

      // 1. Restricción ALMACEN_CONSUMO propia de Corte Espuma (codigo_grupo = CODIGO_GRUPO_ESPUMA,
      // "Taller de Corte"): su valor contiene los nombres de grupo (sin espacios/tildes) a filtrar
      // de la tabla de grupos. Se filtra por codigo_grupo propio (no cualquier fila con ese nombre)
      // para no compartir configuración con la de Laminado (codigo_grupo 8), que tiene su propia
      // fila y necesita ver "Forros" — algo que Espuma no debe considerar (Forros consume rollos
      // laminados, no láminas de espuma cortada).
      const normalizeName = (s: string) => String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();

      const almacenConsumoNames = (restrsRes.data || [])
        .filter((r) => r.nombre_restriccion === 'ALMACEN_CONSUMO' && r.codigo_grupo === CODIGO_GRUPO_ESPUMA)
        .flatMap((r) => String(r.valor_restriccion || '').split(/[,&]/).map((v: string) => normalizeName(v)))
        .filter((v: string) => v !== '');

      const gruposFiltrados = (gruposRes.data || []).filter((g) => almacenConsumoNames.includes(normalizeName(g.nombre_grupo)));
      const gruposCodigos = gruposFiltrados.map((g) => g.codigo_grupo);
      const grupoPorCodigo = new Map(gruposFiltrados.map((g) => [g.codigo_grupo, g]));

      if (gruposCodigos.length === 0) {
        setNecesidadesPlantaData({});
        return;
      }

      // 2. PlanGrupo activos cuyo valor coincide con "Plan Táctico - Centro <centro> - P2" y cuyo grupo esté en la lista anterior.
      // "Venta Externa" alimenta necesidad tanto de Espuma como de Laminado (planes "...P2 - Espumas"
      // y "...P2 - Rollos" respectivamente) — aquí solo cuenta la variante "Espumas".
      const planGruposRes = await planGrupoService.getAll();
      const planesActivos = (planGruposRes.data || []).filter((pg) => {
        const valor = String(pg.valor || '').trim();
        if (pg.estado !== 'A' || !gruposCodigos.includes(pg.codigo_grupo)) return false;
        if (!/plan\s*t[aá]ctico.*centro.*p2/i.test(valor)) return false;
        const esVentaExterna = /venta\s*externa/i.test(grupoPorCodigo.get(pg.codigo_grupo)?.nombre_grupo || '');
        if (esVentaExterna && !/espuma/i.test(valor)) return false;
        return true;
      });

      const planGrupoCodigos = planesActivos.map((pg) => pg.codigo_plan_grupo);
      const planPorCodigo = new Map(planesActivos.map((pg) => [pg.codigo_plan_grupo, pg]));

      if (planGrupoCodigos.length === 0) {
        setNecesidadesPlantaData({});
        return;
      }

      // 3. DetalleTactico asociado a los PlanGrupo encontrados
      const detallesRes = await detalleTacticoService.getAll();
      const detalles = (detallesRes.data || []).filter((d) => planGrupoCodigos.includes(d.codigo_plan_grupo));

      const grouped: Record<string, NecesidadPlantaRow[]> = {};
      detalles.forEach((d) => {
        const plan = planPorCodigo.get(d.codigo_plan_grupo);
        const grupo = plan ? grupoPorCodigo.get(plan.codigo_grupo) : undefined;
        const area = grupo?.nombre_grupo || 'Sin Área Asignada';
        if (!grouped[area]) grouped[area] = [];
        grouped[area].push({
          codigo_material: d.codigo_material,
          cantidad_produccion_neta: d.cantidad_produccion_neta,
          fecha_inicio: plan?.fecha_inicio_plan ? String(plan.fecha_inicio_plan).split('T')[0] : '—',
          fecha_fin: plan?.fecha_fin_plan ? String(plan.fecha_fin_plan).split('T')[0] : '—',
          codigo_grupo: plan?.codigo_grupo ?? 0,
          codigo_plan_grupo: d.codigo_plan_grupo
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
    setMounted(true);
    const today = new Date();
    setViewDateProv(today);
    setViewDateFert(today);
    setSelectedDatesProv(new Set([format(today, 'yyyy-MM-dd')]));
    // FERT arranca en "Ver Todo" (sin selección): su rango ya está 100% acotado por regla de
    // negocio (todo lo pasado + siguiente día laborable), no hace falta forzar "solo hoy" al montar.
    setSelectedDatesFert(new Set());
  }, []);

  useEffect(() => { if (mounted) { fetchDataAsync(); fetchNecesidadesPlanta(); } }, [mounted, fetchDataAsync, fetchNecesidadesPlanta]);

  const updateConfig = (planta: 'UIO' | 'GYE', machine: string, field: string, value: string | number) => {
    const setFn = planta === 'UIO' ? setUioConfig : setGyeConfig;
    setFn((prev) => ({
      ...prev,
      shifts: { ...prev.shifts, [machine]: { ...prev.shifts[machine], [field]: value } }
    }));
  };

  // Duración en horas de una fila de Mantenimiento SAP. El campo real es Duracion_Minutos
  // (en minutos); T_MTTO_PLANIFICADO no existe en el endpoint pero se conserva como
  // resguardo por si alguna variante del servicio lo llega a incluir (en horas).
  const getMttoDurationH = (row: RawApiRow): number => {
    const durMin = safeNum(getProp(row, ['Duracion_Minutos']));
    if (durMin > 0) return durMin / 60;
    const legacyH = safeNum(getProp(row, ['T_MTTO_PLANIFICADO', 't_mtto_planificado']));
    if (legacyH > 0) return legacyH;
    const ini = new Date(getProp(row, ['FECHA_OT_PRG_INI']));
    const fin = new Date(getProp(row, ['FECHA_OT_PRG_FIN']));
    if (isValid(ini) && isValid(fin)) return (fin.getTime() - ini.getTime()) / 3600000;
    return 0;
  };

  // El endpoint de SAP no expone un ID de orden (no existe OT_PRG_ID): la misma ventana de
  // mantenimiento (misma máquina + mismo inicio/fin) se repite una vez por cada línea de
  // proceso/responsable que usa esa máquina (fan-out del join de origen). Se deduplica por
  // ID_MAQUINA + FECHA_OT_PRG_INI + FECHA_OT_PRG_FIN para quedarnos con una sola línea por
  // ventana de mantenimiento real.
  const uniqueMantenimientosSAP = useMemo(() => {
    const seen = new Set<string>();
    return mantenimientosSAP.filter(m => {
      const key = [
        getProp(m, ['ID_MAQUINA']),
        getProp(m, ['FECHA_OT_PRG_INI']),
        getProp(m, ['FECHA_OT_PRG_FIN']),
      ].join('|').trim().toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [mantenimientosSAP]);

  // Vincula un ID_MAQUINA de Mantenimiento SAP con la tarjeta de cabecera del resumen.
  // El endpoint no expone PLANTA como texto: el campo confiable es Centro (1000 = UIO,
  // 2000 = GYE). Si no viene informado, se busca en ambas listas de máquinas (el ID de la
  // máquina ya acota el resultado salvo para CR01, que existe en ambas plantas).
  const resolveMachineLink = (idMaquina: string, centro: string | number, plantaTexto?: string) => {
    const id = String(idMaquina || '').trim().toUpperCase();
    if (!id) return null;
    const centroStr = String(centro ?? '').trim();
    const pStr = String(plantaTexto || '').toUpperCase();
    let candidates: ('UIO' | 'GYE')[];
    if (centroStr === '1000') candidates = ['UIO'];
    else if (centroStr === '2000') candidates = ['GYE'];
    else if (pStr.includes('QUITO')) candidates = ['UIO'];
    else if (pStr.includes('GUAYAQUIL')) candidates = ['GYE'];
    else candidates = ['UIO', 'GYE'];
    for (const planta of candidates) {
      const match = MACHINES_BY_PLANTA[planta].find(m => m.id === id || id.includes(m.id));
      if (match) return { ...match, planta };
    }
    return null;
  };

  const getMttoTime = (machineId: string, planta: string) => {
    const target = machineId.trim().toUpperCase();
    // "Capacidad Operativa" combina Provisionales + FERT (ver renderMachineCol: allAudit), así que
    // el mantenimiento a descontar debe considerar la UNIÓN de los días seleccionados en ambos
    // selectores — ya no hay un único selector global de fecha.
    const diasEvaluados = new Set([...selectedDatesProv, ...selectedDatesFert]);
    return uniqueMantenimientosSAP
      .filter(m => {
        const idMaquina = getProp(m, ['ID_MAQUINA', 'MAQUINA']);
        const link = resolveMachineLink(idMaquina, getProp(m, ['Centro', 'CENTRO']), getProp(m, ['PLANTA']));
        if (!link || link.id !== target || link.planta !== planta) return false;
        // Extracción de fecha (formato SAP ISO: 2026-07-09T19:00:00.000Z) para comparar contra los días
        // seleccionados en los calendarios, con el mismo criterio usado en getFilteredData.
        const dateRaw = String(getProp(m, ['FECHA_OT_PRG_INI'])).trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        return diasEvaluados.size === 0 || diasEvaluados.has(date);
      })
      .reduce((sum, row) => sum + getMttoDurationH(row), 0);
  };

  const renderMachineCol = (id: string, name: string, planta: 'UIO' | 'GYE') => {
    const config = planta === 'UIO' ? uioConfig.shifts[id] : gyeConfig.shifts[id];
    const performance = planta === 'UIO' ? uioConfig.performance : gyeConfig.performance;
    
    const hDay = shiftOptions.find(o => o.v === config.day)?.h || 0;
    const hNight = nightShiftOptions.find(o => o.v === config.night)?.h || 0;
    const p1 = (config.paro1 || 0) / 100;
    const p2 = (config.paro2 || 0) / 100;
    
    const tTotal = ((hDay * (1 - p1)) + (hNight * (1 - p2))) * (performance / 100) * EFFICIENCY_FACTOR;
    const allAudit = planta === 'UIO' ? [...provAuditUIO, ...fertAuditUIO] : [...provAuditGYE, ...fertAuditGYE];
    const plannedH = allAudit.filter(r => r.maquina === id || r.maquina.includes(id) || r.responsable === id).reduce((s, r) => s + r.tTotal, 0);
    const occupancy = tTotal > 0 ? (plannedH / tTotal) * 100 : 0;
    const mttoHours = getMttoTime(id, planta);

    return (
      <div key={id} className="col-span-1 border-r border-gray-100 flex flex-col font-sans">
        <div className="p-3 border-b border-gray-100 text-center">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-tighter">{id}</p>
          <p className="text-[8px] font-bold text-gray-400 uppercase truncate">{name}</p>
        </div>
        <div className="p-4 space-y-4 flex-1 text-left">
          <div className="space-y-1">
             <p className="text-[7px] font-black text-gray-400 uppercase mb-1">MTTO PREVENTIVO</p>
             <div className="bg-indigo-50 border border-indigo-200 rounded p-1.5 text-center">
                <span className="text-[10px] font-black text-indigo-700">{mttoHours.toFixed(2)}H</span>
             </div>
          </div>
          <div className="space-y-2">
            <p className="text-[7px] font-black text-gray-400 uppercase">TURNO DÍA</p>
            <select value={config.day} onChange={e => updateConfig(planta, id, 'day', e.target.value)} className="w-full bg-white text-amber-600 font-black text-[10px] rounded px-2 py-1 outline-none border border-gray-200">
              {shiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <select value={config.op1D} onChange={e => updateConfig(planta, id, 'op1D', e.target.value)} className="w-full bg-white text-gray-600 text-[9px] rounded px-2 py-1 outline-none border border-gray-200">
              <option value="">— OP1 —</option>
              {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>{getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])}</option>)}
            </select>
            <select value={config.op2D} onChange={e => updateConfig(planta, id, 'op2D', e.target.value)} className="w-full bg-white text-gray-600 text-[9px] rounded px-2 py-1 outline-none border border-gray-200">
              <option value="">— OP2 AYUD —</option>
              {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>{getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])}</option>)}
            </select>
          </div>
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <p className="text-[7px] font-black text-gray-400 uppercase">TURNO NOCHE</p>
            <select value={config.night} onChange={e => updateConfig(planta, id, 'night', e.target.value)} className="w-full bg-white text-purple-600 font-black text-[10px] rounded px-2 py-1 outline-none border border-gray-200">
              {nightShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <select value={config.op1N} onChange={e => updateConfig(planta, id, 'op1N', e.target.value)} className="w-full bg-white text-gray-600 text-[9px] rounded px-2 py-1 outline-none border border-gray-200">
              <option value="">— OP1 —</option>
              {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>{getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])}</option>)}
            </select>
            <select value={config.op2N} onChange={e => updateConfig(planta, id, 'op2N', e.target.value)} className="w-full bg-white text-gray-600 text-[9px] rounded px-2 py-1 outline-none border border-gray-200">
              <option value="">— OP2 AYUD —</option>
              {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>{getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])}</option>)}
            </select>
          </div>
          <div className="space-y-2 pt-2 border-t border-gray-100">
             <div className="flex items-center gap-2 bg-amber-50 p-1.5 rounded border border-amber-200">
                <span className="text-[7px] font-black text-amber-700 uppercase flex-1">PARO T1</span>
                <input type="number" value={config.paro1} onChange={e => updateConfig(planta, id, 'paro1', safeNum(e.target.value))} className="w-8 bg-transparent text-gray-800 text-[10px] font-black outline-none text-right" />
                <span className="text-[7px] text-gray-500">%</span>
             </div>
             <div className="flex items-center gap-2 bg-orange-50 p-1.5 rounded border border-orange-200">
                <span className="text-[7px] font-black text-orange-700 uppercase flex-1">PARO T2</span>
                <input type="number" value={config.paro2} onChange={e => updateConfig(planta, id, 'paro2', safeNum(e.target.value))} className="w-8 bg-transparent text-gray-800 text-[10px] font-black outline-none text-right" />
                <span className="text-[7px] text-gray-500">%</span>
             </div>
          </div>
        </div>
        <div className="p-3 bg-gray-50 border-t border-gray-100 space-y-2 mt-auto">
           <div className="pt-1">
              <p className="text-[7px] font-black text-gray-400 uppercase mb-0.5">OCUPACIÓN RECURSO</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden"><div className={cn("h-full", occupancy > 100 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${Math.min(occupancy, 100)}%` }} /></div>
                <span className="text-[9px] font-black text-gray-800">{occupancy.toFixed(1)}%</span>
              </div>
           </div>
        </div>
      </div>
    );
  };

  const renderDashboard = (planta: 'UIO' | 'GYE') => {
    const config = planta === 'UIO' ? uioConfig : gyeConfig;
    const machines = MACHINES_BY_PLANTA[planta];

    const totalH = Object.keys(config.shifts).reduce((s, m) => {
        const c = config.shifts[m];
        const hD = shiftOptions.find(o => o.v === c.day)?.h || 0;
        const hN = nightShiftOptions.find(o => o.v === c.night)?.h || 0;
        return s + (((hD * (1 - c.paro1/100)) + (hN * (1 - c.paro2/100))) * (config.performance/100) * EFFICIENCY_FACTOR);
    }, 0);

    const allAuditProv = planta === 'UIO' ? provAuditUIO : provAuditGYE;
    const allAuditFert = planta === 'UIO' ? fertAuditUIO : fertAuditGYE;
    
    // REGLA: Capacidad planificada = suma integra de horas de órdenes para el centro
    const totalPlannedH = allAuditProv.reduce((s, r) => s + r.tTotal, 0) + allAuditFert.reduce((s, r) => s + r.tTotal, 0);
    const globalOccupancy = totalH > 0 ? (totalPlannedH / totalH) * 100 : 0;

    // REGLA: Desglose por proceso de corte — carruseles vs verticales
    // Centro 2000 (GYE): carruseles 002-038, verticales 039. Centro 1000 (UIO): carruseles 013-038-044, verticales 036-039.
    const CARRUSEL_RESP = planta === 'GYE' ? ['002', '038'] : ['013', '038', '044'];
    const VERTICAL_RESP = planta === 'GYE' ? ['039'] : ['036', '039'];
    const sumByResp = (resps: string[]) => allAuditProv.filter(r => resps.includes(r.responsable)).reduce((s, r) => s + r.tTotal, 0)
      + allAuditFert.filter(r => resps.includes(r.responsable)).reduce((s, r) => s + r.tTotal, 0);
    const plannedCarrusel = sumByResp(CARRUSEL_RESP);
    const plannedVertical = sumByResp(VERTICAL_RESP);
    const occCarrusel = totalH > 0 ? (plannedCarrusel / totalH) * 100 : 0;
    const occVertical = totalH > 0 ? (plannedVertical / totalH) * 100 : 0;

    return (
      <div className="rounded-2xl border border-gray-100 shadow-sm bg-white overflow-hidden mb-10 text-left font-sans">
        <div className="grid grid-cols-12">
          <div className="col-span-3 p-8 border-r border-gray-100 bg-gray-50/50 flex flex-col justify-between text-left">
            <div className="space-y-8">
              <div>
                <p className="text-[9px] font-black uppercase text-indigo-600 tracking-widest mb-1">UBICACIÓN TÉCNICA</p>
                <h3 className="text-4xl font-black tracking-tighter text-gray-800">{planta === 'UIO' ? 'QUITO' : 'GYE'}</h3>
              </div>
              <div className="pt-8 border-t border-gray-100 text-left">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">RENDIMIENTO (%)</p>
                <input type="number" value={config.performance} onChange={e => planta === 'UIO' ? setUioConfig({...uioConfig, performance: safeNum(e.target.value)}) : setGyeConfig({...gyeConfig, performance: safeNum(e.target.value)})}
                  className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2 text-xl font-black text-emerald-600 outline-none focus:border-emerald-500" />
              </div>
            </div>

            <div className="space-y-6">
              <div className="text-left bg-blue-50/30 rounded-xl p-3">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">CAPACIDAD TOTAL</p>
                <div className="flex items-baseline gap-2"><span className="text-5xl font-black text-blue-700 tracking-tighter">{totalH.toFixed(1)}</span><span className="text-xs font-black text-gray-400 uppercase">HORAS</span></div>
              </div>

              <div className="text-left border-t border-gray-100 pt-4 bg-emerald-50/30 rounded-xl p-3">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">CAPACIDAD PLANIFICADA</p>
                <div className="flex items-baseline gap-2"><span className="text-3xl font-black text-emerald-700 tracking-tighter">{totalPlannedH.toFixed(1)}</span><span className="text-[10px] font-black text-gray-400 uppercase">H</span></div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-cyan-600 uppercase tracking-widest w-16">Carruseles</span>
                    <span className="text-[11px] font-black tabular-nums text-gray-800">{plannedCarrusel.toFixed(1)}h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-fuchsia-600 uppercase tracking-widest w-16">Verticales</span>
                    <span className="text-[11px] font-black tabular-nums text-gray-800">{plannedVertical.toFixed(1)}h</span>
                  </div>
                </div>
              </div>

              <div className="text-left">
                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">OCUPACIÓN GLOBAL</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden"><div className={cn("h-full transition-all duration-500", globalOccupancy > 100 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${Math.min(globalOccupancy, 100)}%` }} /></div>
                  <span className="text-sm font-black tabular-nums text-gray-800">{globalOccupancy.toFixed(1)}%</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-cyan-600 uppercase tracking-widest w-16">Carruseles</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${Math.min(occCarrusel, 100)}%` }} /></div>
                    <span className="text-[11px] font-black tabular-nums w-10 text-right text-gray-800">{occCarrusel.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-fuchsia-600 uppercase tracking-widest w-16">Verticales</span>
                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-fuchsia-500 transition-all duration-500" style={{ width: `${Math.min(occVertical, 100)}%` }} /></div>
                    <span className="text-[11px] font-black tabular-nums w-10 text-right text-gray-800">{occVertical.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className={cn("col-span-9 grid h-full", planta === 'UIO' ? 'grid-cols-4' : 'grid-cols-3')}>{machines.map(m => renderMachineCol(m.id, m.n, planta))}</div>
        </div>
      </div>
    );
  };

  // showOrigen: la columna "Grupo / Área Origen" solo tiene sentido en Provisionales — cruza contra
  // "Necesidades Planta" (P2, demanda pendiente). En FERT las órdenes ya son "P3" aprobadas y
  // ejecutadas, así que ese cruce no aplica; ahí solo se usan para sumar horas de ocupación.
  const renderAuditTable = (data: UnifiedRow[], title: string, showOrigen: boolean) => {
    const grouped = data.reduce((acc, row) => {
      const key = `${row.apertura}|${row.categoria}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {} as Record<string, UnifiedRow[]>);

    return (
      <div className="space-y-4 text-left">
        <h3 className="text-xs font-black uppercase text-slate-800 tracking-widest flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-600" /> {title} ({data.length})</h3>
        <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-center border-collapse text-[10px]">
              <thead className="bg-gray-50 sticky top-0 z-20 text-[9px] font-bold uppercase text-gray-400">
                <tr>
                  <th className="px-4 py-4 border-r border-gray-100 text-left w-32">Material</th>
                  <th className="px-6 py-4 border-r border-gray-100 text-left min-w-[200px]">Descripción</th>
                  <th className="px-2 py-4 border-r border-gray-100">Ancho</th>
                  <th className="px-2 py-4 border-r border-gray-100">Largo</th>
                  <th className="px-2 py-4 border-r border-gray-100 text-blue-600">Esp.</th>
                  <th className="px-2 py-4 border-r border-gray-100">Dens.</th>
                  <th className="px-3 py-4 border-r border-gray-100 font-black bg-yellow-50/50 text-yellow-700">Cant.</th>
                  <th className="px-3 py-4 border-r border-gray-100">Peso Kg</th>
                  <th className="px-3 py-4 border-r border-gray-100 bg-gray-100/70">Alt. Total</th>
                  <th className="px-3 py-4 border-r border-gray-100 bg-indigo-50/50 text-indigo-700">T. Indiv</th>
                  <th className="px-4 py-4 border-r border-gray-100 bg-indigo-50 text-indigo-700 font-black">T. Total H</th>
                  <th className="px-3 py-4 border-r border-gray-100 bg-amber-50/50 text-amber-700 font-black">Cargas</th>
                  <th className="px-3 py-4 border-r border-gray-100">Und/Batch</th>
                  <th className="px-3 py-4 border-r border-gray-100 font-black text-indigo-600"># SUB_Bloque</th>
                  <th className="px-3 py-4 border-r border-gray-100 bg-gray-100/50 uppercase">Op. Alterna (39-36-44)</th>
                  <th className="px-3 py-4 border-r border-gray-100 uppercase">Planta/ALM</th>
                  <th className="px-3 py-4 border-r border-gray-100">Resp CP</th>
                  <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                  <th className={cn("px-3 py-4 uppercase", showOrigen ? "border-r border-gray-100" : "")}>Fecha</th>
                  {showOrigen && <th className="px-3 py-4 uppercase text-left bg-gray-100/50">Grupo / Área Origen</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
                {Object.entries(grouped).map(([key, items]) => {
                  const isExp = expandedGroups.has(key);
                  const tKg = items.reduce((s, r) => s + r.peso, 0);
                  const tCant = items.reduce((s, r) => s + r.cant, 0);
                  const tH = items.reduce((s, r) => s + r.tTotal, 0);
                  const tBatches = items.reduce((s, r) => s + r.nroCargas, 0);
                  return (
                    <React.Fragment key={key}>
                      <tr className="bg-slate-50 cursor-pointer hover:bg-indigo-50 transition-colors" onClick={() => {const n = new Set(expandedGroups); if (isExp) { n.delete(key); } else { n.add(key); } setExpandedGroups(n);}}>
                        <td className="px-4 py-3 text-left flex items-center gap-2 font-black text-indigo-900 border-r border-gray-100">
                           {isExp ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                           {key.split('|')[0]} — {key.split('|')[1]}
                        </td>
                        <td colSpan={4} className="text-right pr-6 italic opacity-30 uppercase font-black tracking-widest text-[9px]">Subtotales de Bloque:</td>
                        <td className="border-r border-slate-50"></td>
                        <td className="px-3 py-3 font-black text-slate-900 bg-yellow-50 text-center text-[12px]">{formatNum(tCant, 0)}</td>
                        <td className="px-3 py-3 font-black text-slate-400 opacity-40">{formatNum(tKg, 0)}</td>
                        <td colSpan={2}></td>
                        <td className="px-4 py-3 bg-indigo-50 text-indigo-700 font-black">{tH.toFixed(2)}h</td>
                        <td className="px-3 py-3 bg-amber-50 text-amber-700 font-black">{tBatches}</td>
                        <td colSpan={showOrigen ? 8 : 7}></td>
                      </tr>
                      {isExp && items.map((row, idx) => (
                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors font-mono text-[9px]">
                          <td className="px-4 py-2 border-r border-slate-50 text-indigo-600 font-black pl-8 text-left">{row.material}</td>
                          <td className="px-6 py-2 border-r border-slate-50 text-left uppercase truncate max-w-[200px]">{row.descripcion}</td>
                          <td className="px-2 py-2 border-r border-slate-50">{row.ancho}</td>
                          <td className="px-2 py-2 border-r border-slate-50">{row.largo}</td>
                          <td className="px-2 py-2 border-r border-slate-50 text-blue-600 font-black">{row.esp}</td>
                          <td className="px-2 py-2 border-r border-slate-50">{row.dens}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-900 font-black bg-yellow-50">{row.cant}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-400">{formatNum(row.peso, 1)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 bg-gray-50 text-slate-900 font-black">{row.alturaTotal.toFixed(1)}</td>

                          {/* COLUMNA T. INDIV — rojo solo si no hubo NINGÚN vecino real para estimar
                              (ver estimarTiempoIndivPorVecino); ámbar/naranja según qué tan buena
                              fue la evidencia usada para estimar (3a mejor, 3c más débil) */}
                          <td className={cn(
                            "px-3 py-2 border-r border-slate-50",
                            row.tIndiv === 0 ? "bg-red-500 text-white animate-pulse font-black"
                              : row.tIndivEstimadoNivel === '3c' ? "bg-orange-50 text-orange-700 font-black"
                              : row.tIndivEstimado ? "bg-amber-50 text-amber-700 font-black" : "text-indigo-400"
                          )}>
                            {row.tIndiv.toFixed(2)}
                            {row.tIndiv === 0 && <span className="block text-[6px]">⚠️ REVISAR</span>}
                            {row.tIndivEstimado && row.tIndiv > 0 && (
                              <span className="block text-[6px]">
                                ≈ EST. {row.tIndivEstimadoNivel === '3a' ? '(familia)' : row.tIndivEstimadoNivel === '3b' ? '(densidad)' : '(general)'}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-2 border-r border-gray-100 bg-indigo-50 text-indigo-800 font-black">{row.tTotal.toFixed(2)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 bg-amber-50 text-amber-700 font-black">{row.nroCargas}</td>
                          <td className="px-3 py-2 border-r border-slate-50 font-black">{Math.round(row.undBatch)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 font-black text-indigo-900">{row.subBloques.toFixed(3)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 font-black text-slate-500 bg-gray-50">
                             {row.isAlterna ? <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 text-[7px] px-1 font-black">CARGA ALTERNA</Badge> : '—'}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-400 font-black">{row.centro}/{row.almacen}</td>
                          <td className="px-3 py-2 border-r border-slate-50">{row.responsable}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-400">{row.orden}</td>
                          <td className={cn("px-3 py-2 text-slate-300", showOrigen ? "border-r border-slate-50" : "")}>
                            {row.fechaFin && row.fechaFin !== row.fecha ? `${row.fecha} → ${row.fechaFin}` : row.fecha}
                          </td>
                          {showOrigen && (
                            <td className="px-3 py-2 text-left">
                              {row.origenArea ? (
                                <div className="flex flex-col items-start">
                                  <span className="font-black text-slate-700 uppercase">{row.origenArea}</span>
                                  <span className="text-[8px] text-slate-400">Grupo #{row.origenCodigoGrupo} · Plan Grupo #{row.origenCodigoPlanGrupo}</span>
                                  {row.origenAmbiguo && (
                                    <span className="text-[7px] text-amber-500 font-black uppercase mt-0.5" title="El material tiene varias necesidades candidatas y ninguna cubre la fecha de esta orden">
                                      ⚠ {row.origenCandidatosCount} necesidades, fecha fuera de rango
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-red-400 italic font-black text-[9px] uppercase">Sin necesidad detectada</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const headerStyles = "p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left";

  if (!mounted) return <div className={headerStyles} />;

  return (
    <div className={headerStyles}>
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl shadow-inner"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div><h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2><p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Capacidad Carrusel 3.2m | Auditoría Técnica SAP</p></div>
        </div>
        <div className="flex items-center gap-3">
           <Button onClick={() => { fetchDataAsync(); fetchNecesidadesPlanta(); }} disabled={isLoading} className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2">{isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} SINCRONIZAR SAP</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[ { v: 'resumen', l: 'Capacidad Operativa', i: LayoutDashboard }, { v: 'necesidadesPlanta', l: 'Necesidades Planta', i: Database }, { v: 'ordenes', l: 'Provisionales', i: Package }, { v: 'ordenesFert', l: 'Órdenes FERT', i: ShoppingCart }, { v: 'mantenimiento', l: 'Mantenimiento SAP', i: Wrench } ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-red-600 rounded-xl"><tab.i className="w-4 h-4" /> {tab.l}</TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="resumen" className="animate-in fade-in duration-300">{renderDashboard('UIO')}{renderDashboard('GYE')}</TabsContent>
          <TabsContent value="necesidadesPlanta" className="animate-in fade-in duration-300 space-y-6 text-left">
            <div className="flex items-center justify-end">
              <Button onClick={fetchNecesidadesPlanta} disabled={necesidadesPlantaLoading} className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-9 px-5 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2">
                {necesidadesPlantaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Actualizar
              </Button>
            </div>
            {necesidadesPlantaLoading ? (
              <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : (
              <ConsolidatedNeedsTable rows={necesidadesPlantaConsolidada} areaCounts={necesidadesPlantaAreaCounts} />
            )}
          </TabsContent>
          <TabsContent value="ordenes" className="animate-in fade-in duration-300 space-y-6">
            <div className="flex items-center justify-end">
              <DateFilterPopover
                label="Hoy en adelante"
                selectedDates={selectedDatesProv}
                onToggleDate={toggleProvDate}
                onClear={() => setSelectedDatesProv(new Set())}
                viewDate={viewDateProv}
                setViewDate={setViewDateProv}
                datesWithOrders={datesWithProvOrders}
                isDateDisabled={(d) => d < todayStr}
              />
            </div>
            <div className="space-y-10">
              {renderAuditTable(provAuditUIO, "AUDITORÍA TÉCNICA QUITO (1000) — PROVISIONALES", true)}
              {renderAuditTable(provAuditGYE, "AUDITORÍA TÉCNICA GUAYAQUIL (2000) — PROVISIONALES", true)}
            </div>
          </TabsContent>
          <TabsContent value="ordenesFert" className="animate-in fade-in duration-300 space-y-6">
            <div className="flex items-center justify-end">
              <DateFilterPopover
                label="Hoy y anteriores (+ sig. laborable)"
                selectedDates={selectedDatesFert}
                onToggleDate={toggleFertDate}
                onClear={() => setSelectedDatesFert(new Set())}
                viewDate={viewDateFert}
                setViewDate={setViewDateFert}
                datesWithOrders={datesWithFertOrders}
                isDateDisabled={(d) => d > nextBusinessDayStr}
              />
            </div>
            <div className="space-y-10">
              {renderAuditTable(fertAuditUIO, "AUDITORÍA TÉCNICA QUITO (1000) — ÓRDENES FERT", false)}
              {renderAuditTable(fertAuditGYE, "AUDITORÍA TÉCNICA GUAYAQUIL (2000) — ÓRDENES FERT", false)}
            </div>
          </TabsContent>
          <TabsContent value="mantenimiento" className="animate-in fade-in duration-300 text-left space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><Wrench className="w-4 h-4" /></div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Mantenimientos Preventivos Programados (SAP)</h3>
            </div>
            <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-center border-collapse text-[10px]">
                  <thead className="bg-gray-50 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-400">
                    <tr>
                      <th className="px-4 py-5 border-r border-gray-100">Centro</th>
                      <th className="px-6 py-5 border-r border-gray-100">Planta</th>
                      <th className="px-6 py-5 border-r border-gray-100">Área</th>
                      <th className="px-4 py-5 border-r border-gray-100">ID Máquina</th>
                      <th className="px-6 py-5 border-r border-gray-100">Máquina</th>
                      <th className="px-6 py-5 border-r border-gray-100">Línea de Proceso</th>
                      <th className="px-5 py-5 border-r border-gray-100">Inicio</th>
                      <th className="px-5 py-5 border-r border-gray-100">Fin</th>
                      <th className="px-6 py-5 text-indigo-700 bg-indigo-50/50 uppercase font-black tracking-tighter">Duración (H)</th>
                      <th className="px-6 py-5 text-emerald-700 bg-emerald-50/50 uppercase font-black tracking-tighter">Vínculo Resumen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-black text-[11px] text-slate-700">
                    {uniqueMantenimientosSAP.length === 0 ? (
                      <tr><td colSpan={10} className="py-24 text-slate-300 uppercase font-black tracking-widest italic opacity-50 text-center">Sin mantenimientos programados detectados</td></tr>
                    ) : (
                      uniqueMantenimientosSAP.map((row, i) => {
                        const iniStr = getProp(row, ['FECHA_OT_PRG_INI']).trim();
                        const finStr = getProp(row, ['FECHA_OT_PRG_FIN']).trim();
                        const diffHrs = getMttoDurationH(row);
                        const idMaquina = getProp(row, ['ID_MAQUINA']);
                        const centro = getProp(row, ['Centro', 'CENTRO']);
                        const link = resolveMachineLink(idMaquina, centro, getProp(row, ['PLANTA']));
                        const plantaTexto = centro === '1000' ? 'QUITO' : centro === '2000' ? 'GUAYAQUIL' : (getProp(row, ['PLANTA']) || '—');

                        return (
                          <tr key={i} className="hover:bg-indigo-50/10 transition-colors">
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 uppercase opacity-40">{centro}</td>
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 uppercase">{plantaTexto}</td>
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 uppercase">{getProp(row, ['AREA'])}</td>
                            <td className="px-4 py-3 border-r border-dashed border-gray-100 uppercase font-bold text-red-600">{idMaquina}</td>
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 uppercase font-black text-left">{getProp(row, ['MAQUINA'])}</td>
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 uppercase text-left">{getProp(row, ['LineaProceso'])}</td>
                            <td className="px-5 py-3 border-r border-dashed border-gray-100 font-mono text-center text-slate-400">{iniStr}</td>
                            <td className="px-5 py-3 border-r border-dashed border-gray-100 font-mono text-center text-slate-400">{finStr}</td>
                            <td className="px-6 py-3 font-mono text-indigo-700 bg-indigo-50/30 text-center font-black">{diffHrs.toFixed(2)}</td>
                            <td className="px-6 py-3 bg-emerald-50/20 text-left">
                              {link ? (
                                <span className="inline-flex items-center gap-1.5 text-emerald-600">
                                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate">{link.id} · {link.n} ({link.planta})</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-red-500">
                                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                  <span>SIN VINCULAR</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
