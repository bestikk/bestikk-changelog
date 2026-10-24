import assert from 'node:assert/strict'
import { test } from 'node:test'
import { extractReleaseNotes, formatReleaseNotes, rollUnreleased, splitChangelog } from '../index.js'

test('splitChangelog separates the summary from the category sections', () => {
  const { summary, changelog } = splitChangelog('A short summary.\n\n### Added\n\n* Something\n')
  assert.equal(summary, 'A short summary.')
  assert.equal(changelog, '### Added\n\n* Something')
})

test('splitChangelog returns an empty changelog when there are no categories', () => {
  const { summary, changelog } = splitChangelog('Just a summary, no categories.')
  assert.equal(summary, 'Just a summary, no categories.')
  assert.equal(changelog, '')
})

test('formatReleaseNotes renders release meta and a full diff link when repoUrl and previousTag are given', () => {
  const notes = formatReleaseNotes({
    summary: 'Summary.',
    date: '2024-01-15',
    author: 'octocat',
    previousTag: 'v0.9.0',
    currentTag: 'v1.0.0',
    changelog: '### Added\n\n* Something',
    repoUrl: 'https://github.com/example/example',
  })
  assert.match(notes, /Released on: 2024-01-15/)
  assert.match(notes, /Released by: octocat/)
  assert.match(notes, /\[full diff]\(https:\/\/github\.com\/example\/example\/compare\/v0\.9\.0\.\.\.v1\.0\.0\)/)
})

test('formatReleaseNotes omits the diff link when repoUrl is missing', () => {
  const notes = formatReleaseNotes({
    summary: 'Summary.',
    date: '2024-01-15',
    currentTag: 'v1.0.0',
    changelog: '### Added\n\n* Something',
  })
  assert.doesNotMatch(notes, /full diff/)
})

test('formatReleaseNotes renders "Published by: GitHub" by default', () => {
  const notes = formatReleaseNotes({ summary: 'Summary.', date: '2024-01-15', currentTag: 'v1.0.0', changelog: '' })
  assert.match(notes, /\nPublished by: GitHub$/)
})

test('formatReleaseNotes accepts a custom "publishedBy", or omits the line when empty', () => {
  const base = { summary: 'Summary.', date: '2024-01-15', author: 'octocat', currentTag: 'v1.0.0', changelog: '' }
  assert.match(formatReleaseNotes({ ...base, publishedBy: 'GitLab CI' }), /\nPublished by: GitLab CI$/)
  for (const publishedBy of ['', null]) {
    const notes = formatReleaseNotes({ ...base, publishedBy })
    assert.doesNotMatch(notes, /Published by/)
    assert.match(notes, /Released by: octocat$/)
  }
})

test('extractReleaseNotes forwards "publishedBy"', async () => {
  const content = '## [1.0.0] - 2024-01-15\n\n### Added\n\n- Something\n'
  const notes = await extractReleaseNotes(content, '1.0.0', { format: 'markdown', publishedBy: 'Jenkins' })
  assert.match(notes, /Published by: Jenkins\n/)
})

test('rollUnreleased rejects an unsupported format', () => {
  assert.throws(
    () => rollUnreleased('== Unreleased\n', '1.0.0', '2024-01-15', { format: 'yaml' }),
    /Unsupported changelog format: "yaml"/,
  )
})

test('extractReleaseNotes rejects an unsupported format', async () => {
  await assert.rejects(
    () => extractReleaseNotes('== Unreleased\n', '1.0.0', { format: 'yaml' }),
    /Unsupported changelog format: "yaml"/,
  )
})
