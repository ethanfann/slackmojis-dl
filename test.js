const test = require('ava')
const fs = require('fs')
const path = require('path')
const extractEmojiName = require('./util/extractEmojiName')
const getLastPage = require('./util/getLastPage')
const download = require('./util/download')
const getPage = require('./util/getPage')
const obtain = require('./util/obtain')
const prepare = require('./util/prepare')
const loadExistingEmojis = require('./util/loadExistingEmojis')

const testDir = `${__dirname}/temp/emojis`
if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true })
fs.mkdirSync(testDir, { recursive: true })

test('downloads emojis', async (t) => {
  const results = await getPage(0)
  const prepared = prepare(results, null, testDir)

  const emoji = prepared[0]
  if (!fs.existsSync(emoji.dest)) fs.mkdirSync(emoji.dest)
  await download(emoji.url, path.join(emoji.dest, emoji.name))

  t.is(loadExistingEmojis(testDir).length === 1, true)
})

test('filter emojis when a category is specified', async (t) => {
  const results = await getPage(0)
  const prepared = prepare(results, 'Party Parrot', testDir)

  let flag = false
  prepared.forEach((emoji) => (flag = emoji.dest.includes('Party Parrot')))

  t.is(prepared.length < results.length && flag, true)
})

test('obtains single pages of emojis', async (t) => {
  const results = await getPage(0)

  t.is(results.length > 0, true)
})

test('obtains multiple pages of emojis', async (t) => {
  const results = await obtain(2, 3)

  t.is(results.length === 1000, true)
})

test('correctly obtain a given last page of 67', async (t) => {
  const page = await getLastPage(true, 67)

  t.is(page, 67)
})

test('correctly obtain a given last page of 30', async (t) => {
  const page = await getLastPage(true, 30)

  t.is(page, 30)
})

test('correctly obtain a given last page of 139', async (t) => {
  const page = await getLastPage(true, 139)

  t.is(page, 139)
})

test('parse a url to obtain an emoji name', (t) => {
  const name =
    'https://emojis.slackmojis.com/emojis/images/1615690644/20375/0.gif?1615690644'
  const extracted = extractEmojiName(name)

  t.is(extracted, '0.gif')
})
