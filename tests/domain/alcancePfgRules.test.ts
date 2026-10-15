import { describe, expect, it } from 'vitest';
import { RolUsuario } from '../../src/core/domain/enums';
import {
  alcanceDeUsuario,
  filtrarProgramasPermitidos,
  filtroPfg,
  filtroPfgEfectivo,
  pfgVisible,
  puedeGestionarPfg,
  resolverProgramasCoordinador,
} from '../../src/core/domain/rules/alcancePfgRules';

const INFO = 'pfg-info';
const ARQ = 'pfg-arq';
const AGRO = 'pfg-agro';

describe('Alcance por programa (Spec 06, "Su PFG")', () => {
  it('administrador y director no se restringen por programa', () => {
    for (const rol of [RolUsuario.ADMINISTRADOR, RolUsuario.DIRECTOR_ACADEMICO]) {
      const alcance = alcanceDeUsuario(rol, [INFO]);
      expect(alcance.total).toBe(true);
      expect(puedeGestionarPfg(alcance, ARQ)).toBe(true);
      expect(filtroPfg(alcance)).toBeUndefined();
    }
  });

  it('el coordinador solo gestiona sus programas, sin duplicados', () => {
    const alcance = alcanceDeUsuario(RolUsuario.COORDINADOR_PFG, [INFO, AGRO, INFO, '']);
    expect(alcance).toEqual({ total: false, pfgIds: [INFO, AGRO] });
    expect(puedeGestionarPfg(alcance, INFO)).toBe(true);
    expect(puedeGestionarPfg(alcance, ARQ)).toBe(false);
    expect(puedeGestionarPfg(alcance, null)).toBe(false);
    expect(filtroPfg(alcance)).toEqual({ in: [INFO, AGRO] });
  });

  it('un coordinador sin programas asignados no ve ni gestiona nada', () => {
    const alcance = alcanceDeUsuario(RolUsuario.COORDINADOR_PFG, []);
    expect(puedeGestionarPfg(alcance, INFO)).toBe(false);
    expect(filtroPfg(alcance)).toEqual({ in: [] });
    expect(pfgVisible(alcance, INFO, [INFO, ARQ])).toBeUndefined();
  });

  it('filtro efectivo: respeta el programa pedido si es suyo y si no, limita a los suyos', () => {
    const coord = alcanceDeUsuario(RolUsuario.COORDINADOR_PFG, [INFO, AGRO]);
    expect(filtroPfgEfectivo(coord, AGRO)).toBe(AGRO);
    expect(filtroPfgEfectivo(coord, ARQ)).toEqual({ in: [INFO, AGRO] });
    expect(filtroPfgEfectivo(coord, undefined)).toEqual({ in: [INFO, AGRO] });

    const admin = alcanceDeUsuario(RolUsuario.ADMINISTRADOR, []);
    expect(filtroPfgEfectivo(admin, ARQ)).toBe(ARQ);
    expect(filtroPfgEfectivo(admin, '')).toBeUndefined();
  });

  it('programa visible: un PFG ajeno en la URL se reemplaza por el primero permitido', () => {
    const coord = alcanceDeUsuario(RolUsuario.COORDINADOR_PFG, [INFO]);
    expect(pfgVisible(coord, ARQ, [ARQ, INFO])).toBe(INFO);
    expect(pfgVisible(coord, INFO, [ARQ, INFO])).toBe(INFO);
    expect(pfgVisible(coord, undefined, [ARQ, INFO])).toBe(INFO);

    const admin = alcanceDeUsuario(RolUsuario.ADMINISTRADOR, []);
    expect(pfgVisible(admin, INFO, [ARQ, INFO])).toBe(INFO);
    expect(pfgVisible(admin, 'inexistente', [ARQ, INFO])).toBe(ARQ);
  });

  it('exige al menos un programa al coordinador y descarta vínculos de otros roles', () => {
    expect(resolverProgramasCoordinador(RolUsuario.COORDINADOR_PFG, [INFO, ' ', INFO, AGRO])).toEqual({
      valido: true,
      pfgIds: [INFO, AGRO],
    });
    expect(resolverProgramasCoordinador(RolUsuario.COORDINADOR_PFG, INFO)).toEqual({ valido: true, pfgIds: [INFO] });
    const sinProgramas = resolverProgramasCoordinador(RolUsuario.COORDINADOR_PFG, undefined);
    expect(sinProgramas.valido).toBe(false);
    if (!sinProgramas.valido) expect(sinProgramas.error).toContain('al menos un programa');
    expect(resolverProgramasCoordinador(RolUsuario.DIRECTOR_ACADEMICO, [INFO])).toEqual({ valido: true, pfgIds: [] });
  });

  it('filtra catálogos de programas según el alcance', () => {
    const programas = [{ id: ARQ, codigo: 'ARQ' }, { id: INFO, codigo: 'PFG-INFO' }];
    expect(filtrarProgramasPermitidos(alcanceDeUsuario(RolUsuario.COORDINADOR_PFG, [INFO]), programas)).toEqual([
      { id: INFO, codigo: 'PFG-INFO' },
    ]);
    expect(filtrarProgramasPermitidos(alcanceDeUsuario(RolUsuario.DIRECTOR_ACADEMICO, []), programas)).toHaveLength(2);
  });
});
