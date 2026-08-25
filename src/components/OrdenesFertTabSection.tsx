'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Package, Check, ChevronsUpDown, Loader2, BellRing, AlertTriangle, Clock, Calendar, LayoutDashboard, History, ListChecks, ChevronUp, ChevronDown, Calculator, FileJson } from 'lucide-react';
import type { OrdenFert, ProvisionalOrder, Restriccion } from '@/types/interfaces';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from '@/lib/utils';

const normalizeMaterialCode = (code: string | number): string => {
  const codeStr = String(code).trim();
  return codeStr.slice(-8);
};

// Prefijo de las Restriccion que guarda "Plan Táctico (Alpha)" (ProvisionalOrdersAlphaTab.tsx) cada vez
// que se ejecuta/modula la Distribución de Mesas: una fila por fecha objetivo
// (nombre_restriccion = "PlanDiarioConfig:<YYYY-MM-DD>") con el horario, las mesas, el personal
// asignado y el Gantt de esa fecha, serializado en JSON dentro de `descripcion`. Esta pestaña "PLAN"
// consume esos snapshots (ya vienen en la prop `restricciones`, filtrada por el Grupo de Muebles) en
// vez de recalcular una aproximación propia con un horario/N° de mesas genérico.
const PLAN_DIARIO_PREFIJO = 'PlanDiarioConfig:';

// Copia local de las formas de PlanDiarioSnapshot (definidas en ProvisionalOrdersAlphaTab.tsx) — es el
// contrato JSON persistido en `descripcion`, así que ambas copias deben evolucionar juntas si cambia el
// guardado en "Plan Táctico (Alpha)".
interface PlanDiarioSnapshotItem {
  material: string;
  nombre: string;
  source: 'Previsional' | 'Fert';
  id: string;
  cantidad: number;
  tamano: 'Pequeño' | 'Mediano' | 'Grande' | null;
  startHour: number;
  endHour: number;
  overflow: boolean;
}

interface PlanDiarioSnapshotMesa {
  tableId: number;
  tableName: string;
  linea: 'Línea 1 – Línea de Camas' | 'Línea 2 – Línea de Muebles';
  capacityHours: number;
  usedHours: number;
  person: string;
  percentage: string;
  calificacion: number | null;
  items: PlanDiarioSnapshotItem[];
}

interface PlanDiarioSnapshot {
  fecha: string;
  shiftId: string;
  shiftLabel: string;
  shiftStartTime: string;
  shiftDisplayEndTime: string;
  mesas: PlanDiarioSnapshotMesa[];
}

interface PlanSummaryDay {
  date: string;
  snapshot: PlanDiarioSnapshot | null;
  cantProgramada: number;
  tiempoTotalH: number;
  capacidadTotalH: number;
  mesas: PlanDiarioSnapshotMesa[];
}

// Escala fija del eje X del Diagrama de Gantt (en horas) — igual patrón/valor que en "Plan Táctico (Alpha)"
const GANTT_HOURS_SCALE = 12;

const parseHHMM = (time: string): number => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

// Hora real de reloj ("HH:MM") correspondiente a un offset en horas desde el inicio del turno guardado
// en el snapshot — mismo cálculo que el eje X del Gantt en "Plan Táctico (Alpha)"
const formatShiftClockLabel = (shiftStartTime: string, offsetHours: number): string => {
  const totalMinutes = parseHHMM(shiftStartTime) + Math.round(offsetHours * 60);
  const hh = Math.floor(totalMinutes / 60) % 24;
  const mm = totalMinutes % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

const tamanoColorClass = (tamano: PlanDiarioSnapshotItem['tamano']): string => {
  if (tamano === 'Grande') return 'bg-red-200 border-red-300 text-red-800';
  if (tamano === 'Mediano') return 'bg-emerald-200 border-emerald-300 text-emerald-800';
  return 'bg-blue-200 border-blue-300 text-blue-800';
};

// Diagrama de Gantt "tal cual" el de "Plan Táctico (Alpha)" (mismo layout/colores/leyenda/eje de
// horas), pero de SOLO LECTURA: redibuja el Gantt guardado en el snapshot de cada fecha seleccionada
// que sí tenga un Plan Diario guardado (punto 4 del pedido del usuario, 2026-08-25) — no recalcula nada.
const PlanDiarioGanttSection: React.FC<{ planSummaryByDate: PlanSummaryDay[] }> = ({ planSummaryByDate }) => {
  const diasConSnapshot = planSummaryByDate.filter(d => d.snapshot && d.mesas.length > 0);
  if (diasConSnapshot.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-md overflow-hidden mt-4">
      <div className="flex items-center gap-2 px-6 py-4 bg-gradient-to-r from-slate-900 to-purple-900">
        <LayoutDashboard className="w-5 h-5 text-purple-200" />
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Diagrama de Gantt — Plan Diario Guardado (Plan Táctico)</h3>
      </div>
      <div className="p-6 space-y-8">
        {diasConSnapshot.map(day => {
          const snapshot = day.snapshot!;
          const endShiftHours = (parseHHMM(snapshot.shiftDisplayEndTime) - parseHHMM(snapshot.shiftStartTime)) / 60;
          const endShiftLeftPct = endShiftHours > 0 && endShiftHours <= GANTT_HOURS_SCALE ? (endShiftHours / GANTT_HOURS_SCALE) * 100 : null;

          return (
            <div key={day.date} className="space-y-4">
              <h4 className="text-xs font-extrabold text-gray-700 uppercase tracking-wide border-b border-dashed border-gray-300 pb-1">
                {day.date} — {snapshot.shiftLabel}
              </h4>

              <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-600">
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-200 border border-red-300 inline-block" /> Grande</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-300 inline-block" /> Mediano</span>
                <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-200 border border-blue-300 inline-block" /> Pequeño</span>
                <span className="inline-flex items-center gap-1.5 text-gray-600">
                  <span className="w-3 border-t-[3px] border-dashed border-slate-600 inline-block" /> Límite de capacidad de la mesa
                </span>
                <span className="inline-flex items-center gap-1.5 text-gray-600">
                  <span className="w-3 border-t-4 border-slate-900 inline-block" /> Fin de turno ({snapshot.shiftDisplayEndTime})
                </span>
              </div>

              <div className="relative">
                {endShiftLeftPct !== null && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 z-30 border-r-4 border-slate-900"
                    style={{ left: `calc(11.75rem + (100% - 16rem) * ${endShiftLeftPct / 100})` }}
                    title={`Fin de turno: ${snapshot.shiftDisplayEndTime}`}
                  />
                )}

                <div className="space-y-6">
                  {(['Línea 1 – Línea de Camas', 'Línea 2 – Línea de Muebles'] as const).map(linea => {
                    const mesasLinea = day.mesas.filter(m => m.linea === linea);
                    if (mesasLinea.length === 0) return null;

                    return (
                      <div key={linea} className="space-y-3">
                        <h5 className="text-[11px] font-extrabold text-gray-600 uppercase tracking-wide">{linea}</h5>
                        {mesasLinea.map(mesa => {
                          const utilizacionPct = mesa.capacityHours > 0 ? (mesa.usedHours / mesa.capacityHours) * 100 : 0;
                          return (
                            <div key={mesa.tableId} className="flex items-stretch gap-3">
                              <div className="w-44 shrink-0 flex flex-col justify-center">
                                <p className="text-xs font-bold text-gray-800">{mesa.tableName}</p>
                                <p className="text-sm font-extrabold text-gray-900 font-mono">{mesa.usedHours.toFixed(2)} / {mesa.capacityHours.toFixed(2)} h</p>
                              </div>
                              <div className="flex-1">
                                <div className="relative h-10 bg-gray-50 border border-gray-200 rounded-md overflow-hidden">
                                  {mesa.capacityHours > 0 && mesa.capacityHours <= GANTT_HOURS_SCALE && (
                                    <div
                                      className="absolute top-0 bottom-0 border-l-[3px] border-dashed border-slate-600 z-20"
                                      style={{ left: `${(mesa.capacityHours / GANTT_HOURS_SCALE) * 100}%` }}
                                      title={`Límite de capacidad: ${mesa.capacityHours.toFixed(2)} h`}
                                    />
                                  )}
                                  {mesa.items.map((item, idx) => {
                                    const left = (item.startHour / GANTT_HOURS_SCALE) * 100;
                                    const width = ((item.endHour - item.startHour) / GANTT_HOURS_SCALE) * 100;
                                    return (
                                      <div
                                        key={`${item.source}-${item.id}-${item.material}-${idx}`}
                                        className={cn(
                                          "absolute top-0.5 bottom-0.5 border rounded-sm px-1 flex items-center overflow-hidden",
                                          tamanoColorClass(item.tamano),
                                          item.overflow && "ring-2 ring-red-600"
                                        )}
                                        style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
                                        title={`${item.nombre} (${item.material}) — ${item.tamano ?? '—'} — ${(item.endHour - item.startHour).toFixed(2)} h${item.overflow ? ' — EXCEDE CAPACIDAD' : ''}`}
                                      >
                                        <span className="text-[9px] font-semibold truncate">{item.material}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <div className="w-14 shrink-0 flex items-center justify-end">
                                <span className={cn("text-xs font-extrabold", utilizacionPct > 100 ? 'text-red-600' : utilizacionPct >= 90 ? 'text-emerald-700' : 'text-gray-600')}>
                                  {utilizacionPct.toFixed(0)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  <div className="flex items-stretch gap-3">
                    <div className="w-44 shrink-0" />
                    <div className="flex-1 flex justify-between text-[9px] text-gray-400 font-mono px-0.5">
                      {Array.from({ length: GANTT_HOURS_SCALE + 1 }, (_, h) => h).filter(h => h % 2 === 0).map(h => (
                        <span key={h}>{formatShiftClockLabel(snapshot.shiftStartTime, h)}</span>
                      ))}
                    </div>
                    <div className="w-14 shrink-0" />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface OrdenesFertTabSectionProps {
  restricciones: Restriccion[];
  columns?: string[];
  hideControls?: boolean;
  tiemposData?: any[];
  displayMode?: 'full' | 'plan';
}

interface PaginationState {
  currentPage: number;
  totalRegistros: number;
  pageSize: number;
  isExploring: boolean;
  rowsPerPage: number;
}

interface ComponentExplosion {
  id: string;
  description: string;
  unit: string;
  totalNeeded: number;
}

const ROWS_PER_PAGE_OPTIONS = [10, 20, 50, 100];

// MultiSelect component
const MultiSelect: React.FC<{
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}> = ({ options, selected, onChange, placeholder }) => {
  const [open, setOpen] = useState(false);

  const handleSelect = (value: string) => {
    const newSelected = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  const isAllSelected = options.length > 0 && selected.length === options.length;

  return (
    <div className="flex flex-col items-start w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between h-9 text-sm font-normal"
          >
            <span className="truncate">
              {selected.length === 0
                ? placeholder || 'Seleccionar...'
                : isAllSelected
                ? 'Todas las fechas'
                : `${selected.length} seleccionada(s)`}
            </span>
            <ChevronsUpDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0">
          <Command>
            <CommandInput placeholder="Buscar fecha..." className="h-9" />
            <CommandEmpty>No se encontraron fechas.</CommandEmpty>
            <CommandGroup className="max-h-60 overflow-y-auto">
              <CommandItem
                onSelect={() => {
                  if (isAllSelected) {
                    onChange([]);
                  } else {
                    onChange(options.map(o => o.value));
                  }
                }}
                className="font-bold border-b mb-1"
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    isAllSelected ? 'opacity-100' : 'opacity-0'
                  )}
                />
                {isAllSelected ? "Desmarcar Todas" : "Seleccionar Todas"}
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => {
                    handleSelect(option.value);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selected.includes(option.value) ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className="text-xs">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && !isAllSelected && (
          <div className="pt-1 text-left w-full min-h-[22px]">
            {selected.slice(0, 3).map(value => (
              <Badge key={value} variant="secondary" className="mr-1 mb-1 max-w-[100px] truncate" title={value}>
                {value}
              </Badge>
            ))}
            {selected.length > 3 && <Badge variant="secondary">+{selected.length - 3}</Badge>}
          </div>
      )}
      {isAllSelected && (
        <div className="pt-1 text-left w-full min-h-[22px]">
           <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border-indigo-200">
             Mostrando todo el horizonte
           </Badge>
        </div>
      )}
    </div>
  );
};

export const OrdenesFertTabSection: React.FC<OrdenesFertTabSectionProps> = ({ restricciones, columns, hideControls = false, tiemposData = [], displayMode = 'full' }) => {
  const { addNotification } = useAppContext();
  const [isMounted, setIsMounted] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [deliveryDatesMap, setDeliveryDatesMap] = useState<Map<string, string>>(new Map());
  const [pagination, setPagination] = useState<PaginationState>({
    currentPage: 1,
    totalRegistros: 0,
    pageSize: 10000,
    isExploring: true,
    rowsPerPage: 100,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [hasSetDefaultDate, setHasSetDefaultDate] = useState(false);

  // Estado para Explosión de Materiales
  const [explosionResults, setExplosionResults] = useState<ComponentExplosion[]>([]);
  const [isExploding, setIsExploding] = useState(false);

  const topScrollRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [tableWidth, setTableWidth] = useState(0);
  const lastScrolledRef = useRef<'top' | 'table' | null>(null);

  // Hydration Guard
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Handlers for synchronized scrollbars
  const handleTopScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (lastScrolledRef.current === 'table') {
      lastScrolledRef.current = null;
      return;
    }
    if (tableScrollRef.current) {
      lastScrolledRef.current = 'top';
      tableScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handleTableScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (lastScrolledRef.current === 'top') {
      lastScrolledRef.current = null;
      return;
    }
    if (topScrollRef.current) {
      lastScrolledRef.current = 'table';
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  // Snapshots de Plan Diario ("PlanDiarioConfig:<fecha>") ya guardados desde "Plan Táctico (Alpha)" —
  // vienen dentro de la prop `restricciones` (ya filtrada por el/los Grupo(s) de Muebles), solo hay que
  // separarlos por prefijo y parsear el JSON de `descripcion`. Fuente única de horario/mesas/personal/
  // Gantt para esta pestaña "PLAN" (ver punto 1 del pedido del usuario, 2026-08-25).
  const planDiarioSnapshotsByDate = useMemo(() => {
    const map = new Map<string, PlanDiarioSnapshot>();
    if (displayMode !== 'plan') return map;
    (restricciones || [])
      .filter(r => r.nombre_restriccion?.startsWith(PLAN_DIARIO_PREFIJO))
      .forEach(r => {
        try {
          const snapshot = JSON.parse(r.descripcion || '') as PlanDiarioSnapshot;
          if (snapshot?.fecha) map.set(snapshot.fecha, snapshot);
        } catch {
          // Restriccion con el prefijo pero descripcion corrupta/no-JSON: se ignora silenciosamente
        }
      });
    return map;
  }, [restricciones, displayMode]);

  // Capacidad diaria de referencia para "DÍAS CARGA" en CAPACIDAD CONSOLIDADA (TOTAL SISTEMA): promedio
  // de la capacidad total (suma de horas disponibles de todas las mesas) de los Planes Diarios ya
  // guardados. Antes de que exista ningún snapshot (primer uso de esta función), se usa un valor de
  // referencia conservador (14 mesas x 9h x 87%) para no dividir por cero.
  const avgDailyCapacityHours = useMemo(() => {
    const totals = Array.from(planDiarioSnapshotsByDate.values())
      .map(s => s.mesas.reduce((sum, m) => sum + m.capacityHours, 0))
      .filter(t => t > 0);
    if (totals.length === 0) return 14 * 9 * 0.87;
    return totals.reduce((sum, t) => sum + t, 0) / totals.length;
  }, [planDiarioSnapshotsByDate]);

  const tiemposMap = useMemo(() => {
    if (!tiemposData || tiemposData.length === 0) {
        return new Map<string, number>();
    }
    const map = new Map<string, number>();
    tiemposData.forEach(item => {
        const materialCode = normalizeMaterialCode(item.CodMaterial ?? item.MATERIAL ?? item.Material ?? '');
        const tiempo = item.Tiempo_Min ?? item.Tiempo ?? 0;
        if (materialCode && tiempo > 0) {
            if (!map.has(materialCode)) {
                map.set(materialCode, tiempo);
            }
        }
    });
    return map;
  }, [tiemposData]);

  const COLUMNS_TO_DISPLAY = columns || [
    'FECHA', 'PEDIDO', 'POSICION', 'ORDEN', 'MATERIAL', 'NOMBRE', 'CANTPROGRAMADA', 'CANTPENDIENTE', 'CENTRO', 
    'MAQUINA', 'PUESTOTRABAJO', 'SECTORDESC', 'CATEGORIA', 'RESPCTRLPROD'
  ];

  // Cargar fechas de entrega desde PEND TOTALES para el cruce de información
  useEffect(() => {
    if (!isMounted) return;

    const fetchDeliveryDatesMapping = async () => {
      try {
        const response = await serviciosService.getPendientesTotales(1, 20000);
        if (response.data) {
          const data = Array.isArray(response.data) ? response.data : [response.data];
          const map = new Map<string, string>();
          data.forEach((item: any) => {
            const pedido = String(item.PEDIDO || '').trim();
            if (pedido) {
              const dia = String(item.DIAENTREGA || '').padStart(2, '0');
              const mes = String(item.MESENTREGA || '').padStart(2, '0');
              const anio = String(item.ANIOENTREGA || '');
              
              if (dia !== '00' && mes !== '00' && anio) {
                const formattedDate = `${dia}-${mes}-${anio}`;
                map.set(pedido, formattedDate);
                map.set(pedido.replace(/^0+/, ''), formattedDate);
              }
            }
          });
          setDeliveryDatesMap(map);
        }
      } catch (e) {
        console.error("Error cargando mapeo de fechas de entrega", e);
      }
    };
    fetchDeliveryDatesMapping();
  }, [isMounted]);

  useEffect(() => {
    if (!isMounted) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const exploreResponse = await serviciosService.getOrdenesFert(1, 1);
        const totalFert = exploreResponse.totalRegistros || 0;

        let allFert: OrdenFert[] = [];
        if (totalFert > 0) {
          const BATCH_SIZE = 10000;
          const pages = Math.ceil(totalFert / BATCH_SIZE);
          for (let i = 1; i <= pages; i++) {
            const res = await serviciosService.getOrdenesFert(i, BATCH_SIZE);
            if (res.data) allFert = allFert.concat(res.data);
          }
        }

        const provResponse = await serviciosService.OrdenesProvisionalesPaginados(1, 20000);
        let allProv: ProvisionalOrder[] = [];
        if (provResponse.data) {
          allProv = Array.isArray(provResponse.data) ? provResponse.data : [provResponse.data];
        }

        const validResp = ['019', '006'];
        
        const fertMapped = allFert.filter(o => 
          validResp.includes(String(o.RESPCTRLPROD).trim()) && o.CENTRO === '1000'
        ).map(o => ({ ...o, _isPrevisional: false, _displayId: o.ORDEN }));

        const provMapped = allProv.filter(o => 
          validResp.includes(String(o.RESPCONTROLPROD).trim()) && o.CENTRO === '1000'
        ).map(o => ({
          FECHA: o.FECHAINICIO,
          PEDIDO: '',
          POSICION: '',
          ORDEN: o.ORDENPREVISIONAL,
          MATERIAL: o.MATERIAL,
          NOMBRE: o.NOMBRE,
          CANTPROGRAMADA: o.CANTIDAD,
          CANTPENDIENTE: o.CANTIDAD,
          CENTRO: o.CENTRO,
          MAQUINA: o.Maquina,
          PUESTOTRABAJO: o.PUESTOTRABAJO || o.Maquina,
          RESPCTRLPROD: o.RESPCONTROLPROD,
          _isPrevisional: true,
          _displayId: o.ORDENPREVISIONAL
        }));

        setOrders([...fertMapped, ...provMapped]);

      } catch (err) {
        const errorMessage = (err as Error).message;
        setError(errorMessage);
        addNotification('error', `Error al cargar datos: ${errorMessage}`);
      } finally {
        setIsLoading(false);
      }
    };

    if (restricciones) {
      fetchData();
    }
  }, [addNotification, restricciones, isMounted]);

  // ORDENES ESTRUCTURALES FILTRADAS (Toma en cuenta restricciones base como exclusión de LAMIN-01)
  const structuralFilteredOrders = useMemo(() => {
    return orders.filter(order => {
        const puesto = String(order.PUESTOTRABAJO || '').trim().toUpperCase();
        return puesto !== 'LAMIN-01';
    });
  }, [orders]);

  // CÁLCULOS MACRO (Usando structuralFilteredOrders para respetar restricciones actualizadas)
  const globalSummary = useMemo(() => {
    const totalCant = structuralFilteredOrders.reduce((sum, o) => sum + (Number(o.CANTPROGRAMADA) || 0), 0);
    const totalTimeMin = structuralFilteredOrders.reduce((sum, o) => {
      const materialCode = normalizeMaterialCode(o.MATERIAL);
      const t = tiemposMap.get(materialCode) || 0;
      return sum + (Number(o.CANTPROGRAMADA) || 0) * t;
    }, 0);

    return { totalCant, totalHours: totalTimeMin / 60 };
  }, [structuralFilteredOrders, tiemposMap]);

  const statusSummary = useMemo(() => {
    const getTargetDateStr = () => {
      const today = new Date();
      let daysAdded = 0;
      let result = new Date(today);
      while (daysAdded < 3) {
        result.setDate(result.getDate() + 1);
        const day = result.getDay();
        if (day !== 0 && day !== 6) daysAdded++;
      }
      return result.toISOString().split('T')[0];
    };

    const todayStr = new Date().toISOString().split('T')[0];
    const targetPlanningDateStr = getTargetDateStr();

    let pastCant = 0, pastHours = 0;
    let todayCant = 0, todayHours = 0;
    let futureCant = 0, futureHours = 0;

    structuralFilteredOrders.forEach(o => {
      const materialCode = normalizeMaterialCode(o.MATERIAL);
      const t = tiemposMap.get(materialCode) || 0;
      const hours = ((Number(o.CANTPROGRAMADA) || 0) * t) / 60;
      const cant = (Number(o.CANTPROGRAMADA) || 0);

      if (o.FECHA < todayStr) {
        pastCant += cant;
        pastHours += hours;
      } 
      else if (o.FECHA === todayStr) {
        todayCant += cant;
        todayHours += hours;
      }
      else if (o.FECHA >= targetPlanningDateStr) {
        futureCant += cant;
        futureHours += hours;
      }
    });

    return { pastCant, pastHours, todayCant, todayHours, futureCant, futureHours };
  }, [structuralFilteredOrders, tiemposMap]);

  const uniqueDates = useMemo(() => {
    const dates = new Set(structuralFilteredOrders.map(order => order.FECHA));
    return Array.from(dates).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [structuralFilteredOrders]);

  useEffect(() => {
    if (!hasSetDefaultDate && uniqueDates.length > 0 && displayMode === 'plan') {
      const getTargetDate = () => {
        const today = new Date();
        let daysAdded = 0;
        let result = new Date(today);
        while (daysAdded < 3) {
          result.setDate(result.getDate() + 1);
          const day = result.getDay();
          if (day !== 0 && day !== 6) daysAdded++;
        }
        return result.toISOString().split('T')[0];
      };

      const target = getTargetDate();
      setSelectedDates([target]);
      setHasSetDefaultDate(true);
    }
  }, [uniqueDates, hasSetDefaultDate, displayMode]);

  const filteredOrders = useMemo(() => {
    return structuralFilteredOrders.filter(order => {
        if (selectedDates.length === 0) return true;
        return selectedDates.includes(order.FECHA);
      });
  }, [structuralFilteredOrders, selectedDates]);
  
  const missingTimesInfo = useMemo(() => {
    const missing = new Set<string>();
    filteredOrders.forEach(order => {
      const materialCode = normalizeMaterialCode(order.MATERIAL);
      if (!tiemposMap.has(materialCode)) {
        missing.add(materialCode);
      }
    });
    const list = Array.from(missing).sort();
    return { count: list.length, list };
  }, [filteredOrders, tiemposMap]);

  // Desglose por Fecha y Mesa: ya NO se recalcula con un horario/N° de mesas genérico ni con un
  // ranking artificial de tapiceros — se lee tal cual el snapshot de Plan Diario guardado desde "Plan
  // Táctico (Alpha)" para esa fecha objetivo (horario, mesas, personal/% y horas disponibles reales de
  // ese día). Si una fecha seleccionada nunca tuvo una Distribución de Mesas ejecutada/guardada en esa
  // pestaña, `snapshot` queda `null` y la UI lo indica en vez de mostrar datos inventados.
  const planSummaryByDate = useMemo<PlanSummaryDay[]>(() => {
    if (displayMode !== 'plan' || selectedDates.length === 0) return [];

    return selectedDates.map(date => {
      const snapshot = planDiarioSnapshotsByDate.get(date) ?? null;
      const mesas = snapshot?.mesas ?? [];
      return {
        date,
        snapshot,
        cantProgramada: mesas.reduce((sum, m) => sum + m.items.reduce((s, it) => s + it.cantidad, 0), 0),
        tiempoTotalH: mesas.reduce((sum, m) => sum + m.usedHours, 0),
        capacidadTotalH: mesas.reduce((sum, m) => sum + m.capacityHours, 0),
        mesas,
      };
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [selectedDates, displayMode, planDiarioSnapshotsByDate]);

  const totalPagesLocal = Math.ceil(filteredOrders.length / pagination.rowsPerPage);
  const startIndex = (pagination.currentPage - 1) * pagination.rowsPerPage;
  const endIndex = startIndex + pagination.rowsPerPage;
  const displayedOrders = filteredOrders.slice(startIndex, endIndex);

  const goToPage = (page: number) => {
    setPagination(prev => ({ ...prev, currentPage: Math.max(1, Math.min(page, totalPagesLocal)) }));
  };

  const handleRowsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPagination(prev => ({ ...prev, rowsPerPage: Number(e.target.value), currentPage: 1 }));
  };
  
  const handleDateChange = (dates: string[]) => {
    setSelectedDates(dates);
    setPagination(prev => ({ ...prev, currentPage: 1 }));
    setExplosionResults([]); 
  };

  // Función para Explosión de Materiales
  const handleExplodeMaterials = async () => {
    if (filteredOrders.length === 0) {
        addNotification('warning', 'No hay órdenes en el plan actual para explosionar.');
        return;
    }

    setIsExploding(true);
    setExplosionResults([]);
    
    const fertDemandMap = new Map<string, number>();
    filteredOrders.forEach(o => {
        const code = normalizeMaterialCode(o.MATERIAL);
        fertDemandMap.set(code, (fertDemandMap.get(code) || 0) + (Number(o.CANTPROGRAMADA) || 0));
    });

    const uniqueFerts = Array.from(fertDemandMap.keys());
    const allComponents: any[] = [];

    try {
        addNotification('info', `Iniciando explosión de ${uniqueFerts.length} materiales únicos...`);
        
        for (const fert of uniqueFerts) {
            const res = await serviciosService.getMaestroMaterialesExplosion('1000', fert, 1, 5000);
            if (res.data) {
                const components = Array.isArray(res.data) ? res.data : [res.data];
                const parentDemand = fertDemandMap.get(fert) || 0;
                
                components.forEach((comp: any) => {
                    const cantBase = Number(comp.CANTIDAD_ACUMULADA || comp.CANTIDAD_UNITARIA || 0);
                    allComponents.push({
                        ...comp,
                        calculatedNeeded: cantBase * parentDemand
                    });
                });
            }
        }

        const grouped = new Map<string, ComponentExplosion>();
        allComponents.forEach(c => {
            const id = String(c.COMPONENTE || 'Unknown');
            if (!grouped.has(id)) {
                grouped.set(id, {
                    id,
                    description: c.DESCRIPCION_COMPONENTE || 'Sin Descripción',
                    unit: c.UNIDAD || 'UN',
                    totalNeeded: 0
                });
            }
            grouped.get(id)!.totalNeeded += c.calculatedNeeded;
        });

        const sortedResults = Array.from(grouped.values()).sort((a, b) => b.totalNeeded - a.totalNeeded);
        setExplosionResults(sortedResults);
        
        if (sortedResults.length > 0) {
            addNotification('success', `Explosión completada. Se identificaron ${sortedResults.length} componentes necesarios.`);
        } else {
            addNotification('warning', 'La consulta de explosión no devolvió componentes para estos materiales.');
        }

    } catch (e) {
        console.error("Error en explosión:", e);
        addNotification('error', 'Error al procesar la explosión de materiales.');
    } finally {
        setIsExploding(false);
    }
  };

  useEffect(() => {
    if (!isMounted) return;
    const calculateWidth = () => { if (tableRef.current) setTableWidth(tableRef.current.offsetWidth); };
    calculateWidth();
    window.addEventListener('resize', calculateWidth);
    const resizeObserver = new ResizeObserver(calculateWidth);
    if (tableRef.current) resizeObserver.observe(tableRef.current);
    return () => {
      window.removeEventListener('resize', calculateWidth);
      if (tableRef.current) resizeObserver.unobserve(tableRef.current);
    };
  }, [displayedOrders, isMounted]);

  if (!isMounted) return null;

  return (
    <div className="space-y-4">
      {displayMode === 'plan' && missingTimesInfo.count > 0 && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4 shadow-md animate-pulse">
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0 bg-red-100 p-2 rounded-full">
              <BellRing className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-red-800 uppercase tracking-tight flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Alerta de Consistencia de Datos
              </h3>
              <p className="text-xs text-red-700 font-medium mt-0.5">
                Se han detectado <span className="underline decoration-2">{missingTimesInfo.count}</span> materiales en la selección que <span className="font-bold">no tienen información de tiempo</span>.
              </p>
            </div>
          </div>
          
          <div className="mt-3 pt-3 border-t border-red-200">
            <p className="text-[10px] text-red-600 font-bold uppercase mb-2">Números de material sin tiempo:</p>
            <div className="flex flex-wrap gap-1.5">
              {missingTimesInfo.list.map(code => (
                <Badge key={code} variant="outline" className="bg-white text-red-700 border-red-300 text-[10px] py-0 px-2 font-mono h-5">
                  {code}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {!hideControls && (
        <div className="flex flex-col space-y-6 mb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-4 flex-1">
              <div className="w-56">
                <label htmlFor="date-filter" className="text-sm font-semibold text-gray-700">Fecha(s):</label>
                <MultiSelect
                  options={uniqueDates.map(d => ({ value: d, label: d }))}
                  selected={selectedDates}
                  onChange={handleDateChange}
                  placeholder="Todas las fechas"
                />
              </div>

              {displayMode === 'plan' && (
                <>
                  <div className="flex items-end h-16">
                    <Button 
                        onClick={handleExplodeMaterials} 
                        disabled={isExploding || filteredOrders.length === 0}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-md h-9"
                    >
                        {isExploding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}
                        Calcular Explosión
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>

          {displayMode === 'plan' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Card 1: CAPACIDAD CONSOLIDADA (Toma en cuenta restricciones actualizadas) */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide flex items-center justify-center gap-2">
                    <LayoutDashboard className="w-4 h-4 text-indigo-600" /> CAPACIDAD CONSOLIDADA (TOTAL SISTEMA)
                  </h4>
                  <div className="grid grid-cols-3 gap-0 items-center text-base border rounded-md bg-white min-h-[80px]">
                      <div className="text-center border-r border-dashed border-gray-300 p-3 flex flex-col justify-center">
                          <p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">UNIDADES TOTALES</p>
                          <p className="font-bold text-base text-gray-900">{globalSummary.totalCant.toLocaleString()}</p>
                      </div>
                      <div className="text-center border-r border-dashed border-gray-300 p-3 flex flex-col justify-center">
                          <p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">HORAS TOTALES</p>
                          <p className="font-bold text-base text-indigo-700">{globalSummary.totalHours.toFixed(1)}h</p>
                      </div>
                      <div className="text-center p-3 flex flex-col justify-center">
                          <p className="text-[10px] text-gray-500 font-semibold uppercase mb-1">DÍAS CARGA</p>
                          <p className="font-bold text-base text-blue-600">
                            {(globalSummary.totalHours / avgDailyCapacityHours).toFixed(1)} Días
                          </p>
                      </div>
                  </div>
                </div>

                {/* Card 2: ESTADO DE ÓRDENES (Toma en cuenta restricciones actualizadas) */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
                  <h4 className="text-[13px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide flex items-center justify-center gap-2">
                    <History className="w-4 h-4 text-indigo-600" /> ESTADO DE ÓRDENES (CRONOLÓGICO)
                  </h4>
                  <div className="grid grid-cols-3 gap-0 items-center text-sm border rounded-md bg-white min-h-[80px]">
                      <div className="text-center border-r border-dashed border-gray-300 p-2 flex flex-col justify-center bg-red-50/30">
                          <p className="text-[9px] text-red-600 font-bold uppercase mb-1" title="Órdenes antes de hoy">ATRASADAS</p>
                          <p className="font-bold text-sm text-red-700">{statusSummary.pastCant.toLocaleString()}</p>
                          <p className="text-[10px] text-red-500 font-mono">{statusSummary.pastHours.toFixed(1)}h</p>
                      </div>
                      <div className="text-center border-r border-dashed border-gray-300 p-2 flex flex-col justify-center bg-blue-50/30">
                          <p className="text-[9px] text-blue-600 font-bold uppercase mb-1" title="Carga del día de hoy">HOY</p>
                          <p className="font-bold text-sm text-blue-700">{statusSummary.todayCant.toLocaleString()}</p>
                          <p className="text-[10px] text-blue-500 font-mono">{statusSummary.todayHours.toFixed(1)}h</p>
                      </div>
                      <div className="text-center p-2 flex flex-col justify-center bg-green-50/30">
                          <p className="text-[9px] text-green-600 font-bold uppercase mb-1" title="Carga total por planificar">POR PLANIFICAR</p>
                          <p className="font-bold text-sm text-green-700">{statusSummary.futureCant.toLocaleString()}</p>
                          <p className="text-[10px] text-green-500 font-mono">{statusSummary.futureHours.toFixed(1)}h</p>
                      </div>
                  </div>
                </div>
            </div>
          )}

          {displayMode === 'plan' && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-sm">
              <h4 className="text-[13px] font-bold text-gray-800 mb-4 text-center uppercase tracking-wide flex items-center justify-center gap-2">
                <ListChecks className="w-4 h-4 text-indigo-600" /> Desglose por Fecha y Mesa (Filtro Actual)
              </h4>
              <div className="space-y-4 max-h-[500px] overflow-y-auto">
                  {selectedDates.length > 0 ? (
                    planSummaryByDate.map((daySummary) => {
                      const capacidadOcupadaTotal = daySummary.capacidadTotalH > 0 ? (daySummary.tiempoTotalH / daySummary.capacidadTotalH) * 100 : 0;
                      if (!daySummary.snapshot) {
                        return (
                          <div key={daySummary.date} className="border rounded-md bg-white overflow-hidden shadow-sm">
                            <div className="p-2 bg-indigo-600 text-white text-xs font-bold uppercase text-center">FECHA: {daySummary.date}</div>
                            <p className="p-4 text-center text-amber-700 text-xs italic bg-amber-50">
                              No hay un Plan Diario guardado para esta fecha — ejecute "Distribución de Mesas" en "Plan Táctico (Alpha)" cuando esta sea la fecha objetivo de esa pestaña.
                            </p>
                          </div>
                        );
                      }
                      return (
                      <div key={daySummary.date} className="border rounded-md bg-white overflow-hidden shadow-sm">
                          <div className="grid grid-cols-5 gap-0 items-center text-xs p-2 bg-indigo-600 text-white font-bold uppercase">
                              <div className="text-center border-r border-indigo-400">FECHA: {daySummary.date}</div>
                              <div className="text-center border-r border-indigo-400">CANT: {daySummary.cantProgramada.toLocaleString()}</div>
                              <div className="text-center border-r border-indigo-400">REQ: {daySummary.tiempoTotalH.toFixed(1)}h</div>
                              <div className="text-center border-r border-indigo-400">DISP: {daySummary.capacidadTotalH.toFixed(1)}h ({daySummary.snapshot.shiftLabel})</div>
                              <div className="text-center">OCUPACIÓN: {capacidadOcupadaTotal.toFixed(1)}%</div>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="min-w-full text-xs">
                              <thead className="bg-gray-100 text-gray-600 uppercase border-b">
                                <tr>
                                  <th className="px-3 py-1.5 text-left font-bold border-r">Mesa</th>
                                  <th className="px-3 py-1.5 text-left font-bold border-r">Personal</th>
                                  <th className="px-2 py-1.5 text-center font-bold border-r">Cant</th>
                                  <th className="px-2 py-1.5 text-center font-bold border-r">Horas Req</th>
                                  <th className="px-2 py-1.5 text-center font-bold border-r">Horas Disp</th>
                                  <th className="px-2 py-1.5 text-center font-bold">Ocupación %</th>
                                </tr>
                              </thead>
                              <tbody>
                                {daySummary.mesas.map((mesa) => {
                                  const capMesa = mesa.capacityHours > 0 ? (mesa.usedHours / mesa.capacityHours) * 100 : 0;
                                  const cantMesa = mesa.items.reduce((s, it) => s + it.cantidad, 0);
                                  const sinProductos = cantMesa === 0;
                                  const personalLabel = mesa.person
                                    ? `${mesa.person}${mesa.percentage ? ` (${mesa.percentage}%)` : ''}${mesa.calificacion !== null ? ` — Capacitación ${mesa.calificacion}%` : ''}`
                                    : 'Sin Asignar';
                                  return (
                                    <tr key={mesa.tableId} className={cn("border-b last:border-0", sinProductos && "bg-red-100")}>
                                      <td className="px-3 py-1 font-semibold border-r">{mesa.tableName}</td>
                                      <td className="px-3 py-1 border-r text-blue-600 truncate max-w-[220px]" title={personalLabel}>{personalLabel}</td>
                                      <td className="px-2 py-1 text-center font-mono border-r">{cantMesa}</td>
                                      <td className="px-2 py-1 text-center font-mono border-r">{mesa.usedHours.toFixed(2)}</td>
                                      <td className="px-2 py-1 text-center font-mono border-r text-gray-500">{mesa.capacityHours.toFixed(2)}</td>
                                      <td className={cn("px-2 py-1 text-center font-bold font-mono", capMesa > 100 ? "text-red-600 bg-red-50" : "text-blue-600")}>
                                        {capMesa.toFixed(1)}%
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                      </div>
                      );
                    })
                  ) : (
                    <p className="p-4 text-center text-gray-500 text-sm italic bg-white rounded-md border">Selecciona fechas para analizar capacidad.</p>
                  )}
              </div>
            </div>
          )}

          {displayMode === 'plan' && <PlanDiarioGanttSection planSummaryByDate={planSummaryByDate} />}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg overflow-hidden border">
        <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden" style={{ height: '18px' }}>
            <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
        </div>
        <div ref={tableScrollRef} onScroll={handleTableScroll} className="overflow-x-auto">
          <table ref={tableRef} className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr>
                {COLUMNS_TO_DISPLAY.map((col, index) => (
                  <th key={col} className={cn("px-3 py-3 text-center text-[11px] font-bold text-gray-700 uppercase tracking-wider", index < COLUMNS_TO_DISPLAY.length - 1 && "border-r border-dashed border-gray-300")}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {displayedOrders.map((order, index) => {
                  const materialCode = normalizeMaterialCode(order.MATERIAL);
                  const tiempoMin = tiemposMap.get(materialCode) || 0;
                  const tiempoTotal = (Number(order.CANTPROGRAMADA) || 0) * tiempoMin;

                  return (
                    <tr key={`${order._displayId}-${index}`} className={cn("hover:bg-gray-50 transition-colors", order._isPrevisional ? "bg-blue-50/20" : "")}>
                      {COLUMNS_TO_DISPLAY.map((col, colIndex) => {
                          const isBorder = colIndex < COLUMNS_TO_DISPLAY.length - 1 ? 'border-r border-dashed border-gray-300' : '';
                          
                          if (col === 'TIEMPO') {
                              return (
                                 <td key={col} className={cn("px-2 py-3 text-center font-mono font-bold text-[13px]", tiempoTotal === 0 ? "text-red-400" : "text-blue-700", isBorder)}>
                                   {tiempoTotal > 0 ? tiempoTotal.toFixed(2) : '-'}
                                 </td>
                              );
                          }

                          if (col === 'FECHA ENTREGA') {
                             const pedidoRaw = String(order.PEDIDO || '').trim();
                             const pedidoNoZeros = pedidoRaw.replace(/^0+/, '');
                             const deliveryDate = deliveryDatesMap.get(pedidoRaw) || deliveryDatesMap.get(pedidoNoZeros) || '-';
                             return (
                                <td key={col} className={cn("px-2 py-3 text-center text-[13px] font-semibold text-emerald-700", isBorder)}>
                                  {deliveryDate}
                                </td>
                             );
                          }

                          let displayValue = String((order as any)[col] ?? '-');
                          if ((col === 'PEDIDO' || col === 'POSICION') && displayValue.startsWith('000')) {
                              displayValue = displayValue.substring(3);
                          } else if (col === 'ORDEN' && displayValue.length > 4 && !order._isPrevisional) {
                              displayValue = displayValue.substring(4);
                          } else if (col === 'MATERIAL') {
                              displayValue = normalizeMaterialCode(displayValue);
                          }

                          return (
                           <td key={col} className={cn("px-2 py-3 text-center text-sm text-gray-600", col === 'CANTPROGRAMADA' && "font-bold text-gray-900", isBorder)}>
                             {displayValue}
                           </td>
                          );
                      })}
                    </tr>
                  );
              })}
            </tbody>
          </table>
        </div>
      </div>
      
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center space-x-4">
          <span className="text-sm text-gray-600">Mostrando {displayedOrders.length} de {filteredOrders.length} registros.</span>
          <select value={pagination.rowsPerPage} onChange={handleRowsPerPageChange} className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {ROWS_PER_PAGE_OPTIONS.map(size => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={() => goToPage(1)} disabled={pagination.currentPage === 1}>Primera</Button>
          <Button variant="outline" size="sm" onClick={() => goToPage(pagination.currentPage - 1)} disabled={pagination.currentPage === 1}>Ant.</Button>
          <span className="text-sm text-gray-600 px-2 font-bold">{pagination.currentPage} / {totalPagesLocal}</span>
          <Button variant="outline" size="sm" onClick={() => goToPage(pagination.currentPage + 1)} disabled={pagination.currentPage >= totalPagesLocal}>Sig.</Button>
          <Button variant="outline" size="sm" onClick={() => goToPage(totalPagesLocal)} disabled={pagination.currentPage >= totalPagesLocal}>Última</Button>
        </div>
      </div>

      {/* SUBSECCIÓN: EXPLOSIÓN DE MATERIALES */}
      {displayMode === 'plan' && (
        <div className="mt-8">
            <Accordion type="single" collapsible className="w-full bg-white border rounded-xl shadow-lg">
                <AccordionItem value="explosion" className="border-b-0">
                    <AccordionTrigger className="px-6 py-4 hover:no-underline">
                        <div className="flex items-center gap-3">
                            <div className="bg-emerald-100 p-2 rounded-lg">
                                <FileJson className="w-5 h-5 text-emerald-700" />
                            </div>
                            <div className="text-left">
                                <h3 className="text-lg font-bold text-gray-800">Explosión de Materiales (Necesidad de Componentes)</h3>
                                <p className="text-xs text-gray-500">Listado consolidado de componentes requeridos para el plan actual</p>
                            </div>
                            {explosionResults.length > 0 && (
                                <Badge className="ml-4 bg-emerald-100 text-emerald-700 border-emerald-200">
                                    {explosionResults.length} componentes
                                </Badge>
                            )}
                        </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-6 pb-6">
                        {isExploding ? (
                            <div className="flex flex-col items-center justify-center py-12 gap-4">
                                <Loader2 className="w-12 h-12 animate-spin text-emerald-600" />
                                <p className="text-sm text-gray-600 font-medium">Procesando explosión de materiales... esto puede tomar un momento.</p>
                            </div>
                        ) : explosionResults.length > 0 ? (
                            <div className="overflow-x-auto border rounded-lg">
                                <table className="min-w-full divide-y divide-gray-200 text-xs">
                                    <thead className="bg-emerald-50">
                                        <tr>
                                            <th className="px-4 py-3 text-left font-bold text-emerald-900 uppercase">Material Componente</th>
                                            <th className="px-4 py-3 text-left font-bold text-emerald-900 uppercase">Descripción</th>
                                            <th className="px-4 py-3 text-center font-bold text-emerald-900 uppercase">Unidad</th>
                                            <th className="px-4 py-3 text-right font-bold text-emerald-900 uppercase">Cantidad Total Necesaria</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-100">
                                        {explosionResults.map((comp, idx) => (
                                            <tr key={`${comp.id}-${idx}`} className="hover:bg-emerald-50/30 transition-colors">
                                                <td className="px-4 py-2 font-mono font-bold text-indigo-700">{comp.id}</td>
                                                <td className="px-4 py-2 text-gray-700">{comp.description}</td>
                                                <td className="px-4 py-2 text-center text-gray-500 font-medium">{comp.unit}</td>
                                                <td className="px-4 py-2 text-right font-mono font-bold text-emerald-700">
                                                    {comp.totalNeeded.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot className="bg-gray-800 text-white font-bold">
                                        <tr>
                                            <td colSpan={3} className="px-4 py-3 text-right uppercase">Resumen de Explosión</td>
                                            <td className="px-4 py-3 text-right">
                                                {explosionResults.reduce((sum, c) => sum + c.totalNeeded, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} unidades de material
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-12 bg-gray-50 border-2 border-dashed rounded-lg">
                                <Calculator className="w-12 h-12 text-gray-300 mb-4" />
                                <p className="text-sm text-gray-500">Haz clic en el botón superior <span className="font-bold">"Calcular Explosión"</span> para ver los materiales necesarios.</p>
                                <p className="text-xs text-gray-400 mt-1">Se procesarán todos los materiales correspondientes al filtro de fechas actual.</p>
                            </div>
                        )}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
      )}
    </div>
  );
};
