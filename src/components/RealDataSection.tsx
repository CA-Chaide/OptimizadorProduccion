
import React from 'react';
import { RealDataIcon } from '@/constants/constants';

export const RealDataSection: React.FC = () => {
  return (
    <div className="p-6 md:p-8 space-y-6 bg-white shadow-lg rounded-xl m-4">
      <div className="flex items-center space-x-3">
        <RealDataIcon />
        <h2 className="text-2xl font-semibold text-gray-700">Datos Reales</h2>
      </div>
      
      <p className="text-gray-600">
        Esta sección está en construcción.
      </p>
      <p className="text-gray-500">
        Aquí se mostrarán los datos provenientes de las APIs externas de producción y desarrollo.
      </p>
    </div>
  );
};
