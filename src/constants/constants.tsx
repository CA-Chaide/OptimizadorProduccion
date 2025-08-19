/**
 * @file Almacena valores constantes, enumeraciones y componentes de iconos SVG.
 * Su propósito no cambia en la migración a Next.js.
 */

import React from 'react';
import { Upload, Settings2, Users, CalendarDays, ClipboardList, LayoutDashboard } from 'lucide-react';

// 1. Enumeración para las vistas activas de la aplicación.
export enum ActiveView {
  DASHBOARD = 'Dashboard',
  DATA_IMPORT = 'DataImport',
  CONSTRAINTS = 'Constraints',
  PERSONNEL = 'Personnel',
  ABSENTEEISM = 'Absenteeism',
  PRODUCTION_PLAN = 'ProductionPlan',
  MAINTENANCE = 'Maintenance',
  TACTICAL_SCHEDULING = 'TacticalScheduling',
}

// 2. Configuración para la navegación, asociando vistas con títulos e iconos.
export const viewConfig: Record<ActiveView, { title: string; icon: React.ReactNode }> = {
  [ActiveView.DASHBOARD]: { title: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" /> },
  [ActiveView.DATA_IMPORT]: { title: 'Importar Datos', icon: <Upload className="h-5 w-5" /> },
  [ActiveView.CONSTRAINTS]: { title: 'Restricciones', icon: <Settings2 className="h-5 w-5" /> },
  [ActiveView.PERSONNEL]: { title: 'Personal', icon: <Users className="h-5 w-5" /> },
  [ActiveView.ABSENTEEISM]: { title: 'Ausentismo', icon: <CalendarDays className="h-5 w-5" /> },
  [ActiveView.PRODUCTION_PLAN]: { title: 'Plan de Producción', icon: <ClipboardList className="h-5 w-5" /> },
  [ActiveView.MAINTENANCE]: { title: 'Mantenimiento', icon: <LayoutDashboard className="h-5 w-5" /> },
  [ActiveView.TACTICAL_SCHEDULING]: { title: 'Programación Táctica', icon: <LayoutDashboard className="h-5 w-5" /> },
};


// 4. Otras constantes que la aplicación pueda necesitar.
export const MAX_FILE_SIZE_MB = 10;
export const APP_VERSION = '1.0.0-next';
