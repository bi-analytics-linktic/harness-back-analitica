// @ts-check
// ESLint del harness (AGENTS.md §5, §6, §13 y §14).
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Las palabras clave SQL se escriben en MAYÚSCULAS por convención.
const SQL_TEXT = '^\\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\\s';
const SQL_WRITE =
  '\\b(INSERT\\s+INTO|UPDATE\\s+\\S+\\s+SET|DELETE\\s+FROM|MERGE\\s+INTO|TRUNCATE|DROP\\s|ALTER\\s|CREATE\\s|GRANT\\s|REVOKE\\s)';

const SQL_OUTSIDE_SQL_FILE = 'El texto SQL solo puede vivir en *.sql.ts (AGENTS.md §5).';
const SQL_WRITE_FORBIDDEN = 'La BD es de solo lectura: prohibido escribir o ejecutar DDL (AGENTS.md §6).';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'eslint.config.mjs'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: 'commonjs',
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'pg',
              message: 'pg solo se usa en src/common/database y en *.repository.ts (AGENTS.md §5).',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${SQL_TEXT}/]`, message: SQL_OUTSIDE_SQL_FILE },
        { selector: `TemplateElement[value.raw=/${SQL_TEXT}/]`, message: SQL_OUTSIDE_SQL_FILE },
      ],
    },
  },
  {
    files: ['src/common/database/**/*.ts', 'src/**/*.repository.ts', 'src/**/*.repository.spec.ts'],
    rules: { 'no-restricted-imports': 'off' },
  },
  {
    files: ['src/**/*.sql.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=/${SQL_WRITE}/]`, message: SQL_WRITE_FORBIDDEN },
        { selector: `TemplateElement[value.raw=/${SQL_WRITE}/]`, message: SQL_WRITE_FORBIDDEN },
      ],
    },
  },
  {
    files: ['src/**/*.sql.spec.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: { '@typescript-eslint/unbound-method': 'off' },
  },
);
