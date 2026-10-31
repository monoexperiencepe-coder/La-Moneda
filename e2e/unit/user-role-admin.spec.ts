/**
 * LM-03 — gestión de roles (lógica pura, sin Supabase ni prod).
 */
import { test, expect } from '@playwright/test';
import {
  ROLE_MANAGER_PROFILES,
  OPERATIONAL_ADMIN_ALVARO_SALAS,
  isRoleManagerUserId,
  isProtectedRoleManagerUserId,
} from '../../src/config/roleManagers';
import { precheckAdminRoleChange, mapRoleChangeRpcError } from '../../src/utils/userRoleAdmin';
import { canViewAmountsGlobal } from '../../src/utils/amountPermissions';
import { isAdminRole } from '../../src/utils/roles';

const DIEGO = ROLE_MANAGER_PROFILES.diegoSb.userId;
const ALVARO_SB24 = ROLE_MANAGER_PROFILES.alvaroSb24.userId;
const ALVARO_SALAS = OPERATIONAL_ADMIN_ALVARO_SALAS.userId;
const EDWARD = 'fbbbd594-80bd-434e-9b6e-09757dff95d1';

test('UUID verificados: Diego y Álvaro SB24 son gestores; Salas Velarde no', () => {
  expect(isRoleManagerUserId(DIEGO)).toBe(true);
  expect(isRoleManagerUserId(ALVARO_SB24)).toBe(true);
  expect(isRoleManagerUserId(ALVARO_SALAS)).toBe(false);
  expect(ALVARO_SB24).not.toBe(ALVARO_SALAS);
});

test('A/B: Diego puede cambiar rol de Edward (precheck)', () => {
  const r = precheckAdminRoleChange({
    actorCanManageRoles: true,
    actorUserId: DIEGO,
    targetUserId: EDWARD,
    targetIsActive: true,
    targetCurrentRole: 'contador',
    requestedRole: 'admin',
  });
  expect(r.allowed).toBe(true);
});

test('B: Álvaro SB24 puede cambiar rol de Edward (precheck)', () => {
  const r = precheckAdminRoleChange({
    actorCanManageRoles: true,
    actorUserId: ALVARO_SB24,
    targetUserId: EDWARD,
    targetIsActive: true,
    targetCurrentRole: 'contador',
    requestedRole: 'admin',
  });
  expect(r.allowed).toBe(true);
});

test('C: Álvaro Salas Velarde NO puede cambiar roles (precheck)', () => {
  const r = precheckAdminRoleChange({
    actorCanManageRoles: false,
    actorUserId: ALVARO_SALAS,
    targetUserId: EDWARD,
    targetIsActive: true,
    targetCurrentRole: 'contador',
    requestedRole: 'admin',
  });
  expect(r.allowed).toBe(false);
  if (!r.allowed) expect(r.reason).toBe('not_role_manager');
});

test('D: otro admin operativo NO puede cambiar roles', () => {
  const r = precheckAdminRoleChange({
    actorCanManageRoles: false,
    actorUserId: '00000000-0000-4000-8000-000000000099',
    targetUserId: EDWARD,
    targetIsActive: true,
    targetCurrentRole: 'contador',
    requestedRole: 'admin',
  });
  expect(r.allowed).toBe(false);
});

test('E: usuario no puede cambiar su propio rol', () => {
  const r = precheckAdminRoleChange({
    actorCanManageRoles: true,
    actorUserId: DIEGO,
    targetUserId: DIEGO,
    targetIsActive: true,
    targetCurrentRole: 'admin',
    requestedRole: 'contador',
  });
  expect(r.allowed).toBe(false);
  if (!r.allowed) expect(r.reason).toBe('self_change');
});

test('F: Diego y Álvaro SB24 protegidos contra degradación', () => {
  for (const id of [DIEGO, ALVARO_SB24]) {
    const r = precheckAdminRoleChange({
      actorCanManageRoles: true,
      actorUserId: id === DIEGO ? ALVARO_SB24 : DIEGO,
      targetUserId: id,
      targetIsActive: true,
      targetCurrentRole: 'admin',
      requestedRole: 'contador',
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.reason).toBe('protected_primary_admin');
  }
});

test('G/H: ascenso y descenso contador↔admin permitidos para terceros', () => {
  const up = precheckAdminRoleChange({
    actorCanManageRoles: true,
    actorUserId: DIEGO,
    targetUserId: EDWARD,
    targetIsActive: true,
    targetCurrentRole: 'contador',
    requestedRole: 'admin',
  });
  expect(up.allowed).toBe(true);

  const down = precheckAdminRoleChange({
    actorCanManageRoles: true,
    actorUserId: ALVARO_SB24,
    targetUserId: EDWARD,
    targetIsActive: true,
    targetCurrentRole: 'admin',
    requestedRole: 'contador',
  });
  expect(down.allowed).toBe(true);
});

test('I/J: montos globales admin vs contador', () => {
  expect(canViewAmountsGlobal('admin')).toBe(true);
  expect(canViewAmountsGlobal('contador')).toBe(false);
});

test('admin operativo sigue siendo admin para UI operativa', () => {
  expect(isAdminRole('admin')).toBe(true);
  expect(isRoleManagerUserId(ALVARO_SALAS)).toBe(false);
});

test('mapRoleChangeRpcError — not_role_manager', () => {
  expect(mapRoleChangeRpcError('not_role_manager')).toMatch(/administradores principales/i);
});

test('isProtectedRoleManagerUserId solo Diego y Álvaro SB24', () => {
  expect(isProtectedRoleManagerUserId(DIEGO)).toBe(true);
  expect(isProtectedRoleManagerUserId(ALVARO_SB24)).toBe(true);
  expect(isProtectedRoleManagerUserId(ALVARO_SALAS)).toBe(false);
});
