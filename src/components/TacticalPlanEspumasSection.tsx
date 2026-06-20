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
  Info
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
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * --- CONSTANTES DE INGENIERÍA PLANTA ESPUMAS v3.1 ---
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
  
  if (str.includes('/')) {
    const [datePart, timePart] = str.split(' ');
    const dateParts = datePart.split('/');
    if (dateParts.length < 3) return null;
    const [day, month, year] = dateParts.map(Number);
    const [hours, minutes] = timePart ? timePart.split(':').map(Number) : [0, 0];
    return new Date(year, month - 1, day, hours, minutes);
  }
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

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('capacidad');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [habilidades, setHabilidades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState(new Date());
  const [manualHours, setManualHours] = useState<Record<string, number>>({});

  // Estado para el Reporte de Salida
  const [isProcessingSalida, setIsProcessingSalida] = useState(false);
  const [salidaProgress, setSalidaProgress] = useState({ current: 0, total: 0 });
  const [salidaRows, setSalidaRows] = useState<any[]>([]);

  useEffect(() => { 
    setMounted(true); 
    const today = new Date();
    setViewDate(today);
    setSelectedDates(new Set([format(today, 'yyyy-MM-dd')]));
  }, []);

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dims: any = { dens: '—', ancho: 0, largo: 0, esp: 0, apertura: '—' };
    
    // Regex para dimensiones
    const dimFullMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    if (dimFullMatch) {
      dims.ancho = parseFloat(dimFullMatch[1]);
      dims.largo = parseFloat(dimFullMatch[2]);
      if (dimFullMatch[3]) dims.esp = parseFloat(dimFullMatch[3]);
    }
    
    // Densidad
    const densM = catStr.match(/D(\d+)/i) || desc.match(/D-?(\d+)/i);
    if (densM) dims.dens = densM[1];

    // Apertura técnica
    const apMatch = catStr.match(/194\.5|206|219|228/) || desc.match(/194\.5|206|219|228/);
    if (apMatch) dims.apertura = apMatch[0];

    return { code, desc, catStr, ...dims };
  }, []);

  const calculateEngineering = useCallback((o: any) => {
    const info = extractMaterialInfo(o);
    const qty = safeNum(o.CANTIDAD || o.CANTPROGRAMADA || 0);
    const ancho = info.ancho;
    const largo = info.largo;
    const esp = info.esp;
    const densV = parseFloat(info.dens) || 0;

    const singleBlockH = (densV < 30) ? 103 : 85;
    const stackedH = singleBlockH * 2;
    
    const sheetsPerStack = esp > 0 ? Math.floor(Math.min(MAX_STACK_HEIGHT_CM, stackedH) / esp) : 1;
    const subblocks = sheetsPerStack > 0 ? Math.ceil(qty / sheetsPerStack) : 0;
    
    const sbPerLoad = ancho > 0 ? Math.floor(CIRCUMFERENCE / (ancho + EFFECTIVE_GAP_CM)) : 1;
    const loads = sbPerLoad > 0 ? Math.ceil(subblocks / sbPerLoad) : 0;

    const tCargaSec = loads * SECONDS_PER_LOAD_VUELTA; 
    const sheetsPerRep = (esp > 10) ? 4 : 3;
    const tDescargaSec = (sheetsPerRep > 0 ? Math.ceil(qty / sheetsPerRep) : qty) * SECONDS_PER_MANEUVER_DESC;

    const matchTime = tiemposEnsamblado.find(t => String(t.CodMaterial || t.cod_material).slice(-8) === info.code);
    const sapSecPerUnit = safeNum(matchTime?.Tiempo || matchTime?.tiempo || 0);
    
    const totalTimeSec = tCargaSec + tDescargaSec + (qty * sapSecPerUnit);
    const hours = totalTimeSec / 3600;
    const indivMin = qty > 0 ? (totalTimeSec / qty) / 60 : 0;

    const volumen = (ancho * largo * esp * qty) / 1000000; // m3
    const peso = volumen * densV;

    return { 
      ...info, subblocks, sbPerLoad, loads, hours, indivMin, qty, volumen, peso 
    };
  }, [extractMaterialInfo, tiemposEnsamblado]);

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    const all = [...ordenes, ...ordenesFert];
    all.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || o.fecha_inicio || '').trim();
      if (d && d !== 'null') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes, ordenesFert, mounted]);

  const calendarDays = useMemo(() => {
    if (!mounted || !viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

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
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
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
      
    } catch (e) {
      console.error('Error init TacticalPlanEspumas:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { if (mounted) initData(); }, [mounted, initData]);

  const provFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      const itemAlmValue = String(o.ALMACEN || o.Almacen || '').trim();
      if (itemAlmValue !== '1006' && itemAlmValue !== '2006') return false; 
      const itemDateFull = String(o.FECHA || o.FECHAINICIO || '').trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenes, selectedDates]);

  const handleGenerateSalida = async () => {
    if (provFiltradas.length === 0) {
      addNotification('warning', 'No hay órdenes filtradas para generar el reporte.');
      return;
    }

    setIsProcessingSalida(true);
    setSalidaRows([]);
    setSalidaProgress({ current: 0, total: provFiltradas.length });

    const rows: any[] = [];

    try {
      for (let i = 0; i < provFiltradas.length; i++) {
        const order = provFiltradas[i];
        const eng = calculateEngineering(order);
        const centro = String(order.CENTRO || order.Centro || '1000').trim();
        const fertCode = eng.code.padStart(18, '0');

        let bomN1 = { code: '—', name: '—' };
        let bomN2 = { code: '—', name: '—', consumo: 0 };
        let bomN3 = { code: '—', name: '—' };

        try {
          // Explosión técnica para obtener niveles HALB
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fertCode, 1, 100);
          const bomData = response?.data?.data || response?.data || [];
          
          if (Array.isArray(bomData)) {
            const n1 = bomData.find(b => String(b.NIVEL) === '1');
            const n2 = bomData.find(b => String(b.NIVEL) === '2');
            const n3 = bomData.find(b => String(b.NIVEL) === '3');

            if (n1) bomN1 = { code: cleanCode(n1.COMPONENTE), name: n1.DESCRIPCION_COMPONENTE };
            if (n2) bomN2 = { code: cleanCode(n2.COMPONENTE), name: n2.DESCRIPCION_COMPONENTE, consumo: safeNum(n2.CANTIDAD_ACUMULADA) };
            if (n3) bomN3 = { code: cleanCode(n3.COMPONENTE), name: n3.DESCRIPCION_COMPONENTE };
          }
        } catch (e) {
          console.warn(`Error BOM para material ${eng.code}`);
        }

        rows.push({
          Orden: order.ORDENPREVISIONAL || order.ORDEN || '—',
          Fecha: String(order.FECHAINICIO || order.FECHA || '').split('T')[0],
          categoria: eng.catStr,
          HALB_N1: bomN1.code,
          HALB_N1N: bomN1.name,
          Ancho: eng.ancho,
          Largo: eng.largo,
          'Esp.': eng.esp,
          'Dens.': eng.dens,
          'Cant.': eng.qty,
          Peso: eng.peso.toFixed(2),
          Volumen: eng.volumen.toFixed(3),
          HALB_N2: bomN2.code,
          HALB_N2N: bomN2.name,
          Consumo_N2: (bomN2.consumo * eng.qty).toFixed(2),
          HALB_N3: bomN3.code,
          HALB_N3N: bomN3.name,
          APERTURA: eng.apertura,
          'T. Indiv (m)': eng.indivMin.toFixed(2),
          'T. Total (H)': eng.hours.toFixed(2),
          'Cargas SUB_BLOQUE': eng.loads,
          '# SUB_Bloque': eng.subblocks
        });

        setSalidaProgress(prev => ({ ...prev, current: i + 1 }));
      }
      setSalidaRows(rows);
      addNotification('success', `Reporte generado con ${rows.length} registros.`);
    } catch (error) {
      addNotification('error', 'Error al procesar la salida de datos.');
    } finally {
      setIsProcessingSalida(false);
    }
  };

  const renderRoot = (content: React.ReactNode) => (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      {content}
    </div>
  );

  if (!mounted) return renderRoot(<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);

  return renderRoot(
    <>
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Cálculo de Cargas y Bloques | Ingeniería de Planta v3.1</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={initData} disabled={isLoading} variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm active:scale-95 transition-all">
            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} ACTUALIZAR
          </Button>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm active:scale-95 transition-all hover:border-primary/50">
                <CalendarIcon className="w-3 h-3 text-primary" /> {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} Días`}
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
                  {calendarDays.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dStr = format(day, 'yyyy-MM-dd');
                    const sel = selectedDates.has(dStr);
                    return (
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); sel ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md shadow-primary/20" : "hover:bg-gray-100")}>
                        <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !sel ? "text-slate-200" : "")}>{format(day, 'd')}</span>
                        {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-6 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'capacidad', l: 'Capacidad', i: LayoutDashboard }, 
            { v: 'ordenes', l: 'Provisionales', i: Package },
            { v: 'ordenesFert', l: 'Órdenes FERT', i: ShoppingCart },
            { v: 'salida', l: 'Salida de Datos', i: FileSpreadsheet },
            { v: 'habilidades', l: 'Habilidades', i: GraduationCap },
            { v: 'mantenimiento', l: 'MTTO Preventivo', i: Wrench }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[8px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="salida" className="animate-in fade-in duration-300 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-slate-900 rounded-3xl text-white shadow-2xl">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/10 rounded-2xl"><FileSpreadsheet className="w-6 h-6 text-[#facc15]" /></div>
              <div className="text-left">
                <h3 className="text-sm font-black uppercase tracking-tighter">Generador de Reporte Plano</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Explosión Jerárquica BOM SAP | Ingeniería v3.1</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button 
                onClick={handleGenerateSalida} 
                disabled={isProcessingSalida || provFiltradas.length === 0}
                className="bg-[#facc15] hover:bg-[#eab308] text-slate-900 rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 transition-all flex items-center gap-2"
              >
                {isProcessingSalida ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
                {isProcessingSalida ? 'PROCESANDO SAP...' : 'GENERAR REPORTE'}
              </Button>
            </div>
          </div>

          {isProcessingSalida && (
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div className="flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-widest">
                <span className="flex items-center gap-2"><Activity className="w-3 h-3 text-primary" /> Ejecutando Explosión Técnica BOM</span>
                <span>{salidaProgress.current} / {salidaProgress.total} Órdenes</span>
              </div>
              <Progress value={(salidaProgress.current / salidaProgress.total) * 100} className="h-2 bg-slate-200" />
            </div>
          )}

          {!isProcessingSalida && salidaRows.length > 0 && (
            <div className="border border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full border-collapse text-[9px] font-sans text-center">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-[#0f172a] text-white uppercase font-black tracking-tighter border-b border-white/10">
                      <th className="px-3 py-4 border-r border-white/5">Orden</th>
                      <th className="px-3 py-4 border-r border-white/5">Fecha</th>
                      <th className="px-3 py-4 border-r border-white/5">Categoría</th>
                      <th className="px-3 py-4 border-r border-white/5 bg-indigo-500/10 text-indigo-300">HALB_N1</th>
                      <th className="px-4 py-4 border-r border-white/5 bg-indigo-500/10 text-indigo-300">N1_Nombre</th>
                      <th className="px-2 py-4 border-r border-white/5">ANC</th>
                      <th className="px-2 py-4 border-r border-white/5">LRG</th>
                      <th className="px-2 py-4 border-r border-white/5">ESP</th>
                      <th className="px-2 py-4 border-r border-white/5">DNS</th>
                      <th className="px-2 py-4 border-r border-white/5 font-black text-[#facc15]">Cant</th>
                      <th className="px-3 py-4 border-r border-white/5">Peso(Kg)</th>
                      <th className="px-3 py-4 border-r border-white/5">Vol(m3)</th>
                      <th className="px-3 py-4 border-r border-white/5 bg-teal-500/10 text-teal-300">HALB_N2</th>
                      <th className="px-4 py-4 border-r border-white/5 bg-teal-500/10 text-teal-300">N2_Nombre</th>
                      <th className="px-3 py-4 border-r border-white/5 bg-teal-500/10 text-teal-300">Cons_N2</th>
                      <th className="px-3 py-4 border-r border-white/5 bg-emerald-500/10 text-emerald-300">HALB_N3</th>
                      <th className="px-4 py-4 border-r border-white/5 bg-emerald-500/10 text-emerald-300">N3_Nombre</th>
                      <th className="px-2 py-4 border-r border-white/5 font-black text-red-400">APERTURA</th>
                      <th className="px-2 py-4 border-r border-white/5">T.Ind(m)</th>
                      <th className="px-2 py-4 border-r border-white/5">T.Tot(H)</th>
                      <th className="px-2 py-4 border-r border-white/5">Cargas</th>
                      <th className="px-2 py-4"># Blq</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-bold">
                    {salidaRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-2 border-r border-gray-50 text-slate-400">{row.Orden}</td>
                        <td className="px-3 py-2 border-r border-gray-50 text-slate-400 font-mono">{row.Fecha}</td>
                        <td className="px-3 py-2 border-r border-gray-50 text-slate-400">{row.categoria}</td>
                        <td className="px-3 py-2 border-r border-gray-50 font-mono text-indigo-600 bg-indigo-50/10">{row.HALB_N1}</td>
                        <td className="px-4 py-2 border-r border-gray-50 text-left uppercase text-slate-400 truncate max-w-[120px] bg-indigo-50/10" title={row.HALB_N1N}>{row.HALB_N1N}</td>
                        <td className="px-2 py-2 border-r border-gray-50">{row.Ancho}</td>
                        <td className="px-2 py-2 border-r border-gray-50">{row.Largo}</td>
                        <td className="px-2 py-2 border-r border-gray-50 font-black">{row['Esp.']}</td>
                        <td className="px-2 py-2 border-r border-gray-50 text-indigo-700">{row['Dens.']}</td>
                        <td className="px-2 py-2 border-r border-gray-50 font-black text-slate-900">{row['Cant.']}</td>
                        <td className="px-3 py-2 border-r border-gray-50 font-mono">{row.Peso}</td>
                        <td className="px-3 py-2 border-r border-gray-50 font-mono">{row.Volumen}</td>
                        <td className="px-3 py-2 border-r border-gray-50 font-mono text-teal-600 bg-teal-50/10">{row.HALB_N2}</td>
                        <td className="px-4 py-2 border-r border-gray-50 text-left uppercase text-slate-400 truncate max-w-[120px] bg-teal-50/10" title={row.HALB_N2N}>{row.HALB_N2N}</td>
                        <td className="px-3 py-2 border-r border-gray-50 font-mono text-teal-700 bg-teal-50/10 font-black">{row.Consumo_N2}</td>
                        <td className="px-3 py-2 border-r border-gray-50 font-mono text-emerald-600 bg-emerald-50/10">{row.HALB_N3}</td>
                        <td className="px-4 py-2 border-r border-gray-50 text-left uppercase text-slate-400 truncate max-w-[120px] bg-emerald-50/10" title={row.HALB_N3N}>{row.HALB_N3N}</td>
                        <td className="px-2 py-2 border-r border-gray-50 font-black text-red-500 bg-red-50/10">{row.APERTURA}</td>
                        <td className="px-2 py-2 border-r border-gray-50 text-blue-600 font-mono">{row['T. Indiv (m)']}</td>
                        <td className="px-2 py-2 border-r border-gray-50 text-amber-600 font-mono font-black">{row['T. Total (H)']}</td>
                        <td className="px-2 py-2 border-r border-gray-50 text-red-600">{row['Cargas SUB_BLOQUE']}</td>
                        <td className="px-2 py-2 text-emerald-600">{row['# SUB_Bloque']}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!isProcessingSalida && salidaRows.length === 0 && (
            <div className="py-24 text-center bg-slate-50/30 rounded-[3rem] border-2 border-dashed border-slate-100">
              <Box className="w-16 h-16 text-slate-200 mx-auto" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Inicie la auditoría multinivel para generar la salida de datos</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="capacidad" className="animate-in fade-in duration-300 space-y-10">
          {[ { id: '1000', label: 'UIO' }, { id: '2000', label: 'GYE' } ].map(center => {
            const machines = CAPACIDAD_CONFIG_BASE[center.id as '1000' | '2000'];
            const provs = provFiltradas.filter(o => String(o.CENTRO || o.Centro || '').trim() === center.id);
            const loadProv = provs.reduce((sum, o) => sum + calculateEngineering(o).hours, 0);

            const totalCap = machines.reduce((acc, m) => {
              const hT1 = manualHours[`${center.id}_${m.code}_t1`] ?? (center.id==='1000' ? m.t1 : defaultOpHour);
              const hT2 = manualHours[`${center.id}_${m.code}_t2`] ?? (center.id==='1000' ? m.t2 : 0);
              const mtto = getMachineMTTO(m.code);
              return acc + ((hT1 + hT2 - PARO_PROG_T1 - PARO_PROG_T2 - mtto) * m.rendimiento);
            }, 0);

            return (
              <div key={center.id} className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 px-1">
                  <MapPin className="w-3 h-3" /> PLANTA {center.label}
                </h3>
                <Card className="rounded-[2rem] border border-gray-100 shadow-xl overflow-hidden bg-white">
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
                            <td className="px-4 py-4 text-blue-400">—</td>
                            <td className="px-4 py-4 text-slate-100">—</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-[#1e293b] text-white font-black uppercase text-[10px] tracking-wider">
                      <tr>
                        <td colSpan={6} className="px-6 py-5 text-right border-r border-white/5">TOTAL PLANTA {center.label}</td>
                        <td className="px-4 py-5 bg-indigo-900 border-r border-white/5 font-mono text-xs">{totalCap.toFixed(1)}h</td>
                        <td className="px-4 py-5 bg-blue-900/40 border-r border-white/5 font-mono text-xs text-blue-200">{loadProv.toFixed(1)}h</td>
                        <td className={cn("px-4 py-5 bg-black/20 font-mono text-xs", (loadProv / totalCap * 100) > 100 ? "text-red-400" : "text-emerald-400")}>
                          {totalCap > 0 ? ((loadProv / totalCap) * 100).toFixed(0) : 0}%
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </Card>
              </div>
            );
          })}
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
                    <th className="px-3 py-4 border-r border-white/5 text-blue-200">T. Indiv (m)</th>
                    <th className="px-3 py-4 border-r border-white/5 text-amber-200 font-black">T. Total (H)</th>
                    <th className="px-3 py-4 border-r border-white/5 text-red-300">Cargas</th>
                    <th className="px-3 py-4 border-r border-white/5 text-emerald-300">Bloques</th>
                    <th className="px-3 py-4 border-r border-white/5">Máquina</th>
                    <th className="px-3 py-4">Alm.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-[10px]">
                  {provFiltradas.length === 0 ? (
                    <tr><td colSpan={14} className="py-24 text-center text-slate-200 font-black uppercase tracking-widest italic">No se detectaron órdenes prov para los criterios aplicados</td></tr>
                  ) : (
                    provFiltradas.map((o, idx) => {
                      const eng = calculateEngineering(o);
                      return (
                        <tr key={idx} className="hover:bg-indigo-50/20 transition-colors">
                          <td className="px-3 py-3 border-r border-gray-50 text-slate-800">{o.ORDENPREVISIONAL || '—'}</td>
                          <td className="px-3 py-3 border-r border-gray-50 font-mono text-[9px] text-slate-400">{String(o.FECHAINICIO || '').split('T')[0]}</td>
                          <td className="px-3 py-3 text-left border-r border-gray-100 min-w-[150px]">
                            <div className="font-black text-indigo-600 tracking-tighter">{eng.code}</div>
                            <div className="text-[8px] text-slate-400 uppercase truncate max-w-[140px]">{eng.desc}</div>
                          </td>
                          <td className="px-2 py-3 border-r border-gray-50 bg-blue-50/30 text-blue-900">{eng.ancho}</td>
                          <td className="px-2 py-3 border-r border-gray-50 bg-blue-50/30 text-blue-900">{eng.largo}</td>
                          <td className="px-2 py-3 border-r border-gray-50 bg-blue-50/30 text-blue-900 font-black">{eng.esp}</td>
                          <td className="px-2 py-3 border-r border-gray-50 bg-indigo-50/30 text-indigo-700 font-black">{eng.dens}</td>
                          <td className="px-3 py-3 border-r border-gray-50 font-black text-slate-900 text-sm">{eng.qty.toLocaleString()}</td>
                          <td className="px-3 py-3 border-r border-gray-50 text-blue-700 font-mono">{eng.indivMin.toFixed(2)}</td>
                          <td className="px-3 py-3 border-r border-gray-50 bg-amber-50/30 text-amber-700 font-mono font-black">{eng.hours.toFixed(2)}</td>
                          <td className="px-3 py-3 border-r border-gray-50 text-red-600 font-black">{eng.loads}</td>
                          <td className="px-3 py-3 border-r border-gray-50 text-emerald-600 font-black">{eng.subblocks}</td>
                          <td className="px-3 py-3 border-r border-gray-50 uppercase text-slate-400 font-black">{o.MAQUINA || '—'}</td>
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

        <TabsContent value="ordenesFert" className="space-y-6 animate-in fade-in duration-300">
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
                    <th className="px-3 py-4 border-r border-white/5 text-blue-200">T. Indiv (m)</th>
                    <th className="px-3 py-4 border-r border-white/5 text-amber-200 font-black">T. Total (H)</th>
                    <th className="px-3 py-4 border-r border-white/5 text-red-300">Cargas</th>
                    <th className="px-3 py-4 border-r border-white/5 text-emerald-300">Bloques</th>
                    <th className="px-3 py-4 border-r border-white/5">Máquina</th>
                    <th className="px-3 py-4">Centro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold text-[10px]">
                  {fertsFiltradasPorFecha.length === 0 ? (
                    <tr><td colSpan={14} className="py-24 text-center text-slate-200 font-black uppercase tracking-widest italic">No se detectaron órdenes FERT para los criterios aplicados</td></tr>
                  ) : (
                    fertsFiltradasPorFecha.map((o, idx) => {
                      const eng = calculateEngineering(o);
                      return (
                        <tr key={idx} className="hover:bg-indigo-50/20 transition-colors">
                          <td className="px-3 py-3 border-r border-gray-50 text-slate-800">{o.ORDEN || '—'}</td>
                          <td className="px-3 py-3 border-r border-gray-50 font-mono text-[9px] text-slate-400">{String(o.FECHA || '').split('T')[0]}</td>
                          <td className="px-3 py-3 text-left border-r border-gray-100 min-w-[150px]">
                            <div className="font-black text-indigo-600 tracking-tighter">{eng.code}</div>
                            <div className="text-[8px] text-slate-400 uppercase truncate max-w-[140px]">{eng.desc}</div>
                          </td>
                          <td className="px-2 py-3 border-r border-gray-50 bg-blue-50/30 text-blue-900">{eng.ancho}</td>
                          <td className="px-2 py-3 border-r border-gray-50 bg-blue-50/30 text-blue-900">{eng.largo}</td>
                          <td className="px-2 py-3 border-r border-gray-50 bg-blue-50/30 text-blue-900 font-black">{eng.esp}</td>
                          <td className="px-2 py-3 border-r border-gray-50 bg-indigo-50/30 text-indigo-700 font-black">{eng.dens}</td>
                          <td className="px-3 py-3 border-r border-gray-50 font-black text-slate-900 text-sm">{safeNum(o.CANTPROGRAMADA).toLocaleString()}</td>
                          <td className="px-3 py-3 border-r border-gray-50 text-blue-700 font-mono">{eng.indivMin.toFixed(2)}</td>
                          <td className="px-3 py-3 border-r border-gray-50 bg-amber-50/30 text-amber-700 font-mono font-black">{eng.hours.toFixed(2)}</td>
                          <td className="px-3 py-3 border-r border-gray-50 text-red-600 font-black">{eng.loads}</td>
                          <td className="px-3 py-3 border-r border-gray-50 text-emerald-600 font-black">{eng.subblocks}</td>
                          <td className="px-3 py-3 border-r border-gray-50 uppercase text-slate-400 font-black">{o.MAQUINA || '—'}</td>
                          <td className="px-3 py-3 text-slate-200 font-mono">{o.CENTRO || '—'}</td>
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
                    <tr><td className="py-20 text-center text-slate-300 italic uppercase tracking-widest">Sincronizando Matriz de Habilidades...</td></tr>
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
                    <tr><td colSpan={6} className="py-20 text-slate-300 uppercase tracking-widest italic">Sincronizando Calendario MTTO...</td></tr>
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

  function getMachineMTTO(maquinaCode: string) {
    if (selectedDates.size === 0) return 0;
    return mantenimientos
      .filter(m => {
        const mMachine = String(m.ID_MAQUINA || m.MAQUINA || '').toUpperCase();
        if (!mMachine.includes(maquinaCode.toUpperCase()) && !maquinaCode.toUpperCase().includes(mMachine)) return false;
        const dStr = String(m.FECHA_OT_PRG_INI || m.FECHA_INI || '').split('T')[0];
        return selectedDates.has(dStr);
      })
      .reduce((sum, m) => sum + safeNum(calculateMTTOCapacity(m.FECHA_OT_PRG_INI || m.FECHA_INI, m.FECHA_OT_PRG_FIN || m.FECHA_FIN)), 0);
  }

  const defaultOpHour = useMemo(() => {
    const clGroup = grupos.find(g => g.nombre_grupo.toLowerCase().includes('corte y laminado'));
    const htRest = clGroup ? restriccionesArray.find(r => r.codigo_grupo === clGroup.codigo_grupo && r.nombre_restriccion === 'HORAS_TRABAJO') : null;
    return safeNum(htRest?.valor_restriccion) || 8;
  }, [grupos, restriccionesArray]);

  const fertsFiltradasPorFecha = useMemo(() => {
    return ordenesFert.filter(o => {
      const dFull = String(o.FECHA || o.FECHAINICIO || '').trim();
      const itemDate = dFull.includes('T') ? dFull.split('T')[0] : dFull;
      return selectedDates.size === 0 || selectedDates.has(itemDate);
    });
  }, [ordenesFert, selectedDates]);
};
