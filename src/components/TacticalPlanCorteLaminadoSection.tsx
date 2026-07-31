
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Scissors,
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
  Boxes,
  Pencil,
  Trash2,
  GripHorizontal,
  CheckCircle2
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
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
import type { Grupo, Restriccion, PlanGrupo, DetalleTactico } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isValid, addDays } from 'date-fns';
import { es } from 'date-fns/locale';

// --- CONSTANTES TÉCNICAS PLANTA ---
// codigo_grupo real (tabla grupo) para "Corte y Laminado (Centro 1000)" — verificado contra
// GET /api/grupo. Es el único PlanGrupo/DetalleTactico que este módulo crea y edita.
const CODIGO_GRUPO_LAMINADO = 8;
const BLOCK_SIZE = 40;
const SETUP_TIME_PER_RUN = 55; // 55 min por corrida física: ingreso de bloques + colocar adhesivo + limpieza (ajustado desde 45 min)
// Proceso "lámina convoluted": 1 lámina base pasada por el proceso alterno (otra máquina) devuelve
// 2 láminas CONV de menor espesor del mismo recorrido. La necesidad/plan de la variante CONV se
// deriva multiplicando por este factor la de su lámina base, en vez de calcularse por participación propia.
const CONV_SPLIT_FACTOR = 2;

// Materiales que, aunque su descripción contiene "LAMINA CILINDRICA", no deben generar corrida ni
// sumar necesidad propia: son semielaborados que dependen de otra lámina (ej. 30026039 consume
// 30004185 según su propio BOM) pero cuyo consumo real ya se cubre con el stock de esa lámina base
// en otra área, sin afectar el cálculo de necesidades de esta sección.
const EXCLUDED_LAMINA_MATERIALS = new Set(['30026039']);

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
  totalStockKg: number; // Bodegas (1006/1008/1015) + Producción Diaria del responsable "014" (solo FERT)
  totalStockUN: number; // Bodegas (1006/1008/1015) + Producción Diaria del responsable "014" (solo FERT)
  prodDiariaKg: number;
  prodDiariaUn: number;
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
  runsRecomendado: number; // Corridas que calculó el algoritmo automático de déficit para este bloque, SIN aplicar corridasManualOverrides — referencia para la UI cuando el usuario decide un número distinto
  necVentaExternaKg: number; // Porción de consumoKg cuyo origen (P2) es el grupo "Venta Externa" — piso obligatorio, no participa del reparto proporcional del bloque (ver groupMap.forEach en handleProcessResumen)
  necVentaExternaUn: number; // necVentaExternaKg redondeado hacia arriba al rollo completo — igual criterio que deficitRealUN
  hasDeficitVE: boolean; // El stock disponible NO alcanza a cubrir el piso de Venta Externa — semáforo "rojo duro": no admite "Aprobar" manual (ver toggleAprobarDeficit), solo baja cuando el stock real lo cubre
}

// Déficit real de un material (necesidad − stock ya cubierto), SIEMPRE redondeado hacia ARRIBA al
// rollo completo. totalNroRollos/totalStockUN salen de dividir Kg entre el peso de un rollo, por lo
// que su diferencia normalmente cae en un número fraccionario (ej. 0.8123 rollos) — un proceso físico
// no puede cortar/producir una fracción de rollo, así que cualquier residuo, por mínimo que sea,
// obliga a cubrir al menos 1 rollo completo. El -0.001 solo evita que ruido de punto flotante (ej.
// 11.0000000001) redondee de más un déficit que en realidad ya es un entero exacto.
const deficitRealUN = (r: Pick<UnifiedNeedRow, 'totalNroRollos' | 'totalStockUN'>): number => {
  const raw = r.totalNroRollos - r.totalStockUN;
  return raw > 0.001 ? Math.ceil(raw - 0.001) : 0;
};

// Déficit real de la porción EXCLUSIVA de Venta Externa (su piso obligatorio menos el stock ya
// disponible) — mismo criterio de redondeo que deficitRealUN. Se cubre primero y completo en el
// reparto del bloque: es la mitad "dura" de la separación Venta Externa (exacto) vs Forros/Muebles
// (participación) que pediste.
const deficitVentaExternaUN = (r: Pick<UnifiedNeedRow, 'necVentaExternaUn' | 'totalStockUN'>): number => {
  const raw = r.necVentaExternaUn - r.totalStockUN;
  return raw > 0.001 ? Math.ceil(raw - 0.001) : 0;
};

// Déficit real de Forros/Muebles: el déficit total del material (deficitRealUN, mezclado) menos lo
// que ya se atribuye al piso de Venta Externa — así ambos tramos siguen sumando el mismo déficit
// total de antes, sin doble conteo del mismo stock disponible.
const deficitForrosMueblesUN = (r: Pick<UnifiedNeedRow, 'totalNroRollos' | 'totalStockUN' | 'necVentaExternaUn'>): number => {
  return Math.max(0, deficitRealUN(r) - deficitVentaExternaUN(r));
};

// Fila cruda proveniente de endpoints SAP/servicios internos: los nombres de columna varían de
// mayúsculas/minúsculas y de endpoint a endpoint, por eso se accede siempre vía getProp/cleanCode/safeNum.
type RawApiRow = Record<string, unknown>;

// Fila cruda del árbol de explosión de materiales (getMaestroMaterialesExplosion)
interface MaterialExplosionRow {
  NIVEL?: string | number;
  CENTRO?: string;
  FERT_PRINCIPAL?: string;
  DESCRIPCION_FERT?: string;
  MATERIAL_PADRE?: string;
  COMPONENTE?: string;
  DESCRIPCION_COMPONENTE?: string;
  CANTIDAD_UNITARIA?: number | string;
  CANTIDAD_ACUMULADA?: number | string;
}

interface InventarioSapRow {
  MATERIAL?: string | number;
  NOMBRE?: string;
  DESCRIPCION?: string;
  CENTRO?: string | number;
  ALMACEN?: string | number;
  LIBREUTILIZACION?: number | string;
  ENTRASLADO?: number | string;
  INSPECCCALIDAD?: number | string;
  BLOQUEADO?: number | string;
  PUNTOPEDIDO?: number | string;
  TIPO_MATERIAL?: string;
}

interface CorridaOutputRow {
  corridaId: string;
  fecha: string;
  corrida: string;
  material: string;
  descripcion: string;
  planUn: number;
  planKg: number;
  prioridad: number;
  isConvNested: boolean;
}

// Simulación "Paso 3 — Salida de Datos por Respuesta": por cada material referenciado en
// "Necesidades Planta" (match contra el Resumen Necesidades), responde con la cantidad planificada
// en corrida si existe, o con el stock disponible (bodegas + Producción Diaria) si no hay corrida.
interface RespuestaSalidaRow {
  material: string;
  descripcion: string;
  tieneCorrida: boolean;
  cantidadKg: number;
  cantidadUn: number;
  origenes: string;
}

const safeNum = (val: unknown): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: unknown): string => {
  return String(code || '').replace(/^0+/, '').trim();
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

const formatNum = (val: unknown, decimals: number = 2): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

interface PlanGrupoPreview {
  codigo_grupo: number;
  nombreGrupo: string;
  valor: string;
  fechaInicio: string;
  fechaFin: string;
  rows: RespuestaSalidaRow[];
}

interface EditableDetalleRow {
  codigo_detalle_tactico: number;
  material: string;
  descripcion: string;
  cantidad: number;
  marcadoEliminar: boolean;
  esNuevo: boolean;
  codigo_plan_grupo_padre: number; // Plan_grupo ORIGEN de la necesidad (otra área), no el propio plan de Laminado
}

interface EditPlanPreview {
  codigo_plan_grupo: number;
  valor: string;
  fechaInicio: string;
  fechaFin: string;
  rows: EditableDetalleRow[];
}

interface NecesidadPlantaRow {
  codigo_material: number;
  cantidad_produccion_neta: string;
  fecha_inicio: string;
  codigo_plan_grupo: number;
}

// Cantidad viene como texto desde DetalleTactico (p.ej. "120.5000"); se limpia igual que en
// el tab homólogo de Corte Espuma para poder sumarla de forma segura en el resumen consolidado.
const parseQty = (val: unknown): number => {
  const n = Number(String(val || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

// Misma lógica que el useMemo de respuestaSalidaRows, en función pura: permite invocarla desde
// handleProcessResumen con el finalArray recién calculado (aún no reflejado en el estado
// unifiedNeeds), evitando depender de un re-render para reconciliar el plan automáticamente.
const computeRespuestaSalidaRows = (
  needs: UnifiedNeedRow[],
  necesidadesPlantaMap: Map<string, number>,
  origenesPlantaMap: Map<string, Map<number, number>>
): RespuestaSalidaRow[] => {
  return needs
    .filter(u => necesidadesPlantaMap.has(String(Number(u.material))))
    .map((u): RespuestaSalidaRow => {
      const tieneCorrida = u.planUn > 0;
      const origenesMap = origenesPlantaMap.get(String(Number(u.material)));
      const origenes = origenesMap && origenesMap.size > 0 ? Array.from(origenesMap.keys()).join(', ') : '—';
      return {
        material: u.material,
        descripcion: u.descripcion,
        tieneCorrida,
        cantidadKg: tieneCorrida ? u.planKg : u.totalStockKg,
        cantidadUn: tieneCorrida ? u.planUn : u.totalStockUN,
        origenes,
      };
    })
    .sort((a, b) => Number(a.tieneCorrida) - Number(b.tieneCorrida));
};

// Normaliza fecha_inicio_plan/fecha_fin_plan (a veces con sufijo horario "...T00:00:00") al mismo
// formato 'yyyy-MM-dd' que usa selectedDates, igual convención que ya usa el resto del archivo.
const soloFecha = (v: unknown): string => {
  const s = String(v ?? '').trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  return s.includes('T') ? s.split('T')[0] : s;
};

// Un PlanGrupo "cubre" la selección si alguna fecha seleccionada cae dentro de su rango
// [fecha_inicio_plan, fecha_fin_plan] (comparación lexicográfica, válida en formato yyyy-MM-dd). Si
// al plan le falta alguna de las dos fechas no se puede evaluar con confianza: se excluye explícito
// en vez de asumir que cubre todo o nada.
const planCubreAlgunaFecha = (plan: PlanGrupo, fechasSeleccionadas: string[]): boolean => {
  const inicio = soloFecha(plan.fecha_inicio_plan);
  const fin = soloFecha(plan.fecha_fin_plan);
  if (!inicio || !fin) {
    console.warn(`[Modificar Plan Activo] Plan Grupo #${plan.codigo_plan_grupo} sin rango de fechas válido, se excluye de la evaluación.`);
    return false;
  }
  return fechasSeleccionadas.some(f => f >= inicio && f <= fin);
};

// Planes propios de Laminado candidatos a la modificación/desactivación automática: activos, "P3"
// (nunca "PFD", que es solo la variante de visualización), cuyo rango cubre alguna fecha
// seleccionada, y creados en un día ANTERIOR a hoy. Un plan creado hoy mismo queda excluido a
// propósito: el negocio necesita poder seguir reconciliándolo/editándolo el mismo día sin que la
// auditoría automática lo desactive por debajo mientras sigue vigente; solo los "P3" que quedaron
// de días previos cubriendo una fecha ya vencida/de hoy se consideran obsoletos.
const filtrarPlanesP3ActivosQueCubren = (planes: PlanGrupo[], fechasSeleccionadas: string[], todayStr: string): PlanGrupo[] => {
  return planes.filter(p =>
    p.codigo_grupo === CODIGO_GRUPO_LAMINADO &&
    p.estado === 'A' &&
    /p3/i.test(String(p.valor || '')) && !/pfd/i.test(String(p.valor || '')) &&
    soloFecha(p.fecha_creacion) !== todayStr &&
    planCubreAlgunaFecha(p, fechasSeleccionadas)
  );
};

interface AlmacenBreakdown {
  nombre: string;
  codigosPlanGrupo: string;
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
    const map = new Map<number, { codigo_material: number; cantidadTotal: number; nroLineas: number; almacenes: Map<string, { cantidad: number; nroLineas: number; codigosPlanGrupo: Set<number> }> }>();
    Object.entries(data).forEach(([almacen, rows]) => {
      rows.forEach(row => {
        const cod = row.codigo_material;
        if (!map.has(cod)) map.set(cod, { codigo_material: cod, cantidadTotal: 0, nroLineas: 0, almacenes: new Map() });
        const entry = map.get(cod)!;
        const qty = parseQty(row.cantidad_produccion_neta);
        entry.cantidadTotal += qty;
        entry.nroLineas += 1;
        if (!entry.almacenes.has(almacen)) entry.almacenes.set(almacen, { cantidad: 0, nroLineas: 0, codigosPlanGrupo: new Set() });
        const almEntry = entry.almacenes.get(almacen)!;
        almEntry.cantidad += qty;
        almEntry.nroLineas += 1;
        almEntry.codigosPlanGrupo.add(row.codigo_plan_grupo);
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
            codigosPlanGrupo: Array.from(v.codigosPlanGrupo).join(', '),
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
      <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-center border-collapse text-[10px]">
            <thead className="bg-gray-50 sticky top-0 z-20 text-[9px] font-bold uppercase text-gray-400">
              <tr>
                <th className="px-6 py-4 border-r border-gray-100 text-left">Código Material</th>
                <th className="px-6 py-4 border-r border-gray-100 font-black bg-amber-50 text-amber-700">Cantidad Total Consumo</th>
                <th className="px-6 py-4 border-r border-gray-100">Nro. Líneas</th>
                <th className="px-6 py-4 text-left">Almacenes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
              {paginated.length === 0 ? (
                <tr><td colSpan={4} className="py-16 text-slate-300 uppercase font-black tracking-widest italic opacity-50 text-center">Sin registros</td></tr>
              ) : paginated.map((row) => {
                const isExp = expandedMaterials.has(row.codigo_material);
                const almacenNames = row.almacenes.map(a => a.nombre).join(', ');
                return (
                  <React.Fragment key={row.codigo_material}>
                    <tr onClick={() => toggleMaterial(row.codigo_material)} className="hover:bg-gray-50/50 transition-colors font-mono text-[10px] cursor-pointer">
                      <td className="px-6 py-3 border-r border-slate-50 text-left text-indigo-600 font-black">
                        <span className="inline-flex items-center gap-2">
                          {isExp ? <Minus className="w-3 h-3 text-red-500 shrink-0" /> : <Plus className="w-3 h-3 text-indigo-500 shrink-0" />}
                          {row.codigo_material}
                        </span>
                      </td>
                      <td className="px-6 py-3 border-r border-slate-50 text-slate-900 font-black bg-amber-50">{row.cantidadTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td className="px-6 py-3 border-r border-slate-50 text-slate-500">{row.nroLineas}</td>
                      <td className="px-6 py-3 text-left text-slate-400 truncate max-w-[280px]" title={almacenNames}>{almacenNames}</td>
                    </tr>
                    {isExp && (
                      <tr>
                        <td colSpan={4} className="p-0 bg-slate-50/60 border-b border-slate-100">
                          <div className="px-6 py-4">
                            <table className="w-full text-center border-collapse text-[9px]">
                              <thead>
                                <tr className="bg-gray-50 text-gray-400 uppercase font-bold tracking-tighter">
                                  <th className="px-4 py-2 border-r border-gray-100 text-left">Almacén</th>
                                  <th className="px-4 py-2 border-r border-gray-100 text-left">Código Plan Grupo</th>
                                  <th className="px-4 py-2 border-r border-gray-100">Cantidad</th>
                                  <th className="px-4 py-2 border-r border-gray-100">Nro. Ítems</th>
                                  <th className="px-4 py-2">% Participación</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 font-bold text-slate-700 bg-white">
                                {row.almacenes.map(alm => (
                                  <tr key={alm.nombre}>
                                    <td className="px-4 py-2 border-r border-slate-100 text-left uppercase">{alm.nombre}</td>
                                    <td className="px-4 py-2 border-r border-slate-100 text-left font-mono text-indigo-600" title={alm.codigosPlanGrupo}>{alm.codigosPlanGrupo}</td>
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
  const [ordenes, setOrders] = useState<RawApiRow[]>([]);
  const [ordenesFert, setOrdersFert] = useState<RawApiRow[]>([]);
  const [kpiLooperData, setKpiLooperData] = useState<RawApiRow[]>([]);
  const [inventarioSAP, setInventarioSAP] = useState<InventarioSapRow[]>([]);
  const [operadoresLaminado, setOperadoresLaminado] = useState<RawApiRow[]>([]);
  const [mantenimientosSAP, setMantenimientosSAP] = useState<RawApiRow[]>([]);
  const [, setIsLoading] = useState(true);
  const [necesidadesPlantaData, setNecesidadesPlantaData] = useState<Record<string, NecesidadPlantaRow[]>>({});
  const [necesidadesPlantaLoading, setNecesidadesPlantaLoading] = useState(false);

  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState<Date>(new Date()); 
  
  const [unifiedNeeds, setUnifiedNeeds] = useState<UnifiedNeedRow[]>([]);
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [planPreview, setPlanPreview] = useState<PlanGrupoPreview | null>(null);
  const [isSavingPlanPFD, setIsSavingPlanPFD] = useState(false);
  const [planPreviewPFD, setPlanPreviewPFD] = useState<PlanGrupoPreview | null>(null);
  const [editPlanPreview, setEditPlanPreview] = useState<EditPlanPreview | null>(null);
  const [isLoadingEditPlan, setIsLoadingEditPlan] = useState(false);
  const [planesGrupoDisponibles, setPlanesGrupoDisponibles] = useState<PlanGrupo[] | null>(null);
  const [planGrupoSeleccionado, setPlanGrupoSeleccionado] = useState<number | null>(null);
  const [isSavingEditPlan, setIsSavingEditPlan] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // --- Panel flotante arrastrable (Guardar/Editar Plan) ---
  const fabRef = useRef<HTMLDivElement>(null);
  const fabDragOffset = useRef<{ x: number; y: number } | null>(null);
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);

  const handleFabDragStart = useCallback((e: React.MouseEvent) => {
    const el = fabRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    fabDragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    e.preventDefault();
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const offset = fabDragOffset.current;
      const el = fabRef.current;
      if (!offset || !el) return;
      const rect = el.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;
      setFabPos({
        x: Math.min(Math.max(0, e.clientX - offset.x), Math.max(0, maxX)),
        y: Math.min(Math.max(0, e.clientY - offset.y), Math.max(0, maxY)),
      });
    };
    const handleMouseUp = () => { fabDragOffset.current = null; };
    // Si el usuario ya arrastró el panel a una posición y luego redimensiona/hace zoom en la
    // ventana, esa posición en px puede quedar fuera del viewport nuevo (offscreen o encimada
    // en una esquina distinta a la que dejó). Se reclama dentro de los límites vigentes en vez
    // de dejarlo fijo en coordenadas que ya no corresponden a la ventana actual.
    const handleResize = () => {
      const el = fabRef.current;
      if (!el) return;
      setFabPos(prev => {
        if (!prev) return prev;
        const rect = el.getBoundingClientRect();
        const maxX = Math.max(0, window.innerWidth - rect.width);
        const maxY = Math.max(0, window.innerHeight - rect.height);
        const x = Math.min(Math.max(0, prev.x), maxX);
        const y = Math.min(Math.max(0, prev.y), maxY);
        return (x === prev.x && y === prev.y) ? prev : { x, y };
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  const [planManualOverrides, setPlanOverrides] = useState<Record<string, number>>({});
  // Override manual del NÚMERO DE CORRIDAS de un bloque (apertura|densidad), independiente del
  // override por material (planManualOverrides). Cuando el usuario decide agregar o quitar una
  // corrida completa a un bloque (por encima/debajo de la recomendación automática por déficit),
  // se guarda aquí y handleProcessResumen la respeta como bolsa total del bloque a redistribuir.
  const [corridasManualOverrides, setCorridasOverrides] = useState<Record<string, number>>({});
  // Aprobación visual del semáforo "% Nec." cuando un material queda en rojo (hasDeficit) pero YA
  // tiene corridas asignadas (planUn > 0): no cambia hasDeficit (el stock real sigue bajo), solo
  // reconoce que el planificador revisó y decidió proseguir con la corrida ya asignada. Vive solo en
  // memoria de sesión (no se persiste ni bloquea "Guardar Plan"): se resetea al recalcular el Resumen
  // Necesidades o recargar la página.
  const [approvedDeficitRows, setApprovedDeficitRows] = useState<Set<string>>(new Set());
  // Toast no bloqueante: una edición individual de PLAN(UN) cambió la cantidad de un material que
  // comparte bloque con otros — se ofrece redistribuir la diferencia entre los DEMÁS materiales, sin
  // tocar el valor recién editado. No bloquea: la edición ya se aplicó, esto solo ofrece ajustarla.
  // Solo un toast a la vez — uno nuevo reemplaza al anterior en vez de acumularse.
  const [redistribuirToast, setRedistribuirToast] = useState<{
    material: string; apertura: string; densidad: string; editedValue: number;
    techoActual: number; techoNuevo: number;
  } | null>(null);

  const [corridaFechas, setCorridaFechas] = useState<Record<string, string>>({});

  // Texto en edición de los inputs "Corridas" (por bloque) y "PLAN (UN)" (por material): mientras el
  // usuario escribe, solo se guarda aquí el texto crudo — el recálculo real (handleUpdateCorridasBloque
  // / handleUpdatePlanUn), y cualquier mensaje/diálogo de corrección que dispare, se aplica recién al
  // confirmar (blur o Enter). Antes se recalculaba en cada tecla: escribir "40" disparaba el mensaje ya
  // con el primer "4". La clave se borra al confirmar, así el input vuelve a reflejar el valor calculado.
  const [corridasDraft, setCorridasDraft] = useState<Record<string, string>>({});
  const [planUnDraft, setPlanUnDraft] = useState<Record<string, string>>({});

  const commitCorridasDraft = (apertura: string, densidad: string) => {
    const groupKey = `${apertura}|${densidad}`;
    const raw = corridasDraft[groupKey];
    if (raw === undefined) return;
    handleUpdateCorridasBloque(apertura, densidad, parseInt(raw) || 0);
    setCorridasDraft(prev => {
      const next = { ...prev };
      delete next[groupKey];
      return next;
    });
  };

  const commitPlanUnDraft = (material: string, apertura: string, densidad: string) => {
    const key = `${material}|${apertura}|${densidad}`;
    const raw = planUnDraft[key];
    if (raw === undefined) return;
    handleUpdatePlanUn(material, apertura, densidad, parseInt(raw) || 0);
    setPlanUnDraft(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const commitDraftOnEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') e.currentTarget.blur();
  };

  const [assignedPersonnel, setAssignedPersonnel] = useState({
    diaOp1: '',
    diaOp2: '',
    nocheOp1: '',
    nocheOp2: ''
  });

  const handleAssignOperator = useCallback((slot: keyof typeof assignedPersonnel, value: string) => {
    setAssignedPersonnel(prev => {
      if (value && Object.entries(prev).some(([k, v]) => k !== slot && v === value)) {
        addNotification('warning', 'Este operador ya fue asignado en otro turno/posición. Escoja otro operador.');
        return prev;
      }
      return { ...prev, [slot]: value };
    });
  }, [addNotification]);

  const isOperatorTakenElsewhere = useCallback((slot: keyof typeof assignedPersonnel, code: string) => {
    if (!code) return false;
    return (Object.entries(assignedPersonnel) as [keyof typeof assignedPersonnel, string][])
      .some(([s, v]) => s !== slot && v === code);
  }, [assignedPersonnel]);

  const parseCalificacionOperador = useCallback((op: RawApiRow): number => {
    const raw = getProp(op, ['Calificacion', 'CALIFICACION']).replace('%', '').trim();
    const n = parseFloat(raw);
    return Number.isNaN(n) ? 0 : n;
  }, []);

  // Ambos turnos arrancan en "VACÍO" (antes Día arrancaba en H1) — obliga a escoger horario a
  // propósito en vez de asumir uno por defecto; ver validación en handleProcessResumen y
  // handleAutoAssignPersonnel.
  const [selectedDiaShift, setSelectedDiaShift] = useState('EMPTY');
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

  // Auto-asignar Personal — Laminado Cilíndrico: exige haber escogido al menos un horario (Día y/o
  // Noche) antes de asignar, y respeta cuáles turnos están realmente activos — antes asignaba
  // siempre los 4 puestos (Día+Noche) sin importar si algún turno estaba en "VACÍO". Regla: turno
  // "VACÍO" no recibe personal; si ambos tienen horario, se asignan los 4 puestos.
  const handleAutoAssignPersonnel = useCallback(() => {
    const diaActivo = selectedDiaShift !== 'EMPTY';
    const nocheActivo = selectedNocheShift !== 'EMPTY';
    if (!diaActivo && !nocheActivo) {
      addNotification('warning', 'Escoja un horario de Turno Día y/o Turno Noche antes de asignar personal.');
      return;
    }
    if (operadoresLaminado.length === 0) {
      addNotification('warning', 'No hay operadores con habilidades de Laminado Cilíndrico disponibles.');
      return;
    }

    const candidatos = operadoresLaminado
      .map(op => ({ code: getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR']), calificacion: parseCalificacionOperador(op) }))
      .filter(o => o.code)
      .sort((a, b) => b.calificacion - a.calificacion);

    // >50% (75% u 100%) se considera Operador "A"; <=50% se considera Ayudante "B"
    const principales = candidatos.filter(o => o.calificacion > 50);
    const ayudantes = candidatos.filter(o => o.calificacion <= 50);

    const used = new Set<string>();
    const takeNext = (pool: typeof candidatos) => {
      const found = pool.find(o => !used.has(o.code));
      if (found) used.add(found.code);
      return found?.code || '';
    };

    const diaOp1 = diaActivo ? takeNext(principales) : '';
    const diaOp2 = diaActivo ? (takeNext(ayudantes) || takeNext(principales)) : '';
    const nocheOp1 = nocheActivo ? takeNext(principales) : '';
    const nocheOp2 = nocheActivo ? (takeNext(ayudantes) || takeNext(principales)) : '';

    setAssignedPersonnel({ diaOp1, diaOp2, nocheOp1, nocheOp2 });

    const posicionesEsperadas = (diaActivo ? 2 : 0) + (nocheActivo ? 2 : 0);
    const asignados = [diaOp1, diaOp2, nocheOp1, nocheOp2].filter(Boolean).length;
    const alcanceTexto = diaActivo && nocheActivo ? '' : diaActivo ? ' — solo Turno Día (Noche vacío)' : ' — solo Turno Noche (Día vacío)';
    if (asignados < posicionesEsperadas) {
      addNotification('warning', `Asignación automática parcial: se completaron ${asignados} de ${posicionesEsperadas} posiciones por falta de operadores calificados disponibles${alcanceTexto}.`);
    } else {
      addNotification('success', `Personal asignado automáticamente según calificación (Operador A: >50%, Ayudante B: ≤50%)${alcanceTexto}.`);
    }
  }, [operadoresLaminado, addNotification, parseCalificacionOperador, selectedDiaShift, selectedNocheShift]);

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

  const extractMaterialInfo = useCallback((item: RawApiRow) => {
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

      setRestriccionesArray((restrs.data || []).filter((r) => ids.includes(r.codigo_grupo)));
      setOrders(provs.data?.data || provs.data || []);
      setOrdersFert(ferts.data?.data || ferts.data || []);
      setKpiLooperData(kpiLooper?.data || []);
      setInventarioSAP(Array.isArray(invSAP?.data) ? invSAP.data : (invSAP?.data?.data || []));
      setMantenimientosSAP(Array.isArray(maint?.data) ? maint.data : (maint?.data?.data || []));

      // Filtrar Operadores por Laminado Cilíndrico usando el nuevo método
      const skillRows: RawApiRow[] = Array.isArray(skills.data) ? skills.data : [];
      const laminadoOps = skillRows.filter((s) =>
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

      const normalizeName = (s: string) => String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '')
        .toLowerCase();

      // Restricción ALMACEN_CONSUMO propia de Laminado (codigo_grupo = CODIGO_GRUPO_LAMINADO): se
      // filtra por su propio codigo_grupo (no cualquier fila con ese nombre) para no compartir
      // configuración con la de Corte Espuma (codigo_grupo 7, "Taller de Corte"), que tiene su
      // propia fila y no debe considerar "Forros" (eso sí es demanda de Laminado).
      const almacenConsumoNames = (restrsRes.data || [])
        .filter((r) => r.nombre_restriccion === 'ALMACEN_CONSUMO' && r.codigo_grupo === CODIGO_GRUPO_LAMINADO)
        .flatMap((r) => String(r.valor_restriccion || '').split(/[,&]/).map((v: string) => normalizeName(v)))
        .filter((v: string) => v !== '');

      const gruposFiltrados = (gruposRes.data || []).filter((g) => almacenConsumoNames.includes(normalizeName(g.nombre_grupo)));
      const gruposCodigos = gruposFiltrados.map((g) => g.codigo_grupo);
      const grupoPorCodigo = new Map(gruposFiltrados.map((g) => [g.codigo_grupo, g]));

      if (gruposCodigos.length === 0) {
        setNecesidadesPlantaData({});
        return;
      }

      // "Venta Externa" alimenta necesidad tanto de Laminado como de Espuma (planes "...P2 - Rollos"
      // y "...P2 - Espumas" respectivamente) — aquí solo cuenta la variante "Rollos".
      const planGruposRes = await planGrupoService.getAll();
      const planesActivos = (planGruposRes.data || []).filter((pg) => {
        const valor = String(pg.valor || '').trim();
        if (pg.estado !== 'A' || !gruposCodigos.includes(pg.codigo_grupo)) return false;
        if (!/plan\s*t[aá]ctico.*centro.*p2/i.test(valor)) return false;
        const esVentaExterna = /venta\s*externa/i.test(grupoPorCodigo.get(pg.codigo_grupo)?.nombre_grupo || '');
        if (esVentaExterna && !/rollo/i.test(valor)) return false;
        return true;
      });

      const planGrupoCodigos = planesActivos.map((pg) => pg.codigo_plan_grupo);
      const planPorCodigo = new Map(planesActivos.map((pg) => [pg.codigo_plan_grupo, pg]));

      if (planGrupoCodigos.length === 0) {
        setNecesidadesPlantaData({});
        return;
      }

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

  // Igual que materialNecesidadesPlantaMap, pero solo la porción cuya área de origen es "Venta
  // Externa" (mismo criterio /venta\s*externa/i que ya filtra el plan "Rollos" en fetchNecesidadesPlanta,
  // ver más arriba) — necesidadesPlantaData ya viene agrupado por área (nombre_grupo), así que no hace
  // falta otra consulta. Alimenta el piso obligatorio (necVentaExternaKg/Un) en finalArray: Venta
  // Externa debe cubrirse exacto, Forros/Muebles siguen en el reparto proporcional (porcentajeNecesidad).
  const materialNecesidadVentaExternaMap = useMemo(() => {
    const map = new Map<string, number>();
    Object.entries(necesidadesPlantaData).forEach(([area, rows]) => {
      if (!/venta\s*externa/i.test(area)) return;
      rows.forEach(row => {
        const key = String(Number(row.codigo_material));
        map.set(key, (map.get(key) || 0) + parseQty(row.cantidad_produccion_neta));
      });
    });
    return map;
  }, [necesidadesPlantaData]);

  // Necesidad de cada material desglosada por plan_grupo ORIGEN (la otra área cuyo plan generó la
  // demanda) — a diferencia de materialNecesidadesPlantaMap (que solo suma el total), este mapa
  // conserva el desglose por origen para prorratear el planKg de Laminado entre ellos al guardar o
  // editar el plan: codigo_plan_grupo_padre debe ser ese origen real, no el propio plan de Laminado.
  const materialOrigenesPlantaMap = useMemo(() => {
    const map = new Map<string, Map<number, number>>();
    Object.values(necesidadesPlantaData).flat().forEach(row => {
      const matKey = String(Number(row.codigo_material));
      if (!map.has(matKey)) map.set(matKey, new Map());
      const porOrigen = map.get(matKey)!;
      const qty = parseQty(row.cantidad_produccion_neta);
      porOrigen.set(row.codigo_plan_grupo, (porOrigen.get(row.codigo_plan_grupo) || 0) + qty);
    });
    return map;
  }, [necesidadesPlantaData]);

  // El proceso de Corte y Laminado no puede cortar/despachar fracciones de rollo: cada cantidad se
  // redondea HACIA ARRIBA al múltiplo entero del peso de un rollo completo (unifiedNeeds.peso) que
  // alcance a cubrir la necesidad — nunca al múltiplo inferior, para no dejar desabastecido al origen
  // que la pidió (si la necesidad es menor a un rollo, se entrega 1 rollo completo; si es mayor, 2, 3,
  // 4... rollos hasta cubrirla). Una necesidad de 0 (p.ej. "No — stock" del plan PFD) queda en 0.
  const redondearARollo = useCallback((material: string, kg: number): number => {
    if (kg <= 0) return kg;
    const pesoRollo = unifiedNeeds.find(u => u.material === material)?.peso || 0;
    if (pesoRollo <= 0) return kg;
    return Math.ceil(kg / pesoRollo) * pesoRollo;
  }, [unifiedNeeds]);

  // Reparte cantidadKg de un material entre sus planes origen, proporcional a la necesidad que cada
  // uno aportó en "Necesidades Planta". Redondear cada origen hacia arriba por separado (ver
  // redondearARollo) puede sumar más rollos de los que el material tiene realmente planificados
  // (ej. 87.9%/12.1% de 40 rollos redondea a 36+5=41 rollos): por eso el reparto respeta un TECHO
  // = los rollos ya planificados para este material (cantidadKg/peso, redondeado). El origen de
  // MAYOR necesidad se redondea primero a su propio prorrateo (topado al techo restante); el de
  // MENOR necesidad recibe lo que quede del techo, nunca su propio redondeo independiente — así el
  // total nunca excede lo planificado. Si el techo no alcanza para cubrir el mínimo real de algún
  // origen, esto NO alerta aquí — P3 solo reparte lo ya decidido; esa alerta debe vivir en la
  // planificación de la corrida (deficitRealUN/distribuirPorDeficit), no en este prorrateo. Si no
  // hay origen registrado en absoluto (la necesidad vino directo de OF_PROV/OF_HALB y no de otra
  // área), se referencia el propio plan de Laminado como fallback.
  const getOrigenesProrrateo = useCallback((material: string, cantidadKg: number, fallbackCodigoPlanGrupo: number) => {
    const origenes = materialOrigenesPlantaMap.get(String(Number(material)));
    // BUG corregido: un origen SÍ registrado pero con necesidad 0 (el área pidió el material con
    // cantidad 0) es un origen real — antes "totalOrigen <= 0" lo trataba igual que "sin origen" y
    // terminaba auto-referenciando el P3 recién creado como codigo_plan_grupo_padre, perdiendo la
    // trazabilidad hacia el P2 real (ej. Muebles #73 con 1 ítem en 0 quedaba huérfano de su origen).
    // El fallback a sí mismo ahora SOLO aplica cuando no hay ninguna entrada de origen.
    if (!origenes || origenes.size === 0) {
      return [{ codigoPadre: fallbackCodigoPlanGrupo, cantidadKg: redondearARollo(material, cantidadKg) }];
    }

    const entradas = Array.from(origenes.entries()).sort((a, b) => b[1] - a[1]); // mayor necesidad primero
    const totalOrigen = entradas.reduce((s, [, v]) => s + v, 0);
    const pesoRollo = unifiedNeeds.find(u => u.material === material)?.peso || 0;

    if (cantidadKg <= 0) {
      return entradas.map(([codigoPadre]) => ({ codigoPadre, cantidadKg: 0 }));
    }
    // Todos los orígenes registrados pidieron 0 (no hay peso real entre ellos para prorratear
    // proporcionalmente): se asigna completo al primero — ninguno tiene más prioridad que otro — en
    // vez de auto-referenciar el P3 recién creado.
    if (totalOrigen <= 0) {
      return entradas.map(([codigoPadre], i) => ({
        codigoPadre,
        cantidadKg: i === 0 ? redondearARollo(material, cantidadKg) : 0
      }));
    }
    if (pesoRollo <= 0 || entradas.length <= 1) {
      return entradas.map(([codigoPadre, cantidad]) => ({
        codigoPadre,
        cantidadKg: redondearARollo(material, cantidadKg * (cantidad / totalOrigen))
      }));
    }

    const techoRollos = Math.round(cantidadKg / pesoRollo);
    let remanenteRollos = techoRollos;
    return entradas.map(([codigoPadre, cantidad], i) => {
      const esUltimo = i === entradas.length - 1;
      const rollos = esUltimo
        ? Math.max(0, remanenteRollos)
        : Math.min(Math.ceil(techoRollos * (cantidad / totalOrigen)), Math.max(0, remanenteRollos));
      remanenteRollos -= rollos;
      return { codigoPadre, cantidadKg: rollos * pesoRollo };
    });
  }, [materialOrigenesPlantaMap, redondearARollo, unifiedNeeds]);

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

  // Responsable de Control de Producción "014": no participa en las necesidades OF_HALB (se
  // excluye en handleProcessResumen). El MATERIAL de sus órdenes ya viene al mismo nivel que las
  // filas del resumen (la lámina/componente, no el FERT/HALB padre), por eso NO se explota por BOM:
  // se hace match directo por código de material, igual que NEC. PLANTA (materialNecesidadesPlantaMap).
  const RESP_PRODUCCION_DIARIA = '014';

  const filteredFertOrdersProd014 = useMemo(() => {
    return ordenesFert.filter(o => {
      const centro = getProp(o, ['CENTRO', 'Centro', 'centro']).trim();
      if (centro === '2000') return false;
      const responsable = getProp(o, ['RESPCTRLPROD', 'RESP_CONTROL_PROD', 'RESPCONTROLPROD', 'RespControlProd', 'RESPONSABLE']).trim();
      if (responsable !== RESP_PRODUCCION_DIARIA) return false;

      if (selectedDates.size > 0) {
        const dateRaw = getProp(o, ['FECHA', 'FECHAINICIO', 'FECHA_INICIO']).trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        if (!selectedDates.has(date)) return false;
      }
      return true;
    });
  }, [ordenesFert, selectedDates]);


  // Cantidad (Kg) por material del responsable "014" en el tab ÓRDENES FERT, ya al nivel de la
  // lámina/componente del resumen (match directo por código, sin explosión BOM), igual que
  // materialNecesidadesPlantaMap. Esta SÍ es producción ya realizada/comprometida: alimenta la
  // columna "Producción Diaria" y se suma al stock disponible (ver handleProcessResumen).
  //
  // El tab ÓRDENES FERT maneja CANTPENDIENTE en la unidad que indique cada línea (campo UNIDAD): la
  // mayoría son "ST" (unidades/rollos), pero ciertas referencias vienen directo en "KG" — verificado
  // contra datos reales (UNIDAD: ST/M/KG conviven en el mismo endpoint). Sumar CANTPENDIENTE tal cual
  // como si siempre fuera Kg inflaba brutalmente el stock/Producción Diaria de cualquier material en
  // ST (ej. "6" unidades se contaban como "6 Kg"). Ahora: si UNIDAD=KG se usa tal cual; en cualquier
  // otro caso se trata como UN y se convierte a Kg con el peso del rollo (kpiLooperData.PesoUN) —
  // mismo peso que usa el resto del módulo para todas las conversiones UN↔Kg.
  const materialProd014FertMap = useMemo(() => {
    const map = new Map<string, number>();
    filteredFertOrdersProd014.forEach(order => {
      const key = String(Number(getProp(order, ['MATERIAL', 'CodMaterial'])));
      if (!key || key === 'NaN') return;
      const qty = safeNum(getProp(order, ['CANTPENDIENTE', 'CANTPROGRAMADA', 'CANTIDAD']));
      const unidad = getProp(order, ['UNIDAD', 'Unidad', 'UNIDAD_MEDIDA']).trim().toUpperCase();
      let qtyKg = 0;
      if (unidad === 'KG') {
        qtyKg = qty;
      } else {
        const looperMatch = kpiLooperData.find(k => cleanCode(k.Material) === key);
        const pesoUN = looperMatch ? safeNum(looperMatch.PesoUN) : 0;
        qtyKg = pesoUN > 0 ? qty * pesoUN : 0;
      }
      map.set(key, (map.get(key) || 0) + qtyKg);
    });
    return map;
  }, [filteredFertOrdersProd014, kpiLooperData]);

  // Reconciliación reutilizable de un PlanGrupo contra la necesidad actual (misma lógica que ya
  // usaba "Editar Plan" manual): trae los DetalleTactico vigentes del plan, los cruza por clave
  // material|codigo_plan_grupo_padre con la salida fresca (salidaBase) para reutilizar
  // codigo_detalle_tactico en vez de duplicar, y marca para eliminar lo que ya no aparece. La usan
  // tanto el flujo manual (handleConfirmarSeleccionPlan) como el automático confirmado por el
  // usuario (handleConfirmarModificacionAutomaticaPlanActivo).
  const reconciliarDetallesParaPlan = useCallback(async (
    plan: PlanGrupo,
    salidaBase: RespuestaSalidaRow[],
    needsParaDescripcion: UnifiedNeedRow[]
  ): Promise<EditableDetalleRow[]> => {
    const detallesRes = await detalleTacticoService.getAll();
    const detallesPlan = (detallesRes.data || []).filter(d =>
      d.codigo_plan_grupo === plan.codigo_plan_grupo && d.estado === 'A'
    );
    const claveMaterial = (m: string | number) => String(Number(m));
    const existentesPorClave = new Map<string, DetalleTactico>();
    detallesPlan.forEach(d => {
      existentesPorClave.set(`${claveMaterial(d.codigo_material)}|${d.codigo_plan_grupo_padre}`, d);
    });

    const esPFD = /pfd/i.test(plan.valor);
    const salidaFresca = esPFD
      ? salidaBase.map(row => row.tieneCorrida ? row : { ...row, cantidadKg: 0, cantidadUn: 0 })
      : salidaBase.filter(row => row.cantidadKg > 0);

    const clavesUsadas = new Set<string>();
    const rows: EditableDetalleRow[] = [];
    salidaFresca.forEach(row => {
      const splits = getOrigenesProrrateo(row.material, row.cantidadKg, plan.codigo_plan_grupo);
      splits.forEach(split => {
        if (!esPFD && split.cantidadKg <= 0) return;
        const key = `${claveMaterial(row.material)}|${split.codigoPadre}`;
        clavesUsadas.add(key);
        const existente = existentesPorClave.get(key);
        rows.push({
          codigo_detalle_tactico: existente?.codigo_detalle_tactico ?? 0,
          material: row.material,
          descripcion: row.descripcion,
          cantidad: split.cantidadKg,
          marcadoEliminar: false,
          esNuevo: !existente,
          codigo_plan_grupo_padre: split.codigoPadre,
        });
      });
    });

    detallesPlan.forEach(d => {
      const key = `${claveMaterial(d.codigo_material)}|${d.codigo_plan_grupo_padre}`;
      if (clavesUsadas.has(key)) return;
      const materialCode = cleanCode(d.codigo_material);
      const needRow = needsParaDescripcion.find(u => u.material === materialCode);
      rows.push({
        codigo_detalle_tactico: d.codigo_detalle_tactico,
        material: materialCode,
        descripcion: needRow?.descripcion || '—',
        cantidad: parseQty(d.cantidad_produccion_neta),
        marcadoEliminar: true,
        esNuevo: false,
        codigo_plan_grupo_padre: d.codigo_plan_grupo_padre,
      });
    });

    return rows;
  }, [getOrigenesProrrateo]);

  // Persistencia reutilizable de filas reconciliadas (upsert de las vigentes, delete de las
  // marcadas) — misma lógica que ya usaba "Editar Plan" manual (handleConfirmEditarPlan).
  const persistirFilasEditables = useCallback(async (
    codigoPlanGrupo: number,
    rows: EditableDetalleRow[],
    usuario: string
  ) => {
    let actualizados = 0;
    let agregados = 0;
    let eliminados = 0;
    let fallidos = 0;

    for (const row of rows) {
      try {
        if (row.marcadoEliminar) {
          await detalleTacticoService.delete(row.codigo_detalle_tactico);
          eliminados++;
          continue;
        }

        const detallePayload = {
          codigo_detalle_tactico: row.esNuevo ? 0 : row.codigo_detalle_tactico,
          codigo_material: Number(row.material),
          cantidad_produccion_neta: Math.round(row.cantidad).toFixed(0),
          resp_ctrl_prod: '',
          clase_aprovisionamiento: 'E',
          cantidad_aprovisionamiento: 0,
          estado: 'A',
          codigo_plan_grupo: codigoPlanGrupo,
          codigo_plan_grupo_padre: row.codigo_plan_grupo_padre,
          usuario_modificacion: usuario,
        };
        await detalleTacticoService.save(detallePayload as unknown as DetalleTactico);
        if (row.esNuevo) agregados++; else actualizados++;
      } catch (e) {
        console.warn(`[Plan Táctico Laminado] Falló material ${row.material} (padre ${row.codigo_plan_grupo_padre}):`, (e as Error).message);
        fallidos++;
      }
    }

    return { actualizados, agregados, eliminados, fallidos };
  }, []);

  // Desactiva un PlanGrupo (estado -> 'I'). El servicio no tiene PATCH parcial: se reenvía el
  // objeto completo tal cual vino de getAll(), solo sobreescribiendo estado. Los DetalleTactico
  // hijos NO cambian de estado (quedan 'A'), por decisión de negocio explícita.
  const desactivarPlanGrupo = useCallback(async (plan: PlanGrupo) => {
    await planGrupoService.save({ ...plan, estado: 'I' } as PlanGrupo);
  }, []);

  const [planActivoPendienteConfirmacion, setPlanActivoPendienteConfirmacion] = useState<{ planes: PlanGrupo[]; needsFrescos: UnifiedNeedRow[] } | null>(null);
  const [isEjecutandoModificacionAutomatica, setIsEjecutandoModificacionAutomatica] = useState(false);

  // Caso A — "Modificar Plan Activo": evaluado automáticamente desde handleProcessResumen cuando
  // el usuario audita fechas ya vencidas/de hoy. Si hay PlanGrupo P3 activos (creados en un día
  // anterior a hoy) cuyo rango cubre alguna fecha seleccionada, NO se ejecuta directo: se deja en
  // planActivoPendienteConfirmacion para que el usuario confirme explícitamente en el diálogo antes
  // de reconciliar y desactivar (ver handleConfirmarModificacionAutomaticaPlanActivo).
  const evaluarModificacionAutomaticaPlanActivo = useCallback(async (needsFrescos: UnifiedNeedRow[]) => {
    if (selectedDates.size < 1) return;
    try {
      const fechasSeleccionadas = Array.from(selectedDates);
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const planesRes = await planGrupoService.getAll();
      const planesCandidatos = filtrarPlanesP3ActivosQueCubren(planesRes.data || [], fechasSeleccionadas, todayStr);

      // No-op silencioso: si ya se desactivó en un click previo, no vuelve a aparecer aquí.
      if (planesCandidatos.length === 0) return;

      setPlanActivoPendienteConfirmacion({ planes: planesCandidatos, needsFrescos });
    } catch (e) {
      addNotification('error', `No se pudo evaluar la modificación automática del plan activo: ${(e as Error).message}. La auditoría de necesidades sí se actualizó.`);
    }
  }, [selectedDates, addNotification]);

  // Ejecuta la reconciliación + desactivación de los PlanGrupo que el usuario confirmó en el
  // diálogo (ver evaluarModificacionAutomaticaPlanActivo). Reconcilia y guarda EN SITIO (mismo
  // codigo_plan_grupo) cada plan y lo marca inactivo. No crea un plan nuevo ni toca
  // Provisionales/FERT.
  const handleConfirmarModificacionAutomaticaPlanActivo = useCallback(async () => {
    if (!planActivoPendienteConfirmacion) return;
    const { planes: planesCandidatos, needsFrescos } = planActivoPendienteConfirmacion;
    setIsEjecutandoModificacionAutomatica(true);
    try {
      const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
      const usuario = user?.name || 'admin';
      const salidaBase = computeRespuestaSalidaRows(needsFrescos, materialNecesidadesPlantaMap, materialOrigenesPlantaMap);

      let tActualizados = 0, tAgregados = 0, tEliminados = 0, tFallidos = 0;
      const codigosOk: number[] = [];

      for (const plan of planesCandidatos) {
        try {
          const rows = await reconciliarDetallesParaPlan(plan, salidaBase, needsFrescos);
          const r = await persistirFilasEditables(plan.codigo_plan_grupo, rows, usuario);
          tActualizados += r.actualizados;
          tAgregados += r.agregados;
          tEliminados += r.eliminados;
          tFallidos += r.fallidos;
          await desactivarPlanGrupo(plan);
          codigosOk.push(plan.codigo_plan_grupo);
        } catch (e) {
          tFallidos++;
          console.warn(`[Modificar Plan Activo] Falló Plan Grupo #${plan.codigo_plan_grupo}:`, (e as Error).message);
        }
      }

      if (codigosOk.length > 0) {
        await fetchNecesidadesPlanta();
        const detalleTxt = `${tActualizados} modificados, ${tAgregados} agregados, ${tEliminados} eliminados`;
        const plural = codigosOk.length > 1;
        if (tFallidos === 0) {
          addNotification('success', `Modificación automática de plan activo: Plan${plural ? 'es' : ''} Grupo #${codigosOk.join(', #')} desactivado${plural ? 's' : ''} (fecha vencida/hoy). Detalle: ${detalleTxt}.`);
        } else {
          addNotification('warning', `Modificación automática con errores: ${detalleTxt}, ${tFallidos} fallidos. Plan${plural ? 'es' : ''} #${codigosOk.join(', #')} desactivado${plural ? 's' : ''}.`);
        }
      }
    } catch (e) {
      addNotification('error', `No se pudo completar la modificación automática del plan activo: ${(e as Error).message}. La auditoría de necesidades sí se actualizó.`);
    } finally {
      setIsEjecutandoModificacionAutomatica(false);
      setPlanActivoPendienteConfirmacion(null);
    }
  }, [planActivoPendienteConfirmacion, materialNecesidadesPlantaMap, materialOrigenesPlantaMap, reconciliarDetallesParaPlan, persistirFilasEditables, desactivarPlanGrupo, fetchNecesidadesPlanta, addNotification]);

  const handleProcessResumen = useCallback(async () => {
    // Ambos turnos en "VACÍO" (default desde ahora) significa que todavía no se definió capacidad
    // operativa para ningún horario — bloquea y pide escoger antes de generar (Gestión de Tiempos).
    if (selectedDiaShift === 'EMPTY' && selectedNocheShift === 'EMPTY') {
      addNotification('warning', 'Escoja un horario de Turno Día y/o Turno Noche (Gestión de Tiempos) antes de generar necesidades.');
      return;
    }
    if (filteredOrders.length === 0 && filteredFertOrders.length === 0) {
      setUnifiedNeeds([]);
      return;
    }

    setIsProcessingResumen(true);
    // Órdenes Provisionales (Provisionales + 014-Provisional) ya no participan en absoluto en este
    // cálculo: su cantidad nunca alimenta necesidad (NEC. PLANTA [Kg] / P2 la reemplazó por completo)
    // y su rol de "descubrir" materiales quedó cubierto por p2OnlyCodes (más abajo), que no depende de
    // que exista o no una orden Provisional. El tab "Provisionales" sigue existiendo solo como
    // auditoría manual de la data cruda SAP, desconectado de este flujo.
    const materialGroupsHalb = new Map<string, number>();
    filteredFertOrders.forEach(order => {
      // El responsable "014" no aporta a la necesidad OF_HALB: sus corridas ya se reflejan
      // aparte en las columnas informativas "Producción Diaria" (ver materialGroupsProd014).
      const responsable = getProp(order, ['RESPCTRLPROD', 'RESP_CONTROL_PROD', 'RESPCONTROLPROD', 'RespControlProd', 'RESPONSABLE']).trim();
      if (responsable === RESP_PRODUCCION_DIARIA) return;
      const matRaw = getProp(order, ['MATERIAL', 'CodMaterial']).trim();
      const match = matRaw.match(/^(\d+)/);
      const matCode = match ? match[1] : matRaw;
      if (!matCode) return;
      const orderQty = safeNum(getProp(order, ['CANTPENDIENTE', 'CANTPROGRAMADA', 'CANTIDAD']));
      materialGroupsHalb.set(matCode, (materialGroupsHalb.get(matCode) || 0) + orderQty);
    });

    // allMaterials (universo a explotar por BOM) solo viene de OF_HALB (Fert): es la única necesidad
    // real, aparte de P2, que sigue requiriendo explosión BOM completa para descubrir sus componentes.
    const allMaterials = Array.from(new Set([...materialGroupsHalb.keys()]));
    // Descripción por código de material (desde inventario SAP) — única fuente disponible de
    // descripción para materiales P2-only, ya que DetalleTactico (P2) no trae descripción propia.
    // Se necesita ANTES de armar p2OnlyCodes: sirve para filtrar solo materiales "LAMINA CILINDRICA"
    // (rollos laminados) — este módulo es exclusivo de Corte y Laminado, y P2 (materialNecesidadesPlantaMap)
    // trae la necesidad de TODA la demanda de Forros/Venta Externa/Muebles hacia este grupo, no solo la
    // de rollos laminados. Sin este filtro, materiales de otra naturaleza que esas áreas piden a
    // Laminado (ninguno debería, pero el dato de P2 no lo garantiza) se colarían como filas del resumen.
    const materialDescByCode = new Map<string, string>();
    inventarioSAP.forEach(inv => {
      const code = cleanCode(inv.MATERIAL);
      if (code && !materialDescByCode.has(code)) {
        materialDescByCode.set(code, String(inv.NOMBRE || inv.DESCRIPCION || '').toUpperCase());
      }
    });
    // Materiales con necesidad P2 (NEC. PLANTA) real, de tipo LAMINA CILINDRICA, que no aparecen como
    // componente de ninguna orden FERT: sin este camino, su necesidad P2 se calculaba pero nunca
    // llegaba a generar fila en el resumen (quedaba fuera de toda corrida/plan en silencio). Se
    // auto-explotan por su propio código para ubicar su BLOQUE FORMULADO/densidad/peso.
    const p2OnlyCodes = Array.from(materialNecesidadesPlantaMap.keys())
      .filter(code => (materialNecesidadesPlantaMap.get(code) || 0) > 0)
      .filter(code => !allMaterials.includes(code))
      .filter(code => (materialDescByCode.get(code) || '').includes('LAMINA CILINDRICA'));
    const totalToProcess = allMaterials.length + p2OnlyCodes.length;
    setResumenProgress({ current: 0, total: totalToProcess });
    const consolidatedMap = new Map<string, UnifiedNeedRow>();

    // Construye/mergea la fila de un componente (compCode) en consolidatedMap. Se usa tanto para
    // los componentes "LAMINA CILINDRICA" normales (hijos de un FERT explotado) como para materiales
    // P2 auto-explotados, donde compCode/desc corresponden al material mismo.
    const addComponentRow = (
      compCode: string,
      desc: string,
      rawData: MaterialExplosionRow[],
      qtyHalb: number,
      cantAcum: number
    ) => {
      const isConvRow = desc.includes('CONV') || desc.includes('CV');

      // Las variantes CONV no se cortan directo de un BLOQUE FORMULADO: se producen consumiendo
      // la lámina base (otra máquina, nivel posterior). Por eso, para heredar la MISMA apertura/
      // densidad/distancia que su lámina base (y así caer en el mismo bloque de corridas), se ubica
      // primero esa lámina base en el árbol BOM: la fila donde MATERIAL_PADRE = código CONV y el
      // componente es otra "LAMINA CILINDRICA" (no CONV).
      let baseLaminaRow: MaterialExplosionRow | null | undefined = null;
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

      const kgHalb = qtyHalb * cantAcum;

      if (consolidatedMap.has(compCode)) {
        const existingRow = consolidatedMap.get(compCode)!;
        existingRow.consumoKgHalb += kgHalb;
        existingRow.totalConsumoKg = existingRow.consumoKg + existingRow.consumoKgHalb;
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
          consumoKg: 0,
          consumoUn: 0,
          nroRollos: 0,
          consumoKgHalb: kgHalb,
          nroRollosHalb: 0,
          totalConsumoKg: kgHalb,
          totalNroRollos: 0,
          stock1006: s1006,
          stock1008: s1008,
          stock1015: s1015,
          stockUN1006: finalPeso > 0 ? s1006 / finalPeso : 0,
          stockUN1008: finalPeso > 0 ? s1008 / finalPeso : 0,
          stockUN1015: finalPeso > 0 ? s1015 / finalPeso : 0,
          totalStockKg: tStockKg,
          totalStockUN: tStockUN,
          prodDiariaKg: 0,
          prodDiariaUn: 0,
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
          unidades: 0, // Ya no hay fuente PROV; ver tile "PROV:"/"HALB:" (línea ~2400) a revisar aparte
          bomParentMaterial: baseLaminaRow ? dimsSourceCode : undefined,
          runsRecomendado: 0,
          necVentaExternaKg: 0,
          necVentaExternaUn: 0,
          hasDeficitVE: false
        });
      }
    };

    for (let i = 0; i < allMaterials.length; i++) {
      const matCode = allMaterials[i];
      const fullCode = matCode.padStart(18, '0');
      const qtyHalb = materialGroupsHalb.get(matCode) || 0;

      try {
        const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 500);
        const rawData: MaterialExplosionRow[] = response?.data?.data || response?.data || [];
        if (Array.isArray(rawData)) {
          const laminaRows = rawData.filter(row =>
            (row.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('LAMINA CILINDRICA') &&
            !EXCLUDED_LAMINA_MATERIALS.has(cleanCode(row.COMPONENTE))
          );

          laminaRows.forEach(comp => {
            const compCode = cleanCode(comp.COMPONENTE);
            const desc = String(comp.DESCRIPCION_COMPONENTE || '').toUpperCase();
            const cantAcum = safeNum(comp.CANTIDAD_ACUMULADA || comp.CANTIDAD_UNITARIA || 0);
            addComponentRow(compCode, desc, rawData, qtyHalb, cantAcum);
          });
        }
      } catch (e) {
        console.warn(`Error material ${matCode}:`, (e as Error).message);
      }
      setResumenProgress({ current: i + 1, total: totalToProcess });
    }

    // Materiales con necesidad P2 sin ningún pedido FERT que los explote como componente: se
    // auto-explotan por su propio código (fullCode = su propio material) para ubicar su BLOQUE
    // FORMULADO/densidad/apertura/peso. La cantidad (NEC. PLANTA [Kg]) se inyecta después, en
    // finalArray, vía materialNecesidadesPlantaMap — aquí solo se garantiza que la fila exista.
    for (let k = 0; k < p2OnlyCodes.length; k++) {
      const matCode = p2OnlyCodes[k];
      if (!consolidatedMap.has(matCode)) {
        const fullCode = matCode.padStart(18, '0');
        const desc = (materialDescByCode.get(matCode) || '').toUpperCase();
        try {
          const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 500);
          const rawData: MaterialExplosionRow[] = response?.data?.data || response?.data || [];
          addComponentRow(matCode, desc, Array.isArray(rawData) ? rawData : [], 0, 1);
        } catch (e) {
          console.warn(`Error material P2 ${matCode}:`, (e as Error).message);
        }
      }
      setResumenProgress({ current: allMaterials.length + k + 1, total: totalToProcess });
    }

    const finalArray = Array.from(consolidatedMap.values()).map(row => {
      // Órdenes Provisionales (incl. 014) YA NO participan en este cálculo ni en el descubrimiento de
      // filas (ver comentario al inicio de handleProcessResumen): el nivel superior "018" que las
      // generaba está migrado por completo a P2 (Venta Externa - Rollos) — verificado con datos reales
      // (material 30012660 tenía 570 Kg en P2 y 1920 Kg adicionales en OF_PROV-014 del mismo origen,
      // que hoy ya no se suman). NEC. PLANTA [Kg] (materialNecesidadesPlantaMap, el P2 real del área de
      // origen — Forros/Venta Externa/Muebles) es la única fuente de necesidad. Un material sin P2
      // activo de su área queda
      // en 0 aquí hasta que esa área genere el suyo — transición esperada mientras las 3 áreas migran,
      // no un bug. row.consumoKg (la explosión BOM original) se sigue calculando arriba solo para
      // descubrir QUÉ materiales existen (dims, bloque, peso) — no se usa como cantidad de necesidad.
      const necPlantaKg = materialNecesidadesPlantaMap.get(String(Number(row.material))) || 0;
      const consumoKg = necPlantaKg;
      const cUn = row.peso > 0 ? consumoKg / row.peso : 0;
      const cUnHalb = row.peso > 0 ? row.consumoKgHalb / row.peso : 0;
      // Un proceso físico no puede cortar una fracción de rollo: la necesidad total del ítem se
      // redondea hacia arriba al rollo completo (mismo criterio y epsilon que deficitRealUN) ANTES de
      // sumarla por bloque/apertura — de lo contrario, sumar las fracciones crudas y redondear una sola
      // vez al final subestima el total real (ej. 3 + 47 + 19 rollos completos por ítem = 69, pero
      // sumar los Kg fraccionarios y redondear al final da 68.2 → 68).
      const totalNecRollosRaw = cUn + cUnHalb;
      const totalNecRollos = totalNecRollosRaw > 0.001 ? Math.ceil(totalNecRollosRaw - 0.001) : 0;
      // Piso obligatorio de Venta Externa: porción de consumoKg cuyo origen es ese grupo (subconjunto
      // de necPlantaKg, ver materialNecesidadVentaExternaMap). Se redondea hacia arriba al rollo
      // completo con el mismo criterio que deficitRealUN — es el que se cubre exacto en el bloque.
      const necVentaExternaKg = materialNecesidadVentaExternaMap.get(String(Number(row.material))) || 0;
      const necVentaExternaUnRaw = row.peso > 0 ? necVentaExternaKg / row.peso : 0;
      const necVentaExternaUn = necVentaExternaUnRaw > 0.001 ? Math.ceil(necVentaExternaUnRaw - 0.001) : 0;
      // Producción Diaria (responsable "014" en FERT): match directo por código de material contra
      // el resumen (mismo nivel lámina/componente, sin explosión BOM), igual que NEC. PLANTA. Esta
      // SÍ se trata como producción ya realizada/comprometida, por eso suma a stock y no a necesidad.
      // La cantidad de la orden ya viene en Kg. Por rendimiento, si esa cantidad no alcanza el
      // peso real de un rollo completo (item.peso) no se considera producción real: queda en 0
      // (ej. 19.7 Kg contra un rollo real de 27.6 Kg no completa ni una unidad, se descarta).
      const rawProdDiariaKg = materialProd014FertMap.get(String(Number(row.material))) || 0;
      const prodDiariaKg = (row.peso > 0 && rawProdDiariaKg >= row.peso) ? rawProdDiariaKg : 0;
      const prodDiariaUn = row.peso > 0 ? prodDiariaKg / row.peso : 0;
      // T. ROLLOS BODEGAS [Kg]/[Un] = stock de bodegas (1006/1008/1015) + Producción Diaria ya filtrada.
      const totalStockKg = row.totalStockKg + prodDiariaKg;
      const totalStockUN = row.totalStockUN + prodDiariaUn;
      return {
        ...row,
        consumoKg,
        consumoUn: cUn,
        nroRollos: cUn,
        nroRollosHalb: cUnHalb,
        totalConsumoKg: consumoKg + row.consumoKgHalb,
        totalNroRollos: totalNecRollos,
        hasDeficit: totalNecRollos > totalStockUN,
        prodDiariaUn,
        prodDiariaKg,
        totalStockKg,
        totalStockUN,
        necVentaExternaKg,
        necVentaExternaUn,
        // Semáforo "rojo duro" — igual criterio que hasDeficit (stock puro, sin considerar plan
        // todavía) pero contra el piso de Venta Externa en vez del total mezclado. No admite
        // "Aprobar" manual (ver toggleAprobarDeficit): solo baja cuando el stock real ya lo cubre.
        hasDeficitVE: necVentaExternaUn > totalStockUN
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
      // solo entre las láminas estándar, y SOLO sobre la porción Forros/Muebles de su necesidad — el
      // piso de Venta Externa (necVentaExternaKg) se cubre exacto y aparte (ver más abajo), no debe
      // diluir ni ser diluido por el % de participación. Las variantes CONV no aportan al total ni
      // reciben participación propia: su necesidad viene del nivel superior (ver más abajo).
      const totalKgGroupFM = standardItems.reduce((s, r) => s + Math.max(0, r.totalConsumoKg - r.necVentaExternaKg), 0);
      standardItems.forEach(row => {
        const kgFM = Math.max(0, row.totalConsumoKg - row.necVentaExternaKg);
        row.porcentajeNecesidad = totalKgGroupFM > 0 ? (kgFM / totalKgGroupFM) : 0;
      });
      convItems.forEach(row => { row.porcentajeNecesidad = 0; });

      // El número de corridas recomendado sale del DÉFICIT REAL agregado del bloque (necesidad − stock
      // ya cubierto, sumado entre todos los materiales — Venta Externa + Forros/Muebles combinados,
      // igual que antes de la separación por origen: cuántas corridas hacen falta no cambia, solo
      // CÓMO se reparte esa bolsa entre los dos tramos, ver más abajo), no de exigir que cada material
      // reciba su % fijo de participación aunque ya tenga stock de sobra. Un material con déficit
      // chico y baja participación ya no "fuerza" corridas completas de más: su déficit real (pocas
      // unidades) cabe dentro de la capacidad de una corrida junto con el de los demás.
      const totalDeficitReal = standardItems.reduce((s, r) => s + deficitRealUN(r), 0);
      const runsNeeded = totalDeficitReal > 0 ? Math.ceil(totalDeficitReal / BLOCK_SIZE) : 0;

      // runsNeeded es la RECOMENDACIÓN automática (impulsada por el déficit real del bloque). El
      // usuario puede decidir un número de corridas distinto para el bloque (corridasManualOverrides):
      // eso NO cambia la recomendación (se conserva en runsRecomendado para referencia en la UI), solo
      // la bolsa efectiva a repartir.
      const blockKey = items[0] ? `${items[0].apertura}|${items[0].densidad}` : '';
      const runsEfectivo = corridasManualOverrides[blockKey] !== undefined ? corridasManualOverrides[blockKey] : runsNeeded;
      items.forEach(row => { row.runsRecomendado = runsNeeded; });

      const totalUnitsInPlan = runsEfectivo * BLOCK_SIZE;

      // TIER 1 — Venta Externa: piso obligatorio, se reserva primero y completo de la bolsa del
      // bloque — pero solo lo que el stock NO alcanza a cubrir (deficitVentaExternaUN, no el piso
      // bruto necVentaExternaUn): si ya hay stock suficiente para el piso, no tiene sentido forzar una
      // corrida completa de más. No pasa por el reparto proporcional. Si la bolsa no alcanza para
      // cubrir todos los déficits VE del bloque (caso límite de escasez real), se reparte proporcional
      // al tamaño de cada déficit en vez de repartir "a la baja" en silencio — mismo tipo de escasez
      // que ya está pendiente de alerta para el prorrateo por origen (ver memoria
      // "p3-origen-prioridad-pendiente"); aquí todavía no se alerta, solo se evita asignar más de lo
      // que hay.
      const totalVEBlock = standardItems.reduce((s, r) => s + deficitVentaExternaUN(r), 0);
      const veBagDisponible = Math.min(totalVEBlock, totalUnitsInPlan);
      const veAlloc = totalVEBlock > 0 && veBagDisponible >= totalVEBlock
        ? new Map(standardItems.map(r => [r.material, deficitVentaExternaUN(r)]))
        : redistribuirBolsaBloque(standardItems, veBagDisponible, r => deficitVentaExternaUN(r));

      // TIER 2 — Forros/Muebles: la bolsa restante tras reservar el piso VE se reparte con el mismo
      // criterio de siempre (déficit real F/M primero, remanente proporcional a porcentajeNecesidad,
      // ya redefinido arriba como FM-only).
      const bolsaRestanteFM = Math.max(0, totalUnitsInPlan - totalVEBlock);
      const fmAlloc = distribuirPorDeficit(standardItems, bolsaRestanteFM, deficitForrosMueblesUN);

      const distribucionCombinada = new Map<string, number>(
        standardItems.map(r => [r.material, (veAlloc.get(r.material) ?? 0) + (fmAlloc.get(r.material) ?? 0)])
      );
      // Última garantía: ningún material puede terminar con menos que su piso VE, incluso si vino de
      // un override manual de corridas del bloque (corridasManualOverrides) — "Venta Externa exacto"
      // no es negociable (ver aplicarPisoVentaExterna).
      const distribucion = aplicarPisoVentaExterna(standardItems, distribucionCombinada);
      standardItems.forEach(row => {
        const key = `${row.material}|${row.apertura}|${row.densidad}`;
        const planUn = planManualOverrides[key] !== undefined ? planManualOverrides[key] : (distribucion.get(row.material) ?? 0);

        row.planUn = planUn;
        row.planKg = planUn * row.peso;
      });

      // El tiempo de preparación (45 min por corrida física: ingreso de bloques + colocar adhesivo,
      // medido en prueba en vivo) se reparte entre los materiales del bloque según su participación
      // REAL en unidades planificadas (PLAN(UN)/total del bloque), no según porcentajeNecesidad (que
      // es en Kg y queda congelado/desalineado si hubo overrides manuales). Así el total de setup del
      // bloque (45 × corridas) sigue cerrando exacto, y queda correcto tras cualquier redistribución manual.
      const totalPlanUnGroup = standardItems.reduce((s, r) => s + r.planUn, 0);
      const corridasBloque = totalPlanUnGroup > 0 ? Math.ceil(totalPlanUnGroup / BLOCK_SIZE) : 0;
      standardItems.forEach(row => {
        const shareUn = totalPlanUnGroup > 0 ? (row.planUn / totalPlanUnGroup) : 0;
        const setupContribution = (corridasBloque > 0) ? (SETUP_TIME_PER_RUN * corridasBloque * shareUn) : 0;
        row.tProceso = ((row.looperTRolloMin || 0) * row.planUn + setupContribution) / 60;
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

    // "Modificar Plan Activo": se evalúa con cualquier cantidad de fechas seleccionadas (mínimo 1).
    // Si alguna de ellas ya venció (o es hoy), se evalúan candidatos y se pide confirmación antes de
    // reconciliar/desactivar el Plan Grupo P3 vigente que la cubre (ver
    // evaluarModificacionAutomaticaPlanActivo). Se usa finalArray (variable local, ya completo) en
    // vez de esperar a que unifiedNeeds se refleje en el próximo render. Si son 0 fechas (Plan
    // Maestro) no se evalúa: no hay una fecha puntual contra la cual auditar vencimiento.
    if (selectedDates.size >= 1) {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const hayFechaPasadaOHoy = Array.from(selectedDates).some(d => d <= todayStr);
      if (hayFechaPasadaOHoy) {
        await evaluarModificacionAutomaticaPlanActivo(finalArray);
      }
    }

    setUnifiedNeeds(finalArray);
    setIsProcessingResumen(false);
  }, [filteredOrders, filteredFertOrders, materialProd014FertMap, materialNecesidadesPlantaMap, materialNecesidadVentaExternaMap, kpiLooperData, inventarioSAP, extractMaterialInfo, planManualOverrides, corridasManualOverrides, selectedDates, evaluarModificacionAutomaticaPlanActivo, addNotification, selectedDiaShift, selectedNocheShift]);

  // Recalcula planKg/tProceso de una fila para un planUn dado (misma fórmula usada en handleProcessResumen).
  // setupContribution ya viene calculado por el caller (participación viva en unidades del bloque,
  // no el porcentajeNecesidad congelado — ver comentario en handleUpdatePlanUn); 0 para variantes CONV,
  // que no ocupan cupo de corrida propio.
  const recomputeRowForPlanUn = (row: UnifiedNeedRow, planUn: number, setupContribution: number = 0): UnifiedNeedRow => {
    const planKg = planUn * row.peso;
    const tProceso = ((row.looperTRolloMin || 0) * planUn + setupContribution) / 60;
    return { ...row, planUn, planKg, tProceso };
  };

  // Reparte targetTotal entre items según su peso relativo entre sí (por defecto porcentajeNecesidad,
  // pero puede pesarse por cualquier otra métrica vía weightOf — ver distribuirPorDeficit), cerrando
  // exacto vía redondeo por mayor resto. Usada por la edición manual de corridas por bloque, por el
  // reparto automático del déficit real, y por cualquier otro reparto proporcional de una bolsa de unidades.
  const redistribuirBolsaBloque = (
    items: UnifiedNeedRow[],
    targetTotal: number,
    weightOf: (r: UnifiedNeedRow) => number = (r) => r.porcentajeNecesidad
  ): Map<string, number> => {
    const sumWeight = items.reduce((s, r) => s + weightOf(r), 0);
    const raw = items.map(r => {
      const weight = sumWeight > 0 ? (weightOf(r) / sumWeight) : (1 / (items.length || 1));
      return { material: r.material, raw: targetTotal * weight };
    });

    const final = new Map<string, number>();
    raw.forEach(o => final.set(o.material, Math.floor(o.raw)));
    const flooredSum = raw.reduce((s, o) => s + Math.floor(o.raw), 0);
    let remainder = Math.round(targetTotal - flooredSum);
    const byRemDesc = [...raw].sort((a, b) => (b.raw - Math.floor(b.raw)) - (a.raw - Math.floor(a.raw)));
    for (let i = 0; i < byRemDesc.length && remainder > 0; i++) {
      const m = byRemDesc[i].material;
      final.set(m, (final.get(m) || 0) + 1);
      remainder--;
    }
    const byRemAsc = [...byRemDesc].reverse();
    for (let i = 0; i < byRemAsc.length && remainder < 0; i++) {
      const m = byRemAsc[i].material;
      const current = final.get(m) || 0;
      if (current > 0) {
        final.set(m, current - 1);
        remainder++;
      }
    }
    return final;
  };

  // Reparte totalUnitsInPlan (la bolsa de un bloque) según el DÉFICIT de cada material, definido por
  // deficitOf (por defecto deficitRealUN, el déficit mezclado — pásale deficitForrosMueblesUN para
  // repartir solo el tramo Forros/Muebles, dejando el piso de Venta Externa fuera de esta bolsa, ver
  // groupMap.forEach en handleProcessResumen).
  //
  // Sin déficit real en el bloque no hay "mínimo" que garantizar: se reparte directo por participación
  // en Kg (porcentajeNecesidad, el peso por defecto de redistribuirBolsaBloque) — no tendría sentido
  // pesar por un déficit que es 0 para todos.
  //
  // Con déficit real, reparto en DOS FASES:
  //   Fase 1 — cada material recibe exacto su déficit (nadie se queda corto). Si la bolsa NO alcanza
  //   para cubrir todos los déficits, se reparte completa proporcional al TAMAÑO del déficit de cada
  //   uno (ver caso histórico más abajo) y no hay fase 2 — no queda excedente.
  //   Fase 2 — el excedente (bolsa − déficit total), si lo hay, se reparte proporcional a la
  //   participación en Kg (porcentajeNecesidad) entre TODOS los materiales del bloque, incluidos los
  //   que ya cubrieron su déficit en la fase 1 (déficit = 0). Antes ese excedente no existía como
  //   fase propia: la bolsa completa se pesaba solo por déficit, así que un material con déficit=0
  //   (stock ya cubierto) quedaba en 0 UN aunque tuviera % de participación visible y sobrara bolsa
  //   por asignar — visualmente inconsistente contra la columna "% Participación". Con la fase 2,
  //   ese sobrante se reparte por participación como corresponde, en vez de perderse en un solo
  //   material. (Distinto del bug histórico ya corregido: antes el sobrante SOLO se pesaba por Kg
  //   entre los de déficit=0, dejando a un material con 99.5% Kg pero déficit chico acaparar casi
  //   todo el sobrante mientras otro con 0.5% Kg y déficit grande — caso real: 206 - D19 AF PL — se
  //   quedaba solo con su mínimo; aquí la fase 1 ya garantizó el déficit de cada uno primero, así que
  //   la fase 2 solo reparte lo que sobra después de eso.)
  const distribuirPorDeficit = (
    items: UnifiedNeedRow[],
    totalUnitsInPlan: number,
    deficitOf: (r: UnifiedNeedRow) => number = deficitRealUN
  ): Map<string, number> => {
    const totalDeficit = items.reduce((s, r) => s + deficitOf(r), 0);

    if (totalDeficit <= 0) {
      return redistribuirBolsaBloque(items, totalUnitsInPlan);
    }
    if (totalUnitsInPlan <= totalDeficit) {
      return redistribuirBolsaBloque(items, totalUnitsInPlan, deficitOf);
    }

    const fase1 = new Map<string, number>(items.map(r => [r.material, deficitOf(r)]));
    const excedente = totalUnitsInPlan - totalDeficit;
    const fase2 = redistribuirBolsaBloque(items, excedente);

    return new Map<string, number>(
      items.map(r => [r.material, (fase1.get(r.material) ?? 0) + (fase2.get(r.material) ?? 0)])
    );
  };

  // Aplica el piso obligatorio de Venta Externa como último paso sobre CUALQUIER distribución ya
  // calculada (automática o manual): ningún material puede terminar con un planUn por debajo de lo
  // que el stock NO alcanza a cubrir de su piso (deficitVentaExternaUN — si el stock ya cubre el piso
  // completo, no exige producción de más). Como ese remanente no es negociable ("Venta Externa exacto"
  // — decisión: bloquear, no solo advertir), el total resultante puede terminar superando la
  // bolsa/corridas solicitadas si esta no alcanzaba para cubrirlo; se prioriza cumplir el piso sobre
  // cerrar el múltiplo exacto de BLOCK_SIZE. Se usa tanto en el cálculo automático
  // (handleProcessResumen) como en los 3 caminos de edición manual (handleUpdatePlanUn,
  // handleConfirmarCompletarTecho, handleUpdateCorridasBloque) para que la garantía sea uniforme sin
  // importar quién decidió el valor.
  const aplicarPisoVentaExterna = (items: UnifiedNeedRow[], distribution: Map<string, number>): Map<string, number> => {
    const result = new Map(distribution);
    items.forEach(r => {
      const minimo = deficitVentaExternaUN(r); // neto de stock — si el stock ya cubre el piso, no exige producción
      const current = result.get(r.material) ?? 0;
      if (minimo > current) result.set(r.material, minimo);
    });
    return result;
  };

  // Alterna la aprobación visual del semáforo en rojo con plan ya asignado (ver approvedDeficitRows).
  const toggleAprobarDeficit = (material: string, apertura: string, densidad: string) => {
    const key = `${material}|${apertura}|${densidad}`;
    setApprovedDeficitRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // PLAN (UN) por material es editable libremente e independiente de los demás materiales del bloque
  // (no reparte ninguna "bolsa" fija ni tiene tope contra el total automático): permite corregir a mano
  // incluso un bloque que el cálculo automático dejó en 0 corridas. El total de setup (128 min/corrida)
  // sí se recalcula para TODO el bloque tras la edición, según la participación en unidades vigente
  // (planUn/total del bloque), para que siga cerrando exacto. El número de corridas del bloque
  // (Subtotal/corridas) se ajusta a este único material vía el control de "Corridas" del bloque.
  const handleUpdatePlanUn = (material: string, apertura: string, densidad: string, rawValue: number) => {
    const inGroup = (r: UnifiedNeedRow) => r.apertura === apertura && r.densidad === densidad;
    const editedRowNow = unifiedNeeds.find(r => inGroup(r) && r.material === material);
    const isConvEdit = editedRowNow ? isConvDescripcion(editedRowNow.descripcion) : false;

    let newValue = Math.max(0, Math.round(rawValue) || 0); // nunca negativo
    // "Venta Externa exacto" (decisión: bloquear, no solo advertir — ver aplicarPisoVentaExterna): un
    // material estándar no puede bajar, por edición manual, de lo que el stock NO alcanza a cubrir de
    // su piso VE (deficitVentaExternaUN, no el piso bruto: si el stock ya cubre el piso, no hace falta
    // forzar producción). Se sube al mínimo y se avisa por qué, en vez de aceptar en silencio un valor
    // que dejaría a Venta Externa desabastecida.
    const minimoVE = editedRowNow ? deficitVentaExternaUN(editedRowNow) : 0;
    if (!isConvEdit && editedRowNow && newValue < minimoVE) {
      newValue = minimoVE;
      addNotification('warning', `Material ${material}: no puede bajar de ${minimoVE} UN — es lo mínimo que el stock no alcanza a cubrir del piso obligatorio de Venta Externa (necesidad exacta, no participa del reparto proporcional).`);
    }
    const key = `${material}|${apertura}|${densidad}`;
    setPlanOverrides(prevOv => ({ ...prevOv, [key]: newValue }));

    setUnifiedNeeds(prev => {
      const editedRow = prev.find(r => inGroup(r) && r.material === material);
      if (!editedRow) return prev;

      // Variantes CONV: no ocupan cupo de corrida propio del bloque (se producen en otra máquina a
      // partir de la lámina base ya cortada), por eso su edición es totalmente independiente — no
      // afecta el total/corridas del bloque ni a los demás materiales, y viceversa. Permite, por
      // ejemplo, subir/bajar manualmente su cantidad aunque no tenga corrida propia planificada,
      // apoyándose en stock disponible de la lámina base.
      if (isConvDescripcion(editedRow.descripcion)) {
        return prev.map(row => (row === editedRow) ? recomputeRowForPlanUn(row, newValue, 0) : row);
      }

      const standardGroup = prev.filter(r => inGroup(r) && !isConvDescripcion(r.descripcion));
      const newGroupTotal = standardGroup.reduce((s, r) => s + (r.material === material ? newValue : r.planUn), 0);
      const corridasBloque = newGroupTotal > 0 ? Math.ceil(newGroupTotal / BLOCK_SIZE) : 0;
      const setupFor = (planUn: number) => (corridasBloque > 0 && newGroupTotal > 0)
        ? SETUP_TIME_PER_RUN * corridasBloque * (planUn / newGroupTotal)
        : 0;

      return prev.map(row => {
        if (!inGroup(row)) return row;
        if (row.material === material && !isConvDescripcion(row.descripcion)) {
          return recomputeRowForPlanUn(row, newValue, setupFor(newValue));
        }
        if (!isConvDescripcion(row.descripcion)) {
          return recomputeRowForPlanUn(row, row.planUn, setupFor(row.planUn));
        }
        // La variante CONV hereda automáticamente el plan de su lámina base (proceso alterno: x2),
        // salvo que ella misma tenga una anulación manual propia. No ocupa cupo de corrida propio,
        // por eso no recibe setupContribution (queda en 0, el default).
        if (row.bomParentMaterial === material) {
          const convKey = `${row.material}|${row.apertura}|${row.densidad}`;
          if (planManualOverrides[convKey] === undefined) {
            return recomputeRowForPlanUn(row, Math.round(newValue * CONV_SPLIT_FACTOR));
          }
        }
        return row;
      });
    });

    // Se ofrece redistribuir siempre que la cantidad realmente cambie y haya otros materiales en el
    // bloque con quién redistribuir — cubre tanto "no tenía plan de corrida y se le asigna uno" como
    // "ya tenía plan y se le suma/resta". Nunca automático: requiere acción explícita del usuario
    // sobre el toast (ver redistribuirToast / handleConfirmarCompletarTecho); el toast no bloquea, la
    // edición ya quedó aplicada — si se ignora, el bloque simplemente ajusta sus corridas al nuevo total.
    if (!isConvEdit && editedRowNow && newValue !== editedRowNow.planUn) {
      const standardGroupNow = unifiedNeeds.filter(r => inGroup(r) && !isConvDescripcion(r.descripcion));
      if (standardGroupNow.length > 1) {
        const currentTotal = standardGroupNow.reduce((s, r) => s + r.planUn, 0);
        const othersSum = standardGroupNow.reduce((s, r) => s + (r.material === material ? 0 : r.planUn), 0);
        const techoActual = currentTotal > 0 ? Math.ceil(currentTotal / BLOCK_SIZE) * BLOCK_SIZE : 0;
        const techoNuevo = (othersSum + newValue) > 0 ? Math.ceil((othersSum + newValue) / BLOCK_SIZE) * BLOCK_SIZE : 0;
        setRedistribuirToast({ material, apertura, densidad, editedValue: newValue, techoActual, techoNuevo });
      }
    }
  };

  // Aplica la redistribución que el usuario confirmó desde redistribuirToast: reparte SOLO entre los
  // demás materiales estándar del bloque (proporcional a su participación entre sí), dejando intacto
  // el valor que el usuario acaba de escribir para el material editado.
  const handleConfirmarCompletarTecho = () => {
    const pending = redistribuirToast;
    if (!pending) return;
    const { material, apertura, densidad, editedValue, techoNuevo } = pending;

    setUnifiedNeeds(prev => {
      const inGroup = (r: UnifiedNeedRow) => r.apertura === apertura && r.densidad === densidad;
      const standardGroup = prev.filter(r => inGroup(r) && !isConvDescripcion(r.descripcion));
      const others = standardGroup.filter(r => r.material !== material);
      if (others.length === 0) return prev;

      const targetOthersTotal = Math.max(0, techoNuevo - editedValue);
      // "Venta Externa exacto" (bloquear, no advertir): ningún material de "others" puede terminar
      // bajo su piso VE aunque eso empuje el total por encima de targetOthersTotal — ver
      // aplicarPisoVentaExterna.
      const distribution = aplicarPisoVentaExterna(others, redistribuirBolsaBloque(others, targetOthersTotal));

      setPlanOverrides(prevOv => {
        const next = { ...prevOv };
        others.forEach(r => {
          next[`${r.material}|${r.apertura}|${r.densidad}`] = distribution.get(r.material) ?? r.planUn;
        });
        return next;
      });

      // Suma real lograda tras aplicarPisoVentaExterna (puede superar targetOthersTotal si algún piso
      // VE no cabía en la bolsa original) — se usa la real, no la solicitada, para que el setup del
      // bloque siga cerrando exacto contra lo que de verdad se va a producir.
      const actualOthersTotal = others.reduce((s, r) => s + (distribution.get(r.material) ?? 0), 0);
      const newGroupTotal = editedValue + actualOthersTotal;
      const corridasBloque = newGroupTotal > 0 ? Math.ceil(newGroupTotal / BLOCK_SIZE) : 0;
      const setupFor = (planUn: number) => (corridasBloque > 0 && newGroupTotal > 0)
        ? SETUP_TIME_PER_RUN * corridasBloque * (planUn / newGroupTotal)
        : 0;

      return prev.map(row => {
        if (!inGroup(row)) return row;
        if (row.material === material && !isConvDescripcion(row.descripcion)) {
          return recomputeRowForPlanUn(row, editedValue, setupFor(editedValue));
        }
        if (!isConvDescripcion(row.descripcion)) {
          const v = distribution.get(row.material) ?? row.planUn;
          return recomputeRowForPlanUn(row, v, setupFor(v));
        }
        if (row.bomParentMaterial) {
          const parentValue = row.bomParentMaterial === material ? editedValue : distribution.get(row.bomParentMaterial);
          const convKey = `${row.material}|${row.apertura}|${row.densidad}`;
          if (parentValue !== undefined && planManualOverrides[convKey] === undefined) {
            return recomputeRowForPlanUn(row, Math.round(parentValue * CONV_SPLIT_FACTOR));
          }
        }
        return row;
      });
    });

    addNotification('success', `Bloque ${apertura}/${densidad}: corrida completada a ${techoNuevo.toLocaleString()} UN, capacidad redistribuida entre los demás materiales.`);
    setRedistribuirToast(null);
  };

  const handleDescartarCompletarTecho = () => setRedistribuirToast(null);

  // Auto-descarte del toast de redistribución tras 8s si el usuario no interactúa — no bloquea el
  // flujo, y evita que se acumule si el usuario sigue editando otros materiales.
  useEffect(() => {
    if (!redistribuirToast) return;
    const timer = setTimeout(() => setRedistribuirToast(null), 8000);
    return () => clearTimeout(timer);
  }, [redistribuirToast]);

  // Control de "Corridas" a nivel de bloque (independiente de PLAN(UN) por material): el usuario
  // decide un número de corridas distinto al recomendado por el algoritmo de déficit (runsRecomendado)
  // — por ejemplo, bajar de 3 a 1 corrida, o subir de 1 a 2 — y el sistema redistribuye
  // proporcionalmente (según porcentajeNecesidad) las cantidades entre los materiales estándar del
  // bloque para que sumen exactamente corridas × BLOCK_SIZE. Si el usuario vuelve a poner el valor
  // recomendado, se limpia el override y el bloque vuelve a modo 100% automático.
  const handleUpdateCorridasBloque = (apertura: string, densidad: string, rawCorridas: number) => {
    const newCorridas = Math.max(0, Math.round(rawCorridas) || 0);
    const blockKey = `${apertura}|${densidad}`;

    setUnifiedNeeds(prev => {
      const inGroup = (r: UnifiedNeedRow) => r.apertura === apertura && r.densidad === densidad;
      const standardGroup = prev.filter(r => inGroup(r) && !isConvDescripcion(r.descripcion));
      if (standardGroup.length === 0) return prev;

      const isBackToAuto = newCorridas === standardGroup[0].runsRecomendado;
      const newTotal = newCorridas * BLOCK_SIZE;
      // "Venta Externa exacto" (bloquear, no advertir): si el usuario baja las corridas del bloque por
      // debajo de lo que hace falta para cubrir todos los pisos VE, igual se garantiza cada piso — ver
      // aplicarPisoVentaExterna. El feedback inmediato aquí es proporcional (no pasa por
      // distribuirPorDeficit); handleProcessResumen sigue siendo la fuente de verdad al reprocesar.
      const distribution = aplicarPisoVentaExterna(standardGroup, redistribuirBolsaBloque(standardGroup, newTotal));

      setPlanOverrides(prevOv => {
        const next = { ...prevOv };
        standardGroup.forEach(r => {
          const k = `${r.material}|${r.apertura}|${r.densidad}`;
          if (isBackToAuto) {
            delete next[k];
          } else {
            next[k] = distribution.get(r.material) ?? r.planUn;
          }
        });
        return next;
      });

      setCorridasOverrides(prevOv => {
        const next = { ...prevOv };
        if (isBackToAuto) {
          delete next[blockKey];
        } else {
          next[blockKey] = newCorridas;
        }
        return next;
      });

      // Suma real lograda tras aplicarPisoVentaExterna (puede superar newTotal si algún piso VE no
      // cabía en la bolsa solicitada) — se usa la real para que el setup del bloque cierre exacto.
      const actualTotal = standardGroup.reduce((s, r) => s + (distribution.get(r.material) ?? 0), 0);
      const corridasBloque = actualTotal > 0 ? Math.ceil(actualTotal / BLOCK_SIZE) : 0;
      const setupFor = (planUn: number) => (corridasBloque > 0 && actualTotal > 0)
        ? SETUP_TIME_PER_RUN * corridasBloque * (planUn / actualTotal)
        : 0;

      return prev.map(row => {
        if (!inGroup(row)) return row;
        if (!isConvDescripcion(row.descripcion)) {
          const v = distribution.get(row.material) ?? row.planUn;
          return recomputeRowForPlanUn(row, v, setupFor(v));
        }
        if (row.bomParentMaterial) {
          const parentNewPlan = distribution.get(row.bomParentMaterial);
          const convKey = `${row.material}|${row.apertura}|${row.densidad}`;
          if (parentNewPlan !== undefined && planManualOverrides[convKey] === undefined) {
            return recomputeRowForPlanUn(row, Math.round(parentNewPlan * CONV_SPLIT_FACTOR));
          }
        }
        return row;
      });
    });

    addNotification('info', `Bloque ${apertura}/${densidad}: corridas ajustadas a ${newCorridas} — cantidades redistribuidas automáticamente entre los materiales del bloque.`);
  };

  // Sección dos del tab Resumen — "Simulación Salida de Datos por Respuesta": toma como universo
  // los materiales que "Necesidades Planta" referencia (match por código contra Resumen Necesidades
  // — materialNecesidadesPlantaMap), y responde por cada uno con lo que YA está planificado en
  // corrida (planKg/planUn) si tiene, o con el stock disponible (totalStockKg/totalStockUN, que ya
  // incluye bodegas + Producción Diaria) si no hay corrida prevista.
  const respuestaSalidaRows = useMemo((): RespuestaSalidaRow[] => {
    return unifiedNeeds
      .filter(u => materialNecesidadesPlantaMap.has(String(Number(u.material))))
      .map((u): RespuestaSalidaRow => {
        const tieneCorrida = u.planUn > 0;
        const origenesMap = materialOrigenesPlantaMap.get(String(Number(u.material)));
        const origenes = origenesMap && origenesMap.size > 0 ? Array.from(origenesMap.keys()).join(', ') : '—';
        return {
          material: u.material,
          descripcion: u.descripcion,
          tieneCorrida,
          cantidadKg: tieneCorrida ? u.planKg : u.totalStockKg,
          cantidadUn: tieneCorrida ? u.planUn : u.totalStockUN,
          origenes,
        };
      })
      .sort((a, b) => Number(a.tieneCorrida) - Number(b.tieneCorrida));
  }, [unifiedNeeds, materialNecesidadesPlantaMap, materialOrigenesPlantaMap]);

  // Paso 1: arma la vista previa de lo que se va a grabar (PlanGrupo + materiales) y abre el
  // diálogo de confirmación. No llama a ningún servicio todavía. Los materiales a guardar salen de
  // la sección dos del tab Resumen — "Simulación Salida de Datos por Respuesta" (respuestaSalidaRows):
  // con corrida = cantidad planificada, sin corrida = stock disponible.
  const handleOpenGuardarPlan = useCallback(() => {
    const rowsToSave = respuestaSalidaRows.filter(row => row.cantidadKg > 0);
    if (rowsToSave.length === 0) {
      addNotification('warning', 'No hay materiales con cantidad (plan o stock) para guardar.');
      return;
    }

    // El P3 es la RESPUESTA del día siguiente a la revisión: sin importar qué fechas estén marcadas
    // en el calendario del módulo (esas son el rango de producción, no la fecha de la respuesta), su
    // fecha_inicio_plan/fecha_fin_plan se fuerza siempre a hoy + 1 día.
    const fechaRespuesta = format(addDays(new Date(), 1), 'yyyy-MM-dd');

    setPlanPreview({
      codigo_grupo: CODIGO_GRUPO_LAMINADO,
      nombreGrupo: 'Corte y Laminado (Centro 1000)',
      valor: 'Plan Táctico - Centro 1000 - P3',
      fechaInicio: fechaRespuesta,
      fechaFin: fechaRespuesta,
      rows: rowsToSave,
    });
  }, [respuestaSalidaRows, addNotification]);

  // Paso 2: el usuario confirmó en el diálogo. Crea un único PlanGrupo (grupo 8 = Corte y Laminado
  // Centro 1000) y, por cada material con plan asignado, uno o más DetalleTactico: codigo_plan_grupo
  // es siempre el nuevo plan de Laminado (dueño del registro), pero codigo_plan_grupo_padre es el
  // plan ORIGEN de la necesidad (la otra área que la generó, según "Necesidades Planta"). Si un
  // material tiene necesidad de varias áreas, el planKg se prorratea entre esos orígenes y se
  // genera una fila por cada uno (ver getOrigenesProrrateo).
  const handleConfirmGuardarPlan = useCallback(async () => {
    if (!planPreview) return;
    setIsSavingPlan(true);
    try {
      const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
      const usuario = user?.name || 'admin';

      const planPayload = {
        codigo_plan_grupo: 0,
        codigo_grupo: planPreview.codigo_grupo,
        // No existe ninguna FamiliaProductos para el grupo 8 (Corte y Laminado) en la tabla
        // familia_productos, así que no hay un codigo_familia_producto real que asignar. Se envía
        // null explícito (a diferencia de undefined, que JSON.stringify omite del payload) para
        // probar si la columna es nullable en el backend.
        codigo_familia_grupo: null,
        // Se envía vacío a pedido explícito de negocio (2026-07-15): antes se fijó codigo_plan: 2
        // ("PMP-V-1", único PlanGlobal activo) porque codigo_plan: 3 era una FK inválida y causaba
        // "Foreign key constraint violation" al crear el PlanGrupo. Si el backend todavía exige esa
        // FK sobre plan_global, este guardado volverá a fallar con el mismo error.
        codigo_plan: null,
        valor: planPreview.valor,
        fecha_inicio_plan: planPreview.fechaInicio,
        fecha_fin_plan: planPreview.fechaFin,
        estado: 'A',
        usuario_creacion: usuario,
      };

      const planResponse = await planGrupoService.save(planPayload as unknown as PlanGrupo);
      const nuevoCodigoPlanGrupo = planResponse.data.codigo_plan_grupo;

      let exitosos = 0;
      let fallidos = 0;

      for (const row of planPreview.rows) {
        const splits = getOrigenesProrrateo(row.material, row.cantidadKg, nuevoCodigoPlanGrupo);
        for (const split of splits) {
          if (split.cantidadKg <= 0) continue;
          try {
            const detallePayload = {
              codigo_detalle_tactico: 0,
              codigo_material: Number(row.material),
              cantidad_produccion_neta: Math.round(split.cantidadKg).toFixed(0),
              resp_ctrl_prod: '',
              clase_aprovisionamiento: 'E',
              cantidad_aprovisionamiento: 0,
              estado: 'A',
              codigo_plan_grupo: nuevoCodigoPlanGrupo,
              codigo_plan_grupo_padre: split.codigoPadre,
              usuario_modificacion: usuario,
            };
            await detalleTacticoService.save(detallePayload as unknown as DetalleTactico);
            exitosos++;
          } catch (e) {
            console.warn(`[Guardar Plan] Falló material ${row.material} (padre ${split.codigoPadre}):`, (e as Error).message);
            fallidos++;
          }
        }
      }

      if (fallidos === 0) {
        addNotification('success', `Plan guardado: ${exitosos} materiales registrados en el Plan Grupo #${nuevoCodigoPlanGrupo}.`);
      } else {
        addNotification('warning', `Plan Grupo #${nuevoCodigoPlanGrupo} creado. ${exitosos} materiales guardados, ${fallidos} fallaron.`);
      }
      fetchNecesidadesPlanta();
      setPlanPreview(null);
    } catch (e) {
      addNotification('error', `Error al guardar el plan: ${(e as Error).message}`);
    } finally {
      setIsSavingPlan(false);
    }
  }, [planPreview, addNotification, fetchNecesidadesPlanta, getOrigenesProrrateo]);

  // Variante "PFD" del Paso 1: mismo universo de materiales que "Guardar Plan" (P3), pero los
  // materiales sin corrida ("No — stock", tieneCorrida === false) se fuerzan a cantidad 0 en vez de
  // usar el stock disponible como fallback. Es un PlanGrupo independiente (valor "...- PFD"), no
  // reemplaza ni modifica el plan P3; sirve solo para dejar constancia de qué material quedó sin
  // planificar. A diferencia de "Guardar Plan" no se filtran los materiales en 0: todos entran a la
  // vista previa porque el objetivo es persistirlos igual.
  const handleOpenGuardarPlanPFD = useCallback(() => {
    const rowsToSave = respuestaSalidaRows.map(row => row.tieneCorrida ? row : { ...row, cantidadKg: 0, cantidadUn: 0 });
    if (rowsToSave.length === 0) {
      addNotification('warning', 'No hay materiales para guardar en el Plan PFD.');
      return;
    }

    const dates = Array.from(selectedDates).sort();
    const fechaInicio = dates.length > 0 ? dates[0] : format(new Date(), 'yyyy-MM-dd');
    const fechaFin = dates.length > 0 ? dates[dates.length - 1] : fechaInicio;

    setPlanPreviewPFD({
      codigo_grupo: CODIGO_GRUPO_LAMINADO,
      nombreGrupo: 'Corte y Laminado (Centro 1000)',
      valor: 'Plan Táctico - Centro 1000 - PFD',
      fechaInicio,
      fechaFin,
      rows: rowsToSave,
    });
  }, [respuestaSalidaRows, selectedDates, addNotification]);

  // Paso 2 del plan PFD: mismo PlanGrupo + DetalleTactico que "Guardar Plan", incluyendo el mismo
  // codigo_plan_grupo_padre (origen real vía getOrigenesProrrateo) que usa el flujo P3 — los
  // materiales "No — stock" solo difieren en que su cantidad ya viene forzada a 0 desde
  // handleOpenGuardarPlanPFD, pero el padre reportado debe ser el origen real, no el propio plan PFD
  // (auto-referenciarlo rompía la trazabilidad contra la necesidad que lo generó). A diferencia del
  // guardado normal, aquí SÍ se guarda el registro aunque la cantidad sea 0, ya que el propósito es
  // que el material aparezca en la salida de datos para visualización.
  const handleConfirmGuardarPlanPFD = useCallback(async () => {
    if (!planPreviewPFD) return;
    setIsSavingPlanPFD(true);
    try {
      const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
      const usuario = user?.name || 'admin';

      const planPayload = {
        codigo_plan_grupo: 0,
        codigo_grupo: planPreviewPFD.codigo_grupo,
        codigo_familia_grupo: null,
        codigo_plan: null,
        valor: planPreviewPFD.valor,
        fecha_inicio_plan: planPreviewPFD.fechaInicio,
        fecha_fin_plan: planPreviewPFD.fechaFin,
        estado: 'A',
        usuario_creacion: usuario,
      };

      const planResponse = await planGrupoService.save(planPayload as unknown as PlanGrupo);
      const nuevoCodigoPlanGrupo = planResponse.data.codigo_plan_grupo;

      let exitosos = 0;
      let fallidos = 0;

      for (const row of planPreviewPFD.rows) {
        const splits = getOrigenesProrrateo(row.material, row.cantidadKg, nuevoCodigoPlanGrupo);
        for (const split of splits) {
          if (row.tieneCorrida && split.cantidadKg <= 0) continue;
          try {
            const detallePayload = {
              codigo_detalle_tactico: 0,
              codigo_material: Number(row.material),
              cantidad_produccion_neta: Math.round(split.cantidadKg).toFixed(0),
              resp_ctrl_prod: '',
              clase_aprovisionamiento: 'E',
              cantidad_aprovisionamiento: 0,
              estado: 'A',
              codigo_plan_grupo: nuevoCodigoPlanGrupo,
              codigo_plan_grupo_padre: split.codigoPadre,
              usuario_modificacion: usuario,
            };
            await detalleTacticoService.save(detallePayload as unknown as DetalleTactico);
            exitosos++;
          } catch (e) {
            console.warn(`[Guardar Plan PFD] Falló material ${row.material} (padre ${split.codigoPadre}):`, (e as Error).message);
            fallidos++;
          }
        }
      }

      if (fallidos === 0) {
        addNotification('success', `Plan PFD guardado: ${exitosos} materiales registrados en el Plan Grupo #${nuevoCodigoPlanGrupo}.`);
      } else {
        addNotification('warning', `Plan Grupo PFD #${nuevoCodigoPlanGrupo} creado. ${exitosos} materiales guardados, ${fallidos} fallaron.`);
      }
      fetchNecesidadesPlanta();
      setPlanPreviewPFD(null);
    } catch (e) {
      addNotification('error', `Error al guardar el plan PFD: ${(e as Error).message}`);
    } finally {
      setIsSavingPlanPFD(false);
    }
  }, [planPreviewPFD, addNotification, fetchNecesidadesPlanta, getOrigenesProrrateo]);

  // Paso 1 de edición: busca los PlanGrupo activos de Corte y Laminado directo por codigo_grupo
  // (CODIGO_GRUPO_LAMINADO) en planGrupoService.getAll(), NO a través de "Necesidades Planta"
  // (necesidadesPlantaData solo indexa planes con valor "...P2" de OTRAS áreas — este módulo nunca
  // crea un "P2" propio, solo "P3"/"PFD" al guardar, así que esos planes jamás aparecían ahí). Como
  // ahora pueden convivir varios PlanGrupo activos para el mismo grupo (P3 real y PFD de
  // visualización, o varios guardados en el tiempo), ya NO se auto-selecciona el más reciente: se
  // listan todos ordenados por codigo_plan_grupo descendente y el usuario elige cuál editar (el
  // último guardado queda preseleccionado por defecto, ver handleConfirmarSeleccionPlan).
  const handleOpenEditarPlan = useCallback(async () => {
    setIsLoadingEditPlan(true);
    try {
      const planesRes = await planGrupoService.getAll();
      const planesGrupo = (planesRes.data || [])
        .filter(p => p.codigo_grupo === CODIGO_GRUPO_LAMINADO && p.estado === 'A')
        .sort((a, b) => b.codigo_plan_grupo - a.codigo_plan_grupo);

      if (planesGrupo.length === 0) {
        addNotification('warning', 'No hay ningún Plan Grupo activo guardado para Corte y Laminado (Centro 1000).');
        return;
      }

      setPlanesGrupoDisponibles(planesGrupo);
      setPlanGrupoSeleccionado(planesGrupo[0].codigo_plan_grupo);
    } catch (e) {
      addNotification('error', `Error al cargar los planes: ${(e as Error).message}`);
    } finally {
      setIsLoadingEditPlan(false);
    }
  }, [addNotification]);

  // Paso 2 de edición: ya elegido el PlanGrupo en la grilla, en vez de repetir los valores ya
  // guardados, recalcula la salida de datos ACTUAL (misma fuente que al crear el plan —
  // respuestaSalidaRows) y la usa como base editable, aplicando la misma variante con la que se creó
  // ese plan: "PFD" fuerza cantidad 0 en materiales sin corrida, cualquier otro valor (P3) usa el
  // fallback a stock igual que "Guardar Plan". Se reconcilia contra los DetalleTactico ya persistidos
  // (por material + codigo_plan_grupo_padre) para reutilizar el mismo codigo_detalle_tactico y que se
  // actualice en el mismo registro en vez de duplicar; lo que ya no aparece en el cálculo actual
  // queda premarcado para eliminar (el usuario puede desmarcarlo antes de confirmar).
  const handleConfirmarSeleccionPlan = useCallback(async () => {
    if (!planGrupoSeleccionado || !planesGrupoDisponibles) return;
    const planVigente = planesGrupoDisponibles.find(p => p.codigo_plan_grupo === planGrupoSeleccionado);
    if (!planVigente) return;

    setIsLoadingEditPlan(true);
    try {
      const rows = await reconciliarDetallesParaPlan(planVigente, respuestaSalidaRows, unifiedNeeds);

      setEditPlanPreview({
        codigo_plan_grupo: planVigente.codigo_plan_grupo,
        valor: planVigente.valor,
        fechaInicio: planVigente.fecha_inicio_plan ? String(planVigente.fecha_inicio_plan).split('T')[0] : '—',
        fechaFin: planVigente.fecha_fin_plan ? String(planVigente.fecha_fin_plan).split('T')[0] : '—',
        rows,
      });
      setPlanesGrupoDisponibles(null);
      setPlanGrupoSeleccionado(null);
    } catch (e) {
      addNotification('error', `Error al cargar el plan: ${(e as Error).message}`);
    } finally {
      setIsLoadingEditPlan(false);
    }
  }, [planGrupoSeleccionado, planesGrupoDisponibles, addNotification, unifiedNeeds, respuestaSalidaRows, reconciliarDetallesParaPlan]);

  // Materiales del Resumen actual que todavía no están en el plan cargado, disponibles para agregar.
  const materialesDisponiblesParaAgregar = useMemo(() => {
    if (!editPlanPreview) return [];
    const yaIncluidos = new Set(editPlanPreview.rows.map(r => r.material));
    return unifiedNeeds.filter(u => u.planUn > 0 && !yaIncluidos.has(u.material));
  }, [editPlanPreview, unifiedNeeds]);

  const handleAddMaterialToEditPlan = (material: string) => {
    const needRow = unifiedNeeds.find(u => u.material === material);
    if (!needRow) return;
    setEditPlanPreview(prev => {
      if (!prev) return prev;
      // Igual que al crear el plan: si la necesidad del material viene de varias áreas, se prorratea
      // y se agrega una fila por cada origen (codigo_plan_grupo_padre = ese origen real).
      const splits = getOrigenesProrrateo(needRow.material, needRow.planKg, prev.codigo_plan_grupo);
      const nuevasFilas: EditableDetalleRow[] = splits
        .filter(split => split.cantidadKg > 0)
        .map(split => ({
          codigo_detalle_tactico: 0,
          material: needRow.material,
          descripcion: needRow.descripcion,
          cantidad: split.cantidadKg,
          marcadoEliminar: false,
          esNuevo: true,
          codigo_plan_grupo_padre: split.codigoPadre,
        }));
      return { ...prev, rows: [...prev.rows, ...nuevasFilas] };
    });
  };

  // En filas nuevas (aún no guardadas) "quitar" simplemente las descarta de la lista; en filas
  // existentes se marcan para eliminar (DELETE real al confirmar), permitiendo deshacer antes de guardar.
  const handleRemoveEditRow = (index: number) => {
    setEditPlanPreview(prev => {
      if (!prev) return prev;
      const row = prev.rows[index];
      if (row.esNuevo) {
        return { ...prev, rows: prev.rows.filter((_, i) => i !== index) };
      }
      return { ...prev, rows: prev.rows.map((r, i) => (i === index ? { ...r, marcadoEliminar: !r.marcadoEliminar } : r)) };
    });
  };

  const handleUpdateEditRowCantidad = (index: number, value: number) => {
    setEditPlanPreview(prev => {
      if (!prev) return prev;
      const rows = prev.rows.map((r, i) => (i === index ? { ...r, cantidad: value } : r));
      return { ...prev, rows };
    });
  };

  const handleConfirmEditarPlan = useCallback(async () => {
    if (!editPlanPreview) return;
    setIsSavingEditPlan(true);
    try {
      const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
      const usuario = user?.name || 'admin';

      const { actualizados, agregados, eliminados, fallidos } =
        await persistirFilasEditables(editPlanPreview.codigo_plan_grupo, editPlanPreview.rows, usuario);

      if (fallidos === 0) {
        addNotification('success', `Plan Grupo #${editPlanPreview.codigo_plan_grupo} actualizado: ${actualizados} modificados, ${agregados} agregados, ${eliminados} eliminados.`);
      } else {
        addNotification('warning', `Plan Grupo #${editPlanPreview.codigo_plan_grupo} actualizado con errores: ${actualizados} modificados, ${agregados} agregados, ${eliminados} eliminados, ${fallidos} fallidos.`);
      }
      fetchNecesidadesPlanta();
      setEditPlanPreview(null);
    } catch (e) {
      addNotification('error', `Error al actualizar el plan: ${(e as Error).message}`);
    } finally {
      setIsSavingEditPlan(false);
    }
  }, [editPlanPreview, addNotification, fetchNecesidadesPlanta, persistirFilasEditables]);

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
      // Las variantes CONV se procesan en otra máquina (no ocupan cupo de corrida del Looper, ver
      // groupedNeeds/group.totalTProceso), por eso su tProceso no debe sumar al tiempo operativo
      // total ni a la ocupación real del Looper (ver TIEMPO OPERATIVO (H) / OCUPACIÓN REAL (%)).
      tProceso: acc.tProceso + (isConvDescripcion(row.descripcion) ? 0 : row.tProceso)
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

  // Disponibilidad neta OEE calculada de forma independiente por turno (cada turno descuenta
  // su propio 13% de pérdidas estándar) para poder evaluar la disponibilidad real de cada turno
  // por separado. El MTTO Preventivo se sigue descontando una sola vez sobre la suma de ambos turnos.
  const diaDisponibleOEE = useMemo(() => {
    const diaH = diaShiftOptions.find(o => o.v === selectedDiaShift)?.h || 0;
    return diaH * 0.87;
  }, [selectedDiaShift]);

  const nocheDisponibleOEE = useMemo(() => {
    const nocheH = nocheShiftOptions.find(o => o.v === selectedNocheShift)?.h || 0;
    return nocheH * 0.87;
  }, [selectedNocheShift]);

  const tDisponible = useMemo(() => {
    return Math.max(0, (diaDisponibleOEE + nocheDisponibleOEE) - mttoPreventivoHoras); // + descuento del MTTO Preventivo (Operación Adicional)
  }, [diaDisponibleOEE, nocheDisponibleOEE, mttoPreventivoHoras]);

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

    const rows: CorridaOutputRow[] = [];
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
    // Estructura fija de carga SAP: Material, Centro, Clase de orden, Cantidad,
    // Inicio programado, Clase de programación, Clave. Centro/Clase de orden/Clase de
    // programación/Clave son siempre el mismo valor para esta línea de producción.
    const lines = rows.map(r => {
      const [y, m, d] = r.fecha.split('-');
      const inicioProgramado = `${d}.${m}.${y}`;
      return [r.material, '1000', 'ZMOQ', Math.round(r.planKg), inicioProgramado, '1', '000'].join('\t');
    });
    const content = lines.join('\n');
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
      <div className="sticky top-0 z-30 bg-white border border-gray-100 rounded-2xl shadow-md overflow-hidden mb-8 font-sans text-left">
        <div className="grid grid-cols-12 border-b border-gray-100">
          {/* 1. Demanda Consolidada (2 cols) */}
          <div className="col-span-2 p-3 border-r border-gray-100 bg-gray-50/50 flex flex-col justify-center min-h-[120px]">
            <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest text-center mb-3">DEMANDA CONSOLIDADA</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 font-bold text-[9px]">
                <p className="text-slate-400 uppercase text-center border-b border-gray-200 pb-1 mb-2">KG</p>
                <div className="flex justify-between px-1 text-slate-500"><span>NEC. PLANTA:</span> <span className="text-red-600">{formatNum(totalsUnified.kg, 0)}</span></div>
                <div className="flex justify-between px-1 text-slate-500"><span>HALB:</span> <span className="text-blue-600">{formatNum(totalsUnified.kgHalb, 0)}</span></div>
                <div className="flex justify-between px-1 pt-1 border-t border-gray-200 mt-1 text-slate-800"><span className="font-black">TOTAL:</span> <span>{formatNum(totalsUnified.totalKg, 0)}</span></div>
              </div>
              <div className="space-y-1 font-bold text-[9px]">
                <p className="text-slate-400 uppercase text-center border-b border-gray-200 pb-1 mb-2">UN</p>
                <div className="flex justify-between px-1 text-slate-500"><span>PROV:</span> <span className="text-red-600">{formatNum(totalsUnified.un, 0)}</span></div>
                <div className="flex justify-between px-1 text-slate-500"><span>HALB:</span> <span className="text-blue-600">{formatNum(totalsUnified.totalRollos - totalsUnified.un, 0)}</span></div>
                <div className="flex justify-between px-1 pt-1 border-t border-gray-200 mt-1 text-slate-800"><span className="font-black">TOTAL:</span> <span>{formatNum(totalsUnified.totalRollos, 0)}</span></div>
              </div>
            </div>
          </div>

          {/* 2. Plan (2 cols - Reducido) */}
          <div className="col-span-2 grid grid-cols-2 border-r border-gray-100">
            <div className="p-3 border-r border-gray-100 flex flex-col items-center justify-center text-center bg-indigo-50/50">
              <p className="text-[8px] font-black uppercase text-slate-400 tracking-tighter mb-4">ROLLOS REQ. (KG)</p>
              <span className="text-lg font-black text-indigo-700 tracking-tighter leading-none">{formatNum(totalsUnified.planKg, 0)}</span>
            </div>
            <div className="p-3 flex flex-col items-center justify-center text-center bg-gray-50">
              <p className="text-[8px] font-black uppercase text-slate-400 tracking-tighter mb-4">ROLLOS REQ. (UN)</p>
              <span className="text-xl font-black text-slate-800 tracking-tighter leading-none">{Math.round(totalsUnified.planUn).toLocaleString()}</span>
            </div>
          </div>

          {/* 3. Corridas LOOPER (1 col - Reducido) */}
          <div className={cn(
            "p-3 border-r border-gray-100 flex flex-col items-center justify-center text-center transition-all",
            isSaturated ? "bg-red-600 animate-pulse" : "bg-cyan-50/60"
          )}>
            <p className={cn("text-[8px] font-black uppercase tracking-tighter mb-4", isSaturated ? "text-white" : "text-cyan-800")}>CORRIDAS LOOPER</p>
            <span className={cn("text-3xl font-black tracking-tighter leading-none", isSaturated ? "text-white" : "text-cyan-900")}>{totalsUnified.totalRuns}</span>
            {isSaturated && <span className="text-[7px] font-black uppercase text-white mt-2">ALERTA CAPACIDAD</span>}
          </div>

          {/* 4. Gestión de Tiempos (2 cols - Ampliada) */}
          <div className="col-span-2 p-3 border-r border-gray-100 flex flex-col justify-center">
            <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest mb-4 text-center">GESTIÓN DE TIEMPOS</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-slate-400 w-12">DÍA:</span>
                <select value={selectedDiaShift} onChange={(e) => setSelectedDiaShift(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] text-indigo-700 flex-1 font-black outline-none appearance-none cursor-pointer">
                  {diaShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                <span className="text-[8px] font-black text-indigo-700 whitespace-nowrap tabular-nums" title="Disponibilidad neta del turno Día (-13% OEE)">{diaDisponibleOEE.toFixed(2)}h</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-slate-400 w-12">NOCHE:</span>
                <select value={selectedNocheShift} onChange={(e) => setSelectedNocheShift(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-[10px] text-indigo-700 flex-1 font-black outline-none appearance-none cursor-pointer">
                  {nocheShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                <span className="text-[8px] font-black text-purple-700 whitespace-nowrap tabular-nums" title="Disponibilidad neta del turno Noche (-13% OEE)">{nocheDisponibleOEE.toFixed(2)}h</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] font-black text-slate-400 w-12">MTTO:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="flex-1 bg-indigo-50/60 border border-indigo-200 rounded-lg px-2 py-1.5 flex items-center justify-between hover:bg-indigo-50 transition-colors cursor-pointer">
                      <span className="text-[8px] font-black text-indigo-700 uppercase flex items-center gap-1"><Info className="w-3 h-3" /> MTTO PREVENTIVO</span>
                      <span className="text-[10px] font-black text-indigo-700">{mttoPreventivoHoras.toFixed(2)} H</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[300px] p-4 bg-white border border-gray-100 rounded-2xl shadow-xl text-slate-800" align="start">
                    <p className="text-[9px] font-black uppercase text-indigo-700 tracking-widest mb-1">Operación Adicional — Looper</p>
                    <p className="text-[8px] text-slate-400 font-bold uppercase mb-3">Tareas de mantenimiento preventivo programadas</p>
                    {mttoPreventivoTasks.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic">Sin mantenimientos programados para la(s) fecha(s) seleccionada(s)</p>
                    ) : (
                      <div className="space-y-2">
                        {mttoPreventivoTasks.map((t, i) => (
                          <div key={i} className="flex items-center justify-between gap-2 text-[9px] border-b border-gray-100 pb-1.5">
                            <span className="font-bold uppercase text-slate-600 truncate max-w-[140px]" title={t.maquina}>{t.maquina}</span>
                            <span className="text-slate-400 font-mono">{t.fecha || '—'}</span>
                            <span className="font-black text-indigo-700 whitespace-nowrap">{t.horas.toFixed(2)}h</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between pt-1 text-[9px]">
                          <span className="font-black uppercase text-slate-800">Total</span>
                          <span className="font-black text-indigo-700">{mttoPreventivoHoras.toFixed(2)}h</span>
                        </div>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>

          {/* 5. Personal Asignado (5 cols - Ampliada) */}
          <div className="col-span-5 p-4 flex flex-col justify-center bg-gray-50/50">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest">PERSONAL ASIGNADO — LAMINADO CILÍNDRICO</p>
              <button
                type="button"
                onClick={handleAutoAssignPersonnel}
                title="Asigna automáticamente según calificación: Operador A (>50%) en OP-01, Ayudante B (≤50%) en OP-02, para ambos turnos"
                className="text-[7px] font-black uppercase tracking-wider text-emerald-700 border border-emerald-300 bg-white rounded px-2 py-1 hover:bg-emerald-50 transition-colors"
              >
                Auto-asignar por calificación
              </button>
            </div>
            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-2 border-l-2 border-indigo-400 pl-4">
                <p className="text-[8px] text-indigo-700 uppercase font-black tracking-widest mb-2">TURNO DÍA</p>
                <div className="space-y-3">
                   <div className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-3 text-[8px] text-slate-400 font-black">OP-01</span>
                      <select value={assignedPersonnel.diaOp1} onChange={(e) => handleAssignOperator('diaOp1', e.target.value)}
                        className="col-span-9 bg-white border border-gray-200 rounded px-2 py-1.5 text-[9px] text-slate-700 font-black outline-none focus:border-indigo-500">
                        <option value="">— SELECCIONAR —</option>
                        {operadoresLaminado.map((op, i) => {
                          const code = getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR']);
                          const taken = isOperatorTakenElsewhere('diaOp1', code);
                          return (
                            <option key={i} value={code} disabled={taken}>
                              {getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])} — [{getProp(op, ['Calificacion', 'CALIFICACION'])}]{taken ? ' (ASIGNADO)' : ''}
                            </option>
                          );
                        })}
                      </select>
                   </div>
                   <div className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-3 text-[8px] text-slate-400 font-black">OP-02</span>
                      <select value={assignedPersonnel.diaOp2} onChange={(e) => handleAssignOperator('diaOp2', e.target.value)}
                        className="col-span-9 bg-white border border-gray-200 rounded px-2 py-1.5 text-[9px] text-slate-700 font-black outline-none focus:border-indigo-500">
                        <option value="">— SELECCIONAR —</option>
                        {operadoresLaminado.map((op, i) => {
                          const code = getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR']);
                          const taken = isOperatorTakenElsewhere('diaOp2', code);
                          return (
                            <option key={i} value={code} disabled={taken}>
                              {getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])} — [{getProp(op, ['Calificacion', 'CALIFICACION'])}]{taken ? ' (ASIGNADO)' : ''}
                            </option>
                          );
                        })}
                      </select>
                   </div>
                </div>
              </div>

              <div className="space-y-2 border-l-2 border-purple-400 pl-4">
                <p className="text-[8px] text-purple-700 uppercase font-black tracking-widest mb-2">TURNO NOCHE</p>
                <div className="space-y-3">
                   <div className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-3 text-[8px] text-slate-400 font-black">OP-01</span>
                      <select value={assignedPersonnel.nocheOp1} onChange={(e) => handleAssignOperator('nocheOp1', e.target.value)}
                        className="col-span-9 bg-white border border-gray-200 rounded px-2 py-1.5 text-[9px] text-slate-700 font-black outline-none focus:border-purple-500">
                        <option value="">— SELECCIONAR —</option>
                        {operadoresLaminado.map((op, i) => {
                          const code = getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR']);
                          const taken = isOperatorTakenElsewhere('nocheOp1', code);
                          return (
                            <option key={i} value={code} disabled={taken}>
                              {getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])} — [{getProp(op, ['Calificacion', 'CALIFICACION'])}]{taken ? ' (ASIGNADO)' : ''}
                            </option>
                          );
                        })}
                      </select>
                   </div>
                   <div className="grid grid-cols-12 items-center gap-2">
                      <span className="col-span-3 text-[8px] text-slate-400 font-black">OP-02</span>
                      <select value={assignedPersonnel.nocheOp2} onChange={(e) => handleAssignOperator('nocheOp2', e.target.value)}
                        className="col-span-9 bg-white border border-gray-200 rounded px-2 py-1.5 text-[9px] text-slate-700 font-black outline-none focus:border-purple-500">
                        <option value="">— SELECCIONAR —</option>
                        {operadoresLaminado.map((op, i) => {
                          const code = getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR']);
                          const taken = isOperatorTakenElsewhere('nocheOp2', code);
                          return (
                            <option key={i} value={code} disabled={taken}>
                              {getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])} — [{getProp(op, ['Calificacion', 'CALIFICACION'])}]{taken ? ' (ASIGNADO)' : ''}
                            </option>
                          );
                        })}
                      </select>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 bg-gray-50/70 border-t border-gray-100">
          <div className="col-span-3 p-4 border-r border-gray-100 flex items-center justify-center gap-6">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">OCUPACIÓN REAL (%)</div>
            <div className="flex items-center gap-3">
              <div className={cn("w-3 h-3 rounded-full shadow-[0_0_10px]", ocupacionPorc > 100 ? "bg-red-500 shadow-red-500 animate-pulse" : "bg-emerald-500 shadow-emerald-500")} />
              <span className={cn("text-2xl font-black tabular-nums", ocupacionPorc > 100 ? "text-red-600" : "text-emerald-600")}>{ocupacionPorc.toFixed(1)}%</span>
            </div>
          </div>
          <div className="col-span-2 p-4 border-r border-gray-100 flex flex-col items-center justify-center">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">TIEMPO OPERATIVO (H)</p>
            <span className="text-2xl font-black text-emerald-600 leading-none tabular-nums">{totalsUnified.tProceso.toFixed(2)}</span>
          </div>
          <div className="col-span-2 p-4 border-r border-gray-100 flex flex-col items-center justify-center">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mb-1">DISPONIBILIDAD TOTAL (H)</p>
            <span className="text-2xl font-black text-amber-600 leading-none tabular-nums">{tDisponible.toFixed(2)}</span>
            <p className="text-[7px] font-bold text-slate-400 uppercase tracking-tighter mt-1">Día {diaDisponibleOEE.toFixed(2)}h + Noche {nocheDisponibleOEE.toFixed(2)}h (-13% OEE c/u) -{mttoPreventivoHoras.toFixed(2)}h MTTO</p>
          </div>
          <div className="col-span-5 flex items-center px-6">
             {isSaturated && (
               <div className="flex items-center gap-3 text-red-600 animate-pulse">
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
           <Button onClick={handleProcessResumen} disabled={isProcessingResumen} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2">
              {isProcessingResumen ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} GENERAR NECESIDADES
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
        <TabsList className="grid grid-cols-5 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[
            { v: 'resumen', l: 'Resumen Necesidades', i: LayoutDashboard },
            { v: 'necesidadesPlanta', l: 'Necesidades Planta', i: Boxes },
            // Tab "Provisionales" (v: 'ordenes') oculto: dejó de aportar al cálculo de Resumen
            // Necesidades (ver handleProcessResumen) y su tabla es solo auditoría manual de SAP.
            // El TabsContent y filteredOrders se conservan en el código (no se eliminan) porque
            // filteredOrders sigue siendo necesario para datesWithOrders (calendario) y el guard de
            // handleProcessResumen.
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

          <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white mt-8">
            <div className="overflow-x-auto max-h-[600px] relative text-left">
              <table className="w-full border-collapse font-sans text-[11px] text-center">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-slate-100 text-slate-700 uppercase font-black tracking-tighter text-[10px] border-b-2 border-slate-300">
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
                    <th className="px-3 py-4 border-r border-black/5 text-amber-800 bg-amber-50/60 uppercase">Producción Diaria (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 text-amber-800 bg-amber-50/60 uppercase">Producción Diaria (Un)</th>
                    <th className="px-3 py-4 border-r border-black/10 bg-indigo-50 text-indigo-700 uppercase">T. ROLLOS BODEGAS UN</th>
                    <th className="px-3 py-4 border-r border-black/10 bg-indigo-50 text-indigo-700 uppercase">T. ROLLOS BODEGAS KG</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right text-teal-800 bg-teal-50/60 uppercase">NEC. PLANTA [Kg]</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right text-slate-700 uppercase">OF_HALB [Kg]</th>
                    <th className="px-4 py-4 border-r border-black/10 text-right bg-slate-100 text-slate-800 font-black uppercase">T. NECESIDADES [Kg]</th>
                    <th className="px-3 py-4 border-r border-black/5 text-teal-800 bg-teal-50/60 uppercase">NEC. PLANTA [Un]</th>
                    <th className="px-3 py-4 border-r border-black/5 text-slate-700 uppercase">HALB [Un]</th>
                    <th className="px-3 py-4 border-r border-black/10 bg-amber-50 text-amber-700 font-black uppercase">T. NECESIDADES [Un]</th>
                    <th className="px-3 py-4 border-r border-black/5 text-center uppercase" title="Rojo duro = piso Venta Externa sin cubrir (no se puede aprobar). Rojo blando = déficit Forros/Muebles. % = participación Forros/Muebles dentro del bloque, sin Venta Externa.">semaforo % Nec.</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right font-black bg-[#fee2e2] text-red-900 uppercase">PLAN (UN)</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right font-black bg-[#fee2e2] text-red-900 uppercase">PLAN (KG)</th>
                    <th className="px-4 py-4 text-right font-black bg-indigo-50 text-indigo-700 uppercase">T. PROCESO (H)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {isProcessingResumen ? (
                    <tr><td colSpan={25} className="py-20 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto text-red-500 mb-3" />
                      <p className="text-[10px] font-black uppercase text-slate-400 mb-3">
                        Generando Necesidades: {resumenProgress.current} / {resumenProgress.total}
                      </p>
                      <div className="w-full max-w-md mx-auto h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-red-600 transition-all duration-300"
                          style={{ width: `${resumenProgress.total > 0 ? Math.min((resumenProgress.current / resumenProgress.total) * 100, 100) : 0}%` }}
                        />
                      </div>
                      <p className="text-[9px] font-bold text-slate-300 mt-2 tabular-nums">
                        {resumenProgress.total > 0 ? Math.round((resumenProgress.current / resumenProgress.total) * 100) : 0}%
                      </p>
                    </td></tr>
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
                               <div className="flex flex-col gap-1.5">
                                  {group.hasGroupDeficit ? (
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 animate-pulse" /><span className="text-red-700">CORRIDA NECESARIA LOOPER D-{group.densidad}</span></div>
                                  ) : (
                                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500" /><span className="text-indigo-900">CORRIDA LOOPER D-{group.densidad}</span></div>
                                  )}
                                  <div className="flex items-center gap-1.5 normal-case" onClick={(e) => e.stopPropagation()}>
                                     <span className="text-[9px] text-slate-500 font-black uppercase tracking-wide">Corridas</span>
                                     <button
                                       type="button"
                                       onClick={() => { setCorridasDraft(prev => { const n = { ...prev }; delete n[groupKey]; return n; }); handleUpdateCorridasBloque(group.apertura, group.densidad, Math.max(0, group.runs - 1)); }}
                                       title="Quitar una corrida"
                                       className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white text-slate-600 font-black leading-none hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                     >−</button>
                                     <input
                                       type="number"
                                       min="0"
                                       value={corridasDraft[groupKey] !== undefined ? corridasDraft[groupKey] : group.runs}
                                       onChange={(e) => setCorridasDraft(prev => ({ ...prev, [groupKey]: e.target.value }))}
                                       onBlur={() => commitCorridasDraft(group.apertura, group.densidad)}
                                       onKeyDown={commitDraftOnEnter}
                                       className={cn(
                                         "w-10 bg-white border rounded px-1 text-center font-black focus:outline-none focus:ring-2",
                                         (group.items[0]?.runsRecomendado ?? 0) !== group.runs
                                           ? "border-amber-400 text-amber-700 focus:ring-amber-400"
                                           : "border-slate-200 text-slate-700 focus:ring-indigo-400"
                                       )}
                                     />
                                     <button
                                       type="button"
                                       onClick={() => { setCorridasDraft(prev => { const n = { ...prev }; delete n[groupKey]; return n; }); handleUpdateCorridasBloque(group.apertura, group.densidad, group.runs + 1); }}
                                       title="Agregar una corrida"
                                       className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white text-slate-600 font-black leading-none hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                     >+</button>
                                     <span className="text-[9px] text-slate-400 font-bold whitespace-nowrap">recomendado: {group.items[0]?.runsRecomendado ?? 0}</span>
                                     {(() => {
                                       const recomendado = group.items[0]?.runsRecomendado ?? 0;
                                       const delta = group.runs - recomendado;
                                       if (delta === 0) return null;
                                       // Subir corridas por encima del recomendado no genera riesgo de cobertura (solo
                                       // deja stock de sobra): se marca como "refuerzo" informativo, no como alerta.
                                       // Bajar por debajo del recomendado sí puede dejar déficit real sin cubrir: se
                                       // marca en tono de advertencia. En ambos casos el botón hace lo mismo: volver
                                       // al valor recomendado (mismo mecanismo de redistribución).
                                       const isRefuerzo = delta > 0;
                                       return (
                                         <>
                                           <span className={cn(
                                             "text-[8px] font-black rounded px-1.5 py-0.5 flex items-center gap-1 whitespace-nowrap border",
                                             isRefuerzo ? "text-sky-700 bg-sky-50 border-sky-300" : "text-amber-700 bg-amber-50 border-amber-300"
                                           )}>
                                             {isRefuerzo ? <Info className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                                             {isRefuerzo ? `CORRIDA ADICIONAL (+${delta})` : `AJUSTE MANUAL (${delta}) · BAJO EL DÉFICIT`}
                                           </span>
                                           <button
                                             type="button"
                                             onClick={() => { setCorridasDraft(prev => { const n = { ...prev }; delete n[groupKey]; return n; }); handleUpdateCorridasBloque(group.apertura, group.densidad, recomendado); }}
                                             title="Restablecer al valor recomendado"
                                             className="w-5 h-5 flex items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                           >
                                             <RefreshCw className="w-2.5 h-2.5" />
                                           </button>
                                         </>
                                       );
                                     })()}
                                  </div>
                               </div>
                            </td>
                            <td colSpan={11} className="border-r border-gray-100/10"></td>
                            <td className="px-3 py-4 bg-indigo-50 text-indigo-700 font-mono border-r border-gray-100/10">{formatNum(group.totalStockUN, 0)}</td>
                            <td className="px-3 py-4 bg-indigo-50 text-indigo-700 font-mono border-r border-gray-100/10">{formatNum(group.totalStockKg, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-teal-800 bg-teal-50/40 border-r border-gray-100/10">{formatNum(group.totalKg, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-slate-700 bg-indigo-50/50 border-r border-gray-100/10">{formatNum(group.totalKgHalb, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-slate-800 bg-slate-100 border-r border-gray-100/10">{formatNum(group.totalConsumoKg, 0)}</td>
                            <td className="px-3 py-4 font-mono font-black text-teal-900 bg-teal-50/40 border-r border-gray-100/10">{formatNum(group.totalRollos, 0)}</td>
                            <td className="px-3 py-4 bg-[#d1d5db]/50 font-mono text-slate-800 border-r border-gray-100/10">{formatNum(group.totalRollosHalb, 0)}</td>
                            <td className="px-3 py-4 bg-amber-50 font-mono text-amber-700 border-r border-gray-100/10">{formatNum(group.totalNroRollos, 0)}</td>
                            <td className="border-r border-gray-100/10"></td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-[#fee2e2] border-r border-gray-100/10">{formatNum(group.totalPlanUn, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-[#fee2e2] border-r border-gray-100/10">{formatNum(group.totalPlanKg, 0)}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-indigo-700 bg-indigo-50">{formatNum(group.totalTProceso, 1)}</td>
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
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-slate-700">{Math.round(item.peso).toLocaleString()}</td>
                              <td className="px-2 py-3 border-r border-gray-100 text-slate-700">{item.densidad}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-slate-700">{item.looperTRolloMin || '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-700">{item.stock1006 > 0 ? Math.round(item.stock1006).toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-indigo-900">{item.stockUN1006 > 0 ? Math.round(item.stockUN1006).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-700">{item.stock1008 > 0 ? Math.round(item.stock1008).toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-indigo-900">{item.stockUN1008 > 0 ? Math.round(item.stockUN1008).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-700">{item.stock1015 > 0 ? Math.round(item.stock1015).toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-indigo-900">{item.stockUN1015 > 0 ? Math.round(item.stockUN1015).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-amber-800 bg-amber-50/20">{item.prodDiariaKg > 0 ? Math.round(item.prodDiariaKg).toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-amber-900 bg-amber-50/20">{item.prodDiariaUn > 0 ? Math.round(item.prodDiariaUn).toLocaleString() : '—'}</td>
                              <td className="px-3 py-4 border-r border-gray-100 font-mono text-indigo-900 bg-indigo-50/10">{Math.round(item.totalStockUN).toLocaleString()}</td>
                              <td className="px-3 py-4 border-r border-gray-100 font-mono text-indigo-900 bg-indigo-50/10">{Math.round(item.totalStockKg).toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono text-teal-800 bg-teal-50/30">{Math.round(item.consumoKg).toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono text-slate-700">{Math.round(item.consumoKgHalb).toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono text-slate-900 font-black">{Math.round(item.totalConsumoKg).toLocaleString()}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-teal-900 bg-teal-50/30 font-black">{Math.round(item.consumoUn).toLocaleString()}</td>
                              <td className="px-3 py-3 border-r border-gray-100 bg-[#d1d5db]/10 font-mono text-slate-900">{Math.round(item.nroRollosHalb).toLocaleString()}</td>
                              <td className="px-3 py-3 border-r border-gray-100 bg-slate-100/10 font-mono text-slate-900 font-black">{Math.round(item.totalNroRollos).toLocaleString()}</td>
                              <td className="px-3 py-3 border-r border-gray-100 text-center font-black">
                                 <div className="flex flex-col items-center gap-1">
                                    {(() => {
                                      const deficitKey = `${item.material}|${item.apertura}|${item.densidad}`;
                                      // Rojo "duro" (Venta Externa): a diferencia de Forros/Muebles, esto NO es un
                                      // juicio del planificador — el sistema ya garantiza el piso vía planUn
                                      // (aplicarPisoVentaExterna), así que basta con que stock + plan ya cubran el
                                      // piso para pasar a verde automáticamente, sin botón "Aprobar". Solo se queda
                                      // en rojo duro en el caso límite de escasez real (la bolsa del bloque no
                                      // alcanzó ni para el piso — ver TIER 1 en handleProcessResumen).
                                      const veCubierta = (item.totalStockUN + item.planUn) >= item.necVentaExternaUn;
                                      const veDeficitDuro = item.necVentaExternaUn > 0 && !veCubierta;
                                      // Rojo "blando" (Forros/Muebles): el resto del déficit mezclado, sigue admitiendo
                                      // "Aprobar" cuando ya hay corrida asignada, igual que antes de la separación.
                                      const fmDeficitBlando = item.hasDeficit && veCubierta;
                                      const requiereAprobacion = fmDeficitBlando && item.planUn > 0;
                                      const aprobado = requiereAprobacion && approvedDeficitRows.has(deficitKey);
                                      const enVerde = !item.hasDeficit || (fmDeficitBlando && aprobado);
                                      return (
                                        <>
                                          <div className={cn(
                                            "w-3 h-3 rounded-full",
                                            enVerde ? "bg-green-500" : veDeficitDuro ? "bg-red-700 shadow-[0_0_10px_#b91c1c] animate-pulse" : "bg-red-500 shadow-[0_0_8px_#ef4444]"
                                          )} />
                                          <span className={cn("text-[8px] font-black uppercase tracking-tighter", enVerde ? "text-green-700" : "text-red-700")}>
                                            {!item.hasDeficit ? "STOCK OK" : veDeficitDuro ? "VE: STOCK BAJO" : aprobado ? "CORRIDA ASIGNADA" : "STOCK BAJO"}
                                          </span>
                                          <span className="text-[9px] text-slate-900 font-black font-mono" title="Participación dentro del bloque — solo Forros/Muebles, Venta Externa no compite por este %">
                                            {(item.porcentajeNecesidad * 100).toFixed(1)}%
                                          </span>
                                          {item.necVentaExternaUn > 0 && (
                                            <span className="text-[7px] text-indigo-700 font-black font-mono bg-indigo-50 border border-indigo-200 rounded px-1 py-0.5" title="Piso obligatorio Venta Externa — se cubre exacto, no participa del %">
                                              VE: {item.necVentaExternaUn.toLocaleString()} UN
                                            </span>
                                          )}
                                          {requiereAprobacion && (
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); toggleAprobarDeficit(item.material, item.apertura, item.densidad); }}
                                              title={aprobado ? "Aprobado con corrida ya asignada — click para revertir" : "Stock bajo pero ya tiene corrida asignada: aprobar confirma que la corrida corrige la necesidad"}
                                              className={cn(
                                                "flex items-center gap-1 text-[7px] font-black uppercase tracking-wide rounded px-1.5 py-0.5 border whitespace-nowrap",
                                                aprobado ? "bg-emerald-50 text-emerald-700 border-emerald-300" : "bg-red-50 text-red-700 border-red-300 animate-pulse"
                                              )}
                                            >
                                              {aprobado ? <CheckCircle2 className="w-2.5 h-2.5" /> : <AlertCircle className="w-2.5 h-2.5" />}
                                              {aprobado ? "APROBADO" : "APROBAR"}
                                            </button>
                                          )}
                                        </>
                                      );
                                    })()}
                                 </div>
                              </td>
                              <td className="px-2 py-3 border-r border-black/10 bg-[#fee2e2]/20">
                                 {(() => {
                                   // Material 100% Venta Externa (sin participación Forros/Muebles, porcentajeNecesidad
                                   // === 0): PLAN (UN) queda bloqueado — editar no tiene ningún uso legítimo, ya que
                                   // el valor siempre se fuerza de vuelta al piso obligatorio (ver aplicarPisoVentaExterna).
                                   // Las variantes CONV quedan excluidas: su planUn no pasa por ese piso, se deriva de
                                   // la lámina base (bomParentMaterial).
                                   const soloVentaExterna = !isConvDescripcion(item.descripcion) && item.necVentaExternaUn > 0 && item.porcentajeNecesidad === 0;
                                   if (soloVentaExterna) {
                                     return (
                                       <input
                                         type="number"
                                         value={item.planUn}
                                         disabled
                                         title="Bloqueado: material 100% Venta Externa — el plan siempre es exacto a la necesidad, no se edita manualmente"
                                         className="w-16 bg-indigo-50 border border-indigo-200 rounded px-1 text-center font-black text-indigo-900 cursor-not-allowed"
                                       />
                                     );
                                   }
                                   const planUnKey = `${item.material}|${item.apertura}|${item.densidad}`;
                                   return (
                                     <input
                                       type="number"
                                       min="0"
                                       value={planUnDraft[planUnKey] !== undefined ? planUnDraft[planUnKey] : item.planUn}
                                       onChange={(e) => setPlanUnDraft(prev => ({ ...prev, [planUnKey]: e.target.value }))}
                                       onBlur={() => commitPlanUnDraft(item.material, item.apertura, item.densidad)}
                                       onKeyDown={commitDraftOnEnter}
                                       className="w-16 bg-white border border-red-200 rounded px-1 text-center font-black text-red-900 focus:outline-none focus:ring-2 focus:ring-red-400"
                                     />
                                   );
                                 })()}
                              </td>
                              <td className="px-4 py-3 border-r border-black/10 text-right font-mono text-red-900 bg-[#fee2e2]/20">{Math.round(item.planKg).toLocaleString()}</td>
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

          <div
            ref={fabRef}
            style={fabPos ? { position: 'fixed', top: fabPos.y, left: fabPos.x, zIndex: 50 } : { position: 'fixed', bottom: '2rem', right: '2rem', zIndex: 50 }}
            className="flex flex-col items-stretch gap-1.5 bg-white/95 backdrop-blur border border-slate-200 rounded-2xl shadow-2xl p-2 select-none"
          >
            <div
              onMouseDown={handleFabDragStart}
              className="flex items-center justify-center h-4 text-slate-400 hover:text-slate-600 cursor-grab active:cursor-grabbing"
              title="Mover"
            >
              <GripHorizontal className="w-4 h-4" />
            </div>
            <button
              onClick={handleOpenGuardarPlan}
              disabled={isSavingPlan || respuestaSalidaRows.every(r => r.cantidadKg <= 0)}
              className="h-10 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSavingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {isSavingPlan ? 'Guardando...' : 'Guardar Plan'}
            </button>
            <button
              onClick={handleOpenGuardarPlanPFD}
              disabled={isSavingPlanPFD || respuestaSalidaRows.length === 0}
              className="h-10 px-4 rounded-full bg-amber-600 hover:bg-amber-700 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-amber-600/30 flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isSavingPlanPFD ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardList className="w-4 h-4" />}
              {isSavingPlanPFD ? 'Guardando...' : 'Guardar Plan PFD'}
            </button>
            <button
              onClick={handleOpenEditarPlan}
              disabled={isLoadingEditPlan}
              className="h-10 px-4 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoadingEditPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
              {isLoadingEditPlan ? 'Cargando...' : 'Editar Plan'}
            </button>
          </div>

          <Dialog open={planActivoPendienteConfirmacion !== null} onOpenChange={(open) => { if (!open && !isEjecutandoModificacionAutomatica) setPlanActivoPendienteConfirmacion(null); }}>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Confirmar desactivación de Plan Activo</DialogTitle>
                <DialogDescription>
                  La(s) fecha(s) seleccionada(s) incluye una ya vencida o de hoy, cubierta por el/los siguiente(s)
                  Plan Grupo P3 (creados en un día anterior a hoy). Al confirmar, se reconcilian sus detalles contra
                  la necesidad recién calculada y se marcan como inactivos (estado &apos;I&apos;). Esta acción no crea un plan
                  nuevo ni afecta Provisionales/FERT.
                </DialogDescription>
              </DialogHeader>
              {planActivoPendienteConfirmacion && (
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-gray-50 text-gray-400 uppercase font-bold">
                      <tr>
                        <th className="px-3 py-2 text-left">Plan Grupo</th>
                        <th className="px-3 py-2 text-left">Valor</th>
                        <th className="px-3 py-2 text-left">Rango</th>
                        <th className="px-3 py-2 text-left">Creado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {planActivoPendienteConfirmacion.planes.map(plan => (
                        <tr key={plan.codigo_plan_grupo}>
                          <td className="px-3 py-2 font-mono">#{plan.codigo_plan_grupo}</td>
                          <td className="px-3 py-2">{plan.valor}</td>
                          <td className="px-3 py-2 font-mono">{soloFecha(plan.fecha_inicio_plan)} → {soloFecha(plan.fecha_fin_plan)}</td>
                          <td className="px-3 py-2 font-mono">{soloFecha(plan.fecha_creacion)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPlanActivoPendienteConfirmacion(null)} disabled={isEjecutandoModificacionAutomatica}>Cancelar</Button>
                <Button onClick={handleConfirmarModificacionAutomaticaPlanActivo} disabled={isEjecutandoModificacionAutomatica} className="bg-red-600 hover:bg-red-700 text-white">
                  {isEjecutandoModificacionAutomatica ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isEjecutandoModificacionAutomatica ? 'Desactivando...' : 'Confirmar y Desactivar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {redistribuirToast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-full max-w-md bg-white border border-indigo-200 rounded-2xl shadow-2xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4">
              <Info className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1 text-left">
                <p className="text-[11px] font-black text-slate-800 leading-snug">
                  Bloque <span className="font-mono">{redistribuirToast.apertura}/{redistribuirToast.densidad}</span>: material <span className="font-mono">{redistribuirToast.material}</span> pasó a {redistribuirToast.editedValue.toLocaleString()} UN
                  {redistribuirToast.techoNuevo !== redistribuirToast.techoActual && (
                    <> ({redistribuirToast.techoActual.toLocaleString()} → {redistribuirToast.techoNuevo.toLocaleString()} UN de capacidad)</>
                  )}.
                </p>
                <p className="text-[10px] text-slate-400 font-bold mt-1">¿Redistribuir la diferencia entre los demás materiales del bloque según su % de participación?</p>
                <div className="flex items-center gap-2 mt-3">
                  <Button size="sm" onClick={handleConfirmarCompletarTecho} className="h-7 px-3 text-[10px] font-black bg-indigo-600 hover:bg-indigo-700 text-white">Redistribuir</Button>
                  <Button size="sm" variant="outline" onClick={handleDescartarCompletarTecho} className="h-7 px-3 text-[10px] font-black">Dejar así</Button>
                </div>
              </div>
            </div>
          )}

          <Dialog open={planPreview !== null} onOpenChange={(open) => { if (!open && !isSavingPlan) setPlanPreview(null); }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Confirmar creación de Plan Grupo</DialogTitle>
                <DialogDescription>
                  Revisa los datos que se van a grabar antes de continuar. Esta acción crea registros nuevos en producción.
                </DialogDescription>
              </DialogHeader>
              {planPreview && (
                <div className="space-y-4 text-left text-sm">
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Grupo</span>{planPreview.nombreGrupo} (código {planPreview.codigo_grupo})</div>
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Valor Plan</span>{planPreview.valor}</div>
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Fecha Inicio</span>{planPreview.fechaInicio}</div>
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Fecha Fin</span>{planPreview.fechaFin}</div>
                  </div>
                  <div>
                    <span className="font-black text-slate-500 text-[10px] uppercase block mb-2">Materiales a guardar ({planPreview.rows.length})</span>
                    <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[260px] overflow-y-auto">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-gray-50 text-gray-400 uppercase font-bold sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">Material</th>
                            <th className="px-3 py-2 text-left">Descripción</th>
                            <th className="px-3 py-2 text-center">¿Corrida?</th>
                            <th className="px-3 py-2 text-right">Cantidad Un</th>
                            <th className="px-3 py-2 text-right">Cantidad Kg</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {planPreview.rows.map(row => (
                            <tr key={row.material}>
                              <td className="px-3 py-2 font-mono">{row.material}</td>
                              <td className="px-3 py-2 truncate max-w-[220px]">{row.descripcion}</td>
                              <td className="px-3 py-2 text-center">{row.tieneCorrida ? 'Sí' : 'Stock'}</td>
                              <td className="px-3 py-2 text-right font-mono">{Math.round(row.cantidadUn)}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.cantidadKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPlanPreview(null)} disabled={isSavingPlan}>Cancelar</Button>
                <Button onClick={handleConfirmGuardarPlan} disabled={isSavingPlan} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  {isSavingPlan ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isSavingPlan ? 'Guardando...' : 'Confirmar y Guardar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={planPreviewPFD !== null} onOpenChange={(open) => { if (!open && !isSavingPlanPFD) setPlanPreviewPFD(null); }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Confirmar creación de Plan Grupo PFD</DialogTitle>
                <DialogDescription>
                  Revisa los datos que se van a grabar antes de continuar. Los materiales &quot;No — stock&quot; se guardan con cantidad 0. Esta acción crea registros nuevos en producción.
                </DialogDescription>
              </DialogHeader>
              {planPreviewPFD && (
                <div className="space-y-4 text-left text-sm">
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Grupo</span>{planPreviewPFD.nombreGrupo} (código {planPreviewPFD.codigo_grupo})</div>
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Valor Plan</span>{planPreviewPFD.valor}</div>
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Fecha Inicio</span>{planPreviewPFD.fechaInicio}</div>
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Fecha Fin</span>{planPreviewPFD.fechaFin}</div>
                  </div>
                  <div>
                    <span className="font-black text-slate-500 text-[10px] uppercase block mb-2">Materiales a guardar ({planPreviewPFD.rows.length})</span>
                    <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[260px] overflow-y-auto">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-gray-50 text-gray-400 uppercase font-bold sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">Material</th>
                            <th className="px-3 py-2 text-left">Descripción</th>
                            <th className="px-3 py-2 text-center">¿Corrida?</th>
                            <th className="px-3 py-2 text-right">Cantidad Un</th>
                            <th className="px-3 py-2 text-right">Cantidad Kg</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {planPreviewPFD.rows.map(row => (
                            <tr key={row.material}>
                              <td className="px-3 py-2 font-mono">{row.material}</td>
                              <td className="px-3 py-2 truncate max-w-[220px]">{row.descripcion}</td>
                              <td className="px-3 py-2 text-center">{row.tieneCorrida ? 'Sí — plan' : 'No — stock'}</td>
                              <td className="px-3 py-2 text-right font-mono">{Math.round(row.cantidadUn)}</td>
                              <td className="px-3 py-2 text-right font-mono">{row.cantidadKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setPlanPreviewPFD(null)} disabled={isSavingPlanPFD}>Cancelar</Button>
                <Button onClick={handleConfirmGuardarPlanPFD} disabled={isSavingPlanPFD} className="bg-amber-600 hover:bg-amber-700 text-white">
                  {isSavingPlanPFD ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isSavingPlanPFD ? 'Guardando...' : 'Confirmar y Guardar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={planesGrupoDisponibles !== null} onOpenChange={(open) => { if (!open && !isLoadingEditPlan) { setPlanesGrupoDisponibles(null); setPlanGrupoSeleccionado(null); } }}>
            <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>¿Qué Plan Grupo quieres editar?</DialogTitle>
                <DialogDescription>
                  Hay {planesGrupoDisponibles?.length ?? 0} Plan Grupo activo(s) para Corte y Laminado (Centro 1000). El último guardado queda preseleccionado; elige otro si necesitas corregir uno anterior.
                </DialogDescription>
              </DialogHeader>
              {planesGrupoDisponibles && (
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[320px] overflow-y-auto">
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-gray-50 text-gray-400 uppercase font-bold sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left w-8"></th>
                        <th className="px-3 py-2 text-left">Código</th>
                        <th className="px-3 py-2 text-left">Valor Plan</th>
                        <th className="px-3 py-2 text-left">Fecha Inicio</th>
                        <th className="px-3 py-2 text-left">Fecha Fin</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {planesGrupoDisponibles.map((p, idx) => (
                        <tr
                          key={p.codigo_plan_grupo}
                          onClick={() => setPlanGrupoSeleccionado(p.codigo_plan_grupo)}
                          className={cn("cursor-pointer transition-colors", planGrupoSeleccionado === p.codigo_plan_grupo ? "bg-indigo-50" : "hover:bg-slate-50")}
                        >
                          <td className="px-3 py-2 text-center">
                            <input type="radio" readOnly checked={planGrupoSeleccionado === p.codigo_plan_grupo} className="accent-indigo-600" />
                          </td>
                          <td className="px-3 py-2 font-mono font-black">
                            #{p.codigo_plan_grupo}{idx === 0 && <span className="ml-2 text-[8px] font-black uppercase text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">Último guardado</span>}
                          </td>
                          <td className="px-3 py-2">{p.valor}</td>
                          <td className="px-3 py-2 font-mono">{p.fecha_inicio_plan ? String(p.fecha_inicio_plan).split('T')[0] : '—'}</td>
                          <td className="px-3 py-2 font-mono">{p.fecha_fin_plan ? String(p.fecha_fin_plan).split('T')[0] : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => { setPlanesGrupoDisponibles(null); setPlanGrupoSeleccionado(null); }} disabled={isLoadingEditPlan}>Cancelar</Button>
                <Button onClick={handleConfirmarSeleccionPlan} disabled={isLoadingEditPlan || !planGrupoSeleccionado} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {isLoadingEditPlan ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isLoadingEditPlan ? 'Cargando...' : 'Continuar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={editPlanPreview !== null} onOpenChange={(open) => { if (!open && !isSavingEditPlan) setEditPlanPreview(null); }}>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Editar Plan Grupo guardado</DialogTitle>
                <DialogDescription>
                  Se recalculó la salida de datos actual del Plan Grupo #{editPlanPreview?.codigo_plan_grupo}: los materiales que ya no aplican quedaron premarcados para eliminar. Corrige cantidades, agrega o quita materiales si hace falta. Los cambios se graban solo al confirmar.
                </DialogDescription>
              </DialogHeader>
              {editPlanPreview && (
                <div className="space-y-4 text-left text-sm">
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Plan Grupo</span>#{editPlanPreview.codigo_plan_grupo} — {editPlanPreview.valor}</div>
                    <div><span className="font-black text-slate-500 text-[10px] uppercase block">Vigencia</span>{editPlanPreview.fechaInicio} a {editPlanPreview.fechaFin}</div>
                  </div>

                  <div>
                    <span className="font-black text-slate-500 text-[10px] uppercase block mb-2">Materiales ({editPlanPreview.rows.filter(r => !r.marcadoEliminar).length})</span>
                    <div className="border border-slate-100 rounded-xl overflow-hidden max-h-[280px] overflow-y-auto">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-gray-50 text-gray-400 uppercase font-bold sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">Material</th>
                            <th className="px-3 py-2 text-left">Descripción</th>
                            <th className="px-3 py-2 text-right">Cantidad (Kg)</th>
                            <th className="px-3 py-2 text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {editPlanPreview.rows.map((row, idx) => (
                            <tr key={`${row.material}-${idx}`} className={cn(row.marcadoEliminar && "opacity-40 line-through", row.esNuevo && !row.marcadoEliminar && "bg-emerald-50/50")}>
                              <td className="px-3 py-2 font-mono">{row.material}</td>
                              <td className="px-3 py-2 truncate max-w-[200px]">{row.descripcion}</td>
                              <td className="px-3 py-2 text-right">
                                <input
                                  type="number"
                                  value={row.cantidad}
                                  disabled={row.marcadoEliminar}
                                  onChange={(e) => handleUpdateEditRowCantidad(idx, parseFloat(e.target.value) || 0)}
                                  className="w-24 bg-white border border-slate-200 rounded px-2 py-1 text-right font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-100"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button type="button" onClick={() => handleRemoveEditRow(idx)} className={cn("p-1.5 rounded-lg", row.marcadoEliminar ? "text-emerald-600 hover:bg-emerald-50" : "text-red-500 hover:bg-red-50")} title={row.marcadoEliminar ? "Deshacer" : "Quitar"}>
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {editPlanPreview.rows.length === 0 && (
                            <tr><td colSpan={4} className="py-8 text-center text-slate-300 uppercase font-black tracking-widest italic">Sin materiales</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {materialesDisponiblesParaAgregar.length > 0 && (
                    <div>
                      <span className="font-black text-slate-500 text-[10px] uppercase block mb-2">Agregar material del Resumen actual</span>
                      <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-1">
                        {materialesDisponiblesParaAgregar.map(m => (
                          <button
                            key={m.material}
                            type="button"
                            onClick={() => handleAddMaterialToEditPlan(m.material)}
                            className="text-[10px] font-black uppercase px-3 py-1.5 rounded-full border border-indigo-200 text-indigo-700 hover:bg-indigo-50 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> {m.material} — {m.descripcion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditPlanPreview(null)} disabled={isSavingEditPlan}>Cancelar</Button>
                <Button onClick={handleConfirmEditarPlan} disabled={isSavingEditPlan} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {isSavingEditPlan ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  {isSavingEditPlan ? 'Guardando...' : 'Guardar Cambios'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="necesidadesPlanta" className="animate-in fade-in duration-300 space-y-10 text-left">
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
              Se actualiza automáticamente al guardar o editar un plan. Usa este botón si otra área registró cambios.
            </p>
            <Button
              onClick={fetchNecesidadesPlanta}
              disabled={necesidadesPlantaLoading}
              className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2"
            >
              {necesidadesPlantaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Actualizar
            </Button>
          </div>
          {necesidadesPlantaLoading ? (
            <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : Object.keys(necesidadesPlantaData).length === 0 ? (
            <div className="py-24 text-center text-slate-300 uppercase font-black tracking-widest italic opacity-50">Sin necesidades de planta detectadas</div>
          ) : (
            <MaterialSummaryTable data={necesidadesPlantaData} />
          )}
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-6 animate-in fade-in duration-300 text-left">
          <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border-collapse font-sans text-[11px] text-center">
                <thead className="bg-gray-50 uppercase font-bold tracking-widest text-[9px] text-gray-400 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-gray-100">Orden</th>
                    <th className="px-6 py-5 border-r border-gray-100">Fecha Inicio</th>
                    <th className="px-6 py-5 border-r border-gray-100">Código FERT</th>
                    <th className="px-6 py-5 border-r border-gray-100 text-left">Descripción del Producto</th>
                    <th className="px-6 py-5 border-r border-gray-100">Cantidad</th>
                    <th className="px-6 py-5 border-r border-gray-100">Responsable</th>
                    <th className="px-6 py-5 border-r border-gray-100">Máquina</th>
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
          <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border-collapse font-sans text-[11px] text-center">
                <thead className="bg-gray-50 uppercase font-bold tracking-widest text-[9px] text-gray-400 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-gray-100">Orden FERT</th>
                    <th className="px-6 py-5 border-r border-gray-100">Fecha</th>
                    <th className="px-6 py-5 border-r border-gray-100">Código FERT</th>
                    <th className="px-6 py-5 border-r border-gray-100 text-left">Descripción del Producto</th>
                    <th className="px-6 py-5 border-r border-gray-100">Cant. Pendiente</th>
                    <th className="px-6 py-5 border-r border-gray-100">Responsable</th>
                    <th className="px-6 py-5 border-r border-gray-100">Máquina</th>
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
          <Card className="rounded-2xl border border-blue-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative text-center">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-gray-50 uppercase font-bold tracking-widest text-[8px] text-gray-400 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-5 border-r border-gray-100">Material</th>
                    <th className="px-6 py-5 border-r border-gray-100 text-left">Nombre</th>
                    <th className="px-3 py-5 border-r border-gray-100">Centro</th>
                    <th className="px-3 py-5 border-r border-gray-100 text-indigo-700">ALM.</th>
                    <th className="px-3 py-5 border-r border-gray-100 bg-green-50 text-green-700">Libre Utiliz.</th>
                    <th className="px-3 py-5 border-r border-gray-100 bg-blue-50 text-blue-700">En Traslado</th>
                    <th className="px-3 py-5 border-r border-gray-100">Insp. Calidad</th>
                    <th className="px-3 py-5 border-r border-gray-100 text-red-700">Bloqueado</th>
                    <th className="px-3 py-5 border-r border-gray-100">Punto Pedido</th>
                    <th className="px-3 py-5">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px] font-black text-slate-700">
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
              <Button onClick={handleExportTxt} className="bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar TXT
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse font-sans text-[11px] text-center">
                <thead className="sticky top-0 z-20 bg-gray-50 uppercase font-bold tracking-widest text-[9px] text-gray-400">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Fecha</th>
                    <th className="px-6 py-4 border-r border-gray-100 text-left">Corrida / Apertura</th>
                    <th className="px-4 py-4 border-r border-gray-100">Material</th>
                    <th className="px-6 py-4 border-r border-gray-100 text-left min-w-[220px]">Descripción</th>
                    <th className="px-4 py-4 border-r border-gray-100">Plan (Un)</th>
                    <th className="px-4 py-4 border-r border-gray-100">Plan (Kg)</th>
                    <th className="px-4 py-4 bg-red-50 text-red-700">Prioridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
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
                          <td className="px-4 py-3 bg-amber-50 text-amber-700 font-black">{row.isConvNested ? '—' : row.prioridad}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-between px-2 flex-wrap gap-3 pt-6">
            <div className="flex items-center gap-3 text-left">
              <div className="p-2 bg-amber-600 rounded-xl text-white shadow-lg"><ClipboardList className="w-4 h-4" /></div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Simulación — Salida de Datos por Respuesta (Paso 3)</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                  Materiales referenciados en &quot;Necesidades Planta&quot; · con corrida = cantidad planificada · sin corrida = stock disponible (bodegas + Producción Diaria) · aún no se graba en base de datos
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse font-sans text-[11px] text-center">
                <thead className="sticky top-0 z-20 bg-gray-50 uppercase font-bold tracking-widest text-[9px] text-gray-400">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Material</th>
                    <th className="px-6 py-4 border-r border-gray-100 text-left min-w-[220px]">Descripción</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Origen (Plan Grupo)</th>
                    <th className="px-4 py-4 border-r border-gray-100">¿Corrida?</th>
                    <th className="px-4 py-4 border-r border-gray-100">Cantidad (Un)</th>
                    <th className="px-4 py-4">Cantidad (Kg)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
                  {respuestaSalidaRows.length === 0 ? (
                    <tr><td colSpan={6} className="py-24 text-slate-300 font-black uppercase tracking-widest italic text-center">No hay materiales de &quot;Necesidades Planta&quot; para simular</td></tr>
                  ) : (
                    respuestaSalidaRows.map((row) => (
                      <tr key={row.material} className="hover:bg-amber-50/20 transition-colors">
                        <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-indigo-600">{row.material}</td>
                        <td className="px-6 py-3 border-r border-gray-100 text-left uppercase leading-tight truncate max-w-[280px]" title={row.descripcion}>{row.descripcion}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-left font-mono text-slate-500">{row.origenes}</td>
                        <td className="px-4 py-3 border-r border-gray-100">
                          <span className={cn("text-[9px] font-black uppercase px-2 py-1 rounded-full", row.tieneCorrida ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200")}>
                            {row.tieneCorrida ? 'Sí — plan' : 'No — stock'}
                          </span>
                        </td>
                        <td className="px-4 py-3 border-r border-gray-100 font-mono text-slate-900">{Math.round(row.cantidadUn).toLocaleString()}</td>
                        <td className="px-4 py-3 font-mono text-slate-900">{formatNum(row.cantidadKg, 1)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
