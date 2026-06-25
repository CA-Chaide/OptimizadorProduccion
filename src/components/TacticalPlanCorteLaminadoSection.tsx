'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Scissors, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  RefreshCw, 
  Database,
  ChevronLeft,
  ChevronRight,
  Plus,
  Minus,
  Box,
  TrendingUp,
  MapPin,
  Info,
  ShoppingCart,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface UnifiedNeedRow {
  material: string;
  descripcion: string;
  densidad: string;
  altura: number;
  espesor: number;
  distancia: number;
  peso: number;
  consumoKg: number;
  consumoUn: number;
  nroRollos: number;
  consumoKgHalb: number;
  nroRollosHalb: number;
  totalConsumoKg: number; 
  totalNroRollos: number; 
  stock1006: number;
  stock1008: number;
  stock1015: number;
  stockUN1006: number;
  stockUN1008: number;
  stockUN1015: number;
  totalStockKg: number;
  totalStockUN: number;
  looperPesoUN: number;
  looperDensidad: string;
  looperEspesor: number;
  looperTRolloMin: number;
  apertura: string;
  porcentajeNecesidad: number;
  planUn: number;
  planKg: number;
  tProceso: number; 
  hasDeficit: boolean;
}

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
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

const parseDimensionsEnhanced = (desc: string) => {
  const d = desc.toUpperCase();
  const densMatch = d.match(/D-?\s*(\d+(?:\.\d+)?(?:\s*[A-Z]+)*)/);
  const densidad = densMatch ? densMatch[1].trim() : '—';

  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
  const alturaOriginal = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const espesor = dimMatch ? parseFloat(dimMatch[2]) : 0;
  
  let alturaFinal = alturaOriginal;
  if (alturaOriginal === 204 && espesor <= 1.2) {
    alturaFinal = 206;
  }
  
  let distancia = 100; 
  if (espesor === 1.0) distancia = 110;
  else if (espesor === 3.5) distancia = 60;
  else if (espesor === 1.2) distancia = 100;
  
  return { densidad, distancia, altura: alturaFinal, espesor };
};

const extractAperture = (desc: string): string => {
  const d = String(desc || '').toUpperCase();
  const match = d.match(/(194\.5|200|206|214|219|228|244)/);
  if (match) return match[0];
  const fallbackMatch = d.match(/(\d{3}(?:\.\d)?)\s*[X*]/);
  if (fallbackMatch) return fallbackMatch[1];
  return '—';
};

const getDensityColor = (dens: string) => {
  const d = dens.toLowerCase();
  if (d.includes('15')) return 'border-l-blue-600 bg-blue-50/50 text-blue-900';
  if (d.includes('18')) return 'border-l-emerald-600 bg-emerald-50/50 text-emerald-900';
  if (d.includes('20')) return 'border-l-purple-600 bg-purple-50/50 text-purple-900';
  if (d.includes('23')) return 'border-l-amber-600 bg-amber-50/50 text-amber-900';
  if (d.includes('25')) return 'border-l-pink-600 bg-pink-50/50 text-pink-900';
  if (d.includes('26')) return 'border-l-teal-600 bg-teal-50/50 text-teal-900';
  if (d.includes('30')) return 'border-l-orange-600 bg-orange-50/50 text-orange-900';
  if (d.includes('40')) return 'border-l-indigo-600 bg-indigo-50/50 text-indigo-900';
  return 'border-l-slate-400 bg-slate-50/50 text-slate-900';
};

const formatNum = (val: any, decimals: number = 2): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
};

export const TacticalPlanCorteLaminadoSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanLaminado');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restriccionesArray, setRestriccionesArray] = useState<Restriccion[]>([]);
  const [ordenes, setOrders] = useState<any[]>([]);
  const [ordenesFert, setOrdersFert] = useState<any[]>([]);
  const [kpiLooperData, setKpiLooperData] = useState<any[]>([]);
  const [inventarioSAP, setInventarioSAP] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [viewDate, setViewDate] = useState<Date>(new Date(2025, 0, 1)); 
  
  const [unifiedNeeds, setUnifiedNeeds] = useState<UnifiedNeedRow[]>([]);
  const [isProcessingResumen, setIsProcessingResumen] = useState(false);
  const [resumenProgress, setResumenProgress] = useState({ current: 0, total: 0 });
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // --- Turnos y Personal ---
  const [selectedDiaShift, setSelectedDiaShift] = useState('H1');
  const [selectedNocheShift, setSelectedNocheShift] = useState('EMPTY');
  const [assignedPersonnel, setAssignedPersonnel] = useState({
    dia: { op1: '', op2: '' },
    noche: { op1: '', op2: '' }
  });
  const [looperOperators, setLooperOperators] = useState<any[]>([]);

  const diaShiftOptions = [
    { v: 'EMPTY', l: 'VACÍO', h: 0 },
    { v: 'H1', l: '07:00 - 15:45', h: 8.75 },
    { v: 'H2', l: '07:00 - 17:00', h: 10 },
    { v: 'H3', l: '07:00 - 18:00', h: 11 },
    { v: 'H4', l: '07:00 - 19:00', h: 12 }
  ];

  const nocheShiftOptions = [
    { v: 'EMPTY', l: 'VACÍO', h: 0 },
    { v: 'H1', l: '21:00 - 05:30', h: 8.5 },
    { v: 'H2', l: '19:00 - 05:30', h: 10.5 }
  ];

  const extractMaterialInfo = useCallback((item: any) => {
    const matStr = getProp(item, ['MATERIAL', 'Material', 'CodMaterial', 'MATERIAL_ID', 'CODIGO']);
    const nameStr = getProp(item, ['NOMBRE', 'NombreMaterial', 'Descripcion', 'NomMaterial', 'DESCRIPCION']);
    const catStr = getProp(item, ['CATEGORIA', 'Categoria', 'CATEGORIA_DESC']);
    
    const match = matStr.match(/^(\d+)/);
    const code = match ? match[1].slice(-8) : matStr.slice(-8);
    const desc = nameStr || matStr.replace(/^\d+\s*/, '') || '—';

    return { code, desc, categoria: catStr };
  }, []);

  useEffect(() => {
    setMounted(true);
    const today = new Date();
    setViewDate(today);
    setSelectedDates(new Set([format(today, 'yyyy-MM-dd')]));
  }, []);

  const datesWithOrders = useMemo(() => {
    if (!mounted) return new Set<string>();
    const dates = new Set<string>();
    const allOrders = [...ordenes, ...ordenesFert];
    allOrders.forEach(o => {
      const d = getProp(o, ['FECHAINICIO', 'FECHA', 'fecha_inicio']).trim();
      if (d && d !== 'null') {
        const normalized = d.includes('T') ? d.split('T')[0] : d;
        dates.add(normalized);
      }
    });
    return dates;
  }, [ordenes, ordenesFert, mounted]);

  const calendarDaysList = useMemo(() => {
    if (!mounted || !viewDate) return [];
    const start = startOfMonth(viewDate);
    const end = endOfMonth(viewDate);
    const days = eachDayOfInterval({ start, end });
    const startDay = getDay(start);
    const padding = startDay === 0 ? 6 : startDay - 1;
    return [...Array(padding).fill(null), ...days];
  }, [viewDate, mounted]);

  const initData = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => {
        const name = (g.nombre_grupo || '').toLowerCase();
        return (name.includes('corte y laminado') || name.includes('laminado'));
      });
      setGrupos(filteredGroups);
      const ids = filteredGroups.map(g => g.codigo_grupo);
      
      const [restrs, provs, kpiLooper, invSAP, ferts, skills] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getKPIMAestroLooper().catch(() => ({ data: [] })),
        serviciosService.getInventarioAñoActual().catch(() => ({ data: [] })),
        serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getHabilidadesOperadorPorEstacion().catch(() => ({ data: [] }))
      ]);
      
      setRestriccionesArray((restrs.data || []).filter((r: any) => ids.includes(r.codigo_grupo)));
      setOrders(provs.data?.data || provs.data || []);
      setOrdersFert(ferts.data?.data || ferts.data || []);
      setKpiLooperData(kpiLooper?.data || []);
      setInventarioSAP(Array.isArray(invSAP?.data) ? invSAP.data : []);

      const skillsArray = Array.isArray(skills.data) ? skills.data : (Array.isArray(skills) ? skills : []);
      const filteredOps = skillsArray.filter((op: any) => 
        String(op.ESTACION || '').toUpperCase().includes('LOOPER') || 
        String(op.PUESTO || '').toUpperCase().includes('LOOPER')
      );
      setLooperOperators(filteredOps);

    } catch (e) {
      console.error('Error init TacticalPlanCorteLaminado:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) initData();
  }, [mounted, initData]);

  const filteredOrders = useMemo(() => {
    const relevantGroups = grupos.map(g => g.codigo_grupo);
    const allowedResps = restriccionesArray
      .filter(r => (r.nombre_restriccion === 'RESPCTRLPROD' || r.nombre_restriccion === 'Hojas_Rutas_Materiales') && relevantGroups.includes(r.codigo_grupo))
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return ordenes.filter(o => {
      const centro = getProp(o, ['CENTRO', 'Centro', 'centro']).trim();
      if (centro === '2000') return false; 
      const responsable = getProp(o, ['RESPCONTROLPROD', 'RespControlProd', 'RESP_CONTROL_PROD', 'RESPONSABLE']).trim();
      if (allowedResps.length > 0 && !allowedResps.includes(responsable)) return false;
      
      if (selectedDates.size > 0) {
        const dateRaw = getProp(o, ['FECHAINICIO', 'FECHA']).trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        if (!selectedDates.has(date)) return false;
      }
      return true;
    });
  }, [ordenes, selectedDates, grupos, restriccionesArray]);

  const filteredFertOrders = useMemo(() => {
    const relevantGroups = grupos.map(g => g.codigo_grupo);
    const allowedResps = restriccionesArray
      .filter(r => (r.nombre_restriccion === 'RESPCTRLPROD' || r.nombre_restriccion === 'Hojas_Rutas_Materiales') && relevantGroups.includes(r.codigo_grupo))
      .flatMap(r => r.valor_restriccion.split(/[,&]/).map(v => v.trim()))
      .filter(v => v !== '');

    return ordenesFert.filter(o => {
      const centro = getProp(o, ['CENTRO', 'Centro', 'centro']).trim();
      if (centro === '2000') return false; 
      const responsable = getProp(o, ['RESP_CONTROL_PROD', 'RESPCONTROLPROD', 'RespControlProd', 'RESPONSABLE']).trim();
      if (allowedResps.length > 0 && !allowedResps.includes(responsable)) return false;
      
      if (selectedDates.size > 0) {
        const dateRaw = getProp(o, ['FECHA', 'FECHAINICIO', 'FECHA_INICIO']).trim();
        const date = dateRaw.includes('T') ? dateRaw.split('T')[0] : dateRaw;
        if (!selectedDates.has(date)) return false;
      }
      return true;
    });
  }, [ordenesFert, selectedDates, grupos, restriccionesArray]);

  const handleProcessResumen = useCallback(async () => {
    if (filteredOrders.length === 0 && filteredFertOrders.length === 0) {
      setUnifiedNeeds([]);
      return;
    }
    
    setIsProcessingResumen(true);
    const materialGroupsProv = new Map<string, number>();
    filteredOrders.forEach(order => {
      const matRaw = getProp(order, ['MATERIAL', 'CodMaterial']).trim();
      const match = matRaw.match(/^(\d+)/);
      const matCode = match ? match[1] : matRaw;
      if (!matCode) return;
      const orderQty = safeNum(getProp(order, ['CANTPROGRAMADA', 'CANTIDAD']));
      materialGroupsProv.set(matCode, (materialGroupsProv.get(matCode) || 0) + orderQty);
    });

    const materialGroupsHalb = new Map<string, number>();
    filteredFertOrders.forEach(order => {
      const matRaw = getProp(order, ['MATERIAL', 'CodMaterial']).trim();
      const match = matRaw.match(/^(\d+)/);
      const matCode = match ? match[1] : matRaw;
      if (!matCode) return;
      const orderQty = safeNum(getProp(order, ['CANTPENDIENTE', 'CANTPROGRAMADA', 'CANTIDAD']));
      materialGroupsHalb.set(matCode, (materialGroupsHalb.get(matCode) || 0) + orderQty);
    });

    const allMaterials = Array.from(new Set([...materialGroupsProv.keys(), ...materialGroupsHalb.keys()]));
    setResumenProgress({ current: 0, total: allMaterials.length });
    const consolidatedMap = new Map<string, UnifiedNeedRow>();
    
    try {
      for (let i = 0; i < allMaterials.length; i++) {
        const matCode = allMaterials[i];
        const fullCode = matCode.padStart(18, '0');
        const qtyProv = materialGroupsProv.get(matCode) || 0;
        const qtyHalb = materialGroupsHalb.get(matCode) || 0;
        
        try {
          const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 500);
          const rawData = response?.data?.data || response?.data || [];
          if (Array.isArray(rawData)) {
            const laminaRows = rawData.filter(row => (row.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('LAMINA CILINDRICA'));
            
            laminaRows.forEach(comp => {
              const compCode = cleanCode(comp.COMPONENTE);
              const desc = String(comp.DESCRIPCION_COMPONENTE || '').toUpperCase();
              
              const blockComp = rawData.find(r => 
                cleanCode(r.MATERIAL_PADRE) === compCode && 
                (r.DESCRIPCION_COMPONENTE || '').toUpperCase().includes('BLOQUE FORMULADO')
              );
              
              const blockDesc = blockComp ? String(blockComp.DESCRIPCION_COMPONENTE).toUpperCase() : '';
              const dims = parseDimensionsEnhanced(desc);
              const blockDims = blockDesc ? parseDimensionsEnhanced(blockDesc) : null;
              const finalDens = blockDims && blockDims.densidad !== '—' ? blockDims.densidad : dims.densidad;
              const finalAperture = blockDesc ? extractAperture(blockDesc) : extractAperture(desc);
              const finalDistancia = blockDims && blockDims.distancia > 0 ? blockDims.distancia : dims.distancia;

              const cantAcum = safeNum(comp.CANTIDAD_ACUMULADA || comp.CANTIDAD_UNITARIA || 0);
              const kgProv = qtyProv * cantAcum;
              const kgHalb = qtyHalb * cantAcum;

              if (consolidatedMap.has(compCode)) {
                const existingRow = consolidatedMap.get(compCode)!;
                existingRow.consumoKg += kgProv;
                existingRow.consumoKgHalb += kgHalb;
                existingRow.totalConsumoKg = existingRow.consumoKg + existingRow.consumoKgHalb;
              } else {
                const pesoTeorico = (finalDistancia * dims.altura * dims.espesor * safeNum(finalDens)) / 10000;
                const looperMatch = kpiLooperData.find(k => cleanCode(k.Material) === compCode);
                const finalPeso = looperMatch ? safeNum(looperMatch.PesoUN) : pesoTeorico;

                const getStockKg = (alm: string) => {
                  return inventarioSAP
                    .filter(inv => cleanCode(inv.MATERIAL) === compCode && String(inv.ALMACEN).trim() === alm)
                    .reduce((sum, item) => sum + safeNum(item.LIBREUTILIZACION), 0);
                };

                const s1006 = getStockKg('1006');
                const s1008 = getStockKg('1008');
                const s1015 = getStockKg('1015');
                const tStockKg = s1006 + s1008 + s1015;
                const tStockUN = finalPeso > 0 ? tStockKg / finalPeso : 0;

                consolidatedMap.set(compCode, {
                  material: compCode,
                  descripcion: desc,
                  densidad: finalDens,
                  altura: dims.altura,
                  espesor: dims.espesor,
                  distancia: finalDistancia,
                  peso: finalPeso,
                  consumoKg: kgProv,
                  consumoUn: 0,
                  nroRollos: 0,
                  consumoKgHalb: kgHalb,
                  nroRollosHalb: 0,
                  totalConsumoKg: kgProv + kgHalb,
                  totalNroRollos: 0,
                  stock1006: s1006,
                  stock1008: s1008,
                  stock1015: s1015,
                  stockUN1006: finalPeso > 0 ? s1006 / finalPeso : 0,
                  stockUN1008: finalPeso > 0 ? s1008 / finalPeso : 0,
                  stockUN1015: finalPeso > 0 ? s1015 / finalPeso : 0,
                  totalStockKg: tStockKg,
                  totalStockUN: tStockUN,
                  looperPesoUN: looperMatch ? safeNum(looperMatch.PesoUN) : 0,
                  looperDensidad: looperMatch ? String(looperMatch.Densidad) : '—',
                  looperEspesor: looperMatch ? safeNum(looperMatch.Espesor) : 0,
                  looperTRolloMin: looperMatch ? safeNum(looperMatch.TiempoRolloMin) : 0,
                  apertura: finalAperture,
                  porcentajeNecesidad: 0,
                  planUn: 0,
                  planKg: 0,
                  tProceso: 0,
                  hasDeficit: false
                });
              }
            });
          }
        } catch (e) {
          console.warn(`Error material ${matCode}:`, (e as Error).message);
        }
        setResumenProgress({ current: i + 1, total: allMaterials.length });
      }

      const finalArray = Array.from(consolidatedMap.values()).map(row => {
        const cUn = row.peso > 0 ? row.consumoKg / row.peso : 0;
        const cUnHalb = row.peso > 0 ? row.consumoKgHalb / row.peso : 0;
        return {
          ...row,
          consumoUn: cUn,
          nroRollos: cUn,
          nroRollosHalb: cUnHalb,
          totalNroRollos: cUn + cUnHalb
        };
      });
      
      const groupMap = new Map<string, UnifiedNeedRow[]>();
      finalArray.forEach(row => {
        const k = `${row.apertura}|${row.densidad}`;
        if(!groupMap.has(k)) groupMap.set(k, []);
        groupMap.get(k)!.push(row);
      });
      
      groupMap.forEach(items => {
        const totalKgGroup = items.reduce((s, r) => s + r.totalConsumoKg, 0);
        const totalStockUnGroup = items.reduce((s, r) => s + r.totalStockUN, 0);
        const totalConsumoUnGroup = items.reduce((s, r) => s + r.totalNroRollos, 0);
        
        const groupDeficit = Math.max(0, totalConsumoUnGroup - totalStockUnGroup);
        const runsNeeded = Math.ceil(groupDeficit / 40);
        const totalUnitsInPlan = runsNeeded * 40;

        items.forEach(row => {
          row.porcentajeNecesidad = totalKgGroup > 0 ? (row.totalConsumoKg / totalKgGroup) : 0;
          row.hasDeficit = totalConsumoUnGroup > totalStockUnGroup;
          row.planUn = totalUnitsInPlan > 0 ? Math.ceil(totalUnitsInPlan * row.porcentajeNecesidad) : 0;
          row.planKg = row.planUn * row.peso;
          row.tProceso = ((row.looperTRolloMin || 0) * row.planUn) / 60;
        });
      });

      setUnifiedNeeds(finalArray.sort((a, b) => b.totalConsumoKg - a.totalConsumoKg));
      addNotification('success', 'Actualización técnica completada con éxito.');
    } finally { 
      setIsProcessingResumen(false); 
    }
  }, [filteredOrders, filteredFertOrders, kpiLooperData, inventarioSAP, addNotification, extractMaterialInfo]);

  const handlePlanUnChange = (material: string, newValue: string) => {
    const newPlanUn = Math.max(0, parseInt(newValue) || 0);
    setUnifiedNeeds(prev => {
      const updated = prev.map(row => {
        if (row.material === material) {
          const updatedPlanKg = newPlanUn * row.peso;
          const updatedTProceso = ((row.looperTRolloMin || 0) * newPlanUn) / 60;
          return {
            ...row,
            planUn: newPlanUn,
            planKg: updatedPlanKg,
            tProceso: updatedTProceso
          };
        }
        return row;
      });
      return updated;
    });
  };

  const groupedNeeds = useMemo(() => {
    const map = new Map<string, { 
      densidad: string; apertura: string; items: UnifiedNeedRow[]; totalKg: number; totalUn: number;
      total1006: number; total1008: number; total1015: number; totalPlanUn: number; totalPlanKg: number;
      totalUN1006: number; totalUN1008: number; totalUN1015: number; totalTProceso: number;
      totalRollos: number; totalKgHalb: number; totalRollosHalb: number; totalConsumoKg: number; totalNroRollos: number;
      totalStockKg: number; totalStockUN: number; hasGroupDeficit: boolean;
    }>();
    unifiedNeeds.forEach(item => {
      const key = `${item.apertura}|${item.densidad}`;
      if (!map.has(key)) {
        map.set(key, { 
          densidad: item.densidad, apertura: item.apertura, items: [], totalKg: 0, totalUn: 0,
          total1006: 0, total1008: 0, total1015: 0, totalPlanUn: 0, totalPlanKg: 0,
          totalUN1006: 0, totalUN1008: 0, totalUN1015: 0, totalTProceso: 0, totalRollos: 0,
          totalKgHalb: 0, totalRollosHalb: 0, totalConsumoKg: 0, totalNroRollos: 0,
          totalStockKg: 0, totalStockUN: 0, hasGroupDeficit: false
        });
      }
      const group = map.get(key)!;
      group.items.push(item);
      group.totalKg += item.consumoKg;
      group.totalKgHalb += item.consumoKgHalb;
      group.totalConsumoKg += item.totalConsumoKg;
      group.totalUn += item.consumoUn;
      group.totalRollos += item.nroRollos;
      group.totalRollosHalb += item.nroRollosHalb;
      group.totalNroRollos += item.totalNroRollos;
      group.total1006 += item.stock1006;
      group.total1008 += item.stock1008;
      group.total1015 += item.stock1015;
      group.totalUN1006 += item.stockUN1006;
      group.totalUN1008 += item.stockUN1008;
      group.totalUN1015 += item.stockUN1015;
      group.totalStockKg += item.totalStockKg;
      group.totalStockUN += item.totalStockUN;
      group.totalPlanUn += item.planUn;
      group.totalPlanKg += item.planKg;
      group.totalTProceso += item.tProceso;
      if (item.hasDeficit) group.hasGroupDeficit = true;
    });
    return Array.from(map.values()).sort((a, b) => b.totalConsumoKg - a.totalConsumoKg);
  }, [unifiedNeeds]);

  const totalsUnified = useMemo(() => {
    const base = unifiedNeeds.reduce((acc, row) => ({
      kg: acc.kg + row.consumoKg,
      kgHalb: acc.kgHalb + row.consumoKgHalb,
      totalKg: acc.totalKg + row.totalConsumoKg,
      un: acc.un + row.consumoUn,
      rollos: acc.rollos + row.nroRollos,
      rollosHalb: acc.rollosHalb + row.nroRollosHalb,
      totalRollos: acc.totalRollos + row.totalNroRollos,
      planUn: acc.planUn + row.planUn,
      planKg: acc.planKg + row.planKg,
      stock1006: acc.stock1006 + row.stock1006,
      stock1008: acc.stock1008 + row.stock1008,
      stock1015: acc.stock1015 + row.stock1015,
      stockUN1006: acc.stockUN1006 + row.stockUN1006,
      stockUN1008: acc.stockUN1008 + row.stockUN1008,
      stockUN1015: acc.stockUN1015 + row.stockUN1015,
      totalStockKg: acc.totalStockKg + row.totalStockKg,
      totalStockUN: acc.totalStockUN + row.totalStockUN,
      tProceso: acc.tProceso + row.tProceso
    }), { kg: 0, kgHalb: 0, totalKg: 0, un: 0, rollos: 0, rollosHalb: 0, totalRollos: 0, planUn: 0, planKg: 0, stock1006: 0, stock1008: 0, stock1015: 0, stockUN1006: 0, stockUN1008: 0, stockUN1015: 0, totalStockKg: 0, totalStockUN: 0, tProceso: 0 });

    // Cálculo dinámico de corridas excluyendo materiales CONV
    const looperRuns = groupedNeeds.reduce((acc, group) => {
      const nonConvUnits = group.items
        .filter(it => !it.descripcion.toUpperCase().includes('CONV'))
        .reduce((sum, it) => sum + it.planUn, 0);
      
      return acc + Math.ceil(nonConvUnits / 40);
    }, 0);

    return { ...base, looperRuns };
  }, [unifiedNeeds, groupedNeeds]);

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedGroups(next);
  };

  const toggleDate = (dateStr: string) => {
    const next = new Set(selectedDates);
    if (next.has(dateStr)) next.delete(dateStr);
    else next.add(dateStr);
    setSelectedDates(next);
  };

  const tDisponible = useMemo(() => {
    const diaH = diaShiftOptions.find(o => o.v === selectedDiaShift)?.h || 0;
    const nocheH = nocheShiftOptions.find(o => o.v === selectedNocheShift)?.h || 0;
    return (diaH + nocheH) * 0.87;
  }, [selectedDiaShift, selectedNocheShift]);

  const ocupacionPorc = useMemo(() => {
    if (tDisponible <= 0) return 0;
    return (totalsUnified.tProceso / tDisponible) * 100;
  }, [tDisponible, totalsUnified.tProceso]);

  const renderTopConsolidation = () => {
    return (
      <div className="bg-[#1e293b] border-2 border-slate-700 rounded-lg shadow-2xl overflow-hidden mb-8 font-sans">
        <table className="w-full border-collapse text-[11px] uppercase font-bold text-slate-300">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-700">
              <th className="px-4 py-3 text-center border-r border-slate-700 w-[15%]">Demanda Consolidada (Kg)</th>
              <th className="px-4 py-3 text-center border-r border-slate-700 w-[15%]">Demanda Consolidada (Un)</th>
              <th className="px-4 py-3 text-center border-r border-slate-700 w-[13%]">Rollos Requeridos (Plan Un)</th>
              <th className="px-4 py-3 text-center border-r border-slate-700 w-[13%]">Rollos Requeridos (Plan Kg)</th>
              <th className="px-4 py-3 text-center border-r border-slate-700 w-[13%] bg-cyan-900/40 text-cyan-200">NRO DE CORRIDAS LOOPER</th>
              <th className="px-4 py-3 text-center border-r border-slate-700 w-[13%]">TURNO</th>
              <th className="px-4 py-3 text-center w-[18%]">PERSONAL</th>
            </tr>
          </thead>
          <tbody className="divide-y border-slate-700">
            <tr>
              <td className="px-4 py-2 border-r border-slate-700">
                <div className="flex justify-between items-center text-[10px] mb-1">
                  <span className="text-slate-500">PROV:</span>
                  <span className="text-red-400">{totalsUnified.kg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] mb-1">
                  <span className="text-slate-500">HALB:</span>
                  <span className="text-blue-400">{totalsUnified.kgHalb.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-600 pt-1">
                  <span className="text-white">TOTAL:</span>
                  <span className="text-white">{totalsUnified.totalKg.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
              </td>
              <td className="px-4 py-2 border-r border-slate-700">
                <div className="flex justify-between items-center text-[10px] mb-1">
                  <span className="text-slate-500">PROV:</span>
                  <span className="text-red-400">{Math.round(totalsUnified.rollos).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] mb-1">
                  <span className="text-slate-500">HALB:</span>
                  <span className="text-blue-400">{Math.round(totalsUnified.rollosHalb).toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-600 pt-1">
                  <span className="text-white">TOTAL:</span>
                  <span className="text-white">{Math.round(totalsUnified.totalRollos).toLocaleString()}</span>
                </div>
              </td>
              <td className="px-4 py-4 border-r border-slate-700 text-center align-middle bg-black/10">
                <span className="text-4xl font-black text-white">{Math.round(totalsUnified.planUn).toLocaleString()}</span>
              </td>
              <td className="px-4 py-4 border-r border-slate-700 text-center align-middle bg-black/20">
                <span className="text-3xl font-black text-indigo-400">{Math.round(totalsUnified.planKg).toLocaleString()}</span>
              </td>
              <td className="px-4 py-4 border-r border-slate-700 text-center align-middle bg-cyan-500/10">
                <span className="text-4xl font-black text-cyan-400">{totalsUnified.looperRuns}</span>
              </td>
              <td rowSpan={2} className="px-4 py-3 border-r border-slate-700 text-center align-middle bg-slate-800/20">
                <div className="flex flex-col gap-6">
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-500 text-left">DIA</p>
                    <select 
                      value={selectedDiaShift} 
                      onChange={(e) => setSelectedDiaShift(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[11px] text-yellow-500 outline-none w-full"
                    >
                      {diaShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[9px] text-slate-500 text-left">NOCHE</p>
                    <select 
                      value={selectedNocheShift} 
                      onChange={(e) => setSelectedNocheShift(e.target.value)}
                      className="bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-[11px] text-yellow-500 outline-none w-full"
                    >
                      {nocheShiftOptions.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 border-b border-slate-700 bg-slate-800/40">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 text-left">
                    <p className="text-[9px] text-slate-500">OP1 DIA</p>
                    <select 
                      value={assignedPersonnel.dia.op1} 
                      onChange={(e) => setAssignedPersonnel(p => ({ ...p, dia: { ...p.dia, op1: e.target.value } }))}
                      className="w-full bg-transparent border-none outline-none text-yellow-500 font-black text-xs"
                    >
                      <option value="">— SIN ASIGNAR —</option>
                      {looperOperators.map((op, idx) => <option key={idx} value={op.NOMBRE}>{op.NOMBRE}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1 text-left">
                    <p className="text-[9px] text-slate-500">OP2 DIA AYUD</p>
                    <select 
                      value={assignedPersonnel.dia.op2} 
                      onChange={(e) => setAssignedPersonnel(p => ({ ...p, dia: { ...p.dia, op2: e.target.value } }))}
                      className="w-full bg-transparent border-none outline-none text-yellow-500 font-black text-xs"
                    >
                      <option value="">— SIN ASIGNAR —</option>
                      {looperOperators.map((op, idx) => <option key={idx} value={op.NOMBRE}>{op.NOMBRE}</option>)}
                    </select>
                  </div>
                </div>
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="px-4 py-3 border-r border-slate-700 bg-slate-900/40 text-center">
                 <p className="text-[9px] text-slate-500 uppercase tracking-widest mb-1">Ocupación (%)</p>
                 <div className="flex items-center justify-center gap-3">
                    <div className={cn("w-3 h-3 rounded-full", ocupacionPorc > 100 ? "bg-red-500 animate-pulse" : "bg-emerald-500")} />
                    <span className={cn("text-2xl font-black", ocupacionPorc > 100 ? "text-red-400" : "text-emerald-400")}>{ocupacionPorc.toFixed(1)}%</span>
                 </div>
              </td>
              <td className="px-4 py-3 border-r border-slate-700 bg-slate-800/20 text-center">
                <p className="text-[9px] text-slate-500 mb-1">TIEMPO OPERATIVO (H)</p>
                <span className="text-2xl font-black text-emerald-400">{totalsUnified.tProceso.toFixed(2)}</span>
              </td>
              <td colSpan={2} className="px-4 py-3 border-r border-slate-700 bg-slate-800/30 text-center">
                <p className="text-[9px] text-slate-500 mb-1">DISPONIBILIDAD TOTAL (H)</p>
                <span className="text-2xl font-black text-yellow-400">{tDisponible.toFixed(2)}</span>
              </td>
              <td className="px-4 py-3 bg-slate-800/40">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1 text-left">
                    <p className="text-[9px] text-slate-500">OP1 NOCHE</p>
                    <select 
                      value={assignedPersonnel.noche.op1} 
                      onChange={(e) => setAssignedPersonnel(p => ({ ...p, noche: { ...p.noche, op1: e.target.value } }))}
                      className="w-full bg-transparent border-none outline-none text-yellow-500 font-black text-xs"
                    >
                      <option value="">— SIN ASIGNAR —</option>
                      {looperOperators.map((op, idx) => <option key={idx} value={op.NOMBRE}>{op.NOMBRE}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1 text-left">
                    <p className="text-[9px] text-slate-500">OP2 NOCHE AYUD</p>
                    <select 
                      value={assignedPersonnel.noche.op2} 
                      onChange={(e) => setAssignedPersonnel(p => ({ ...p, noche: { ...p.noche, op2: e.target.value } }))}
                      className="w-full bg-transparent border-none outline-none text-yellow-500 font-black text-xs"
                    >
                      <option value="">— SIN ASIGNAR —</option>
                      {looperOperators.map((op, idx) => <option key={idx} value={op.NOMBRE}>{op.NOMBRE}</option>)}
                    </select>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    );
  };

  if (!mounted) return <div className="p-4 md:p-6 min-h-screen bg-white" />;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl shadow-inner"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Laminado</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Apertura Bloque SAP | Auditoría de Stock Multialmacén (Kg/UN)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
           <Button 
              onClick={handleProcessResumen} 
              disabled={isProcessingResumen}
              className="bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 px-6 text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95 flex items-center gap-2"
            >
              {isProcessingResumen ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              ACTUALIZAR DATOS
            </Button>

           <Popover>
            <PopoverContent className="w-[260px] p-0 border-none shadow-2xl rounded-2xl overflow-hidden mt-3" align="end">
              <div className="bg-white p-5 font-sans text-left">
                <div className="flex items-center justify-between mb-5">
                  <h3 className="text-xs font-black text-slate-800 capitalize">{viewDate ? format(viewDate, 'MMMM yyyy', { locale: es }) : '—'}</h3>
                  <div className="flex gap-1 bg-slate-50 p-1 rounded-xl">
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => subMonths(prev, 1))} className="h-8 w-8 hover:bg-white hover:shadow-sm"><ChevronLeft className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setViewDate(prev => addMonths(prev, 1))} className="h-8 w-8 hover:bg-white hover:shadow-sm"><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-y-1.5 text-center mb-4">
                  {['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'].map(d => <div key={d} className="text-[10px] font-black text-slate-300 py-1">{d}</div>)}
                  {calendarDaysList.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const dStr = format(day, 'yyyy-MM-dd');
                    const isSelected = selectedDates.has(dStr);
                    return (
                      <button key={dStr} onClick={() => toggleDate(dStr)} className={cn("relative h-8 w-8 mx-auto rounded-xl flex items-center justify-center transition-all", isSelected ? "bg-red-600 text-white shadow-md shadow-red-200" : "hover:bg-slate-50")}>
                        <span className={cn("text-xs font-black", !datesWithOrders.has(dStr) && !isSelected ? "text-slate-200" : "text-slate-700")}>{format(day, 'd')}</span>
                        {datesWithOrders.has(dStr) && !isSelected && <div className="absolute bottom-1.5 w-1 h-1 bg-red-400 rounded-full" />}
                      </button>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" className="w-full text-[10px] font-black uppercase text-red-600 h-9 mt-1 rounded-xl hover:bg-red-50 tracking-widest" onClick={() => setSelectedDates(new Set())}>Ver Todo el Plan</Button>
              </div>
            </PopoverContent>
            <PopoverTrigger asChild>
              <button className="h-10 px-5 rounded-2xl border border-gray-200 bg-white hover:border-red-500/50 flex items-center gap-3 font-black text-[11px] uppercase shadow-sm transition-all">
                <Filter className="w-4 h-4 text-red-500" /> 
                {selectedDates.size === 0 ? 'Plan Maestro' : `${selectedDates.size} días seleccionados`}
              </button>
            </PopoverTrigger>
          </Popover>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-5 h-11 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          {[ 
            { v: 'resumen', l: 'Resumen Necesidades', i: LayoutDashboard },
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'ordenesFert', l: 'Órdenes FERT', i: ShoppingCart },
            { v: 'tiempos', l: 'Procesos Looper', i: Clock },
            { v: 'inventario', l: 'Inventarios SAP', i: Database }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-red-600 rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="resumen" className="space-y-6 animate-in fade-in duration-300">
          {renderTopConsolidation()}

          <div className="border-2 border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white mt-8">
            <div className="overflow-x-auto max-h-[600px] relative text-left">
              <table className="w-full border-collapse font-sans text-[11px] text-center">
                <thead className="sticky top-0 z-20">
                  <tr className="bg-[#ffff00] text-black uppercase font-black tracking-tighter text-[10px] border-b-2 border-black/10">
                    <th className="px-4 py-4 border-r border-black/5 text-left w-32">Material</th>
                    <th className="px-6 py-4 border-r border-black/5 text-left min-w-[200px]">Descripción</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-indigo-50/50">Peso (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-indigo-50/50">Dens.</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-indigo-50/50 text-indigo-900">T. Rollo (Min)</th>
                    <th className="px-3 py-4 border-r border-black/5 bg-blue-50/50">Stock 1006 (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-cyan-50/50 text-cyan-800">UN 1006</th>
                    <th className="px-3 py-4 border-r border-black/5 bg-blue-50/50">Stock 1008 (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-cyan-50/50 text-cyan-800">UN 1008</th>
                    <th className="px-3 py-4 border-r border-black/5 bg-blue-50/50">Stock 1015 (Kg)</th>
                    <th className="px-2 py-4 border-r border-black/5 bg-cyan-50/50 text-cyan-800">UN 1015</th>
                    <th className="px-3 py-4 border-r border-black/10 bg-indigo-900 text-white">T. ROLLOS BODEGAS UN</th>
                    <th className="px-3 py-4 border-r border-black/10 bg-indigo-900 text-white">T. ROLLOS BODEGAS KG</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right bg-orange-100/10 uppercase">CONSUMO ROLLOS OF_PROV [Kg]</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right bg-indigo-100/10 uppercase">CONSUMO ROLLOS OF_HALB [Kg]</th>
                    <th className="px-4 py-4 border-r border-black/10 text-right bg-slate-900 text-white font-black uppercase">T. ROLLOS NECESIDADES [Kg]</th>
                    <th className="px-3 py-4 border-r border-black/5 bg-[#cfe2f3]/10 text-indigo-900 font-black uppercase">NRO ROLLOS NECESIDADES PROV [Un]</th>
                    <th className="px-3 py-4 border-r border-black/5 bg-[#d1d5db]/10 text-indigo-900 font-black uppercase">NRO ROLLOS NECESIDADES HALB [Un]</th>
                    <th className="px-3 py-4 border-r border-black/10 bg-[#1e293b] text-[#facc15] font-black uppercase">T. ROLLOS NECESIDADES [Un]</th>
                    <th className="px-3 py-4 border-r border-black/5 text-center">semaforo % Nec.</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right font-black bg-[#fee2e2] text-red-900">PLAN (UN)</th>
                    <th className="px-4 py-4 border-r border-black/5 text-right font-black bg-[#fee2e2] text-red-900">PLAN (KG)</th>
                    <th className="px-4 py-4 text-right font-black bg-indigo-900 text-white">T. PROCESO (H)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 font-bold">
                  {isProcessingResumen ? (
                    <tr>
                      <td colSpan={23} className="py-20 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-500 mb-3" />
                        <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Ejecutando Explosión Técnica BOM: {resumenProgress.current} / {resumenProgress.total}</p>
                      </td>
                    </tr>
                  ) : (
                    groupedNeeds.map((group) => {
                      const groupKey = `${group.apertura}|${group.densidad}`;
                      const isExp = expandedGroups.has(groupKey);
                      return (
                        <React.Fragment key={groupKey}>
                          <tr 
                            className={cn(
                              "hover:brightness-95 cursor-pointer transition-all border-l-4",
                              getDensityColor(group.densidad)
                            )}
                            onClick={() => toggleGroup(groupKey)}
                          >
                            <td className="px-4 py-4 flex items-center gap-2 text-left">
                               {isExp ? <Minus className="w-3 h-3 text-red-500" /> : <Plus className="w-3 h-3 text-indigo-500" />}
                               <span className="font-black text-[10px] uppercase tracking-widest opacity-70">Corrida {group.apertura} - D{group.densidad}</span>
                            </td>
                            <td className="px-6 py-4 text-left text-indigo-900 font-black uppercase">Subtotal Corrida</td>
                            <td colSpan={3} className="bg-indigo-50/10"></td>
                            <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1006).toLocaleString()}</td>
                            <td className="px-2 py-4 text-cyan-600/50 font-mono">{(group.totalUN1006).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1008).toLocaleString()}</td>
                            <td className="px-2 py-4 text-cyan-600/50 font-mono">{(group.totalUN1008).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-4 text-slate-400 font-mono">{(group.total1015).toLocaleString()}</td>
                            <td className="px-2 py-4 text-cyan-600/50 font-mono">{(group.totalUN1015).toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                            <td className="px-3 py-4 bg-indigo-800 text-white font-mono">{Math.round(group.totalStockUN).toLocaleString()}</td>
                            <td className="px-3 py-4 bg-indigo-800 text-white font-mono">{Math.round(group.totalStockKg).toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-indigo-900 bg-indigo-50/50 opacity-40">{group.totalKg.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-indigo-400 bg-indigo-50/50 opacity-40">{group.totalKgHalb.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-white bg-slate-800">{group.totalConsumoKg.toLocaleString()}</td>
                            <td className="px-3 py-4 bg-[#cfe2f3]/30 font-mono text-indigo-800 opacity-40">{Math.round(group.totalRollos).toLocaleString()}</td>
                            <td className="px-3 py-4 bg-[#d1d5db]/30 font-mono text-slate-600 opacity-40">{Math.round(group.totalRollosHalb).toLocaleString()}</td>
                            <td className="px-3 py-4 bg-[#1e293b] font-mono text-[#facc15]">{Math.round(group.totalNroRollos).toLocaleString()}</td>
                            <td className="px-4 py-4 text-center font-black">
                               <div className={cn("w-4 h-4 rounded-full mx-auto shadow-sm", group.hasGroupDeficit ? "bg-red-500 animate-pulse" : "bg-green-500")} />
                            </td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-[#fee2e2]/50">{group.totalPlanUn.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-red-900 bg-[#fee2e2]/50">{group.totalPlanKg.toLocaleString()}</td>
                            <td className="px-4 py-4 text-right font-mono font-black text-indigo-900 bg-indigo-100/50">{formatNum(group.totalTProceso, 1)}</td>
                          </tr>
                          {isExp && group.items.map((item, iIdx) => (
                            <tr key={`${groupKey}-${iIdx}`} className="bg-white hover:bg-blue-50/10 transition-colors">
                              <td className="px-4 py-3 border-r border-gray-100 font-mono text-indigo-600 text-left pl-8">{item.material}</td>
                              <td className="px-6 py-3 border-r border-gray-100 text-left text-gray-400 uppercase leading-tight italic text-[10px] truncate max-w-[250px]">{item.descripcion}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-indigo-900 bg-indigo-50/10">{item.peso.toFixed(2)}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-bold text-indigo-900 bg-indigo-50/10">{item.densidad}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono font-black text-indigo-900 bg-indigo-50/10">{item.looperTRolloMin || '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{item.stock1006 > 0 ? item.stock1006.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-cyan-600 bg-cyan-50/10">{item.stockUN1006 > 0 ? Math.round(item.stockUN1006).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{item.stock1008 > 0 ? item.stock1008.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-cyan-600 bg-cyan-50/10">{item.stockUN1008 > 0 ? Math.round(item.stockUN1008).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-slate-400">{item.stock1015 > 0 ? item.stock1015.toLocaleString() : '—'}</td>
                              <td className="px-2 py-3 border-r border-gray-100 font-mono text-cyan-600 bg-cyan-50/10">{item.stockUN1015 > 0 ? Math.round(item.stockUN1015).toLocaleString() : '—'}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-indigo-700 bg-indigo-50/20">{Math.round(item.totalStockUN).toLocaleString()}</td>
                              <td className="px-3 py-3 border-r border-gray-100 font-mono text-indigo-700 bg-indigo-50/20">{Math.round(item.totalStockKg).toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-bold text-orange-400/40">{item.consumoKg.toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-bold text-indigo-300/40">{item.consumoKgHalb.toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-right font-mono font-bold text-slate-400 bg-slate-50/10">{item.totalConsumoKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="px-3 py-3 border-r border-gray-100 bg-[#cfe2f3]/10 font-mono font-black text-indigo-600/40">{Math.round(item.consumoUn).toLocaleString()}</td>
                              <td className="px-3 py-3 border-r border-gray-100 bg-[#d1d5db]/10 font-mono font-black text-slate-400/40">{Math.round(item.nroRollosHalb).toLocaleString()}</td>
                              <td className="px-3 py-3 border-r border-gray-100 bg-slate-100/30 font-mono font-black text-slate-900">{Math.round(item.totalNroRollos).toLocaleString()}</td>
                              <td className="px-4 py-3 border-r border-gray-100 text-center font-black">
                                 <div className={cn("w-3 h-3 rounded-full mx-auto", item.hasDeficit ? "bg-red-400" : "bg-green-400")} />
                                 <span className="text-[8px] text-slate-300">{(item.porcentajeNecesidad * 100).toFixed(0)}%</span>
                              </td>
                              <td className="px-4 py-3 border-r border-black/10 text-right font-mono font-black text-red-500 bg-[#fee2e2]/20">
                                 <input 
                                   type="number" 
                                   value={item.planUn} 
                                   onChange={(e) => handlePlanUnChange(item.material, e.target.value)}
                                   className="w-16 bg-white border border-red-200 rounded text-center h-7 text-xs focus:ring-2 focus:ring-red-500 outline-none"
                                 />
                              </td>
                              <td className="px-4 py-3 border-r border-black/10 text-right font-mono font-black text-red-500 bg-[#fee2e2]/20">{item.planKg.toLocaleString(undefined, { maximumFractionDigits: 1 })}</td>
                              <td className="px-4 py-3 text-right font-mono font-black text-indigo-600 bg-indigo-50/30">{formatNum(item.tProceso, 1)}</td>
                            </tr>
                          ))}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ordenes" className="space-y-6 animate-in fade-in duration-300 text-left">
          <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border-collapse font-sans text-[11px] text-center">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5">Orden</th>
                    <th className="px-6 py-5 border-r border-white/5">Fecha Inicio</th>
                    <th className="px-6 py-5 border-r border-white/5">Código FERT</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Descripción del Producto</th>
                    <th className="px-6 py-5 border-r border-white/5">Cantidad</th>
                    <th className="px-6 py-5 border-r border-white/5">Responsable</th>
                    <th className="px-6 py-5 border-r border-white/5">Máquina</th>
                    <th className="px-6 py-5">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold">
                  {filteredOrders.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-slate-300 font-black uppercase tracking-widest italic text-center">No se detectaron órdenes para los criterios aplicados</td></tr>
                  ) : (
                    filteredOrders.map((o, i) => {
                      const info = extractMaterialInfo(o);
                      const description = getProp(o, ['NOMBRE', 'MATERIAL', 'Material']).replace(/^\d+\s*/, '') || '—';
                      return (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-800 border-r border-gray-50">{getProp(o, ['ORDENPREVISIONAL', 'ORDEN']) || '—'}</td>
                          <td className="px-6 py-4 border-r border-gray-50 font-mono text-[9px] text-slate-400 text-center">{getProp(o, ['FECHAINICIO', 'FECHA']) || '—'}</td>
                          <td className="px-6 py-4 font-mono font-black text-red-600 border-r border-gray-50 tracking-tighter text-sm text-center">{info.code}</td>
                          <td className="px-6 py-4 text-left border-r border-gray-100 text-slate-600 font-black uppercase leading-tight max-w-[450px]">
                            {description}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 font-mono text-sm text-center">
                            {Number(getProp(o, ['CANTPROGRAMADA', 'CANTIDAD', 'CANT_PROG']) || 0).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 border-r border-gray-50 text-center">
                            <Badge variant="outline" className="text-[10px] font-black bg-blue-50 text-blue-700 border-blue-100">{getProp(o, ['RESPCONTROLPROD', 'RESP_CONTROL_PROD', 'RespControlProd']) || '—'}</Badge>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-400 border-r border-gray-50 text-[10px] uppercase text-center">
                            {getProp(o, ['MAQUINA', 'RECURSO', 'ID_MAQUINA']) || '—'}
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-200 text-[10px] text-center">{getProp(o, ['Almacen', 'ALMACEN']) || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="ordenesFert" className="space-y-6 animate-in fade-in duration-300 text-left">
          <div className="border border-gray-100 rounded-3xl shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 border-collapse font-sans text-[11px] text-center">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[9px] sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5">Orden</th>
                    <th className="px-6 py-5 border-r border-white/5">Fecha</th>
                    <th className="px-6 py-5 border-r border-white/5">Código FERT</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Descripción del Producto</th>
                    <th className="px-6 py-5 border-r border-white/5">Cant. Pendiente</th>
                    <th className="px-6 py-5 border-r border-white/5">Responsable</th>
                    <th className="px-6 py-5 border-r border-white/5">Máquina</th>
                    <th className="px-6 py-5">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 font-bold">
                  {filteredFertOrders.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-slate-300 font-black uppercase tracking-widest italic text-center">No se detectaron órdenes FERT para los criterios aplicados</td></tr>
                  ) : (
                    filteredFertOrders.map((o, i) => {
                      const info = extractMaterialInfo(o);
                      const description = getProp(o, ['NOMBRE', 'MATERIAL', 'Material']).replace(/^\d+\s*/, '') || '—';
                      const orderNum = getProp(o, ['ORDEN', 'ORDEN_PROCESO', 'ORDEN_FERT']) || '—';
                      const date = getProp(o, ['FECHA', 'FECHAINICIO', 'FECHA_INICIO']);
                      const qty = Number(getProp(o, ['CANTPENDIENTE', 'CANT_PEND', 'CANTIDAD', 'CANT_PROG']) || 0);
                      const resp = getProp(o, ['RESP_CONTROL_PROD', 'RESPCONTROLPROD', 'RESPONSABLE']);
                      const mach = getProp(o, ['MAQUINA', 'RECURSO', 'ID_MAQUINA']);
                      const alm = getProp(o, ['Almacen', 'ALMACEN']);
                      
                      return (
                        <tr key={i} className="hover:bg-indigo-50/20 transition-colors">
                          <td className="px-6 py-4 font-black text-slate-800 border-r border-gray-50 text-center">{orderNum}</td>
                          <td className="px-6 py-4 border-r border-gray-50 font-mono text-[9px] text-slate-400 text-center">{date}</td>
                          <td className="px-6 py-4 font-mono font-black text-red-600 border-r border-gray-50 tracking-tighter text-sm text-center">{info.code}</td>
                          <td className="px-6 py-4 text-left border-r border-white/10 text-slate-600 font-black uppercase leading-tight max-w-[450px]">
                            {description}
                          </td>
                          <td className="px-6 py-4 font-black text-slate-900 border-r border-gray-50 font-mono text-sm text-center">
                            {qty.toLocaleString()}
                          </td>
                          <td className="px-6 py-4 border-r border-gray-50 text-center">
                            <Badge variant="outline" className="text-[10px] font-black bg-indigo-50 text-indigo-700 border-indigo-100">{resp || '—'}</Badge>
                          </td>
                          <td className="px-6 py-4 font-bold text-slate-400 border-r border-gray-50 text-[10px] uppercase text-center">{mach || '—'}</td>
                          <td className="px-6 py-4 font-bold text-slate-200 text-[10px] text-center">{alm || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tiempos" className="animate-in fade-in duration-300 space-y-4 text-left">
          <div className="flex items-center gap-3 px-2 text-left">
            <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-lg"><Activity className="w-4 h-4" /></div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Indicadores Maestro Looper (KPI SAP)</h3>
          </div>
          <Card className="rounded-3xl border border-indigo-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative text-center">
              <table className="w-full border-collapse text-center">
                <thead className="bg-[#1e293b] text-white sticky top-0 z-10 text-[9px] font-black uppercase tracking-tight border-b border-white/5">
                  <tr>
                    <th className="px-6 py-5 border-r border-white/5 text-left">Material</th>
                    <th className="px-6 py-5 border-r border-white/5 text-left">Descripción</th>
                    <th className="px-6 py-5 border-r border-white/5">Peso UN (Kg)</th>
                    <th className="px-6 py-5 border-r border-white/5">Densidad</th>
                    <th className="px-6 py-5 border-r border-white/5">Espesor</th>
                    <th className="px-6 py-5 border-r border-white/5 text-teal-400">T. Rollo (Min)</th>
                    <th className="px-6 py-5">T. Rollo (H)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px] font-black">
                  {kpiLooperData.length === 0 ? (
                    <tr><td colSpan={7} className="py-24 text-slate-200 font-black uppercase tracking-widest text-center italic">Consultando indicadores KPI de SAP...</td></tr>
                  ) : (
                    kpiLooperData.map((row, i) => (
                      <tr key={i} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="px-6 py-4 border-r border-dashed border-gray-100 text-left font-mono text-indigo-600">{String(row.Material || '—')}</td>
                        <td className="px-6 py-4 border-r border-dashed border-gray-100 text-left uppercase text-slate-600">{String(row.Descripcion || '—')}</td>
                        <td className="px-6 py-4 border-r border-dashed border-gray-100 font-mono text-indigo-400 text-center">{safeNum(row.PesoUN).toFixed(2)}</td>
                        <td className="px-6 py-4 border-r border-dashed border-gray-100 text-indigo-900 text-center">{String(row.Densidad || '—')}</td>
                        <td className="px-6 py-4 border-r border-dashed border-gray-100 font-mono text-center">{safeNum(row.Espesor).toFixed(2)}</td>
                        <td className="px-6 py-4 border-r border-dashed border-gray-100 font-mono text-teal-600 text-center">{safeNum(row.TiempoRolloMin).toFixed(2)}</td>
                        <td className="px-6 py-4 font-mono text-slate-400 text-center">{safeNum(row.TiempoRolloHora).toFixed(3)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="inventario" className="animate-in fade-in duration-300 space-y-4 text-left">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3 text-left">
              <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg"><Database className="w-4 h-4" /></div>
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Inventario SAP Año Actual (Auditado)</h3>
            </div>
          </div>
          <Card className="rounded-3xl border border-blue-100 shadow-xl overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px] relative text-center">
              <table className="w-full border-collapse text-center font-sans text-[10px]">
                <thead className="bg-[#1e293b] text-white border-b border-gray-100 uppercase font-black tracking-widest text-[8px] sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-5 border-r border-white/5">Material</th>
                    <th className="px-6 py-5 border-r border-white/10 text-left">Nombre</th>
                    <th className="px-3 py-5 border-r border-white/5">Centro</th>
                    <th className="px-3 py-5 border-r border-white/5 text-indigo-300">ALM.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-green-500/30 text-green-300">Libre Utiliz.</th>
                    <th className="px-3 py-5 border-r border-white/5 bg-blue-500/30 text-blue-200">En Traslado</th>
                    <th className="px-3 py-5 border-r border-white/5">Insp. Calidad</th>
                    <th className="px-3 py-5 border-r border-white/5 text-red-300">Bloqueado</th>
                    <th className="px-3 py-5 border-r border-white/5">Punto Pedido</th>
                    <th className="px-3 py-5">Tipo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[11px] font-black">
                  {inventarioSAP.filter(row => String(row.NOMBRE || row.DESCRIPCION || '').toUpperCase().includes('LAMINA CILINDRICA')).length === 0 ? (
                    <tr><td colSpan={10} className="py-24 text-slate-200 font-black uppercase tracking-widest italic text-center">No hay inventario registrado en los almacenes configurados</td></tr>
                  ) : (
                    inventarioSAP.filter(row => String(row.NOMBRE || row.DESCRIPCION || '').toUpperCase().includes('LAMINA CILINDRICA')).map((row, i) => (
                      <tr key={i} className="hover:bg-blue-50/10 transition-colors">
                        <td className="px-4 py-3 border-r border-dashed border-gray-100 font-mono text-blue-600 text-center">{cleanCode(row.MATERIAL)}</td>
                        <td className="px-6 py-3 border-r border-dashed border-gray-100 text-left uppercase text-slate-500 truncate max-w-[200px]" title={row.NOMBRE}>{row.NOMBRE || '—'}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 text-center">{row.CENTRO}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 text-indigo-700 font-black bg-indigo-50/30 text-center">{row.ALMACEN}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-green-700 bg-green-50/30 text-center">{Number(row.LIBREUTILIZACION || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-blue-700 bg-blue-50/30 text-center">{Number(row.ENTRASLADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-center">{Number(row.INSPECCCALIDAD || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-red-600 text-center">{Number(row.BLOQUEADO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 border-r border-dashed border-gray-100 font-mono text-indigo-400 text-center">{Number(row.PUNTOPEDIDO || 0).toLocaleString()}</td>
                        <td className="px-3 py-3 text-[10px] text-slate-400 text-center">{row.TIPO_MATERIAL}</td>
                      </tr>
                    ))
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
