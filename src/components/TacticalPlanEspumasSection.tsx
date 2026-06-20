'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Wind, Package, Loader2, Wrench, ShoppingCart, RefreshCw, FileSpreadsheet, Scissors, Box, MapPin, Info, ClipboardList } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { serviciosService } from '@/services/servicios.service';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// --- CONSTANTES TÉCNICAS ---
const CAROUSEL_CIRCUMFERENCE = 2000; // cm
const MAX_STACK_HEIGHT = 200; // cm
const MANIPULATION_GAP = 5; // cm

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
  const [activeTab, setActiveTab] = useState('provisionales');
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<any[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [tiemposCatalogo, setTiemposCatalogo] = useState<any[]>([]);

  const getTiempoMaterial = (material: string, centro: string) => {
    const code = cleanCode(material);
    const match = tiemposCatalogo.find(t => cleanCode(t.CodMaterial) === code && String(t.Centro).trim() === centro);
    return match ? safeNum(match.Tiempo || match.Tiempo_Min) : 0;
  };

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

  // --- LÓGICA DE FILTRADO SOLICITADA ---
  
  // A) Ordenes Provisionales: Filtro Almacén (1006 UIO / 2006 GYE)
  const provUIO = useMemo(() => 
    ordenesProvisionales.filter(o => String(o.Centro || o.CENTRO).trim() === '1000' && String(o.Almacen || o.ALMACEN).trim() === '1006'), 
  [ordenesProvisionales]);

  const provGYE = useMemo(() => 
    ordenesProvisionales.filter(o => String(o.Centro || o.CENTRO).trim() === '2000' && String(o.Almacen || o.ALMACEN).trim() === '2006'), 
  [ordenesProvisionales]);

  // B) Ordenes Proceso: Filtro Responsables (UIO: 013, 038, 039, 044, 036 / GYE: 002, 039)
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

  // Salida de Datos: Consolidado de todos los universos filtrados
  const salidaData = useMemo(() => {
    const allFiltered = [...provUIO, ...provGYE, ...procesoUIO, ...procesoGYE];
    return allFiltered.map(o => {
      const desc = o.NOMBRE || o.Material || o.DESCRIPCION || '—';
      const dims = parseDimensions(desc);
      const qty = safeNum(o.CANTIDAD || o.CANTPROGRAMADA || 0);
      const tIndiv = getTiempoMaterial(o.MATERIAL || o.CodMaterial, String(o.Centro || o.CENTRO));
      
      const peso = (dims.ancho * dims.largo * dims.esp * safeNum(dims.dens)) / 10000;
      const volumen = dims.ancho * dims.largo * dims.esp;
      const cargas = dims.ancho > 0 ? Math.floor(CAROUSEL_CIRCUMFERENCE / (dims.ancho + MANIPULATION_GAP)) : 0;
      const subBloques = dims.esp > 0 ? Math.floor(MAX_STACK_HEIGHT / dims.esp) : 0;

      return {
        orden: o.ORDENPREVISIONAL || o.ORDEN || '—',
        fecha: o.FECHAINICIO || o.FECHA || '—',
        categoria: o.CATEGORIA || '—',
        material: cleanCode(o.MATERIAL || o.CodMaterial),
        descripcion: desc,
        ancho: dims.ancho,
        largo: dims.largo,
        esp: dims.esp,
        dens: dims.dens,
        cant: qty,
        peso: peso,
        volumen: volumen,
        tIndiv: tIndiv,
        tTotal: (tIndiv * qty) / 60,
        cargas: cargas,
        subBloques: subBloques,
        almacen: o.Almacen || o.ALMACEN || '—',
        centro: o.Centro || o.CENTRO || '—'
      };
    });
  }, [provUIO, provGYE, procesoUIO, procesoGYE, tiemposCatalogo]);

  const renderTable = (data: any[], title: string, color: string) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm", color)} />
        <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">{title} ({data.length})</h3>
      </div>
      <div className="border border-gray-100 rounded-3xl shadow-lg overflow-hidden bg-white">
        <div className="overflow-x-auto max-h-[400px]">
          <table className="min-w-full divide-y divide-gray-200 text-[11px] text-center">
            <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-tighter border-b border-gray-100 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 text-left border-r border-gray-50">Orden SAP</th>
                <th className="px-6 py-4 text-left border-r border-gray-50">Código</th>
                <th className="px-6 py-4 text-left border-r border-gray-100">Descripción del Material</th>
                <th className="px-4 py-4 border-r border-gray-50">Cant.</th>
                <th className="px-4 py-4 border-r border-gray-50">Fecha</th>
                <th className="px-4 py-4 border-r border-gray-50">Responsable</th>
                <th className="px-4 py-4">Máquina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 font-bold text-slate-600">
              {data.length === 0 ? (
                <tr><td colSpan={7} className="py-20 text-slate-300 uppercase tracking-widest italic">Sin registros para los filtros aplicados</td></tr>
              ) : (
                data.map((o, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3 text-left text-indigo-600 font-mono text-sm border-r border-gray-50">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                    <td className="px-6 py-3 text-left font-mono font-black text-slate-900 border-r border-gray-50">{cleanCode(o.MATERIAL || o.CodMaterial)}</td>
                    <td className="px-6 py-3 text-left uppercase truncate max-w-[350px] border-r border-gray-100">{o.NOMBRE || o.Material || o.DESCRIPCION || '—'}</td>
                    <td className="px-4 py-3 font-mono font-black text-red-600 bg-slate-50/30 border-r border-gray-50">{o.CANTIDAD || o.CANTPROGRAMADA || 0}</td>
                    <td className="px-4 py-3 font-mono text-slate-400 border-r border-gray-50">{o.FECHAINICIO || o.FECHA || '—'}</td>
                    <td className="px-4 py-3 border-r border-gray-50">
                      <Badge variant="outline" className="text-[9px] font-black bg-blue-50 border-blue-100 text-blue-600 uppercase">
                        {o.RESPCONTROLPROD || o.RespControlProd || '—'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-400 uppercase text-[9px]">{o.MAQUINA || o.RECURSO || '—'}</td>
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
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner"><Scissors className="w-6 h-6 text-primary" /></div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Auditores Técnicos SAP | Segmentación UIO (1006) y GYE (2006)</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-12 bg-gray-100/50 p-1.5 rounded-2xl border border-gray-200 mb-8">
          <TabsTrigger value="provisionales" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-primary rounded-xl">
            <Package className="w-4 h-4" /> PROVISIONALES
          </TabsTrigger>
          <TabsTrigger value="ordenesProceso" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-primary rounded-xl">
            <ShoppingCart className="w-4 h-4" /> ORDENES PROCESO
          </TabsTrigger>
          <TabsTrigger value="salida" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-indigo-600 rounded-xl">
            <FileSpreadsheet className="w-4 h-4" /> SALIDA DE DATOS
          </TabsTrigger>
          <TabsTrigger value="mantenimiento" className="gap-2 text-[10px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-lg data-[state=active]:text-primary rounded-xl">
            <Wrench className="w-4 h-4" /> MMTO
          </TabsTrigger>
        </TabsList>

        {isLoading ? (
          <div className="py-32 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Sincronizando Auditoría SAP...</p>
          </div>
        ) : (
          <>
            <TabsContent value="provisionales" className="animate-in fade-in duration-300 space-y-12">
              {renderTable(provUIO, "CORTE ESPUMA UIO (Alm. Prod. 1006)", "bg-green-600")}
              {renderTable(provGYE, "CORTE ESPUMA GYE (Alm. Prod. 2006)", "bg-indigo-600")}
            </TabsContent>

            <TabsContent value="ordenesProceso" className="animate-in fade-in duration-300 space-y-12">
              {renderTable(procesoUIO, "ORDENES PROCESO UIO (Responsables Muebles/Corte)", "bg-green-600")}
              {renderTable(procesoGYE, "ORDENES PROCESO GYE (Responsables Muebles/Corte)", "bg-indigo-600")}
            </TabsContent>

            <TabsContent value="salida" className="animate-in fade-in duration-300 space-y-6">
              <div className="flex items-center gap-3 px-1">
                <div className="p-2 bg-indigo-600/10 rounded-xl"><ClipboardList className="w-5 h-5 text-indigo-600" /></div>
                <div>
                   <h3 className="text-sm font-black text-slate-800 uppercase tracking-tighter">Reporte Integral de Ingeniería</h3>
                   <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Dimensiones | Pesos | Volúmenes | Cargas de Planta</p>
                </div>
              </div>
              <div className="border border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[600px] relative">
                  <table className="w-full border-collapse text-center font-sans text-[10px]">
                    <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter text-[9px] border-b border-white/10 sticky top-0 z-20">
                      <tr>
                        <th className="px-3 py-4 border-r border-white/5">Orden</th>
                        <th className="px-3 py-4 border-r border-white/5">Fecha</th>
                        <th className="px-4 py-4 border-r border-white/5 text-left">Material / Desc.</th>
                        <th className="px-2 py-4 border-r border-white/5 bg-indigo-900/50">Ancho</th>
                        <th className="px-2 py-4 border-r border-white/5 bg-indigo-900/50">Largo</th>
                        <th className="px-2 py-4 border-r border-white/5 bg-indigo-900/50">Esp.</th>
                        <th className="px-2 py-4 border-r border-white/5">Dens.</th>
                        <th className="px-3 py-4 border-r border-white/5">Cant.</th>
                        <th className="px-3 py-4 border-r border-white/5">Peso (Kg)</th>
                        <th className="px-3 py-4 border-r border-white/5">Volumen</th>
                        <th className="px-3 py-4 border-r border-white/5 text-teal-400">T. Indiv (m)</th>
                        <th className="px-3 py-4 border-r border-white/5 text-teal-400">T. Total (H)</th>
                        <th className="px-3 py-4 border-r border-white/5 text-emerald-400">Cargas</th>
                        <th className="px-3 py-4 text-emerald-400 border-r border-white/5"># SUB_Bloque</th>
                        <th className="px-3 py-4 bg-slate-800">Alm.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 font-bold text-slate-600">
                      {salidaData.length === 0 ? (
                        <tr><td colSpan={15} className="py-24 text-slate-200 font-black uppercase tracking-widest italic text-center">Inicie la auditoría técnica para visualizar la data consolidada</td></tr>
                      ) : (
                        salidaData.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 border-r border-gray-50 text-indigo-600 font-mono">{row.orden}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.fecha}</td>
                            <td className="px-4 py-2 border-r border-gray-50 text-left truncate max-w-[200px]">
                              <span className="text-indigo-900 block font-mono">{row.material}</span>
                              <span className="text-gray-400 text-[8px] uppercase italic">{row.descripcion}</span>
                            </td>
                            <td className="px-2 py-2 border-r border-gray-50 font-mono">{row.ancho.toFixed(1)}</td>
                            <td className="px-2 py-2 border-r border-gray-50 font-mono">{row.largo.toFixed(1)}</td>
                            <td className="px-2 py-2 border-r border-gray-50 font-mono text-blue-600">{row.esp.toFixed(1)}</td>
                            <td className="px-2 py-2 border-r border-gray-50 font-black text-slate-900">{row.dens}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-mono font-black text-slate-900">{row.cant}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.peso.toFixed(2)}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.volumen.toFixed(0)}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-mono text-teal-600">{row.tIndiv.toFixed(2)}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-mono text-indigo-600">{row.tTotal.toFixed(2)}</td>
                            <td className="px-3 py-2 border-r border-gray-50 font-black text-emerald-600 bg-emerald-50/20">{row.cargas}</td>
                            <td className="px-3 py-2 font-black text-emerald-600 bg-emerald-50/20 border-r border-gray-50">{row.subBloques}</td>
                            <td className="px-3 py-2 text-slate-200">{row.almacen}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
              <div className="border border-gray-100 rounded-3xl shadow-lg overflow-hidden bg-white">
                <div className="overflow-x-auto max-h-[600px]">
                  <table className="min-w-full divide-y divide-gray-200 text-[11px] text-center">
                    <thead className="bg-[#fef3c7] text-amber-900 font-black uppercase border-b border-amber-200 sticky top-0 z-10">
                      <tr>
                        <th className="px-6 py-5 text-left border-r border-amber-100">Planta / Centro</th>
                        <th className="px-6 py-5 text-left border-r border-amber-100">Máquina / Recurso SAP</th>
                        <th className="px-6 py-5 text-left border-r border-amber-100">Programación Inicio</th>
                        <th className="px-6 py-5 text-left border-r border-amber-100">Programación Fin</th>
                        <th className="px-6 py-5">Estado Operativo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 font-bold">
                      {mantenimientos.length === 0 ? (
                        <tr><td colSpan={5} className="py-20 text-amber-300 uppercase tracking-widest italic">No se reportan mantenimientos vigentes en SAP</td></tr>
                      ) : (
                        mantenimientos.map((m, i) => (
                          <tr key={i} className="hover:bg-amber-50/20 transition-colors">
                            <td className="px-6 py-3 text-slate-400 text-left border-r border-gray-50">{m.PLANTA || '—'}</td>
                            <td className="px-6 py-3 text-indigo-900 font-black text-left uppercase border-r border-gray-50">{m.ID_MAQUINA || '—'}</td>
                            <td className="px-6 py-3 text-left font-mono border-r border-gray-50">{m.FECHA_OT_PRG_INI || '—'}</td>
                            <td className="px-6 py-3 text-left font-mono border-r border-gray-50">{m.FECHA_OT_PRG_FIN || '—'}</td>
                            <td className="px-6 py-3">
                              <Badge variant="outline" className="text-[9px] bg-amber-100 border-amber-200 text-amber-700 font-black uppercase rounded-lg">
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

      <div className="flex items-center gap-3 p-4 bg-slate-50 border border-slate-100 rounded-3xl">
        <Info className="w-5 h-5 text-slate-400" />
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
          Nota: Auditoría basada en Almacenes de Producción <span className="text-primary">1006/2006</span> y Responsables de Control configurados para Corte y Muebles.
        </p>
      </div>
    </div>
  );

  if (!mounted) return renderRoot(<div className="h-64 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>);
  return renderRoot(null);
};
