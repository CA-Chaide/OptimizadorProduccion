'use client';

import React, { useState, useMemo } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useRuntimeInspector } from '@/services/RuntimeInspector';
import { logger } from '@/services/LogService';
import { useAppContext } from '@/context/AppProvider';
import { ClipboardList, Loader2, DatabaseZap, PlayCircle, Info, Activity, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from "@/components/ui/progress";
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface TacticalNeedsSectionProps {
  ordenes: any[];
  onTotalKgChange?: (total: number) => void;
  onMaterialsCalculated?: (materials: string[]) => void;
}

interface BOMRow {
  nv: string;
  nombreComponente: string;
  componente: string;
  nombrePadre: string;
  materialPadre: string;
  unid: string;
  cantOrden: number;
}

const safeNum = (val: any): number => {
  const n = Number(val);
  return isNaN(n) ? 0 : n;
};

const cleanCode = (code: string): string => {
  return String(code || '').replace(/^0+/, '').slice(-8);
};

export const TacticalNeedsSection: React.FC<TacticalNeedsSectionProps> = ({ 
  ordenes,
  onTotalKgChange,
  onMaterialsCalculated
}) => {
  const inspector = useRuntimeInspector('TacticalNeedsSection');
  const { addNotification } = useAppContext();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [bomRows, setBomRows] = useState<BOMRow[]>([]);
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const processExplosion = async () => {
    if (!ordenes || ordenes.length === 0) {
      addNotification('warning', 'No hay órdenes disponibles para procesar la explosión.');
      return;
    }

    setIsProcessing(true);
    setBomRows([]);
    setCurrentPage(1);
    setProgress({ current: 0, total: ordenes.length });

    const allRows: BOMRow[] = [];
    const uniqueMaterials = new Set<string>();
    let totalKg = 0;

    try {
      logger.log(`[BOOM] Iniciando explosión jerárquica de ${ordenes.length} órdenes...`);

      for (let i = 0; i < ordenes.length; i++) {
        const order = ordenes[i];
        const matRaw = String(order.MATERIAL || order.Material || order.CodMaterial || '').trim();
        const match = matRaw.match(/^(\d+)/);
        const fertCode = match ? match[1] : matRaw;
        const centro = String(order.CENTRO || order.Centro || '1000').trim();
        const orderQty = safeNum(order.CANTIDAD || order.CANTPROGRAMADA || 0);

        // Consultar Explosión Multinivel (1-5) en SAP
        const fullCodeForApi = fertCode.padStart(18, '0');

        try {
          const response = await serviciosService.getMaestroMaterialesExplosion(centro, fullCodeForApi, 1, 1000);
          const data = response?.data || response?.data?.data || [];

          if (Array.isArray(data)) {
            data.forEach((row: any) => {
              const factor = safeNum(row.CANTIDAD_ACUMULADA || row.CANTIDAD_UNITARIA || 0);
              const cantExplotada = orderQty * factor;
              const componentCode = cleanCode(row.COMPONENTE);
              
              if (componentCode) uniqueMaterials.add(componentCode);
              totalKg += cantExplotada;

              allRows.push({
                nv: String(safeNum(row.NIVEL)),
                nombreComponente: String(row.DESCRIPCION_COMPONENTE || 'SIN DESCRIPCIÓN').toUpperCase(),
                componente: componentCode,
                nombrePadre: String(row.DESCRIPCION_FERT || '---').toUpperCase(),
                materialPadre: cleanCode(row.MATERIAL_PADRE),
                unid: 'KG',
                cantOrden: cantExplotada
              });
            });
          }
        } catch (err) {
          logger.warn(`[BOOM] Error en material ${fertCode}: ${(err as Error).message}`);
        }
        setProgress(prev => ({ ...prev, current: i + 1 }));
      }
      
      setBomRows(allRows);
      if (onTotalKgChange) onTotalKgChange(totalKg);
      if (onMaterialsCalculated) onMaterialsCalculated(Array.from(uniqueMaterials));

      logger.success(`[BOOM] Explosión técnica completada. ${allRows.length} registros cargados.`);
      inspector.captureVariable('totalRows', allRows.length);
    } catch (err) {
      logger.error(`Error crítico en explosión: ${(err as Error).message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Lógica de Paginación
  const totalPages = Math.max(1, Math.ceil(bomRows.length / rowsPerPage));
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return bomRows.slice(start, start + rowsPerPage);
  }, [bomRows, currentPage, rowsPerPage]);

  return (
    <div className="space-y-6 text-left">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600/10 rounded-2xl text-indigo-600">
            <ClipboardList className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tighter">BOOM de Lista de Materiales</h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Explosión Jerárquica SAP | Niveles 1-5 | Lista Paginada</p>
          </div>
        </div>
        <Button 
          onClick={processExplosion} 
          disabled={isProcessing || ordenes.length === 0} 
          className="bg-[#0f172a] hover:bg-slate-800 text-white rounded-xl h-11 px-8 text-[10px] font-black uppercase tracking-widest transition-all shadow-lg"
        >
          {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <PlayCircle className="w-4 h-4 mr-2" />}
          Procesar Explosión Técnica
        </Button>
      </div>

      {isProcessing && (
        <div className="space-y-3 bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100">
          <div className="flex justify-between items-center text-[10px] font-black text-indigo-600 uppercase tracking-widest">
            <span className="flex items-center gap-2">
              <Activity className="w-3 h-3" />
              Sincronizando Recetas con SAP...
            </span>
            <span>{progress.current} / {progress.total} órdenes</span>
          </div>
          <Progress value={(progress.current / progress.total) * 100} className="h-2 bg-indigo-100" />
        </div>
      )}

      {!isProcessing && bomRows.length > 0 ? (
        <div className="space-y-4">
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
                  {paginatedRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50 transition-all group">
                      <td className={cn(
                        "px-5 py-3 border-r border-gray-100 font-black text-center",
                        row.nv === "1" ? "bg-green-100 text-green-700" : 
                        row.nv === "2" ? "bg-blue-100 text-blue-700" : "text-slate-400"
                      )}>
                        {row.nv === "1" ? ".1" : row.nv === "2" ? "..2" : `...${row.nv}`}
                      </td>
                      <td className="px-5 py-3 font-black text-slate-800 uppercase text-left">{row.nombreComponente}</td>
                      <td className="px-5 py-3 font-mono font-black text-indigo-600 border-r border-gray-100">{row.componente}</td>
                      <td className="px-5 py-3 text-left font-black text-gray-400 uppercase tracking-tight border-r border-gray-100">{row.nombrePadre}</td>
                      <td className="px-5 py-3 text-left font-mono font-black text-slate-400 border-r border-gray-100">{row.materialPadre}</td>
                      <td className="px-5 py-3 text-center font-black text-slate-400 border-r border-gray-100 uppercase tracking-widest">{row.unid}</td>
                      <td className="px-5 py-3 text-right font-mono font-black text-indigo-700 bg-indigo-50/20">
                        {row.cantOrden.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Controles de Paginación */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-black uppercase text-gray-400">Filas por página:</span>
              <select 
                value={rowsPerPage} 
                onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {[20, 50, 100, 250].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
              <span className="text-[10px] font-black uppercase text-gray-400">
                Mostrando {Math.min(bomRows.length, (currentPage-1)*rowsPerPage + 1)}-{Math.min(bomRows.length, currentPage*rowsPerPage)} de {bomRows.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="h-8 w-8 rounded-xl"><ChevronsLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="h-8 w-8 rounded-xl"><ChevronLeft className="h-4 w-4" /></Button>
              <div className="flex items-center gap-1 px-4">
                <span className="text-[10px] font-black text-gray-700 uppercase">Página {currentPage} / {totalPages}</span>
              </div>
              <Button variant="outline" size="icon" onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="h-8 w-8 rounded-xl"><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="h-8 w-8 rounded-xl"><ChevronsRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      ) : !isProcessing && (
        <div className="py-24 text-center bg-gray-50/30 rounded-3xl border-2 border-dashed border-gray-100">
          <DatabaseZap className="w-16 h-16 text-indigo-100 mx-auto" />
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-4">Inicie la explosión técnica para visualizar la jerarquía técnica de materiales</p>
        </div>
      )}

      <div className="px-4 py-3 bg-blue-50 border border-blue-100 rounded-xl flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-600" />
        <p className="text-[9px] font-black text-blue-700 uppercase tracking-widest">
          Nota: Visualización íntegra de componentes según el método de explosión técnica multinivel de SAP.
        </p>
      </div>
    </div>
  );
};
