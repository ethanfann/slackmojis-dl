#!/usr/bin/env node
const React = require('react')
const importJsx = require('import-jsx')
const { render } = require('ink')
const meow = require('meow')
const download = require('./util/download')

const ui = importJsx('./ui')

const cli = meow(`
	Usage
	  $ ./cli.js
  Options
    --limit Specify the number of emojis to download
    --dump  Dump the emoji listing to ./emojis.json
  Examples
    $ ./cli.js --limit=5
    $ ./cli.js --dump
`)

if (cli.flags.dump) {
  download('https://slackmojis.com/emojis.json', 'emojis.json')
} else {
  render(React.createElement(ui, cli.flags))
}
