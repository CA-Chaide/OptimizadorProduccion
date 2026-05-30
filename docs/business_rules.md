# Documentación de Reglas de Negocio y Fuentes de Datos

Este documento detalla la lógica de negocio y las fuentes de datos utilizadas por el Optimizador de Producción para generar los planes de mediano y corto plazo.

## 1. Fuentes de Datos Principales

### 1.1. Tabla: `Presupuesto`
- **Uso:** Proyección de ventas y demanda primaria.
- **Campos:** Año, Mes, CodMaterial, Centro, Unidades.

### 1.2. Tabla: `TiemposEnsamblado`
- **Uso:** Maestro técnico de rutas y tiempos.
- **Regla CRÍTICA:** Identificadores de máquina/puesto inician con **"HR-"**.

---

## 2. Lógica del Motor de Planificación

### 2.1. Reglas de Aprovisionamiento (`ClaseAprovisionamiento`)
- **'E' (In-house):** Fabricación en el centro de demanda.
- **'F' (Fabricación Centralizada):** Fabricación obligatoria en Centro 1000 (Quito) con transferencia a destino.
- **'X' (Flexible):** Prioriza fabricación local si hay capacidad.

### 2.2. Planificación Táctica (Corto Plazo - Pull System)
Esta lógica rige la generación automática de la "Programación Componentes":

1.  **Prioridad por Destino y Fecha**:
    - **Fecha 1 (Cercana):** Destino **GYE**. Tiene prioridad absoluta sobre los recursos (tiempos de máquina).
    - **Fecha 2 (Lejana):** Destino **Quito**. Se planifica con la capacidad remanente.
2.  **Explosión de Materiales (BOM)**:
    - La demanda de un Forro genera necesidades automáticas de componentes (Tapas acolchadas, Bandas, Interiores).
    - Cada componente debe validar la existencia de sus procesos dependientes.
3.  **Lead Time de Componentes**:
    - Se maneja un desfase de 1 día. Los componentes se planifican para estar listos el mismo día o un día antes de la necesidad del forro.
4.  **Gestión de Capacidad Finita (Saturación)**:
    - Si una máquina "HR" se satura:
        - Se asegura primero el 100% de los componentes para la **Fecha 1 (GYE)**.
        - Se asigna el resto a la **Fecha 2 (Quito)** hasta agotar el tiempo.
        - El sobrante de la Fecha 2 se **desplaza automáticamente al día siguiente**.

### 2.3. Sincronización de Procesos (Tapas y Acolchado)
Existe una dependencia técnica estricta entre las máquinas de confección de tapas y las de acolchado:
- **Regla de Sufijo:** La máquina de la Tapa (`HR-PEFXX`) debe coincidir con la del Acolchado (`HR-ACHXX`).
- **Identificadores Válidos:** Los números de máquina (XX) son: **02, 06, 08, 09 y 10**.
- **Sincronización de Fechas:** Ambos procesos (Tapa y Acolchado) deben planificarse para la **mismo fecha**.
- **Cuello de Botella Técnico:** El ajuste de capacidad se realiza sobre las acolchadoras (`HR-ACHXX`). Las máquinas de tapas (`HR-PEFXX`) tienen capacidad adicional para cubrir cualquier exceso generado por el acolchado.

### 2.4. Proceso de Bandas
Las bandas siguen un flujo de producción específico por lotes:
1.  **Inicio (Acolchado de Banda):** Se realiza en `HR-ACH11`, `HR-ACH12` o la máquina especial `HR-BO01`.
2.  **Unidad de Medida (Acolchado):** La producción en acolchado se mide en **metros**.
3.  **Lógica de Necesidad:** La cantidad a producir debe cubrir la **Necesidad Neta** (Órdenes de Forros) + el **Stock de Seguridad**.
4.  **Rematado:** Proceso subsiguiente en máquinas **HR-RMTBx**. Se mide en **unidades**.
5.  **Procesos Adicionales (en metros):** 
    - Referencias que salen de `HR-ACH11/12` pueden requerir cocido de banda en **HR-COS3D**.
    - Referencias específicas requieren encintado en el puesto **HR-ENCBD**.
6.  **Proceso Final (en unidades):**
    - Referencias específicas requieren el puesto **HR-RMTBm** como paso final del componente.

### 2.5. Proceso de Interiores
Los interiores siguen un flujo de pegado e integración final:
1.  **Puestos Iniciales:** Se procesan en `HR-INTPR` o `HR-INTPT` (la diferencia es la referencia, el proceso de pegado de banda en tela no tejida es idéntico).
2.  **Proceso Final:** El paso siguiente que integra todas las referencias de los puestos iniciales es el puesto **HR-INTPf** (Interior Final).
3.  **Dependencia Transversal:** Los procesos iniciales generan automáticamente demanda de bandas acolchadas en las máquinas **HR-ACH11** y **HR-ACH12**.

### 2.6. Cálculo de Tiempos
- El tiempo de fabricación es el **cuello de botella** de la línea o el tiempo asignado al identificador "HR" específico en el maestro.
- Todos los tiempos deben mostrarse con **dos decimales**.
