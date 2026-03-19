'use client';

import React from 'react';
import { TimesCanonSectionProps } from './types';

export const TimesCanonSection: React.FC<TimesCanonSectionProps> = ({ results, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="flex items-center gap-3 text-gray-500">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Cargando tiempos canónicos por puesto de trabajo...</span>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-gray-500">
        <svg className="h-12 w-12 mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <span>Haz clic en "Cargar Datos" para obtener los tiempos canónicos</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.map((result, idx) => (
        <div key={`${result.mesNumero}-${idx}`} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* Header del mes */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h4 className="text-lg font-semibold text-gray-800">{result.mes}</h4>
            <div className="grid grid-cols-3 gap-4 mt-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center bg-blue-50 rounded-lg">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Días Laborables (L-V)</p>
                  <p className="text-lg font-semibold text-blue-600">{result.diasLaborables}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center bg-purple-50 rounded-lg">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Días Sábados</p>
                  <p className="text-lg font-semibold text-purple-600">{result.diasSabados}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 flex items-center justify-center bg-amber-50 rounded-lg">
                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Feriados descontados</p>
                  <p className="text-lg font-semibold text-amber-600">{result.diasFeriados.length}</p>
                </div>
              </div>
            </div>
            {result.diasFeriados.length > 0 && (
              <div className="mt-3 p-2 bg-amber-50 rounded-md">
                <span className="text-xs text-amber-700 font-medium">Feriados: </span>
                <span className="text-xs text-amber-600">{result.diasFeriados.join(', ')}</span>
              </div>
            )}
          </div>

          {/* Error handling */}
          {result.error && (
            <div className="mx-6 my-4 p-3 bg-red-50 text-red-700 border border-red-200 rounded-md text-sm flex items-center gap-2">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Error: {result.error}
            </div>
          )}

          {/* Data table */}
          {Array.isArray(result.data) && result.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {Object.keys(result.data[0] || {}).map(col => (
                      <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.data.map((row: any, rowIdx: number) => (
                    <tr key={rowIdx} className="hover:bg-gray-50 transition-colors">
                      {Object.keys(row).map(col => (
                        <td key={`${rowIdx}-${col}`} className="px-4 py-2.5 text-sm text-gray-700">
                          {typeof row[col] === 'number' 
                            ? <span className="font-mono">{row[col].toLocaleString(undefined, { maximumFractionDigits: 3 })}</span>
                            : String(row[col] ?? '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !result.error && (
              <div className="p-8 text-center text-gray-500">
                <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <span className="text-sm">Sin datos disponibles</span>
              </div>
            )
          )}
        </div>
      ))}
    </div>
  );
};
