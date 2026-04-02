
/**
 * BottleneckAnalysisService
 * 
 * Servicio centralizado que encapsula toda la lógica de análisis de cuellos de botella
 * para centros 2000 y 1000. Proporciona:
 * - Cálculos centralizados y reutilizables con ARRASTRE DE INVENTARIO (Carry-over)
 * - Caching de resultados cronológicos
 * - Integración con DataStore
 */

import { dataStore } from './DataStore';
import { MONTH_NAMES, MONTH_NUMBERS } from '@/app/dashboard/opciones/importar-ventasV2/components/constants';
import type { TiempoCanonResult, TransferNeed } from '@/app/dashboard/opciones/importar-ventasV2/components/types';
import { normalizeMaterialCode } from '@/app/dashboard/opciones/importar-ventasV2/components/utils';

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
   * Calcular clave cronológica para ordenamiento (Año-Mes)
   */
  private getTimelineKey(row: any): number {
    const year = this.safeNumber(row.Año || row.año || new Date().getFullYear());
    let month = 0;
    const mesRaw = String(row.Mes || row.mesRef || '');
    const asNum = parseInt(mesRaw);
    if (!isNaN(asNum) && asNum >= 1 && asNum <= 12) {
      month = asNum;
    } else {
      month = MONTH_NUMBERS[mesRaw as keyof typeof MONTH_NUMBERS] || 0;
    }
    return (year * 12) + month;
  }

  /**
   * Calcular necesidad de un material
   */
  private computeNecesidad(row: any, stockInicial: number): number {
    const up = this.safeNumber(row.UnidadesProyectado ?? 0);
    const ss = this.safeNumber(row.StockSeguridad ?? 0);
    return Math.max(0, up - stockInicial + ss);
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
   * Obtener tiempo disponible para una línea específica
   */
  private obtenerTiempoDisp(
    tiemposCanon: TiempoCanonResult[],
    mes: string,
    linea: string,
    puesto: string | null = null,
    centro: string = ''
  ) {
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

    if (registrosLinea.length === 0) return null;

    let pBotellaDato: any = null;
    if (puesto && puesto !== '-' && puesto !== '') {
      const pn = String(puesto).toLowerCase().trim();
      pBotellaDato = registrosLinea.find((dato: any) => {
        const ne = String(dato?.nombre_estacion ?? '').toLowerCase().trim();
        return ne === pn || ne.includes(pn) || pn.includes(ne);
      }) ?? null;
    }

    if (!pBotellaDato) pBotellaDato = registrosLinea[0];

    return {
      minutos_horario_normal: this.safeNumber(pBotellaDato?.minutos_horario_normal_TOTAL ?? 0),
      minutos_con_extras: this.safeNumber(pBotellaDato?.minutos_extras_TOTAL ?? 0),
      minutos_fin_semana: this.safeNumber(pBotellaDato?.minutos_sabado_TOTAL ?? 0),
      diasLaborables: tc.diasLaborables,
      diasSabados: tc.diasSabados
    };
  }

  // ============================================================
  // ANÁLISIS CENTRO 2000
  // ============================================================

  public analyzeCenter2000(
    data: any[],
    tiemposCanon: TiempoCanonResult[]
  ): Center2000Analysis {
    if (!this.isCacheValid(data) && this.cache.center2000) {
      this.cache.center2000 = null;
    }

    if (this.cache.center2000 !== null) {
      return this.cache.center2000;
    }

    const filteredData = data.filter(row => String(row.Centro || '').trim() === '2000');
    
    // Agregación por material para evitar duplicidad de stock en el análisis secuencial
    const aggDataMap = new Map<string, any>();
    filteredData.forEach(row => {
      const code = normalizeMaterialCode(row.CodMaterial ?? '');
      const mes = String(row.Mes ?? '');
      const key = `${code}|${mes}`;
      
      if (!aggDataMap.has(key)) {
        aggDataMap.set(key, { 
          ...row, 
          UnidadesProyectado: 0, 
          _isAggregated: true 
        });
      }
      const agg = aggDataMap.get(key)!;
      agg.UnidadesProyectado = this.safeNumber(agg.UnidadesProyectado) + this.safeNumber(row.UnidadesProyectado);
      // Preservar el stock más alto encontrado (evitar ceros de filas secundarias)
      agg.StockActual = Math.max(this.safeNumber(agg.StockActual), this.safeNumber(row.StockActual));
      agg.StockSeguridad = Math.max(this.safeNumber(agg.StockSeguridad), this.safeNumber(row.StockSeguridad));
    });

    const dataEX: any[] = [];
    const dataF: any[] = [];
    
    Array.from(aggDataMap.values()).forEach(row => {
      const clase = this.normalizarClase(row.ClaseAprovisionam);
      if (clase === 'E' || clase === 'X') dataEX.push(row);
      else if (clase === 'F') dataF.push(row);
    });

    // Calcular traslados F (Déficit directo ya que no se procesan en C2000)
    const transferNeedsF: TransferNeed[] = [];
    dataF.forEach(row => {
      const nec = this.computeNecesidad(row, this.safeNumber(row.StockActual));
      if (nec > 0) {
        transferNeedsF.push({
          CodMaterial: normalizeMaterialCode(row.CodMaterial ?? ''),
          mes: String(row.Mes ?? ''),
          necesidadTraslado: nec
        });
      }
    });

    const result: Center2000Analysis = {
      filteredData: Array.from(aggDataMap.values()),
      dataEX,
      dataF,
      transferNeedsEX: [], 
      transferNeedsF,
      transferNeedsConsolidated: [...transferNeedsF],
      computedDataEX: []
    };

    this.cache.center2000 = result;
    this.cache.lastDataSignature = this.generateDataSignature(data);
    dataStore.setData('center2000Analysis', result, 'BottleneckAnalysisService');
    this.notifyListeners('center2000');

    return result;
  }

  // ============================================================
  // ANÁLISIS CENTRO 1000 (CON ARRASTRE)
  // ============================================================

  public analyzeCenter1000(
    data: any[],
    tiemposCanon: TiempoCanonResult[],
    transfersFromCenter2000: TransferNeed[]
  ): Center1000Analysis {
    if (!this.isCacheValid(data) && this.cache.center1000) {
      this.cache.center1000 = null;
    }

    if (this.cache.center1000 !== null) {
      return this.cache.center1000;
    }

    // 1. Filtrar registros que involucran a Quito como fabricante
    const quitoRows = data.filter(row => {
      const cFab = String(row.CentroFabricacion || '').trim();
      const cDem = String(row.Centro || '').trim();
      return cFab === '1000' || (cFab === '' && cDem === '1000');
    });

    // 2. Identificar línea de tiempo ordenada
    const timelineKeys = Array.from(new Set(quitoRows.map(r => this.getTimelineKey(r))))
      .sort((a, b) => a - b);

    if (timelineKeys.length === 0) {
      return { filteredData: [], datosEnriquecidos: [], transferNeeds: [], computedData: [], exportSheet: [] };
    }

    // 3. Procesamiento Cronológico con Arrastre
    const stockTracker = new Map<string, number>(); 
    const allProcessedRows: any[] = [];
    const trasladosMap = new Map<string, number>();
    transfersFromCenter2000.forEach(t => trasladosMap.set(`${normalizeMaterialCode(t.CodMaterial)}|${t.mes}`, t.necesidadTraslado));

    for (const tKey of timelineKeys) {
      const rowsOfMonth = quitoRows.filter(r => this.getTimelineKey(r) === tKey);
      if (rowsOfMonth.length === 0) continue;

      const mesRef = String(rowsOfMonth[0].Mes || '');
      
      // Agregación por material para el mes actual
      const aggMonth = new Map<string, any>();
      rowsOfMonth.forEach(row => {
        const code = normalizeMaterialCode(row.CodMaterial ?? '');
        const cDem = String(row.Centro || '').trim();
        const key = `${code}|${cDem}`;
        
        if (!aggMonth.has(key)) {
          aggMonth.set(key, { ...row, _unidadesProy: 0, _necPropia: 0, _isAggregated: true });
        }
        const agg = aggMonth.get(key)!;
        if (cDem === '1000') {
          agg._unidadesProy += this.safeNumber(row.UnidadesProyectado);
        }
        // Preservar stock real
        agg.StockActual = Math.max(this.safeNumber(agg.StockActual), this.safeNumber(row.StockActual));
        agg.StockSeguridad = Math.max(this.safeNumber(agg.StockSeguridad), this.safeNumber(row.StockSeguridad));
      });

      // Cálculo base para el mes
      const monthResults: any[] = [];
      aggMonth.forEach(agg => {
        const code = normalizeMaterialCode(agg.CodMaterial ?? '');
        const cDem = String(agg.Centro || '').trim();
        const keyStock = `${code}|${cDem}`;
        
        const initialStock = stockTracker.has(keyStock) 
          ? stockTracker.get(keyStock)! 
          : this.safeNumber(agg.StockActual);

        const traslado = trasladosMap.get(`${code}|${mesRef}`) || 0;
        const necPropia = Math.max(0, agg._unidadesProy - initialStock + this.safeNumber(agg.StockSeguridad));
        const necesidadTotal = necPropia + traslado;

        const prodViable = necesidadTotal; 
        const finalStock = initialStock + prodViable - agg._unidadesProy - (cDem === '1000' ? traslado : 0);
        
        stockTracker.set(keyStock, finalStock);

        monthResults.push({
          ...agg,
          _stockInitial: initialStock,
          _traslado: traslado,
          _necPropia: necPropia,
          _necesidad: necesidadTotal,
          _prodViable: prodViable,
          _saldoFinal: finalStock,
          mesRef
        });
      });

      allProcessedRows.push(...monthResults);
    }

    const result: Center1000Analysis = {
      filteredData: quitoRows,
      datosEnriquecidos: allProcessedRows,
      transferNeeds: [],
      computedData: allProcessedRows,
      exportSheet: []
    };

    this.cache.center1000 = result;
    this.cache.lastDataSignature = this.generateDataSignature(data);
    dataStore.setData('center1000Analysis', result, 'BottleneckAnalysisService');
    this.notifyListeners('center1000');

    return result;
  }

  public clearCache(): void {
    this.cache = { center2000: null, center1000: null, lastDataSignature: '' };
    this.notifyListeners('cache_cleared');
  }
}

export const bottleneckAnalysisService = BottleneckAnalysisService.getInstance();
