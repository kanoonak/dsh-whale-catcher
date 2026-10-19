/**
 * dsh-whale-catcher —— 把《小鲸鱼抓token》挂进 DSH Web。
 *
 * 干两件事：
 *   1. 注册两条只读路由：游戏页本体 /dsh-whale-catcher/game.html、入口脚本 /dsh-whale-catcher/entry.js
 *   2. 往宿主首页注入一枚左下角按钮（Web 走 tapIndex，桌面端走 webserver/index-inject 行）
 *
 * 不读凭据、不写文件、不发网络请求：整个插件就是"把一个 HTML 发出去"。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const BASE = '/dsh-whale-catcher'

/** 路由表：exact path → { 文件, Content-Type } */
const ASSETS = new Map([
  [`${BASE}/game.html`, { file: path.join(ROOT, 'assets', 'game.html'), type: 'text/html; charset=utf-8' }],
  [`${BASE}/entry.js`, { file: path.join(ROOT, 'assets', 'entry.js'), type: 'application/javascript; charset=utf-8' }],
])

/** 按 mtime+size 缓存文件字节：热重载后改资源不用重启，正常运行时也不重复读盘。 */
const cache = new Map()
function readAsset(file) {
  const st = fs.statSync(file)
  const hit = cache.get(file)
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.bytes
  const bytes = fs.readFileSync(file)
  cache.set(file, { mtimeMs: st.mtimeMs, size: st.size, bytes })
  return bytes
}

/**
 * 桌面端（Electron）注入行。
 * 桌面壳的 index.html 从安装包静态 dist 直出，tapIndex 永远过不去，唯一通道是结构化注入行；
 * 但注入表在宿主启动时收集一次、没有刷新路径，所以这里用"内联脚本自己建 <script src>"并吞掉 onerror：
 * 路由在就正常加载，路由不在就静默失败，绝不会因为我们让宿主起不来。
 */
const ENTRY_ROW_TEXT = '(function(){try{var d=document.body||document.head||document.documentElement;'
  + 'if(!d)return;var s=document.createElement("script");s.src="' + BASE + '/entry.js";'
  + 's.onerror=function(){};d.appendChild(s)}catch(e){}})()'

export default {
  name: 'whale-token-game',

  apply(root) {
    const disposers = []

    // 卸载时把路由与注入逐个退掉（热重载、禁用插件都走这条路）
    root.effect(() => () => {
      for (const d of disposers) {
        try {
          if (typeof d === 'function') d()
        } catch (err) { /* 已经退掉的不再管 */ }
      }
    })

    // ① 桌面端注入行：不依赖任何服务，apply 一进来就注册，避免错过启动时的那次收集
    disposers.push(root.on('webserver/index-inject', (table) => {
      try {
        if (!Array.isArray(table)) return
        for (const row of table) {
          if (!row) continue
          if (row.kind === 'script-src' && row.src === `${BASE}/entry.js`) return
          if (row.kind === 'script' && typeof row.text === 'string' && row.text.indexOf(`${BASE}/entry.js`) >= 0) return
        }
        table.push({ kind: 'script', placement: 'body', text: ENTRY_ROW_TEXT })
      } catch (err) { /* 宿主表结构变了也不该把插件带崩 */ }
    }))

    // ② Web 形态：等 webServer 就绪
    root.inject(['webServer'], (ctx) => {
      // 手输 /dsh-whale-catcher 也能进
      disposers.push(ctx.webServer.register({
        kind: 'exact',
        path: BASE,
        handler: (req, res) => {
          res.writeHead(302, { Location: `${BASE}/game.html`, 'Cache-Control': 'no-store' })
          res.end()
        },
      }))

      for (const [route, asset] of ASSETS) {
        disposers.push(ctx.webServer.register({
          kind: 'exact',
          path: route,
          handler: (req, res) => {
            try {
              const bytes = readAsset(asset.file)
              res.writeHead(200, {
                'Content-Type': asset.type,
                'Content-Length': String(bytes.length),
                'Cache-Control': 'no-store',
                'X-Content-Type-Options': 'nosniff',
              })
              res.end(bytes)
            } catch (err) {
              res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' })
              res.end('小鲸鱼抓token：资源没找到，插件目录可能不完整。')
            }
          },
        }))
      }

      disposers.push(ctx.webServer.tapIndex((html) => {
        if (typeof html !== 'string') return html
        if (html.indexOf(`${BASE}/entry.js`) !== -1) return html
        const tag = `<script defer src="${BASE}/entry.js"></script>`
        if (html.indexOf('</body>') !== -1) return html.replace('</body>', `${tag}</body>`)
        return html + tag
      }))
    })
  },
}
