'use client';

import React, { useState, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, DatabaseZap, PlayCircle, AlertCircle, FileText, Search, Activity, Scissors, Box } from 'lucide-react';
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
  unidad: string;
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

    try {
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
              const unitRaw = "KG"; // Forzado a KG
              
              if (!compCode) return;
              if (!descRaw.includes('LAMINA CILINDRICA') && !descRaw.includes('BLOQUE FORMULADO')) return;

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
                  unidad: unitRaw,
                  cantidadTotal: totalNeeded,
                  unidadesOriginales: unitaryQty,
                  conteoOrdenes: 1
                });
              }
            });
          }
        } catch (err) {
          console.warn(`Error en material ${fertCode}:`, err);
        }
        setProgress(prev => ({ ...prev, current: i + 1 }));
      }
      setRequirements(Array.from(consolidatedMap.values()).sort((a, b) => b.cantidadTotal - a.cantidadTotal));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const laminas = useMemo(() => requirements.filter(r => r.descripcion.includes('LAMINA CILINDRICA')), [requirements]);
  const bloques = useMemo(() => requirements.filter(r => r.descripcion.includes('BLOQUE FORMULADO')), [requirements]);

  const renderTable = (items: ComponentRequirement[], title: string, icon: any, headerClass: string) => (
    <div className="space-y-3">
      <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center gap-2">
        {React.createElement(icon, { className: "w-3 h-3" })}
        {title}
      </h4>
      <div className="border-2 border-gray-50 rounded-2xl overflow-hidden bg-white shadow-xl">
        <div className="overflow-x-auto max-h-[400px] relative">
          <table className="w-full border-collapse text-[10px] font-sans">
            <thead className={cn("text-white sticky top-0 z-20", headerClass)}>
              <tr className="uppercase font-black tracking-tighter">
                <th className="px-6 py-5 text-left border-r border-white/5 w-32">Componente</th>
                <th className="px-6 py-5 text-left border-r border-white/5">Descripción del Material</th>
                <th className="px-4 py-5 border-r border-white/5 w-20">UM</th>
                <th className="px-4 py-5 border-r border-white/5 w-24">Hits</th>
                <th className="px-8 py-5 text-right bg-black/10 w-48">Necesidad (KG)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-all group">
                  <td className="px-6 py-4 border-r border-dashed border-gray-100">
                    <Badge variant="outline" className="font-mono font-black text-slate-600 text-[10px] border-slate-200 bg-slate-50">
                      {item.codigo}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 border-r border-dashed border-gray-100 text-left font-black text-gray-700 uppercase tracking-tight">
                    {item.descripcion}
                  </td>
                  <td className="px-4 py-4 border-r border-dashed border-gray-100">
                    <span className="font-black text-slate-400">{item.unidad}</span>
                  </td>
                  <td className="px-4 py-4 border-r border-dashed border-gray-100">
                    <span className="font-black text-gray-900">{item.conteoOrdenes}</span>
                  </td>
                  <td className="px-8 py-4 text-right font-mono font-black text-slate-700 bg-slate-50/10">
                    {item.cantidadTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 text-left p-6 bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Maestro de Componentes Críticos (Explosión)</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Segmentado: Láminas y Bloques | Consolidado en KG</p>
          </div>
        </div>

        <Button onClick={processExplosion} disabled={isProcessing || ordenes.length === 0} className="rounded-xl px-8 bg-indigo-600 font-black uppercase text-[10px] tracking-widest h-11">
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Explosión BOM
        </Button>
      </div>

      {isProcessing && (
        <div className="space-y-3 bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
          <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Sincronizando BOM
            </span>
            <span>{progress.current} / {progress.total} órdenes</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2 bg-indigo-100" />
        </div>
      )}

      {!isProcessing && requirements.length > 0 ? (
        <div className="space-y-10">
          {laminas.length > 0 && renderTable(laminas, "Segmento A: Láminas Cilíndricas", Scissors, "bg-slate-800")}
          {bloques.length > 0 && renderTable(bloques, "Segmento B: Bloques Formulados", Box, "bg-indigo-900")}
        </div>
      ) : !isProcessing && (
        <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100">
          <DatabaseZap className="w-16 h-16 text-indigo-100 mx-auto" />
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Inicie la explosión técnica</p>
        </div>
      )}
    </div>
  );
};