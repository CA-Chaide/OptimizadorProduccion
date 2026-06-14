'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  CalendarClock, 
  Loader2, 
  Users, 
  Clock,
  MapPin,
  Cpu,
  Layers,
  Settings2,
  LayoutGrid,
  ClipboardList,
  UserPlus,
  BarChart3,
  Sun,
  Moon,
  Power,
  PowerOff
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';
import { useAppContext } from '@/context/AppProvider';

interface WorkstationConfig {
  machine: string;
  isDayActive: boolean;
  isNightActive: boolean;
}

/**
 * Componente: MachineCard
 * Representa el estado y carga de una estación de trabajo específica.
 * Ahora con nombres de materiales y puestos más visibles.
 */
const MachineCard = ({ 
  puestoName, 
  small = false, 
  orders, 
  calculateProductionTime, 
  config, 
  horasNetasDiurnas, 
  horasNetasNocturnas,
  mapToHojaRuta,
  normalizeMaterialCode
}: { 
  puestoName: string;
  small?: boolean;
  orders: any[];
  calculateProductionTime: (material: string, quantity: number, order: any) => number;
  config: WorkstationConfig;
  horasNetasDiurnas: number;
  horasNetasNocturnas: number;
  mapToHojaRuta: (name: string) => string;
  normalizeMaterialCode: (code: string | number) => string;
}) => {
  const hrCode = mapToHojaRuta(puestoName);
  const totalTimeHours = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o), 0) / 60;
  
  // Capacidad basada en encendido/apagado de turnos
  const capacityHours = (config.isDayActive ? horasNetasDiurnas : 0) + (config.isNightActive ? horasNetasNocturnas : 0);
  
  const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;
  const isOverloaded = utilization > 100;

  return (
    <div className={cn(
      "flex border border-slate-200 rounded-3xl overflow-hidden shadow-sm bg-white transition-all hover:shadow-lg",
      small ? "h-[420px]" : "h-[480px]"
    )}>
      {/* PANEL IZQUIERDO - DISEÑO CLARO (INDIGO-50) */}
      <div className={cn(
        "bg-indigo-50/40 p-6 text-slate-900 flex flex-col border-r border-indigo-100",
        small ? "w-[42%]" : "w-[38%]"
      )}>
        <div className="mb-6">
          <div className="flex flex-col gap-2">
            <Badge className="w-fit bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-lg border-none shadow-md shadow-indigo-200">
              {hrCode}
            </Badge>
            <h3 className="text-xl font-black uppercase tracking-tighter text-indigo-950 flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-600 shrink-0" />
              <span className="truncate">{puestoName}</span>
            </h3>
          </div>
          <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-500 mt-2">Status Operativo Puesto</p>
        </div>

        <div className="flex-1 space-y-4">
          <div className="bg-white p-3 rounded-2xl border border-indigo-100 shadow-sm">
            <div className="flex justify-between items-center text-[9px] text-slate-500 uppercase font-black tracking-widest mb-2">Turnos Activos</div>
            <div className="grid grid-cols-2 gap-2">
              <div className={cn(
                "rounded-xl p-2 border flex flex-col items-center transition-colors",
                config.isDayActive ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100 opacity-40"
              )}>
                <Sun className={cn("w-3 h-3 mb-1", config.isDayActive ? "text-amber-600" : "text-slate-400")} />
                <span className={cn("text-[8px] font-black uppercase", config.isDayActive ? "text-amber-700" : "text-slate-400")}>Día</span>
              </div>
              <div className={cn(
                "rounded-xl p-2 border flex flex-col items-center transition-colors",
                config.isNightActive ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-100 opacity-40"
              )}>
                <Moon className={cn("w-3 h-3 mb-1", config.isNightActive ? "text-indigo-600" : "text-slate-400")} />
                <span className={cn("text-[8px] font-black uppercase", config.isNightActive ? "text-indigo-700" : "text-slate-400")}>Noche</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black uppercase text-slate-500 tracking-[0.2em]">Ocupación</p>
              <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-lg border", isOverloaded ? "bg-red-100 border-red-200 text-red-700" : "bg-green-100 border-green-200 text-green-700")}>
                {isOverloaded ? "Saturado" : "Estable"}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className={cn("text-4xl font-black font-mono tracking-tighter", isOverloaded ? "text-red-600" : "text-indigo-800")}>
                {utilization.toFixed(0)}
              </span>
              <span className="text-xs font-black text-slate-400">%</span>
            </div>
            <Progress value={utilization} className={cn("h-3 bg-slate-100 border border-slate-200", isOverloaded ? "[&>div]:bg-red-500" : "[&>div]:bg-indigo-600")} />
            
            <div className="mt-4 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest">
              <div className="bg-slate-50 p-2 rounded-lg border border-slate-100 text-center">
                <span className="text-slate-500 block mb-1">Carga</span>
                <span className="text-slate-900 font-mono">{totalTimeHours.toFixed(2)}h</span>
              </div>
              <div className={cn("p-2 rounded-lg border border-slate-100 text-center", isOverloaded ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700")}>
                <span className="text-slate-500 block mb-1">Cap. Total</span>
                <span className="font-mono">{capacityHours.toFixed(2)}h</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* PANEL DERECHO - TABLA DE ÓRDENES */}
      <div className="flex-1 p-6 flex flex-col bg-slate-50/30">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-[0.25em] flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-indigo-600" /> Plan de Producción
          </h4>
          <Badge className="bg-white text-slate-900 border-slate-200 font-mono font-black text-[10px] px-3 py-0.5 rounded-full shadow-sm">{orders.length} <span className="ml-1 text-[8px] opacity-40 uppercase">ORD</span></Badge>
        </div>
        <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-inner text-[10px]">
          <table className="w-full border-collapse">
            <thead className="bg-slate-100/80 sticky top-0 z-10 text-slate-500 font-black uppercase tracking-widest text-left">
              <tr>
                <th className="px-4 py-3 border-b border-slate-200">Material</th>
                <th className="px-4 py-3 border-b border-slate-200">Nombre</th>
                <th className="px-4 py-3 border-b border-slate-200 text-indigo-600 bg-indigo-50/30">HR</th>
                <th className="px-4 py-3 border-b border-slate-200 text-right">Cant.</th>
                <th className="px-4 py-3 border-b border-slate-200 text-right text-indigo-700 bg-indigo-50/30">T. (h)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.length > 0 ? orders.map((o, i) => {
                const t = calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o) / 60;
                const materialCode = o['CodMaterial'] || normalizeMaterialCode(o['MATERIAL']);
                const materialName = o['NOMBRE'] || o['TEXTOMATERIAL'] || o['Material'] || '—';
                
                return (
                  <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">{materialCode}</td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[180px] font-medium" title={materialName}>
                      {materialName}
                    </td>
                    <td className="px-4 py-3 font-bold text-indigo-700 bg-indigo-50/10">{hrCode}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-slate-800">{Number(o['CANTIDAD'] || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-indigo-600 bg-indigo-50/20">{t.toFixed(2)}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-slate-400 uppercase font-black tracking-widest text-[9px] opacity-40">Sin carga de trabajo</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

/**
 * Componente: TableKPI
 * Muestra el listado de tiempos de ingeniería (KPIs).
 */
const TableKPI = ({ 
  tiemposProduccion, 
  mapToHojaRuta 
}: { 
  tiemposProduccion: any[];
  mapToHojaRuta: (name: string) => string;
}) => (
  <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden shadow-lg border-none">
    <CardHeader className="bg-slate-950 p-8 border-b border-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-500/20">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">Maestros Técnicos de Ingeniería</CardTitle>
            <CardDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Base de datos de Tiempos por Material y Puesto</CardDescription>
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-center">
          <span className="block text-[8px] text-slate-500 uppercase font-black tracking-widest">Registros</span>
          <span className="text-xl font-mono font-black text-sky-400">{tiemposProduccion.length}</span>
        </div>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      <div className="overflow-x-auto max-h-[70vh] relative">
        <table className="w-full text-[11px] border-collapse">
          <thead className="bg-slate-900 sticky top-0 z-10 text-white text-left uppercase tracking-widest font-black">
            <tr>
              <th className="px-6 py-4 bg-slate-950 border-r border-white/5 whitespace-nowrap">Cod. Material</th>
              <th className="px-6 py-4 bg-slate-950 border-r border-white/5 text-sky-400 whitespace-nowrap">HOJA DE RUTA</th>
              <th className="px-6 py-4 border-r border-white/5 whitespace-nowrap">Puesto de Trabajo</th>
              <th className="px-6 py-4 border-r border-white/5 whitespace-nowrap">Descripción</th>
              <th className="px-6 py-4 border-r border-white/5 text-center whitespace-nowrap">Centro</th>
              <th className="px-6 py-4 border-r border-white/5 whitespace-nowrap">Línea</th>
              <th className="px-6 py-4 text-right bg-indigo-900/40 whitespace-nowrap">Min / Und</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {tiemposProduccion.length > 0 ? tiemposProduccion.map((t, i) => (
              <tr key={i} className="hover:bg-slate-50 group transition-colors">
                <td className="px-6 py-4 font-mono font-bold text-slate-600 bg-slate-50/30 whitespace-nowrap">{t.CodMaterial || t.MATERIAL}</td>
                <td className="px-6 py-4 font-mono font-black text-indigo-700 bg-sky-50/50 uppercase whitespace-nowrap">{mapToHojaRuta(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '')}</td>
                <td className="px-6 py-4 font-black text-slate-800 uppercase whitespace-nowrap">{t.PuestoTrabajo || t.nombre_estacion || t.Maquina}</td>
                <td className="px-6 py-4 text-slate-500 max-w-[250px] truncate font-medium">{t.Material || t.DESCRIPCION || t.NOMBRE || '—'}</td>
                <td className="px-6 py-4 text-center font-bold text-slate-700 whitespace-nowrap">{t.Centro || '—'}</td>
                <td className="px-6 py-4 text-slate-600 font-medium whitespace-nowrap">{t.Linea || '—'}</td>
                <td className="px-6 py-4 text-right font-mono font-black text-indigo-600 bg-indigo-50/30 whitespace-nowrap">
                  {(t.Tiempo || t.Tiempo_Min || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan={7} className="py-20 text-center text-slate-300 uppercase font-black tracking-[0.2em]">Cargando maestros de ingeniería...</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
);

export const TacticalPlanForrosSection: React.FC = () => {
  const { addNotification } = useAppContext();
  const [isMounted, setIsMounted] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [tiemposProduccion, setTiemposProduccion] = useState<any[]>([]);
  const [dailyOrders, setDailyOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTiempos, setIsLoadingTiempos] = useState(false);
  const [isLoadingDaily, setIsLoadingDaily] = useState(false);
  
  const [executionDate, setExecutionDate] = useState<string>('');
  const [jornadaDiurnaSel, setJornadaDiurnaSel] = useState("8.75");
  const [jornadaNocturnaSel, setJornadaNocturnaSel] = useState("0");
  const [workstationConfigs, setWorkstationConfigs] = useState<Record<string, WorkstationConfig>>({});

  // Estabilizar hidratación
  useEffect(() => {
    setIsMounted(true);
    setExecutionDate(new Date().toISOString().split('T')[0]);
  }, []);

  const DIURNA_OPTIONS = [
    { label: "07:00 - 15:45 (8.75h)", value: "8.75" },
    { label: "07:00 - 17:00 (10.0h)", value: "10.0" },
    { label: "07:00 - 18:00 (11.0h)", value: "11.0" }
  ];

  const NOCTURNA_OPTIONS = [
    { label: "Sin Jornada Nocturna", value: "0" },
    { label: "19:00 - 05:30 (10.5h)", value: "10.5" },
    { label: "21:00 - 05:30 (8.5h)", value: "8.5" }
  ];

  const horasNetasDiurnas = useMemo(() => parseFloat(jornadaDiurnaSel || "0") * 0.84, [jornadaDiurnaSel]);
  const horasNetasNocturnas = useMemo(() => parseFloat(jornadaNocturnaSel || "0") * 0.84, [jornadaNocturnaSel]);

  const normalizeMaterialCode = useCallback((code: string | number): string => {
    if (!code) return '';
    return String(code).trim().replace(/^0+/, '');
  }, []);

  const mapToHojaRuta = useCallback((puestoName: string): string => {
    const pn = String(puestoName || '').toUpperCase().trim();
    if (!pn || pn === '—' || pn === 'NULL') return '';
    
    // Reglas de negocio explícitas
    if (pn === 'ACOLCHADORA09') return 'HR-ACH09';
    if (pn === 'COSEDORA-ACH02') return 'HR-PEF02';
    if (pn === 'COSEDORA-ACH08') return 'HR-PEF08';

    // Búsqueda en maestros
    const match = tiemposProduccion.find(t => {
      const tp = String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').toUpperCase().trim();
      return tp === pn;
    });

    if (match) {
      const hr = String(match.HojaRuta || match['HOJA DE RUTA'] || '').trim();
      if (hr && hr.startsWith('HR-')) return hr;
    }

    // Deducción automática por sufijo numérico
    const numMatch = pn.match(/\d+/);
    const num = numMatch ? numMatch[0].padStart(2, '0') : '';
    if (pn.includes('COSEDORA') || pn.includes('PEGADORA') || pn.includes('PEF')) return `HR-PEF${num}`;
    if (pn.includes('ACOLCHADORA') || pn.includes('ACH')) return `HR-ACH${num}`;
    
    return pn.startsWith('HR-') ? pn : `HR-${pn}`;
  }, [tiemposProduccion]);

  const fetchBaseData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [gRes, rRes] = await Promise.all([
        grupoService.getAll(),
        restriccionService.getAll()
      ]);
      setGrupos(gRes.data || []);
      setRestricciones(rRes.data || []);
    } catch (error) {
      console.error('Error fetching base data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isMounted) fetchBaseData();
  }, [isMounted, fetchBaseData]);

  const forrosGruposList = useMemo(() => {
    return grupos.filter(g => {
      const name = (g.nombre_grupo || '').toUpperCase();
      return name.includes('FORRO') || name.includes('CHN') || name.includes('BASE') || name.includes('BANDA') || name.includes('ACOLCHADO') || name.includes('TAPAS');
    });
  }, [grupos]);

  const forrosRestricciones = useMemo(() => {
    const forrosGroupIds = new Set(forrosGruposList.map(g => g.codigo_grupo));
    return restricciones.filter(r => forrosGroupIds.has(r.codigo_grupo));
  }, [forrosGruposList, restricciones]);

  const externalFilters = useMemo(() => {
    const filters: Record<string, string[]> = {};
    forrosRestricciones.forEach(r => {
      const name = (r.nombre_restriccion || '').trim().toUpperCase();
      if (name === 'RESPCTRLPROD' || name === 'ALMACEN') {
        if (!filters[name]) filters[name] = [];
        filters[name].push(...r.valor_restriccion.split('&').map(s => s.trim()));
      }
    });
    return filters;
  }, [forrosRestricciones]);

  const fetchTiemposProduccion = useCallback(async () => {
    if (forrosGruposList.length === 0) return;
    setIsLoadingTiempos(true);
    try {
      const promises = forrosGruposList.map(g => 
        serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo)
      );
      const responses = await Promise.all(promises);
      let allData = responses.flatMap(res => res.data || []);
      
      if (externalFilters.RESPCTRLPROD) {
        const allowed = externalFilters.RESPCTRLPROD.map(c => c.trim().padStart(3, '0'));
        allData = allData.filter(t => {
          const resp = String(t.RespControlProd || t.RESPCONTROLPROD || t.RespCtrlProd || '').trim().padStart(3, '0');
          return allowed.includes(resp);
        });
      }
      setTiemposProduccion(allData);
    } catch (error) {
      console.error('Error al cargar tiempos:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [forrosGruposList, externalFilters]);

  const fetchDailyOrders = useCallback(async () => {
    if (!isMounted) return;
    setIsLoadingDaily(true);
    try {
      const response = await serviciosService.OrdenesProvisionalesAlphaPaginados(1, 10000);
      if (response && response.data) {
        let filtered = response.data;
        if (externalFilters.RESPCTRLPROD) {
          const allowedCodes = externalFilters.RESPCTRLPROD.map(c => c.trim().padStart(3, '0'));
          filtered = filtered.filter((o: any) => {
            const resp = String(o.RESPCONTROLPROD || '').trim().padStart(3, '0');
            return allowedCodes.includes(resp);
          });
        }
        setDailyOrders(filtered);
      }
    } catch (error) {
      console.error('Error fetching daily orders:', error);
    } finally {
      setIsLoadingDaily(false);
    }
  }, [isMounted, externalFilters]);

  const getResolvedPuesto = useCallback((order: any) => {
    const orderFields = ['PuestoTrabajo', 'MAQUINA', 'Maquina'];
    for (const k of orderFields) {
      const val = order[k];
      if (val && String(val).trim() !== '' && String(val).toLowerCase() !== 'null') {
        return String(val).trim().toUpperCase();
      }
    }
    const material = normalizeMaterialCode(order['MATERIAL'] || order['CodMaterial'] || '');
    const match = tiemposProduccion.find(t => normalizeMaterialCode(t.CodMaterial || t.Material || '') === material);
    return match ? String(match.PuestoTrabajo || match.nombre_estacion || match.Maquina || '').trim().toUpperCase() : '';
  }, [tiemposProduccion, normalizeMaterialCode]);

  const uniquePuestos = useMemo(() => {
    const pSet = new Set<string>();
    tiemposProduccion.forEach(t => {
      const p = String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').trim().toUpperCase();
      if (p && p !== 'NULL' && p !== '-' && p !== '—') pSet.add(p);
    });
    dailyOrders.forEach(o => {
      const p = getResolvedPuesto(o);
      if (p && p !== '') pSet.add(p);
    });
    return Array.from(pSet).sort();
  }, [tiemposProduccion, dailyOrders, getResolvedPuesto]);

  const calculateProductionTime = useCallback((material: string, quantity: number, order: any) => {
    if (!material) return 0;
    const normMaterial = normalizeMaterialCode(material);
    const puesto = getResolvedPuesto(order);
    const match = tiemposProduccion.find(t => {
      const mNorm = normalizeMaterialCode(t.CodMaterial || t.Material || '');
      const tPuesto = String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').trim().toUpperCase();
      return mNorm === normMaterial && tPuesto === puesto;
    }) || tiemposProduccion.find(t => normalizeMaterialCode(t.CodMaterial || t.Material || '') === normMaterial);
    return match ? (Number(match.Tiempo || match.Tiempo_Min || 0) * quantity) : 0;
  }, [tiemposProduccion, normalizeMaterialCode, getResolvedPuesto]);

  useEffect(() => {
    if (uniquePuestos.length > 0 && Object.keys(workstationConfigs).length === 0) {
      const initial: Record<string, WorkstationConfig> = {};
      uniquePuestos.forEach(p => {
        initial[p] = { machine: p, isDayActive: true, isNightActive: false };
      });
      setWorkstationConfigs(initial);
    }
  }, [uniquePuestos, workstationConfigs]);

  useEffect(() => {
    if (isMounted && forrosGruposList.length > 0) {
      fetchTiemposProduccion();
      fetchDailyOrders();
    }
  }, [isMounted, forrosGruposList, fetchTiemposProduccion, fetchDailyOrders]);

  const toggleWorkstationShift = (p: string, shift: 'day' | 'night') => {
    setWorkstationConfigs(prev => {
      const current = prev[p] || { machine: p, isDayActive: true, isNightActive: false };
      return {
        ...prev,
        [p]: {
          ...current,
          [shift === 'day' ? 'isDayActive' : 'isNightActive']: !current[shift === 'day' ? 'isDayActive' : 'isNightActive']
        }
      };
    });
  };

  if (!isMounted) return null;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50/40">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mx-auto mb-4" />
          <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest">Sincronizando sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50/40 min-h-screen font-body">
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 bg-white p-7 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-6">
          <div className="bg-slate-950 p-5 rounded-[1.5rem] text-white shadow-xl ring-4 ring-slate-100">
            <CalendarClock className="w-9 h-9 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Programación Táctica</h2>
              <Badge className="bg-indigo-600 text-white border-none font-black px-3 py-1 rounded-lg text-[10px] uppercase tracking-widest shadow-sm">Forros</Badge>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em] flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> Monitor de Planta Real Time
              </span>
              <div className="h-4 w-px bg-slate-200 mx-1" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Eficiencia: 84%
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex items-center gap-5 min-w-[200px] shadow-inner">
            <div className="bg-indigo-700 p-3 rounded-2xl text-white shadow-lg"><MapPin className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">GYE (2000)</p>
              <p className="text-2xl font-black text-slate-900 font-mono tracking-tight">{dailyOrders.filter(o => String(o.Centro).trim() === '2000').length.toLocaleString()} <span className="text-xs text-slate-400 opacity-60 font-bold uppercase">ORD</span></p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex items-center gap-5 min-w-[200px] shadow-inner">
            <div className="bg-slate-800 p-3 rounded-2xl text-white shadow-lg"><MapPin className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">UIO (1000)</p>
              <p className="text-2xl font-black text-slate-900 font-mono tracking-tight">{dailyOrders.filter(o => String(o.Centro).trim() === '1000').length.toLocaleString()} <span className="text-xs text-slate-400 opacity-60 font-bold uppercase">ORD</span></p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="resumen-produccion" className="w-full">
        <TabsList className="flex w-full h-auto bg-white border border-slate-200 p-2.5 mb-10 rounded-[2rem] shadow-sm overflow-x-auto justify-start sticky top-0 z-50">
          <TabsTrigger value="resumen-produccion" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <BarChart3 className="w-4 h-4" /> Resumen de Producción
          </TabsTrigger>
          <TabsTrigger value="acolchado-tapas" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <Cpu className="w-4 h-4" /> 1. Acolchado & Tapas
          </TabsTrigger>
          <TabsTrigger value="bandas" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <Layers className="w-4 h-4" /> 2. Proceso Bandas
          </TabsTrigger>
          <TabsTrigger value="interiores-corte" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <Settings2 className="w-4 h-4" /> 3. Interiores & Corte
          </TabsTrigger>
          <TabsTrigger value="forros" className="flex items-center gap-2.5 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <LayoutGrid className="w-4 h-4" /> 4. Forros Finales
          </TabsTrigger>
          <TabsTrigger value="personal-turnos" className="flex items-center gap-2 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <UserPlus className="w-4 h-4" /> Personal & Turnos
          </TabsTrigger>
          <TabsTrigger value="kpi-tiempos" className="flex items-center gap-2 px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <ClipboardList className="w-4 h-4" /> KPI TIEMPOS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen-produccion">
          <Card className="rounded-[2.5rem] shadow-sm border-slate-200 overflow-hidden bg-white ring-1 ring-slate-100">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-10">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-7 h-7 text-indigo-600" />
                    <CardTitle className="text-2xl font-black text-slate-900 uppercase tracking-tight">Matriz de Salud de Planta</CardTitle>
                  </div>
                  <CardDescription className="mt-2 text-slate-500 font-bold uppercase text-[10px] tracking-widest">Resumen basado en Puestos de Trabajo operativos</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-slate-900 sticky top-0 z-10 text-white text-left uppercase tracking-widest font-black">
                    <tr>
                      <th className="px-8 py-5 bg-slate-950">Puesto de Trabajo</th>
                      <th className="px-8 py-5 text-sky-400">HOJA DE RUTA</th>
                      <th className="px-8 py-5 text-right">Cant. Total</th>
                      <th className="px-8 py-5 text-right bg-indigo-950/20">T. Requerido (h)</th>
                      <th className="px-8 py-5 text-right">Capacidad (h)</th>
                      <th className="px-8 py-5 text-center">% Ocupación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {uniquePuestos.map((p, idx) => {
                      const orders = dailyOrders.filter(o => getResolvedPuesto(o) === p);
                      const totalUnits = orders.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0);
                      const totalTimeHours = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o), 0) / 60;
                      const config = workstationConfigs[p] || { machine: p, isDayActive: true, isNightActive: false };
                      const capacityHours = (config.isDayActive ? horasNetasDiurnas : 0) + (config.isNightActive ? horasNetasNocturnas : 0);
                      const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;
                      
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-all group">
                          <td className="px-8 py-5 font-black text-slate-900 bg-slate-50/20 uppercase whitespace-nowrap">{p}</td>
                          <td className="px-8 py-5 font-mono font-black text-indigo-700 uppercase whitespace-nowrap">{mapToHojaRuta(p)}</td>
                          <td className="px-8 py-5 text-right font-mono font-black text-slate-800">{totalUnits.toLocaleString()}</td>
                          <td className="px-8 py-5 text-right font-mono font-black text-indigo-700 bg-indigo-50/40">{totalTimeHours.toFixed(2)}h</td>
                          <td className="px-8 py-5 text-right font-mono font-bold text-slate-900">{capacityHours.toFixed(2)}h</td>
                          <td className="px-8 py-5 text-center">
                             <div className="flex items-center justify-center gap-4">
                               <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden max-w-[100px] border border-slate-200">
                                 <div className={cn("h-full transition-all duration-1000", utilization > 100 ? "bg-red-500" : "bg-indigo-600")} style={{ width: `${Math.min(utilization, 100)}%` }} />
                               </div>
                               <span className={cn("font-mono font-black text-[10px] min-w-[30px]", utilization > 100 ? "text-red-600" : "text-slate-900")}>{utilization.toFixed(0)}%</span>
                             </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acolchado-tapas" className="space-y-16 pb-20">
          {['02', '06', '07', '08', '09', '10'].map(suffix => {
            const achNames = uniquePuestos.filter(p => p.includes(`ACH${suffix}`) || p.includes(`ACOLCHADORA${suffix}`));
            const pefNames = uniquePuestos.filter(p => p.includes(`PEF${suffix}`) || p.includes(`COSEDORA-ACH${suffix}`) || p.includes(`PEGADORA${suffix}`));
            if (achNames.length === 0 && pefNames.length === 0) return null;
            return (
              <div key={suffix} className="space-y-6">
                <div className="flex items-center gap-4 px-7 py-2.5 bg-slate-900 rounded-full w-fit shadow-xl">
                  <div className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
                  <span className="text-white font-black text-xs uppercase tracking-[0.3em]">Célula Twin {suffix}</span>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
                  {achNames.length > 0 ? (
                    <MachineCard 
                      puestoName={achNames[0]} 
                      orders={dailyOrders.filter(o => getResolvedPuesto(o) === achNames[0])}
                      calculateProductionTime={calculateProductionTime}
                      config={workstationConfigs[achNames[0]] || { machine: achNames[0], isDayActive: true, isNightActive: false }}
                      horasNetasDiurnas={horasNetasDiurnas}
                      horasNetasNocturnas={horasNetasNocturnas}
                      mapToHojaRuta={mapToHojaRuta}
                      normalizeMaterialCode={normalizeMaterialCode}
                    />
                  ) : <div className="hidden xl:flex bg-slate-100/30 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-20 text-slate-300 font-black uppercase text-[10px]">ACH No Definida</div>}
                  
                  {pefNames.length > 0 ? (
                    <MachineCard 
                      puestoName={pefNames[0]} 
                      orders={dailyOrders.filter(o => getResolvedPuesto(o) === pefNames[0])}
                      calculateProductionTime={calculateProductionTime}
                      config={workstationConfigs[pefNames[0]] || { machine: pefNames[0], isDayActive: true, isNightActive: false }}
                      horasNetasDiurnas={horasNetasDiurnas}
                      horasNetasNocturnas={horasNetasNocturnas}
                      mapToHojaRuta={mapToHojaRuta}
                      normalizeMaterialCode={normalizeMaterialCode}
                    />
                  ) : <div className="hidden xl:flex bg-slate-100/30 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-20 text-slate-300 font-black uppercase text-[10px]">PEF No Definida</div>}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="bandas" className="space-y-10 pb-20">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {uniquePuestos.filter(p => p.includes('ACH11') || p.includes('ACH12') || p.includes('RMTB') || p.includes('COS3D') || p.includes('ENCBD') || p.includes('BO01')).map((pName) => (
              <MachineCard 
                key={pName} 
                puestoName={pName} 
                small 
                orders={dailyOrders.filter(o => getResolvedPuesto(o) === pName)}
                calculateProductionTime={calculateProductionTime}
                config={workstationConfigs[pName] || { machine: pName, isDayActive: true, isNightActive: false }}
                horasNetasDiurnas={horasNetasDiurnas}
                horasNetasNocturnas={horasNetasNocturnas}
                mapToHojaRuta={mapToHojaRuta}
                normalizeMaterialCode={normalizeMaterialCode}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="interiores-corte" className="space-y-10 pb-20">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {uniquePuestos.filter(p => p.includes('INTP') || p.includes('MTBS') || p.includes('CT') || p.includes('TTCF') || p.includes('TTSUP') || p.includes('TELAS') || p.includes('FUNDAS')).map((pName) => (
              <MachineCard 
                key={pName} 
                puestoName={pName} 
                small 
                orders={dailyOrders.filter(o => getResolvedPuesto(o) === pName)}
                calculateProductionTime={calculateProductionTime}
                config={workstationConfigs[pName] || { machine: pName, isDayActive: true, isNightActive: false }}
                horasNetasDiurnas={horasNetasDiurnas}
                horasNetasNocturnas={horasNetasNocturnas}
                mapToHojaRuta={mapToHojaRuta}
                normalizeMaterialCode={normalizeMaterialCode}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="forros" className="space-y-10 pb-20">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {uniquePuestos.filter(p => p.includes('FORRO') || p.includes('FBASE')).map((pName) => (
              <MachineCard 
                key={pName} 
                puestoName={pName} 
                small 
                orders={dailyOrders.filter(o => getResolvedPuesto(o) === pName)}
                calculateProductionTime={calculateProductionTime}
                config={workstationConfigs[pName] || { machine: pName, isDayActive: true, isNightActive: false }}
                horasNetasDiurnas={horasNetasDiurnas}
                horasNetasNocturnas={horasNetasNocturnas}
                mapToHojaRuta={mapToHojaRuta}
                normalizeMaterialCode={normalizeMaterialCode}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="personal-turnos">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            {/* CONFIGURACIÓN DE JORNADAS */}
            <Card className="lg:col-span-1 rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden border-none shadow-sm">
               <CardHeader className="bg-slate-950 text-white p-8"><CardTitle className="text-xl font-black uppercase">Configuración de Jornada</CardTitle></CardHeader>
               <CardContent className="p-10 space-y-10">
                 <div className="space-y-5">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Sun className="w-4 h-4 text-amber-500" /> Jornada Diurna</label>
                    <Select value={jornadaDiurnaSel} onValueChange={setJornadaDiurnaSel}>
                      <SelectTrigger className="h-14 border-2 rounded-2xl font-black text-slate-800"><SelectValue /></SelectTrigger>
                      <SelectContent>{DIURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-black py-3">{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex justify-between items-center">
                      <span className="text-[10px] font-black text-amber-700 uppercase">Capacidad Neta (D)</span>
                      <span className="font-mono font-black text-amber-900">{horasNetasDiurnas.toFixed(2)}h</span>
                    </div>
                 </div>
                 <div className="space-y-5">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Moon className="w-4 h-4 text-indigo-500" /> Jornada Nocturna</label>
                    <Select value={jornadaNocturnaSel} onValueChange={setJornadaNocturnaSel}>
                      <SelectTrigger className="h-14 border-2 rounded-2xl font-black text-slate-800"><SelectValue /></SelectTrigger>
                      <SelectContent>{NOCTURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-black py-3">{opt.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex justify-between items-center">
                      <span className="text-[10px] font-black text-indigo-700 uppercase">Capacidad Neta (N)</span>
                      <span className="font-mono font-black text-indigo-900">{horasNetasNocturnas.toFixed(2)}h</span>
                    </div>
                 </div>
               </CardContent>
            </Card>

            {/* CONTROL DE ACTIVACIÓN POR PUESTO */}
            <div className="lg:col-span-2 space-y-10">
              <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden border-none shadow-sm">
                <CardHeader className="bg-slate-50/50 p-8 border-b flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-xl font-black uppercase tracking-tight flex items-center gap-2">Asignación Operativa por Máquina</CardTitle>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Determine si la máquina se encenderá en cada turno específico</p>
                  </div>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-h-[60vh] overflow-y-auto pr-2">
                      {uniquePuestos.map(p => {
                        const config = workstationConfigs[p] || { machine: p, isDayActive: true, isNightActive: false };
                        return (
                          <div key={p} className="flex items-center justify-between p-5 border-2 border-slate-50 rounded-3xl bg-white hover:border-indigo-100 transition-all group">
                            <div className="flex-1 min-w-0 mr-4">
                              <p className="font-black text-slate-800 uppercase text-xs truncate" title={p}>{p}</p>
                              <div className="flex gap-2 mt-2">
                                {config.isDayActive && <Badge className="bg-amber-100 text-amber-700 border-none font-mono text-[8px] uppercase">Día</Badge>}
                                {config.isNightActive && <Badge className="bg-indigo-100 text-indigo-700 border-none font-mono text-[8px] uppercase">Noche</Badge>}
                                {!config.isDayActive && !config.isNightActive && <Badge className="bg-slate-100 text-slate-400 border-none font-mono text-[8px] uppercase">Apagada</Badge>}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                              {/* TOGGLE DIA */}
                              <button 
                                onClick={() => toggleWorkstationShift(p, 'day')}
                                className={cn(
                                  "w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all shadow-sm",
                                  config.isDayActive ? "bg-amber-500 text-white shadow-amber-200" : "bg-white text-slate-300"
                                )}
                                title={config.isDayActive ? "Turno Día Encendido" : "Turno Día Apagado"}
                              >
                                <Sun className="w-4 h-4 mb-0.5" />
                                <span className="text-[8px] font-black uppercase">Día</span>
                              </button>
                              
                              {/* TOGGLE NOCHE */}
                              <button 
                                onClick={() => toggleWorkstationShift(p, 'night')}
                                className={cn(
                                  "w-12 h-12 rounded-xl flex flex-col items-center justify-center transition-all shadow-sm",
                                  config.isNightActive ? "bg-indigo-600 text-white shadow-indigo-200" : "bg-white text-slate-300"
                                )}
                                title={config.isNightActive ? "Turno Noche Encendido" : "Turno Noche Apagado"}
                              >
                                <Moon className="w-4 h-4 mb-0.5" />
                                <span className="text-[8px] font-black uppercase">Noc</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </CardContent>
              </Card>

              {/* LEYENDA TÉCNICA */}
              <div className="bg-blue-50 border border-blue-100 rounded-3xl p-6 flex gap-4">
                <div className="bg-blue-600 p-2 rounded-xl text-white h-fit"><ClipboardList className="w-5 h-5" /></div>
                <div>
                  <h4 className="text-xs font-black text-blue-900 uppercase mb-2">Lógica de Capacidad</h4>
                  <ul className="text-[10px] text-blue-800/80 space-y-1 font-medium leading-relaxed">
                    <li>• <span className="font-black uppercase">Día (Día):</span> Suma {horasNetasDiurnas.toFixed(2)}h netas si está activa.</li>
                    <li>• <span className="font-black uppercase">Noc (Noche):</span> Suma {horasNetasNocturnas.toFixed(2)}h netas si está activa.</li>
                    <li>• <span className="font-black">EFICIENCIA:</span> Los valores ya consideran el 84% de rendimiento estándar.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kpi-tiempos">
          <TableKPI tiemposProduccion={tiemposProduccion} mapToHojaRuta={mapToHojaRuta} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
