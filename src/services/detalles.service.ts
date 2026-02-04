import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { environment } from "@/environments/environments.prod";
import { Detalles } from "../types/interfaces";

const API_URL = `${environment.apiURL}/api/detalles`;

export const detallesService = {
  async getAll(): Promise<BodyListResponse<Detalles>> {
    const response = await fetch(API_URL);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Error al obtener los Detalles');
    }
    return response.json();
  },

  async getById(codigo_detalle: number): Promise<BodyResponse<Detalles>> {
    const response = await fetch(`${API_URL}/${codigo_detalle}`);
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Detalle no encontrado');
    }
    return response.json();
  },

  async save(detalle: Detalles): Promise<BodyResponse<Detalles>> {
    const response = await fetch(`${API_URL}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(detalle),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Error al guardar el detalle');
    }
    return response.json();
  },

  async delete(codigo_detalle: number): Promise<BodyResponse<void>> {
    const response = await fetch(`${API_URL}/${codigo_detalle}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Error al eliminar el detalle');
    }
    return response.json();
  },
};
