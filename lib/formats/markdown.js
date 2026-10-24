// Markdown changelog, following the Keep a Changelog conventions (https://keepachangelog.com)
// for structure ("Unreleased" section, category sections such as "### Added") but with a
// configurable heading syntax (the "style" option — see ../heading-styles.js) since projects
// tend to spell the "Unreleased"/release headings slightly differently.

import { assertNotReleased, resolveStyle } from '../heading-styles.js'
import { escapeRegExp } from '../util.js'

// The changelog is already Markdown, so there is nothing to convert.
export async function toMarkdown(content) {
  return content
}

// Rolls the "Unreleased" section into a dated release heading and starts a fresh, empty
// "Unreleased" section above it. "suffix" is forwarded to the style's heading template
// (e.g. "- @octocat" for the "title-paren-suffix" style).
export function rollUnreleased(content, version, releaseDate, { style = 'keepachangelog', suffix } = {}) {
  const { unreleasedHeading, releaseHeadingTemplate } = resolveStyle(style)
  const heading = unreleasedHeading()
  const unreleasedRegex = new RegExp(`^${escapeRegExp(heading)}$`, 'm')
  if (!unreleasedRegex.test(content)) {
    throw new Error(`"${heading}" section not found in changelog`)
  }
  assertNotReleased(content, version, releaseHeadingTemplate, {})
  const releaseHeading = releaseHeadingTemplate(version, releaseDate, { suffix })
  // A replacer function, so "$&"-like patterns in the headings (e.g. from "suffix") are kept as-is
  return content.replace(unreleasedRegex, () => `${heading}\n\n${releaseHeading}`)
}
