
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
  PackageSearch,
  SearchCode,
  Database,
  Filter,
  Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
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
 * Tarjeta de control de carga para cada puesto de trabajo en los tableros técnicos.
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
  const capacityHours = (config.isDayActive ? horasNetasDiurnas : 0) + (config.isNightActive ? horasNetasNocturnas : 0);
  const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;
  const isOverloaded = utilization > 100;

  return (
    <div className={cn(
      "flex border border-slate-200 rounded-3xl overflow-hidden shadow-sm bg-white transition-all hover:shadow-lg",
      small ? "h-[420px]" : "h-[480px]"
    )}>
      <div className={cn(
        "bg-indigo-50/50 p-6 text-slate-900 flex flex-col border-r border-indigo-100",
        small ? "w-[42%]" : "w-[38%]"
      )}>
        <div className="mb-6">
          <div className="flex flex-col gap-2">
            <Badge className="w-fit bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest px-3 py-1 rounded-lg border-none shadow-md shadow-indigo-200">
              {hrCode}
            </Badge>
            <h3 className="text-2xl font-black uppercase tracking-tighter text-indigo-950 flex items-center gap-2 break-words leading-tight">
              <Cpu className="w-6 h-6 text-indigo-600 shrink-0" />
              <span>{puestoName}</span>
            </h3>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="bg-white p-3 rounded-2xl border border-indigo-100 shadow-sm">
            <div className="flex justify-between items-center text-[9px] text-slate-500 uppercase font-black tracking-widest mb-2">Turnos Activos</div>
            <div className="grid grid-cols-2 gap-2">
              <div className={cn("rounded-xl p-2 border flex flex-col items-center", config.isDayActive ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100 opacity-40")}>
                <Sun className={cn("w-3 h-3 mb-1", config.isDayActive ? "text-amber-600" : "text-slate-400")} />
                <span className={cn("text-[8px] font-black uppercase", config.isDayActive ? "text-amber-700" : "text-slate-400")}>Día</span>
              </div>
              <div className={cn("rounded-xl p-2 border flex flex-col items-center", config.isNightActive ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-100 opacity-40")}>
                <Moon className={cn("w-3 h-3 mb-1", config.isNightActive ? "text-indigo-600" : "text-slate-400")} />
                <span className={cn("text-[8px] font-black uppercase", config.isNightActive ? "text-indigo-700" : "text-slate-400")}>Noche</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-black uppercase text-slate-500">Ocupación</p>
              <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-lg border", isOverloaded ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>
                {isOverloaded ? "Saturado" : "Estable"}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 mb-2">
              <span className={cn("text-4xl font-black font-mono tracking-tighter", isOverloaded ? "text-red-600" : "text-indigo-800")}>
                {utilization.toFixed(0)}
              </span>
              <span className="text-xs font-black text-slate-400">%</span>
            </div>
            <Progress value={utilization} className={cn("h-3 bg-slate-100", isOverloaded ? "[&>div]:bg-red-500" : "[&>div]:bg-indigo-600")} />
            
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
                <th className="px-4 py-3 border-b border-slate-200 min-w-[250px]">Nombre</th>
                <th className="px-4 py-3 border-b border-slate-200 text-indigo-600">HR</th>
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
                    <td className="px-4 py-3 text-slate-600 font-medium whitespace-normal break-words leading-tight">{materialName}</td>
                    <td className="px-4 py-3 font-bold text-indigo-700">{hrCode}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-slate-800">{Number(o['CANTIDAD'] || 0).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-indigo-600 bg-indigo-50/10">{t.toFixed(2)}</td>
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

export const TacticalPlanForrosSection: React.FC = () => {
  const { addNotification } = useAppContext();
  const [isMounted, setIsMounted] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [tiemposProduccion, setTiemposProduccion] = useState<any[]>([]);
  const [dailyOrders, setDailyOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);
  const [kpiMaestroData, setKpiMaestroData] = useState<any[]>([]);
  const [ordenesPrevisionalesData, setOrdenesPrevisionalesData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTiempos, setIsLoadingTiempos] = useState(false);
  const [isLoadingFert, setIsLoadingFert] = useState(false);
  const [isLoadingKPI, setIsLoadingKPI] = useState(false);
  const [isLoadingPrevisionales, setIsLoadingPrevisionales] = useState(false);
  
  const [executionDate, setExecutionDate] = useState<string>('');
  const [jornadaDiurnaSel, setJornadaDiurnaSel] = useState("8.75");
  const [jornadaNocturnaSel, setJornadaNocturnaSel] = useState("0");
  const [workstationConfigs, setWorkstationConfigs] = useState<Record<string, WorkstationConfig>>({});

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
    const codeStr = String(code).trim();
    return codeStr.replace(/^0+/, '');
  }, []);

  const mapToHojaRuta = useCallback((puestoName: string): string => {
    const pn = String(puestoName || '').toUpperCase().trim();
    if (!pn || pn === '—' || pn === 'NULL') return '';
    
    // Mapeos explícitos
    if (pn === 'ACOLCHADORA09') return 'HR-ACH09';
    if (pn === 'COSEDORA-ACH02') return 'HR-PEF02';
    if (pn === 'COSEDORA-ACH08') return 'HR-PEF08';

    const match = tiemposProduccion.find(t => {
      const tp = String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').toUpperCase().trim();
      return tp === pn;
    });

    if (match) {
      const hr = String(match.HojaRuta || match['HOJA DE RUTA'] || '').trim();
      if (hr && hr.startsWith('HR-')) return hr;
    }

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

  const fetchOrdenesFert = useCallback(async () => {
    setIsLoadingFert(true);
    try {
      const response = await serviciosService.getOrdenesFert(1, 1000);
      setOrdenesFert(response.data || []);
    } catch (error: any) {
      console.error('Error fetching Fert orders:', error);
      addNotification('error', `Error al cargar órdenes FERT: ${error.message}`);
    } finally {
      setIsLoadingFert(false);
    }
  }, [addNotification]);

  const fetchKPIMaestro = useCallback(async () => {
    setIsLoadingKPI(true);
    try {
      const response = await serviciosService.getKPIMaestroForros();
      setKpiMaestroData(response.data || []);
    } catch (error: any) {
      console.error('Error fetching KPI Maestro:', error);
      addNotification('error', `Error al cargar KPI Maestro: ${error.message}`);
    } finally {
      setIsLoadingKPI(false);
    }
  }, [addNotification]);

  const fetchOrdenesPrevisionales = useCallback(async () => {
    setIsLoadingPrevisionales(true);
    try {
      const response = await serviciosService.OrdenesProvisionalesPaginados(1, 1000);
      setOrdenesPrevisionalesData(response.data || []);
    } catch (error: any) {
      console.error('Error fetching Provisional orders:', error);
      addNotification('error', `Error al cargar órdenes previsionales: ${error.message}`);
    } finally {
      setIsLoadingPrevisionales(false);
    }
  }, [addNotification]);

  useEffect(() => {
    if (isMounted) {
      fetchBaseData();
      fetchOrdenesFert();
      fetchKPIMaestro();
      fetchOrdenesPrevisionales();
    }
  }, [isMounted, fetchBaseData, fetchOrdenesFert, fetchKPIMaestro, fetchOrdenesPrevisionales]);

  const forrosGruposList = useMemo(() => {
    return grupos.filter(g => {
      const name = (g.nombre_grupo || '').toUpperCase();
      return name.includes('FORRO') || name.includes('CHN') || name.includes('BASE') || name.includes('BANDA') || name.includes('ACOLCHADO') || name.includes('TAPAS') || name.includes('MODULAR') || name.includes('TAPA');
    });
  }, [grupos]);

  const allowedRespCodes = useMemo(() => {
    const codes = new Set<string>();
    const forroGroupCodes = new Set(forrosGruposList.map(g => g.codigo_grupo));
    
    restricciones.forEach(r => {
      if (forroGroupCodes.has(r.codigo_grupo)) {
        const normName = r.nombre_restriccion.toUpperCase().trim();
        if (normName === 'RESPCTRLPROD' || normName === 'RESP_CTRL_PROD') {
          const values = r.valor_restriccion.split('&');
          values.forEach(v => {
            const clean = v.trim().replace(/^0+/, '');
            if (clean) codes.add(clean);
          });
        }
      }
    });
    
    return Array.from(codes);
  }, [restricciones, forrosGruposList]);

  const filteredOrdenesPrevisionales = useMemo(() => {
    let filtered = ordenesPrevisionalesData.filter(order => {
      const centroField = Object.keys(order).find(k => k.toUpperCase().trim() === 'CENTRO');
      const centroVal = String(order[centroField || 'Centro'] || '').trim();
      return centroVal === '1000';
    });

    if (allowedRespCodes.length > 0) {
      filtered = filtered.filter(order => {
        const respField = Object.keys(order).find(k => {
          const uk = k.toUpperCase();
          return uk === 'RESPCONTROLPROD' || uk === 'RESP_CTRL_PROD' || uk === 'RESPONSABLE' || uk === 'RESP';
        });

        if (!respField) return true;

        const orderResp = String(order[respField] || '').trim().replace(/^0+/, '');
        return allowedRespCodes.includes(orderResp);
      });
    }

    return filtered;
  }, [ordenesPrevisionalesData, allowedRespCodes]);

  const fetchTiemposProduccion = useCallback(async () => {
    if (forrosGruposList.length === 0) return;
    setIsLoadingTiempos(true);
    try {
      const promises = forrosGruposList.map(g => 
        serviciosService.getTiemposEnsambladobyCentroyCodigoGrupo(g.centro, g.codigo_grupo)
      );
      const responses = await Promise.all(promises);
      let allData = responses.flatMap(res => res.data || []);
      setTiemposProduccion(allData);
    } catch (error) {
      console.error('Error al cargar tiempos:', error);
    } finally {
      setIsLoadingTiempos(false);
    }
  }, [forrosGruposList]);

  const fetchDailyOrders = useCallback(async () => {
    if (!isMounted) return;
    try {
      const response = await serviciosService.OrdenesProvisionalesAlphaPaginados(1, 10000);
      if (response && response.data) {
        setDailyOrders(response.data);
      }
    } catch (error) {
      console.error('Error fetching daily orders:', error);
    }
  }, [isMounted]);

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

  const calculateProductionTime = useCallback((material: string, quantity: number, order: any) => {
    if (!material) return 0;
    const normMaterial = normalizeMaterialCode(material);
    const puesto = getResolvedPuesto(order);
    
    const match = tiemposProduccion.find(t => {
      const mNormInternal = normalizeMaterialCode(t.CodMaterial || t.Material || '');
      const tPuesto = String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').trim().toUpperCase();
      return mNormInternal === normMaterial && tPuesto === puesto;
    }) || tiemposProduccion.find(t => normalizeMaterialCode(t.CodMaterial || t.Material || '') === normMaterial);
    
    return match ? (Number(match.Tiempo || match.Tiempo_Min || 0) * quantity) : 0;
  }, [tiemposProduccion, normalizeMaterialCode, getResolvedPuesto]);

  // Obtiene el tiempo unitario desde el Maestro de Forros (KPI) - Convirtiendo de segundos a minutos
  const getKPITimeInMinutesForOrder = useCallback((order: any) => {
    if (!kpiMaestroData || kpiMaestroData.length === 0) return null;
    
    const materialCode = normalizeMaterialCode(order['MATERIAL'] || order['CodMaterial'] || '');
    const puestoName = getResolvedPuesto(order);
    const hojaRuta = mapToHojaRuta(puestoName);
    
    if (!materialCode || !hojaRuta) return null;

    const match = kpiMaestroData.find(kpi => 
      normalizeMaterialCode(kpi.CodigoMaterial) === materialCode && 
      String(kpi.HRUTA).trim().toUpperCase() === hojaRuta.trim().toUpperCase()
    );

    // Se asume que TPromedio viene en segundos del backend, se divide por 60 para mostrar minutos
    return match ? (Number(match.TPromedio) / 60) : null;
  }, [kpiMaestroData, normalizeMaterialCode, getResolvedPuesto, mapToHojaRuta]);

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

  const workstationGroups = [
    { 
      title: "ACOLCHADORAS DE TAPAS Y PEGADORAS DE FALSO", 
      items: [
        "ACOLCHADORA02", "COSEDORA-ACH02", "ACOLCHADORA06", "COSEDORA-ACH06", 
        "ACOLCHADORA07", "COSEDORA-ACH07", "ACOLCHADORA08", "COSEDORA-ACH08", 
        "ACOLCHADORA09", "COSEDORA-ACH09", "ACOLCHADORA10", "COSEDORA-ACH10", 
        "COSEDORA-ACH11", "COSEDORA-ACH12", "COSEDORA-ACH13"
      ] 
    },
    { 
      title: "BANDAS", 
      items: ["ACOLCHADORA11", "ACOLCHADORA12", "COSEDORA-BANDA3D", "COSEDORA-BO01", "COSEDORA-ENCINTADOBD", "BORDADORA-BANDA01"] 
    },
    { 
      title: "REMATADORADAS DE BANDAS", 
      items: ["COSEDORA-RMTB1", "COSEDORA-RMTB2", "COSEDORA-RMTB3", "COSEDORA-RMTBM"] 
    },
    { 
      title: "CORTADORA DE TELA", 
      items: ["CORTELA10", "CORTE-ESPUMA"] 
    },
    { 
      title: "INTERIORES", 
      items: ["COSEDORA-INTPF", "COSEDORA-INTPF1", "COSEDORA-INTPF2", "COSEDORA-INTPR", "COSEDORA-INTPT"] 
    },
    { 
      title: "BASES", 
      items: ["COSEDORA-BSCTP", "COSEDORA-BSC-CC"] 
    },
    { 
      title: "TAPAS TELAS Y TAPAS SUPERIORES", 
      items: ["COSEDORA-TTCHN", "COSEDORA-TTSUP-CHN"] 
    },
    { 
      title: "FORROS CHN Y BASES", 
      items: ["FORRO-BASE-BCAMAS", "FORRO-COLCHONES"] 
    }
  ];

  if (!isMounted) return null;

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50/40 min-h-screen font-body">
      {/* Header Principal */}
      <div className="flex flex-col xl:flex-row items-center justify-between gap-6 bg-white p-7 rounded-[2rem] border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-6">
          <div className="bg-slate-950 p-5 rounded-[1.5rem] text-white shadow-xl ring-4 ring-slate-100">
            <CalendarClock className="w-9 h-9 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Programación Táctica</h2>
              <Badge className="bg-indigo-600 text-white font-black px-3 py-1 rounded-lg text-[10px] uppercase tracking-widest">Forros</Badge>
            </div>
            <div className="flex items-center gap-3 mt-2 text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
              <Users className="w-3 h-3" /> Eficiencia: 84%
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex items-center gap-5 min-w-[200px]">
            <div className="bg-indigo-700 p-3 rounded-2xl text-white"><MapPin className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">GYE (2000)</p>
              <p className="text-2xl font-black text-slate-900 font-mono">{dailyOrders.filter(o => String(o.Centro).trim() === '2000').length.toLocaleString()}</p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex items-center gap-5 min-w-[200px]">
            <div className="bg-slate-800 p-3 rounded-2xl text-white"><MapPin className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">UIO (1000)</p>
              <p className="text-2xl font-black text-slate-900 font-mono">{dailyOrders.filter(o => String(o.Centro).trim() === '1000').length.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="acolchado-tapas" className="w-full">
        <TabsList className="flex w-full h-auto bg-white border border-slate-200 p-2.5 mb-10 rounded-[2rem] shadow-sm overflow-x-auto justify-start">
          <TabsTrigger value="resumen-produccion" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <BarChart3 className="w-4 h-4 mr-2" /> Resumen
          </TabsTrigger>
          <TabsTrigger value="acolchado-tapas" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <Cpu className="w-4 h-4 mr-2" /> 1. Acolchado & Tapas
          </TabsTrigger>
          <TabsTrigger value="bandas" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <Layers className="w-4 h-4 mr-2" /> 2. Proceso Bandas
          </TabsTrigger>
          <TabsTrigger value="interiores-corte" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <Settings2 className="w-4 h-4 mr-2" /> 3. Interiores & Corte
          </TabsTrigger>
          <TabsTrigger value="forros" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <LayoutGrid className="w-4 h-4 mr-2" /> 4. Forros Finales
          </TabsTrigger>
          <TabsTrigger value="ordenes-fert" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <PackageSearch className="w-4 h-4 mr-2" /> Órdenes FERT
          </TabsTrigger>
          <TabsTrigger value="ordenes-previsionales" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <SearchCode className="w-4 h-4 mr-2" /> Órdenes Previsionales
          </TabsTrigger>
          <TabsTrigger value="personal-turnos" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <UserPlus className="w-4 h-4 mr-2" /> Personal & Turnos
          </TabsTrigger>
          <TabsTrigger value="kpi-tiempos" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <ClipboardList className="w-4 h-4 mr-2" /> KPI TIEMPOS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen-produccion">
          <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-10">
              <CardTitle className="text-2xl font-black text-slate-900 uppercase">Salud de Planta</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="bg-slate-900 text-white text-left uppercase tracking-widest font-black">
                    <tr>
                      <th className="px-8 py-5">Puesto de Trabajo</th>
                      <th className="px-8 py-5 text-sky-400">HOJA DE RUTA</th>
                      <th className="px-8 py-5 text-right">Cant. Total</th>
                      <th className="px-8 py-5 text-right bg-indigo-950/20">T. Requerido (h)</th>
                      <th className="px-8 py-5 text-right">Capacidad (h)</th>
                      <th className="px-8 py-5 text-center">% Ocupación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {uniquePuestos.map((p, idx) => {
                      const orders = dailyOrders.filter(o => getResolvedPuesto(o) === p);
                      const totalUnits = orders.reduce((sum, o) => sum + Number(o['CANTIDAD'] || 0), 0);
                      const totalTimeHours = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || 0), o), 0) / 60;
                      const config = workstationConfigs[p] || { machine: p, isDayActive: true, isNightActive: false };
                      const capacityHours = (config.isDayActive ? horasNetasDiurnas : 0) + (config.isNightActive ? horasNetasNocturnas : 0);
                      const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-all">
                          <td className="px-8 py-5 font-black text-slate-900 uppercase whitespace-nowrap">{p}</td>
                          <td className="px-8 py-5 font-mono font-black text-indigo-700 uppercase whitespace-nowrap">{mapToHojaRuta(p)}</td>
                          <td className="px-8 py-5 text-right font-mono font-black text-slate-800">{totalUnits.toLocaleString()}</td>
                          <td className="px-8 py-5 text-right font-mono font-black text-indigo-700 bg-indigo-50/40">{totalTimeHours.toFixed(2)}h</td>
                          <td className="px-8 py-5 text-right font-mono font-bold text-slate-900">{capacityHours.toFixed(2)}h</td>
                          <td className="px-8 py-5 text-center">
                             <div className="flex items-center justify-center gap-4">
                               <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden max-w-[100px] border border-slate-200">
                                 <div className={cn("h-full", utilization > 100 ? "bg-red-500" : "bg-indigo-600")} style={{ width: `${Math.min(utilization, 100)}%` }} />
                               </div>
                               <span className={cn("font-mono font-black text-[10px]", utilization > 100 ? "text-red-600" : "text-slate-900")}>{utilization.toFixed(0)}%</span>
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
          {['02', '06', '07', '08', '09', '10', '11', '12', '13'].map(suffix => {
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
                  {achNames.length > 0 && (
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
                  )}
                  {pefNames.length > 0 && (
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
                  )}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="bandas" className="space-y-10 pb-20">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {uniquePuestos.filter(p => p.includes('ACH11') || p.includes('ACH12') || p.includes('RMTB') || p.includes('COS3D') || p.includes('ENCINTADOBD') || p.includes('BO01') || p.includes('BORDADORA-BANDA01')).map((pName) => (
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

        <TabsContent value="ordenes-fert">
          <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black text-slate-900 uppercase">Órdenes FERT</CardTitle>
                  <CardDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Listado de Órdenes de Producto Terminado</CardDescription>
                </div>
                <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-500/20">
                  <Layers className="w-6 h-6" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[70vh] relative">
                {isLoadingFert ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                    <span className="ml-4 text-slate-500 font-black uppercase tracking-widest text-xs">Cargando órdenes FERT...</span>
                  </div>
                ) : ordenesFert.length > 0 ? (
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-slate-900 sticky top-0 z-10 text-white text-left uppercase tracking-widest font-black">
                      <tr>
                        {Object.keys(ordenesFert[0]).map((key) => (
                          <th key={key} className="px-6 py-4 whitespace-nowrap text-[10px] uppercase font-bold text-slate-300">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ordenesFert.map((order, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors text-[10px]">
                          {Object.values(order).map((val: any, j) => (
                            <td key={j} className="px-6 py-4 font-medium text-slate-600 whitespace-normal break-words leading-tight min-w-[150px]">
                              {val === null || val === undefined ? '—' : String(val)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-20 text-center text-slate-400 uppercase font-black tracking-widest text-xs opacity-40">No se encontraron registros</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ordenes-previsionales">
          <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black text-slate-900 uppercase">Órdenes Previsionales</CardTitle>
                  <CardDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Filtrado por Centro 1000 y RespCtrlProd de Forros</CardDescription>
                </div>
                <div className="bg-sky-600 p-3 rounded-2xl text-white shadow-lg shadow-sky-500/20">
                  <SearchCode className="w-6 h-6" />
                </div>
              </div>
              
              <div className="mt-6 flex flex-wrap items-center gap-3 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-widest">
                  <Filter className="w-4 h-4 text-indigo-600" /> Filtros Activos:
                </div>
                
                <Badge className="bg-slate-950 text-white border-none font-mono text-[10px] font-black py-1 px-3 rounded-lg shadow-sm">
                  CENTRO: 1000
                </Badge>

                {allowedRespCodes.length > 0 ? (
                  <>
                    <div className="text-[10px] font-black text-slate-300">|</div>
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RESP:</div>
                    {allowedRespCodes.map(code => (
                      <Badge key={code} className="bg-indigo-50 text-indigo-700 border-indigo-200 font-mono text-[10px] font-black py-1 px-3 rounded-lg">
                        {code}
                      </Badge>
                    ))}
                  </>
                ) : (
                  <Badge variant="outline" className="text-slate-400 font-bold uppercase text-[9px] px-3 py-1 rounded-lg">
                    Sin restricción RESP
                  </Badge>
                )}
                
                <div className="ml-auto text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Registros: <span className="text-indigo-600">{filteredOrdenesPrevisionales.length}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[70vh] relative">
                {isLoadingPrevisionales ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                    <span className="ml-4 text-slate-500 font-black uppercase tracking-widest text-xs">Filtrando órdenes...</span>
                  </div>
                ) : filteredOrdenesPrevisionales.length > 0 ? (
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-slate-900 sticky top-0 z-10 text-white text-left uppercase tracking-widest font-black">
                      <tr>
                        {/* Se itera sobre las columnas originales pero detectamos dónde inyectar la columna de tiempo */}
                        {(() => {
                          const keys = Object.keys(filteredOrdenesPrevisionales[0]);
                          const headerCells = [];
                          for (const key of keys) {
                            headerCells.push(<th key={key} className="px-6 py-4 whitespace-nowrap text-[10px] uppercase font-bold text-slate-300">{key}</th>);
                            // Si es la columna de máquina, inyectamos Tiempo producción justo después
                            const normKey = key.toUpperCase().trim();
                            if (normKey === 'MAQUINA' || normKey === 'PUESTOTRABAJO' || normKey === 'PUESTO_TRABAJO') {
                              headerCells.push(
                                <th key="col-tiempo-prod" className="px-6 py-4 text-[10px] uppercase font-bold text-sky-400 bg-slate-800 shadow-inner whitespace-nowrap">
                                  Tiempo producción (min)
                                </th>
                              );
                            }
                          }
                          return headerCells;
                        })()}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOrdenesPrevisionales.map((item, i) => {
                        const kpiTimeMin = getKPITimeInMinutesForOrder(item);
                        const keys = Object.keys(item);
                        const rowCells = [];
                        
                        for (const key of keys) {
                          const val = item[key];
                          rowCells.push(
                            <td key={key} className="px-6 py-4 font-medium text-slate-600 whitespace-normal break-words leading-tight min-w-[150px]">
                              {val === null || val === undefined ? '—' : String(val)}
                            </td>
                          );
                          
                          const normKey = key.toUpperCase().trim();
                          if (normKey === 'MAQUINA' || normKey === 'PUESTOTRABAJO' || normKey === 'PUESTO_TRABAJO') {
                            rowCells.push(
                              <td key={`tiempo-prod-${i}`} className="px-6 py-4 font-mono font-black text-indigo-600 bg-indigo-50/30 text-center border-x border-slate-100 min-w-[120px]">
                                {kpiTimeMin !== null ? (
                                  <span className="flex items-center justify-center gap-1" title="Tiempo convertido de segundos a minutos">
                                    {kpiTimeMin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                ) : (
                                  <span className="text-slate-300 italic flex items-center justify-center gap-1" title="No se encontró coincidencia en Maestro KPI">
                                    —
                                  </span>
                                )}
                              </td>
                            );
                          }
                        }
                        
                        return (
                          <tr key={i} className="hover:bg-slate-50 transition-colors text-[10px]">
                            {rowCells}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-24 text-center text-slate-400 uppercase font-black tracking-widest text-xs opacity-40">
                    No se encontraron órdenes para el Centro 1000 con las restricciones aplicadas
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal-turnos">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
            <Card className="lg:col-span-1 rounded-[2.5rem] bg-white border-none shadow-sm ring-1 ring-slate-100">
               <CardHeader className="bg-slate-950 text-white p-8 rounded-t-[2.5rem]"><CardTitle className="text-xl font-black uppercase">Configuración de Jornada</CardTitle></CardHeader>
               <CardContent className="p-10 space-y-10">
                 <div className="space-y-5">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Sun className="w-4 h-4 text-amber-500" /> Jornada Diurna</label>
                    <Select value={jornadaDiurnaSel} onValueChange={setJornadaDiurnaSel}>
                      <SelectTrigger className="h-14 border-2 rounded-2xl font-black text-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DIURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-black py-3">{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex justify-between items-center">
                      <span className="text-[10px] font-black text-amber-700 uppercase">Capacidad Neta (D)</span>
                      <span className="font-mono font-black text-amber-900">{horasNetasDiurnas.toFixed(2)}h</span>
                    </div>
                 </div>
                 <div className="space-y-5">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] flex items-center gap-2"><Moon className="w-4 h-4 text-indigo-500" /> Jornada Nocturna</label>
                    <Select value={jornadaNocturnaSel} onValueChange={setJornadaNocturnaSel}>
                      <SelectTrigger className="h-14 border-2 rounded-2xl font-black text-slate-800">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {NOCTURNA_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value} className="font-black py-3">{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex justify-between items-center">
                      <span className="text-[10px] font-black text-indigo-700 uppercase">Capacidad Neta (N)</span>
                      <span className="font-mono font-black text-indigo-900">{horasNetasNocturnas.toFixed(2)}h</span>
                    </div>
                 </div>
               </CardContent>
            </Card>

            <div className="lg:col-span-3 space-y-12">
              {workstationGroups.map((group, gIdx) => {
                const availableItems = group.items.filter(item => uniquePuestos.includes(item));
                if (availableItems.length === 0) return null;

                return (
                  <div key={gIdx} className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-1.5 bg-indigo-600 rounded-full" />
                      <h3 className="text-lg font-black text-indigo-950 uppercase tracking-tighter">{group.title}</h3>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                      {availableItems.map(p => {
                        const config = workstationConfigs[p] || { machine: p, isDayActive: true, isNightActive: false };
                        const capPuesto = (config.isDayActive ? horasNetasDiurnas : 0) + (config.isNightActive ? horasNetasNocturnas : 0);
                        return (
                          <div key={p} className="flex flex-col p-6 border-2 border-slate-100 rounded-[2rem] bg-white hover:border-indigo-200 transition-all shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-indigo-950 uppercase text-lg leading-tight mb-2 break-words">{p}</p>
                                <div className="flex flex-wrap gap-2">
                                  <Badge className="bg-indigo-600 text-white border-none font-mono text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-lg shadow-sm">
                                    {mapToHojaRuta(p)}
                                  </Badge>
                                  <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1 rounded-xl border border-emerald-100 shadow-sm">
                                    <Clock className="w-3 h-3" />
                                    <span className="font-mono text-[10px] font-black uppercase tracking-wider">{capPuesto.toFixed(2)}h Disponibles</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                              <button 
                                onClick={() => toggleWorkstationShift(p, 'day')}
                                className={cn(
                                  "flex-1 h-12 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm border-2",
                                  config.isDayActive 
                                    ? "bg-amber-500 text-white border-amber-600 shadow-amber-200" 
                                    : "bg-white text-slate-300 border-slate-100"
                                )}
                              >
                                <Sun className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">{config.isDayActive ? 'Día ON' : 'Día OFF'}</span>
                              </button>
                              
                              <button 
                                onClick={() => toggleWorkstationShift(p, 'night')}
                                className={cn(
                                  "flex-1 h-12 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm border-2",
                                  config.isNightActive 
                                    ? "bg-indigo-700 text-white border-indigo-800 shadow-indigo-200" 
                                    : "bg-white text-slate-300 border-slate-100"
                                )}
                              >
                                <Moon className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">{config.isNightActive ? 'Noc ON' : 'Noc OFF'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="kpi-tiempos" className="space-y-8 pb-20">
          <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden shadow-sm border-none">
            <CardHeader className="bg-slate-950 p-8 border-b border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="bg-indigo-600 p-3 rounded-2xl text-white shadow-lg shadow-indigo-500/20">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl font-black text-white uppercase tracking-tight">KPI Maestro de Forros</CardTitle>
                    <CardDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Auditoría técnica de tiempos promedio por material y hoja de ruta</CardDescription>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-center">
                  <span className="block text-[8px] text-slate-500 uppercase font-black tracking-widest">Registros</span>
                  <span className="text-xl font-mono font-black text-sky-400">{kpiMaestroData.length}</span>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[70vh] relative">
                {isLoadingKPI ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
                    <span className="ml-4 text-slate-500 font-black uppercase tracking-widest text-xs">Consultando Maestro de Forros...</span>
                  </div>
                ) : (
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-slate-900 sticky top-0 z-10 text-white text-left uppercase tracking-widest font-black">
                      <tr>
                        <th className="px-6 py-4">Código Material</th>
                        <th className="px-6 py-4">HOJA DE RUTA</th>
                        <th className="px-6 py-4 text-right bg-indigo-900/40">T. Promedio (seg)</th>
                        <th className="px-6 py-4">Categoría / Puesto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {kpiMaestroData.map((t, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 font-mono font-bold text-slate-600">{t.CodigoMaterial}</td>
                          <td className="px-6 py-4 font-mono font-black text-indigo-700 uppercase">{t.HRUTA}</td>
                          <td className="px-6 py-4 text-right font-mono font-black text-indigo-600 bg-indigo-50/30">
                            {Number(t.TPromedio || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-800 uppercase whitespace-normal break-words leading-tight min-w-[250px]">{t.Categoria}</td>
                        </tr>
                      ))}
                      {kpiMaestroData.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-20 text-center text-slate-400 uppercase font-black tracking-widest text-xs opacity-40">No hay datos de KPI disponibles</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
