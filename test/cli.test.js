import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('../bin/cli.js', import.meta.url))

let cwd

before(() => {
  cwd = mkdtempSync(join(tmpdir(), 'bestikk-changelog-cli-'))
})

after(() => {
  rmSync(cwd, { recursive: true, force: true })
})

// Runs the CLI outside of any git repository, with a deterministic author, so the git-based
// inference (author, previous tag, repo URL) can't leak the host environment into the output.
function cli(...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_ACTOR: 'octocat', GIT_CEILING_DIRECTORIES: tmpdir() },
  })
}

test('release rolls the Unreleased section of the given file', () => {
  writeFileSync(join(cwd, 'CHANGELOG.md'), '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Something\n')
  const { status, stderr } = cli('release', '1.0.0', '--file', 'CHANGELOG.md', '--date', '2024-01-15')
  assert.equal(stderr, '')
  assert.equal(status, 0)
  assert.equal(
    readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8'),
    '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2024-01-15\n\n### Added\n\n- Something\n',
  )
})

test('notes accepts "--option=value" and options before the command', () => {
  writeFileSync(join(cwd, 'NOTES.md'), '## [Unreleased]\n\n## [1.0.0] - 2024-01-15\n\n### Added\n\n- Something\n')
  const { status, stdout } = cli('--file=NOTES.md', 'notes', '1.0.0')
  assert.equal(status, 0)
  assert.match(stdout, /Released on: 2024-01-15\nReleased by: octocat/)
  assert.match(stdout, /### Added\n\n- Something/)
})

test('--help prints the usage and exits successfully', () => {
  const { status, stdout } = cli('--help')
  assert.equal(status, 0)
  assert.match(stdout, /^Usage:/)
})

for (const [description, args, message] of [
  ['a trailing option without value', ['notes', '1.0.0', '--file'], /Option '--file <value>' argument missing/],
  [
    'an option followed by another option',
    ['notes', '1.0.0', '--file', '--format', 'md'],
    /'--file' argument is ambiguous/,
  ],
  ['an unknown option', ['notes', '1.0.0', '--bogus'], /Unknown option '--bogus'/],
  ['an unknown command', ['publish', '1.0.0'], /Unknown command: publish/],
  ['a missing command', [], /Missing command/],
  ['a missing version', ['release'], /Missing <version> for the "release" command/],
  ['an extra argument', ['release', '1.0.0', '2.0.0'], /Unexpected argument: 2\.0\.0/],
]) {
  test(`rejects ${description} with exit code 9 and the usage`, () => {
    const { status, stdout, stderr } = cli(...args)
    assert.equal(status, 9)
    assert.equal(stdout, '')
    assert.match(stderr, message)
    assert.match(stderr, /Usage:/)
    assert.doesNotMatch(stderr, /\n\s+at /)
  })
}

test('reports a missing changelog file as a one-line error with exit code 1', () => {
  const { status, stderr } = cli('notes', '1.0.0', '--file', 'MISSING.adoc')
  assert.equal(status, 1)
  assert.equal(stderr, `bestikk-changelog: Changelog file not found: ${join(cwd, 'MISSING.adoc')}\n`)
})

test('reports a library error (e.g. section not found) as a one-line error with exit code 1', () => {
  writeFileSync(join(cwd, 'NO-UNRELEASED.md'), '# Changelog\n\n## [1.0.0] - 2024-01-15\n')
  const { status, stderr } = cli('release', '2.0.0', '--file', 'NO-UNRELEASED.md')
  assert.equal(status, 1)
  assert.equal(stderr, 'bestikk-changelog: "## [Unreleased]" section not found in changelog\n')
})
