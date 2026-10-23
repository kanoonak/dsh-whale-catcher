/* 小鲸鱼抓token —— DSH Web 入口按钮
 *
 * 由插件在页面里挂一枚小按钮，点开新标签页进入 /dsh-whale-catcher/game.html。
 * 独立成文件（而不是内联脚本）是为了绕开宿主页面的 CSP 限制。
 *
 * 三条行为：
 *   1) 默认位置：运行时量一下宿主的"设置"按钮在哪，把自己放在它上面，避免挡住。
 *   2) 可以拖：按住拖动，松手记住位置（存在 localStorage，下次还在那儿）。
 *   3) 右键：复位到默认位置（并忘掉记住的位置）。
 */
(function () {
  'use strict'

  var ID = 'whale-token-entry'
  var GAME_PATH = '/dsh-whale-catcher/game.html'
  var POS_KEY = 'whale_entry_pos'
  var SAFE_BOTTOM = 84   // 找不到宿主按钮时的兜底高度
  var GAP = 10           // 与宿主按钮之间留的缝
  var EDGE = 8           // 离屏幕边缘至少留这么宽

  var btn = null
  var drag = null
  var suppressClick = false
  var userTouched = false

  /* ---------- 位置 ---------- */

  function isBottomLeft(rect) {
    return rect.top > window.innerHeight - 260 && rect.left < 320 && rect.width > 0
  }

  /* 找宿主左下角里"像按钮、又像设置"的那些元素，返回它们里最靠上的 top */
  function hostBottomLeftTop() {
    var nodes = document.querySelectorAll('button,a,[role="button"],[role="link"]')
    var best = null
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i]
      if (el === btn || (btn && el.contains(btn))) continue
      var label = (el.getAttribute('aria-label') || '') + ' ' +
                  (el.getAttribute('title') || '') + ' ' +
                  (el.getAttribute('data-testid') || '') + ' ' +
                  (el.textContent || '')
      if (!/设置|設定|settings/i.test(label)) continue
      var r = el.getBoundingClientRect()
      if (!isBottomLeft(r)) continue
      if (best === null || r.top < best) best = r.top
    }
    return best
  }

  function clampPos(left, top) {
    var w = btn.offsetWidth || 90
    var h = btn.offsetHeight || 30
    left = Math.min(Math.max(EDGE, left), Math.max(EDGE, window.innerWidth - w - EDGE))
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, window.innerHeight - h - EDGE))
    return { left: left, top: top }
  }

  function applyPos(left, top) {
    var p = clampPos(left, top)
    btn.style.left = p.left + 'px'
    btn.style.top = p.top + 'px'
    btn.style.bottom = 'auto'
  }

  function loadPos() {
    try {
      var s = window.localStorage.getItem(POS_KEY)
      if (!s) return null
      var o = JSON.parse(s)
      if (o && typeof o.left === 'number' && typeof o.top === 'number') return o
    } catch (e) {}
    return null
  }

  function savePos() {
    userTouched = true
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify({
        left: parseFloat(btn.style.left) || 0,
        top: parseFloat(btn.style.top) || 0,
      }))
    } catch (e) {}
  }

  function defaultPos() {
    var top = hostBottomLeftTop()
    var bottom = SAFE_BOTTOM
    if (top !== null) bottom = Math.max(SAFE_BOTTOM, Math.round(window.innerHeight - top + GAP))
    bottom = Math.min(bottom, Math.round(window.innerHeight * 0.45))
    applyPos(18, window.innerHeight - bottom - (btn.offsetHeight || 30))
  }

  function place() {
    if (!btn || drag) return
    var saved = loadPos()
    if (saved) { applyPos(saved.left, saved.top); return }
    if (userTouched) return   // 刚拖过、还没写进存储的那个瞬间，别拿默认值盖掉它
    defaultPos()
  }

  /* ---------- 挂载 ---------- */

  function mount() {
    if (document.getElementById(ID)) return
    var host = document.body || document.documentElement
    if (!host) return

    btn = document.createElement('button')
    btn.id = ID
    btn.type = 'button'
    btn.title = '小鲸鱼抓token —— 来一局（按住可拖动，右键复位）'
    btn.setAttribute('aria-label', '打开小鲸鱼抓token')
    btn.textContent = '🐟 抓token'
    btn.style.cssText = [
      'position:fixed',
      'left:18px',
      'top:120px',
      'z-index:2147483000',
      'padding:7px 13px',
      'border-radius:999px',
      'font:600 12.5px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif',
      'color:#dff2ff',
      'background:rgba(18,32,52,.82)',
      'border:1px solid rgba(79,184,255,.45)',
      'box-shadow:0 6px 18px rgba(0,0,0,.35), inset 0 0 18px rgba(79,184,255,.18)',
      'cursor:pointer',
      'backdrop-filter:blur(6px)',
      'transition:box-shadow .12s ease,border-color .12s ease',
      'touch-action:none',
      'user-select:none',
      '-webkit-user-select:none',
    ].join(';')

    btn.addEventListener('mouseenter', function () {
      btn.style.borderColor = 'rgba(79,184,255,.8)'
    })
    btn.addEventListener('mouseleave', function () {
      btn.style.borderColor = 'rgba(79,184,255,.45)'
    })

    /* --- 拖动 --- */
    btn.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return
      drag = {
        px: e.clientX,
        py: e.clientY,
        left: parseFloat(btn.style.left) || 0,
        top: parseFloat(btn.style.top) || 0,
      }
      suppressClick = false
      btn.style.cursor = 'grabbing'
      try { btn.setPointerCapture(e.pointerId) } catch (err) {}
    })

    btn.addEventListener('pointermove', function (e) {
      if (!drag) return
      var dx = e.clientX - drag.px
      var dy = e.clientY - drag.py
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) suppressClick = true
      applyPos(drag.left + dx, drag.top + dy)
    })

    function endDrag(e) {
      if (!drag) return
      drag = null
      btn.style.cursor = 'pointer'
      if (suppressClick) savePos()
      if (e && e.preventDefault && suppressClick) e.preventDefault()
    }
    btn.addEventListener('pointerup', endDrag)
    btn.addEventListener('pointercancel', endDrag)
    // 指针在窗口外松开时，元素可能收不到 pointerup —— 兜一层
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('blur', function () { if (drag) endDrag() })

    btn.addEventListener('click', function (e) {
      if (suppressClick) { suppressClick = false; e.preventDefault(); return }
      window.open(GAME_PATH, '_blank', 'noopener')
    })

    /* --- 右键复位 --- */
    btn.addEventListener('contextmenu', function (e) {
      e.preventDefault()
      try { window.localStorage.removeItem(POS_KEY) } catch (err) {}
      defaultPos()
    })

    host.appendChild(btn)
    place()

    // 宿主是单页应用，布局会变：窗口变化、主题切换、侧边栏折叠都要重新量
    window.addEventListener('resize', place)
    window.addEventListener('load', place)
    setTimeout(place, 400)
    setTimeout(place, 1200)
    if (window.MutationObserver) {
      var timer = null
      var mo = new MutationObserver(function (records) {
        if (drag) return
        // 自己在动（改 left/top 也是 style 变化）不算"宿主布局变了"
        var external = false
        for (var i = 0; i < records.length; i++) {
          var t = records[i].target
          if (t !== btn && !(btn && btn.contains && btn.contains(t))) { external = true; break }
        }
        if (!external) return
        if (timer) return
        timer = setTimeout(function () { timer = null; place() }, 250)
      })
      mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] })
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true })
  } else {
    mount()
  }
})()
