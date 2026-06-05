'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
  AlertTriangle
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

// --- CONSTANTES TÉCNICAS Y OPERATIVAS ---
const MACHINE_RADIO_CM = 350;    
const SECONDS_LOAD_BLOCK = 300;   
const SECONDS_REPETITION = 45;    
const SECONDS_CART_SWAP = 60;     

const MATERIALES_EXCLUIDOS = ["30009844", "30007116"];

// Reglas de Responsables por Centro
const RESPONSABLES_QUITO = ["013", "036", "038", "039", "044"];
const RESPONSABLES_GYE = ["002", "038", "039"];

// Recursos Operativos por Planta
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

const formatNum = (val: any, decimals: number = 0): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification, absenteeismEvents } = useAppContext();

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

  // Auxiliares para evitar errores de renderizado
  const getCellValue = (row: any, keys: string[]): string => {
    if (!row) return '';
    for (const key of keys) {
      const normalizedSearch = key.toLowerCase().replace(/_/g, '');
      const actualKey = Object.keys(row).find(k => k.toLowerCase().replace(/_/g, '') === normalizedSearch);
      if (actualKey) return String(row[actualKey]).trim();
    }
    return '';
  };

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
          serviciosService.OrdenesProvisionalesPaginados(1, 25000),
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
    const techPattern = catStr.match(/D(\d+)([a-zA-Z]+)/i);
    if (techPattern) {
      dimensions.dens = techPattern[1]; 
      dimensions.tipo = techPattern[2].toUpperCase(); 
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
    
    return { code, desc, categoria: catStr, ...dimensions };
  };

  const calculateOperativeHours = (o: any) => {
    const info = extractMaterialInfo(o);
    const qty = safeNum(o.CANTPROGRAMADA || o.CANTIDAD || 0);
    const ancho = parseFloat(info.ancho) || 0;
    const esp = parseFloat(info.esp) || 0;
    const densValue = parseFloat(info.dens) || 0;
    const usefulHeight = (densValue < 30) ? 103 : 85;
    const itemSubbloques = (qty * esp) / usefulHeight;
    const itemBloques20m = (ancho * itemSubbloques) / 2000;
    const physicalBlocksCount = Math.ceil(itemBloques20m);
    const tCarga = (physicalBlocksCount * SECONDS_LOAD_BLOCK);
    const tDescarga = (Math.ceil(qty / (esp > 10 ? 4 : 3)) * SECONDS_REPETITION);
    const tCoches = (Math.ceil(physicalBlocksCount / 2) * SECONDS_CART_SWAP);
    return (tCarga + tDescarga + tCoches) / 3600;
  };

  const filterDataByCenter = (data: any[], centro: string) => {
    return data.filter(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== centro) return false;
      const matStr = String(o.MATERIAL || o.CodMaterial || '').trim();
      if (MATERIALES_EXCLUIDOS.some(ex => matStr.includes(ex))) return false;
      const itemAlmValue = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      if (centro === '1000' && itemAlmValue !== '1006') return false;
      if (centro === '2000' && itemAlmValue !== '2006') return false;
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
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
  
  const tiemposC1000 = useMemo(() => tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim() === '1000'), [tiemposEnsamblado]);
  const tiemposC2000 = useMemo(() => tiemposEnsamblado.filter(t => String(t.Centro || t.centro || '').trim() === '2000'), [tiemposEnsamblado]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const itemCentro = String(o.Centro || o.CENTRO || o.centro || '').trim();
      if (itemCentro !== '1000' && itemCentro !== '2000') return;
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const validResps = itemCentro === '1000' ? RESPONSABLES_QUITO : RESPONSABLES_GYE;
      if (!validResps.includes(itemResp)) return;
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null') dates.add(d.includes('T') ? d.split('T')[0] : d);
    });
    return dates;
  }, [ordenes]);

  const calendarDays = useMemo(() => {
    if (!mounted || !viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

  const calculateSummary = (data: any[]) => {
    const groupsMap = new Map<string, { fecha: string; dens: string; tipo: string; units: number; subbloques: number; bloques20m: number; cargas: number; timeLog: number }>();
    data.forEach(o => {
      const dateRaw = String(o.FECHAINICIO || o.FECHA || 'N/A').trim();
      const fecha = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      const info = extractMaterialInfo(o);
      const key = `${fecha}|${info.dens}|${info.tipo}`;
      const qty = safeNum(o.CANTPROGRAMADA || o.CANTIDAD || 0);
      const ancho = parseFloat(info.ancho) || 0;
      const esp = parseFloat(info.esp) || 0;
      const densValue = parseFloat(info.dens) || 0;
      const usefulHeight = (densValue < 30) ? 103 : 85;
      const itemSubbloques = (qty * esp) / usefulHeight;
      const itemBloques20m = (ancho * itemSubbloques) / 2000;
      const physicalBlocksCount = Math.ceil(itemBloques20m);
      const totalCargas = physicalBlocksCount;
      const itemTimeLog = calculateOperativeHours(o);
      if (!groupsMap.has(key)) groupsMap.set(key, { fecha, dens: info.dens, tipo: info.tipo, units: 0, subbloques: 0, bloques20m: 0, cargas: 0, timeLog: 0 });
      const entry = groupsMap.get(key)!;
      entry.units += qty; entry.subbloques += itemSubbloques; entry.bloques20m += itemBloques20m; entry.cargas += totalCargas; entry.timeLog += itemTimeLog;
    });
    return Array.from(groupsMap.values()).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.dens.localeCompare(b.dens));
  };

  const summaryData1000 = useMemo(() => calculateSummary(provC1000), [provC1000]);
  const summaryData2000 = useMemo(() => calculateSummary(provC2000), [provC2000]);

  const getPlantaMetrics = (centerId: '1000' | '2000') => {
    const resources = OPERATIVE_RESOURCES[centerId];
    const centerOrders = centerId === '1000' ? provC1000 : provC2000;
    const globalPlanned = centerOrders.reduce((sum, o) => sum + calculateOperativeHours(o), 0);
    const globalUnits = centerOrders.reduce((sum, o) => sum + safeNum(o.CANTPROGRAMADA || o.CANTIDAD || 0), 0);
    const resourceDetails = resources.map(r => {
      const dispNeto = ((r.t1 + r.t2) - r.p) * r.rend;
      const resourceOrders = centerOrders.filter(o => {
        const maquina = String(o.MAQUINA || o.RECURSO || o.Maquina || '').trim().toUpperCase();
        return maquina === r.code.toUpperCase() || maquina.includes(r.code.toUpperCase());
      });
      const plannedHrs = resourceOrders.reduce((sum, o) => sum + calculateOperativeHours(o), 0);
      const plannedUnits = resourceOrders.reduce((sum, o) => sum + safeNum(o.CANTPROGRAMADA || o.CANTIDAD || 0), 0);
      return { ...r, dispNeto, plannedHrs, plannedUnits, occupancy: dispNeto > 0 ? (plannedHrs / dispNeto) * 100 : 0 };
    });
    const globalCap = resourceDetails.reduce((s, r) => s + r.dispNeto, 0);
    return { resourceDetails, globalCap, globalPlanned, globalUnits, globalOccupancy: globalCap > 0 ? (globalPlanned / globalCap) * 100 : 0 };
  };

  const metrics1000 = useMemo(() => getPlantaMetrics('1000'), [provC1000]);
  const metrics2000 = useMemo(() => getPlantaMetrics('2000'), [provC2000]);

  const filteredMantenimientos = useMemo(() => {
    if (selectedDate === 'all') return mantenimientos;
    return mantenimientos.filter(m => {
      const mDateRaw = String(m.FECHA_PRO || '').trim();
      const mDate = mDateRaw.includes('T') ? mDateRaw.split('T')[0] : mDateRaw;
      return mDate === selectedDate;
    });
  }, [mantenimientos, selectedDate]);

  const getPuestoDesdeHabilidades = (idMaquina: string) => {
    if (!idMaquina || !habilidades.length) return '—';
    const match = habilidades.find(h => {
      const maquinaSismacVal = getCellValue(h, ['MaquinaSismac', 'ID_MAQUINA', 'MAQUINA']);
      return maquinaSismacVal.toUpperCase() === String(idMaquina).trim().toUpperCase();
    });
    return match ? getCellValue(match, ['PuestoTrabajo', 'PUESTO', 'CARGO']) : '—';
  };

  const processedHabilidades = useMemo(() => {
    return habilidades.filter(h => {
      if (!habilidadesSearch.trim()) return true;
      const q = habilidadesSearch.toUpperCase();
      return Object.values(h).some(val => String(val || '').toUpperCase().includes(q));
    });
  }, [habilidades, habilidadesSearch]);

  const operationalSummaryData = useMemo(() => {
    if (selectedDate === 'all') return [];
    const results: any[] = [];
    const allResources = [...OPERATIVE_RESOURCES['1000'], ...OPERATIVE_RESOURCES['2000']];
    allResources.forEach(res => {
      const assignedOperators = habilidades.filter(h => {
        const maquinaSismacVal = getCellValue(h, ['MaquinaSismac', 'ID_MAQUINA', 'MAQUINA']);
        return maquinaSismacVal.toUpperCase() === res.code.toUpperCase();
      });
      const machineMaint = mantenimientos.filter(m => {
        const mDateRaw = String(m.FECHA_PRO || '').trim();
        const mDate = mDateRaw.includes('T') ? mDateRaw.split('T')[0] : mDateRaw;
        const idMaquina = String(m.ID_MAQUINA || '').trim().toUpperCase();
        return mDate === selectedDate && idMaquina === res.code.toUpperCase();
      });
      const totalMaintHours = machineMaint.reduce((sum, m) => sum + safeNum(m.TIEMPO), 0);
      if (assignedOperators.length > 0) {
        assignedOperators.forEach(op => {
          const operatorCode = getCellValue(op, ['IDENTIFICADOR', 'CODIGO', 'IDENTIFICADOR_OPERADOR', 'Id']);
          const operatorName = getCellValue(op, ['NOMBRE', 'Nom_Empleado', 'Nombre']);
          const skillLevel = getCellValue(op, ['CALIFICACION', 'NIVEL', 'PORCENTAJE', 'Calificacion']);
          const operatorAbsences = (absenteeismEvents || []).filter(event => {
            const isDateInRange = selectedDate >= event.startDate && selectedDate <= event.endDate;
            return isDateInRange && (event.employeeIds || []).includes(operatorCode);
          });
          const totalAbsenceHours = operatorAbsences.length > 0 ? 8 : 0;
          const baseHours = res.t1 + res.t2;
          const effectiveHours = Math.max(0, baseHours - totalMaintHours - totalAbsenceHours);
          results.push({
            turno: `${res.t1}h / ${res.t2}h`,
            maquina: `${res.code} - ${res.name}`,
            codigo: operatorCode,
            nombre: operatorName,
            habilidad: skillLevel ? `${skillLevel}%` : '—',
            horasEfectivas: effectiveHours.toFixed(1),
            tiempoMaint: totalMaintHours > 0 ? `${totalMaintHours}h` : '—',
            citasMedicas: totalAbsenceHours > 0 ? `${totalAbsenceHours}h` : '—'
          });
        });
      } else {
        results.push({
          turno: `${res.t1}h / ${res.t2}h`,
          maquina: `${res.code} - ${res.name}`,
          codigo: '—',
          nombre: 'SIN OPERADOR ASIGNADO',
          habilidad: '—',
          horasEfectivas: Math.max(0, (res.t1 + res.t2) - totalMaintHours).toFixed(1),
          tiempoMaint: totalMaintHours > 0 ? `${totalMaintHours}h` : '—',
          citasMedicas: '—'
        });
      }
    });
    return results;
  }, [selectedDate, habilidades, mantenimientos, absenteeismEvents]);

  const CapacityTab = ({ centerId, metrics }: { centerId: string, metrics: any }) => {
    const isQuito = centerId === '1000';
    return (
      <div className="space-y-3">
        <div className={cn("grid grid-cols-4 gap-2 p-3 rounded-2xl border shadow-sm", isQuito ? "bg-green-50/20 border-green-100" : "bg-blue-50/20 border-blue-100")}>
           <div className="text-center px-1">
             <p className="text-[7px] font-black uppercase text-slate-400 tracking-widest mb-1">Capacidad (H)</p>
             <p className="text-sm font-black text-slate-700 font-mono">{metrics.globalCap.toFixed(1)}</p>
           </div>
           <div className="text-center px-1 border-x border-slate-200">
             <p className="text-[7px] font-black uppercase text-slate-400 tracking-widest mb-1">Carga (H)</p>
             <p className="text-sm font-black text-indigo-600 font-mono">{metrics.globalPlanned.toFixed(1)}</p>
           </div>
           <div className="text-center px-1 border-r border-slate-200">
             <p className="text-[7px] font-black uppercase text-slate-400 tracking-widest mb-1">Unidades (UN)</p>
             <p className="text-sm font-black text-gray-800 font-mono">{metrics.globalUnits.toLocaleString()}</p>
           </div>
           <div className="text-center px-1">
             <p className="text-[7px] font-black uppercase text-slate-400 tracking-widest mb-1">Ocupación</p>
             <p className={cn("text-sm font-black font-mono", metrics.globalOccupancy > 100 ? "text-red-600" : "text-green-600")}>{metrics.globalOccupancy.toFixed(0)}%</p>
           </div>
        </div>
        <div className="overflow-hidden border border-gray-100 rounded-xl bg-white shadow-sm">
          <div className={cn("text-[8px] font-black uppercase text-white py-1 text-center tracking-widest", isQuito ? "bg-[#059669]" : "bg-[#2563eb]")}>Monitor Planta {centerId}</div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center font-sans text-[9px]">
              <thead className="bg-gray-50 text-slate-400 border-b border-gray-100">
                <tr className="uppercase font-black">
                  <th className="px-2 py-2 text-left border-r border-gray-100 w-24">Parámetro</th>
                  {metrics.resourceDetails.map((r: any) => <th key={r.code} className="px-1 py-2 text-center border-r border-gray-100 min-w-[70px]"><span className="text-slate-700">{r.code}</span></th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 font-bold">
                <tr><td className="px-2 py-1 text-slate-400 border-r border-gray-100 text-left uppercase text-[7px]">Turno 1 / 2</td>{metrics.resourceDetails.map((r: any) => <td key={r.code} className="px-1 py-1 border-r border-gray-100 font-mono text-gray-500">{r.t1}/{r.t2}</td>)}</tr>
                <tr className="bg-red-50/30"><td className="px-2 py-1 text-red-400 border-r border-gray-100 text-left uppercase text-[7px]">Paros (H)</td>{metrics.resourceDetails.map((r: any) => <td key={r.code} className="px-1 py-1 border-r border-gray-100 font-mono text-red-500/60">-{r.p}</td>)}</tr>
                <tr className="bg-blue-50/50"><td className="px-2 py-1 text-blue-900 border-r border-gray-100 text-left uppercase text-[7px] font-black">Plan [UN]</td>{metrics.resourceDetails.map((r: any) => <td key={r.code} className="px-1 py-1 border-r border-gray-100 font-mono font-black text-blue-600">{r.plannedUnits}</td>)}</tr>
                <tr className="bg-slate-900 text-white"><td className="px-2 py-1 text-white border-r border-white/5 text-left uppercase text-[7px]">Ocupación %</td>{metrics.resourceDetails.map((r: any) => <td key={r.code} className={cn("px-1 py-1 border-r border-white/5 font-mono font-black", r.occupancy > 100 ? "text-red-400" : "text-green-400")}>{r.occupancy.toFixed(0)}%</td>)}</tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl"><Wind className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Mando Táctico Corte Espuma</h2>
            <p className="text-xs text-gray-500 font-medium">Gestión Integrada de Capacidad, Habilidades y Mantenimiento SAP</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-8 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'resumen', l: 'Capacidad y Carga', i: LayoutDashboard }, 
            { v: 'resumenOperativo', l: 'Resumen Operativo', i: Activity },
            { v: 'habilidades', l: 'Habilidades', i: GraduationCap },
            { v: 'mantenimiento', l: 'Mantenimiento', i: Wrench }, 
            { v: 'grupos', l: 'Grupos', i: Users }, 
            { v: 'restricciones', l: 'Parámetros', i: Lock }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Catálogo Tiempos', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-8 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50/50 p-2.5 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl"><CalendarIcon className="w-3.5 h-3.5" /></div>
              <div>
                <p className="text-[8px] font-black uppercase text-gray-400 tracking-widest text-left">Horizonte Operativo</p>
                <h3 className="text-[10px] font-black text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'PLAN MAESTRO CONSOLIDADO' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-3 rounded-lg border-gray-200 gap-1.5 font-bold text-[9px] uppercase shadow-sm">
                  <Filter className="w-3 h-3 text-primary" /> Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-3 font-sans text-left">
                  {viewDate && (
                    <>
                      <div className="flex items-center justify-between mb-3 text-left">
                        <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                        <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6"><ChevronLeft className="w-3 h-3" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6"><ChevronRight className="w-3 h-3" /></Button>
                        </div>
                      </div>
                      <div className="grid grid-cols-7 gap-y-1 text-center mb-2">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <CapacityTab centerId="1000" metrics={metrics1000} />
            <CapacityTab centerId="2000" metrics={metrics2000} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {[ { t: 'Quito 1000', d: summaryData1000, id: '1000' }, { t: 'Guayaquil 2000', d: summaryData2000, id: '2000' } ].map((center, idx) => (
              <div key={idx} className="space-y-3">
                <h3 className="text-[9px] font-bold uppercase flex items-center gap-2 px-1 tracking-widest text-left text-slate-500">
                  <div className={cn("w-2 h-2 rounded-full", center.id === '1000' ? "bg-green-500" : "bg-blue-500")} /> Auditoría Técnica {center.t}
                </h3>
                <Card className="rounded-xl border border-gray-100 shadow-sm overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[350px]">
                    <table className="w-full border-collapse text-center font-sans">
                      <thead className="bg-[#bde0fe] sticky top-0 z-10 text-[8px] font-black uppercase text-slate-800 border-b border-gray-100">
                        <tr>
                          <th className="px-3 py-2 border-r border-gray-100">Fecha</th>
                          <th className="px-3 py-2 border-r border-gray-100">Densidad</th>
                          <th className="px-3 py-2 border-r border-gray-100 text-primary">Tipo</th>
                          <th className="px-3 py-2 border-r border-gray-100">Unidades</th>
                          <th className="px-3 py-2 border-r border-gray-100 text-purple-700">Subbloques</th>
                          <th className="px-3 py-2 border-r border-gray-100 text-orange-800 font-bold">Bloques 20m</th>
                          <th className="px-3 py-2 border-r border-gray-100 text-purple-800 font-bold">Cargas</th>
                          <th className="px-3 py-2 text-center text-teal-700 bg-teal-50/20">T. Operativo (H)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[9px] font-bold">
                        {center.d.length === 0 ? (
                          <tr><td colSpan={8} className="py-12 text-center text-gray-300 font-black uppercase tracking-widest opacity-20">Sin datos</td></tr>
                        ) : (
                          center.d.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50/80 transition-colors">
                              <td className="px-3 py-1.5 font-medium text-gray-400 border-r border-gray-50">{row.fecha}</td>
                              <td className="px-3 py-1.5 text-gray-700 border-r border-gray-50">{row.dens}</td>
                              <td className="px-3 py-1.5 font-black text-primary border-r border-gray-50 uppercase">{row.tipo}</td>
                              <td className="px-3 py-1.5 font-mono border-r border-gray-50">{String(row.units)}</td>
                              <td className="px-3 py-1.5 font-mono text-purple-700 border-r border-gray-50">{formatNum(row.subbloques, 1)}</td>
                              <td className="px-3 py-1.5 font-mono text-orange-800 border-r border-gray-50 bg-orange-50/5">{formatNum(row.bloques20m, 1)}</td>
                              <td className="px-3 py-1.5 font-mono text-purple-700 border-r border-gray-50 bg-purple-50/5">{String(Math.ceil(row.cargas))}</td>
                              <td className="px-3 py-1.5 font-mono text-teal-600 text-center bg-teal-50/5">{formatNum(row.timeLog, 2)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="resumenOperativo" className="space-y-4 animate-in fade-in duration-300">
           <div className="flex items-center justify-between bg-green-50 p-4 rounded-2xl border border-green-100 shadow-sm">
             <div className="flex items-center gap-4">
                <div className="p-3 bg-green-600/10 rounded-2xl text-green-600"><Activity className="w-6 h-6" /></div>
                <div>
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">Resumen Operativo Diario</h3>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Cruce Maestro: Máquinas | Operadores | MTTO | Ausentismos</p>
                </div>
             </div>
             {selectedDate !== 'all' ? (
                <Badge variant="outline" className="bg-white border-green-200 text-green-700 font-black text-[10px] uppercase h-8 px-4">
                  {format(parseISO(selectedDate), 'd MMMM yyyy', { locale: es })}
                </Badge>
             ) : (
                <div className="flex items-center gap-2 text-amber-600 animate-pulse">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Seleccione una fecha en el calendario</span>
                </div>
             )}
           </div>

           {selectedDate === 'all' ? (
              <div className="py-32 text-center border-2 border-dashed border-gray-100 rounded-3xl bg-gray-50/30">
                <CalendarIcon className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                <p className="text-[11px] font-black text-gray-300 uppercase tracking-widest">Por favor, seleccione una fecha en la pestaña de Capacidad para proyectar el resumen operativo</p>
              </div>
           ) : (
              <Card className="rounded-2xl border border-gray-100 shadow-lg overflow-hidden bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse font-sans text-left">
                    <thead className="bg-[#064e3b] text-white uppercase font-black tracking-widest text-[9px] sticky top-0 z-20">
                      <tr>
                        <th className="px-5 py-4 border-r border-white/5">Turno</th>
                        <th className="px-5 py-4 border-r border-white/5">MAQUINA</th>
                        <th className="px-5 py-4 border-r border-white/5">Codigo_Operador</th>
                        <th className="px-5 py-4 border-r border-white/5">Nom_Empleado</th>
                        <th className="px-4 py-4 border-r border-white/5 text-center">_Habilidades</th>
                        <th className="px-5 py-4 border-r border-white/5 text-right bg-black/10">Horas Efectivas</th>
                        <th className="px-5 py-4 border-r border-white/5 text-right bg-red-900/20">Tiempo_MTTO</th>
                        <th className="px-5 py-4 text-right bg-amber-900/20">Citas_Medicas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[10px] font-bold">
                      {operationalSummaryData.length === 0 ? (
                        <tr><td colSpan={8} className="py-20 text-center text-gray-300 uppercase font-black tracking-widest opacity-40">No hay datos operativos vinculados para esta fecha</td></tr>
                      ) : (
                        operationalSummaryData.map((row, idx) => (
                          <tr key={idx} className={cn("hover:bg-gray-50 transition-colors", row.nombre === 'SIN OPERADOR ASIGNADO' ? "bg-red-50/50" : "")}>
                            <td className="px-5 py-3 border-r border-gray-50 text-slate-400 font-mono">{row.turno}</td>
                            <td className="px-5 py-3 border-r border-gray-100 text-slate-800 font-black uppercase">{row.maquina}</td>
                            <td className="px-5 py-3 border-r border-gray-50 text-indigo-600 font-mono">{row.codigo}</td>
                            <td className="px-5 py-3 border-r border-gray-100 text-slate-700 uppercase">{row.nombre}</td>
                            <td className="px-4 py-3 border-r border-gray-50 text-center">
                              {row.habilidad !== '—' ? (
                                <Badge variant="outline" className={cn("text-[9px] font-black", parseFloat(row.habilidad) >= 100 ? "bg-green-50 text-green-700 border-green-200" : "bg-blue-50 text-blue-700 border-blue-200")}>
                                  {row.habilidad}
                                </Badge>
                              ) : '—'}
                            </td>
                            <td className="px-5 py-3 border-r border-gray-50 text-right font-black text-indigo-900 bg-indigo-50/10">
                              {row.horasEfectivas}h
                            </td>
                            <td className="px-5 py-3 border-r border-gray-50 text-right font-black text-red-600 bg-red-50/10">
                              {row.tiempoMaint}
                            </td>
                            <td className="px-5 py-3 text-right font-black text-amber-600 bg-amber-50/10">
                              {row.citasMedicas}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
           )}
        </TabsContent>

        <TabsContent value="habilidades" className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-2xl border border-indigo-100">
             <div className="flex items-center gap-3">
               <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-600"><GraduationCap className="w-5 h-5" /></div>
               <div>
                 <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter text-left">Cubo de Habilidades</h3>
                 <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 text-left">Visualización Completa de Columnas y Registros SAP</p>
               </div>
             </div>
             <div className="flex gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-3 w-3 text-gray-400" />
                  <input type="text" placeholder="Filtrar en toda la tabla..." value={habilidadesSearch} onChange={e => setHabilidadesSearch(e.target.value)} className="pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-[10px] font-bold w-64 focus:ring-2 focus:ring-indigo-500/20" />
                </div>
                <Badge variant="outline" className="bg-white border-indigo-200 text-indigo-700 font-black text-[10px] uppercase">{processedHabilidades.length} Registros</Badge>
             </div>
          </div>

          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full border-collapse text-left font-sans text-[9px]">
                <thead className="bg-[#e0e7ff] sticky top-0 z-10 text-indigo-900 uppercase font-black tracking-widest border-b border-indigo-200">
                  <tr>
                    {habilidades.length > 0 && Object.keys(habilidades[0]).map((key) => (
                      <th key={key} className="px-4 py-3 border-r border-indigo-100 whitespace-nowrap">{key.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold">
                  {processedHabilidades.length === 0 ? (
                    <tr><td colSpan={habilidades.length > 0 ? Object.keys(habilidades[0]).length : 1} className="py-20 text-center text-gray-300 uppercase tracking-widest opacity-30">No hay datos que coincidan con la búsqueda</td></tr>
                  ) : (
                    processedHabilidades.map((h, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                        {Object.keys(h).map((key) => (
                          <td key={key} className="px-4 py-2 border-r border-gray-100 text-slate-700">{String(h[key] ?? '—')}</td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="mantenimiento" className="space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between bg-amber-50 p-3 rounded-2xl border border-amber-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-amber-500/10 rounded-xl text-amber-600"><Wrench className="w-5 h-5" /></div>
              <div>
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">Mantenimiento Preventivo Programado</h3>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 text-left">
                   {selectedDate === 'all' ? 'PLAN MAESTRO CONSOLIDADO' : `FILTRADO PARA EL: ${selectedDate}`} | Control de Paros SAP
                </p>
              </div>
            </div>
            {selectedDate !== 'all' && (
              <Badge variant="outline" className="bg-white border-amber-200 text-amber-700 font-black text-[10px] uppercase">
                {filteredMantenimientos.length} Paros en esta fecha
              </Badge>
            )}
          </div>

          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full border-collapse text-left font-sans text-[9px]">
                <thead className="bg-[#fef3c7] sticky top-0 z-10 text-amber-900 uppercase font-black tracking-widest border-b border-amber-200">
                  <tr>
                    <th className="px-4 py-4 border-r border-amber-100">ID PLANTA</th>
                    <th className="px-4 py-4 border-r border-amber-100">PLANTA</th>
                    <th className="px-4 py-4 border-r border-amber-100">AREA</th>
                    <th className="px-4 py-4 border-r border-amber-100">ID MAQUINA</th>
                    <th className="px-4 py-4 border-r border-amber-100">MAQUINA</th>
                    <th className="px-4 py-4 border-r border-amber-100 bg-amber-100/50 text-indigo-900">PUESTO (SISMAC)</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-center">TIEMPO (H)</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-center">FECHA PROG.</th>
                    <th className="px-4 py-4 border-r border-amber-100 text-center">OT ID</th>
                    <th className="px-4 py-4 text-center">RANGO OT (INI - FIN)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold">
                  {filteredMantenimientos.length === 0 ? (
                    <tr><td colSpan={10} className="py-20 text-center text-gray-300 uppercase font-black tracking-widest opacity-30">No se detectan paros programados para el criterio de filtro</td></tr>
                  ) : (
                    filteredMantenimientos.map((m, i) => (
                      <tr key={i} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-4 py-3 border-r border-gray-100 text-slate-400 font-mono">{String(m.ID_PLANTA || '—')}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-slate-600 uppercase">{String(m.PLANTA || '—')}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-slate-500 uppercase">{String(m.AREA || '—')}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-amber-700 font-black">{String(m.ID_MAQUINA || '—')}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-slate-800 uppercase">{String(m.MAQUINA || '—')}</td>
                        <td className="px-4 py-3 border-r border-gray-100 bg-indigo-50/30 text-indigo-700 uppercase font-black">{getPuestoDesdeHabilidades(String(m.ID_MAQUINA))}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-center font-black text-red-600 bg-red-50/10">{String(m.TIEMPO || '—')}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-center font-mono text-slate-400">{String(m.FECHA_PRO || '—')}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-center font-black text-indigo-700">{String(m.OT_PRG_ID || '—')}</td>
                        <td className="px-4 py-3 text-center text-[8px] text-slate-400">
                          <div className="flex flex-col gap-0.5">
                            <span>{String(m.FECHA_OT_PRG_INI || '—')}</span>
                            <span className="opacity-50">↓</span>
                            <span>{String(m.FECHA_OT_PRG_FIN || '—')}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="grupos">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
            {grupos.map(g => (
              <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                <Badge className="bg-gray-100 text-gray-600 mb-2 font-bold text-[9px] uppercase">PLANTA {g.centro}</Badge>
                <h4 className="font-bold text-gray-800 uppercase text-sm">{g.nombre_grupo}</h4>
                <p className="text-[9px] font-mono text-gray-400 mt-2">ID: {g.codigo_grupo}</p>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="restricciones">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <table className="w-full border-collapse text-center">
              <thead className="bg-[#bde0fe] text-[10px] font-black uppercase text-slate-800 border-b border-gray-100">
                <tr><th className="px-6 py-5 border-r border-gray-100">Parámetro Técnico</th><th className="px-6 py-5 border-r border-gray-100">Valor</th><th className="px-6 py-5 text-left">Descripción Operativa</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-[11px] font-bold">
                {restricciones.map(r => (
                  <tr key={r.codigo_restriccion} className="hover:bg-gray-50/50">
                    <td className="px-6 py-4 text-gray-500 border-r border-gray-100 uppercase">{r.nombre_restriccion}</td>
                    <td className="px-6 py-4 border-r border-gray-100"><Badge variant="outline" className="font-mono text-indigo-700 border-indigo-200 bg-indigo-50/50">{r.valor_restriccion}</Badge></td>
                    <td className="px-6 py-4 text-gray-400 italic text-left">{r.descripcion || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-10">
          {[ { t: 'Quito 1000', d: provC1000, id: '1000' }, { t: 'Guayaquil 2000', d: provC2000, id: '2000' } ].map((center, idx) => (
            <div key={idx} className="space-y-4">
              <h3 className={cn("text-[11px] font-bold uppercase flex items-center gap-2 px-1 text-left", center.id === '1000' ? 'text-green-700' : 'text-indigo-700')}>
                <div className={cn("w-2 h-2 rounded-full", center.id === '1000' ? 'bg-green-600' : 'bg-indigo-600')} /> {center.t} ({center.d.length} registros)
              </h3>
              <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="w-full border-collapse text-center font-sans">
                    <thead className="bg-[#bde0fe] sticky top-0 z-10 text-[9px] font-black uppercase text-slate-800 border-b border-gray-100">
                      <tr>
                        <th className="px-3 py-4 border-r border-gray-100">Orden</th><th className="px-3 py-4 border-r border-gray-100">Fecha</th><th className="px-3 py-4 border-r border-gray-100">Material</th>
                        <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th><th className="px-3 py-4 border-r border-gray-100">Cant.</th><th className="px-3 py-4">ALM.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[10px] font-bold">
                      {center.d.length === 0 ? (
                        <tr><td colSpan={6} className="py-12 text-center text-gray-300 font-bold uppercase tracking-widest opacity-20">Sin registros</td></tr>
                      ) : (
                        center.d.map((o, i) => {
                          const info = extractMaterialInfo(o);
                          return (
                            <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                              <td className="px-3 py-2 text-gray-500 border-r border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                              <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                              <td className="px-3 py-2 font-mono text-primary border-r border-gray-100 tracking-tighter">{info.code}</td>
                              <td className="px-3 py-2 text-left border-r border-gray-100 truncate max-w-[200px] text-gray-500 uppercase">{info.desc}</td>
                              <td className="px-3 py-2 text-gray-900 border-r border-gray-100 font-mono">{String(o.CANTPROGRAMADA || o.CANTIDAD || 0)}</td>
                              <td className="px-3 py-2 font-bold text-gray-200">{o.Almacen || o.ALMACEN || '—'}</td>
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
          <div className="grid grid-cols-1 gap-10">
            {[ { t: 'Quito 1000', d: tiemposC1000 }, { t: 'Guayaquil 2000', d: tiemposC2000 } ].map((center, idx) => (
              <div key={idx} className="space-y-4">
                <h3 className="text-[11px] font-black uppercase text-gray-400 text-left tracking-widest px-1">Catálogo de Tiempos - {center.t}</h3>
                <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[400px]">
                    <table className="w-full border-collapse text-center font-sans">
                      <thead className="bg-[#bde0fe] sticky top-0 text-[10px] font-black uppercase text-slate-800 border-b border-gray-100">
                        <tr><th className="px-4 py-4 border-r border-gray-100">Material</th><th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th><th className="px-4 py-4 border-r border-gray-100 text-teal-700">Estándar (Min)</th></tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-[11px] font-bold">
                        {center.d.length === 0 ? (
                          <tr><td colSpan={3} className="py-12 text-center text-gray-300 font-bold uppercase tracking-widest opacity-30">No hay registros cargados</td></tr>
                        ) : (
                          center.d.map((t, i) => {
                            const info = extractMaterialInfo(t);
                            return (
                              <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                <td className="px-4 py-3 font-mono text-primary border-r border-gray-50 text-left">{info.code}</td>
                                <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[280px]">{info.desc}</td>
                                <td className="px-4 py-3 font-mono text-teal-600 bg-teal-50/5">{formatNum(t.Tiempo || t.Tiempo_Min || 0, 4)}</td>
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
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};
