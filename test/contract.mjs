// 插件契约自检：用假的 root / webServer / res 把 lib/index.js 跑一遍
// 用法：node test/contract.mjs（在包目录里跑）
import path from 'node:path'
import fs from 'node:fs'
import { pathToFileURL, fileURLToPath } from 'node:url'

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const results = []
const ok = (name, cond, extra) => results.push({ name, pass: !!cond, extra })

const routes = new Map()
const taps = []
const disposers = []
const effectFns = []

const ctx = {
  webServer: {
    register(route) {
      routes.set(route.path, route)
      const d = () => routes.delete(route.path)
      disposers.push(d)
      return d
    },
    tapIndex(fn) {
      taps.push(fn)
      const d = () => taps.splice(taps.indexOf(fn), 1)
      disposers.push(d)
      return d
    },
  },
}

const root = {
  effect(fn) { effectFns.push(fn); return () => {} },
  on(name, fn) { root.__on = root.__on || {}; root.__on[name] = fn; return () => {} },
  inject(deps, cb) { ok('inject 只等 webServer', deps.length === 1 && deps[0] === 'webServer', deps.join(',')); cb(ctx) },
}

const mod = await import(pathToFileURL(path.join(DIR, 'lib', 'index.js')).href)
const plugin = mod.default

ok('默认导出存在', !!plugin && typeof plugin.apply === 'function')
ok('插件名', plugin.name === 'whale-token-game', plugin.name)

plugin.apply(root)

ok('注册了 3 条路由', routes.size === 3, [...routes.keys()].join(' '))
ok('302 跳转', routes.has('/dsh-whale-catcher'))
ok('游戏页路由', routes.has('/dsh-whale-catcher/game.html'))
ok('入口脚本路由', routes.has('/dsh-whale-catcher/entry.js'))

// —— 假 res ——
function callRoute(p) {
  const out = { status: 0, headers: null, body: null }
  const res = {
    writeHead(code, headers) { out.status = code; out.headers = headers || null; return res },
    end(body) { out.body = body === undefined ? '' : body; return res },
  }
  routes.get(p).handler({ method: 'GET', url: p, headers: { host: '127.0.0.1:3080' } }, res)
  return out
}

const game = callRoute('/dsh-whale-catcher/game.html')
const fileBytes = fs.readFileSync(path.join(DIR, 'assets', 'game.html'))
ok('游戏页 200', game.status === 200, String(game.status))
ok('text/html', /text\/html/.test(game.headers?.['Content-Type'] || ''), game.headers?.['Content-Type'])
ok('长度与文件一致', String(fileBytes.length) === game.headers?.['Content-Length'], `${game.headers?.['Content-Length']} vs ${fileBytes.length}`)
ok('字节一致', Buffer.compare(Buffer.from(game.body), fileBytes) === 0)
ok('nosniff', game.headers?.['X-Content-Type-Options'] === 'nosniff')
ok('no-store', game.headers?.['Cache-Control'] === 'no-store')
ok('是个完整 HTML', Buffer.from(game.body).slice(0, 40).toString('utf8').toLowerCase().includes('<!doctype'))

const entry = callRoute('/dsh-whale-catcher/entry.js')
ok('入口脚本 200', entry.status === 200)
ok('application/javascript', /javascript/.test(entry.headers?.['Content-Type'] || ''))
ok('入口脚本有按钮 id', String(entry.body).includes('whale-token-entry'))

const base = callRoute('/dsh-whale-catcher')
ok('根路径 302', base.status === 302, String(base.status))
ok('Location 指向游戏页', base.headers?.Location === '/dsh-whale-catcher/game.html', base.headers?.Location)

// —— tapIndex ——
ok('注册了 tapIndex', taps.length === 1)
const html = '<html><body><div id=app></div></body></html>'
const once = taps[0](html)
ok('注入了 script 标签', once.includes('<script defer src="/dsh-whale-catcher/entry.js"></script>'))
ok('注入在 </body> 之前', once.indexOf('entry.js') < once.indexOf('</body>'))
ok('二次注入不重复', taps[0](once) === once)
ok('没有 </body> 也能注入', taps[0]('<div>x</div>').endsWith('</script>'))
ok('非字符串原样返回', taps[0](undefined) === undefined)

// —— 桌面端注入行 ——
const table = []
root.__on['webserver/index-inject'](table)
ok('注入表加了一行', table.length === 1, JSON.stringify(table[0]?.kind))
ok('行是 body 尾部的内联 script', table[0].kind === 'script' && table[0].placement === 'body')
ok('行里带 entry.js', table[0].text.includes('/dsh-whale-catcher/entry.js'))
ok('行自己吞掉 onerror', table[0].text.includes('s.onerror=function(){}'))
root.__on['webserver/index-inject'](table)
ok('注入行不重复', table.length === 1)
ok('旧 script-src 行存在时不再推', (() => {
  const t = [{ kind: 'script-src', src: '/dsh-whale-catcher/entry.js' }]
  root.__on['webserver/index-inject'](t)
  return t.length === 1
})())

// —— 卸载 ——
ok('注册了 effect 清理', effectFns.length === 1)
const onOnce = []
root.__on['webserver/index-inject'](onOnce)
// 触发 cleanup：effect 的回调返回 disposer 函数
const cleanup = effectFns[0]()
if (typeof cleanup === 'function') cleanup()
ok('清理后路由全退', routes.size === 0, [...routes.keys()].join(' ') || '(空)')

// —— 目录结构 ——
for (const f of ['package.json', 'cordis.patch.yml', 'README.md', 'LICENSE', 'lib/index.js', 'assets/game.html', 'assets/entry.js']) {
  ok(`文件存在 ${f}`, fs.existsSync(path.join(DIR, f)))
}
const pkg = JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8'))
ok('dsh.bundle.patch 指向 cordis.patch.yml', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
ok('keywords 含 dsh-plugin', Array.isArray(pkg.keywords) && pkg.keywords.includes('dsh-plugin'))
ok('没有 peerDependencies', !pkg.peerDependencies)
ok('没有 dependencies', !pkg.dependencies)
ok('type module', pkg.type === 'module')
ok('files 覆盖 assets 与 lib', pkg.files.includes('assets') && pkg.files.includes('lib'))

const bad = results.filter((r) => !r.pass)
for (const r of results) console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name}${r.extra ? '  [' + r.extra + ']' : ''}`)
console.log(`\n${results.length - bad.length}/${results.length} passed`)
process.exitCode = bad.length ? 1 : 0
