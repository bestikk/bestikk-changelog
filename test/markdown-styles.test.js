import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractReleaseNotes, rollUnreleased } from '../index.js'

const format = 'markdown'

// "title-paren" style, e.g. asciidoctor-emoji's CHANGELOG.md: "## Unreleased" / "## v1.0.0 (date)"

test('title-paren: rollUnreleased inserts "## v<version> (<date>)"', () => {
  const content = '# Changelog\n\n## Unreleased\n\n### Fixed\n\n- Something\n'
  const result = rollUnreleased(content, '1.0.0', '2026-07-22', { format, style: 'title-paren' })
  assert.equal(result, '# Changelog\n\n## Unreleased\n\n## v1.0.0 (2026-07-22)\n\n### Fixed\n\n- Something\n')
})

test('title-paren: extractReleaseNotes extracts a release excerpted from asciidoctor-emoji', async () => {
  // Excerpt from https://github.com/ggrossetie/asciidoctor-emoji/blob/main/CHANGELOG.md
  const content = `# Changelog

## Unreleased

### Breaking Changes

- Rename \`src/asciidoctor-emoji.js\` to \`src/index.js\`

## v1.0.0 (2026-07-22)

1.0.0 rolls up every change from \`1.0.0-beta.1\` below.

### Fixed

- Fix \`tasks/changelog.js notes\` extracting an empty string for a release section

## v1.0.0-beta.1 (2026-07-22)

### Added

- Add an \`emoji-pattern\` document attribute
`

  const notes = await extractReleaseNotes(content, '1.0.0', { format, style: 'title-paren' })
  assert.match(notes, /rolls up every change/)
  assert.match(notes, /### Fixed/)
  assert.match(notes, /Fix `tasks\/changelog\.js notes`/)
  assert.doesNotMatch(notes, /emoji-pattern/)
})

// "title-paren-suffix" style, e.g. asciidoctor-vscode's CHANGELOG.md:
// "## Unreleased" / "## <version> [(qualifier)] (<date>) - @<author>"

test('title-paren-suffix: rollUnreleased inserts "## <version> (<date>) <suffix>"', () => {
  const content = '# Changelog\n\n## Unreleased\n\n### Features\n\n* Something\n'
  const result = rollUnreleased(content, '4.2.1', '2026-07-31', {
    format,
    style: 'title-paren-suffix',
    suffix: '- @ggrossetie',
  })
  assert.equal(
    result,
    '# Changelog\n\n## Unreleased\n\n## 4.2.1 (2026-07-31) - @ggrossetie\n\n### Features\n\n* Something\n',
  )
})

test('title-paren-suffix: extractReleaseNotes extracts a release excerpted from asciidoctor-vscode', async () => {
  // Excerpt from https://github.com/asciidoctor/asciidoctor-vscode/blob/main/CHANGELOG.md
  const content = `# CHANGELOG

## Unreleased

## 4.2.1 (2026-07-31) - @ggrossetie

### Features

* Add \`asciidoc.pdf.outputPath\`

### Bug fixes

* Resolve \`\${workspaceFolder}\` and other VS Code path variables

## 4.2.0 (pre-release) (2026-07-30) - @ggrossetie

### Features

* Add \`asciidoc.antora.siteManifestPath\`
`

  const notes = await extractReleaseNotes(content, '4.2.1', { format, style: 'title-paren-suffix' })
  assert.match(notes, /### Features/)
  assert.match(notes, /Add `asciidoc\.pdf\.outputPath`/)
  assert.match(notes, /### Bug fixes/)
  assert.doesNotMatch(notes, /siteManifestPath/)
})

test('title-paren-suffix: extractReleaseNotes matches a release with a "(pre-release)" qualifier', async () => {
  const content = `## Unreleased

## 4.2.1 (2026-07-31) - @ggrossetie

### Features

* Newer

## 4.2.0 (pre-release) (2026-07-30) - @ggrossetie

### Features

* Add \`asciidoc.antora.siteManifestPath\`
`

  const notes = await extractReleaseNotes(content, '4.2.0', { format, style: 'title-paren-suffix' })
  assert.match(notes, /siteManifestPath/)
})

test('title-paren-suffix: extractReleaseNotes keeps the summary paragraph below a heading without suffix', async () => {
  const content = '## Unreleased\n\n## 1.0.0 (2024-01-15)\n\nSummary of the release.\n\n### Features\n\n* Something\n'
  const notes = await extractReleaseNotes(content, '1.0.0', { format, style: 'title-paren-suffix' })
  assert.match(notes, /## Summary\n\nSummary of the release\.\n/)
  assert.match(notes, /Released on: 2024-01-15/)
})

test('title-paren-suffix: extractReleaseNotes keeps the summary paragraph below a heading with a suffix', async () => {
  const content =
    '## Unreleased\n\n## 1.0.0 (pre-release) (2024-01-15) - @octocat\n\nSummary of the release.\n\n### Features\n\n* Something\n'
  const notes = await extractReleaseNotes(content, '1.0.0', { format, style: 'title-paren-suffix' })
  assert.match(notes, /## Summary\n\nSummary of the release\.\n/)
  assert.match(notes, /Released on: 2024-01-15/)
})

test('rollUnreleased keeps "$" patterns in the suffix verbatim', () => {
  const result = rollUnreleased('## Unreleased\n', '1.0.0', '2024-01-15', {
    format,
    style: 'title-paren-suffix',
    suffix: "- $& $' $$",
  })
  assert.equal(result, "## Unreleased\n\n## 1.0.0 (2024-01-15) - $& $' $$\n")
})

test('extractReleaseNotes rejects an unsupported markdown style', async () => {
  await assert.rejects(
    () => extractReleaseNotes('## Unreleased\n', '1.0.0', { format, style: 'yaml-frontmatter' }),
    /Unsupported changelog style: "yaml-frontmatter"/,
  )
})

test('accepts a legacy (deprecated) custom style object', async () => {
  const customStyle = {
    unreleasedHeading: '## TBD',
    releaseHeadingTemplate: (version, date) => `## Release ${version} — ${date}`,
    releaseHeadingRegex: (escapedVersion) =>
      new RegExp(`(?:^|\\n)## Release ${escapedVersion} — ([^\\n]+)\\n([\\s\\S]*?)(?=\\n## |$)`),
  }

  const content = '## TBD\n\n## Release 1.0.0 — 2024-01-15\n\n### Added\n\n- Something\n'
  const notes = await extractReleaseNotes(content, '1.0.0', { format, style: customStyle })
  assert.match(notes, /### Added/)

  const rolled = rollUnreleased('## TBD\n\n### Added\n\n- Something\n', '2.0.0', '2024-02-01', {
    format,
    style: customStyle,
  })
  assert.match(rolled, /## Release 2\.0\.0 — 2024-02-01/)
})
