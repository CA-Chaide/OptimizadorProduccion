'use client';

import React, { useState, useMemo } from 'react';
import { Layers, ChevronRight, ChevronDown, Loader2, Activity, PlayCircle, Scale, Box, Scissors, Clock } from 'lucide-react';
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

interface ParentBreakdown {
  orden: string;
  nombrePadre: string;
  materialPadre: string;
  puestoPadre: string;
  cantidadKG: number;
}

interface GroupedNeed {
  codigoComponente: string;
  nombreComponente: string;
  unidad: string;
  totalKG: number;
  parents: ParentBreakdown[];
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
    setExpandedGroups(new Set());
    setProgress({ current: 0, total: ordenes.length });

    const consolidatedMap = new Map<string, GroupedNeed>();

    try {
      logger.log(`[TacticalNeeds] Iniciando explosión jerárquica para ${ordenes.length} órdenes...`);

      for (let i = 0; i < ordenes.length; i++) {
        const order = ordenes[i];
        const fertCode = extractCode(order.MATERIAL || order.CodMaterial || '');
        const centro = String(order.CENTRO || order.Centro || '1000').trim();
        const orderQty = Number(order.CANTPROGRAMADA || order.CANTIDAD || 0);
        const orderName = String(order.NOMBRE || order.NombreMaterial || order.Material || '').replace(/^\d+\s*/, '');
        const orderNum = order.ORDENPREVISIONAL || order.ORDEN || '—';

        // Buscar información técnica del padre (puesto de trabajo)
        const infoMaestra = tiempos.find(t => extractCode(t.CodMaterial || t.codigo_material || '') === fertCode);
        const puestoPadre = infoMaestra?.PuestoTrabajo || infoMaestra?.puesto_trabajo || '—';

        // Padding a 18 dígitos según regla de negocio
        const fullCode = fertCode.padStart(18, '0');

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fullCode, 1, 1000);
          
          if (response && response.data) {
            const explosionData = Array.isArray(response.data) ? response.data : (response.data.data || []);
            
            explosionData.forEach((comp: any) => {
              const compCode = String(comp.COMPONENTE || '').slice(-8);
              const descRaw = String(comp.DESCRIPCION_COMPONENTE || '').toUpperCase();
              
              // Filtrar solo categorías requeridas para laminado/formulación
              if (!compCode) return;
              const isLamina = descRaw.includes('LAMINA CILINDRICA');
              const isBloque = descRaw.includes('BLOQUE FORMULADO');
              if (!isLamina && !isBloque) return;

              const factorConsumo = Number(comp.CANTIDAD_UNITARIA || 0);
              const cantidadKG = orderQty * factorConsumo;

              if (consolidatedMap.has(compCode)) {
                const existing = consolidatedMap.get(compCode)!;
                existing.totalKG += cantidadKG;
                existing.parents.push({
                  orden: orderNum,
                  nombrePadre: orderName,
                  materialPadre: fertCode,
                  puestoPadre: puestoPadre,
                  cantidadKG: cantidadKG
                });
              } else {
                consolidatedMap.set(compCode, {
                  codigoComponente: compCode,
                  nombreComponente: descRaw,
                  unidad: "KG",
                  totalKG: cantidadKG,
                  parents: [{
                    orden: orderNum,
                    nombrePadre: orderName,
                    materialPadre: fertCode,
                    puestoPadre: puestoPadre,
                    cantidadKG: cantidadKG
                  }]
                });
              }
            });
          }
        } catch (err) {
          console.warn(`Error en BOM para padre ${fertCode}:`, err);
        }

        setProgress(prev => ({ ...prev, current: i + 1 }));
      }

      const results = Array.from(consolidatedMap.values()).sort((a, b) => b.totalKG - a.totalKG);
      setGroupedNeeds(results);
      
      // Notificar materiales para resaltado en Tiempos
      onMaterialsCalculated?.(results.map(r => r.codigoComponente));

      // Calcular total acumulado
      const totalKg = results.reduce((sum, n) => sum + n.totalKG, 0);
      onTotalKgChange?.(totalKg);

    } catch (err) {
      console.error(err);
      logger.error(`Error en proceso de explosión: ${(err as Error).message}`);
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

  const laminasGroups = useMemo(() => groupedNeeds.filter(n => n.nombreComponente.includes('LAMINA CILINDRICA')), [groupedNeeds]);
  const bloquesGroups = useMemo(() => groupedNeeds.filter(n => n.nombreComponente.includes('BLOQUE FORMULADO')), [groupedNeeds]);

  const renderLevelTable = (items: GroupedNeed[], title: string, icon: any, colorClass: string, headerColor: string) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <h3 className={cn("text-[11px] font-black uppercase flex items-center gap-2 tracking-widest", colorClass)}>
          {React.createElement(icon, { className: "w-4 h-4" })}
          {title} ({items.length} Tipos)
        </h3>
      </div>
      
      <div className="border rounded-2xl overflow-hidden bg-white shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px] font-sans">
            <thead className={cn("text-white uppercase font-black tracking-tighter", headerColor)}>
              <tr>
                <th className="px-5 py-4 text-left w-[35%] border-r border-white/10">Componente Consolidado (Nivel 1)</th>
                <th className="px-5 py-4 w-[15%] border-r border-white/10 text-center">Código</th>
                <th className="px-5 py-4 w-[10%] border-r border-white/10 text-center">UM</th>
                <th className="px-5 py-4 text-right bg-black/10">Necesidad Total (KG)</th>
              </tr>
            </thead>
            <tbody>
              {items.map((group) => (
                <React.Fragment key={group.codigoComponente}>
                  {/* NIVEL 1: COMPONENTE CONSOLIDADO */}
                  <tr 
                    className="bg-gray-50/80 border-b border-gray-100 cursor-pointer hover:bg-indigo-50/30 transition-colors"
                    onClick={() => toggleGroup(group.codigoComponente)}
                  >
                    <td className="px-5 py-3 font-black text-slate-700 flex items-center gap-3">
                      <div className="p-1 bg-white rounded-md shadow-sm border border-gray-200">
                        {expandedGroups.has(group.codigoComponente) ? <ChevronDown className="w-3 h-3 text-indigo-600" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                      </div>
                      {group.nombreComponente}
                    </td>
                    <td className="px-5 py-3 font-mono font-black text-center text-slate-500 bg-slate-50/20">
                      {group.codigoComponente}
                    </td>
                    <td className="px-5 py-3 font-black text-center text-slate-400">
                      {group.unidad}
                    </td>
                    <td className="px-8 py-3 text-right">
                      <Badge className={cn("border-none font-black text-[10px] px-4 py-1 shadow-sm", headerColor)}>
                        {group.totalKG.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} KG
                      </Badge>
                    </td>
                  </tr>

                  {/* NIVEL 2: DESGLOSE DE ÓRDENES PADRE */}
                  {expandedGroups.has(group.codigoComponente) && (
                    <>
                      <tr className="bg-slate-50">
                        <td colSpan={4} className="px-10 py-1 text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-gray-100">
                          Desglose por Órdenes de Origen (Vínculo Táctico)
                        </td>
                      </tr>
                      {group.parents.map((parent, pIdx) => (
                        <tr key={`${group.codigoComponente}-p-${pIdx}`} className="border-b border-gray-50 hover:bg-blue-50/20 transition-colors">
                          <td className="px-12 py-2 text-left">
                            <div className="flex flex-col">
                              <span className="font-black text-slate-600 uppercase leading-none mb-1">{parent.nombrePadre}</span>
                              <span className="text-[9px] font-bold text-slate-400 flex items-center gap-2 italic">
                                <Clock className="w-2.5 h-2.5" /> Puesto: {parent.puestoPadre}
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-2 text-center">
                            <span className="font-mono font-black text-indigo-400 tracking-tighter">{parent.materialPadre}</span>
                          </td>
                          <td className="px-5 py-2 text-center text-slate-300 font-bold">
                            Ord: {parent.orden}
                          </td>
                          <td className="px-8 py-2 text-right font-mono font-bold text-slate-500">
                            {parent.cantidadKG.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
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
      {/* Header de Sincronización */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">Explosión Técnica de Necesidades</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Niveles: Componente Consolidado (1) → Órdenes de Origen (2)</p>
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
          {isProcessing ? 'Calculando BOM...' : 'Sincronizar Plan Maestro'}
        </Button>
      </div>

      {/* Progreso */}
      {isProcessing && (
        <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100 animate-in fade-in slide-in-from-top-2">
          <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Procesando niveles de consumo técnico
            </span>
            <span>{progress.current} / {progress.total} órdenes</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2 bg-indigo-100 [&>div]:bg-indigo-600" />
        </div>
      )}

      {/* Resultados Jerárquicos */}
      {!isProcessing && groupedNeeds.length > 0 ? (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-500">
          {laminasGroups.length > 0 && renderLevelTable(laminasGroups, "A) Nivel: Lámina Cilíndrica", Scissors, "text-green-700", "bg-[#9db65b]")}
          {bloquesGroups.length > 0 && renderLevelTable(bloquesGroups, "B) Nivel: Bloque Formulado", Box, "text-indigo-700", "bg-indigo-600")}
        </div>
      ) : !isProcessing && (
        <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100 space-y-4">
          <div className="flex flex-col items-center gap-3 opacity-20">
            <Scale className="w-12 h-12 text-slate-300" />
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sin datos de necesidades consolidados</p>
          </div>
        </div>
      )}
    </div>
  );
};
