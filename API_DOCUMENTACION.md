# Documentación Técnica: API de Consultas Genéricas (v2.0)

## 1. Filosofía y Arquitectura

Esta API funciona como un **motor de consultas genérico y dinámico**. A diferencia de un API REST tradicional, el backend no contiene lógica de negocio. Actúa como un intermediario inteligente y agnóstico que traduce las peticiones de los clientes a ejecuciones de Stored Procedures (SP) en la base de datos.

- **Inversión de Control**: Toda la lógica de negocio, las consultas y las descripciones de los datos residen en la base de datos (SQL Server).
- **Auto-descubrimiento**: La API puede ser consultada para revelar qué fuentes de datos y columnas están disponibles, incluyendo valores de ejemplo reales.
- **Agilidad**: Añadir nuevas fuentes de datos o columnas es un proceso que se realiza exclusivamente en la base de datos, **sin requerir modificaciones en el código del API**.

---

## 2. Autenticación

El acceso a los endpoints de consulta está protegido mediante un Token Bearer.

- **Formato del Encabezado**: Todas las solicitudes deben incluir el encabezado `Authorization`.
  ```
  Authorization: Bearer <TU_TOKEN_SECRETO>
  ```
- **Token**: El token válido se define en la variable de entorno `API_TOKEN` en el archivo `.env` del servidor.

### Ejemplo de solicitud con `curl`:
```bash
curl -X POST "http://tu_servidor/query/" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer <TU_TOKEN_SECRETO>" \
     -d '{
           "source": "HabilidadesOperador",
           "operation": "get_data",
           "filters": {"Centro": "1000"}
         }'
```

---

## 3. Endpoints de la API

### 3.1. Diccionario de Datos

Permite a las aplicaciones cliente descubrir dinámicamente las fuentes de datos y columnas disponibles.

- **Método**: `GET`
- **Ruta**: `/documentation/`
- **Autenticación**: No requerida.
- **Respuesta**: Un objeto JSON que contiene un diccionario de todas las fuentes de datos registradas.

#### Estructura de la Respuesta

La respuesta es un objeto donde cada clave es una `FuenteNombre`. Cada fuente contiene su descripción y una lista de sus columnas.

- **Importante**: El `ValorDeEjemplo` no es un dato estático. Es un valor real obtenido directamente de la tabla física correspondiente en el momento de la consulta, gracias a la lógica del `SP_Produccion_GetFullDictionary`.

**Ejemplo de Respuesta (fragmento):**
```json
{
  "HabilidadesOperador": {
    "description": "Calificaciones y habilidades de los operadores por máquina y proceso.",
    "columns": [
      {
        "column_name": "Calificacion",
        "friendly_name": "Calificacion",
        "description": "Calificación del operador (ej. 100.000).",
        "sample_value": "100.00"
      },
      {
        "column_name": "Centro",
        "friendly_name": "Centro",
        "description": "Centro de trabajo.",
        "sample_value": "1000"
      }
      // ... más columnas
    ]
  }
  // ... más fuentes de datos
}
```

### 3.2. Motor de Consultas

Este es el endpoint principal para ejecutar consultas sobre cualquier fuente de datos.

- **Método**: `POST`
- **Ruta**: `/query/`
- **Autenticación**: **Requerida** (Bearer Token).
- **Cuerpo de la Petición**: Un objeto JSON que define la consulta a realizar.

#### Estructura del Cuerpo de la Petición (`QueryRequest`)

- `source` (string, **obligatorio**): El nombre de la fuente de datos a consultar (ej. `"HabilidadesOperador"`).
- `operation` (string, **obligatorio**): La operación a realizar.
    - `"get_data"`: Para obtener un conjunto de registros.
    - `"get_distinct_values"`: Para obtener la lista de valores únicos de una columna (ideal para llenar selectores en una UI).
- `filters` (objeto, opcional): Un objeto JSON con los filtros a aplicar. Las claves deben ser nombres de columnas válidas para esa fuente. Ejemplo: `{"Centro": "1000", "Rol": "OP Principal"}`.
- `pagination` (objeto, opcional): Para paginar los resultados. Ejemplo: `{"skip": 0, "limit": 50}`.
- `column` (string, requerido solo para `get_distinct_values`): La columna de la cual se quieren obtener los valores únicos. Ejemplo: `"Rol"`.

#### Ejemplos de Peticiones

**A. Obtener datos con filtros y paginación:**
```json
{
  "source": "HabilidadesOperador",
  "operation": "get_data",
  "filters": {
    "Centro": "1000",
    "Rol": "OP Principal"
  },
  "pagination": {
    "skip": 0,
    "limit": 25
  }
}
```

**B. Obtener valores únicos para un selector de UI:**
```json
{
  "source": "HabilidadesOperador",
  "operation": "get_distinct_values",
  "column": "Rol"
}
```
