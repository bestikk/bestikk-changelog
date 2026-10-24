import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractReleaseNotes, formatReleaseNotes, rollUnreleased } from '../index.js'

// Empty sections

test('formatReleaseNotes omits the Summary section when there is no summary', () => {
  const notes = formatReleaseNotes({ summary: '', date: '2024-01-15', currentTag: 'v1.0.0', changelog: '### Added' })
  assert.match(notes, /^## Release meta\n/)
  assert.doesNotMatch(notes, /## Summary/)
})

test('formatReleaseNotes omits the Changelog section when there is no changelog', () => {
  const notes = formatReleaseNotes({ summary: 'Summary.', date: '2024-01-15', currentTag: 'v1.0.0', changelog: '' })
  assert.doesNotMatch(notes, /## Changelog/)
  assert.match(notes, /Published by: GitHub$/)
})

test('extractReleaseNotes does not render an empty Summary section', async () => {
  const content = '## [1.0.0] - 2024-01-15\n\n### Added\n\n- Something\n'
  const notes = await extractReleaseNotes(content, '1.0.0', { format: 'markdown' })
  assert.match(notes, /^## Release meta\n/)
})

// Fenced code blocks

test('extractReleaseNotes does not end the section on a "## " line in a fenced code block', async () => {
  const content = `## [1.0.0] - 2024-01-15

### Added

- Run:

  \`\`\`sh
  ## a comment
  ### another one
  echo hi
  \`\`\`

- After the code block

~~~~
## tilde fence, closed by a longer fence
~~~~~

## [0.9.0] - 2023-12-01

- Older
`
  const notes = await extractReleaseNotes(content, '1.0.0', { format: 'markdown' })
  assert.match(notes, /## Changelog\n\n### Added\n\n- Run:\n\n {2}```sh\n {2}## a comment\n {2}### another one\n/)
  assert.match(notes, /- After the code block/)
  assert.match(notes, /\n## tilde fence, closed by a longer fence\n/)
  assert.doesNotMatch(notes, /Older/)
})

test('extractReleaseNotes does not take a "### " line in a fenced code block for the first category', async () => {
  const content = '## [1.0.0] - 2024-01-15\n\nSummary:\n\n```\n### not a category\n```\n\n### Added\n\n- Something\n'
  const notes = await extractReleaseNotes(content, '1.0.0', { format: 'markdown' })
  assert.match(notes, /## Summary\n\nSummary:\n\n```\n### not a category\n```\n\n## Release meta/)
})

test('extractReleaseNotes does not match a release heading in a fenced code block', async () => {
  const content =
    '## [2.0.0] - 2024-02-01\n\n```md\n## [1.0.0] - 1999-01-01\n```\n\n## [1.0.0] - 2024-01-15\n\n- Real\n'
  const notes = await extractReleaseNotes(content, '1.0.0', { format: 'markdown' })
  assert.match(notes, /Released on: 2024-01-15/)
  assert.match(notes, /- Real/)
})

test('extractReleaseNotes handles AsciiDoc source blocks converted to fenced code blocks', async () => {
  const content = `= Changelog

== v1.0.0 (2024-01-15)

=== Added

* Run the command below

[source,sh]
----
## a comment
----

* After the code block

== v0.9.0 (2023-12-01)

* Older
`
  const notes = await extractReleaseNotes(content, '1.0.0')
  assert.match(notes, /## a comment/)
  assert.match(notes, /After the code block/)
  assert.doesNotMatch(notes, /Older/)
})

// Releasing the same version twice

test('rollUnreleased refuses to release a version that already has a release section', () => {
  const content = '= Changelog\n\n== Unreleased\n\n== v1.0.0 (2024-01-15)\n'
  assert.throws(
    () => rollUnreleased(content, '1.0.0', '2024-01-16'),
    /A release section for version "1\.0\.0" already exists in changelog/,
  )
})

test('rollUnreleased refuses to release a version twice whatever the qualifier/suffix (title-paren-suffix)', () => {
  const content = '## Unreleased\n\n## 4.2.0 (pre-release) (2026-07-30) - @octocat\n'
  assert.throws(
    () => rollUnreleased(content, '4.2.0', '2026-07-31', { format: 'markdown', style: 'title-paren-suffix' }),
    /already exists/,
  )
})

test('rollUnreleased still releases a version whose pre-release already exists', () => {
  const content = '## [Unreleased]\n\n## [1.0.0-beta.1] - 2024-01-01\n'
  const result = rollUnreleased(content, '1.0.0', '2024-01-15', { format: 'markdown' })
  assert.match(result, /## \[1\.0\.0] - 2024-01-15\n\n## \[1\.0\.0-beta\.1]/)
})

// "v"-prefixed version

test('rollUnreleased drops a leading "v" from the version', () => {
  const result = rollUnreleased('== Unreleased\n', 'v1.0.0', '2024-01-15')
  assert.equal(result, '== Unreleased\n\n== v1.0.0 (2024-01-15)\n')
})

test('extractReleaseNotes drops a leading "v" from the version', async () => {
  const content = '## [1.0.0] - 2024-01-15\n\n### Added\n\n- Something\n'
  const notes = await extractReleaseNotes(content, 'v1.0.0', {
    format: 'markdown',
    previousTag: 'v0.9.0',
    repoUrl: 'https://github.com/example/example',
  })
  assert.match(notes, /compare\/v0\.9\.0\.\.\.v1\.0\.0\)/)
})

// CRLF line endings

test('rollUnreleased keeps CRLF line endings', () => {
  const content = '# Changelog\r\n\r\n## [Unreleased]\r\n\r\n### Added\r\n\r\n- Something\r\n'
  const result = rollUnreleased(content, '1.0.0', '2024-01-15', { format: 'markdown' })
  assert.equal(
    result,
    '# Changelog\r\n\r\n## [Unreleased]\r\n\r\n## [1.0.0] - 2024-01-15\r\n\r\n### Added\r\n\r\n- Something\r\n',
  )
})

for (const [style, heading] of [
  ['keepachangelog', '## [1.0.0] - 2024-01-15'],
  ['title-paren', '## v1.0.0 (2024-01-15)'],
  ['title-paren-suffix', '## 1.0.0 (2024-01-15) - @octocat'],
]) {
  test(`extractReleaseNotes reads a CRLF changelog (${style})`, async () => {
    const content = `${heading}\r\n\r\nSummary.\r\n\r\n### Added\r\n\r\n- Something\r\n`
    const notes = await extractReleaseNotes(content, '1.0.0', { format: 'markdown', style })
    assert.doesNotMatch(notes, /\r/)
    assert.match(notes, /## Summary\n\nSummary\.\n/)
    assert.match(notes, /Released on: 2024-01-15\n/)
    assert.match(notes, /### Added\n\n- Something$/)
  })
}

test('extractReleaseNotes reads a CRLF AsciiDoc changelog', async () => {
  const content = '= Changelog\r\n\r\n== v1.0.0 (2024-01-15)\r\n\r\n=== Added\r\n\r\n* Something\r\n'
  const notes = await extractReleaseNotes(content, '1.0.0')
  assert.match(notes, /Released on: 2024-01-15\n/)
  assert.match(notes, /### Added\n\n\* Something$/)
})
