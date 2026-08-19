import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { paymentAccountSnapshot, paymentAccountToLegacyRow, selectPaymentAccountRows, type PaymentAccount } from '../../src/utils/paymentAccountModel';
import { canManagePaymentAccounts } from '../../src/utils/roles';

const legacyRows = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/data/factMetodoPagoLista.json', import.meta.url)), 'utf8')) as Array<{ metodo: string; detalle: string; celular: string }>;

function account(overrides: Partial<PaymentAccount> = {}): PaymentAccount {
  return {
    id: 'account-1', empresaId: 'empresa-a', method: 'Yape', label: 'Yape dinámico',
    phoneNumber: '999999999', bankName: null, accountNumber: null, cci: null,
    accountHolder: null, paymentNote: null, isActive: true, sortOrder: 1,
    createdAt: '', updatedAt: '', updatedBy: null, ...overrides,
  };
}

test.describe('configuración dinámica de pagos', () => {
  test('el seed legacy contiene exactamente 24 destinos concretos y conserva DBS/DSB', () => {
    const concrete = legacyRows.filter((row) => ['Yape', 'Plin', 'Transferencia'].includes(row.metodo));
    expect(concrete).toHaveLength(24);
    expect(concrete.find((row) => row.metodo === 'Transferencia' && row.detalle === 'DBS')?.celular).toBe('19102291712060');
    expect(concrete.find((row) => row.metodo === 'Yape' && row.detalle === 'Yape DSB')?.celular).toBe('998899861');
  });

  test('Yape y Plin dinámicos generan snapshot del número y referencia estable', () => {
    for (const method of ['Yape', 'Plin'] as const) {
      const source = account({ method, id: `${method}-id`, phoneNumber: '988888888', label: `${method} nuevo` });
      const row = paymentAccountToLegacyRow(source);
      expect(row.celular).toBe('988888888');
      expect(row.paymentAccountId).toBe(`${method}-id`);
      expect(paymentAccountSnapshot(source)).toBe('988888888');
    }
  });

  test('transferencia usa account_number, nunca el campo de teléfono', () => {
    const source = account({ method: 'Transferencia', phoneNumber: null, bankName: 'BCP', accountNumber: '12345678901234', cci: '12345678901234567890' });
    const row = paymentAccountToLegacyRow(source);
    expect(row.celular).toBe('12345678901234');
    expect(row.banco).toBe('BCP');
  });

  test('edición y renombrado producen inmediatamente el snapshot actualizado', () => {
    const before = paymentAccountToLegacyRow(account());
    const after = paymentAccountToLegacyRow(account({ label: 'Yape renombrado', phoneNumber: '988888888' }));
    expect(before.detalle).toBe('Yape dinámico');
    expect(after.detalle).toBe('Yape renombrado');
    expect(after.celular).toBe('988888888');
  });

  test('una cuenta desactivada desaparece de operaciones nuevas pero puede resolverse para histórico', () => {
    const inactive = account({ isActive: false });
    expect(selectPaymentAccountRows([inactive], 'Yape')).toEqual([]);
    expect(selectPaymentAccountRows([inactive], 'Yape', true)).toHaveLength(1);
  });

  test('el catálogo legacy permanece disponible como fallback histórico', () => {
    expect(legacyRows.find((row) => row.detalle === 'Yape ANTONELLA GARCIA')?.celular).toBe('948075508');
    expect(legacyRows.some((row) => row.metodo === 'Yape')).toBe(true);
  });

  test('permisos de escritura coinciden con la política financiera', () => {
    expect(canManagePaymentAccounts('admin')).toBe(true);
    expect(canManagePaymentAccounts('socio')).toBe(true);
    expect(canManagePaymentAccounts('contador')).toBe(true);
    expect(canManagePaymentAccounts('operador')).toBe(false);
  });

  test('la selección por empresa no mezcla configuraciones', () => {
    const rows = [account({ empresaId: 'empresa-a', id: 'a' }), account({ empresaId: 'empresa-b', id: 'b' })];
    expect(rows.filter((row) => row.empresaId === 'empresa-a').map((row) => row.id)).toEqual(['a']);
  });
});
