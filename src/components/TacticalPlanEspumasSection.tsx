'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Scissors, 
  Package, 
  Loader2, 
  Clock, 
  LayoutDashboard, 
  ShoppingCart, 
  RefreshCw, 
  Wrench,
  Minus,
  Plus,
  MapPin,
  TrendingUp,
  Box,
  Wind,
  Info
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { serviciosService } from '@/services/servicios.service';
import { restriccionService } from '@/services/restriccion.service';
import { grupoService } from '@/services/grupo.service';
import { logger } from '@/services/LogService';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';

// --- CONSTANTES TÉCNICAS CARRUSEL (INGENIERÍA) ---
const CAROUSEL_RADIO_CM = 320; 
const CAROUSEL_CIRCUMFERENCE = 2 * Math.PI * CAROUSEL_RADIO_CM; // ~2010.6 cm
const UIO_ALMACEN_PROV = '1006';
const GYE_ALMACEN_PROV = '2006';

// --- FUNCIONES UTILITARIAS GLOBALES ---
const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const formatNum = (val: any, decimals: number = 0): string => {
  const n = safeNum(val);
  return n.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
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

const parseDimensions = (desc: string) => {
  const d = String(desc || '').toUpperCase();
  const densMatch = d.match(/D(\d+)/);
  const dens = densMatch ? densMatch[1] : '—';
  const dimMatch = d.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)(?:\s*[xX*]\s*(\d+(?:\.\d+)?))?/);
  const ancho = dimMatch ? parseFloat(dimMatch[1]) : 0;
  const largo = dimMatch ? parseFloat(dimMatch[2]) : 0;
  const esp = dimMatch && dimMatch[3] ? parseFloat(dimMatch[3]) : 0;
  return { dens, ancho, largo, esp };
};

interface UnifiedRow {
  fecha: string;
  orden: string;
  material: string;
  descripcion: string;
  ancho: number;
  largo: number;
  esp: number;
  dens: string;
  cant: number;
  peso: number;
  alturaTotal: number; 
  tIndiv: number;
  tTotal: number;
  subBloques: number; 
  capacidadCarga: number;
  nroCargas: number;
  participacion: number;
}

export const TacticalPlanEspumasSection: React.FC = () => {
  const inspector = useRuntimeInspector('TacticalPlanEspumas');
  const { addNotification } = useAppContext();

  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resumen');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [restricciones, setRestricciones] = useState<Restriccion[]>([]);
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<any[]>([]);
  const [ordenesProceso, setOrdenesProceso] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [tiemposCatalogo, setTiemposCatalogo] = useState<any[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => { 
    setMounted(true); 
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const groupsRes = await grupoService.getAll();
      const filteredGroups = (groupsRes.data || []).filter(g => 
        (g.nombre_grupo || '').toLowerCase().includes('corte') || (g.nombre_grupo || '').toLowerCase().includes('espuma')
      );
      setGrupos(filteredGroups);
      const ids = filteredGroups.map(g => g.codigo_grupo);

      const [restrs, provs, procs, maint, times] = await Promise.all([
        restriccionService.getAll(),
        serviciosService.OrdenesProvisionalesPaginados(1, 20000).catch(() => ({ data: [] })),
        serviciosService.getOrdenesFert(1, 20000).catch(() => ({ data: [] })),
        serviciosService.ListarMantenimientoPreventivosProgramados().catch(() => ({ data: [] })),
        serviciosService.getTiemposEnsamblado(1, 20000).catch(() => ({ data: [] }))
      ]);

      setRestricciones((restrs.data || []).filter((r: any) => ids.includes(r.codigo_grupo)));
      setOrdenesProvisionales(provs.data?.data || provs.data || []);
      setOrdenesProceso(procs.data?.data || procs.data || []);
      setMantenimientos(maint.data || []);
      setTiemposCatalogo(times.data?.data || times.data || []);
      
    } catch (e) {
      logger.error('[Corte Espuma] Error de sincronización', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) fetchData();
  }, [mounted, fetchData]);

  const provUIO = useMemo(() => ordenesProvisionales.filter(o => getProp(o, ['Centro', 'CENTRO']) === '1000' && getProp(o, ['Almacen', 'ALMACEN']) === UIO_ALMACEN_PROV), [ordenesProvisionales]);
  const provGYE = useMemo(() => ordenesProvisionales.filter(o => getProp(o, ['Centro', 'CENTRO']) === '2000' && getProp(o, ['Almacen', 'ALMACEN']) === GYE_ALMACEN_PROV), [ordenesProvisionales]);
  
  const procesoUIO = useMemo(() => ordenesProceso.filter(o => String(getProp(o, ['Centro', 'CENTRO'])).trim() === '1000'), [ordenesProceso]);
  const procesoGYE = useMemo(() => ordenesProceso.filter(o => String(getProp(o, ['Centro', 'CENTRO'])).trim() === '2000'), [ordenesProceso]);

  const auditHierarchy = useMemo(() => {
    const all = [...provUIO, ...provGYE];
    const hierarchy = new Map<string, Map<string, UnifiedRow[]>>();

    all.forEach(o => {
      const centroRaw = String(getProp(o, ['Centro', 'CENTRO'])).trim();
      const centro = centroRaw === '1000' ? 'QUITO (UIO)' : 'GUAYAQUIL (GYE)';
      const cat = String(getProp(o, ['CATEGORIA', 'Categoria']) || 'SIN CATEGORÍA').toUpperCase();

      if (!hierarchy.has(centro)) hierarchy.set(centro, new Map());
      const centerMap = hierarchy.get(centro)!;
      if (!centerMap.has(cat)) centerMap.set(cat, []);

      const desc = getProp(o, ['NOMBRE', 'Material', 'DESCRIPCION']) || '—';
      const dims = parseDimensions(desc);
      const qty = safeNum(getProp(o, ['CANTIDAD', 'CANTPROGRAMADA']));
      const densVal = safeNum(dims.dens);
      
      const matCode = cleanCode(getProp(o, ['MATERIAL', 'CodMaterial']));
      const tMatch = tiemposCatalogo.find(t => cleanCode(t.CodMaterial) === matCode && String(t.Centro).trim() === centroRaw);
      const tIndiv = tMatch ? safeNum(tMatch.Tiempo || tMatch.Tiempo_Min) : 0;

      // Ingeniería Solicitada: Altura Total y Sub-bloque
      const alturaTotal = dims.esp * qty;
      const alturaBloquePatron = densVal < 28 ? 103 : 85;
      const subBloquesCalculado = alturaBloquePatron > 0 ? (alturaTotal / alturaBloquePatron) : 0;

      // Cálculo de Cargas Carrusel (Radio 3.2m -> Circ 2010.6cm)
      const gapSeguridad = 5;
      const capacidadCargaPorGiro = (dims.ancho > 0) ? Math.floor(CAROUSEL_CIRCUMFERENCE / (dims.ancho + gapSeguridad)) : 0;
      const nroCargasCalculado = capacidadCargaPorGiro > 0 ? Math.ceil(subBloquesCalculado / capacidadCargaPorGiro) : 0;

      centerMap.get(cat)!.push({
        fecha: getProp(o, ['FECHAINICIO', 'FECHA']),
        orden: getProp(o, ['ORDENPREVISIONAL', 'ORDEN']) || '—',
        material: matCode,
        descripcion: desc,
        ancho: dims.ancho,
        largo: dims.largo,
        esp: dims.esp,
        dens: dims.dens,
        cant: qty,
        peso: (dims.ancho * dims.largo * dims.esp * densVal) / 10000,
        alturaTotal: alturaTotal,
        tIndiv: tIndiv,
        tTotal: (tIndiv * qty) / 60,
        subBloques: subBloquesCalculado,
        capacidadCarga: capacidadCargaPorGiro,
        nroCargas: nroCargasCalculado,
        participacion: 0
      });
    });

    hierarchy.forEach(center => {
      center.forEach(items => {
        const totalKg = items.reduce((s, r) => s + r.peso, 0);
        items.forEach(r => r.participacion = totalKg > 0 ? (r.peso / totalKg) : 0);
      });
    });

    return Array.from(hierarchy.entries()).sort();
  }, [provUIO, provGYE, tiemposCatalogo]);

  const toggleGroup = (key: string) => {
    const next = new Set(expandedGroups);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedGroups(next);
  };

  const renderDataTable = (data: any[], title: string) => (
    <div className="space-y-3 text-left">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
           <div className="w-2.5 h-2.5 rounded-full bg-slate-500" /> {title}
        </h3>
        <Badge variant="outline" className="text-[9px] font-bold border-slate-200 text-slate-400">{data.length} Registros</Badge>
      </div>
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-[10px] text-center border-collapse">
          <thead className="bg-[#1e293b] text-white uppercase font-black tracking-widest text-[9px] border-b border-slate-200 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-4 text-left border-r border-white/5">Orden</th>
              <th className="px-4 py-4 text-left border-r border-white/5">Fecha</th>
              <th className="px-4 py-4 text-left border-r border-white/5">Material</th>
              <th className="px-6 py-4 text-left border-r border-white/5">Descripción</th>
              <th className="px-3 py-4 border-r border-white/5">Cant.</th>
              <th className="px-3 py-4 border-r border-white/5">Resp.</th>
              <th className="px-3 py-4 border-r border-white/5">Centro</th>
              <th className="px-3 py-4 border-r border-white/5">Alm.</th>
              <th className="px-4 py-4">Máquina</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
            {data.length === 0 ? (
              <tr><td colSpan={9} className="py-20 text-slate-200 uppercase tracking-widest italic font-black opacity-30">Sin registros detectados</td></tr>
            ) : (
              data.map((o, idx) => {
                const matCode = cleanCode(getProp(o, ['MATERIAL', 'CodMaterial', 'COD_MATERIAL']));
                const description = getProp(o, ['NOMBRE', 'Material', 'DESCRIPCION', 'DESC_MATERIAL']) || '—';
                const resp = getProp(o, ['RESPCONTROLPROD', 'RespControlProd', 'RESP_CONTROL_PROD', 'RESPONSABLE']);
                return (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-left font-mono font-black text-slate-900 border-r border-slate-50">{getProp(o, ['ORDENPREVISIONAL', 'ORDEN', 'ORDEN_PROCESO']) || '—'}</td>
                    <td className="px-4 py-3 text-left font-mono text-[9px] text-slate-400 border-r border-slate-50">{getProp(o, ['FECHAINICIO', 'FECHA', 'FECHA_INICIO'])}</td>
                    <td className="px-4 py-3 text-left font-mono font-black text-slate-900 border-r border-slate-50">{matCode}</td>
                    <td className="px-6 py-3 text-left uppercase truncate max-w-[350px] border-r border-slate-50 leading-tight">{description}</td>
                    <td className="px-3 py-3 font-mono font-black text-slate-900 bg-slate-50/30 border-r border-slate-50 text-sm">{formatNum(getProp(o, ['CANTIDAD', 'CANTPROGRAMADA', 'CANT_PROG']), 0)}</td>
                    <td className="px-3 py-3 border-r border-slate-50">
                       <Badge variant="outline" className="text-[9px] font-black bg-blue-50 text-blue-700 border-blue-100">{resp || '—'}</Badge>
                    </td>
                    <td className="px-3 py-3 font-bold text-slate-400 border-r border-slate-50">{getProp(o, ['CENTRO', 'Centro'])}</td>
                    <td className="px-3 py-3 font-bold text-slate-400 border-r border-slate-50">{getProp(o, ['ALMACEN', 'Almacen'])}</td>
                    <td className="px-4 py-3 font-black text-slate-500 uppercase text-[9px]">{getProp(o, ['MAQUINA', 'RECURSO', 'ID_MAQUINA'])}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderAuditHierarchy = () => (
    <div className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#0f172a] p-6 rounded-[2rem] border border-white/5 shadow-2xl text-white">
        <div className="md:col-span-1 border-r border-white/10 pr-4 text-left">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Planta Consolidada</p>
          <h3 className="text-xl font-black uppercase text-indigo-400 mt-1 tracking-tighter">Resumen Global</h3>
        </div>
        <div className="flex flex-col gap-1 text-center">
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">T. Unidades</p>
          <p className="text-xl font-black font-mono text-slate-100">{auditHierarchy.reduce((acc, [_, cats]) => acc + Array.from(cats.values()).reduce((s, items) => s + items.reduce((ss, r) => ss + r.cant, 0), 0), 0).toLocaleString()}</p>
        </div>
        <div className="flex flex-col gap-1 text-center">
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">T. Cargas (Giros)</p>
          <p className="text-xl font-black font-mono text-emerald-400">{Math.ceil(auditHierarchy.reduce((acc, [_, cats]) => acc + Array.from(cats.values()).reduce((s, items) => s + items.reduce((ss, r) => ss + r.nroCargas, 0), 0), 0)).toLocaleString()}</p>
        </div>
        <div className="flex flex-col gap-1 text-center">
          <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest">T. Peso (Kg)</p>
          <p className="text-xl font-black font-mono text-indigo-400">{auditHierarchy.reduce((acc, [_, cats]) => acc + Array.from(cats.values()).reduce((s, items) => s + items.reduce((ss, r) => ss + r.peso, 0), 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
        </div>
      </div>

      {auditHierarchy.map(([centro, categories]) => (
        <div key={centro} className="space-y-8">
          <div className="flex items-center gap-3 border-b-2 border-slate-100 pb-2 text-left">
            <MapPin className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-black text-slate-800 uppercase tracking-tighter">{centro}</h3>
          </div>

          <div className="space-y-4">
            {Array.from(categories.entries()).map(([cat, items]) => {
              const key = `${centro}-${cat}`;
              const isExp = expandedGroups.has(key);
              const tCant = items.reduce((s, r) => s + r.cant, 0);
              const tH = items.reduce((s, r) => s + r.tTotal, 0);
              const tCargas = items.reduce((s, r) => s + r.nroCargas, 0);
              const tSub = items.reduce((s, r) => s + r.subBloques, 0);

              return (
                <div key={key} className="border border-slate-200 rounded-2xl overflow-hidden shadow-md bg-white">
                  <div className="flex items-center justify-between bg-[#0f172a] text-white px-6 py-3" onClick={() => toggleGroup(key)}>
                    <div className="flex items-center gap-4 flex-1 text-left cursor-pointer">
                      <button className="hover:scale-110 transition-transform">
                        {isExp ? <Minus className="w-4 h-4 text-slate-400" /> : <Plus className="w-4 h-4 text-emerald-500" />}
                      </button>
                      <span className="text-[11px] font-black uppercase tracking-widest">{cat}</span>
                    </div>
                    
                    <div className="flex gap-4 items-center font-mono">
                      <div className="flex flex-col items-center border-l border-white/10 pl-4">
                        <span className="text-[7px] font-bold opacity-40 uppercase">Cant.</span>
                        <span className="text-xs font-black">{tCant.toLocaleString()}</span>
                      </div>
                      <div className="flex flex-col items-center border-l border-white/10 pl-4">
                        <span className="text-[7px] font-bold opacity-40 uppercase">Horas (H)</span>
                        <span className="text-xs font-black">{tH.toFixed(2)}</span>
                      </div>
                      <div className="flex flex-col items-center border-l border-white/10 pl-4">
                        <span className="text-[7px] font-bold opacity-40 uppercase">Cargas</span>
                        <span className="text-xs font-black">{Math.ceil(tCargas)}</span>
                      </div>
                      <div className="flex flex-col items-center border-l border-white/10 pl-4 pr-2">
                        <span className="text-[7px] font-bold opacity-40 uppercase">Sub_B.</span>
                        <span className="text-xs font-black">{Math.ceil(tSub)}</span>
                      </div>
                    </div>
                  </div>

                  {isExp && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-[10px] text-center border-collapse">
                        <thead className="bg-[#1e293b] text-white uppercase font-black tracking-tighter text-[9px]">
                          <tr>
                            <th className="px-4 py-3 text-left border-r border-white/5">fecha</th>
                            <th className="px-4 py-3 text-left border-r border-white/5">Orden</th>
                            <th className="px-6 py-3 text-left border-r border-white/10">Material / Descripción</th>
                            <th className="px-2 py-3 border-r border-white/5">Ancho</th>
                            <th className="px-2 py-3 border-r border-white/5">Largo</th>
                            <th className="px-2 py-3 border-r border-white/5">Esp.</th>
                            <th className="px-2 py-3 border-r border-white/5">Dens.</th>
                            <th className="px-3 py-3 border-r border-white/5">Cant.</th>
                            <th className="px-3 py-3 border-r border-white/5">Peso (Kg)</th>
                            <th className="px-3 py-3 border-r border-white/5 bg-slate-700 text-white">Altura Total</th>
                            <th className="px-3 py-3 border-r border-white/5">T. Indiv (m)</th>
                            <th className="px-4 py-3 border-r border-white/10 bg-indigo-500/30">T. Total (H)</th>
                            <th className="px-3 py-3 border-r border-white/5"># Cargas</th>
                            <th className="px-4 py-3 border-r border-white/5 bg-slate-100 text-slate-900"># SUB_Bloque</th>
                            <th className="px-4 py-3">% participacion</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-bold text-slate-600 font-mono">
                          {items.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-4 py-2 border-r border-slate-50 text-[9px] text-slate-400 text-left">{row.fecha}</td>
                              <td className="px-4 py-2 border-r border-slate-50 text-indigo-600 text-left">{row.orden}</td>
                              <td className="px-6 py-2 border-r border-slate-100 text-left truncate max-w-[220px]">
                                <span className="text-slate-900 block font-black text-[11px]">{row.material}</span>
                                <span className="text-slate-400 text-[8px] uppercase italic truncate block">{row.descripcion}</span>
                              </td>
                              <td className="px-2 py-2 border-r border-slate-50">{row.ancho.toFixed(1)}</td>
                              <td className="px-2 py-2 border-r border-slate-50">{row.largo.toFixed(1)}</td>
                              <td className="px-2 py-2 border-r border-slate-50 text-indigo-600">{row.esp.toFixed(1)}</td>
                              <td className="px-2 py-2 border-r border-slate-50 text-slate-900">{row.dens}</td>
                              <td className="px-3 py-2 border-r border-slate-50 text-slate-900">{row.cant}</td>
                              <td className="px-3 py-2 border-r border-slate-50 text-slate-400">{row.peso.toFixed(2)}</td>
                              <td className="px-3 py-2 border-r border-slate-50 text-slate-900 bg-slate-50">{row.alturaTotal.toFixed(1)}</td>
                              <td className="px-3 py-2 border-r border-slate-50 text-indigo-400">{row.tIndiv.toFixed(2)}</td>
                              <td className="px-4 py-2 border-r border-slate-100 text-indigo-700 bg-indigo-50/30">{row.tTotal.toFixed(2)}</td>
                              <td className="px-3 py-2 border-r border-slate-50 text-slate-900">{Math.ceil(row.nroCargas)}</td>
                              <td className="px-4 py-2 border-r border-slate-100 text-slate-900 bg-slate-50">{row.subBloques.toFixed(2)}</td>
                              <td className="px-4 py-2 text-slate-400">{(row.participacion * 100).toFixed(1)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-20 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-slate-300" />
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest animate-pulse">Sincronizando SAP...</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'resumen': return renderAuditHierarchy();
      case 'provisionales': return (
        <div className="space-y-12">
          {renderDataTable(provUIO, `CORTE ESPUMA UIO (Almacén ${UIO_ALMACEN_PROV})`)}
          {renderDataTable(provGYE, `CORTE ESPUMA GYE (Almacén ${GYE_ALMACEN_PROV})`)}
        </div>
      );
      case 'proceso': return (
        <div className="space-y-12">
          {renderDataTable(procesoUIO, 'ORDENES PROCESO QUITO (UIO)')}
          {renderDataTable(procesoGYE, 'ORDENES PROCESO GUAYAQUIL (GYE)')}
        </div>
      );
      case 'mmto': return (
        <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm">
          <table className="w-full text-[11px] text-center border-collapse">
            <thead className="bg-slate-50 text-slate-400 font-black uppercase border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 text-left border-r border-slate-100">Centro</th>
                <th className="px-6 py-4 text-left border-r border-slate-100">Máquina</th>
                <th className="px-6 py-4 text-left border-r border-slate-100">Inicio</th>
                <th className="px-6 py-4 text-left border-r border-slate-100">Fin</th>
                <th className="px-6 py-4">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-bold text-slate-600">
              {mantenimientos.length === 0 ? (
                <tr><td colSpan={5} className="py-20 text-slate-200 uppercase tracking-widest italic font-bold">Sin mantenimientos vigentes</td></tr>
              ) : (
                mantenimientos.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-slate-400 text-left border-r border-slate-50">{m.PLANTA || '—'}</td>
                    <td className="px-6 py-3 text-slate-900 font-black text-left uppercase border-r border-slate-50">{m.ID_MAQUINA || '—'}</td>
                    <td className="px-6 py-3 text-left font-mono border-r border-slate-50">{m.FECHA_OT_PRG_INI || '—'}</td>
                    <td className="px-6 py-3 text-left font-mono border-r border-slate-50">{m.FECHA_OT_PRG_FIN || '—'}</td>
                    <td className="px-6 py-3 text-[9px] uppercase">{m.ESTADO || 'ACTIVO'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      );
      default: return null;
    }
  };

  if (!mounted) {
    return <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 font-sans text-left" />;
  }

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg"><Wind className="w-6 h-6" /></div>
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Auditores Técnicos SAP | Auditoría Integral de Planta</p>
          </div>
        </div>
        <Button onClick={fetchData} variant="ghost" size="icon" disabled={isLoading} className="rounded-full hover:bg-slate-100 text-slate-400">
           <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-11 bg-slate-50/80 p-1.5 rounded-2xl border border-slate-100 mb-8">
          {[ 
            { v: 'resumen', l: 'SALIDA DE DATOS', i: LayoutDashboard },
            { v: 'provisionales', l: 'PROVISIONALES', i: Package },
            { v: 'proceso', l: 'ORDENES PROCESO', i: ShoppingCart },
            { v: 'mmto', l: 'MMTO', i: Wrench }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-slate-900 rounded-xl">
              <tab.i className="w-4 h-4" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-6">
          {renderContent()}
        </div>
      </Tabs>
    </div>
  );
};
