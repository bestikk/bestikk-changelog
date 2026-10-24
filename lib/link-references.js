// Markdown link reference definitions, such as the ones Keep a Changelog puts at the bottom
// of a CHANGELOG.md to link each release heading to its diff:
//
//   ## [Unreleased]
//   ## [1.1.0] - 2024-02-01
//   ...
//   [unreleased]: https://github.com/owner/repo/compare/v1.1.0...HEAD
//   [1.1.0]: https://github.com/owner/repo/compare/v1.0.0...v1.1.0
//
// Only single-line definitions are supported. Lines in fenced code blocks are left alone.

import { escapeRegExp, fencedLines } from './util.js'

const DEFINITION_REGEX = /^ {0,3}\[((?:[^\]\\]|\\.)+)\]:[ \t]*\S/
const HEADING_REGEX = /^ {0,3}#{1,6}(?:[ \t]|$)/
const UNRELEASED_DEFINITION_REGEX = /^( {0,3})\[(unreleased)\]:[ \t]*(\S*\/compare\/)(\S+?)\.\.\.HEAD[ \t]*$/i

// Splits the link reference definitions out of a Markdown document, returning the document
// without them and the definitions themselves ({ label, line }). A definition-like line that
// continues a paragraph is not a definition (a definition can't interrupt a paragraph).
export function extractLinkReferenceDefinitions(markdown) {
  const lines = markdown.split('\n')
  const inFence = fencedLines(lines)
  const content = []
  const definitions = []
  let afterBreak = true
  lines.forEach((line, i) => {
    const match = !inFence[i] && afterBreak && line.match(DEFINITION_REGEX)
    if (match) {
      definitions.push({ label: match[1], line: line.trim() })
    } else {
      content.push(line)
    }
    afterBreak = Boolean(match) || line.trim() === '' || HEADING_REGEX.test(line)
  })
  return { content: content.join('\n'), definitions }
}

// Keeps the definitions that the Markdown content refers to, as "[label]", "[text][label]" or
// "[label][]" (labels are case-insensitive), but not as "[label](url)", which is an inline link.
export function referencedDefinitions(content, definitions) {
  return definitions.filter(({ label }) => new RegExp(`\\[${escapeRegExp(label)}\\](?!\\()`, 'i').test(content))
}

// Rolls an "[unreleased]: <base>/compare/<previous tag>...HEAD" definition, if any, into
// "[unreleased]: <base>/compare/<new tag>...HEAD" followed by a
// "[<version>]: <base>/compare/<previous tag>...<new tag>" definition. The new tag is
// "v"-prefixed if the previous one is. A changelog without such a definition is left unchanged,
// since there's no telling what the links should look like.
export function rollUnreleasedLinkReference(markdown, version) {
  const lines = markdown.split('\n')
  const inFence = fencedLines(lines)
  const index = lines.findIndex((line, i) => !inFence[i] && UNRELEASED_DEFINITION_REGEX.test(line))
  if (index === -1) return markdown
  const [, indent, label, base, previousTag] = lines[index].match(UNRELEASED_DEFINITION_REGEX)
  const tag = /^v\d/.test(previousTag) ? `v${version}` : version
  lines.splice(
    index,
    1,
    `${indent}[${label}]: ${base}${tag}...HEAD`,
    `${indent}[${version}]: ${base}${previousTag}...${tag}`,
  )
  return lines.join('\n')
}
