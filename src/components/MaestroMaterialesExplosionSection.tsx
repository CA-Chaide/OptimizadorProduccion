'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, DatabaseZap, Search, X, PlayCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";

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
          // Consultar API para cada material único en el plan
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fertCode, 1, 1000);
          
          if (response && response.data) {
            const explosionData = Array.isArray(response.data) ? response.data : (response.data.data || []);
            
            explosionData.forEach((comp: any) => {
              const compCode = String(comp.COMPONENTE || '').slice(-8);
              if (!compCode) return;

              const unitaryQty = Number(comp.CANTIDAD_UNITARIA || 0);
              const totalNeeded = orderQty * unitaryQty;

              if (consolidatedMap.has(compCode)) {
                const existing = consolidatedMap.get(compCode)!;
                existing.cantidadTotal += totalNeeded;
                existing.conteoOrdenes += 1;
              } else {
                consolidatedMap.set(compCode, {
                  codigo: compCode,
                  descripcion: String(comp.DESCRIPCION_COMPONENTE || '—'),
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
      logger.log(`[ExplosionBOM] Consolidación completada en ${duration}s. ${results.length} componentes identificados.`);
      inspector.captureVariable('consolidatedRequirements', results.length);
      addNotification('success', `Explosión completada. Se identificaron ${results.length} componentes necesarios.`);

    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      addNotification('error', `Error en la explosión masiva: ${msg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 text-left p-6 bg-white rounded-2xl border border-gray-50 shadow-sm">
      {/* Header Informativo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 uppercase tracking-tight">Explosión Masiva de Materiales</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
              Cálculo de componentes basado en {ordenes.length} órdenes provisionales
            </p>
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
          {isProcessing ? 'Procesando...' : 'Calcular Necesidades BOM'}
        </Button>
      </div>

      {/* Monitor de Progreso */}
      {isProcessing && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-500">
          <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            <span>Procesando Explosión Técnica</span>
            <span>{progress.current} / {progress.total} órdenes</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2 bg-indigo-50" />
        </div>
      )}

      {/* Estados de la Tabla */}
      {!isProcessing && requirements.length === 0 ? (
        <div className="py-24 text-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100 space-y-4">
          <DatabaseZap className="w-12 h-12 text-indigo-200 mx-auto" />
          <div className="max-w-sm mx-auto">
            <h3 className="text-sm font-bold text-gray-600 uppercase tracking-tight">Consolidación de Materiales</h3>
            <p className="text-xs text-gray-400 mt-1 mb-6">Presione el botón superior para realizar la explosión BOM de las órdenes provisionales actuales.</p>
          </div>
        </div>
      ) : (
        <div className={cn("border rounded-2xl overflow-hidden bg-white shadow-sm border-gray-100", isProcessing && "opacity-50 pointer-events-none")}>
          <div className="overflow-x-auto max-h-[600px] relative">
            <table className="w-full border-collapse text-[10px] font-sans">
              <thead className="bg-slate-900 text-white sticky top-0 z-10">
                <tr className="uppercase font-black tracking-tighter">
                  <th className="px-4 py-4 text-left border-r border-white/10 w-24">Componente</th>
                  <th className="px-6 py-4 text-left border-r border-white/10">Descripción del Material (Componente)</th>
                  <th className="px-4 py-4 border-r border-white/10">Nro. Órdenes</th>
                  <th className="px-6 py-4 text-right bg-indigo-600">Total Necesario (Calculado)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requirements.map((item, idx) => (
                  <tr key={`${idx}-${item.codigo}`} className="hover:bg-indigo-50/20 transition-all">
                    <td className="px-4 py-3 border-r border-dashed border-gray-100 font-mono font-black text-indigo-600 tracking-tighter">
                      {item.codigo}
                    </td>
                    <td className="px-6 py-3 border-r border-dashed border-gray-100 text-left font-black text-gray-700 uppercase tracking-tight">
                      {item.descripcion}
                    </td>
                    <td className="px-4 py-3 border-r border-dashed border-gray-100 font-bold text-gray-400">
                      {item.conteoOrdenes} <span className="text-[8px] opacity-50 ml-1">COINCIDENCIAS</span>
                    </td>
                    <td className="px-6 py-3 text-right font-mono font-black text-indigo-700 bg-indigo-50/30 text-xs">
                      {item.cantidadTotal.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 sticky bottom-0 border-t border-gray-200">
                <tr className="font-black text-slate-800 uppercase text-[11px]">
                  <td colSpan={2} className="px-6 py-4 text-right">Totales Consolidados:</td>
                  <td className="px-4 py-4 text-center">{requirements.length} Items</td>
                  <td className="px-6 py-4 text-right text-indigo-600 bg-indigo-100/50">
                    {requirements.reduce((acc, i) => acc + i.cantidadTotal, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
