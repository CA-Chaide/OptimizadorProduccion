/**
 * BottleneckAnalysisService
 * 
 * Servicio centralizado que encapsula toda la lógica de análisis de cuellos de botella
 * para centros 2000 y 1000. Proporciona:
 * - Cálculos centralizados y reutilizables
 * - Caching de resultados
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

    const filteredDataCentro2000 = data.filter(row => String(row.Centro || '').trim() === '2000');
    
    const dataEX: any[] = [];
    const dataF: any[] = [];
    
    filteredDataCentro2000.forEach(row => {
      const clase = this.normalizarClase(row.ClaseAprovisionam);
      if (clase === 'E' || clase === 'X') dataEX.push(row);
      else if (clase === 'F') dataF.push(row);
    });

    const transferNeedsF: TransferNeed[] = [];
    dataF.forEach(row => {
      const up = this.safeNumber(row.UnidadesProyectado);
      const sa = this.safeNumber(row.StockActual);
      const ss = this.safeNumber(row.StockSeguridad);
      const nec = Math.max(0, up - sa + ss);
      if (nec > 0) {
        transferNeedsF.push({
          CodMaterial: normalizeMaterialCode(row.CodMaterial ?? ''),
          mes: String(row.Mes ?? ''),
          necesidadTraslado: nec
        });
      }
    });

    const result: Center2000Analysis = {
      filteredData: filteredDataCentro2000,
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
  // ANÁLISIS CENTRO 1000
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

    const filteredData = data.filter(row => {
      const cFab = String(row.CentroFabricacion || '').trim();
      const cDem = String(row.Centro || '').trim();
      return cFab === '1000' || (cFab === '' && cDem === '1000');
    });

    const trasladosMap = new Map<string, number>();
    transfersFromCenter2000.forEach(t => {
      const code = normalizeMaterialCode(t.CodMaterial);
      const key = `${code}|${t.mes}`;
      trasladosMap.set(key, (trasladosMap.get(key) || 0) + t.necesidadTraslado);
    });

    const exportSheet = filteredData.map(row => {
      const code = normalizeMaterialCode(row.CodMaterial ?? '');
      const mes = String(row.Mes ?? '');
      const trKey = `${code}|${mes}`;
      const traslado = trasladosMap.get(trKey) || 0;
      
      const up = this.safeNumber(row.UnidadesProyectado);
      const sa = this.safeNumber(row.StockActual);
      const ss = this.safeNumber(row.StockSeguridad);
      const necPropia = Math.max(0, up - sa + ss);
      
      return {
        ...row,
        _traslado: traslado,
        _necPropia: necPropia,
        _necesidadTotal: traslado + necPropia
      };
    });

    const result: Center1000Analysis = {
      filteredData,
      datosEnriquecidos: [],
      transferNeeds: [],
      computedData: [],
      exportSheet
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
