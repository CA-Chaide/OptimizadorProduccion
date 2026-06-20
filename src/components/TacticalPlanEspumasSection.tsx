
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
  FileSpreadsheet, 
  Wrench,
  ChevronDown,
  ChevronRight,
  MapPin,
  Box
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from '@/components/ui/badge';
import { serviciosService } from '@/services/servicios.service';
import { cn } from '@/lib/utils';

// --- CONSTANTES TÉCNICAS ---
const CAROUSEL_CIRCUMFERENCE = 2000; 
const MAX_STACK_HEIGHT = 200; 
const MANIPULATION_GAP = 5; 

// --- FILTROS DE NEGOCIO ---
const UIO_RESPONSABLES = ['013', '038', '039', '044', '036'];
const GYE_RESPONSABLES = ['002', '039'];

const cleanCode = (code: any): string => {
  return String(code || '').replace(/^0+/, '').trim();
};

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
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

export const TacticalPlanEspumasSection: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('resumen');
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<any[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [tiemposCatalogo, setTiemposCatalogo] = useState<any[]>([]);
  const [expandedCats, setExpandedGroups] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [provs, ferts, maint, times] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 25000),
        serviciosService.getOrdenesFert(1, 25000),
        serviciosService.ListarMantenimientoPreventivosProgramados(),
        serviciosService.getTiemposEnsamblado(1, 25000)
      ]);

      setOrdenesProvisionales(provs.data?.data || provs.data || []);
      setOrdenesFert(ferts.data?.data || ferts.data || []);
      setMantenimientos(maint.data || []);
      setTiemposCatalogo(times.data?.data || times.data || []);
    } catch (error) {
      console.error('Error al cargar datos de Corte Espuma', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchData();
  }, [fetchData]);

  const getTiempoMaterial = (material: string, centro: string) => {
    const code = cleanCode(material);
    const match = tiemposCatalogo.find(t => cleanCode(t.CodMaterial) === code && String(t.Centro).trim() === centro);
    return match ? safeNum(match.Tiempo || match.Tiempo_Min) : 0;
  };

  // --- FILTROS SOLICITADOS ---
  const provUIO = useMemo(() => 
    ordenesProvisionales.filter(o => String(o.Centro || o.CENTRO).trim() === '1000' && String(o.Almacen || o.ALMACEN).trim() === '1006'), 
  [ordenesProvisionales]);

  const provGYE = useMemo(() => 
    ordenesProvisionales.filter(o => String(o.Centro || o.CENTRO).trim() === '2000' && String(o.Almacen || o.ALMACEN).trim() === '2006'), 
  [ordenesProvisionales]);

  const procesoUIO = useMemo(() => 
    ordenesFert.filter(o => {
      const centro = String(o.Centro || o.CENTRO || '').trim();
      const resp = String(o.RESPCONTROLPROD || o.RespControlProd || '').trim();
      return centro === '1000' && UIO_RESPONSABLES.includes(resp);
    }), 
  [ordenesFert]);

  const procesoGYE = useMemo(() => 
    ordenesFert.filter(o => {
      const centro = String(o.Centro || o.CENTRO || '').trim();
      const resp = String(o.RESPCONTROLPROD || o.RespControlProd || '').trim();
      return centro === '2000' && GYE_RESPONSABLES.includes(resp);
    }), 
  [ordenesFert]);

  // --- SALIDA DE DATOS ORGANIZADA POR CATEGORÍAS ---
  const groupedSalidaData = useMemo(() => {
    const all = [...provUIO, ...provGYE, ...procesoUIO, ...procesoGYE];
    const groups = new Map<string, any[]>();

    all.forEach(o => {
      const cat = String(o.CATEGORIA || 'SIN CATEGORÍA').toUpperCase();
      if (!groups.has(cat)) groups.set(cat, []);
      
      const desc = o.NOMBRE || o.Material || o.DESCRIPCION || '—';
      const dims = parseDimensions(desc);
      const qty = safeNum(o.CANTIDAD || o.CANTPROGRAMADA || 0);
      const tIndiv = getTiempoMaterial(o.MATERIAL || o.CodMaterial, String(o.Centro || o.CENTRO));
      const peso = (dims.ancho * dims.largo * dims.esp * safeNum(dims.dens)) / 10000;

      groups.get(cat)!.push({
        orden: o.ORDENPREVISIONAL || o.ORDEN || '—',
        fecha: o.FECHAINICIO || o.FECHA || '—',
        material: cleanCode(o.MATERIAL || o.CodMaterial),
        descripcion: desc,
        ancho: dims.ancho,
        largo: dims.largo,
        esp: dims.esp,
        dens: dims.dens,
        cant: qty,
        peso: peso,
        volumen: dims.ancho * dims.largo * dims.esp,
        tIndiv: tIndiv,
        tTotal: (tIndiv * qty) / 60,
        cargas: dims.ancho > 0 ? Math.floor(CAROUSEL_CIRCUMFERENCE / (dims.ancho + MANIPULATION_GAP)) : 0,
        subBloques: dims.esp > 0 ? Math.floor(MAX_STACK_HEIGHT / dims.esp) : 0,
        almacen: o.Almacen || o.ALMACEN || '—',
        centro: o.Centro || o.CENTRO || '—'
      });
    });

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [provUIO, provGYE, procesoUIO, procesoGYE, tiemposCatalogo]);

  const toggleCat = (cat: string) => {
    const next = new Set(expandedCats);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    setExpandedGroups(next);
  };

  const renderTable = (data: any[], title: string, centerColor: string) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <div className={cn("w-2 h-4 rounded-sm", centerColor)} />
        <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{title}</h3>
        <Badge variant="outline" className="text-[9px] font-bold border-slate-100 text-slate-400 ml-auto">{data.length} REGISTROS</Badge>
      </div>
      <div className="border border-slate-100 rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto max-h-[350px]">
          <table className="min-w-full divide-y divide-slate-100 text-[11px] text-center">
            <thead className="bg-slate-50 text-slate-400 uppercase font-black tracking-tighter border-b border-slate-100 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-left border-r border-slate-100 w-32">Orden</th>
                <th className="px-6 py-3 text-left border-r border-slate-100 w-32">Código</th>
                <th className="px-6 py-3 text-left border-r border-slate-200">Descripción Técnica</th>
                <th className="px-4 py-3 border-r border-slate-100 w-24">Cant.</th>
                <th className="px-4 py-3 border-r border-slate-100 w-32">Fecha</th>
                <th className="px-4 py-3 border-r border-slate-100 w-24">Resp.</th>
                <th className="px-4 py-3 w-32">Máquina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 font-medium text-slate-600">
              {data.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-slate-200 uppercase tracking-widest italic font-bold">Sin actividad reportada en SAP</td></tr>
              ) : (
                data.map((o, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-2.5 text-left text-slate-900 font-mono border-r border-slate-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                    <td className="px-6 py-2.5 text-left font-mono font-bold text-indigo-600 border-r border-slate-50">{cleanCode(o.MATERIAL || o.CodMaterial)}</td>
                    <td className="px-6 py-2.5 text-left uppercase truncate max-w-[400px] border-r border-slate-100 text-slate-500">{o.NOMBRE || o.Material || o.DESCRIPCION || '—'}</td>
                    <td className="px-4 py-2.5 font-mono font-black text-slate-900 bg-slate-50/20 border-r border-slate-50">{o.CANTIDAD || o.CANTPROGRAMADA || 0}</td>
                    <td className="px-4 py-2.5 font-mono text-slate-400 border-r border-slate-50">{o.FECHAINICIO || o.FECHA || '—'}</td>
                    <td className="px-4 py-2.5 border-r border-slate-50">
                      <span className="text-[9px] font-black text-slate-400 border border-slate-100 px-1.5 py-0.5 rounded uppercase">
                        {o.RESPCONTROLPROD || o.RespControlProd || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-bold text-slate-300 uppercase text-[9px]">{o.MAQUINA || o.RECURSO || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderRoot = (content: React.ReactNode) => (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-slate-100 font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-slate-100 rounded-xl"><Scissors className="w-6 h-6 text-slate-600" /></div>
          <div>
            <h2 className="text-xl font-black text-slate-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Auditores Técnicos SAP | Auditoría Integral de Planta</p>
          </div>
        </div>
        <Button onClick={fetchData} variant="ghost" size="icon" disabled={isLoading} className="rounded-full hover:bg-slate-100 text-slate-400">
           <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-11 bg-slate-50/80 p-1 rounded-2xl border border-slate-100 mb-8">
          <TabsTrigger value="provisionales" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 rounded-xl">
            <Package className="w-4 h-4" /> PROVISIONALES
          </TabsTrigger>
          <TabsTrigger value="ordenesProceso" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 rounded-xl">
            <ShoppingCart className="w-4 h-4" /> ORDENES PROCESO
          </TabsTrigger>
          <TabsTrigger value="resumen" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 rounded-xl">
            <FileSpreadsheet className="w-4 h-4" /> SALIDA DE DATOS
          </TabsTrigger>
          <TabsTrigger value="mantenimiento" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-slate-900 rounded-xl">
            <Wrench className="w-4 h-4" /> MMTO
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="py-32 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-slate-300" />
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Sincronizando con SAP...</p>
          </div>
        ) : (
          <>
            <TabsContent value="provisionales" className="animate-in fade-in duration-300 space-y-12">
              {renderTable(provUIO, "CORTE ESPUMA UIO (Alm. 1006)", "bg-emerald-500")}
              {renderTable(provGYE, "CORTE ESPUMA GYE (Alm. 2006)", "bg-indigo-500")}
            </TabsContent>

            <TabsContent value="ordenesProceso" className="animate-in fade-in duration-300 space-y-12">
              {renderTable(procesoUIO, "ORDENES PROCESO UIO (Resp. Corte/Laminado)", "bg-emerald-500")}
              {renderTable(procesoGYE, "ORDENES PROCESO GYE (Resp. Corte/Laminado)", "bg-indigo-500")}
            </TabsContent>

            <TabsContent value="resumen" className="animate-in fade-in duration-300 space-y-6">
              {groupedSalidaData.length === 0 ? (
                <div className="py-24 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem]">
                  <p className="text-slate-300 uppercase tracking-widest font-black italic">Sin datos para procesar</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {groupedSalidaData.map(([cat, items]) => (
                    <div key={cat} className="space-y-4">
                      <button 
                        onClick={() => toggleCat(cat)}
                        className="flex items-center gap-3 w-full p-4 bg-slate-900 text-white rounded-2xl shadow-lg hover:brightness-110 transition-all"
                      >
                        {expandedCats.has(cat) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="text-[10px] font-black uppercase tracking-widest">{cat}</span>
                        <Badge className="ml-auto bg-white/20 text-white border-none">{items.length} UNIDADES</Badge>
                      </button>

                      {expandedCats.has(cat) && (
                        <div className="border border-slate-100 rounded-3xl overflow-hidden bg-white shadow-xl animate-in slide-in-from-top-2">
                          <div className="overflow-x-auto max-h-[500px]">
                            <table className="w-full border-collapse text-center font-sans text-[10px]">
                              <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter text-[9px] border-b border-white/10 sticky top-0 z-20">
                                <tr>
                                  <th className="px-3 py-4 border-r border-white/5 text-left">Orden</th>
                                  <th className="px-3 py-4 border-r border-white/5">Fecha</th>
                                  <th className="px-4 py-4 border-r border-white/5 text-left">Material / Desc.</th>
                                  <th className="px-2 py-4 border-r border-white/5 bg-slate-800">Ancho</th>
                                  <th className="px-2 py-4 border-r border-white/5 bg-slate-800">Largo</th>
                                  <th className="px-2 py-4 border-r border-white/5 bg-slate-800">Esp.</th>
                                  <th className="px-2 py-4 border-r border-white/5">Dens.</th>
                                  <th className="px-3 py-4 border-r border-white/5">Cant.</th>
                                  <th className="px-3 py-4 border-r border-white/5">Peso (Kg)</th>
                                  <th className="px-3 py-4 border-r border-white/5">Volumen</th>
                                  <th className="px-3 py-4 border-r border-white/5 text-indigo-300">T. Indiv (m)</th>
                                  <th className="px-3 py-4 border-r border-white/5 text-indigo-300">T. Total (H)</th>
                                  <th className="px-3 py-4 border-r border-white/5 text-emerald-400">Cargas</th>
                                  <th className="px-3 py-4 text-emerald-400"># SUB_Bloque</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-bold text-slate-600">
                                {items.map((row, idx) => (
                                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-3 py-2 border-r border-slate-50 text-indigo-600 font-mono">{row.orden}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono text-slate-400">{row.fecha}</td>
                                    <td className="px-4 py-2 border-r border-slate-50 text-left truncate max-w-[200px]">
                                      <span className="text-slate-900 block font-mono">{row.material}</span>
                                      <span className="text-slate-400 text-[8px] uppercase italic">{row.descripcion}</span>
                                    </td>
                                    <td className="px-2 py-2 border-r border-slate-50 font-mono">{row.ancho.toFixed(1)}</td>
                                    <td className="px-2 py-2 border-r border-slate-50 font-mono">{row.largo.toFixed(1)}</td>
                                    <td className="px-2 py-2 border-r border-slate-50 font-mono text-indigo-600">{row.esp.toFixed(1)}</td>
                                    <td className="px-2 py-2 border-r border-slate-50 font-black text-slate-900">{row.dens}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono font-black text-slate-900">{row.cant}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono text-slate-400">{row.peso.toFixed(2)}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono text-slate-400">{row.volumen.toFixed(0)}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono text-indigo-400">{row.tIndiv.toFixed(2)}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-mono text-indigo-600">{row.tTotal.toFixed(2)}</td>
                                    <td className="px-3 py-2 border-r border-slate-50 font-black text-emerald-600 bg-emerald-50/10">{row.cargas}</td>
                                    <td className="px-3 py-2 font-black text-emerald-600 bg-emerald-50/10">{row.subBloques}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
              <div className="border border-slate-100 rounded-3xl shadow-sm overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[500px]">
                  <table className="min-w-full divide-y divide-slate-100 text-[11px] text-center">
                    <thead className="bg-slate-50 text-slate-400 font-black uppercase border-b border-slate-100 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-4 text-left border-r border-slate-50">Centro</th>
                        <th className="px-6 py-4 text-left border-r border-slate-50">Recurso / Máquina</th>
                        <th className="px-6 py-4 text-left border-r border-slate-50">Inicio</th>
                        <th className="px-6 py-4 text-left border-r border-slate-50">Fin</th>
                        <th className="px-6 py-4">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 font-bold text-slate-600">
                      {mantenimientos.length === 0 ? (
                        <tr><td colSpan={5} className="py-20 text-slate-200 uppercase tracking-widest italic font-bold text-center">Sin mantenimientos programados vigentes</td></tr>
                      ) : (
                        mantenimientos.map((m, i) => (
                          <tr key={i} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3 text-slate-400 text-left border-r border-slate-50">{m.PLANTA || '—'}</td>
                            <td className="px-6 py-3 text-slate-900 font-black text-left uppercase border-r border-slate-50">{m.ID_MAQUINA || '—'}</td>
                            <td className="px-6 py-3 text-left font-mono border-r border-slate-50">{m.FECHA_OT_PRG_INI || '—'}</td>
                            <td className="px-6 py-3 text-left font-mono border-r border-slate-50">{m.FECHA_OT_PRG_FIN || '—'}</td>
                            <td className="px-6 py-3">
                              <Badge variant="outline" className="text-[9px] bg-slate-100 border-slate-200 text-slate-600 font-black uppercase rounded-lg">
                                {m.ESTADO || 'PROGRAMADO'}
                              </Badge>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );

  if (!mounted) return renderRoot(<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-200" /></div>);
  return renderRoot(null);
};
