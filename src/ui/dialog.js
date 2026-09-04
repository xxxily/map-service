import {
  closeCustomControlsDropdowns,
  initCustomControlsListeners,
  renderCustomColorPicker,
} from './controls.js'

function ensureDialogRoot () {
  let root = document.getElementById('app-dialog-root')
  if (!root) {
    root = document.createElement('div')
    root.id = 'app-dialog-root'
    document.body.appendChild(root)
  }
  return root
}

function escapeHtml (value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function getIconPickerOptionValue (option) {
  return String(typeof option === 'object' ? option?.value : option)
}

function getIconPickerOptionLabel (option) {
  return String(typeof option === 'object' ? option?.label : option)
}

function getIconPickerQuickOptions (field, selectedValue) {
  const options = Array.isArray(field.options) ? field.options : []
  const optionMap = new Map(options.map(option => [getIconPickerOptionValue(option), option]))
  const quickLimit = Math.max(1, Number.parseInt(field.quickLimit, 10) || 8)
  const candidates = [field.autoValue, selectedValue, ...(field.quickValues || [])]
  const quickOptions = []
  for (const value of candidates) {
    const key = String(value ?? '')
    const option = optionMap.get(key)
    if (!option || quickOptions.some(item => getIconPickerOptionValue(item) === key)) continue
    quickOptions.push(option)
    if (quickOptions.length >= quickLimit) break
  }
  return quickOptions.length ? quickOptions : options.slice(0, quickLimit)
}

function renderIconPickerOption (option, selectedValue, variant = 'quick') {
  const optionValue = getIconPickerOptionValue(option)
  const optionLabel = getIconPickerOptionLabel(option)
  const optionHint = typeof option === 'object' ? option?.hint : ''
  const iconHtml = typeof option === 'object' ? option?.iconHtml : ''
  const selected = String(selectedValue ?? '') === optionValue
  return `
    <button type="button" class="app-dialog-icon-option is-${escapeHtml(variant)}${selected ? ' is-selected' : ''}" data-icon-picker-option data-icon-value="${escapeHtml(optionValue)}" role="radio" aria-checked="${selected}" title="${escapeHtml(optionLabel)}">
      <span class="app-dialog-icon-preview" aria-hidden="true">${iconHtml || '•'}</span>
      <span class="app-dialog-icon-label">${escapeHtml(optionLabel)}</span>
      ${optionHint ? `<small>${escapeHtml(optionHint)}</small>` : ''}
    </button>
  `
}

function renderIconPickerField (field, selectedValue) {
  const safeName = escapeHtml(field.name)
  const safeFieldId = String(field.name || 'icon').replace(/[^A-Za-z0-9_-]/g, '-') || 'icon'
  const libraryId = `app-dialog-icon-library-${safeFieldId}`
  const options = Array.isArray(field.options) ? field.options : []
  const quickOptions = getIconPickerQuickOptions(field, selectedValue)
  return `
    <fieldset class="app-dialog-icon-picker" data-icon-picker="${safeName}">
      <legend>${escapeHtml(field.label)}</legend>
      <input type="hidden" name="${safeName}" value="${escapeHtml(selectedValue)}" data-icon-picker-input>
      <div class="app-dialog-icon-toolbar">
        <div class="app-dialog-icon-strip" role="radiogroup" aria-label="${escapeHtml(field.label)}快捷选择" data-icon-picker-quick>
          ${quickOptions.map(option => renderIconPickerOption(option, selectedValue, 'quick')).join('')}
        </div>
        <button type="button" class="app-dialog-icon-more" data-icon-picker-more aria-haspopup="dialog" aria-expanded="false" aria-controls="${escapeHtml(libraryId)}" title="查看更多点位图标">
          <span class="app-dialog-icon-more-glyph" aria-hidden="true">•••</span>
          <span>更多</span>
        </button>
      </div>
      ${field.hint ? `<small class="app-dialog-field-hint">${escapeHtml(field.hint)}</small>` : ''}
      <div class="app-dialog-icon-library" id="${escapeHtml(libraryId)}" data-icon-picker-library hidden>
        <section class="app-dialog-icon-library-dialog" role="dialog" aria-modal="true" aria-labelledby="${escapeHtml(libraryId)}-title">
          <header class="app-dialog-icon-library-header">
            <div>
              <span>点位样式</span>
              <h3 id="${escapeHtml(libraryId)}-title">选择图标</h3>
            </div>
            <button type="button" class="app-dialog-icon-library-close" data-icon-picker-close aria-label="关闭图标库" title="关闭">×</button>
          </header>
          <div class="app-dialog-icon-grid" role="radiogroup" aria-label="全部${escapeHtml(field.label)}">
            ${options.map(option => renderIconPickerOption(option, selectedValue, 'library')).join('')}
          </div>
        </section>
      </div>
    </fieldset>
  `
}

function closeDialog (root, cleanup, resolve, value) {
  cleanup()
  root.innerHTML = ''
  root.hidden = true
  resolve(value)
}

function getDialogClassName (value) {
  return String(value || '')
    .split(/\s+/)
    .filter(name => /^[A-Za-z0-9_-]+$/.test(name))
    .join(' ')
}

export function showDialog (options = {}) {
  const root = ensureDialogRoot()
  const title = options.title || '提示'
  const message = options.message || ''
  const confirmText = options.confirmText || '确定'
  const cancelText = options.cancelText || '取消'
  const showCancel = Boolean(options.showCancel)
  const checkbox = options.checkbox || null
  const dialogClassName = getDialogClassName(options.dialogClassName)

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <section class="app-dialog${dialogClassName ? ` ${dialogClassName}` : ''}" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h2 id="app-dialog-title">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
        ${checkbox ? `
          <label class="app-dialog-check">
            <input type="checkbox" data-dialog-checkbox ${checkbox.checked ? 'checked' : ''}>
            <span>${escapeHtml(checkbox.label || '')}</span>
          </label>
        ` : ''}
        <div class="app-dialog-actions">
          ${showCancel ? `<button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${escapeHtml(cancelText)}</button>` : ''}
          <button type="button" class="app-dialog-primary" data-dialog-action="confirm">${escapeHtml(confirmText)}</button>
        </div>
      </section>
    </div>
  `

  const dialog = root.querySelector('.app-dialog')
  const primary = root.querySelector('.app-dialog-primary')
  primary?.focus()

  return new Promise((resolve) => {
    const cleanup = () => {
      closeCustomControlsDropdowns()
      root.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeydown)
    }

    const resolveDialog = (confirmed) => {
      const checked = Boolean(root.querySelector('[data-dialog-checkbox]')?.checked)
      closeDialog(root, cleanup, resolve, checkbox ? { confirmed, checked } : confirmed)
    }

    const onClick = (event) => {
      const actionTarget = event.target.closest('[data-dialog-action]')
      if (!actionTarget) return
      if (dialog?.contains(event.target) && actionTarget.classList.contains('app-dialog-backdrop')) return
      resolveDialog(actionTarget.dataset.dialogAction === 'confirm')
    }

    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        resolveDialog(false)
      }
    }

    root.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeydown)
  })
}

export function showAlert (message, options = {}) {
  return showDialog({
    title: options.title || '提示',
    message,
    confirmText: options.confirmText || '知道了',
  })
}

export function showConfirm (message, options = {}) {
  return showDialog({
    title: options.title || '确认操作',
    message,
    confirmText: options.confirmText || '确认',
    cancelText: options.cancelText || '取消',
    showCancel: true,
  })
}

export function showCheckboxConfirm (message, options = {}) {
  return showDialog({
    title: options.title || '确认操作',
    message,
    confirmText: options.confirmText || '确认',
    cancelText: options.cancelText || '取消',
    showCancel: true,
    checkbox: {
      label: options.checkboxLabel || '',
      checked: Boolean(options.checked),
    },
  })
}

export function showEditDialog (options = {}) {
  const root = ensureDialogRoot()
  const title = options.title || '编辑属性'
  const fields = options.fields || []
  const values = options.values || {}
  const confirmText = options.confirmText || '保存'
  const cancelText = options.cancelText || '取消'

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <form class="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" data-dialog-form autocomplete="off">
        <h2 id="app-dialog-title">${escapeHtml(title)}</h2>
        <div class="app-dialog-body" style="margin: 16px 0; text-align: left;">
          ${fields.map(field => {
            const val = escapeHtml(values[field.name] || '')
            if (field.type === 'select') {
              return `
                <label style="display: block; margin-bottom: 12px;">
                  <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${escapeHtml(field.label)}</span>
                  <select name="${escapeHtml(field.name)}" ${field.required ? 'required' : ''} style="width: 100%; height: 36px; padding: 0 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none; background: #fff;">
                    ${(field.options || []).map(option => {
                      const optionValue = typeof option === 'object' ? option.value : option
                      const optionLabel = typeof option === 'object' ? option.label : option
                      const selected = String(values[field.name] ?? '') === String(optionValue) ? 'selected' : ''
                      const disabled = typeof option === 'object' && option.disabled ? 'disabled' : ''
                      return `<option value="${escapeHtml(optionValue)}" ${selected} ${disabled}>${escapeHtml(optionLabel)}</option>`
                    }).join('')}
                  </select>
                  ${field.hint ? `<small style="display: block; margin-top: 4px; color: #6b7280; line-height: 1.45;">${escapeHtml(field.hint)}</small>` : ''}
                </label>
              `
            }
            if (field.type === 'icon-picker') {
              return renderIconPickerField(field, values[field.name] || '')
            }
            if (field.type === 'color') {
              const color = values[field.name] || '#0f766e'
              return `
                <div class="app-dialog-color-field">
                  <span>${escapeHtml(field.label)}</span>
                  <div class="app-dialog-color-control">
                    ${renderCustomColorPicker({
                      value: color,
                      className: 'app-dialog-color-picker',
                      attrs: `data-dialog-color-input="${escapeHtml(field.name)}"`,
                    })}
                    <input type="hidden" name="${escapeHtml(field.name)}" value="${escapeHtml(color)}" data-dialog-color-value>
                    <code>${escapeHtml(color)}</code>
                  </div>
                  ${field.hint ? `<small class="app-dialog-field-hint">${escapeHtml(field.hint)}</small>` : ''}
                </div>
              `
            }
            if (field.type === 'textarea') {
              return `
                <label style="display: block; margin-bottom: 12px;">
                  <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${escapeHtml(field.label)}</span>
                  <textarea name="${escapeHtml(field.name)}" rows="3" style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-family: inherit; font-size: 13px; resize: vertical; outline: none;"></textarea>
                  ${field.hint ? `<small style="display: block; margin-top: 4px; color: #6b7280; line-height: 1.45;">${escapeHtml(field.hint)}</small>` : ''}
                </label>
                `
            }
            const inputType = ['text', 'url', 'email', 'number', 'password'].includes(String(field.inputType || ''))
              ? String(field.inputType)
              : 'text'
            const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : ''
            const maxlength = Number.isSafeInteger(Number(field.maxlength)) && Number(field.maxlength) > 0
              ? ` maxlength="${Number(field.maxlength)}"`
              : ''
            return `
              <label style="display: block; margin-bottom: 12px;">
                <span style="display: block; font-size: 13px; margin-bottom: 4px; color: #4b5563; font-weight: 500;">${escapeHtml(field.label)}</span>
                <input type="${inputType}" name="${escapeHtml(field.name)}" value="${val}"${placeholder}${maxlength} style="width: 100%; padding: 8px; border: 1px solid #d1d5db; border-radius: 6px; box-sizing: border-box; font-size: 13px; outline: none;"${field.required === false ? '' : ' required'}>
                ${field.hint ? `<small style="display: block; margin-top: 4px; color: #6b7280; line-height: 1.45;">${escapeHtml(field.hint)}</small>` : ''}
              </label>
            `
          }).join('')}
        </div>
        <div class="app-dialog-actions" style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 16px;">
          <div>
            ${options.showReset ? `<button type="button" class="app-dialog-secondary" data-dialog-action="reset" style="border-color: rgba(220, 38, 38, 0.25); color: #dc2626;">重置</button>` : ''}
          </div>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="app-dialog-secondary" data-dialog-action="cancel">${escapeHtml(cancelText)}</button>
            <button type="submit" class="app-dialog-primary">${escapeHtml(confirmText)}</button>
          </div>
        </div>
      </form>
    </div>
  `

  // 用 JS 填充 textarea，避免模板内多行文本破坏结构。
  const form = root.querySelector('[data-dialog-form]')
  initCustomControlsListeners()
  fields.forEach(field => {
    if (field.type === 'textarea') {
      const textarea = form.querySelector(`textarea[name="${field.name}"]`)
      if (textarea) {
        textarea.value = values[field.name] || ''
      }
    }
  })

  const primary = root.querySelector('.app-dialog-primary')
  primary?.focus()

  return new Promise((resolve) => {
    const iconFields = new Map(fields
      .filter(field => field.type === 'icon-picker')
      .map(field => [String(field.name), field]))

    const getIconPickerElements = (fieldset) => ({
      input: fieldset?.querySelector('[data-icon-picker-input]'),
      quick: fieldset?.querySelector('[data-icon-picker-quick]'),
      library: fieldset?.querySelector('[data-icon-picker-library]'),
      more: fieldset?.querySelector('[data-icon-picker-more]'),
    })

    const syncIconPicker = (fieldset, value, options = {}) => {
      if (!fieldset) return
      const field = iconFields.get(String(fieldset.dataset.iconPicker || ''))
      if (!field) return
      const allowedValues = new Set((field.options || []).map(getIconPickerOptionValue))
      const selectedValue = allowedValues.has(String(value ?? ''))
        ? String(value)
        : String(field.autoValue || getIconPickerOptionValue(field.options?.[0] || ''))
      const elements = getIconPickerElements(fieldset)
      if (elements.input) elements.input.value = selectedValue
      if (options.refreshQuick !== false && elements.quick) {
        elements.quick.innerHTML = getIconPickerQuickOptions(field, selectedValue)
          .map(option => renderIconPickerOption(option, selectedValue, 'quick'))
          .join('')
      }
      fieldset.querySelectorAll('[data-icon-picker-option]').forEach(button => {
        const selected = button.dataset.iconValue === selectedValue
        button.classList.toggle('is-selected', selected)
        button.setAttribute('aria-checked', String(selected))
      })
    }

    const closeIconLibrary = (fieldset, restoreFocus = true) => {
      const { library, more } = getIconPickerElements(fieldset)
      if (!library || library.hidden) return false
      library.hidden = true
      more?.setAttribute('aria-expanded', 'false')
      if (restoreFocus) more?.focus()
      return true
    }

    const openIconLibrary = (fieldset) => {
      const { input, library, more } = getIconPickerElements(fieldset)
      if (!library) return
      syncIconPicker(fieldset, input?.value, { refreshQuick: false })
      library.hidden = false
      more?.setAttribute('aria-expanded', 'true')
      const buttons = [...library.querySelectorAll('[data-icon-picker-option]')]
      const selected = buttons.find(button => button.getAttribute('aria-checked') === 'true')
      ;(selected || buttons[0] || library.querySelector('[data-icon-picker-close]'))?.focus()
    }

    const cleanup = () => {
      closeCustomControlsDropdowns()
      root.removeEventListener('click', onClick)
      form?.removeEventListener('submit', onSubmit)
      form?.removeEventListener('change', onFieldChange)
      document.removeEventListener('keydown', onKeydown)
    }

    const onFieldChange = (event) => {
      const picker = event.target.closest?.('[data-dialog-color-input]')
      if (!picker) return
      const control = picker.closest('.app-dialog-color-control')
      const value = picker.getAttribute('data-color') || '#0f766e'
      const input = control?.querySelector('[data-dialog-color-value]')
      const label = control?.querySelector('code')
      if (input) input.value = value
      if (label) label.textContent = value
    }

    const onSubmit = (event) => {
      event.preventDefault()
      const formData = new FormData(form)
      const result = {}
      for (const [key, val] of formData.entries()) {
        result[key] = val
      }
      closeDialog(root, cleanup, resolve, result)
    }

    const onClick = (event) => {
      const iconOption = event.target.closest('[data-icon-picker-option]')
      if (iconOption) {
        const fieldset = iconOption.closest('[data-icon-picker]')
        const fromLibrary = Boolean(iconOption.closest('[data-icon-picker-library]'))
        const selectedValue = iconOption.dataset.iconValue
        syncIconPicker(fieldset, selectedValue)
        if (fromLibrary) closeIconLibrary(fieldset)
        else if (event.detail === 0) {
          const refreshed = [...(fieldset?.querySelectorAll('[data-icon-picker-quick] [data-icon-picker-option]') || [])]
            .find(button => button.dataset.iconValue === selectedValue)
          refreshed?.focus()
        }
        return
      }

      const iconMore = event.target.closest('[data-icon-picker-more]')
      if (iconMore) {
        openIconLibrary(iconMore.closest('[data-icon-picker]'))
        return
      }

      const iconClose = event.target.closest('[data-icon-picker-close]')
      if (iconClose) {
        closeIconLibrary(iconClose.closest('[data-icon-picker]'))
        return
      }

      const iconLibrary = event.target.closest('[data-icon-picker-library]')
      if (iconLibrary && event.target === iconLibrary) {
        closeIconLibrary(iconLibrary.closest('[data-icon-picker]'))
        return
      }

      const actionTarget = event.target.closest('[data-dialog-action]')
      if (!actionTarget) return
      if (form?.contains(event.target) && actionTarget.classList.contains('app-dialog-backdrop')) return
      
      const action = actionTarget.dataset.dialogAction
      if (action === 'cancel') {
        closeDialog(root, cleanup, resolve, null)
      } else if (action === 'reset') {
        event.preventDefault()
        event.stopPropagation()
        if (options.resetValues) {
          fields.forEach(field => {
            const el = form.querySelector(`[name="${field.name}"]`)
            if (el) {
              el.value = String(options.resetValues[field.name] ?? '')
              if (field.type === 'icon-picker') {
                syncIconPicker(el.closest('[data-icon-picker]'), el.value)
              }
            }
          })
        }
      }
    }

    const onKeydown = (event) => {
      const openLibrary = root.querySelector('[data-icon-picker-library]:not([hidden])')
      if (openLibrary) {
        const fieldset = openLibrary.closest('[data-icon-picker]')
        if (event.key === 'Escape') {
          event.preventDefault()
          closeIconLibrary(fieldset)
          return
        }
        if (event.key === 'Tab') {
          const focusable = [...openLibrary.querySelectorAll('button:not([disabled])')]
          if (focusable.length) {
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault()
              first.focus()
            }
          }
        }
      }

      const iconOption = event.target.closest?.('[data-icon-picker-option]')
      if (iconOption && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        const group = iconOption.closest('[role="radiogroup"]')
        const buttons = [...(group?.querySelectorAll('[data-icon-picker-option]') || [])]
        const currentIndex = buttons.indexOf(iconOption)
        if (currentIndex !== -1 && buttons.length) {
          event.preventDefault()
          const direction = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1
          const next = buttons[(currentIndex + direction + buttons.length) % buttons.length]
          const fieldset = next.closest('[data-icon-picker]')
          const inLibrary = Boolean(group.closest('[data-icon-picker-library]'))
          const selectedValue = next.dataset.iconValue
          syncIconPicker(fieldset, selectedValue)
          const refreshedGroup = inLibrary
            ? fieldset?.querySelector('[data-icon-picker-library] [role="radiogroup"]')
            : fieldset?.querySelector('[data-icon-picker-quick]')
          const refreshed = [...(refreshedGroup?.querySelectorAll('[data-icon-picker-option]') || [])]
            .find(button => button.dataset.iconValue === selectedValue)
          refreshed?.focus()
          return
        }
      }

      if (event.key === 'Escape') {
        event.preventDefault()
        closeDialog(root, cleanup, resolve, null)
      }
    }

    root.addEventListener('click', onClick)
    form?.addEventListener('submit', onSubmit)
    form?.addEventListener('change', onFieldChange)
    document.addEventListener('keydown', onKeydown)
  })
}

export function showChoiceDialog (options = {}) {
  const root = ensureDialogRoot()
  const title = options.title || '提示'
  const message = options.message || ''
  // This surface is intentionally explicit: callers must escape every dynamic
  // value before supplying markup here.
  const trustedMessageHtml = options.trustedMessageHtml || ''
  const choices = options.choices || [] // [{ text: '编辑', value: 'edit', class: 'primary' }]
  const cancelText = options.cancelText || '取消'
  const dismissible = options.dismissible !== false
  const dialogClassName = getDialogClassName(options.dialogClassName)
  const stackedChoices = options.choiceLayout === 'stacked'
  const choiceActionsClass = stackedChoices ? ' app-dialog-choice-actions is-stacked' : ''

  root.hidden = false
  root.innerHTML = `
    <div class="app-dialog-backdrop" data-dialog-action="cancel">
      <section class="app-dialog${dialogClassName ? ` ${dialogClassName}` : ''}" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <h2 id="app-dialog-title">${escapeHtml(title)}</h2>
        ${trustedMessageHtml ? `<div class="app-dialog-message app-dialog-message-rich">${trustedMessageHtml}</div>` : `<p>${escapeHtml(message)}</p>`}
        <div class="app-dialog-actions${choiceActionsClass}">
          ${choices.map(choice => `
            <button type="button" class="${getDialogClassName(choice.class || 'app-dialog-secondary')}${stackedChoices ? ` app-dialog-choice${choice.selected ? ' is-selected' : ''}` : ''}" data-choice-action="${escapeHtml(choice.value)}">
              ${stackedChoices ? `<span class="app-dialog-choice-icon" aria-hidden="true">${escapeHtml(choice.icon || '')}</span><span class="app-dialog-choice-copy"><strong>${escapeHtml(choice.text)}</strong>${choice.description ? `<small>${escapeHtml(choice.description)}</small>` : ''}</span>` : escapeHtml(choice.text)}
            </button>
          `).join('')}
          ${dismissible ? `<button type="button" class="app-dialog-secondary app-dialog-choice-cancel" data-dialog-action="cancel">${escapeHtml(cancelText)}</button>` : ''}
        </div>
      </section>
    </div>
  `

  const dialog = root.querySelector('.app-dialog')

  return new Promise((resolve) => {
    const cleanup = () => {
      root.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKeydown)
    }

    const onClick = (event) => {
      const choiceBtn = event.target.closest('[data-choice-action]')
      if (choiceBtn) {
        closeDialog(root, cleanup, resolve, choiceBtn.dataset.choiceAction)
        return
      }

      const actionTarget = event.target.closest('[data-dialog-action]')
      if (actionTarget && actionTarget.dataset.dialogAction === 'cancel') {
        if (dialog?.contains(event.target) && actionTarget.classList.contains('app-dialog-backdrop')) return
        if (dismissible) closeDialog(root, cleanup, resolve, 'cancel')
      }
    }

    const onKeydown = (event) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault()
        closeDialog(root, cleanup, resolve, 'cancel')
      }
    }

    root.addEventListener('click', onClick)
    document.addEventListener('keydown', onKeydown)
  })
}
