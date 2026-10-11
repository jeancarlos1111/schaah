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
