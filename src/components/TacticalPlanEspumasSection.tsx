
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
const CAROUSEL_DIAMETER_CM = 320;
const EFFICIENCY_FACTOR = 0.87;

// Máquinas de cabecera del resumen (Capacidad Operativa), reutilizadas para vincular
// cada registro de Mantenimiento SAP (ID_MAQUINA) con su tarjeta correspondiente.
const MACHINES_BY_PLANTA: Record<'UIO' | 'GYE', { id: string; n: string }[]> = {
  UIO: [{ id: 'CR04', n: 'CARRUSEL 4 FECKEN' }, { id: 'CR03', n: 'CARRUSEL 3 SCHMUZIGER' }, { id: 'CR01', n: 'CARRUSEL 1 SCHMUZIGER' }, { id: 'CNC01', n: 'CORTADORA CNC GIOTTO' }],
  GYE: [{ id: 'CR02', n: 'CARRUSEL 2 FEMA' }, { id: 'CR01', n: 'CARRUSEL 1 SCHMUZIGER' }, { id: 'LA02', n: 'LAMINADORA REPOTENCIADA' }],
};

interface UnifiedRow {
  orden: string;
  fecha: string;
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
}

interface NecesidadPlantaRow {
  codigo_material: number;
  cantidad_produccion_neta: string;
  fecha_inicio: string;
}

const AreaNeedsTable: React.FC<{ area: string; rows: NecesidadPlantaRow[] }> = ({ area, rows }) => {
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => { setPage(1); }, [rows]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const paginated = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page]);

  return (
    <div className="space-y-4 text-left">
      <h3 className="text-xs font-black uppercase text-slate-800 tracking-widest flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-red-600" /> {area} ({rows.length})
      </h3>
      <div className="border border-slate-100 rounded-[2.5rem] overflow-hidden bg-white shadow-xl">
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-center border-collapse text-[10px]">
            <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter sticky top-0 z-20 border-b border-white/10">
              <tr>
                <th className="px-6 py-4 border-r border-white/5 text-left">Código Material</th>
                <th className="px-6 py-4 border-r border-white/5 font-black text-yellow-400">Cantidad Producción Neta</th>
                <th className="px-6 py-4 uppercase">Fecha Inicio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
              {paginated.length === 0 ? (
                <tr><td colSpan={3} className="py-16 text-slate-300 uppercase font-black tracking-widest italic opacity-50 text-center">Sin registros</td></tr>
              ) : paginated.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors font-mono text-[10px]">
                  <td className="px-6 py-3 border-r border-slate-50 text-left text-indigo-600 font-black">{row.codigo_material}</td>
                  <td className="px-6 py-3 border-r border-slate-50 text-slate-900 font-black bg-yellow-500/5">{row.cantidad_produccion_neta}</td>
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

const safeNum = (val: any): number => {
  const n = Number(String(val || '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const formatNum = (val: any, decimals: number = 2): string => {
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

export const TacticalPlanEspumasSection: React.FC = () => {
  useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [isLoading, setIsLoading] = useState(true);
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<any[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);
  const [, setInventarioSAP] = useState<any[]>([]);
  const [kpiLooperData, setKpiLooperData] = useState<any[]>([]);
  const [mantenimientosSAP, setMantenimientosSAP] = useState<any[]>([]);
  const [tiemposCatalogo, setTiemposCatalogo] = useState<any[]>([]);
  const [operadoresCorte, setOperadoresCorte] = useState<any[]>([]);
  const [, setGrupos] = useState<Grupo[]>([]);
  const [necesidadesPlantaData, setNecesidadesPlantaData] = useState<Record<string, NecesidadPlantaRow[]>>({});
  const [necesidadesPlantaLoading, setNecesidadesPlantaLoading] = useState(false);
  
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState<Date>(new Date()); 
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // --- CONFIGURACIÓN DASHBOARDS ---
  const [uioConfig, setUioConfig] = useState<any>({
    performance: 90,
    shifts: {
      CR04: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 },
      CR03: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 },
      CR01: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 },
      CNC01: { day: 'H1', night: 'EMPTY', op1D: '', op2D: '', op1N: '', op2N: '', paro1: 13, paro2: 13 }
    }
  });

  const [gyeConfig, setGyeConfig] = useState<any>({
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

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = getProp(item, ['MATERIAL', 'Material', 'CodMaterial', 'MATERIAL_ID', 'CODIGO']);
    const nameStr = getProp(item, ['NOMBRE', 'NombreMaterial', 'Descripcion', 'NomMaterial', 'DESCRIPCION']);
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[0].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    const dims = parseDimensions(desc);
    return { code, desc, ...dims };
  }, []);

  const auditMapper = useCallback((data: any[], centroId: string): UnifiedRow[] => {
    return data.map(o => {
      const info = extractMaterialInfo(o);
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

      const tMatch = tiemposCatalogo.find(t => cleanCode(t.CodMaterial) === info.code && String(t.Centro).trim() === centroId);
      const tIndiv = tMatch ? safeNum(tMatch.Tiempo || tMatch.Tiempo_Min) : 0;

      const looperMatch = kpiLooperData.find(k => cleanCode(k.Material) === info.code);
      const pesoUN = looperMatch ? safeNum(looperMatch.PesoUN) : (info.ancho * info.largo * info.esp * densVal) / 1000000;

      return {
        orden: getProp(o, ['ORDENPREVISIONAL', 'ORDEN']) || '—',
        fecha: String(getProp(o, ['FECHAINICIO', 'FECHA', 'FECHA_INICIO'])).split('T')[0],
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
        tTotal: (tIndiv * totalCycles) / 60,
        apertura: info.apertura,
        categoria: getProp(o, ['CATEGORIA', 'Categoria', 'CATEGORIA_DESC']) || '—',
        centro: centroId,
        almacen: getProp(o, ['Almacen', 'ALMACEN', 'CENTRO']),
        responsable: resp,
        maquina: getProp(o, ['MAQUINA', 'RECURSO', 'ID_MAQUINA', 'Maquina']).trim(),
        isAlterna
      };
    });
  }, [extractMaterialInfo, tiemposCatalogo, kpiLooperData]);

  const getFilteredData = useCallback((rawData: any[], centro: string) => {
    // Auditamos responsables de Corte (013, 038, 039, 044, 036, 034, 002)
    const allowed = centro === '1000' ? ['013', '038', '039', '044', '036', '034'] : ['002', '038', '039', '044', '036', '034'];
    return rawData.filter(o => {
      const c = String(getProp(o, ['Centro', 'CENTRO', 'centro'])).trim();
      const r = String(getProp(o, ['RESPCONTROLPROD', 'RESPCTRLPROD', 'RespControlProd', 'RESP_CONTROL_PROD', 'RESPONSABLE'])).trim();
      const dateRaw = String(getProp(o, ['FECHAINICIO', 'FECHA', 'FECHA_INICIO'])).trim();
      const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      return c === centro && allowed.includes(r) && (selectedDates.size === 0 || selectedDates.has(date));
    });
  }, [selectedDates]);

  const provAuditUIO = useMemo(() => auditMapper(getFilteredData(ordenesProvisionales, '1000'), '1000'), [auditMapper, getFilteredData, ordenesProvisionales]);
  const provAuditGYE = useMemo(() => auditMapper(getFilteredData(ordenesProvisionales, '2000'), '2000'), [auditMapper, getFilteredData, ordenesProvisionales]);
  const fertAuditUIO = useMemo(() => auditMapper(getFilteredData(ordenesFert, '1000'), '1000'), [auditMapper, getFilteredData, ordenesFert]);
  const fertAuditGYE = useMemo(() => auditMapper(getFilteredData(ordenesFert, '2000'), '2000'), [auditMapper, getFilteredData, ordenesFert]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    [...ordenesProvisionales, ...ordenesFert].forEach(o => {
      const d = String(getProp(o, ['FECHA', 'FECHAINICIO', 'FECHA_INICIO']) || '').trim();
      if (d && d !== 'null') dates.add(d.split('T')[0]);
    });
    return dates;
  }, [ordenesProvisionales, ordenesFert]);

  const calendarDaysList = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  const fetchDataAsync = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return (name.includes('corte y laminado') || name.includes('laminado'));
      });
      setGrupos(filteredGroups);
      
      const [provsRes, fertsRes, invRes, timesRes, skillsRes, maintRes, kpiRes] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getInventarioAñoActual().catch(() => ({ data: [] })),
        serviciosService.getTiemposEnsamblado(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getCuboHabilidadesOP().catch(() => ({ data: [] })),
        serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] })),
        serviciosService.getKPIMAestroLooper().catch(() => ({ data: [] }))
      ]);

      setOrdenesProvisionales(provsRes.data?.data || provsRes.data || []);
      setOrdenesFert(fertsRes.data?.data || fertsRes.data || []);
      setInventarioSAP(invRes.data || []);
      setTiemposCatalogo(timesRes.data?.data || timesRes.data || []);
      setMantenimientosSAP(Array.isArray(maintRes.data) ? maintRes.data : []);
      setKpiLooperData(kpiRes.data || []);
      
      const skills = Array.isArray(skillsRes.data) ? skillsRes.data : [];
      setOperadoresCorte(skills.filter((s: any) => String(getProp(s, ['LineaProceso', 'LINEA_PROCESO'])).toUpperCase().includes('CORTE')));
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

      // 1. Restricción ALMACEN_CONSUMO: su valor contiene los nombres de grupo (sin espacios/tildes) a filtrar de la tabla de grupos
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

      // 2. PlanGrupo activos cuyo valor coincide con "Plan Táctico - Centro <centro> - P2" y cuyo grupo esté en la lista anterior
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

      // 3. DetalleTactico asociado a los PlanGrupo encontrados
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
    setMounted(true);
    const today = new Date();
    setViewDate(today);
    setSelectedDates(new Set([format(today, 'yyyy-MM-dd')]));
  }, []);

  useEffect(() => { if (mounted) { fetchDataAsync(); fetchNecesidadesPlanta(); } }, [mounted, fetchDataAsync, fetchNecesidadesPlanta]);

  const updateConfig = (planta: 'UIO' | 'GYE', machine: string, field: string, value: any) => {
    const setFn = planta === 'UIO' ? setUioConfig : setGyeConfig;
    setFn((prev: any) => ({
      ...prev,
      shifts: { ...prev.shifts, [machine]: { ...prev.shifts[machine], [field]: value } }
    }));
  };

  // Duración en horas de una fila de Mantenimiento SAP. El campo real es Duracion_Minutos
  // (en minutos); T_MTTO_PLANIFICADO no existe en el endpoint pero se conserva como
  // resguardo por si alguna variante del servicio lo llega a incluir (en horas).
  const getMttoDurationH = (row: any): number => {
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
    return uniqueMantenimientosSAP
      .filter(m => {
        const idMaquina = getProp(m, ['ID_MAQUINA', 'MAQUINA']);
        const link = resolveMachineLink(idMaquina, getProp(m, ['Centro', 'CENTRO']), getProp(m, ['PLANTA']));
        if (!link || link.id !== target || link.planta !== planta) return false;
        // Extracción de fecha (formato SAP ISO: 2026-07-09T19:00:00.000Z) para comparar contra los días
        // seleccionados en el calendario, con el mismo criterio usado en getFilteredData.
        const dateRaw = String(getProp(m, ['FECHA_OT_PRG_INI'])).trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        return selectedDates.size === 0 || selectedDates.has(date);
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
      <div key={id} className="col-span-1 border-r border-slate-700/50 flex flex-col font-sans">
        <div className="p-3 border-b border-slate-700/50 text-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{id}</p>
          <p className="text-[8px] font-bold text-slate-500 uppercase truncate">{name}</p>
        </div>
        <div className="p-4 space-y-4 flex-1 text-left">
          <div className="space-y-1">
             <p className="text-[7px] font-black text-slate-500 uppercase mb-1">MTTO PREVENTIVO</p>
             <div className="bg-indigo-900/30 border border-indigo-500/30 rounded p-1.5 text-center">
                <span className="text-[10px] font-black text-indigo-300">{mttoHours.toFixed(2)}H</span>
             </div>
          </div>
          <div className="space-y-2">
            <p className="text-[7px] font-black text-slate-500 uppercase">TURNO DÍA</p>
            <select value={config.day} onChange={e => updateConfig(planta, id, 'day', e.target.value)} className="w-full bg-[#2a374a] text-yellow-400 font-black text-[10px] rounded px-2 py-1 outline-none border border-slate-700">
              {shiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <select value={config.op1D} onChange={e => updateConfig(planta, id, 'op1D', e.target.value)} className="w-full bg-slate-900 text-slate-300 text-[9px] rounded px-2 py-1 outline-none border border-slate-700">
              <option value="">— OP1 —</option>
              {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>{getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])}</option>)}
            </select>
            <select value={config.op2D} onChange={e => updateConfig(planta, id, 'op2D', e.target.value)} className="w-full bg-slate-900 text-slate-300 text-[9px] rounded px-2 py-1 outline-none border border-slate-700">
              <option value="">— OP2 AYUD —</option>
              {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>{getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])}</option>)}
            </select>
          </div>
          <div className="space-y-2 pt-2 border-t border-slate-700/30">
            <p className="text-[7px] font-black text-slate-500 uppercase">TURNO NOCHE</p>
            <select value={config.night} onChange={e => updateConfig(planta, id, 'night', e.target.value)} className="w-full bg-[#2a374a] text-purple-400 font-black text-[10px] rounded px-2 py-1 outline-none border border-slate-700">
              {nightShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
            <select value={config.op1N} onChange={e => updateConfig(planta, id, 'op1N', e.target.value)} className="w-full bg-slate-900 text-slate-300 text-[9px] rounded px-2 py-1 outline-none border border-slate-700">
              <option value="">— OP1 —</option>
              {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>{getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])}</option>)}
            </select>
            <select value={config.op2N} onChange={e => updateConfig(planta, id, 'op2N', e.target.value)} className="w-full bg-slate-900 text-slate-300 text-[9px] rounded px-2 py-1 outline-none border border-slate-700">
              <option value="">— OP2 AYUD —</option>
              {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CodigoOperador ', 'CODIGO_OPERADOR'])}>{getProp(op, ['NombreOperador', 'NOMBRE_OPERADOR'])}</option>)}
            </select>
          </div>
          <div className="space-y-2 pt-2 border-t border-slate-700/30">
             <div className="flex items-center gap-2 bg-[#1e293b] p-1.5 rounded border border-slate-700">
                <span className="text-[7px] font-black text-amber-500 uppercase flex-1">PARO T1</span>
                <input type="number" value={config.paro1} onChange={e => updateConfig(planta, id, 'paro1', safeNum(e.target.value))} className="w-8 bg-transparent text-white text-[10px] font-black outline-none text-right" />
                <span className="text-[7px] text-slate-500">%</span>
             </div>
             <div className="flex items-center gap-2 bg-[#1e293b] p-1.5 rounded border border-slate-700">
                <span className="text-[7px] font-black text-orange-500 uppercase flex-1">PARO T2</span>
                <input type="number" value={config.paro2} onChange={e => updateConfig(planta, id, 'paro2', safeNum(e.target.value))} className="w-8 bg-transparent text-white text-[10px] font-black outline-none text-right" />
                <span className="text-[7px] text-slate-500">%</span>
             </div>
          </div>
        </div>
        <div className="p-3 bg-slate-900/50 border-t border-slate-700 space-y-2 mt-auto">
           <div className="pt-1">
              <p className="text-[7px] font-black text-slate-500 uppercase mb-0.5">OCUPACIÓN RECURSO</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden"><div className={cn("h-full", occupancy > 100 ? "bg-red-500" : "bg-emerald-500")} style={{ width: `${Math.min(occupancy, 100)}%` }} /></div>
                <span className="text-[9px] font-black text-white">{occupancy.toFixed(1)}%</span>
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
      <div className="bg-[#1e293b] rounded-[2.5rem] shadow-2xl overflow-hidden mb-10 text-white text-left font-sans">
        <div className="grid grid-cols-12">
          <div className="col-span-3 p-8 border-r border-slate-700/50 bg-slate-900/30 flex flex-col justify-between text-left">
            <div className="space-y-8">
              <div>
                <p className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-1">UBICACIÓN TÉCNICA</p>
                <h3 className="text-4xl font-black tracking-tighter">{planta === 'UIO' ? 'QUITO' : 'GYE'}</h3>
              </div>
              <div className="pt-8 border-t border-slate-700/50 text-left">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">RENDIMIENTO (%)</p>
                <input type="number" value={config.performance} onChange={e => planta === 'UIO' ? setUioConfig({...uioConfig, performance: safeNum(e.target.value)}) : setGyeConfig({...gyeConfig, performance: safeNum(e.target.value)})}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-xl font-black text-emerald-400 outline-none focus:border-emerald-500" />
              </div>
            </div>
            
            <div className="space-y-6">
              <div className="text-left">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">CAPACIDAD TOTAL</p>
                <div className="flex items-baseline gap-2"><span className="text-5xl font-black text-yellow-400 tracking-tighter">{totalH.toFixed(1)}</span><span className="text-xs font-black text-slate-500 uppercase">HORAS</span></div>
              </div>
              
              <div className="text-left border-t border-slate-700/50 pt-4">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">CAPACIDAD PLANIFICADA</p>
                <div className="flex items-baseline gap-2"><span className="text-3xl font-black text-emerald-400 tracking-tighter">{totalPlannedH.toFixed(1)}</span><span className="text-[10px] font-black text-slate-500 uppercase">H</span></div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest w-16">Carruseles</span>
                    <span className="text-[11px] font-black tabular-nums text-white">{plannedCarrusel.toFixed(1)}h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-fuchsia-400 uppercase tracking-widest w-16">Verticales</span>
                    <span className="text-[11px] font-black tabular-nums text-white">{plannedVertical.toFixed(1)}h</span>
                  </div>
                </div>
              </div>

              <div className="text-left">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-2">OCUPACIÓN GLOBAL</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700"><div className={cn("h-full transition-all duration-500", globalOccupancy > 100 ? "bg-red-500 shadow-[0_0_10px_#ef4444]" : "bg-emerald-500")} style={{ width: `${Math.min(globalOccupancy, 100)}%` }} /></div>
                  <span className="text-sm font-black tabular-nums">{globalOccupancy.toFixed(1)}%</span>
                </div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest w-16">Carruseles</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700"><div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${Math.min(occCarrusel, 100)}%` }} /></div>
                    <span className="text-[11px] font-black tabular-nums w-10 text-right">{occCarrusel.toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] font-black text-fuchsia-400 uppercase tracking-widest w-16">Verticales</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700"><div className="h-full bg-fuchsia-500 transition-all duration-500" style={{ width: `${Math.min(occVertical, 100)}%` }} /></div>
                    <span className="text-[11px] font-black tabular-nums w-10 text-right">{occVertical.toFixed(1)}%</span>
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

  const renderAuditTable = (data: UnifiedRow[], title: string) => {
    const grouped = data.reduce((acc, row) => {
      const key = `${row.apertura}|${row.categoria}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {} as Record<string, UnifiedRow[]>);

    return (
      <div className="space-y-4 text-left">
        <h3 className="text-xs font-black uppercase text-slate-800 tracking-widest flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-red-600" /> {title} ({data.length})</h3>
        <div className="border border-slate-100 rounded-[2.5rem] overflow-hidden bg-white shadow-xl">
          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-center border-collapse text-[10px]">
              <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter sticky top-0 z-20 border-b border-white/10">
                <tr>
                  <th className="px-4 py-4 border-r border-white/5 text-left w-32">Material</th>
                  <th className="px-6 py-4 border-r border-white/5 text-left min-w-[200px]">Descripción</th>
                  <th className="px-2 py-4 border-r border-white/5">Ancho</th>
                  <th className="px-2 py-4 border-r border-white/5">Largo</th>
                  <th className="px-2 py-4 border-r border-white/5 text-blue-400">Esp.</th>
                  <th className="px-2 py-4 border-r border-white/5">Dens.</th>
                  <th className="px-3 py-4 border-r border-white/5 font-black text-yellow-400">Cant.</th>
                  <th className="px-3 py-4 border-r border-white/5">Peso Kg</th>
                  <th className="px-3 py-4 border-r border-white/5 bg-slate-800">Alt. Total</th>
                  <th className="px-3 py-4 border-r border-white/10 bg-indigo-500/20">T. Indiv</th>
                  <th className="px-4 py-4 border-r border-white/10 bg-indigo-600 font-black">T. Total H</th>
                  <th className="px-3 py-4 border-r border-white/5 bg-amber-500/20 text-amber-300 font-black">Cargas</th>
                  <th className="px-3 py-4 border-r border-white/5">Und/Batch</th>
                  <th className="px-3 py-4 border-r border-white/5 font-black text-indigo-300"># SUB_Bloque</th>
                  <th className="px-3 py-4 border-r border-white/5 bg-black/20 uppercase">Op. Alterna (39-36-44)</th>
                  <th className="px-3 py-4 border-r border-white/5 uppercase">Planta/ALM</th>
                  <th className="px-3 py-4 border-r border-white/5">Resp CP</th>
                  <th className="px-3 py-4 border-r border-white/5">Orden</th>
                  <th className="px-3 py-4 uppercase">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-700">
                {Object.entries(grouped).map(([key, items]) => {
                  const isExp = expandedGroups.has(key);
                  const tKg = items.reduce((s, r) => s + r.peso, 0);
                  const tCant = items.reduce((s, r) => s + r.cant, 0);
                  const tH = items.reduce((s, r) => s + r.tTotal, 0);
                  const tBatches = items.reduce((s, r) => s + r.nroCargas, 0);
                  return (
                    <React.Fragment key={key}>
                      <tr className="bg-slate-50 cursor-pointer hover:bg-indigo-50 transition-colors" onClick={() => {const n = new Set(expandedGroups); if (isExp) { n.delete(key); } else { n.add(key); } setExpandedGroups(n);}}>
                        <td className="px-4 py-3 text-left flex items-center gap-2 font-black text-indigo-900 border-r border-white/5">
                           {isExp ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                           {key.split('|')[0]} — {key.split('|')[1]}
                        </td>
                        <td colSpan={4} className="text-right pr-6 italic opacity-30 uppercase font-black tracking-widest text-[9px]">Subtotales de Bloque:</td>
                        <td className="border-r border-slate-50"></td>
                        <td className="px-3 py-3 font-black text-slate-900 bg-yellow-500/20 text-center text-[12px]">{formatNum(tCant, 0)}</td>
                        <td className="px-3 py-3 font-black text-slate-400 opacity-40">{formatNum(tKg, 0)}</td>
                        <td colSpan={2}></td>
                        <td className="px-4 py-3 bg-indigo-600 text-white font-black">{tH.toFixed(2)}h</td>
                        <td className="px-3 py-3 bg-amber-500/10 text-amber-700 font-black">{tBatches}</td>
                        <td colSpan={7}></td>
                      </tr>
                      {isExp && items.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors font-mono text-[9px]">
                          <td className="px-4 py-2 border-r border-slate-50 text-indigo-600 font-black pl-8 text-left">{row.material}</td>
                          <td className="px-6 py-2 border-r border-slate-50 text-left uppercase truncate max-w-[200px]">{row.descripcion}</td>
                          <td className="px-2 py-2 border-r border-slate-50">{row.ancho}</td>
                          <td className="px-2 py-2 border-r border-slate-50">{row.largo}</td>
                          <td className="px-2 py-2 border-r border-slate-50 text-blue-600 font-black">{row.esp}</td>
                          <td className="px-2 py-2 border-r border-slate-50">{row.dens}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-900 font-black bg-yellow-500/5">{row.cant}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-400">{formatNum(row.peso, 1)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 bg-slate-50 text-slate-900 font-black">{row.alturaTotal.toFixed(1)}</td>
                          
                          {/* COLUMNA T. INDIV CON ALERTA SI ES 0 */}
                          <td className={cn(
                            "px-3 py-2 border-r border-slate-50",
                            row.tIndiv === 0 ? "bg-red-500 text-white animate-pulse font-black" : "text-indigo-400"
                          )}>
                            {row.tIndiv.toFixed(2)}
                            {row.tIndiv === 0 && <span className="block text-[6px]">⚠️ REVISAR</span>}
                          </td>

                          <td className="px-4 py-2 border-r border-white/10 bg-indigo-50 text-indigo-800 font-black">{row.tTotal.toFixed(2)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 bg-amber-50 text-amber-700 font-black">{row.nroCargas}</td>
                          <td className="px-3 py-2 border-r border-slate-50 font-black">{Math.round(row.undBatch)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 font-black text-indigo-900">{row.subBloques.toFixed(3)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 font-black text-slate-500 bg-slate-100/50">
                             {row.isAlterna ? <Badge variant="secondary" className="bg-slate-800 text-white text-[7px] px-1 font-black">CARGA ALTERNA</Badge> : '—'}
                          </td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-400 font-black">{row.centro}/{row.almacen}</td>
                          <td className="px-3 py-2 border-r border-slate-50">{row.responsable}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-400">{row.orden}</td>
                          <td className="px-3 py-2 text-slate-300">{row.fecha}</td>
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
           <Popover>
            <PopoverTrigger asChild>
              <button className="h-10 px-5 rounded-2xl border border-gray-200 bg-white hover:border-red-500/50 flex items-center gap-3 font-black text-[11px] uppercase shadow-sm transition-all"><Filter className="w-4 h-4 text-red-500" /> {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} días seleccionados`}</button>
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
                    return (
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); if (isSelected) { n.delete(dStr); } else { n.add(dStr); } setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-red-600 text-white shadow-md shadow-red-200" : "hover:bg-slate-50")}>
                        <span className={cn("text-xs font-black", isSelected ? "text-white" : (datesWithOrders.has(dStr) ? "text-slate-800" : "text-slate-200"))}>{format(day, 'd')}</span>
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
          {[ { v: 'resumen', l: 'Capacidad Operativa', i: LayoutDashboard }, { v: 'necesidadesPlanta', l: 'Necesidades Planta', i: Database }, { v: 'ordenes', l: 'Provisionales', i: Package }, { v: 'ordenesFert', l: 'Órdenes FERT', i: ShoppingCart }, { v: 'mantenimiento', l: 'Mantenimiento SAP', i: Wrench } ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-red-600 rounded-xl"><tab.i className="w-4 h-4" /> {tab.l}</TabsTrigger>
          ))}
        </TabsList>
        <div className="mt-6">
          <TabsContent value="resumen" className="animate-in fade-in duration-300">{renderDashboard('UIO')}{renderDashboard('GYE')}</TabsContent>
          <TabsContent value="necesidadesPlanta" className="animate-in fade-in duration-300 space-y-10 text-left">
            {necesidadesPlantaLoading ? (
              <div className="flex items-center justify-center py-24 text-slate-300"><Loader2 className="w-6 h-6 animate-spin" /></div>
            ) : Object.keys(necesidadesPlantaData).length === 0 ? (
              <div className="py-24 text-center text-slate-300 uppercase font-black tracking-widest italic opacity-50">Sin necesidades de planta detectadas</div>
            ) : (
              Object.entries(necesidadesPlantaData).map(([area, rows]) => (
                <AreaNeedsTable key={area} area={area} rows={rows} />
              ))
            )}
          </TabsContent>
          <TabsContent value="ordenes" className="animate-in fade-in duration-300 space-y-10">{renderAuditTable(provAuditUIO, "AUDITORÍA TÉCNICA QUITO (1000) — PROVISIONALES")}{renderAuditTable(provAuditGYE, "AUDITORÍA TÉCNICA GUAYAQUIL (2000) — PROVISIONALES")}</TabsContent>
          <TabsContent value="ordenesFert" className="animate-in fade-in duration-300 space-y-10">{renderAuditTable(fertAuditUIO, "AUDITORÍA TÉCNICA QUITO (1000) — ÓRDENES FERT")}{renderAuditTable(fertAuditGYE, "AUDITORÍA TÉCNICA GUAYAQUIL (2000) — ÓRDENES FERT")}</TabsContent>
          <TabsContent value="mantenimiento" className="animate-in fade-in duration-300 text-left space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><Wrench className="w-4 h-4" /></div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Mantenimientos Preventivos Programados (SAP)</h3>
            </div>
            <div className="border border-slate-200 rounded-[2.5rem] overflow-hidden bg-white shadow-xl">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-center border-collapse text-[10px]">
                  <thead className="bg-[#0f172a] text-white border-b border-white/5 uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                    <tr>
                      <th className="px-4 py-5 border-r border-white/5">Centro</th>
                      <th className="px-6 py-5 border-r border-white/5">Planta</th>
                      <th className="px-6 py-5 border-r border-white/5">Área</th>
                      <th className="px-4 py-5 border-r border-white/5">ID Máquina</th>
                      <th className="px-6 py-5 border-r border-white/5">Máquina</th>
                      <th className="px-6 py-5 border-r border-white/5">Línea de Proceso</th>
                      <th className="px-5 py-5 border-r border-white/5">Inicio</th>
                      <th className="px-5 py-5 border-r border-white/5">Fin</th>
                      <th className="px-6 py-5 text-indigo-300 bg-indigo-900/40 uppercase font-black tracking-tighter">Duración (H)</th>
                      <th className="px-6 py-5 text-emerald-300 bg-emerald-900/30 uppercase font-black tracking-tighter">Vínculo Resumen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-black text-[11px] text-slate-700">
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
