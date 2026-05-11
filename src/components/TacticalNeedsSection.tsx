'use client';

import React, { useState, useMemo } from 'react';
import { Layers, ChevronRight, ChevronDown, Loader2, Activity, PlayCircle, Scale, Scissors, Box, Info } from 'lucide-react';
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
    if (!ordenes || ordenes.length === 0) {
      logger.warn('[TacticalNeeds] No hay órdenes filtradas para procesar.');
      return;
    }

    setIsProcessing(true);
    setGroupedNeeds([]);
    setExpandedGroups(new Set());
    setProgress({ current: 0, total: ordenes.length });

    const consolidatedMap = new Map<string, GroupedNeed>();

    try {
      logger.log(`[TacticalNeeds] Iniciando explosión técnica para ${ordenes.length} órdenes...`);

      for (let i = 0; i < ordenes.length; i++) {
        const order = ordenes[i];
        const fertCode = extractCode(order.MATERIAL || order.CodMaterial || '');
        const centro = String(order.CENTRO || order.Centro || '1000').trim();
        const orderQty = Number(o.CANTPROGRAMADA || o.CANTIDAD || 0);
        const orderName = String(order.NOMBRE || order.NombreMaterial || order.Material || '').replace(/^\d+\s*/, '');
        const orderNum = order.ORDENPREVISIONAL || order.ORDEN || '—';

        // Lookup del puesto de trabajo del padre en el maestro
        const infoMaestra = tiempos.find(t => {
          const tCode = extractCode(t.CodMaterial || t.codigo_material || '');
          return tCode === fertCode;
        });
        const puestoPadre = infoMaestra?.PuestoTrabajo || infoMaestra?.puesto_trabajo || '—';

        // Padding 18 dígitos para SAP (CRÍTICO PARA MATERIAL 30024848)
        const fullCodeForApi = fertCode.padStart(18, '0');

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fullCodeForApi, 1, 1000);
          
          if (response && response.data) {
            const explosionData = Array.isArray(response.data) ? response.data : (response.data.data || []);
            
            explosionData.forEach((comp: any) => {
              const compCode = String(comp.COMPONENTE || '').slice(-8);
              const descRaw = String(comp.DESCRIPCION_COMPONENTE || '').toUpperCase();
              
              if (!compCode) return;
              
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
          logger.error(`Error en BOM para material ${fertCode}:`, err);
        }

        setProgress(prev => ({ ...prev, current: i + 1 }));
      }

      const results = Array.from(consolidatedMap.values()).sort((a, b) => b.totalKG - a.totalKG);
      setGroupedNeeds(results);
      
      if (onMaterialsCalculated) onMaterialsCalculated(results.map(r => r.codigoComponente));
      if (onTotalKgChange) onTotalKgChange(results.reduce((sum, n) => sum + n.totalKG, 0));

    } catch (err) {
      logger.error(`Error crítico en explosión: ${(err as Error).message}`);
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

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">BOOM de Materiales (Recetas Explotadas)</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Sincronización con SAP | Trazabilidad por ID Material</p>
          </div>
        </div>
        <Button 
          onClick={processExplosion} 
          disabled={isProcessing || ordenes.length === 0} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Sincronizar Plan Maestro
        </Button>
      </div>

      {isProcessing && (
        <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100">
          <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            <span>Explotando Niveles de Material...</span>
            <span>{progress.current} / {progress.total} órdenes</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2 bg-indigo-100" />
        </div>
      )}

      {!isProcessing && groupedNeeds.length > 0 ? (
        <div className="border-2 border-gray-50 rounded-2xl overflow-hidden bg-white shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[10px] font-sans">
              <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter">
                <tr>
                  <th className="px-5 py-4 text-left border-r border-white/5">NOMBRECOMPONENTE</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">COMPONENTE</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">NOMBRE (Padre)</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">MATERIAL padre</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">PUESTOTRABAJO</th>
                  <th className="px-5 py-4 text-center border-r border-white/5">UNID</th>
                  <th className="px-5 py-4 text-right bg-black/20">CANTORDEN (KG)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {groupedNeeds.map((group) => (
                  <React.Fragment key={group.codigoComponente}>
                    <tr 
                      className="bg-slate-50 cursor-pointer hover:bg-indigo-50/50 transition-colors"
                      onClick={() => toggleGroup(group.codigoComponente)}
                    >
                      <td className="px-5 py-3 font-black text-slate-800 flex items-center gap-3">
                        <div className="p-1 bg-white rounded-md shadow-sm border border-gray-200">
                          {expandedGroups.has(group.codigoComponente) ? <ChevronDown className="w-3 h-3 text-indigo-600" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
                        </div>
                        {group.nombreComponente}
                      </td>
                      <td className="px-5 py-3 font-mono font-black text-indigo-600">{group.codigoComponente}</td>
                      <td colSpan={3} className="px-5 py-3 text-left font-bold text-gray-300 italic uppercase">Resumen de necesidad por componente</td>
                      <td className="px-5 py-3 text-center font-black text-slate-400">{group.unidad}</td>
                      <td className="px-5 py-3 text-right font-black text-indigo-700 bg-indigo-100/50">
                        {group.totalKG.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>

                    {expandedGroups.has(group.codigoComponente) && group.parents.map((parent, pIdx) => (
                      <tr key={`${group.codigoComponente}-${pIdx}`} className="bg-white hover:bg-blue-50/20 transition-all border-l-4 border-indigo-500">
                        <td className="px-5 py-2"></td>
                        <td className="px-5 py-2 font-mono text-[9px] text-slate-300">{group.codigoComponente}</td>
                        <td className="px-5 py-2 text-left font-black text-slate-600 uppercase tracking-tight">{parent.nombrePadre}</td>
                        <td className="px-5 py-2 text-left font-mono font-black text-slate-400">{parent.materialPadre}</td>
                        <td className="px-5 py-2 text-left">
                          <Badge variant="outline" className="text-[9px] font-black uppercase text-indigo-600 border-indigo-100 bg-indigo-50">
                            {parent.puestoPadre}
                          </Badge>
                        </td>
                        <td className="px-5 py-2 text-center text-slate-300">{group.unidad}</td>
                        <td className="px-5 py-2 text-right font-mono font-bold text-slate-500 italic">
                          {parent.cantidadKG.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !isProcessing && (
        <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100 flex flex-col items-center gap-4">
          <Layers className="w-16 h-16 text-slate-200" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Presione Sincronizar para visualizar la estructura del material 30024848 y otros.</p>
        </div>
      )}

      <div className="px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-600" />
        <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
          Estructura Jerárquica: El Nivel 1 muestra el componente de la receta. El Nivel 2 muestra los materiales padres que lo requieren.
        </p>
      </div>
    </div>
  );
};
