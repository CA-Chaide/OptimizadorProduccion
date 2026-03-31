/**
 * BottleneckAnalysisService
 * 
 * Servicio centralizado que encapsula toda la lógica de análisis de cuellos de botella
 * para centros 2000 y 1000. Proporciona:
 * - Cálculos centralizados y reutilizables
 * - Caching de resultados
 * - Integración con DataStore
 * - Acceso desde cualquier página del proyecto
 */

import { DataSnapshot, dataStore } from './DataStore';
import { MONTH_NAMES } from '@/app/dashboard/opciones/importar-ventasV2/components/constants';
import type { TiempoCanonResult, TransferNeed } from '@/app/dashboard/opciones/importar-ventasV2/components/types';

// ============================================================
// TIPOS E INTERFACES
// ============================================================

export interface Center2000Analysis {
  filteredData: any[];
  dataEX: any[];
  dataF: any[];
  transferNeedsEX: TransferNeed[];
  transferNeedsF: TransferNeed[];
  transferNeedsConsolidated: TransferNeed[];
  computedDataEX: any[];
}

export interface Center1000Analysis {
  filteredData: any[];
  datosEnriquecidos: any[];
  transferNeeds: TransferNeed[];
  computedData: any[];
  exportSheet: any[];
}

export interface AnalysisCache {
  center2000: Center2000Analysis | null;
  center1000: Center1000Analysis | null;
  lastDataSignature: string;
}

// ============================================================
// SERVICIO PRINCIPAL
// ============================================================

class BottleneckAnalysisService {
  private static instance: BottleneckAnalysisService;
  private cache: AnalysisCache = {
    center2000: null,
    center1000: null,
    lastDataSignature: ''
  };
  private listeners: Array<(key: string) => void> = [];

  private constructor() {}

  public static getInstance(): BottleneckAnalysisService {
    if (!BottleneckAnalysisService.instance) {
      BottleneckAnalysisService.instance = new BottleneckAnalysisService();
    }
    return BottleneckAnalysisService.instance;
  }

  /**
   * Suscribirse a cambios en el análisis
   */
  public subscribe(listener: (key: string) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  /**
   * Notificar cambios a los listeners
   */
  private notifyListeners(key: string): void {
    this.listeners.forEach(listener => listener(key));
  }

  /**
   * Generar firma de datos para validar cambios
   */
  private generateDataSignature(data: any[]): string {
    return `${data.length}_${data[0]?.CodMaterial || 'empty'}`;
  }

  /**
   * Validar si el cache sigue siendo válido
   */
  private isCacheValid(data: any[]): boolean {
    const signature = this.generateDataSignature(data);
    return this.cache.lastDataSignature === signature;
  }

  /**
   * Normalizar clase de aprovisionamiento
   */
  private normalizarClase(valor: any): string {
    return String(valor || '').trim().toUpperCase();
  }

  /**
   * Conversión segura a número
   */
  private safeNumber(v: any): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Calcular necesidad de un material (UnidadesProyectado - StockActual + StockSeguridad)
   */
  private computeNecesidad(row: any): number {
    // Priorizar el campo pre-calculado del tab Datos Backend si existe
    if (row._Necesidades !== undefined && row._Necesidades !== null) {
      return this.safeNumber(row._Necesidades);
    }
    const up = this.safeNumber(row.UnidadesProyectado ?? 0);
    const ss = this.safeNumber(row.StockSeguridad ?? 0);
    const sa = this.safeNumber(row.StockActual ?? 0);
    return Math.max(0, up - sa + ss);
  }

  /**
   * Buscar tiempos canónicos por mes
   */
  private buscarTiempoCanon(tiemposCanon: TiempoCanonResult[], mesRaw: string): TiempoCanonResult | null {
    let found = tiemposCanon.find((t: any) => t.mes === mesRaw);
    if (found) return found;
    
    const mesNum = parseInt(mesRaw);
    if (!isNaN(mesNum) && mesNum >= 1 && mesNum <= 12) {
      const mesNombre = MONTH_NAMES[mesNum];
      found = tiemposCanon.find((t: any) => t.mes === mesNombre);
      if (found) return found;
      found = tiemposCanon.find((t: any) => t.mesNumero === mesNum);
    }
    
    return found || null;
  }

  /**
   * Normalizar nombre de línea para comparación
   */
  private normalizarLinea(linea: string): string {
    return String(linea).toLowerCase().replace(/\s+/g, '').replace('linea', '').replace('línea', '');
  }

  /**
   * Obtener tiempo disponible para una línea específica en un mes
   */
  private obtenerTiempoDisp(
    tiemposCanon: TiempoCanonResult[],
    mes: string,
    linea: string,
    puesto: string | null = null,
    centro: string = ''
  ): { minutos_horario_normal: number; minutos_con_extras: number; minutos_fin_semana: number; diasLaborables: number; diasSabados: number } | null {
    const tc = this.buscarTiempoCanon(tiemposCanon, mes);
    if (!tc || !tc.data || !Array.isArray(tc.data)) return null;

    const lineaNorm = this.normalizarLinea(linea);
    const centroCodigo = String(centro).trim();

    let registrosLinea = tc.data.filter((item: any) => {
      const nombreLinea = this.normalizarLinea(item?.nombre_linea ?? '');
      const itemCentro = String(item?.centro ?? item?.Centro ?? '');
      const lineaMatches = nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      const centroMatches = centroCodigo === '' || itemCentro === centroCodigo;
      return lineaMatches && centroMatches;
    });

    if (registrosLinea.length === 0 && centroCodigo !== '') {
      registrosLinea = tc.data.filter((item: any) => {
        const nombreLinea = this.normalizarLinea(item?.nombre_linea ?? '');
        return nombreLinea === lineaNorm || nombreLinea.includes(lineaNorm) || lineaNorm.includes(nombreLinea);
      });
    }

    if (registrosLinea.length === 0) {
      if (puesto && puesto !== '-' && puesto !== '') {
        const pn = String(puesto).toLowerCase().trim();
        const dp = tc.data.find((item: any) => {
          const nombreEstacion = String(item?.nombre_estacion ?? '').toLowerCase().trim();
          return nombreEstacion.includes(pn) || pn.includes(nombreEstacion);
        });
        if (dp) {
          return {
            minutos_horario_normal: this.safeNumber(dp?.minutos_horario_normal_TOTAL ?? 0),
            minutos_con_extras: this.safeNumber(dp?.minutos_extras_TOTAL ?? 0),
            minutos_fin_semana: this.safeNumber(dp?.minutos_sabado_TOTAL ?? 0),
            diasLaborables: tc.diasLaborables,
            diasSabados: tc.diasSabados
          };
        }
      }
      return null;
    }

    let puestoBotellaDato: any = null;
    if (puesto && puesto !== '-' && puesto !== '') {
      const pn = String(puesto).toLowerCase().trim();
      puestoBotellaDato = registrosLinea.find((dato: any) => {
        const nombreEstacion = String(dato?.nombre_estacion ?? '').toLowerCase().trim();
        return nombreEstacion === pn || nombreEstacion.includes(pn) || pn.includes(nombreEstacion);
      }) ?? null;
    }

    if (!puestoBotellaDato) {
      const estacionesMap = new Map<string, any>();
      registrosLinea.forEach((dato: any) => {
        const nombreEstacion = String(dato?.nombre_estacion ?? '-');
        if (!estacionesMap.has(nombreEstacion)) {
          estacionesMap.set(nombreEstacion, { count: 0, dato });
        }
        estacionesMap.get(nombreEstacion)!.count += 1;
      });
      let maxFrequencia = 0;
      estacionesMap.forEach(({ count, dato }) => {
        if (count > maxFrequencia) {
          maxFrequencia = count;
          puestoBotellaDato = dato;
        }
      });
    }

    if (!puestoBotellaDato) return null;

    return {
      minutos_horario_normal: this.safeNumber(puestoBotellaDato?.minutos_horario_normal_TOTAL ?? 0),
      minutos_con_extras: this.safeNumber(puestoBotellaDato?.minutos_extras_TOTAL ?? 0),
      minutos_fin_semana: this.safeNumber(puestoBotellaDato?.minutos_sabado_TOTAL ?? 0),
      diasLaborables: tc.diasLaborables,
      diasSabados: tc.diasSabados
    };
  }

  // ============================================================
  // ANÁLISIS CENTRO 2000
  // ============================================================

  /**
   * Analizar Centro 2000 y calcular necesidades de traslado
   */
  public analyzeCenter2000(
    data: any[],
    tiemposCanon: TiempoCanonResult[]
  ): Center2000Analysis {
    // Validar cache
    if (!this.isCacheValid(data) && this.cache.center2000) {
      this.cache.center2000 = null; // Invalidar cache si datos cambiaron
    }

    if (this.cache.center2000 !== null) {
      return this.cache.center2000;
    }

    // 1. Filtrado por Centro 2000
    const filteredData = data.filter(row => String(row.Centro || '').trim() === '2000');

    // 2. Clasificación EX vs F
    const dataEX: any[] = [];
    const dataF: any[] = [];
    filteredData.forEach(row => {
      const clase = this.normalizarClase(row.ClaseAprovisionam);
      if (clase === 'E' || clase === 'X') {
        dataEX.push(row);
      } else if (clase === 'F') {
        dataF.push(row);
      }
    });

    // 3. Calcular traslados F (incluyendo mes)
    const transferNeedsF: TransferNeed[] = [];
    const mapF = new Map<string, number>();
    dataF.forEach(row => {
      const cod = String(row.CodMaterial ?? '');
      const mes = String(row.Mes ?? '');
      const key = `${cod}|${mes}`;
      const nec = this.computeNecesidad(row);
      mapF.set(key, (mapF.get(key) || 0) + nec);
    });
    mapF.forEach((necesidadTraslado, key) => {
      const [CodMaterial, mes] = key.split('|');
      transferNeedsF.push({ CodMaterial, mes, necesidadTraslado });
    });

    // 4. Consolidación
    const transferNeedsEX: TransferNeed[] = [];
    const transferNeedsConsolidated = [...transferNeedsEX, ...transferNeedsF];

    // 5. Guardar en DataStore
    const result: Center2000Analysis = {
      filteredData,
      dataEX,
      dataF,
      transferNeedsEX,
      transferNeedsF,
      transferNeedsConsolidated,
      computedDataEX: []
    };

    // Cachear resultado
    this.cache.center2000 = result;
    this.cache.lastDataSignature = this.generateDataSignature(data);

    // Persistir en DataStore
    dataStore.setData('center2000Analysis', result, 'BottleneckAnalysisService');

    this.notifyListeners('center2000');

    return result;
  }

  // ============================================================
  // ANÁLISIS CENTRO 1000
  // ============================================================

  /**
   * Analizar Centro 1000 con traslados desde Centro 2000
   */
  public analyzeCenter1000(
    data: any[],
    tiemposCanon: TiempoCanonResult[],
    transfersFromCenter2000: TransferNeed[]
  ): Center1000Analysis {
    // Validar cache
    if (!this.isCacheValid(data) && this.cache.center1000) {
      this.cache.center1000 = null;
    }

    if (this.cache.center1000 !== null) {
      return this.cache.center1000;
    }

    // 1. Filtrar Centro 1000
    const rawRows = data
      .filter(row => {
        const cFab = String(row.CentroFabricacion || '').trim();
        const cDem = String(row.Centro || '').trim();
        return cFab === '1000' || (cFab === '' && cDem === '1000');
      });

    // 2. Agregar por material Y MES para no colapsar meses distintos
    const porMaterialMes = new Map<string, any>();
    rawRows.forEach(row => {
      const cod = String(row.CodMaterial ?? '');
      const mes = String(row.Mes ?? '');
      const cDem = String(row.Centro || '').trim();
      const key = `${cod}|${mes}`; // CLAVE COMPUESTA
      
      if (!porMaterialMes.has(key)) {
        porMaterialMes.set(key, { 
          ...row, 
          UnidadesProyectado: 0, 
          _Necesidades: 0, 
          _necPropia: 0, 
          Centro: '1000',
          _isAggregated: true 
        });
      }
      const agg = porMaterialMes.get(key)!;
      
      if (cDem === '1000') {
        agg.UnidadesProyectado = this.safeNumber(agg.UnidadesProyectado) + this.safeNumber(row.UnidadesProyectado ?? 0);
        const nec = this.computeNecesidad(row);
        agg._Necesidades = this.safeNumber(agg._Necesidades) + nec;
        agg._necPropia = this.safeNumber(agg._necPropia) + nec;
      }
    });
    const filteredData = Array.from(porMaterialMes.values());

    // 3. Mapa de traslados desde Centro 2000 (Incluyendo Mes en la clave)
    const trasladosMap = new Map<string, number>();
    transfersFromCenter2000.forEach(item => {
      const key = `${item.CodMaterial}|${item.mes}`;
      trasladosMap.set(key, (trasladosMap.get(key) || 0) + item.necesidadTraslado);
    });

    // 4. Enriquecer datos
    const mapa: { [k: string]: number } = {};
    filteredData.forEach(row => {
      const mes = String(row.Mes ?? 'Sin mes');
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${mes}|${linea}`;
      const codMaterial = String(row.CodMaterial ?? '');
      const trKey = `${codMaterial}|${mes}`;
      const traslado = trasladosMap.get(trKey) || 0;
      const necPropia = this.safeNumber(row._necPropia ?? row._Necesidades);
      const necesidadTotal = necPropia + traslado;
      mapa[key] = (mapa[key] || 0) + necesidadTotal;
    });

    const sumaTiempoNecPorLinea: { [k: string]: number } = {};
    const tiempoDispGlobalPorLinea: { [k: string]: number } = {};

    filteredData.forEach(row => {
      const mes = String(row.Mes ?? 'Sin mes');
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${mes}|${linea}`;
      const codMaterial = String(row.CodMaterial ?? '');
      const trKey = `${codMaterial}|${mes}`;
      const traslado = trasladosMap.get(trKey) || 0;
      const necPropia = this.safeNumber(row._necPropia ?? row._Necesidades);
      const necesidadTotal = necPropia + traslado;
      const tiempoPorUnidad = this.safeNumber(row.TiempoPorUnidad ?? 0);
      const numeroPuestos = this.safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
      const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
      sumaTiempoNecPorLinea[key] = (sumaTiempoNecPorLinea[key] || 0) + (tiempoUnitarioPorPuesto * necesidadTotal);

      if (tiempoDispGlobalPorLinea[key] === undefined) {
        const tiempoDisp = this.obtenerTiempoDisp(tiemposCanon, mes, linea, row.PuestoCuellodeBottella, row.Centro);
        tiempoDispGlobalPorLinea[key] = tiempoDisp?.minutos_horario_normal ?? 0;
      }
    });

    const datosEnriquecidos = filteredData.map(row => {
      const mes = String(row.Mes ?? 'Sin mes');
      const linea = String(row.LineaFabricacion ?? 'Sin línea');
      const key = `${mes}|${linea}`;
      const codMaterial = String(row.CodMaterial ?? '');
      const trKey = `${codMaterial}|${mes}`;
      const traslado = trasladosMap.get(trKey) || 0;
      const necPropia = this.safeNumber(row._necPropia ?? row._Necesidades);
      const necesidadTotal = necPropia + traslado;
      const sumaNecLinea = mapa[key] ?? necesidadTotal;
      const participacionIndividual = sumaNecLinea > 0 ? (necesidadTotal / sumaNecLinea) * 100 : 0;
      const tiempoPorUnidad = this.safeNumber(row.TiempoPorUnidad ?? 0);
      const numeroPuestos = this.safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1);
      const tiempoUnitarioPorPuesto = numeroPuestos > 0 ? tiempoPorUnidad / numeroPuestos : 0;
      const tiempoDisp = this.obtenerTiempoDisp(tiemposCanon, mes, linea, row.PuestoCuellodeBottella, row.Centro);

      let necesidadMaximaAFabricar = 0;
      let tMaxProm = 0;
      let tiempoParaMaterial = 0;

      if (tiempoDisp && tiempoPorUnidad > 0) {
        const tiempoDisponibleBase = tiempoDisp.minutos_horario_normal;
        tiempoParaMaterial = (participacionIndividual / 100) * tiempoDisponibleBase;

        const sumaTiempoNecLinea = sumaTiempoNecPorLinea[key] || 0;
        const tiempoDispGlobal = tiempoDispGlobalPorLinea[key] || 0;

        if (sumaTiempoNecLinea <= tiempoDispGlobal) {
          necesidadMaximaAFabricar = necesidadTotal;
        } else {
          necesidadMaximaAFabricar = tiempoUnitarioPorPuesto > 0
            ? Math.floor(tiempoParaMaterial / tiempoUnitarioPorPuesto)
            : 0;
        }
        tMaxProm = tiempoUnitarioPorPuesto * necesidadMaximaAFabricar;
      }

      return {
        ...row,
        trasladoDesde2000: traslado,
        necesidadPropia,
        necesidadTotal,
        participacionIndividual,
        tiempoTotalNecesidad: tiempoUnitarioPorPuesto * necesidadTotal,
        tiempoParaMaterial,
        necesidadMaximaAFabricar,
        tMaxProm,
        horasExtrasUsadas: '0.00',
        mesRef: mes,
        lineaRef: linea
      };
    });

    // 5. Generar sheet para exportación
    const exportSheet: any[] = [];
    const grouped: { [k: string]: any[] } = {};
    datosEnriquecidos.forEach((row: any) => {
      const linea = String(row.lineaRef || 'Sin línea');
      if (!grouped[linea]) grouped[linea] = [];
      grouped[linea].push(row);
    });

    Object.keys(grouped)
      .sort()
      .forEach(linea => {
        grouped[linea].forEach((row: any) => {
          const numeroPuestos = Math.max(1, this.safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 1));
          const tupp = this.safeNumber(row.TiempoPorUnidad ?? 0) / numeroPuestos;
          const deficit = Math.max(0, this.safeNumber(row.necesidadTotal ?? 0) - this.safeNumber(row.necesidadMaximaAFabricar ?? 0));
          exportSheet.push({
            'Mes': row.mesRef,
            'CodMaterial': row.CodMaterial ?? '',
            'Descripcion': row.Descripcion || row.NombreMaterial || row.CodMaterial || '',
            'Linea': row.lineaRef || row.LineaFabricacion || '',
            'Puesto': row.PuestoCuellodeBottella || '',
            'N.Puestos': this.safeNumber(row.NumeroPuestos ?? row.numero_puestos ?? 0),
            'Sector': row.Sector || '',
            'Responsable': row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '',
            'T.Unit/Puestos': tupp,
            'Traslado C.2000': this.safeNumber(row.trasladoDesde2000 ?? 0),
            'Nec. Propia': this.safeNumber(row.necesidadPropia ?? 0),
            'Necesidad Total': this.safeNumber(row.necesidadTotal ?? 0),
            'T.Total Nec': this.safeNumber(row.tiempoTotalNecesidad ?? 0),
            'Partic.%': this.safeNumber(row.participacionIndividual ?? 0),
            'T.Disponible': this.safeNumber(row.tiempoParaMaterial ?? 0),
            'Máx.Producir': this.safeNumber(row.necesidadMaximaAFabricar ?? 0),
            'Déficit General': deficit
          });
        });
      });

    const result: Center1000Analysis = {
      filteredData,
      datosEnriquecidos,
      transferNeeds: [],
      computedData: [],
      exportSheet
    };

    // Cachear resultado
    this.cache.center1000 = result;
    this.cache.lastDataSignature = this.generateDataSignature(data);

    // Persistir en DataStore
    dataStore.setData('center1000Analysis', result, 'BottleneckAnalysisService');

    this.notifyListeners('center1000');

    return result;
  }

  /**
   * Obtener análisis cacheado de Centro 2000
   */
  public getCenter2000Analysis(): Center2000Analysis | null {
    return this.cache.center2000;
  }

  /**
   * Obtener análisis cacheado de Centro 1000
   */
  public getCenter1000Analysis(): Center1000Analysis | null {
    return this.cache.center1000;
  }

  /**
   * Limpiar cache (para cuando cambien datos)
   */
  public clearCache(): void {
    this.cache = {
      center2000: null,
      center1000: null,
      lastDataSignature: ''
    };
    this.notifyListeners('cache_cleared');
  }
}

export const bottleneckAnalysisService = BottleneckAnalysisService.getInstance();
