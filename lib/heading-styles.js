// A "style" describes the exact heading syntax used for the "Unreleased" section and a
// release heading (version + date, plus whatever else the project puts on that line).
//
// AsciiDoc ("== Unreleased") and Markdown ("## Unreleased") headings differ only in their
// marker ("==" vs "##" — both are a "level 2" heading in their respective syntax), so the
// same style is shared by both formats: lib/formats/adoc.js resolves a style with the "=="
// marker, lib/formats/markdown.js with the default "##" marker.
//
// A style can be selected by name (one of the presets below) or supplied directly as a
// custom { unreleasedHeading, releaseHeadingTemplate, releaseHeadingRegex } object, for a
// convention that doesn't fit any preset. "unreleasedHeading" may be a plain string when a
// custom style only ever targets one syntax (no marker variation needed).
//
// "releaseHeadingRegex" always matches against Markdown (adoc content is converted to
// Markdown before extraction — see index.js), so it's never marker-parameterized.

export const STYLES = {
  // Canonical Keep a Changelog syntax (https://keepachangelog.com):
  //   ## [Unreleased]
  //   ## [1.2.3] - 2024-01-15
  keepachangelog: {
    unreleasedHeading: (marker = '##') => `${marker} [Unreleased]`,
    releaseHeadingTemplate: (version, date, { marker = '##' } = {}) => `${marker} [${version}] - ${date}`,
    releaseHeadingRegex: (escapedVersion) =>
      new RegExp(`(?:^|\\n)## \\[${escapedVersion}\\] - ([^\\n]+)\\n([\\s\\S]*?)(?=\\n## |$)`),
  },

  // e.g. asciidoctor-emoji's CHANGELOG.md, and the AsciiDoc format's default:
  //   ## Unreleased / == Unreleased
  //   ## v1.0.0 (2026-07-22) / == v1.0.0 (2026-07-22)
  'title-paren': {
    unreleasedHeading: (marker = '##') => `${marker} Unreleased`,
    releaseHeadingTemplate: (version, date, { marker = '##' } = {}) => `${marker} v${version} (${date})`,
    releaseHeadingRegex: (escapedVersion) =>
      new RegExp(`(?:^|\\n)## v${escapedVersion} \\(([^)]+)\\)\\n([\\s\\S]*?)(?=\\n## |$)`),
  },

  // e.g. asciidoctor-vscode's CHANGELOG.md:
  //   ## Unreleased
  //   ## 4.2.1 (2026-07-31) - @ggrossetie
  //   ## 4.2.0 (pre-release) (2026-07-30) - @ggrossetie
  // The optional "(pre-release)"-style qualifier and "- @author" suffix are recognized
  // (skipped) when reading, but only the suffix is written back (pass it via the
  // "suffix" option), since it's the project that decides when a release is a pre-release.
  'title-paren-suffix': {
    unreleasedHeading: (marker = '##') => `${marker} Unreleased`,
    releaseHeadingTemplate: (version, date, { marker = '##', suffix } = {}) =>
      `${marker} ${version} (${date})${suffix ? ` ${suffix}` : ''}`,
    releaseHeadingRegex: (escapedVersion) =>
      new RegExp(
        `(?:^|\\n)## ${escapedVersion}(?:\\s+\\([^)]*\\))?\\s+\\(([^)]+)\\)(?:\\s+\\S.*)?\\n([\\s\\S]*?)(?=\\n## |$)`,
      ),
  },
}

export function resolveStyle(style) {
  const raw = resolveRawStyle(style)
  if (typeof raw.unreleasedHeading === 'function') return raw
  return { ...raw, unreleasedHeading: () => raw.unreleasedHeading }
}

function resolveRawStyle(style) {
  if (typeof style === 'object' && style !== null) return style
  const preset = STYLES[style]
  if (!preset) {
    throw new Error(
      `Unsupported markdown changelog style: "${style}" (expected one of: ${Object.keys(STYLES).join(', ')}, or a custom style object)`,
    )
  }
  return preset
}
