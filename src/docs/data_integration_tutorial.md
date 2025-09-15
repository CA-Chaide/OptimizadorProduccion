# Hoja de Ruta y Tutorial de Depuración del Plan de Producción

Este documento sirve como una guía paso a paso para depurar y validar todo el flujo de generación del plan de producción, desde la carga de datos inicial hasta la visualización del plan final.

**Objetivo:** Islar y verificar cada componente del proceso para asegurar que los datos fluyen correctamente y que la lógica de negocio se aplica según lo esperado.

---

## **Paso 0: Preparación**

**Acción:** No se requiere ninguna acción en la aplicación. Este es un paso de preparación conceptual.

**Verificación:**
1.  Abra las herramientas de desarrollador de su navegador (usualmente con F12 o `Ctrl+Shift+I`).
2.  Seleccione la pestaña "Consola". Aquí es donde aparecerán todos los logs que hemos instrumentado.
3.  Mantenga esta consola abierta y limpia (puede usar el botón de limpiar consola) antes de iniciar cada paso.

**Criterio de Éxito:** Estar listos para observar el flujo de datos en tiempo real.

---

## **Paso 1: Importación y Validación de Datos de Ventas (Año Completo)**

**Objetivo:** Asegurar que los datos del presupuesto de ventas para **todo el año** se cargan y transforman correctamente desde la API.

### Incidente Común: Error de CORS

Al entrar a la pestaña "Importar Ventas", es posible que la aplicación no muestre las opciones en los filtros y la consola del navegador muestre un **error de CORS**.

- **Log del Error:** `Access to fetch at 'https://intranet.chaide.com/...' has been blocked by CORS policy...`
- **Causa:** El navegador, por seguridad, bloquea las peticiones desde el dominio de desarrollo hacia el dominio de la API (`intranet.chaide.com`).
- **Solución Aplicada:** Se configuró un "proxy de reescritura" en el archivo `next.config.ts`. Esto hace que la aplicación apunte a una URL local (ej. `/Aplicativos/Api...`) y el servidor de Next.js redirige la petición de forma interna, evitando el problema de CORS.

### Depuración del Paso 1

**Acción en la UI:**
1.  Navegue a la sección **"Importar Ventas"**.
2.  Seleccione el año deseado (ej. `2025`).
3.  Presione el botón **"Cargar Datos del Año Completo"**.

**Qué Observar en la Consola:**
1.  **Inicio de Carga:** Verá una notificación en la UI y un log en consola: `[DataImportSection] Solicitando carga de datos para el año completo: 2025`.
2.  **Carga Secuencial:** Aparecerá una serie de notificaciones en la UI, una por cada mes: `Cargando datos de ventas para Enero 2025...`, `Cargando datos de ventas para Febrero 2025...`, etc.
3.  **Consultas a la API:** En paralelo, verá en la consola 12 bloques de logs de `[useApiData] Querying API:`. Cada uno debe tener los `filters` correctos para cada mes (`"Mes":1`, `"Mes":2`, etc.).
4.  **Carga Exitosa:** Al finalizar, debe aparecer una notificación verde de éxito en la UI y un log final en la consola: `Carga de datos de ventas completada. Se encontraron X registros en total para el año 2025.`. Verifique que el número de registros sea alto (decenas de miles), lo que confirma que se cargó todo el año.

**Criterio de Éxito:** El proceso termina, la notificación de éxito aparece y el número de registros en el log de consola es significativamente mayor a 50,000. Solo entonces avanzaremos.

---

## **Paso 2: Sincronización y Validación de Datos Maestros**

**Objetivo:** Confirmar que la estructura de producción (centros, líneas, puestos) y los tiempos de ensamble se descubren y validan correctamente.

**Acción en la UI:**
1.  Navegue a la sección **"Definir Restricciones"**.
2.  Presione el botón **"Sincronizar y Validar Datos"**.

**Qué Observar en la Consola:**
1.  **Consulta a la API:** Busque el log `[useApiData] Querying API:` para la fuente `TiemposEnsamblado`.
    *   Verifique que la consulta no tiene filtros y pide todos los datos (`operation: 'get_data'`).
2.  **Procesamiento de Datos:** Busque el log `--- INICIANDO PROCESAMIENTO Y VALIDACIÓN DE DATOS DE ENSAMBLE ---`.
3.  **Estructura Descubierta:** Revise los logs que muestran:
    *   `Work Centers Discovered:`
    *   `Production Lines Discovered:`
    *   `Workstation Definitions Discovered:`
    *   Confirme que los nombres y cantidades parecen lógicos y corresponden a su conocimiento de la operación.
4.  **Errores de Validación:** Busque específicamente si aparece el log `[VALIDATION ERRORS]`. Si este log aparece, la ejecución se detendrá y nos mostrará los problemas exactos que encontró (ej. productos en la demanda sin tiempos de ensamble, etc.).

**Criterio de Éxito:** El proceso termina con un mensaje de "Sincronización exitosa" en la UI. La consola no debe mostrar errores de validación. La estructura de producción descubierta en la UI debe ser coherente.

---

## **Paso 3: Generación del Plan de Producción**

**Objetivo:** Validar que el motor de optimización carga correctamente todos los datos de ventas del año y genera un plan completo.

**Acción en la UI:**
1.  Navegue a la sección **"Plan de Producción"**.
2.  Presione el botón **"Iniciar Planificación"**.

**Qué Observar en la Consola:**
1.  **Lógica Mensual:** Revise los logs que comienzan con `--- Planificando Mes X / 12 ---`. Confirme que el proceso avanza por los 12 meses (o los meses con datos de ventas) sin detenerse. Busque logs de `Asignación Mes...` y `Pospuesto...` que indican que el motor está funcionando.
2.  **Lógica Diaria:** Al final, el proceso debe entrar en la generación del plan diario. Verá logs como `--- Procesando Plan Diario para Mes X/2025 ---` y `Día X: Procesando...`.

**Criterio de Éxito:** El proceso completo debe terminar, la interfaz debe mostrar los 4 pasos del "wizard" de planificación y la tabla del plan diario debe llenarse con datos correspondientes a los meses cargados, sin que el navegador se congele. El plan debe contener datos para todos los meses que tenían ventas, no solo hasta abril.
