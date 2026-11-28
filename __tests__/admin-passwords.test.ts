import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_ROLE_PASSWORDS,
  ROLE_PASSWORD_METADATA,
  getRolePasswords,
  saveRolePasswords,
} from '../lib/passwordStore';
import { checkPasswordAsync } from '../lib/auth';

const FILE_PATH = path.join(process.cwd(), 'data', 'auth', 'passwords.json');

describe('Admin Role Passwords System', () => {
  let backupFile: string | null = null;

  beforeEach(() => {
    if (fs.existsSync(FILE_PATH)) {
      backupFile = fs.readFileSync(FILE_PATH, 'utf8');
    } else {
      backupFile = null;
    }
  });

  afterEach(() => {
    if (backupFile !== null) {
      fs.writeFileSync(FILE_PATH, backupFile, 'utf8');
    } else if (fs.existsSync(FILE_PATH)) {
      try {
        fs.unlinkSync(FILE_PATH);
      } catch {
        // ignore
      }
    }
  });

  it('contains metadata for all 7 system tabs/roles', () => {
    expect(ROLE_PASSWORD_METADATA).toHaveLength(7);
    const keys = ROLE_PASSWORD_METADATA.map((m) => m.key);
    expect(keys).toContain('contracts');
    expect(keys).toContain('payroll');
    expect(keys).toContain('husk');
    expect(keys).toContain('baocao');
    expect(keys).toContain('dangtai');
    expect(keys).toContain('chingoc');
    expect(keys).toContain('kiemtra');
  });

  it('has correct default passwords', () => {
    expect(DEFAULT_ROLE_PASSWORDS.contracts).toBe('chonchinh');
    expect(DEFAULT_ROLE_PASSWORDS.payroll).toBe('hoaibao');
    expect(DEFAULT_ROLE_PASSWORDS.husk).toBe('teamlua');
    expect(DEFAULT_ROLE_PASSWORDS.baocao).toBe('baocao');
    expect(DEFAULT_ROLE_PASSWORDS.dangtai).toBe('phuongtien');
    expect(DEFAULT_ROLE_PASSWORDS.chingoc).toBe('chingoc');
    expect(DEFAULT_ROLE_PASSWORDS.kiemtra).toBe('KIEMTRA');
  });

  it('rejects duplicate passwords between different tabs', async () => {
    await expect(
      saveRolePasswords({
        contracts: 'pass123',
        payroll: 'pass123',
      })
    ).rejects.toThrow(/bị trùng/);
  });

  it('rejects empty passwords', async () => {
    await expect(
      saveRolePasswords({
        contracts: '   ',
      })
    ).rejects.toThrow(/không được để trống/);
  });

  it('verifies dynamic password updates through checkPasswordAsync', async () => {
    // Save updated password for contracts and payroll
    await saveRolePasswords({
      contracts: 'chonchinh_vip2026',
      payroll: 'hoaibao_newpass',
    });

    // Old password 'chonchinh' should now fail
    const oldRes = await checkPasswordAsync('chonchinh');
    expect(oldRes.isAuthenticated).toBe(false);

    // New password should succeed
    const newRes = await checkPasswordAsync('chonchinh_vip2026');
    expect(newRes.isAuthenticated).toBe(true);
    expect(newRes.role).toBe('contracts');
    expect(newRes.redirectUrl).toBe('/');

    // Old payroll pass 'hoaibao' should fail
    const oldPayroll = await checkPasswordAsync('hoaibao');
    expect(oldPayroll.isAuthenticated).toBe(false);

    // New payroll pass should succeed
    const newPayroll = await checkPasswordAsync('hoaibao_newpass');
    expect(newPayroll.isAuthenticated).toBe(true);
    expect(newPayroll.role).toBe('payroll');

    // Reset back to defaults
    const resetMap = await saveRolePasswords(DEFAULT_ROLE_PASSWORDS);
    expect(resetMap.contracts).toBe('chonchinh');
    expect(resetMap.payroll).toBe('hoaibao');

    const restoreRes = await checkPasswordAsync('chonchinh');
    expect(restoreRes.isAuthenticated).toBe(true);
    expect(restoreRes.role).toBe('contracts');
  });
});
