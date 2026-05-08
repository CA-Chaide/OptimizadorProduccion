'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, DatabaseZap, PlayCircle, AlertCircle, FileText, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface MaestroMaterialesExplosionSectionProps {
  ordenes: any[];
}

interface ComponentRequirement {
  codigo: string;
  descripcion: string;
  cantidadTotal: number;
  unidadesOriginales: number;
  conteoOrdenes: number;
}

export const MaestroMaterialesExplosionSection: React.FC<MaestroMaterialesExplosionSectionProps> = ({ ordenes }) => {
  const inspector = useRuntimeInspector('ExplosionMasivaBOM');
  const { addNotification } = useAppContext();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [requirements, setRequirements] = useState<ComponentRequirement[]>([]);
  const [error, setError] = useState<string | null>(null);

  const extractCode = (matStr: string): string => {
    const match = String(matStr).trim().match(/^(\d+)/);
    return match ? match[1].slice(-8) : String(matStr).slice(-8);
  };

  const processExplosion = async () => {
    if (!ordenes || ordenes.length === 0) {
      addNotification('warning', 'No hay órdenes provisionales para procesar.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setRequirements([]);
    setProgress({ current: 0, total: ordenes.length });

    const consolidatedMap = new Map<string, ComponentRequirement>();
    const startTime = Date.now();

    try {
      logger.log(`[ExplosionBOM] Iniciando procesamiento de ${ordenes.length} órdenes...`);

      for (let i = 0; i < ordenes.length; i++) {
        const order = ordenes[i];
        const fertCode = extractCode(order.MATERIAL || order.CodMaterial || '');
        const centro = String(order.CENTRO || order.Centro || '1000').trim();
        const orderQty = Number(order.CANTPROGRAMADA || order.CANTIDAD || 0);

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fertCode, 1, 1000);
          
          if (response && response.data) {
            const explosionData = Array.isArray(response.data) ? response.data : (response.data.data || []);
            
            explosionData.forEach((comp: any) => {
              const compCode = String(comp.COMPONENTE || '').slice(-8);
              const descRaw = String(comp.DESCRIPCION_COMPONENTE || '').toUpperCase();
              
              if (!compCode) return;

              // FILTRO SOLICITADO: Solo "LAMINA CILINDRICA"
              if (!descRaw.includes('LAMINA CILINDRICA')) return;

              const unitaryQty = Number(comp.CANTIDAD_UNITARIA || 0);
              const totalNeeded = orderQty * unitaryQty;

              if (consolidatedMap.has(compCode)) {
                const existing = consolidatedMap.get(compCode)!;
                existing.cantidadTotal += totalNeeded;
                existing.conteoOrdenes += 1;
              } else {
                consolidatedMap.set(compCode, {
                  codigo: compCode,
                  descripcion: descRaw,
                  cantidadTotal: totalNeeded,
                  unidadesOriginales: unitaryQty,
                  conteoOrdenes: 1
                });
              }
            });
          }
        } catch (err) {
          console.warn(`Error procesando material ${fertCode}:`, err);
        }

        setProgress(prev => ({ ...prev, current: i + 1 }));
      }

      const results = Array.from(consolidatedMap.values()).sort((a, b) => b.cantidadTotal - a.cantidadTotal);
      setRequirements(results);
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.log(`[ExplosionBOM] Consolidación completada en ${duration}s. ${results.length} láminas cilíndricas identificadas.`);
      inspector.captureVariable('consolidatedLaminaRequirements', results.length);
      addNotification('success', `Explosión completada. Se identificaron ${results.length} tipos de láminas cilíndricas.`);

    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      addNotification('error', `Error en la explosión masiva: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 text-left p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
      {/* Header Informativo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Maestro de Materiales (Explosión BOM)</h3>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="bg-slate-100 text-slate-600 font-bold border-slate-200 text-[9px] uppercase tracking-wider">
                Filtro: LAMINA CILINDRICA
              </Badge>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                {ordenes.length} órdenes procesadas
              </p>
            </div>
          </div>
        </div>

        <Button 
          onClick={processExplosion}
          disabled={isProcessing || ordenes.length === 0}
          className="rounded-xl px-8 bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 font-black uppercase text-[10px] tracking-widest h-11"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <PlayCircle className="w-4 h-4 mr-2" />
          )}
          {isProcessing ? 'Calculando Explosión...' : 'Ejecutar Explosión BOM'}
        </Button>
      </div>

      {/* Monitor de Progreso */}
      {isProcessing && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-500 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
          <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Sincronizando Componentes Técnicos
            </span>
            <span>{progress.current} / {progress.total} órdenes</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2 bg-indigo-100" />
        </div>
      )}

      {/* Estados de la Tabla */}
      {!isProcessing && requirements.length === 0 ? (
        <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100 space-y-6">
          <div className="relative inline-block">
             <DatabaseZap className="w-16 h-16 text-indigo-100 mx-auto" />
             <Search className="w-6 h-6 text-indigo-400 absolute bottom-0 right-0 animate-bounce" />
          </div>
          <div className="max-w-sm mx-auto">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Análisis de Láminas Cilindricas</h3>
            <p className="text-xs text-gray-400 mt-2 mb-6">Inicie la explosión para identificar los requerimientos de láminas cilíndricas en el plan actual.</p>
          </div>
        </div>
      ) : (
        <div className={cn("border-2 border-gray-50 rounded-2xl overflow-hidden bg-white shadow-xl", isProcessing && "opacity-50 pointer-events-none")}>
          <div className="overflow-x-auto max-h-[600px] relative">
            <table className="w-full border-collapse text-[10px] font-sans">
              <thead className="bg-slate-900 text-white sticky top-0 z-20">
                <tr className="uppercase font-black tracking-tighter">
                  <th className="px-6 py-5 text-left border-r border-white/5 w-32">Componente</th>
                  <th className="px-6 py-5 text-left border-r border-white/5">Descripción del Material (Componente)</th>
                  <th className="px-6 py-5 border-r border-white/5 w-24">Órdenes</th>
                  <th className="px-8 py-5 text-right bg-indigo-600 w-48">Necesidad Total (U)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requirements.map((item, idx) => (
                  <tr key={`${idx}-${item.codigo}`} className="hover:bg-indigo-50/30 transition-all group">
                    <td className="px-6 py-4 border-r border-dashed border-gray-100">
                      <Badge variant="outline" className="font-mono font-black text-indigo-600 text-[10px] border-indigo-100 bg-indigo-50 group-hover:bg-indigo-100 transition-colors">
                        {item.codigo}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-100 text-left font-black text-gray-700 uppercase tracking-tight">
                      {item.descripcion}
                    </td>
                    <td className="px-6 py-4 border-r border-dashed border-gray-100">
                      <div className="flex flex-col items-center">
                        <span className="font-black text-gray-900">{item.conteoOrdenes}</span>
                        <span className="text-[7px] font-bold text-gray-400 uppercase tracking-tighter">Hits BOM</span>
                      </div>
                    </td>
                    <td className="px-8 py-4 text-right font-mono font-black text-indigo-700 bg-indigo-50/10 text-xs">
                      {item.cantidadTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-900 sticky bottom-0 z-20">
                <tr className="font-black text-white uppercase text-[11px]">
                  <td colSpan={2} className="px-6 py-5 text-right border-r border-white/5">
                    <div className="flex items-center justify-end gap-2">
                      <FileText className="w-4 h-4 text-indigo-400" />
                      Resumen Consolidado de Láminas:
                    </div>
                  </td>
                  <td className="px-6 py-5 text-center border-r border-white/5 font-mono">
                    {requirements.length} <span className="text-[8px] block opacity-50">SKUS</span>
                  </td>
                  <td className="px-8 py-5 text-right text-white bg-indigo-600 font-mono text-xs">
                    {requirements.reduce((acc, i) => acc + i.cantidadTotal, 0).toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-500" />
          <p className="text-xs font-bold text-red-700 uppercase tracking-tight">Fallo en la rutina de explosión: {error}</p>
        </div>
      )}
    </div>
  );
};
