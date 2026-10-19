/* 小鲸鱼抓token —— DSH Web 入口按钮
 *
 * 由插件在页面里挂一枚左下角的小按钮，点开新标签页进入 /dsh-whale-catcher/game.html。
 * 独立成文件（而不是内联脚本）是为了绕开宿主页面的 CSP 限制。
 */
(function () {
  'use strict'

  var ID = 'whale-token-entry'
  var GAME_PATH = '/dsh-whale-catcher/game.html'

  function mount() {
    if (document.getElementById(ID)) return
    var host = document.body || document.documentElement
    if (!host) return

    var b = document.createElement('button')
    b.id = ID
    b.type = 'button'
    b.title = '小鲸鱼抓token —— 来一局'
    b.setAttribute('aria-label', '打开小鲸鱼抓token')
    b.textContent = '🐟 抓token'
    b.style.cssText = [
      'position:fixed',
      'left:18px',
      'bottom:18px',
      'z-index:2147483000',
      'padding:8px 14px',
      'border-radius:999px',
      'font:600 13px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
      'color:#dff2ff',
      'background:rgba(18,32,52,.82)',
      'border:1px solid rgba(79,184,255,.45)',
      'box-shadow:0 6px 18px rgba(0,0,0,.35), inset 0 0 18px rgba(79,184,255,.18)',
      'cursor:pointer',
      'backdrop-filter:blur(6px)',
      'transition:transform .12s ease,border-color .12s ease',
    ].join(';')

    b.addEventListener('mouseenter', function () {
      b.style.transform = 'translateY(-1px)'
      b.style.borderColor = 'rgba(79,184,255,.8)'
    })
    b.addEventListener('mouseleave', function () {
      b.style.transform = ''
      b.style.borderColor = 'rgba(79,184,255,.45)'
    })
    b.addEventListener('click', function () {
      window.open(GAME_PATH, '_blank', 'noopener')
    })

    host.appendChild(b)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }
})()
