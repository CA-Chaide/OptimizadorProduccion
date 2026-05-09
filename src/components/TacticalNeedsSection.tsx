'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { RefreshCw, Layers, ClipboardList, ChevronRight, ChevronDown, Loader2, Activity, PlayCircle, Scale, Box, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { serviciosService } from '@/services/servicios.service';
import { logger } from '@/services/LogService';

interface TacticalNeedsSectionProps {
  ordenes: any[];
  tiempos: any[];
  onTotalKgChange?: (total: number) => void;
  onMaterialsCalculated?: (codes: string[]) => void;
}

interface ParentInfo {
  nombrePadre: string;
  materialPadre: string;
  puestoTrabajo: string;
  cantidad: number;
}

interface GroupedNeed {
  codigoComponente: string;
  nombreComponente: string;
  unidad: string;
  totalUnidades: number;
  items: ParentInfo[];
}

export const TacticalNeedsSection: React.FC<TacticalNeedsSectionProps> = ({ 
  ordenes, 
  tiempos, 
  onTotalKgChange,
  onMaterialsCalculated
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [groupedNeeds, setGroupedNeeds] = useState<GroupedNeed[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const extractCode = (matStr: string): string => {
    const match = String(matStr).trim().match(/^(\d+)/);
    return match ? match[1].slice(-8) : String(matStr).slice(-8);
  };

  const processExplosion = async () => {
    if (!ordenes || ordenes.length === 0) return;

    setIsProcessing(true);
    setGroupedNeeds([]);
    setProgress({ current: 0, total: ordenes.length });

    const consolidatedMap = new Map<string, GroupedNeed>();

    try {
      logger.log(`[TacticalNeeds] Iniciando explosión para ${ordenes.length} órdenes...`);

      for (let i = 0; i < ordenes.length; i++) {
        const order = ordenes[i];
        const fertCode = extractCode(order.MATERIAL || order.CodMaterial || '');
        const centro = String(order.CENTRO || order.Centro || '1000').trim();
        const orderQty = Number(order.CANTPROGRAMADA || order.CANTIDAD || 0);
        const orderName = String(order.NOMBRE || order.NombreMaterial || order.Material || '').replace(/^\d+\s*/, '');

        const infoTiempo = tiempos.find(t => extractCode(t.CodMaterial || t.codigo_material || '') === fertCode);
        const puestoPadre = infoTiempo?.PuestoTrabajo || infoTiempo?.puesto_trabajo || '—';

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fertCode, 1, 1000);
          
          if (response && response.data) {
            const explosionData = Array.isArray(response.data) ? response.data : (response.data.data || []);
            
            explosionData.forEach((comp: any) => {
              const compCode = String(comp.COMPONENTE || '').slice(-8);
              const descRaw = String(comp.DESCRIPCION_COMPONENTE || '').toUpperCase();
              const unitRaw = "KG"; // Forzado a KG por requerimiento
              
              if (!compCode) return;
              if (!descRaw.includes('LAMINA CILINDRICA') && !descRaw.includes('BLOQUE FORMULADO')) return;

              const unitaryQty = Number(comp.CANTIDAD_UNITARIA || 0);
              const totalNeeded = orderQty * unitaryQty;

              if (consolidatedMap.has(compCode)) {
                const existing = consolidatedMap.get(compCode)!;
                existing.totalUnidades += totalNeeded;
                existing.items.push({
                  nombrePadre: orderName,
                  materialPadre: fertCode,
                  puestoTrabajo: puestoPadre,
                  cantidad: totalNeeded
                });
              } else {
                consolidatedMap.set(compCode, {
                  codigoComponente: compCode,
                  nombreComponente: descRaw,
                  unidad: unitRaw,
                  totalUnidades: totalNeeded,
                  items: [{
                    nombrePadre: orderName,
                    materialPadre: fertCode,
                    puestoTrabajo: puestoPadre,
                    cantidad: totalNeeded
                  }]
                });
              }
            });
          }
        } catch (err) {
          console.warn(`Error en BOM para ${fertCode}:`, err);
        }

        setProgress(prev => ({ ...prev, current: i + 1 }));
      }

      const results = Array.from(consolidatedMap.values()).sort((a, b) => b.totalUnidades - a.totalUnidades);
      setGroupedNeeds(results);
      
      // Notificar materiales calculados para linking
      const allMaterialCodes = results.map(r => r.codigoComponente);
      onMaterialsCalculated?.(allMaterialCodes);

      // Calcular y notificar el total de KG al padre
      const totalKg = results.reduce((sum, n) => sum + n.totalUnidades, 0);
      onTotalKgChange?.(totalKg);

    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleGroup = (id: string) => {
    const next = new Set(expandedGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedGroups(next);
  };

  const laminasNeeds = useMemo(() => groupedNeeds.filter(n => n.nombreComponente.includes('LAMINA CILINDRICA')), [groupedNeeds]);
  const bloquesNeeds = useMemo(() => groupedNeeds.filter(n => n.nombreComponente.includes('BLOQUE FORMULADO')), [groupedNeeds]);

  const renderTable = (items: GroupedNeed[], title: string, icon: any, colorClass: string, bgColor: string, badgeColor: string) => (
    <div className="space-y-3">
      <h3 className={cn("text-[11px] font-black uppercase flex items-center gap-2 px-2 tracking-widest", colorClass)}>
        {React.createElement(icon, { className: "w-4 h-4" })}
        {title} ({items.length})
      </h3>
      <div className="border rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px] font-sans">
            <thead className={cn("text-white uppercase font-black tracking-tighter", bgColor)}>
              <tr>
                <th className="px-5 py-4 text-left w-[30%] border-r border-white/10">Nombre Componente</th>
                <th className="px-5 py-4 w-[12%] border-r border-white/10">Componente</th>
                <th className="px-4 py-4 w-[8%] border-r border-white/10 text-center">UM</th>
                <th className="px-5 py-4 text-left w-[25%] border-r border-white/10">Nombre (Padre)</th>
                <th className="px-5 py-4 w-[10%] border-r border-white/10">Material (Padre)</th>
                <th className="px-5 py-4 text-left">Puesto Trabajo</th>
              </tr>
            </thead>
            <tbody>
              {items.map((group) => (
                <React.Fragment key={group.codigoComponente}>
                  <tr 
                    className="bg-gray-50/50 border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors group"
                    onClick={() => toggleGroup(group.codigoComponente)}
                  >
                    <td className="px-5 py-3 font-black text-gray-700 flex items-center gap-3">
                      <div className="p-1 bg-white rounded-md shadow-sm border border-gray-100">
                        {expandedGroups.has(group.codigoComponente) ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
                      </div>
                      {group.nombreComponente}
                    </td>
                    <td className="px-5 py-3 font-black text-center text-gray-500 bg-gray-50/10">
                      {group.codigoComponente}
                    </td>
                    <td className="px-4 py-3 font-black text-center text-slate-400">
                      {group.unidad}
                    </td>
                    <td colSpan={3} className="px-5 py-3 text-right">
                      <Badge className={cn("text-white border-none font-black text-[9px] px-3", badgeColor)}>
                        Total: {group.totalUnidades.toLocaleString(undefined, { maximumFractionDigits: 2 })} {group.unidad}
                      </Badge>
                    </td>
                  </tr>
                  {expandedGroups.has(group.codigoComponente) && group.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-2 border-r border-gray-50"></td>
                      <td className="px-5 py-2 text-center text-gray-300 font-mono border-r border-gray-50">{group.codigoComponente}</td>
                      <td className="px-4 py-2 text-center text-gray-300 font-mono border-r border-gray-50">{group.unidad}</td>
                      <td className="px-5 py-2 text-left uppercase text-gray-500 font-bold border-r border-gray-50">{item.nombrePadre}</td>
                      <td className="px-5 py-2 text-center font-black text-indigo-400 border-r border-gray-50 tracking-tighter">{item.materialPadre}</td>
                      <td className="px-5 py-2 text-left font-black text-slate-400 uppercase italic">
                        {item.puestoTrabajo}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 text-left">
      {/* Header y Control */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">Sincronización Táctica de Materia Prima</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Unificación de Láminas y Bloques (Consolidado en KG)</p>
          </div>
        </div>
        
        <Button 
          onClick={processExplosion}
          disabled={isProcessing || ordenes.length === 0}
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-600/20"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <PlayCircle className="w-4 h-4 mr-2" />
          )}
          {isProcessing ? 'Procesando BOM...' : 'Sincronizar Necesidades'}
        </Button>
      </div>

      {/* Barra de Progreso */}
      {isProcessing && (
        <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Calculando Explosión Masiva
            </span>
            <span>{progress.current} / {progress.total} órdenes</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2 bg-indigo-100 [&>div]:bg-indigo-600" />
        </div>
      )}

      {/* Secciones de Resultados */}
      {!isProcessing && groupedNeeds.length > 0 ? (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {laminasNeeds.length > 0 && renderTable(laminasNeeds, "A) Necesidades Lámina Cilíndrica", Scissors, "text-green-700", "bg-[#9db65b]", "bg-[#9db65b]")}
          {bloquesNeeds.length > 0 && renderTable(bloquesNeeds, "B) Bloque Formulado", Box, "text-indigo-700", "bg-indigo-600", "bg-indigo-600")}
        </div>
      ) : !isProcessing && (
        <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100 space-y-6">
          <div className="flex flex-col items-center gap-3 opacity-20">
            <Layers className="w-12 h-12 text-slate-300" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sin datos de explosión sincronizados</p>
          </div>
        </div>
      )}
    </div>
  );
};
