import { Turno } from '../enums';

export interface BloqueHorarioOficial {
  numero: number;
  codigo: string;
  horaInicio: string; // Formato 24h '07:30'
  horaFin: string;    // Formato 24h '09:00'
  horaInicio12: string; // '07:30 AM'
  horaFin12: string;    // '09:00 AM'
  turno: Turno;
  label: string; // 'Bloque 1 (07:30 AM - 09:00 AM)'
}

/**
 * Convierte cadena de hora 'HH:mm' (24h) a formato civil venezolano 'hh:mm AM/PM'
 */
export function to12HourFormat(time24: string): string {
  if (!time24 || !time24.includes(':')) return time24;
  const parts = time24.trim().split(':');
  let hours = parseInt(parts[0], 10);
  const minutes = parts[1].padStart(2, '0').slice(0, 2);

  if (isNaN(hours)) return time24;

  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  const formattedHours = hours.toString().padStart(2, '0');
  return `${formattedHours}:${minutes} ${ampm}`;
}

/**
 * Convierte cadena en formato 'hh:mm AM/PM' a 'HH:mm' (24h)
 */
export function to24HourFormat(time12: string): string {
  if (!time12) return time12;
  const clean = time12.trim().toUpperCase();
  const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (!match) return time12;

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = match[3];

  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;

  return `${hours.toString().padStart(2, '0')}:${minutes}`;
}

/**
 * Convierte 'HH:mm' (o 'hh:mm AM/PM') a minutos acumulados desde las 00:00
 */
export function timeToMinutes(time: string): number {
  if (!time) return 0;
  const normalized = time.includes('AM') || time.includes('PM') ? to24HourFormat(time) : time;
  const [h, m] = normalized.split(':').map((v) => parseInt(v, 10));
  return (isNaN(h) ? 0 : h * 60) + (isNaN(m) ? 0 : m);
}

/**
 * Convierte minutos acumulados a 'HH:mm' (24h)
 */
export function minutesToTime24(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/**
 * Fecha y hora local en formato civil venezolano: 'dd/mm/aaaa hh:mm AM/PM'
 */
export function formatearFechaHora12(fecha: Date): string {
  const dos = (n: number) => n.toString().padStart(2, '0');
  const dia = `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()}`;
  return `${dia} ${to12HourFormat(`${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`)}`;
}

/**
 * Determina si dos intervalos de tiempo se solapan en el mismo día
 */
export function rangosSeSolapan(
  inicioA: string,
  finA: string,
  inicioB: string,
  finB: string
): boolean {
  const minInicioA = timeToMinutes(inicioA);
  const minFinA = timeToMinutes(finA);
  const minInicioB = timeToMinutes(inicioB);
  const minFinB = timeToMinutes(finB);

  // Hay solapamiento si uno empieza estrictamente antes de que el otro termine
  return minInicioA < minFinB && minInicioB < minFinA;
}

/**
 * Calcula la brecha en minutos entre el fin de un bloque A y el inicio de un bloque B
 */
export function calcularBrechaMinutos(finA: string, inicioB: string): number {
  return timeToMinutes(inicioB) - timeToMinutes(finA);
}

/**
 * Catálogo canónico de bloques académicos UBV (Sesiones de 90 min = 2 horas académicas)
 */
export const BLOQUES_HORARIOS_OFICIALES: BloqueHorarioOficial[] = [
  {
    numero: 1,
    codigo: '07:30-09:00',
    horaInicio: '07:30',
    horaFin: '09:00',
    horaInicio12: '07:30 AM',
    horaFin12: '09:00 AM',
    turno: Turno.MATUTINO,
    label: 'Bloque 1 (07:30 AM - 09:00 AM)',
  },
  {
    numero: 2,
    codigo: '09:05-10:35',
    horaInicio: '09:05',
    horaFin: '10:35',
    horaInicio12: '09:05 AM',
    horaFin12: '10:35 AM',
    turno: Turno.MATUTINO,
    label: 'Bloque 2 (09:05 AM - 10:35 AM)',
  },
  {
    numero: 3,
    codigo: '10:45-12:15',
    horaInicio: '10:45',
    horaFin: '12:15',
    horaInicio12: '10:45 AM',
    horaFin12: '12:15 PM',
    turno: Turno.MATUTINO,
    label: 'Bloque 3 (10:45 AM - 12:15 PM)',
  },
  {
    numero: 4,
    codigo: '12:30-14:00',
    horaInicio: '12:30',
    horaFin: '14:00',
    horaInicio12: '12:30 PM',
    horaFin12: '02:00 PM',
    turno: Turno.VESPERTINO,
    label: 'Bloque 4 (12:30 PM - 02:00 PM)',
  },
  {
    numero: 5,
    codigo: '14:05-15:35',
    horaInicio: '14:05',
    horaFin: '15:35',
    horaInicio12: '02:05 PM',
    horaFin12: '03:35 PM',
    turno: Turno.VESPERTINO,
    label: 'Bloque 5 (02:05 PM - 03:35 PM)',
  },
  {
    numero: 6,
    codigo: '15:45-17:15',
    horaInicio: '15:45',
    horaFin: '17:15',
    horaInicio12: '03:45 PM',
    horaFin12: '05:15 PM',
    turno: Turno.VESPERTINO,
    label: 'Bloque 6 (03:45 PM - 05:15 PM)',
  },
  {
    numero: 7,
    codigo: '17:30-19:00',
    horaInicio: '17:30',
    horaFin: '19:00',
    horaInicio12: '05:30 PM',
    horaFin12: '07:00 PM',
    turno: Turno.NOCTURNO,
    label: 'Bloque 7 (05:30 PM - 07:00 PM)',
  },
  {
    numero: 8,
    codigo: '19:05-20:35',
    horaInicio: '19:05',
    horaFin: '20:35',
    horaInicio12: '07:05 PM',
    horaFin12: '08:35 PM',
    turno: Turno.NOCTURNO,
    label: 'Bloque 8 (07:05 PM - 08:35 PM)',
  },
];

export interface HoraAcademica40Min {
  numero: number;
  etiquetaRango: string; // '8:00 - 8:40'
  horaInicio: string;    // '08:00'
  horaFin: string;       // '08:40'
  horaInicio12: string;  // '08:00 AM'
  horaFin12: string;     // '08:40 AM'
  turno: Turno;
  bloqueOficialNumero: number; // Bloque de 2h académicas al que pertenece (1..8)
}

/**
 * Grilla oficial UBV Bolívar de horas académicas de 40 minutos:
 * Mañana: 6 horas (8:00 - 12:00) agrupadas en los Bloques 1, 2 y 3.
 * Tarde:  6 horas (1:00 - 5:00) agrupadas en los Bloques 4, 5 y 6.
 * Noche:  4 horas (5:00 - 7:40) agrupadas en los Bloques 7 y 8.
 */
export const HORAS_ACADEMICAS_40MIN: HoraAcademica40Min[] = [
  {
    numero: 1,
    etiquetaRango: '8:00 - 8:40',
    horaInicio: '08:00',
    horaFin: '08:40',
    horaInicio12: '08:00 AM',
    horaFin12: '08:40 AM',
    turno: Turno.MATUTINO,
    bloqueOficialNumero: 1,
  },
  {
    numero: 2,
    etiquetaRango: '8:40 - 9:20',
    horaInicio: '08:40',
    horaFin: '09:20',
    horaInicio12: '08:40 AM',
    horaFin12: '09:20 AM',
    turno: Turno.MATUTINO,
    bloqueOficialNumero: 1,
  },
  {
    numero: 3,
    etiquetaRango: '9:20 - 10:00',
    horaInicio: '09:20',
    horaFin: '10:00',
    horaInicio12: '09:20 AM',
    horaFin12: '10:00 AM',
    turno: Turno.MATUTINO,
    bloqueOficialNumero: 2,
  },
  {
    numero: 4,
    etiquetaRango: '10:00 - 10:40',
    horaInicio: '10:00',
    horaFin: '10:40',
    horaInicio12: '10:00 AM',
    horaFin12: '10:40 AM',
    turno: Turno.MATUTINO,
    bloqueOficialNumero: 2,
  },
  {
    numero: 5,
    etiquetaRango: '10:40 - 11:20',
    horaInicio: '10:40',
    horaFin: '11:20',
    horaInicio12: '10:40 AM',
    horaFin12: '11:20 AM',
    turno: Turno.MATUTINO,
    bloqueOficialNumero: 3,
  },
  {
    numero: 6,
    etiquetaRango: '11:20 - 12:00',
    horaInicio: '11:20',
    horaFin: '12:00',
    horaInicio12: '11:20 AM',
    horaFin12: '12:00 PM',
    turno: Turno.MATUTINO,
    bloqueOficialNumero: 3,
  },
  {
    numero: 7,
    etiquetaRango: '1:00 - 1:40',
    horaInicio: '13:00',
    horaFin: '13:40',
    horaInicio12: '01:00 PM',
    horaFin12: '01:40 PM',
    turno: Turno.VESPERTINO,
    bloqueOficialNumero: 4,
  },
  {
    numero: 8,
    etiquetaRango: '1:40 - 2:20',
    horaInicio: '13:40',
    horaFin: '14:20',
    horaInicio12: '01:40 PM',
    horaFin12: '02:20 PM',
    turno: Turno.VESPERTINO,
    bloqueOficialNumero: 4,
  },
  {
    numero: 9,
    etiquetaRango: '2:20 - 3:00',
    horaInicio: '14:20',
    horaFin: '15:00',
    horaInicio12: '02:20 PM',
    horaFin12: '03:00 PM',
    turno: Turno.VESPERTINO,
    bloqueOficialNumero: 5,
  },
  {
    numero: 10,
    etiquetaRango: '3:00 - 3:40',
    horaInicio: '15:00',
    horaFin: '15:40',
    horaInicio12: '03:00 PM',
    horaFin12: '03:40 PM',
    turno: Turno.VESPERTINO,
    bloqueOficialNumero: 5,
  },
  {
    numero: 11,
    etiquetaRango: '3:40 - 4:20',
    horaInicio: '15:40',
    horaFin: '16:20',
    horaInicio12: '03:40 PM',
    horaFin12: '04:20 PM',
    turno: Turno.VESPERTINO,
    bloqueOficialNumero: 6,
  },
  {
    numero: 12,
    etiquetaRango: '4:20 - 5:00',
    horaInicio: '16:20',
    horaFin: '17:00',
    horaInicio12: '04:20 PM',
    horaFin12: '05:00 PM',
    turno: Turno.VESPERTINO,
    bloqueOficialNumero: 6,
  },
  {
    numero: 13,
    etiquetaRango: '5:00 - 5:40',
    horaInicio: '17:00',
    horaFin: '17:40',
    horaInicio12: '05:00 PM',
    horaFin12: '05:40 PM',
    turno: Turno.NOCTURNO,
    bloqueOficialNumero: 7,
  },
  {
    numero: 14,
    etiquetaRango: '5:40 - 6:20',
    horaInicio: '17:40',
    horaFin: '18:20',
    horaInicio12: '05:40 PM',
    horaFin12: '06:20 PM',
    turno: Turno.NOCTURNO,
    bloqueOficialNumero: 7,
  },
  {
    numero: 15,
    etiquetaRango: '6:20 - 7:00',
    horaInicio: '18:20',
    horaFin: '19:00',
    horaInicio12: '06:20 PM',
    horaFin12: '07:00 PM',
    turno: Turno.NOCTURNO,
    bloqueOficialNumero: 8,
  },
  {
    numero: 16,
    etiquetaRango: '7:00 - 7:40',
    horaInicio: '19:00',
    horaFin: '19:40',
    horaInicio12: '07:00 PM',
    horaFin12: '07:40 PM',
    turno: Turno.NOCTURNO,
    bloqueOficialNumero: 8,
  },
];

export const DIAS_FORMATO_OFICIAL = [
  'LUNES',
  'MARTES',
  'MIERCOLES',
  'JUEVES',
  'VIERNES',
  'SABADO',
  'DOMINGO',
] as const;

export const DIAS_LECTIVOS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];

/**
 * Devuelve las 6 filas de horas académicas de 40 min correspondientes al turno (por defecto MATUTINO: 8:00 - 12:00).
 */
export function obtenerHoras40MinPorTurno(turno: Turno = Turno.MATUTINO): HoraAcademica40Min[] {
  return HORAS_ACADEMICAS_40MIN.filter((h) => h.turno === turno);
}

/**
 * Índices de BLOQUES_HORARIOS_OFICIALES admisibles para un turno.
 * Turno ÚNICA, FIN_DE_SEMANA o sin turno admiten toda la jornada.
 */
export function indicesBloquesPorTurno(turno: string | null | undefined): number[] {
  const mismosTurno = BLOQUES_HORARIOS_OFICIALES
    .map((b, idx) => ({ turno: b.turno, idx }))
    .filter((b) => b.turno === turno)
    .map((b) => b.idx);
  return mismosTurno.length > 0 ? mismosTurno : BLOQUES_HORARIOS_OFICIALES.map((_, idx) => idx);
}

/** Días admisibles para un turno: FIN_DE_SEMANA solo sábado; el resto, lunes a sábado. */
export function diasPorTurno(turno: string | null | undefined): string[] {
  return turno === Turno.FIN_DE_SEMANA ? ['SABADO'] : DIAS_LECTIVOS;
}
