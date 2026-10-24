// A "style" describes the exact heading syntax used for the "Unreleased" section and a
// release heading (version + date, plus whatever else the project puts on that line).
//
// A style is a pair of templates, written without the heading marker:
//
//   { unreleased: '[Unreleased]', release: '[{version}] - {date}' }
//
// The same templates are used to write the headings (rollUnreleased) and to read them back
// (extractReleaseNotes, and the duplicate release check), so the two can't drift apart. The
// marker is added by the format: AsciiDoc ("== Unreleased") and Markdown ("## Unreleased")
// headings differ only in their marker, both being a "level 2" heading in their syntax.
//
// Release template placeholders (see PLACEHOLDERS):
//
//   {version}    required, the version (without "v" prefix: write "v{version}" for one)
//   {date}       required, the release date
//   {qualifier}  optional, e.g. "(pre-release)": recognized when reading, never written
//   {suffix}     optional, free-form text up to the end of the line, written from the
//                "suffix" option (e.g. "- @octocat")
//
// Optional placeholders must be preceded by whitespace, which goes away with them when they're
// absent. Any whitespace in a template matches any run of spaces/tabs when reading.
//
// A style can be selected by name (one of the presets below) or given as a template object.
// The legacy { unreleasedHeading, releaseHeadingTemplate, releaseHeadingRegex } custom style
// object is still accepted, but deprecated.

import { escapeRegExp } from './util.js'

// This list of presets is frozen (see the README): a new convention should go through a
// custom template object instead.
export const STYLES = {
  // Canonical Keep a Changelog syntax (https://keepachangelog.com):
  //   ## [Unreleased]
  //   ## [1.2.3] - 2024-01-15
  keepachangelog: { unreleased: '[Unreleased]', release: '[{version}] - {date}' },

  // e.g. asciidoctor-emoji's CHANGELOG.md, and the AsciiDoc format's default:
  //   ## Unreleased / == Unreleased
  //   ## v1.0.0 (2026-07-22) / == v1.0.0 (2026-07-22)
  'title-paren': { unreleased: 'Unreleased', release: 'v{version} ({date})' },

  // e.g. asciidoctor-vscode's CHANGELOG.md:
  //   ## Unreleased
  //   ## 4.2.1 (2026-07-31) - @ggrossetie
  //   ## 4.2.0 (pre-release) (2026-07-30) - @ggrossetie
  'title-paren-suffix': { unreleased: 'Unreleased', release: '{version} {qualifier} ({date}) {suffix}' },
}

// "pattern" is what the placeholder matches when reading ({version} is matched literally).
// Patterns never span lines, so a heading can't swallow the first line of the section below it.
const PLACEHOLDERS = {
  version: { required: true },
  // The one capturing group of a heading pattern
  date: { required: true, pattern: '([^\\n]+?)' },
  qualifier: { optional: true, pattern: '\\([^)\\n]*\\)' },
  suffix: { optional: true, pattern: '\\S[^\\n]*?' },
}

const PLACEHOLDER_REGEX = /\{(\w+)\}/g

// Splits a release template into literal and placeholder tokens, validating it on the way.
function parseTemplate(template) {
  if (typeof template !== 'string') {
    throw new Error(`Invalid release heading template: expected a string, got ${typeof template}`)
  }
  const tokens = []
  let index = 0
  for (const { 0: match, 1: name, index: start } of template.matchAll(PLACEHOLDER_REGEX)) {
    const placeholder = PLACEHOLDERS[name]
    if (!placeholder) {
      const expected = Object.keys(PLACEHOLDERS)
        .map((key) => `{${key}}`)
        .join(', ')
      throw new Error(
        `Unknown placeholder "{${name}}" in release heading template "${template}" (expected: ${expected})`,
      )
    }
    if (tokens.some((token) => token.name === name)) {
      throw new Error(`Placeholder "{${name}}" appears more than once in release heading template "${template}"`)
    }
    let literal = template.slice(index, start)
    let separator
    if (placeholder.optional) {
      separator = literal.match(/[ \t]+$/)?.[0]
      if (!separator) {
        throw new Error(`Optional placeholder "{${name}}" must be preceded by whitespace in "${template}"`)
      }
      literal = literal.slice(0, -separator.length)
    }
    if (literal) tokens.push({ literal })
    tokens.push({ name, separator })
    index = start + match.length
  }
  if (index < template.length) tokens.push({ literal: template.slice(index) })
  for (const [name, { required }] of Object.entries(PLACEHOLDERS)) {
    if (required && !tokens.some((token) => token.name === name)) {
      throw new Error(`Release heading template "${template}" must contain a "{${name}}" placeholder`)
    }
  }
  return tokens
}

function literalPattern(literal) {
  return escapeRegExp(literal).replace(/[ \t]+/g, '[ \\t]+')
}

function compileTemplates({ unreleased = 'Unreleased', release }) {
  if (typeof unreleased !== 'string') {
    throw new Error(`Invalid unreleased heading: expected a string, got ${typeof unreleased}`)
  }
  const tokens = parseTemplate(release)
  const render = (values) =>
    tokens
      .map(({ literal, name, separator }) => {
        if (literal !== undefined) return literal
        if (separator === undefined) return values[name]
        return values[name] ? `${separator}${values[name]}` : ''
      })
      .join('')
  // The heading text after the marker, for a given (already escaped) version
  const pattern = (escapedVersion) =>
    tokens
      .map(({ literal, name, separator }) => {
        if (literal !== undefined) return literalPattern(literal)
        const placeholderPattern = name === 'version' ? escapedVersion : PLACEHOLDERS[name].pattern
        return separator === undefined ? placeholderPattern : `(?:[ \\t]+${placeholderPattern})?`
      })
      .join('')
  return {
    unreleasedHeading: (marker = '##') => `${marker} ${unreleased}`,
    releaseHeadingTemplate: (version, date, { marker = '##', suffix } = {}) =>
      `${marker} ${render({ version, date, suffix })}`,
    // Group 1 is the date, group 2 the section content. The heading's line break is left in the
    // section rather than consumed, so a section directly followed by the next heading is empty.
    releaseHeadingRegex: (escapedVersion) =>
      new RegExp(`(?:^|\\n)##[ \\t]+${pattern(escapedVersion)}[ \\t]*(?=\\n|$)([\\s\\S]*?)(?=\\n## |$)`),
    releaseHeadingLineRegex: (escapedVersion, marker) =>
      new RegExp(`^${escapeRegExp(marker)}[ \\t]+${pattern(escapedVersion)}[ \\t]*$`, 'm'),
  }
}

let legacyStyleWarned = false

// The legacy custom style object: "unreleasedHeading" may be a plain string when the style only
// ever targets one syntax, and "releaseHeadingRegex" always matches against Markdown.
function legacyStyle(style) {
  if (!legacyStyleWarned) {
    legacyStyleWarned = true
    process.emitWarning(
      'Custom style objects with "releaseHeadingTemplate"/"releaseHeadingRegex" functions are deprecated, use a { unreleased, release } template object instead',
      { type: 'DeprecationWarning', code: 'BESTIKK_CHANGELOG_DEP001' },
    )
  }
  if (typeof style.unreleasedHeading === 'function') return style
  return { ...style, unreleasedHeading: () => style.unreleasedHeading }
}

export function resolveStyle(style) {
  if (typeof style === 'object' && style !== null) {
    if ('releaseHeadingTemplate' in style || 'releaseHeadingRegex' in style) return legacyStyle(style)
    return compileTemplates(style)
  }
  const preset = STYLES[style]
  if (!preset) {
    throw new Error(
      `Unsupported changelog style: "${style}" (expected one of: ${Object.keys(STYLES).join(', ')}, or a { unreleased, release } template object)`,
    )
  }
  return compileTemplates(preset)
}

// Throws if the changelog already has a release heading for this version, whatever its date
// (and qualifier/suffix). For a legacy style, the heading is rendered with a placeholder date,
// and everything before it (e.g. "## [1.2.3] - ") is looked up at the start of a line.
export function assertNotReleased(content, version, style, marker) {
  let regex
  if (style.releaseHeadingLineRegex) {
    regex = style.releaseHeadingLineRegex(escapeRegExp(version), marker)
  } else {
    const DATE = '\u0000'
    const heading = style.releaseHeadingTemplate(version, DATE, { marker })
    const prefix = heading.includes(DATE) ? heading.slice(0, heading.indexOf(DATE)) : heading
    regex = new RegExp(`^${escapeRegExp(prefix)}`, 'm')
  }
  if (regex.test(content)) {
    throw new Error(`A release section for version "${version}" already exists in changelog`)
  }
}
