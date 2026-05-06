'use client';

import React, { useState, useMemo } from 'react';
import { RefreshCw, Layers, Package, Search, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TacticalNeedsSectionProps {
  ordenes: any[];
  tiempos: any[];
}

export const TacticalNeedsSection: React.FC<TacticalNeedsSectionProps> = ({ ordenes, tiempos }) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Simulación de cruce de datos para el esquema de visualización
  // En una implementación real, esto consultaría un endpoint de explosión por lote de órdenes
  const groupedNeeds = useMemo(() => {
    const map = new Map<string, { 
      nombreComponente: string; 
      codigoComponente: string; 
      items: { material: string; nombre: string; puestoTrabajo: string; cantidad: number }[] 
    }>();

    ordenes.forEach(o => {
      const matStr = String(o.MATERIAL || o.Material || '').trim();
      const code = matStr.match(/^\d+/)?.[0]?.slice(-8) || matStr.slice(-8);
      const nombre = String(o.NOMBRE || o.NombreMaterial || '').trim();
      
      // Buscamos el puesto de trabajo en el catálogo de tiempos
      const infoTiempo = tiempos.find(t => String(t.CodMaterial || '').includes(code));
      const puesto = infoTiempo?.PuestoTrabajo || '—';

      // Para el ejemplo, simulamos que el componente es una lámina derivada del nombre
      // En producción, esto vendría de la tabla MaestroMaterialesExplosion
      const compNombre = nombre.includes('RESTONIC') ? 'LAMINA CILINDRICA D 12 SL 214X0.4' : 
                         nombre.includes('ZAFIRO') ? 'LAMINA CILINDRICA D 15 AM 200X140X0.8' : 
                         'LAMINA PROCESO LAMINADO ESTANDAR';
      
      const compCode = compNombre.includes('D 12') ? '30004183' : '30007712';

      if (!map.has(compCode)) {
        map.set(compCode, { nombreComponente: compNombre, codigoComponente: compCode, items: [] });
      }

      const entry = map.get(compCode)!;
      entry.items.push({
        material: code,
        nombre: nombre,
        puestoTrabajo: puesto,
        cantidad: Number(o.CANTPROGRAMADA || o.CANTIDAD || 0)
      });
    });

    return Array.from(map.values());
  }, [ordenes, tiempos]);

  const toggleGroup = (id: string) => {
    const next = new Set(expandedGroups);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedGroups(next);
  };

  const handleSync = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
      // Aquí se dispararía la carga real si existiera el endpoint de explosión por lote
    }, 1500);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#9db65b]/20 rounded-xl text-[#6d7f3f]"><Layers className="w-5 h-5" /></div>
          <div>
            <h3 className="text-sm font-bold text-gray-800 uppercase">Cálculo de Necesidades por Componente</h3>
            <p className="text-[10px] text-gray-500 font-medium">Explosión de órdenes activas para el Centro 1000</p>
          </div>
        </div>
        <Button 
          onClick={handleSync} 
          disabled={isSyncing}
          className="bg-[#9db65b] hover:bg-[#8aa14d] text-white rounded-xl h-9 px-6 text-[10px] font-black uppercase tracking-widest transition-all shadow-md shadow-[#9db65b]/20"
        >
          {isSyncing ? <RefreshCw className="w-3 h-3 animate-spin mr-2" /> : <RefreshCw className="w-3 h-3 mr-2" />}
          Sincronizar Necesidades
        </Button>
      </div>

      <div className="border rounded-2xl overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px] font-sans">
            <thead className="bg-[#9db65b] text-white uppercase font-black tracking-tighter">
              <tr>
                <th className="px-4 py-3 text-left w-[35%]">Nombre Componente</th>
                <th className="px-4 py-3">Componente</th>
                <th className="px-4 py-3 text-left w-[30%]">Nombre (Padre)</th>
                <th className="px-4 py-3">Material (Padre)</th>
                <th className="px-4 py-3">Puesto Trabajo</th>
              </tr>
            </thead>
            <tbody>
              {groupedNeeds.map((group) => (
                <React.Fragment key={group.codigoComponente}>
                  {/* Fila de Encabezado de Grupo */}
                  <tr 
                    className="bg-[#e9edc9]/40 border-b border-[#9db65b]/20 cursor-pointer hover:bg-[#e9edc9]/60 transition-colors"
                    onClick={() => toggleGroup(group.codigoComponente)}
                  >
                    <td className="px-4 py-2 font-bold text-[#4a542a] flex items-center gap-2">
                      {expandedGroups.has(group.codigoComponente) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                      {group.nombreComponente}
                    </td>
                    <td className="px-4 py-2 font-black text-center text-[#6d7f3f]">{group.codigoComponente}</td>
                    <td colSpan={3}></td>
                  </tr>

                  {/* Filas de Detalle (Expandibles) */}
                  {expandedGroups.has(group.codigoComponente) && group.items.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2 text-center text-gray-400 font-mono">{group.codigoComponente}</td>
                      <td className="px-4 py-2 text-left uppercase text-gray-500 font-medium">{item.nombre}</td>
                      <td className="px-4 py-2 text-center font-bold text-gray-400">{item.material}</td>
                      <td className="px-4 py-2 text-center font-black text-slate-400">{item.puestoTrabajo}</td>
                    </tr>
                  ))}

                  {/* Fila de Total del Grupo */}
                  <tr className="bg-[#f8f9f1] border-b border-[#9db65b]/10 text-[#6d7f3f] font-black">
                    <td colSpan={5} className="px-4 py-1.5 italic">
                      Total {group.nombreComponente}: {group.items.reduce((acc, i) => acc + i.cantidad, 0).toLocaleString()} unidades
                    </td>
                  </tr>
                </React.Fragment>
              ))}
              {groupedNeeds.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-20 text-center text-gray-400 uppercase font-black tracking-widest opacity-30">
                    No hay datos sincronizados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
