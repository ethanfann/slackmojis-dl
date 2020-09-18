#!/usr/bin/env node
const React = require('react')
const importJsx = require('import-jsx')
const { render } = require('ink')

const ui = importJsx('./ui')

render(React.createElement(ui))
