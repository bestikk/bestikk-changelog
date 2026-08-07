// bestikk-changelog — manage a Keep a Changelog (https://keepachangelog.com) style
// CHANGELOG.adoc: roll the "Unreleased" section into a dated release section, and
// extract a release section as Markdown release notes (via downdoc).
//
// Changelog structure expected:
//
//   == Unreleased
//
//   == v1.2.3 (2024-01-15)
//
//   Optional summary paragraph.
//
//   === Added
//
//   * ...
//
//   === Fixed
//
//   * ...

import downdoc from 'downdoc'

const UNRELEASED_HEADING = '== Unreleased'

// Converts an AsciiDoc changelog to Markdown. The whole document is converted
// at once (rather than an extracted section in isolation) so document-level
// context — attribute references such as "{uri-repo}/issues/1857[#1857]" in
// particular — resolves correctly.
export function convertAsciidocToMarkdown(content) {
  return downdoc(content)
}

// Rolls the "== Unreleased" section into "== v<version> (<releaseDate>)" and
// starts a fresh, empty "== Unreleased" section above it.
export function rollUnreleased(content, version, releaseDate) {
  const unreleasedRegex = new RegExp(`^${UNRELEASED_HEADING}$`, 'm')
  if (!unreleasedRegex.test(content)) {
    throw new Error(`"${UNRELEASED_HEADING}" section not found in changelog`)
  }
  return content.replace(unreleasedRegex, `${UNRELEASED_HEADING}\n\n== v${version} (${releaseDate})`)
}

// Splits a release section (already converted to Markdown) into a summary
// (intro paragraph before the first category) and the structured changelog
// (the category sections themselves, e.g. "### Added").
export function splitChangelog(sectionContent) {
  const firstCategoryIdx = sectionContent.search(/^### /m)
  if (firstCategoryIdx === -1) {
    return { summary: sectionContent, changelog: '' }
  }
  return {
    summary: sectionContent.slice(0, firstCategoryIdx).trim(),
    changelog: sectionContent.slice(firstCategoryIdx).trim(),
  }
}

// Formats a release's summary and changelog as GitHub release notes (Markdown).
// "repoUrl" and "previousTag" are optional; when both are present, a "full diff" link is added.
export function formatReleaseNotes({
  summary,
  date,
  author,
  previousTag,
  currentTag,
  changelog,
  repoUrl,
  footer = '',
}) {
  const lines = ['## Summary', '', summary, '', '## Release meta', '', `Released on: ${date}`]
  if (author) lines.push(`Released by: ${author}`)
  lines.push('Published by: GitHub')
  if (repoUrl && previousTag) {
    lines.push('', `Logs: [full diff](${repoUrl}/compare/${previousTag}...${currentTag})`)
  }
  lines.push('', '## Changelog', '', changelog)
  if (footer) lines.push('', footer)
  return lines.join('\n').trimEnd()
}

// Extracts the "== v<version> (date)" section and formats it as Markdown release notes.
export function extractReleaseNotes(content, version, { author, previousTag, repoUrl } = {}) {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const markdown = convertAsciidocToMarkdown(content)
  const headerRegex = new RegExp(`## v${escapedVersion} \\(([^)]+)\\)\\n([\\s\\S]*?)(?=\\n## |$)`)
  const match = markdown.match(headerRegex)
  if (!match) {
    throw new Error(`Section "== v${version}" not found in changelog`)
  }
  const [, releaseDate, sectionContent] = match
  const { summary, changelog } = splitChangelog(sectionContent.trim())
  return formatReleaseNotes({
    summary,
    date: releaseDate,
    author,
    previousTag,
    currentTag: `v${version}`,
    changelog,
    repoUrl,
  })
}
