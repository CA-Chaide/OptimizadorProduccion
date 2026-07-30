'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShoppingCart, Package, Loader2, LayoutDashboard, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, TrendingUp, Box, X, Layers, Wand2, Save, ClipboardCheck, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { planGrupoService } from '@/services/plangrupo.service';
import { detalleTacticoService } from '@/services/detalletactico.service';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion, PlanGrupo, DetalleTactico } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Progress } from "@/components/ui/progress";

// Constante técnica: Tiempo de empacado por unidad (segundos)
const PACKING_TIME_PER_UNIT_SECONDS = 15;

// Discriminador de tipo de componente en la explosión BOM (mismo criterio que usa
// Corte y Laminado para identificar la "lámina" que consume como materia prima).
const DESCRIPCION_ROLLO = 'LAMINA CILINDRICA';

const TIPO_TAG: Record<'ESPUMAS' | 'ROLLOS', string> = { ESPUMAS: 'Espumas', ROLLOS: 'Rollos' };

interface NecesidadMaterial {
  material: string;
  descripcion: string;
  cantidad: number;
}

interface DataAprobadaRow {
  material: string;
  descripcion: string;
  cantidad: number;
  respuestaCant: number;
  planGrupo: string;
  fechasOk: boolean | null;
}

// Cantidad viene como texto desde DetalleTactico (p.ej. "120.5000"); mismo criterio de limpieza
// que usan Corte Espuma / Corte y Laminado en sus resúmenes.
const parseQty = (val: unknown): number => {
  const n = Number(String(val ?? '').replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

// Normaliza fecha_inicio_plan/fecha_fin_plan (a veces con sufijo horario "...T00:00:00") a
// 'yyyy-MM-dd' — mismo criterio que usa Corte y Laminado para comparar rangos de PlanGrupo.
const soloFecha = (v: unknown): string => {
  const s = String(v ?? '').trim();
  if (!s || s === 'null' || s === 'undefined') return '';
  return s.includes('T') ? s.split('T')[0] : s;
};

// Solo el plan "P3" es una respuesta real de Corte y Laminado contra el P2 — "PFD" es una
// variante de salida para otro proceso (deja constancia de qué material quedó sin planificar,
// forzando a 0 los que no tienen corrida) y no debe contarse como material efectivamente recibido.
const esPlanP3 = (valor: unknown): boolean => /\bp3\b/i.test(String(valor || ''));

export const TacticalPlanVentaExternaSection: React.FC = () => {
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [viewDate, setViewDate] = useState(new Date());
  const [expandedCategorias1000, setExpandedCategorias1000] = useState<string[]>([]);
  const [expandedCategorias2000, setExpandedCategorias2000] = useState<string[]>([]);

  // Necesidad P2 (Plan de Grupo origen para Laminado/Espumas) — ambas se calculan explotando la
  // lista de materiales de las Órdenes FERT (Provisionales NO aplica para este paso).
  const [necesidadEspumas1000, setNecesidadEspumas1000] = useState<NecesidadMaterial[]>([]);
  const [necesidadEspumas2000, setNecesidadEspumas2000] = useState<NecesidadMaterial[]>([]);
  const [necesidadRollos1000, setNecesidadRollos1000] = useState<NecesidadMaterial[]>([]);
  const [necesidadRollos2000, setNecesidadRollos2000] = useState<NecesidadMaterial[]>([]);
  const [isExplodingBom, setIsExplodingBom] = useState(false);
  const [bomProgress, setBomProgress] = useState({ current: 0, total: 0 });
  // Diagnóstico de la última corrida de "Calcular Necesidad": qué FERT llegaron a explotarse (ya
  // pasaron centro + restricciones + ventana de fechas) pero no aportaron ninguna línea de Espuma/
  // Rollo, y cuáles fallaron al consultar el Maestro de Materiales — ver explodeNecesidadesFert.
  const [bomDiagnostico, setBomDiagnostico] = useState<{ sinMatch: string[]; conError: string[] }>({ sinMatch: [], conError: [] });
  const [savingPlanP2, setSavingPlanP2] = useState<Record<string, boolean>>({});
  const [planP2Generado, setPlanP2Generado] = useState<Record<string, number>>({});
  const [isSavingAllPlanP2, setIsSavingAllPlanP2] = useState(false);

  // Data Aprobada (P3): recupera, por cada P2 propio activo, la respuesta del plan consumidor
  // (P3) — sus DetalleTactico cuyo codigo_plan_grupo_padre apunta a nuestro P2.
  const [dataAprobada, setDataAprobada] = useState<Record<string, DataAprobadaRow[]>>({});
  const [isLoadingDataAprobada, setIsLoadingDataAprobada] = useState(false);

  // Restricción de negocio: el filtro de fecha de "Resumen" no debe cubrir más de 3 días — evita que
  // el usuario arme una selección tan amplia que el rango "desde-hasta" que se guarda en el P2 (ver
  // ventanaP2) deje de representar una ventana operativa real.
  const MAX_DIAS_SELECCION = 3;
  const toggleSelectedDate = (dateStr: string) => {
    setSelectedDates(prev => {
      if (prev.includes(dateStr)) return prev.filter(d => d !== dateStr);
      const siguiente = [...prev, dateStr];
      const ordenadas = [...siguiente].sort();
      const spanDias = Math.round((parseISO(ordenadas[ordenadas.length - 1]).getTime() - parseISO(ordenadas[0]).getTime()) / 86400000) + 1;
      if (spanDias > MAX_DIAS_SELECCION) {
        addNotification('warning', `La selección de fechas no puede cubrir más de ${MAX_DIAS_SELECCION} días.`);
        return prev;
      }
      return siguiente;
    });
  };

  useEffect(() => { setMounted(true); }, []);

  const fetchGrupos = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => 
        g.nombre_grupo && (g.nombre_grupo.toLowerCase().includes('venta externa') || g.nombre_grupo.toLowerCase().includes('ventaexterna'))
      );
      setGrupos(filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando grupos:', error);
      return [];
    }
  };

  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      const res = await restriccionService.getAll();
      const filtered = (res.data || []).filter(r => gruposIds.includes(r.codigo_grupo));
      setRestricciones(filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando restricciones:', error);
      return [];
    }
  };

  const fetchOrdenes = async () => {
    try {
      const pProv = serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] }));
      const pFert = serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] }));
      
      const [resProv, resFert] = await Promise.all([pProv, pFert]);
      
      setOrders(resProv.data || []);
      setOrdersFert(resFert.data || []);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    }
  };

  const fetchTiemposEnsamblado = async (filteredGroups: Grupo[]) => {
    try {
      const allTiempos: any[] = [];
      for (const g of filteredGroups) {
        if (!g.centro) continue;
        try {
          const res = await serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(String(g.centro), g.codigo_grupo);
          const actualData = res.data?.data || res.data || [];
          if (Array.isArray(actualData)) allTiempos.push(...actualData);
        } catch {
          console.warn(`Error cargando tiempos para grupo ${g.codigo_grupo}`);
        }
      }
      setTiemposEnsamblado(allTiempos);
    } catch (error) {
      console.error('Error cargando tiempos:', error);
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const init = async () => {
      setIsLoading(true);
      const groups = await fetchGrupos();
      const ids = groups.map(g => g.codigo_grupo);
      await Promise.all([
        fetchRestricciones(ids),
        fetchOrdenes(),
        fetchTiemposEnsamblado(groups)
      ]);
      setIsLoading(false);
    };
    init();
  }, [mounted]);

  // Logic for dates with orders in the calendar
  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenesFert.forEach(o => {
      const d = String(o.FECHA || o.FECHAINICIO || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenesFert]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions: any = { dens: '—', ancho: '—', largo: '—', esp: '—', tipo: '—' };
    
    const techPatternMatch = catStr.match(/D(\d+)([a-zA-Z]+)/i);
    if (techPatternMatch) {
      dimensions.dens = techPatternMatch[1]; 
      dimensions.tipo = techPatternMatch[2].toUpperCase(); 
    } else {
      const densMatch = desc.match(/D-?(\d+)/i);
      if (densMatch) dimensions.dens = densMatch[1];
      const tipoMatch = desc.match(/D-?\d+([a-zA-Z]+)/i);
      if (tipoMatch) dimensions.tipo = tipoMatch[1].toUpperCase();
    }

    const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    if (dimMatch) {
      dimensions.ancho = dimMatch[1];
      dimensions.largo = dimMatch[2];
      if (dimMatch[3]) dimensions.esp = dimMatch[3];
    }
    
    return { code, desc, ...dimensions };
  };

  const filterData = (data: any[], centro: string, applyDateFilter: boolean = true, dateOverride?: string[]) => {
    const relevantGroups = grupos.filter(g => String(g.centro).trim() === centro);
    if (relevantGroups.length === 0) return [];
    
    const groupIds = relevantGroups.map(g => g.codigo_grupo);
    const groupRest = restricciones.filter(r => groupIds.includes(r.codigo_grupo));
    
    const respCodes = groupRest
      .filter(r => r.nombre_restriccion === 'RESPCTRLPROD')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');
    
    const almCodes = groupRest
      .filter(r => r.nombre_restriccion === 'ALMACEN')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    const sectorCodes = groupRest
      .filter(r => r.nombre_restriccion === 'SECTOR')
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return data.filter(o => {
      const itemCentro = String(o.CENTRO || o.Centro || o.centro || '').trim();
      if (itemCentro !== centro) return false;
      
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = respCodes.length === 0 || respCodes.some(code => itemResp === code || itemResp.includes(code));
      
      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      const matchAlm = almCodes.length === 0 || itemAlmValue === '' || almCodes.includes(itemAlmValue);
      
      const itemSectorValue = String(o.SECTORDESC || o.Sector || o.SECTOR || '').trim();
      const matchSector = sectorCodes.length === 0 || itemSectorValue === '' || sectorCodes.some(code => itemSectorValue.includes(code));

      if (applyDateFilter) {
        const itemDateFull = String(o.FECHA || o.FECHAINICIO || '').trim();
        const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
        const fechas = dateOverride ?? selectedDates;
        const matchDate = fechas.length === 0 || fechas.includes(itemDate);
        return matchResp && matchAlm && matchSector && matchDate;
      }

      return matchResp && matchAlm && matchSector;
    });
  };

  const provC1000 = useMemo(() => filterData(ordenes, '1000'), [ordenes, grupos, restricciones, selectedDates]);
  const provC2000 = useMemo(() => filterData(ordenes, '2000'), [ordenes, grupos, restricciones, selectedDates]);
  const fertC1000 = useMemo(() => filterData(ordenesFert, '1000'), [ordenesFert, grupos, restricciones, selectedDates]);
  const fertC2000 = useMemo(() => filterData(ordenesFert, '2000'), [ordenesFert, grupos, restricciones, selectedDates]);

  // Ventana de generación del P2 (Espumas/Rollos): vuelve a depender de la selección del usuario
  // (selectedDates, el mismo filtro "Fecha" de Resumen) en vez de una ventana fija hoy+1..hoy+3.
  // Dos correcciones sobre el comportamiento anterior a esa ventana fija:
  //  1) Sin fecha seleccionada, NO se explota nada (antes, sin selección, filterData dejaba pasar
  //     TODAS las FERT sin filtro — ver fertC1000VentanaP2 más abajo).
  //  2) Si se marcan fechas sueltas no contiguas, el rango "desde-hasta" que se guarda en el P2 se
  //     rellena con TODOS los días entre el mínimo y el máximo (eachDayOfInterval) — así nunca hay
  //     saltos, aunque el usuario no haya tocado cada día intermedio uno por uno.
  // El tope de amplitud (MAX_DIAS_SELECCION, ya aplicado en toggleSelectedDate) evita que ese
  // relleno termine cubriendo una ventana operativa poco realista.
  const ventanaP2 = useMemo(() => {
    if (selectedDates.length === 0) return { inicio: '', fin: '', fechas: [] as string[] };
    const ordenadas = [...selectedDates].sort();
    const inicio = ordenadas[0];
    const fin = ordenadas[ordenadas.length - 1];
    const fechas = eachDayOfInterval({ start: parseISO(inicio), end: parseISO(fin) }).map(d => format(d, 'yyyy-MM-dd'));
    return { inicio, fin, fechas };
  }, [selectedDates]);
  const fertC1000VentanaP2 = useMemo(() => selectedDates.length === 0 ? [] : filterData(ordenesFert, '1000', true, ventanaP2.fechas), [ordenesFert, grupos, restricciones, ventanaP2, selectedDates]);
  const fertC2000VentanaP2 = useMemo(() => selectedDates.length === 0 ? [] : filterData(ordenesFert, '2000', true, ventanaP2.fechas), [ordenesFert, grupos, restricciones, ventanaP2, selectedDates]);
  const tiemposC1000 = useMemo(() => filterData(tiemposEnsamblado, '1000', false), [tiemposEnsamblado, grupos, restricciones]);
  const tiemposC2000 = useMemo(() => filterData(tiemposEnsamblado, '2000', false), [tiemposEnsamblado, grupos, restricciones]);

  // Lookup de tiempos estándar por material+centro para match en Provisionales/FERT
  const buildTiempoLookup = (tiempos: any[]) => {
    const map = new Map<string, any[]>();
    tiempos.forEach(t => {
      const info = extractMaterialInfo(t);
      if (!map.has(info.code)) map.set(info.code, []);
      map.get(info.code)!.push(t);
    });
    return map;
  };
  const tiempoLookup1000 = useMemo(() => buildTiempoLookup(tiemposC1000), [tiemposC1000]);
  const tiempoLookup2000 = useMemo(() => buildTiempoLookup(tiemposC2000), [tiemposC2000]);

  const matchTiempoEstandar = (materialCode: string, maquina: string, lookup: Map<string, any[]>) => {
    const candidates = lookup.get(materialCode);
    if (!candidates || candidates.length === 0) return null;
    const byMaquina = candidates.find(t => {
      const linea = String(t.Linea || t.PuestoTrabajoLinea || '').trim().toUpperCase();
      return linea && linea === String(maquina).trim().toUpperCase();
    });
    const match = byMaquina || candidates[0];
    return Number(match.Tiempo_Min || match.Tiempo || 0);
  };

  // --- Necesidad P2 (origen para Corte Espuma / Corte y Laminado) ---
  // Ambas necesidades salen de explotar la lista de materiales (BOM) de las Órdenes FERT
  // generadas — las Provisionales NO aplican para este paso (dato distinto, no forma parte del
  // segundo nivel de componentes de las órdenes FERT).

  // Idéntico al cleanCode de Corte y Laminado (mismo criterio de limpieza de código SAP).
  const cleanCode = (v: unknown) => String(v || '').replace(/^0+/, '').trim();

  const DESCRIPCION_ESPUMA = 'ESPUMA';

  // Explota la lista de materiales de cada orden FERT única del centro: el FERT es una orden de PT
  // (Producto Terminado) cuyo segundo nivel de BOM es, por definición, el semielaborado que la
  // origina (ej. FERT 20006865 "ROLLO D19..." → HALB 30008368 "LAMINA CILINDRICA D19..." en NIVEL 2).
  // Sin restricción de nivel: se toma CUALQUIER fila cuya descripción coincida con "ESPUMA" o "LAMINA
  // CILINDRICA", sin importar en qué NIVEL del árbol aparezca — mismo criterio que ya usa Corte y
  // Laminado para su propia explosión de láminas (ver laminaRows en TacticalPlanCorteLaminadoSection).
  // Antes se exigía NIVEL 2 exacto (o NIVEL 3 solo si era variante CONV de un NIVEL 2 ya capturado)
  // para evitar coincidencias de texto en niveles más profundos y no relacionados, pero esa
  // restricción terminó descartando necesidades reales (el panel de diagnóstico mostraba FERT con
  // pedido real cuyo semielaborado no calzaba con ese patrón exacto de nivel) — se retira.
  const explodeNecesidadesFert = async (centro: string, fertOrders: any[], onStep: () => void): Promise<{ espumas: NecesidadMaterial[]; rollos: NecesidadMaterial[]; sinMatch: string[]; conError: string[] }> => {
    const materialQty = new Map<string, number>();
    fertOrders.forEach(o => {
      const info = extractMaterialInfo(o);
      if (!info.code) return;
      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      materialQty.set(info.code, (materialQty.get(info.code) || 0) + qty);
    });

    const espumasMap = new Map<string, NecesidadMaterial>();
    const rollosMap = new Map<string, NecesidadMaterial>();
    // Diagnóstico: distingue, para cada FERT que SÍ llegó hasta acá (ya pasó centro + restricciones
    // + ventana de fechas), entre "la consulta BOM falló" (conError) y "la consulta respondió pero
    // ninguna fila coincidió con ESPUMA/LAMINA CILINDRICA" (sinMatch) — antes ambos casos
    // desaparecían en silencio, sin dejar rastro de por qué un material con pedido FERT real no
    // terminaba en la tabla de Necesidad.
    const sinMatch: string[] = [];
    const conError: string[] = [];
    for (const [matCode, qty] of materialQty.entries()) {
      const fullCode = matCode.padStart(18, '0');
      let encontroMatch = false;
      try {
        const response = await serviciosService.getMaestroMaterialesExplosion(centro, fullCode, 1, 500);
        const rawData = response?.data?.data || response?.data || [];
        if (Array.isArray(rawData)) {
          rawData.forEach((row: any) => {
            const desc = String(row.DESCRIPCION_COMPONENTE || '').toUpperCase();
            const esEspuma = desc.includes(DESCRIPCION_ESPUMA);
            const esRollo = desc.includes(DESCRIPCION_ROLLO);
            if (!esEspuma && !esRollo) return;

            const compCode = cleanCode(row.COMPONENTE);
            if (!compCode) return;
            encontroMatch = true;
            const cantAcum = Number(row.CANTIDAD_ACUMULADA || row.CANTIDAD_UNITARIA || 0);
            const target = esRollo ? rollosMap : espumasMap;
            if (!target.has(compCode)) {
              target.set(compCode, { material: compCode, descripcion: desc, cantidad: 0 });
            }
            target.get(compCode)!.cantidad += qty * cantAcum;
          });
        }
        if (!encontroMatch) sinMatch.push(matCode);
      } catch (error) {
        console.warn(`Error explotando BOM para material ${matCode} (centro ${centro}):`, (error as Error).message);
        conError.push(matCode);
      }
      onStep();
    }
    return {
      espumas: Array.from(espumasMap.values()).sort((a, b) => a.material.localeCompare(b.material)),
      rollos: Array.from(rollosMap.values()).sort((a, b) => a.material.localeCompare(b.material)),
      sinMatch,
      conError,
    };
  };

  const handleCalcularNecesidadRollos = useCallback(async () => {
    if (selectedDates.length === 0) {
      addNotification('warning', 'Selecciona al menos una fecha (filtro "Fecha") antes de calcular la necesidad.');
      return;
    }
    setIsExplodingBom(true);
    setBomDiagnostico({ sinMatch: [], conError: [] });
    try {
      const uniqueMaterialCount = (orders: any[]) => new Set(orders.map(o => extractMaterialInfo(o).code).filter(Boolean)).size;
      const total = uniqueMaterialCount(fertC1000VentanaP2) + uniqueMaterialCount(fertC2000VentanaP2);
      let current = 0;
      setBomProgress({ current: 0, total });
      const onStep = () => setBomProgress({ current: ++current, total });

      const [n1000, n2000] = [
        await explodeNecesidadesFert('1000', fertC1000VentanaP2, onStep),
        await explodeNecesidadesFert('2000', fertC2000VentanaP2, onStep),
      ];
      setNecesidadEspumas1000(n1000.espumas);
      setNecesidadEspumas2000(n2000.espumas);
      setNecesidadRollos1000(n1000.rollos);
      setNecesidadRollos2000(n2000.rollos);

      const sinMatch = [...n1000.sinMatch, ...n2000.sinMatch];
      const conError = [...n1000.conError, ...n2000.conError];
      setBomDiagnostico({ sinMatch, conError });

      const incidencias = [
        sinMatch.length > 0 ? `${sinMatch.length} FERT sin Espuma/Rollo detectado en su BOM` : null,
        conError.length > 0 ? `${conError.length} FERT con error al consultar el BOM` : null,
      ].filter(Boolean).join(' · ');
      const nivel = sinMatch.length + conError.length > 0 ? 'warning' : 'success';
      addNotification(nivel, `Necesidad calculada (ventana ${ventanaP2.inicio} → ${ventanaP2.fin}) — Centro 1000: ${n1000.espumas.length} espumas / ${n1000.rollos.length} rollos. Centro 2000: ${n2000.espumas.length} espumas / ${n2000.rollos.length} rollos.${incidencias ? ` (${incidencias})` : ''}`);
    } catch (error) {
      addNotification('error', `Error al calcular la necesidad: ${(error as Error).message}`);
    } finally {
      setIsExplodingBom(false);
    }
  }, [fertC1000VentanaP2, fertC2000VentanaP2, ventanaP2, selectedDates, addNotification]);

  // Consulta inversa: antes de (re)generar un P2, revisa si ya existe uno activo para ese centro+tipo
  // y, de existir, si algún plan P3 (u otro consumidor) ya ejecutó contra él — un DetalleTactico
  // activo cuyo codigo_plan_grupo_padre apunte a ese P2 pero cuyo codigo_plan_grupo sea otro plan.
  // Si ya fue consumido, no se debe reemplazar en silencio (rompería la trazabilidad del P3 activo);
  // si no fue consumido, se desactiva (estado 'I') y se libera el paso para crear el nuevo.
  const verificarPlanP2Activo = async (centro: '1000' | '2000', tipo: 'ESPUMAS' | 'ROLLOS') => {
    const grupoCentro = grupos.find(g => String(g.centro).trim() === centro);
    if (!grupoCentro) return { grupoCentro: null as Grupo | null, planActivo: null as PlanGrupo | null, planesP3: [] as PlanGrupo[], detallesPlanActivo: [] as DetalleTactico[] };

    const valorRegex = new RegExp(`plan\\s*t[aá]ctico.*centro.*${centro}.*p2.*${tipo}`, 'i');
    const planesRes = await planGrupoService.getAll();
    const todosLosPlanes = planesRes.data || [];
    const planActivo = todosLosPlanes.find(pg =>
      pg.estado === 'A' && pg.codigo_grupo === grupoCentro.codigo_grupo && valorRegex.test(String(pg.valor || ''))
    ) || null;

    if (!planActivo) return { grupoCentro, planActivo: null, planesP3: [], detallesPlanActivo: [] as DetalleTactico[] };

    const detallesRes = await detalleTacticoService.getAll();
    const todosLosDetalles = detallesRes.data || [];
    const planPorCodigo = new Map(todosLosPlanes.map(pg => [pg.codigo_plan_grupo, pg]));
    const codigosP3 = new Set(
      todosLosDetalles
        .filter(d => d.estado === 'A' && d.codigo_plan_grupo_padre === planActivo.codigo_plan_grupo && d.codigo_plan_grupo !== planActivo.codigo_plan_grupo)
        .map(d => d.codigo_plan_grupo)
    );
    const planesP3 = Array.from(codigosP3)
      .map(c => planPorCodigo.get(c))
      .filter((p): p is PlanGrupo => !!p && p.estado === 'A');

    const detallesPlanActivo = todosLosDetalles.filter(d => d.estado === 'A' && d.codigo_plan_grupo === planActivo.codigo_plan_grupo);

    return { grupoCentro, planActivo, planesP3, detallesPlanActivo };
  };

  type ResultadoGeneracionP2 = {
    centro: '1000' | '2000';
    tipo: 'ESPUMAS' | 'ROLLOS';
    status: 'ok' | 'sin-datos' | 'bloqueado' | 'error';
    mensaje: string;
    codigoPlan?: number;
  };

  // Núcleo sin notificaciones: genera el PlanGrupo "origen" (P2) de un centro para UN tipo de
  // necesidad (Espumas o Rollos — son dos planes independientes, no uno combinado) y devuelve un
  // resultado estructurado por subgrupo (centro+tipo). Al ser el origen de la cadena (Venta Externa
  // no consume de nadie más), codigo_plan_grupo_padre se auto-referencia al propio plan recién creado.
  // Se reutiliza tanto para el botón individual como para "Generar Todos", que la llama 4 veces
  // (una por cada combinación centro×tipo) y consolida los 4 resultados en un solo resumen.
  const generarPlanP2Core = useCallback(async (centro: '1000' | '2000', tipo: 'ESPUMAS' | 'ROLLOS'): Promise<ResultadoGeneracionP2> => {
    const key = `${centro}-${tipo}`;
    const lineas = (tipo === 'ESPUMAS'
      ? (centro === '1000' ? necesidadEspumas1000 : necesidadEspumas2000)
      : (centro === '1000' ? necesidadRollos1000 : necesidadRollos2000)
    ).filter(l => l.cantidad > 0);

    if (lineas.length === 0) {
      return { centro, tipo, status: 'sin-datos', mensaje: `No hay necesidad de ${TIPO_TAG[tipo]} calculada para el Centro ${centro}.` };
    }

    setSavingPlanP2(prev => ({ ...prev, [key]: true }));
    try {
      const { grupoCentro, planActivo, planesP3, detallesPlanActivo } = await verificarPlanP2Activo(centro, tipo);
      if (!grupoCentro) {
        return { centro, tipo, status: 'error', mensaje: `No se encontró el grupo de Venta Externa para el Centro ${centro}.` };
      }
      if (planActivo && planesP3.length > 0) {
        return {
          centro, tipo, status: 'bloqueado',
          mensaje: `${TIPO_TAG[tipo]} Centro ${centro}: el Plan #${planActivo.codigo_plan_grupo} ya fue ejecutado por el/los Plan(es) P3 #${planesP3.map(p => p.codigo_plan_grupo).join(', #')}. Coordina con esa área antes de reemplazarlo.`,
        };
      }

      const user = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}') : {};
      const usuario = user?.name || 'admin';

      // La generación es diaria: si ya hay un Plan P2 activo (y ningún P3 lo consumió todavía), NO
      // se crea uno nuevo ni se toca el plan_grupo en sí (planGrupoService.save() sobre un plan
      // existente fue lo que dejó huérfanas las filas de detalle_tactico la vez anterior — el
      // backend no lo actualiza in-place). En vez de eso, se reconcilia por material contra el mismo
      // codigo_plan_grupo: actualiza cantidad si el material ya tenía línea, agrega línea nueva si es
      // un material que apareció recién.
      let codigoPlanGrupo: number;
      let esActualizacion = false;
      if (planActivo) {
        codigoPlanGrupo = planActivo.codigo_plan_grupo;
        esActualizacion = true;
      } else {
        const planPayload = {
          codigo_plan_grupo: 0,
          codigo_grupo: grupoCentro.codigo_grupo,
          codigo_familia_grupo: null,
          codigo_plan: null,
          valor: `Plan Táctico - Centro ${centro} - P2 - ${TIPO_TAG[tipo]}`,
          fecha_inicio_plan: ventanaP2.inicio,
          fecha_fin_plan: ventanaP2.fin,
          estado: 'A',
          usuario_creacion: usuario,
        };
        const planResponse = await planGrupoService.save(planPayload as unknown as PlanGrupo);
        codigoPlanGrupo = planResponse.data.codigo_plan_grupo;
      }

      const existentePorMaterial = new Map(detallesPlanActivo.map(d => [String(Number(d.codigo_material)), d]));

      let actualizados = 0;
      let agregados = 0;
      let fallidos = 0;
      for (const linea of lineas) {
        try {
          const existente = existentePorMaterial.get(String(Number(linea.material)));
          const detallePayload = {
            codigo_detalle_tactico: existente ? existente.codigo_detalle_tactico : 0,
            codigo_material: Number(linea.material),
            cantidad_produccion_neta: Math.round(linea.cantidad).toFixed(0),
            resp_ctrl_prod: '',
            clase_aprovisionamiento: 'E',
            cantidad_aprovisionamiento: 0,
            estado: 'A',
            codigo_plan_grupo: codigoPlanGrupo,
            // Sin auto-referencia: verificado contra datos reales (plan #36 "Forros" y 317/375
            // filas de detalle_tactico en producción) que codigo_plan_grupo_padre se deja vacío en
            // el plan ORIGEN — solo se llena en las líneas del plan CONSUMIDOR (P3) cuando de verdad
            // hereda de un origen rastreable.
            codigo_plan_grupo_padre: null,
            usuario_modificacion: usuario,
          };
          await detalleTacticoService.save(detallePayload as unknown as DetalleTactico);
          if (existente) actualizados++; else agregados++;
        } catch (error) {
          console.warn(`[Plan P2 ${tipo}] Falló material ${linea.material}:`, (error as Error).message);
          fallidos++;
        }
      }

      setPlanP2Generado(prev => ({ ...prev, [key]: codigoPlanGrupo }));
      const accion = esActualizacion ? `actualizado (${agregados} agregados, ${actualizados} refrescados)` : `creado (${agregados} materiales)`;
      if (fallidos === 0) {
        return { centro, tipo, status: 'ok', codigoPlan: codigoPlanGrupo, mensaje: `${TIPO_TAG[tipo]} Centro ${centro}: Plan #${codigoPlanGrupo} ${accion}.` };
      }
      return { centro, tipo, status: 'ok', codigoPlan: codigoPlanGrupo, mensaje: `${TIPO_TAG[tipo]} Centro ${centro}: Plan #${codigoPlanGrupo} ${accion}, ${fallidos} fallidos.` };
    } catch (error) {
      return { centro, tipo, status: 'error', mensaje: `${TIPO_TAG[tipo]} Centro ${centro}: error al guardar — ${(error as Error).message}` };
    } finally {
      setSavingPlanP2(prev => ({ ...prev, [key]: false }));
    }
  }, [grupos, necesidadEspumas1000, necesidadEspumas2000, necesidadRollos1000, necesidadRollos2000, ventanaP2]);

  // Botón individual por bloque: genera un solo subgrupo y notifica su resultado puntual.
  const handleGenerarPlanP2 = useCallback(async (centro: '1000' | '2000', tipo: 'ESPUMAS' | 'ROLLOS') => {
    const resultado = await generarPlanP2Core(centro, tipo);
    const nivel = resultado.status === 'ok' ? 'success' : resultado.status === 'sin-datos' ? 'warning' : 'error';
    addNotification(nivel, resultado.mensaje);
  }, [generarPlanP2Core, addNotification]);

  // Botón único "Generar Todos los P2": recorre los 3 subgrupos vigentes SECUENCIALMENTE (cada uno
  // hace su propia verificación P3 + guardado/actualización; correrlos en paralelo arriesgaría
  // condiciones de carrera sobre el mismo PlanGrupo activo), y consolida los resultados en un único
  // resumen — no dispara notificaciones sueltas. Rollos - Centro 2000 no aplica: no hay actividad de
  // Corte y Laminado en ese centro.
  const handleGenerarTodosPlanesP2 = useCallback(async () => {
    setIsSavingAllPlanP2(true);
    try {
      const combos: Array<{ centro: '1000' | '2000'; tipo: 'ESPUMAS' | 'ROLLOS' }> = [
        { centro: '1000', tipo: 'ESPUMAS' },
        { centro: '1000', tipo: 'ROLLOS' },
        { centro: '2000', tipo: 'ESPUMAS' },
      ];

      const resultados: ResultadoGeneracionP2[] = [];
      for (const combo of combos) {
        resultados.push(await generarPlanP2Core(combo.centro, combo.tipo));
      }

      const ok = resultados.filter(r => r.status === 'ok');
      const bloqueados = resultados.filter(r => r.status === 'bloqueado');
      const sinDatos = resultados.filter(r => r.status === 'sin-datos');
      const errores = resultados.filter(r => r.status === 'error');

      const resumen = resultados.map(r => `[${r.status.toUpperCase()}] ${r.mensaje}`).join(' | ');
      if (errores.length === 0 && bloqueados.length === 0) {
        addNotification('success', `Generación completa: ${ok.length} plan(es) guardado(s), ${sinDatos.length} sin datos. ${resumen}`);
      } else {
        addNotification('warning', `Generación con incidencias: ${ok.length} ok, ${bloqueados.length} bloqueado(s), ${sinDatos.length} sin datos, ${errores.length} error(es). ${resumen}`);
      }
    } finally {
      setIsSavingAllPlanP2(false);
    }
  }, [generarPlanP2Core, addNotification]);

  // "Data Aprobada": por cada P2 propio activo (Espumas/Rollos por centro), recupera qué respondió
  // el plan consumidor "P3" (nunca "PFD" — ver esPlanP3) — un DetalleTactico con
  // codigo_plan_grupo_padre = nuestro plan y el mismo codigo_material, pero perteneciente a OTRO
  // codigo_plan_grupo (el del P3). Si un material tiene más de una respuesta (varios P3), se suman
  // las cantidades y se listan los planes separados por coma. Se recalcula siempre contra la API (no
  // depende de haber corrido "Calcular Necesidad" en la misma sesión), así sigue funcionando después
  // de recargar la página.
  const fetchDataAprobada = useCallback(async () => {
    setIsLoadingDataAprobada(true);
    try {
      const [planesRes, detallesRes] = await Promise.all([planGrupoService.getAll(), detalleTacticoService.getAll()]);
      const planes = planesRes.data || [];
      const detalles = detallesRes.data || [];
      const planPorCodigo = new Map(planes.map(pg => [pg.codigo_plan_grupo, pg]));

      const descripcionPorMaterial = new Map<string, string>();
      [...necesidadEspumas1000, ...necesidadEspumas2000, ...necesidadRollos1000, ...necesidadRollos2000]
        .forEach(n => descripcionPorMaterial.set(n.material, n.descripcion));

      const combos: Array<{ centro: '1000' | '2000'; tipo: 'ESPUMAS' | 'ROLLOS' }> = [
        { centro: '1000', tipo: 'ESPUMAS' },
        { centro: '1000', tipo: 'ROLLOS' },
        { centro: '2000', tipo: 'ESPUMAS' },
      ];

      const resultado: Record<string, DataAprobadaRow[]> = {};

      for (const combo of combos) {
        const key = `${combo.centro}-${combo.tipo}`;
        const grupoCentro = grupos.find(g => String(g.centro).trim() === combo.centro);
        if (!grupoCentro) { resultado[key] = []; continue; }

        const valorRegex = new RegExp(`plan\\s*t[aá]ctico.*centro.*${combo.centro}.*p2.*${combo.tipo}`, 'i');
        const planPropio = planes.find(pg =>
          pg.estado === 'A' && pg.codigo_grupo === grupoCentro.codigo_grupo && valorRegex.test(String(pg.valor || ''))
        );
        if (!planPropio) { resultado[key] = []; continue; }

        const misLineas = detalles.filter(d => d.estado === 'A' && d.codigo_plan_grupo === planPropio.codigo_plan_grupo);
        resultado[key] = misLineas.map(linea => {
          const respuestas = detalles.filter(d =>
            d.estado === 'A' &&
            d.codigo_plan_grupo_padre === planPropio.codigo_plan_grupo &&
            d.codigo_material === linea.codigo_material &&
            d.codigo_plan_grupo !== planPropio.codigo_plan_grupo &&
            esPlanP3(planPorCodigo.get(d.codigo_plan_grupo)?.valor)
          );
          const respuestaCant = respuestas.reduce((s, r) => s + parseQty(r.cantidad_produccion_neta), 0);
          const codigosPlanesRespuesta = Array.from(new Set(respuestas.map(r => r.codigo_plan_grupo)));
          const planGrupo = codigosPlanesRespuesta.length > 0
            ? codigosPlanesRespuesta.map(c => String(c).padStart(3, '0')).join(', ')
            : '—';

          // Contraste de fechas: se compara por LÍNEA (fecha_modificacion de DetalleTactico, que fija
          // el backend al guardar — no lo controla el cliente), no por rango de PlanGrupo. Laminado
          // ahora fuerza fecha_inicio_plan/fecha_fin_plan del P3 siempre a "hoy+1" al guardar (dejó de
          // representar un período de producción), así que ya no es comparable contra el rango del P2.
          // Regla de negocio: "revisión hoy, devolución mañana" — la respuesta debe haberse guardado
          // EXACTAMENTE un día después de la última vez que se guardó/refrescó nuestra línea del P2.
          let fechasOk: boolean | null = null;
          const fechaLineaP2 = soloFecha(linea.fecha_modificacion);
          if (respuestas.length > 0) {
            fechasOk = !!fechaLineaP2 && respuestas.every(r => {
              const fechaLineaP3 = soloFecha(r.fecha_modificacion);
              if (!fechaLineaP3) return false;
              const fechaEsperada = format(addDays(parseISO(fechaLineaP2), 1), 'yyyy-MM-dd');
              return fechaLineaP3 === fechaEsperada;
            });
          }

          return {
            material: String(linea.codigo_material),
            descripcion: descripcionPorMaterial.get(String(linea.codigo_material)) || '—',
            cantidad: parseQty(linea.cantidad_produccion_neta),
            respuestaCant,
            planGrupo,
            fechasOk,
          };
        }).sort((a, b) => a.material.localeCompare(b.material));
      }

      setDataAprobada(resultado);
    } catch (error) {
      addNotification('error', `Error al recuperar Data Aprobada: ${(error as Error).message}`);
    } finally {
      setIsLoadingDataAprobada(false);
    }
  }, [grupos, necesidadEspumas1000, necesidadEspumas2000, necesidadRollos1000, necesidadRollos2000, addNotification]);

  const calculateSummary = (data: any[], centroId: string) => {
    const map = new Map<string, { centro: string; maquina: string; categoria: string; densidad: string; espesor: string; tipo: string; totalOrdenes: number; totalCantidad: number; totalTiempoEmpaque: number }>();
    data.forEach(o => {
      const categoria = String(o.CATEGORIA || o.Categoria || o.categoria || '').trim();
      if (!categoria || categoria === 'N/A') return;

      const maquina = String(o.MAQUINA || o.Maquina || o.maquina || o.RECURSO || 'SIN MÁQUINA').trim();
      const info = extractMaterialInfo(o);
      const espesor = info.esp || '—';
      const tipo = info.tipo || '—';
      const densidad = info.dens || '—';
      const key = `${maquina}|${categoria}|${espesor}|${tipo}`;

      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      // Cálculo: Unidades * Tiempo de Empaque (15s) convertido a horas
      const empaqueHours = (qty * PACKING_TIME_PER_UNIT_SECONDS) / 3600;

      if (!map.has(key)) {
        map.set(key, { centro: centroId, maquina, categoria, densidad, espesor, tipo, totalOrdenes: 0, totalCantidad: 0, totalTiempoEmpaque: 0 });
      }
      const entry = map.get(key)!;
      entry.totalOrdenes += 1;
      entry.totalCantidad += qty;
      entry.totalTiempoEmpaque += empaqueHours;
    });
    return Array.from(map.values()).sort((a, b) =>
      a.maquina.localeCompare(b.maquina) || a.categoria.localeCompare(b.categoria) || a.espesor.localeCompare(b.espesor)
    );
  };

  const summaryData1000 = useMemo(() => calculateSummary(fertC1000, '1000'), [fertC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(fertC2000, '2000'), [fertC2000]);

  // Agrupación por Categoría Técnica (la categoría ya embebe la densidad, p.ej. D40ESP)
  const groupByCategoria = (data: typeof summaryData1000) => {
    const map = new Map<string, { categoria: string; densidad: string; tipo: string; rows: typeof summaryData1000; totalOrdenes: number; totalCantidad: number; totalTiempoEmpaque: number }>();
    data.forEach(row => {
      if (!map.has(row.categoria)) {
        map.set(row.categoria, { categoria: row.categoria, densidad: row.densidad, tipo: row.tipo, rows: [], totalOrdenes: 0, totalCantidad: 0, totalTiempoEmpaque: 0 });
      }
      const group = map.get(row.categoria)!;
      group.rows.push(row);
      group.totalOrdenes += row.totalOrdenes;
      group.totalCantidad += row.totalCantidad;
      group.totalTiempoEmpaque += row.totalTiempoEmpaque;
    });
    return Array.from(map.values()).sort((a, b) => a.categoria.localeCompare(b.categoria));
  };

  const groupedSummary1000 = useMemo(() => groupByCategoria(summaryData1000), [summaryData1000]);
  const groupedSummary2000 = useMemo(() => groupByCategoria(summaryData2000), [summaryData2000]);

  // Totales globales para el dashboard superior
  const globalStats = useMemo(() => {
    const all = [...summaryData1000, ...summaryData2000];
    return {
      ordenes: all.reduce((sum, r) => sum + r.totalOrdenes, 0),
      unidades: all.reduce((sum, r) => sum + r.totalCantidad, 0),
      horasEmpaque: all.reduce((sum, r) => sum + r.totalTiempoEmpaque, 0)
    };
  }, [summaryData1000, summaryData2000]);

  // Popover del filtro "Fecha" — se usa tanto en Resumen (filtro de vista) como en Plan P2 (ahora
  // también controla la ventana de generación del P2, ver ventanaP2), para no obligar al usuario a
  // cambiar de tab para ajustar la selección.
  const fechaPopover = (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-10 px-6 rounded-2xl border-gray-200 hover:bg-white hover:border-primary/50 gap-2 font-bold text-xs uppercase transition-all shadow-sm">
          <Filter className="w-4 h-4" /> Fecha{selectedDates.length > 0 ? ` (${selectedDates.length})` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
        <div className="bg-white p-4 font-sans">
          <div className="flex items-center justify-between mb-4 text-left">
            <h3 className="text-xs font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
            <div className="flex gap-1 bg-gray-50 rounded-xl p-1">
              <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-7 w-7 hover:bg-white hover:shadow-sm"><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-7 w-7 hover:bg-white hover:shadow-sm"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
          <p className="text-[9px] font-bold text-gray-300 uppercase tracking-widest mb-2">Toca varias fechas para combinarlas</p>
          <div className="grid grid-cols-7 gap-y-1 text-center mb-3">
            {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((day, idx) => <div key={`cal-head-${idx}`} className="text-[9px] font-bold text-gray-300 uppercase py-1">{day}</div>)}
            {calendarDays.map((day, idx) => {
              if (!day) return <div key={`cal-pad-${idx}`} className="p-1" />;
              const dateStr = format(day, 'yyyy-MM-dd');
              const isSelected = selectedDates.includes(dateStr);
              return (
                <button key={dateStr} onClick={() => toggleSelectedDate(dateStr)} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                  <span className={cn("text-xs font-bold", !datesWithOrders.has(dateStr) && !isSelected ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                  {datesWithOrders.has(dateStr) && !isSelected && <div className="absolute bottom-1.5 w-1 h-1 bg-primary/40 rounded-full" />}
                </button>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-primary h-8 mt-1 rounded-xl hover:bg-primary/5 tracking-widest" onClick={() => setSelectedDates([])}>Ver Todo</Button>
        </div>
      </PopoverContent>
    </Popover>
  );

  if (!mounted) return null;

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center p-20 gap-4">
      <Loader2 className="w-10 h-10 animate-spin text-primary" />
      <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando Venta Externa...</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-green-600/10 rounded-xl"><ShoppingCart className="w-6 h-6 text-green-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Venta Externa</h2>
            <p className="text-xs text-gray-500 font-medium">Control de Órdenes FERT y Programación Técnica</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[
            { v: 'resumen', l: 'Resumen', i: LayoutDashboard },
            { v: 'ordenes', l: 'Provisionales', i: Package },
            { v: 'ordenesFert', l: 'FERT', i: ShoppingCart },
            { v: 'planP2', l: 'Plan P2', i: Layers },
            { v: 'dataAprobada', l: 'Data Aprobada', i: ClipboardCheck }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
          {/* Header con Filtro de Fechas (multi-selección) */}
          <div className="flex justify-between items-center bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-primary/10 rounded-xl"><CalendarIcon className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Carga Operativa</p>
                <h3 className="text-sm font-black text-gray-700 uppercase">
                  {selectedDates.length === 0
                    ? 'PLAN MAESTRO CONSOLIDADO'
                    : selectedDates.length === 1
                      ? format(parseISO(selectedDates[0]), 'EEEE, d MMMM yyyy', { locale: es })
                      : `${selectedDates.length} FECHAS SELECCIONADAS`}
                </h3>
                {selectedDates.length > 1 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {[...selectedDates].sort().map(d => (
                      <Badge key={d} variant="outline" className="text-[9px] font-mono gap-1 pr-1 border-primary/20 text-primary bg-primary/5">
                        {format(parseISO(d), 'd MMM', { locale: es })}
                        <button onClick={() => toggleSelectedDate(d)} className="hover:bg-primary/10 rounded-full p-0.5"><X className="w-2.5 h-2.5" /></button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {fechaPopover}
          </div>

          {/* Estadísticas de Carga - Dashboard Superior */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="p-4 border-none shadow-sm bg-blue-50/30 flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-600"><TrendingUp className="w-5 h-5" /></div>
              <div>
                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Total Órdenes</p>
                <p className="text-xl font-black text-gray-800">{globalStats.ordenes}</p>
              </div>
            </Card>
            <Card className="p-4 border-none shadow-sm bg-green-50/30 flex items-center gap-4">
              <div className="p-3 bg-green-500/10 rounded-2xl text-green-600"><Package className="w-5 h-5" /></div>
              <div>
                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Total Unidades</p>
                <p className="text-xl font-black text-gray-800">{globalStats.unidades.toLocaleString()}</p>
              </div>
            </Card>
            <Card className="p-4 border-none shadow-sm bg-amber-50/30 flex items-center gap-4">
              <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-600"><Box className="w-5 h-5" /></div>
              <div>
                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Horas Totales Empaque</p>
                <p className="text-xl font-black text-gray-800">{globalStats.horasEmpaque.toFixed(1)}h</p>
              </div>
            </Card>
          </div>

          {[ 
            { t: 'Planta 1000 - Quito', d: groupedSummary1000, c: 'text-green-700', b: 'bg-green-600', expanded: expandedCategorias1000, setExpanded: setExpandedCategorias1000 },
            { t: 'Planta 2000 - Guayaquil', d: groupedSummary2000, c: 'text-indigo-700', b: 'bg-indigo-600', expanded: expandedCategorias2000, setExpanded: setExpandedCategorias2000 }
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h3 className={cn("text-[11px] font-black uppercase flex items-center gap-2 tracking-widest", center.c)}>
                  <div className={cn("w-2.5 h-2.5 rounded-full", center.b)} /> {center.t}
                </h3>
                <Badge variant="outline" className="text-[9px] font-bold border-gray-200 text-gray-400">{center.d.length} Categorías identificadas</Badge>
              </div>
              <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                {center.d.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 font-bold uppercase tracking-widest opacity-30">Sin operaciones programadas</div>
                ) : (
                  <div className="max-h-[600px] overflow-y-auto px-4">
                    <Accordion type="multiple" value={center.expanded} onValueChange={center.setExpanded} className="divide-y divide-gray-50">
                      {center.d.map(group => (
                        <AccordionItem key={group.categoria} value={group.categoria} className="border-b-0">
                          <AccordionTrigger className="hover:no-underline py-3 px-2">
                            <div className="flex items-center justify-between w-full pr-4 text-left">
                              <div className="flex items-center gap-3">
                                <Badge className="bg-blue-50 text-blue-800 font-bold text-[9px] uppercase border-blue-200">D{group.densidad}</Badge>
                                <div>
                                  <p className="text-xs font-black text-gray-700 uppercase">{group.categoria}</p>
                                  <p className="text-[9px] font-bold text-gray-400 uppercase">{group.tipo} · {group.rows.length} variante(s)</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-6 text-right">
                                <div>
                                  <p className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Órdenes</p>
                                  <p className="text-xs font-mono font-bold text-gray-600">{group.totalOrdenes}</p>
                                </div>
                                <div>
                                  <p className="text-[8px] font-black uppercase text-gray-400 tracking-wider">Unidades</p>
                                  <p className="text-xs font-mono font-black text-gray-900">{group.totalCantidad.toLocaleString()}</p>
                                </div>
                                <div>
                                  <p className="text-[8px] font-black uppercase text-amber-500 tracking-wider">T. Empaque (H)</p>
                                  <p className="text-xs font-mono font-black text-amber-600">{group.totalTiempoEmpaque.toFixed(2)}</p>
                                </div>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <table className="w-full border-collapse text-center font-sans bg-gray-50/40 rounded-xl overflow-hidden">
                              <thead className="bg-gray-50 text-[9px] font-black uppercase text-gray-400 border-b border-gray-100">
                                <tr>
                                  <th className="px-4 py-2 border-r border-gray-100 text-left">Máquina / Recurso</th>
                                  <th className="px-3 py-2 border-r border-gray-100 text-primary">Tipo</th>
                                  <th className="px-3 py-2 border-r border-gray-100 bg-blue-50/50 text-blue-800">Espesor</th>
                                  <th className="px-3 py-2 border-r border-gray-100">Órdenes</th>
                                  <th className="px-3 py-2 border-r border-gray-100 font-black">Unidades</th>
                                  <th className="px-4 py-2 text-center text-amber-700 bg-amber-50/30">Tiempo PL Empaque (H)</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-50 text-[11px]">
                                {group.rows.map((row, i) => (
                                  <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                    <td className="px-4 py-2 font-black text-gray-700 border-r border-gray-100 uppercase text-left">{row.maquina}</td>
                                    <td className="px-3 py-2 font-black text-primary border-r border-gray-100 uppercase">{row.tipo}</td>
                                    <td className="px-3 py-2 font-black text-blue-700 border-r border-gray-100 bg-blue-50/5">{row.espesor}</td>
                                    <td className="px-3 py-2 font-mono border-r border-gray-100 text-gray-400">{row.totalOrdenes}</td>
                                    <td className="px-3 py-2 font-mono font-black text-gray-900 border-r border-gray-100">{row.totalCantidad.toLocaleString()}</td>
                                    <td className="px-4 py-2 font-mono font-black text-amber-600 text-center bg-amber-50/5">{row.totalTiempoEmpaque.toFixed(2)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                )}
                {center.d.length > 0 && (
                  <div className="bg-gray-100 text-gray-800 font-black text-[10px] uppercase border-t-2 border-gray-200 px-6 py-3 flex items-center justify-between">
                    <span className="tracking-widest">Total {center.t}</span>
                    <div className="flex items-center gap-8 font-mono">
                      <span>{center.d.reduce((s, r) => s + r.totalOrdenes, 0)} órdenes</span>
                      <span className="text-green-600">{center.d.reduce((s, r) => s + r.totalCantidad, 0).toLocaleString()} unid.</span>
                      <span className="text-amber-600">{center.d.reduce((s, r) => s + r.totalTiempoEmpaque, 0).toFixed(1)}h empaque</span>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-8 animate-in fade-in duration-300">
          {[
            { t: 'Quito 1000 - Órdenes Provisionales', d: provC1000, b: 'bg-green-600', c: 'text-green-700', lookup: tiempoLookup1000 },
            { t: 'Guayaquil 2000 - Órdenes Provisionales', d: provC2000, b: 'bg-indigo-600', c: 'text-indigo-700', lookup: tiempoLookup2000 }
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1", center.c)}>
                <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t} ({center.d.length} registros)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[450px]">
                  <table className="w-full border-collapse text-center">
                    <thead className="bg-gray-50 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/20 text-blue-900">Categoría</th>
                        <th className="px-2 py-4 border-r border-gray-100">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-teal-700 bg-teal-50/20 font-black">T. Estándar (Min)</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-amber-700 bg-amber-50/20 font-black">T. Empaque (H)</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-bold">Máquina</th>
                        <th className="px-3 py-4">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[10px]">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                        const empaqueHours = (qty * PACKING_TIME_PER_UNIT_SECONDS) / 3600;
                        const maquina = o.MAQUINA || o.Maquina || o.RECURSO || '—';
                        const tiempoEstandar = matchTiempoEstandar(info.code, maquina, center.lookup);

                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-100 tracking-tighter">{info.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[180px] text-gray-500 uppercase">{info.desc}</td>
                            <td className="px-3 py-2 text-blue-800 border-r border-gray-100 bg-blue-50/5 uppercase font-bold">{String(o.CATEGORIA || '—')}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.dens}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.ancho}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.largo}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.esp}</td>
                            <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-100 font-mono">{qty}</td>
                            <td className="px-3 py-2 font-mono font-bold text-teal-600 border-r border-gray-100 bg-teal-50/10">{tiempoEstandar !== null ? tiempoEstandar.toFixed(4) : '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-amber-600 border-r border-gray-100 bg-amber-50/10">{empaqueHours.toFixed(2)}</td>
                            <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-100 uppercase">{maquina}</td>
                            <td className="px-3 py-2 font-medium text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="ordenesFert" className="space-y-8 animate-in fade-in duration-300">
          {[
            { t: 'Quito 1000 - Órdenes FERT', d: fertC1000, b: 'bg-green-600', c: 'text-green-700', lookup: tiempoLookup1000 },
            { t: 'Guayaquil 2000 - Órdenes FERT', d: fertC2000, b: 'bg-indigo-600', c: 'text-indigo-700', lookup: tiempoLookup2000 }
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1", center.c)}>
                <div className={cn("w-2 h-2 rounded-full", center.b)} /> {center.t} ({center.d.length} registros)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[450px]">
                  <table className="w-full border-collapse text-center font-sans">
                    <thead className="bg-gray-50 sticky top-0 z-10 text-[9px] font-bold uppercase text-gray-400 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                        <th className="px-3 py-4 border-r border-gray-100 bg-blue-50/20 text-blue-900 font-black">Categoría</th>
                        <th className="px-2 py-4 border-r border-gray-100">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-100">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-100">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-100">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-teal-700 bg-teal-50/20 font-black">T. Estándar (Min)</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-amber-700 bg-amber-50/20 font-black">T. Empaque (H)</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-bold">Máquina</th>
                        <th className="px-3 py-4">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 text-[10px]">
                      {center.d.map((o, i) => {
                        const info = extractMaterialInfo(o);
                        const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                        const empaqueHours = (qty * PACKING_TIME_PER_UNIT_SECONDS) / 3600;
                        const maquina = o.MAQUINA || o.RECURSO || '—';
                        const tiempoEstandar = matchTiempoEstandar(info.code, maquina, center.lookup);

                        return (
                          <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-100">{o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHA || '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-100 tracking-tighter">{info.code}</td>
                            <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[180px] text-gray-500 uppercase">{info.desc}</td>
                            <td className="px-3 py-2 text-blue-800 border-r border-gray-100 bg-blue-50/5 uppercase font-black">{String(o.CATEGORIA || '—')}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.dens}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.ancho}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.largo}</td>
                            <td className="px-2 py-2 font-mono border-r border-gray-50">{info.esp}</td>
                            <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-100 font-mono">{qty}</td>
                            <td className="px-3 py-2 font-mono font-bold text-teal-600 border-r border-gray-100 bg-teal-50/10">{tiempoEstandar !== null ? tiempoEstandar.toFixed(4) : '—'}</td>
                            <td className="px-3 py-2 font-mono font-bold text-amber-600 border-r border-gray-100 bg-amber-50/10">{empaqueHours.toFixed(2)}</td>
                            <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-50 uppercase">{maquina}</td>
                            <td className="px-3 py-2 font-medium text-gray-400">{o.ALMACEN || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="planP2" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col gap-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="text-left">
                <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Necesidad Origen (P2)</p>
                <h3 className="text-sm font-black text-gray-700 uppercase">Espumas + Rollos (BOM de Órdenes FERT)</h3>
                <p className="text-[10px] text-gray-400 mt-1">Ambas necesidades se calculan explotando la lista de materiales de las Órdenes FERT generadas (Provisionales no aplica para este paso): componentes &quot;ESPUMA&quot; → Corte Espuma, &quot;LAMINA CILINDRICA&quot; → Corte y Laminado.</p>
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {selectedDates.length === 0 ? (
                    <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[9px] font-black uppercase gap-1.5">
                      <CalendarIcon className="w-3 h-3" /> Selecciona al menos 1 fecha para calcular la necesidad
                    </Badge>
                  ) : (
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[9px] font-black uppercase gap-1.5">
                      <CalendarIcon className="w-3 h-3" /> Ventana de Producción: {format(parseISO(ventanaP2.inicio), 'd MMM', { locale: es })} → {format(parseISO(ventanaP2.fin), 'd MMM yyyy', { locale: es })}
                    </Badge>
                  )}
                  <span className="text-[9px] text-gray-400 font-bold uppercase">Definida por el filtro &quot;Fecha&quot; (máx. {MAX_DIAS_SELECCION} días, sin saltos entre el mínimo y el máximo seleccionado)</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {fechaPopover}
                <Button onClick={handleCalcularNecesidadRollos} disabled={isExplodingBom || selectedDates.length === 0} className="h-10 px-6 rounded-2xl gap-2 font-bold text-xs uppercase">
                  {isExplodingBom ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                  {isExplodingBom ? `Explotando BOM ${bomProgress.current}/${bomProgress.total}` : 'Calcular Necesidad (BOM FERT)'}
                </Button>
                <Button
                  onClick={handleGenerarTodosPlanesP2}
                  disabled={isSavingAllPlanP2 || isExplodingBom || (necesidadEspumas1000.length === 0 && necesidadEspumas2000.length === 0 && necesidadRollos1000.length === 0)}
                  variant="outline"
                  className="h-10 px-6 rounded-2xl gap-2 font-bold text-xs uppercase border-primary/30 text-primary hover:bg-primary/5"
                >
                  {isSavingAllPlanP2 ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Generar Todos los P2
                </Button>
              </div>
            </div>
            {isExplodingBom && (
              <div className="space-y-1.5">
                <Progress value={bomProgress.total > 0 ? (bomProgress.current / bomProgress.total) * 100 : 0} className="h-2" />
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-widest text-right">{bomProgress.current} / {bomProgress.total} materiales explotados</p>
              </div>
            )}
            {!isExplodingBom && (bomDiagnostico.sinMatch.length > 0 || bomDiagnostico.conError.length > 0) && (
              <div className="space-y-1.5 bg-amber-50/60 border border-amber-200 rounded-xl px-3 py-2">
                {bomDiagnostico.sinMatch.length > 0 && (
                  <p className="text-[9px] text-amber-800">
                    <span className="font-black uppercase tracking-wider">{bomDiagnostico.sinMatch.length} FERT sin Espuma/Rollo en su BOM</span> — se consultó su explosión de materiales pero ninguna fila (de cualquier nivel) coincidió con &quot;ESPUMA&quot;/&quot;LAMINA CILINDRICA&quot;: <span className="font-mono">{bomDiagnostico.sinMatch.join(', ')}</span>
                  </p>
                )}
                {bomDiagnostico.conError.length > 0 && (
                  <p className="text-[9px] text-red-700">
                    <span className="font-black uppercase tracking-wider">{bomDiagnostico.conError.length} FERT con error al consultar el BOM</span> — revisa la consola del navegador para el detalle: <span className="font-mono">{bomDiagnostico.conError.join(', ')}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {[
            { t: 'Centro 1000 - Quito', centro: '1000' as const, c: 'text-green-700', b: 'bg-green-600' },
            { t: 'Centro 2000 - Guayaquil', centro: '2000' as const, c: 'text-indigo-700', b: 'bg-indigo-600' }
          ].map((center) => (
            <div key={center.centro} className="space-y-4">
              <h3 className={cn("text-[11px] font-black uppercase flex items-center gap-2 tracking-widest px-1", center.c)}>
                <div className={cn("w-2.5 h-2.5 rounded-full", center.b)} /> {center.t}
              </h3>

              <div className={cn("grid grid-cols-1 gap-4", center.centro === '1000' && "lg:grid-cols-2")}>
                {[
                  { tipo: 'ESPUMAS' as const, label: 'Necesidad Espumas Venta Externa', rows: center.centro === '1000' ? necesidadEspumas1000 : necesidadEspumas2000, accent: 'text-teal-600', bg: 'bg-teal-50/30' },
                  // Rollos (Corte y Laminado) solo existe en Centro 1000 — no hay actividad/pedidos
                  // de ese material en Centro 2000, por eso se suprime ese espacio.
                  ...(center.centro === '1000' ? [{ tipo: 'ROLLOS' as const, label: 'Necesidad Rollos Venta Externa', rows: necesidadRollos1000, accent: 'text-amber-600', bg: 'bg-amber-50/30' }] : [])
                ].map((block, bIdx) => {
                  const key = `${center.centro}-${block.tipo}`;
                  return (
                    <Card key={bIdx} className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white flex flex-col">
                      <div className={cn("px-4 py-2.5 flex items-center justify-between gap-2 border-b border-gray-100", block.bg)}>
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">{block.label} ({block.rows.length})</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {planP2Generado[key] && (
                            <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[8px] font-bold uppercase">Plan #{planP2Generado[key]}</Badge>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleGenerarPlanP2(center.centro, block.tipo)}
                            disabled={block.rows.length === 0 || !!savingPlanP2[key]}
                            className="h-7 px-3 rounded-lg gap-1.5 font-bold text-[9px] uppercase"
                          >
                            {savingPlanP2[key] ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            Generar P2
                          </Button>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-[350px]">
                        <table className="w-full border-collapse text-center">
                          <thead className="bg-gray-50 sticky top-0 text-[9px] font-bold uppercase text-gray-400">
                            <tr>
                              <th className="px-3 py-3 border-r border-gray-100">Material</th>
                              <th className="px-3 py-3 border-r border-gray-100 text-left">Descripción</th>
                              <th className="px-3 py-3">Cantidad</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50 text-[10px]">
                            {block.rows.length === 0 ? (
                              <tr><td colSpan={3} className="py-10 text-center text-gray-300 font-bold uppercase tracking-widest">Sin datos</td></tr>
                            ) : (
                              block.rows.map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50/50">
                                  <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-50">{row.material}</td>
                                  <td className="px-3 py-2 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[220px]">{row.descripcion}</td>
                                  <td className={cn("px-3 py-2 font-mono font-black", block.accent)}>{row.cantidad.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="dataAprobada" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
            <div className="text-left">
              <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Recepción de Datos (P3)</p>
              <h3 className="text-sm font-black text-gray-700 uppercase">Respuesta del Plan Consumidor</h3>
              <p className="text-[10px] text-gray-400 mt-1">Por cada material que enviamos en nuestro P2, busca si algún Plan P3 (consumidor real, no PFD) ya respondió — un DetalleTactico cuyo <span className="font-mono">codigo_plan_grupo_padre</span> apunta a nuestro plan. La columna "Fechas" avisa si esa respuesta NO se guardó exactamente un día después de nuestra línea (regla "revisión hoy, devolución mañana").</p>
            </div>
            <Button onClick={fetchDataAprobada} disabled={isLoadingDataAprobada} className="h-10 px-6 rounded-2xl gap-2 font-bold text-xs uppercase shrink-0">
              {isLoadingDataAprobada ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Actualizar
            </Button>
          </div>

          {[
            { key: '1000-ESPUMAS', t: 'Centro 1000 · P2 Espumas', c: 'text-teal-700', b: 'bg-teal-600' },
            { key: '1000-ROLLOS', t: 'Centro 1000 · P2 Rollos', c: 'text-amber-700', b: 'bg-amber-600' },
            { key: '2000-ESPUMAS', t: 'Centro 2000 · P2 Espumas', c: 'text-teal-700', b: 'bg-teal-600' }
          ].map((block) => {
            const rows = dataAprobada[block.key] || [];
            return (
              <div key={block.key} className="space-y-3">
                <h3 className={cn("text-[11px] font-black uppercase flex items-center gap-2 tracking-widest px-1", block.c)}>
                  <div className={cn("w-2.5 h-2.5 rounded-full", block.b)} /> {block.t} ({rows.length})
                </h3>
                <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full border-collapse text-center">
                      <thead className="bg-gray-50 sticky top-0 text-[9px] font-bold uppercase text-gray-400">
                        <tr>
                          <th className="px-3 py-3 border-r border-gray-100">Material</th>
                          <th className="px-3 py-3 border-r border-gray-100 text-left">Descripción</th>
                          <th className="px-3 py-3 border-r border-gray-100">Cantidad</th>
                          <th className="px-3 py-3 border-r border-gray-100">Respuesta Cant.</th>
                          <th className="px-3 py-3 border-r border-gray-100">Plan Grupo</th>
                          <th className="px-3 py-3 border-r border-gray-100">Fechas</th>
                          <th className="px-3 py-3">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[10px]">
                        {rows.length === 0 ? (
                          <tr><td colSpan={7} className="py-10 text-center text-gray-300 font-bold uppercase tracking-widest">Sin plan P2 activo o sin materiales</td></tr>
                        ) : (
                          rows.map((row, i) => {
                            const estado = row.respuestaCant <= 0 ? 'pendiente' : row.respuestaCant >= row.cantidad ? 'completo' : 'parcial';
                            return (
                              <tr key={i} className="hover:bg-gray-50/50">
                                <td className="px-3 py-2 font-mono font-bold text-primary border-r border-gray-50">{row.material}</td>
                                <td className="px-3 py-2 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[220px]">{row.descripcion}</td>
                                <td className="px-3 py-2 font-mono font-black text-gray-900 border-r border-gray-50">{row.cantidad.toLocaleString()}</td>
                                <td className="px-3 py-2 font-mono font-black text-indigo-700 border-r border-gray-50">{row.respuestaCant.toLocaleString()}</td>
                                <td className="px-3 py-2 font-mono text-gray-500 border-r border-gray-50">{row.planGrupo}</td>
                                <td className="px-3 py-2 border-r border-gray-50">
                                  {row.fechasOk === null ? (
                                    <span className="text-gray-300">—</span>
                                  ) : (
                                    <Badge className={cn(
                                      "text-[8px] font-bold uppercase border",
                                      row.fechasOk ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"
                                    )}>
                                      {row.fechasOk ? 'Coinciden' : 'Distintas'}
                                    </Badge>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge className={cn(
                                    "text-[8px] font-bold uppercase border",
                                    estado === 'completo' && "bg-emerald-50 text-emerald-700 border-emerald-200",
                                    estado === 'parcial' && "bg-amber-50 text-amber-700 border-amber-200",
                                    estado === 'pendiente' && "bg-gray-50 text-gray-400 border-gray-200"
                                  )}>
                                    {estado}
                                  </Badge>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            );
          })}
        </TabsContent>
      </Tabs>
    </div>
  );
};
