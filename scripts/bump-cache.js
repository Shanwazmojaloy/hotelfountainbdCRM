#!/usr/bin/env node
const fs = require('fs'), path = require('path')
const htmlPath = path.join(__dirname, '..', 'public', 'crm.html')
let html = fs.readFileSync(htmlPath, 'utf8')

// Guard: file must end with </html> — if truncated, abort rather than corrupt
if (!html.trimEnd().endsWith('</html>')) {
  console.error('bump-cache: crm.html appears truncated (missing </html>). Aborting.')
  process.exit(1)
}

const now = new Date()
const pad = n => String(n).padStart(2,'0')
const ver = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`

// Only match digits in the version string — never overshoot past the quote
const updated = html.replace(/crm-bundle\.js\?v=\d+/, `crm-bundle.js?v=${ver}`)
if (updated === html) { console.error('bump-cache: pattern not found in crm.html'); process.exit(1) }

fs.writeFileSync(htmlPath, updated, 'utf8')
console.log('bump-cache: crm-bundle.js?v=' + ver)
