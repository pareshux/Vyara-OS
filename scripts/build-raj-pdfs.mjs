#!/usr/bin/env node
/**
 * Build PDFs from the two Raj demo Markdown docs.
 *
 * Pipeline:
 *   1. Read .md file
 *   2. Convert to HTML with `marked` (npx-resolved, no install needed)
 *   3. Wrap in a styled HTML template (print-friendly serif typography,
 *      table styling, code blocks, page breaks)
 *   4. Write the HTML to a temp file
 *   5. Spawn Chrome headless with --print-to-pdf
 *
 * Output: docs/build/<name>.pdf
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// CSS — clean, print-optimized
const CSS = `
@page {
  size: A4;
  margin: 18mm 16mm 18mm 16mm;
}

* { box-sizing: border-box; }

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;
  font-size: 10.5pt;
  line-height: 1.55;
  color: #1c1b19;
  background: #ffffff;
  max-width: 100%;
  margin: 0;
  padding: 0;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

h1 {
  font-size: 24pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin: 0 0 0.4em 0;
  color: #1c1b19;
  page-break-after: avoid;
}

h1 + p {
  font-size: 12pt;
  color: #6b6862;
  margin-top: 0;
}

h2 {
  font-size: 17pt;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin: 1.6em 0 0.6em 0;
  padding-bottom: 0.3em;
  border-bottom: 1px solid #e5e2dc;
  page-break-after: avoid;
  page-break-before: auto;
}

h2:first-of-type { margin-top: 0.8em; }

h3 {
  font-size: 13pt;
  font-weight: 600;
  margin: 1.4em 0 0.4em 0;
  color: #1c1b19;
  page-break-after: avoid;
}

h4 {
  font-size: 11pt;
  font-weight: 600;
  margin: 1em 0 0.3em 0;
  color: #1c1b19;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  page-break-after: avoid;
}

p {
  margin: 0.6em 0;
  text-align: left;
}

ul, ol {
  margin: 0.6em 0;
  padding-left: 1.4em;
}

li {
  margin: 0.2em 0;
}

li > p { margin: 0.2em 0; }

a {
  color: #1f5e55;
  text-decoration: none;
  border-bottom: 1px dotted #1f5e55;
}

strong {
  font-weight: 600;
  color: #1c1b19;
}

em { font-style: italic; }

code {
  font-family: 'SF Mono', 'Menlo', monospace;
  font-size: 9.5pt;
  background: #f3f1ed;
  padding: 1px 6px;
  border-radius: 3px;
  color: #1c1b19;
  word-break: break-all;
}

pre {
  background: #f3f1ed;
  padding: 12px 16px;
  border-radius: 4px;
  border-left: 3px solid #1f5e55;
  overflow-x: auto;
  font-size: 9.5pt;
  margin: 1em 0;
  page-break-inside: avoid;
}

pre code {
  background: none;
  padding: 0;
  font-size: 9.5pt;
}

table {
  width: 100%;
  border-collapse: collapse;
  margin: 1em 0;
  font-size: 9.5pt;
  page-break-inside: avoid;
}

th {
  text-align: left;
  font-weight: 600;
  padding: 8px 10px;
  background: #f3f1ed;
  border-bottom: 2px solid #1f5e55;
  color: #1c1b19;
  vertical-align: top;
}

td {
  padding: 6px 10px;
  border-bottom: 1px solid #e5e2dc;
  vertical-align: top;
  color: #1c1b19;
}

tr:last-child td { border-bottom: none; }

blockquote {
  border-left: 3px solid #1f5e55;
  background: #fafaf8;
  margin: 1em 0;
  padding: 0.8em 1.2em;
  color: #1c1b19;
  font-style: normal;
  page-break-inside: avoid;
}

blockquote p { margin: 0.4em 0; }
blockquote p:first-child { margin-top: 0; }
blockquote p:last-child { margin-bottom: 0; }

hr {
  border: none;
  border-top: 1px solid #e5e2dc;
  margin: 1.6em 0;
}

/* Smart page-breaks */
h1, h2, h3, h4 { page-break-after: avoid; }
table, blockquote, pre { page-break-inside: avoid; }

/* H2 starts a new page for major sections — disabled by default to
   keep the document flowing; enable per-need below */
/* h2 { page-break-before: always; } */

/* The "Part N" headers (h1 in content) start a fresh page in the
   navigation guide for clean reading */
.part-break { page-break-before: always; }

/* Cover-page treatment for the first h1 + the meta block beneath it */
.cover {
  text-align: left;
  padding-top: 0;
  padding-bottom: 0;
  margin-bottom: 2em;
}

.cover h1 {
  font-size: 32pt;
  margin-bottom: 0.2em;
}

.cover .subtitle {
  font-size: 14pt;
  color: #6b6862;
  margin: 0 0 2em 0;
  font-style: italic;
}

.cover hr {
  margin: 2em 0;
}

.cover .meta-row {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px 24px;
  font-size: 10.5pt;
  margin: 0.4em 0;
}

.cover .meta-label {
  font-weight: 600;
  color: #6b6862;
  text-transform: uppercase;
  font-size: 9pt;
  letter-spacing: 0.05em;
}
`

function htmlTemplate(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>${CSS}</style>
</head>
<body>
${body}
</body>
</html>
`
}

// Find Chrome
function findChrome() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]
  for (const c of candidates) {
    try {
      const { spawnSync } = require('node:child_process')
      spawnSync('test', ['-x', c])
      return c
    } catch {}
  }
  return candidates[0]  // fallback to default Chrome
}

async function buildPdf(mdPath, outPdfPath) {
  const md = await readFile(mdPath, 'utf-8')

  // Use marked via npx
  const tmpHtmlPath = path.join(tmpdir(), `raj-pdf-${Date.now()}-${path.basename(mdPath)}.html`)
  const tmpMdPath = path.join(tmpdir(), `raj-pdf-${Date.now()}-${path.basename(mdPath)}.md`)

  // Write the markdown to tmp so marked picks it up
  await writeFile(tmpMdPath, md, 'utf-8')

  // Convert MD → HTML with marked (npx — bundled binary)
  const marked = spawnSync('npx', ['--yes', 'marked', '--gfm', '-i', tmpMdPath], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
  })

  if (marked.status !== 0) {
    console.error('marked failed:', marked.stderr)
    process.exit(1)
  }

  let bodyHtml = marked.stdout

  // Add cover-page treatment: wrap the first h1 + its immediate paragraph
  // block in a <div class="cover">. We detect by finding the first h1
  // and the run of <hr><p>...</p><hr> blocks below it.
  bodyHtml = bodyHtml.replace(
    /^(<h1[^>]*>[\s\S]*?<\/h1>)([\s\S]*?<hr>)/m,
    (m, h1, rest) => `<div class="cover">${h1}${rest}</div>`
  )

  // Page-break before each "Part N · ..." header in the nav guide for clean structure
  bodyHtml = bodyHtml.replace(
    /<h1[^>]*>(Part \d+[\s\S]*?)<\/h1>/g,
    '<h1 class="part-break">$1</h1>'
  )
  // Same for "Capability N · ..." in the modules doc
  bodyHtml = bodyHtml.replace(
    /<h1[^>]*>(Capability \d+[\s\S]*?)<\/h1>/g,
    '<h1 class="part-break">$1</h1>'
  )
  // And for "Closing notes" or similar terminal sections
  bodyHtml = bodyHtml.replace(
    /<h1[^>]*>(Closing notes[\s\S]*?)<\/h1>/g,
    '<h1 class="part-break">$1</h1>'
  )

  const title = path.basename(mdPath, '.md')
  const fullHtml = htmlTemplate(title, bodyHtml)
  await writeFile(tmpHtmlPath, fullHtml, 'utf-8')

  // Render to PDF with Chrome headless
  const chrome = findChrome()
  const chromeArgs = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${outPdfPath}`,
    `file://${tmpHtmlPath}`,
  ]

  console.log(`  · rendering ${path.basename(outPdfPath)}...`)
  const chromeResult = spawnSync(chrome, chromeArgs, {
    encoding: 'utf-8',
    timeout: 120_000,
  })

  if (chromeResult.status !== 0) {
    console.error('chrome failed:', chromeResult.stderr)
    process.exit(1)
  }

  console.log(`    ✓ ${outPdfPath}`)
}

async function main() {
  const outDir = path.join(ROOT, 'docs', 'build')
  await mkdir(outDir, { recursive: true })

  const jobs = [
    {
      md: path.join(ROOT, 'docs', 'raj-demo-navigation-guide.md'),
      pdf: path.join(outDir, 'Raj-Avinsys-Navigation-Guide.pdf'),
    },
    {
      md: path.join(ROOT, 'docs', 'raj-product-modules.md'),
      pdf: path.join(outDir, 'Raj-Avinsys-Product-Modules.pdf'),
    },
  ]

  console.log('Building Raj demo PDFs...\n')
  for (const job of jobs) {
    await buildPdf(job.md, job.pdf)
  }
  console.log('\nDone. PDFs at:')
  for (const job of jobs) {
    console.log(`  ${job.pdf}`)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
