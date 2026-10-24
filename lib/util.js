export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// "v1.2.3" and "1.2.3" designate the same release (tags are "v"-prefixed, headings and the
// CLI/library arguments are not), so a leading "v" followed by a digit is dropped.
export function normalizeVersion(version) {
  return version.replace(/^v(?=\d)/, '')
}

const FENCE_REGEX = /^[ \t]*(`{3,}|~{3,})/

// Tells, for each line, whether it belongs to a fenced code block (fence lines included).
export function fencedLines(lines) {
  let fence
  return lines.map((line) => {
    const match = line.match(FENCE_REGEX)
    if (!fence) {
      if (match) fence = match[1]
      return Boolean(match)
    }
    // A closing fence uses the same character, at least as many times, and nothing else
    if (match && match[1][0] === fence[0] && match[1].length >= fence.length && !line.trim().slice(match[1].length)) {
      fence = undefined
    }
    return true
  })
}

// "#" at the start of a line inside a fenced code block is swapped for a private-use
// character, so the "##"/"###" headings matched with regexes (release sections, category
// sections) can't be confused with, say, a shell comment in a code sample. The swap keeps
// every other character in place, and unmaskFencedCodeBlocks() restores it.
const MASKED_HASH = '\uE000'

export function maskFencedCodeBlocks(markdown) {
  // Nothing to restore unambiguously if the content already uses that character (very unlikely)
  if (markdown.includes(MASKED_HASH)) return markdown
  const lines = markdown.split('\n')
  const inFence = fencedLines(lines)
  return lines
    .map((line, i) =>
      inFence[i]
        ? line.replace(/^([ \t]*)(#+)/, (_, indent, hashes) => indent + MASKED_HASH.repeat(hashes.length))
        : line,
    )
    .join('\n')
}

export function unmaskFencedCodeBlocks(markdown) {
  return markdown.replaceAll(MASKED_HASH, '#')
}
