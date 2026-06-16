'use client';

import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  LayoutGrid, 
  Save, 
  Download, 
  AlertCircle,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface MaterialBalanceoRow {
  id: string;
  linea: string;
  material: string;
  descripcion: string;
  habilitado: boolean;
}

const STORAGE_KEY = 'material_balanceo_lineas_data';

const INITIAL_DATA: MaterialBalanceoRow[] = [
  { id: '1', linea: 'LINEA 1', material: '20007201', descripcion: 'CHN ZAFIRO 135X190X029', habilitado: true },
  { id: '2', linea: 'LINEA 1', material: '20004463', descripcion: 'CHN ZAFIRO 135X190X024', habilitado: true },
  { id: '3', linea: 'LINEA 1', material: '20004462', descripcion: 'CHN ZAFIRO 105X190X024', habilitado: true },
  { id: '4', linea: 'LINEA 1', material: '20007200', descripcion: 'CHN ZAFIRO 105X190X029', habilitado: true },
  { id: '5', linea: 'LINEA 1', material: '20003642', descripcion: 'CHN IMPERIAL 31 135X190X31', habilitado: true },
  { id: '6', linea: 'LINEA 1', material: '20006132', descripcion: 'CHN ALTERNATIVA ESPUMA 080X190X011', habilitado: false },
  { id: '7', linea: 'LINEA 1', material: '20003275', descripcion: 'CHN ALTERNATIVA ESPUMA 080X190X015', habilitado: false },
  { id: '8', linea: 'LINEA 1', material: '20006133', descripcion: 'CHN ALTERNATIVA ESPUMA 105X190X011', habilitado: false },
  { id: '9', linea: 'LINEA 1', material: '20003277', descripcion: 'CHN ALTERNATIVA ESPUMA 105X190X015', habilitado: true },
  { id: '10', linea: 'LINEA 1', material: '20006134', descripcion: 'CHN ALTERNATIVA ESPUMA 135X190X011', habilitado: true },
  { id: '11', linea: 'LINEA 1', material: '20003278', descripcion: 'CHN ALTERNATIVA ESPUMA 135X190X015', habilitado: true },
  { id: '12', linea: 'LINEA 3', material: '20006132', descripcion: 'CHN ALTERNATIVA ESPUMA 080X190X011', habilitado: true },
  { id: '13', linea: 'LINEA 3', material: '20003275', descripcion: 'CHN ALTERNATIVA ESPUMA 080X190X015', habilitado: true },
  { id: '14', linea: 'LINEA 3', material: '20006133', descripcion: 'CHN ALTERNATIVA ESPUMA 105X190X011', habilitado: true },
  { id: '15', linea: 'LINEA 3', material: '20003277', descripcion: 'CHN ALTERNATIVA ESPUMA 105X190X015', habilitado: false },
  { id: '16', linea: 'LINEA 3', material: '20006134', descripcion: 'CHN ALTERNATIVA ESPUMA 135X190X011', habilitado: false },
  { id: '17', linea: 'LINEA 3', material: '20003278', descripcion: 'CHN ALTERNATIVA ESPUMA 135X190X015', habilitado: false },
  { id: '18', linea: 'LINEA 2', material: '20000178', descripcion: 'CHN CONTINENTAL PT GR AC 105X190X030', habilitado: false },
  { id: '19', linea: 'LINEA 2', material: '20000179', descripcion: 'CHN CONTINENTAL PT GR AC 135X190X030', habilitado: true },
  { id: '20', linea: 'LINEA 2', material: '20000181', descripcion: 'CHN CONTINENTAL PT GR AC 160X200X030', habilitado: true },
  { id: '21', linea: 'LINEA 2', material: '20000648', descripcion: 'CHN ORTOPÉDICO PT AC 090X190X023', habilitado: false },
  { id: '22', linea: 'LINEA 2', material: '20000650', descripcion: 'CHN ORTOPÉDICO PT AC 105X190X023', habilitado: true },
  { id: '23', linea: 'LINEA 2', material: '20000652', descripcion: 'CHN ORTOPÉDICO PT AC 135X190X023', habilitado: true },
  { id: '24', linea: 'LINEA 2', material: '20000654', descripcion: 'CHN ORTOPÉDICO PT AC 160X200X023', habilitado: false },
];

export const MaterialBalanceoLineasTabSection: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<MaterialBalanceoRow[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Cargar datos del localStorage al montar
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setRows(JSON.parse(stored));
      } catch (e) {
        setRows(INITIAL_DATA);
      }
    } else {
      setRows(INITIAL_DATA);
    }
    setIsLoaded(true);
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
      linea: '',
      material: '',
      descripcion: '',
      habilitado: true
    };
    setRows([...rows, newRow]);
  };

  const handleRemoveRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: keyof MaterialBalanceoRow, value: any) => {
    setRows(rows.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const handleExport = () => {
    const dataToExport = rows.map(r => ({
      'Línea': r.linea,
      'Material': r.material,
      'Descripción': r.descripcion,
      'Habilitado': r.habilitado ? 'X' : ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Materiales Balanceo");
    XLSX.writeFile(wb, "Material_Balanceo_Lineas.xlsx");
    
    toast({
      title: "Éxito",
      description: "Plan de balanceo exportado a Excel."
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <LayoutGrid className="w-6 h-6 text-indigo-600" />
          <div>
            <h3 className="text-xl font-semibold text-gray-800">Material Balanceo Líneas</h3>
            <p className="text-xs text-gray-500">Configuración de materiales habilitados para el balanceo de carga</p>
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
                  <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider w-32 border-r">Línea</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider w-40 border-r">Material</th>
                  <th className="px-4 py-3 text-left font-bold text-gray-600 uppercase tracking-wider border-r">Descripción</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-600 uppercase tracking-wider w-24 border-r">Habilitado</th>
                  <th className="px-4 py-3 text-center font-bold text-gray-600 uppercase tracking-wider w-16">Acción</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row) => (
                  <tr key={row.id} className={cn("hover:bg-gray-50 transition-colors", !row.habilitado && "bg-gray-50/50 opacity-70")}>
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
                    <td className="px-2 py-1.5 border-r text-center">
                      <div className="flex items-center justify-center">
                        <Checkbox 
                          checked={row.habilitado} 
                          onCheckedChange={(val) => handleUpdateRow(row.id, 'habilitado', !!val)}
                          className="h-5 w-5 data-[state=checked]:bg-indigo-600"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleRemoveRow(row.id)}
                        className="h-8 w-8 text-red-400 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-gray-400 italic">
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
          <b>Nota:</b> Los materiales desmarcados en la columna <b>Habilitado</b> serán ignorados por el motor de optimización en el cálculo del balanceo.
        </p>
      </div>
    </div>
  );
};
