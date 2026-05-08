'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Scissors, Package, Loader2, Clock, LayoutDashboard, ClipboardList, Layers, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Filter, Activity } from 'lucide-react';
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
import { MaestroMaterialesExplosionSection } from './MaestroMaterialesExplosionSection';
import { TacticalNeedsSection } from './TacticalNeedsSection';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from '@/lib/utils';

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
  
  // Estado para capturar el total de KG calculado en la explosión
  const [totalKgCalculated, setTotalKgCalculated] = useState<number>(0);

  const fetchGrupos = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        const center = String(g.centro || '').trim();
        return name.includes('corte y laminado') && center === '1000';
      });
      setGrupos(filtered);
      inspector.captureVariable('gruposLaminado1000', filtered);
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
      inspector.captureVariable('restriccionesLaminado1000', filtered);
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
      const res = await serviciosService.getTiemposEnsamblado(1, 10000);
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data)) {
        const filtered = data.filter((t: any) => String(t.Centro || t.centro || '').trim() === '1000');
        setTiemposEnsamblado(filtered);
        inspector.captureVariable('tiemposCompletosLaminado1000', filtered.length);
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
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    return { code, desc };
  };

  const tiemposMap = useMemo(() => {
    const map = new Map<string, { tiempo: number; puesto: string }>();
    tiemposEnsamblado.forEach(t => {
      const info = extractMaterialInfo(t);
      if (info.code) {
        map.set(info.code, { 
          tiempo: Number(t.Tiempo_Min || t.Tiempo || 0),
          puesto: String(t.PuestoTrabajo || t.Puesto || '—')
        });
      }
    });
    return map;
  }, [tiemposEnsamblado]);

  const appliedRestrictionsSummary = useMemo(() => {
    const resps = restriccionesArray.filter(r => r.nombre_restriccion === 'RESPCTRLPROD').map(r => r.valor_restriccion);
    const alms = restriccionesArray.filter(r => r.nombre_restriccion === 'ALMACEN').map(r => r.valor_restriccion);
    const sectors = restriccionesArray.filter(r => r.nombre_restriccion === 'SECTOR').map(r => r.valor_restriccion);

    return {
      responsables: [...new Set(resps.flatMap(v => v.split(/[,&]/).map(s => s.trim())))].filter(Boolean),
      almacenes: [...new Set(alms.flatMap(v => v.split(/[,&]/).map(s => s.trim())))].filter(Boolean),
      sectores: [...new Set(sectors.flatMap(v => v.split(/[,&]/).map(s => s.trim())))].filter(Boolean)
    };
  }, [restriccionesArray]);

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

  const ordenesFiltradas = useMemo(() => {
    const { responsables, almacenes, sectores } = appliedRestrictionsSummary;

    return ordenes.filter(o => {
      const itemCentro = String(o.CENTRO || o.Centro || o.centro || '').trim();
      if (itemCentro !== '1000') return false;
      
      const itemResp = String(o.RESPCTRLPROD || o.RESPCONTROLPROD || o.RespCtrlProd || o.RespControlProd || '').trim();
      const matchResp = responsables.length === 0 || responsables.includes(itemResp);
      if (!matchResp) return false;

      const matInfo = extractMaterialInfo(o);
      const infoTiempo = tiemposMap.get(matInfo.code);
      const puesto = (infoTiempo?.puesto || '').toLowerCase();
      
      const isAcolcha = puesto.includes('acolcha');
      if (!isAcolcha) return false;

      const itemSector = String(o.SECTOR || o.Sector || o.SECTORDESC || '').trim();
      const matchSector = sectores.length === 0 || sectores.some(s => itemSector.includes(s));
      if (!matchSector) return false;

      if (selectedDate !== 'all') {
        const itemDateFull = String(o.FECHAINICIO || o.FECHA || '').trim();
        const itemDate = itemDateFull.includes('T') ? itemDateFull.split('T')[0] : itemDateFull;
        if (itemDate !== selectedDate) return false;
      }

      return true;
    });
  }, [ordenes, appliedRestrictionsSummary, tiemposMap, selectedDate]);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-red-600" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Plan Táctico Corte Laminado</h2>
            <p className="text-xs text-gray-500 font-medium">Control de Carga Operativa - Centro 1000 (Quito)</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'plan', l: 'Resumen & Necesidades', i: LayoutDashboard }, 
            { v: 'ordenes', l: 'Provisionales', i: Package }, 
            { v: 'tiempos', l: 'Tiempos', i: Clock },
            { v: 'maestro', l: 'M. Materiales', i: ClipboardList }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="plan" className="space-y-6 animate-in fade-in duration-300">
          {/* Header con Filtro de Fecha */}
          <div className="flex justify-between items-center bg-gray-50/50 p-3 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-4 text-left">
              <div className="p-2 bg-red-600/10 rounded-xl"><CalendarIcon className="w-4 h-4 text-red-600" /></div>
              <div>
                <p className="text-[9px] font-bold uppercase text-gray-400 tracking-wider">Horizonte de Carga</p>
                <h3 className="text-xs font-bold text-gray-700 uppercase">
                  {selectedDate === 'all' ? 'Plan Maestro Consolidado' : format(parseISO(selectedDate), 'EEEE, d MMMM yyyy', { locale: es })}
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

          {/* Estadísticas de Carga */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Órdenes Filtradas</p>
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 text-red-600" />
                <p className="text-xl font-black text-gray-800">{ordenesFiltradas.length}</p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Puestos Acolchado</p>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-600" />
                <p className="text-xl font-black text-gray-800">
                  {[...new Set(ordenesFiltradas.map(o => tiemposMap.get(extractMaterialInfo(o).code)?.puesto))].filter(p => p && p !== '—').length}
                </p>
              </div>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Total KG (Explosión)</p>
              <p className="text-xl font-black text-gray-800">
                {totalKgCalculated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Capacidad Neta</p>
              <Badge className="bg-green-100 text-green-700 border-none font-black text-[10px] px-3">FACTIBLE</Badge>
            </div>
          </div>

          {/* Monitor de Cálculo e Información de Necesidades */}
          <TacticalNeedsSection 
            ordenes={ordenesFiltradas} 
            tiempos={tiemposEnsamblado} 
            onTotalKgChange={setTotalKgCalculated}
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
                    <th className="px-3 py-4 border-r border-gray-100 font-black">Puesto Trabajo</th>
                    <th className="px-3 py-4 border-r border-gray-100 font-black">Máquina</th>
                    <th className="px-3 py-4 font-black">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[10px]">
                  {ordenesFiltradas.map((o, i) => {
                    const info = extractMaterialInfo(o);
                    const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                    
                    const match = tiemposMap.get(info.code);
                    const puestoTrabajo = match?.puesto || '—';
                    
                    return (
                      <tr key={i} className="hover:bg-red-50/20 transition-colors">
                        <td className="px-3 py-2 font-medium text-gray-900 border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                        <td className="px-3 py-2 border-r border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                        <td className="px-3 py-2 font-mono font-bold text-red-600 border-r border-gray-100 tracking-tighter">{info.code}</td>
                        <td className="px-3 py-2 text-left border-r border-gray-50 truncate max-w-[250px] text-gray-500 uppercase">{info.desc}</td>
                        <td className="px-3 py-2 font-bold text-gray-900 border-r border-gray-50 font-mono">{qty}</td>
                        <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-50 uppercase">{puestoTrabajo}</td>
                        <td className="px-3 py-2 font-bold text-gray-700 border-r border-gray-50 uppercase">{o.MAQUINA || o.Maquina || o.RECURSO || '—'}</td>
                        <td className="px-3 py-2 font-medium text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="tiempos" className="space-y-4">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full border-collapse text-center">
                <thead className="bg-gray-100 sticky top-0 z-10 text-[10px] font-bold uppercase text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-4 border-r border-gray-100">Material</th>
                    <th className="px-4 py-4 border-r border-gray-100 text-left">Descripción Técnica</th>
                    <th className="px-4 py-4 border-r border-gray-100">Puesto Trabajo / Línea</th>
                    <th className="px-4 py-4">Stock Actual / Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[11px]">
                  {tiemposEnsamblado.map((t, i) => {
                    const info = extractMaterialInfo(t);
                    return (
                      <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-red-600 border-r border-gray-50">{info.code}</td>
                        <td className="px-4 py-3 text-left border-r border-gray-50 text-gray-500 uppercase truncate max-w-[300px]">{info.desc}</td>
                        <td className="px-4 py-3 border-r border-gray-100 font-bold text-gray-400 uppercase">
                          <div className="text-[10px]">{t.Linea || t.PuestoTrabajoLinea}</div>
                          <div className="text-[8px] font-mono opacity-60">{t.PuestoTrabajo}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-400 font-mono">{(t.StockActual || 0)} / {(t.StockSeguridad || 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="maestro" className="animate-in fade-in duration-300">
          <Card className="rounded-2xl border-none shadow-sm overflow-hidden bg-white">
            <CardContent className="p-0">
              <MaestroMaterialesExplosionSection ordenes={ordenesFiltradas} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
