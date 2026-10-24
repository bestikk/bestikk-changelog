export function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// "v1.2.3" and "1.2.3" designate the same release (tags are "v"-prefixed, headings and the
// CLI/library arguments are not), so a leading "v" followed by a digit is dropped.
export function normalizeVersion(version) {
  return version.replace(/^v(?=\d)/, '')
}

// "#" at the start of a line inside a fenced code block is swapped for a private-use
// character, so the "##"/"###" headings matched with regexes (release sections, category
// sections) can't be confused with, say, a shell comment in a code sample. The swap keeps
// every other character in place, and unmaskFencedCodeBlocks() restores it.
const MASKED_HASH = '\uE000'
const FENCE_REGEX = /^[ \t]*(`{3,}|~{3,})/

export function maskFencedCodeBlocks(markdown) {
  // Nothing to restore unambiguously if the content already uses that character (very unlikely)
  if (markdown.includes(MASKED_HASH)) return markdown
  let fence
  return markdown
    .split('\n')
    .map((line) => {
      const match = line.match(FENCE_REGEX)
      if (fence) {
        // A closing fence uses the same character, at least as many times, and nothing else
        if (
          match &&
          match[1][0] === fence[0] &&
          match[1].length >= fence.length &&
          !line.trim().slice(match[1].length)
        ) {
          fence = undefined
        } else {
          return line.replace(/^([ \t]*)(#+)/, (_, indent, hashes) => indent + MASKED_HASH.repeat(hashes.length))
        }
      } else if (match) {
        fence = match[1]
      }
      return line
    })
    .join('\n')
}

export function unmaskFencedCodeBlocks(markdown) {
  return markdown.replaceAll(MASKED_HASH, '#')
}
