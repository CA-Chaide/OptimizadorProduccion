'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Scissors, Package, Loader2, Clock, LayoutDashboard, ClipboardList, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, Activity, DatabaseZap, PlayCircle, Info, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface RawBOMRow {
  NIVEL: string;
  CENTRO: string;
  FERT_PRINCIPAL: string;
  DESCRIPCION_FERT: string;
  MATERIAL_PADRE: string;
  COMPONENTE: string;
  DESCRIPCION_COMPONENTE: string;
  CANTIDAD_UNITARIA: number;
  CANTIDAD_ACUMULADA: number;
}

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

// Helper robusto para extraer propiedades de objetos de la API SAP (Case-insensitive)
const getProp = (obj: any, key: string): string => {
  if (!obj) return '';
  const searchKey = key.toUpperCase().trim();
  const foundKey = Object.keys(obj).find(k => k.toUpperCase().trim() === searchKey);
  return foundKey ? String(obj[foundKey]).trim() : '';
};

const getNumProp = (obj: any, key: string): number => {
  if (!obj) return 0;
  const searchKey = key.toUpperCase().trim();
  const foundKey = Object.keys(obj).find(k => k.toUpperCase().trim() === searchKey);
  return foundKey ? safeNum(obj[foundKey]) : 0;
};

export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanLaminado');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('ordenes');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState(new Date());

  // Estado para la explosión de materiales
  const [isExploding, setIsExploding] = useState(false);
  const [explosionProgress, setExplosionProgress] = useState({ current: 0, total: 0 });
  const [bomRows, setBomRows] = useState<RawBOMRow[]>([]);
  const [bomPage, setBomPage] = useState(1);
  const [bomRowsPerPage, setBomRowsPerPage] = useState(100);
  const [bomSearch, setBomSearch] = useState('');

  const HOJAS_RUTA_VALIDAS = ["HR-ACH", "HR-BO", "HR-LAMIN"];

  const fetchGrupos = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return (name.includes('corte y laminado') || name.includes('laminado'));
      });
      setGrupos(filtered);
      return filtered;
    } catch (error) {
      return [];
    }
  };

  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      const res = await restriccionService.getAll();
      const filtered = (res.data || []).filter(r => gruposIds.includes(r.codigo_grupo));
      setRestriccionesArray(filtered);
      return filtered;
    } catch (error) {
      return [];
    }
  };

  const fetchOrdenes = async () => {
    try {
      const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      const data = resProv.data?.data || resProv.data || [];
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error cargando órdenes:', error);
    }
  };

  const fetchTiemposEnsamblado = async () => {
    try {
      const res = await serviciosService.getTiemposEnsamblado(1, 15000);
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data)) {
        setTiemposEnsamblado(data);
      }
    } catch (error) {
      console.error('Error cargando tiempos:', error);
    }
  };

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      const groups = await fetchGrupos();
      const ids = groups.map(g => g.codigo_grupo);
      await Promise.all([
        fetchRestricciones(ids),
        fetchOrdenes(),
        fetchTiemposEnsamblado()
      ]);
      setIsLoading(false);
    };
    init();
  }, []);

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || item.codigo_material || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || item.material || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    return { code, desc, raw: matStr };
  };

  const tiemposMap = useMemo(() => {
    const map = new Map<string, any>();
    tiemposEnsamblado.forEach(t => {
      const { code } = extractMaterialInfo(t);
      if (code) map.set(code, t);
    });
    return map;
  }, [tiemposEnsamblado]);

  const groupedOrdersByRouting = useMemo(() => {
    const groups: Record<string, any[]> = {};
    HOJAS_RUTA_VALIDAS.forEach(hr => { groups[hr] = []; });

    ordenes.forEach(o => {
      if (selectedDate !== 'all') {
        const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
        if (itemDate !== selectedDate) return;
      }

      const { code } = extractMaterialInfo(o);
      const maestroData = tiemposMap.get(code);
      const hrValue = String(maestroData?.HojaRuta || o.HojaRuta || '').toUpperCase();
      
      for (const hrKey of HOJAS_RUTA_VALIDAS) {
        if (hrValue.includes(hrKey)) {
          groups[hrKey].push(o);
          break;
        }
      }
    });

    return groups;
  }, [ordenes, selectedDate, tiemposMap]);

  const filteredOrdersFlat = useMemo(() => {
    return Object.values(groupedOrdersByRouting).flat();
  }, [groupedOrdersByRouting]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const d = String(o.FECHAINICIO || o.FECHA || '').trim();
      if (d && d !== 'null' && d !== 'undefined') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes]);

  const calendarDays = useMemo(() => {
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate]);

  // MOTOR DE EXPLOSIÓN TÉCNICA AUTOMÁTICA
  const handleProcessExplosion = async () => {
    if (ordenes.length === 0) return;

    setIsExploding(true);
    setBomRows([]);
    setBomPage(1);
    
    // Obtenemos códigos únicos de las órdenes provisionales
    const uniqueOrderMaterials = Array.from(new Set(ordenes.map(o => extractMaterialInfo(o).code)));
    
    setExplosionProgress({ current: 0, total: uniqueOrderMaterials.length });

    const allRows: RawBOMRow[] = [];

    try {
      for (let i = 0; i < uniqueOrderMaterials.length; i++) {
        const code = uniqueOrderMaterials[i];
        const refOrder = ordenes.find(o => extractMaterialInfo(o).code === code);
        const centro = String(refOrder?.CENTRO || refOrder?.Centro || "1000").trim();
        
        try {
          // Consultamos la explosión técnica jerárquica desde SAP mediante el nuevo procedimiento unificado
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, code, 1, 5000);
          const rawData = response?.data?.data || response?.data || [];

          if (Array.isArray(rawData)) {
            rawData.forEach((row: any) => {
              // EXCLUSIÓN ESTRICTA CENTRO 2000
              const rowCentro = getProp(row, 'CENTRO');
              if (rowCentro === '2000') return;

              allRows.push({
                NIVEL: getProp(row, 'NIVEL'),
                CENTRO: rowCentro,
                FERT_PRINCIPAL: getProp(row, 'FERT_PRINCIPAL'),
                DESCRIPCION_FERT: getProp(row, 'DESCRIPCION_FERT'),
                MATERIAL_PADRE: getProp(row, 'MATERIAL_PADRE'),
                COMPONENTE: getProp(row, 'COMPONENTE'),
                DESCRIPCION_COMPONENTE: getProp(row, 'DESCRIPCION_COMPONENTE'),
                CANTIDAD_UNITARIA: getNumProp(row, 'CANTIDAD_UNITARIA'),
                CANTIDAD_ACUMULADA: getNumProp(row, 'CANTIDAD_ACUMULADA')
              });
            });
          }
        } catch (err) {
          console.warn(`Error al explosionar material ${code}:`, err);
        }
        
        setExplosionProgress(prev => ({ ...prev, current: i + 1 }));
      }
      
      setBomRows(allRows);
      inspector.captureVariable('bomRowsCount', allRows.length);
    } catch (err) {
      console.error(`Error crítico en explosión: ${(err as Error).message}`);
    } finally {
      setIsExploding(false);
    }
  };

  // Disparador automático al entrar en la pestaña
  useEffect(() => {
    if (activeTab === 'listaMateriales' && !isExploding && ordenes.length > 0 && bomRows.length === 0) {
      handleProcessExplosion();
    }
  }, [activeTab, ordenes.length]);

  const filteredBomRows = useMemo(() => {
    if (!bomSearch.trim()) return bomRows;
    const q = bomSearch.toLowerCase();
    return bomRows.filter(r => 
      r.COMPONENTE.toLowerCase().includes(q) || 
      r.DESCRIPCION_COMPONENTE.toLowerCase().includes(q) ||
      r.FERT_PRINCIPAL.toLowerCase().includes(q) ||
      r.MATERIAL_PADRE.toLowerCase().includes(q)
    );
  }, [bomRows, bomSearch]);

  const totalBomPages = Math.max(1, Math.ceil(filteredBomRows.length / bomRowsPerPage));
  const paginatedBomRows = useMemo(() => {
    const start = (bomPage - 1) * bomRowsPerPage;
    return filteredBomRows.slice(start, start + bomRowsPerPage);
  }, [filteredBomRows, bomPage, bomRowsPerPage]);

  const bomTotals = useMemo(() => {
    return filteredBomRows.reduce((acc, row) => ({
      unitaria: acc.unitaria + row.CANTIDAD_UNITARIA,
      acumulada: acc.acumulada + row.CANTIDAD_ACUMULADA
    }), { unitaria: 0, acumulada: 0 });
  }, [filteredBomRows]);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-red-600" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Laminado</h2>
            <p className="text-xs text-gray-500 font-medium">Gestión Técnica y Auditoría de BOOM</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'listaMateriales', l: 'Lista Materiales', i: ClipboardList },
            { v: 'tiempos', l: 'Tiempos Ensamblado', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ordenes" className="animate-in fade-in duration-300 space-y-6">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-red-600/10 rounded-xl"><CalendarIcon className="w-4 h-4 text-red-600" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Fecha de Operación</p>
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Vista Consolidada (Planta)' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 px-6 rounded-2xl border-gray-200 hover:bg-white hover:border-red-500/50 gap-2 font-bold text-xs uppercase transition-all shadow-sm">
                  <Filter className="w-4 h-4" /> Filtrar Fecha
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-4 font-sans text-left">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                    <div className="flex gap-1 bg-gray-50 rounded-xl p-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-7 w-7 hover:bg-white hover:shadow-sm"><ChevronLeft className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-7 w-7 hover:bg-white hover:shadow-sm"><ChevronRight className="w-4 h-4" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-y-1 text-center mb-3">
                    {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((day, idx) => <div key={`cal-head-${idx}`} className="text-[9px] font-bold text-gray-300 uppercase py-1">{day}</div>)}
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={`cal-pad-${idx}`} className="p-1" />;
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isSelected = selectedDate === dateStr;
                      return (
                        <button key={dateStr} onClick={() => setSelectedDate(isSelected ? 'all' : dateStr)} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-red-600 text-white shadow-md" : "hover:bg-gray-100")}>
                          <span className={cn("text-xs font-bold", !datesWithOrders.has(dateStr) && !isSelected ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                          {datesWithOrders.has(dateStr) && !isSelected && <div className="absolute bottom-1.5 w-1 h-1 bg-red-600/40 rounded-full" />}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-red-600 h-8 mt-1 rounded-xl hover:bg-red-50 tracking-widest" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full border-collapse text-center font-sans text-[11px]">
                <thead className="bg-[#1e293b] text-white sticky top-0 z-10 uppercase font-black tracking-tight">
                  <tr>
                    <th className="px-5 py-4 border-r border-white/5">Orden</th>
                    <th className="px-5 py-4 border-r border-white/5">Fecha</th>
                    <th className="px-5 py-4 border-r border-white/5">Material</th>
                    <th className="px-5 py-4 border-r border-white/5 text-left">Descripción</th>
                    <th className="px-5 py-4 border-r border-white/5">Cant.</th>
                    <th className="px-5 py-4 border-r border-white/5 text-blue-300">Hoja Ruta</th>
                    <th className="px-5 py-4 border-r border-white/5 text-amber-300">Máquina</th>
                    <th className="px-5 py-4">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredOrdersFlat.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-gray-400 italic font-black uppercase tracking-widest opacity-30 text-center">Sin órdenes autorizadas en este horizonte</td></tr>
                  ) : (
                    filteredOrdersFlat.map((o, i) => {
                      const info = extractMaterialInfo(o);
                      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                      const maestroData = tiemposMap.get(info.code);
                      const maquina = String(o.MAQUINA || o.Maquina || o.RECURSO || '—').trim();

                      return (
                        <tr key={i} className="hover:bg-gray-50 transition-colors group">
                          <td className="px-4 py-4 font-bold text-gray-900 border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                          <td className="px-4 py-4 font-mono font-black text-red-600 border-r border-dashed border-gray-100 tracking-tighter">{info.code}</td>
                          <td className="px-4 py-4 text-left border-r border-dashed border-gray-100 truncate max-w-[280px] text-gray-600 font-bold uppercase">{info.desc}</td>
                          <td className="px-4 py-4 font-black text-gray-900 border-r border-dashed border-gray-100 font-mono text-xs">{qty.toLocaleString()}</td>
                          <td className="px-4 py-4 font-black text-indigo-700 border-r border-dashed border-gray-100 bg-indigo-50/10 uppercase italic">{maestroData?.HojaRuta || '—'}</td>
                          <td className="px-4 py-4 font-black text-amber-700 border-r border-dashed border-gray-100 bg-amber-50/10 uppercase">{maquina}</td>
                          <td className="px-4 py-4 font-bold text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="listaMateriales" className="space-y-6 animate-in fade-in duration-300">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm text-left">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">BOOM de Lista de Materiales (Planta Quito)</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  Integración Directa SAP | Exclusión Planta Gye | Auditoría Jerárquica
                </p>
              </div>
            </div>
            
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar en el BOOM..." 
                value={bomSearch}
                onChange={(e) => { setBomSearch(e.target.value); setBomPage(1); }}
                className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-red-500/50"
              />
            </div>
          </div>

          {isExploding && (
            <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 text-left">
              <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                <span className="flex items-center gap-2">
                  <Activity className="w-3 h-3" />
                  Consultando Motor Técnico SAP...
                </span>
                <span>{explosionProgress.current} / {explosionProgress.total} materiales procesados</span>
              </div>
              <Progress value={(explosionProgress.current / explosionProgress.total) * 100} className="h-2 bg-indigo-100" />
            </div>
          )}

          {!isExploding && bomRows.length > 0 ? (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-xl">
                <div className="overflow-x-auto max-h-[600px] relative text-left">
                  <table className="w-full border-collapse font-sans text-[10px]">
                    <thead className="bg-[#bde0fe] text-[#003566] uppercase font-black tracking-tight sticky top-0 z-20 border-b border-blue-200">
                      <tr>
                        <th className="px-4 py-3 border-r border-blue-200 text-center">NIVEL</th>
                        <th className="px-4 py-3 border-r border-blue-200">CENTRO</th>
                        <th className="px-4 py-3 border-r border-blue-200">FERT_PRINCIPAL</th>
                        <th className="px-4 py-3 border-r border-blue-200">DESCRIPCION_FERT</th>
                        <th className="px-4 py-3 border-r border-blue-200">MATERIAL_PADRE</th>
                        <th className="px-4 py-3 border-r border-blue-200">COMPONENTE</th>
                        <th className="px-4 py-3 border-r border-blue-200">DESCRIPCION_COMPONENTE</th>
                        <th className="px-4 py-3 border-r border-blue-200 text-right">CANTIDAD_UNITARIA</th>
                        <th className="px-4 py-3 text-right">CANTIDAD_ACUMULADA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {paginatedBomRows.map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                          <td className="px-4 py-2 border-r border-gray-100 font-black text-center text-slate-400">
                            {row.NIVEL}
                          </td>
                          <td className="px-4 py-2 border-r border-gray-100 font-bold text-gray-500">{row.CENTRO}</td>
                          <td className="px-4 py-2 border-r border-gray-100 font-mono font-bold text-indigo-600">{row.FERT_PRINCIPAL}</td>
                          <td className="px-4 py-2 border-r border-gray-100 text-gray-400 font-bold uppercase truncate max-w-[180px]">{row.DESCRIPCION_FERT}</td>
                          <td className="px-4 py-2 border-r border-gray-100 font-mono text-gray-400">{row.MATERIAL_PADRE}</td>
                          <td className="px-4 py-2 border-r border-gray-100 font-mono font-black text-slate-700">{row.COMPONENTE}</td>
                          <td className="px-4 py-2 border-r border-gray-100 font-black text-slate-600 uppercase">{row.DESCRIPCION_COMPONENTE}</td>
                          <td className="px-4 py-2 border-r border-gray-100 text-right font-mono font-bold text-slate-500">
                            {row.CANTIDAD_UNITARIA.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-black text-slate-800 bg-slate-50/10">
                            {row.CANTIDAD_ACUMULADA.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-30 bg-slate-100 text-slate-800 font-black uppercase border-t-2 border-slate-300">
                      <tr>
                        <td colSpan={7} className="px-4 py-3 text-right tracking-widest bg-slate-50">Total general:</td>
                        <td className="px-4 py-3 text-right font-mono bg-white border-r border-slate-200">
                          {bomTotals.unitaria.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-4 py-3 text-right font-mono bg-white text-indigo-700">
                          {bomTotals.acumulada.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-left">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Filas por página:</span>
                  <select 
                    value={bomRowsPerPage} 
                    onChange={(e) => { setBomRowsPerPage(Number(e.target.value)); setBomPage(1); }}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {[100, 250, 500].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                    Mostrando {Math.min(filteredBomRows.length, (bomPage-1)*bomRowsPerPage + 1)}-{Math.min(filteredBomRows.length, bomPage*bomRowsPerPage)} de {filteredBomRows.length}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => setBomPage(1)} disabled={bomPage === 1} className="h-8 w-8 rounded-xl"><ChevronsLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => setBomPage(prev => Math.max(1, prev - 1))} disabled={bomPage === 1} className="h-8 w-8 rounded-xl"><ChevronLeft className="h-4 w-4" /></Button>
                  <div className="flex items-center gap-1 px-4">
                    <span className="text-[10px] font-black text-gray-700 uppercase">Página {bomPage} / {totalBomPages}</span>
                  </div>
                  <Button variant="outline" size="icon" onClick={() => setBomPage(prev => Math.min(totalBomPages, prev + 1))} disabled={bomPage === totalBomPages} className="h-8 w-8 rounded-xl"><ChevronRight className="h-4 w-4" /></Button>
                  <Button variant="outline" size="icon" onClick={() => setBomPage(totalBomPages)} disabled={bomPage === totalBomPages} className="h-8 w-8 rounded-xl"><ChevronsRight className="h-4 w-4" /></Button>
                </div>
              </div>
            </div>
          ) : !isExploding && (
            <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100">
              <DatabaseZap className="w-16 h-16 text-indigo-100 mx-auto" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Analizando Estructura Técnica en SAP...</p>
            </div>
          )}

          <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2 text-left">
            <Info className="w-4 h-4 text-blue-600" />
            <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
              Nota: Auditoría íntegra basada en el método de explosión jerárquica masiva de SAP.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300">
           <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[700px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-[#1e293b] text-white sticky top-0 z-10 text-[10px] font-black uppercase tracking-tight border-b border-white/5">
                  <tr>
                    <th className="px-5 py-4 border-r border-white/5">Material</th>
                    <th className="px-5 py-4 border-r border-white/5 text-left">Descripción Técnica</th>
                    <th className="px-5 py-4 border-r border-white/5">Puesto Trabajo</th>
                    <th className="px-5 py-4 border-r border-white/5">Línea</th>
                    <th className="px-5 py-4 border-r border-white/5 text-teal-400 font-black">Tiempo Estándar (Min)</th>
                    <th className="px-5 py-4 border-r border-white/5">Stock Actual</th>
                    <th className="px-5 py-4 font-black">Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px]">
                  {tiemposEnsamblado.length === 0 ? (
                    <tr><td colSpan={7} className="py-24 text-gray-400 italic font-black uppercase tracking-widest opacity-30 text-center">Sin registros técnicos cargados</td></tr>
                  ) : (
                    tiemposEnsamblado.map((t, i) => {
                      const info = extractMaterialInfo(t);
                      return (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-4 font-mono font-black text-indigo-600 border-r border-dashed border-gray-100 tracking-tighter">{info.code}</td>
                          <td className="px-4 py-4 text-left border-r border-dashed border-gray-100 text-gray-600 font-bold uppercase truncate max-w-[280px]">{info.desc}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-100 font-black text-gray-400 uppercase text-[9px]">{t.PuestoTrabajo || '—'}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-100 font-black text-slate-400 uppercase text-[9px]">{t.Linea || '—'}</td>
                          <td className="px-4 py-4 font-mono font-black text-teal-600 border-r border-dashed border-gray-100 bg-teal-50/5">
                            {Number(t.Tiempo_Min || t.Tiempo || 0).toFixed(4)}
                          </td>
                          <td className="px-4 py-4 text-gray-400 font-mono border-r border-dashed border-gray-100">{(t.StockActual || 0).toLocaleString()}</td>
                          <td className="px-4 py-4 text-gray-900 font-mono font-black">{(t.StockSeguridad || 0).toLocaleString()}</td>
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
    </div>
  );
};
