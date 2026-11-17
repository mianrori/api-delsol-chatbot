import {execFileSync} from 'node:child_process';

export const APPLICATION_COMMIT = 'be559ef69a5e376c37fd479c36796b7f4023e831';

// Only these validation entry points and dependencies belong to the candidate
// containing the harness. All other scripts remain pinned to the application.
export const EXECUTOR_FILES = Object.freeze([
  'scripts/invoice-candidate-source-preflight.mjs',
  'scripts/run-invoice-candidate-affected-login.mjs',
  'scripts/run-invoice-candidate-affected-dev.ps1',
  'scripts/check-invoice-candidate-affected-dev.mjs',
  'scripts/dev-protected-login.mjs',
  'scripts/invoice-affected-log-audit.mjs',
]);
export const VALIDATION_TEST_FILES = Object.freeze(['test/invoiceCandidatePreflight.test.js']);

const documentation = path => path.startsWith('docs/') || ['README.md', 'AGENTS.md'].includes(path);
const category = path => EXECUTOR_FILES.includes(path) ? 'executors'
  : VALIDATION_TEST_FILES.includes(path) ? 'validationTests'
  : path.startsWith('src/') || path === 'index.js' ? 'application'
  : path.startsWith('test/') ? 'tests'
  : path.startsWith('scripts/') ? 'otherScripts' : 'configuration';

// Git-only preflight: no application imports, network, login, Docker or Oracle.
export function verifyCandidateSource({root, applicationCommit = APPLICATION_COMMIT, executorCommit = 'HEAD'}) {
  const git = (...args) => execFileSync('git', args, {
    cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const resolveCommit = ref => git('rev-parse', '--verify', `${ref}^{commit}`).trim();
  const application = resolveCommit(applicationCommit), executors = resolveCommit(executorCommit);
  const paths = ref => git('ls-tree', '-r', '--name-only', '-z', ref).split('\0').filter(Boolean);
  const baselinePaths = paths(application), candidatePaths = paths(executors);
  const workingPaths = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean);
  const candidateSet = new Set(candidatePaths);
  const fail = (code, files) => {throw Object.assign(new Error(code), {code, files});};
  const missing = [...EXECUTOR_FILES, ...VALIDATION_TEST_FILES].filter(path => !candidateSet.has(path));
  if (missing.length) fail('EXECUTOR_COMMIT_INCOMPLETE', missing);

  const groups = {application: [], tests: [], configuration: [], otherScripts: [], executors: [], validationTests: []};
  for (const path of new Set([...baselinePaths, ...candidatePaths, ...workingPaths])) {
    if (!documentation(path)) groups[category(path)].push(path);
  }
  const baselineSet = new Set(baselinePaths), workingSet = new Set(workingPaths);
  for (const [group, files] of Object.entries(groups)) {
    const isExecutor = group === 'executors' || group === 'validationTests';
    const reference = isExecutor ? executors : application;
    const referencePaths = isExecutor ? candidateSet : baselineSet;
    const unknown = files.filter(path => workingSet.has(path) && !referencePaths.has(path));
    if (unknown.length) fail(isExecutor ? 'EXECUTOR_SOURCE_CHANGED' : 'APPLICATION_SOURCE_CHANGED', unknown);
    if (!files.length) continue;
    // Compare commit-to-commit as well as index/worktree, so restoring an old
    // working file cannot disguise a functional change committed in HEAD.
    const committedChanges = isExecutor ? [] : git('diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z',
      application, executors, '--', ...files).split('\0').filter(Boolean);
    const localChanges = git('diff', '--no-ext-diff', '--no-textconv', '--name-only', '-z',
      reference, '--', ...files).split('\0').filter(Boolean);
    const stagedChanges = git('diff', '--cached', '--no-ext-diff', '--no-textconv', '--name-only', '-z',
      reference, '--', ...files).split('\0').filter(Boolean);
    if (committedChanges.length || localChanges.length || stagedChanges.length) {
      fail(isExecutor ? 'EXECUTOR_SOURCE_CHANGED' : 'APPLICATION_SOURCE_CHANGED', [...new Set([...committedChanges, ...localChanges, ...stagedChanges])]);
    }
  }
  return {applicationCommit: application, executorCommit: executors,
    groups: Object.fromEntries(Object.entries(groups).map(([group, files]) => [group, files.length]))};
}
