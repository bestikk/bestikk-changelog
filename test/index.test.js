import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  convertAsciidocToMarkdown,
  extractReleaseNotes,
  formatReleaseNotes,
  rollUnreleased,
  splitChangelog,
} from '../index.js'

test('convertAsciidocToMarkdown converts headings to Markdown', () => {
  const markdown = convertAsciidocToMarkdown('== v1.0.0 (2024-01-15)\n\n=== Added\n\n* Initial release\n')
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

test('splitChangelog separates the summary from the category sections', () => {
  const { summary, changelog } = splitChangelog('A short summary.\n\n### Added\n\n* Something\n')
  assert.equal(summary, 'A short summary.')
  assert.equal(changelog, '### Added\n\n* Something')
})

test('splitChangelog returns an empty changelog when there are no categories', () => {
  const { summary, changelog } = splitChangelog('Just a summary, no categories.')
  assert.equal(summary, 'Just a summary, no categories.')
  assert.equal(changelog, '')
})

test('formatReleaseNotes renders release meta and a full diff link when repoUrl and previousTag are given', () => {
  const notes = formatReleaseNotes({
    summary: 'Summary.',
    date: '2024-01-15',
    author: 'octocat',
    previousTag: 'v0.9.0',
    currentTag: 'v1.0.0',
    changelog: '### Added\n\n* Something',
    repoUrl: 'https://github.com/example/example',
  })
  assert.match(notes, /Released on: 2024-01-15/)
  assert.match(notes, /Released by: octocat/)
  assert.match(notes, /\[full diff]\(https:\/\/github\.com\/example\/example\/compare\/v0\.9\.0\.\.\.v1\.0\.0\)/)
})

test('formatReleaseNotes omits the diff link when repoUrl is missing', () => {
  const notes = formatReleaseNotes({
    summary: 'Summary.',
    date: '2024-01-15',
    currentTag: 'v1.0.0',
    changelog: '### Added\n\n* Something',
  })
  assert.doesNotMatch(notes, /full diff/)
})

test('extractReleaseNotes extracts and formats a release section as Markdown', () => {
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

  const notes = extractReleaseNotes(content, '1.0.0', {
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

test('extractReleaseNotes throws when the version section is not found', () => {
  const content = '== Unreleased\n\n== v1.0.0 (2024-01-15)\n\n=== Added\n\n* Something\n'
  assert.throws(() => extractReleaseNotes(content, '9.9.9'), /Section "== v9\.9\.9" not found/)
})
