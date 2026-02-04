
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiURL}/api/MaestroMaterialCentro`;

export const serviciosService = {

  async getTotalMateriales(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + '/total', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fecth Materiales del Matestro de Materiales');
    }
    return response.json();
  },

};
