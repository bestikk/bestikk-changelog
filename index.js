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
//
// Both functions accept CRLF line endings (rollUnreleased() writes them back as-is), and a
// "v"-prefixed version ("v1.2.3" is the same as "1.2.3").
//
// Markdown link reference definitions (e.g. Keep a Changelog's "[1.0.0]: <diff url>" at the
// bottom of the file) are handled on both sides: rollUnreleased() rolls the "[unreleased]"
// diff link, and extractReleaseNotes() carries over the definitions a release section uses
// (see lib/link-references.js).

import * as adocFormat from './lib/formats/adoc.js'
import * as markdownFormat from './lib/formats/markdown.js'
import { resolveStyle } from './lib/heading-styles.js'
import { extractLinkReferenceDefinitions, referencedDefinitions } from './lib/link-references.js'
import { escapeRegExp, maskFencedCodeBlocks, normalizeVersion, unmaskFencedCodeBlocks } from './lib/util.js'

const FORMATS = { adoc: adocFormat, markdown: markdownFormat }
const DEFAULT_STYLE_BY_FORMAT = { adoc: 'title-paren', markdown: 'keepachangelog' }

function resolveFormat(format) {
  const impl = FORMATS[format]
  if (!impl) {
    throw new Error(`Unsupported changelog format: "${format}" (expected one of: ${Object.keys(FORMATS).join(', ')})`)
  }
  return impl
}

// The formats and styles only deal with "\n" line endings
function toLf(content) {
  return content.replace(/\r\n/g, '\n')
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
  const impl = resolveFormat(format)
  const result = impl.rollUnreleased(toLf(content), normalizeVersion(version), releaseDate, rest)
  return content.includes('\r\n') ? result.replace(/\n/g, '\r\n') : result
}

// Splits a release section (already in Markdown) into a summary (intro paragraph before
// the first category) and the structured changelog (the category sections themselves,
// e.g. "### Added").
export function splitChangelog(sectionContent) {
  const firstCategoryIdx = sectionContent.search(/^### /m)
  if (firstCategoryIdx === -1) {
    return { summary: sectionContent.trim(), changelog: '' }
  }
  return {
    summary: sectionContent.slice(0, firstCategoryIdx).trim(),
    changelog: sectionContent.slice(firstCategoryIdx).trim(),
  }
}

// Formats a release's summary and changelog as GitHub release notes (Markdown).
// "repoUrl" and "previousTag" are optional; when both are present, a "full diff" link is added.
// The "Summary" and "Changelog" sections are omitted when empty. "publishedBy" defaults to
// "GitHub"; pass an empty string (or null) to omit the "Published by" line.
export function formatReleaseNotes({
  summary,
  date,
  author,
  previousTag,
  currentTag,
  changelog,
  repoUrl,
  publishedBy = 'GitHub',
  footer = '',
}) {
  const lines = summary ? ['## Summary', '', summary, ''] : []
  lines.push('## Release meta', '', `Released on: ${date}`)
  if (author) lines.push(`Released by: ${author}`)
  if (publishedBy) lines.push(`Published by: ${publishedBy}`)
  if (repoUrl && previousTag) {
    lines.push('', `Logs: [full diff](${repoUrl}/compare/${previousTag}...${currentTag})`)
  }
  if (changelog) lines.push('', '## Changelog', '', changelog)
  if (footer) lines.push('', footer)
  return lines.join('\n').trimEnd()
}

// Extracts a release section and formats it as Markdown release notes. Link reference
// definitions are taken out of the changelog first (so they don't end up in the last section),
// and the ones the release section refers to (e.g. "[#42]") are appended to the notes.
export async function extractReleaseNotes(
  content,
  version,
  { author, previousTag, repoUrl, publishedBy, format = 'adoc', style = DEFAULT_STYLE_BY_FORMAT[format] } = {},
) {
  const markdown = await resolveFormat(format).toMarkdown(toLf(content))
  const normalizedVersion = normalizeVersion(version)
  // Code samples are masked so a "## " or "### " line in a fenced code block can't be taken for
  // the end of the release section, or for a category heading (see lib/util.js)
  const { content: masked, definitions } = extractLinkReferenceDefinitions(maskFencedCodeBlocks(markdown))
  const match = masked.match(resolveStyle(style).releaseHeadingRegex(escapeRegExp(normalizedVersion)))
  if (!match) {
    throw new Error(`Release section for version "${normalizedVersion}" not found in changelog`)
  }
  const [, releaseDate, sectionContent] = match
  const { summary, changelog } = splitChangelog(sectionContent.trim())
  const notes = formatReleaseNotes({
    summary: unmaskFencedCodeBlocks(summary),
    date: releaseDate,
    author,
    previousTag,
    currentTag: `v${normalizedVersion}`,
    changelog: unmaskFencedCodeBlocks(changelog),
    repoUrl,
    publishedBy,
  })
  const used = referencedDefinitions(sectionContent, definitions)
  return used.length ? `${notes}\n\n${unmaskFencedCodeBlocks(used.map(({ line }) => line).join('\n'))}` : notes
}
