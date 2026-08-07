// Keep a Changelog (https://keepachangelog.com) Markdown format:
//
//   ## [Unreleased]
//
//   ## [1.2.3] - 2024-01-15
//
//   ### Added
//
//   - ...

import { escapeRegExp } from '../util.js'

const UNRELEASED_HEADING = '## [Unreleased]'

// The changelog is already Markdown, so there is nothing to convert.
export async function toMarkdown(content) {
  return content
}

// Rolls the "## [Unreleased]" section into "## [<version>] - <releaseDate>" and starts a
// fresh, empty "## [Unreleased]" section above it.
export function rollUnreleased(content, version, releaseDate) {
  const unreleasedRegex = new RegExp(`^${escapeRegExp(UNRELEASED_HEADING)}$`, 'm')
  if (!unreleasedRegex.test(content)) {
    throw new Error(`"${UNRELEASED_HEADING}" section not found in changelog`)
  }
  return content.replace(unreleasedRegex, `${UNRELEASED_HEADING}\n\n## [${version}] - ${releaseDate}`)
}

// Matches a release section. Capture groups: 1) the release date, 2) the section content (up
// to, but excluding, the next "## " heading).
export function releaseHeaderRegex(escapedVersion) {
  return new RegExp(`(?:^|\\n)## \\[${escapedVersion}\\] - ([^\\n]+)\\n([\\s\\S]*?)(?=\\n## |$)`)
}
