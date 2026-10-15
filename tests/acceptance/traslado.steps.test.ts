import { expect } from 'vitest';
import { describeFeature } from '@amiceli/vitest-cucumber';
import { BloqueHorarioExistente } from '../../src/core/domain/rules/horarioConflictRules';
import { ResultadoValidacionHorario, validarAsignacionHoraria } from '../../src/core/domain/rules/validadorHorarioService';
import { cargarSpec05 } from './spec05';

const feature = await cargarSpec05();

describeFeature(
  feature,
  ({ Rule }) => {
    Rule('Traslado entre sedes territoriales (H-09)', ({ RuleScenario }) => {
      RuleScenario('Bloqueo de teletransportación entre Los Chaguaramos y Aldea La Vega', ({ Given, When, Then, But }) => {
        const sedes = new Map([
          ['Los Chaguaramos', 'sede-chaguaramos'],
          ['Aldea La Vega', 'aldea-la-vega'],
        ]);
        let clase: BloqueHorarioExistente;
        let propuestaBase: Parameters<typeof validarAsignacionHoraria>[0];
        let resultado: ResultadoValidacionHorario;

        Given(
          'el profesor {string} con una clase en {string} el {string} de {string} a {string}',
          (_ctx, profesor: string, sede: string, dia: string, inicio: string, fin: string) => {
            clase = {
              id: 'h-elena',
              seccionId: 'sec-chaguaramos',
              codigoSeccion: 'INF-T1-A',
              profesorId: 'prof-elena',
              profesorNombre: profesor,
              sedeId: sedes.get(sede),
              sedeNombre: sede,
              dia,
              horaInicio: inicio,
              horaFin: fin,
            };
          }
        );

        When(
          'se evalúa asignarle una clase en {string} el mismo {string} de {string} a {string}',
          (_ctx, sede: string, dia: string, inicio: string, fin: string) => {
            propuestaBase = {
              seccionId: 'sec-la-vega',
              profesorId: 'prof-elena',
              sedeId: sedes.get(sede),
              sedeNombre: sede,
              dia,
              horaInicio: inicio,
              horaFin: fin,
            };
            resultado = validarAsignacionHoraria(propuestaBase, [clase]);
          }
        );

        Then(
          'el validador rechaza la asignación por la restricción {string} con una brecha de {int} minutos',
          (_ctx, regla: string, minutos: number) => {
            expect(resultado.esValido).toBe(false);
            expect(resultado.conflictos.map((c) => c.codigoRegla)).toEqual([regla]);
            expect(resultado.conflictos[0].mensaje).toContain(`brecha de ${minutos} minutos`);
            expect(resultado.conflictos[0].mensaje).toContain('90 minutos');
          }
        );

        But(
          'la misma clase de {string} a {string} sí se acepta porque deja {int} minutos de traslado',
          (_ctx, inicio: string, fin: string, minutos: number) => {
            const r = validarAsignacionHoraria({ ...propuestaBase, horaInicio: inicio, horaFin: fin }, [clase]);
            expect(r.esValido).toBe(true);
            const [h, m] = inicio.split(':').map(Number);
            const [hf, mf] = clase.horaFin.split(':').map(Number);
            expect(h * 60 + m - (hf * 60 + mf)).toBe(minutos);
          }
        );
      });
    });
  },
  { includeTags: ['traslado'] }
);
