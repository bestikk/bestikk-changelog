// AsciiDoc changelog format:
//
//   == Unreleased
//
//   == v1.2.3 (2024-01-15)
//
//   === Added
//
//   * ...
//
// Same heading structure as the "title-paren" Markdown style (see ../heading-styles.js),
// just with the AsciiDoc "==" heading marker instead of Markdown's "##" — so rollUnreleased()
// resolves that style with the "==" marker instead of duplicating its templates. downdoc
// then renders this heading as Markdown "## Unreleased" / "## v<version> (<date>)", which is
// what extractReleaseNotes() matches against by default for this format (see index.js).

import { assertNotReleased, resolveStyle } from '../heading-styles.js'
import { escapeRegExp } from '../util.js'

const MARKER = '=='

let downdocPromise

// downdoc is an optional dependency: it is only required to process AsciiDoc
// changelogs, so it is loaded lazily and only once it's actually needed.
function loadDowndoc() {
  if (!downdocPromise) {
    downdocPromise = import('downdoc').then(
      (mod) => mod.default,
      () => {
        throw new Error(
          'The "downdoc" package is required to process an AsciiDoc changelog. Install it with: npm install downdoc',
        )
      },
    )
  }
  return downdocPromise
}

// Converts the whole changelog to Markdown. The whole document is converted at once (rather
// than an extracted section in isolation) so document-level context — attribute references
// such as "{uri-repo}/issues/1857[#1857]" in particular — resolves correctly.
export async function toMarkdown(content) {
  const downdoc = await loadDowndoc()
  return downdoc(content)
}

// Rolls the "== Unreleased" section into a dated release heading and starts a fresh, empty
// "== Unreleased" section above it. "suffix" is forwarded to the style's heading template
// (e.g. "- @octocat" for the "title-paren-suffix" style).
export function rollUnreleased(content, version, releaseDate, { style = 'title-paren', suffix } = {}) {
  const resolvedStyle = resolveStyle(style)
  const heading = resolvedStyle.unreleasedHeading(MARKER)
  const unreleasedRegex = new RegExp(`^${escapeRegExp(heading)}$`, 'm')
  if (!unreleasedRegex.test(content)) {
    throw new Error(`"${heading}" section not found in changelog`)
  }
  assertNotReleased(content, version, resolvedStyle, MARKER)
  const releaseHeading = resolvedStyle.releaseHeadingTemplate(version, releaseDate, { marker: MARKER, suffix })
  // A replacer function, so "$&"-like patterns in the headings (e.g. from "suffix") are kept as-is
  return content.replace(unreleasedRegex, () => `${heading}\n\n${releaseHeading}`)
}
