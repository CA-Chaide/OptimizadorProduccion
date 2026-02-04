
import type { BodyListResponse } from "@/types/body-list-response";
import type { BodyResponse } from "@/types/body-response";
import { environment } from "@/environments/environments.prod";

const API_URL = `${environment.apiURL}/api/servicios`;

export const serviciosService = {

  async getCuboHabilidadesOP(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + '/cuboHabilidadesOp', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fecth Habilidades OP');
    }
    return response.json();
  },

  async getCuboInventarios(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + '/cuboInventarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fecth Habilidades OP');
    }
    return response.json();
  },

  async getCuboHabilidadesOP(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + '/cuboHabilidadesOp', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fecth Habilidades OP');
    }
    return response.json();
  },

  async getCuboHabilidadesOP(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + '/cuboHabilidadesOp', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fecth Habilidades OP');
    }
    return response.json();
  },

  async getCuboHabilidadesOP(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + '/cuboHabilidadesOp', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fecth Habilidades OP');
    }
    return response.json();
  },

  async getCuboHabilidadesOP(): Promise<BodyResponse<any>> {
    const response = await fetch(API_URL + '/cuboHabilidadesOp', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ message: 'Error desconocido' }));
      throw new Error(errorBody.message || 'Failed to fecth Habilidades OP');
    }
    return response.json();
  },

};
