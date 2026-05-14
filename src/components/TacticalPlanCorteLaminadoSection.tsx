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
  DatabaseZap
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { grupoService } from '@/services/grupo.service';
import { restriccionService } from '@/services/restriccion.service';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { useAppContext } from '@/context/AppProvider';
import type { Grupo, Restriccion } from '@/types/interfaces';
import { cn } from '@/lib/utils';

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

  // Estados para el BOOM de Materiales (Auditoría Técnica)
  const [fertBusqueda, setFertBusqueda] = useState('');
  const [bomRows, setBomRows] = useState<RawBOMRow[]>([]);
  const [isSearchingBOM, setIsSearchingBOM] = useState(false);
  const [bomPage, setBomPage] = useState(1);
  const [bomRowsPerPage, setBomRowsPerPage] = useState(100);

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
      // Consulta al motor de SAP (Centro 1000 por defecto para la búsqueda)
      const response = await serviciosService.getMaestroMaterialesExplosion("1000", fullCode, 1, 5000);
      const rawData = response?.data?.data || response?.data || [];

      if (Array.isArray(rawData)) {
        // Filtrado: Excluir Centro 2000 y filtrar por 'LAMINA CILINDRICA'
        const filtered = rawData
          .filter(row => {
            const centro = getProp(row, 'CENTRO');
            const descripcion = getProp(row, 'DESCRIPCION_COMPONENTE').toUpperCase();
            // Criterio: No Centro 2000 Y debe contener 'LAMINA CILINDRICA'
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
        if (filtered.length === 0) {
          addNotification('info', 'No se encontraron componentes "Lámina Cilíndrica" para este material.');
        }
      }
    } catch (err) {
      addNotification('error', 'Error al consultar el BOOM técnico.');
    } finally {
      setIsSearchingBOM(false);
    }
  };

  const paginatedBomRows = useMemo(() => {
    const start = (bomPage - 1) * bomRowsPerPage;
    return bomRows.slice(start, start + bomRowsPerPage);
  }, [bomRows, bomPage, bomRowsPerPage]);

  const totalBomPages = Math.max(1, Math.ceil(bomRows.length / bomRowsPerPage));

  const bomTotals = useMemo(() => {
    return bomRows.reduce((acc, row) => ({
      unitaria: acc.unitaria + row.CANTIDAD_UNITARIA,
      acumulada: acc.acumulada + row.CANTIDAD_ACUMULADA
    }), { unitaria: 0, acumulada: 0 });
  }, [bomRows]);

  const uniqueFertsFromOrders = useMemo(() => {
    const ferts = new Set<string>();
    ordenes.forEach(o => {
      const info = extractMaterialInfo(o);
      if (info.code) ferts.add(info.code);
    });
    return Array.from(ferts).sort();
  }, [ordenes]);

  if (isLoading) return <div className="flex justify-center p-20"><Loader2 className="w-10 h-10 animate-spin text-red-600" /></div>;

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen rounded-xl border border-gray-100 shadow-sm font-sans text-left">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 bg-red-600/10 rounded-xl"><Scissors className="w-6 h-6 text-red-600" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Programación Táctica Laminado</h2>
            <p className="text-xs text-gray-500 font-medium">Gestión Operativa de Órdenes y Auditoría Técnica (BOOM)</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="ordenes" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 h-10 bg-gray-50/80 p-1 rounded-xl border border-gray-100 mb-6">
          {[ 
            { v: 'ordenes', l: 'Órdenes Provisionales', i: Package }, 
            { v: 'listaMateriales', l: 'Lista Materiales (BOOM)', i: ClipboardList },
            { v: 'tiempos', l: 'Tiempos Ensamblado', i: Clock }
          ].map(tab => (
            <TabsTrigger key={tab.v} value={tab.v} className="gap-2 text-[9px] font-bold uppercase transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <tab.i className="w-3.5 h-3.5" /> {tab.l}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="ordenes" className="animate-in fade-in duration-300">
          <Card className="rounded-2xl border border-gray-100 shadow-sm overflow-hidden bg-white">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full border-collapse text-center font-sans text-[11px]">
                <thead className="bg-[#1e293b] text-white sticky top-0 z-10 uppercase font-black tracking-tight">
                  <tr>
                    <th className="px-5 py-4 border-r border-white/5">Orden</th>
                    <th className="px-5 py-4 border-r border-white/5">Fecha</th>
                    <th className="px-5 py-4 border-r border-white/5">Material</th>
                    <th className="px-5 py-4 border-r border-white/5 text-left">Descripción</th>
                    <th className="px-5 py-4 border-r border-white/5">Cant.</th>
                    <th className="px-5 py-4 border-r border-white/5">Responsable</th>
                    <th className="px-5 py-4 border-r border-white/5">Máquina</th>
                    <th className="px-5 py-4">Almacén</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ordenes.length === 0 ? (
                    <tr><td colSpan={8} className="py-24 text-gray-400 italic font-black uppercase tracking-widest opacity-30 text-center">Sin órdenes cargadas</td></tr>
                  ) : (
                    ordenes.map((o, i) => {
                      const info = extractMaterialInfo(o);
                      const qty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
                      const maquina = String(o.MAQUINA || o.Maquina || o.recurso || o.RECURSO || '—').trim();
                      const responsable = String(o.RESPCONTROLPROD || o.RespControlProd || o.RESP_CONTROL_PROD || '—').trim();

                      return (
                        <tr key={i} className="hover:bg-gray-50 transition-colors group">
                          <td className="px-4 py-4 font-bold text-gray-900 border-r border-dashed border-gray-100">{o.ORDENPREVISIONAL || o.ORDEN || '—'}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-100 font-mono text-[9px] text-gray-400">{o.FECHAINICIO || o.FECHA || '—'}</td>
                          <td className="px-4 py-4 font-mono font-black text-red-600 border-r border-dashed border-gray-100 tracking-tighter">{info.code}</td>
                          <td className="px-4 py-4 text-left border-r border-dashed border-gray-100 truncate max-w-[350px] text-gray-600 font-bold uppercase">{info.desc}</td>
                          <td className="px-4 py-4 font-black text-gray-900 border-r border-dashed border-gray-100 font-mono text-xs">{qty.toLocaleString()}</td>
                          <td className="px-4 py-4 border-r border-dashed border-gray-100 font-black text-indigo-600 bg-indigo-50/5 uppercase">
                            <Badge variant="outline" className="text-[10px] font-bold border-indigo-200 bg-indigo-50/50">{responsable}</Badge>
                          </td>
                          <td className="px-4 py-4 font-black text-amber-700 border-r border-dashed border-gray-100 bg-amber-50/10 uppercase">{maquina}</td>
                          <td className="px-4 py-4 font-bold text-gray-400">{o.Almacen || o.ALMACEN || '—'}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
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
                  list="order-ferts"
                  placeholder="Buscar FERT Principal..." 
                  value={fertBusqueda}
                  onChange={(e) => setFertBusqueda(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                />
                <datalist id="order-ferts">
                  {uniqueFertsFromOrders.map(f => <option key={f} value={f} />)}
                </datalist>
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
                            <td className="px-3 py-2 border-r border-gray-100 text-gray-500 uppercase truncate max-w-[150px]" title={row.DESCRIPCION_FERT}>
                              {row.DESCRIPCION_FERT}
                            </td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-gray-400 tracking-tighter">{row.MATERIAL_PADRE}</td>
                            <td className="px-3 py-2 border-r border-gray-100 font-mono text-slate-700 tracking-tighter">{row.COMPONENTE}</td>
                            <td className="px-3 py-2 border-r border-gray-100 text-left">
                              <span className="uppercase font-black tracking-tight text-slate-600">
                                {row.DESCRIPCION_COMPONENTE}
                              </span>
                            </td>
                            <td className="px-3 py-2 border-r border-gray-100 text-right font-mono text-slate-500">
                              {row.CANTIDAD_UNITARIA.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-slate-800">
                              {row.CANTIDAD_ACUMULADA.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="sticky bottom-0 z-30 bg-[#1e293b] text-white font-black uppercase border-t border-slate-700">
                      <tr>
                        <td colSpan={7} className="px-4 py-2.5 text-right tracking-widest text-[8px] text-gray-400">Total general:</td>
                        <td className="px-3 py-2.5 text-right font-mono border-r border-white/10 text-xs">
                          {bomTotals.unitaria.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-blue-300 text-xs">
                          {bomTotals.acumulada.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                        </td>
                      </tr>
                    </tfoot>
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
                  <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">
                    Página {bomPage} de {totalBomPages}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setBomPage(1)} disabled={bomPage === 1} className="h-7 w-7 rounded-lg"><ChevronsLeft className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setBomPage(prev => Math.max(1, prev - 1))} disabled={bomPage === 1} className="h-7 w-7 rounded-lg"><ChevronLeft className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setBomPage(prev => Math.min(totalBomPages, prev + 1))} disabled={bomPage === totalBomPages} className="h-7 w-7 rounded-lg"><ChevronRight className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setBomPage(totalBomPages)} disabled={bomPage === totalBomPages} className="h-7 w-7 rounded-lg"><ChevronsRight className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            </div>
          ) : !isSearchingBOM && (
            <div className="py-20 text-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200">
              <DatabaseZap className="w-12 h-12 text-indigo-100 mx-auto" />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Ingrese un código FERT para consultar la estructura jerárquica filtrada</p>
            </div>
          )}

          <div className="px-4 py-2 bg-blue-50/50 border border-blue-100 rounded-xl flex items-center gap-2 text-left">
            <Info className="w-3.5 h-3.5 text-blue-500" />
            <p className="text-[8px] font-black text-blue-600 uppercase tracking-widest">
              Nota: La auditoría técnica muestra únicamente los componentes de tipo "Lámina Cilíndrica" dentro del BOOM seleccionado, excluyendo datos de la Planta Guayaquil.
            </p>
          </div>
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
