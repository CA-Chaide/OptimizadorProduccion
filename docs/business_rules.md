# Documentación de Reglas de Negocio y Fuentes de Datos

Este documento detalla la lógica de negocio y las fuentes de datos utilizadas por el Optimizador de Producción para generar los planes de mediano y corto plazo.

## 1. Fuentes de Datos Principales

### 1.1. Tabla: `Presupuesto`
- **Uso:** Proyección de ventas y demanda primaria.
- **Campos:** Año, Mes, CodMaterial, Centro, Unidades.

### 1.2. Tabla: `TiemposEnsamblado`
- **Uso:** Maestro técnico de rutas y tiempos.
- **Regla CRÍTICA:** Identificadores de máquina/puesto inician con **"HR-"**.

### 1.3. Tabla: `Explosión de Materiales (BOM)`
- **Uso:** Identificar los componentes (Tapas, Bandas, Interiores) que integran un producto terminado (Forro).
- **Lógica:** Cada orden de un producto padre dispara automáticamente órdenes sincronizadas para sus componentes hijos.

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
    - La demanda de un Forro genera necesidades automáticas de componentes (Tapas acolchadas, Bandas, Interiores, Bases).
3.  **Gestión de Capacidad y Balanceo Dinámico**:
    - **Jerarquía de Ajuste:**
        1. **Balanceo por Versión de Fabricación:** Si una máquina se satura, el sistema busca versiones alternas (ej. mover de ACH08 a ACH09).
        2. **Arrastre Sincronizado:** Si se cambia la máquina o fecha de un Forro, sus componentes (Tapas, Bandas) se mueven AUTOMÁTICAMENTE para mantener la sincronización.
        3. **Postergación:** Si no hay alternativas, el excedente de Fecha 2 se desplaza al día siguiente.

### 2.3. Sincronización de Procesos (Tapas y Acolchado)
Existe una dependencia técnica estricta entre las máquinas de confección de tapas y las de acolchado:
- **Regla de Sufijo Mandatoria:** La máquina de la Tapa (`HR-PEFXX`) debe coincidir SIEMPRE con el número de la del Acolchado (`HR-ACHXX`).
- **Sincronización por Versión:** Si se cambia la versión de fabricación para mover una orden de `HR-ACH08` a `HR-ACH09`, el proceso de tapas DEBE moverse automáticamente a `HR-PEF09`.
- **Identificadores Válidos:** Los números de máquina (XX) son: **02, 06, 08, 09 y 10**.
- **Asignación por Referencia y Capacidad**:
    - **HR-ACH10, HR-ACH06 y HR-ACH02:** Procesan líneas **Económica, Zafiro, Imperial, Alternativa, Rubí y Premium (Estándar)**.
    - **HR-ACH08 y HR-ACH09:** Procesan líneas de categoría superior como **Continental, Grand Hotel, Ortopédico y Suave Brisa**.
    - **HR-ACH09 (Exclusividad):** Es la única habilitada para **Grand Palace, Escape y Resiflex**.

### 2.4. Proceso de Bandas
1.  **Inicio (Acolchado de Banda):** `HR-ACH11`, `HR-ACH12` o `HR-BO01` (especiales). Medido en **metros** por lotes. Debe cubrir necesidades + stock de seguridad.
2.  **Rematado Inicial:** Puesto **HR-RMTBx**. Medido en **unidades**.
3.  **Procesos Adicionales (en metros):** 
    - **HR-COS3D:** Cocido de banda (adicional para algunas referencias).
    - **HR-ENCBD:** Encintado (adicional para algunas referencias).
4.  **Proceso Final:** Puesto **HR-RMTBm**. Medido en **unidades**.

### 2.5. Proceso de Interiores
1.  **Puestos Iniciales:** `HR-INTPR` o `HR-INTPT` (pegado de banda según referencia). Generan demanda en **HR-ACH11/12**.
2.  **Proceso Final:** Puesto **HR-INTPf** (Integra todas las referencias).

### 2.6. Proceso de Bases (Para cubrir HR-FBASE)
1.  **Tapa Superior (HR-MTBS1):** Cosido de banda a tela no tejida/antideslizante. Genera demanda en **HR-ACH11/12**.
2.  **Tapa con Cierre (HR-MTBS):** Genera demanda de telas (materias primas).

### 2.7. Proceso de Corte de Telas (Cuello de Botella Central)
- **Puestos:** `HR-CTBAN`, `HR-CTBSC`, `HR-CTCHN`, `HR-CTINT`.
- **Configuración Real:** Es una sola máquina operada por una **sola persona** para todos los puestos mencionados.
- **Capacidad:** El tiempo total sumado de todos los cortes no puede exceder **una sola jornada laboral**.
- **Insumos:** Provee cortes para Interiores, Bases y forros específicos (solo tela).

### 2.8. Proceso de Telas y Fundas (Complementos de Forros)
- **Puestos:** `HR-TTCF` (cosido y pegado de falso) y `HR-TTSUP` (cosido de fundas cortadas externamente).
- **Restricción:** Capacidad para **una sola persona** para ambos puestos.
- **Flexibilidad Técnica:** Si `HR-TTSUP` satura la capacidad, la carga de `HR-TTCF` puede derivarse a `HR-INTPf` (mismo proceso técnico).

### 2.9. Gestión de Personal y Flexibilidad de Carga
- **Movilidad:** Personal móvil según saturación.
- **Puestos al 50%:** Permite a un operario cubrir dos estaciones en la misma jornada dividiendo su capacidad (0.5 jornada por puesto).

### 2.10. Cálculo de Tiempos
- El tiempo de fabricación es el **cuello de botella** de la línea.
- Todos los tiempos deben mostrarse con **dos decimales**.
- La eficiencia operativa para el cálculo de capacidad neta es del **84%**.
