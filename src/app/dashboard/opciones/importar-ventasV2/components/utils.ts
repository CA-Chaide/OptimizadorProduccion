// Funciones utilitarias para los componentes de importar-ventasV2

import { ecuadorHolidaysService } from '@/services/ecuador-holidays.service';
import { MONTH_NUMBERS, MONTH_NAMES } from './constants';
import type { WorkDaysCalculation, TiempoCanonResult } from './types';
import * as XLSX from 'xlsx';

// Función para exportar datos a XLSX
export function exportToXLSX(data: any[], filename: string, columns?: { key: string; header: string }[]) {
  if (!data || data.length === 0) {
    alert('No hay datos para exportar');
    return;
  }

  // Preparar datos para el Excel
  let exportData: any[] = [];
  
  if (columns && columns.length > 0) {
    // Usar columnas específicas
    exportData = data.map(row => {
      const newRow: any = {};
      columns.forEach(col => {
        newRow[col.header] = row[col.key] ?? '';
      });
      return newRow;
    });
  } else {
    // Usar todas las columnas
    exportData = data;
  }

  // Crear workbook y worksheet
  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Datos');

  // Aplicar estilos y ajustes de columnas
  const columnWidths = Object.keys(exportData[0] || {}).map(col => ({
    wch: Math.min(col.length + 5, 30)
  }));
  worksheet['!cols'] = columnWidths;

  // Descargar el archivo
  const dateStr = new Date().toISOString().split('T')[0];
  XLSX.writeFile(workbook, `${filename}_${dateStr}.xlsx`);
}

// Función para convertir mes a número (acepta nombre o número)
export function getMesNumero(mesInput: string): number | null {
  const asNumber = parseInt(mesInput);
  if (!isNaN(asNumber) && asNumber >= 1 && asNumber <= 12) {
    return asNumber;
  }
  return MONTH_NUMBERS[mesInput as keyof typeof MONTH_NUMBERS] || null;
}

// Función para convertir mes número a nombre
export function getMesNombre(mesNum: number): string {
  return MONTH_NAMES[mesNum] || `Mes ${mesNum}`;
}

// Función segura para convertir a número
export const safeNumber = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Voto mayoría: selecciona el puesto de trabajo con MAYOR CONSUMO (tiempo * necesidad)
export function seleccionarPuestoConMayorConsumo(
  registrosLinea: any[],
  consumoPorEstacion: { [nombreEstacion: string]: number } = {}
): any | null {
  if (!registrosLinea || registrosLinea.length === 0) return null;
  if (registrosLinea.length === 1) return registrosLinea[0];

  // Calcular consumo total para cada puesto
  let puestoConMayorConsumo = registrosLinea[0];
  let mayorConsumo = safeNumber(consumoPorEstacion[String(puestoConMayorConsumo?.nombre_estacion ?? '')]);

  registrosLinea.forEach((registro: any) => {
    const nombreEstacion = String(registro?.nombre_estacion ?? '');
    const consumo = safeNumber(consumoPorEstacion[nombreEstacion]);
    
    if (consumo > mayorConsumo) {
      mayorConsumo = consumo;
      puestoConMayorConsumo = registro;
    }
  });

  return puestoConMayorConsumo;
}

// Calcular necesidades
export function computeNecesidades(row: any): number {
  const unidadesProy = safeNumber(row.UnidadesProyectado ?? 0);
  const stockSeg = safeNumber(row.StockSeguridad ?? 0);
  const stockAct = safeNumber(row.StockActual ?? 0);
  return Math.max(0, unidadesProy - stockAct + stockSeg);
}

// Calcular días laborables
export async function calculateWorkDays(year: number, month: number): Promise<WorkDaysCalculation> {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0);
  
  let holidays: Array<{ date: string; name: string }> = [];
  try {
    holidays = await ecuadorHolidaysService.getHolidaysForRange(startDate, endDate);
  } catch (error) {
    console.error('Error al obtener feriados:', error);
  }

  const holidayDates = new Set(holidays.map(h => h.date));
  
  let diasLaborables = 0;
  let diasSabados = 0;

  for (let day = 1; day <= endDate.getDate(); day++) {
    const date = new Date(year, month - 1, day);
    const dayOfWeek = date.getDay();
    const dateString = date.toISOString().split('T')[0];

    if (holidayDates.has(dateString)) {
      continue;
    }

    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      diasLaborables++;
    } else if (dayOfWeek === 6) {
      diasSabados++;
    }
  }

  return {
    diasLaborables,
    diasSabados,
    diasFeriados: holidays.map(h => h.date)
  };
}

// Función compartida: enriquecer datos de una clase con participación, necesidad máxima, etc.
export function enriquecerDatosClase(
  datos: any[],
  tiemposCanon: TiempoCanonResult[],
  tiempoConsumidoAnterior: { [mesLinea: string]: number } = {}
) {
  const computeNec = (row: any) => {
    const up = safeNumber(row.UnidadesProyectado ?? 0);
    const ss = safeNumber(row.StockSeguridad ?? 0);
    const sa = safeNumber(row.StockActual ?? 0);
    return Math.max(0, up - sa + ss);
  };

  const buscarTiempoCanon = (mesRaw: string) => {
    let found = tiemposCanon.find((t: any) => t.mes === mesRaw);
    if (found) return found;
    const mesNum = parseInt(mesRaw);
    if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
      const mesNombre = MONTH_NAMES[mesNum];
      found = tiemposCanon.find((t: any) => t.mes === mesNombre);
      if (found) return found;
      found = tiemposCanon.find((t: any) => t.mesNumero === mesNum);
      if (found) return found;
    }
    return null;
  };

  // Función para normalizar nombres de líneas para comparación
  const normalizarLinea = (linea: string): string => {
    return String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
  };

  const obtenerTiempoDisp = (mes: string, linea: string, puesto: string | null) => {
    const tc = buscarTiempoCanon(mes);
    if (!tc || !tc.data || !Array.isArray(tc.data)) return null;

    const lineaNorm = normalizarLinea(linea);
    
    // Primero filtrar por línea
    const registrosLinea = tc.data.filter((item: any) => {
      const nombreLinea = normalizarLinea(item?.nombre_linea ?? '');
      return nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
    });

    // Si no encontramos registros de la línea, intentar buscar por puesto en todos los datos
    if (registrosLinea.length === 0) {
      if (puesto && puesto !== '-' && puesto !== '') {
        const pn = String(puesto).toLowerCase().trim();
        const dp = tc.data.find((item: any) => {
          const nombreEstacion = String(item?.nombre_estacion ?? '').toLowerCase().trim();
          return nombreEstacion.includes(pn) || pn.includes(nombreEstacion);
        });
        if (dp) {
          return {
            minutos_horario_normal: safeNumber(dp?.minutos_horario_normal_CON_PUESTOS ?? dp?.minutos_horario_normal_TOTAL ?? 0),
            minutos_con_extras: safeNumber(dp?.minutos_extras_CON_PUESTOS ?? dp?.minutos_extras_TOTAL ?? 0),
            minutos_fin_semana: safeNumber(dp?.minutos_sabado_CON_PUESTOS ?? dp?.minutos_sabado_TOTAL ?? 0),
            diasLaborables: tc.diasLaborables,
            diasSabados: tc.diasSabados
          };
        }
      }
      return null;
    }

    // Sumar todos los tiempos de las estaciones de esa línea
    let minutos_horario_normal = 0;
    let minutos_con_extras = 0;
    let minutos_fin_semana = 0;
    
    registrosLinea.forEach((dato: any) => {
      minutos_horario_normal += safeNumber(dato?.minutos_horario_normal_CON_PUESTOS ?? dato?.minutos_horario_normal_TOTAL ?? 0);
      minutos_con_extras += safeNumber(dato?.minutos_extras_CON_PUESTOS ?? dato?.minutos_extras_TOTAL ?? 0);
      minutos_fin_semana += safeNumber(dato?.minutos_sabado_CON_PUESTOS ?? dato?.minutos_sabado_TOTAL ?? 0);
    });

    return {
      minutos_horario_normal,
      minutos_con_extras,
      minutos_fin_semana,
      diasLaborables: tc.diasLaborables,
      diasSabados: tc.diasSabados
    };
  };

  // Mapa de necesidades por línea para participación
  const mapa: { [k: string]: number } = {};
  datos.forEach(row => {
    const k = `${String(row.Mes ?? 'Sin mes')}|${String(row.LineaFabricacion ?? 'Sin línea')}`;
    mapa[k] = (mapa[k] || 0) + computeNec(row);
  });

  return datos.map(row => {
    const mes = String(row.Mes ?? 'Sin mes');
    const linea = String(row.LineaFabricacion ?? 'Sin línea');
    const key = `${mes}|${linea}`;
    const necesidad = computeNec(row);
    const sumaNecLinea = mapa[key] ?? necesidad;
    const participacionIndividual = sumaNecLinea > 0 ? (necesidad / sumaNecLinea) * 100 : 0;
    const tiempoPorUnidad = safeNumber(row.TiempoPorUnidad ?? 0);
    const numeroPuestos = safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
    const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
    // T. Total necesidad inicial = (Tiempo Unitarío / Puestos) * Necesidades
    const tiempoTotalNecesidad = tiempoUnitarioPorPuesto * necesidad;
    const tiempoDisp = obtenerTiempoDisp(mes, linea, row.PuestoCuellodeBottella);

    let necesidadMaximaAFabricar = 0;
    let horasExtrasUsadas = 0;
    let tiempoParaMaterial = 0;

    if (tiempoDisp && tiempoPorUnidad > 0) {
      const techoAbsoluto = tiempoDisp.minutos_con_extras + tiempoDisp.minutos_fin_semana;
      const consumidoPrev = tiempoConsumidoAnterior?.[key] ?? 0;
      const tiempoMaxDisp = Math.max(0, techoAbsoluto - consumidoPrev);
      
      // Calcular tiempo disponible para este material según su participación
      tiempoParaMaterial = (participacionIndividual / 100) * tiempoMaxDisp;
      
      // Nueva lógica: si tiempoRequerido <= tiempoDisponible => Producir todo
      const tiempoRequerido = necesidad * tiempoPorUnidad;
      
      if (tiempoRequerido <= tiempoMaxDisp) {
        // Producir todo lo que se necesita
        necesidadMaximaAFabricar = necesidad;
      } else {
        // Aplicar prorrateo: utilizar el tiempo disponible prorratreado
        const tiempoUnitario = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
        const tiempoParaMaterialEnUnidades = tiempoUnitario > 0 ? tiempoParaMaterial / tiempoUnitario : 0;
        necesidadMaximaAFabricar = Math.floor(tiempoParaMaterialEnUnidades);
      }

      const tiempoNormalRest = Math.max(0, tiempoDisp.minutos_horario_normal - consumidoPrev);
      const tiempoNormalParaMaterial = (participacionIndividual / 100) * tiempoNormalRest;
      const tiempoRealUsado = Math.min(necesidad, necesidadMaximaAFabricar) * tiempoPorUnidad;
      if (tiempoRealUsado > tiempoNormalParaMaterial) {
        horasExtrasUsadas = (tiempoRealUsado - tiempoNormalParaMaterial) / 60;
      }
    }

    return {
      ...row,
      participacionIndividual: participacionIndividual.toFixed(2),
      tiempoTotalNecesidad,
      tiempoParaMaterial,
      necesidadMaximaAFabricar,
      horasExtrasUsadas: horasExtrasUsadas.toFixed(2),
      mesRef: mes,
      lineaRef: linea
    };
  });
}
// Interfaz para el resultado del análisis de bottleneck por material
export interface BottleneckMaterialAnalysis {
  Centro: string;
  LineaFabricacion: string;
  NombreLinea: string;
  CodMaterial: string;
  NombreMaterial: string;
  Necesidad: number;
  PuestoDeTrabajo: string | null;
  NumeroPuestos: number | null;
  TiempoCanonicoMinutos: number | null;
  TiempoCanonicoHoras: number | null;
  Metodologia: string; // "Mayor necesidad" o "Voto mayoría"
}

// Función de voto a mayoría: Retorna el item más frecuente en una lista
export function votarPorMayoria<T>(items: T[], selector: (item: T) => any): T | null {
  if (items.length === 0) return null;
  
  const frecuencia: { [key: string]: { count: number; item: T } } = {};
  
  items.forEach(item => {
    const key = String(selector(item));
    if (!frecuencia[key]) {
      frecuencia[key] = { count: 0, item };
    }
    frecuencia[key].count++;
  });
  
  let ganador = items[0];
  let maxVotos = 0;
  
  Object.values(frecuencia).forEach(({ count, item }) => {
    if (count > maxVotos) {
      maxVotos = count;
      ganador = item;
    }
  });
  
  return ganador;
}

// Función para extraer el material con mayor necesidad por Centro+Línea
// Si hay empate, usa voto a mayoría
export function getMaterialesCuelloBotellaPorLinea(
  datos: any[]
): BottleneckMaterialAnalysis[] {
  const gruposPorLinea: { [key: string]: any[] } = {};
  
  // Agrupar por Centro + LineaFabricacion
  datos.forEach(row => {
    const centro = String(row.CentroFabricacion ?? row.Centro ?? '');
    const linea = String(row.LineaFabricacion ?? '');
    const key = `${centro}|${linea}`;
    
    if (!gruposPorLinea[key]) {
      gruposPorLinea[key] = [];
    }
    gruposPorLinea[key].push(row);
  });
  
  const resultados: BottleneckMaterialAnalysis[] = [];
  
  Object.entries(gruposPorLinea).forEach(([key, grupo]) => {
    const [centro, linea] = key.split('|');
    
    // Calcular necesidad de cada material
    const necesidadesPorMaterial: { [codMaterial: string]: number } = {};
    
    grupo.forEach(row => {
      const codMat = String(row.CodMaterial ?? '');
      const nec = computeNecesidades(row);
      necesidadesPorMaterial[codMat] = (necesidadesPorMaterial[codMat] || 0) + nec;
    });
    
    // Encontrar la necesidad máxima
    const maxNecesidad = Math.max(...Object.values(necesidadesPorMaterial));
    
    // Materiales con mayor necesidad
    const materialesConMaxNecesidad = grupo.filter(row => {
      const codMat = String(row.CodMaterial ?? '');
      return necesidadesPorMaterial[codMat] === maxNecesidad;
    });
    
    // Si hay empate, usar voto a mayoría por puesto de trabajo
    let materialSeleccionado: any | null = null;
    let metodologia = 'Mayor necesidad';
    
    if (materialesConMaxNecesidad.length > 1) {
      materialSeleccionado = votarPorMayoria(materialesConMaxNecesidad, (item) => 
        item.PuestoCuellodeBottella || item.LineaFabricacion || '-'
      );
      metodologia = 'Voto mayoría';
    } else {
      materialSeleccionado = materialesConMaxNecesidad[0];
    }
    
    if (materialSeleccionado) {
      const necesidad = computeNecesidades(materialSeleccionado);
      
      resultados.push({
        Centro: centro,
        LineaFabricacion: linea,
        NombreLinea: String(materialSeleccionado.NombreLinea ?? materialSeleccionado.LineaFabricacion ?? linea),
        CodMaterial: String(materialSeleccionado.CodMaterial ?? ''),
        NombreMaterial: String(materialSeleccionado.NombreMaterial ?? materialSeleccionado.CodMaterial ?? ''),
        Necesidad: necesidad,
        PuestoDeTrabajo: materialSeleccionado.PuestoCuellodeBottella ?? null,
        NumeroPuestos: materialSeleccionado.NumeroPuestos ?? null,
        TiempoCanonicoMinutos: materialSeleccionado.TiempoFabricacionNecesidad ?? null,
        TiempoCanonicoHoras: materialSeleccionado.TiempoFabricacionNecesidadHoras ?? null,
        Metodologia: metodologia
      });
    }
  });
  
  return resultados;
}