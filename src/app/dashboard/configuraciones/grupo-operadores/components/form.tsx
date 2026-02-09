"use client";

import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { operadorService } from '@/services/operador.service';
import type { Operador, Grupo } from '@/types/interfaces';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface GrupoOperadorFormProps {
  record: Operador | null;
  grupos: Grupo[];
  usuarios: any[];
  onSuccess: () => void;
  onCancel: () => void;
}

const formSchema = z.object({
  codigo_grupo: z.string().min(1, 'El grupo es requerido.'),
  identificador_operador: z.string().min(1, 'El operador es requerido.'),
  estado: z.string().min(1, 'El estado es requerido.'),
});

interface OperadorAgrupado {
  departamento: string;
  grupoDepartamento: string;
  operadores: any[];
}

const formatDateForSQLServer = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
};

const agruparOperadores = (usuarios: any[]): OperadorAgrupado[] => {
  const grupos = new Map<string, Map<string, any[]>>();
  
  usuarios.forEach((u) => {
    const grupoDept = u.GRUPO_DEPARTAMENTO || 'Sin Grupo';
    
    // Filtrar solo operadores con GRUPO_DEPARTAMENTO que contenga 'PRODUCCION'
    if (!grupoDept.toUpperCase().includes('PRODUCCION')) {
      return;
    }
    
    const dept = u.DEPARTAMENTO || 'Sin Departamento';
    
    if (!grupos.has(dept)) {
      grupos.set(dept, new Map());
    }
    
    const subgrupos = grupos.get(dept)!;
    if (!subgrupos.has(grupoDept)) {
      subgrupos.set(grupoDept, []);
    }
    
    subgrupos.get(grupoDept)!.push(u);
  });
  
  const resultado: OperadorAgrupado[] = [];
  grupos.forEach((subgrupos, departamento) => {
    subgrupos.forEach((operadores, grupoDepartamento) => {
      const sorted = operadores.toSorted((a, b) => (a.NOMBRE || '').localeCompare(b.NOMBRE || ''));
      resultado.push({
        departamento,
        grupoDepartamento,
        operadores: sorted,
      });
    });
  });
  
  return resultado.sort((a, b) => a.departamento.localeCompare(b.departamento));
};

export default function GrupoOperadorForm({
  record,
  grupos,
  usuarios,
  onSuccess,
  onCancel,
}: Readonly<GrupoOperadorFormProps>) {
  const [isLoading, setIsLoading] = useState(false);
  const [selectedOperadores, setSelectedOperadores] = useState<string[]>(
    record ? [record.identificador_operador] : []
  );
  const [expandedDepts, setExpandedDepts] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const user = globalThis.window
    ? JSON.parse(globalThis.window.localStorage.getItem('user') || '{}')
    : {};

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      codigo_grupo: record?.codigo_grupo.toString() || '',
      identificador_operador: record?.identificador_operador || '',
      estado: record?.estado || 'A',
    },
  });

  const operadoresAgrupados = agruparOperadores(usuarios);

  const toggleOperador = (codigo: string) => {
    setSelectedOperadores((prev) =>
      prev.includes(codigo) ? prev.filter((c) => c !== codigo) : [...prev, codigo]
    );
  };

  const toggleDepartamento = (dept: string) => {
    setExpandedDepts((prev) => {
      const next = new Set(prev);
      if (next.has(dept)) {
        next.delete(dept);
      } else {
        next.add(dept);
      }
      return next;
    });
  };

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    if (selectedOperadores.length === 0) {
      toast({
        title: 'Error',
        description: 'Debe seleccionar al menos un operador.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const timestamp = formatDateForSQLServer(new Date());
      
      // Crear un registro por cada operador seleccionado
      for (const operadorCodigo of selectedOperadores) {
        const data: any = {
          codigo_grupo: Number(values.codigo_grupo),
          identificador_operador: operadorCodigo,
          estado: values.estado,
          usuario_creacion: user?.name || 'admin',
          fecha_creacion: timestamp,
        };

        if (record) {
          data.codigo_operador = record.codigo_operador;
          // Si estamos editando, solo actualizamos el primero
          if (operadorCodigo === selectedOperadores[0]) {
            await operadorService.save(data);
          }
        } else {
          await operadorService.save(data);
        }
      }

      toast({
        title: 'Éxito',
        description: `${selectedOperadores.length} Grupo-Operador(es) ${record ? 'actualizado(s)' : 'creado(s)'} correctamente.`,
      });
      onSuccess();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{record ? 'Editar' : 'Crear'} Grupo-Operador</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="codigo_grupo" className="block text-sm font-medium text-gray-700">
              Grupo <span className="text-red-500">*</span>
            </label>
            <select
              id="codigo_grupo"
              {...form.register('codigo_grupo')}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading || !!record}
            >
              <option value="">Seleccionar grupo...</option>
              {grupos.map((g) => (
                <option key={g.codigo_grupo} value={g.codigo_grupo}>
                  {g.nombre_grupo} - {g.centro}
                </option>
              ))}
            </select>
            {form.formState.errors.codigo_grupo && (
              <p className="text-sm text-red-600">{form.formState.errors.codigo_grupo.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="operadores-list" className="block text-sm font-medium text-gray-700">
              Operadores <span className="text-red-500">*</span>
            </label>
            <div id="operadores-list" className="border rounded-lg p-4 max-h-96 overflow-y-auto">
              {operadoresAgrupados.length === 0 && (
                <p className="text-gray-100">No hay operadores disponibles.</p>
              )}
              {operadoresAgrupados.length > 0 && (
                operadoresAgrupados.map((grupo) => (
                  <div 
                    key={`${grupo.departamento}-${grupo.grupoDepartamento}`} 
                    className="mb-4"
                  >
                    {(() => {
                      const hasSelected = grupo.operadores.some((op) =>
                        selectedOperadores.includes(op.CODIGO)
                      );
                      return (
                        <button
                          type="button"
                          onClick={() => toggleDepartamento(grupo.departamento)}
                          className={`flex items-center gap-2 w-full p-2 rounded transition-all border-2 ${
                            hasSelected
                              ? 'bg-blue-50 border-[#0055b8] hover:bg-blue-100'
                              : 'bg-white border-gray-200 hover:bg-gray-50'
                          }`}
                        >
                          {expandedDepts.has(grupo.departamento) ? (
                            <ChevronDown className={`w-4 h-4 ${hasSelected ? 'text-[#0055b8]' : 'text-gray-600'}`} />
                          ) : (
                            <ChevronRight className={`w-4 h-4 ${hasSelected ? 'text-[#0055b8]' : 'text-gray-600'}`} />
                          )}
                          <span className={`font-semibold ${hasSelected ? 'text-[#0055b8]' : 'text-gray-800'}`}>
                            [{grupo.departamento}] - {grupo.grupoDepartamento}
                          </span>
                          <span className={`text-xs ml-auto font-medium ${hasSelected ? 'text-[#0055b8]' : 'text-gray-500'}`}>
                            ({grupo.operadores.length})
                          </span>
                        </button>
                      );
                    })()}

                    {expandedDepts.has(grupo.departamento) && (
                      <div className="ml-6 space-y-2 mt-2">
                        {grupo.operadores.map((op) => (
                          <label
                            key={op.CODIGO}
                            className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                              selectedOperadores.includes(op.CODIGO)
                                ? 'bg-blue-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <Checkbox
                              checked={selectedOperadores.includes(op.CODIGO)}
                              onCheckedChange={() => toggleOperador(op.CODIGO)}
                              disabled={isLoading || !!record}
                              className={`${
                                selectedOperadores.includes(op.CODIGO)
                                  ? 'border-[#0055b8] data-[state=checked]:bg-[#0055b8]'
                                  : ''
                              }`}
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-900">{op.NOMBRE}</div>
                              <div className="text-xs text-gray-500">
                                {op.CODIGO} • {op.CARGO}
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
            {selectedOperadores.length > 0 && (
              <p className="text-xs text-gray-600">{selectedOperadores.length} operador(es) seleccionado(s)</p>
            )}
            {form.formState.errors.identificador_operador && (
              <p className="text-sm text-red-600">{form.formState.errors.identificador_operador.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="estado" className="block text-sm font-medium text-gray-700">
              Estado <span className="text-red-500">*</span>
            </label>
            <select
              id="estado"
              {...form.register('estado')}
              className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
              disabled={isLoading}
            >
              <option value="A">Activo</option>
              <option value="I">Inactivo</option>
            </select>
            {form.formState.errors.estado && (
              <p className="text-sm text-red-600">{form.formState.errors.estado.message}</p>
            )}
          </div>

          <div className="flex gap-4">
            {!isLoading && (
              <Button 
                type="submit" 
                disabled={selectedOperadores.length === 0}
              >
                {record ? 'Actualizar' : 'Crear'}
              </Button>
            )}
            {isLoading && (
              <Button type="submit" disabled>
                Guardando...
              </Button>
            )}
            <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
