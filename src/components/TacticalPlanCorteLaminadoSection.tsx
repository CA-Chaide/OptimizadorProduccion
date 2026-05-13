
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Scissors, Package, Loader2, Clock, LayoutDashboard, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, Activity, ClipboardList, DatabaseZap, PlayCircle, Info, ChevronsLeft, ChevronsRight, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
import { Badge } from '@/components/ui/badge';

interface RawBOMRow {
  nivel: string;
  centro: string;
  fertPrincipal: string;
  descripcionFert: string;
  materialPadre: string;
  componente: string;
  descripcionComponente: string;
  cantUnitaria: number;
  cantAcumulada: number;
  cantTotalExplotada: number;
}

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: string): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const formatLevel = (level: string | number) => {
  const l = Number(level);
  if (isNaN(l)) return level;
  return ".".repeat(l) + l;
};

const getLevelClass = (level: string | number) => {
  const l = Number(level);
  if (l === 1) return "bg-green-500 text-white font-black";
  if (l === 2) return "bg-blue-400 text-white font-black";
  return "text-slate-400 font-bold";
};

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

  // Estado para la explosión de materiales
  const [isExploding, setIsExploding] = useState(false);
  const [explosionProgress, setExplosionProgress] = useState({ current: 0, total: 0 });
  const [bomRows, setBomRows] = useState<RawBOMRow[]>([]);
  const [bomPage, setBomPage] = useState(1);
  const [bomRowsPerPage, setBomRowsPerPage] = useState(20);

  const HOJAS_RUTA_VALIDAS = ["HR-ACH", "HR-BO", "HR-LAMIN"];

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

  const sortedTiempos = useMemo(() => {
    return [...tiemposEnsamblado].sort((a, b) => {
      const infoA = extractMaterialInfo(a);
      const infoB = extractMaterialInfo(b);
      return infoA.code.localeCompare(infoB.code);
    });
  }, [tiemposEnsamblado]);

  const groupedOrdersByRouting = useMemo(() => {
    const groups: Record<string, any[]> = {};
    HOJAS_RUTA_VALIDAS.forEach(hr => { groups[hr] = []; });

    ordenes.forEach(o => {
      const itemCentro = String(o.CENTRO || o.Centro || o.centro || '').trim();
      if (itemCentro !== '1000') return;

      const itemAlmacen = String(o.ALMACEN || o.Almacen || o.almacen || '').trim();
      if (itemAlmacen !== '1006' && itemAlmacen !== '1008') return;

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

  const totalFilteredOrdersCount = filteredOrdersFlat.length;

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

  // --- Lógica para Explosión de Materiales ---
  const handleProcessExplosion = async () => {
    if (filteredOrdersFlat.length === 0) {
      addNotification('warning', 'No hay órdenes filtradas para procesar la lista de materiales.');
      return;
    }

    setIsExploding(true);
    setBomRows([]);
    setBomPage(1);
    setExplosionProgress({ current: 0, total: filteredOrdersFlat.length });

    const allRows: RawBOMRow[] = [];

    try {
      for (let i = 0; i < filteredOrdersFlat.length; i++) {
        const order = filteredOrdersFlat[i];
        const { code: fertCode } = extractMaterialInfo(order);
        const centro = String(order.CENTRO || order.Centro || '1000').trim();
        const orderQty = safeNum(order.CANTIDAD || order.CANTPROGRAMADA || 0);

        const fullCodeForApi = fertCode.padStart(18, '0');

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fullCodeForApi, 1, 1000);
          const rawData = response?.data || response?.data?.data || [];

          if (Array.isArray(rawData)) {
            rawData.forEach((row: any) => {
              const acum = safeNum(row.CANTIDAD_ACUMULADA || row.CANTIDAD_UNITARIA || 0);
              const totalNeeded = orderQty * acum;

              allRows.push({
                nivel: String(safeNum(row.NIVEL)),
                centro: String(row.CENTRO || centro),
                fertPrincipal: cleanCode(row.FERT_PRINCIPAL),
                descripcionFert: String(row.DESCRIPCION_FERT || '—').toUpperCase(),
                materialPadre: cleanCode(row.MATERIAL_PADRE),
                componente: cleanCode(row.COMPONENTE),
                descripcionComponente: String(row.DESCRIPCION_COMPONENTE || '—').toUpperCase(),
                cantUnitaria: safeNum(row.CANTIDAD_UNITARIA),
                cantAcumulada: acum,
                cantTotalExplotada: totalNeeded
              });
            });
          }
        } catch (err) {
          console.warn(`Error en material ${fertCode}:`, err);
        }
        setExplosionProgress(prev => ({ ...prev, current: i + 1 }));
      }
      
      // Ordenar por FERT Principal y luego por Nivel Jerárquico
      const sorted = allRows.sort((a, b) => {
        if (a.fertPrincipal !== b.fertPrincipal) return a.fertPrincipal.localeCompare(b.fertPrincipal);
        const nivA = Number(a.nivel);
        const nivB = Number(b.nivel);
        if (nivA !== nivB) return nivA - nivB;
        return a.materialPadre.localeCompare(b.materialPadre);
      });

      setBomRows(sorted);
      addNotification('success', `Explosión técnica completada. ${allRows.length} registros cargados.`);
    } catch (err) {
      addNotification('error', `Error crítico en explosión: ${(err as Error).message}`);
    } finally {
      setIsExploding(false);
    }
  };

  const totalBomPages = Math.max(1, Math.ceil(bomRows.length / bomRowsPerPage));
  const paginatedBomRows = useMemo(() => {
    const start = (bomPage - 1) * bomRowsPerPage;
    return bomRows.slice(start, start + bomRowsPerPage);
  }, [bomRows, bomPage, bomRowsPerPage]);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-red-600" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Corte Laminado</h2>
            <p className="text-xs text-gray-500 font-medium">Gestión Exclusiva de Hojas de Ruta: HR-ACH, HR-BO, HR-LAMIN</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'plan', l: 'Plan Maestro', i: LayoutDashboard }, 
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'listaMateriales', l: 'Lista Materiales', i: ClipboardList },
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
                  {selectedDate === 'all' ? 'Vista Consolidada (Hojas de Ruta Válidas)' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
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
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Carga Operativa (Válida)</p>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600" />
                <p className="text-xl font-black text-gray-800">{totalFilteredOrdersCount}</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Estado de Sincronización</p>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" />
                <p className="text-xl font-black text-gray-800">Filtrado</p>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ordenes" className="animate-in fade-in duration-300">
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
                    <th className="px-5 py-4 border-r border-white/5 text-blue-300">Línea Maestra</th>
                    <th className="px-5 py-4 border-r border-white/5 text-amber-300">Máquina</th>
                    <th className="px-5 py-4">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {totalFilteredOrdersCount === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-gray-400 italic font-black uppercase tracking-widest opacity-30">No se detectaron órdenes con hojas de ruta autorizadas</td></tr>
                  ) : (
                    Object.entries(groupedOrdersByRouting).map(([routingKey, items]) => {
                      if (items.length === 0) return null;
                      return (
                        <React.Fragment key={routingKey}>
                          <tr className="bg-slate-50 border-y border-gray-200">
                            <td colSpan={8} className="px-6 py-2">
                              <div className="flex items-center gap-3 text-left">
                                <div className="w-1.5 h-4 bg-red-600 rounded-full" />
                                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                  HOJA DE RUTA: {routingKey} ({items.length} Órdenes)
                                </span>
                              </div>
                            </td>
                          </tr>
                          {items.map((o, i) => {
                            const info = extractMaterialInfo(o);
                            const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                            const maestroData = tiemposMap.get(info.code);
                            const lineaMaestra = maestroData?.Linea || maestroData?.linea || '—';
                            const maquina = String(o.MAQUINA || o.Maquina || o.RECURSO || '—').trim();

                            return (
                              <tr key={`${routingKey}-${i}`} className="hover:bg-gray-50 transition-colors group">
                                <td className="px-4 py-4 font-bold text-gray-900 border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                                <td className="px-4 py-4 border-r border-dashed border-gray-100 font-mono text-[10px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                                <td className="px-4 py-4 font-mono font-black text-red-600 border-r border-dashed border-gray-100 tracking-tighter">{info.code}</td>
                                <td className="px-4 py-4 text-left border-r border-dashed border-gray-100 truncate max-w-[280px] text-gray-600 font-bold uppercase">{info.desc}</td>
                                <td className="px-4 py-4 font-black text-gray-900 border-r border-dashed border-gray-100 font-mono text-xs">{qty.toLocaleString()}</td>
                                <td className="px-4 py-4 font-black text-indigo-700 border-r border-dashed border-gray-100 bg-indigo-50/10 uppercase italic">{lineaMaestra}</td>
                                <td className="px-4 py-4 font-black text-amber-700 border-r border-dashed border-gray-100 bg-amber-50/10 uppercase">{maquina}</td>
                                <td className="px-4 py-4 font-bold text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
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

        <TabsContent value="listaMateriales" className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
                <ClipboardList className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter text-left">Estructura Jerárquica de Materiales (BOM)</h3>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 text-left">
                  Explosión por Orden | Niveles 1-5 | Estándar SAP
                </p>
              </div>
            </div>
            <Button 
              onClick={handleProcessExplosion} 
              disabled={isExploding || filteredOrdersFlat.length === 0} 
              className="bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
            >
              {isExploding ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
              Explosionar Recetas en SAP
            </Button>
          </div>

          {isExploding && (
            <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100">
              <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                <span className="flex items-center gap-2">
                  <Activity className="w-3 h-3" />
                  Sincronizando con SAP...
                </span>
                <span>{explosionProgress.current} / {explosionProgress.total} órdenes</span>
              </div>
              <Progress value={(explosionProgress.current / explosionProgress.total) * 100} className="h-2 bg-indigo-100" />
            </div>
          )}

          {!isExploding && bomRows.length > 0 ? (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-xl">
                <div className="overflow-x-auto max-h-[600px] relative">
                  <table className="w-full border-collapse text-left font-sans">
                    <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter sticky top-0 z-20">
                      <tr>
                        <th className="px-4 py-4 text-center border-r border-white/5 w-24">NV</th>
                        <th className="px-5 py-4 border-r border-white/5">Nº COMPONENTES</th>
                        <th className="px-5 py-4 border-r border-white/5">TEXTO BREVE-OBJETO</th>
                        <th className="px-5 py-4 border-r border-white/5">MATERIAL PADRE</th>
                        <th className="px-5 py-4 border-r border-white/5 text-right font-black text-blue-300">CTD. COMPONENTE (UMC)</th>
                        <th className="px-4 py-4 text-center w-16">UM</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-[10px]">
                      {paginatedBomRows.map((row, idx) => {
                        const showOrderSeparator = idx === 0 || row.fertPrincipal !== paginatedBomRows[idx - 1].fertPrincipal;
                        return (
                          <React.Fragment key={idx}>
                            {showOrderSeparator && (
                              <tr className="bg-slate-100 border-y-2 border-slate-200">
                                <td colSpan={6} className="px-6 py-2">
                                  <div className="flex items-center gap-3">
                                    <div className="w-2 h-4 bg-[#0f172a] rounded-full" />
                                    <span className="text-[10px] font-black uppercase text-slate-800 tracking-widest">
                                      MATERIAL: {row.fertPrincipal} - {row.descripcionFert}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            )}
                            <tr className="hover:bg-gray-50 transition-all group">
                              <td className="px-4 py-3 border-r border-gray-100">
                                <div className={cn(
                                  "w-full py-1 rounded-md text-center shadow-sm",
                                  getLevelClass(row.nivel)
                                )}>
                                  {formatLevel(row.nivel)}
                                </div>
                              </td>
                              <td className="px-5 py-3 font-mono font-black text-indigo-700 border-r border-dashed border-gray-100">{row.componente}</td>
                              <td className="px-5 py-3 font-black text-slate-700 uppercase">{row.descripcionComponente}</td>
                              <td className="px-5 py-3 text-left font-mono font-bold text-slate-400 border-r border-dashed border-gray-100">{row.materialPadre}</td>
                              <td className="px-5 py-3 text-right font-mono font-black text-slate-800 bg-slate-50/5">
                                {row.cantTotalExplotada.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                              </td>
                              <td className="px-4 py-3 text-center font-black text-slate-400">KG</td>
                            </tr>
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Controles de Paginación */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">Filas por página:</span>
                  <select 
                    value={bomRowsPerPage} 
                    onChange={(e) => { setBomRowsPerPage(Number(e.target.value)); setBomPage(1); }}
                    className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {[20, 50, 100, 250].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                  <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
                    Mostrando {Math.min(bomRows.length, (bomPage-1)*bomRowsPerPage + 1)}-{Math.min(bomRows.length, bomPage*bomRowsPerPage)} de {bomRows.length}
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
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Inicie la explosión técnica para visualizar la estructura multinivel de SAP</p>
            </div>
          )}
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
                  {sortedTiempos.length === 0 ? (
                    <tr><td colSpan={7} className="py-24 text-gray-400 italic font-black uppercase tracking-widest opacity-30">Sin registros técnicos cargados</td></tr>
                  ) : (
                    sortedTiempos.map((t, i) => {
                      const info = extractMaterialInfo(t);
                      return (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-4 font-mono font-black text-indigo-600 border-r border-dashed border-gray-100 tracking-tighter">{info.code}</td>
                          <td className="px-5 py-4 text-left border-r border-dashed border-gray-100 text-gray-600 font-bold uppercase truncate max-w-[280px]">{info.desc}</td>
                          <td className="px-5 py-4 border-r border-dashed border-gray-100 font-black text-gray-400 uppercase text-[9px]">{t.PuestoTrabajo || t.PuestoTrabajoLinea || '—'}</td>
                          <td className="px-5 py-4 border-r border-dashed border-gray-100 font-black text-slate-400 uppercase text-[9px]">{t.Linea || '—'}</td>
                          <td className="px-5 py-4 font-mono font-black text-teal-600 border-r border-dashed border-gray-100 bg-teal-50/5">
                            {Number(t.Tiempo_Min || t.Tiempo || 0).toFixed(4)}
                          </td>
                          <td className="px-5 py-4 text-gray-400 font-mono border-r border-dashed border-gray-100">{(t.StockActual || 0).toLocaleString()}</td>
                          <td className="px-5 py-4 text-gray-900 font-mono font-black">{(t.StockSeguridad || 0).toLocaleString()}</td>
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
