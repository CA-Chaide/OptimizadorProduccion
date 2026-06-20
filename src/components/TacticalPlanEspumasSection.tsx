
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Wind, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Activity,
  Wrench,
  GraduationCap,
  RefreshCw,
  ShoppingCart,
  Box,
  MapPin,
  FileSpreadsheet,
  Download,
  PlayCircle,
  Database,
  Info,
  Minus,
  Plus
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from '@/components/ui/badge';
import { Progress } from "@/components/ui/progress";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import { logger } from '@/services/LogService';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * --- CONSTANTES DE INGENIERÍA PLANTA ESPUMAS v3.8 ---
 */
const CARRUSEL_DIAMETER_CM = 320;
const CIRCUMFERENCE = Math.PI * CARRUSEL_DIAMETER_CM;
const MANIPULATION_FACTOR = 1.05; 
const EFFECTIVE_GAP_CM = 30 * MANIPULATION_FACTOR; 
const MAX_STACK_HEIGHT_CM = 200; 
const SECONDS_PER_LOAD_VUELTA = 300; 
const SECONDS_PER_MANEUVER_DESC = 45; 
const PARO_PROG_T1 = 1.27;
const PARO_PROG_T2 = 0.77;

const CAPACIDAD_CONFIG_BASE = {
  '1000': [
    { code: 'CR04', name: 'Carrusel 4 FECKEN', t1: 12, t2: 10, rendimiento: 0.90 },
    { code: 'CR03', name: 'Carrusel 3 SCHMUZIG ER C-700', t1: 12, t2: 10, rendimiento: 0.90 },
    { code: 'CR01', name: 'Carrusel 1 SCHMUZIGER', t1: 6.6, t2: 10, rendimiento: 0.90 },
    { code: 'CNC01', name: 'Cortadora CNC GIOTTO X #1', t1: 9, t2: 10, rendimiento: 0.90 },
  ],
  '2000': [
    { code: 'CR02', name: 'Fema', t1: 10, t2: 0, rendimiento: 0.70 },
    { code: 'CR01', name: 'Carrusel 1 SCHMUZIGER', t1: 10, t2: 0, rendimiento: 0.70 },
    { code: 'LA02', name: 'Repotenciado', t1: 10, t2: 0, rendimiento: 0.70 },
  ]
};

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const parseSAPDate = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  if (!str || str === 'null' || str === 'undefined') return null;
  const isoDate = new Date(str);
  return isNaN(isoDate.getTime()) ? null : isoDate;
};

const calculateMTTOCapacity = (start: string, end: string): string => {
  const s = parseSAPDate(start);
  const e = parseSAPDate(end);
  if (!s || !e) return '0.0';
  const diffHrs = (e.getTime() - s.getTime()) / (1000 * 60 * 60);
  return Math.max(0, diffHrs).toFixed(1);
};

const parseDimensionsEnhanced = (desc: string) => {
  const d = String(desc || '').toUpperCase();
  const densMatch = d.match(/D(\d+)/);
  const densidad = densMatch ? densMatch[1] : '—';

  if (d.includes('CV')) {
    return { densidad, distancia: 60, altura: 206, espesor: 3.5 };
  }

  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
  const alturaOriginal = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const espesor = dimMatch ? parseFloat(dimMatch[2]) : 0;
  
  let alturaFinal = alturaOriginal;
  if (alturaOriginal === 204 && espesor <= 1.2) alturaFinal = 206;
  
  let distancia = 100; 
  if (espesor === 1.0) distancia = 110;
  else if (espesor === 3.5) distancia = 60;
  else if (espesor === 1.2) distancia = 100;
  
  return { densidad, distancia, altura: alturaFinal, espesor };
};

const extractAperture = (desc: string): string => {
  const d = String(desc || '').toUpperCase();
  const match = d.match(/(194\.5|206|219|228)/);
  return match ? match[0] : '—';
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  // 1. ESTADOS BASE
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('capacidad');
  
  // 2. DATOS DE SAP / API
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [habilidades, setHabilidades] = useState<any[]>([]);

  // 3. ESTADOS DE CONTROL
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState(new Date());
  const [manualHours, setManualHours] = useState<Record<string, number>>({});
  const [isProcessingSalida, setIsProcessingSalida] = useState(false);
  const [salidaProgress, setSalidaProgress] = useState({ current: 0, total: 0 });
  const [salidaRows, setSalidaRows] = useState<any[]>([]);

  // 4. MEMOS DE INICIALIZACION (Ubicados al inicio para evitar errores de TDZ)
  const defaultOpHour = useMemo(() => {
    if (grupos.length === 0) return 8;
    const clGroup = grupos.find(g => g.nombre_grupo.toLowerCase().includes('corte y laminado'));
    const htRest = clGroup ? restriccionesArray.find(r => r.codigo_grupo === clGroup.codigo_grupo && r.nombre_restriccion === 'HORAS_TRABAJO') : null;
    return safeNum(htRest?.valor_restriccion) || 8;
  }, [grupos, restriccionesArray]);

  const getMachineMTTO = useCallback((maquinaCode: string) => {
    if (selectedDates.size === 0) return 0;
    return mantenimientos
      .filter(m => {
        const mMachine = String(m.ID_MAQUINA || m.MAQUINA || '').toUpperCase();
        if (!mMachine.includes(maquinaCode.toUpperCase()) && !maquinaCode.toUpperCase().includes(mMachine)) return false;
        const dStr = String(m.FECHA_OT_PRG_INI || m.FECHA_INI || '').split('T')[0];
        return selectedDates.has(dStr);
      })
      .reduce((sum, m) => sum + safeNum(calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI, m.FECHA_OT_PRG_FIN || m.FECHA_FIN)), 0);
  }, [mantenimientos, selectedDates]);

  // 5. LOGICA DE EXTRACCION
  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    const dims = parseDimensionsEnhanced(desc);
    const aperture = extractAperture(desc) || extractAperture(catStr);
    return { code, desc, catStr, ...dims, apertura };
  }, []);

  const calculateEngineering = useCallback((o: any) => {
    const info = extractMaterialInfo(o);
    const qty = safeNum(o.CANTIDAD || o.CANTPROGRAMADA || 0);
    const densV = parseFloat(info.densidad) || 0;
    const singleBlockH = (densV < 30) ? 103 : 85;
    const sheetsPerStack = info.espesor > 0 ? Math.floor(Math.min(MAX_STACK_HEIGHT_CM, singleBlockH * 2) / info.espesor) : 1;
    const subblocks = sheetsPerStack > 0 ? Math.ceil(qty / sheetsPerStack) : 0;
    const sbPerLoad = info.ancho > 0 ? Math.floor(CIRCUMFERENCE / (info.ancho + EFFECTIVE_GAP_CM)) : 1;
    const loads = sbPerLoad > 0 ? Math.ceil(subblocks / sbPerLoad) : 0;
    const matchTime = tiemposEnsamblado.find(t => cleanCode(t.CodMaterial || t.cod_material).slice(-8) === info.code);
    const sapSecPerUnit = safeNum(matchTime?.Tiempo || matchTime?.tiempo || 0);
    const totalTimeSec = (loads * SECONDS_PER_LOAD_VUELTA) + ((qty / 3) * SECONDS_PER_MANEUVER_DESC) + (qty * sapSecPerUnit);
    return { 
      ...info, 
      subblocks, 
      loads, 
      hours: totalTimeSec / 3600, 
      indivMin: qty > 0 ? (totalTimeSec / qty) / 60 : 0, 
      qty,
      peso: (info.distancia * info.altura * info.espesor * densV * qty) / 1000000,
      volumen: (info.ancho * info.largo * info.espesor * qty) / 1000000
    };
  }, [extractMaterialInfo, tiemposEnsamblado]);

  // 6. FILTRADO DE ORDENES
  const provFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      const itemAlmValue = String(o.ALMACEN || o.Almacen || '').trim();
      if (itemAlmValue !== '1006' && itemAlmValue !== '2006') return false; 
      const itemDateFull = String(o.FECHA || o.FECHAINICIO || '').trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenes, selectedDates]);

  const fertsFiltradasPorFecha = useMemo(() => {
    return ordenesFert.filter(o => {
      const itemDateFull = String(o.FECHA || o.FECHAINICIO || '').trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenesFert, selectedDates]);

  // 7. SINCRONIZACION INICIAL
  const initData = useCallback(async () => {
    logger.log('[TacticalPlanEspumas] Iniciando sincronización...');
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return name.includes('espuma') || name.includes('corte y laminado');
      });
      setGrupos(filteredGroups);
      const gIds = filteredGroups.map(g => g.codigo_grupo);

      const [restrs, provs, ferts, times, maint, skillsRes] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 25000),
        serviciosService.getOrdenesFert(1, 20000),
        serviciosService.getTiemposEnsamblado(1, 15000),
        serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] })),
        serviciosService.getHabilidadesOperadorPorEstacion().catch(() => ({ data: [] }))
      ]);

      setRestriccionesArray((restrs.data || []).filter((r: any) => gIds.includes(r.codigo_grupo)));
      setOrders(provs.data?.data || provs.data || []);
      setOrdersFert(ferts.data?.data || ferts.data || []);
      setTiemposEnsamblado(times.data?.data || times.data || []);
      setMantenimientos(maint.data || []);
      setHabilidades(skillsRes.data || []);
      
      logger.success(`[TacticalPlanEspumas] Sincronización exitosa: ${provs.data?.data?.length || 0} órdenes cargadas.`);
    } catch (e) {
      logger.error('[TacticalPlanEspumas] Fallo en sincronización', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    setViewDate(new Date());
    // Seleccionar hoy por defecto, pero advertir si no hay datos
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    setSelectedDates(new Set([todayStr]));
  }, []);

  useEffect(() => { if (mounted) initData(); }, [mounted, initData]);

  // 8. ACCIONES DE REPORTE
  const handleGenerateSalida = async () => {
    if (provFiltradas.length === 0) {
      addNotification('warning', 'No hay órdenes filtradas para procesar. Verifique los filtros de fecha o almacén.');
      return;
    }
    setIsProcessingSalida(true);
    setSalidaRows([]);
    setSalidaProgress({ current: 0, total: provFiltradas.length });
    const rows: any[] = [];

    for (let i = 0; i < provFiltradas.length; i++) {
      const order = provFiltradas[i];
      const engOrder = calculateEngineering(order);
      const centro = String(order.CENTRO || order.Centro || '1000').trim();
      const fertCode = engOrder.code.padStart(18, '0');

      try {
        const response = await serviciosService.getMaestroMaterialesExplosion(centro, fertCode, 1, 100);
        const bomData = response?.data?.data || response?.data || [];
        if (Array.isArray(bomData)) {
          const bloques = bomData.filter(b => (b.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('BLOQUE FORMULADO'));
          const laminas = bomData.filter(b => (b.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('LAMINA CILINDRICA'));

          laminas.forEach(lamina => {
            const engL = calculateEngineering({ CodMaterial: cleanCode(lamina.COMPONENTE), NOMBRE: lamina.DESCRIPCION_COMPONENTE, CANTIDAD: safeNum(lamina.CANTIDAD_ACUMULADA) * engOrder.qty });
            const parent = bomData.find(b => cleanCode(b.COMPONENTE) === cleanCode(lamina.MATERIAL_PADRE)) || bloques[0] || { COMPONENTE: '—', DESCRIPCION_COMPONENTE: '—' };

            rows.push({
              Orden: order.ORDENPREVISIONAL || '—',
              Fecha: String(order.FECHAINICIO || '').split('T')[0],
              categoria: engOrder.catStr,
              HALB_N1: cleanCode(lamina.COMPONENTE),
              HALB_N1N: String(lamina.DESCRIPCION_COMPONENTE).toUpperCase(),
              Ancho: engL.ancho,
              Largo: engL.largo,
              'Esp.': engL.espesor,
              'Dens.': engL.densidad,
              'Cant.': Math.round(engL.qty),
              Peso: engL.peso.toFixed(2),
              Volumen: engL.volumen.toFixed(3),
              HALB_N3: cleanCode(parent.COMPONENTE),
              HALB_N3N: String(parent.DESCRIPCION_COMPONENTE).toUpperCase(),
              APERTURA: engL.apertura,
              'T. Indiv': engL.indivMin.toFixed(2),
              'T. Total': engL.hours.toFixed(2),
              'Cargas': engL.loads,
              '# SUB_Bloque': engL.subblocks
            });
          });
        }
      } catch (e) { logger.warn(`[Salida] Fallo en BOM para ${engOrder.code}`); }
      setSalidaProgress(prev => ({ ...prev, current: i + 1 }));
    }
    setSalidaRows(rows);
    setIsProcessingSalida(false);
    addNotification('success', `Salida procesada: ${rows.length} filas generadas.`);
  };

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    [...ordenes, ...ordenesFert].forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') dates.add(d.includes('T') ? d.split('T')[0] : d);
    });
    return dates;
  }, [ordenes, ordenesFert]);

  const calendarDaysList = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  // 9. RENDER ROOT (Unificado para hidratación)
  const renderRoot = (content: React.ReactNode) => (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Sincronización Órdenes SAP y Auditoría de Ingeniería</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={initData} disabled={isLoading} variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm active:scale-95 transition-all">
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} ACTUALIZAR
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm active:scale-95 transition-all hover:border-primary/50">
                <CalendarIcon className="w-3 h-3 text-primary" /> {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} Días Seleccionados`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
              <div className="bg-white p-4 font-sans text-left text-[11px]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                  <div className="flex gap-1 bg-gray-50 p-1 rounded-lg">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white"><ChevronLeft className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white"><ChevronRight className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center">
                  {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                  {calendarDaysList.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dStr = format(day, 'yyyy-MM-dd');
                    const sel = selectedDates.has(dStr);
                    return (
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); sel ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                        <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !sel ? "text-slate-200" : "")}>{format(day, 'd')}</span>
                        {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1.5 w-1 h-1 bg-primary/40 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-primary h-8 mt-3 rounded-lg hover:bg-primary/5 tracking-widest" onClick={() => setSelectedDates(new Set())}>Ver Todo el Plan</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
      {content}
    </div>
  );

  if (!mounted) return renderRoot(<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);

  return renderRoot(
    <>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-6 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'capacidad', l: 'Capacidad', i: LayoutDashboard }, 
            { v: 'salida', l: 'Salida de Datos', i: FileSpreadsheet },
            { v: 'ordenes', l: 'Provisionales', i: Package },
            { v: 'ordenesFert', l: 'Órdenes FERT', i: ShoppingCart },
            { v: 'habilidades', l: 'Habilidades', i: GraduationCap },
            { v: 'mantenimiento', l: 'MTTO Preventivo', i: Wrench }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[8px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="capacidad" className="animate-in fade-in duration-300 space-y-10">
          {[ { id: '1000', label: 'UIO' }, { id: '2000', label: 'GYE' } ].map(center => {
            const machines = CAPACIDAD_CONFIG_BASE[center.id as '1000' | '2000'] || [];
            const provsForCenter = provFiltradas.filter(o => String(o.CENTRO || o.Centro || '').trim() === center.id);
            const loadHrs = provsForCenter.reduce((sum, o) => sum + calculateEngineering(o).hours, 0);

            const totalCap = machines.reduce((acc, m) => {
              const hT1 = manualHours[`${center.id}_${m.code}_t1`] ?? (center.id==='1000' ? m.t1 : defaultOpHour);
              const hT2 = manualHours[`${center.id}_${m.code}_t2`] ?? (center.id==='1000' ? m.t2 : 0);
              const mtto = getMachineMTTO(m.code);
              return acc + ((hT1 + hT2 - PARO_PROG_T1 - PARO_PROG_T2 - mtto) * m.rendimiento);
            }, 0);

            return (
              <div key={center.id} className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 px-1 text-left">
                  <MapPin className="w-3 h-3" /> PLANTA {center.label}
                </h3>
                <Card className="rounded-2xl border border-gray-100 shadow-xl overflow-hidden bg-white">
                  <table className="w-full border-collapse text-center font-sans text-[10px]">
                    <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-tighter border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-5 text-left w-56">Recurso</th>
                        <th className="px-2 py-5 border-r border-gray-50 w-24">T1 (H)</th>
                        <th className="px-2 py-5 border-r border-gray-50 w-24">T2 (H)</th>
                        <th className="px-3 py-5 border-r border-gray-50">Paro T1</th>
                        <th className="px-3 py-5 border-r border-gray-50">Paro T2</th>
                        <th className="px-3 py-5 border-r border-gray-50">MTTO SAP</th>
                        <th className="px-4 py-5 bg-indigo-50 text-indigo-900 border-r border-gray-100 font-black">Disp. Neta</th>
                        <th className="px-4 py-5 text-blue-600 font-black">Carga (H)</th>
                        <th className="px-4 py-5">Ocupación %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {machines.map(m => {
                        const hT1 = manualHours[`${center.id}_${m.code}_t1`] ?? (center.id==='1000' ? m.t1 : defaultOpHour);
                        const hT2 = manualHours[`${center.id}_${m.code}_t2`] ?? (center.id==='1000' ? m.t2 : 0);
                        const mtto = getMachineMTTO(m.code);
                        const netAvailable = (hT1 + hT2 - PARO_PROG_T1 - PARO_PROG_T2 - mtto) * m.rendimiento;
                        const mLoad = provsForCenter.filter(o => String(o.MAQUINA || o.RECURSO || '').toUpperCase().includes(m.code)).reduce((s, o) => s + calculateEngineering(o).hours, 0);
                        return (
                          <tr key={m.code} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-4 text-left">
                              <div className="text-indigo-900 font-black text-[11px] uppercase tracking-tight">{m.name}</div>
                              <div className="text-[9px] text-gray-400 font-bold">{m.code}</div>
                            </td>
                            <td className="px-2 py-4">
                              <select className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black w-16 focus:ring-2 focus:ring-primary outline-none" value={hT1} onChange={e => setManualHours({...manualHours, [`${center.id}_${m.code}_t1`]: Number(e.target.value)})}>
                                {Array.from({length: 17}, (_, i) => <option key={i} value={i}>{i}h</option>)}
                              </select>
                            </td>
                            <td className="px-2 py-4">
                              <select className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[10px] font-black w-16 focus:ring-2 focus:ring-primary outline-none" value={hT2} onChange={e => setManualHours({...manualHours, [`${center.id}_${m.code}_t2`]: Number(e.target.value)})}>
                                {Array.from({length: 17}, (_, i) => <option key={i} value={i}>{i}h</option>)}
                              </select>
                            </td>
                            <td className="px-3 py-4 text-slate-300 font-mono">{PARO_PROG_T1}</td>
                            <td className="px-3 py-4 text-slate-300 font-mono">{PARO_PROG_T2}</td>
                            <td className={cn("px-3 py-4 font-mono", mtto > 0 ? "text-red-500 bg-red-50/50" : "text-slate-100")}>{mtto > 0 ? `${mtto}h` : '—'}</td>
                            <td className="px-4 py-4 font-mono font-black text-indigo-700 bg-indigo-50/20">{netAvailable.toFixed(1)}</td>
                            <td className="px-4 py-4 text-blue-400 font-mono">{mLoad > 0 ? mLoad.toFixed(1) : '—'}</td>
                            <td className={cn("px-4 py-4 font-mono text-xs", netAvailable > 0 && (mLoad/netAvailable) > 1 ? "text-red-500" : "text-slate-200")}>
                              {netAvailable > 0 && mLoad > 0 ? `${((mLoad/netAvailable)*100).toFixed(0)}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-[#1e293b] text-white font-black uppercase text-[10px] tracking-wider">
                      <tr>
                        <td colSpan={6} className="px-6 py-5 text-right border-r border-white/5">TOTAL PLANTA {center.label}</td>
                        <td className="px-4 py-5 bg-indigo-900 border-r border-white/5 font-mono text-xs">{totalCap.toFixed(1)}h</td>
                        <td className="px-4 py-5 bg-blue-900/40 border-r border-white/5 font-mono text-xs text-blue-200">{loadHrs.toFixed(1)}h</td>
                        <td className={cn("px-4 py-5 bg-black/20 font-mono text-xs", totalCap > 0 && (loadHrs / totalCap * 100) > 100 ? "text-red-400" : "text-emerald-400")}>
                          {totalCap > 0 ? ((loadHrs / totalCap) * 100).toFixed(0) : 0}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </Card>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="salida" className="animate-in fade-in duration-300 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-slate-900 rounded-3xl text-white shadow-2xl">
            <div className="flex items-center gap-4 text-left">
              <div className="p-3 bg-white/10 rounded-2xl"><FileSpreadsheet className="w-6 h-6 text-[#facc15]" /></div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-tighter">Generador de Reporte Plano</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Cruza Órdenes con Explosión BOM multinivel SAP</p>
              </div>
            </div>
            <Button onClick={handleGenerateSalida} disabled={isProcessingSalida || provFiltradas.length === 0} className="bg-[#facc15] hover:bg-[#eab308] text-slate-900 rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center gap-2">
              {isProcessingSalida ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} {isProcessingSalida ? 'EXPLOSIONANDO BOM...' : 'GENERAR SALIDA'}
            </Button>
          </div>

          {isProcessingSalida && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-widest">
                <span>{salidaProgress.current} / {salidaProgress.total} Órdenes procesadas</span>
              </div>
              <Progress value={(salidaProgress.current / salidaProgress.total) * 100} className="h-2 bg-slate-200" />
            </div>
          )}

          {!isProcessingSalida && salidaRows.length > 0 ? (
            <div className="border border-gray-100 rounded-[2rem] shadow-2xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full border-collapse text-[10px] font-sans text-center">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-[#1e293b] text-white uppercase font-black tracking-tighter border-b border-black/10">
                      <th className="px-3 py-4 border-r border-white/5">Orden</th>
                      <th className="px-3 py-4 border-r border-white/5">Fecha</th>
                      <th className="px-3 py-4 border-r border-white/5 bg-indigo-500/20">HALB_N1</th>
                      <th className="px-5 py-4 border-r border-white/5 bg-indigo-500/20 text-left">HALB_N1N</th>
                      <th className="px-2 py-4 border-r border-white/5 bg-[#d9ead3] text-black">Ancho</th>
                      <th className="px-2 py-4 border-r border-white/5 bg-[#d9ead3] text-black">Largo</th>
                      <th className="px-2 py-4 border-r border-white/5 bg-[#d9ead3] text-black">Esp.</th>
                      <th className="px-2 py-4 border-r border-white/5 bg-[#d9ead3] text-black">Dens.</th>
                      <th className="px-2 py-4 border-r border-white/5 bg-[#d9ead3] text-black">Cant.</th>
                      <th className="px-3 py-4 border-r border-white/5 bg-slate-800 text-slate-100">HALB_N3</th>
                      <th className="px-5 py-4 border-r border-white/5 bg-slate-800 text-slate-100 text-left">HALB_N3N</th>
                      <th className="px-2 py-4 border-r border-white/5">APERTURA</th>
                      <th className="px-2 py-4 border-r border-white/5 font-black text-amber-300">T. Total (H)</th>
                      <th className="px-2 py-4">Cargas</th>
                      <th className="px-2 py-4">SubBloques</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-bold">
                    {salidaRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 border-r border-gray-50 text-slate-800">{row.Orden}</td>
                        <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.Fecha}</td>
                        <td className="px-3 py-2 border-r border-gray-50 font-mono text-indigo-600 bg-indigo-50/5">{row.HALB_N1}</td>
                        <td className="px-5 py-2 border-r border-gray-50 text-left uppercase text-slate-400 truncate max-w-[200px]" title={row.HALB_N1N}>{row.HALB_N1N}</td>
                        <td className="px-2 py-2 border-r border-gray-50 bg-[#d9ead3]/30 text-black">{row.Ancho}</td>
                        <td className="px-2 py-2 border-r border-gray-50 bg-[#d9ead3]/30 text-black">{row.Largo}</td>
                        <td className="px-2 py-2 border-r border-gray-50 bg-[#d9ead3]/30 text-black font-black">{row['Esp.']}</td>
                        <td className="px-2 py-2 border-r border-gray-50 bg-[#d9ead3]/30 text-indigo-700">{row['Dens.']}</td>
                        <td className="px-2 py-2 border-r border-gray-50 bg-[#d9ead3]/30 font-black text-slate-900">{row['Cant.']}</td>
                        <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-500 bg-slate-50">{row.HALB_N3}</td>
                        <td className="px-5 py-2 border-r border-gray-50 text-left uppercase text-slate-300 truncate max-w-[150px] italic" title={row.HALB_N3N}>{row.HALB_N3N}</td>
                        <td className="px-2 py-2 border-r border-gray-50 font-black text-red-500">{row.APERTURA}</td>
                        <td className="px-2 py-2 border-r border-gray-50 text-amber-600 font-mono">{row['T. Total']}</td>
                        <td className="px-2 py-2 text-red-600">{row['Cargas']}</td>
                        <td className="px-2 py-2 text-emerald-600">{row['# SUB_Bloque']}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            !isProcessingSalida && (
              <div className="py-24 text-center bg-slate-50/30 rounded-[3rem] border-2 border-dashed border-slate-100">
                <Box className="w-16 h-16 text-slate-200 mx-auto" />
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Inicie la explosión para generar el reporte técnico plano</p>
              </div>
            )
          )}
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-6 animate-in fade-in duration-300">
          <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border-collapse font-sans text-center">
                <thead className="bg-[#1e293b] text-white border-b border-white/5 uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-4 border-r border-white/5">Orden</th>
                    <th className="px-3 py-4 border-r border-white/5">Fecha</th>
                    <th className="px-3 py-4 border-r border-white/5 text-left">Material / Desc.</th>
                    <th className="px-2 py-4 border-r border-white/5 bg-blue-500/10">Ancho</th>
                    <th className="px-2 py-4 border-r border-white/5 bg-blue-500/10">Largo</th>
                    <th className="px-2 py-4 border-r border-white/5 bg-blue-500/10">Esp.</th>
                    <th className="px-2 py-4 border-r border-white/5 bg-indigo-500/10">Dens.</th>
                    <th className="px-3 py-4 border-r border-white/5 font-black text-yellow-400">Cant.</th>
                    <th className="px-3 py-4 border-r border-white/5 text-amber-200 font-black">T. Total (H)</th>
                    <th className="px-3 py-4 border-r border-white/5 text-red-300">Cargas</th>
                    <th className="px-3 py-4">Alm.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-[10px]">
                  {provFiltradas.length === 0 ? (
                    <tr><td colSpan={11} className="py-24 text-center text-slate-200 uppercase tracking-widest font-black italic">Sin actividad filtrada</td></tr>
                  ) : (
                    provFiltradas.map((o, idx) => {
                      const eng = calculateEngineering(o);
                      return (
                        <tr key={idx} className="hover:bg-indigo-50/10 transition-colors">
                          <td className="px-3 py-3 border-r border-gray-50 text-slate-800">{o.ORDENPREVISIONAL || '—'}</td>
                          <td className="px-3 py-3 border-r border-gray-50 font-mono text-[9px] text-slate-400">{String(o.FECHAINICIO || '').split('T')[0]}</td>
                          <td className="px-3 py-3 text-left border-r border-gray-100 min-w-[150px]">
                            <div className="font-black text-indigo-600 tracking-tighter">{eng.code}</div>
                            <div className="text-[8px] text-slate-400 uppercase truncate max-w-[140px]">{eng.desc}</div>
                          </td>
                          <td className="px-2 py-3 border-r border-gray-50 text-blue-900">{eng.ancho}</td>
                          <td className="px-2 py-3 border-r border-gray-50 text-blue-900">{eng.largo}</td>
                          <td className="px-2 py-3 border-r border-gray-50 text-blue-900 font-black">{eng.espesor}</td>
                          <td className="px-2 py-3 border-r border-gray-50 text-indigo-700 font-black">{eng.densidad}</td>
                          <td className="px-3 py-3 border-r border-gray-50 font-black text-slate-900 text-sm">{eng.qty.toLocaleString()}</td>
                          <td className="px-3 py-3 border-r border-gray-50 bg-amber-50/30 text-amber-700 font-mono font-black">{eng.hours.toFixed(2)}</td>
                          <td className="px-3 py-3 border-r border-gray-50 text-red-600 font-black">{eng.loads}</td>
                          <td className="px-3 py-3 text-slate-200 font-mono">{o.ALMACEN || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="habilidades" className="animate-in fade-in duration-300">
          <Card className="rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden bg-white text-left">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse font-sans text-[10px]">
                <thead className="bg-[#e0e7ff] sticky top-0 z-20 text-indigo-900 uppercase font-black border-b border-indigo-200">
                  <tr>
                    {habilidades.length > 0 && Object.keys(habilidades[0]).map(k => (
                      <th key={k} className="px-6 py-4 border-r border-indigo-100 whitespace-nowrap">{k.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {habilidades.length === 0 ? (
                    <tr><td className="py-20 text-center text-slate-300 italic uppercase tracking-widest">Sincronizando Matriz de Habilidades SAP...</td></tr>
                  ) : (
                    habilidades.map((h, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                        {Object.keys(h).map(k => <td key={k} className="px-6 py-3 border-r border-gray-100 text-slate-700">{String(h[k] ?? '—')}</td>)}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
          <Card className="rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden bg-white text-center">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full border-collapse font-sans text-[10px]">
                <thead className="bg-[#fef3c7] sticky top-0 z-10 text-amber-900 uppercase font-black border-b border-amber-200">
                  <tr>
                    <th className="px-6 py-5 border-r border-amber-100">PLANTA</th>
                    <th className="px-6 py-5 border-r border-amber-100">MAQUINA</th>
                    <th className="px-6 py-5 border-r border-amber-100 text-left">OT_ID</th>
                    <th className="px-6 py-5 border-r border-amber-100 text-left">INICIO</th>
                    <th className="px-6 py-5 border-r border-amber-100 text-left">FIN</th>
                    <th className="px-8 py-5 text-center bg-amber-500/10 text-amber-700">MTTO (H)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {mantenimientos.length === 0 ? (
                    <tr><td colSpan={6} className="py-20 text-slate-300 uppercase tracking-widest italic text-center">Sin mantenimientos programados</td></tr>
                  ) : (
                    mantenimientos.map((m, i) => (
                      <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-6 py-4 border-r border-gray-100 text-slate-400">{String(m.PLANTA || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-indigo-900 font-black">{String(m.ID_MAQUINA || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 font-mono text-left text-slate-400">{String(m.OT_PRG_ID || '—')}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-left font-mono text-slate-500">{m.FECHA_OT_PRG_INI || m.FECHA_INI || '—'}</td>
                        <td className="px-6 py-4 border-r border-gray-100 text-left font-mono text-slate-500">{m.FECHA_OT_PRG_FIN || m.FECHA_FIN || '—'}</td>
                        <td className="px-8 py-4 text-center font-mono font-black text-amber-700 bg-amber-50/50">{calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI, m.FECHA_OT_PRG_FIN || m.FECHA_FIN)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
};
