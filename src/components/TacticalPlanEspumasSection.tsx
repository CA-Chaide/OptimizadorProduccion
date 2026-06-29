'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Scissors, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  ShoppingCart, 
  RefreshCw, 
  Wrench,
  Minus,
  Plus,
  TrendingUp,
  Box,
  Info,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Filter,
  Users,
  Activity,
  AlertCircle
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { serviciosService } from '@/services/servicios.service';
import { restriccionService } from '@/services/restriccion.service';
import { grupoService } from '@/services/grupo.service';
import { logger } from '@/services/LogService';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isValid } from 'date-fns';
import { es } from 'date-fns/locale';

// --- CONSTANTES TÉCNICAS ---
const CAROUSEL_CIRCUMFERENCE = Math.PI * 320; // 3.2m diámetro
const EFFICIENCY_FACTOR = 0.87;

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
  hasDeficit: boolean;
  stockUN: number;
  stockKg: number;
}

const safeNum = (val: any): number => {
  const n = Number(val);
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
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [isLoading, setIsLoading] = useState(true);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<any[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);
  const [inventarioSAP, setInventarioSAP] = useState<any[]>([]);
  const [mantenimientosSAP, setMantenimientosSAP] = useState<any[]>([]);
  const [tiemposCatalogo, setTiemposCatalogo] = useState<any[]>([]);
  const [operadoresCorte, setOperadoresCorte] = useState<any[]>([]);
  
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState<Date>(new Date());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // --- DASHBOARD CONFIG ---
  const [uioConfig, setUioConfig] = useState({
    shift: 'H1', nightShift: 'EMPTY', performance: 90,
    paros: { CR04: 0, CR03: 0, CR01: 0, CNC01: 0 },
    parosT2: { CR04: 0, CR03: 0, CR01: 0, CNC01: 0 },
    personnel: {} as Record<string, string>
  });

  const [gyeConfig, setGyeConfig] = useState({
    shift: 'H1', nightShift: 'EMPTY', performance: 75,
    paros: { CR02: 0, CR01: 0, LA02: 0 },
    parosT2: { CR02: 0, CR01: 0, LA02: 0 },
    personnel: {} as Record<string, string>
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
    { v: 'H1', l: '19:00 - 05:30', h: 10.5 },
    { v: 'H2', l: '21:00 - 05:30', h: 8.5 }
  ];

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = getProp(item, ['MATERIAL', 'Material', 'CodMaterial']);
    const nameStr = getProp(item, ['NOMBRE', 'NombreMaterial', 'Descripcion']);
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
      const height = densVal < 28 ? 103 : 85;
      const hTotal = info.esp * qty;
      const subB = height > 0 ? hTotal / height : 0;
      
      const gap = 15;
      const capGiro = info.ancho > 0 ? Math.floor(CAROUSEL_CIRCUMFERENCE / (info.ancho + gap)) : 0;
      const nBatches = Math.ceil(capGiro > 0 ? subB / capGiro : (subB > 0 ? 1 : 0));

      const tMatch = tiemposCatalogo.find(t => cleanCode(t.CodMaterial) === info.code && String(t.Centro).trim() === centroId);
      const tIndiv = tMatch ? safeNum(tMatch.Tiempo || tMatch.Tiempo_Min) : 0;

      const stockKg = inventarioSAP
        .filter(inv => cleanCode(inv.MATERIAL) === info.code)
        .reduce((sum, item) => sum + safeNum(item.LIBREUTILIZACION), 0);
      
      const pesoUN = (info.ancho * info.largo * info.esp * densVal) / 1000000;
      const stockUN = pesoUN > 0 ? stockKg / pesoUN : 0;

      return {
        orden: getProp(o, ['ORDENPREVISIONAL', 'ORDEN']) || '—',
        fecha: String(getProp(o, ['FECHAINICIO', 'FECHA'])).split('T')[0],
        material: info.code,
        descripcion: info.desc,
        ancho: info.ancho, largo: info.largo, esp: info.esp, dens: info.dens,
        cant: qty,
        peso: pesoUN * qty,
        alturaTotal: hTotal,
        subBloques: subB,
        nroCargas: nBatches,
        undBatch: (capGiro * height) / (info.esp || 1),
        tIndiv,
        tTotal: (tIndiv * qty) / 60,
        apertura: info.apertura,
        categoria: getProp(o, ['CATEGORIA', 'Categoria']) || '—',
        centro: centroId,
        almacen: getProp(o, ['Almacen', 'ALMACEN']),
        responsable: getProp(o, ['RESPCONTROLPROD', 'RESPCTRLPROD', 'RespControlProd']),
        hasDeficit: stockUN < qty,
        stockUN,
        stockKg
      };
    });
  }, [extractMaterialInfo, inventarioSAP, tiemposCatalogo]);

  const getAllowedResps = (centro: string) => {
    if (centro === '1000') return ['013', '038', '039', '044', '036'];
    if (centro === '2000') return ['002', '038', '039'];
    return [];
  };

  const getFilteredData = useCallback((rawData: any[], centro: string) => {
    const allowed = getAllowedResps(centro);
    return rawData.filter(o => {
      const c = String(getProp(o, ['Centro', 'CENTRO'])).trim();
      const r = String(getProp(o, ['RESPCONTROLPROD', 'RESPCTRLPROD', 'RespControlProd'])).trim();
      const dateRaw = String(getProp(o, ['FECHAINICIO', 'FECHA'])).trim();
      const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
      
      return c === centro && allowed.includes(r) && (selectedDates.size === 0 || selectedDates.has(date));
    });
  }, [selectedDates]);

  const provAuditUIO = useMemo(() => auditMapper(getFilteredData(ordenesProvisionales, '1000'), '1000'), [auditMapper, getFilteredData, ordenesProvisionales]);
  const provAuditGYE = useMemo(() => auditMapper(getFilteredData(ordenesProvisionales, '2000'), '2000'), [auditMapper, getFilteredData, ordenesProvisionales]);
  const fertAuditUIO = useMemo(() => auditMapper(getFilteredData(ordenesFert, '1000'), '1000'), [auditMapper, getFilteredData, ordenesFert]);
  const fertAuditGYE = useMemo(() => auditMapper(getFilteredData(ordenesFert, '2000'), '2000'), [auditMapper, getFilteredData, ordenesFert]);

  const totalPlannedUIO = useMemo(() => provAuditUIO.reduce((s, r) => s + r.tTotal, 0) + fertAuditUIO.reduce((s, r) => s + r.tTotal, 0), [provAuditUIO, fertAuditUIO]);
  const totalPlannedGYE = useMemo(() => provAuditGYE.reduce((s, r) => s + r.tTotal, 0) + fertAuditGYE.reduce((s, r) => s + r.tTotal, 0), [provAuditGYE, fertAuditGYE]);

  const calendarDaysList = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    [...ordenesProvisionales, ...ordenesFert].forEach(o => {
      const d = String(getProp(o, ['FECHA', 'FECHAINICIO']) || '').trim();
      if (d && d !== 'null') dates.add(d.split('T')[0]);
    });
    return dates;
  }, [ordenesProvisionales, ordenesFert]);

  const fetchDataAsync = useCallback(async () => {
    setIsLoading(true);
    try {
      const [groupsRes, restrsRes, provsRes, fertsRes, invRes, timesRes, skillsRes, maintRes] = await Promise.all([
        grupoService.getAll(),
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getInventarioAñoActual().catch(() => ({ data: [] })),
        serviciosService.getTiemposEnsamblado(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getCuboHabilidadesOP().catch(() => ({ data: [] })),
        serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] }))
      ]);

      setGrupos(groupsRes.data || []);
      setRestricciones(restrsRes.data || []);
      setOrdenesProvisionales(provsRes.data?.data || provsRes.data || []);
      setOrdenesFert(fertsRes.data?.data || fertsRes.data || []);
      setInventarioSAP(invRes.data || []);
      setTiemposCatalogo(timesRes.data?.data || timesRes.data || []);
      setMantenimientosSAP(Array.isArray(maintRes.data) ? maintRes.data : []);
      
      const skills = Array.isArray(skillsRes.data) ? skillsRes.data : [];
      setOperadoresCorte(skills.filter((s: any) => String(getProp(s, ['LineaProceso', 'LINEA_PROCESO'])).toUpperCase().includes('CORTE')));

    } catch (e) {
      logger.error('[Corte Espuma] Error sincronización', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { setMounted(true); setViewDate(new Date()); }, []);
  useEffect(() => { if (mounted) fetchDataAsync(); }, [mounted, fetchDataAsync]);

  const renderAuditTable = (data: UnifiedRow[], title: string) => {
    const grouped = data.reduce((acc, row) => {
      const key = `${row.apertura}|${row.categoria}`;
      if (!acc[key]) acc[key] = [];
      acc[key].push(row);
      return acc;
    }, {} as Record<string, UnifiedRow[]>);

    return (
      <div className="space-y-4 text-left">
        <h3 className="text-xs font-black uppercase text-slate-800 tracking-widest flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" /> {title} ({data.length})
        </h3>
        <div className="border border-slate-200 rounded-[2rem] overflow-hidden bg-white shadow-xl">
          <div className="overflow-x-auto max-h-[600px]">
            <table className="w-full text-center border-collapse text-[10px]">
              <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter sticky top-0 z-20">
                <tr>
                  <th className="px-4 py-4 border-r border-white/5 text-left">Material</th>
                  <th className="px-6 py-4 border-r border-white/5 text-left">Descripción Técnica</th>
                  <th className="px-2 py-4 border-r border-white/5">Ancho</th>
                  <th className="px-2 py-4 border-r border-white/5">Largo</th>
                  <th className="px-2 py-4 border-r border-white/5 text-blue-400">Esp.</th>
                  <th className="px-2 py-4 border-r border-white/5">Dens.</th>
                  <th className="px-3 py-4 border-r border-white/5">Cant.</th>
                  <th className="px-3 py-4 border-r border-white/5">Peso Kg</th>
                  <th className="px-3 py-4 border-r border-white/5 bg-slate-800">Alt. Total</th>
                  <th className="px-3 py-4 border-r border-white/5">Stock UN</th>
                  <th className="px-3 py-4 border-r border-white/5">Stock Kg</th>
                  <th className="px-3 py-4 border-r border-white/10 bg-indigo-500/20">T. Indiv</th>
                  <th className="px-4 py-4 border-r border-white/10 bg-indigo-600">T. Total H</th>
                  <th className="px-3 py-4 border-r border-white/5 bg-amber-500/20 text-amber-300">Cargas</th>
                  <th className="px-3 py-4 border-r border-white/5">Und/Batch</th>
                  <th className="px-3 py-4 border-r border-white/5"># SUB_Bloque</th>
                  <th className="px-3 py-4 border-r border-white/5">Planta/ALM</th>
                  <th className="px-3 py-4 border-r border-white/5">Resp. CP</th>
                  <th className="px-3 py-4">Orden</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
                {Object.entries(grouped).map(([key, items]) => {
                  const isExp = expandedGroups.has(key);
                  const tKg = items.reduce((s, r) => s + r.peso, 0);
                  const tH = items.reduce((s, r) => s + r.tTotal, 0);
                  const tBatches = items.reduce((s, r) => s + r.nroCargas, 0);

                  return (
                    <React.Fragment key={key}>
                      <tr className="bg-slate-50 cursor-pointer hover:bg-indigo-50 transition-colors" onClick={() => {const n = new Set(expandedGroups); isExp ? n.delete(key) : n.add(key); setExpandedGroups(n);}}>
                        <td className="px-4 py-3 text-left flex items-center gap-2 font-black text-indigo-900">
                           {isExp ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                           {key.split('|')[0]} — {key.split('|')[1]}
                        </td>
                        <td colSpan={6} className="text-right pr-10 italic opacity-40">Subtotales:</td>
                        <td className="px-3 py-3 font-black text-slate-900">{formatNum(tKg, 0)}</td>
                        <td colSpan={4} className="border-r border-slate-50"></td>
                        <td className="px-4 py-3 bg-indigo-600 text-white font-black">{tH.toFixed(1)}h</td>
                        <td className="px-3 py-3 bg-amber-500/10 text-amber-700 font-black">{tBatches}</td>
                        <td colSpan={4}></td>
                      </tr>
                      {isExp && items.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors font-mono text-[9px]">
                          <td className="px-4 py-2 border-r border-slate-50 text-indigo-600 font-black pl-8">{row.material}</td>
                          <td className="px-6 py-2 border-r border-slate-50 text-left uppercase truncate max-w-[200px]">{row.descripcion}</td>
                          <td className="px-2 py-2 border-r border-slate-50">{row.ancho}</td>
                          <td className="px-2 py-2 border-r border-slate-50">{row.largo}</td>
                          <td className="px-2 py-2 border-r border-slate-50 text-blue-600">{row.esp}</td>
                          <td className="px-2 py-2 border-r border-slate-50">{row.dens}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-900">{row.cant}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-400">{formatNum(row.peso, 1)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 bg-slate-50 text-slate-900">{row.alturaTotal.toFixed(1)}</td>
                          <td className="px-3 py-2 border-r border-slate-50">{formatNum(row.stockUN, 1)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-400">{formatNum(row.stockKg, 0)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-indigo-400">{row.tIndiv.toFixed(2)}</td>
                          <td className="px-4 py-2 border-r border-white/10 bg-indigo-50/50 text-indigo-800 font-black">{row.tTotal.toFixed(2)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 bg-amber-50/30 text-amber-700 font-black">{row.nroCargas}</td>
                          <td className="px-3 py-2 border-r border-slate-50">{Math.round(row.undBatch)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 font-black">{row.subBloques.toFixed(2)}</td>
                          <td className="px-3 py-2 border-r border-slate-50 text-slate-400">{row.centro}/{row.almacen}</td>
                          <td className="px-3 py-2 border-r border-slate-50">{row.responsable}</td>
                          <td className="px-3 py-2 text-slate-300">{row.orden}</td>
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

  const renderMachineColumn = (id: string, name: string, config: any, setConfig: any) => {
    const diaH = shiftOptions.find(o => o.v === config.shift)?.h || 0;
    const nightH = nightShiftOptions.find(o => o.v === config.nightShift)?.h || 0;
    const p1 = (config.paros[id] || 0) / 100;
    const p2 = (config.parosT2[id] || 0) / 100;
    const perf = (config.performance || 0) / 100;
    
    const tDisp = ((diaH * (1 - p1)) + (nightH * (1 - p2))) * perf * EFFICIENCY_FACTOR;

    return (
      <div key={id} className="flex flex-col border-r border-slate-700 last:border-r-0 min-w-[140px] text-left">
        <div className="bg-slate-800/50 p-2 text-center border-b border-slate-700">
           <p className="text-[9px] font-black text-indigo-400 uppercase tracking-tighter">{name}</p>
        </div>
        <div className="p-3 space-y-4">
           <div className="space-y-1">
             <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest text-center">PARO T1 (%)</p>
             <input type="number" value={config.paros[id]} onChange={e => setConfig({ ...config, paros: { ...config.paros, [id]: safeNum(e.target.value) } })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-center text-[10px] text-red-400 font-bold" />
           </div>
           <div className="space-y-1">
             <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest text-center">PARO T2 (%)</p>
             <input type="number" value={config.parosT2[id]} onChange={e => setConfig({ ...config, parosT2: { ...config.parosT2, [id]: safeNum(e.target.value) } })} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-center text-[10px] text-red-400 font-bold" />
           </div>
           <div className="space-y-2 border-t border-slate-700 pt-3">
             <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest text-center">PERSONAL DÍA</p>
             <select value={config.personnel[`${id}_day_op1`] || ''} onChange={e => setConfig({...config, personnel: {...config.personnel, [`${id}_day_op1`]: e.target.value}})} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-[8px] text-yellow-500 font-bold outline-none">
               <option value="">— OP1 —</option>
               {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CODIGO_OPERADOR'])}>{getProp(op, ['NOMBRE_OPERADOR'])}</option>)}
             </select>
             <select value={config.personnel[`${id}_day_op2`] || ''} onChange={e => setConfig({...config, personnel: {...config.personnel, [`${id}_day_op2`]: e.target.value}})} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-[8px] text-yellow-500 font-bold outline-none">
               <option value="">— OP2 AYUD —</option>
               {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CODIGO_OPERADOR'])}>{getProp(op, ['NOMBRE_OPERADOR'])}</option>)}
             </select>
           </div>
           <div className="space-y-2 border-t border-slate-700 pt-3">
             <p className="text-[7px] font-black text-slate-500 uppercase tracking-widest text-center">PERSONAL NOCHE</p>
             <select value={config.personnel[`${id}_night_op1`] || ''} onChange={e => setConfig({...config, personnel: {...config.personnel, [`${id}_night_op1`]: e.target.value}})} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-[8px] text-yellow-500 font-bold outline-none">
               <option value="">— OP1 —</option>
               {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CODIGO_OPERADOR'])}>{getProp(op, ['NOMBRE_OPERADOR'])}</option>)}
             </select>
             <select value={config.personnel[`${id}_night_op2`] || ''} onChange={e => setConfig({...config, personnel: {...config.personnel, [`${id}_night_op2`]: e.target.value}})} className="w-full bg-slate-900 border border-slate-700 rounded px-1 py-1 text-[8px] text-yellow-500 font-bold outline-none">
               <option value="">— OP2 AYUD —</option>
               {operadoresCorte.map((op, i) => <option key={i} value={getProp(op, ['CODIGO_OPERADOR'])}>{getProp(op, ['NOMBRE_OPERADOR'])}</option>)}
             </select>
           </div>
           <div className="pt-3 border-t border-slate-700 text-center">
              <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">DISP. NETA (H)</p>
              <span className="text-xs font-black text-emerald-400 tabular-nums">{tDisp.toFixed(2)}</span>
           </div>
        </div>
      </div>
    );
  };

  const renderTopConsolidation = () => {
    return (
      <div className="space-y-8 mb-10">
        <div className="bg-[#1e293b] border border-slate-700 rounded-[2rem] shadow-2xl overflow-hidden font-sans text-white text-left">
          <div className="grid grid-cols-12">
            <div className="col-span-2 p-6 border-r border-slate-700 bg-slate-900/50 flex flex-col justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">UBICACIÓN TÉCNICA</p>
                <h3 className="text-2xl font-black text-indigo-400 tracking-tighter">QUITO (UIO)</h3>
                <div className="mt-8 space-y-5">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-500 uppercase">JORNADA DÍA</p>
                    <select value={uioConfig.shift} onChange={e => setUioConfig({ ...uioConfig, shift: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-yellow-500 font-black">
                      {shiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-500 uppercase">JORNADA NOCHE</p>
                    <select value={uioConfig.nightShift} onChange={e => setUioConfig({ ...uioConfig, nightShift: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-yellow-500 font-black">
                      {nightShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-500 uppercase">RENDIMIENTO (%)</p>
                    <input type="number" value={uioConfig.performance} onChange={e => setUioConfig({ ...uioConfig, performance: safeNum(e.target.value) })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-emerald-400 font-black" />
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-8 flex overflow-x-auto">
               {['CR04', 'CR03', 'CR01', 'CNC01'].map(id => renderMachineColumn(id, id, uioConfig, setUioConfig))}
            </div>
            <div className="col-span-2 p-6 bg-slate-900/30 flex flex-col justify-center border-l border-slate-700">
               <div className="space-y-8">
                 <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase block mb-1">PLANIFICADO (H)</span>
                    <span className="text-3xl font-black text-indigo-400 tabular-nums">{totalPlannedUIO.toFixed(1)}</span>
                 </div>
                 <div className="pt-6 border-t border-slate-700">
                    <p className="text-[9px] font-black text-slate-500 uppercase mb-1">OCUPACIÓN</p>
                    <span className="text-2xl font-black tabular-nums text-emerald-400">
                       {((totalPlannedUIO / 32) * 100).toFixed(1)}%
                    </span>
                 </div>
               </div>
            </div>
          </div>
        </div>

        <div className="bg-[#1e293b] border border-slate-700 rounded-[2.5rem] shadow-2xl overflow-hidden font-sans text-white text-left">
          <div className="grid grid-cols-12">
            <div className="col-span-2 p-6 border-r border-slate-700 bg-slate-900/50 flex flex-col justify-between">
              <div>
                <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest mb-1">UBICACIÓN TÉCNICA</p>
                <h3 className="text-2xl font-black text-indigo-400 tracking-tighter">GYE (2000)</h3>
                <div className="mt-8 space-y-5">
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-500 uppercase">JORNADA DÍA</p>
                    <select value={gyeConfig.shift} onChange={e => setGyeConfig({ ...gyeConfig, shift: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-yellow-500 font-black">
                      {shiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-500 uppercase">JORNADA NOCHE</p>
                    <select value={gyeConfig.nightShift} onChange={e => setGyeConfig({ ...gyeConfig, nightShift: e.target.value })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-yellow-500 font-black">
                      {nightShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[8px] font-black text-slate-500 uppercase">RENDIMIENTO (%)</p>
                    <input type="number" value={gyeConfig.performance} onChange={e => setGyeConfig({ ...gyeConfig, performance: safeNum(e.target.value) })} className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-emerald-400 font-black" />
                  </div>
                </div>
              </div>
            </div>
            <div className="col-span-8 flex overflow-x-auto">
               {['CR02', 'CR01', 'LA02'].map(id => renderMachineColumn(id, id, gyeConfig, setGyeConfig))}
            </div>
            <div className="col-span-2 p-6 bg-slate-900/30 flex flex-col justify-center border-l border-slate-700">
               <div className="space-y-8">
                 <div>
                    <span className="text-[9px] font-black text-slate-500 uppercase block mb-1">PLANIFICADO (H)</span>
                    <span className="text-3xl font-black text-indigo-400 tabular-nums">{totalPlannedGYE.toFixed(1)}</span>
                 </div>
                 <div className="pt-6 border-t border-slate-700">
                    <p className="text-[9px] font-black text-slate-500 uppercase mb-1">OCUPACIÓN</p>
                    <span className="text-2xl font-black tabular-nums text-emerald-400">
                       {((totalPlannedGYE / 24) * 100).toFixed(1)}%
                    </span>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!mounted) return <div className="p-4 md:p-6 min-h-screen bg-white rounded-xl border border-gray-100 shadow-sm" />;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl shadow-inner"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Gestión de Cargas Carrusel | Redondeo Industrial Batches</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
           <Button onClick={fetchDataAsync} disabled={isLoading} className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sincronizar SAP
           </Button>
           <Popover>
            <PopoverTrigger asChild>
              <button className="h-10 px-5 rounded-2xl border border-gray-200 bg-white hover:border-red-500/50 flex items-center gap-3 font-black text-[11px] uppercase shadow-sm transition-all">
                <Filter className="w-4 h-4 text-red-500" /> 
                {selectedDates.size === 0 ? 'Filtro de Fecha' : `${selectedDates.size} días`}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[260px] p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-3" align="end">
              <div className="bg-white p-5 font-sans text-left text-[11px]">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="font-black text-slate-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                  <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
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
                      <button key={dStr} onClick={() => { const n = new Set(selectedDates); isSelected ? n.delete(dStr) : n.add(dStr); setSelectedDates(n); }} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-red-600 text-white shadow-md shadow-red-200" : "hover:bg-slate-50")}>
                        <span className={cn("text-xs font-black", isSelected ? "text-white" : (datesWithOrders.has(dStr) ? "text-slate-800" : "text-slate-200"))}>{format(day, 'd')}</span>
                        {datesWithOrders.has(dStr) && !isSelected && <div className="absolute bottom-1.5 w-1 h-1 bg-red-400 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-red-600 h-9 mt-1 rounded-xl tracking-widest" onClick={() => setSelectedDates(new Set())}>Ver Todo</Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[ 
            { v: 'resumen', l: 'Capacidad Operativa', i: LayoutDashboard },
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'ordenesFert', l: 'Órdenes FERT', i: ShoppingCart },
            { v: 'mantenimiento', l: 'Mantenimiento', i: Wrench },
            { v: 'grupos', l: 'Grupos', i: Users }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-red-600 rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6">
          <TabsContent value="resumen" className="animate-in fade-in duration-300">
            {renderTopConsolidation()}
            <div className="py-24 text-center bg-gray-50/30 rounded-[3rem] border-2 border-dashed border-gray-100">
               <Activity className="w-16 h-16 text-indigo-100 mx-auto" />
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Auditoría consolidada lista para análisis táctico</p>
            </div>
          </TabsContent>

          <TabsContent value="ordenes" className="animate-in fade-in duration-300 space-y-10">
            {renderAuditTable(provAuditUIO, "AUDITORÍA TÉCNICA QUITO (1000) — PROVISIONALES")}
            {renderAuditTable(provAuditGYE, "AUDITORÍA TÉCNICA GUAYAQUIL (2000) — PROVISIONALES")}
          </TabsContent>

          <TabsContent value="ordenesFert" className="animate-in fade-in duration-300 space-y-10">
            {renderAuditTable(fertAuditUIO, "AUDITORÍA TÉCNICA QUITO (1000) — ÓRDENES FERT")}
            {renderAuditTable(fertAuditGYE, "AUDITORÍA TÉCNICA GUAYAQUIL (2000) — ÓRDENES FERT")}
          </TabsContent>

          <TabsContent value="mantenimiento" className="animate-in fade-in duration-300 text-left space-y-4">
            <div className="flex items-center gap-3 px-2">
              <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><Wrench className="w-4 h-4" /></div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Carga de Mantenimiento Preventivo SAP</h3>
            </div>
            <div className="border border-slate-200 rounded-[2.5rem] overflow-hidden bg-white shadow-xl">
              <div className="overflow-x-auto max-h-[600px]">
                <table className="w-full text-center border-collapse text-[10px]">
                  <thead className="bg-[#0f172a] text-white border-b border-white/5 uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                    <tr>
                      <th className="px-6 py-5 border-r border-white/5">Planta</th>
                      <th className="px-6 py-5 border-r border-white/5">Área</th>
                      <th className="px-6 py-5 border-r border-white/5">ID OT</th>
                      <th className="px-6 py-5 border-r border-white/5">Máquina</th>
                      <th className="px-6 py-5 border-r border-white/5">Inicio</th>
                      <th className="px-6 py-5 border-r border-white/5">Fin</th>
                      <th className="px-6 py-5 text-indigo-300 bg-indigo-900/40">TIEMPO_MANTENIMIENTO (MIN)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-black text-[11px] text-slate-700">
                    {mantenimientosSAP.length === 0 ? (
                      <tr><td colSpan={7} className="py-24 text-slate-300 uppercase font-black tracking-widest italic opacity-50">Sin mantenimientos programados detectados</td></tr>
                    ) : (
                      mantenimientosSAP.map((row, i) => {
                        const ini = new Date(getProp(row, ['FECHA_OT_PRG_INI']));
                        const fin = new Date(getProp(row, ['FECHA_OT_PRG_FIN']));
                        const diffMin = isValid(ini) && isValid(fin) ? Math.round((fin.getTime() - ini.getTime()) / 60000) : 0;
                        return (
                          <tr key={i} className="hover:bg-indigo-50/10 transition-colors">
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 uppercase">{getProp(row, ['ID_PLANTA'])}</td>
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 uppercase">{getProp(row, ['AREA'])}</td>
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 font-mono text-indigo-600">{getProp(row, ['OT_PRG_ID'])}</td>
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 uppercase">{getProp(row, ['ID_MAQUINA'])}</td>
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 font-mono">{getProp(row, ['FECHA_OT_PRG_INI'])}</td>
                            <td className="px-6 py-3 border-r border-dashed border-gray-100 font-mono">{getProp(row, ['FECHA_OT_PRG_FIN'])}</td>
                            <td className="px-6 py-3 font-mono text-indigo-700 bg-indigo-50/30">{diffMin}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="grupos" className="animate-in fade-in duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-left">
              {grupos.map(g => (
                <Card key={g.codigo_grupo} className="relative overflow-hidden group hover:shadow-md transition-all border border-gray-100 rounded-2xl bg-white p-6">
                  <div className="absolute top-0 left-0 w-1 h-full bg-red-600 group-hover:bg-red-700" />
                  <Badge className="bg-red-50 text-red-700 mb-2 font-bold text-[9px] uppercase border-red-200">PLANTA {g.centro}</Badge>
                  <h4 className="font-bold text-gray-800 uppercase text-sm">{g.nombre_grupo}</h4>
                  <p className="text-[9px] font-mono text-gray-400 mt-2">ID: {g.codigo_grupo}</p>
                </Card>
              ))}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};
