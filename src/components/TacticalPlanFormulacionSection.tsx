'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  FlaskConical,
  Package,
  Loader2,
  LayoutDashboard,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Database,
  RefreshCw,
  Minus,
  Plus,
  ShoppingCart,
  Box,
  TrendingUp,
  Table as TableIcon,
  Info
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

const BLOCK_LENGTH_METERS = 20;
const CURADO_DIAS_ESPERA = 2; // tiempo de curado/espera desde fabricación hasta disponible para consumo

// Responsables de Control de Producción que consumen el recurso Formulación, por centro
const RESPONSABLES_POR_CENTRO: Record<string, string[]> = {
  '1000': ['013', '014', '036', '038', '039', '041', '044'],
  '2000': ['002', '039']
};

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const formatNum = (val: any, decimals: number = 0): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
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

// Definición explícita de los dos espacios del tab "Control Curado". Cada espacio se identifica
// por tres columnas de getTiemposCuradoBloqueFormulado — ESTADO (estadoTras), MAQUINA y
// CORRIDAPROCESO — centralizadas aquí para que el criterio de filtro sea auditable de un vistazo
// en vez de quedar disperso en callbacks inline dentro del render.
interface CuradoSpaceConfig {
  key: string;
  title: string;
  estado: string;
  maquina: string;
  corridaproceso: string[];
}

const CURADO_SPACES: CuradoSpaceConfig[] = [
  {
    key: 'leader',
    title: 'BLOQUE FORMULADO LEADER',
    estado: 'CALLE',
    maquina: 'F_BLOQ',
    corridaproceso: ['1'],
  },
  {
    key: 'cofama',
    title: 'BLOQUE FORMULADO COFAMA',
    estado: 'BCALL',
    maquina: 'F_BLOQ_M',
    // COFAMA es por combinación: un mismo material trae múltiples valores de corridaproceso,
    // así que este espacio no filtra por esa columna (a diferencia de LEADER).
    corridaproceso: [],
  },
];

const matchesCuradoSpace = (row: any, space: CuradoSpaceConfig): boolean => {
  const estado = getProp(row, ['estadoTras', 'ESTADOTRAS', 'ESTADO']).trim().toUpperCase();
  const maquina = getProp(row, ['Maquina', 'MAQUINA']).trim().toUpperCase();
  if (estado !== space.estado || maquina !== space.maquina) return false;
  if (space.corridaproceso.length === 0) return true;
  const corrida = getProp(row, ['corridaproceso', 'CORRIDAPROCESO']).trim().toUpperCase();
  return space.corridaproceso.includes(corrida);
};

// getTiemposCuradoBloqueFormulado trae "fecha" en formato DD/MM/YYYY (ej. "06/05/2026" = 6 de
// mayo). `new Date("06/05/2026")` de JS lo interpreta como MM/DD/YYYY (6 de junio) y corrompe
// la fecha silenciosamente, por eso se parsea manualmente en vez de delegar al constructor Date.
const parseFechaSAP = (raw: string): Date | null => {
  if (!raw) return null;
  const part = raw.includes('T') ? raw.split('T')[0] : raw;
  const dmy = part.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return isNaN(d.getTime()) ? null : d;
  }
  const ymd = part.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const d = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  const fallback = new Date(part);
  return isNaN(fallback.getTime()) ? null : fallback;
};

const isResponsableAllowed = (centro: string, resp: string): boolean => {
  const allowed = RESPONSABLES_POR_CENTRO[centro];
  return !!allowed && allowed.includes(resp);
};

// Una fila de trazabilidad de consumo: desde el material "BLOQUE FORMULADO" (codFormulado) hasta
// el componente final del que forma parte, pasando por el nivel intermedio del árbol BOM
// (ej. bloque formulado -> lámina cortada -> producto terminado).
interface ConsumoBloqueRow {
  codFormulado: string;
  nombreFormulado: string;
  componente: string;
  nombreComponente: string;
  material: string;
  nombre: string;
  orden: string;
  un: string;
  total: number;
  origin: 'prov' | 'fert';
  centro: string;
  respCtrlProd: string;
}

// Recorre la explosión BOM (getMaestroMaterialesExplosion) de una orden y, por cada material
// "BLOQUE FORMULADO" encontrado, sube un nivel (MATERIAL_PADRE) para identificar el componente
// intermedio que lo consume, y otro nivel más para el componente final. CANTIDAD_ACUMULADA ya
// viene expresada por unidad de la orden, tal como se usa en el resto de trazas BOM de este módulo.
const traceBloqueFormuladoConsumption = (
  bomData: any[],
  fertCode: string,
  ordenNum: string,
  origin: 'prov' | 'fert',
  centro: string,
  respCtrlProd: string
): ConsumoBloqueRow[] => {
  const formuladoRows = bomData.filter(row => (row.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('BLOQUE FORMULADO'));

  return formuladoRows.map(formuladoRow => {
    const codFormulado = cleanCode(formuladoRow.COMPONENTE);
    const nombreFormulado = String(formuladoRow.DESCRIPCION_COMPONENTE || '—').toUpperCase();
    const componenteCode = cleanCode(formuladoRow.MATERIAL_PADRE);
    const componenteRow = bomData.find(r => cleanCode(r.COMPONENTE) === componenteCode);
    const nombreComponente = componenteRow
      ? String(componenteRow.DESCRIPCION_COMPONENTE || '—').toUpperCase()
      : String(formuladoRow.DESCRIPCION_FERT || '—').toUpperCase();
    const material = componenteRow ? cleanCode(componenteRow.MATERIAL_PADRE) : fertCode;
    const nombre = String(formuladoRow.DESCRIPCION_FERT || '—').toUpperCase();
    const total = safeNum(formuladoRow.CANTIDAD_ACUMULADA || formuladoRow.CANTIDAD_UNITARIA || 0);

    return {
      codFormulado,
      nombreFormulado,
      componente: componenteCode,
      nombreComponente,
      material,
      nombre,
      orden: String(ordenNum),
      un: 'KG',
      total,
      origin,
      centro,
      respCtrlProd
    };
  });
};

export const TacticalPlanFormulacionSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanFormulacion');
  useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [, setGrupos] = useState<Grupo[]>([]);
  const [, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [cuboInventarios, setCuboInventarios] = useState<any[]>([]);
  const [curadoData, setCuradoData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });
  const [unifiedSummaryData, setUnifiedSummaryData] = useState<any[]>([]);
  const [consumoBloqueFormulado, setConsumoBloqueFormulado] = useState<ConsumoBloqueRow[]>([]);

  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState(new Date());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    setViewDate(today);
    setSelectedDates(new Set([format(today, 'yyyy-MM-dd')]));
  }, []);

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = getProp(item, ['MATERIAL', 'Material', 'CodMaterial', 'MATERIAL_ID', 'CODIGO']);
    const nameStr = getProp(item, ['NOMBRE', 'NombreMaterial', 'Descripcion', 'NomMaterial', 'DESCRIPCION']);
    const catStr = getProp(item, ['CATEGORIA', 'Categoria', 'CATEGORIA_DESC']);
    
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions: any = { dens: '—', ancho: '—', largo: '—', esp: '—', apertura: '—', tipo: '—' };
    const techPattern = catStr.match(/D(\d+)([a-zA-Z]*)/i) || desc.match(/D-?(\d+)([a-zA-Z]*)/i);
    if (techPattern) {
      dimensions.dens = techPattern[1]; 
      dimensions.tipo = (techPattern[2] || '').toUpperCase(); 
    }
    const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    if (dimMatch) {
      dimensions.ancho = dimMatch[1];
      dimensions.largo = dimMatch[2];
      if (dimMatch[3]) dimensions.esp = dimMatch[3];
    }
    const apertureRegex = /194\.5|206|219|228/;
    const apertureMatch = catStr.match(apertureRegex) || desc.match(apertureRegex);
    if (apertureMatch) dimensions.apertura = apertureMatch[0];
    
    return { code, desc, categoria: catStr, ...dimensions };
  }, []);

  // Base por centro y fecha (1000 = UIO, 2000 = GYE). El filtro por responsable de Control de
  // Producción (RESPONSABLES_POR_CENTRO) se aplica más abajo, en handleProcessResumen, antes de
  // acumular necesidades — el Resumen ya NO considera la necesidad global de todos los
  // responsables, solo la de quienes controlan el recurso Formulación.
  const provFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      const centro = getProp(o, ['CENTRO', 'Centro']).trim();
      if (centro && !['1000', '2000'].includes(centro)) return false;
      const itemDateFull = getProp(o, ['FECHAINICIO', 'FECHA']).trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenes, selectedDates]);

  const prodFiltradas = useMemo(() => {
    return ordenesFert.filter(o => {
      const centro = getProp(o, ['CENTRO', 'Centro']).trim();
      if (centro && !['1000', '2000'].includes(centro)) return false;
      const itemDateFull = getProp(o, ['FECHA', 'FECHAINICIO', 'FECHA_INICIO']).trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenesFert, selectedDates]);

  // Inventario SAP (fuente CuboInventarios) filtrado a materiales "BLOQUE FORMULADO". El
  // StockActual de CuboInventarios ya viene en KG para estos materiales HALB (PesoNetoActual/
  // PesoBrutoActual/StockMaximo no los puebla SAP, siempre llegan en 0). Stock (UN) = Stock (KG)
  // ÷ TamLoteMin (lote mínimo de fabricación, también en KG): representa cuántos lotes mínimos
  // caben en el stock actual. Categoria viene directa del cubo (ej. "BQ_F_A_206_PL_D19_AF").
  const filteredInventario = useMemo(() => {
    return cuboInventarios
      .filter(row => String(row.Descripcion || '').toUpperCase().includes('BLOQUE FORMULADO'))
      .map(row => {
        const stockKg = safeNum(row.StockActual);
        const loteMin = safeNum(row.TamLoteMin);
        const loteMax = safeNum(row.TamLoteMax);
        const stockUN = loteMin > 0 ? stockKg / loteMin : 0;
        return {
          ...row,
          stockKg,
          stockUN,
          loteMin,
          loteMax
        };
      });
  }, [cuboInventarios]);

  // Kg de un material que todavía está dentro de su ventana de curado (fabricación + 2 días)
  // y por lo tanto NO debe contarse como stock disponible para descontar necesidades. Solo cuenta
  // como "en curado" lo que también calificaría en alguno de los dos espacios de Control Curado
  // (CURADO_SPACES) — misma definición de "está curando" en ambos lados, para que el Resumen y el
  // tab Control Curado sean coherentes entre sí. Campos confirmados contra la respuesta real de
  // getTiemposCuradoBloqueFormulado: CodMaterial (material), fecha (DD/MM/YYYY) y peso (Kg).
  const getStockEnCurado = useCallback((materialCode: string): number => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    return curadoData.reduce((sum, row) => {
      const mat = cleanCode(getProp(row, ['CodMaterial', 'MATERIAL', 'CODMATERIAL', 'COMPONENTE']));
      if (!mat || mat !== materialCode) return sum;
      if (!CURADO_SPACES.some(space => matchesCuradoSpace(row, space))) return sum;
      const fechaRaw = getProp(row, ['fecha', 'FECHA', 'FECHA_INICIO', 'FECHA_FABRICACION', 'FECHA_OT_PRG_INI']);
      const fab = parseFechaSAP(fechaRaw);
      if (!fab) return sum;
      const disp = new Date(fab);
      disp.setDate(disp.getDate() + CURADO_DIAS_ESPERA);
      const fechaDisponible = format(disp, 'yyyy-MM-dd');
      if (todayStr >= fechaDisponible) return sum; // ya está disponible, no se descuenta
      const kg = safeNum(getProp(row, ['peso', 'PESO', 'CANTIDAD', 'KG', 'PESO_KG', 'CANT_KG']));
      return sum + kg;
    }, 0);
  }, [curadoData]);

  // Necesidad neta = (necesidad de órdenes provisionales por fecha + necesidad en proceso de
  // órdenes FERT) − stock disponible (stock SAP menos lo que aún está en curado). El plan de
  // reposición solo cubre el faltante, no la necesidad bruta. Solo se acumulan órdenes cuyo
  // responsable de Control de Producción está autorizado para el centro (RESPONSABLES_POR_CENTRO)
  // — una orden de un responsable no listado no debe inflar la necesidad de Formulación.
  const handleProcessResumen = useCallback(async () => {
    const buildEntry = (o: any, origin: 'prov' | 'fert') => ({
      order: o,
      origin,
      centro: getProp(o, ['CENTRO', 'Centro']).trim(),
      resp: getProp(o, ['RESPCTRLPROD', 'RESPCONTROLPROD', 'RESP_CONTROL_PROD', 'RESPONSABLE']).trim()
    });
    const allOrders = [
      ...provFiltradas.map(o => buildEntry(o, 'prov' as const)),
      ...prodFiltradas.map(o => buildEntry(o, 'fert' as const))
    ].filter(e => isResponsableAllowed(e.centro, e.resp));
    if (allOrders.length === 0) {
      setUnifiedSummaryData([]);
      setConsumoBloqueFormulado([]);
      return;
    }
    setIsProcessingResumen(true);
    const groupsMap = new Map<string, any>();
    const consumoRows: ConsumoBloqueRow[] = [];
    setResumenProgress({ current: 0, total: allOrders.length });

    for (let i = 0; i < allOrders.length; i++) {
      const { order: o, origin, centro: centroOrden, resp: respOrden } = allOrders[i];
      const info = extractMaterialInfo(o);
      const qty = safeNum(getProp(o, ['CANTPEND', 'CANTPENDIENTE', 'CANTPROGRAMADA', 'CANTIDAD', 'CANT_PROG']));
      const anchoVal = parseFloat(info.ancho) || 0;
      const espVal = parseFloat(info.esp) || 0;
      const densVal = parseFloat(String(info.dens)) || 0;
      const usefulHeight = (densVal < 30) ? 103 : 85;
      const itemBloques = (usefulHeight * BLOCK_LENGTH_METERS * 100) > 0
        ? (qty * espVal * anchoVal) / (usefulHeight * BLOCK_LENGTH_METERS * 100)
        : 0;
      const itemKg = (anchoVal * 200 * espVal * densVal * qty) / 10000;
      const ordenNum = getProp(o, ['ORDENPREVISIONAL', 'ORDEN', 'ORDEN_PROCESO']) || '—';

      let blockCode = '—';
      let blockDesc = '—';
      try {
        const bomResponse = await serviciosService.getMaestroMaterialesExplosion("1000", info.code.padStart(18, '0'), 1, 100);
        const bomData = bomResponse?.data?.data || bomResponse?.data || [];
        if (Array.isArray(bomData)) {
          const blockComp = bomData.find(row => (row.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('BLOQUE FORMULADO'));
          if (blockComp) {
            blockCode = cleanCode(blockComp.COMPONENTE);
            blockDesc = String(blockComp.DESCRIPCION_COMPONENTE).toUpperCase();
          }
          consumoRows.push(...traceBloqueFormuladoConsumption(bomData, info.code, ordenNum, origin, centroOrden, respOrden));
        }
      } catch { console.warn(`Error BOM para ${info.code}`); }

      const key = `${blockCode}|${info.apertura}|${densVal}`;
      if (!groupsMap.has(key)) {
        const finalSearchCode = blockCode !== '—' ? blockCode : info.code;
        const stockKg = cuboInventarios
          .filter(inv => cleanCode(inv.Material) === finalSearchCode)
          .reduce((sum, item) => sum + safeNum(item.StockActual), 0);
        const pesoBloque = (100 * usefulHeight * BLOCK_LENGTH_METERS * densVal) / 10000;
        const stockUN = pesoBloque > 0 ? stockKg / pesoBloque : 0;
        const stockEnCuradoKg = getStockEnCurado(finalSearchCode);
        const stockEnCuradoUN = pesoBloque > 0 ? stockEnCuradoKg / pesoBloque : 0;
        const stockUtilUN = Math.max(0, stockUN - stockEnCuradoUN);
        groupsMap.set(key, {
          blockCode, blockDesc: blockDesc !== '—' ? blockDesc : info.desc,
          dens: info.dens, apertura: info.apertura,
          totalBloquesProv: 0, totalBloquesFert: 0, planReposicion: 0,
          stockKg, stockUN, stockEnCuradoUN, stockUtilUN, pesoBloque,
          kgTotal: 0, unidades: 0,
          ferts: []
        });
      }
      const entry = groupsMap.get(key)!;
      if (origin === 'prov') {
        entry.totalBloquesProv += itemBloques;
      } else {
        entry.totalBloquesFert += itemBloques;
      }
      entry.kgTotal += itemKg;
      entry.unidades += qty;
      entry.planReposicion = Math.max(0, Math.ceil(entry.totalBloquesProv + entry.totalBloquesFert - entry.stockUtilUN));
      entry.ferts.push({ code: info.code, desc: info.desc, qty, kg: itemKg, bloques: itemBloques, origin });
      if (i % 10 === 0) setResumenProgress({ current: i + 1, total: allOrders.length });
    }
    setUnifiedSummaryData(Array.from(groupsMap.values()).sort((a, b) => b.kgTotal - a.kgTotal));
    setConsumoBloqueFormulado(consumoRows);
    setIsProcessingResumen(false);
  }, [provFiltradas, prodFiltradas, cuboInventarios, extractMaterialInfo, getStockEnCurado]);

  // Se ejecuta automáticamente al cambiar los filtros/datos — no se espera un click de
  // "generar/aceptar" para mostrar el resumen.
  useEffect(() => {
    if (mounted && !isLoading) handleProcessResumen();
  }, [mounted, isLoading, handleProcessResumen]);

  // Resumen dividido en dos secciones según el tipo de Bloque Formulado, derivado directamente
  // de la apertura ya extraída del material (no depende de que exista match en Control Curado,
  // por eso ya no queda un grupo "Sin Clasificar"):
  // a) Apertura: bloques con apertura técnica (194.5/206/219/228...) — línea continua LEADER.
  // b) Combinación: bloques sin apertura (ej. "BLOQUE FORMULADO D48 VISCO GEL CL 3un-135X190") —
  //    línea de combinación COFAMA.
  const summarySpaces = useMemo(() => {
    const apertura = unifiedSummaryData.filter(row => row.apertura !== '—');
    const combinacion = unifiedSummaryData.filter(row => row.apertura === '—');
    return { apertura, combinacion };
  }, [unifiedSummaryData]);

  // Consumo trazado (COD_FORMULADO -> intermedio -> componente final), acotado por los
  // responsables de control de producción que corresponden a cada centro — este es el
  // contenido de las pestañas "Provisionales" y "FERT".
  const provConsumoResponsable = useMemo(
    () => consumoBloqueFormulado.filter(r => r.origin === 'prov' && isResponsableAllowed(r.centro, r.respCtrlProd)),
    [consumoBloqueFormulado]
  );
  const fertConsumoResponsable = useMemo(
    () => consumoBloqueFormulado.filter(r => r.origin === 'fert' && isResponsableAllowed(r.centro, r.respCtrlProd)),
    [consumoBloqueFormulado]
  );

  // Evaluación de Stock (KG/UN) / En Curado (UN) / Stock Útil (UN) por material "BLOQUE
  // FORMULADO", con la misma base de conversión (TamLoteMin) que el Resumen e Inventarios — para
  // que Control Curado permita verificar esos tres números sin cambiar de tab.
  const curadoStockEvaluation = useMemo(() => {
    return filteredInventario
      .map(inv => {
        const materialCode = cleanCode(inv.Material);
        const stockEnCuradoKg = getStockEnCurado(materialCode);
        const stockEnCuradoUN = inv.loteMin > 0 ? stockEnCuradoKg / inv.loteMin : 0;
        const stockUtilUN = Math.max(0, inv.stockUN - stockEnCuradoUN);
        return {
          materialCode,
          descripcion: inv.Descripcion || '—',
          loteMin: inv.loteMin,
          stockKg: inv.stockKg,
          stockUN: inv.stockUN,
          stockEnCuradoKg,
          stockEnCuradoUN,
          stockUtilUN
        };
      })
      .filter(r => r.stockKg > 0 || r.stockEnCuradoKg > 0)
      .sort((a, b) => b.stockKg - a.stockKg);
  }, [filteredInventario, getStockEnCurado]);

  const fetchDataAsync = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('formulación') || name.includes('espuma');
      });
      setGrupos(filteredGroups);
      const groupsIds = filteredGroups.map(g => g.codigo_grupo);
      const [restrsRes, provsRes, curadoRes, fertsRes, cuboRes] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getTiemposCuradoBloqueFormulado(1, 10000).catch(() => ({ data: [] })),
        serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getCuboInventarios(1, 50000).catch(() => ({ data: [] }))
      ]);
      setRestricciones((restrsRes.data || []).filter((r: any) => groupsIds.includes(r.codigo_grupo)));
      setOrders(provsRes.data?.data || provsRes.data || []);
      setOrdersFert(fertsRes.data?.data || fertsRes.data || []);
      setCuboInventarios(Array.isArray(cuboRes.data) ? cuboRes.data : []);
      
      const rawCurado = curadoRes.data || [];
      setCuradoData(rawCurado);

      const uniqueStatuses = [...new Set(rawCurado.map((r: any) => String(getProp(r, ['estadoTras', 'ESTADOTRAS']) || 'EMPTY').trim()))];
      inspector.captureVariable('unique_estadoTras_statuses', uniqueStatuses, { description: 'Lista global de estatus detectados en columna estadoTras' });

      // Diagnóstico: combinaciones reales de Maquina/estadoTras/estado/corridaproceso en
      // getTiemposCuradoBloqueFormulado, con conteo de filas — para confirmar cuál combinación
      // corresponde a LEADER (línea continua) y cuál a COFAMA (combinación) antes de ajustar los
      // filtros de renderCuradoSpace (case 'curado').
      const comboCounts = new Map<string, number>();
      rawCurado.forEach((r: any) => {
        const m = getProp(r, ['Maquina', 'MAQUINA']) || '—';
        const et = getProp(r, ['estadoTras', 'ESTADOTRAS']) || '—';
        const e2 = getProp(r, ['estado2']) || '—';
        const cp = getProp(r, ['corridaproceso', 'CORRIDAPROCESO']) || '—';
        const key = `Maquina=${m} | estadoTras=${et} | estado=${e2} | corridaproceso=${cp}`;
        comboCounts.set(key, (comboCounts.get(key) || 0) + 1);
      });
      const comboSummary = Array.from(comboCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([combo, count]) => `${count}x ${combo}`);
      inspector.captureVariable('curado_maquina_estado_combos', comboSummary, { description: 'Combinaciones únicas de Maquina/estadoTras/estado/corridaproceso en curadoData, ordenadas por frecuencia — usar para fijar los filtros LEADER/COFAMA' });

      // Diagnóstico por fecha: cuántas filas trae cada día en curadoData vs cuántas matchean
      // alguno de los dos espacios de Control Curado (CURADO_SPACES). Las columnas "Fecha
      // Disponible (+2d)" y "Estado" del tab son solo cálculo/badge sobre las filas ya filtradas
      // — no excluyen ninguna fila; el único filtro real es ESTADO/MAQUINA/CORRIDAPROCESO. Esto
      // sirve para confirmar si un día concreto (ej. el 06) está quedando fuera por ese filtro.
      const porFecha = new Map<string, { total: number; matched: number }>();
      rawCurado.forEach((r: any) => {
        const fecha = getProp(r, ['fecha', 'FECHA', 'FECHA_INICIO', 'FECHA_FABRICACION', 'FECHA_OT_PRG_INI']) || '—';
        const entry = porFecha.get(fecha) || { total: 0, matched: 0 };
        entry.total += 1;
        if (CURADO_SPACES.some(space => matchesCuradoSpace(r, space))) entry.matched += 1;
        porFecha.set(fecha, entry);
      });
      const fechaSummary = Array.from(porFecha.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([fecha, { total, matched }]) => `${fecha}: ${matched}/${total} filas matchean CURADO_SPACES`);
      inspector.captureVariable('curado_matches_por_fecha', fechaSummary, { description: 'Por cada fecha de curadoData, filas que matchean alguno de los dos espacios (LEADER/COFAMA) vs el total de ese día — usar para verificar si falta un día específico por el filtro ESTADO/MAQUINA/CORRIDAPROCESO' });

    } catch {
      console.error('Error sincronizando datos formulacion');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) fetchDataAsync();
  }, [mounted, fetchDataAsync]);

  const calendarDaysList = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  // Resumen compacto de trazabilidad: qué componentes finales (ej. láminas) consumen cada
  // Bloque Formulado, a través del nivel intermedio (bloque cortado), por orden.
  const renderConsumoBloqueTable = (data: ConsumoBloqueRow[], title: string = "Consumo de Bloque Formulado por Componente (Trazabilidad)") => {
    const grouped: Record<string, { nombreFormulado: string; items: ConsumoBloqueRow[] }> = {};
    data.forEach(row => {
      if (!grouped[row.codFormulado]) grouped[row.codFormulado] = { nombreFormulado: row.nombreFormulado, items: [] };
      grouped[row.codFormulado].items.push(row);
    });
    const codes = Object.keys(grouped).sort();
    const total = data.reduce((s, r) => s + r.total, 0);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-indigo-600" />
            {title}
          </h3>
          <Badge variant="outline" className="text-[10px] font-black border-slate-200 bg-slate-50">T. CONSUMO: {formatNum(total, 1)}</Badge>
        </div>
        <div className="border-2 border-gray-100 rounded-[2rem] shadow-xl overflow-hidden bg-white text-left">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full border-collapse text-center font-sans text-[10px] text-gray-700">
              <thead className="bg-[#1e293b] text-white uppercase font-black tracking-widest text-[8px] sticky top-0 z-20 border-b-2 border-white/10">
                <tr>
                  <th className="px-4 py-4 text-left border-r border-white/5">FORMULADO</th>
                  <th className="px-6 py-4 text-left border-r border-white/5">NOMBRECOMPONENTE</th>
                  <th className="px-4 py-4 border-r border-white/5">COMPONENTE</th>
                  <th className="px-6 py-4 text-left border-r border-white/5">NOMBRE</th>
                  <th className="px-4 py-4 border-r border-white/5">MATERIAL</th>
                  <th className="px-4 py-4 border-r border-white/5">ORDEN</th>
                  <th className="px-3 py-4 border-r border-white/5">UN</th>
                  <th className="px-4 py-4 bg-indigo-600 font-black">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold">
                {codes.length === 0 ? (
                  <tr><td colSpan={8} className="py-20 text-center text-slate-200 uppercase font-black">Sin consumo de Bloque Formulado detectado</td></tr>
                ) : (
                  codes.map(code => {
                    const group = grouped[code];
                    const subtotal = group.items.reduce((s, r) => s + r.total, 0);
                    return (
                      <React.Fragment key={code}>
                        <tr className="bg-slate-50">
                          <td className="px-4 py-2 text-left font-mono font-black text-indigo-600 border-r border-gray-100">{code}</td>
                          <td colSpan={5} className="px-6 py-2 text-left uppercase font-black text-slate-700 border-r border-gray-100 truncate max-w-[300px]">{group.nombreFormulado}</td>
                          <td className="px-3 py-2 border-r border-gray-100 opacity-40 uppercase">Subtotal</td>
                          <td className="px-4 py-2 bg-indigo-50 text-indigo-800 font-black">{formatNum(subtotal, 1)}</td>
                        </tr>
                        {group.items.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors font-mono text-[9px]">
                            <td className="px-4 py-2 border-r border-gray-100 text-slate-300 pl-8 text-left">{row.codFormulado}</td>
                            <td className="px-6 py-2 border-r border-gray-100 text-left uppercase truncate max-w-[220px]">{row.nombreComponente}</td>
                            <td className="px-4 py-2 border-r border-gray-100 text-indigo-600 font-black">{row.componente}</td>
                            <td className="px-6 py-2 border-r border-gray-100 text-left uppercase truncate max-w-[220px]">{row.nombre}</td>
                            <td className="px-4 py-2 border-r border-gray-100 text-slate-500">{row.material}</td>
                            <td className="px-4 py-2 border-r border-gray-100 text-slate-500">{row.orden}</td>
                            <td className="px-3 py-2 border-r border-gray-100 uppercase">{row.un}</td>
                            <td className="px-4 py-2 font-black text-slate-900">{formatNum(row.total, 3)}</td>
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
      </div>
    );
  };

  const renderSummaryTable = (data: any[], title: string, icon: any) => {
    const tStockKg = data.reduce((s, r) => s + r.stockKg, 0);
    const tStockUn = data.reduce((s, r) => s + r.stockUN, 0);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between px-2">
          <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
            {React.createElement(icon, { className: "w-4 h-4 text-indigo-600" })}
            {title}
          </h3>
          <div className="flex gap-4">
            <Badge variant="outline" className="text-[10px] font-black border-slate-200 bg-slate-50">T. STOCK: {formatNum(tStockKg, 0)} KG</Badge>
            <Badge variant="outline" className="text-[10px] font-black border-slate-200 bg-slate-50">T. UNIDADES: {Math.round(tStockUn)} UN</Badge>
          </div>
        </div>
        <div className="border-2 border-gray-100 rounded-[2rem] shadow-xl overflow-hidden bg-white text-left">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full border-collapse text-center font-sans text-[10px] text-gray-700">
              <thead className="bg-[#1e293b] text-white uppercase font-black tracking-widest text-[8px] sticky top-0 z-20 border-b-2 border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left border-r border-white/5 w-32">Bloque Formulado</th>
                  <th className="px-6 py-4 text-left border-r border-white/5">Descripción Técnica SAP</th>
                  <th className="px-3 py-4 border-r border-white/5">Dens.</th>
                  <th className="px-3 py-4 border-r border-white/5">Apert.</th>
                  <th className="px-4 py-4 border-r border-white/5">Nec. Prov (Bloq)</th>
                  <th className="px-4 py-4 border-r border-white/5">Nec. Proceso/FERT (Bloq)</th>
                  <th className="px-6 py-4 border-r border-white/5 text-emerald-400 bg-black/10">Stock (Kg)</th>
                  <th className="px-4 py-4 border-r border-white/5 text-emerald-400 bg-black/10 font-black">Stock (UN)</th>
                  <th className="px-4 py-4 border-r border-white/5 text-amber-500 bg-black/10">En Curado (UN)</th>
                  <th className="px-4 py-4 border-r border-white/5 text-emerald-300 bg-black/10 font-black">Stock Útil (UN)</th>
                  <th className="px-6 py-4 text-right bg-yellow-500/20 text-yellow-300 font-black">Plan Reposición (UN)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold">
                {data.map((row, idx) => {
                  const isExp = expandedGroups.has(row.blockCode);
                  return (
                    <React.Fragment key={idx}>
                      <tr className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { const n = new Set(expandedGroups); if (isExp) { n.delete(row.blockCode); } else { n.add(row.blockCode); } setExpandedGroups(n); }}>
                        <td className="px-6 py-3 text-left font-mono font-black text-indigo-600 border-r border-gray-100 flex items-center gap-2">
                           {isExp ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                           {row.blockCode}
                        </td>
                        <td className="px-6 py-3 text-left uppercase text-slate-900 font-black text-[9px] border-r border-gray-100 truncate max-w-[300px]">{row.blockDesc}</td>
                        <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{row.dens}</td>
                        <td className="px-3 py-3 border-r border-gray-100 font-black text-blue-700 bg-blue-50/10">{row.apertura}</td>
                        <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-slate-700 bg-slate-50/10">{row.totalBloquesProv.toFixed(2)}</td>
                        <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-purple-700 bg-purple-50/10">{row.totalBloquesFert.toFixed(2)}</td>
                        <td className="px-6 py-3 border-r border-gray-100 text-right font-mono font-black text-emerald-600 bg-emerald-50/10">{row.stockKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-black text-emerald-800 bg-emerald-50/20">{row.stockUN.toFixed(1)}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-black text-amber-700 bg-amber-50/20">{row.stockEnCuradoUN.toFixed(1)}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-black text-emerald-800 bg-emerald-50/30">{row.stockUtilUN.toFixed(1)}</td>
                        <td className="px-6 py-3 text-right font-mono font-black text-yellow-700 bg-yellow-50/30">{row.planReposicion}</td>
                      </tr>
                      {isExp && row.ferts.map((f: any, fIdx: number) => (
                        <tr key={`${idx}-${fIdx}`} className="bg-slate-50/50 text-[9px] text-slate-400 font-medium">
                          <td className="px-6 py-1.5 text-left pl-10 italic">{f.code}</td>
                          <td className="px-6 py-1.5 text-left uppercase italic truncate max-w-[300px]">{f.desc}</td>
                          <td colSpan={2}></td>
                          <td className="px-4 py-1.5 font-mono">{f.origin === 'prov' ? f.bloques.toFixed(3) : '—'}</td>
                          <td className="px-4 py-1.5 font-mono">{f.origin === 'fert' ? f.bloques.toFixed(3) : '—'}</td>
                          <td colSpan={2}></td>
                          <td className="px-4 py-1.5 font-mono opacity-50">{f.kg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                          <td colSpan={2}></td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-[#0f172a] text-white font-black text-[9px] uppercase sticky bottom-0 z-20">
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-right tracking-widest border-r border-white/5">Totales de Sección</td>
                  <td className="px-6 py-4 border-r border-white/5 font-mono text-emerald-300 bg-emerald-500/10">{formatNum(tStockKg, 0)}</td>
                  <td className="px-4 py-4 font-mono text-emerald-300 bg-emerald-500/10">{Math.round(tStockUn)}</td>
                  <td colSpan={3} className="px-6 py-4"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Filtra data por el criterio de `space` (ver CURADO_SPACES) y agrega Fecha Disponible
  // (fabricación + CURADO_DIAS_ESPERA) y Estado a cada registro, sin perder ninguna de las
  // columnas originales que trae la fuente SAP.
  const renderCuradoSpace = (data: any[], space: CuradoSpaceConfig) => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const filtered = data.filter(row => matchesCuradoSpace(row, space)).map(row => {
      const fechaRaw = getProp(row, ['fecha', 'FECHA', 'FECHA_INICIO', 'FECHA_FABRICACION', 'FECHA_OT_PRG_INI']);
      const fab = parseFechaSAP(fechaRaw);
      let fechaDisponible = '—';
      let disponible = false;
      if (fab) {
        const disp = new Date(fab);
        disp.setDate(disp.getDate() + CURADO_DIAS_ESPERA);
        fechaDisponible = format(disp, 'yyyy-MM-dd');
        disponible = todayStr >= fechaDisponible;
      }
      return { __raw: row, __fechaFabTime: fab ? fab.getTime() : 0, __fechaDisponible: fechaDisponible, __disponible: disponible };
    }).sort((a, b) => a.__fechaFabTime - b.__fechaFabTime);

    const filterLabel = `ESTADO=${space.estado} · MAQUINA=${space.maquina}`
      + (space.corridaproceso.length > 0 ? ` · CORRIDAPROCESO=${space.corridaproceso.join(' / ')}` : ' · CORRIDAPROCESO=(todas, por combinación)');

    if (filtered.length === 0) {
      return (
        <div className="space-y-2">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">{space.title} (0)</h4>
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest px-2">Filtro: {filterLabel}</p>
          <div className="py-10 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100 mb-8">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              0 de {data.length} registros de curado coinciden con este filtro
            </p>
          </div>
        </div>
      );
    }

    const keys = Object.keys(filtered[0].__raw || {});
    const headerMapping: Record<string, string> = {
      'ESTADOTRAS': 'ESTADO',
      'ESTADO_TRAS': 'ESTADO',
      'MAQUINA': 'MAQUINA',
      'RECURSO': 'MAQUINA'
    };

    return (
      <div className="space-y-2">
        <div className="px-2 flex items-baseline justify-between flex-wrap gap-1">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{space.title} ({filtered.length})</h4>
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Filtro: {filterLabel}</p>
        </div>
        <div className="border-2 border-gray-100 rounded-[2rem] shadow-xl overflow-hidden bg-white text-left mb-8">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full border-collapse text-center font-sans text-[10px] text-gray-700">
              <thead className="bg-[#0f172a] text-white uppercase font-black tracking-widest text-[8px] sticky top-0 z-10 border-b-2 border-white/10">
                <tr>
                  <th className="px-4 py-4 border-r border-white/5 whitespace-nowrap bg-indigo-900/60 text-indigo-200">Fecha Disponible (+{CURADO_DIAS_ESPERA}d)</th>
                  <th className="px-4 py-4 border-r border-white/5 whitespace-nowrap bg-indigo-900/60 text-indigo-200">Estado</th>
                  {keys.map((k, i) => (
                    <th key={i} className="px-4 py-4 border-r border-white/5 whitespace-nowrap uppercase">
                      {headerMapping[k.toUpperCase()] || k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold">
                {filtered.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 border-r border-gray-100 font-mono text-slate-500 whitespace-nowrap text-center bg-indigo-50/20">{row.__fechaDisponible}</td>
                    <td className="px-4 py-3 border-r border-gray-100 whitespace-nowrap text-center bg-indigo-50/20">
                      <Badge variant="outline" className={cn(
                        "text-[8px] font-black",
                        row.__disponible ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"
                      )}>
                        {row.__disponible ? 'DISPONIBLE' : 'EN CURADO'}
                      </Badge>
                    </td>
                    {keys.map((k, i) => (
                      <td key={i} className="px-4 py-3 border-r border-gray-100 font-mono text-slate-500 whitespace-nowrap text-center">
                        {String(row.__raw[k] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Evaluación Stock (KG/UN) / En Curado (UN) / Stock Útil (UN) por material — misma base de
  // cálculo (TamLoteMin) que Inventarios y Resumen, disponible aquí para no tener que cambiar de
  // tab a la hora de verificar coherencia entre los tres números.
  const renderCuradoEvaluation = (data: typeof curadoStockEvaluation) => {
    const tStockKg = data.reduce((s, r) => s + r.stockKg, 0);
    const tStockUN = data.reduce((s, r) => s + r.stockUN, 0);
    const tEnCuradoUN = data.reduce((s, r) => s + r.stockEnCuradoUN, 0);
    const tUtilUN = data.reduce((s, r) => s + r.stockUtilUN, 0);

    return (
      <div className="space-y-2">
        <div className="px-2 flex items-center justify-between">
          <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Evaluación Stock / En Curado / Stock Útil por Material</h4>
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Stock (UN) = Stock (KG) ÷ Lote Mínimo (igual que Inventarios)</p>
        </div>
        <div className="border-2 border-gray-100 rounded-[2rem] shadow-xl overflow-hidden bg-white text-left mb-8">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full border-collapse text-center font-sans text-[10px] text-gray-700">
              <thead className="bg-[#0f172a] text-white uppercase font-black tracking-widest text-[8px] sticky top-0 z-10 border-b-2 border-white/10">
                <tr>
                  <th className="px-4 py-4 text-left border-r border-white/5">Material</th>
                  <th className="px-6 py-4 text-left border-r border-white/5">Descripción</th>
                  <th className="px-4 py-4 border-r border-white/5">Lote Mín. (KG)</th>
                  <th className="px-4 py-4 border-r border-white/5 text-emerald-400 bg-black/10">Stock (KG)</th>
                  <th className="px-4 py-4 border-r border-white/5 text-emerald-400 bg-black/10 font-black">Stock (UN)</th>
                  <th className="px-4 py-4 border-r border-white/5 text-amber-500 bg-black/10">En Curado (UN)</th>
                  <th className="px-4 py-4 text-emerald-300 bg-black/10 font-black">Stock Útil (UN)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold">
                {data.length === 0 ? (
                  <tr><td colSpan={7} className="py-16 text-center text-slate-200 uppercase font-black">Sin stock de &quot;BLOQUE FORMULADO&quot; registrado</td></tr>
                ) : (
                  data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-left font-mono font-black text-indigo-600 border-r border-gray-100">{row.materialCode}</td>
                      <td className="px-6 py-3 text-left uppercase text-slate-700 border-r border-gray-100 truncate max-w-[280px]">{row.descripcion}</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-mono text-slate-400">{row.loteMin > 0 ? formatNum(row.loteMin, 0) : '—'}</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-emerald-600 bg-emerald-50/10">{formatNum(row.stockKg, 0)}</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-emerald-800 bg-emerald-50/20">{row.stockUN.toFixed(1)}</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-amber-700 bg-amber-50/20">{row.stockEnCuradoUN.toFixed(1)}</td>
                      <td className="px-4 py-3 font-mono font-black text-emerald-800 bg-emerald-50/30">{row.stockUtilUN.toFixed(1)}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {data.length > 0 && (
                <tfoot className="bg-[#0f172a] text-white font-black text-[9px] uppercase sticky bottom-0 z-10">
                  <tr>
                    <td colSpan={3} className="px-4 py-4 text-right tracking-widest border-r border-white/5">Totales</td>
                    <td className="px-4 py-4 border-r border-white/5 font-mono text-emerald-300 bg-emerald-500/10">{formatNum(tStockKg, 0)}</td>
                    <td className="px-4 py-4 border-r border-white/5 font-mono text-emerald-300 bg-emerald-500/10">{tStockUN.toFixed(1)}</td>
                    <td className="px-4 py-4 border-r border-white/5 font-mono text-amber-300 bg-amber-500/10">{tEnCuradoUN.toFixed(1)}</td>
                    <td className="px-4 py-4 font-mono text-emerald-300 bg-emerald-500/10">{tUtilUN.toFixed(1)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando SAP...</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'resumen': return (
        <div className="space-y-12 animate-in fade-in duration-300">
           {isProcessingResumen ? (
             <div className="py-32 text-center">
                <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary mb-6" />
                <p className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Ejecutando Explosión Técnica BOM: {resumenProgress.current} / {resumenProgress.total}</p>
             </div>
           ) : (
             <>
               {renderSummaryTable(summarySpaces.apertura, "Bloque Formulado — Apertura (194.5 / 206 / 219 / 228...)", TrendingUp)}
               {renderSummaryTable(summarySpaces.combinacion, "Bloque Formulado — Combinación (sin apertura técnica)", Box)}
             </>
           )}
        </div>
      );
      case 'curado': return (
        <div className="animate-in fade-in duration-300 text-left space-y-4">
           {renderCuradoEvaluation(curadoStockEvaluation)}
           {CURADO_SPACES.map(space => (
             <React.Fragment key={space.key}>
               {renderCuradoSpace(curadoData, space)}
             </React.Fragment>
           ))}
           {(!curadoData || curadoData.length === 0) && (
             <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100">
               <TableIcon className="w-16 h-16 text-indigo-100 mx-auto" />
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Sin datos técnicos de curado en SAP</p>
             </div>
           )}
        </div>
      );
      case 'ordenes': return (
        <div className="animate-in fade-in duration-300 text-left">
           <Card className="border-2 border-gray-100 rounded-[2.5rem] shadow-xl overflow-hidden bg-white">
              <div className="overflow-x-auto">
                <table className="min-w-full text-[10px] text-center border-collapse">
                  <thead className="bg-[#1e293b] text-white uppercase font-black tracking-widest text-[8px] border-b border-white/5 sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-5 text-left border-r border-white/5">Orden</th>
                      <th className="px-6 py-5 text-left border-r border-white/5">Material / Descripción</th>
                      <th className="px-4 py-5 border-r border-white/5">Apertura</th>
                      <th className="px-4 py-5 border-r border-white/5 bg-black/10">Dens.</th>
                      <th className="px-6 py-5 border-r border-white/5 text-right font-black">Cant. Prog.</th>
                      <th className="px-4 py-5 border-r border-white/5">Máquina</th>
                      <th className="px-4 py-5">Almacén</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-bold text-slate-600">
                    {provFiltradas.length === 0 ? (
                      <tr><td colSpan={7} className="py-20 text-center text-slate-200 uppercase font-black">Sin órdenes provisionales para los filtros actuales</td></tr>
                    ) : (
                      provFiltradas.map((o, idx) => {
                        const info = extractMaterialInfo(o);
                        return (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="px-6 py-4 text-left font-mono font-black text-slate-900 border-r border-gray-50">{getProp(o, ['ORDENPREVISIONAL', 'ORDEN'])}</td>
                            <td className="px-6 py-4 text-left border-r border-gray-50 truncate max-w-[400px]">
                              <span className="text-indigo-600 font-black block text-[11px]">{info.code}</span>
                              <span className="text-slate-400 text-[9px] uppercase italic block leading-tight">{info.desc}</span>
                            </td>
                            <td className="px-4 py-4 border-r border-gray-50 font-black text-blue-700 bg-blue-50/20">{info.apertura}</td>
                            <td className="px-4 py-4 border-r border-gray-50 font-mono text-slate-900">{info.dens}</td>
                            <td className="px-6 py-4 text-right font-mono font-black text-slate-900 bg-slate-50/10 border-r border-gray-50">{formatNum(o.CANT_PROG || o.CANTIDAD || o.CANTPROGRAMADA, 0)}</td>
                            <td className="px-4 py-4 border-r border-gray-50 font-black text-slate-400 uppercase text-[9px]">{getProp(o, ['MAQUINA', 'RECURSO'])}</td>
                            <td className="px-4 py-4 text-indigo-700 font-black bg-indigo-50/30">{getProp(o, ['ALMACEN', 'Almacen'])}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
           </Card>
           {renderConsumoBloqueTable(provConsumoResponsable, "Consumo de Bloque Formulado por Componente — Provisionales")}
        </div>
      );
      case 'ordenesProd': return (
        <div className="animate-in fade-in duration-300 text-left">
          <Card className="border-2 border-gray-100 rounded-[2.5rem] shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full text-[10px] text-center border-collapse">
                <thead className="bg-[#1e293b] text-white uppercase font-black tracking-widest text-[8px] border-b border-white/5 sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 text-left border-r border-white/5">Orden FERT</th>
                    <th className="px-6 py-5 text-left border-r border-white/5">Material / Descripción</th>
                    <th className="px-6 py-5 border-r border-white/5 text-right font-black">Cant.</th>
                    <th className="px-4 py-5 border-r border-white/5">Responsable</th>
                    <th className="px-4 py-5 border-r border-white/5">Máquina</th>
                    <th className="px-4 py-5">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-slate-600">
                  {prodFiltradas.length === 0 ? (
                    <tr><td colSpan={6} className="py-20 text-center text-slate-200 uppercase font-black">Sin órdenes de producción detectadas</td></tr>
                  ) : (
                    prodFiltradas.map((o, idx) => {
                      const info = extractMaterialInfo(o);
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 text-left font-mono font-black text-indigo-900 border-r border-gray-50">{getProp(o, ['ORDEN', 'ORDEN_PROCESO'])}</td>
                          <td className="px-6 py-4 text-left border-r border-gray-50 truncate max-w-[400px]">
                            <span className="text-primary font-black block text-[11px]">{info.code}</span>
                            <span className="text-slate-400 text-[9px] uppercase italic block leading-tight">{info.desc}</span>
                          </td>
                          <td className="px-6 py-4 text-right font-mono font-black text-slate-900 bg-slate-50/10 border-r border-gray-50">{formatNum(o.CANT_PROG || o.CANTIDAD || o.CANTPROGRAMADA, 0)}</td>
                          <td className="px-4 py-4 border-r border-gray-50">
                            <Badge variant="outline" className="text-[10px] font-black bg-blue-50 text-blue-700 border-blue-100">{getProp(o, ['RESP_CONTROL_PROD', 'RESPCONTROLPROD'])}</Badge>
                          </td>
                          <td className="px-4 py-4 border-r border-gray-50 font-black text-slate-400 uppercase text-[9px]">{getProp(o, ['MAQUINA', 'RECURSO'])}</td>
                          <td className="px-4 py-4 text-slate-400 font-bold">{getProp(o, ['ALMACEN', 'Almacen'])}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
          {renderConsumoBloqueTable(fertConsumoResponsable, "Consumo de Bloque Formulado por Componente — FERT")}
        </div>
      );
      case 'inventario': return (
        <div className="animate-in fade-in duration-300 text-left">
          <Card className="rounded-[2.5rem] border-2 border-gray-100 shadow-xl overflow-hidden bg-white">
            <div className="px-6 pt-5 pb-3 flex items-start gap-2 text-slate-400">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <p className="text-[10px] leading-relaxed">
                Fuente: <span className="font-black text-slate-500">CuboInventarios SAP</span>. <span className="font-black text-green-600">Stock (KG)</span> es el <code className="font-mono">StockActual</code> reportado por SAP.
                <span className="font-black text-blue-600"> Stock (UN)</span> = Stock (KG) ÷ Lote Mínimo, es decir, cuántos lotes mínimos de fabricación caben en el stock disponible.
              </p>
            </div>
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5">Material</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Descripción del Bloque (SAP)</th>
                    <th className="px-4 py-5 border-r border-white/10 text-left text-indigo-300">Categoría</th>
                    <th className="px-3 py-5 border-r border-white/5">Centro</th>
                    <th className="px-3 py-5 border-r border-white/5 text-purple-300">Clase Aprov.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-green-500/30 text-green-300">
                      Stock (KG)
                      <span className="block normal-case font-normal text-white/50 text-[7px] tracking-normal mt-0.5">StockActual SAP</span>
                    </th>
                    <th className="px-3 py-5 border-r border-white/5 bg-blue-500/30 text-blue-200">
                      Stock (UN)
                      <span className="block normal-case font-normal text-white/50 text-[7px] tracking-normal mt-0.5">KG ÷ Lote Mín.</span>
                    </th>
                    <th className="px-3 py-5 border-r border-white/5 bg-amber-500/30 text-amber-200">Lote Mín. (KG)</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-amber-500/30 text-amber-200">Lote Máx. (KG)</th>
                    <th className="px-3 py-5">Responsable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-[11px]">
                  {filteredInventario.length === 0 ? (
                    <tr><td colSpan={10} className="py-20 text-center text-slate-200 uppercase font-black">No hay stock de &quot;BLOQUE FORMULADO&quot; registrado</td></tr>
                  ) : (
                    filteredInventario.map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/10 transition-colors">
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 font-mono text-blue-600">{cleanCode(row.Material)}</td>
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 text-left uppercase text-slate-500 truncate max-w-[300px] leading-tight">{row.Descripcion || '—'}</td>
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 text-left text-indigo-600 truncate max-w-[220px]">{row.Categoria || '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100">{row.Centro}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 text-purple-700 font-black bg-purple-50/30">{row.ClaseAprovisionam || '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-green-700 bg-green-50/30">{formatNum(row.stockKg, 1)}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-blue-500 bg-blue-50/30">{row.loteMin > 0 ? formatNum(row.stockUN, 2) : '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-amber-700 bg-amber-50/30">{row.loteMin > 0 ? formatNum(row.loteMin, 0) : '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-amber-700 bg-amber-50/30">{row.loteMax > 0 ? formatNum(row.loteMax, 0) : '—'}</td>
                        <td className="px-3 py-3 text-[9px] text-blue-600 uppercase font-black">{row.RespCtrlProd || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      );
      default: return null;
    }
  };

  if (!mounted) return <div className="p-4 md:p-6 min-h-screen bg-white" />;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-indigo-600/10 rounded-xl shadow-inner"><FlaskConical className="w-6 h-6 text-indigo-600" /></div>
          <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Formulación</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchDataAsync} disabled={isLoading || isProcessingResumen} className="h-9 px-5 rounded-xl bg-primary text-white gap-2 font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all">
            {(isLoading || isProcessingResumen) ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} ACTUALIZAR AUDITORÍA
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 px-5 rounded-xl border-gray-200 gap-2 font-black text-[10px] uppercase shadow-sm transition-all hover:border-primary/50">
                <CalendarIcon className="w-4 h-4 text-primary" /> {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} Días`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
              <div className="bg-white p-5 font-sans text-left text-[11px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-slate-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                  <div className="flex gap-1 bg-gray-50 p-1 rounded-xl">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => subMonths(prev, 1))} className="h-8 w-8 hover:bg-white"><ChevronLeft className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => addMonths(prev, 1))} className="h-8 w-8 hover:bg-white"><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center mb-4">
                  {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[9px] font-black text-slate-300 uppercase py-1">{d}</div>)}
                  {calendarDaysList.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dStr = format(day, 'yyyy-MM-dd');
                    const isSel = selectedDates.has(dStr);
                    return (
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); if (isSel) { n.delete(dStr); } else { n.add(dStr); } setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSel ? "bg-primary text-white shadow-md" : "hover:bg-slate-50")}>
                        <span className={cn("text-xs font-black", isSel ? "text-white" : "text-slate-700")}>{format(day, 'd')}</span>
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-primary h-9 rounded-xl hover:bg-primary/5 tracking-widest" onClick={() => setSelectedDates(new Set())}>Ver Todo</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[ 
            { v: 'resumen', l: 'Salida de Datos', i: LayoutDashboard }, 
            { v: 'curado', l: 'Control Curado', i: TableIcon },
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'ordenesProd', l: 'FERT', i: ShoppingCart },
            { v: 'inventario', l: 'Inventarios SAP', i: Database }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-primary rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6">
          {renderContent()}
        </div>
      </Tabs>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
      `}</style>
    </div>
  );
};
