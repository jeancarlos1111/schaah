import { describe, expect, it } from 'vitest';
import { Turno } from '../../src/core/domain/enums';
import { evaluarSolucion } from '../../src/modules/solver/evaluator';
import { GeneticSolverEngine } from '../../src/modules/solver/geneticEngine';
import { AsignacionBloquePropuesta, SeccionSolverData, SolverInput } from '../../src/modules/solver/types';

const seccion = (id: string, esProyectoComunitario: boolean, grupoId: string | null = null): SeccionSolverData => ({
  id,
  grupoId,
  codigoSeccion: id.toUpperCase(),
  unidadCurricularId: `uc-${id}`,
  nombreMateria: esProyectoComunitario ? 'Proyecto Socio-Integrador I' : 'Algorítmica y Programación',
  sedeId: 'sede',
  profesorId: null,
  turno: Turno.MATUTINO,
  cuposEstimados: 30,
  totalHorasAcademicas: 4,
  bloquesRequeridos: 2,
  tipoEspacioRequerido: esProyectoComunitario ? 'ESPACIO_COMUNITARIO_CAMPO' : 'AULA_TEORICA',
  esProyectoComunitario,
});

const input = (secciones: SeccionSolverData[]): SolverInput => ({
  periodoId: 'p',
  seccionesPendientes: secciones,
  docentes: new Map(),
  espacios: [
    { id: 'aula-1', codigo: 'A1', nombre: 'Aula 1', tipo: 'AULA_TEORICA', capacidad: 40, sedeId: 'sede', activa: true },
    { id: 'campo-1', codigo: 'C1', nombre: 'Campo', tipo: 'ESPACIO_COMUNITARIO_CAMPO', capacidad: 60, sedeId: 'sede', activa: true },
  ],
  horariosExistentes: [],
});

const propuesta = (seccionId: string, espacioFisicoId: string | null): AsignacionBloquePropuesta => ({
  seccionId,
  codigoSeccion: seccionId,
  nombreMateria: seccionId,
  profesorId: null,
  profesorNombre: 'Por Definir',
  espacioFisicoId,
  codigoEspacio: espacioFisicoId ?? 'CAMPO_COMUNITARIO',
  sedeId: 'sede',
  dia: 'MARTES',
  horaInicio: '07:30',
  horaFin: '09:00',
  horaInicio12: '07:30 AM',
  horaFin12: '09:00 AM',
  tipoBloque: 'PROYECTO_COMUNITARIO',
  bloqueIndice: 0,
});

describe('H-08 en el solver: el proyecto comunitario no reserva aula', () => {
  it('el evaluador marca H-08 si una sección de proyecto recibe un espacio físico', () => {
    const ev = evaluarSolucion([propuesta('pc', 'campo-1')], input([seccion('pc', true)]));
    expect(ev.esFactible).toBe(false);
    const h08 = ev.violacionesDuras.find((v) => v.codigoRegla === 'H-08');
    expect(h08?.mensaje).toContain('Proyecto Comunitario');
  });

  it('el evaluador acepta el proyecto sin aula y exige aula a la materia regular', () => {
    const datos = input([seccion('pc', true), seccion('reg', false)]);
    const ev = evaluarSolucion(
      [propuesta('pc', null), { ...propuesta('reg', null), horaInicio: '09:05', horaFin: '10:35', tipoBloque: 'DOCENCIA_AULA' }],
      datos
    );
    const h08 = ev.violacionesDuras.filter((v) => v.codigoRegla === 'H-08');
    expect(h08).toHaveLength(1);
    expect(h08[0].mensaje).toContain('Algorítmica y Programación');
  });

  it('el motor genético calendariza el proyecto sin aula y con tipo PROYECTO_COMUNITARIO', () => {
    const resultado = new GeneticSolverEngine(input([seccion('pc', true, 'g1'), seccion('reg', false, 'g1')]), {
      maxGeneraciones: 15,
      tamanoPoblacion: 10,
    }).resolver();

    const proyecto = resultado.asignaciones.filter((a) => a.seccionId === 'pc');
    const regular = resultado.asignaciones.filter((a) => a.seccionId === 'reg');
    expect(proyecto).toHaveLength(2);
    expect(proyecto.every((a) => a.espacioFisicoId === null && a.tipoBloque === 'PROYECTO_COMUNITARIO')).toBe(true);
    expect(proyecto.every((a) => a.codigoEspacio === 'CAMPO_COMUNITARIO')).toBe(true);
    expect(regular.every((a) => a.espacioFisicoId === 'aula-1')).toBe(true);
    expect(resultado.violacionesDuras).toEqual([]);
  });
});
