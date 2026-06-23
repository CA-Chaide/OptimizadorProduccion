'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  LayoutGrid, 
  Download, 
  AlertCircle,
  Loader2,
  Building2
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import { serviciosService } from '@/services/servicios.service';

interface MaterialBalanceoRow {
  id: string;
  centro: string;
  linea: string;
  material: string;
  descripcion: string;
  habilitado: boolean;
  minimo: number;
  maximo: number;
}

interface DisplayRow extends MaterialBalanceoRow {
  puestoTrabajo: string;
  tiempoMin: number;
  esFilaTecnica: boolean;
}

const STORAGE_KEY = 'material_balanceo_lineas_data';

const INITIAL_DATA: MaterialBalanceoRow[] = [
  { id: '1', centro: '1000', linea: 'LINEA 1', material: '20007201', descripcion: 'CHN ZAFIRO 135X190X029', habilitado: true, minimo: 0, maximo: 100 },
  { id: '2', centro: '1000', linea: 'LINEA 1', material: '20004463', descripcion: 'CHN ZAFIRO 135X190X024', habilitado: true, minimo: 0, maximo: 100 },
  { id: '3', centro: '1000', linea: 'LINEA 1', material: '20004462', descripcion: 'CHN ZAFIRO 105X190X024', habilitado: true, minimo: 0, maximo: 100 },
  { id: '4', centro: '1000', linea: 'LINEA 1', material: '20007200', descripcion: 'CHN ZAFIRO 105X190X029', habilitado: true, minimo: 0, maximo: 100 },
  { id: '5', centro: '1000', linea: 'LINEA 1', material: '20003642', descripcion: 'CHN IMPERIAL 31 135X190X31', habilitado: true, minimo: 0, maximo: 100 },
  { id: '6', centro: '1000', linea: 'LINEA 1', material: '20006132', descripcion: 'CHN ALTERNATIVA ESPUMA 080X190X011', habilitado: false, minimo: 0, maximo: 100 },
  { id: '7', centro: '1000', linea: 'LINEA 1', material: '20003275', descripcion: 'CHN ALTERNATIVA ESPUMA 080X190X015', habilitado: false, minimo: 0, maximo: 100 },
  { id: '8', centro: '1000', linea: 'LINEA 1', material: '20006133', descripcion: 'CHN ALTERNATIVA ESPUMA 105X190X011', habilitado: false, minimo: 0, maximo: 100 },
  { id: '9', centro: '1000', linea: 'LINEA 1', material: '20003277', descripcion: 'CHN ALTERNATIVA ESPUMA 105X190X015', habilitado: true, minimo: 0, maximo: 100 },
  { id: '10', centro: '1000', linea: 'LINEA 1', material: '20006134', descripcion: 'CHN ALTERNATIVA ESPUMA 135X190X011', habilitado: true, minimo: 0, maximo: 100 },
  { id: '11', centro: '1000', linea: 'LINEA 1', material: '20003278', descripcion: 'CHN ALTERNATIVA ESPUMA 135X190X015', habilitado: true, minimo: 0, maximo: 100 },
  { id: '12', centro: '2000', linea: 'LINEA 3', material: '20006132', descripcion: 'CHN ALTERNATIVA ESPUMA 080X190X011', habilitado: true, minimo: 0, maximo: 100 },
  { id: '13', centro: '2000', linea: 'LINEA 3', material: '20003275', descripcion: 'CHN ALTERNATIVA ESPUMA 080X190X015', habilitado: true, minimo: 0, maximo: 100 },
  { id: '14', centro: '2000', linea: 'LINEA 3', material: '20006133', descripcion: 'CHN ALTERNATIVA ESPUMA 105X190X011', habilitado: true, minimo: 0, maximo: 100 },
  { id: '15', centro: '2000', linea: 'LINEA 3', material: '20003277', descripcion: 'CHN ALTERNATIVA ESPUMA 105X190X015', habilitado: false, minimo: 0, maximo: 100 },
  { id: '16', centro: '2000', linea: 'LINEA 3', material: '20006134', descripcion: 'CHN ALTERNATIVA ESPUMA 135X190X011', habilitado: false, minimo: 0, maximo: 100 },
  { id: '17', centro: '2000', linea: 'LINEA 3', material: '20003278', descripcion: 'CHN ALTERNATIVA ESPUMA 135X190X015', habilitado: false, minimo: 0, maximo: 100 },
];

export const MaterialBalanceoLineasTabSection: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<MaterialBalanceoRow[]>([]);
  const [technicalData, setTechnicalData] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isLoadingTech, setIsLoadingTech] = useState(false);

  const normalizeMaterialCode = (code: string | number): string => {
    return String(code || '').trim().slice(-8);
  };

  // Cargar datos técnicos de la API
  const fetchTechnicalData = async () => {
    setIsLoadingTech(true);
    try {
      let allTiempos: any[] = [];
      let page = 1;
      let hasMore = true;
      const pageSize = 5000;

      while (hasMore && page <= 10) {
        const response = await serviciosService.getTiemposEnsamblado(page, pageSize);
        const raw = Array.isArray(response?.data) ? response.data : [];
        allTiempos = [...allTiempos, ...raw];
        if (raw.length < pageSize) hasMore = false; else page++;
      }
      setTechnicalData(allTiempos);
    } catch (error) {
      console.error('Error loading technical data:', error);
      toast({ title: "Error", description: "No se pudieron cargar los tiempos técnicos.", variant: "destructive" });
    } finally {
      setIsLoadingTech(false);
    }
  };

  // Cargar datos del localStorage al montar
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        const migrated = parsed.map((r: any) => ({
          ...r,
          centro: r.centro || '1000',
          minimo: r.minimo !== undefined ? r.minimo : 0,
          maximo: r.maximo !== undefined ? r.maximo : 100
        }));
        setRows(migrated);
      } catch (e) {
        setRows(INITIAL_DATA);
      }
    } else {
      setRows(INITIAL_DATA);
    }
    setIsLoaded(true);
    fetchTechnicalData();
  }, []);

  // Guardar datos en localStorage cuando cambian
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
    }
  }, [rows, isLoaded]);

  const handleAddRow = () => {
    const newRow: MaterialBalanceoRow = {
      id: Date.now().toString(),
      centro: '1000',
      linea: '',
      material: '',
      descripcion: '',
      habilitado: true,
      minimo: 0,
      maximo: 100
    };
    setRows([...rows, newRow]);
  };

  const handleRemoveRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: keyof MaterialBalanceoRow, value: any) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  // LÓGICA DE UNIÓN: Expandir filas por puestos de trabajo técnicos
  const expandedRows = useMemo(() => {
    const results: DisplayRow[] = [];

    rows.forEach(baseRow => {
      const materialNorm = normalizeMaterialCode(baseRow.material);
      const lineaNorm = baseRow.linea.trim().toUpperCase();
      const centroNorm = String(baseRow.centro).trim();

      // Buscar coincidencias en technicalData filtrando por Centro, Linea y Material
      const matches = technicalData.filter(tech => {
        const techMaterial = normalizeMaterialCode(tech.CodMaterial);
        const techLinea = String(tech.Linea || '').trim().toUpperCase();
        const techCentro = String(tech.Centro || '').trim();
        return techMaterial === materialNorm && 
               (techLinea === lineaNorm || techLinea.includes(lineaNorm)) &&
               techCentro === centroNorm;
      });

      if (matches.length > 0) {
        matches.forEach(match => {
          results.push({
            ...baseRow,
            puestoTrabajo: String(match.PuestoTrabajo || '-'),
            tiempoMin: Number(match.Tiempo_Min || 0),
            esFilaTecnica: true
          });
        });
      } else {
        // Si no hay datos técnicos, mostrar fila base con valores vacíos
        results.push({
          ...baseRow,
          puestoTrabajo: '-',
          tiempoMin: 0,
          esFilaTecnica: false
        });
      }
    });

    return results;
  }, [rows, technicalData]);

  const handleExport = () => {
    const dataToExport = expandedRows.map(r => ({
      'Centro': r.centro,
      'Línea': r.linea,
      'Material': r.material,
      'Descripción': r.descripcion,
      'Puesto Trabajo': r.puestoTrabajo,
      'Tiempo (min)': r.tiempoMin,
      'Habilitado': r.habilitado ? 'SI' : 'NO',
      'Mínimo (%)': r.minimo,
      'Máximo (%)': r.maximo
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales Balanceo");
    XLSX.writeFile(wb, "Material_Balanceo_Con_Puestos.xlsx");
    
    toast({ title: "Éxito", description: "Plan de balanceo exportado a Excel." });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <LayoutGrid className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Material Balanceo Líneas</h3>
            <p className="text-xs text-gray-500">Configuración técnica y límites porcentuales por puesto de trabajo</p>
          </div>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={handleAddRow} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> Añadir Línea
          </Button>
          <Button onClick={handleExport} variant="outline" size="sm" className="border-green-600 text-green-700 hover:bg-green-50">
            <Download className="w-4 h-4 mr-2" /> Exportar Excel
          </Button>
        </div>
      </div>

      <Card className="border shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[70vh]">
            <table className="min-w-full divide-y divide-gray-200 text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider w-24 border-r">Centro</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider w-32 border-r">Línea</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider w-40 border-r">Material</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider border-r">Descripción</th>
                  <th className="px-4 py-3 text-left font-bold text-indigo-700 uppercase tracking-wider border-r bg-indigo-50/20">Puesto Trabajo</th>
                  <th className="px-4 py-3 text-right font-bold text-indigo-700 uppercase tracking-wider border-r bg-indigo-50/20">tiempo (min)</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-600 uppercase tracking-wider w-24 border-r">Habilitado</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-600 uppercase tracking-wider w-16 border-r">Acción</th>
                  <th className="px-4 py-3 text-center font-bold text-indigo-700 uppercase tracking-wider w-24 border-r bg-indigo-50/30">Mínimo (%)</th>
                  <th className="px-4 py-3 text-center font-bold text-indigo-700 uppercase tracking-wider w-24 bg-indigo-50/30">Máximo (%)</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {isLoadingTech && expandedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-gray-400">
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                        <span>Sincronizando información técnica de puestos...</span>
                      </div>
                    </td>
                  </tr>
                ) : expandedRows.map((row, idx) => (
                  <tr key={`${row.id}-${idx}`} className={cn("hover:bg-gray-50 transition-colors", !row.habilitado && "bg-gray-50/50 opacity-70")}>
                    <td className="px-2 py-1.5 border-r">
                      <select 
                        value={row.centro} 
                        onChange={(e) => handleUpdateRow(row.id, 'centro', e.target.value)}
                        className="w-full h-8 text-xs border border-transparent bg-transparent hover:border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 font-bold"
                      >
                        <option value="1000">1000</option>
                        <option value="2000">2000</option>
                      </select>
                    </td>
                    <td className="px-2 py-1.5 border-r">
                      <Input 
                        value={row.linea} 
                        onChange={(e) => handleUpdateRow(row.id, 'linea', e.target.value.toUpperCase())}
                        placeholder="Ej: LINEA 1"
                        className="h-8 text-xs border-none shadow-none focus-visible:ring-1 focus-visible:ring-indigo-500 font-bold"
                      />
                    </td>
                    <td className="px-2 py-1.5 border-r">
                      <Input 
                        value={row.material} 
                        onChange={(e) => handleUpdateRow(row.id, 'material', e.target.value)}
                        placeholder="Código SAP"
                        className="h-8 text-xs border-none shadow-none focus-visible:ring-1 focus-visible:ring-indigo-500 font-mono"
                      />
                    </td>
                    <td className="px-2 py-1.5 border-r">
                      <Input 
                        value={row.descripcion} 
                        onChange={(e) => handleUpdateRow(row.id, 'descripcion', e.target.value.toUpperCase())}
                        placeholder="Descripción del material"
                        className="h-8 text-xs border-none shadow-none focus-visible:ring-1 focus-visible:ring-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-1.5 border-r font-medium text-indigo-800 bg-indigo-50/10">
                      {row.puestoTrabajo}
                    </td>
                    <td className="px-4 py-1.5 border-r text-right font-mono font-bold text-indigo-700 bg-indigo-50/10">
                      {row.tiempoMin > 0 ? row.tiempoMin.toLocaleString(undefined, { minimumFractionDigits: 3 }) : '-'}
                    </td>
                    <td className="px-2 py-1.5 border-r text-center">
                      <div className="flex items-center justify-center">
                        <Checkbox 
                          checked={row.habilitado} 
                          onCheckedChange={(val) => handleUpdateRow(row.id, 'habilitado', !!val)}
                          className="h-5 w-5 data-[state=checked]:bg-indigo-600"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 border-r text-center">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveRow(row.id)}
                        className="h-8 w-8 text-red-400 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                    <td className="px-2 py-1.5 border-r text-center bg-indigo-50/5">
                      <Input 
                        type="number"
                        value={row.minimo} 
                        onChange={(e) => handleUpdateRow(row.id, 'minimo', Number(e.target.value))}
                        className="h-8 text-xs text-center border-none shadow-none focus-visible:ring-1 focus-visible:ring-indigo-500 font-bold text-indigo-700"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center bg-indigo-50/5">
                      <Input 
                        type="number"
                        value={row.maximo} 
                        onChange={(e) => handleUpdateRow(row.id, 'maximo', Number(e.target.value))}
                        className="h-8 text-xs text-center border-none shadow-none focus-visible:ring-1 focus-visible:ring-indigo-500 font-bold text-indigo-700"
                      />
                    </td>
                  </tr>
                ))}
                {expandedRows.length === 0 && !isLoadingTech && (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-gray-400 italic">
                      No hay materiales configurados. Haga clic en "Añadir Línea" para comenzar.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <p className="text-xs">
          <b>Nota:</b> Los puestos de trabajo y tiempos se sincronizan automáticamente relacionando el <b>Centro</b>, la <b>Línea</b> y el <b>Material</b>. Si un material tiene múltiples puestos, se mostrará una fila por cada uno.
        </p>
      </div>
    </div>
  );
};
