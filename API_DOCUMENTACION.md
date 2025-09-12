# Documentación Oficial de la API - Optimizador de Producción

Este documento es la única fuente de verdad sobre las capacidades y limitaciones de la API interna.

---

## 1. Endpoint Principal

- **URL:** `/Aplicativos/ApiOptimizadorProduccion/query/`
- **Método:** `POST`

## 2. Operaciones Soportadas

### 2.1. `get_data`

Recupera un conjunto de registros de una fuente de datos específica.

- **`source` (string, requerido):** El nombre de la tabla. Fuentes válidas: `Presupuesto`, `TiemposEnsamblado`.
- **`columns` (array de strings, opcional):** Lista de columnas a devolver. Si se omite, devuelve todas.
- **`filters` (objeto, opcional):** Pares clave-valor para filtrar los resultados.
- **`pagination` (objeto, opcional):**
    - **`limit` (integer):** Número máximo de registros a devolver. **Límite máximo por consulta: 50,000 registros.**
    - **`skip` (integer):** Número de registros a omitir (para paginación).

### 2.2. `get_distinct_values`

Obtiene los valores únicos de una columna específica.

- **`source` (string, requerido):** El nombre de la tabla.
- **`column` (string, requerido):** El nombre de la columna de la cual extraer los valores distintos.

### 2.3. `get_documentation`

Recupera esta misma documentación en formato JSON.

- **Endpoint:** `/Aplicativos/ApiOptimizadorProduccion/documentation/`
- **Método:** `GET`

---

## 3. Limitaciones y Reglas de Rendimiento

- **Límite de Registros:** Cada llamada a `get_data` está estrictamente limitada a un máximo de **50,000 registros**. No es posible solicitar más en una sola petición.
- **Estrategia de Carga Masiva:** Para consultar conjuntos de datos que excedan los 50,000 registros (ej. un año completo de ventas), la única estrategia soportada es realizar múltiples llamadas secuenciales, filtrando por períodos más pequeños (ej. mes a mes).
- **Operaciones no Soportadas:** La API no soporta operaciones de escritura (`create`, `update`, `delete`) ni transacciones complejas. Es una API de solo lectura.