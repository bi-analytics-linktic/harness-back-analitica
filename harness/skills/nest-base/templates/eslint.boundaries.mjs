// @ts-check
// Fronteras de arquitectura del harness (AGENTS.md §4). Sin dependencias: solo
// @typescript-eslint/no-restricted-imports con patrones. Se copia a la raíz del proyecto y la
// importa eslint.config.mjs. Usa una regla distinta de no-restricted-imports (la de `pg`) para que
// los overrides de una no apaguen la otra.

const RULE = '@typescript-eslint/no-restricted-imports';

export const COMMON_IMPORTS_MODULES =
  'src/common no importa de src/modules: lo compartido vive en common (AGENTS.md §4).';
export const MODULE_IMPORTS_OTHER_MODULE =
  'Un módulo no importa de otro módulo ni de otro cliente: lo compartido va a src/common (AGENTS.md §4).';
export const MODULE_ABSOLUTE_IMPORT =
  'Dentro de un módulo usa imports relativos; importar otro módulo está prohibido (AGENTS.md §4).';

/** Niveles de carpeta bajo src/modules/<cliente>/<modulo>/ que se verifican. */
const MAX_DEPTH = 5;

/**
 * Un archivo a `depth` carpetas bajo la raíz de su módulo sale del módulo con depth + 1 `../`.
 * Desde ahí solo puede llegar a src/common o src/config (dos niveles más arriba: cliente y modules).
 */
const leavesModule = (depth) => `^(\\.\\./){${depth + 1}}(?!\\.\\./\\.\\./(common|config)(/|$))`;

/** @type {import('eslint').Linter.Config[]} */
export const architectureBoundaries = [
  {
    files: ['src/common/**/*.ts'],
    rules: {
      [RULE]: ['error', { patterns: [{ regex: '(^|/)modules(/|$)', message: COMMON_IMPORTS_MODULES }] }],
    },
  },
  ...Array.from({ length: MAX_DEPTH }, (_, depth) => ({
    files: [`src/modules/*/*/${'*/'.repeat(depth)}*.ts`],
    rules: {
      [RULE]: [
        'error',
        {
          patterns: [
            { regex: leavesModule(depth), message: MODULE_IMPORTS_OTHER_MODULE },
            { regex: '^src/modules/', message: MODULE_ABSOLUTE_IMPORT },
          ],
        },
      ],
    },
  })),
];
