#!/usr/bin/env node
const React = require('react')
const importJsx = require('import-jsx')
const { render } = require('ink')
const meow = require('meow')
const dumpEmojiJson = require('./util/dumpEmojiJson')

const ui = importJsx('./ui')

const cli = meow(`
	Usage
	  $ ./cli.js
  Options
    --dump Dump the emoji listing to ./emoji.json
  Examples
    
`)

if (cli.flags.dump) {
  dumpEmojiJson()
}

render(React.createElement(ui, cli.flags))
