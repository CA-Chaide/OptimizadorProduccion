"use client";

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Edit, Plus, Trash, GitBranch } from 'lucide-react';
import { lineaService } from '@/services/linea.service';
import { estacionService } from '@/services/estacion.service';
import type { Linea, Estacion, Grupo } from '@/types/interfaces';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

interface RelacionesModalProps {
  grupo: Grupo | null;
  isOpen: boolean;
  onClose: () => void;
}

const lineaFormSchema = z.object({
  nombre_linea: z.string().min(1, 'El nombre es requerido.'),
  estado: z.string().min(1, 'El estado es requerido.'),
});

const estacionFormSchema = z.object({
  nombre_estacion: z.string().min(1, 'El nombre es requerido.'),
  codigo_linea: z.string().min(1, 'La línea es requerida.'),
  estado: z.string().min(1, 'El estado es requerido.'),
});

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

export default function RelacionesModal({
  grupo,
  isOpen,
  onClose,
}: Readonly<RelacionesModalProps>) {
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [estaciones, setEstaciones] = useState<Estacion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLineaFormOpen, setIsLineaFormOpen] = useState(false);
  const [isEstacionFormOpen, setIsEstacionFormOpen] = useState(false);
  const [selectedLinea, setSelectedLinea] = useState<Linea | null>(null);
  const [selectedEstacion, setSelectedEstacion] = useState<Estacion | null>(null);
  const [filterLinea, setFilterLinea] = useState('');
  const [filterEstacion, setFilterEstacion] = useState('');
  const { toast } = useToast();
  const user = globalThis.window
    ? JSON.parse(globalThis.window.localStorage.getItem('user') || '{}')
    : {};

  const lineaForm = useForm<z.infer<typeof lineaFormSchema>>({
    resolver: zodResolver(lineaFormSchema),
    defaultValues: {
      nombre_linea: '',
      estado: 'A',
    },
  });

  const estacionForm = useForm<z.infer<typeof estacionFormSchema>>({
    resolver: zodResolver(estacionFormSchema),
    defaultValues: {
      nombre_estacion: '',
      codigo_linea: '',
      estado: 'A',
    },
  });

  const fetchRelaciones = useCallback(async () => {
    if (!grupo) return;
    setIsLoading(true);
    try {
      // Fetch all lineas and filter by grupo
      const lineasResponse = await lineaService.getAll();
      const allLineas = lineasResponse.data || [];
      const filteredLineas = allLineas.filter((l: Linea) => l.codigo_grupo === grupo.codigo_grupo);
      setLineas(filteredLineas);

      // Fetch all estaciones and filter by lineas that belong to grupo
      const estacionesResponse = await estacionService.getAll();
      const allEstaciones = estacionesResponse.data || [];
      const lineaIds = filteredLineas.map(l => l.codigo_linea);
      const filteredEstaciones = allEstaciones.filter((e: Estacion) => lineaIds.includes(e.codigo_linea));
      setEstaciones(filteredEstaciones);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'No se pudieron cargar las relaciones.';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [grupo, toast]);

  useEffect(() => {
    if (isOpen && grupo) {
      fetchRelaciones();
      lineaForm.reset();
      estacionForm.reset();
      setSelectedLinea(null);
      setSelectedEstacion(null);
      setIsLineaFormOpen(false);
      setIsEstacionFormOpen(false);
    }
  }, [isOpen, grupo, fetchRelaciones, lineaForm, estacionForm]);

  const handleEditLinea = (linea: Linea) => {
    setSelectedLinea(linea);
    lineaForm.reset({
      nombre_linea: linea.nombre_linea,
      estado: linea.estado,
    });
    setIsLineaFormOpen(true);
  };

  const handleAddNewLinea = () => {
    setSelectedLinea(null);
    lineaForm.reset({
      nombre_linea: '',
      estado: 'A',
    });
    setIsLineaFormOpen(true);
  };

  const handleEditEstacion = (estacion: Estacion) => {
    setSelectedEstacion(estacion);
    estacionForm.reset({
      nombre_estacion: estacion.nombre_estacion,
      codigo_linea: estacion.codigo_linea.toString(),
      estado: estacion.estado,
    });
    setIsEstacionFormOpen(true);
  };

  const handleAddNewEstacion = () => {
    setSelectedEstacion(null);
    estacionForm.reset({
      nombre_estacion: '',
      codigo_linea: '',
      estado: 'A',
    });
    setIsEstacionFormOpen(true);
  };

  const onLineaSubmit = async (values: z.infer<typeof lineaFormSchema>) => {
    if (!grupo) return;
    setIsLoading(true);
    try {
      const data: any = {
        codigo_grupo: grupo.codigo_grupo,
        nombre_linea: values.nombre_linea,
        estado: values.estado,
      };

      if (selectedLinea) {
        data.codigo_linea = selectedLinea.codigo_linea;
      }
      data.usuario_modificacion = user?.name || 'admin';
      data.fecha_modificacion = formatDateForSQLServer(new Date());

      await lineaService.save(data);
      toast({
        title: 'Éxito',
        description: `Línea ${selectedLinea ? 'actualizada' : 'creada'} correctamente.`,
      });

      setIsLineaFormOpen(false);
      setSelectedLinea(null);
      await fetchRelaciones();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      toast({ title: 'Error al guardar', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const onEstacionSubmit = async (values: z.infer<typeof estacionFormSchema>) => {
    setIsLoading(true);
    try {
      const data: any = {
        codigo_linea: Number(values.codigo_linea),
        nombre_estacion: values.nombre_estacion,
        estado: values.estado,
      };

      if (selectedEstacion) {
        data.codigo_estacion = selectedEstacion.codigo_estacion;
      }
      data.usuario_modificacion = user?.name || 'admin';
      data.fecha_modificacion = formatDateForSQLServer(new Date());

      await estacionService.save(data);
      toast({
        title: 'Éxito',
        description: `Estación ${selectedEstacion ? 'actualizada' : 'creada'} correctamente.`,
      });

      setIsEstacionFormOpen(false);
      setSelectedEstacion(null);
      await fetchRelaciones();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Ocurrió un error inesperado.';
      toast({ title: 'Error al guardar', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteLinea = async (linea: Linea) => {
    if (!confirm('¿Confirma eliminar esta línea?')) return;
    setIsLoading(true);
    try {
      await lineaService.delete(linea.codigo_linea);
      toast({ title: 'Éxito', description: 'Línea eliminada correctamente.' });
      await fetchRelaciones();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al eliminar';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteEstacion = async (estacion: Estacion) => {
    if (!confirm('¿Confirma eliminar esta estación?')) return;
    setIsLoading(true);
    try {
      await estacionService.delete(estacion.codigo_estacion);
      toast({ title: 'Éxito', description: 'Estación eliminada correctamente.' });
      await fetchRelaciones();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Error al eliminar';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredLineas = lineas.filter((l) => {
    if (!filterLinea.trim()) return true;
    const f = filterLinea.toLowerCase();
    return l.nombre_linea.toLowerCase().includes(f) || String(l.codigo_linea).includes(f);
  });

  const filteredEstaciones = estaciones.filter((e) => {
    if (!filterEstacion.trim()) return true;
    const f = filterEstacion.toLowerCase();
    return e.nombre_estacion.toLowerCase().includes(f) || String(e.codigo_estacion).includes(f);
  });

  const getLineaNameById = (codigo_linea: number): string => {
    return lineas.find(l => l.codigo_linea === codigo_linea)?.nombre_linea || '-';
  };

  const getLineasForEstacion = (): Linea[] => {
    return lineas;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Relaciones del Grupo: {grupo?.nombre_grupo}
          </DialogTitle>
          <DialogDescription>Centro: {grupo?.centro}</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="lineas" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="lineas">Líneas</TabsTrigger>
            <TabsTrigger value="estaciones">Estaciones</TabsTrigger>
          </TabsList>

          <TabsContent value="lineas" className="space-y-4">
            {isLineaFormOpen ? (
              <LineaForm
                form={lineaForm}
                onSubmit={onLineaSubmit}
                isLoading={isLoading}
                selectedLinea={selectedLinea}
                onCancel={() => {
                  setIsLineaFormOpen(false);
                  setSelectedLinea(null);
                  lineaForm.reset();
                }}
              />
            ) : (
              <LineasList
                filteredLineas={filteredLineas}
                filter={filterLinea}
                isLoading={isLoading}
                onFilterChange={setFilterLinea}
                onEdit={handleEditLinea}
                onDelete={handleDeleteLinea}
                onAddNew={handleAddNewLinea}
              />
            )}
          </TabsContent>

          <TabsContent value="estaciones" className="space-y-4">
            {isEstacionFormOpen ? (
              <EstacionForm
                form={estacionForm}
                onSubmit={onEstacionSubmit}
                isLoading={isLoading}
                selectedEstacion={selectedEstacion}
                lineas={getLineasForEstacion()}
                onCancel={() => {
                  setIsEstacionFormOpen(false);
                  setSelectedEstacion(null);
                  estacionForm.reset();
                }}
              />
            ) : (
              <EstacionesList
                filteredEstaciones={filteredEstaciones}
                filter={filterEstacion}
                isLoading={isLoading}
                onFilterChange={setFilterEstacion}
                onEdit={handleEditEstacion}
                onDelete={handleDeleteEstacion}
                onAddNew={handleAddNewEstacion}
                getLineaNameById={getLineaNameById}
              />
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface LineasListProps {
  filteredLineas: Linea[];
  filter: string;
  isLoading: boolean;
  onFilterChange: (filter: string) => void;
  onEdit: (linea: Linea) => void;
  onDelete: (linea: Linea) => Promise<void>;
  onAddNew: () => void;
}

function LineasList({
  filteredLineas,
  filter,
  isLoading,
  onFilterChange,
  onEdit,
  onDelete,
  onAddNew,
}: Readonly<LineasListProps>) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Buscar líneas..."
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="flex-1"
        />
        <Button onClick={onAddNew} disabled={isLoading}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Línea
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <LoadingRow colSpan={3} />
                ) : filteredLineas.length === 0 ? (
                  <EmptyRow colSpan={3} />
                ) : (
                  <LineaTableRows
                    lineas={filteredLineas}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface LineaTableRowsProps {
  lineas: Linea[];
  onEdit: (linea: Linea) => void;
  onDelete: (linea: Linea) => Promise<void>;
}

function LineaTableRows({
  lineas,
  onEdit,
  onDelete,
}: Readonly<LineaTableRowsProps>) {
  return (
    <>
      {lineas.map((linea) => (
        <TableRow key={linea.codigo_linea}>
          <TableCell className="font-medium">{linea.nombre_linea}</TableCell>
          <TableCell>
            <Badge
              variant={linea.estado === 'A' ? 'default' : 'destructive'}
              className={linea.estado === 'A' ? 'bg-green-600' : ''}
            >
              {linea.estado === 'A' ? 'Activo' : 'Inactivo'}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Abrir menú</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(linea)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(linea)} className="text-red-600">
                  <Trash className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface LineaFormProps {
  form: any;
  onSubmit: (values: z.infer<typeof lineaFormSchema>) => Promise<void>;
  isLoading: boolean;
  selectedLinea: Linea | null;
  onCancel: () => void;
}

function LineaForm({
  form,
  onSubmit,
  isLoading,
  selectedLinea,
  onCancel,
}: Readonly<LineaFormProps>) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="nombre_linea" className="block text-sm font-medium text-gray-700">
          Nombre <span className="text-red-500">*</span>
        </label>
        <Input
          id="nombre_linea"
          {...form.register('nombre_linea')}
          placeholder="Ej: Línea 1"
          disabled={isLoading}
        />
        {form.formState.errors.nombre_linea && (
          <p className="text-sm text-red-600">{form.formState.errors.nombre_linea.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="estado_linea" className="block text-sm font-medium text-gray-700">
          Estado <span className="text-red-500">*</span>
        </label>
        <select
          id="estado_linea"
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

      <DialogFooter className="gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Guardando...' : selectedLinea ? 'Actualizar' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface EstacionesListProps {
  filteredEstaciones: Estacion[];
  filter: string;
  isLoading: boolean;
  onFilterChange: (filter: string) => void;
  onEdit: (estacion: Estacion) => void;
  onDelete: (estacion: Estacion) => Promise<void>;
  onAddNew: () => void;
  getLineaNameById: (codigo_linea: number) => string;
}

function EstacionesList({
  filteredEstaciones,
  filter,
  isLoading,
  onFilterChange,
  onEdit,
  onDelete,
  onAddNew,
  getLineaNameById,
}: Readonly<EstacionesListProps>) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          placeholder="Buscar estaciones..."
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          className="flex-1"
        />
        <Button onClick={onAddNew} disabled={isLoading}>
          <Plus className="mr-2 h-4 w-4" />
          Agregar Estación
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Línea</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <LoadingRow colSpan={4} />
                ) : filteredEstaciones.length === 0 ? (
                  <EmptyRow colSpan={4} />
                ) : (
                  <EstacionTableRows
                    estaciones={filteredEstaciones}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    getLineaNameById={getLineaNameById}
                  />
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface EstacionTableRowsProps {
  estaciones: Estacion[];
  onEdit: (estacion: Estacion) => void;
  onDelete: (estacion: Estacion) => Promise<void>;
  getLineaNameById: (codigo_linea: number) => string;
}

function EstacionTableRows({
  estaciones,
  onEdit,
  onDelete,
  getLineaNameById,
}: Readonly<EstacionTableRowsProps>) {
  return (
    <>
      {estaciones.map((estacion) => (
        <TableRow key={estacion.codigo_estacion}>
          <TableCell className="font-medium">{estacion.nombre_estacion}</TableCell>
          <TableCell>{getLineaNameById(estacion.codigo_linea)}</TableCell>
          <TableCell>
            <Badge
              variant={estacion.estado === 'A' ? 'default' : 'destructive'}
              className={estacion.estado === 'A' ? 'bg-green-600' : ''}
            >
              {estacion.estado === 'A' ? 'Activo' : 'Inactivo'}
            </Badge>
          </TableCell>
          <TableCell className="text-right">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <span className="sr-only">Abrir menú</span>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onEdit(estacion)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDelete(estacion)} className="text-red-600">
                  <Trash className="mr-2 h-4 w-4" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

interface EstacionFormProps {
  form: any;
  onSubmit: (values: z.infer<typeof estacionFormSchema>) => Promise<void>;
  isLoading: boolean;
  selectedEstacion: Estacion | null;
  lineas: Linea[];
  onCancel: () => void;
}

function EstacionForm({
  form,
  onSubmit,
  isLoading,
  selectedEstacion,
  lineas,
  onCancel,
}: Readonly<EstacionFormProps>) {
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="nombre_estacion" className="block text-sm font-medium text-gray-700">
          Nombre <span className="text-red-500">*</span>
        </label>
        <Input
          id="nombre_estacion"
          {...form.register('nombre_estacion')}
          placeholder="Ej: Estación A"
          disabled={isLoading}
        />
        {form.formState.errors.nombre_estacion && (
          <p className="text-sm text-red-600">{form.formState.errors.nombre_estacion.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="codigo_linea" className="block text-sm font-medium text-gray-700">
          Línea <span className="text-red-500">*</span>
        </label>
        <select
          id="codigo_linea"
          {...form.register('codigo_linea')}
          className="w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
          disabled={isLoading || lineas.length === 0}
        >
          <option value="">Seleccionar línea...</option>
          {lineas.map((linea) => (
            <option key={linea.codigo_linea} value={linea.codigo_linea}>
              {linea.nombre_linea}
            </option>
          ))}
        </select>
        {form.formState.errors.codigo_linea && (
          <p className="text-sm text-red-600">{form.formState.errors.codigo_linea.message}</p>
        )}
        {lineas.length === 0 && (
          <p className="text-sm text-yellow-600">Debe crear líneas primero para agregar estaciones.</p>
        )}
      </div>

      <div className="space-y-2">
        <label htmlFor="estado_estacion" className="block text-sm font-medium text-gray-700">
          Estado <span className="text-red-500">*</span>
        </label>
        <select
          id="estado_estacion"
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

      <DialogFooter className="gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isLoading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isLoading || lineas.length === 0}>
          {isLoading ? 'Guardando...' : selectedEstacion ? 'Actualizar' : 'Guardar'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function LoadingRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center h-24">
        Cargando...
      </TableCell>
    </TableRow>
  );
}

function EmptyRow({ colSpan }: { colSpan: number }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center h-24">
        No se encontraron registros.
      </TableCell>
    </TableRow>
  );
}
