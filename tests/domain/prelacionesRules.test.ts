import { describe, it, expect } from 'vitest';
import { validarReglaPrelacionCurricular } from '../../src/core/domain/rules/curriculoRules';
import {
  validarH07NoSolapamientoPrelacion,
  BloqueHorarioExistente,
  PropuestaBloqueHorario,
} from '../../src/core/domain/rules/horarioConflictRules';
import {
  validarAsignacionHoraria,
} from '../../src/core/domain/rules/validadorHorarioService';

describe('Dominio de Prelaciones Curriculares y Horarias (Spec 09 & Regla H-07)', () => {
  const pfgInformaticaId = 'pfg-inf-001';
  const pfgAgroecologiaId = 'pfg-agro-002';

  describe('RC-07: Integridad Curricular de Prelaciones', () => {
    it('rechaza que una unidad curricular se establezca como prelación de sí misma', () => {
      const ucMatematica1 = {
        id: 'uc-mat-1',
        pfgId: pfgInformaticaId,
        trayecto: 1,
        tramo: 1,
        nombre: 'Matemática I',
      };

      const resultado = validarReglaPrelacionCurricular(ucMatematica1, ucMatematica1);
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('Violación RC-07: Una unidad curricular no puede establecerse como prelación de sí misma');
    });

    it('rechaza prelaciones entre unidades de distintos PFG', () => {
      const ucMatematica = {
        id: 'uc-mat-1',
        pfgId: pfgInformaticaId,
        trayecto: 1,
        tramo: 1,
        nombre: 'Matemática I',
      };
      const ucSuelos = {
        id: 'uc-suelos-1',
        pfgId: pfgAgroecologiaId,
        trayecto: 1,
        tramo: 1,
        nombre: 'Ciencia del Suelo',
      };

      const resultado = validarReglaPrelacionCurricular(ucMatematica, ucSuelos);
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('Violación RC-07: Ambas unidades curriculares deben pertenecer estrictamente al mismo PFG');
    });

    it('rechaza prelación si la materia requisito pertenece a un trayecto o tramo posterior', () => {
      const ucAvanzada = {
        id: 'uc-prog-1',
        pfgId: pfgInformaticaId,
        trayecto: 1,
        tramo: 1,
        nombre: 'Algorítmica y Programación I',
      };
      const ucRequisitoInvalido = {
        id: 'uc-prog-2',
        pfgId: pfgInformaticaId,
        trayecto: 1,
        tramo: 2,
        nombre: 'Algorítmica y Programación II',
      };

      const resultado = validarReglaPrelacionCurricular(ucAvanzada, ucRequisitoInvalido);
      expect(resultado.valido).toBe(false);
      expect(resultado.error).toContain('debe cursarse en un Trayecto/Tramo estrictamente anterior');
    });

    it('aprueba prelación válida entre materias de tramos correlativos del mismo trayecto', () => {
      const ucRequisitoValido = {
        id: 'uc-mat-1',
        pfgId: pfgInformaticaId,
        trayecto: 1,
        tramo: 1,
        nombre: 'Matemática I',
      };
      const ucObjetivo = {
        id: 'uc-mat-2',
        pfgId: pfgInformaticaId,
        trayecto: 1,
        tramo: 2,
        nombre: 'Matemática II',
      };

      const resultado = validarReglaPrelacionCurricular(ucObjetivo, ucRequisitoValido);
      expect(resultado.valido).toBe(true);
      expect(resultado.error).toBeUndefined();
    });

    it('aprueba prelación válida entre materias de trayectos anuales distintos', () => {
      const ucRequisitoTrayecto1 = {
        id: 'uc-prog-1',
        pfgId: pfgInformaticaId,
        trayecto: 1,
        tramo: 2,
        nombre: 'Programación I',
      };
      const ucObjetivoTrayecto2 = {
        id: 'uc-bdd-1',
        pfgId: pfgInformaticaId,
        trayecto: 2,
        tramo: 3,
        nombre: 'Bases de Datos',
      };

      const resultado = validarReglaPrelacionCurricular(ucObjetivoTrayecto2, ucRequisitoTrayecto1);
      expect(resultado.valido).toBe(true);
    });
  });

  describe('H-07: Verificación de Prelación en Horarios', () => {
    const bloquesExistentes: BloqueHorarioExistente[] = [
      {
        id: 'bloque-existente-1',
        seccionId: 'sec-mat-1',
        codigoSeccion: 'SEC-INF-T1-MAT1',
        unidadCurricularId: 'uc-mat-1',
        unidadCurricularNombre: 'Matemática I',
        pfgId: pfgInformaticaId,
        turno: 'MATUTINO',
        dia: 'LUNES',
        horaInicio: '07:30:00',
        horaFin: '09:00:00',
        profesorId: 'prof-001',
        espacioFisicoId: 'aula-101',
      },
    ];

    it('detecta colisión H-07 cuando una propuesta de materia prelada choca en horario con su prerrequisito', () => {
      const propuesta: PropuestaBloqueHorario = {
        seccionId: 'sec-mat-2',
        unidadCurricularId: 'uc-mat-2',
        unidadCurricularNombre: 'Matemática II',
        pfgId: pfgInformaticaId,
        turno: 'MATUTINO',
        prelacionIds: ['uc-mat-1'],
        dia: 'LUNES',
        horaInicio: '08:15:00',
        horaFin: '09:45:00', // Solapa con 07:30 - 09:00
      };

      const resultado = validarH07NoSolapamientoPrelacion(propuesta, bloquesExistentes);
      expect(resultado.valido).toBe(false);
      expect(resultado.codigoRegla).toBe('H-07');
      expect(resultado.mensaje).toContain('Colisión con unidad curricular de prelación directa');
      expect(resultado.mensaje).toContain('Matemática I');
    });

    it('permite asignación si la propuesta y el prerrequisito ocurren en horarios distintos sin solape', () => {
      const propuestaSinSolape: PropuestaBloqueHorario = {
        seccionId: 'sec-mat-2',
        unidadCurricularId: 'uc-mat-2',
        unidadCurricularNombre: 'Matemática II',
        pfgId: pfgInformaticaId,
        turno: 'MATUTINO',
        prelacionIds: ['uc-mat-1'],
        dia: 'LUNES',
        horaInicio: '09:15:00',
        horaFin: '10:45:00', // Posterior a las 09:00
      };

      const resultado = validarH07NoSolapamientoPrelacion(propuestaSinSolape, bloquesExistentes);
      expect(resultado.valido).toBe(true);
      expect(resultado.codigoRegla).toBe('H-07');
    });

    it('permite asignación si la propuesta ocurre en un día diferente al prerrequisito', () => {
      const propuestaOtroDia: PropuestaBloqueHorario = {
        seccionId: 'sec-mat-2',
        unidadCurricularId: 'uc-mat-2',
        unidadCurricularNombre: 'Matemática II',
        pfgId: pfgInformaticaId,
        turno: 'MATUTINO',
        prelacionIds: ['uc-mat-1'],
        dia: 'MARTES',
        horaInicio: '07:30:00',
        horaFin: '09:00:00',
      };

      const resultado = validarH07NoSolapamientoPrelacion(propuestaOtroDia, bloquesExistentes);
      expect(resultado.valido).toBe(true);
    });

    it('permite asignación si pertenecen a turnos distintos (ej. MATUTINO vs NOCTURNO)', () => {
      const propuestaTurnoNocturno: PropuestaBloqueHorario = {
        seccionId: 'sec-mat-2-noc',
        unidadCurricularId: 'uc-mat-2',
        unidadCurricularNombre: 'Matemática II',
        pfgId: pfgInformaticaId,
        turno: 'NOCTURNO',
        prelacionIds: ['uc-mat-1'],
        dia: 'LUNES',
        horaInicio: '07:30:00', // hora teórica de prueba
        horaFin: '09:00:00',
      };

      const resultado = validarH07NoSolapamientoPrelacion(propuestaTurnoNocturno, bloquesExistentes);
      expect(resultado.valido).toBe(true);
    });

    it('integra la regla H-07 en el orquestador general validarAsignacionHoraria', () => {
      const propuestaConflicto: any = {
        seccionId: 'sec-mat-2',
        unidadCurricularId: 'uc-mat-2',
        unidadCurricularNombre: 'Matemática II',
        pfgId: pfgInformaticaId,
        turno: 'MATUTINO',
        prelacionIds: ['uc-mat-1'],
        dia: 'LUNES',
        horaInicio: '07:30:00',
        horaFin: '09:00:00',
        profesorId: 'prof-otro-999',
        espacioFisicoId: 'aula-otra-202',
        sedeId: 'sede-principal',
      };

      const res = validarAsignacionHoraria(propuestaConflicto, bloquesExistentes);
      expect(res.esValido).toBe(false);
      const reglaH07 = res.conflictos.find((c) => c.codigoRegla === 'H-07');
      expect(reglaH07).toBeDefined();
      expect(reglaH07?.mensaje).toContain('Colisión con unidad curricular de prelación directa');
    });
  });
});
