#!/usr/bin/env node
// Usage:
//   bestikk-changelog release <version> [--file CHANGELOG.adoc] [--format adoc|markdown]
//                                        [--style keepachangelog|title-paren|title-paren-suffix]
//                                        [--date YYYY-MM-DD] [--suffix text]
//   bestikk-changelog notes <version> [--file CHANGELOG.adoc] [--format adoc|markdown]
//                                      [--style keepachangelog|title-paren|title-paren-suffix]
//                                      [--author name] [--previous-tag tag] [--repo-url url]
//
// "--format" defaults to what "--file" looks like ("*.md"/"*.markdown" -> markdown, otherwise
// adoc). "--style" only applies to the "markdown" format and defaults to "keepachangelog";
// see lib/formats/markdown-styles.js for what each preset expects.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractReleaseNotes, rollUnreleased } from '../index.js'

const OPTION_FLAGS = {
  '--file': 'file',
  '--format': 'format',
  '--style': 'style',
  '--date': 'date',
  '--suffix': 'suffix',
  '--author': 'author',
  '--previous-tag': 'previousTag',
  '--repo-url': 'repoUrl',
}

function parseArgs(argv) {
  const [command, version, ...rest] = argv
  const options = { file: 'CHANGELOG.adoc' }
  for (let i = 0; i < rest.length; i++) {
    const key = OPTION_FLAGS[rest[i]]
    if (!key) {
      throw new Error(`Unknown option: ${rest[i]}`)
    }
    options[key] = rest[++i]
  }
  return { command, version, options }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

// Derives "https://github.com/<owner>/<repo>" from the "origin" remote, supporting
// both SSH ("git@github.com:owner/repo.git") and HTTPS remote URL forms.
function inferRepoUrl() {
  try {
    const remote = git(['remote', 'get-url', 'origin'])
    const match = remote.match(/github\.com[:/]([^/]+)\/(.+?)(\.git)?$/)
    return match ? `https://github.com/${match[1]}/${match[2]}` : undefined
  } catch {
    return undefined
  }
}

function inferFormat(file) {
  return /\.(md|markdown)$/i.test(file) ? 'markdown' : 'adoc'
}

function usageAndExit() {
  console.error(
    'Usage:\n' +
      '  bestikk-changelog release <version> [--file CHANGELOG.adoc] [--format adoc|markdown]\n' +
      '                                       [--style keepachangelog|title-paren|title-paren-suffix]\n' +
      '                                       [--date YYYY-MM-DD] [--suffix text]\n' +
      '  bestikk-changelog notes <version> [--file CHANGELOG.adoc] [--format adoc|markdown]\n' +
      '                                     [--style keepachangelog|title-paren|title-paren-suffix]\n' +
      '                                     [--author name] [--previous-tag tag] [--repo-url url]',
  )
  process.exit(9)
}

let command, version, options
try {
  ;({ command, version, options } = parseArgs(process.argv.slice(2)))
} catch (err) {
  console.error(err.message)
  usageAndExit()
}

if (!version || !['release', 'notes'].includes(command)) usageAndExit()

const changelogPath = resolve(options.file)
const format = options.format || inferFormat(options.file)
const style = options.style
const content = readFileSync(changelogPath, 'utf8')

if (command === 'release') {
  const releaseDate = options.date || new Date().toISOString().slice(0, 10)
  writeFileSync(changelogPath, rollUnreleased(content, version, releaseDate, { format, style, suffix: options.suffix }))
} else {
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
  const notes = await extractReleaseNotes(content, version, { author, previousTag, repoUrl, format, style })
  process.stdout.write(`${notes}\n`)
}
