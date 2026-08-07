// bestikk-changelog — manage a Keep a Changelog (https://keepachangelog.com) style
// changelog: roll the "Unreleased" section into a dated release section, and extract
// a release section as Markdown release notes (e.g. for a GitHub release).
//
// Two source formats are supported (see the "format" option, default "adoc"):
//
//   - "adoc": AsciiDoc, converted to Markdown via the optional "downdoc" dependency
//   - "markdown": native Markdown, used as-is
//
// rollUnreleased() edits the changelog in its native syntax, since it writes back to the
// original file (see lib/formats/adoc.js and lib/formats/markdown.js).
//
// extractReleaseNotes(), on the other hand, only reads the changelog, so both formats are
// first converted to Markdown and then matched the same way, against a "style" describing
// the exact heading syntax (a preset name or a custom style object — see
// lib/heading-styles.js), since projects tend to spell the "Unreleased"/release headings
// slightly differently. The style defaults to whatever downdoc/the format naturally
// produces ("title-paren" for "adoc", "keepachangelog" for "markdown").

import * as adocFormat from './lib/formats/adoc.js'
import * as markdownFormat from './lib/formats/markdown.js'
import { resolveStyle } from './lib/heading-styles.js'
import { escapeRegExp } from './lib/util.js'

const FORMATS = { adoc: adocFormat, markdown: markdownFormat }
const DEFAULT_STYLE_BY_FORMAT = { adoc: 'title-paren', markdown: 'keepachangelog' }

function resolveFormat(format) {
  const impl = FORMATS[format]
  if (!impl) {
    throw new Error(`Unsupported changelog format: "${format}" (expected one of: ${Object.keys(FORMATS).join(', ')})`)
  }
  return impl
}

// Converts the whole changelog to Markdown. For "markdown", this is a no-op; for "adoc",
// this lazily loads the optional "downdoc" dependency.
export async function convertToMarkdown(content, { format = 'adoc' } = {}) {
  return resolveFormat(format).toMarkdown(content)
}

// Rolls the "Unreleased" section into a dated release heading and starts a fresh, empty
// "Unreleased" section above it, in the changelog's native syntax. Extra options (e.g.
// "style" and "suffix", see lib/heading-styles.js) are forwarded to the format implementation.
export function rollUnreleased(content, version, releaseDate, { format = 'adoc', ...rest } = {}) {
  return resolveFormat(format).rollUnreleased(content, version, releaseDate, rest)
}

// Splits a release section (already in Markdown) into a summary (intro paragraph before
// the first category) and the structured changelog (the category sections themselves,
// e.g. "### Added").
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

// Extracts a release section and formats it as Markdown release notes.
export async function extractReleaseNotes(
  content,
  version,
  { author, previousTag, repoUrl, format = 'adoc', style = DEFAULT_STYLE_BY_FORMAT[format] } = {},
) {
  const markdown = await resolveFormat(format).toMarkdown(content)
  const escapedVersion = escapeRegExp(version)
  const match = markdown.match(resolveStyle(style).releaseHeadingRegex(escapedVersion))
  if (!match) {
    throw new Error(`Release section for version "${version}" not found in changelog`)
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
