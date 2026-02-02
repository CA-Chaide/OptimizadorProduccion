

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
    Package,
    Sheet,
    Activity,
    ClipboardList,
} from 'lucide-react';
import { ProcessType, Holiday, HolidayScope } from '@/types/types'; 

export const APP_TITLE = "Optimizador de Producción";

export enum ActiveView {
  DASHBOARD = 'DASHBOARD',
  DATA_IMPORT = 'DATA_IMPORT',
  CONSTRAINTS = 'CONSTRAINTS',
  NEEDS_CALCULATION_C2000 = 'NEEDS_CALCULATION_C2000',
  INVENTORY_NEEDS = 'INVENTORY_NEEDS',
  PRODUCTION_CAPACITY = 'PRODUCTION_CAPACITY',
  PRODUCTION_PLAN = 'MEDIUM_TERM_PLAN',
  PERSONNEL = 'PERSONNEL_MANAGEMENT',
  MAINTENANCE = 'MAINTENANCE',
  ABSENTEEISM = 'ABSENTEEISM_MANAGEMENT',
  TACTICAL_SCHEDULING = 'TACTICAL_SCHEDULING',
  TACTICAL_SCHEDULING_MUEBLES = 'TACTICAL_SCHEDULING_MUEBLES',
  WORK_SHIFT_PLANNING = 'WORK_SHIFT_PLANNING',
  DICTIONARY = 'DICTIONARY',
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
export const MaestroMaterialesIcon = () => <ClipboardList className="w-5 h-5" />;


// Common action icons
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
  { id: ActiveView.DASHBOARD, label: 'Dashboard', icon: <DashboardIcon /> },
  { id: ActiveView.DATA_IMPORT, label: 'Importar Ventas', icon: <DataImportIcon /> },
  { id: ActiveView.CONSTRAINTS, label: 'Definir Restricciones', icon: <ConstraintsIcon /> },
  { id: ActiveView.NEEDS_CALCULATION_C2000, label: 'Cálculo Necesidades C2000', icon: <NeedsCalculationIcon /> },
  { id: ActiveView.INVENTORY_NEEDS, label: 'Necesidades de Inventario', icon: <InventoryNeedsIcon /> },
  { id: ActiveView.PRODUCTION_CAPACITY, label: 'Capacidad de Producción', icon: <CapacityIcon /> },
  { id: ActiveView.PERSONNEL, label: 'Calificación Técnica', icon: <PersonnelIcon /> },
  { id: ActiveView.MAINTENANCE, label: 'Mantenimiento', icon: <MaintenanceIcon /> },
  { id: ActiveView.ABSENTEEISM, label: 'Gestión Ausentismos', icon: <AbsenteeismIcon /> },
  { id: ActiveView.PRODUCTION_PLAN, label: 'Plan de Producción', icon: <PlanIcon /> },
  { id: ActiveView.TACTICAL_SCHEDULING, label: 'Programación Táctica', icon: <TacticalSchedulingIcon /> },
  { id: ActiveView.TACTICAL_SCHEDULING_MUEBLES, label: 'Programación Táctica Muebles', icon: <TacticalSchedulingIcon /> },
  { id: ActiveView.WORK_SHIFT_PLANNING, label: 'Planificación de Turnos', icon: <WorkShiftIcon /> },
  { id: ActiveView.DICTIONARY, label: 'Diccionario de Datos', icon: <RealDataIcon /> },
];


export const viewConfig: Record<ActiveView, { title: string; icon: JSX.Element }> = 
  Object.fromEntries(NAVIGATION_ITEMS.map(item => [item.id, { title: item.label, icon: item.icon }])) as Record<ActiveView, { title: string; icon: JSX.Element }>;
