import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = path.join(PKG_ROOT, 'harness/skills/nest-base/templates/eslint.boundaries.mjs');

// eslint es devDependency del repo del paquete (pnpm install); sin él, la prueba se omite con aviso.
const eslint = await import('eslint').catch(() => null);
const {
  architectureBoundaries,
  configBoundaries,
  COMMON_IMPORTS_MODULES,
  MODULE_IMPORTS_OTHER_MODULE,
  MODULE_ABSOLUTE_IMPORT,
  PROCESS_ENV_OUTSIDE_CONFIG,
} = await import(TEMPLATE);

const PROJECT = '/proyecto';

/** La plantilla usa @typescript-eslint/no-restricted-imports; aquí se prueba con la regla base, que acepta las mismas opciones. */
const config = [
  { files: ['**/*.ts'], languageOptions: { sourceType: 'module' } },
  ...architectureBoundaries.map(({ files, rules }) => ({
    files,
    rules: Object.fromEntries(Object.entries(rules).map(([, value]) => ['no-restricted-imports', value])),
  })),
];

/** Mensajes de no-restricted-imports al importar `source` desde `file`. */
function lint(file, source) {
  const linter = new eslint.Linter({ cwd: PROJECT });
  return linter
    .verify(`import x from '${source}';\nexport default x;\n`, config, { filename: path.join(PROJECT, file) })
    .map((m) => {
      assert.equal(m.fatal, undefined, m.message);
      return m.message;
    });
}

const forbidden = (file, source, reason) => {
  const messages = lint(file, source);
  assert.equal(messages.length, 1, `${file} → ${source} debería fallar`);
  assert.ok(messages[0].includes(reason), messages[0]);
};
const allowed = (file, source) => assert.deepEqual(lint(file, source), [], `${file} → ${source} debería pasar`);

describe('plantilla eslint.boundaries.mjs', { skip: !eslint && 'eslint no está instalado: ejecuta pnpm install' }, () => {
  it('src/common no importa de src/modules', () => {
    forbidden('src/common/auth/auth.service.ts', '../../modules/fidu/cartera/cartera.module', COMMON_IMPORTS_MODULES);
    forbidden('src/common/cache/cache.service.ts', 'src/modules/fidu/cartera/cartera.module', COMMON_IMPORTS_MODULES);
    allowed('src/common/auth/auth.service.ts', '../http/envelope');
    allowed('src/common/auth/auth.service.ts', '@nestjs/common');
  });

  it('un módulo no importa de otro módulo del mismo cliente', () => {
    forbidden('src/modules/fidu/recaudo/recaudo.module.ts', '../cartera/cartera.module', MODULE_IMPORTS_OTHER_MODULE);
    forbidden(
      'src/modules/fidu/recaudo/diario/diario.service.ts',
      '../../cartera/resumen/resumen.repository',
      MODULE_IMPORTS_OTHER_MODULE,
    );
    forbidden(
      'src/modules/fidu/recaudo/services/diario/diario.service.ts',
      '../../../cartera/cartera.module',
      MODULE_IMPORTS_OTHER_MODULE,
    );
  });

  it('un módulo no importa de otro cliente', () => {
    forbidden('src/modules/fidu/cartera/resumen/resumen.service.ts', '../../../otro/ventas/ventas.module', MODULE_IMPORTS_OTHER_MODULE);
    forbidden('src/modules/fidu/cartera/cartera.module.ts', 'src/modules/otro/ventas/ventas.module', MODULE_ABSOLUTE_IMPORT);
  });

  it('un módulo puede importar su propio código, src/common y src/config', () => {
    allowed('src/modules/fidu/cartera/cartera.module.ts', './resumen/resumen.controller');
    allowed('src/modules/fidu/cartera/resumen/resumen.service.ts', './resumen.repository');
    allowed('src/modules/fidu/cartera/resumen/resumen.service.ts', '../cartera.constants');
    allowed('src/modules/fidu/cartera/resumen/resumen.service.ts', '../../../../common/cache/cache.service');
    allowed('src/modules/fidu/cartera/resumen/resumen.service.ts', '../../../../config/app.config');
    allowed('src/modules/fidu/cartera/cartera.module.ts', '../../../common/database/database.module');
    allowed('src/modules/fidu/cartera/services/a/a.service.ts', '../../../../../common/http/envelope');
  });

  it('salir del módulo hacia otra carpeta de src sigue prohibido', () => {
    forbidden('src/modules/fidu/cartera/cartera.module.ts', '../../../app.module', MODULE_IMPORTS_OTHER_MODULE);
    forbidden('src/modules/fidu/cartera/cartera.module.ts', '../../../commonx/a', MODULE_IMPORTS_OTHER_MODULE);
  });
});

describe('plantilla eslint.boundaries.mjs: configBoundaries', { skip: !eslint && 'eslint no está instalado: ejecuta pnpm install' }, () => {
  const envConfig = [{ files: ['**/*.ts'], languageOptions: { sourceType: 'module' } }, ...configBoundaries];

  /** Mensajes de no-restricted-properties para `code` en `file`. */
  const lintEnv = (file, code) =>
    new eslint.Linter({ cwd: PROJECT })
      .verify(code, envConfig, { filename: path.join(PROJECT, file) })
      .map((m) => {
        assert.equal(m.fatal, undefined, m.message);
        assert.ok(m.message.includes(PROCESS_ENV_OUTSIDE_CONFIG), m.message);
        return m.ruleId;
      });
  const RESTRICTED = 'no-restricted-properties';

  it('process.env fuera de src/config/ falla, también desestructurado', () => {
    for (const file of ['src/main.ts', 'src/common/cache/cache.service.ts', 'src/modules/fidu/cartera/resumen/resumen.service.ts']) {
      assert.deepEqual(lintEnv(file, 'export const port = process.env.PORT;\n'), [RESTRICTED], file);
    }
    assert.deepEqual(lintEnv('src/main.ts', 'const { env } = process;\nexport default env;\n'), [RESTRICTED]);
  });

  it('src/config/ y los tests pueden leer process.env', () => {
    for (const file of ['src/config/configuration.ts', 'src/config/env.validation.ts', 'src/common/cache/cache.service.spec.ts', 'test/auth.e2e-spec.ts']) {
      assert.deepEqual(lintEnv(file, 'export const port = process.env.PORT;\n'), [], file);
    }
  });
});
