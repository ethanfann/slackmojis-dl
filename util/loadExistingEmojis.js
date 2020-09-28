const fs = require('fs')

function loadExistingEmojis() {
  console.log(`${__dirname}/emojis`)
  const categories = fs.readdirSync(`${__dirname}/emojis`)

  console.log(categories)
}

module.exports = loadExistingEmojis
