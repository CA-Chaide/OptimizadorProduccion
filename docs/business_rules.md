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
3.  **Lead Time de Componentes**:
    - Se maneja un desfase de 1 día. Los componentes se planifican para estar listos el mismo día o un día antes de la necesidad del forro.
4.  **Gestión de Capacidad y Balanceo**:
    - Si una máquina se satura, el sistema aplica la siguiente jerarquía:
        1. **Balanceo por Versión de Fabricación:** Si el material tiene una versión alterna (ej. V2) habilitada en otra máquina con disponibilidad, se mueve la orden a esa máquina.
        2. **Postergación:** Si no hay versiones alternas o todas las máquinas compatibles están llenas, el excedente de la Fecha 2 (Quito) se desplaza al día siguiente.

### 2.3. Sincronización de Procesos (Tapas y Acolchado)
Existe una dependencia técnica estricta entre las máquinas de confección de tapas y las de acolchado:
- **Regla de Sufijo:** La máquina de la Tapa (`HR-PEFXX`) debe coincidir con la del Acolchado (`HR-ACHXX`).
- **Sincronización por Versión:** Si se cambia la versión de fabricación para mover una orden de `HR-ACH08` a `HR-ACH09`, el proceso de tapas DEBE moverse automáticamente a `HR-PEF09`.
- **Identificadores Válidos:** Los números de máquina (XX) son: **02, 06, 08, 09 y 10**.
- **Asignación por Referencia y Capacidad**:
    - **HR-ACH10, HR-ACH06 y HR-ACH02:** Procesan líneas **Económica, Zafiro, Imperial, Alternativa, Rubí y Premium (Estándar)**.
    - **HR-ACH08 y HR-ACH09:** Procesan líneas de categoría superior como **Continental, Grand Hotel, Ortopédico y Suave Brisa**.
    - **HR-ACH09 (Exclusividad):** Es la única habilitada para **Grand Palace, Escape y Resiflex**.

### 2.4. Proceso de Bandas
1.  **Inicio (Acolchado de Banda):** `HR-ACH11`, `HR-ACH12` o `HR-BO01` (especiales). Medido en **metros**.
2.  **Rematado:** Puesto **HR-RMTBx**. Medido en **unidades**.
3.  **Procesos Adicionales (en metros):** 
    - **HR-COS3D:** Cocido de banda.
    - **HR-ENCBD:** Encintado.
4.  **Proceso Final (en unidades):** Puesto **HR-RMTBm**.

### 2.5. Proceso de Interiores
1.  **Puestos Iniciales:** `HR-INTPR` o `HR-INTPT` (pegado de banda). Generan demanda en **HR-ACH11/12**.
2.  **Proceso Final:** Puesto **HR-INTPf** (Integra todas las referencias).

### 2.6. Proceso de Bases (HR-FBASE)
1.  **Tapa Superior (HR-MTBS1):** Cosido de banda. Genera demanda en **HR-ACH11/12**.
2.  **Tapa con Cierre (HR-MTBS):** Genera demanda de telas.

### 2.7. Proceso de Corte de Telas
- **Puestos:** `HR-CTBAN`, `HR-CTBSC`, `HR-CTCHN`, `HR-CTINT`.
- **Capacidad:** Ajustada a **una sola jornada laboral** total.

### 2.8. Proceso de Telas y Fundas (Complementos de Forros)
- **Puestos:** `HR-TTCF` y `HR-TTSUP`.
- **Restricción:** Capacidad para **una sola persona**.
- **Flexibilidad:** Excedente de `HR-TTCF` puede enviarse a `HR-INTPf`.

### 2.9. Gestión de Personal y Flexibilidad de Carga
- **Movilidad:** Personal móvil según saturación.
- **Puestos al 50%:** Permite a un operario cubrir dos estaciones en la misma jornada.

### 2.10. Cálculo de Tiempos
- El tiempo de fabricación es el **cuello de botella** de la línea.
- Todos los tiempos deben mostrarse con **dos decimales**.