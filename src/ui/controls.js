/**
 * 高复用自定义 WebUI 组件控件库
 */

export function renderCustomSelect (options = {}) {
  const selectedValue = options.value || 'default'
  const items = options.options || []
  const attrs = options.attrs || ''
  const selectedItem = items.find(item => item.value === selectedValue) || items[0] || { label: '请选择', value: '' }

  const optionsHtml = items.map(item => {
    const isSelected = item.value === selectedValue
    return `<div class="custom-select-option ${isSelected ? 'selected' : ''}" data-value="${item.value}">${item.label}</div>`
  }).join('')

  return `
    <div class="custom-select ${options.className || ''}" data-value="${selectedValue}" ${attrs}>
      <div class="custom-select-trigger">
        <span>${selectedItem.label}</span>
        <svg class="custom-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </div>
      <div class="custom-select-options">
        ${optionsHtml}
      </div>
    </div>
  `
}

export function renderCustomColorPicker (options = {}) {
  const value = options.value || '#0f766e'
  const attrs = options.attrs || ''
  const presetColors = [
    '#0f766e', // 默认青色
    '#10b981', // 翠绿
    '#3b82f6', // 亮蓝
    '#f97316', // 亮橙
    '#ef4444', // 鲜红
    '#8b5cf6', // 梦幻紫
    '#ec4899', // 粉红
    '#22c55e', // 绿色
    '#f59e0b', // 琥珀黄
    '#64748b'  // 灰色
  ]

  const paletteHtml = presetColors.map(color => {
    return `<div class="custom-color-swatch" style="background-color: ${color};" data-color="${color}" title="${color}"></div>`
  }).join('')

  return `
    <div class="custom-color-picker ${options.className || ''}" data-color="${value}" ${attrs}>
      <div class="custom-color-trigger" style="background-color: ${value};" title="选择颜色"></div>
      <div class="custom-color-dropdown">
        <div class="custom-color-palette">
          ${paletteHtml}
        </div>
        <div class="custom-color-custom-btn">自定义颜色...</div>
        <input type="color" class="custom-color-hidden-input" value="${value}" style="display: none;">
      </div>
    </div>
  `
}

export function initCustomControlsListeners () {
  if (typeof window === 'undefined') return
  // 只初始化一次，防止重复绑定
  if (window.__customControlsInitialized) return
  window.__customControlsInitialized = true

  // 辅助关闭所有自定义下拉浮层
  const closeAllDropdowns = (exceptEl) => {
    document.querySelectorAll('.custom-select.is-open').forEach(el => {
      if (el !== exceptEl) el.classList.remove('is-open')
    })
    document.querySelectorAll('.custom-color-picker.is-open').forEach(el => {
      if (el !== exceptEl) el.classList.remove('is-open')
    })
  }

  // 绑定 value 属性存取器到自定义 select 元素
  const ensureSelectValueProperty = (el) => {
    if (Object.prototype.hasOwnProperty.call(el, 'value')) return
    Object.defineProperty(el, 'value', {
      get () { return this.getAttribute('data-value') },
      set (val) {
        this.setAttribute('data-value', val)
        const triggerSpan = this.querySelector('.custom-select-trigger span')
        const options = this.querySelectorAll('.custom-select-option')
        options.forEach(opt => {
          const isSelected = opt.getAttribute('data-value') === val
          opt.classList.toggle('selected', isSelected)
          if (isSelected && triggerSpan) {
            triggerSpan.textContent = opt.textContent
          }
        })
      },
      configurable: true
    })
  }

  // 绑定 value 属性存取器到自定义 color picker 元素
  const ensureColorValueProperty = (el) => {
    if (Object.prototype.hasOwnProperty.call(el, 'value')) return
    Object.defineProperty(el, 'value', {
      get () { return this.getAttribute('data-color') },
      set (val) {
        this.setAttribute('data-color', val)
        const trigger = this.querySelector('.custom-color-trigger')
        if (trigger) {
          trigger.style.backgroundColor = val
        }
        const hiddenInput = this.querySelector('.custom-color-hidden-input')
        if (hiddenInput) {
          hiddenInput.value = val
        }
      },
      configurable: true
    })
  }

  // 点击空白处关闭所有展开的下拉菜单
  document.addEventListener('click', (event) => {
    const isTrigger = event.target.closest('.custom-select-trigger, .custom-color-trigger, .custom-color-dropdown')
    if (!isTrigger) {
      closeAllDropdowns()
    }
  })

  // 利用事件委托监听点击
  document.addEventListener('click', (event) => {
    const target = event.target

    // 1. 自定义 Select 点击 Trigger
    const selectTrigger = target.closest('.custom-select-trigger')
    if (selectTrigger) {
      event.stopPropagation()
      event.preventDefault()
      const select = selectTrigger.closest('.custom-select')
      if (select) {
        closeAllDropdowns(select)
        select.classList.toggle('is-open')
      }
      return
    }

    // 2. 自定义 Select 点击 Option
    const selectOption = target.closest('.custom-select-option')
    if (selectOption) {
      event.stopPropagation()
      event.preventDefault()
      const select = selectOption.closest('.custom-select')
      if (select) {
        ensureSelectValueProperty(select)
        const val = selectOption.getAttribute('data-value')
        const oldVal = select.value
        if (val !== oldVal) {
          select.value = val
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
        select.classList.remove('is-open')
      }
      return
    }

    // 3. 自定义 Color Picker 点击 Trigger
    const colorTrigger = target.closest('.custom-color-trigger')
    if (colorTrigger) {
      event.stopPropagation()
      event.preventDefault()
      const picker = colorTrigger.closest('.custom-color-picker')
      if (picker) {
        closeAllDropdowns(picker)
        picker.classList.toggle('is-open')
      }
      return
    }

    // 4. 自定义 Color Picker 点击预设色块 Swatch
    const swatch = target.closest('.custom-color-swatch')
    if (swatch) {
      event.stopPropagation()
      event.preventDefault()
      const picker = swatch.closest('.custom-color-picker')
      if (picker) {
        ensureColorValueProperty(picker)
        const color = swatch.getAttribute('data-color')
        const oldColor = picker.value
        if (color !== oldColor) {
          picker.value = color
          picker.dispatchEvent(new Event('change', { bubbles: true }))
        }
        picker.classList.remove('is-open')
      }
      return
    }

    // 5. 点击自定义颜色按钮
    const customColorBtn = target.closest('.custom-color-custom-btn')
    if (customColorBtn) {
      event.stopPropagation()
      event.preventDefault()
      const picker = customColorBtn.closest('.custom-color-picker')
      if (picker) {
        const hiddenInput = picker.querySelector('.custom-color-hidden-input')
        if (hiddenInput) {
          hiddenInput.click()
        }
      }
      return
    }
  })

  // 利用事件委托监听隐藏 input 的修改
  document.addEventListener('input', (event) => {
    const target = event.target
    if (target.matches('.custom-color-hidden-input')) {
      const picker = target.closest('.custom-color-picker')
      if (picker) {
        ensureColorValueProperty(picker)
        picker.value = target.value
        picker.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  })
}
