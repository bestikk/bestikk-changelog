#!/usr/bin/env node
// Usage:
//   bestikk-changelog release <version> [--file CHANGELOG.adoc] [--format adoc|markdown]
//                                        [--style keepachangelog|title-paren|title-paren-suffix]
//                                        [--release-heading template] [--unreleased-heading text]
//                                        [--date YYYY-MM-DD] [--suffix text]
//   bestikk-changelog notes <version> [--file CHANGELOG.adoc] [--format adoc|markdown]
//                                      [--style keepachangelog|title-paren|title-paren-suffix]
//                                      [--release-heading template] [--unreleased-heading text]
//                                      [--author name] [--previous-tag tag] [--repo-url url]
//                                      [--published-by text]
//
// "--format" defaults to what "--file" looks like ("*.md"/"*.markdown" -> markdown, otherwise
// adoc). "--style" defaults to "keepachangelog" for markdown and "title-paren" for adoc; see
// lib/heading-styles.js for what each preset expects. "--release-heading" (with an optional
// "--unreleased-heading", "Unreleased" by default) replaces "--style" with custom templates,
// e.g. --release-heading "Release {version} ({date})".
//
// Exit codes: 0 on success, 9 on invalid usage (bad command/option, usage printed), 1 on any
// other error (e.g. changelog file or section not found), reported as a single-line message.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs as parseNodeArgs } from 'node:util'
import { extractReleaseNotes, rollUnreleased } from '../index.js'
import { normalizeVersion } from '../lib/util.js'

const USAGE =
  'Usage:\n' +
  '  bestikk-changelog release <version> [--file CHANGELOG.adoc] [--format adoc|markdown]\n' +
  '                                       [--style keepachangelog|title-paren|title-paren-suffix]\n' +
  '                                       [--release-heading template] [--unreleased-heading text]\n' +
  '                                       [--date YYYY-MM-DD] [--suffix text]\n' +
  '  bestikk-changelog notes <version> [--file CHANGELOG.adoc] [--format adoc|markdown]\n' +
  '                                     [--style keepachangelog|title-paren|title-paren-suffix]\n' +
  '                                     [--release-heading template] [--unreleased-heading text]\n' +
  '                                     [--author name] [--previous-tag tag] [--repo-url url]\n' +
  '                                     [--published-by text]'

const COMMANDS = ['release', 'notes']

const OPTIONS = {
  file: { type: 'string', default: 'CHANGELOG.adoc' },
  format: { type: 'string' },
  style: { type: 'string' },
  'release-heading': { type: 'string' },
  'unreleased-heading': { type: 'string' },
  date: { type: 'string' },
  suffix: { type: 'string' },
  author: { type: 'string' },
  'previous-tag': { type: 'string' },
  'repo-url': { type: 'string' },
  'published-by': { type: 'string' },
  help: { type: 'boolean', short: 'h' },
}

class UsageError extends Error {}

// Strict parsing: unknown options and options missing their value (e.g. a trailing "--file",
// or "--file --format md") are rejected instead of silently becoming undefined.
function parseArgs(argv) {
  let parsed
  try {
    parsed = parseNodeArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true })
  } catch (err) {
    throw new UsageError(err.message)
  }
  const { values, positionals } = parsed
  if (values.help) return { help: true }
  const [command, version, ...extra] = positionals
  if (!COMMANDS.includes(command)) {
    throw new UsageError(command ? `Unknown command: ${command}` : 'Missing command')
  }
  if (!version) throw new UsageError(`Missing <version> for the "${command}" command`)
  if (extra.length) throw new UsageError(`Unexpected argument: ${extra[0]}`)
  const {
    'previous-tag': previousTag,
    'repo-url': repoUrl,
    'published-by': publishedBy,
    'release-heading': releaseHeading,
    'unreleased-heading': unreleasedHeading,
    ...options
  } = values
  if (releaseHeading !== undefined && options.style !== undefined) {
    throw new UsageError('--style and --release-heading cannot be used together')
  }
  if (unreleasedHeading !== undefined && releaseHeading === undefined) {
    throw new UsageError('--unreleased-heading requires --release-heading')
  }
  // Custom templates replace the style preset (see lib/heading-styles.js)
  const style =
    releaseHeading === undefined ? options.style : { unreleased: unreleasedHeading, release: releaseHeading }
  // Normalized here too, since it's also used to look up the "v<version>" git tag
  return {
    command,
    version: normalizeVersion(version),
    options: { ...options, style, previousTag, repoUrl, publishedBy },
  }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

// Derives "https://github.com/<owner>/<repo>" from the "origin" remote, supporting
// both SSH ("git@github.com:owner/repo.git") and HTTPS remote URL forms, with or without
// a ".git" extension and a trailing slash.
function inferRepoUrl() {
  try {
    const remote = git(['remote', 'get-url', 'origin'])
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
    return match ? `https://github.com/${match[1]}/${match[2]}` : undefined
  } catch {
    return undefined
  }
}

function inferFormat(file) {
  return /\.(md|markdown)$/i.test(file) ? 'markdown' : 'adoc'
}

function readChangelog(changelogPath) {
  try {
    return readFileSync(changelogPath, 'utf8')
  } catch (err) {
    if (err.code === 'ENOENT') throw new Error(`Changelog file not found: ${changelogPath}`)
    throw err
  }
}

async function run(command, version, options) {
  const changelogPath = resolve(options.file)
  const format = options.format || inferFormat(options.file)
  const style = options.style
  const content = readChangelog(changelogPath)

  if (command === 'release') {
    const releaseDate = options.date || new Date().toISOString().slice(0, 10)
    writeFileSync(
      changelogPath,
      rollUnreleased(content, version, releaseDate, { format, style, suffix: options.suffix }),
    )
    return
  }

  let author = options.author || process.env.GITHUB_ACTOR
  if (!author) {
    try {
      author = git(['log', `v${version}`, '-1', '--format=%an'])
    } catch {
      // no such tag / not a git repo
    }
  }
  let previousTag = options.previousTag
  if (!previousTag) {
    try {
      previousTag = git(['describe', '--abbrev=0', '--tags', `v${version}^`])
    } catch {
      // no previous tag exists
    }
  }
  const repoUrl = options.repoUrl || inferRepoUrl()
  const notes = await extractReleaseNotes(content, version, {
    author,
    previousTag,
    repoUrl,
    publishedBy: options.publishedBy,
    format,
    style,
  })
  process.stdout.write(`${notes}\n`)
}

try {
  const { help, command, version, options } = parseArgs(process.argv.slice(2))
  if (help) {
    console.log(USAGE)
  } else {
    await run(command, version, options)
  }
} catch (err) {
  if (err instanceof UsageError) {
    console.error(`bestikk-changelog: ${err.message}\n\n${USAGE}`)
    process.exitCode = 9
  } else {
    console.error(`bestikk-changelog: ${err.message}`)
    process.exitCode = 1
  }
}
