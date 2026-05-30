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
    - Cada componente debe validar la existencia de sus procesos dependientes (ej: Acolchado para Tapas).
3.  **Lead Time de Componentes**:
    - Se maneja un desfase de 1 día. Los componentes se planifican para estar listos el mismo día o un día antes de la necesidad del forro.
4.  **Gestión de Capacidad Finita (Saturación)**:
    - Si una máquina "HR" se satura (excede el tiempo disponible de la jornada):
        - Se asegura primero el 100% de los componentes para la **Fecha 1 (GYE)**.
        - Se asigna el resto a la **Fecha 2 (Quito)** hasta agotar el tiempo.
        - El sobrante de la Fecha 2 se **desplaza automáticamente al día siguiente**, aprovechando que su fecha de entrega es más lejana.

### 2.3. Cálculo de Tiempos
- El tiempo de fabricación es el **cuello de botella** de la línea o el tiempo asignado al identificador "HR" específico en el maestro.
- Todos los tiempos deben mostrarse con **dos decimales**.
