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
  Database,
  Info,
  TrendingUp,
  Box,
  Users,
  Lock,
  Wrench,
  GraduationCap,
  Search,
  History,
  AlertCircle
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from '@/components/ui/badge';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

// --- CONSTANTES TÉCNICAS Y DE INGENIERÍA ---
const DIAMETER_CM = 320;
const CIRCUMFERENCE = Math.PI * DIAMETER_CM; // ~1005.31 cm
const BASE_GAP_CM = 30;
const MANIPULATION_FACTOR = 1.05; // +5% solo en distancia
const EFFECTIVE_GAP_CM = BASE_GAP_CM * MANIPULATION_FACTOR; // 31.5 cm
const BLOCK_20M_CM = 2000;
const SECONDS_PER_LOAD = 300; 
const SECONDS_PER_UNIT = 45;

const RESPONSABLES_QUITO = ["013", "036", "038", "039", "044"];
const RESPONSABLES_GYE = ["002", "038", "039"];

const OPERATIVE_RESOURCES = {
  '1000': [
    { code: 'CR04', name: 'Carrusel 4', t1: 10, t2: 8.5, p: 2.04, rend: 0.90 },
    { code: 'CR03', name: 'Carrusel 3', t1: 10, t2: 8.5, p: 2.04, rend: 0.90 },
    { code: 'CR01', name: 'Carrusel 1', t1: 4, t2: 8.5, p: 2.04, rend: 0.90 },
    { code: 'CNC01', name: 'CNC Giotto', t1: 10, t2: 8.5, p: 2.04, rend: 0.90 },
  ],
  '2000': [
    { code: 'CR02', name: 'Fema', t1: 10, t2: 8.5, p: 2.04, rend: 0.70 },
    { code: 'CR01', name: 'Carrusel 1 SCHMUZIGER', t1: 10, t2: 8.5, p: 2.04, rend: 0.70 },
    { code: 'LA02', name: 'Repotenciado', t1: 10, t2: 8.5, p: 2.04, rend: 0.70 },
  ]
};

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const getCellValue = (row: any, keys: string[]): string => {
  if (!row) return '';
  const rowKeys = Object.keys(row);
  for (const searchKey of keys) {
    const normalizedSearch = searchKey.toLowerCase().replace(/_/g, '');
    const foundKey = rowKeys.find(k => k.toLowerCase().replace(/_/g, '') === normalizedSearch);
    if (foundKey) return String(row[foundKey]).trim();
  }
  return '';
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [habilidades, setHabilidades] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState<Date | null>(null);
  const [habilidadesSearch, setHabilidadesSearch] = useState('');

  useEffect(() => { 
    setMounted(true); 
    const now = new Date();
    setViewDate(now);
    setSelectedDate(now.toISOString().split('T')[0]);
    
    const initData = async () => {
      setIsLoading(true);
      try {
        const groupsRes = await grupoService.getAll();
        const filteredGroups = (groupsRes.data || []).filter(g => {
          const name = (g.nombre_grupo || '').toLowerCase();
          return name.includes('espuma') || name.includes('corte y laminado');
        });
        setGrupos(filteredGroups);
        const groupsIds = filteredGroups.map(g => g.codigo_grupo);

        const [restrsRes, provsRes, timesRes, maintRes, habRes] = await Promise.all([
          restriccionService.getAll(),
          serviciosService.OrdenesProvisionalesPaginados(1, 20000),
          serviciosService.getTiemposEnsamblado(1, 15000),
          serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] })),
          serviciosService.getCuboHabilidadesOP().catch(() => ({ data: [] }))
        ]);

        setRestricciones((restrsRes.data || []).filter((r: any) => groupsIds.includes(r.codigo_grupo)));
        setOrders(provsRes.data?.data || provsRes.data || []);
        setTiemposEnsamblado(timesRes.data?.data || timesRes.data || []);
        setMantenimientos(maintRes.data || []);
        setHabilidades(Array.isArray(habRes.data) ? habRes.data : []);

      } catch (error) {
        console.error('Error init TacticalPlanEspumas:', error);
      } finally {
        setIsLoading(false);
      }
    };
    initData();
  }, []);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const catStr = String(item.CATEGORIA || item.Categoria || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    const dimensions: any = { dens: '—', ancho: '—', largo: '—', esp: '—', tipo: '—' };
    
    // Captura técnica de densidad y tipo
    const techPattern = catStr.match(/D(\d+)([a-zA-Z]+)/i);
    if (techPattern) {
      dimensions.dens = techPattern[1]; 
      dimensions.tipo = techPattern[2].toUpperCase(); 
    }

    // Regex para dimensiones: Ancho x Largo x Espesor
    const dimMatch = desc.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
    if (dimMatch) {
      dimensions.ancho = dimMatch[1];
      dimensions.largo = dimMatch[2];
      if (dimMatch[3]) dimensions.esp = dimMatch[3];
    }
    
    return { code, desc, categoria: catStr, ...dimensions };
  };

  const calculateEngineering = (o: any) => {
    const info = extractMaterialInfo(o);
    const qty = safeNum(o.CANTPROGRAMADA || o.CANTIDAD || 0);
    const ancho = parseFloat(info.ancho) || 0;
    const largo = parseFloat(info.largo) || 0;
    const esp = parseFloat(info.esp) || 0;
    const densValue = parseFloat(info.dens) || 0;
    
    const usefulHeight = (densValue < 30) ? 103 : 85;
    const altTot = qty * esp;
    const subbl = altTot / usefulHeight;

    // INGENIERÍA BLOQUES 20M (Correcta)
    const piecesPerBlockLength = largo > 0 ? Math.floor(BLOCK_20M_CM / largo) : 1;
    const bloques20m = piecesPerBlockLength > 0 ? subbl / piecesPerBlockLength : 0;

    // INGENIERÍA CARRUSEL (Gap 31.5cm)
    const spacePerBlock = ancho + EFFECTIVE_GAP_CM;
    const subblPorCarga = spacePerBlock > 0 ? Math.floor(CIRCUMFERENCE / spacePerBlock) : 0;
    const cargas = subblPorCarga > 0 ? Math.ceil(subbl / subblPorCarga) : 0;

    // TIEMPOS ESTÁNDAR
    const tTotalSeconds = (cargas * SECONDS_PER_LOAD) + (qty * SECONDS_PER_UNIT);
    const operativeHours = tTotalSeconds / 3600;
    const stdTimeMin = qty > 0 ? (tTotalSeconds / 60) / qty : 0;

    return { 
      ...info, 
      altTot, 
      subbl, 
      subblPorCarga, 
      bloques20m, 
      cargas,
      operativeHours,
      stdTimeMin,
      qty,
      largo
    };
  };

  const filterDataByCenter = (data: any[], centro: string) => {
    return data.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;
      
      const itemAlm = String(o.ALMACEN || o.Almacen || '').trim();
      if (centro === '1000' && itemAlm !== '1006' && itemAlm !== '') return false;
      if (centro === '2000' && itemAlm !== '2006' && itemAlm !== '') return false;

      const itemResp = String(o.RESPCONTROLPROD || o.RespCtrlProd || '').trim();
      const validResps = centro === '1000' ? RESPONSABLES_QUITO : RESPONSABLES_GYE;
      if (!validResps.includes(itemResp)) return false;

      const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
      const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
      if (selectedDate !== 'all' && itemDate !== selectedDate) return false;
      
      return true;
    });
  };

  const provC1000 = useMemo(() => filterDataByCenter(ordenes, '1000'), [ordenes, selectedDate]);
  const provC2000 = useMemo(() => filterDataByCenter(ordenes, '2000'), [ordenes, selectedDate]);
  
  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const centro = String(o.CENTRO || o.Centro || '').trim();
      const resp = String(o.RESPCONTROLPROD || o.RespControlProd || '').trim();
      const valid = centro === '1000' ? RESPONSABLES_QUITO : RESPONSABLES_GYE;
      if (!valid.includes(resp)) return;
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') dates.add(d.includes('T') ? d.split('T')[0] : d);
    });
    return dates;
  }, [ordenes, mounted]);

  const calendarDays = useMemo(() => {
    if (!mounted || !viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

  const getPuestoDesdeHabilidades = (idMaquina: string) => {
    if (!idMaquina || !habilidades.length) return '—';
    const match = habilidades.find(h => {
      const maquinaVal = getCellValue(h, ['MaquinaSismac', 'ID_MAQUINA', 'MAQUINA']);
      return maquinaVal.toUpperCase() === String(idMaquina).trim().toUpperCase();
    });
    return match ? getCellValue(match, ['PuestoTrabajo', 'PUESTO', 'CARGO']) : '—';
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Corte Espuma</h2>
            <p className="text-xs text-gray-500 font-medium">Gap de Manipulación 31.5cm (+5% Distancia) | Ingeniería Bloque 20m Real</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-8 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Capacidad', i: LayoutDashboard }, 
            { v: 'resumenOperativo', l: 'Resumen Operativo', i: Activity },
            { v: 'habilidades', l: 'Habilidades SAP', i: GraduationCap },
            { v: 'mantenimiento', l: 'Mantenimiento', i: Wrench }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Parámetros', i: Lock }, 
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos Ensamblado', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/10 rounded-xl"><CalendarIcon className="w-4 h-4 text-primary" /></div>
              <div>
                <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest text-left">Horizonte Operativo</p>
                <h3 className="text-[10px] font-black text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'CONSOLIDADO MAESTRO' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl border-gray-200 gap-2 font-bold text-[10px] uppercase shadow-sm">
                  <Filter className="w-3 h-3 text-primary" /> Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-3 font-sans">
                  {viewDate && (
                    <>
                      <div className="flex items-center justify-between mb-3 text-left">
                        <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6"><ChevronLeft className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6"><ChevronRight className="w-3 h-3" /></Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-y-1 text-center">
                        {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((d, i) => <div key={i} className="text-[8px] font-bold text-gray-300 uppercase py-1">{d}</div>)}
                        {calendarDays.map((day, idx) => {
                          if (!day) return <div key={idx} />;
                          const dStr = format(day, 'yyyy-MM-dd');
                          const sel = selectedDate === dStr;
                          return (
                            <button key={dStr} onClick={() => setSelectedDate(sel ? 'all' : dStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", sel ? "bg-primary text-white shadow-md" : "hover:bg-gray-100")}>
                              <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dStr) && !sel ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                              {datesWithOrders.has(dStr) && !sel && <div className="absolute bottom-1 w-1 h-1 bg-primary/40 rounded-full" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-primary h-7 mt-1 rounded-lg hover:bg-primary/5" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-4 bg-green-50/20 border-green-100 rounded-2xl shadow-sm">
              <h3 className="text-[10px] font-black text-green-700 uppercase tracking-widest mb-4">PLANTA 1000 - QUITO</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-2 bg-white rounded-xl border border-green-100">
                  <p className="text-[8px] font-bold text-gray-400 uppercase mb-1">Unidades (UN)</p>
                  <p className="text-lg font-black text-gray-800">{provC1000.reduce((s,o)=>s+safeNum(o.CANTIDAD||o.CANTPROGRAMADA),0).toLocaleString()}</p>
                </div>
                <div className="text-center p-2 bg-white rounded-xl border border-green-100">
                  <p className="text-[8px] font-bold text-gray-400 uppercase mb-1">Horas Proy. (H)</p>
                  <p className="text-lg font-black text-indigo-600">{provC1000.reduce((s,o)=>s+calculateEngineering(o).operativeHours,0).toFixed(1)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4 bg-blue-50/20 border-blue-100 rounded-2xl shadow-sm">
              <h3 className="text-[10px] font-black text-indigo-700 uppercase tracking-widest mb-4">PLANTA 2000 - GUAYAQUIL</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-2 bg-white rounded-xl border border-blue-100">
                  <p className="text-[8px] font-bold text-gray-400 uppercase mb-1">Unidades (UN)</p>
                  <p className="text-lg font-black text-gray-800">{provC2000.reduce((s,o)=>s+safeNum(o.CANTIDAD||o.CANTPROGRAMADA),0).toLocaleString()}</p>
                </div>
                <div className="text-center p-2 bg-white rounded-xl border border-blue-100">
                  <p className="text-[8px] font-bold text-gray-400 uppercase mb-1">Horas Proy. (H)</p>
                  <p className="text-lg font-black text-indigo-600">{provC2000.reduce((s,o)=>s+calculateEngineering(o).operativeHours,0).toFixed(1)}</p>
                </div>
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="habilidades" className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-2xl border border-indigo-100 shadow-sm">
             <div className="flex items-center gap-3 text-left">
               <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-600"><GraduationCap className="w-5 h-5" /></div>
               <div>
                 <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">Cubo de Habilidades SAP (Visibilidad Total)</h3>
                 <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Todas las Columnas y Registros Cargados del Sistema</p>
               </div>
             </div>
             <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3 w-3 text-gray-400" />
                  <input type="text" placeholder="Búsqueda global..." value={habilidadesSearch} onChange={e => setHabilidadesSearch(e.target.value)} className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-[10px] font-bold w-64 focus:ring-2 focus:ring-indigo-500/20 shadow-sm" />
                </div>
                <Badge variant="outline" className="bg-white border-indigo-200 text-indigo-700 font-black text-[10px] uppercase h-8 px-4">{habilidades.length} Operadores</Badge>
             </div>
          </div>

          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[650px] relative">
              <table className="w-full border-collapse text-left font-sans text-[9px]">
                <thead className="bg-[#e0e7ff] sticky top-0 z-20 text-indigo-900 uppercase font-black tracking-widest border-b border-indigo-200">
                  <tr>
                    {habilidades.length > 0 && Object.keys(habilidades[0]).map((key) => (
                      <th key={key} className="px-4 py-3 border-r border-indigo-100 whitespace-nowrap">{key.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {habilidades.filter(h => {
                    const q = habilidadesSearch.toUpperCase();
                    return !habilidadesSearch || Object.values(h).some(v => String(v || '').toUpperCase().includes(q));
                  }).map((h, i) => (
                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                      {Object.keys(h).map((key) => (
                        <td key={key} className="px-4 py-2 border-r border-gray-100 text-slate-700 font-medium">
                          {String(h[key] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="resumenOperativo" className="animate-in fade-in duration-300">
           {selectedDate === 'all' ? (
              <div className="py-32 text-center border-2 border-dashed border-gray-100 rounded-3xl bg-gray-50/30">
                <AlertCircle className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <p className="text-[11px] font-black text-gray-300 uppercase tracking-widest">Seleccione una fecha específica en "Capacidad" para ver el resumen operativo</p>
              </div>
           ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-3 bg-green-50 p-4 rounded-2xl border border-green-100">
                  <div className="p-2 bg-green-600/10 rounded-xl text-green-600"><Activity className="w-5 h-5" /></div>
                  <div>
                    <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter text-left">Monitor de Operación: {selectedDate}</h3>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest text-left">Cruce: Máquinas | Operadores | MTTO SAP | Citas Médicas</p>
                  </div>
                </div>
                <Card className="rounded-2xl border border-gray-100 shadow-lg overflow-hidden bg-white">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse font-sans text-left">
                      <thead className="bg-[#064e3b] text-white uppercase font-black tracking-widest text-[9px] sticky top-0 z-20">
                        <tr>
                          <th className="px-5 py-4 border-r border-white/5">Turno</th>
                          <th className="px-5 py-4 border-r border-white/5">MÁQUINA</th>
                          <th className="px-5 py-4 border-r border-white/5">Código Operador</th>
                          <th className="px-5 py-4 border-r border-white/5">Nombre Empleado</th>
                          <th className="px-4 py-4 border-r border-white/5 text-center">_Habilidades (%)</th>
                          <th className="px-5 py-4 border-r border-white/5 text-right bg-black/10">Horas Efectivas</th>
                          <th className="px-5 py-4 border-r border-white/5 text-right bg-red-900/20">Tiempo MTTO</th>
                          <th className="px-5 py-4 text-right bg-amber-900/20">Citas Médicas</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-[10px] font-bold">
                        {(() => {
                          const allRes = [...OPERATIVE_RESOURCES['1000'], ...OPERATIVE_RESOURCES['2000']];
                          return allRes.map((res, idx) => {
                            const op = habilidades.find(h => getCellValue(h, ['MaquinaSismac']).toUpperCase() === res.code.toUpperCase());
                            const mtto = mantenimientos.filter(m => {
                              const mDateRaw = String(m.FECHA_PRO || '').trim();
                              const mDate = mDateRaw.includes('T') ? mDateRaw.split('T')[0] : mDateRaw;
                              return mDate === selectedDate && String(m.ID_MAQUINA).trim().toUpperCase() === res.code.toUpperCase();
                            });
                            const hMtto = mtto.reduce((s, m) => s + safeNum(m.TIEMPO), 0);
                            const hBase = res.t1 + res.t2;
                            const hEfec = Math.max(0, hBase - hMtto);

                            return (
                              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="px-5 py-3 border-r border-gray-50 text-slate-400 font-mono text-center">{res.t1}h / {res.t2}h</td>
                                <td className="px-5 py-3 border-r border-gray-100 text-slate-800 font-black uppercase">{res.code} - {res.name}</td>
                                <td className="px-5 py-3 border-r border-gray-50 text-indigo-600 font-mono text-center">{op ? getCellValue(op, ['IDENTIFICADOR']) : '—'}</td>
                                <td className="px-5 py-3 border-r border-gray-100 text-slate-700 uppercase">{op ? getCellValue(op, ['NOMBRE']) : <span className="text-red-400">SIN ASIGNACIÓN</span>}</td>
                                <td className="px-4 py-3 border-r border-gray-50 text-center">
                                  {op ? <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[9px] font-black">{getCellValue(op, ['CALIFICACION'])}%</Badge> : '—'}
                                </td>
                                <td className="px-5 py-3 border-r border-gray-50 text-right font-black text-indigo-900 bg-indigo-50/10 font-mono">{hEfec.toFixed(1)}h</td>
                                <td className="px-5 py-3 border-r border-gray-50 text-right font-black text-red-600 bg-red-50/10 font-mono">{hMtto > 0 ? `${hMtto}h` : '—'}</td>
                                <td className="px-5 py-3 text-right font-black text-amber-600 bg-amber-50/10 font-mono">—</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
           )}
        </TabsContent>

        <TabsContent value="mantenimiento" className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-amber-50 p-4 rounded-2xl border border-amber-100 shadow-sm">
            <div className="flex items-center gap-4 text-left">
              <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-600"><Wrench className="w-6 h-6" /></div>
              <div>
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">Paros Técnicos Programados SAP</h3>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                   Filtro Activo: {selectedDate === 'all' ? 'CONSOLIDADO' : `FECHA: ${selectedDate}`} | Cruce con Puesto SISMAC
                </p>
              </div>
            </div>
            <Badge variant="outline" className="bg-white border-amber-200 text-amber-700 font-black text-[10px] uppercase h-10 px-6">{mantenimientos.length} Registros</Badge>
          </div>

          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative text-center">
              <table className="w-full border-collapse font-sans text-[9px]">
                <thead className="bg-[#fef3c7] sticky top-0 z-20 text-amber-900 uppercase font-black tracking-widest border-b border-amber-200">
                  <tr>
                    <th className="px-4 py-4 border-r border-amber-100">ID Planta</th>
                    <th className="px-4 py-4 border-r border-amber-100">Planta</th>
                    <th className="px-4 py-4 border-r border-amber-100">Área</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-red-900">ID Máquina</th>
                    <th className="px-4 py-4 border-r border-amber-100">Máquina</th>
                    <th className="px-4 py-4 border-r border-amber-100 bg-indigo-50 text-indigo-900">Puesto (SISMAC)</th>
                    <th className="px-4 py-4 border-r border-amber-100">Tiempo (H)</th>
                    <th className="px-4 py-4 border-r border-amber-100">Fecha PROG.</th>
                    <th className="px-4 py-4">OT ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {mantenimientos.filter(m => {
                    if (selectedDate === 'all') return true;
                    const mDateRaw = String(m.FECHA_PRO || '').trim();
                    const mDate = mDateRaw.includes('T') ? mDateRaw.split('T')[0] : mDateRaw;
                    return mDate === selectedDate;
                  }).map((m, i) => (
                    <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-4 py-3 border-r border-gray-100 text-slate-400 font-mono">{String(m.ID_PLANTA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-slate-500 uppercase">{String(m.PLANTA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-slate-400 uppercase">{String(m.AREA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-amber-700 font-black">{String(m.ID_MAQUINA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 text-slate-800 uppercase text-left">{String(m.MAQUINA || '—')}</td>
                      <td className="px-4 py-3 border-r border-gray-100 bg-indigo-50/20 text-indigo-700 uppercase font-black">{getPuestoDesdeHabilidades(String(m.ID_MAQUINA))}</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-black text-red-600 font-mono">{String(m.TIEMPO || '0')}h</td>
                      <td className="px-4 py-3 border-r border-gray-100 font-mono text-slate-400">{String(m.FECHA_PRO || '—')}</td>
                      <td className="px-4 py-3 text-slate-700 font-mono">{String(m.OT_PRG_ID || '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-10 animate-in fade-in duration-300">
          {[ 
            { t: 'Planta 1000 - Quito', d: provC1000, id: '1000', c: 'text-green-700', b: 'bg-green-600' }, 
            { t: 'Planta 2000 - Guayaquil', d: provC2000, id: '2000', c: 'text-indigo-700', b: 'bg-indigo-600' } 
          ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-black uppercase flex items-center gap-2 px-1 text-left", center.c)}>
                <div className={cn("w-2.5 h-2.5 rounded-full", center.b)} /> {center.t} (Gap 31.5cm | Modelo Man. +5% Dist)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-center font-sans text-[9px]">
                    <thead className="bg-[#f1f5f9] sticky top-0 z-10 text-slate-500 uppercase font-black tracking-tighter border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-50">Orden</th>
                        <th className="px-3 py-4 border-r border-gray-50">Fecha</th>
                        <th className="px-3 py-4 border-r border-gray-50">Material</th>
                        <th className="px-3 py-4 border-r border-gray-50 text-left">Descripción</th>
                        <th className="px-2 py-4 border-r border-gray-50">DENS.</th>
                        <th className="px-2 py-4 border-r border-gray-50">ANCHO</th>
                        <th className="px-2 py-4 border-r border-gray-50">LARGO</th>
                        <th className="px-2 py-4 border-r border-gray-50">ESP.</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-black text-slate-700">Cant.</th>
                        <th className="px-3 py-4 border-r border-gray-100 font-black text-indigo-700 bg-indigo-50/20">Máquina</th>
                        <th className="px-2 py-4 border-r border-gray-50 bg-purple-50/50 text-purple-900">SUBBL.</th>
                        <th className="px-2 py-4 border-r border-gray-50 bg-indigo-50/50 text-indigo-900">SB/CARGA</th>
                        <th className="px-2 py-4 border-r border-gray-50 bg-orange-50/50 text-orange-900 font-black">BLOQUES 20M</th>
                        <th className="px-3 py-4 border-r border-gray-50 text-red-700 bg-red-50/50 font-black">CARGAS</th>
                        <th className="px-3 py-4 border-r border-gray-50 bg-teal-50 text-teal-800">T. ESTD (MIN)</th>
                        <th className="px-3 py-4 bg-teal-100 text-teal-900 font-black">T. TOTAL (H)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={16} className="py-20 text-center text-gray-300 font-bold uppercase tracking-widest opacity-20">Sin órdenes para procesar</td></tr>
                      ) : (
                        center.d.map((o, i) => {
                          const eng = calculateEngineering(o);
                          const dRaw = String(o.FECHAINICIO || o.FECHA || '—').trim();
                          const date = dRaw.includes('T') ? dRaw.split('T')[0] : dRaw;
                          const maquina = String(o.MAQUINA || o.Maquina || o.RECURSO || '—').trim();
                          return (
                            <tr key={i} className="hover:bg-gray-50/50 transition-colors font-bold">
                              <td className="px-3 py-2 text-slate-400 border-r border-gray-50">{o.ORDENPREVISIONAL || '—'}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-[8px] text-gray-400">{date}</td>
                              <td className="px-3 py-2 font-mono text-primary border-r border-gray-50">{eng.code}</td>
                              <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[120px] uppercase text-gray-500">{eng.desc}</td>
                              <td className="px-2 py-2 border-r border-gray-50 font-black text-gray-400">{eng.dens}</td>
                              <td className="px-2 py-2 border-r border-gray-50 font-mono text-slate-400">{eng.ancho}</td>
                              <td className="px-2 py-2 border-r border-gray-50 font-mono text-slate-400">{eng.largo}</td>
                              <td className="px-2 py-2 border-r border-gray-50 font-mono text-slate-400">{eng.esp}</td>
                              <td className="px-3 py-2 border-r border-gray-100 font-black text-gray-900 font-mono">{eng.qty.toLocaleString()}</td>
                              <td className="px-3 py-2 border-r border-gray-100 font-black text-indigo-700 bg-indigo-50/5 uppercase">{maquina}</td>
                              <td className="px-2 py-2 border-r border-gray-50 bg-purple-50/10 font-mono text-purple-700">{eng.subbl.toFixed(1)}</td>
                              <td className="px-2 py-2 border-r border-gray-50 bg-indigo-50/10 font-mono font-black text-indigo-700">{eng.subblPorCarga}</td>
                              <td className="px-2 py-2 border-r border-gray-50 bg-orange-50/10 font-mono font-black text-orange-800">{eng.bloques20m.toFixed(1)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 bg-red-50/20 font-mono font-black text-red-600">{String(eng.cargas)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 bg-teal-50/5 font-mono text-teal-700">{eng.stdTimeMin.toFixed(2)}</td>
                              <td className="px-3 py-2 bg-teal-100/20 font-mono font-black text-teal-900">{eng.operativeHours.toFixed(1)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300">
           <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[700px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-[#1e293b] text-white sticky top-0 z-10 text-[10px] font-black uppercase tracking-tight border-b border-white/5">
                  <tr>
                    <th className="px-5 py-4 border-r border-white/5 text-left">Material</th>
                    <th className="px-5 py-4 border-r border-white/5 text-left">Descripción Técnica</th>
                    <th className="px-5 py-4 border-r border-white/5">Puesto Trabajo</th>
                    <th className="px-5 py-4">Estándar (Min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px] font-bold">
                  {tiemposEnsamblado.length === 0 ? (
                    <tr><td colSpan={4} className="py-24 text-gray-300 font-black uppercase tracking-widest opacity-30 text-center">Sin catálogo de tiempos disponible</td></tr>
                  ) : (
                    tiemposEnsamblado.map((t, i) => {
                      const code = String(t.CodMaterial || '').slice(-8);
                      const desc = String(t.Material || t.Descripcion || '—').toUpperCase();
                      return (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 font-mono text-indigo-600 border-r border-dashed border-gray-100 text-left">{code}</td>
                          <td className="px-4 py-4 text-left border-r border-dashed border-gray-100 text-gray-600 truncate max-w-[400px]">{desc}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-100 font-black text-gray-400 uppercase text-[9px]">{t.PuestoTrabajo || '—'}</td>
                          <td className="px-4 py-4 font-mono text-teal-600 bg-teal-50/10">{Number(t.Tiempo || 0).toFixed(4)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-600" />
        <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
          Ingeniería Carrusel: Diámetro 3.2m | Gap de Manipulación Efectivo: 31.5 cm (+5% Distancia) | Cálculo Bloque 20m Real: Piezas longitudinales por bloque estándar.
        </p>
      </div>
    </div>
  );
};
