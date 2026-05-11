'use client';

import React, { useState, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, DatabaseZap, PlayCircle, Info, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { cn } from '@/lib/utils';

interface TacticalNeedsSectionProps {
  ordenes: any[];
}

interface RawBOMRow {
  NIVEL: number;
  COMPONENTE: string;
  DESCRIPCION_COMPONENTE: string;
  FERT_PRINCIPAL: string;
  DESCRIPCION_FERT: string;
  MATERIAL_PADRE: string;
  UNID: string;
  CANTIDAD_EXPLOTADA: number;
}

/**
 * Asegura que los valores numéricos sean válidos para evitar errores de renderizado NaN
 */
const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

/**
 * Limpia y separa código de descripción para materiales raíz
 */
const extractMaterialInfo = (item: any) => {
  const matStr = String(item.MATERIAL || item.Material || item.CodMaterial || '').trim();
  const nameStr = String(item.NOMBRE || item.NombreMaterial || item.Descripcion || '').trim();
  
  // Extraer los últimos 8 dígitos como código base
  const match = matStr.match(/^(\d+)/);
  const code = match ? match[0].slice(-8) : matStr.slice(-8);
  
  // Si nameStr está vacío, intentar limpiar matStr
  let desc = nameStr;
  if (!desc) {
    desc = matStr.replace(/^0+/, '').replace(/^\d+\s*/, '').trim();
  }
  if (!desc || desc === code) desc = 'PRODUCTO TERMINADO';
  
  return { code, desc: desc.toUpperCase() };
};

export const TacticalNeedsSection: React.FC<TacticalNeedsSectionProps> = ({ ordenes }) => {
  const inspector = useRuntimeInspector('TacticalNeedsSection');
  const { addNotification } = useAppContext();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [bomRows, setBomRows] = useState<RawBOMRow[]>([]);

  const processExplosion = async () => {
    if (!ordenes || ordenes.length === 0) {
      addNotification('warning', 'No hay órdenes disponibles para procesar la explosión.');
      return;
    }

    setIsProcessing(true);
    setBomRows([]);
    setProgress({ current: 0, total: ordenes.length });

    const allExplodedRows: RawBOMRow[] = [];

    try {
      logger.log(`[BOOM] Iniciando explosión técnica de ${ordenes.length} materiales...`);

      for (let i = 0; i < ordenes.length; i++) {
        const order = ordenes[i];
        const { code: rootCode, desc: rootDesc } = extractMaterialInfo(order);
        const centro = String(order.CENTRO || order.Centro || '1000').trim();
        const orderQty = safeNum(order.CANTIDAD || order.CANTPROGRAMADA || 0);

        // AGREGAR NIVEL 1 (EL PADRE DE LA ORDEN PROVISIONAL)
        allExplodedRows.push({
          NIVEL: 1,
          COMPONENTE: rootCode,
          DESCRIPCION_COMPONENTE: rootDesc,
          FERT_PRINCIPAL: rootCode,
          DESCRIPCION_FERT: '---',
          MATERIAL_PADRE: '---',
          UNID: 'KG',
          CANTIDAD_EXPLOTADA: orderQty
        });

        // Padding 18 dígitos para consulta SAP
        const fullCodeForApi = rootCode.padStart(18, '0');

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fullCodeForApi, 1, 1000);
          
          if (response && response.data) {
            const data = Array.isArray(response.data) ? response.data : (response.data.data || []);
            
            data.forEach((row: any) => {
              const level = safeNum(row.NIVEL);
              if (level < 2) return; // Ignorar niveles 0, 1 (ya manejados) o inválidos

              // Usar CANTIDAD_ACUMULADA para obtener el factor real desde la raíz
              const factor = safeNum(row.CANTIDAD_ACUMULADA || row.CANTIDAD_UNITARIA || 0);
              const cantExplotada = orderQty * factor;

              allExplodedRows.push({
                NIVEL: level,
                COMPONENTE: String(row.COMPONENTE || '').replace(/^0+/, '').slice(-8),
                DESCRIPCION_COMPONENTE: String(row.DESCRIPCION_COMPONENTE || 'SIN DESCRIPCIÓN').toUpperCase(),
                FERT_PRINCIPAL: String(row.FERT_PRINCIPAL || rootCode).replace(/^0+/, '').slice(-8),
                DESCRIPCION_FERT: String(row.DESCRIPCION_FERT || rootDesc).toUpperCase(),
                MATERIAL_PADRE: String(row.MATERIAL_PADRE || '').replace(/^0+/, '').slice(-8) || '---',
                UNID: 'KG',
                CANTIDAD_EXPLOTADA: cantExplotada
              });
            });
          }
        } catch (err) {
          logger.warn(`[BOOM] Error al explotar material ${rootCode}: ${(err as Error).message}`);
        }
        setProgress(prev => ({ ...prev, current: i + 1 }));
      }
      
      setBomRows(allExplodedRows);
      logger.success(`[BOOM] Explosión terminada. ${allExplodedRows.length} registros técnicos generados.`);
    } catch (err) {
      logger.error(`Error crítico en explosión: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">BOOM de Lista de Materiales</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Jerarquía Cruda (Niveles 1-5) | Explosión Jerárquica Completa</p>
          </div>
        </div>
        <Button 
          onClick={processExplosion} 
          disabled={isProcessing || ordenes.length === 0} 
          className="bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Sincronizar Plan Maestro
        </Button>
      </div>

      {isProcessing && (
        <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100">
          <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Explotando Recetas en SAP...
            </span>
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
                  <th className="px-5 py-4 text-center border-r border-white/5 w-16">NV</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">NOMBRECOMPONENTE</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">COMPONENTE</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">NOMBRE (PADRE)</th>
                  <th className="px-5 py-4 text-left border-r border-white/5">MATERIAL PADRE</th>
                  <th className="px-5 py-4 text-center border-r border-white/5 w-20">UNID</th>
                  <th className="px-5 py-4 text-right bg-black/20 w-32">CANTORDEN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bomRows.map((row, idx) => (
                  <tr key={idx} className={cn("hover:bg-gray-50 transition-all group", row.NIVEL === 1 ? "bg-indigo-50/20 font-bold" : "")}>
                    <td className={cn(
                      "px-5 py-3 border-r border-gray-100 font-black text-center",
                      row.NIVEL === 1 ? "text-indigo-600" : "text-slate-400"
                    )}>
                      {String(row.NIVEL)}
                    </td>
                    <td className="px-5 py-3 font-black text-slate-800 uppercase text-left">{row.DESCRIPCION_COMPONENTE}</td>
                    <td className="px-5 py-3 font-mono font-black text-indigo-600 border-r border-gray-100">{row.COMPONENTE}</td>
                    <td className="px-5 py-3 text-left font-black text-gray-400 uppercase tracking-tight border-r border-gray-100">{row.DESCRIPCION_FERT}</td>
                    <td className="px-5 py-3 text-left font-mono font-black text-slate-400 border-r border-gray-100">{row.MATERIAL_PADRE}</td>
                    <td className="px-5 py-3 text-center font-black text-slate-400 border-r border-gray-100 uppercase tracking-widest">{row.UNID}</td>
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
        <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100">
          <DatabaseZap className="w-16 h-16 text-indigo-100 mx-auto" />
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Sincronice el plan maestro para visualizar la estructura técnica completa (Niveles 1-5)</p>
        </div>
      )}

      <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-600" />
        <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
          Nota: Se muestra el 100% de la jerarquía técnica sin filtros ni agrupaciones. El Nivel 1 representa el material raíz de la orden provisional; los niveles 2-5 son componentes de la receta de SAP.
        </p>
      </div>
    </div>
  );
};
