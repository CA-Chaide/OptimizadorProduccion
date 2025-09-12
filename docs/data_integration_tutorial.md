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

## **Paso 1: Importación y Validación de Datos de Ventas**

**Objetivo:** Asegurar que los datos del presupuesto de ventas se cargan y se transforman correctamente desde la API.

**Acción en la UI:**
1.  Navegue a la sección **"Importar Ventas"**.
2.  Seleccione el año `2025` y el mes `Enero`.
3.  Presione el botón **"Previsualizar"**.

**Qué Observar en la Consola:**
1.  **Consulta a la API:** Busque el log que comienza con `[useApiData] Querying API:`.
    *   Verifique que el objeto `filters` contenga `Año: 2025` y `Mes: 1`.
    *   **Esta es la consulta exacta que puede replicar en Swagger para validar la respuesta de la API.**
2.  **Respuesta de la API:** Busque el log `[useApiData] API Response:`.
    *   Confirme que la respuesta es un arreglo de objetos y no está vacío.
3.  **Transformación de Datos:** Busque el log `[DataImportSection] Mapped data for preview:`.
    *   Verifique que el número de registros coincide con la respuesta de la API.
    *   Inspeccione uno o dos objetos del arreglo y confirme que la estructura coincide con el tipo `SalesDataRow` (ej. `código` normalizado a 8 dígitos, `centro` sin espacios extra, etc.).

**Criterio de Éxito:** La tabla de previsualización en la interfaz se llena con datos y los logs en la consola confirman que la consulta a la API y la transformación de datos son correctas. Solo entonces avanzaremos.

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

## **Paso 3: Generación del Plan - Lógica Mensual**

**Objetivo:** Validar la primera mitad del motor de planificación: el cálculo de necesidades y la asignación de producción a nivel mensual.

**Acción en la UI:**
1.  Navegue a la sección **"Plan de Producción"**.
2.  Presione el botón **"Iniciar Planificación"**.

**Qué Observar en la Consola:**
1.  **Inicio:** Busque el log `--- INICIANDO GENERACIÓN DE PLAN DE PRODUCCIÓN ---`.
2.  **Cálculo de Demanda:** Verifique los logs:
    *   `Paso 3: Demanda de ventas agrupada...`
    *   `Paso 5: Demanda consolidada...` (Aquí se aplican las reglas de aprovisionamiento 'F').
3.  **Cálculo de Necesidades:** Revise el log `Paso 6: Calculadas las necesidades de producción mensuales netas...`.
4.  **Asignaciones Mensuales:** Este es el punto más importante de este paso. Revise los logs `--- Planificando Mes X / 12 ---`.
    *   Por cada mes, verá `Asignación Mes X:` y `Adelanto:`.
    *   Estos logs nos dicen cuántas unidades de un producto se planificaron para fabricar en una línea específica y cuántas se adelantaron de meses futuros.

**Criterio de Éxito:** El proceso debe completar los 12 meses de planificación mensual sin errores. El log `Paso 8: Finalizada la asignación de producción mensual a las líneas.` debe aparecer en la consola.

---

## **Paso 4: Generación del Plan - Secuenciación Diaria**

**Objetivo:** Depurar la lógica más compleja: el desglose diario, la priorización por urgencia y la simulación de inventario.

**Acción en la UI:** Ninguna. Este paso se ejecuta inmediatamente después del Paso 3.

**Qué Observar en la Consola:**
1.  **Inicio del Plan Diario:** Busque el log `--- INICIANDO GENERACIÓN DE PLAN DIARIO ---`.
2.  **Procesamiento por Día:** Verá una secuencia de logs `--- Procesando Plan Diario para Mes X/2025 ---` y `Día X: Procesando...`.
3.  **Lógica de Producción Diaria:** Dentro de cada día, observe los logs:
    *   `Línea [Nombre Línea]: Produce X u de [Producto]. Horas consumidas: Y. Horas restantes hoy: Z.`
    *   Este es el log más importante. Nos dirá si el sistema está tomando decisiones lógicas sobre qué y cuánto producir cada día.
    *   Verifique que las `Horas restantes hoy` disminuyen coherentemente y que las líneas no exceden su capacidad.
4.  **Finalización:** El proceso completo habrá terminado cuando vea en la UI que la carga ha finalizado y la tabla del plan diario se ha llenado de datos.

**Criterio de Éxito:** La ejecución completa los 365 días del año sin entrar en bucles infinitos y sin generar errores en la consola. El plan resultante en la UI es coherente y completo.
