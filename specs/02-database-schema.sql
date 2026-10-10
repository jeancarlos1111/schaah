-- Spec 2: Esquema Relacional de Base de Datos PostgreSQL
-- Sistema de Carga Horaria y Asignación Automática de Horarios (SCHAAH - UBV)
-- Cumple con PostgreSQL 15+

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- ============================================================================
-- 1. TIPOS Y ENUMERACIONES
-- ============================================================================

CREATE TYPE dedicacion_docente_enum AS ENUM (
    'DEDICACION_EXCLUSIVA', -- 36-40h perm / 12-16h doc
    'TIEMPO_COMPLETO',     -- 30-36h perm / 8-12h doc
    'MEDIO_TIEMPO',        -- 18-20h perm / 4-8h doc
    'TIEMPO_CONVENCIONAL'  -- 2-12h perm / 2-12h doc
);

CREATE TYPE escalafon_docente_enum AS ENUM (
    'INSTRUCTOR',
    'ASISTENTE',
    'AGREGADO',
    'ASOCIADO',
    'TITULAR',
    'CONTRATADO'
);

CREATE TYPE condicion_laboral_enum AS ENUM (
    'ORDINARIO',
    'CONTRATADO',
    'JUBILADO_ACTIVO',
    'COMISION_SERVICIO'
);

CREATE TYPE tipo_espacio_enum AS ENUM (
    'AULA_TEORICA',
    'LABORATORIO_INFORMATICA',
    'LABORATORIO_CIENCIAS',
    'TALLER',
    'AUDITORIO',
    'ESPACIO_COMUNITARIO_CAMPO' -- No requiere aula física interna
);

CREATE TYPE dia_semana_enum AS ENUM (
    'LUNES',
    'MARTES',
    'MIERCOLES',
    'JUEVES',
    'VIERNES',
    'SABADO',
    'DOMINGO'
);

CREATE TYPE turno_enum AS ENUM (
    'MATUTINO',
    'VESPERTINO',
    'NOCTURNO',
    'FIN_DE_SEMANA'
);

CREATE TYPE estado_asignacion_enum AS ENUM (
    'BORRADOR',
    'EN_OPTIMIZACION',
    'PRELIMINAR',
    'APROBADO_CONSEJO',
    'PUBLICADO'
);

CREATE TYPE tipo_bloque_academico_enum AS ENUM (
    'DOCENCIA_AULA',
    'PROYECTO_COMUNITARIO',
    'ASESORIA_TUTORIA',
    'INVESTIGACION',
    'GESTION_ACADEMICA'
);

-- ============================================================================
-- 2. INFRAESTRUCTURA Y ESTRUCTURA TERRITORIAL
-- ============================================================================

CREATE TABLE sedes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    eje_territorial VARCHAR(100) NOT NULL,
    direccion TEXT,
    es_aldea_municipalizada BOOLEAN NOT NULL DEFAULT FALSE,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE espacios_fisicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sede_id UUID NOT NULL REFERENCES sedes(id) ON DELETE CASCADE,
    codigo VARCHAR(30) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    tipo tipo_espacio_enum NOT NULL DEFAULT 'AULA_TEORICA',
    capacidad INT NOT NULL CHECK (capacidad > 0),
    piso VARCHAR(20),
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_espacio_por_sede UNIQUE (sede_id, codigo)
);

-- ============================================================================
-- 3. GESTIÓN ACADÉMICA Y CURRICULAR (PFG / TRAYECTOS / UC)
-- ============================================================================

CREATE TABLE programas_formacion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(20) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    area_conocimiento VARCHAR(100) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE periodos_academicos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo VARCHAR(30) NOT NULL UNIQUE, -- Ej: 2026-I, 2026-II
    nombre VARCHAR(100) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado estado_asignacion_enum NOT NULL DEFAULT 'BORRADOR',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_fechas_periodo CHECK (fecha_fin > fecha_inicio)
);

CREATE TABLE unidades_curriculares (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pfg_id UUID NOT NULL REFERENCES programas_formacion(id) ON DELETE RESTRICT,
    codigo VARCHAR(30) NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    trayecto INT NOT NULL CHECK (trayecto BETWEEN 1 AND 5),
    tramo INT NOT NULL CHECK (tramo BETWEEN 1 AND 3),
    creditos INT NOT NULL CHECK (creditos > 0),
    horas_teoricas_semanales INT NOT NULL DEFAULT 0,
    horas_practicas_semanales INT NOT NULL DEFAULT 0,
    horas_campo_comunitario_semanales INT NOT NULL DEFAULT 0,
    horas_totales_semanales INT GENERATED ALWAYS AS (
        horas_teoricas_semanales + horas_practicas_semanales + horas_campo_comunitario_semanales
    ) STORED,
    tipo_espacio_requerido tipo_espacio_enum NOT NULL DEFAULT 'AULA_TEORICA',
    es_proyecto_comunitario BOOLEAN NOT NULL DEFAULT FALSE,
    activa BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_uc_codigo_pfg UNIQUE (pfg_id, codigo),
    CONSTRAINT ck_horas_minimas CHECK (
        (horas_teoricas_semanales + horas_practicas_semanales + horas_campo_comunitario_semanales) > 0
    )
);

-- ============================================================================
-- 4. PERSONAL DOCENTE Y DISPONIBILIDAD
-- ============================================================================

CREATE TABLE profesores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cedula VARCHAR(20) NOT NULL UNIQUE,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    email VARCHAR(120) NOT NULL UNIQUE,
    telefono VARCHAR(30),
    condicion condicion_laboral_enum NOT NULL DEFAULT 'ORDINARIO',
    escalafon escalafon_docente_enum NOT NULL DEFAULT 'INSTRUCTOR',
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Contrato y asignación de dedicación específica por período académico
CREATE TABLE profesor_dedicaciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profesor_id UUID NOT NULL REFERENCES profesores(id) ON DELETE RESTRICT,
    periodo_id UUID NOT NULL REFERENCES periodos_academicos(id) ON DELETE RESTRICT,
    dedicacion dedicacion_docente_enum NOT NULL,
    horas_permanencia_semanales INT NOT NULL,
    min_horas_docencia_directa INT NOT NULL,
    max_horas_docencia_directa INT NOT NULL,
    sede_adscripcion_principal_id UUID NOT NULL REFERENCES sedes(id),
    observacion_excepcion TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_profesor_periodo UNIQUE (profesor_id, periodo_id),
    CONSTRAINT ck_limites_docencia CHECK (
        max_horas_docencia_directa >= min_horas_docencia_directa AND
        horas_permanencia_semanales >= max_horas_docencia_directa
    )
);

-- Franjas de disponibilidad semanal por docente
CREATE TABLE profesor_disponibilidades (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profesor_id UUID NOT NULL REFERENCES profesores(id) ON DELETE CASCADE,
    periodo_id UUID NOT NULL REFERENCES periodos_academicos(id) ON DELETE CASCADE,
    dia dia_semana_enum NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    prioridad_preferencia INT NOT NULL DEFAULT 1 CHECK (prioridad_preferencia BETWEEN 1 AND 5), -- 1: Óptima, 5: Aceptable pero no deseada
    disponible BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT ck_disponibilidad_horas CHECK (hora_fin > hora_inicio)
);

-- ============================================================================
-- 5. OFERTA ACADÉMICA Y SECCIONES
-- ============================================================================

CREATE TABLE secciones (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    periodo_id UUID NOT NULL REFERENCES periodos_academicos(id) ON DELETE RESTRICT,
    unidad_curricular_id UUID NOT NULL REFERENCES unidades_curriculares(id) ON DELETE RESTRICT,
    sede_id UUID NOT NULL REFERENCES sedes(id) ON DELETE RESTRICT,
    profesor_id UUID REFERENCES profesores(id) ON DELETE SET NULL,
    codigo_seccion VARCHAR(30) NOT NULL, -- Ej: INF-T2-01D
    turno turno_enum NOT NULL DEFAULT 'MATUTINO',
    cupos_estimados INT NOT NULL CHECK (cupos_estimados > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_seccion_codigo_periodo UNIQUE (periodo_id, codigo_seccion)
);

-- ============================================================================
-- 6. ASIGNACIONES HORARIAS (TABLA CENTRAL CON EXCLUSIONES FÍSICAS)
-- ============================================================================

CREATE TABLE horarios_seccion (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seccion_id UUID NOT NULL REFERENCES secciones(id) ON DELETE CASCADE,
    espacio_fisico_id UUID REFERENCES espacios_fisicos(id) ON DELETE RESTRICT, -- NULL si es campo comunitario
    dia dia_semana_enum NOT NULL,
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    tipo_bloque tipo_bloque_academico_enum NOT NULL DEFAULT 'DOCENCIA_AULA',
    rango_tiempo tsrange GENERATED ALWAYS AS (
        tsrange(
            ('2000-01-01 ' || hora_inicio::text)::timestamp,
            ('2000-01-01 ' || hora_fin::text)::timestamp,
            '[)'
        )
    ) STORED,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ck_horario_valido CHECK (hora_fin > hora_inicio),
    
    -- Restricción H-02 nativa: Cero solapamiento de aula en mismo día y rango
    CONSTRAINT no_solapamiento_aula EXCLUDE USING gist (
        espacio_fisico_id WITH =,
        dia WITH =,
        rango_tiempo WITH &&
    ) WHERE (espacio_fisico_id IS NOT NULL),

    -- Restricción H-03 nativa: Cero solapamiento de la misma sección en mismo día y rango
    CONSTRAINT no_solapamiento_seccion EXCLUDE USING gist (
        seccion_id WITH =,
        dia WITH =,
        rango_tiempo WITH &&
    )
);

-- ============================================================================
-- 7. AUDITORÍA Y AJUSTES MANUALES
-- ============================================================================

CREATE TABLE auditoria_ajustes_horarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    periodo_id UUID NOT NULL REFERENCES periodos_academicos(id),
    seccion_id UUID NOT NULL REFERENCES secciones(id),
    horario_seccion_id UUID,
    usuario_responsable VARCHAR(100) NOT NULL,
    tipo_operacion VARCHAR(30) NOT NULL, -- INSERT, UPDATE, DELETE, OVERRIDE_SOLVER
    datos_anteriores JSONB,
    datos_nuevos JSONB,
    justificacion_resolucion TEXT,
    fecha_ajuste TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. VISTA DE CONSOLIDACIÓN DE CARGA DOCENTE (VALIDADOR H-04 / H-05)
-- ============================================================================

CREATE OR REPLACE VIEW vista_consolidado_carga_docente AS
SELECT 
    p.id AS profesor_id,
    p.cedula,
    p.nombres || ' ' || p.apellidos AS nombre_completo,
    pd.periodo_id,
    pd.dedicacion,
    pd.horas_permanencia_semanales,
    pd.min_horas_docencia_directa,
    pd.max_horas_docencia_directa,
    COALESCE(SUM(
        EXTRACT(EPOCH FROM (hs.hora_fin - hs.hora_inicio)) / 3600
    ), 0)::NUMERIC(5,2) AS horas_docencia_asignadas,
    COUNT(DISTINCT s.id) AS total_secciones,
    CASE 
        WHEN COALESCE(SUM(EXTRACT(EPOCH FROM (hs.hora_fin - hs.hora_inicio)) / 3600), 0) > pd.max_horas_docencia_directa 
            THEN 'SOBRECARGA_LEGAL'
        WHEN COALESCE(SUM(EXTRACT(EPOCH FROM (hs.hora_fin - hs.hora_inicio)) / 3600), 0) < pd.min_horas_docencia_directa 
            THEN 'DEFICIT_CARGA'
        ELSE 'EN_NORMA'
    END AS estado_normativo
FROM profesores p
JOIN profesor_dedicaciones pd ON p.id = pd.profesor_id
LEFT JOIN secciones s ON p.id = s.profesor_id AND s.periodo_id = pd.periodo_id
LEFT JOIN horarios_seccion hs ON s.id = hs.seccion_id AND hs.tipo_bloque = 'DOCENCIA_AULA'
GROUP BY p.id, p.cedula, p.nombres, p.apellidos, pd.periodo_id, pd.dedicacion, 
         pd.horas_permanencia_semanales, pd.min_horas_docencia_directa, pd.max_horas_docencia_directa;

-- ============================================================================
-- 9. ÍNDICES DE RENDIMIENTO
-- ============================================================================

CREATE INDEX idx_horarios_seccion_seccion ON horarios_seccion(seccion_id);
CREATE INDEX idx_horarios_seccion_espacio ON horarios_seccion(espacio_fisico_id);
CREATE INDEX idx_secciones_periodo_profesor ON secciones(periodo_id, profesor_id);
CREATE INDEX idx_disponibilidad_profesor_periodo ON profesor_disponibilidades(profesor_id, periodo_id);
