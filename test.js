const test = require('ava')
const extractEmojiName = require('./util/extractEmojiName')
const getLastPage = require('./util/getLastPage')

test('parse a url to obtain an emoji name', (t) => {
  const name =
    'https://emojis.slackmojis.com/emojis/images/1615690644/20375/0.gif?1615690644'
  const extracted = extractEmojiName(name)

  t.is(extracted, '0.gif')
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
