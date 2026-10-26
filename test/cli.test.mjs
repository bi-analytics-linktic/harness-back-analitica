import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'arness-test-'));
after(() => fs.rmSync(TMP, { recursive: true, force: true }));

let counter = 0;
const newRepo = () => {
  const dir = path.join(TMP, `repo-${++counter}`);
  fs.mkdirSync(dir);
  return dir;
};

/** Copia el paquete (bin + harness + package.json) para simular otra versión. */
function packageCopy(version, mutate = () => {}) {
  const dir = path.join(TMP, `pkg-${version}-${++counter}`);
  for (const rel of ['bin', 'harness', 'package.json']) {
    fs.cpSync(path.join(PKG_ROOT, rel), path.join(dir, rel), { recursive: true });
  }
  fs.rmSync(path.join(dir, 'harness/progress.md'), { force: true });
  const pkgJson = path.join(dir, 'package.json');
  fs.writeFileSync(pkgJson, JSON.stringify({ ...JSON.parse(fs.readFileSync(pkgJson, 'utf8')), version }));
  mutate(dir);
  return dir;
}

const run = (cwd, args, pkg = PKG_ROOT) =>
  spawnSync(process.execPath, [path.join(pkg, 'bin/arness.mjs'), ...args], { cwd, encoding: 'utf8' });

const read = (repo, rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const manifest = (repo) => JSON.parse(read(repo, 'harness/.arness.json'));

describe('arness init', () => {
  let repo;
  beforeEach(() => {
    repo = newRepo();
  });

  it('instala la base, los puentes, el esqueleto de decisiones y el manifiesto', () => {
    const res = run(repo, ['init']);
    assert.equal(res.status, 0, res.stderr);

    for (const rel of ['harness/AGENTS.md', 'harness/init.sh', 'harness/agents/lider.md', 'CLAUDE.md', 'GEMINI.md']) {
      assert.ok(fs.existsSync(path.join(repo, rel)), `falta ${rel}`);
    }
    assert.equal(fs.readlinkSync(path.join(repo, 'AGENTS.md')), 'harness/AGENTS.md');
    assert.equal(fs.readlinkSync(path.join(repo, '.claude/agents')), '../harness/agents');
    assert.ok(fs.existsSync(path.join(repo, '.agents/skills/nest-base/SKILL.md')));
    assert.ok(fs.statSync(path.join(repo, 'harness/init.sh')).mode & 0o100, 'init.sh debe ser ejecutable');

    assert.deepEqual(fs.readdirSync(path.join(repo, 'harness/decisiones')).sort(), ['README.md', '_plantilla.md']);
    const m = manifest(repo);
    assert.equal(m.package, '@bi-analytics/arness-back');
    assert.ok(!Object.keys(m.files).some((f) => f.startsWith('harness/decisiones/')), 'decisiones no es gestionada');
    assert.match(read(repo, '.gitignore'), /^harness\/progress\.md$/m);
  });

  it('no se instala dos veces', () => {
    run(repo, ['init']);
    const res = run(repo, ['init']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /arness sync/);
  });

  it('no pisa un CLAUDE.md propio sin --force', () => {
    fs.writeFileSync(path.join(repo, 'CLAUDE.md'), 'mis reglas\n');
    const res = run(repo, ['init']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /CLAUDE\.md/);
    assert.equal(read(repo, 'CLAUDE.md'), 'mis reglas\n');
    assert.equal(run(repo, ['init', '--force']).status, 0);
  });

  it('con --copy crea copias en lugar de enlaces', () => {
    assert.equal(run(repo, ['init', '--copy']).status, 0);
    assert.ok(!fs.lstatSync(path.join(repo, 'AGENTS.md')).isSymbolicLink());
    assert.equal(read(repo, 'AGENTS.md'), read(repo, 'harness/AGENTS.md'));
    assert.equal(manifest(repo).links['.claude/agents'], 'copy');
  });

  it('en un repo instalado, init.sh pasa en modo solo harness', () => {
    run(repo, ['init']);
    const res = spawnSync('bash', ['harness/init.sh', '--quick'], { cwd: repo, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stdout);
  });
});

describe('arness sync', () => {
  it('sin cambios de versión no toca nada y conserva decisiones y progress', () => {
    const repo = newRepo();
    run(repo, ['init']);
    fs.writeFileSync(path.join(repo, 'harness/progress.md'), 'estado\n');
    const res = run(repo, ['sync']);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /nuevos: 0 · actualizados: 0 · eliminados: 0/);
    assert.equal(read(repo, 'harness/progress.md'), 'estado\n');
  });

  it('se detiene si la base fue editada a mano, y --force la restaura', () => {
    const repo = newRepo();
    run(repo, ['init']);
    const original = read(repo, 'harness/AGENTS.md');
    fs.appendFileSync(path.join(repo, 'harness/AGENTS.md'), '\nregla local\n');

    const res = run(repo, ['sync']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /harness\/AGENTS\.md/);
    assert.equal(run(repo, ['status', '--check']).status, 1);

    assert.equal(run(repo, ['sync', '--force']).status, 0);
    assert.equal(read(repo, 'harness/AGENTS.md'), original);
    assert.equal(run(repo, ['status', '--check']).status, 0);
  });

  it('actualiza a una versión nueva: agrega, modifica y elimina solo archivos gestionados', () => {
    const repo = newRepo();
    const v1 = packageCopy('1.0.0', (dir) => fs.writeFileSync(path.join(dir, 'harness/playbooks/obsoleto.md'), 'x\n'));
    const v2 = packageCopy('1.1.0', (dir) => {
      fs.appendFileSync(path.join(dir, 'harness/playbooks/review.md'), '\n- [ ] nuevo check\n');
      fs.writeFileSync(path.join(dir, 'harness/playbooks/nuevo.md'), '# Nuevo\n');
    });

    assert.equal(run(repo, ['init'], v1).status, 0);
    assert.equal(run(repo, ['decision', 'new', 'Usar Zod'], v1).status, 0);

    const dry = run(repo, ['sync', '--dry-run'], v2);
    assert.equal(dry.status, 0, dry.stderr);
    assert.ok(!fs.existsSync(path.join(repo, 'harness/playbooks/nuevo.md')), '--dry-run no escribe');

    const res = run(repo, ['sync'], v2);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /1\.0\.0 → 1\.1\.0/);
    assert.ok(fs.existsSync(path.join(repo, 'harness/playbooks/nuevo.md')));
    assert.ok(!fs.existsSync(path.join(repo, 'harness/playbooks/obsoleto.md')));
    assert.match(read(repo, 'harness/playbooks/review.md'), /nuevo check/);
    assert.ok(fs.existsSync(path.join(repo, 'harness/decisiones/0001-usar-zod.md')), 'sync no toca decisiones');
    assert.equal(manifest(repo).version, '1.1.0');
  });
});

const initSh = (repo, args = []) =>
  spawnSync('bash', ['harness/init.sh', ...args], { cwd: repo, encoding: 'utf8' });
const initJson = (repo, args = []) => {
  const res = initSh(repo, ['--json', ...args]);
  return { status: res.status, report: JSON.parse(res.stdout) };
};
const git = (repo, ...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf8' });

/** Proyecto existente mínimo: no cumple todas las reglas, pero "funciona" (como los backends con v0.1.0). */
function legacyProject() {
  const repo = newRepo();
  const files = {
    'package.json': JSON.stringify({ name: 'mi-backend', version: '1.0.0', scripts: { build: 'nest build' } }),
    'src/main.ts': 'bootstrap();\n',
    'src/modules/cliente/cartera/cartera.module.ts': 'export class CarteraModule {}\n',
    '.env.example': 'PORT=3000\n',
    Dockerfile: 'FROM node:24-alpine\n',
    '.gitignore': 'node_modules/\n.env\nharness/progress.md\n',
  };
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), text);
  }
  return repo;
}

/** sha256 de cada archivo del repo, salvo los que gestiona el harness. */
function projectHashes(repo) {
  const managed = new Set(Object.keys(manifest(repo).files));
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      const rel = path.relative(repo, abs);
      if (e.isSymbolicLink() || rel === '.git' || rel.startsWith('harness/')) continue;
      if (e.isDirectory()) walk(abs);
      else if (!managed.has(rel)) out[rel] = createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
    }
  };
  walk(repo);
  return out;
}

describe('init.sh: advertencias por defecto', () => {
  it('en un proyecto que no cumple todo, advierte y termina en 0; con --strict termina en 1', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    const res = initSh(repo, ['--no-health']);
    assert.equal(res.status, 0, res.stdout);
    assert.match(res.stdout, /Proyecto operativo con \d+ advertencia/);
    assert.match(res.stdout, /Resumen por categoría/);
    assert.equal(initSh(repo, ['--strict', '--no-health']).status, 1);
  });

  it('--json devuelve los hallazgos con id, nivel y categoría', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    const { status, report } = initJson(repo, ['--no-health']);
    assert.equal(status, 0);
    assert.equal(report.mode, 'default');
    assert.equal(report.summary.failures, 0);
    const nvmrc = report.issues.find((i) => i.id === 'toolchain.nvmrc');
    assert.equal(nvmrc.level, 'warning');
    assert.equal(nvmrc.section, 'Toolchain');
  });

  it('.env versionado en git es crítico aunque no haya --strict, y no se puede silenciar', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    git(repo, 'init', '-q');
    fs.writeFileSync(path.join(repo, '.env'), 'ACCESS_TOKEN=x\n');
    git(repo, 'add', '-f', '.env');
    fs.writeFileSync(path.join(repo, 'harness/arness.config.json'), JSON.stringify({ ignore: { 'git.env-tracked': 'no' } }));
    const { status, report } = initJson(repo, ['--quick']);
    assert.equal(status, 1);
    assert.equal(report.summary.critical, 1);
    assert.equal(report.issues.find((i) => i.id === 'git.env-tracked').level, 'critical');
  });

  it('harness/arness.config.json permite strict, silenciar con motivo y marcar chequeos como obligatorios', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    const cfg = (c) => fs.writeFileSync(path.join(repo, 'harness/arness.config.json'), JSON.stringify(c));

    cfg({ ignore: { 'toolchain.nvmrc': 'Proyecto fijado por la plataforma' } });
    let { status, report } = initJson(repo, ['--quick']);
    assert.equal(status, 0);
    assert.equal(report.issues.find((i) => i.id === 'toolchain.nvmrc').level, 'ignored');

    cfg({ required: ['toolchain.nvmrc'] });
    ({ status, report } = initJson(repo, ['--quick']));
    assert.equal(status, 1);
    assert.deepEqual(report.issues.filter((i) => i.level === 'failure').map((i) => i.id), ['toolchain.nvmrc']);

    cfg({ strict: true });
    ({ status, report } = initJson(repo, ['--quick']));
    assert.equal(status, 1);
    assert.equal(report.mode, 'strict');

    cfg({ ignore: { 'toolchain.nvmrc': '' } });
    ({ report } = initJson(repo, ['--quick']));
    assert.ok(report.issues.some((i) => i.id === 'config.invalid'), 'un ignore sin motivo se reporta');
  });
});

/** Escribe archivos relativos al repo. */
function writeFiles(repo, files) {
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, rel)), { recursive: true });
    fs.writeFileSync(path.join(repo, rel), text);
  }
}
const issueIds = (report) => report.issues.map((i) => i.id);
const issuesOf = (report, id) => report.issues.filter((i) => i.id === id);

/** Endpoint completo del patrón §5, con sus specs. */
function endpointFiles(base, e) {
  const files = {};
  for (const suffix of ['.controller', '.service', '.repository', '.sql', '.columns', '-query.dto', '-filters.dto', '.entity']) {
    files[`${base}/${e}${suffix}.ts`] = 'export {};\n';
  }
  for (const suffix of ['.controller', '.service', '.repository', '.sql', '-query.dto']) {
    files[`${base}/${e}${suffix}.spec.ts`] = 'export {};\n';
  }
  return files;
}

describe('init.sh: CORS, fronteras y monitor', () => {
  it('un proyecto existente sin CORS ni fronteras solo recibe advertencias', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    writeFiles(repo, { 'eslint.config.mjs': 'export default [];\n' });
    const { status, report } = initJson(repo, ['--quick']);
    assert.equal(status, 0);
    for (const id of ['security.cors-env', 'security.cors', 'architecture.eslint-boundaries']) {
      assert.equal(issuesOf(report, id)[0]?.level, 'warning', id);
    }
    assert.ok(!issueIds(report).some((id) => id.startsWith('security.monitor')), 'sin src/common/monitor no se verifica el monitor');
  });

  it('detecta CORS abierto en main.ts y comodines en CORS_ORIGINS', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    writeFiles(repo, {
      'src/main.ts': 'app.enableCors();\n',
      '.env.example': 'PORT=3000\nCORS_ORIGINS=*\n',
    });
    const { report } = initJson(repo, ['--quick']);
    assert.equal(issuesOf(report, 'security.cors-open').length, 2);
    assert.ok(!issueIds(report).includes('security.cors-env'));

    writeFiles(repo, {
      'src/main.ts': 'app.enableCors(buildCorsOptions(origins, maxAge));\n',
      '.env.example': 'PORT=3000\nCORS_ORIGINS=https://app.example.com\n',
    });
    const ok = initJson(repo, ['--quick']).report;
    assert.ok(!issueIds(ok).some((id) => id.startsWith('security.cors')), JSON.stringify(issueIds(ok)));
  });

  it('detecta imports entre módulos y clientes, y de common a modules', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    writeFiles(repo, {
      'src/common/cache/cache.service.ts': "import { X } from '../../modules/cliente/cartera/cartera.module';\n",
      'src/modules/cliente/recaudo/recaudo.module.ts':
        "import { CarteraModule } from '../cartera/cartera.module';\nimport { V } from 'src/modules/otro/ventas/ventas.module';\nimport { C } from '../../../common/cache/cache.service';\n",
      'src/modules/cliente/recaudo/recaudo.constants.ts': "import { R } from './recaudo.module';\n",
    });
    const { report } = initJson(repo, ['--quick']);
    assert.match(issuesOf(report, 'architecture.common-imports-modules')[0].message, /src\/common\/cache\/cache\.service\.ts/);
    const crossed = issuesOf(report, 'architecture.module-imports')[0].message;
    assert.match(crossed, /\.\.\/cartera\/cartera\.module/);
    assert.match(crossed, /src\/modules\/otro\/ventas\/ventas\.module/);
    assert.doesNotMatch(crossed, /common\/cache|recaudo\.module'/);
  });

  it('verifica la regla de agrupación y los archivos y specs de cada endpoint', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    const base = 'src/modules/cliente/cartera';
    writeFiles(repo, {
      ...endpointFiles(`${base}/resumen`, 'resumen'),
      ...endpointFiles(`${base}/services-ok/services`, 'x'),
      [`${base}/detalle/detalle.controller.ts`]: 'export {};\n',
      [`${base}/detalle/detalle.service.ts`]: 'export {};\n',
      [`${base}/plano/a.service.ts`]: 'export {};\n',
      [`${base}/plano/b.service.ts`]: 'export {};\n',
      [`${base}/plano/c.service.ts`]: 'export {};\n',
    });
    const { report } = initJson(repo, ['--quick']);
    const grouping = issuesOf(report, 'architecture.grouping');
    assert.equal(grouping.length, 1, JSON.stringify(grouping));
    assert.match(grouping[0].message, /plano\/: 3 archivos service; agrúpalos en services\//);

    const endpoints = issuesOf(report, 'architecture.endpoint-files');
    assert.equal(endpoints.length, 1, 'resumen está completo; solo falla detalle');
    assert.match(endpoints[0].message, /Endpoint detalle .*detalle\.controller\.spec\.ts.*detalle\.repository\.ts/);
  });

  it('detecta SQL fuera de *.sql.ts en sus formas habituales sin falsos positivos', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    const clean = {
      'src/modules/cliente/cartera/op.enum.ts': "export enum Op {\n  SELECT = 'select',\n  WITH = 'with',\n}\n",
      'src/modules/cliente/cartera/http.ts': "export const methods = ['GET', 'DELETE'];\n// SELECT a FROM t\n",
      'src/modules/cliente/cartera/resumen/resumen.sql.ts': 'export const q = `\n  SELECT a FROM t`;\n',
    };
    writeFiles(repo, clean);
    assert.ok(!issueIds(initJson(repo, ['--quick']).report).includes('sql.outside'));

    for (const [name, text] of Object.entries({
      multiline: 'export const q = `\n  SELECT a\n  FROM t`;\n',
      paren: "export const q = '(SELECT 1)';\n",
      write: "export const q = 'DELETE FROM t WHERE a = $1';\n",
      update: 'export const q = "UPDATE t SET a = 1";\n',
    })) {
      writeFiles(repo, { 'src/modules/cliente/cartera/leak.ts': text });
      const sql = issuesOf(initJson(repo, ['--quick']).report, 'sql.outside');
      assert.equal(sql.length, 1, name);
      assert.match(sql[0].message, /leak\.ts/, name);
    }
  });

  it('con src/common/monitor exige su guard y sus variables', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    writeFiles(repo, {
      'src/common/monitor/monitor.controller.ts': "@Public()\n@Controller('monitor')\nexport class MonitorController {}\n",
    });
    let { report } = initJson(repo, ['--quick']);
    assert.equal(issuesOf(report, 'security.monitor-guard').length, 1);
    assert.equal(issuesOf(report, 'security.monitor-env').length, 2);

    writeFiles(repo, {
      'src/common/monitor/monitor.controller.ts':
        "// No es @Public(): lo protege MonitorSessionGuard.\n@UseGuards(MonitorSessionGuard)\n@Controller('monitor')\nexport class MonitorController {}\n",
      '.env.example': 'PORT=3000\nMONITOR_ENABLED=false\nMONITOR_SESSION_EXPIRES_IN=15m\n',
    });
    ({ report } = initJson(repo, ['--quick']));
    assert.ok(!issueIds(report).some((id) => id.startsWith('security.monitor')), JSON.stringify(issueIds(report)));

    writeFiles(repo, {
      'src/common/monitor/monitor.controller.ts':
        "@Public()\n@UseGuards(MonitorSessionGuard)\n@Controller('monitor')\nexport class MonitorController {}\n",
    });
    ({ report } = initJson(repo, ['--quick']));
    assert.match(issuesOf(report, 'security.monitor-guard')[0].message, /@Public\(\)/);
  });
});

describe('init.sh: configuración centralizada', () => {
  it('advierte process.env fuera de src/config/ y la falta de configuration.ts, sin contar src/config ni tests', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    writeFiles(repo, {
      'eslint.config.mjs': 'export default [];\n',
      'src/main.ts': 'const port = process.env.PORT;\n',
      'src/common/cache/cache.service.ts': 'const { env } = process;\n',
      'src/common/cache/cache.service.spec.ts': "process.env.CACHE_ENABLED = 'false';\n",
      'src/config/env.validation.ts': 'export const raw = process.env;\n',
      'src/modules/cliente/cartera/cartera.constants.ts': '// antes: process.env.X\nexport const A = 1;\n',
    });
    const { status, report } = initJson(repo, ['--quick']);
    assert.equal(status, 0);
    const leak = issuesOf(report, 'env.process-env');
    assert.equal(leak.length, 1);
    assert.equal(leak[0].level, 'warning');
    assert.match(leak[0].message, /src\/common\/cache\/cache\.service\.ts src\/main\.ts$/);
    assert.equal(issuesOf(report, 'env.configuration-file').length, 1);
    assert.equal(issuesOf(report, 'env.eslint').length, 1);

    writeFiles(repo, {
      'eslint.config.mjs': 'import { architectureBoundaries, configBoundaries } from "./eslint.boundaries.mjs";\n',
      'src/main.ts': "const port = config.get('app.port', { infer: true });\n",
      'src/common/cache/cache.service.ts': 'export class CacheService {}\n',
      'src/config/configuration.ts': 'export default () => ({ port: process.env.PORT });\n',
    });
    const ok = initJson(repo, ['--quick']).report;
    assert.ok(!issueIds(ok).some((id) => id.startsWith('env.')), JSON.stringify(issueIds(ok)));
  });
});

describe('init.sh: formato de logs', () => {
  it('advierte sin LOG_FORMAT, con pino-pretty en dependencies o con pretty en producción', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    let { status, report } = initJson(repo, ['--quick']);
    assert.equal(status, 0);
    assert.equal(issuesOf(report, 'logging.format-env')[0]?.level, 'warning');

    writeFiles(repo, {
      'package.json': JSON.stringify({ name: 'mi-backend', dependencies: { 'pino-pretty': '^13.0.0' } }),
      '.env.example': 'PORT=3000\nNODE_ENV=production\nLOG_FORMAT=pretty\n',
    });
    ({ report } = initJson(repo, ['--quick']));
    assert.equal(issuesOf(report, 'logging.pretty-production').length, 2);
    assert.ok(!issueIds(report).includes('logging.format-env'));

    writeFiles(repo, {
      'package.json': JSON.stringify({ name: 'mi-backend', devDependencies: { 'pino-pretty': '^13.0.0' } }),
      '.env.example': 'PORT=3000\nNODE_ENV=development\nLOG_FORMAT=pretty\n',
    });
    ({ report } = initJson(repo, ['--quick']));
    assert.ok(!issueIds(report).some((id) => id.startsWith('logging.')), JSON.stringify(issueIds(report)));
  });
});

describe('init.sh: documentación del proyecto', () => {
  it('advierte cada archivo de docs/ que falta, sin bloquear', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    let { status, report } = initJson(repo, ['--quick']);
    assert.equal(status, 0);
    assert.deepEqual(
      issuesOf(report, 'docs.files').map((i) => [i.level, i.message]),
      ['TECNICO', 'EVOLUTIVO', 'PENDIENTES'].map((n) => ['warning', `Falta el archivo docs/${n}.md`]),
    );

    const templates = path.join(PKG_ROOT, 'harness/skills/nest-base/templates/docs');
    fs.cpSync(templates, path.join(repo, 'docs'), { recursive: true });
    ({ report } = initJson(repo, ['--quick']));
    assert.ok(!issueIds(report).includes('docs.files'));
  });
});

describe('init.sh: última LTS de Node', () => {
  /** init.sh --quick --json con la LTS fijada por NODE_LTS_VERSION (sin red). */
  const ltsReport = (repo, lts) => {
    const res = spawnSync('bash', ['harness/init.sh', '--quick', '--json'], {
      cwd: repo,
      encoding: 'utf8',
      env: { ...process.env, NODE_LTS_VERSION: lts },
    });
    return { status: res.status, report: JSON.parse(res.stdout), stderr: res.stderr };
  };

  it('advierte toolchain.node-lts si .nvmrc está en un major anterior, sin bloquear', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    writeFiles(repo, { '.nvmrc': 'v24.11.0\n' });
    const { status, report } = ltsReport(repo, 'v26.11.0');
    assert.equal(status, 0);
    const [issue] = issuesOf(report, 'toolchain.node-lts');
    assert.equal(issue.level, 'warning');
    assert.match(issue.message, /v26\.11\.0 .*v24\.11\.0.*update-node-lts\.md/);
  });

  it('no advierte en la misma LTS, y NODE_LTS_VERSION=off desactiva la comparación', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    writeFiles(repo, { '.nvmrc': 'v24.11.0\n' });
    let { report, stderr } = ltsReport(repo, 'v24.22.1');
    assert.ok(!issueIds(report).includes('toolchain.node-lts'));
    assert.match(stderr, /actualizarla dentro de la misma LTS es opcional/);

    ({ report } = ltsReport(repo, 'v24.11.0'));
    assert.ok(!issueIds(report).includes('toolchain.node-lts'));

    ({ report, stderr } = ltsReport(repo, 'off'));
    assert.ok(!issueIds(report).includes('toolchain.node-lts'));
    assert.match(stderr, /NODE_LTS_VERSION=off/);
  });
});

describe('actualización segura de proyectos instalados', () => {
  it('compatibilidad: sync no toca archivos del proyecto, init.sh sigue en 0 y rollback restaura la base', () => {
    const repo = legacyProject();
    const v1 = packageCopy('0.1.0', (dir) => fs.writeFileSync(path.join(dir, 'harness/playbooks/viejo.md'), 'x\n'));
    assert.equal(run(repo, ['init'], v1).status, 0);
    assert.equal(run(repo, ['decision', 'new', 'Usar réplica'], v1).status, 0);
    const before = projectHashes(repo);
    const baseBefore = manifest(repo).files;

    const res = run(repo, ['sync']);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /arness rollback/);
    assert.deepEqual(projectHashes(repo), before, 'sync solo escribe archivos de la base');
    assert.equal(initSh(repo, ['--no-health']).status, 0);
    assert.equal(fs.readFileSync(path.join(repo, 'harness/.arness-backup/.gitignore'), 'utf8'), '*\n');

    const rb = run(repo, ['rollback']);
    assert.equal(rb.status, 0, rb.stderr);
    assert.equal(manifest(repo).version, '0.1.0');
    assert.deepEqual(manifest(repo).files, baseBefore);
    assert.equal(run(repo, ['status', '--check'], v1).status, 0, 'la base restaurada coincide con su manifiesto');
    assert.deepEqual(projectHashes(repo), before, 'rollback tampoco toca el proyecto');
    assert.ok(fs.existsSync(path.join(repo, 'harness/decisiones/0001-usar-replica.md')));
  });

  it('sync --dry-run --diff muestra el diff sin escribir; rollback sin respaldos falla con mensaje claro', () => {
    const repo = newRepo();
    const v1 = packageCopy('0.1.0');
    const v2 = packageCopy('0.2.0', (dir) => fs.appendFileSync(path.join(dir, 'harness/playbooks/review.md'), '\n- [ ] check nuevo\n'));
    run(repo, ['init'], v1);
    const rb = run(repo, ['rollback'], v1);
    assert.equal(rb.status, 1);
    assert.match(rb.stderr, /No hay respaldos/);

    const dry = run(repo, ['sync', '--dry-run', '--diff'], v2);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /\+- \[ \] check nuevo/);
    assert.doesNotMatch(read(repo, 'harness/playbooks/review.md'), /check nuevo/);
  });

  it('sync sin cambios no crea respaldo', () => {
    const repo = newRepo();
    run(repo, ['init']);
    assert.equal(run(repo, ['sync']).status, 0);
    assert.ok(!fs.existsSync(path.join(repo, 'harness/.arness-backup')));
  });

  it('doctor lista lo que falta sin modificar nada', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    const before = projectHashes(repo);
    const res = run(repo, ['doctor']);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /Advertencias: \d+/);
    assert.match(res.stdout, /\[toolchain\.nvmrc\]/);
    assert.match(res.stdout, /No se modificó ningún archivo/);
    assert.deepEqual(projectHashes(repo), before);
  });
});

const CATALOG = 'harness/reference/novedades.json';
const doctorJson = (repo, args = [], pkg = PKG_ROOT) => {
  const res = run(repo, ['doctor', '--json', ...args], pkg);
  return { status: res.status, report: JSON.parse(res.stdout) };
};

describe('catálogo de novedades', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(PKG_ROOT, CATALOG), 'utf8'));
  const initShSource = fs.readFileSync(path.join(PKG_ROOT, 'harness/init.sh'), 'utf8');

  it('cada novedad tiene los campos, tipo y versión válidos, y un id único', () => {
    assert.equal(catalog.schema, 1);
    const ids = catalog.novedades.map((n) => n.id);
    assert.equal(new Set(ids).size, ids.length, 'ids duplicados');
    for (const n of catalog.novedades) {
      assert.match(n.id, /^[a-z0-9-]+$/, n.id);
      assert.match(n.since, /^\d+\.\d+\.\d+$/, n.id);
      assert.ok(['seguridad', 'recomendada', 'opcional'].includes(n.type), n.id);
      for (const key of ['title', 'why']) assert.ok(n[key]?.trim(), `${n.id}: falta ${key}`);
      assert.ok(Array.isArray(n.steps) && n.steps.length, `${n.id}: sin pasos`);
      assert.ok(Array.isArray(n.checks) && Array.isArray(n.paths), n.id);
      assert.ok(n.checks.length || n.paths.length, `${n.id}: sin forma de detectar la adopción`);
    }
  });

  it('los checks existen en init.sh y cada ADR existe en docs/adr/', () => {
    for (const n of catalog.novedades) {
      for (const id of n.checks) assert.ok(new RegExp(`(issue|need_file|need_dir) ${id.replace('.', '\\.')} `).test(initShSource), `${n.id}: ${id} no está en init.sh`);
      if (n.adr) assert.ok(fs.readdirSync(path.join(PKG_ROOT, 'docs/adr')).some((f) => f.startsWith(`${n.adr}-`)), `${n.id}: ADR ${n.adr}`);
    }
  });
});

describe('arness doctor: novedades', () => {
  it('lista las novedades por adoptar por tipo, sin modificar nada y en 0', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    const before = projectHashes(repo);
    const res = run(repo, ['doctor']);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /◆ Novedades por adoptar: \d+/);
    assert.match(res.stdout, /Seguridad\n {4}● CORS con allowlist por entorno \[cors-allowlist\] · desde \d+\.\d+\.\d+ · ADR 0006/);
    assert.match(res.stdout, /Pasos:\n {8}1\. /);
    assert.match(res.stdout, /Requiere aprobación: pino-pretty/);
    assert.doesNotMatch(res.stdout, /\[security\.cors-env\]/, 'los avisos de una novedad no se repiten en Advertencias');
    assert.deepEqual(projectHashes(repo), before);
  });

  it('--json: adopta, declina con motivo y filtra con --since', () => {
    const repo = legacyProject();
    run(repo, ['init']);
    let { status, report } = doctorJson(repo);
    assert.equal(status, 0);
    const pending = report.novelties.pending.map((n) => n.id);
    assert.ok(pending.includes('project-docs') && pending.includes('cors-allowlist'), JSON.stringify(pending));
    const monitor = report.novelties.pending.find((n) => n.id === 'monitor');
    assert.equal(monitor.type, 'opcional');
    assert.deepEqual(monitor.findings, ['No existe src/common/monitor'], 'sin carpeta, el monitor está pendiente solo por ella');
    assert.equal(report.installed, report.available);
    assert.equal(report.newerAvailable, false);
    assert.ok(!report.issues.some((i) => i.id === 'docs.files'), 'los avisos de una novedad van con ella');

    fs.cpSync(path.join(PKG_ROOT, 'harness/skills/nest-base/templates/docs'), path.join(repo, 'docs'), { recursive: true });
    writeFiles(repo, { 'harness/arness.config.json': JSON.stringify({ declined: { 'log-format': 'Usamos JSON también en local', 'cors-allowlist': '' } }) });
    ({ report } = doctorJson(repo));
    assert.ok(report.novelties.adopted.includes('project-docs'));
    assert.deepEqual(report.novelties.declined, [{ id: 'log-format', reason: 'Usamos JSON también en local' }]);
    assert.ok(report.novelties.pending.some((n) => n.id === 'cors-allowlist'), 'declinar sin motivo no cuenta');
    assert.deepEqual(report.configErrors, ['declined.cors-allowlist sin motivo']);

    ({ report } = doctorJson(repo, ['--since', '99.0.0']));
    assert.deepEqual(report.novelties, { pending: [], adopted: [], declined: [] });
    assert.equal(run(repo, ['doctor', '--since', 'x']).status, 1);
  });

  it('con una base anterior sin catálogo sigue funcionando', () => {
    const repo = legacyProject();
    const v1 = packageCopy('0.1.0', (dir) => fs.rmSync(path.join(dir, CATALOG)));
    run(repo, ['init'], v1);
    const { status, report } = doctorJson(repo, [], v1);
    assert.equal(status, 0);
    assert.deepEqual(report.novelties.pending, []);
    assert.ok(report.issues.some((i) => i.id === 'docs.files'));
  });

  it('sync anuncia las novedades de la versión destino; doctor avisa si hay una versión más nueva', () => {
    const repo = legacyProject();
    const v1 = packageCopy('0.1.0', (dir) => fs.rmSync(path.join(dir, CATALOG)));
    const v2 = packageCopy('0.2.0');
    run(repo, ['init'], v1);
    assert.match(run(repo, ['doctor'], v2).stdout, /Hay una versión más nueva del paquete/);

    const dry = run(repo, ['sync', '--dry-run'], v2);
    assert.match(dry.stdout, /Novedades desde 0\.1\.0/);
    assert.match(dry.stdout, /\[seguridad\] CORS con allowlist por entorno \(cors-allowlist/);
    const before = projectHashes(repo);
    assert.equal(run(repo, ['sync'], v2).status, 0);
    assert.deepEqual(projectHashes(repo), before, 'sync solo escribe la base');
    assert.ok(doctorJson(repo, [], v2).report.novelties.pending.length > 0);
    assert.doesNotMatch(run(repo, ['sync'], v2).stdout, /Novedades desde/, 'sin cambio de versión no anuncia nada');
  });
});

describe('arness decision new', () => {
  it('numera correlativamente, rellena la plantilla y actualiza el índice', () => {
    const repo = newRepo();
    run(repo, ['init']);
    assert.equal(run(repo, ['decision', 'new', 'Agregar conexión Réplica'], PKG_ROOT).status, 0);
    assert.equal(run(repo, ['decision', 'new', 'Usar Zod'], PKG_ROOT).status, 0);

    const body = read(repo, 'harness/decisiones/0001-agregar-conexion-replica.md');
    assert.match(body, /^# 0001\. Agregar conexión Réplica$/m);
    assert.match(body, /^- \*\*Estado:\*\* Propuesta$/m);
    assert.match(body, /^- \*\*Fecha:\*\* \d{4}-\d{2}-\d{2}$/m);

    const index = read(repo, 'harness/decisiones/README.md');
    assert.match(index, /\| \[0001\]\(0001-agregar-conexion-replica\.md\) \|/);
    assert.match(index, /\| \[0002\]\(0002-usar-zod\.md\) \| Usar Zod \| Propuesta \|/);
  });

  it('funciona desde una subcarpeta del repo', () => {
    const repo = newRepo();
    run(repo, ['init']);
    const res = run(path.join(repo, 'harness/playbooks'), ['decision', 'new', 'Algo']);
    assert.equal(res.status, 0, res.stderr);
    assert.ok(fs.existsSync(path.join(repo, 'harness/decisiones/0001-algo.md')));
  });
});

describe('arness (general)', () => {
  it('se niega a instalarse sobre el repo fuente del paquete', () => {
    const res = run(PKG_ROOT, ['init']);
    assert.equal(res.status, 1);
  });

  it('comandos que requieren instalación fallan con un mensaje claro', () => {
    const res = run(newRepo(), ['sync']);
    assert.equal(res.status, 1);
    assert.match(res.stderr, /arness init/);
  });
});
