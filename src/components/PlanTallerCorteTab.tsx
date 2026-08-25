'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { serviciosService } from '@/services/servicios.service';
import { useAppContext } from '@/context/AppProvider';
import { Loader2, RefreshCw, ListChecks, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const normalizeMaterialCode = (code: string | number): string => String(code).trim().slice(-8);

// Centro de fabricación del Taller de Corte (Quito) — mismo valor que el resto del módulo
const CENTRO_TC = '1000';

// Responsable de Control de Fabricación de los forros de Muebles que fabrica este taller — SOLAMENTE
// '026' (no '033' Estructuras, que es otra área). Aquí se muestran TODAS las órdenes Fert de ese
// RespCtrlProd tal cual vienen de SAP, sin las exclusiones de materiales ficticios que sí aplica la
// pestaña "PLAN TÁCTICO" (esExcluidoTallerCorte) — este es un visor crudo, no alimenta la planificación.
const RESP_CTRL_PROD_FORROS = '026';

// Columnas que devuelve getOrdenesFert (interfaz OrdenFert) a mostrar, en el orden pedido por el
// usuario (2026-08-25): PUESTOTRABAJO aparte como primera columna ("Pto. Trab."); se quitaron CENTRO/
// SECTORDESC/CANTRECHAZO/UNIDAD/ANIO/MES/DIA/SEMANA/CATEGORIA/PRIORIDAD/ENLINEA/PEDIDO/
// CANTPROGPESONETO/CANTENTREGPESONETO/CANTNOTIFPESONETO/CANTRECHAZOPESONETO/POSICION/PUESTOTRABAJO2/
// PUESTOTRABAJO3/IDHOJARUTA/FECHAORDEN/CANTPENDIENTE/TIEMPOPENDIENTE (redundantes o poco útiles para
// este visor); FECHA se movió justo después de CANTPROGRAMADA.
const COLUMNS_TO_DISPLAY = [
    'ORDEN', 'MATERIAL', 'NOMBRE', 'CANTPROGRAMADA', 'FECHA', 'CANTENTREGADA', 'CANTNOTIFICADA',
    'RESPCTRLPROD', 'MAQUINA',
] as const;

// Selector de fecha(s) con búsqueda — mismo patrón (Popover + Command + Badges) ya usado en
// OrdenesFertTabSection.tsx para la pestaña "PLAN" de Muebles, duplicado aquí a propósito (componente
// pequeño, no compartido entre módulos).
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
                                    if (isAllSelected) onChange([]);
                                    else onChange(options.map(o => o.value));
                                }}
                                className="font-bold border-b mb-1"
                            >
                                <Check className={cn('mr-2 h-4 w-4', isAllSelected ? 'opacity-100' : 'opacity-0')} />
                                {isAllSelected ? "Desmarcar Todas" : "Seleccionar Todas"}
                            </CommandItem>
                            {options.map((option) => (
                                <CommandItem key={option.value} value={option.value} onSelect={() => handleSelect(option.value)}>
                                    <Check className={cn('mr-2 h-4 w-4', selected.includes(option.value) ? 'opacity-100' : 'opacity-0')} />
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
        </div>
    );
};

interface PlanTallerCorteTabProps {
    // Tiempo unitario manual (minutos) por código de material, ya normalizado — el mismo mapa EFECTIVO
    // (Excel + overrides) que consume la pestaña "PLAN TÁCTICO", para calcular el tiempo de fabricación
    // de cada orden (columna "Tiempo Total (min)") y el resumen por Puesto de Trabajo/Máquina.
    tiemposManualMap: Map<string, number>;
}

export const PlanTallerCorteTab: React.FC<PlanTallerCorteTabProps> = ({ tiemposManualMap }) => {
    const { addNotification } = useAppContext();
    const [isLoading, setIsLoading] = useState(false);
    const [allFertRaw, setAllFertRaw] = useState<any[]>([]);
    const [selectedDates, setSelectedDates] = useState<string[]>([]);

    // Scroll horizontal sincronizado (barra delgada arriba + la tabla real abajo) — mismo patrón que
    // OrdenesFertTabSection.tsx: con 24 columnas la tabla es más ancha que la pantalla, y un scroll
    // horizontal "plano" (solo al pie de la tabla) queda oculto tras el scroll vertical de las filas.
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const tableRef = useRef<HTMLTableElement>(null);
    const [tableWidth, setTableWidth] = useState(0);
    const lastScrolledRef = useRef<'top' | 'table' | null>(null);

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

    const fetchData = React.useCallback(async () => {
        setIsLoading(true);
        try {
            const explore = await serviciosService.getOrdenesFert(1, 1);
            const total = explore.totalRegistros || 0;
            let combined: any[] = [];
            if (total > 0) {
                const BATCH = 10000;
                const pages = Math.ceil(total / BATCH);
                for (let i = 1; i <= pages; i++) {
                    const res = await serviciosService.getOrdenesFert(i, BATCH);
                    if (res.data) combined = combined.concat(Array.isArray(res.data) ? res.data : [res.data]);
                }
            }
            setAllFertRaw(combined);
        } catch (error) {
            addNotification('error', `Error al cargar las Órdenes Fert del Taller de Corte: ${(error as Error).message}`);
        } finally {
            setIsLoading(false);
        }
    }, [addNotification]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Órdenes Fert del Taller de Corte: RespCtrlProd '026', Centro 1000 — sin las exclusiones de
    // materiales ficticios de "PLAN TÁCTICO" (esExcluidoTallerCorte), este es un visor crudo de SAP.
    // Excepción pedida por el usuario (2026-08-25): el puesto de trabajo "TAPCS-01" (subcontratado,
    // "FORRO COJIN CILINDRICO...") se excluye por completo de este visor.
    const fertOrders = useMemo(() => {
        return allFertRaw
            .filter(o =>
                String(o.RESPCTRLPROD || '').trim() === RESP_CTRL_PROD_FORROS
                && String(o.CENTRO || '').trim() === CENTRO_TC
                && String(o.PUESTOTRABAJO || '').trim() !== 'TAPCS-01'
            )
            .sort((a, b) => String(a.FECHA || '').localeCompare(String(b.FECHA || '')));
    }, [allFertRaw]);

    const uniqueDates = useMemo(() => {
        const dates = new Set(fertOrders.map(o => String(o.FECHA || '').trim()).filter(Boolean));
        return Array.from(dates).sort((a, b) => b.localeCompare(a));
    }, [fertOrders]);

    const filteredOrders = useMemo(() => {
        if (selectedDates.length === 0) return fertOrders;
        return fertOrders.filter(o => selectedDates.includes(String(o.FECHA || '').trim()));
    }, [fertOrders, selectedDates]);

    // Tiempo de fabricación de cada orden: tiempo unitario (min, pestaña "Tiempos") x CANTPROGRAMADA.
    // null cuando el material no tiene tiempo unitario cargado (ni en el Excel ni como override manual).
    const getTiempoTotalMin = React.useCallback((order: any): number | null => {
        const materialCode = normalizeMaterialCode(order.MATERIAL);
        const tiempoUnitMin = tiemposManualMap.get(materialCode);
        if (tiempoUnitMin === undefined) return null;
        return tiempoUnitMin * (Number(order.CANTPROGRAMADA) || 0);
    }, [tiemposManualMap]);

    // Resumen: Unidades Programadas + Tiempo Total (min/h) agrupado por cada combinación de Puesto de
    // Trabajo + Máquina, sobre el filtro de fecha(s) actual.
    const resumenPorPuestoMaquina = useMemo(() => {
        const map = new Map<string, { puesto: string; maquina: string; cantidad: number; tiempoTotalMin: number; sinTiempoCount: number }>();
        filteredOrders.forEach(o => {
            const puesto = String(o.PUESTOTRABAJO || '').trim() || '(Sin Puesto)';
            const maquina = String(o.MAQUINA || '').trim() || '(Sin Máquina)';
            const key = `${puesto}|${maquina}`;
            if (!map.has(key)) map.set(key, { puesto, maquina, cantidad: 0, tiempoTotalMin: 0, sinTiempoCount: 0 });
            const entry = map.get(key)!;
            entry.cantidad += Number(o.CANTPROGRAMADA) || 0;
            const tiempoTotalMin = getTiempoTotalMin(o);
            if (tiempoTotalMin === null) entry.sinTiempoCount++;
            else entry.tiempoTotalMin += tiempoTotalMin;
        });
        return Array.from(map.values()).sort((a, b) => a.puesto.localeCompare(b.puesto) || a.maquina.localeCompare(b.maquina));
    }, [filteredOrders, getTiempoTotalMin]);

    // Mide el ancho real de la tabla para que la barra de scroll horizontal delgada de arriba tenga el
    // mismo ancho "virtual" que el contenido y así se pueda arrastrar para desplazar la tabla de abajo.
    useEffect(() => {
        const calculateWidth = () => { if (tableRef.current) setTableWidth(tableRef.current.offsetWidth); };
        calculateWidth();
        window.addEventListener('resize', calculateWidth);
        const resizeObserver = new ResizeObserver(calculateWidth);
        if (tableRef.current) resizeObserver.observe(tableRef.current);
        return () => {
            window.removeEventListener('resize', calculateWidth);
            if (tableRef.current) resizeObserver.unobserve(tableRef.current);
        };
    }, [filteredOrders]);

    return (
        <div className="space-y-4">
            <div className="flex items-end justify-between gap-4">
                <div className="w-64">
                    <label className="text-sm font-semibold text-gray-700">Fecha(s):</label>
                    <MultiSelect
                        options={uniqueDates.map(d => ({ value: d, label: d }))}
                        selected={selectedDates}
                        onChange={setSelectedDates}
                        placeholder="Todas las fechas"
                    />
                </div>
                <Button
                    onClick={fetchData}
                    disabled={isLoading}
                    size="sm"
                    className="h-9 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 font-bold gap-2"
                >
                    {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Actualizar Datos
                </Button>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-900">
                    <div className="flex items-center gap-2">
                        <ListChecks className="w-5 h-5 text-indigo-200" />
                        <h3 className="text-sm font-bold text-white uppercase tracking-wide">Órdenes Fert — Taller de Corte (RespCtrlProd 026)</h3>
                    </div>
                    <span className="text-xs text-indigo-200 font-mono">{filteredOrders.length} orden(es)</span>
                </div>

                {isLoading && allFertRaw.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
                        <p className="text-sm text-gray-500">Descargando Órdenes Fert...</p>
                    </div>
                ) : (
                    <div className="border-t">
                        {/* Barra de scroll horizontal delgada, siempre visible justo bajo el encabezado —
                            sincronizada con el scroll real de la tabla de abajo, para no depender de llegar
                            hasta el final del scroll vertical para poder desplazarse horizontalmente. */}
                        <div ref={topScrollRef} onScroll={handleTopScroll} className="overflow-x-auto overflow-y-hidden border-b bg-gray-50" style={{ height: '14px' }}>
                            <div style={{ width: `${tableWidth}px`, height: '1px' }} />
                        </div>
                        <div ref={tableScrollRef} onScroll={handleTableScroll} className="overflow-auto max-h-[60vh]">
                            <table ref={tableRef} className="min-w-full divide-y divide-gray-200 text-xs">
                                <thead className="bg-gray-100 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-3 text-center font-bold text-gray-700 uppercase tracking-wider border-r border-dashed border-gray-300 sticky left-0 bg-gray-100 z-20 whitespace-nowrap">
                                            Pto. Trab.
                                        </th>
                                        {COLUMNS_TO_DISPLAY.map((col) => (
                                            <th key={col} className="px-3 py-3 text-center font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap border-r border-dashed border-gray-300">
                                                {col}
                                            </th>
                                        ))}
                                        <th className="px-3 py-3 text-center font-bold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                                            Tiempo Total (min)
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {filteredOrders.map((order, idx) => {
                                        const tiempoTotalMin = getTiempoTotalMin(order);
                                        return (
                                        <tr key={`${order.ORDEN}-${idx}`} className="hover:bg-gray-50">
                                            <td className="px-3 py-2 text-center font-bold text-indigo-700 border-r border-dashed border-gray-300 sticky left-0 bg-white z-10 whitespace-nowrap">
                                                {order.PUESTOTRABAJO || '-'}
                                            </td>
                                            {COLUMNS_TO_DISPLAY.map((col) => {
                                                // ORDEN viene con ceros a la izquierda (ej. "000062774089") — se
                                                // quitan solo los 4 primeros, a pedido del usuario.
                                                const displayValue = col === 'MATERIAL'
                                                    ? normalizeMaterialCode(order.MATERIAL)
                                                    : col === 'ORDEN'
                                                        ? String(order.ORDEN ?? '-').replace(/^0{1,4}/, '')
                                                        : String((order as any)[col] ?? '-');
                                                return (
                                                    <td key={col} className="px-3 py-2 text-center text-gray-600 whitespace-nowrap border-r border-dashed border-gray-300">
                                                        {displayValue}
                                                    </td>
                                                );
                                            })}
                                            <td className={cn("px-3 py-2 text-center whitespace-nowrap font-semibold", tiempoTotalMin === null ? "text-amber-600" : "text-blue-700")}>
                                                {tiempoTotalMin !== null ? tiempoTotalMin.toFixed(2) : 'Falta tiempo unitario'}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                    {filteredOrders.length === 0 && (
                                        <tr>
                                            <td colSpan={COLUMNS_TO_DISPLAY.length + 2} className="text-center py-8 text-gray-400 text-xs">
                                                No se encontraron Órdenes Fert (RespCtrlProd 026) para la fecha seleccionada.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                                {filteredOrders.length > 0 && (
                                    <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                                        <tr>
                                            <td className="px-3 py-2 text-center font-bold border-r border-dashed border-gray-300 sticky left-0 bg-gray-50 z-10 whitespace-nowrap">Total</td>
                                            <td colSpan={COLUMNS_TO_DISPLAY.length} className="px-3 py-2 text-left font-bold text-gray-700 whitespace-nowrap border-r border-dashed border-gray-300">
                                                {filteredOrders.length} orden(es) — {filteredOrders.reduce((s, o) => s + (Number(o.CANTPROGRAMADA) || 0), 0).toLocaleString()} unidad(es) programada(s)
                                            </td>
                                            <td className="px-3 py-2 text-center font-bold text-blue-700 whitespace-nowrap">
                                                {filteredOrders.reduce((s, o) => s + (getTiempoTotalMin(o) ?? 0), 0).toFixed(2)} min
                                            </td>
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {!isLoading && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-purple-900">
                        <div className="flex items-center gap-2">
                            <ListChecks className="w-5 h-5 text-purple-200" />
                            <h3 className="text-sm font-bold text-white uppercase tracking-wide">Resumen por Puesto de Trabajo y Máquina</h3>
                        </div>
                        <span className="text-xs text-purple-200 font-mono">{resumenPorPuestoMaquina.length} combinación(es)</span>
                    </div>
                    <div className="overflow-auto max-h-[40vh]">
                        <table className="min-w-full divide-y divide-gray-200 text-xs">
                            <thead className="bg-gray-100 sticky top-0 z-10">
                                <tr>
                                    <th className="px-3 py-3 text-center font-bold text-gray-700 uppercase tracking-wider border-r border-dashed border-gray-300">Pto. Trab.</th>
                                    <th className="px-3 py-3 text-center font-bold text-gray-700 uppercase tracking-wider border-r border-dashed border-gray-300">Máquina</th>
                                    <th className="px-3 py-3 text-center font-bold text-gray-700 uppercase tracking-wider border-r border-dashed border-gray-300">Unidades Programadas</th>
                                    <th className="px-3 py-3 text-center font-bold text-gray-700 uppercase tracking-wider border-r border-dashed border-gray-300">Tiempo Total (min)</th>
                                    <th className="px-3 py-3 text-center font-bold text-gray-700 uppercase tracking-wider">Tiempo Total (h)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {resumenPorPuestoMaquina.map(row => (
                                    <tr key={`${row.puesto}-${row.maquina}`} className="hover:bg-gray-50">
                                        <td className="px-3 py-2 text-center font-bold text-indigo-700 border-r border-dashed border-gray-300 whitespace-nowrap">{row.puesto}</td>
                                        <td className="px-3 py-2 text-center text-gray-600 border-r border-dashed border-gray-300 whitespace-nowrap">{row.maquina}</td>
                                        <td className="px-3 py-2 text-center font-semibold text-gray-900 border-r border-dashed border-gray-300">{row.cantidad.toLocaleString()}</td>
                                        <td className="px-3 py-2 text-center font-semibold text-blue-700 border-r border-dashed border-gray-300">
                                            {row.tiempoTotalMin.toFixed(2)}
                                            {row.sinTiempoCount > 0 && (
                                                <span className="ml-1 text-amber-600 font-normal" title={`${row.sinTiempoCount} orden(es) sin tiempo unitario cargado, no incluida(s) en esta suma`}>
                                                    (*{row.sinTiempoCount})
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center font-semibold text-blue-700">{(row.tiempoTotalMin / 60).toFixed(2)}</td>
                                    </tr>
                                ))}
                                {resumenPorPuestoMaquina.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="text-center py-8 text-gray-400 text-xs">
                                            No hay órdenes para resumir en la fecha seleccionada.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                            {resumenPorPuestoMaquina.length > 0 && (
                                <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                                    <tr>
                                        <td colSpan={2} className="px-3 py-2 text-center font-bold border-r border-dashed border-gray-300">Total</td>
                                        <td className="px-3 py-2 text-center font-bold text-gray-900 border-r border-dashed border-gray-300">
                                            {resumenPorPuestoMaquina.reduce((s, r) => s + r.cantidad, 0).toLocaleString()}
                                        </td>
                                        <td className="px-3 py-2 text-center font-bold text-blue-700 border-r border-dashed border-gray-300">
                                            {resumenPorPuestoMaquina.reduce((s, r) => s + r.tiempoTotalMin, 0).toFixed(2)}
                                        </td>
                                        <td className="px-3 py-2 text-center font-bold text-blue-700">
                                            {(resumenPorPuestoMaquina.reduce((s, r) => s + r.tiempoTotalMin, 0) / 60).toFixed(2)}
                                        </td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
