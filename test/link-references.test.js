import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractReleaseNotes, rollUnreleased } from '../index.js'

const format = 'markdown'

// A canonical Keep a Changelog file, with diff links at the bottom and a reference-style link
const CHANGELOG = `# Changelog

## [Unreleased]

### Added

- Export to PDF ([#42])

## [1.1.0] - 2024-02-01

### Fixed

- Crash on empty input ([#40])

## [1.0.0] - 2024-01-15

### Added

- Initial release

[unreleased]: https://github.com/octocat/hello-world/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/octocat/hello-world/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/octocat/hello-world/releases/tag/v1.0.0
[#40]: https://github.com/octocat/hello-world/issues/40
[#42]: https://github.com/octocat/hello-world/issues/42
`

// Rolling

test('rollUnreleased rolls the "[unreleased]" diff link and adds one for the new release', () => {
  const result = rollUnreleased(CHANGELOG, '1.2.0', '2024-03-01', { format })
  assert.match(
    result,
    /\n\[unreleased]: https:\/\/github\.com\/octocat\/hello-world\/compare\/v1\.2\.0\.\.\.HEAD\n\[1\.2\.0]: https:\/\/github\.com\/octocat\/hello-world\/compare\/v1\.1\.0\.\.\.v1\.2\.0\n\[1\.1\.0]: /,
  )
  assert.match(result, /\n## \[Unreleased]\n\n## \[1\.2\.0] - 2024-03-01\n/)
})

test('rollUnreleased keeps the label case and a tag without "v" prefix', () => {
  const content = '## [Unreleased]\n\n- Something\n\n[Unreleased]: https://gitlab.com/o/r/-/compare/1.0.0...HEAD\n'
  const result = rollUnreleased(content, '1.1.0', '2024-03-01', { format })
  assert.equal(
    result,
    '## [Unreleased]\n\n## [1.1.0] - 2024-03-01\n\n- Something\n\n' +
      '[Unreleased]: https://gitlab.com/o/r/-/compare/1.1.0...HEAD\n' +
      '[1.1.0]: https://gitlab.com/o/r/-/compare/1.0.0...1.1.0\n',
  )
})

test('rollUnreleased keeps CRLF line endings when rolling the diff link', () => {
  const content =
    '## [Unreleased]\r\n\r\n- Something\r\n\r\n[unreleased]: https://github.com/o/r/compare/v1.0.0...HEAD\r\n'
  const result = rollUnreleased(content, '1.1.0', '2024-03-01', { format })
  assert.match(result, /\r\n\[unreleased]: https:\/\/github\.com\/o\/r\/compare\/v1\.1\.0\.\.\.HEAD\r\n\[1\.1\.0]: /)
  assert.doesNotMatch(result, /[^\r]\n/)
})

test('rollUnreleased leaves the changelog alone without a "[unreleased]: .../compare/...HEAD" definition', () => {
  for (const definitions of ['', '[unreleased]: https://github.com/o/r/commits/main\n']) {
    const content = `## [Unreleased]\n\n- Something\n\n${definitions}`
    const result = rollUnreleased(content, '1.1.0', '2024-03-01', { format })
    assert.equal(result, `## [Unreleased]\n\n## [1.1.0] - 2024-03-01\n\n- Something\n\n${definitions}`)
  }
})

test('rollUnreleased ignores an "[unreleased]" definition in a fenced code block', () => {
  const content = '## [Unreleased]\n\n```md\n[unreleased]: https://github.com/o/r/compare/v1.0.0...HEAD\n```\n'
  const result = rollUnreleased(content, '1.1.0', '2024-03-01', { format })
  assert.match(result, /```md\n\[unreleased]: https:\/\/github\.com\/o\/r\/compare\/v1\.0\.0\.\.\.HEAD\n```/)
})

// Extracting

test('extractReleaseNotes does not include the definitions in the last release section', async () => {
  const notes = await extractReleaseNotes(CHANGELOG, '1.0.0', { format })
  assert.match(notes, /### Added\n\n- Initial release$/)
})

test('extractReleaseNotes appends the definitions referenced by the release section', async () => {
  const notes = await extractReleaseNotes(CHANGELOG, '1.1.0', { format })
  assert.match(
    notes,
    /- Crash on empty input \(\[#40]\)\n\n\[#40]: https:\/\/github\.com\/octocat\/hello-world\/issues\/40$/,
  )
  assert.doesNotMatch(notes, /\[#42]|\[unreleased]:|\[1\.0\.0]:/)
})

test('extractReleaseNotes recognizes full, collapsed and case-insensitive references, but not inline links', async () => {
  const content = `## [1.0.0] - 2024-01-15

- [Full][Docs], [collapsed][], [inline](https://example.com/inline)

[docs]: https://example.com/docs
[collapsed]: https://example.com/collapsed
[inline]: https://example.com/unused
`
  const notes = await extractReleaseNotes(content, '1.0.0', { format })
  assert.match(notes, /\n\n\[docs]: https:\/\/example\.com\/docs\n\[collapsed]: https:\/\/example\.com\/collapsed$/)
  assert.doesNotMatch(notes, /unused/)
})

test('extractReleaseNotes keeps definition-like lines in code blocks and paragraphs', async () => {
  const content = `## [1.0.0] - 2024-01-15

- Configure:

\`\`\`ini
[section]: value
\`\`\`

Paragraph
[not]: a definition
`
  const notes = await extractReleaseNotes(content, '1.0.0', { format })
  assert.match(notes, /```ini\n\[section]: value\n```/)
  assert.match(notes, /Paragraph\n\[not]: a definition\n\n## Release meta/)
})
