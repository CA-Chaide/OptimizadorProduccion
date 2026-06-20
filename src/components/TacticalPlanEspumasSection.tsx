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
  Plus,
  Scissors,
  TrendingUp
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * --- CONSTANTES DE INGENIERÍA PLANTA ESPUMAS ---
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

// --- HELPERS TÉCNICOS ---
const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const parseDimensionsEnhanced = (desc: string) => {
  const d = String(desc || '').toUpperCase();
  const densMatch = d.match(/D(\d+)/);
  const densidad = densMatch ? densMatch[1] : '—';
  if (d.includes('CV')) return { densidad, distancia: 60, altura: 206, espesor: 3.5, ancho: 194.5, largo: 204 };
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
  const ancho = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const largo = dimMatch ? parseFloat(dimMatch[2]) : 0;
  const espesor = dimMatch && dimMatch[3] ? parseFloat(dimMatch[3]) : 1.2;
  let alturaFinal = ancho;
  if (ancho === 204 && espesor <= 1.2) alturaFinal = 206;
  let distancia = 100; 
  if (espesor === 1.0) distancia = 110;
  else if (espesor === 3.5) distancia = 60;
  else if (espesor === 1.2) distancia = 100;
  return { densidad, distancia, altura: alturaFinal, espesor, ancho, largo };
};

const extractAperture = (desc: string): string => {
  const d = String(desc || '').toUpperCase();
  const match = d.match(/(194\.5|206|219|228)/);
  return match ? match[0] : '—';
};

const calculateMTTOCapacity = (start: string, end: string): string => {
  if (!start || !end) return '0.0';
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return '0.0';
  const diffHrs = (e.getTime() - s.getTime()) / (1000 * 60 * 60);
  return Math.max(0, diffHrs).toFixed(1);
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('capacidad');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [habilidades, setHabilidades] = useState<any[]>([]);
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState(new Date());
  const [manualHours, setManualHours] = useState<Record<string, number>>({});
  const [isProcessingSalida, setIsProcessingSalida] = useState(false);
  const [salidaProgress, setSalidaProgress] = useState({ current: 0, total: 0 });
  const [salidaRows, setSalidaRows] = useState<any[]>([]);

  useEffect(() => {
    setMounted(true);
    setSelectedDates(new Set([format(new Date(), 'yyyy-MM-dd')]));
  }, []);

  const defaultOpHour = useMemo(() => {
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

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    const dims = parseDimensionsEnhanced(desc);
    const aperture = extractAperture(desc) || extractAperture(catStr);
    return { code, desc, catStr, ...dims, aperture };
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
      const d = String(o.FECHA || o.FECHAINICIO || '').trim();
      if (!d || d === 'null') return false;
      const normalized = d.includes('T') ? d.split('T')[0] : d;
      return selectedDates.size === 0 || selectedDates.has(normalized);
    });
  }, [ordenesFert, selectedDates]);

  const initData = useCallback(async () => {
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
      logger.log(`[Corte Espuma] Sincronización completa. ${provs.data?.length || 0} órdenes cargadas.`);
    } catch (e) {
      console.error('Error init:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (mounted) initData(); }, [mounted, initData]);

  const handleGenerateSalida = async () => {
    if (provFiltradas.length === 0) {
      addNotification('warning', 'Sin actividad filtrada para procesar.');
      return;
    }
    setIsProcessingSalida(true);
    setSalidaRows([]);
    
    // OPTIMIZACIÓN: Deduplicar materiales para reducir llamadas a la API de Explosión
    const materialGroups = new Map<string, { orders: any[] }>();
    provFiltradas.forEach(order => {
      const info = extractMaterialInfo(order);
      if (!materialGroups.has(info.code)) materialGroups.set(info.code, { orders: [] });
      materialGroups.get(info.code)!.orders.push(order);
    });

    const uniqueCodes = Array.from(materialGroups.keys());
    setSalidaProgress({ current: 0, total: uniqueCodes.length });
    const finalRows: any[] = [];

    for (let i = 0; i < uniqueCodes.length; i++) {
      const matCode = uniqueCodes[i];
      const orders = materialGroups.get(matCode)!.orders;
      const fertCode = matCode.padStart(18, '0');

      try {
        const response = await serviciosService.getMaestroMaterialesExplosion("1000", fertCode, 1, 500);
        const bomData = response?.data?.data || response?.data || [];
        
        if (Array.isArray(bomData)) {
          const laminas = bomData.filter(b => (b.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('LAMINA CILINDRICA'));
          
          laminas.forEach(lamina => {
            const lCode = cleanCode(lamina.COMPONENTE);
            const lDesc = String(lamina.DESCRIPCION_COMPONENTE).toUpperCase();
            const cantAcumFactor = safeNum(lamina.CANTIDAD_ACUMULADA || lamina.CANTIDAD_UNITARIA);
            
            const intermediate = bomData.find(b => cleanCode(b.COMPONENTE) === cleanCode(lamina.MATERIAL_PADRE));
            const baseBlock = bomData.find(b => (b.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('BLOQUE FORMULADO'));

            orders.forEach(order => {
              const orderQty = safeNum(order.CANTIDAD || order.CANTPROGRAMADA);
              const finalLQty = orderQty * cantAcumFactor;
              const engL = calculateEngineering({ CodMaterial: lCode, NOMBRE: lDesc, CANTIDAD: finalLQty });

              finalRows.push({
                Orden: order.ORDENPREVISIONAL || order.ORDEN || '—',
                Fecha: String(order.FECHAINICIO || order.FECHA || '').split('T')[0],
                categoria: extractMaterialInfo(order).catStr,
                HALB_N1: lCode,
                HALB_N1N: lDesc,
                Ancho: engL.ancho,
                Largo: engL.largo,
                'Esp.': engL.espesor,
                'Dens.': engL.densidad,
                'Cant.': Math.round(finalLQty),
                Peso: engL.peso.toFixed(2),
                Volumen: engL.volumen.toFixed(3),
                HALB_N2: intermediate ? cleanCode(intermediate.COMPONENTE) : '—',
                HALB_N2N: intermediate ? String(intermediate.DESCRIPCION_COMPONENTE).toUpperCase() : '—',
                Consumo_N2: (orderQty * safeNum(intermediate?.CANTIDAD_ACUMULADA)).toFixed(3),
                HALB_N3: baseBlock ? cleanCode(baseBlock.COMPONENTE) : '—',
                HALB_N3N: baseBlock ? String(baseBlock.DESCRIPCION_COMPONENTE).toUpperCase() : '—',
                APERTURA: engL.apertura,
                'T. Indiv': (engL.indivMin * 60).toFixed(0) + 's',
                'T. Total': engL.hours.toFixed(2),
                'Cargas': engL.loads,
                '# SUB_Bloque': engL.subblocks
              });
            });
          });
        }
      } catch (err) {
        console.warn(`[Salida Datos] Error en material ${matCode}:`, err);
      }
      setSalidaProgress(prev => ({ ...prev, current: i + 1 }));
    }

    setSalidaRows(finalRows.sort((a, b) => a.Orden.localeCompare(b.Orden)));
    setIsProcessingSalida(false);
    addNotification('success', `Reporte generado: ${finalRows.length} columnas técnicas auditadas.`);
  };

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    [...ordenes, ...ordenesFert].forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') dates.add(d.includes('T') ? d.split('T')[0] : d);
    });
    return dates;
  }, [ordenes, ordenesFert]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  const renderRoot = (content: React.ReactNode) => (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Auditoría SAP | Ingeniería de Carrusel v4.2</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={initData} disabled={isLoading} variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} ACTUALIZAR
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
                <CalendarIcon className="w-3 h-3 text-primary" /> {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} Días`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
              <div className="bg-white p-4 font-sans text-left">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                  <div className="flex gap-1 bg-gray-50 p-1 rounded-lg">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6"><ChevronLeft className="w-3 h-3" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6"><ChevronRight className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1 text-center">
                  {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                  {calendarDays.map((day, idx) => {
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

      {!mounted || isLoading ? (
        <div className="h-64 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Sincronizando con SAP...</p>
        </div>
      ) : content}
    </div>
  );

  const content = (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid grid-cols-6 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
        {[ 
          { v: 'capacidad', l: 'Capacidad', i: LayoutDashboard }, 
          { v: 'salida', l: 'Salida de Datos', i: FileSpreadsheet },
          { v: 'ordenes', l: 'Provisionales', i: Package },
          { v: 'ordenesFert', l: 'FERT', i: ShoppingCart },
          { v: 'habilidades', l: 'Habilidades', i: GraduationCap },
          { v: 'mantenimiento', l: 'MTTO', i: Wrench }
        ].map(tab => (
          <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[8px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <tab.i className="w-3.5 h-3.5" /> {tab.l}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="capacidad" className="animate-in fade-in duration-300 space-y-8">
        {[ { id: '1000', label: 'UIO' }, { id: '2000', label: 'GYE' } ].map(center => {
          const machines = CAPACIDAD_CONFIG_BASE[center.id as '1000' | '2000'] || [];
          const provsForCenter = provFiltradas.filter(o => String(o.CENTRO || o.Centro || '').trim() === center.id);
          return (
            <div key={center.id} className="space-y-4 text-left">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 px-1">
                <MapPin className="w-3 h-3" /> PLANTA {center.label}
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-xl overflow-hidden bg-white">
                <table className="w-full border-collapse text-center text-[10px]">
                  <thead className="bg-[#f8fafc] text-slate-400 font-black uppercase border-b border-gray-100">
                    <tr>
                      <th className="px-6 py-4 text-left">Recurso</th>
                      <th className="px-2 py-4">T1 (H)</th>
                      <th className="px-2 py-4">T2 (H)</th>
                      <th className="px-3 py-4">MTTO SAP</th>
                      <th className="px-4 py-4 bg-indigo-50 text-indigo-900 font-black">Disp. Neta</th>
                      <th className="px-4 py-4 text-blue-600 font-black">Carga (H)</th>
                      <th className="px-4 py-4">Ocupación %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 font-bold">
                    {machines.map(m => {
                      const hT1 = manualHours[`${center.id}_${m.code}_t1`] ?? (center.id==='1000' ? m.t1 : defaultOpHour);
                      const hT2 = manualHours[`${center.id}_${m.code}_t2`] ?? (center.id==='1000' ? m.t2 : 0);
                      const mtto = getMachineMTTO(m.code);
                      const netAvail = (hT1 + hT2 - PARO_PROG_T1 - PARO_PROG_T2 - mtto) * m.rendimiento;
                      const mLoad = provsForCenter.filter(o => String(o.MAQUINA || o.RECURSO || '').toUpperCase().includes(m.code)).reduce((s, o) => s + calculateEngineering(o).hours, 0);
                      return (
                        <tr key={m.code} className="hover:bg-slate-50">
                          <td className="px-6 py-3 text-left">
                            <div className="text-indigo-900 font-black text-[11px]">{m.name}</div>
                            <div className="text-[9px] text-gray-300">{m.code}</div>
                          </td>
                          <td className="px-2 py-3">
                            <select className="bg-slate-50 border border-slate-200 rounded px-1 font-black" value={hT1} onChange={e => setManualHours({...manualHours, [`${center.id}_${m.code}_t1`]: Number(e.target.value)})}>
                              {Array.from({length: 17}, (_, i) => <option key={i} value={i}>{i}h</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-3">
                            <select className="bg-slate-50 border border-slate-200 rounded px-1 font-black" value={hT2} onChange={e => setManualHours({...manualHours, [`${center.id}_${m.code}_t2`]: Number(e.target.value)})}>
                              {Array.from({length: 17}, (_, i) => <option key={i} value={i}>{i}h</option>)}
                            </select>
                          </td>
                          <td className={cn("px-3 py-3 font-mono", mtto > 0 ? "text-red-500 bg-red-50/50" : "text-slate-200")}>{mtto > 0 ? `${mtto}h` : '—'}</td>
                          <td className="px-4 py-3 font-mono font-black text-indigo-700 bg-indigo-50/20">{netAvail.toFixed(1)}</td>
                          <td className="px-4 py-3 text-blue-400 font-mono">{mLoad > 0 ? mLoad.toFixed(1) : '—'}</td>
                          <td className={cn("px-4 py-3 font-mono", netAvail > 0 && (mLoad/netAvail) > 1 ? "text-red-500" : "text-slate-200")}>
                            {netAvail > 0 && mLoad > 0 ? `${((mLoad/netAvail)*100).toFixed(0)}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            </div>
          );
        })}
      </TabsContent>

      <TabsContent value="salida" className="animate-in fade-in duration-300 space-y-6 text-left">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-slate-900 rounded-3xl text-white shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/10 rounded-2xl"><FileSpreadsheet className="w-6 h-6 text-[#facc15]" /></div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-tighter">Reporte Plano de Ingeniería</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Explosión Técnica Multinivel SAP | Láminas y Bloques</p>
            </div>
          </div>
          <Button onClick={handleGenerateSalida} disabled={isProcessingSalida || provFiltradas.length === 0} className="bg-[#facc15] hover:bg-[#eab308] text-slate-900 rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2">
            {isProcessingSalida ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />} GENERAR SALIDA
          </Button>
        </div>

        {isProcessingSalida && (
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-widest">
              <span>Procesando Materiales: {salidaProgress.current} / {salidaProgress.total}</span>
            </div>
            <Progress value={(salidaProgress.current / salidaProgress.total) * 100} className="h-2 bg-slate-200" />
          </div>
        )}

        {!isProcessingSalida && salidaRows.length > 0 && (
          <div className="border border-gray-100 rounded-[2rem] shadow-2xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <table className="w-full border-collapse text-[9px] font-sans text-center">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-[#1e293b] text-white uppercase font-black tracking-tighter border-b border-black/10">
                    <th className="px-2 py-4 border-r border-white/5">Orden</th>
                    <th className="px-2 py-4 border-r border-white/5">Fecha</th>
                    <th className="px-3 py-4 border-r border-white/5 text-teal-400">HALB_N3</th>
                    <th className="px-4 py-4 border-r border-white/5 text-left text-teal-400">HALB_N3N</th>
                    <th className="px-3 py-4 border-r border-white/5 text-indigo-400">HALB_N1</th>
                    <th className="px-4 py-4 border-r border-white/10 text-left text-indigo-400">HALB_N1N</th>
                    <th className="px-2 py-4 border-r border-white/5 bg-[#d9ead3] text-black">Ancho</th>
                    <th className="px-2 py-4 border-r border-white/5 bg-[#d9ead3] text-black">Largo</th>
                    <th className="px-2 py-4 border-r border-white/5 bg-[#d9ead3] text-black">Esp.</th>
                    <th className="px-2 py-4 border-r border-white/5 bg-[#d9ead3] text-black">Dens.</th>
                    <th className="px-2 py-4 border-r border-white/10 bg-[#d9ead3] text-black font-black text-sm">Cant.</th>
                    <th className="px-2 py-4 border-r border-white/5">Peso</th>
                    <th className="px-2 py-4 border-r border-white/10">Vol.</th>
                    <th className="px-2 py-4 border-r border-white/5">APERTURA</th>
                    <th className="px-2 py-4 border-r border-white/5 font-black text-amber-300">T. Tot (H)</th>
                    <th className="px-2 py-4 border-r border-white/5">Cargas</th>
                    <th className="px-2 py-4">SubBloques</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {salidaRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-2 py-2 border-r border-gray-50 text-slate-400">{row.Orden}</td>
                      <td className="px-2 py-2 border-r border-gray-50 text-slate-400">{row.Fecha}</td>
                      <td className="px-3 py-2 border-r border-gray-50 font-mono text-teal-600 bg-teal-50/10">{row.HALB_N3}</td>
                      <td className="px-4 py-2 border-r border-gray-50 text-left uppercase text-slate-400 truncate max-w-[120px]">{row.HALB_N3N}</td>
                      <td className="px-3 py-2 border-r border-gray-50 font-mono text-indigo-600 bg-indigo-50/10">{row.HALB_N1}</td>
                      <td className="px-4 py-2 border-r border-gray-100 text-left uppercase text-slate-600 truncate max-w-[150px]">{row.HALB_N1N}</td>
                      <td className="px-2 py-2 border-r border-gray-50 bg-[#d9ead3]/20">{row.Ancho}</td>
                      <td className="px-2 py-2 border-r border-gray-50 bg-[#d9ead3]/20">{row.Largo}</td>
                      <td className="px-2 py-2 border-r border-gray-50 bg-[#d9ead3]/20 font-black">{row['Esp.']}</td>
                      <td className="px-2 py-2 border-r border-gray-100 bg-[#d9ead3]/20 text-indigo-700">{row['Dens.']}</td>
                      <td className="px-2 py-2 border-r border-gray-100 bg-[#d9ead3]/20 text-sm">{row['Cant.']}</td>
                      <td className="px-2 py-2 border-r border-gray-50">{row.Peso}</td>
                      <td className="px-2 py-2 border-r border-gray-100">{row.Volumen}</td>
                      <td className="px-2 py-2 border-r border-gray-50 font-black text-red-500">{row.APERTURA}</td>
                      <td className="px-2 py-2 border-r border-gray-50 text-amber-600">{row['T. Total']}</td>
                      <td className="px-2 py-2 border-r border-gray-50 text-blue-600">{row.Cargas}</td>
                      <td className="px-2 py-2 text-emerald-600">{row['# SUB_Bloque']}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isProcessingSalida && salidaRows.length === 0 && (
          <div className="py-32 text-center bg-slate-50/30 rounded-[3rem] border-2 border-dashed border-slate-100">
            <Box className="w-16 h-16 text-slate-200 mx-auto" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Inicie la explosión para generar el reporte técnico</p>
          </div>
        )}
      </TabsContent>

      <TabsContent value="ordenes" className="animate-in fade-in duration-300">
        <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-[10px] text-center">
              <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-widest border-b border-gray-100">
                <tr>
                  <th className="px-3 py-4 border-r border-gray-50 text-left">Orden / Material</th>
                  <th className="px-2 py-4">ANC</th>
                  <th className="px-2 py-4">LRG</th>
                  <th className="px-2 py-4">ESP</th>
                  <th className="px-2 py-4">Dens.</th>
                  <th className="px-3 py-4 font-black text-gray-900">Cant.</th>
                  <th className="px-3 py-4 text-amber-600">T. Tot (H)</th>
                  <th className="px-3 py-4">Cargas</th>
                  <th className="px-3 py-4">Alm.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold">
                {provFiltradas.length === 0 ? (
                  <tr><td colSpan={9} className="py-24 text-center text-slate-200 uppercase tracking-widest italic">Sin órdenes para esta fecha</td></tr>
                ) : (
                  provFiltradas.map((o, idx) => {
                    const eng = calculateEngineering(o);
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-left">
                          <div className="font-black text-indigo-600">{eng.code}</div>
                          <div className="text-[8px] text-slate-400 truncate max-w-[150px]">{eng.desc}</div>
                        </td>
                        <td className="px-2 py-2 text-slate-400">{eng.ancho}</td>
                        <td className="px-2 py-2 text-slate-400">{eng.largo}</td>
                        <td className="px-2 py-2 font-black">{eng.espesor}</td>
                        <td className="px-2 py-2 text-indigo-700">{eng.densidad}</td>
                        <td className="px-3 py-2 font-black text-slate-900 text-sm">{eng.qty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-amber-600">{eng.hours.toFixed(1)}</td>
                        <td className="px-3 py-2 text-blue-400">{eng.loads}</td>
                        <td className="px-3 py-2 text-slate-200">{o.ALMACEN || o.Almacen || '—'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="ordenesFert" className="animate-in fade-in duration-300">
        <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-[10px] text-center">
              <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-widest border-b border-gray-100">
                <tr>
                  <th className="px-3 py-4 border-r border-gray-50 text-left">Orden FERT / Material</th>
                  <th className="px-2 py-4">ANC</th>
                  <th className="px-2 py-4">LRG</th>
                  <th className="px-2 py-4">ESP</th>
                  <th className="px-2 py-4">Dens.</th>
                  <th className="px-3 py-4 font-black text-gray-900">Cant.</th>
                  <th className="px-3 py-4 text-amber-600">T. Tot (H)</th>
                  <th className="px-3 py-4">Cargas</th>
                  <th className="px-3 py-4">Alm.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold">
                {fertsFiltradasPorFecha.length === 0 ? (
                  <tr><td colSpan={9} className="py-24 text-center text-slate-200 uppercase tracking-widest italic">Sin órdenes FERT para esta fecha</td></tr>
                ) : (
                  fertsFiltradasPorFecha.map((o, idx) => {
                    const eng = calculateEngineering(o);
                    return (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-left">
                          <div className="font-black text-indigo-600">{eng.code}</div>
                          <div className="text-[8px] text-slate-400 truncate max-w-[150px]">{eng.desc}</div>
                        </td>
                        <td className="px-2 py-2 text-slate-400">{eng.ancho}</td>
                        <td className="px-2 py-2 text-slate-400">{eng.largo}</td>
                        <td className="px-2 py-2 font-black">{eng.espesor}</td>
                        <td className="px-2 py-2 text-indigo-700">{eng.densidad}</td>
                        <td className="px-3 py-2 font-black text-slate-900 text-sm">{eng.qty.toLocaleString()}</td>
                        <td className="px-3 py-2 text-amber-600">{eng.hours.toFixed(1)}</td>
                        <td className="px-3 py-2 text-blue-400">{eng.loads}</td>
                        <td className="px-3 py-2 text-slate-200">{o.ALMACEN || o.Almacen || '—'}</td>
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
                  <tr><td className="py-20 text-center text-slate-300 italic uppercase tracking-widest">Cargando Matriz SAP...</td></tr>
                ) : (
                  habilidades.map((h, i) => (
                    <tr key={i} className="hover:bg-indigo-50/10">
                      {Object.keys(h).map(k => <td key={k} className="px-6 py-2 border-r border-gray-100 text-slate-700">{String(h[k] ?? '—')}</td>)}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
        <Card className="rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden bg-white">
          <table className="w-full border-collapse text-[10px]">
            <thead className="bg-[#fef3c7] text-amber-900 font-black uppercase border-b border-amber-200">
              <tr>
                <th className="px-6 py-4">PLANTA</th>
                <th className="px-6 py-4">RECURSO</th>
                <th className="px-6 py-4 text-left">FECHA INICIO</th>
                <th className="px-6 py-4 text-left">FECHA FIN</th>
                <th className="px-6 py-4">HORAS MTTO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 font-bold">
              {mantenimientos.length === 0 ? (
                <tr><td colSpan={5} className="py-20 text-center text-slate-200 uppercase tracking-widest italic">Sin tareas de mantenimiento registradas</td></tr>
              ) : (
                mantenimientos.map((m, i) => (
                  <tr key={i} className="hover:bg-amber-50/20">
                    <td className="px-6 py-3 text-slate-400">{String(m.PLANTA || '—')}</td>
                    <td className="px-6 py-3 text-indigo-900 font-black">{String(m.ID_MAQUINA || '—')}</td>
                    <td className="px-6 py-3 text-left font-mono text-slate-400">{m.FECHA_OT_PRG_INI || m.FECHA_INI || '—'}</td>
                    <td className="px-6 py-3 text-left font-mono text-slate-400">{m.FECHA_OT_PRG_FIN || m.FECHA_FIN || '—'}</td>
                    <td className="px-6 py-3 font-black text-amber-600 bg-amber-50/10">{calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI, m.FECHA_OT_PRG_FIN || m.FECHA_FIN)}h</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      </TabsContent>
    </Tabs>
  );

  return renderRoot(content);
};