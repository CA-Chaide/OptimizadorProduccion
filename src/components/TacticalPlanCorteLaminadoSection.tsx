'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Scissors, Package, Loader2, Clock, LayoutDashboard, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, Activity, CheckCircle2, Layers, Binary } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { TacticalNeedsSection } from './TacticalNeedsSection';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanLaminado');
  const { addNotification } = useAppContext();

  const [activeTab, setActiveTab] = useState('plan');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [tiemposEnsamblado, setTiemposEnsamblado] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState(new Date());
  const [materialesEnPlan, setMaterialesEnPlan] = useState<string[]>([]);
  const [totalKgCalculated, setTotalKgCalculated] = useState<number>(0);

  const fetchGrupos = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        const center = String(g.centro || '').trim();
        return (name.includes('corte y laminado') || name.includes('laminado')) && center === '1000';
      });
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
      setRestriccionesArray(filtered);
      return filtered;
    } catch (error) {
      console.error('Error cargando restricciones:', error);
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
        const filtered = data.filter((t: any) => String(t.Centro || t.centro || '').trim() === '1000');
        setTiemposEnsamblado(filtered);
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
    return { code, desc };
  };

  const tiemposMap = useMemo(() => {
    const map = new Map<string, any>();
    tiemposEnsamblado.forEach(t => {
      const { code } = extractMaterialInfo(t);
      if (code) map.set(code, t);
    });
    return map;
  }, [tiemposEnsamblado]);

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

  const DESCRIPTORS = ["LAMINA CILINDRICA", "BANDA INT", "BANDA BASE", "BANDA CHN", "ACOLCHADO", "TAPA SF BABY"];

  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter(o => {
      const itemCentro = String(o.CENTRO || o.Centro || o.centro || '').trim();
      if (itemCentro !== '1000') return false;

      const itemAlmacen = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      if (itemAlmacen !== '1006' && itemAlmacen !== '1008') return false;
      
      if (selectedDate !== 'all') {
        const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
        if (itemDate !== selectedDate) return false;
      }
      return true;
    }).sort((a, b) => {
      const almA = String(a.ALMACEN || a.Almacen || '').trim();
      const almB = String(b.ALMACEN || b.Almacen || '').trim();
      return almA.localeCompare(almB);
    });
  }, [ordenes, selectedDate]);

  const groupedOrdersByDescriptor = useMemo(() => {
    const groups: Record<string, any[]> = {};
    DESCRIPTORS.forEach(desc => { groups[desc] = []; });

    ordenesFiltradas.forEach(o => {
      const { desc } = extractMaterialInfo(o);
      const descUpper = desc.toUpperCase();
      let matched = false;
      for (const keyword of DESCRIPTORS) {
        if (descUpper.includes(keyword)) {
          groups[keyword].push(o);
          matched = true;
          break;
        }
      }
      if (!matched) {
        if (!groups["OTROS MATERIALES"]) groups["OTROS MATERIALES"] = [];
        groups["OTROS MATERIALES"].push(o);
      }
    });
    return groups;
  }, [ordenesFiltradas]);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-red-600" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Maestro Corte Laminado</h2>
            <p className="text-xs text-gray-500 font-medium">Gestión de Necesidades y BOOM de Materiales</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'plan', l: 'Plan Maestro', i: LayoutDashboard }, 
            { v: 'bom', l: 'BOOM de Materiales', i: Binary },
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos Ensamblado', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="plan" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-red-600/10 rounded-xl"><CalendarIcon className="w-4 h-4 text-red-600" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Horizonte de Carga</p>
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Vista Mensual Consolidada' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
                </h3>
              </div>
            </div>
            
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 px-6 rounded-2xl border-gray-200 hover:bg-white hover:border-red-500/50 gap-2 font-bold text-xs uppercase transition-all shadow-sm">
                  <Filter className="w-4 h-4" /> Fecha
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Carga Operativa (# Órdenes)</p>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600" />
                <p className="text-xl font-black text-gray-800">{ordenesFiltradas.length}</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Materia Prima Requerida (KG)</p>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" />
                <p className="text-xl font-black text-gray-800">
                  {totalKgCalculated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
          
          <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100 text-center flex flex-col items-center gap-3">
            <Layers className="w-8 h-8 text-blue-600 opacity-40" />
            <p className="text-xs font-bold text-blue-800 uppercase tracking-tight">Utilice la pestaña "BOOM de Materiales" para visualizar el desglose jerárquico completo y sin truncamientos.</p>
          </div>
        </TabsContent>

        <TabsContent value="bom" className="animate-in fade-in duration-300">
           <TacticalNeedsSection 
            ordenes={ordenesFiltradas} 
            tiempos={tiemposEnsamblado} 
            onTotalKgChange={setTotalKgCalculated}
            onMaterialsCalculated={setMaterialesEnPlan}
          />
        </TabsContent>

        <TabsContent value="ordenes">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full border-collapse text-center font-sans">
                <thead className="bg-gray-100/80 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-4 border-r border-gray-100">Orden</th>
                    <th className="px-3 py-4 border-r border-gray-100">Fecha</th>
                    <th className="px-3 py-4 border-r border-gray-100">Material</th>
                    <th className="px-3 py-4 border-r border-gray-100 text-left">Descripción</th>
                    <th className="px-3 py-4 border-r border-gray-100">Cant.</th>
                    <th className="px-3 py-4 border-r border-gray-100 font-black text-indigo-700">Línea Maestra</th>
                    <th className="px-3 py-4 font-black">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[10px]">
                  {ordenesFiltradas.length === 0 ? (
                    <tr><td colSpan={7} className="py-20 text-gray-400 italic">Sin carga operativa para el periodo</td></tr>
                  ) : (
                    Object.entries(groupedOrdersByDescriptor).map(([category, items]) => {
                      if (items.length === 0) return null;
                      return (
                        <React.Fragment key={category}>
                          <tr className="bg-slate-800 text-white font-black text-[10px] uppercase tracking-widest text-left">
                            <td colSpan={7} className="px-6 py-2.5 flex items-center gap-3">
                              <Layers className="w-4 h-4 text-red-400" />
                              Categoría: {category} ({items.length} Órdenes)
                            </td>
                          </tr>
                          {items.map((o, i) => {
                            const info = extractMaterialInfo(o);
                            const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                            const maestroData = tiemposMap.get(info.code);
                            const lineaMaestra = maestroData?.Linea || maestroData?.linea || '—';

                            return (
                              <tr key={`${category}-${i}`} className="hover:bg-red-50/20 transition-colors">
                                <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                                <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                                <td className="px-3 py-2 font-mono font-bold text-red-600 border-r border-gray-100 tracking-tighter">{info.code}</td>
                                <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[250px] text-gray-500 uppercase">{info.desc}</td>
                                <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-50 font-mono">{qty}</td>
                                <td className="px-3 py-2 font-black text-indigo-700 border-r border-gray-50 bg-indigo-50/10 uppercase italic">{lineaMaestra}</td>
                                <td className="px-3 py-2 font-bold text-gray-800">{o.Almacen || o.ALMACEN || '—'}</td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos" className="space-y-4">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[700px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Material</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                    <th className="px-4 py-4 border-r border-gray-100">Puesto Trabajo</th>
                    <th className="px-4 py-4 border-r border-gray-100">Línea</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-red-600 font-black">Tiempo Estándar (Min)</th>
                    <th className="px-4 py-4 border-r border-gray-100">Stock Actual</th>
                    <th className="px-4 py-4 font-black">Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {tiemposEnsamblado.length === 0 ? (
                    <tr><td colSpan={7} className="py-20 text-gray-400 italic font-bold uppercase tracking-widest">Sin registros técnicos cargados</td></tr>
                  ) : (
                    tiemposEnsamblado.map((t, i) => {
                      const info = extractMaterialInfo(t);
                      const isInPlan = materialesEnPlan.includes(info.code);
                      return (
                        <tr key={i} className={cn("transition-colors", isInPlan ? "bg-blue-50/50 hover:bg-blue-100" : "hover:bg-gray-50/50")}>
                          <td className="px-4 py-3 font-mono font-bold text-red-600 border-r border-gray-50 flex items-center justify-center gap-2">
                            {info.code}
                            {isInPlan && <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />}
                          </td>
                          <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[280px]">{info.desc}</td>
                          <td className="px-4 py-3 border-r border-gray-100 font-bold text-gray-400 uppercase text-[9px]">{t.PuestoTrabajo || t.PuestoTrabajoLinea || '—'}</td>
                          <td className="px-4 py-3 border-r border-gray-100 font-bold text-slate-400 uppercase text-[9px]">{t.Linea || '—'}</td>
                          <td className="px-4 py-3 font-mono font-bold text-red-500 border-r border-gray-50">
                            {Number(t.Tiempo_Min || t.Tiempo || 0).toFixed(4)}
                          </td>
                          <td className="px-4 py-3 text-gray-400 font-mono border-r border-gray-50">{(t.StockActual || 0).toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-700 font-mono font-bold">{(t.StockSeguridad || 0).toLocaleString()}</td>
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
