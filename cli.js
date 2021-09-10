#!/usr/bin/env node
const React = require('react')
const importJsx = require('import-jsx')
const { render } = require('ink')
const meow = require('meow')
const obtain = require('./util/obtain')
const fs = require('fs')
const getLastPage = require('./util/getLastPage')

const ui = importJsx('./ui')

const cli = meow(`
	Usage
	  $ ./cli.js
  Options
    --dest  Output directory that defaults to the working directory
    --limit Restrict the number of pages to download
    --dump  Save the emoji listing to ./emojis.json
            Override save location with --path
    --category The category name to download
  Examples
    $ ./cli.js --dest desired/path
    $ ./cli.js --limit=5
    $ ./cli.js --dest desired/path --dump
    $ ./cli.js --category "Hangouts Blob"
`)

if (cli.flags.dump) {
  getLastPage().then((lastPage) => {
    obtain(cli.flags.limit, lastPage).then((results) => {
      let data = JSON.stringify(results)
      fs.writeFileSync('emojis.json', data)
    })
  })
} else {
  render(React.createElement(ui, cli.flags))
}
