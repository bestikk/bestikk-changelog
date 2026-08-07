import assert from 'node:assert/strict'
import { test } from 'node:test'
import { convertToMarkdown, extractReleaseNotes, rollUnreleased } from '../index.js'

test('convertToMarkdown converts AsciiDoc headings to Markdown', async () => {
  const markdown = await convertToMarkdown('== v1.0.0 (2024-01-15)\n\n=== Added\n\n* Initial release\n')
  assert.match(markdown, /## v1\.0\.0 \(2024-01-15\)/)
  assert.match(markdown, /### Added/)
})

test('rollUnreleased inserts a dated release section above a fresh Unreleased section', () => {
  const content = '= Changelog\n\n== Unreleased\n\n=== Added\n\n* Something\n'
  const result = rollUnreleased(content, '1.0.0', '2024-01-15')
  assert.equal(result, '= Changelog\n\n== Unreleased\n\n== v1.0.0 (2024-01-15)\n\n=== Added\n\n* Something\n')
})

test('rollUnreleased throws when there is no Unreleased section', () => {
  assert.throws(() => rollUnreleased('= Changelog\n\n== v1.0.0 (2024-01-15)\n', '2.0.0', '2024-02-01'), /Unreleased/)
})

test('extractReleaseNotes extracts and formats a release section as Markdown', async () => {
  const content = `= Project Changelog
:uri-repo: https://github.com/example/example

== Unreleased

== v1.0.0 (2024-01-15)

Summary of the release.

=== Added

* New feature ({uri-repo}/issues/1[#1])

=== Fixed

* A bug

== v0.9.0 (2023-12-01)

=== Added

* Older feature
`

  const notes = await extractReleaseNotes(content, '1.0.0', {
    author: 'octocat',
    previousTag: 'v0.9.0',
    repoUrl: 'https://github.com/example/example',
  })

  assert.match(notes, /Summary of the release\./)
  assert.match(notes, /### Added/)
  assert.match(notes, /New feature \(\[#1]\(https:\/\/github\.com\/example\/example\/issues\/1\)\)/)
  assert.match(notes, /### Fixed/)
  assert.doesNotMatch(notes, /Older feature/)
  assert.match(notes, /\[full diff]\(https:\/\/github\.com\/example\/example\/compare\/v0\.9\.0\.\.\.v1\.0\.0\)/)
})

test('extractReleaseNotes throws when the version section is not found', async () => {
  const content = '== Unreleased\n\n== v1.0.0 (2024-01-15)\n\n=== Added\n\n* Something\n'
  await assert.rejects(() => extractReleaseNotes(content, '9.9.9'), /Release section for version "9\.9\.9" not found/)
})
