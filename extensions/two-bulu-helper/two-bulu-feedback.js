(() => {
  'use strict'

  if (window.top !== window || globalThis.__mapServiceTwoBuluFeedbackLoaded) return
  globalThis.__mapServiceTwoBuluFeedbackLoaded = true

  const CHANNEL = 'map-service-two-bulu-helper'
  const HOST_ID = 'map-service-two-bulu-import-feedback'
  const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/
  let currentSessionId = ''

  function ensureHost () {
    let host = document.getElementById(HOST_ID)
    if (host && !host.shadowRoot) {
      host.remove()
      host = null
    }
    if (!host) {
      host = document.createElement('div')
      host.id = HOST_ID
      host.style.cssText = 'position:fixed;top:16px;right:16px;z-index:2147483647;max-width:calc(100vw - 32px);'
      document.documentElement.appendChild(host)
      host.attachShadow({ mode: 'open' })
    }
    return host
  }

  function statusLabel (status) {
    if (status === 'success') return '成功'
    if (status === 'needs-user-action') return '需要操作'
    if (status === 'failed') return '失败'
    return '处理中'
  }

  function renderFeedback (message) {
    const sessionId = String(message.sessionId || '')
    if (!SESSION_ID_PATTERN.test(sessionId)) return false
    currentSessionId = sessionId
    const status = ['working', 'success', 'failed', 'needs-user-action'].includes(message.status) ? message.status : 'failed'
    const host = ensureHost()
    const root = host.shadowRoot
    root.innerHTML = `
      <style>
        :host { all: initial; }
        .panel { width: min(380px, calc(100vw - 32px)); box-sizing: border-box; border: 1px solid rgba(15, 23, 42, .14); border-radius: 14px; background: rgba(255, 255, 255, .98); box-shadow: 0 18px 45px rgba(15, 23, 42, .22); color: #0f172a; font: 14px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; overflow: hidden; }
        .bar { height: 4px; background: #2563eb; }
        .panel.success .bar { background: #16a34a; }
        .panel.failed .bar { background: #dc2626; }
        .panel.needs-user-action .bar { background: #d97706; }
        .body { padding: 16px; }
        .heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
        .badge { flex: none; border-radius: 999px; padding: 2px 8px; background: #dbeafe; color: #1d4ed8; font-size: 12px; font-weight: 700; }
        .success .badge { background: #dcfce7; color: #15803d; }
        .failed .badge { background: #fee2e2; color: #b91c1c; }
        .needs-user-action .badge { background: #fef3c7; color: #b45309; }
        h2 { margin: 0; font-size: 16px; line-height: 1.4; color: #0f172a; }
        p { margin: 10px 0 0; color: #475569; overflow-wrap: anywhere; }
        .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; margin-top: 16px; }
        button { appearance: none; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #334155; cursor: pointer; font: inherit; font-weight: 600; padding: 7px 12px; }
        button:hover { background: #f8fafc; }
        button:focus-visible { outline: 3px solid rgba(37, 99, 235, .25); outline-offset: 2px; }
        button.primary { border-color: #2563eb; background: #2563eb; color: #fff; }
        button.primary:hover { background: #1d4ed8; }
        button:disabled { cursor: wait; opacity: .6; }
        @media (max-width: 520px) { :host { left: 12px; right: 12px; top: 12px; } .panel { width: 100%; } }
      </style>
      <section class="panel ${status}" role="status" aria-live="polite">
        <div class="bar"></div>
        <div class="body">
          <div class="heading">
            <h2></h2>
            <span class="badge"></span>
          </div>
          <p></p>
          <div class="actions">
            ${message.canReturn !== false ? '<button type="button" class="primary" data-feedback-action="return">返回 map-service</button>' : ''}
            ${message.canClose === true ? '<button type="button" data-feedback-action="close">关闭此页</button>' : ''}
            <button type="button" data-feedback-action="dismiss">收起提示</button>
          </div>
        </div>
      </section>
    `
    root.querySelector('h2').textContent = String(message.title || '两步路导入助手').slice(0, 80)
    root.querySelector('.badge').textContent = statusLabel(status)
    root.querySelector('p').textContent = String(message.message || '导入状态已更新。').slice(0, 500)
    root.querySelectorAll('[data-feedback-action]').forEach(button => button.addEventListener('click', onAction))
    return true
  }

  async function onAction (event) {
    const action = event.currentTarget?.dataset?.feedbackAction
    const host = document.getElementById(HOST_ID)
    if (action === 'dismiss') {
      host?.remove()
      return
    }
    if (!['return', 'close'].includes(action) || !SESSION_ID_PATTERN.test(currentSessionId)) return
    const buttons = host?.shadowRoot?.querySelectorAll('button') || []
    buttons.forEach(button => { button.disabled = true })
    try {
      const result = await chrome.runtime.sendMessage({
        channel: CHANNEL,
        action: 'IMPORT_TAB_ACTION',
        importSessionId: currentSessionId,
        intent: action,
      })
      if (result?.ok || action === 'close') return
      const paragraph = host?.shadowRoot?.querySelector('p')
      if (paragraph) paragraph.textContent = String(result?.message || '无法返回原页面，请手动切换到 map-service。').slice(0, 500)
    } catch {
      const paragraph = host?.shadowRoot?.querySelector('p')
      if (paragraph) paragraph.textContent = '浏览器助手暂时无法处理标签页，请手动切换或关闭。'
    } finally {
      buttons.forEach(button => { button.disabled = false })
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.channel !== CHANNEL || message.action !== 'SHOW_IMPORT_STATUS') return false
    sendResponse({ ok: renderFeedback(message) })
    return false
  })
})()
