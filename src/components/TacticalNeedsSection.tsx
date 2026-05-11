
'use client';

import React, { useState, useMemo } from 'react';
import { Layers, Loader2, Activity, PlayCircle, Info, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { serviciosService } from '@/services/servicios.service';
import { logger } from '@/services/LogService';

interface TacticalNeedsSectionProps {
  ordenes: any[];
  onTotalKgChange?: (total: number) => void;
  onMaterialsCalculated?: (codes: string[]) => void;
}

interface RawBOMRow {
  NIVEL: number;
  CENTRO: string;
  FERT_PRINCIPAL: string;
  DESCRIPCION_FERT: string;
  MATERIAL_PADRE: string;
  COMPONENTE: string;
  DESCRIPCION_COMPONENTE: string;
  CANTIDAD_UNITARIA: number;
  CANTIDAD_ACUMULADA: number;
  CANTIDAD_EXPLOTADA: number; // Campo calculado: Cant. Acumulada * Cant. Orden
}

/**
 * Utility to ensure numeric values are valid and avoid NaN in React components
 */
const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

export const TacticalNeedsSection: React.FC<TacticalNeedsSectionProps> = ({ 
  ordenes, 
  onTotalKgChange,
  onMaterialsCalculated
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [bomRows, setBomRows] = useState<RawBOMRow[]>([]);

  const extractCode = (matStr: string): string => {
    const match = String(matStr).trim().match(/^(\d+)/);
    return match ? match[1].slice(-8) : String(matStr).slice(-8);
  };

  const processExplosion = async () => {
    if (!ordenes || ordenes.length === 0) {
      logger.warn('[BOOM] No hay órdenes disponibles para la explosión.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setBomRows([]);
    setProgress({ current: 0, total: ordenes.length });

    const consolidatedRows: RawBOMRow[] = [];

    try {
      logger.log(`[BOOM] Iniciando extracción de datos técnicos para ${ordenes.length} órdenes...`);

      for (let i = 0; i < ordenes.length; i++) {
        const order = ordenes[i];
        const fertCodeRaw = order.MATERIAL || order.CodMaterial || '';
        const fertCode = extractCode(fertCodeRaw);
        const centro = String(order.CENTRO || order.Centro || '1000').trim();
        const orderQty = safeNum(order.CANTPROGRAMADA || order.CANTIDAD || 0);

        // Padding 18 dígitos para SAP
        const fullCodeForApi = fertCode.padStart(18, '0');

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fullCodeForApi, 1, 1000);
          
          if (response && response.data) {
            const data = Array.isArray(response.data) ? response.data : (response.data.data || []);
            
            data.forEach((row: any) => {
              const qtyAcum = safeNum(row.CANTIDAD_ACUMULADA || row.CANTIDAD_UNITARIA || 0);
              const cantExplotada = orderQty * qtyAcum;

              consolidatedRows.push({
                NIVEL: safeNum(row.NIVEL),
                CENTRO: String(row.CENTRO || ''),
                FERT_PRINCIPAL: String(row.FERT_PRINCIPAL || '').slice(-8),
                DESCRIPCION_FERT: String(row.DESCRIPCION_FERT || '').toUpperCase(),
                MATERIAL_PADRE: String(row.MATERIAL_PADRE || '').slice(-8),
                COMPONENTE: String(row.COMPONENTE || '').slice(-8),
                DESCRIPCION_COMPONENTE: String(row.DESCRIPCION_COMPONENTE || '').toUpperCase(),
                CANTIDAD_UNITARIA: safeNum(row.CANTIDAD_UNITARIA),
                CANTIDAD_ACUMULADA: qtyAcum,
                CANTIDAD_EXPLOTADA: cantExplotada
              });
            });
          }
        } catch (err) {
          logger.error(`[BOOM] Error en material ${fertCode}`, err);
        }
        setProgress(prev => ({ ...prev, current: i + 1 }));
      }
      setBomRows(consolidatedRows);
      
      if (onMaterialsCalculated) onMaterialsCalculated([...new Set(consolidatedRows.map(r => r.COMPONENTE))]);
      
      if (onTotalKgChange) {
        const total = consolidatedRows.reduce((sum, n) => sum + n.CANTIDAD_EXPLOTADA, 0);
        onTotalKgChange(isNaN(total) ? 0 : total);
      }

      logger.success(`[BOOM] Extracción completada. ${consolidatedRows.length} filas técnicas recuperadas.`);
    } catch (err) {
      logger.error('[BOOM] Error crítico en proceso de explosión', err);
    } finally {
      setIsProcessing(false);
    }
  };

  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
            <Database className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">Lista de Materiales Explotada (BOOM)</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Vista Técnica Cruda | Sin filtros ni agrupaciones adicionales</p>
          </div>
        </div>
        <Button 
          onClick={processExplosion} 
          disabled={isProcessing || ordenes.length === 0} 
          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Explosionar Lista
        </Button>
      </div>

      {isProcessing && (
        <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100">
          <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            <span>Consultando Jerarquías SAP...</span>
            <span>{progress.current} / {progress.total} órdenes</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2 bg-indigo-100" />
        </div>
      )}

      {!isProcessing && bomRows.length > 0 ? (
        <div className="border-2 border-gray-50 rounded-2xl overflow-hidden bg-white shadow-xl">
          <div className="overflow-x-auto max-h-[600px] relative">
            <table className="w-full border-collapse text-[10px] font-sans">
              <thead className="bg-[#0f172a] text-white uppercase font-black tracking-tighter sticky top-0 z-20">
                <tr>
                  <th className="px-5 py-4 text-center border-r border-white/5 w-12">NV</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">NOMBRECOMPONENTE</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">COMPONENTE</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">NOMBRE (Padre)</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">MATERIAL padre</th>
                  <th className="px-5 py-4 text-center border-r border-white/5 w-20">UNID</th>
                  <th className="px-5 py-4 text-right bg-black/20 w-32">CANTORDEN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bomRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-all">
                    <td className="px-5 py-3 border-r border-gray-100 font-black text-slate-400 bg-slate-50/50">
                      {String(row.NIVEL)}
                    </td>
                    <td className="px-5 py-3 font-black text-slate-800 uppercase text-left">{row.DESCRIPCION_COMPONENTE}</td>
                    <td className="px-5 py-3 font-mono font-black text-indigo-600 border-r border-gray-100">{row.COMPONENTE}</td>
                    <td className="px-5 py-3 text-left font-black text-gray-500 uppercase tracking-tight border-r border-gray-100">{row.DESCRIPCION_FERT}</td>
                    <td className="px-5 py-3 text-left font-mono font-black text-slate-400 border-r border-gray-100">{row.MATERIAL_PADRE}</td>
                    <td className="px-5 py-3 text-center font-black text-slate-400 border-r border-gray-100 uppercase tracking-widest">KG</td>
                    <td className="px-5 py-3 text-right font-mono font-black text-indigo-700 bg-indigo-50/20">
                      {row.CANTIDAD_EXPLOTADA.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !isProcessing && (
        <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100 flex flex-col items-center gap-4">
          <Layers className="w-16 h-16 text-slate-200" />
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Presione "Explosionar Lista" para visualizar la estructura de materiales sin filtros.
          </p>
        </div>
      )}

      <div className="px-4 py-2 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-600" />
        <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
          Información Técnica: Los datos mostrados corresponden a la explosión directa de niveles 2, 3 y 4 de SAP. No se aplican agrupaciones para garantizar la integridad de la auditoría.
        </p>
      </div>
    </div>
  );
};
