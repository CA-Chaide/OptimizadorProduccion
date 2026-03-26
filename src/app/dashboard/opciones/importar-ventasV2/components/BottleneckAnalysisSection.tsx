'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { safeNumber, exportToXLSXMultiSheet } from './utils';
import { TiempoCanonResult, TransferNeed } from './types';
import { BottleneckSummaryTable } from './BottleneckSummaryTable';
import { BottleneckClassTable } from './BottleneckClassTable';

// Función para normalizar y limpiar valores de clase de aprovisionamiento
function normalizarClase(valor: any): string {
  return String(valor || '').trim().toUpperCase();
}

interface BottleneckAnalysisSectionProps {
  data: any[];
  tiemposCanon: TiempoCanonResult[];
  numMaximoSabados: number;
  maxExtrasHoras: number;
  horasTrabajo: number;
  horasExtrasFin: number;
  onTransferNeedsConsolidatedChanged?: (needs: TransferNeed[]) => void;
}

export const BottleneckAnalysisSection: React.FC<BottleneckAnalysisSectionProps> = ({ 
  data, 
  tiemposCanon, 
  numMaximoSabados, 
  maxExtrasHoras, 
  horasTrabajo, 
  horasExtrasFin, 
  onTransferNeedsConsolidatedChanged 
}) => {
  // =====================================================
  // === TODOS LOS HOOKS AL INICIO (antes de returns) ===
  // =====================================================
  
  const [transferNeedsEX, setTransferNeedsEX] = useState<TransferNeed[]>([]);
  const [transferNeedsF, setTransferNeedsF] = useState<TransferNeed[]>([]);
  // Export sheet y datos computados desde BottleneckClassTable única (E+X combinadas, comparten líneas)
  const [exportSheetEXData, setExportSheetEXData] = useState<any[]>([]);
  const [computedDataEX, setComputedDataEX] = useState<any[]>([]);

  // Filtros tabla F
  const [fSearchTerm, setFSearchTerm] = useState<string>('');
  const [fSelectedLineas, setFSelectedLineas] = useState<string[]>([]);
  const [fLineaDropdownOpen, setFLineaDropdownOpen] = useState<boolean>(false);
  const fLineaDropdownRef = useRef<HTMLDivElement>(null);
  
  const [fSelectedResp, setFSelectedResp] = useState<string[]>([]);
  const [fRespDropdownOpen, setFRespDropdownOpen] = useState<boolean>(false);
  const fRespDropdownRef = useRef<HTMLDivElement>(null);
  
  const [fSelectedSector, setFSelectedSector] = useState<string[]>([]);
  const [fSectorDropdownOpen, setFSectorDropdownOpen] = useState<boolean>(false);
  const fSectorDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (fRespDropdownRef.current && !fRespDropdownRef.current.contains(e.target as Node)) {
        setFRespDropdownOpen(false);
      }
      if (fSectorDropdownRef.current && !fSectorDropdownRef.current.contains(e.target as Node)) {
        setFSectorDropdownOpen(false);
      }
      if (fLineaDropdownRef.current && !fLineaDropdownRef.current.contains(e.target as Node)) {
        setFLineaDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Función para calcular necesidad
  const computeNecesidad = (row: any) => {
    const up = safeNumber(row.UnidadesProyectado ?? 0);
    const ss = safeNumber(row.StockSeguridad ?? 0);
    const sa = safeNumber(row.StockActual ?? 0);
    return Math.max(0, up - sa + ss);
  };

  // Filtrar centro 2000 aplicando TRIM para evitar fallos por espacios
  const filteredDataCentro2000 = useMemo(() => {
    return data.filter(row => 
      String(row.Centro || '').trim() === '2000'
    );
  }, [data]);

  // Filtrar por clases (todo en hooks)
  const dataE = useMemo(() => {
    return filteredDataCentro2000.filter(row => 
      normalizarClase(row.ClaseAprovisionam) === 'E'
    );
  }, [filteredDataCentro2000]);

  const dataX = useMemo(() => {
    return filteredDataCentro2000.filter(row => 
      normalizarClase(row.ClaseAprovisionam) === 'X'
    );
  }, [filteredDataCentro2000]);

  const dataF = useMemo(() => {
    return filteredDataCentro2000.filter(row => 
      normalizarClase(row.ClaseAprovisionam) === 'F'
    );
  }, [filteredDataCentro2000]);

  // === COMBINACIÓN E+X: Comparten las mismas líneas de producción ===
  const dataEX = useMemo(() => [...dataE, ...dataX], [dataE, dataX]);

  // Consolidar traslados (E+X combinados + F)
  const transferNeedsConsolidated = useMemo(() => {
    const consolidated = new Map<string, number>();
    let totalEX = 0;
    
    transferNeedsEX.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
      totalEX += item.necesidadTraslado;
    });

    let totalF = 0;
    transferNeedsF.forEach(item => {
      consolidated.set(item.CodMaterial, (consolidated.get(item.CodMaterial) || 0) + item.necesidadTraslado);
      totalF += item.necesidadTraslado;
    });

    const result = Array.from(consolidated.entries())
      .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
      .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));

    return result;
  }, [transferNeedsEX, transferNeedsF]);

  // Notificar cambios — con guard para evitar loops de re-render
  const lastConsolidatedJsonRef = useRef<string>('');
  useEffect(() => {
    if (onTransferNeedsConsolidatedChanged && transferNeedsConsolidated.length > 0) {
      const json = JSON.stringify(transferNeedsConsolidated);
      if (json === lastConsolidatedJsonRef.current) return;
      lastConsolidatedJsonRef.current = json;
      onTransferNeedsConsolidatedChanged(transferNeedsConsolidated);
    }
  }, [transferNeedsConsolidated, onTransferNeedsConsolidatedChanged]);

  // Calcular transferencias F
  useEffect(() => {
    if (dataF.length > 0) {
      const transferMapByMes = new Map<string, number>();
      dataF.forEach(row => {
        const codMaterial = String(row.CodMaterial ?? '');
        const mes = String(row.Mes ?? '');
        const key = `${codMaterial}|${mes}`;
        const necesidad = computeNecesidad(row);
        if (!transferMapByMes.has(key) || transferMapByMes.get(key)! < necesidad) {
          transferMapByMes.set(key, necesidad);
        }
      });

      const transferMap = new Map<string, number>();
      transferMapByMes.forEach((value, key) => {
        const codMaterial = key.split('|')[0];
        transferMap.set(codMaterial, (transferMap.get(codMaterial) || 0) + value);
      });

      const transferNeedsF_array = Array.from(transferMap.entries())
        .map(([CodMaterial, necesidadTraslado]) => ({ CodMaterial, necesidadTraslado }))
        .sort((a, b) => a.CodMaterial.localeCompare(b.CodMaterial));
      
      setTransferNeedsF(transferNeedsF_array);
    } else {
      setTransferNeedsF([]);
    }
  }, [dataF]);

  if (data.length === 0) {
    return <div className="p-4 text-center text-gray-600">Carga datos primero desde la pestaña "Datos del Backend - Necesidades"</div>;
  }

  // Proyectar las columnas limpias desde los datos completos de BottleneckClassTable
  const projectCleanColumns = (rows: any[]) =>
    rows
      .filter((r: any) => !String(r['CodMaterial'] || '').startsWith('**'))
      .map((r: any) => ({
        'Clase':             r['Clase'] ?? '',
        'CodMaterial':       r['CodMaterial'] ?? '',
        'Descripcion':       r['Descripcion'] ?? '',
        'Linea':             r['Linea'] ?? '',
        'Sector':            r['Sector'] ?? '',
        'Responsable':       r['Responsable'] ?? '',
        'Necesidad':         r['[JN] NECESIDAD'] ?? 0,
        'Prod.Viable JN':    r['[JN] MAX.PRODUCIR'] ?? 0,
        'Prod.Viable HE':    r['[HE] MAX.PRODUCIR'] ?? 0,
        'Prod.Viable Sab':   r['[SAB] MAX.PRODUCIR'] ?? 0,
        'Prod.Viable TOTAL': r['[RES] Prod.Viable'] ?? 0,
        'Deficit General':   r['[RES] Deficit General'] ?? 0,
      }));

  const buildResumenSheet = () => {
    const rowsF = dataF.map((row: any) => {
      const necesidad = Math.floor(computeNecesidad(row));
      return {
        'Clase': 'F',
        'CodMaterial': row.CodMaterial ?? '',
        'Descripcion': row.Descripcion || row.NombreMaterial || '',
        'Linea': row.LineaFabricacion || '',
        'Sector': row.Sector || '',
        'Responsable': row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '',
        'Necesidad': necesidad,
        'Prod.Viable JN': 0, 'Prod.Viable HE': 0, 'Prod.Viable Sab': 0,
        'Prod.Viable TOTAL': 0, 'Deficit General': necesidad,
      };
    });
    return [
      ...projectCleanColumns(exportSheetEXData),
      ...rowsF,
    ];
  };

  const handleExportTodo = () => {
    exportToXLSXMultiSheet([
      { sheetName: 'Resumen E+X+F', data: buildResumenSheet() },
      { sheetName: 'Clase E+X', data: exportSheetEXData },
      { sheetName: 'Clase F', data: dataF.map((row: any) => ({
          'Clase': 'F',
          'CodMaterial':  row.CodMaterial ?? '',
          'Descripcion':  row.Descripcion || row.NombreMaterial || '',
          'Linea':        row.LineaFabricacion || '',
          'Sector':       row.Sector || '',
          'Responsable':  row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '',
          'Necesidad (Traslado total)': Math.floor(computeNecesidad(row)),
        })) },
    ], 'Analisis_Centro2000');
  };

  return (
    <div>
      <div className="flex justify-end px-2 pb-2">
        <button
          onClick={handleExportTodo}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Descargar Excel (Clases E + X + F)
        </button>
      </div>
      
      <BottleneckSummaryTable 
        datosEnriquecidosE={[]}
        datosEnriquecidosX={[]}
        datosCalculados={computedDataEX}
        tiemposCanon={tiemposCanon}
        numMaximoSabados={numMaximoSabados}
        maxExtrasHoras={maxExtrasHoras}
        horasTrabajo={horasTrabajo}
        horasExtrasFin={horasExtrasFin}
      />
      
      <BottleneckClassTable 
        datos={dataEX}
        datosCompletos={filteredDataCentro2000}
        titulo="Clases de Aprovisionamiento: E + X"
        tiemposCanon={tiemposCanon}
        tiempoConsumidoAnterior={{}}
        onTransferNeedsCalculated={setTransferNeedsEX}
        onExportSheetReady={setExportSheetEXData}
        onComputedDataReady={setComputedDataEX}
        maxExtrasHoras={maxExtrasHoras}
        horasExtrasFin={horasExtrasFin}
      />
      
      {dataF.length > 0 && (() => {
        const fLineasUnicas = Array.from(new Set(dataF.map((r: any) => String(r.LineaFabricacion || '')))).filter(Boolean).sort();
        const fRespUnicos = Array.from(new Set(dataF.map((r: any) => String(r.NombRespControlProd || r.RespCtrlProd || r.RespControlProd || '').trim()))).filter(Boolean).sort();
        const fSectoresUnicos = Array.from(new Set(dataF.map((r: any) => String(r.Sector || '').trim()))).filter(Boolean).sort();
        const fFiltrados = dataF.filter((row: any) => {
          const term = fSearchTerm.toLowerCase();
          const matchSearch = !term ||
            String(row.CodMaterial || '').toLowerCase().includes(term) ||
            String(row.Descripcion || row.NombreMaterial || '').toLowerCase().includes(term);
          const matchLinea = fSelectedLineas.length === 0 || fSelectedLineas.includes(String(row.LineaFabricacion || ''));
          const matchResp = fSelectedResp.length === 0 || fSelectedResp.includes(String(row.NombRespControlProd || row.RespCtrlProd || row.RespControlProd || '').trim());
          const sectorRow = String(row.Sector || '').trim();
          const matchSector = fSelectedSector.length === 0 ||
            fSelectedSector.includes(sectorRow) ||
            (fSelectedSector.includes('(Sin sector)') && sectorRow === '');
          return matchSearch && matchLinea && matchResp && matchSector;
        });
        const totalFiltrado = fFiltrados.reduce((sum: number, row: any) => sum + computeNecesidad(row), 0);
        return (
        <div className="mt-8 p-6 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-grow">
              <h3 className="text-lg font-semibold text-amber-900">Clase de Aprovisionamiento: F (Traslado a Quito)</h3>
              <p className="text-sm text-amber-800 mt-2">
                Los siguientes {dataF.length} material{dataF.length !== 1 ? 'es' : ''} con clase F se trasladan completos a plantas de Quito sin asignación de fabricación en Centro 2000.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 relative" ref={fLineaDropdownRef}>
                  <label className="text-xs font-medium text-amber-800">Línea:</label>
                  <button
                    type="button"
                    onClick={() => setFLineaDropdownOpen(o => !o)}
                    className="border border-amber-300 px-2 py-1 rounded text-xs bg-white min-w-[160px] text-left flex items-center justify-between gap-1 focus:ring-2 focus:ring-amber-400"
                  >
                    <span className="truncate">
                      {fSelectedLineas.length === 0 ? 'Todas' : fSelectedLineas.length === 1 ? fSelectedLineas[0] : `${fSelectedLineas.length} seleccionadas`}
                    </span>
                    <svg className={`w-3 h-3 text-amber-500 flex-shrink-0 transition-transform ${fLineaDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {fLineaDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-amber-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-56 overflow-y-auto">
                      <div className="p-2 border-b border-amber-100 flex gap-2">
                        <button type="button" onClick={() => setFSelectedLineas([])} className="text-xs text-amber-700 hover:underline">Todas</button>
                        <span className="text-amber-200">|</span>
                        <button type="button" onClick={() => setFSelectedLineas([...fLineasUnicas])} className="text-xs text-amber-700 hover:underline">Seleccionar todas</button>
                      </div>
                      {fLineasUnicas.map(l => (
                        <label key={l} className="flex items-center gap-2 px-3 py-1.5 hover:bg-amber-50 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={fSelectedLineas.includes(l)}
                            onChange={e => setFSelectedLineas(prev => e.target.checked ? [...prev, l] : prev.filter(x => x !== l))}
                            className="rounded border-amber-300 text-amber-600"
                          />
                          <span className="truncate">{l}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 relative" ref={fRespDropdownRef}>
                  <label className="text-xs font-medium text-amber-800">Responsable:</label>
                  <button
                    type="button"
                    onClick={() => setFRespDropdownOpen(o => !o)}
                    className="border border-amber-300 px-2 py-1 rounded text-xs bg-white min-w-[160px] text-left flex items-center justify-between gap-1 focus:ring-2 focus:ring-amber-400"
                  >
                    <span className="truncate">
                      {fSelectedResp.length === 0 ? 'Todos' : fSelectedResp.length === 1 ? fSelectedResp[0] : `${fSelectedResp.length} seleccionados`}
                    </span>
                    <svg className={`w-3 h-3 text-amber-500 flex-shrink-0 transition-transform ${fRespDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {fRespDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-amber-200 rounded-lg shadow-lg z-50 min-w-[200px] max-h-56 overflow-y-auto">
                      <div className="p-2 border-b border-amber-100 flex gap-2">
                        <button type="button" onClick={() => setFSelectedResp([])} className="text-xs text-amber-700 hover:underline">Todos</button>
                        <span className="text-amber-200">|</span>
                        <button type="button" onClick={() => setFSelectedResp([...fRespUnicos])} className="text-xs text-amber-700 hover:underline">Seleccionar todos</button>
                      </div>
                      {fRespUnicos.map(r => (
                        <label key={r} className="flex items-center gap-2 px-3 py-1.5 hover:bg-amber-50 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={fSelectedResp.includes(r)}
                            onChange={e => setFSelectedResp(prev => e.target.checked ? [...prev, r] : prev.filter(x => x !== r))}
                            className="rounded border-amber-300 text-amber-600"
                          />
                          <span className="truncate">{r}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 relative" ref={fSectorDropdownRef}>
                  <label className="text-xs font-medium text-amber-800">Sector:</label>
                  <button
                    type="button"
                    onClick={() => setFSectorDropdownOpen(o => !o)}
                    className="border border-amber-300 px-2 py-1 rounded text-xs bg-white min-w-[140px] text-left flex items-center justify-between gap-1 focus:ring-2 focus:ring-amber-400"
                  >
                    <span className="truncate">
                      {fSelectedSector.length === 0 ? 'Todos' : fSelectedSector.length === 1 ? fSelectedSector[0] : `${fSelectedSector.length} seleccionados`}
                    </span>
                    <svg className={`w-3 h-3 text-amber-500 flex-shrink-0 transition-transform ${fSectorDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {fSectorDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white border border-amber-200 rounded-lg shadow-lg z-50 min-w-[180px] max-h-56 overflow-y-auto">
                      <div className="p-2 border-b border-amber-100 flex gap-2">
                        <button type="button" onClick={() => setFSelectedSector([])} className="text-xs text-amber-700 hover:underline">Todos</button>
                        <span className="text-amber-200">|</span>
                        <button type="button" onClick={() => setFSelectedSector([...fSectoresUnicos])} className="text-xs text-amber-700 hover:underline">Seleccionar todos</button>
                      </div>
                      {fSectoresUnicos.map(s => (
                        <label key={s} className="flex items-center gap-2 px-3 py-1.5 hover:bg-amber-50 cursor-pointer text-xs">
                          <input
                            type="checkbox"
                            checked={fSelectedSector.includes(s)}
                            onChange={e => setFSelectedSector(prev => e.target.checked ? [...prev, s] : prev.filter(x => x !== s))}
                            className="rounded border-amber-300 text-amber-600"
                          />
                          <span className="truncate">{s}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="search"
                    placeholder="Buscar código o descripción..."
                    value={fSearchTerm}
                    onChange={e => setFSearchTerm(e.target.value)}
                    className="border border-amber-300 px-2 py-1 rounded text-xs bg-white w-52 focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <span className="text-xs text-amber-700">{fFiltrados.length} de {dataF.length} registros</span>
              </div>

              <div className="mt-3 overflow-x-auto max-h-[500px] overflow-y-auto rounded border border-amber-200">
                <table className="min-w-full divide-y divide-amber-200 bg-white text-xs">
                  <thead className="bg-amber-100 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Código Material</th>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Descripción</th>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Línea</th>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Sector</th>
                      <th className="px-3 py-2 text-left font-semibold text-amber-900">Responsable</th>
                      <th className="px-3 py-2 text-right font-semibold text-amber-900">Necesidad (Traslado a Quito)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {fFiltrados.map((row: any, idx: number) => (
                      <tr key={idx} className="hover:bg-amber-50">
                        <td className="px-3 py-2 text-gray-800 font-mono">{row.CodMaterial || '-'}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate" title={row.Descripcion || row.NombreMaterial || ''}>{row.Descripcion || row.NombreMaterial || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.LineaFabricacion || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.Sector || '-'}</td>
                        <td className="px-3 py-2 text-gray-700">{row.NombRespControlProd || row.RespCtrlProd || (row as any).RespControlProd || '-'}</td>
                        <td className="px-3 py-2 text-right font-semibold text-amber-900">{computeNecesidad(row).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-amber-100 sticky bottom-0">
                    <tr>
                      <td colSpan={5} className="px-3 py-2 font-bold text-amber-900 text-xs">Total{fFiltrados.length < dataF.length ? ` (filtrado)` : ''}</td>
                      <td className="px-3 py-2 text-right font-bold text-amber-900">{totalFiltrado.toLocaleString()}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};
