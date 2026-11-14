import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {EXECUTOR_FILES, VALIDATION_TEST_FILES, verifyCandidateSource} from '../scripts/invoice-candidate-source-preflight.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'invoice-source-preflight-'));
  assert.equal(dirname(root), tmpdir());
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}).trim();
  const write = (path, content) => {mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), content);};
  const commit = () => {git('add', '.'); git('-c', 'user.name=Preflight test', '-c', 'user.email=preflight@example.test', 'commit', '-qm', 'fixture'); return git('rev-parse', 'HEAD');};
  git('init', '-q'); git('config', 'core.autocrlf', 'false');
  for (const path of ['src/app.js', 'index.js', 'test/business.test.js', 'config.js', 'package.json', 'Dockerfile', 'scripts/business.mjs']) write(path, 'baseline\n');
  const applicationCommit = commit();
  for (const path of [...EXECUTOR_FILES, ...VALIDATION_TEST_FILES]) write(path, 'validation harness\n');
  write('docs/report.json', '{}\n');
  const executorCommit = commit();
  return {root, git, write, commit, applicationCommit, executorCommit,
    verify: () => verifyCandidateSource({root, applicationCommit, executorCommit})};
}

test('final candidate accepts separate application, tests, configuration and committed validation executors', t => {
  const f = fixture(t), result = f.verify();
  assert.equal(result.applicationCommit, f.applicationCommit);
  assert.equal(result.executorCommit, f.executorCommit);
  assert.deepEqual(result.groups, {application: 2, tests: 1, configuration: 3, otherScripts: 1, executors: EXECUTOR_FILES.length, validationTests: 1});
});

for (const path of ['src/app.js', 'test/business.test.js', 'config.js', 'scripts/business.mjs', 'scripts/new-functional.mjs']) {
  test(`rejects functional change: ${path}`, t => {
    const f = fixture(t); f.write(path, 'changed\n');
    assert.throws(f.verify, e => e.code === 'APPLICATION_SOURCE_CHANGED' && e.files.includes(path));
  });
}

for (const path of EXECUTOR_FILES) test(`detects altered executor: ${path}`, t => {
  const f = fixture(t); f.write(path, 'altered executor\n');
  assert.throws(f.verify, e => e.code === 'EXECUTOR_SOURCE_CHANGED' && e.files.includes(path));
});

test('rejects staged executor tampering', t => {
  const f = fixture(t), path = EXECUTOR_FILES[0]; f.write(path, 'altered\n'); f.git('add', path);
  assert.throws(f.verify, e => e.code === 'EXECUTOR_SOURCE_CHANGED');
});

for (const path of ['src/app.js', EXECUTOR_FILES[0]]) test(`staged change cannot hide behind restored working file: ${path}`, t => {
  const f = fixture(t); f.write(path, 'staged tampering\n'); f.git('add', path);
  f.write(path, path.startsWith('src/') ? 'baseline\n' : 'validation harness\n');
  assert.throws(f.verify, e => e.code === (path.startsWith('src/') ? 'APPLICATION_SOURCE_CHANGED' : 'EXECUTOR_SOURCE_CHANGED'));
});

test('rejects committed functional change even when working copy is restored to baseline', t => {
  const f = fixture(t); f.write('src/app.js', 'committed change\n'); const executorCommit = f.commit();
  f.write('src/app.js', 'baseline\n');
  assert.throws(() => verifyCandidateSource({...f, executorCommit}), e => e.code === 'APPLICATION_SOURCE_CHANGED');
});

test('application-only commit cannot masquerade as a committed validation harness', t => {
  const f = fixture(t);
  assert.throws(() => verifyCandidateSource({...f, executorCommit: f.applicationCommit}), e => e.code === 'EXECUTOR_COMMIT_INCOMPLETE');
});
