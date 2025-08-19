/**
 * @file Almacena valores constantes, enumeraciones y componentes de iconos SVG.
 * Su propósito no cambia en la migración a Next.js.
 */

import React from 'react';

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

// 2. Componentes de Iconos SVG (ejemplos).
// Se pueden reemplazar con una librería como lucide-react.
const IconDashboard = () => <svg>...</svg>; // Placeholder
const IconImport = () => <svg>...</svg>; // Placeholder
const IconConstraints = () => <svg>...</svg>; // Placeholder
const IconPersonnel = () => <svg>...</svg>; // Placeholder

// 3. Configuración para la navegación, asociando vistas con títulos e iconos.
export const viewConfig = {
  [ActiveView.DASHBOARD]: { title: 'Dashboard', icon: <IconDashboard /> },
  [ActiveView.DATA_IMPORT]: { title: 'Importar Datos', icon: <IconImport /> },
  [ActiveView.CONSTRAINTS]: { title: 'Restricciones', icon: <IconConstraints /> },
  [ActiveView.PERSONNEL]: { title: 'Personal', icon: <IconPersonnel /> },
  [ActiveView.ABSENTEEISM]: { title: 'Ausentismo', icon: <IconDashboard /> },
  [ActiveView.PRODUCTION_PLAN]: { title: 'Plan de Producción', icon: <IconDashboard /> },
  [ActiveView.MAINTENANCE]: { title: 'Mantenimiento', icon: <IconDashboard /> },
  [ActiveView.TACTICAL_SCHEDULING]: { title: 'Programación Táctica', icon: <IconDashboard /> },
};

// 4. Otras constantes que la aplicación pueda necesitar.
export const MAX_FILE_SIZE_MB = 10;
export const APP_VERSION = '1.0.0-next';
