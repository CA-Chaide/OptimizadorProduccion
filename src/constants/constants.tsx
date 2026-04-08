import React from 'react';
import { 
    LayoutDashboard,
    Upload,
    SlidersHorizontal,
    Wrench,
    Users,
    CalendarX2,
    ListChecks,
    CalendarClock,
    Plus,
    Pencil,
    Trash2,
    CalendarCheck,
    DatabaseZap,
    Truck,
    Sheet,
    Activity,
    ClipboardList,
    Link2,
} from 'lucide-react';
import { ProcessType, Holiday, HolidayScope } from '@/types/types'; 

export const APP_TITLE = "Optimizador de Producción";

export enum ActiveView {
  DASHBOARD = 'DASHBOARD',
  DATA_IMPORT = 'DATA_IMPORT',
  DATA_IMPORT_V2 = 'DATA_IMPORT_V2',
  CONSTRAINTS = 'CONSTRAINTS',
  NEEDS_CALCULATION_C2000 = 'NEEDS_CALCULATION_C2000',
  INVENTORY_NEEDS = 'INVENTORY_NEEDS',
  PRODUCTION_CAPACITY = 'PRODUCTION_CAPACITY',
  PRODUCTION_PLAN = 'MEDIUM_TERM_PLAN',
  PERSONNEL = 'PERSONNEL_MANAGEMENT',
  MAINTENANCE = 'MAINTENANCE',
  ABSENTEEISM = 'ABSENTEEISM_MANAGEMENT',
  TACTICAL_SCHEDULING = 'TACTICAL_SCHEDULING',
  TACTICAL_SCHEDULING_2 = 'TACTICAL_SCHEDULING_2',
  TACTICAL_SCHEDULING_MUEBLES = 'TACTICAL_SCHEDULING_MUEBLES',
  WORK_SHIFT_PLANNING = 'WORK_SHIFT_PLANNING',
  DICTIONARY = 'DICTIONARY',
  PARAMETROS = 'PARAMETROS',
  PARAMETROS_TURNOS = 'PARAMETROS_TURNOS',
  PARAMETROS_TIPO_DETALLE = 'PARAMETROS_TIPO_DETALLE',
  PARAMETROS_TIPO_AUSENTISMO = 'PARAMETROS_TIPO_AUSENTISMO',
  PARAMETROS_GRUPO = 'PARAMETROS_GRUPO',
  PARAMETROS_CONEXIONES = 'PARAMETROS_CONEXIONES',
  CONFIGURACIONES_CALENDARIO_AREA = 'CONFIGURACIONES_CALENDARIO_AREA',
  CONFIGURACIONES_GRUPO_OPERADORES = 'CONFIGURACIONES_GRUPO_OPERADORES',
}

// SVG Icons are now imported from lucide-react for consistency
export const DashboardIcon = () => <LayoutDashboard className="w-5 h-5" />;
export const DataImportIcon = () => <Upload className="w-5 h-5" />;
export const ConstraintsIcon = () => <SlidersHorizontal className="w-5 h-5" />;
export const NeedsCalculationIcon = () => <Truck className="w-5 h-5" />;
export const MaintenanceIcon = () => <Wrench className="w-5 h-5" />;
export const PersonnelIcon = () => <Users className="w-5 h-5" />;
export const AbsenteeismIcon = () => <CalendarX2 className="w-5 h-5" />;
export const PlanIcon = () => <ListChecks className="w-5 h-5" />;
export const TacticalSchedulingIcon = () => <CalendarClock className="w-5 h-5" />;
export const WorkShiftIcon = () => <CalendarCheck className="w-5 h-5" />;
export const RealDataIcon = () => <DatabaseZap className="w-5 h-5" />;
export const InventoryNeedsIcon = () => <Sheet className="w-5 h-5" />;
export const CapacityIcon = () => <Activity className="w-5 h-5" />;
export const ConnectionsIcon = () => <Link2 className="w-5 h-5" />;
export const CalendarIcon = () => <CalendarClock className="w-5 h-5" />;

export const PlusIcon = () => <Plus className="w-4 h-4 mr-1" />;
export const EditIcon = () => <Pencil className="w-4 h-4" />;
export const DeleteIcon = () => <Trash2 className="w-4 h-4" />;


export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

export const PROCESS_TYPE_OPTIONS: Array<{ value: ProcessType, label: string }> = [
    { value: 'Colchones', label: 'Colchones' },
    { value: 'Forros', label: 'Forros' },
    { value: 'Bases', label: 'Bases' },
    { value: 'Paneles', label: 'Paneles' },
    { value: 'Espuma', label: 'Espuma' },
    { value: 'Muebles', label: 'Muebles' },
];

export const HOLIDAY_APPLIES_TO_OPTIONS: Array<{ value: HolidayScope, label: string }> = [
    { value: 'Distribucion', label: 'Ventas / Distribución' },
    { value: 'Toda la Planta', label: 'Producción (Toda la Planta)' },
    ...PROCESS_TYPE_OPTIONS.map(p => ({ value: p.value, label: `Producción (${p.label})`})),
];

export const HOLIDAY_DAY_TYPE_OPTIONS: Array<{ value: Holiday['dayType'], label: string }> = [
    { value: 'asueto', label: 'Asueto (No se trabaja)' },
    { value: 'half', label: 'Media Jornada (5 horas)' },
    { value: 'full', label: 'Jornada Completa (Horas de L-V)' },
];


export const MAX_FILE_SIZE_MB = 10;
export const APP_VERSION = '1.0.0-next';

const NAVIGATION_ITEMS = [
  { id: ActiveView.DASHBOARD, label: 'Dashboard', icon: <DashboardIcon />, href: '/dashboard' },
  { id: ActiveView.DATA_IMPORT, label: 'Importar Ventas', icon: <DataImportIcon />, href: '/dashboard/opciones/importar-ventas' },
  { id: ActiveView.DATA_IMPORT_V2, label: 'Importar Ventas 2', icon: <DataImportIcon />, href: '/dashboard/opciones/importar-ventasV2' },
  { id: ActiveView.CONSTRAINTS, label: 'Definir Restricciones', icon: <ConstraintsIcon />, href: '/dashboard/opciones/definir-restricciones' },
  { id: ActiveView.NEEDS_CALCULATION_C2000, label: 'Cálculo Necesidades C2000', icon: <NeedsCalculationIcon />, href: '/dashboard/opciones/calculo-necesidades-c2000' },
  { id: ActiveView.INVENTORY_NEEDS, label: 'Necesidades de Inventario', icon: <InventoryNeedsIcon />, href: '/dashboard/opciones/necesidades-inventario' },
  { id: ActiveView.PRODUCTION_CAPACITY, label: 'Capacidad de Producción', icon: <CapacityIcon />, href: '/dashboard/opciones/capacidad-produccion' },
  { id: ActiveView.PERSONNEL, label: 'Calificación Técnica', icon: <PersonnelIcon />, href: '/dashboard/opciones/calificacion-tecnica' },
  { id: ActiveView.MAINTENANCE, label: 'Mantenimiento', icon: <MaintenanceIcon />, href: '/dashboard/opciones/mantenimiento' },
  { id: ActiveView.ABSENTEEISM, label: 'Gestión Ausentismos', icon: <AbsenteeismIcon />, href: '/dashboard/opciones/gestion-ausentismos' },
  { id: ActiveView.PRODUCTION_PLAN, label: 'Plan de Producción', icon: <PlanIcon />, href: '/dashboard/opciones/plan-produccion' },
  { id: ActiveView.TACTICAL_SCHEDULING, label: 'Programación Táctica', icon: <TacticalSchedulingIcon />, href: '/dashboard/opciones/programacion-tactica' },
  { id: ActiveView.TACTICAL_SCHEDULING_2, label: 'Programación Táctica 2', icon: <CalendarClock className="w-5 h-5" />, href: '/dashboard/opciones/programacion-tactica-2' },
  { id: ActiveView.TACTICAL_SCHEDULING_MUEBLES, label: 'Programación Táctica Muebles', icon: <TacticalSchedulingIcon />, href: '/dashboard/opciones/programacion-tactica-muebles' },
  { id: ActiveView.WORK_SHIFT_PLANNING, label: 'Planificación de Turnos', icon: <WorkShiftIcon />, href: '/dashboard/opciones/planificacion-turnos' },
  { id: ActiveView.DICTIONARY, label: 'Diccionario de Datos', icon: <RealDataIcon />, href: '/dashboard/opciones/diccionario-datos' },
  { id: ActiveView.PARAMETROS, label: 'Parámetros', icon: <ClipboardList />, href: '/dashboard/parametros' },
  { id: ActiveView.PARAMETROS_TURNOS, label: 'Turnos', icon: <WorkShiftIcon />, href: '/dashboard/parametros/turnos' },
  { id: ActiveView.PARAMETROS_TIPO_DETALLE, label: 'Tipos de Detalle', icon: <PlanIcon />, href: '/dashboard/parametros/tipo-detalle' },
  { id: ActiveView.PARAMETROS_TIPO_AUSENTISMO, label: 'Tipos de Ausentismo', icon: <AbsenteeismIcon />, href: '/dashboard/parametros/tipo-ausentismo' },
  { id: ActiveView.PARAMETROS_GRUPO, label: 'Grupos', icon: <PersonnelIcon />, href: '/dashboard/parametros/grupos' },
  { id: ActiveView.PARAMETROS_CONEXIONES, label: 'Conexiones', icon: <ConnectionsIcon />, href: '/dashboard/parametros/conexiones' },
  { id: ActiveView.CONFIGURACIONES_CALENDARIO_AREA, label: 'Calendario - Área', icon: <CalendarIcon />, href: '/dashboard/configuraciones/calendario-area' },
  { id: ActiveView.CONFIGURACIONES_GRUPO_OPERADORES, label: 'Grupo - Operadores', icon: <PersonnelIcon />, href: '/dashboard/configuraciones/grupo-operadores' },
];

// Items que van dentro de la sección "Opciones" (contraíble)
export const OPCIONES_ITEMS: ActiveView[] = [
  ActiveView.DATA_IMPORT,
  ActiveView.CONSTRAINTS,
  ActiveView.NEEDS_CALCULATION_C2000,
  ActiveView.INVENTORY_NEEDS,
  ActiveView.PRODUCTION_CAPACITY,
  ActiveView.PERSONNEL,
  ActiveView.MAINTENANCE,
  ActiveView.ABSENTEEISM,
  ActiveView.PRODUCTION_PLAN,
  ActiveView.DATA_IMPORT_V2,
  ActiveView.TACTICAL_SCHEDULING,
  ActiveView.TACTICAL_SCHEDULING_2,
  ActiveView.TACTICAL_SCHEDULING_MUEBLES,
  ActiveView.WORK_SHIFT_PLANNING,
  ActiveView.DICTIONARY,
];

// Items que van dentro de la sección "Parámetros" (contraíble)
export const PARAMETROS_ITEMS: ActiveView[] = [
  ActiveView.PARAMETROS,
  ActiveView.PARAMETROS_TURNOS,
  ActiveView.PARAMETROS_TIPO_DETALLE,
  ActiveView.PARAMETROS_TIPO_AUSENTISMO,
  ActiveView.PARAMETROS_GRUPO,
  ActiveView.PARAMETROS_CONEXIONES,
];

// Items que van dentro de la sección "Configuraciones" (contraíble)
export const CONFIGURACIONES_ITEMS: ActiveView[] = [
  ActiveView.CONFIGURACIONES_CALENDARIO_AREA,
  ActiveView.CONFIGURACIONES_GRUPO_OPERADORES,
];

export const viewConfig: Record<ActiveView, { title: string; icon: JSX.Element; href: string }> = 
  Object.fromEntries(NAVIGATION_ITEMS.map(item => [item.id, { title: item.label, icon: item.icon, href: item.href }])) as Record<ActiveView, { title: string; icon: JSX.Element; href: string }>;
