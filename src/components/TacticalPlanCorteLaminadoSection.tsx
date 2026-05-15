'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Scissors, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  ClipboardList, 
  Search, 
  Info, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  DatabaseZap,
  Filter,
  Calendar as CalendarIcon,
  Activity,
  PlayCircle,
  UserCheck
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from "@/components/ui/progress";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, parseISO, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';

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

interface ResumenNecesidadRow {
  fecha: string;
  orden: string;
  fert: string;
  descripcionFert: string;
  cantOrden: number;
  responsable: string;
  componente: string;
  descripcionComponente: string;
  cantUnitaria: number;
  cantTotal: number;
}

const RESPONSABLES_VALIDOS = ["009", "018", "022", "014", "042", "043"];

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

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

  // Estados para Filtro Dinámico de Fechas
  const [selectedDate, setSelectedDate] = useState<string>('all');
  const [viewDate, setViewDate] = useState(new Date());

  // Estados para el BOOM de Materiales (Auditoría Técnica)
  const [fertBusqueda, setFertBusqueda] = useState('');
  const [bomRows, setBomRows] = useState<RawBOMRow[]>([]);
  const [isSearchingBOM, setIsSearchingBOM] = useState(false);
  const [bomPage, setBomPage] = useState(1);
  const [bomRowsPerPage, setBomRowsPerPage] = useState(100);

  // Estados para Resumen Necesidades
  const [resumenNecesidades, setResumenNecesidades] = useState<ResumenNecesidadRow[]>([]);
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });

  const fetchGrupos = async () => {
    try {
      const res = await grupoService.getAll();
      const filtered = (res.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return (name.includes('corte y laminado') || name.includes('laminado'));
      });
      setGrupos(filtered);
      return filtered;
    } catch (error) { return []; }
  };

  const fetchRestricciones = async (gruposIds: number[]) => {
    try {
      const res = await restriccionService.getAll();
      const filtered = (res.data || []).filter(r => gruposIds.includes(r.codigo_grupo));
      setRestriccionesArray(filtered);
      return filtered;
    } catch (error) { return []; }
  };

  const fetchOrdenes = async () => {
    try {
      const resProv = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
      const data = resProv.data?.data || resProv.data || [];
      setOrders(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error cargando órdenes:', error); }
  };

  const fetchTiemposEnsamblado = async () => {
    try {
      const res = await serviciosService.getTiemposEnsamblado(1, 15000);
      const data = res.data?.data || res.data || [];
      if (Array.isArray(data)) setTiemposEnsamblado(data);
    } catch (error) { console.error('Error cargando tiempos:', error); }
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

  // Lógica de filtrado de órdenes por Centro, Fecha y RESPONSABLES ESPECÍFICOS
  const filteredOrders = useMemo(() => {
    return ordenes.filter(o => {
      const centro = String(o.CENTRO || o.Centro || o.centro || '').trim();
      if (centro === '2000') return false; 

      // FILTRO DE RESPONSABLES DINÁMICOS
      const responsable = String(o.RESPCONTROLPROD || o.RespControlProd || o.RESP_CONTROL_PROD || '').trim();
      if (!RESPONSABLES_VALIDOS.includes(responsable)) return false;

      if (selectedDate !== 'all') {
        const dateRaw = String(o.FECHAINICIO || o.FECHA || '').trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        if (date !== selectedDate) return false;
      }
      return true;
    });
  }, [ordenes, selectedDate]);

  const datesWithOrders = useMemo(() => {
    const dates = new Set<string>();
    ordenes.forEach(o => {
      const centro = String(o.CENTRO || o.Centro || o.centro || '').trim();
      if (centro === '2000') return;
      
      const responsable = String(o.RESPCONTROLPROD || o.RespControlProd || o.RESP_CONTROL_PROD || '').trim();
      if (!RESPONSABLES_VALIDOS.includes(responsable)) return;

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

  const extractMaterialInfo = (item: any) => {
    const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
    const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';
    return { code, desc };
  };

  const handleSearchBOM = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!fertBusqueda.trim()) {
      addNotification('warning', 'Ingrese un código FERT para consultar su BOOM.');
      return;
    }

    setIsSearchingBOM(true);
    setBomRows([]);
    setBomPage(1);

    try {
      const fullCode = fertBusqueda.trim().padStart(18, '0');
      const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 5000);
      const rawData = response?.data?.data || response?.data || [];

      if (Array.isArray(rawData)) {
        const filtered = rawData
          .filter(row => {
            const centro = getProp(row, 'CENTRO');
            const descripcion = getProp(row, 'DESCRIPCION_COMPONENTE').toUpperCase();
            return centro !== '2000' && descripcion.includes('LAMINA CILINDRICA');
          })
          .map(row => ({
            NIVEL: getProp(row, 'NIVEL'),
            CENTRO: getProp(row, 'CENTRO'),
            FERT_PRINCIPAL: getProp(row, 'FERT_PRINCIPAL'),
            DESCRIPCION_FERT: getProp(row, 'DESCRIPCION_FERT'),
            MATERIAL_PADRE: getProp(row, 'MATERIAL_PADRE'),
            COMPONENTE: getProp(row, 'COMPONENTE'),
            DESCRIPCION_COMPONENTE: getProp(row, 'DESCRIPCION_COMPONENTE'),
            CANTIDAD_UNITARIA: getNumProp(row, 'CANTIDAD_UNITARIA'),
            CANTIDAD_ACUMULADA: getNumProp(row, 'CANTIDAD_ACUMULADA')
          }));
        
        setBomRows(filtered);
      }
    } catch (err) {
      addNotification('error', 'Error al consultar el BOOM técnico.');
    } finally {
      setIsSearchingBOM(false);
    }
  };

  const handleProcessResumen = async () => {
    if (filteredOrders.length === 0) {
      addNotification('warning', 'No hay órdenes en el período seleccionado para procesar.');
      return;
    }

    setIsProcessingResumen(true);
    setResumenNecesidades([]);
    setResumenProgress({ current: 0, total: filteredOrders.length });

    const allResumenRows: ResumenNecesidadRow[] = [];

    try {
      for (let i = 0; i < filteredOrders.length; i++) {
        const order = filteredOrders[i];
        const info = extractMaterialInfo(order);
        const fullCode = info.code.padStart(18, '0');
        const qty = safeNum(order.CANTPROGRAMADA || order.CANTIDAD || 0);

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 500);
          const rawData = response?.data?.data || response?.data || [];

          if (Array.isArray(rawData)) {
            const componentesLaminas = rawData.filter(row => {
              const desc = getProp(row, 'DESCRIPCION_COMPONENTE').toUpperCase();
              const centro = getProp(row, 'CENTRO');
              return centro !== '2000' && desc.includes('LAMINA CILINDRICA');
            });

            componentesLaminas.forEach(comp => {
              const cantAcum = getNumProp(comp, 'CANTIDAD_ACUMULADA');
              allResumenRows.push({
                fecha: String(order.FECHAINICIO || order.FECHA || '').split('T')[0],
                orden: String(order.ORDENPREVISIONAL || order.ORDEN || '—'),
                fert: info.code,
                descripcionFert: info.desc,
                cantOrden: qty,
                responsable: String(order.RESPCONTROLPROD || order.RespControlProd || '—'),
                componente: getProp(comp, 'COMPONENTE'),
                descripcionComponente: getProp(comp, 'DESCRIPCION_COMPONENTE'),
                cantUnitaria: cantAcum,
                cantTotal: qty * cantAcum
              });
            });
          }
        } catch (e) {
          console.warn(`Error procesando BOOM para material ${info.code}`);
        }

        setResumenProgress(prev => ({ ...prev, current: i + 1 }));
      }
      setResumenNecesidades(allResumenRows);
      addNotification('success', `Resumen generado: ${allResumenRows.length} líneas de necesidad técnica.`);
    } catch (err) {
      addNotification('error', 'Error al procesar el resumen de necesidades.');
    } finally {
      setIsProcessingResumen(false);
    }
  };

  const paginatedBomRows = useMemo(() => {
    const start = (bomPage - 1) * bomRowsPerPage;
    return bomRows.slice(start, start + bomRowsPerPage);
  }, [bomRows, bomPage, bomRowsPerPage]);

  const totalBomPages = Math.max(1, Math.ceil(bomRows.length / bomRowsPerPage));

  const getResponsableColor = (code: string) => {
    const colors: Record<string, string> = {
      "009": "bg-blue-100 text-blue-700 border-blue-200",
      "018": "bg-emerald-100 text-emerald-700 border-emerald-200",
      "022": "bg-purple-100 text-purple-700 border-purple-200",
      "014": "bg-amber-100 text-amber-700 border-amber-200",
      "042": "bg-rose-100 text-rose-700 border-rose-200",
      "043": "bg-indigo-100 text-indigo-700 border-indigo-200"
    };
    return colors[code] || "bg-gray-100 text-gray-700 border-gray-200";
  };

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-red-600" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Laminado</h2>
            <p className="text-xs text-gray-500 font-medium">Gestión de Necesidades Técnicas y Auditoría de Materiales</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="ordenes" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'resumen', l: 'Resumen Necesidades', i: LayoutDashboard },
            { v: 'listaMateriales', l: 'Lista Materiales (BOOM)', i: ClipboardList },
            { v: 'tiempos', l: 'Tiempos Ensamblado', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ordenes" className="animate-in fade-in duration-300 space-y-4">
          <div className="flex items-center justify-between bg-gray-50/50 p-3 rounded-2xl border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/10 rounded-xl text-red-600"><UserCheck className="w-4 h-4" /></div>
              <div>
                <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Responsables Activos</p>
                <div className="flex gap-1.5 mt-0.5">
                  {RESPONSABLES_VALIDOS.map(code => (
                    <Badge key={code} variant="outline" className={cn("text-[9px] font-black border", getResponsableColor(code))}>
                      {code}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 px-4 rounded-xl border-gray-200 hover:bg-white hover:border-red-500/50 gap-2 font-bold text-[10px] uppercase transition-all shadow-sm">
                  <Filter className="w-3 h-3 text-red-500" /> {selectedDate === 'all' ? 'Todas las Fechas' : selectedDate}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-2" align="end">
                <div className="bg-white p-3 font-sans">
                  <div className="flex items-center justify-between mb-3 text-left">
                    <h3 className="text-[10px] font-bold text-gray-800 capitalize">{format(viewDate, 'MMMM yyyy', { locale: es })}</h3>
                    <div className="flex gap-1 bg-gray-50 rounded-lg p-1">
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(subMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white hover:shadow-sm"><ChevronLeft className="w-3 h-3" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => setViewDate(addMonths(viewDate, 1))} className="h-6 h-6 hover:bg-white hover:shadow-sm"><ChevronRight className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-7 gap-y-1 text-center mb-2">
                    {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map((day, idx) => <div key={`cal-head-${idx}`} className="text-[8px] font-bold text-gray-300 uppercase py-1">{day}</div>)}
                    {calendarDays.map((day, idx) => {
                      if (!day) return <div key={`cal-pad-${idx}`} className="p-1" />;
                      const dateStr = format(day, 'yyyy-MM-dd');
                      const isSelected = selectedDate === dateStr;
                      return (
                        <button key={dateStr} onClick={() => setSelectedDate(isSelected ? 'all' : dateStr)} className={cn("relative h-7 w-7 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-red-600 text-white shadow-md" : "hover:bg-gray-100")}>
                          <span className={cn("text-[10px] font-bold", !datesWithOrders.has(dateStr) && !isSelected ? "text-gray-200" : "")}>{format(day, 'd')}</span>
                          {datesWithOrders.has(dateStr) && !isSelected && <div className="absolute bottom-1 w-1 h-1 bg-red-400 rounded-full" />}
                        </button>
                      );
                    })}
                  </div>
                  <Button variant="ghost" size="sm" className="w-full text-[9px] font-bold uppercase text-red-600 h-7 mt-1 rounded-lg hover:bg-red-50" onClick={() => setSelectedDate('all')}>Ver Todo</Button>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full border-collapse text-center font-sans text-[11px]">
                <thead className="bg-[#f8fafc] text-slate-400 border-b border-gray-100 uppercase font-black tracking-widest text-[9px]">
                  <tr>
                    <th className="px-5 py-4 border-r border-gray-100">Orden</th>
                    <th className="px-5 py-4 border-r border-gray-100">Fecha</th>
                    <th className="px-5 py-4 border-r border-gray-100">Material</th>
                    <th className="px-5 py-4 border-r border-gray-100 text-left">Descripción</th>
                    <th className="px-5 py-4 border-r border-gray-100">Cant.</th>
                    <th className="px-5 py-4 border-r border-gray-100">Responsable</th>
                    <th className="px-5 py-4 border-r border-gray-100">Máquina</th>
                    <th className="px-5 py-4">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-gray-300 italic font-black uppercase tracking-widest opacity-20 text-center">Sin órdenes para el criterio actual</td></tr>
                  ) : (
                    filteredOrders.map((o, i) => {
                      const info = extractMaterialInfo(o);
                      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                      const maquina = String(o.MAQUINA || o.Maquina || o.recurso || o.RECURSO || '—').trim();
                      const responsable = String(o.RESPCONTROLPROD || o.RespControlProd || o.RESP_CONTROL_PROD || '—').trim();

                      return (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                          <td className="px-4 py-3.5 font-bold text-slate-800 border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                          <td className="px-4 py-3.5 border-r border-gray-50 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                          <td className="px-4 py-3.5 font-mono font-black text-red-500 border-r border-gray-50 tracking-tighter">{info.code}</td>
                          <td className="px-4 py-3.5 text-left border-r border-gray-50 truncate max-w-[320px] text-slate-600 font-bold uppercase leading-tight">{info.desc}</td>
                          <td className="px-4 py-3.5 font-black text-slate-900 border-r border-gray-50 font-mono text-xs">{qty.toLocaleString()}</td>
                          <td className="px-4 py-3.5 border-r border-gray-50">
                            <Badge variant="outline" className={cn("text-[10px] font-black border py-0.5", getResponsableColor(responsable))}>
                              {responsable}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5 font-black text-slate-400 border-r border-gray-50 uppercase text-[10px]">{maquina}</td>
                          <td className="px-4 py-3.5 font-bold text-slate-300 text-[10px]">{o.Almacen || o.ALMACEN || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="resumen" className="animate-in fade-in duration-300 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50 p-5 rounded-2xl border border-gray-200 shadow-sm text-left">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600/10 rounded-xl text-indigo-600">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter leading-tight">Consolidado de Necesidades Técnicas</h3>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                  Órdenes vs. Componentes Críticos (Láminas Cilíndricas) | Período: {selectedDate === 'all' ? 'Consolidado' : selectedDate}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                onClick={handleProcessResumen}
                disabled={isProcessingResumen || filteredOrders.length === 0}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
              >
                {isProcessingResumen ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
                Calcular Necesidades del Período
              </Button>
            </div>
          </div>

          {isProcessingResumen && (
            <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100">
              <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                <span className="flex items-center gap-2"><Activity className="w-3 h-3" /> Procesando Auditoría Táctica...</span>
                <span>{resumenProgress.current} / {resumenProgress.total} Órdenes</span>
              </div>
              <Progress value={(resumenProgress.current / resumenProgress.total) * 100} className="h-2 bg-indigo-100" />
            </div>
          )}

          {!isProcessingResumen && resumenNecesidades.length > 0 ? (
            <Card className="rounded-2xl border border-gray-100 shadow-md overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[550px]">
                <table className="w-full border-collapse font-sans text-[10px]">
                  <thead className="bg-[#bde0fe] text-slate-800 uppercase font-black tracking-tight sticky top-0 z-20 border-b border-blue-200">
                    <tr>
                      <th className="px-4 py-4 border-r border-blue-100 text-left">Fecha</th>
                      <th className="px-4 py-4 border-r border-blue-100 text-left">Orden</th>
                      <th className="px-4 py-4 border-r border-blue-100 text-left">FERT (Principal)</th>
                      <th className="px-4 py-4 border-r border-blue-100 text-left">Descripción FERT</th>
                      <th className="px-4 py-4 border-r border-blue-100 text-center">Cant. Orden</th>
                      <th className="px-4 py-4 border-r border-blue-100 text-left">Componente (Lámina)</th>
                      <th className="px-4 py-4 border-r border-blue-100 text-left">Descripción Componente</th>
                      <th className="px-4 py-4 border-r border-blue-100 text-right">Cant. Unit.</th>
                      <th className="px-4 py-4 text-right bg-blue-100/50 text-indigo-900">Total Necesidad (U)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 font-bold">
                    {resumenNecesidades.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                        <td className="px-4 py-3 border-r border-gray-100 text-gray-400 font-mono text-[9px]">{row.fecha}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-gray-500 font-black">{row.orden}</td>
                        <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-red-600 tracking-tighter">{row.fert}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-gray-500 uppercase truncate max-w-[140px]" title={row.descripcionFert}>{row.descripcionFert}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-center text-slate-800 font-mono">{row.cantOrden}</td>
                        <td className="px-4 py-3 border-r border-gray-100 font-mono font-black text-indigo-600">{row.componente}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-left uppercase font-black text-slate-600">{row.descripcionComponente}</td>
                        <td className="px-4 py-3 border-r border-gray-100 text-right font-mono text-slate-500">{row.cantUnitaria.toFixed(3)}</td>
                        <td className="px-4 py-3 text-right font-mono font-black text-indigo-700 bg-indigo-50/20">
                          {row.cantTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-30 bg-[#1e293b] text-white font-black uppercase border-t border-slate-700">
                    <tr>
                      <td colSpan={8} className="px-4 py-3 text-right tracking-widest text-[9px] text-gray-400">Total Necesidad Técnicas Acumuladas:</td>
                      <td className="px-4 py-3 text-right font-mono text-blue-300 text-xs">
                        {resumenNecesidades.reduce((s, r) => s + r.cantTotal, 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          ) : !isProcessingResumen && (
            <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100">
              <DatabaseZap className="w-16 h-16 text-indigo-100 mx-auto" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Inicie el cálculo para cruzar órdenes con recetas técnicas filtradas</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="listaMateriales" className="space-y-4 animate-in fade-in duration-300">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50 p-4 rounded-2xl border border-gray-200 shadow-sm text-left">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-600/10 rounded-xl text-indigo-600">
                <ClipboardList className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter leading-tight">Auditoría Jerárquica de Materiales (BOM)</h3>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                  Visualización Estructural SAP | Filtro: Láminas Cilíndricas
                </p>
              </div>
            </div>
            
            <form onSubmit={handleSearchBOM} className="flex items-center gap-2 w-full md:w-auto">
              <div className="relative flex-1 md:w-64">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Buscar FERT Principal..." 
                  value={fertBusqueda}
                  onChange={(e) => setFertBusqueda(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
              </div>
              <Button 
                type="submit"
                disabled={isSearchingBOM}
                className="bg-[#1e293b] hover:bg-slate-800 text-white rounded-lg h-9 px-4 text-[10px] font-black uppercase tracking-widest transition-all"
              >
                {isSearchingBOM ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Auditar'}
              </Button>
            </form>
          </div>

          {!isSearchingBOM && bomRows.length > 0 ? (
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="overflow-x-auto max-h-[550px] relative text-left">
                  <table className="w-full border-collapse font-sans text-[10px]">
                    <thead className="bg-[#bde0fe] text-slate-800 uppercase font-black tracking-tight sticky top-0 z-20 border-b border-blue-200">
                      <tr>
                        <th className="px-3 py-3 border-r border-blue-100 text-center w-14">NV</th>
                        <th className="px-3 py-3 border-r border-blue-100 w-16">CT</th>
                        <th className="px-3 py-3 border-r border-blue-100 w-28">FERT Principal</th>
                        <th className="px-3 py-3 border-r border-blue-100">Descripción FERT</th>
                        <th className="px-3 py-3 border-r border-blue-100 w-28">Material Padre</th>
                        <th className="px-3 py-3 border-r border-blue-100 w-28">Componente</th>
                        <th className="px-3 py-3 border-r border-blue-100">Descripción Componente</th>
                        <th className="px-3 py-3 border-r border-blue-100 text-right w-24">Cant. Unit.</th>
                        <th className="px-3 py-3 text-right w-24">Cant. Acum.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-bold">
                      {paginatedBomRows.map((row, idx) => {
                        const nivelVal = safeNum(row.NIVEL);
                        const indentation = ".".repeat(nivelVal);
                        return (
                          <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                            <td className="px-3 py-2 border-r border-gray-100 text-center text-slate-400 font-mono text-[9px]">
                              {indentation}{nivelVal}
                            </td>
                            <td className="px-3 py-2 border-r border-gray-100 text-gray-400 text-center">{row.CENTRO}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-indigo-600 tracking-tighter">{row.FERT_PRINCIPAL}</td>
                            <td className="px-3 py-2 border-r border-gray-100 text-gray-500 uppercase truncate max-w-[150px]" title={row.DESCRIPCION_FERT}>{row.DESCRIPCION_FERT}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-gray-400 tracking-tighter">{row.MATERIAL_PADRE}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-slate-700 tracking-tighter">{row.COMPONENTE}</td>
                            <td className="px-3 py-2 border-r border-gray-100 text-left uppercase font-black text-slate-600">{row.DESCRIPCION_COMPONENTE}</td>
                            <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-slate-500">{row.CANTIDAD_UNITARIA.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-800">{row.CANTIDAD_ACUMULADA.toFixed(3)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 px-2">
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Filas:</span>
                  <select 
                    value={bomRowsPerPage} 
                    onChange={(e) => { setBomRowsPerPage(Number(e.target.value)); setBomPage(1); }}
                    className="bg-white border border-gray-200 rounded px-2 py-1 text-[9px] font-bold text-gray-600 focus:outline-none"
                  >
                    {[100, 250, 500].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setBomPage(1)} disabled={bomPage === 1} className="h-7 w-7 rounded-lg"><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setBomPage(prev => Math.max(1, prev - 1))} disabled={bomPage === 1} className="h-7 w-7 rounded-lg"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                  <div className="px-4 text-[9px] font-black text-gray-700 uppercase">Página {bomPage} / {totalBomPages}</div>
                  <Button variant="ghost" size="icon" onClick={() => setBomPage(prev => Math.min(totalBomPages, prev + 1))} disabled={bomPage === totalBomPages} className="h-7 w-7 rounded-lg"><ChevronRight className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setBomPage(totalBomPages)} disabled={bomPage === totalBomPages} className="h-7 w-7 rounded-lg"><ChevronsRight className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </div>
          ) : !isSearchingBOM && (
            <div className="py-20 text-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
              <DatabaseZap className="w-12 h-12 text-indigo-100 mx-auto" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Ingrese un código FERT para consultar la estructura técnica en SAP</p>
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
                    <th className="px-5 py-4">Stock / Seguridad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px]">
                  {tiemposEnsamblado.length === 0 ? (
                    <tr><td colSpan={6} className="py-24 text-gray-400 italic font-black uppercase tracking-widest opacity-30 text-center">Sin registros técnicos cargados</td></tr>
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
