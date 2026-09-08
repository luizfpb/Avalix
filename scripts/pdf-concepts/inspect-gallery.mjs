// Verificação local da galeria, sem dependência de Playwright ou servidor.
// Uso: node scripts/pdf-concepts/inspect-gallery.mjs <caminho-do-chromium>
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ROOT } from './shared.mjs'

const executable = process.argv[2]
if (!executable) throw new Error('Informe o caminho do Chromium local.')
const output = join(ROOT, 'docs/design-pdfs')
const profile = join(tmpdir(), `avalix-pdf-gallery-${process.pid}`)
mkdirSync(profile, { recursive: true })
const browser = spawn(executable, ['--headless', '--disable-gpu', '--no-sandbox', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=9342', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let ws
let commandId = 0
const pending = new Map()
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++commandId
  const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`Tempo excedido: ${method}`)) }, 12000)
  pending.set(id, { resolve, reject, timeout })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = expression => call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }).then(result => {
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
})
try {
  let targets
  for (let i = 0; i < 50; i++) {
    try { targets = await (await fetch('http://127.0.0.1:9342/json')).json(); break } catch { await sleep(150) }
  }
  if (!targets) throw new Error('Chromium não abriu a porta local de inspeção.')
  const page = targets.find(target => target.type === 'page')
  ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }) })
  ws.addEventListener('message', event => {
    const result = JSON.parse(event.data)
    const task = pending.get(result.id)
    if (!task) return
    pending.delete(result.id)
    clearTimeout(task.timeout)
    if (result.error) task.reject(new Error(result.error.message))
    else task.resolve(result.result)
  })
  await call('Page.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1240, deviceScaleFactor: 1, mobile: false })
  await call('Page.navigate', { url: pathToFileURL(join(output, 'index.html')).href })
  for (let i = 0; i < 30; i++) {
    if (await evaluate("document.querySelectorAll('.paper-button img').length === 3")) break
    await sleep(100)
  }
  const waitImages = "Promise.all([document.fonts.ready, ...[...document.images].filter(img => img.getAttribute('src')).map(img => img.decode())]).then(() => true)"
  await evaluate(waitImages)
  const results = []
  for (const pageNumber of [1, 2, 3]) {
    await evaluate(`document.querySelector('[data-page="${pageNumber}"]').click()`)
    await evaluate(waitImages)
    results.push(await evaluate("({page: document.querySelector('[aria-pressed=true]').textContent, images: [...document.querySelectorAll('.paper-button img')].map(img => ({src: img.getAttribute('src'), loaded: img.naturalWidth > 0})), overflow: document.documentElement.scrollWidth > innerWidth})"))
  }
  await evaluate("document.querySelector('[data-page=\"1\"]').click()")
  await evaluate(waitImages)
  const desktop = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(join(output, 'galeria-desktop.png'), Buffer.from(desktop.data, 'base64'))
  await evaluate("document.querySelector('.paper-button').click()")
  await evaluate(waitImages)
  if (!(await evaluate("document.querySelector('dialog').open"))) throw new Error('A ampliação não abriu.')
  await evaluate("document.querySelector('#close-dialog').click()")
  if (await evaluate("document.querySelector('dialog').open")) throw new Error('A ampliação não fechou.')
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true })
  await evaluate(waitImages)
  const mobileOverflow = await evaluate('document.documentElement.scrollWidth > innerWidth')
  if (mobileOverflow) throw new Error('A galeria ultrapassou a largura do celular.')
  const mobile = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(join(output, 'galeria-mobile.png'), Buffer.from(mobile.data, 'base64'))
  console.log(JSON.stringify({ desktop: results, modal: 'ok', mobile: { width: 390, overflow: mobileOverflow } }, null, 2))
} finally {
  if (ws) ws.close()
  for (const task of pending.values()) clearTimeout(task.timeout)
  browser.kill()
}
