'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  CalendarClock, 
  Loader2, 
  Users, 
  Clock,
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
  ListTree,
  Cog,
  Calendar as CalendarIcon,
  Monitor,
  MapPin,
  TrendingUp,
  Boxes
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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

// Constantes de configuración de jornada
const DIURNA_OPTIONS = [
  { value: "8.75", label: "7:00 - 15:45 (8.75 h)" },
  { value: "10", label: "7:00 - 17:00 (10h)" },
  { value: "11", label: "7:00 - 18:00 (11h)" },
];

const NOCTURNA_OPTIONS = [
  { value: "0", label: "Sin jornada" },
  { value: "8.5", label: "21:00 - 5:30 (8.5h)" },
  { value: "10.5", label: "19:00 - 5:30 (10.5h)" },
];

// Grupos de estaciones para la pestaña de Personal & Turnos
const workstationGroups = [
  {
    title: "Acolchado y Tapas",
    items: [
      "ACOLCHADORA02", "COSEDORA-ACH02",
      "ACOLCHADORA06", "COSEDORA-ACH06",
      "ACOLCHADORA07", "COSEDORA-ACH07",
      "ACOLCHADORA08", "COSEDORA-ACH08",
      "ACOLCHADORA09", "COSEDORA-ACH09",
      "ACOLCHADORA10", "COSEDORA-ACH10",
      "ACOLCHADORA13", "COSEDORA-ACH13",
      "ACH02", "ACH06", "ACH07", "ACH08", "ACH09", "ACH10", "ACH13",
      "PEGADORA-ACH02", "PEGADORA-ACH06", "PEGADORA-ACH07", "PEGADORA-ACH08", "PEGADORA-ACH09", "PEGADORA-ACH10", "PEGADORA-ACH13",
      "PEF02", "PEF06", "PEF07", "PEF08", "PEF09", "PEF10", "PEF13"
    ]
  },
  {
    title: "Procesos de Bandas y Bordado",
    items: [
      "ACOLCHADORA11", "ACOLCHADORA12", "ACH11", "ACH12", 
      "BORDADORA-BANDA01", "BO01", "RMTB-01", "RMTB-02", "RMTB-M", "RMTB01", "RMTB02", "RMTBM",
      "COS3D", "COSEDORA-BANDA3D", "ENCINTADOBD", "COSEDORA-ENCINTADOBD"
    ]
  },
  {
    title: "Interiores, Bases y Corte",
    items: [
      "INTP-PR", "INTP-PT", "INTP-F", "INTPF", "INTPF1", "INTPF2", 
      "COSEDORA-INTPF", "COSEDORA-INTPF1", "COSEDORA-INTPF2",
      "COSEDORA-INTPR", "COSEDORA-INTPT",
      "MTBS1", "MTBS", "COSEDORA-BSC-CC", "COSEDORA-BSCTP", "COSEDORA-MTBS1",
      "CT-BAN", "CT-BSC", "CT-CHN", "CT-INT", "TTCF", "TTSUP", "TELAS", "FUNDAS",
      "COSEDORA-TTCHN", "COSEDORA-TTSUP-CHN", "CORTE-ESPUMA", "CORTELA10"
    ]
  },
  {
    title: "Ensamble de Forros",
    items: ["FORRO-COLCHONES", "FBASE-01", "FBASE-02", "FORRO-BASE-BCAMAS"]
  }
];

interface WorkstationConfig {
  machine: string;
  isDayActive: boolean;
  isNightActive: boolean;
  people: number;
  machines: number;
}

const MachineCard = React.memo(({ 
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
  const hrCode = mapToHojaRuta(puestoName).trim().toUpperCase();
  
  const { filteredOrders, totalTimeHours, utilization, capacityHours } = useMemo(() => {
    const filtered = orders.filter(o => {
      const orderHR = String(o['MAQUINA'] || o['Maquina'] || '').trim().toUpperCase();
      if (hrCode.includes(' / ')) {
        const codes = hrCode.split(' / ').map(c => c.trim().toUpperCase());
        return codes.includes(orderHR);
      }
      return orderHR === hrCode;
    });

    const totalSeconds = filtered.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || o['CANTPROGRAMADA'] || 0), o), 0);
    const totalHours = totalSeconds / 3600;
    
    const numMachines = config.machines || 1;
    const capacity = ((config.isDayActive ? horasNetasDiurnas : 0) + (config.isNightActive ? horasNetasNocturnas : 0)) * numMachines;
    
    const util = capacity > 0 ? (totalHours / capacity) * 100 : 0;
    
    return {
      filteredOrders: filtered,
      totalTimeHours: totalHours,
      utilization: util,
      capacityHours: capacity
    };
  }, [orders, hrCode, calculateProductionTime, config.isDayActive, config.isNightActive, config.machines, horasNetasDiurnas, horasNetasNocturnas]);

  return (
    <div className={cn(
      "flex border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm bg-white transition-all hover:shadow-lg",
      small ? "h-[420px]" : "h-[480px]"
    )}>
      <div className={cn(
        "bg-slate-50/50 p-6 text-slate-900 flex flex-col border-r border-slate-100",
        small ? "w-[45%]" : "w-[40%]"
      )}>
        <div className="mb-4 relative">
          <Badge className="bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest px-2.5 py-0.5 rounded-lg border-none shadow-sm mb-2 inline-block">
            {hrCode || 'S/HR'}
          </Badge>
          <h3 className="text-xl font-black uppercase tracking-tighter text-indigo-950 flex items-center gap-2 break-words leading-tight pr-14">
            <Cpu className="w-5 h-5 text-indigo-600 shrink-0" />
            <span>{puestoName}</span>
          </h3>

          <div className="absolute top-0 right-0 flex flex-col gap-1.5">
            <div className="flex flex-col items-center justify-center bg-white border-2 border-dashed border-sky-300 w-12 h-12 rounded-xl shadow-sm">
              <span className="text-lg font-black text-sky-700 leading-none">{config.machines || 1}</span>
              <span className="text-[6px] font-black uppercase text-sky-400 mt-0.5 tracking-tighter">Máquinas</span>
            </div>
            <div className="flex flex-col items-center justify-center bg-white border-2 border-dashed border-indigo-300 w-12 h-12 rounded-xl shadow-sm">
              <span className="text-lg font-black text-indigo-700 leading-none">{config.people || 0}</span>
              <span className="text-[6px] font-black uppercase text-indigo-400 mt-0.5 tracking-tighter">Personas</span>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4">
          <div className="bg-white p-3.5 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center text-[9px] text-slate-400 uppercase font-black tracking-widest mb-2">Turnos Activos</div>
            <div className="grid grid-cols-2 gap-2">
              <div className={cn("rounded-xl p-2 border flex flex-col items-center", config.isDayActive ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-100 opacity-40")}>
                <Sun className={cn("w-3.5 h-3.5 mb-0.5", config.isDayActive ? "text-amber-500" : "text-slate-400")} />
                <span className={cn("text-[8px] font-black uppercase", config.isDayActive ? "text-amber-700" : "text-slate-400")}>Día</span>
              </div>
              <div className={cn("rounded-xl p-2 border flex flex-col items-center", config.isNightActive ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-100 opacity-40")}>
                <Moon className={cn("w-3.5 h-3.5 mb-0.5", config.isNightActive ? "text-indigo-500" : "text-slate-400")} />
                <span className={cn("text-[8px] font-black uppercase", config.isNightActive ? "text-indigo-700" : "text-slate-400")}>Noche</span>
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-black uppercase text-slate-500">Ocupación</p>
              <Badge className={cn(
                "text-[8px] font-black px-1.5 py-0.5 rounded-md border-none", 
                utilization > 100 ? "bg-red-100 text-red-700" : 
                utilization >= 90 ? "bg-green-100 text-green-700" : 
                "bg-yellow-100 text-yellow-700"
              )}>
                {utilization > 100 ? "Sobrecapacidad" : utilization >= 90 ? "Estable" : "Debajo de capacidad"}
              </Badge>
            </div>
            <div className="flex items-baseline gap-1 mb-2">
              <span className={cn(
                "text-4xl font-black font-mono tracking-tighter", 
                utilization > 100 ? "text-red-600" : 
                utilization >= 90 ? "text-green-600" : 
                "text-yellow-600"
              )}>
                {utilization.toFixed(0)}
              </span>
              <span className="text-[10px] font-black text-slate-400">%</span>
            </div>
            <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-200 mb-2">
               <div 
                 className={cn(
                   "h-full transition-all duration-700 ease-out", 
                   utilization > 100 ? "bg-red-500" : 
                   utilization >= 90 ? "bg-green-500" : 
                   "bg-yellow-400"
                 )} 
                 style={{ width: `${Math.min(utilization, 100)}%` }} 
               />
            </div>
            
            <div className="mt-3 text-center h-4">
              {utilization > 100 ? (
                <span className="text-[9px] font-black uppercase text-red-600 tracking-tighter animate-pulse">Sobrecapacidad</span>
              ) : utilization >= 90 ? (
                <span className="text-[9px] font-black uppercase text-green-600 tracking-tighter">Estable</span>
              ) : (
                <span className="text-[9px] font-black uppercase text-yellow-600 tracking-tighter animate-pulse">Debajo de capacidad</span>
              )}
            </div>
            
            <div className="mt-4 grid grid-cols-2 gap-2 text-[9px] font-black uppercase tracking-widest">
              <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
                <span className="text-slate-400 block mb-0.5">Carga</span>
                <span className="text-slate-900 font-mono">{totalTimeHours.toFixed(2)}H</span>
              </div>
              <div className={cn("p-2 rounded-xl border border-slate-100 text-center", utilization > 100 ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700")}>
                <span className="text-slate-400 block mb-0.5">Cap. Total</span>
                <span className="font-mono">{capacityHours.toFixed(2)}H</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="flex-1 p-6 flex flex-col bg-slate-50/20">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-[10px] font-black text-slate-800 uppercase tracking-[0.2em] flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-indigo-600" /> Plan Operativo
          </h4>
          <Badge className="bg-white text-slate-900 border-slate-200 font-mono font-black text-[10px] px-3 py-0.5 rounded-full shadow-sm">{filteredOrders.length} ORD</Badge>
        </div>
        <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-inner text-[10px]">
          <table className="w-full border-collapse">
            <thead className="bg-slate-100/80 sticky top-0 z-10 text-slate-500 font-black uppercase tracking-widest text-left">
              <tr>
                <th className="px-4 py-3 border-b border-slate-200">MATERIAL</th>
                <th className="px-4 py-3 border-b border-slate-200 min-w-[150px]">NOMBRE</th>
                <th className="px-4 py-3 border-b border-slate-200 text-right">CANT</th>
                <th className="px-4 py-3 border-b border-slate-200 text-center text-indigo-700 bg-indigo-50/30">H</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length > 0 ? filteredOrders.map((o, i) => {
                const qty = Number(o['CANTIDAD'] || o['CANTPROGRAMADA'] || 0);
                const tSeconds = calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', qty, o);
                const tHours = tSeconds / 3600;
                const materialCode = o['CodMaterial'] || normalizeMaterialCode(o['MATERIAL'] || '');
                const materialName = o['NOMBRE'] || o['TEXTOMATERIAL'] || o['Material'] || '—';
                
                return (
                  <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">{materialCode}</td>
                    <td className="px-4 py-3 text-slate-600 font-medium whitespace-normal break-words leading-tight">{materialName}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-slate-800">{qty.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-indigo-600 bg-indigo-50/10">{tHours.toFixed(2)}</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={4} className="py-16 text-center text-slate-400 uppercase font-black tracking-widest text-[9px] opacity-30">Sin carga</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.puestoName === nextProps.puestoName &&
    prevProps.small === nextProps.small &&
    prevProps.config.machines === nextProps.config.machines &&
    prevProps.config.isDayActive === nextProps.config.isDayActive &&
    prevProps.config.isNightActive === nextProps.config.isNightActive &&
    prevProps.config.people === nextProps.config.people &&
    prevProps.horasNetasDiurnas === nextProps.horasNetasDiurnas &&
    prevProps.horasNetasNocturnas === nextProps.horasNetasNocturnas &&
    prevProps.orders === nextProps.orders;
});

export const TacticalPlanForrosSection: React.FC = () => {
  const { addNotification } = useAppContext();
  const [isMounted, setIsMounted] = useState(false);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [tiemposProduccion, setTiemposProduccion] = useState<any[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);
  const [kpiMaestroData, setKpiMaestroData] = useState<any[]>([]);
  const [ordenesPrevisionalesData, setOrdenesPrevisionalesData] = useState<any[]>([]);
  const [listaMaterialesData, setListaMaterialesData] = useState<any[]>([]);
  const [versionesFabricacionData, setVersionesFabricacionData] = useState<any[]>([]);
  const [explodedComponentsData, setExplodedComponentsData] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFert, setIsLoadingFert] = useState(false);
  const [isLoadingKPI, setIsLoadingKPI] = useState(false);
  const [isLoadingPrevisionales, setIsLoadingPrevisionales] = useState(false);
  const [isLoadingListaMateriales, setIsLoadingListaMateriales] = useState(false);
  const [isLoadingVersiones, setIsLoadingVersiones] = useState(false);
  const [isLoadingTiempos, setIsLoadingTiempos] = useState(false);
  const [isLoadingExplosion, setIsLoadingExplosion] = useState(false);
  const [bomDownloadProgress, setBomDownloadProgress] = useState(0);
  const [explosionProgress, setExplosionProgress] = useState(0);
  
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set(['acolchado-tapas']));
  const hojaRutaCacheRef = React.useRef<Record<string, string>>({});
  const kpiIndexRef = React.useRef<Record<string, any>>({});
  const tiemposIndexRef = React.useRef<Record<string, any>>({});
  const [dataReady, setDataReady] = useState(false);
  
  const [jornadaDiurnaSel, setJornadaDiurnaSel] = useState("8.75");
  const [jornadaNocturnaSel, setJornadaNocturnaSel] = useState("0");
  const [workstationConfigs, setWorkstationConfigs] = useState<Record<string, WorkstationConfig>>({});

  const [targetDate1000, setTargetDate1000] = useState<string>("");
  const [targetDate2000, setTargetDate2000] = useState<string>("");
  
  const [techStartDate, setTechStartDate] = useState<string>("");
  const [techEndDate, setTechEndDate] = useState<string>("");

  const addBusinessDays = useCallback((startDate: Date, days: number): string => {
    const date = new Date(startDate);
    let count = 0;
    while (count < days) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) count++;
    }
    return date.toISOString().split('T')[0];
  }, []);

  const [planningDate, setPlanningDate] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
    const nextWorkDay = addBusinessDays(new Date(), 1);
    setPlanningDate(nextWorkDay);
  }, [addBusinessDays]);

  const planningDateFormatted = useMemo(() => {
    if (!planningDate) return '';
    const date = new Date(planningDate + 'T00:00:00');
    return date.toLocaleDateString('es-ES', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric' 
    });
  }, [planningDate]);

  useEffect(() => {
    if (kpiMaestroData.length > 0) {
      const newIndex: Record<string, any> = {};
      kpiMaestroData.forEach(kpi => {
        const key = `${String(kpi.CodigoMaterial || '').trim()}|${String(kpi.HRUTA || '').toUpperCase().trim()}`;
        newIndex[key] = kpi;
      });
      kpiIndexRef.current = newIndex;
    }
  }, [kpiMaestroData]);
  
  useEffect(() => {
    if (tiemposProduccion.length > 0) {
      const newIndex: Record<string, any> = {};
      tiemposProduccion.forEach(t => {
        const key = String(t.CodMaterial || t.Material || '').trim();
        if (!newIndex[key]) newIndex[key] = [];
        newIndex[key].push(t);
      });
      tiemposIndexRef.current = newIndex;
    }
  }, [tiemposProduccion]);

  const normalizeMaterialCode = useCallback((code: string | number): string => {
    if (!code) return '';
    const codeStr = String(code).trim();
    return codeStr.replace(/^0+/, '');
  }, []);

  const mapToHojaRuta = useCallback((puestoName: string): string => {
    const pn = String(puestoName || '').toUpperCase().trim();
    if (!pn || pn === '—' || pn === 'NULL') return '';
    if (hojaRutaCacheRef.current[pn]) return hojaRutaCacheRef.current[pn];
    
    if (pn === 'CORTE-ESPUMA') {
      const res = 'HR-CTESP';
      hojaRutaCacheRef.current[pn] = res;
      return res;
    }

    if (pn === 'CORTELA10') {
      const res = 'HR-CTBSC / HR-CTCHN / HR-CTINT / HR-CTBAN';
      hojaRutaCacheRef.current[pn] = res;
      return res;
    }

    if (pn === 'COSEDORA-TTCHN' || pn === 'TTCF') {
      const res = 'HR-TTCF';
      hojaRutaCacheRef.current[pn] = res;
      return res;
    }

    if (pn === 'COSEDORA-INTPF' || pn === 'COSEDORA-INTPF1' || pn === 'COSEDORA-INTPF2' || pn === 'INTPF' || pn === 'INTP-F') {
      const res = 'HR-INTPF';
      hojaRutaCacheRef.current[pn] = res;
      return res;
    }

    const kpiMatch = kpiMaestroData.find(k => String(k.Categoria || '').toUpperCase().trim() === pn);
    if (kpiMatch && kpiMatch.HRUTA) {
      const result = String(kpiMatch.HRUTA).trim().toUpperCase();
      hojaRutaCacheRef.current[pn] = result;
      return result;
    }
    
    let result = '';
    if (pn === 'ACOLCHADORA09') result = 'HR-ACH09';
    else if (pn === 'COSEDORA-ACH02') result = 'HR-PEF02';
    else if (pn === 'COSEDORA-ACH08') result = 'HR-PEF08';
    else if (pn === 'BORDADORA-BANDA01') result = 'HR-BO01';
    else if (pn.includes('FORRO-COLCHONES')) result = 'HR-FORRO';
    
    if (!result && tiemposIndexRef.current[pn]) {
      const tiemposList = tiemposIndexRef.current[pn];
      if (Array.isArray(tiemposList) && tiemposList.length > 0) {
        const hr = String(tiemposList[0].HojaRuta || tiemposList[0]['HOJA DE RUTA'] || '').trim();
        if (hr && hr.startsWith('HR-')) result = hr;
      }
    }
    
    if (!result) {
      const numMatch = pn.match(/\d+/);
      const num = numMatch ? numMatch[0].padStart(2, '0') : '';
      if (pn.includes('COSEDORA') || pn.includes('PEGADORA') || pn.includes('PEF')) result = `HR-PEF${num}`;
      else if (pn.includes('ACOLCHADORA') || pn.includes('ACH')) result = `HR-ACH${num}`;
      else result = pn.startsWith('HR-') ? pn : `HR-${pn}`;
    }
    
    hojaRutaCacheRef.current[pn] = result;
    return result;
  }, [kpiMaestroData]);

  useEffect(() => {
    if (isMounted) {
      const today = new Date();
      if (!targetDate1000) setTargetDate1000(addBusinessDays(today, 3));
      if (!targetDate2000) setTargetDate2000(addBusinessDays(today, 2));
      if (!techStartDate) setTechStartDate(today.toISOString().split('T')[0]);
      if (!techEndDate) setTechEndDate(addBusinessDays(today, 1));
    }
  }, [isMounted, targetDate1000, targetDate2000, techStartDate, techEndDate, addBusinessDays]);

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
      const response = await serviciosService.getOrdenesFert(1, 10000);
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
      const response = await serviciosService.OrdenesProvisionalesPaginados(1, 5000);
      setOrdenesPrevisionalesData(response.data || []);
    } catch (error: any) {
      console.error('Error fetching Provisional orders:', error);
      addNotification('error', `Error al cargar órdenes previsionales: ${error.message}`);
    } finally {
      setIsLoadingPrevisionales(false);
    }
  }, [addNotification]);

  const fetchListaMateriales = useCallback(async () => {
    setIsLoadingListaMateriales(true);
    setBomDownloadProgress(0);
    try {
      const rowsPerPage = 5000;
      const firstResponse = await serviciosService.ReporteExplosionMateriales(1, rowsPerPage);
      const firstData = firstResponse.data || [];
      const total = firstResponse.totalRegistros || firstResponse.totalRecords || firstResponse.totalRows || 0;
      let allData = [...firstData];
      const totalPages = Math.ceil(total / rowsPerPage);
      if (totalPages > 1) {
        for (let p = 2; p <= totalPages; p++) {
          setBomDownloadProgress(Math.round(((p - 1) / totalPages) * 100));
          const nextResponse = await serviciosService.ReporteExplosionMateriales(p, rowsPerPage);
          if (nextResponse.data) allData = [...allData, ...nextResponse.data];
        }
      }
      setListaMaterialesData(allData);
      setBomDownloadProgress(100);
    } catch (error: any) {
      console.error('Error fetching BOM list:', error);
      addNotification('error', `Error al cargar Lista de Materiales: ${error.message}`);
    } finally {
      setIsLoadingListaMateriales(false);
    }
  }, [addNotification]);

  const fetchVersionesFabricacion = useCallback(async () => {
    setIsLoadingVersiones(true);
    try {
      const response = await serviciosService.VersionesFabricacion(1, 2000);
      setVersionesFabricacionData(response.data || []);
    } catch (error: any) {
      console.error('Error fetching Production Versions:', error);
      addNotification('error', `Error al cargar Versiones de Fabricación: ${error.message}`);
    } finally {
      setIsLoadingVersiones(false);
    }
  }, [addNotification]);

  useEffect(() => {
    if (isMounted) {
      fetchBaseData();
      fetchKPIMaestro();
      fetchOrdenesPrevisionales();
    }
  }, [isMounted, fetchBaseData, fetchKPIMaestro, fetchOrdenesPrevisionales]);
  
  useEffect(() => {
    if (tiemposProduccion.length > 0 && kpiMaestroData.length > 0 && ordenesPrevisionalesData.length > 0) {
      setDataReady(true);
    }
  }, [tiemposProduccion, kpiMaestroData, ordenesPrevisionalesData]);

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
        if (normName === 'RESP_CTRL_PROD' || normName === 'RESPCTRLPROD') {
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

  // Nueva restricción para explosión de insumos
  const allowedComponentsCHN = useMemo(() => {
    const codes = new Set<string>();
    const forroGroupCodes = new Set(forrosGruposList.map(g => g.codigo_grupo));
    restricciones.forEach(r => {
      if (forroGroupCodes.has(r.codigo_grupo)) {
        const normName = r.nombre_restriccion.toUpperCase().trim();
        if (normName === 'COMPONENTES_CHN') {
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

  const { fert1000, fert2000, summary1000, summary2000 } = useMemo(() => {
    const filter1000 = ordenesFert.filter(order => {
      const centro = String(order['Centro'] || order['CENTRO'] || '').trim();
      const resp = String(order['RESPCTRLPROD'] || order['RESP_CTRL_PROD'] || '').trim().replace(/^0+/, '');
      const date = String(order['FECHA'] || order['FECHA_INICIO'] || order['FECHAINICIO'] || '').split('T')[0];
      return centro === '1000' && (resp === '3' || resp === '4') && date === targetDate1000;
    });

    const filter2000 = ordenesFert.filter(order => {
      const centro = String(order['Centro'] || order['CENTRO'] || '').trim();
      const resp = String(order['RESPCTRLPROD'] || order['RESP_CTRL_PROD'] || '').trim().replace(/^0+/, '');
      const date = String(order['FECHA'] || order['FECHA_INICIO'] || order['FECHAINICIO'] || '').split('T')[0];
      return centro === '2000' && (resp === '3' || resp === '6') && date === targetDate2000;
    });

    const getSummary = (orders: any[]) => {
      const map = new Map<string, number>();
      orders.forEach(o => {
        const resp = String(o['RESPCTRLPROD'] || o['RESP_CTRL_PROD'] || 'S/R').trim().replace(/^0+/, '');
        const qty = Number(o['CANTIDAD'] || o['CANTPROGRAMADA'] || 0);
        map.set(resp, (map.get(resp) || 0) + qty);
      });
      return Array.from(map.entries()).map(([resp, total]) => ({ resp, total }));
    };

    return { 
      fert1000: filter1000, 
      fert2000: filter2000,
      summary1000: getSummary(filter1000),
      summary2000: getSummary(filter2000)
    };
  }, [ordenesFert, targetDate1000, targetDate2000]);

  const filteredOrdenesPrevisionales = useMemo(() => {
    let filtered = ordenesPrevisionalesData.filter(order => {
      const centroVal = String(order['Centro'] || '').trim();
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
  
  const techFilteredOrdenes = useMemo(() => {
    return filteredOrdenesPrevisionales.filter(order => {
      const dateVal = String(order['FECHAINICIO'] || order['FECHA'] || '').split('T')[0];
      if (!dateVal || dateVal === '—') return false;
      return dateVal >= techStartDate && dateVal <= techEndDate;
    });
  }, [filteredOrdenesPrevisionales, techStartDate, techEndDate]);

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

  useEffect(() => {
    if (isMounted && forrosGruposList.length > 0) {
      fetchTiemposProduccion();
    }
  }, [isMounted, forrosGruposList, fetchTiemposProduccion]);

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
    kpiMaestroData.forEach(kpi => {
      const p = String(kpi.Categoria || '').trim().toUpperCase();
      if (p && p !== 'NULL' && p !== '-' && p !== '—') pSet.add(p);
    });
    return Array.from(pSet).sort();
  }, [kpiMaestroData]);

  useEffect(() => {
    if (dataReady && uniquePuestos.length > 0) {
      setWorkstationConfigs(prev => {
        if (Object.keys(prev).length > 0) return prev;
        const initial: Record<string, WorkstationConfig> = {};
        uniquePuestos.forEach(p => {
          initial[p] = { machine: p, isDayActive: true, isNightActive: false, people: 0, machines: 1 };
        });
        return initial;
      });
    }
  }, [dataReady, uniquePuestos]);

  useEffect(() => {
    if (restricciones.length > 0 && uniquePuestos.length > 0) {
      setWorkstationConfigs(prev => {
        const next = { ...prev };
        let updated = false;

        uniquePuestos.forEach(p => {
          const normP = p.toUpperCase().trim();
          const relevantRestrictions = restricciones.filter(r => 
            r.nombre_restriccion.toUpperCase().trim().includes('PERSONAL') &&
            r.nombre_restriccion.toUpperCase().trim().includes(normP)
          );

          if (relevantRestrictions.length > 0) {
            let isDay = false;
            let isNight = false;
            let peopleCount = 0;

            relevantRestrictions.forEach(r => {
              const valor = r.valor_restriccion.toUpperCase();
              if (valor.includes('DIURNO') || valor.includes('DÍA') || valor.includes('DIA')) isDay = true;
              if (valor.includes('NOCTURNO') || valor.includes('NOCHE')) isNight = true;
              
              const numMatch = valor.match(/\d+/);
              if (numMatch) {
                peopleCount = Math.max(peopleCount, parseInt(numMatch[0]));
              } else if (!isNaN(Number(valor)) && Number(valor) > 0) {
                peopleCount = Math.max(peopleCount, Number(valor));
              }
            });

            if (!isDay && !isNight && relevantRestrictions.length > 0) isDay = true;
            const current = next[p] || { machine: p, isDayActive: true, isNightActive: false, people: 0, machines: 1 };
            if (current.isDayActive !== isDay || current.isNightActive !== isNight || current.people !== peopleCount) {
              next[p] = { ...current, isDayActive: isDay, isNightActive: isNight, people: peopleCount };
              updated = true;
            }
          }
        });
        return updated ? next : prev;
      });
    }
  }, [restricciones, uniquePuestos]);

  const getKPITimeSecondsForOrder = useCallback((order: any) => {
    const materialCode = normalizeMaterialCode(order['MATERIAL'] || order['CodMaterial'] || '');
    const puestoName = getResolvedPuesto(order);
    const hojaRuta = mapToHojaRuta(puestoName);
    if (!materialCode || !hojaRuta) return null;
    
    if (hojaRuta.includes(' / ')) {
      const codes = hojaRuta.split(' / ').map(c => c.trim().toUpperCase());
      const orderHR = String(order['MAQUINA'] || order['Maquina'] || '').trim().toUpperCase();
      if (codes.includes(orderHR)) {
        const key = `${materialCode}|${orderHR}`;
        const match = kpiIndexRef.current[key];
        return match ? Number(match.TPromedio) : null;
      }
    }

    const key = `${materialCode}|${hojaRuta.toUpperCase().trim()}`;
    const match = kpiIndexRef.current[key];
    return match ? Number(match.TPromedio) : null;
  }, [normalizeMaterialCode, getResolvedPuesto, mapToHojaRuta]);

  const calculateProductionTime = useCallback((material: string, quantity: number, order: any) => {
    if (!material) return 0;
    const kpiSec = getKPITimeSecondsForOrder(order);
    if (kpiSec !== null) return (kpiSec * quantity);
    const normMaterial = normalizeMaterialCode(material);
    const timesList = tiemposIndexRef.current[normMaterial];
    if (timesList && Array.isArray(timesList)) {
      const puesto = getResolvedPuesto(order);
      const match = timesList.find(t => {
        const tPuesto = String(t.PuestoTrabajo || t.nombre_estacion || t.Maquina || '').trim().toUpperCase();
        return tPuesto === puesto;
      }) || timesList[0];
      return match ? (Number(match.Tiempo || match.Tiempo_Min || 0) * 60 * quantity) : 0;
    }
    return 0;
  }, [normalizeMaterialCode, getResolvedPuesto, getKPITimeSecondsForOrder]);

  const handleExplodeFerts = async () => {
    const allFerts = [...fert1000, ...fert2000];
    if (allFerts.length === 0) {
      addNotification('warning', 'No hay órdenes FERT para explosionar.');
      return;
    }

    if (allowedComponentsCHN.length === 0) {
      addNotification('warning', 'No se ha configurado la restricción COMPONENTES_CHN. Se mostrarán todos los materiales.');
    }

    const uniqueMaterials = Array.from(new Set(allFerts.map(o => {
      const rawCode = String(o['CodMaterial'] || o['MATERIAL'] || o['Material'] || '').trim();
      return rawCode.slice(-8); // Match the 8-digit requirement for the Fert parameter
    }))).filter(m => m !== '');

    setIsLoadingExplosion(true);
    setExplosionProgress(0);
    const allComponents: any[] = [];

    try {
      for (let i = 0; i < uniqueMaterials.length; i++) {
        const fertCode = uniqueMaterials[i];
        setExplosionProgress(Math.round((i / uniqueMaterials.length) * 100));
        
        const ordersForMaterial = allFerts.filter(o => {
          const raw = String(o['CodMaterial'] || o['MATERIAL'] || o['Material'] || '').trim();
          return raw.slice(-8) === fertCode;
        });

        const response = await serviciosService.getMaestroMaterialesExplosion('1000', fertCode, 1, 5000);
        const components = response.data || [];

        const filteredComponents = allowedComponentsCHN.length > 0
          ? components.filter((comp: any) => {
              const compCode = String(comp.COMPONENTE || comp.Componente || comp.Material || '').trim().replace(/^0+/, '');
              return allowedComponentsCHN.includes(compCode);
            })
          : components;

        filteredComponents.forEach((comp: any) => {
          ordersForMaterial.forEach(order => {
             const resp = String(order['RESPCTRLPROD'] || order['RESP_CTRL_PROD'] || 'S/R').trim().replace(/^0+/, '');
             const orderQty = Number(order['CANTIDAD'] || order['CANTPROGRAMADA'] || 0);
             allComponents.push({
               ...comp,
               fertParent: fertCode,
               orderQuantity: orderQty,
               responsable: resp,
               totalNeeded: (Number(comp.CANTIDAD_UNITARIA || comp.Cantidad || 0)) * orderQty
             });
          });
        });
      }
      setExplodedComponentsData(allComponents);
      setExplosionProgress(100);
      addNotification('success', `Explosión completada. Se identificaron ${allComponents.length} insumos requeridos filtrados por CHN.`);
    } catch (error: any) {
      addNotification('error', `Error en explosión: ${error.message}`);
    } finally {
      setIsLoadingExplosion(false);
    }
  };

  const { consolidatedInsumos, resumenPorResponsableExplosion } = useMemo(() => {
    const materialMap = new Map<string, { code: string, name: string, total: number, unit: string }>();
    const respMap = new Map<string, { resp: string, totalForros: number, totalInsumos: number }>();

    explodedComponentsData.forEach(item => {
      // Agrupación por Material
      const code = String(item.COMPONENTE || item.Componente || item.Material || '').trim();
      const name = String(item.NOMBRE_COMPONENTE || item.Descripcion || '').trim();
      const total = Number(item.totalNeeded || 0);
      const unit = String(item.UNIDAD || item.Unidad || 'ST').trim();

      if (!materialMap.has(code)) {
        materialMap.set(code, { code, name, total: 0, unit });
      }
      materialMap.get(code)!.total += total;

      // Agrupación por Responsable (Resumen solicitado)
      const resp = item.responsable;
      const forroQty = Number(item.orderQuantity || 0);
      
      if (!respMap.has(resp)) {
        respMap.set(resp, { resp, totalForros: 0, totalInsumos: 0 });
      }
      
      respMap.get(resp)!.totalInsumos += total;
    });

    // Recalcular forros totales por responsable de forma limpia
    const uniqueForrosPerResp = new Map<string, number>();
    const processedForros = new Set<string>();
    
    explodedComponentsData.forEach(item => {
      const key = `${item.responsable}|${item.fertParent}`;
      if (!processedForros.has(key)) {
        processedForros.add(key);
        uniqueForrosPerResp.set(item.responsable, (uniqueForrosPerResp.get(item.responsable) || 0) + Number(item.orderQuantity));
      }
    });

    uniqueForrosPerResp.forEach((total, resp) => {
      if (respMap.has(resp)) {
        respMap.get(resp)!.totalForros = total;
      }
    });

    return {
      consolidatedInsumos: Array.from(materialMap.values()).sort((a, b) => a.code.localeCompare(b.code)),
      resumenPorResponsableExplosion: Array.from(respMap.values()).sort((a, b) => a.resp.localeCompare(b.resp))
    };
  }, [explodedComponentsData]);

  const toggleWorkstationShift = (p: string, shift: 'day' | 'night') => {
    setWorkstationConfigs(prev => {
      const current = prev[p] || { machine: p, isDayActive: true, isNightActive: false, people: 0, machines: 1 };
      return {
        ...prev,
        [p]: {
          ...current,
          [shift === 'day' ? 'isDayActive' : 'isNightActive']: !current[shift === 'day' ? 'isDayActive' : 'isNightActive']
        }
      };
    });
  };

  const mapToHojaRutaInternal = useCallback((puestoName: string): string => mapToHojaRuta(puestoName), [mapToHojaRuta]);
  const horasNetasDiurnasVal = parseFloat(jornadaDiurnaSel || "0") * 0.84;
  const horasNetasNocturnasVal = parseFloat(jornadaNocturnaSel || "0") * 0.84;

  if (!isMounted) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-indigo-600" />
          <p className="text-slate-500 font-black uppercase tracking-widest text-xs">Inicializando Sistema Táctico...</p>
        </div>
      </div>
    );
  }

  const renderFertTable = (orders: any[], summary: any[], title: string, date: string, setDate: (d: string) => void, color: string) => {
    const fertCols = [
      { id: 'CENTRO', key: 'Centro' },
      { id: 'ORDEN', key: 'ORDEN' },
      { id: 'MATERIAL', key: 'CodMaterial' },
      { id: 'NOMBRE', key: 'Material' },
      { id: 'CANTPROGRAMADA', key: 'CANTIDAD' },
      { id: 'FECHA', key: 'FECHA' },
      { id: 'RESPCTRLPROD', key: 'RESPCTRLPROD' }
    ];

    return (
      <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden shadow-sm border-none">
        <CardHeader className={cn("text-white p-8", color)}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-white/10 p-3 rounded-2xl text-white backdrop-blur-sm border border-white/10">
                <PackageSearch className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black uppercase tracking-tight">{title}</CardTitle>
                <CardDescription className="text-white/60 font-bold uppercase text-[10px] tracking-widest mt-1">
                  Visualización de carga operativa segmentada
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white/10 border border-white/20 rounded-lg px-3 py-1 gap-2">
                <CalendarIcon className="w-3.5 h-3.5 text-white" />
                <input 
                  type="date" 
                  value={date} 
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-transparent border-none text-white text-[10px] font-bold focus:ring-0 outline-none p-0 cursor-pointer"
                />
              </div>
              <Badge className="bg-white text-slate-900 border-none font-mono font-black text-sm px-4 py-1.5 rounded-xl">{orders.length} REG</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[50vh]">
            {orders.length > 0 ? (
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-slate-100 sticky top-0 z-10 text-slate-600 text-left uppercase tracking-widest font-black">
                  <tr>
                    {fertCols.map((col) => (
                      <th key={col.id} className="px-6 py-4 whitespace-nowrap text-[10px] uppercase font-bold">{col.id}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order, i) => (
                    <tr key={i} className="hover:bg-indigo-50 transition-colors">
                      {fertCols.map((col) => {
                        let val = order[col.key] || order[col.id] || order[col.id.toLowerCase()];
                        if (col.id === 'MATERIAL' && val) {
                          val = String(val).trim().slice(-8); // Extraer 8 dígitos desde el final
                        }
                        if (col.id === 'FECHA' && val) val = String(val).split('T')[0];
                        if (col.id === 'CANTPROGRAMADA' && val) val = Math.round(Number(val)).toLocaleString();
                        return (
                          <td key={col.id} className={cn(
                            "px-6 py-4 font-medium text-slate-600 whitespace-nowrap",
                            col.id === 'MATERIAL' && "font-mono font-bold",
                            col.id === 'CANTPROGRAMADA' && "text-right font-black text-slate-900",
                            col.id === 'NOMBRE' && "whitespace-normal break-words min-w-[250px]"
                          )}>{val ?? '—'}</td>
                        );
                      })}
                    </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <div className="py-20 text-center text-slate-400 uppercase font-black tracking-widest text-xs opacity-40">No hay registros para este centro en la fecha seleccionada</div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50/40 min-h-screen font-body">
      <div className="flex flex-col gap-4 bg-white p-5 rounded-[2.5rem] border border-slate-100 shadow-xl max-w-7xl mx-auto overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-slate-950 p-4 rounded-[1.5rem] text-white shadow-2xl ring-4 ring-slate-50 shrink-0">
              <CalendarClock className="w-6 h-6 text-sky-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-0.5">
                <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter leading-none text-nowrap">Programación Táctica</h1>
                <Badge className="bg-indigo-600 text-white font-black px-3 py-1 rounded-lg text-[9px] uppercase tracking-widest border-none shadow-md">Forros</Badge>
              </div>
              <div className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase tracking-[0.25em]">
                <Users className="w-3 h-3 text-indigo-500" /> Eficiencia Operativa: 84%
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <div className="bg-slate-50 border border-slate-200/60 rounded-[1.5rem] p-3 flex items-center gap-3 shadow-sm hover:shadow-md transition-all">
              <div className="bg-indigo-600 p-2 rounded-xl text-white shadow-lg shadow-indigo-100 shrink-0">
                <CalendarIcon className="w-3.5 h-3.5" />
              </div>
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Planificación para</p>
                <p className="text-xs font-black text-indigo-900 capitalize leading-tight">
                  {planningDateFormatted}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs 
        defaultValue="acolchado-tapas" 
        className="w-full"
        onValueChange={(tabValue) => {
          if (!loadedTabs.has(tabValue)) {
            const newLoaded = new Set(loadedTabs);
            newLoaded.add(tabValue);
            setLoadedTabs(newLoaded);
            if (tabValue === 'ordenes-fert' && ordenesFert.length === 0) fetchOrdenesFert();
            else if (tabValue === 'lista-materiales' && listaMaterialesData.length === 0) fetchListaMateriales();
            else if (tabValue === 'versiones-fabricacion' && versionesFabricacionData.length === 0) fetchVersionesFabricacion();
          }
        }}
      >
        <TabsList className="flex w-full h-auto bg-white border border-slate-200 p-2 rounded-[2rem] mb-10 shadow-sm overflow-x-auto justify-start">
          <TabsTrigger value="resumen-produccion" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <BarChart3 className="w-4 h-4 mr-2" /> Resumen
          </TabsTrigger>
          <TabsTrigger value="acolchado-tapas" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Cpu className="w-4 h-4 mr-2" /> 1. Acolchado & Tapas
          </TabsTrigger>
          <TabsTrigger value="bandas" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Layers className="w-4 h-4 mr-2" /> 2. Proceso Bandas
          </TabsTrigger>
          <TabsTrigger value="interiores-corte" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Settings2 className="w-4 h-4 mr-2" /> 3. Interiores & Corte
          </TabsTrigger>
          <TabsTrigger value="forros" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <LayoutGrid className="w-4 h-4 mr-2" /> 4. Forros Finales
          </TabsTrigger>
          <TabsTrigger value="ordenes-fert" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <PackageSearch className="w-4 h-4 mr-2" /> Órdenes FERT
          </TabsTrigger>
          <TabsTrigger value="ordenes-previsionales" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <SearchCode className="w-4 h-4 mr-2" /> Órdenes Previsionales
          </TabsTrigger>
          <TabsTrigger value="lista-materiales" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <ListTree className="w-4 h-4 mr-2" /> LISTA DE MATERIALES
          </TabsTrigger>
          <TabsTrigger value="versiones-fabricacion" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <Cog className="w-4 h-4 mr-2" /> Versiones de fabricación
          </TabsTrigger>
          <TabsTrigger value="personal-turnos" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <UserPlus className="w-4 h-4 mr-2" /> Personal & Turnos
          </TabsTrigger>
          <TabsTrigger value="kpi-tiempos" className="px-6 py-3 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
            <ClipboardList className="w-4 h-4 mr-2" /> KPI TIEMPOS
          </TabsTrigger>
        </TabsList>

        <TabsContent value="resumen-produccion">
          <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden shadow-sm">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-10">
              <CardTitle className="text-2xl font-black text-slate-900 uppercase">Salud de Planta (Órdenes Previsionales)</CardTitle>
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
                      <th className="px-8 py-5 text-center min-w-[200px]">% Ocupación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(() => {
                      const hrGroups = new Map<string, { name: string, puestos: string[] }>();
                      uniquePuestos.forEach(p => {
                        const hr = mapToHojaRutaInternal(p) || 'S/HR';
                        if (!hrGroups.has(hr)) {
                          hrGroups.set(hr, { name: p, puestos: [] });
                        }
                        hrGroups.get(hr)!.puestos.push(p);
                      });

                      return Array.from(hrGroups.entries()).map(([hrCodeFromMaestro, groupInfo], idx) => {
                        const orders = filteredOrdenesPrevisionales.filter(o => {
                          const orderHR = String(o['MAQUINA'] || o['Maquina'] || '').trim().toUpperCase();
                          if (hrCodeFromMaestro.includes(' / ')) {
                            const codes = hrCodeFromMaestro.split(' / ').map(c => c.trim().toUpperCase());
                            return codes.includes(orderHR);
                          }
                          return orderHR === hrCodeFromMaestro;
                        });

                        const totalUnits = orders.reduce((sum, o) => sum + Number(o['CANTIDAD'] || o['CANTPROGRAMADA'] || 0), 0);
                        const totalTimeHours = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || o['CANTPROGRAMADA'] || 0), o), 0) / 3600;
                        
                        let totalCapacityHours = 0;
                        groupInfo.puestos.forEach(p => {
                          const config = workstationConfigs[p] || { machine: p, isDayActive: true, isNightActive: false, people: 0, machines: 1 };
                          const stationHours = (config.isDayActive ? horasNetasDiurnasVal : 0) + (config.isNightActive ? horasNetasNocturnasVal : 0);
                          totalCapacityHours += stationHours * (config.machines || 1);
                        });

                        const utilization = totalCapacityHours > 0 ? (totalTimeHours / totalCapacityHours) * 100 : 0;
                        const isUnified = groupInfo.puestos.length > 1;
                        const displayName = isUnified ? `${groupInfo.name} (POOL)` : groupInfo.name;
                        
                        return (
                          <tr key={idx} className="hover:bg-slate-50 transition-all">
                            <td className="px-8 py-5 font-black text-slate-900 uppercase whitespace-nowrap">{displayName}</td>
                            <td className="px-8 py-5 font-mono font-black text-indigo-700 uppercase whitespace-nowrap">
                              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold px-3 py-1 rounded-lg">
                                {hrCodeFromMaestro}
                              </Badge>
                            </td>
                            <td className="px-8 py-5 text-right font-mono font-black text-slate-800">{totalUnits.toLocaleString()}</td>
                            <td className="px-8 py-5 text-right font-mono font-black text-indigo-700 bg-indigo-50/40">{totalTimeHours.toFixed(2)}h</td>
                            <td className="px-8 py-5 text-right font-mono font-bold text-slate-900">{totalCapacityHours.toFixed(2)}h</td>
                            <td className="px-8 py-5 text-center">
                               <div className="flex flex-col items-center justify-center gap-1">
                                 <div className="flex items-center justify-center gap-3 w-full">
                                   <div className="flex-1 bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200 shadow-inner">
                                     <div 
                                       className={cn(
                                         "h-full transition-all duration-500", 
                                         utilization > 100 ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]" : 
                                         utilization >= 90 ? "bg-green-500" : 
                                         "bg-yellow-400"
                                       )} 
                                       style={{ width: `${Math.min(utilization, 100)}%` }} 
                                     />
                                   </div>
                                   <span className={cn(
                                     "font-mono font-black text-[10px] min-w-[35px] text-right", 
                                     utilization > 100 ? "text-red-600" : 
                                     utilization >= 90 ? "text-green-700" : 
                                     "text-yellow-600"
                                   )}>
                                     {utilization.toFixed(0)}%
                                   </span>
                                 </div>
                                 {utilization > 100 ? (
                                   <span className="text-[8px] font-black uppercase text-red-600 tracking-tighter animate-pulse">
                                     Sobrecapacidad
                                   </span>
                                 ) : utilization >= 90 ? (
                                   <span className="text-[8px] font-black uppercase text-green-600 tracking-tighter">
                                     Estable
                                   </span>
                                 ) : (
                                   <span className="text-[8px] font-black uppercase text-yellow-600 tracking-tighter animate-pulse">
                                     Debajo de capacidad
                                   </span>
                                 )}
                               </div>
                            </td>
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acolchado-tapas" className="space-y-6 pb-20">
          {renderDateFilterHeader()}
          {['02', '06', '07', '08', '09', '10', '13'].map(suffix => {
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
                      orders={techFilteredOrdenes}
                      calculateProductionTime={calculateProductionTime}
                      config={workstationConfigs[achNames[0]] || { machine: achNames[0], isDayActive: true, isNightActive: false, people: 0, machines: 1 }}
                      horasNetasDiurnas={horasNetasDiurnasVal}
                      horasNetasNocturnas={horasNetasNocturnasVal}
                      mapToHojaRuta={mapToHojaRutaInternal}
                      normalizeMaterialCode={normalizeMaterialCode}
                    />
                  )}
                  {pefNames.length > 0 && (
                    <MachineCard 
                      puestoName={pefNames[0]} 
                      orders={techFilteredOrdenes}
                      calculateProductionTime={calculateProductionTime}
                      config={workstationConfigs[pefNames[0]] || { machine: pefNames[0], isDayActive: true, isNightActive: false, people: 0, machines: 1 }}
                      horasNetasDiurnas={horasNetasDiurnasVal}
                      horasNetasNocturnas={horasNetasNocturnasVal}
                      mapToHojaRuta={mapToHojaRutaInternal}
                      normalizeMaterialCode={normalizeMaterialCode}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="bandas" className="space-y-6 pb-20">
          {renderDateFilterHeader()}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {uniquePuestos.filter(p => 
              p.includes('ACOLCHADORA11') || 
              p.includes('ACOLCHADORA12') || 
              p.includes('ACH11') || 
              p.includes('ACH12') || 
              p.includes('RMTB') || 
              p.includes('COS3D') || 
              p.includes('BANDA3D') ||
              p.includes('ENCINTADOBD') || 
              p.includes('BO01') || 
              p.includes('BORDADORA-BANDA01') ||
              p.includes('COSEDORA-BANDA3D') ||
              p.includes('COSEDORA-ENCINTADOBD')
            ).map((pName) => (
              <MachineCard 
                key={pName} 
                puestoName={pName} 
                small 
                orders={techFilteredOrdenes}
                calculateProductionTime={calculateProductionTime}
                config={workstationConfigs[pName] || { machine: pName, isDayActive: true, isNightActive: false, people: 0, machines: 1 }}
                horasNetasDiurnas={horasNetasDiurnasVal}
                horasNetasNocturnas={horasNetasNocturnasVal}
                mapToHojaRuta={mapToHojaRutaInternal}
                normalizeMaterialCode={normalizeMaterialCode}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="interiores-corte" className="space-y-6 pb-20">
          {renderDateFilterHeader()}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {uniquePuestos.filter(p => 
              p.includes('INTP') || 
              p.includes('MTBS') || 
              p.includes('CT') || 
              p.includes('TTCF') || 
              p.includes('TTSUP') || 
              p.includes('TELAS') || 
              p.includes('FUNDAS') ||
              p.includes('BSC-CC') ||
              p.includes('BSCTP') ||
              p.includes('COSEDORA-INTPF') ||
              p.includes('COSEDORA-BSC-CC') ||
              p.includes('COSEDORA-INTPR') ||
              p.includes('COSEDORA-INTPT') ||
              p.includes('COSEDORA-TTSUP-CHN') ||
              p.includes('COSEDORA-TTCHN') ||
              p.includes('CORTE-ESPUMA') ||
              p.includes('CORTELA10')
            ).map((pName) => (
              <MachineCard 
                key={pName} 
                puestoName={pName} 
                small 
                orders={techFilteredOrdenes}
                calculateProductionTime={calculateProductionTime}
                config={workstationConfigs[pName] || { machine: pName, isDayActive: true, isNightActive: false, people: 0, machines: 1 }}
                horasNetasDiurnas={horasNetasDiurnasVal}
                horasNetasNocturnas={horasNetasNocturnasVal}
                mapToHojaRuta={mapToHojaRutaInternal}
                normalizeMaterialCode={normalizeMaterialCode}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="forros" className="space-y-6 pb-20">
          {renderDateFilterHeader()}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-10">
            {uniquePuestos.filter(p => p.includes('FORRO') || p.includes('FBASE')).map((pName) => (
              <MachineCard 
                key={pName} 
                puestoName={pName} 
                small 
                orders={techFilteredOrdenes}
                calculateProductionTime={calculateProductionTime}
                config={workstationConfigs[pName] || { machine: pName, isDayActive: true, isNightActive: false, people: 0, machines: 1 }}
                horasNetasDiurnas={horasNetasDiurnasVal}
                horasNetasNocturnas={horasNetasNocturnasVal}
                mapToHojaRuta={mapToHojaRutaInternal}
                normalizeMaterialCode={normalizeMaterialCode}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="ordenes-fert" className="space-y-12 pb-20">
          {isLoadingFert ? (
            <div className="flex items-center justify-center py-20 bg-white rounded-3xl border border-slate-200">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
              <span className="ml-4 text-slate-500 font-black uppercase tracking-widest text-xs">Cargando órdenes FERT...</span>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Top Row with Summaries and Button */}
              <div className="flex flex-col space-y-6">
                <div className="flex justify-end">
                  <Button 
                    onClick={handleExplodeFerts} 
                    disabled={isLoadingExplosion || (fert1000.length === 0 && fert2000.length === 0)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase tracking-widest text-xs px-6 py-3 rounded-2xl shadow-lg"
                  >
                    {isLoadingExplosion ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando {explosionProgress}%</>
                    ) : (
                      <><Database className="w-4 h-4 mr-2" /> Procesar Explosión de Insumos</>
                    )}
                  </Button>
                </div>

                {/* Summaries Grid requested in image */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* Card 1: Resumen por Responsable (Fert Parents) */}
                  <Card className="rounded-3xl border-none shadow-sm ring-1 ring-slate-100 overflow-hidden bg-white">
                    <div className="px-6 py-3 bg-slate-900 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" /> RESUMEN POR RESPONSABLE
                    </div>
                    <CardContent className="p-0">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-black tracking-widest border-b">
                          <tr>
                            <th className="px-6 py-3 text-left">RESPCTRLPROD</th>
                            <th className="px-6 py-3 text-right">TOTAL CANTIDAD</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {[...summary1000, ...summary2000].length > 0 ? [...summary1000, ...summary2000].map((s, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="px-6 py-3 font-bold text-slate-700">Responsable {s.resp}</td>
                              <td className="px-6 py-3 text-right font-mono font-black text-indigo-600">{Math.round(s.total).toLocaleString()}</td>
                            </tr>
                          )) : (
                            <tr><td colSpan={2} className="py-8 text-center text-slate-400 italic text-[10px] uppercase font-black">Sin datos</td></tr>
                          )}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>

                  {/* Card 2: Tabla Forros (Consolidated Components) - AS REQUESTED IN IMAGE */}
                  <Card className="rounded-3xl border-none shadow-sm ring-1 ring-slate-100 overflow-hidden bg-white">
                    <div className="px-6 py-3 bg-indigo-900 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                      <ListTree className="w-4 h-4" /> TABLA FORROS (INSUMOS)
                    </div>
                    <CardContent className="p-0">
                      <div className="overflow-y-auto max-h-[300px]">
                        <table className="w-full text-[11px] border-collapse">
                          <thead className="bg-slate-50 text-slate-500 uppercase font-black tracking-widest border-b sticky top-0">
                            <tr>
                              <th className="px-6 py-3 text-left">MATERIAL</th>
                              <th className="px-6 py-3 text-right">NECESIDAD</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {consolidatedInsumos.length > 0 ? consolidatedInsumos.map((item, i) => (
                              <tr key={i} className="hover:bg-emerald-50/30">
                                <td className="px-6 py-3">
                                  <div className="font-mono font-bold text-indigo-950 truncate max-w-[120px]">{item.code}</div>
                                  <div className="text-[9px] text-slate-400 font-medium truncate max-w-[150px]">{item.name}</div>
                                </td>
                                <td className="px-6 py-3 text-right font-mono font-black text-emerald-600 bg-emerald-50/10">
                                  {item.total.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                  <span className="ml-1 text-[8px] text-slate-400 font-black">{item.unit}</span>
                                </td>
                              </tr>
                            )) : (
                              <tr>
                                <td colSpan={2} className="py-20 text-center">
                                  {isLoadingExplosion ? (
                                    <div className="flex flex-col items-center gap-2">
                                      <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                                      <span className="text-[10px] font-black uppercase text-slate-400">Calculando...</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 uppercase font-black tracking-widest text-[9px] opacity-40">Procesar explosión</span>
                                  )}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Card 3: Resumen Insumos por Responsable */}
                  <Card className="rounded-3xl border-none shadow-sm ring-1 ring-slate-100 overflow-hidden bg-white">
                    <div className="px-6 py-3 bg-emerald-900 text-white font-black text-[10px] uppercase tracking-widest flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" /> INSUMOS POR RESPONSABLE
                    </div>
                    <CardContent className="p-0">
                      <table className="w-full text-[11px] border-collapse">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-black tracking-widest border-b">
                          <tr>
                            <th className="px-6 py-3 text-left">RESPONSABLE</th>
                            <th className="px-6 py-3 text-right">VOLUMEN CHN</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {resumenPorResponsableExplosion.length > 0 ? resumenPorResponsableExplosion.map((s, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="px-6 py-3 font-bold text-slate-700">Responsable {s.resp}</td>
                              <td className="px-6 py-3 text-right font-mono font-black text-emerald-700 bg-emerald-50/10">
                                {s.totalInsumos.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                              </td>
                            </tr>
                          )) : (
                            <tr><td colSpan={2} className="py-8 text-center text-slate-400 italic text-[10px] uppercase font-black">Sin explosión</td></tr>
                          )}
                        </tbody>
                      </table>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Fert Tables */}
              {renderFertTable(fert1000, summary1000, "Órdenes FERT - Centro 1000 (UIO)", targetDate1000, setTargetDate1000, "bg-slate-900")}
              {renderFertTable(fert2000, summary2000, "Órdenes FERT - Centro 2000 (GYE)", targetDate2000, setTargetDate2000, "bg-indigo-700")}
            </div>
          )}
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
                <Badge className="bg-slate-950 text-white border-none font-mono text-[10px] font-black py-1 px-3 rounded-lg shadow-sm">CENTRO: 1000</Badge>
                {allowedRespCodes.length > 0 ? (
                  <>
                    <div className="text-[10px] font-black text-slate-300">|</div>
                    {allowedRespCodes.map(code => (
                      <Badge key={code} className="bg-indigo-50 text-indigo-700 border-indigo-200 font-mono text-[10px] font-black py-1 px-3 rounded-lg">RESP: {code}</Badge>
                    ))}
                  </>
                ) : (
                  <Badge variant="outline" className="text-slate-400 font-bold uppercase text-[9px] px-3 py-1 rounded-lg">Sin restricción RESP</Badge>
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
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-50" />
                  </div>
                ) : (
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-slate-900 sticky top-0 z-10 text-white text-left uppercase tracking-widest font-black">
                      <tr>
                        {filteredOrdenesPrevisionales.length > 0 && Object.keys(filteredOrdenesPrevisionales[0]).map((key) => {
                          const normKey = key.toUpperCase().trim();
                          const isTechnical = normKey === 'MAQUINA' || normKey === 'PUESTOTRABAJO' || normKey === 'PUESTO_TRABAJO';
                          return (
                            <React.Fragment key={key}>
                              <th className="px-6 py-4 whitespace-nowrap text-[10px] uppercase font-bold text-slate-300">{key}</th>
                              {isTechnical && (
                                <th className="px-6 py-4 text-[10px] uppercase font-bold text-sky-400 bg-slate-800 shadow-inner whitespace-nowrap">Tiempo producción (s)</th>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredOrdenesPrevisionales.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors text-[10px]">
                          {Object.keys(item).map((key) => {
                            const val = item[key];
                            const normKey = key.toUpperCase().trim();
                            const isTechnical = normKey === 'MAQUINA' || normKey === 'PUESTOTRABAJO' || normKey === 'PUESTO_TRABAJO';
                            const kpiTimeSec = getKPITimeSecondsForOrder(item);
                            return (
                              <React.Fragment key={key}>
                                <td className="px-6 py-4 font-medium text-slate-600 whitespace-normal break-words leading-tight min-w-[150px]">{val ?? '—'}</td>
                                {isTechnical && (
                                  <td className="px-6 py-4 font-mono font-black text-indigo-600 bg-indigo-50/30 text-center border-x border-slate-100 min-w-[120px]">
                                    {kpiTimeSec !== null ? kpiTimeSec.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                  </td>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lista-materiales">
          <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden shadow-sm border-none">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black text-slate-900 uppercase">LISTA DE MATERIALES</CardTitle>
                  <CardDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Explosión de Materiales (BOM) - ReporteExplosionMateriales</CardDescription>
                </div>
                <div className="bg-emerald-600 p-3 rounded-2xl text-white shadow-lg shadow-emerald-500/20">
                  <ListTree className="w-6 h-6" />
                </div>
              </div>
              {isLoadingListaMateriales && (
                <div className="mt-6 space-y-2">
                  <div className="flex justify-between text-xs font-black text-emerald-700 uppercase tracking-widest">
                    <span>Descargando explosión de materiales (secuencial)...</span>
                    <span>{bomDownloadProgress}%</span>
                  </div>
                  <Progress value={bomDownloadProgress} className="h-2 bg-emerald-100 [&>div]:bg-emerald-600" />
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[70vh] relative">
                {isLoadingListaMateriales && listaMaterialesData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 space-y-4">
                    <Loader2 className="w-12 h-12 animate-spin text-emerald-600" />
                    <span className="text-slate-500 font-black uppercase tracking-widest text-xs">Procesando bloques de datos...</span>
                  </div>
                ) : listaMaterialesData.length > 0 ? (
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-slate-900 sticky top-0 z-10 text-white text-left uppercase tracking-widest font-black">
                      <tr>
                        {Object.keys(listaMaterialesData[0]).map((key) => (
                          <th key={key} className="px-6 py-4 whitespace-nowrap text-[10px] uppercase font-bold text-slate-300">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {listaMaterialesData.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors text-[10px]">
                          {Object.entries(row).map(([key, val]: [string, any], j) => (
                            <td key={j} className={cn(
                              "px-6 py-4 font-medium text-slate-600",
                              (key === 'COMPONENTE' || key === 'FERT_PRINCIPAL') && "font-mono font-bold text-indigo-700",
                              (key === 'CANTIDAD_UNITARIA' || key === 'CANTIDAD_ACUMULADA') && "text-right font-mono font-black"
                            )}>
                              {typeof val === 'number' ? val.toLocaleString(undefined, { minimumFractionDigits: 3 }) : (val ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-20 text-center text-slate-400 uppercase font-black tracking-widest text-xs opacity-40">No hay datos de explosión disponibles</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="versiones-fabricacion">
          <Card className="rounded-[2.5rem] bg-white ring-1 ring-slate-100 overflow-hidden shadow-sm border-none">
            <CardHeader className="bg-slate-50/50 border-b border-slate-200 p-10">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl font-black text-slate-900 uppercase">Versiones de fabricación</CardTitle>
                  <CardDescription className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-1">Maestro de Versiones por Material</CardDescription>
                </div>
                <div className="bg-orange-600 p-3 rounded-2xl text-white shadow-lg shadow-orange-500/20">
                  <Cog className="w-6 h-6" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[70vh] relative">
                {isLoadingVersiones ? (
                  <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 animate-spin text-orange-600" />
                  </div>
                ) : versionesFabricacionData.length > 0 ? (
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-slate-900 sticky top-0 z-10 text-white text-left uppercase tracking-widest font-black">
                      <tr>
                        {Object.keys(versionesFabricacionData[0]).map((key) => (
                          <th key={key} className="px-6 py-4 whitespace-nowrap text-[10px] uppercase font-bold text-slate-300">{key}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {versionesFabricacionData.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 transition-colors text-[10px]">
                          {Object.values(row).map((val: any, j) => (
                            <td key={j} className="px-6 py-4 font-medium text-slate-600 whitespace-nowrap">{val ?? '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="py-20 text-center text-slate-400 uppercase font-black tracking-widest text-xs opacity-40">No hay versiones registradas</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="personal-turnos" className="pb-24">
          <div className="flex flex-col xl:flex-row gap-10">
            <Card className="xl:w-[350px] shrink-0 rounded-[2.5rem] bg-white border-none shadow-sm ring-1 ring-slate-100">
               <CardHeader className="bg-slate-950 text-white p-8 rounded-t-[2.5rem]">
                 <CardTitle className="text-xl font-black uppercase">Jornada Global</CardTitle>
                 <div className="mt-3 flex items-center gap-2 text-[10px] font-black text-sky-400 uppercase tracking-[0.25em]">
                   <Users className="w-3.5 h-3.5" /> Eficiencia Operativa: 84%
                 </div>
               </CardHeader>
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
                 </div>
               </CardContent>
            </Card>

            <div className="flex-1 space-y-12">
              {workstationGroups.map((group, gIdx) => {
                const availableItems = group.items.filter(item => uniquePuestos.includes(item));
                if (availableItems.length === 0) return null;
                return (
                  <div key={gIdx} className="space-y-6">
                    <div className="flex items-center gap-4">
                      <div className="h-8 w-2 bg-indigo-600 rounded-full" />
                      <h3 className="text-xl font-black text-indigo-950 uppercase tracking-tighter">{group.title}</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                      {availableItems.map(p => {
                        const config = workstationConfigs[p] || { machine: p, isDayActive: true, isNightActive: false, people: 0, machines: 1 };
                        const capPuestoBase = (config.isDayActive ? horasNetasDiurnasVal : 0) + (config.isNightActive ? horasNetasNocturnasVal : 0);
                        const capPuestoTotal = capPuestoBase * (config.machines || 1);
                        const hrCode = mapToHojaRutaInternal(p);

                        return (
                          <div key={p} className="flex flex-col p-8 border border-slate-200 rounded-[2.5rem] bg-white hover:border-indigo-300 transition-all shadow-sm relative group min-h-[420px]">
                            <div className="mb-6 relative">
                              <Badge className="bg-indigo-600 text-white border-none font-mono text-[10px] uppercase font-bold tracking-widest px-3 py-1 rounded-lg shadow-sm mb-3">
                                {hrCode || 'S/HR'}
                              </Badge>
                              <h4 className="font-black text-indigo-950 uppercase text-2xl leading-tight break-words pr-20">{p}</h4>
                              
                              <div className="absolute top-0 right-0 flex flex-col gap-2">
                                <div className="flex flex-col items-center justify-center bg-sky-50 border-2 border-dashed border-sky-300 w-16 h-16 rounded-2xl shadow-inner group-hover:bg-sky-100 transition-colors">
                                  <span className="text-2xl font-black text-sky-700 leading-none">{config.machines || 1}</span>
                                  <span className="text-[7px] font-black uppercase text-sky-400 mt-0.5 tracking-tighter">Máquinas</span>
                                </div>
                                <div className="flex flex-col items-center justify-center bg-indigo-50 border-2 border-dashed border-indigo-300 w-16 h-16 rounded-2xl shadow-inner group-hover:bg-indigo-100 transition-colors">
                                  <span className="text-2xl font-black text-indigo-700 leading-none">{config.people || 0}</span>
                                  <span className="text-[7px] font-black uppercase text-indigo-400 mt-0.5 tracking-tighter">Personas</span>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-6 mt-auto">
                              <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100">
                                <div className="flex justify-between items-center text-[10px] text-slate-400 uppercase font-black tracking-widest mb-3">Turnos Activos</div>
                                <div className="flex gap-3">
                                  <button 
                                    onClick={() => toggleWorkstationShift(p, 'day')}
                                    className={cn(
                                      "flex-1 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all shadow-sm border-2",
                                      config.isDayActive ? "bg-amber-500 text-white border-amber-600" : "bg-white text-slate-300 border-slate-100"
                                    )}
                                  >
                                    <Sun className="w-5 h-5" />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Día</span>
                                  </button>
                                  <button 
                                    onClick={() => toggleWorkstationShift(p, 'night')}
                                    className={cn(
                                      "flex-1 h-14 rounded-2xl flex flex-col items-center justify-center gap-1 transition-all shadow-sm border-2",
                                      config.isNightActive ? "bg-indigo-700 text-white border-indigo-800" : "bg-white text-slate-300 border-slate-100"
                                    )}
                                  >
                                    <Moon className="w-5 h-5" />
                                    <span className="text-[9px] font-black uppercase tracking-widest">Noche</span>
                                  </button>
                                </div>
                              </div>

                              <div className="bg-indigo-50/50 p-5 rounded-3xl border border-indigo-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Monitor className="w-5 h-5 text-indigo-600" />
                                  <span className="text-xs font-black text-indigo-900 uppercase tracking-tighter">Configuración</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-[10px] font-black text-slate-400 uppercase">Máquinas:</span>
                                  <input 
                                    type="number" 
                                    min="1"
                                    value={config.machines || 1}
                                    onChange={(e) => {
                                      const val = Math.max(1, parseInt(e.target.value) || 1);
                                      setWorkstationConfigs(prev => ({
                                        ...prev,
                                        [p]: { ...config, machines: val }
                                      }));
                                    }}
                                    className="w-14 bg-white border-2 border-indigo-100 rounded-xl text-center font-black text-indigo-900 focus:ring-indigo-500 py-1.5 shadow-sm"
                                  />
                                </div>
                              </div>

                              <div className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 rounded-full border border-emerald-100">
                                <Clock className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="font-mono text-[11px] font-black uppercase text-emerald-700 tracking-wider">
                                  {capPuestoTotal.toFixed(2)}H Capacidad Neta
                                </span>
                              </div>
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
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[70vh] relative">
                {isLoadingKPI ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-50" />
                  </div>
                ) : (
                  <table className="w-full text-[11px] border-collapse">
                    <thead className="bg-slate-900 sticky top-0 z-10 text-white text-left uppercase tracking-widest font-black">
                      <tr>
                        <th className="px-6 py-4">Código Material</th>
                        <th className="px-6 py-4">HOJA DE RUTA</th>
                        <th className="px-6 py-4 text-right bg-indigo-950/20">T. Promedio (seg)</th>
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
