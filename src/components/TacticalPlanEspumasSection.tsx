'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Wind, Package, Loader2, Wrench, ShoppingCart, RefreshCw, MapPin, Clock, Table, FileSpreadsheet, Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { serviciosService } from '@/services/servicios.service';
import { logger } from '@/services/LogService';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Progress } from "@/components/ui/progress";

// --- CONSTANTES TÉCNICAS ---
const CAROUSEL_CIRCUMFERENCE = 2000; // cm
const MAX_STACK_HEIGHT = 200; // cm
const MANIPULATION_GAP = 5; // cm

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

const extractAperture = (desc: string): string => {
  const d = String(desc || '').toUpperCase();
  const match = d.match(/(194\.5|206|219|228)/);
  return match ? match[0] : '—';
};

export const TacticalPlanEspumasSection: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('provisionales');
  const [ordenesProvisionales, setOrdenesProvisionales] = useState<any[]>([]);
  const [ordenesFert, setOrdenesFert] = useState<any[]>([]);
  const [mantenimientos, setMantenimientos] = useState<any[]>([]);
  const [tiemposCatalogo, setTiemposCatalogo] = useState<any[]>([]);

  // Estados para Salida de Datos
  const [salidaRows, setSalidaRows] = useState<any[]>([]);
  const [isProcessingSalida, setIsProcessingSalida] = useState(false);
  const [salidaProgress, setSalidaProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [provs, ferts, maint, times] = await Promise.all([
        serviciosService.OrdenesProvisionalesPaginados(1, 20000),
        serviciosService.getOrdenesFert(1, 20000),
        serviciosService.ListarMantenimientoPreventivosProgramados(),
        serviciosService.getTiemposEnsamblado(1, 20000)
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
    if (mounted) fetchData();
  }, [mounted, fetchData]);

  const getTiempoMaterial = (material: string, centro: string) => {
    const code = cleanCode(material);
    const match = tiemposCatalogo.find(t => cleanCode(t.CodMaterial) === code && String(t.Centro).trim() === centro);
    return match ? safeNum(match.Tiempo || match.Tiempo_Min) : 0;
  };

  const handleGenerateSalida = async () => {
    const provs1000 = ordenesProvisionales.filter(o => String(o.Almacen || o.ALMACEN || '').trim() === '1000');
    if (provs1000.length === 0) return;

    setIsProcessingSalida(true);
    setSalidaProgress({ current: 0, total: provs1000.length });
    const allSalidaRows: any[] = [];

    for (let i = 0; i < provs1000.length; i++) {
      const order = provs1000[i];
      const fertCode = cleanCode(order.MATERIAL || order.CodMaterial).padStart(18, '0');
      const centro = String(order.Centro || order.CENTRO || '1000').trim();

      try {
        const bomRes = await serviciosService.getMaestroMaterialesExplosion(centro, fertCode, 1, 1000);
        const bomData = bomRes.data?.data || bomRes.data || [];

        if (Array.isArray(bomData)) {
          // Identificar niveles
          const n1Items = bomData.filter(row => row.NIVEL === "1" || row.NIVEL === 1);
          
          n1Items.forEach(n1 => {
            const n2Items = bomData.filter(row => row.MATERIAL_PADRE === n1.COMPONENTE);
            
            n2Items.forEach(n2 => {
              const n3Items = bomData.filter(row => row.MATERIAL_PADRE === n2.COMPONENTE);
              
              n3Items.forEach(n3 => {
                const dims = parseDimensions(n1.DESCRIPCION_COMPONENTE || '');
                const qty = safeNum(order.CANTIDAD || order.CANTPROGRAMADA);
                const peso = (dims.ancho * dims.largo * dims.esp * safeNum(dims.dens)) / 10000;
                const volumen = dims.ancho * dims.largo * dims.esp;
                const tIndiv = getTiempoMaterial(n1.COMPONENTE, centro);
                
                // Cálculos de Carga e Ingeniería
                const cargas = dims.ancho > 0 ? Math.floor(CAROUSEL_CIRCUMFERENCE / (dims.ancho + MANIPULATION_GAP)) : 0;
                const subBloques = dims.esp > 0 ? Math.floor(MAX_STACK_HEIGHT / dims.esp) : 0;

                allSalidaRows.push({
                  orden: order.ORDENPREVISIONAL || '—',
                  fecha: order.FECHAINICIO || '—',
                  categoria: order.CATEGORIA || '—',
                  halbN1: cleanCode(n1.COMPONENTE),
                  halbN1N: String(n1.DESCRIPCION_COMPONENTE || '').toUpperCase(),
                  ancho: dims.ancho,
                  largo: dims.largo,
                  esp: dims.esp,
                  dens: dims.dens,
                  cant: qty,
                  peso: peso,
                  volumen: volumen,
                  halbN2: cleanCode(n2.COMPONENTE),
                  halbN2N: String(n2.DESCRIPCION_COMPONENTE || '').toUpperCase(),
                  consumoN2: safeNum(n2.CANTIDAD_ACUMULADA),
                  halbN3: cleanCode(n3.COMPONENTE),
                  halbN3N: String(n3.DESCRIPCION_COMPONENTE || '').toUpperCase(),
                  apertura: extractAperture(n3.DESCRIPCION_COMPONENTE || ''),
                  tIndiv: tIndiv,
                  tTotal: (tIndiv * qty) / 60,
                  cargasSubBloque: cargas,
                  numSubBloque: subBloques
                });
              });
              
              // Si no hay N3, generar fila con N2
              if (n3Items.length === 0) {
                // ... lógica similar para filas parciales si fuera necesario
              }
            });
          });
        }
      } catch (err) {
        console.warn(`Error procesando BOM para material ${fertCode}`);
      }
      setSalidaProgress(prev => ({ ...prev, current: i + 1 }));
    }

    setSalidaRows(allSalidaRows);
    setIsProcessingSalida(false);
  };

  const renderProvisionalTable = (data: any[], title: string, color: string) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <div className={cn("w-2 h-2 rounded-full", color)} />
        <h3 className="text-[10px] font-black text-slate-700 uppercase tracking-widest">{title} ({data.length})</h3>
      </div>
      <div className="border border-gray-100 rounded-2xl shadow-sm overflow-hidden bg-white">
        <div className="overflow-x-auto max-h-[400px]">
          <table className="min-w-full divide-y divide-gray-200 text-[10px] text-center">
            <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-wider border-b border-gray-100 sticky top-0 z-10">
              <tr>
                <th className="px-3 py-3 text-left">Orden</th>
                <th className="px-3 py-3 text-left">Material</th>
                <th className="px-3 py-3 text-left">Descripción</th>
                <th className="px-3 py-3">Categoría</th>
                <th className="px-3 py-3">Resp. CP</th>
                <th className="px-3 py-3">Cant.</th>
                <th className="px-3 py-3 bg-blue-50/50 text-blue-700">Tiempo (Min)</th>
                <th className="px-3 py-3">Fecha Inicio</th>
                <th className="px-3 py-3">Máquina</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
              {data.map((o, idx) => (
                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 text-left text-indigo-600 font-mono">{o.ORDENPREVISIONAL || '—'}</td>
                  <td className="px-3 py-2 text-left font-mono">{cleanCode(o.MATERIAL || o.CodMaterial)}</td>
                  <td className="px-3 py-2 text-left uppercase truncate max-w-[250px]">{o.NOMBRE || o.Material || '—'}</td>
                  <td className="px-3 py-2 text-slate-400">{o.CATEGORIA || '—'}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[8px] font-black bg-slate-50 border-slate-200 text-slate-500 uppercase">
                      {o.RESPCONTROLPROD || '—'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-gray-900">{o.CANTIDAD || o.CANTPROGRAMADA || 0}</td>
                  <td className="px-3 py-2 font-mono text-blue-600 bg-blue-50/20">
                    {getTiempoMaterial(o.MATERIAL || o.CodMaterial, String(o.Centro || o.CENTRO)).toFixed(2)}
                  </td>
                  <td className="px-3 py-2 font-mono text-slate-500">{o.FECHAINICIO || '—'}</td>
                  <td className="px-3 py-2 text-indigo-400 uppercase">{o.MAQUINA || o.RECURSO || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const provsUIO = useMemo(() => ordenesProvisionales.filter(o => String(o.Almacen || o.ALMACEN || '').trim() === '1000' && String(o.Centro || o.CENTRO || '').trim() === '1000'), [ordenesProvisionales]);
  const provsGYE = useMemo(() => ordenesProvisionales.filter(o => String(o.Almacen || o.ALMACEN || '').trim() === '1000' && String(o.Centro || o.CENTRO || '').trim() === '2000'), [ordenesProvisionales]);

  if (!mounted) return null;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-primary/10 rounded-xl shadow-inner">
            <Wind className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Programación Táctica Corte Espuma</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Auditoría Técnica Almacén 1000</p>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-8">
          <TabsTrigger value="provisionales" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
            <Package className="w-3.5 h-3.5" /> PROVISIONALES
          </TabsTrigger>
          <TabsTrigger value="ordenesFert" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
            <ShoppingCart className="w-3.5 h-3.5" /> ÓRDENES FERT
          </TabsTrigger>
          <TabsTrigger value="mantenimiento" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-primary rounded-lg">
            <Wrench className="w-3.5 h-3.5" /> MANTENIMIENTO
          </TabsTrigger>
          <TabsTrigger value="salida" className="gap-2 text-[9px] font-black uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-indigo-600 rounded-lg">
            <FileSpreadsheet className="w-3.5 h-3.5" /> SALIDA DE DATOS
          </TabsTrigger>
        </TabsList>

        <div className="relative">
          {isLoading ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Consultando Servidores SAP...</p>
            </div>
          ) : (
            <>
              <TabsContent value="provisionales" className="animate-in fade-in duration-300 space-y-10">
                {renderProvisionalTable(provsUIO, "CORTE ESPUMA UIO (Planta 1000)", "bg-green-600")}
                {renderProvisionalTable(provsGYE, "CORTE ESPUMA GYE (Planta 2000)", "bg-indigo-600")}
              </TabsContent>

              <TabsContent value="ordenesFert" className="animate-in fade-in duration-300">
                <div className="border border-gray-100 rounded-2xl shadow-sm overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[600px]">
                    <table className="min-w-full divide-y divide-gray-200 text-[10px] text-center">
                      <thead className="bg-[#f8fafc] text-slate-400 uppercase font-black tracking-wider border-b border-gray-100 sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-4 text-left">Orden</th>
                          <th className="px-3 py-4 text-left">Material</th>
                          <th className="px-3 py-4 text-left">Descripción</th>
                          <th className="px-3 py-4">Cant.</th>
                          <th className="px-3 py-4">Unidad</th>
                          <th className="px-3 py-4">Fecha</th>
                          <th className="px-3 py-4">Centro</th>
                          <th className="px-3 py-4">Almacén</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-bold text-slate-700">
                        {ordenesFert.map((o, idx) => (
                          <tr key={idx} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-2 text-left text-indigo-600">{o.ORDEN || '—'}</td>
                            <td className="px-3 py-2 text-left font-mono">{cleanCode(o.MATERIAL)}</td>
                            <td className="px-3 py-2 text-left uppercase truncate max-w-[250px]">{o.NOMBRE || o.DESCRIPCION || '—'}</td>
                            <td className="px-3 py-2 font-mono text-gray-900">{o.CANTIDAD || 0}</td>
                            <td className="px-3 py-2 text-slate-400">{o.UNIDAD || '—'}</td>
                            <td className="px-3 py-2 font-mono text-slate-500">{o.FECHA || '—'}</td>
                            <td className="px-3 py-2">{o.CENTRO || o.Centro || '—'}</td>
                            <td className="px-3 py-2 text-slate-400">{o.ALMACEN || o.Almacen || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="mantenimiento" className="animate-in fade-in duration-300">
                <div className="border border-gray-100 rounded-2xl shadow-sm overflow-hidden bg-white">
                  <div className="overflow-x-auto max-h-[600px]">
                    <table className="min-w-full divide-y divide-gray-200 text-[10px] text-center">
                      <thead className="bg-[#fef3c7] text-amber-900 font-black uppercase border-b border-amber-200 sticky top-0 z-10">
                        <tr>
                          <th className="px-6 py-4 text-left">Planta</th>
                          <th className="px-6 py-4 text-left">Máquina</th>
                          <th className="px-6 py-4 text-left">Fecha Inicio</th>
                          <th className="px-6 py-4 text-left">Fecha Fin</th>
                          <th className="px-6 py-4">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 font-bold text-amber-950/80">
                        {mantenimientos.map((m, i) => (
                          <tr key={i} className="hover:bg-amber-50/20 transition-colors">
                            <td className="px-6 py-3 text-slate-400 text-left">{String(m.PLANTA || '—')}</td>
                            <td className="px-6 py-3 text-indigo-900 font-black text-left">{String(m.ID_MAQUINA || '—')}</td>
                            <td className="px-6 py-3 text-left font-mono">{m.FECHA_OT_PRG_INI || '—'}</td>
                            <td className="px-6 py-3 text-left font-mono">{m.FECHA_OT_PRG_FIN || '—'}</td>
                            <td className="px-6 py-3">
                              <Badge variant="outline" className="text-[8px] bg-amber-50 border-amber-200 text-amber-600 font-black uppercase">
                                {m.ESTADO || 'Programado'}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="salida" className="animate-in fade-in duration-300 space-y-6">
                <div className="flex items-center justify-between bg-indigo-50/50 p-6 rounded-3xl border border-indigo-100 shadow-inner">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-lg shadow-indigo-200">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-indigo-900 uppercase tracking-tighter">Generador de Reporte Estructurado</h3>
                      <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest mt-1">Explosión Técnica Jerárquica HALB_N1 | N2 | N3</p>
                    </div>
                  </div>
                  <Button 
                    onClick={handleGenerateSalida} 
                    disabled={isProcessingSalida} 
                    className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest shadow-lg active:scale-95"
                  >
                    {isProcessingSalida ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
                    EJECUTAR AUDITORÍA BOM
                  </Button>
                </div>

                {isProcessingSalida && (
                  <div className="space-y-3 bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                    <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
                      <span>Procesando Órdenes Provisionales...</span>
                      <span>{salidaProgress.current} / {salidaProgress.total}</span>
                    </div>
                    <Progress value={(salidaProgress.current / salidaProgress.total) * 100} className="h-2 bg-indigo-100" />
                  </div>
                )}

                {!isProcessingSalida && salidaRows.length > 0 && (
                  <div className="border border-gray-100 rounded-[2.5rem] shadow-2xl overflow-hidden bg-white">
                    <div className="overflow-x-auto max-h-[600px] relative">
                      <table className="w-full border-collapse text-center font-sans text-[10px]">
                        <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter text-[9px] border-b border-white/10 sticky top-0 z-20">
                          <tr>
                            <th className="px-3 py-4 border-r border-white/5">Orden</th>
                            <th className="px-3 py-4 border-r border-white/5">Fecha</th>
                            <th className="px-3 py-4 border-r border-white/5">Categoría</th>
                            <th className="px-3 py-4 border-r border-white/5 bg-indigo-900">HALB_N3</th>
                            <th className="px-5 py-4 border-r border-white/5 bg-indigo-900 text-left">HALB_N3N (Bloque)</th>
                            <th className="px-3 py-4 border-r border-white/5 bg-slate-800">HALB_N1</th>
                            <th className="px-5 py-4 border-r border-white/5 bg-slate-800 text-left">HALB_N1N (Lámina)</th>
                            <th className="px-2 py-4 border-r border-white/5">Ancho</th>
                            <th className="px-2 py-4 border-r border-white/5">Largo</th>
                            <th className="px-2 py-4 border-r border-white/5">Esp.</th>
                            <th className="px-2 py-4 border-r border-white/5">Dens.</th>
                            <th className="px-3 py-4 border-r border-white/5">Cant.</th>
                            <th className="px-3 py-4 border-r border-white/5">Peso (Kg)</th>
                            <th className="px-3 py-4 border-r border-white/5">Volumen</th>
                            <th className="px-3 py-4 border-r border-white/5 text-teal-400">HALB_N2</th>
                            <th className="px-5 py-4 border-r border-white/5 text-left text-teal-400">HALB_N2N</th>
                            <th className="px-3 py-4 border-r border-white/5 text-teal-400">Consumo_N2</th>
                            <th className="px-3 py-4 border-r border-white/5 bg-blue-900 text-yellow-400">APERTURA</th>
                            <th className="px-3 py-4 border-r border-white/5 text-indigo-300">T. Indiv (m)</th>
                            <th className="px-3 py-4 border-r border-white/5 text-indigo-300">T. Total (H)</th>
                            <th className="px-3 py-4 border-r border-white/5 text-emerald-400 font-black">Cargas</th>
                            <th className="px-3 py-4 text-emerald-400 font-black"># SUB_Bloque</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 font-bold text-slate-600">
                          {salidaRows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="px-3 py-2 border-r border-gray-50 text-indigo-600 font-mono">{row.orden}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.fecha}</td>
                              <td className="px-3 py-2 border-r border-gray-50 uppercase text-[9px]">{row.categoria}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-indigo-900 bg-indigo-50/20">{row.halbN3}</td>
                              <td className="px-5 py-2 border-r border-gray-100 text-left uppercase truncate max-w-[200px] bg-indigo-50/10 italic text-slate-400">{row.halbN3N}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-900 bg-slate-100/30">{row.halbN1}</td>
                              <td className="px-5 py-2 border-r border-gray-100 text-left uppercase truncate max-w-[200px] text-slate-800 font-black">{row.halbN1N}</td>
                              <td className="px-2 py-2 border-r border-gray-50 font-mono">{row.ancho.toFixed(2)}</td>
                              <td className="px-2 py-2 border-r border-gray-50 font-mono">{row.largo.toFixed(2)}</td>
                              <td className="px-2 py-2 border-r border-gray-50 font-mono text-blue-600">{row.esp.toFixed(2)}</td>
                              <td className="px-2 py-2 border-r border-gray-50 font-black text-slate-900">{row.dens}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono font-black text-slate-900">{row.cant}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.peso.toFixed(2)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-slate-400">{row.volumen.toFixed(0)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-teal-600">{row.halbN2}</td>
                              <td className="px-5 py-2 border-r border-gray-100 text-left uppercase truncate max-w-[150px] text-teal-700/60 italic text-[9px]">{row.halbN2N}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-teal-600">{row.consumoN2.toFixed(3)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-black text-blue-800 bg-blue-50/30">{row.apertura}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-indigo-400">{row.tIndiv.toFixed(2)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-mono text-indigo-600">{row.tTotal.toFixed(2)}</td>
                              <td className="px-3 py-2 border-r border-gray-50 font-black text-emerald-600 bg-emerald-50/20">{row.cargasSubBloque}</td>
                              <td className="px-3 py-2 font-black text-emerald-600 bg-emerald-50/20">{row.numSubBloque}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>
    </div>
  );
};
