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
  ListTree,
  Cog,
  Truck,
  CalendarDays,
  FileText,
  Calendar as CalendarIcon
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
    title: "Células de Acolchado y Tapas",
    items: [
      "ACOLCHADORA02", "ACOLCHADORA06", "ACOLCHADORA07", "ACOLCHADORA08", "ACOLCHADORA09", "ACOLCHADORA10", "ACOLCHADORA13", 
      "ACH02", "ACH06", "ACH07", "ACH08", "ACH09", "ACH10", "ACH13",
      "COSEDORA-ACH02", "COSEDORA-ACH06", "COSEDORA-ACH07", "COSEDORA-ACH08", "COSEDORA-ACH09", "COSEDORA-ACH10", "COSEDORA-ACH13",
      "PEGADORA-ACH02", "PEGADORA-ACH06", "PEGADORA-ACH07", "PEGADORA-ACH08", "PEGADORA-ACH09", "PEGADORA-ACH10", "PEGADORA-ACH13",
      "PEF02", "PEF06", "PEF07", "PEF08", "PEF09", "PEF10", "PEF13"
    ]
  },
  {
    title: "Procesos de Bandas y Bordado",
    items: [
      "ACOLCHADORA11", "ACOLCHADORA12", "ACH11", "ACH12", 
      "BORDADORA-BANDA01", "BO01", "RMTB-01", "RMTB-02", "RMTB-M", "RMTB01", "RMTB02", "RMTBM",
      "COS3D", "COSEDORA-BANDA3D", "COSEDORA-BANDA-3D",
      "ENCINTADOBD", "COSEDORA-ENCINTADOBD"
    ]
  },
  {
    title: "Interiores, Bases y Corte",
    items: [
      "INTP-PR", "INTP-PT", "INTP-F", "INTPF", "INTPF1", "INTPF2", 
      "COSEDORA-INTPF", "COSEDORA-INTP-F", "COSEDORA-INTPF1", "COSEDORA-INTPF2",
      "MTBS1", "MTBS", "COSEDORA-BSC-CC", "COSEDORA-BSCTP", "COSEDORA-MTBS1",
      "CT-BAN", "CT-BSC", "CT-CHN", "CT-INT", "TTCF", "TTSUP", "TELAS", "FUNDAS"
    ]
  },
  {
    title: "Ensamble de Forros",
    items: ["FORRO-COLCHONES", "FBASE-01", "FBASE-02"]
  }
];

interface WorkstationConfig {
  machine: string;
  isDayActive: boolean;
  isNightActive: boolean;
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
  
  const { filteredOrders, totalTimeHours, utilization, isOverloaded, capacityHours } = useMemo(() => {
    const filtered = orders.filter(o => {
      const orderHR = String(o['MAQUINA'] || o['Maquina'] || '').trim().toUpperCase();
      return orderHR === hrCode;
    });

    const totalSeconds = filtered.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || o['CANTPROGRAMADA'] || 0), o), 0);
    const totalHours = totalSeconds / 3600;
    const capacity = (config.isDayActive ? horasNetasDiurnas : 0) + (config.isNightActive ? horasNetasNocturnas : 0);
    const util = capacity > 0 ? (totalHours / capacity) * 100 : 0;
    
    return {
      filteredOrders: filtered,
      totalTimeHours: totalHours,
      utilization: util,
      isOverloaded: util > 100,
      capacityHours: capacity
    };
  }, [orders, hrCode, calculateProductionTime, config.isDayActive, config.isNightActive, horasNetasDiurnas, horasNetasNocturnas]);

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
              {hrCode || 'S/HR'}
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
          <Badge className="bg-white text-slate-900 border-slate-200 font-mono font-black text-[10px] px-3 py-0.5 rounded-full shadow-sm">{filteredOrders.length} <span className="ml-1 text-[8px] opacity-40 uppercase">ORD</span></Badge>
        </div>
        <div className="flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-inner text-[10px]">
          <table className="w-full border-collapse">
            <thead className="bg-slate-100/80 sticky top-0 z-10 text-slate-500 font-black uppercase tracking-widest text-left">
              <tr>
                <th className="px-4 py-3 border-b border-slate-200">CODMATERIAL</th>
                <th className="px-4 py-3 border-b border-slate-200 min-w-[200px]">NOMBRE</th>
                <th className="px-4 py-3 border-b border-slate-200 text-right">CANTIDAD</th>
                <th className="px-4 py-3 border-b border-slate-200 text-center">FECHA INICIO</th>
                <th className="px-4 py-3 border-b border-slate-200 text-right text-indigo-700 bg-indigo-50/30">TIEMPO DE PRODUCCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredOrders.length > 0 ? filteredOrders.map((o, i) => {
                const qty = Number(o['CANTIDAD'] || o['CANTPROGRAMADA'] || 0);
                const tSeconds = calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', qty, o);
                const tHours = tSeconds / 3600;
                const materialCode = o['CodMaterial'] || normalizeMaterialCode(o['MATERIAL'] || '');
                const materialName = o['NOMBRE'] || o['TEXTOMATERIAL'] || o['Material'] || '—';
                const fechaInicio = o['FECHAINICIO'] || o['FECHA'] || '—';
                
                return (
                  <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-slate-700 whitespace-nowrap">{materialCode}</td>
                    <td className="px-4 py-3 text-slate-600 font-medium whitespace-normal break-words leading-tight">{materialName}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-slate-800">{qty.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center font-medium text-slate-500">{fechaInicio}</td>
                    <td className="px-4 py-3 text-right font-mono font-black text-indigo-600 bg-indigo-50/10">{tHours.toFixed(2)}h</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-slate-400 uppercase font-black tracking-widest text-[9px] opacity-40">Sin carga de trabajo para esta ruta</td>
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
    prevProps.config === nextProps.config &&
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

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFert, setIsLoadingFert] = useState(false);
  const [isLoadingKPI, setIsLoadingKPI] = useState(false);
  const [isLoadingPrevisionales, setIsLoadingPrevisionales] = useState(false);
  const [isLoadingListaMateriales, setIsLoadingListaMateriales] = useState(false);
  const [isLoadingVersiones, setIsLoadingVersiones] = useState(false);
  const [isLoadingTiempos, setIsLoadingTiempos] = useState(false);
  const [bomDownloadProgress, setBomDownloadProgress] = useState(0);
  
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
  
  // Filtros de fecha para tableros técnicos
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

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const normalizeMaterialCode = useCallback((code: string | number): string => {
    if (!code) return '';
    const codeStr = String(code).trim();
    return codeStr.replace(/^0+/, '');
  }, []);

  const mapToHojaRuta = useCallback((puestoName: string): string => {
    const pn = String(puestoName || '').toUpperCase().trim();
    if (!pn || pn === '—' || pn === 'NULL') return '';
    if (hojaRutaCacheRef.current[pn]) return hojaRutaCacheRef.current[pn];
    
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
      for (const key in kpiIndexRef.current) {
        const kpi = kpiIndexRef.current[key];
        if (String(kpi.Categoria || '').toUpperCase().trim() === pn) {
          result = kpi.HRUTA;
          break;
        }
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
  }, []);

  useEffect(() => {
    if (isMounted) {
      const today = new Date();
      if (!targetDate1000) setTargetDate1000(addBusinessDays(today, 3));
      if (!targetDate2000) setTargetDate2000(addBusinessDays(today, 2));
      
      // Filtros técnicos: Hoy y Mañana laboral
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
        // Carga secuencial para no saturar el servidor
        for (let p = 2; p <= totalPages; p++) {
          setBomDownloadProgress(Math.round(((p - 1) / totalPages) * 100));
          const nextResponse = await serviciosService.ReporteExplosionMateriales(p, rowsPerPage);
          if (nextResponse.data) {
            allData = [...allData, ...nextResponse.data];
          }
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
          initial[p] = { machine: p, isDayActive: true, isNightActive: false };
        });
        return initial;
      });
    }
  }, [dataReady, uniquePuestos]);

  const getKPITimeSecondsForOrder = useCallback((order: any) => {
    const materialCode = normalizeMaterialCode(order['MATERIAL'] || order['CodMaterial'] || '');
    const puestoName = getResolvedPuesto(order);
    const hojaRuta = mapToHojaRuta(puestoName);
    if (!materialCode || !hojaRuta) return null;
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

  const mapToHojaRutaInternal = useCallback((puestoName: string): string => mapToHojaRuta(puestoName), [mapToHojaRuta]);

  const horasNetasDiurnasVal = parseFloat(jornadaDiurnaSel || "0") * 0.84;
  const horasNetasNocturnasVal = parseFloat(jornadaNocturnaSel || "0") * 0.84;

  const renderDateFilterHeader = () => (
    <div className="flex flex-col md:flex-row items-center gap-4 p-5 bg-white border border-slate-200 rounded-[1.5rem] shadow-sm mb-6">
      <div className="flex items-center gap-2 text-indigo-600 font-black uppercase tracking-widest text-[10px]">
        <CalendarIcon className="w-4 h-4" /> Filtro de Producción Técnica
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 gap-2">
          <span className="text-[9px] font-black text-slate-400 uppercase">Desde</span>
          <input 
            type="date" 
            value={techStartDate} 
            onChange={(e) => setTechStartDate(e.target.value)}
            className="bg-transparent border-none text-slate-700 text-xs font-bold focus:ring-0 outline-none p-0 cursor-pointer"
          />
        </div>
        <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 gap-2">
          <span className="text-[9px] font-black text-slate-400 uppercase">Hasta</span>
          <input 
            type="date" 
            value={techEndDate} 
            onChange={(e) => setTechEndDate(e.target.value)}
            className="bg-transparent border-none text-slate-700 text-xs font-bold focus:ring-0 outline-none p-0 cursor-pointer"
          />
        </div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">
          {techFilteredOrdenes.length} órdenes en período
        </div>
      </div>
    </div>
  );

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
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-1 rounded-3xl border-none shadow-sm ring-1 ring-slate-100 overflow-hidden">
            <div className={cn("px-6 py-3 text-white font-black text-xs uppercase tracking-widest flex items-center gap-2", color)}>
              <BarChart3 className="w-4 h-4" /> Resumen por Responsable
            </div>
            <CardContent className="p-0">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-slate-50 text-slate-500 uppercase font-black tracking-widest border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">RESPCTRLPROD</th>
                    <th className="px-4 py-3 text-right">TOTAL CANTIDAD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.length > 0 ? summary.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-bold text-slate-700">Responsable {s.resp}</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-indigo-600">{Math.round(s.total).toLocaleString()}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={2} className="py-8 text-center text-slate-400 italic">Sin datos</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>

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
                  <CalendarDays className="w-3.5 h-3.5 text-white" />
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
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-6 bg-slate-50/40 min-h-screen font-body">
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
              <Users className="w-3 h-3" /> Eficiencia Operativa: 84%
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex items-center gap-5 min-w-[200px]">
            <div className="bg-indigo-700 p-3 rounded-2xl text-white"><MapPin className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">GYE (2000)</p>
              <p className="text-2xl font-black text-slate-900 font-mono">
                {ordenesPrevisionalesData.filter(o => String(o.Centro).trim() === '2000').length.toLocaleString()}
              </p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5 flex items-center gap-5 min-w-[200px]">
            <div className="bg-slate-800 p-3 rounded-2xl text-white"><MapPin className="w-5 h-5" /></div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">UIO (1000)</p>
              <p className="text-2xl font-black text-slate-900 font-mono">
                {filteredOrdenesPrevisionales.length.toLocaleString()}
              </p>
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
          <TabsTrigger value="lista-materiales" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <ListTree className="w-4 h-4 mr-2" /> LISTA DE MATERIALES
          </TabsTrigger>
          <TabsTrigger value="versiones-fabricacion" className="px-7 py-4 data-[state=active]:bg-slate-950 data-[state=active]:text-white rounded-2xl transition-all text-[11px] font-black uppercase tracking-widest text-slate-500">
            <Cog className="w-4 h-4 mr-2" /> Versiones de fabricación
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
                      <th className="px-8 py-5 text-center">% Ocupación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {uniquePuestos.map((p, idx) => {
                      const orders = filteredOrdenesPrevisionales.filter(o => {
                        const targetHR = mapToHojaRutaInternal(p).trim().toUpperCase();
                        const orderHR = String(o['MAQUINA'] || o['Maquina'] || '').trim().toUpperCase();
                        return orderHR === targetHR;
                      });
                      const totalUnits = orders.reduce((sum, o) => sum + Number(o['CANTIDAD'] || o['CANTPROGRAMADA'] || 0), 0);
                      const totalTimeHours = orders.reduce((sum, o) => sum + calculateProductionTime(o['MATERIAL'] || o['CodMaterial'] || '', Number(o['CANTIDAD'] || o['CANTPROGRAMADA'] || 0), o), 0) / 3600;
                      const config = workstationConfigs[p] || { machine: p, isDayActive: true, isNightActive: false };
                      const capacityHours = (config.isDayActive ? horasNetasDiurnasVal : 0) + (config.isNightActive ? horasNetasNocturnasVal : 0);
                      const utilization = capacityHours > 0 ? (totalTimeHours / capacityHours) * 100 : 0;
                      const hrCode = mapToHojaRutaInternal(p);
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-all">
                          <td className="px-8 py-5 font-black text-slate-900 uppercase whitespace-nowrap">{p}</td>
                          <td className="px-8 py-5 font-mono font-black text-indigo-700 uppercase whitespace-nowrap">
                            <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 font-bold px-3 py-1 rounded-lg">
                              {hrCode || 'S/HR'}
                            </Badge>
                          </td>
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
                      config={workstationConfigs[achNames[0]] || { machine: achNames[0], isDayActive: true, isNightActive: false }}
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
                      config={workstationConfigs[pefNames[0]] || { machine: pefNames[0], isDayActive: true, isNightActive: false }}
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
                config={workstationConfigs[pName] || { machine: pName, isDayActive: true, isNightActive: false }}
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
              p.includes('COSEDORA-BSC-CC')
            ).map((pName) => (
              <MachineCard 
                key={pName} 
                puestoName={pName} 
                small 
                orders={techFilteredOrdenes}
                calculateProductionTime={calculateProductionTime}
                config={workstationConfigs[pName] || { machine: pName, isDayActive: true, isNightActive: false }}
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
                config={workstationConfigs[pName] || { machine: pName, isDayActive: true, isNightActive: false }}
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
            <div className="space-y-16">
              <div className="space-y-6">
                {renderFertTable(fert1000, summary1000, "Órdenes FERT - Centro 1000 (UIO)", targetDate1000, setTargetDate1000, "bg-slate-900")}
              </div>
              <div className="space-y-6">
                {renderFertTable(fert2000, summary2000, "Órdenes FERT - Centro 2000 (GYE)", targetDate2000, setTargetDate2000, "bg-indigo-700")}
              </div>
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
                    <span>Sincronizando explosión de materiales...</span>
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
                    <span className="text-slate-500 font-black uppercase tracking-widest text-xs">Descargando reporte completo secuencialmente...</span>
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

        <TabsContent value="personal-turnos" className="pb-20">
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
                      <span className="font-mono font-black text-amber-900">{horasNetasDiurnasVal.toFixed(2)}h</span>
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
                      <span className="font-mono font-black text-indigo-900">{horasNetasNocturnasVal.toFixed(2)}h</span>
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
                        const capPuesto = (config.isDayActive ? horasNetasDiurnasVal : 0) + (config.isNightActive ? horasNetasNocturnasVal : 0);
                        const hrCode = mapToHojaRutaInternal(p);
                        return (
                          <div key={p} className="flex flex-col p-6 border-2 border-slate-100 rounded-[2rem] bg-white hover:border-indigo-200 transition-all shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                              <div className="min-w-0 flex-1">
                                <p className="font-black text-indigo-950 uppercase text-lg leading-tight mb-2 break-words">{p}</p>
                                <div className="flex flex-wrap gap-2">
                                  <Badge className="bg-indigo-600 text-white border-none font-mono text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-lg shadow-sm">
                                    {hrCode || 'S/HR'}
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
                                  config.isDayActive ? "bg-amber-500 text-white border-amber-600 shadow-amber-200" : "bg-white text-slate-300 border-slate-100"
                                )}
                              >
                                <Sun className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">{config.isDayActive ? 'Día ON' : 'Día OFF'}</span>
                              </button>
                              <button 
                                onClick={() => toggleWorkstationShift(p, 'night')}
                                className={cn(
                                  "flex-1 h-12 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm border-2",
                                  config.isNightActive ? "bg-indigo-700 text-white border-indigo-800 shadow-indigo-200" : "bg-white text-slate-300 border-slate-100"
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
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[70vh] relative">
                {isLoadingKPI ? (
                  <div className="flex items-center justify-center py-24">
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
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