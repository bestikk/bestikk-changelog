import assert from 'node:assert/strict'
import { once } from 'node:events'
import { test } from 'node:test'
import { extractReleaseNotes, rollUnreleased } from '../index.js'

const format = 'markdown'

// Custom templates

test('a custom template object is used to both write and read the headings (Markdown)', async () => {
  const style = { unreleased: 'TBD', release: 'Release {version} — {date}' }
  const rolled = rollUnreleased('# Changelog\n\n## TBD\n\n### Added\n\n- Something\n', '2.0.0', '2024-02-01', {
    format,
    style,
  })
  assert.equal(rolled, '# Changelog\n\n## TBD\n\n## Release 2.0.0 — 2024-02-01\n\n### Added\n\n- Something\n')
  const notes = await extractReleaseNotes(rolled, '2.0.0', { format, style })
  assert.match(notes, /Released on: 2024-02-01\n/)
  assert.match(notes, /### Added\n\n- Something$/)
})

test('a custom template object gets the "==" marker for an AsciiDoc changelog', async () => {
  const style = { unreleased: 'Next', release: '{version} / {date}' }
  const rolled = rollUnreleased('= Changelog\n\n== Next\n\n=== Added\n\n* Something\n', '2.0.0', '2024-02-01', {
    style,
  })
  assert.equal(rolled, '= Changelog\n\n== Next\n\n== 2.0.0 / 2024-02-01\n\n=== Added\n\n* Something\n')
  const notes = await extractReleaseNotes(rolled, '2.0.0', { style })
  assert.match(notes, /Released on: 2024-02-01\n/)
  assert.match(notes, /### Added\n\n\* Something$/)
})

test('the unreleased heading defaults to "Unreleased"', () => {
  const rolled = rollUnreleased('## Unreleased\n', '1.0.0', '2024-01-15', {
    format,
    style: { release: '{version} {date}' },
  })
  assert.equal(rolled, '## Unreleased\n\n## 1.0.0 2024-01-15\n')
})

test('the date may come before the version', async () => {
  const style = { release: '{date}: version {version}' }
  const notes = await extractReleaseNotes('## 2024-01-15: version 1.0.0\n\n- Something\n', '1.0.0', { format, style })
  assert.match(notes, /Released on: 2024-01-15\n/)
})

// Placeholders

test('{suffix} is written when given, and left out (with its whitespace) otherwise', () => {
  const style = { release: '{version} ({date}) {suffix}' }
  const content = '## Unreleased\n'
  assert.equal(
    rollUnreleased(content, '1.0.0', '2024-01-15', { format, style, suffix: '- @octocat' }),
    '## Unreleased\n\n## 1.0.0 (2024-01-15) - @octocat\n',
  )
  assert.equal(
    rollUnreleased(content, '1.0.0', '2024-01-15', { format, style }),
    '## Unreleased\n\n## 1.0.0 (2024-01-15)\n',
  )
})

test('{qualifier} is recognized when reading, but never written', async () => {
  const style = { release: 'v{version} {qualifier} ({date})' }
  assert.equal(
    rollUnreleased('## Unreleased\n', '1.0.0', '2024-01-15', { format, style }),
    '## Unreleased\n\n## v1.0.0 (2024-01-15)\n',
  )
  const notes = await extractReleaseNotes('## v1.0.0 (beta) (2024-01-15)\n\n- Something\n', '1.0.0', { format, style })
  assert.match(notes, /Released on: 2024-01-15\n/)
})

test('whitespace in a template matches any run of spaces/tabs, and trailing whitespace is ignored', async () => {
  const notes = await extractReleaseNotes('##  [1.0.0]\t-  2024-01-15  \n\n- Something\n', '1.0.0', { format })
  assert.match(notes, /Released on: 2024-01-15\n/)
})

test('a heading never matches across lines (e.g. a suffix swallowing the next line)', async () => {
  const content = '## 1.0.0 (2024-01-15)\n\nSummary.\n\n### Added\n\n- Something\n'
  const notes = await extractReleaseNotes(content, '1.0.0', { format, style: 'title-paren-suffix' })
  assert.match(notes, /## Summary\n\nSummary\.\n/)
})

test('a release section directly followed by the next heading is empty', async () => {
  const content = '## [1.1.0] - 2024-02-01\n## [1.0.0] - 2024-01-15\n\n- Older\n'
  const notes = await extractReleaseNotes(content, '1.1.0', { format })
  assert.doesNotMatch(notes, /Older/)
})

test('the version does not match a longer version (e.g. a pre-release)', async () => {
  const style = { release: '{version} {date}' }
  await assert.rejects(
    () => extractReleaseNotes('## 1.0.0-beta.1 2024-01-15\n\n- Something\n', '1.0.0', { format, style }),
    /Release section for version "1\.0\.0" not found/,
  )
})

// Duplicate releases

test('releasing a version twice is refused with a custom template, in both formats', () => {
  const style = { release: 'Release {version} {qualifier} — {date} {suffix}' }
  assert.throws(
    () =>
      rollUnreleased('## Unreleased\n\n## Release 1.0.0 (rc) — 2024-01-15 - @octocat\n', '1.0.0', '2024-02-01', {
        format,
        style,
      }),
    /already exists/,
  )
  assert.throws(
    () => rollUnreleased('== Unreleased\n\n== Release 1.0.0 — 2024-01-15\n', '1.0.0', '2024-02-01', { style }),
    /already exists/,
  )
})

// Validation

for (const [description, style, message] of [
  ['an unknown placeholder', { release: '{version} {date} {author}' }, /Unknown placeholder "\{author\}"/],
  ['a missing {version}', { release: 'Release {date}' }, /must contain a "\{version\}" placeholder/],
  ['a missing {date}', { release: 'Release {version}' }, /must contain a "\{date\}" placeholder/],
  ['a repeated placeholder', { release: '{version} {version} {date}' }, /"\{version\}" appears more than once/],
  [
    'an optional placeholder not preceded by whitespace',
    { release: '{version} ({date}){suffix}' },
    /must be preceded by whitespace/,
  ],
  ['a non-string release template', { release: 42 }, /Invalid release heading template: expected a string, got number/],
  [
    'a missing release template',
    { unreleased: 'TBD' },
    /Invalid release heading template: expected a string, got undefined/,
  ],
  ['a non-string unreleased heading', { unreleased: null, release: '{version} {date}' }, /Invalid unreleased heading/],
]) {
  test(`rejects a template object with ${description}`, () => {
    assert.throws(() => rollUnreleased('## Unreleased\n', '1.0.0', '2024-01-15', { format, style }), message)
  })
}

// Legacy custom style object

// With a timeout, so a missing warning fails the test instead of waiting forever
test('the legacy custom style object still works, with a deprecation warning', { timeout: 5000 }, async () => {
  const warning = once(process, 'warning')
  const style = {
    unreleasedHeading: '## TBD',
    releaseHeadingTemplate: (version, date) => `## Release ${version} — ${date}`,
    releaseHeadingRegex: (escapedVersion) =>
      new RegExp(`(?:^|\\n)## Release ${escapedVersion} — ([^\\n]+)\\n([\\s\\S]*?)(?=\\n## |$)`),
  }
  const rolled = rollUnreleased('## TBD\n\n- Something\n', '1.0.0', '2024-01-15', { format, style })
  assert.equal(rolled, '## TBD\n\n## Release 1.0.0 — 2024-01-15\n\n- Something\n')
  const [{ name, code }] = await warning
  assert.equal(name, 'DeprecationWarning')
  assert.equal(code, 'BESTIKK_CHANGELOG_DEP001')
})
