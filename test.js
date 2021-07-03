const test = require('ava')
const extractEmojiName = require('./util/extractEmojiName')

test('parse a url to obtain an emoji name', (t) => {
  const name =
    'https://emojis.slackmojis.com/emojis/images/1615690644/20375/0.gif?1615690644'
  const extracted = extractEmojiName(name)

  t.is(extracted, '0.gif')
})
