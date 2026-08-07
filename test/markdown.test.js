import assert from 'node:assert/strict'
import { test } from 'node:test'
import { convertToMarkdown, extractReleaseNotes, rollUnreleased } from '../index.js'

const format = 'markdown'

test('convertToMarkdown returns Markdown content unchanged', async () => {
  const content = '## [Unreleased]\n\n### Added\n\n- Something\n'
  assert.equal(await convertToMarkdown(content, { format }), content)
})

test('rollUnreleased inserts a dated release section above a fresh Unreleased section', () => {
  const content = '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Something\n'
  const result = rollUnreleased(content, '1.0.0', '2024-01-15', { format })
  assert.equal(result, '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2024-01-15\n\n### Added\n\n- Something\n')
})

test('rollUnreleased throws when there is no Unreleased section', () => {
  assert.throws(
    () => rollUnreleased('# Changelog\n\n## [1.0.0] - 2024-01-15\n', '2.0.0', '2024-02-01', { format }),
    /Unreleased/,
  )
})

test('extractReleaseNotes extracts and formats a release section', async () => {
  const content = `# Project Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

## [1.0.0] - 2024-01-15

Summary of the release.

### Added

- New feature (#1)

### Fixed

- A bug

## [0.9.0] - 2023-12-01

### Added

- Older feature
`

  const notes = await extractReleaseNotes(content, '1.0.0', {
    author: 'octocat',
    previousTag: 'v0.9.0',
    repoUrl: 'https://github.com/example/example',
    format,
  })

  assert.match(notes, /Summary of the release\./)
  assert.match(notes, /### Added/)
  assert.match(notes, /- New feature \(#1\)/)
  assert.match(notes, /### Fixed/)
  assert.doesNotMatch(notes, /Older feature/)
  assert.match(notes, /\[full diff]\(https:\/\/github\.com\/example\/example\/compare\/v0\.9\.0\.\.\.v1\.0\.0\)/)
})

test('extractReleaseNotes throws when the version section is not found', async () => {
  const content = '## [Unreleased]\n\n## [1.0.0] - 2024-01-15\n\n### Added\n\n- Something\n'
  await assert.rejects(
    () => extractReleaseNotes(content, '9.9.9', { format }),
    /Release section for version "9\.9\.9" not found/,
  )
})
