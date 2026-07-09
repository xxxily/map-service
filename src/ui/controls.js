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
  const hexVal = value.startsWith('#') ? value.slice(1) : value
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
        <div class="custom-color-hex-row">
          <span class="custom-color-hex-hash">#</span>
          <input type="text" class="custom-color-hex-input" placeholder="0f766e" maxlength="6" value="${hexVal}">
          <button type="button" class="custom-color-hex-btn">应用</button>
        </div>
        <div class="custom-color-custom-btn">更多色彩...</div>
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
  const closeAllDropdowns = () => {
    // 1. 处理所有挂在 body 下的 custom-select-options 并移回原处
    document.body.querySelectorAll('.custom-select-options.is-open').forEach(options => {
      options.classList.remove('is-open')
      const parent = options.__parentControl
      if (parent) {
        parent.classList.remove('is-open')
        parent.appendChild(options)
      }
      options.style.position = ''
      options.style.zIndex = ''
      options.style.width = ''
      options.style.top = ''
      options.style.left = ''
      options.style.margin = ''
    })

    // 2. 处理所有挂在 body 下的 custom-color-dropdown 并移回原处
    document.body.querySelectorAll('.custom-color-dropdown.is-open').forEach(dropdown => {
      dropdown.classList.remove('is-open')
      const parent = dropdown.__parentControl
      if (parent) {
        parent.classList.remove('is-open')
        parent.appendChild(dropdown)
      }
      dropdown.style.position = ''
      dropdown.style.zIndex = ''
      dropdown.style.top = ''
      dropdown.style.left = ''
      dropdown.style.margin = ''
    })

    // 3. 防御性清除任何残留的 is-open 类
    document.querySelectorAll('.custom-select.is-open').forEach(el => el.classList.remove('is-open'))
    document.querySelectorAll('.custom-color-picker.is-open').forEach(el => el.classList.remove('is-open'))
  }

  // 绑定 value 属性存取器到自定义 select 元素
  const ensureSelectValueProperty = (el) => {
    if (Object.prototype.hasOwnProperty.call(el, 'value')) return
    Object.defineProperty(el, 'value', {
      get () { return this.getAttribute('data-value') },
      set (val) {
        this.setAttribute('data-value', val)
        const triggerSpan = this.querySelector('.custom-select-trigger span')
        const options = this.querySelector('.custom-select-options') || document.body.querySelector(`.custom-select-options[data-kml-id="${this.getAttribute('data-kml-id')}"]`)
        if (options) {
          options.querySelectorAll('.custom-select-option').forEach(opt => {
            const isSelected = opt.getAttribute('data-value') === val
            opt.classList.toggle('selected', isSelected)
            if (isSelected && triggerSpan) {
              triggerSpan.textContent = opt.textContent
            }
          })
        }
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
        const hiddenInput = this.querySelector('.custom-color-hidden-input') || document.body.querySelector(`.custom-color-dropdown[data-kml-id="${this.getAttribute('data-kml-id')}"] .custom-color-hidden-input`)
        if (hiddenInput) {
          hiddenInput.value = val
        }
        const hexInput = this.querySelector('.custom-color-hex-input') || document.body.querySelector(`.custom-color-dropdown[data-kml-id="${this.getAttribute('data-kml-id')}"] .custom-color-hex-input`)
        if (hexInput) {
          hexInput.value = val.startsWith('#') ? val.slice(1) : val
        }
      },
      configurable: true
    })
  }

  // 点击空白处关闭所有展开的下拉菜单（采用捕获阶段，防止被冒泡拦截）
  document.addEventListener('click', (event) => {
    const isTrigger = event.target.closest('.custom-select-trigger, .custom-color-trigger, .custom-color-dropdown')
    if (!isTrigger) {
      closeAllDropdowns()
    }
  }, true)

  // 页面滚动、地图拖动时自动收起所有下拉面板，保证视觉一致性
  document.addEventListener('scroll', () => closeAllDropdowns(), { capture: true, passive: true })

  // 利用事件委托监听点击（采用捕获阶段，突破一切冒泡拦截）
  document.addEventListener('click', (event) => {
    const target = event.target

    // 1. 自定义 Select 点击 Trigger
    const selectTrigger = target.closest('.custom-select-trigger')
    if (selectTrigger) {
      event.stopPropagation()
      event.preventDefault()
      const select = selectTrigger.closest('.custom-select')
      if (select) {
        const isOpen = select.classList.contains('is-open')
        closeAllDropdowns()

        if (!isOpen) {
          select.classList.add('is-open')
          const options = select.querySelector('.custom-select-options')
          if (options) {
            options.__parentControl = select
            
            const rect = selectTrigger.getBoundingClientRect()
            options.style.position = 'fixed'
            options.style.zIndex = '99999'
            options.style.margin = '0'
            options.style.width = `${rect.width}px`
            options.style.top = `${rect.bottom + 4}px`
            options.style.left = `${rect.left}px`
            
            document.body.appendChild(options)
            options.getBoundingClientRect() // reflow
            options.classList.add('is-open')
          }
        }
      }
      return
    }

    // 2. 自定义 Select 点击 Option
    const selectOption = target.closest('.custom-select-option')
    if (selectOption) {
      event.stopPropagation()
      event.preventDefault()
      const optionsContainer = selectOption.closest('.custom-select-options')
      const select = optionsContainer?.__parentControl || selectOption.closest('.custom-select')
      if (select) {
        ensureSelectValueProperty(select)
        const val = selectOption.getAttribute('data-value')
        const oldVal = select.value
        if (val !== oldVal) {
          select.value = val
          select.dispatchEvent(new Event('change', { bubbles: true }))
        }
        closeAllDropdowns()
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
        const isOpen = picker.classList.contains('is-open')
        closeAllDropdowns()

        if (!isOpen) {
          picker.classList.add('is-open')
          const dropdown = picker.querySelector('.custom-color-dropdown')
          if (dropdown) {
            dropdown.__parentControl = picker

            const rect = colorTrigger.getBoundingClientRect()
            dropdown.style.position = 'fixed'
            dropdown.style.zIndex = '99999'
            dropdown.style.margin = '0'
            dropdown.style.top = `${rect.bottom + 4}px`
            
            const leftVal = rect.right - 108
            dropdown.style.left = `${leftVal < 0 ? rect.left : leftVal}px`

            document.body.appendChild(dropdown)
            dropdown.getBoundingClientRect()
            dropdown.classList.add('is-open')
          }
        }
      }
      return
    }

    // 4. 自定义 Color Picker 点击预设色块 Swatch
    const swatch = target.closest('.custom-color-swatch')
    if (swatch) {
      event.stopPropagation()
      event.preventDefault()
      const dropdown = swatch.closest('.custom-color-dropdown')
      const picker = dropdown?.__parentControl || swatch.closest('.custom-color-picker')
      if (picker) {
        ensureColorValueProperty(picker)
        const color = swatch.getAttribute('data-color')
        const oldColor = picker.value
        if (color !== oldColor) {
          picker.value = color
          picker.dispatchEvent(new Event('change', { bubbles: true }))
        }
        closeAllDropdowns()
      }
      return
    }

    // 5. 点击 Hex 应用按钮
    const hexBtn = target.closest('.custom-color-hex-btn')
    if (hexBtn) {
      event.stopPropagation()
      event.preventDefault()
      const dropdown = hexBtn.closest('.custom-color-dropdown')
      const picker = dropdown?.__parentControl || hexBtn.closest('.custom-color-picker')
      if (picker) {
        const hexInput = dropdown.querySelector('.custom-color-hex-input')
        if (hexInput) {
          let hex = hexInput.value.trim()
          if (!hex.startsWith('#')) {
            hex = '#' + hex
          }
          if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
            ensureColorValueProperty(picker)
            picker.value = hex
            picker.dispatchEvent(new Event('change', { bubbles: true }))
            closeAllDropdowns()
          } else {
            hexInput.value = picker.value.replace('#', '')
          }
        }
      }
      return
    }

    // 6. 点击自定义颜色按钮调起系统取色盘
    const customColorBtn = target.closest('.custom-color-custom-btn')
    if (customColorBtn) {
      event.stopPropagation()
      event.preventDefault()
      const dropdown = customColorBtn.closest('.custom-color-dropdown')
      const picker = dropdown?.__parentControl || customColorBtn.closest('.custom-color-picker')
      if (picker) {
        const hiddenInput = dropdown.querySelector('.custom-color-hidden-input')
        if (hiddenInput) {
          hiddenInput.click()
        }
      }
      return
    }
  }, true)

  // 利用事件委托监听自定义 Hex 输入框中的回车键 Enter（采用捕获阶段，防止被冒泡拦截）
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      const target = event.target
      const hexInput = target.closest('.custom-color-hex-input')
      if (hexInput) {
        event.stopPropagation()
        event.preventDefault()
        const dropdown = hexInput.closest('.custom-color-dropdown')
        if (dropdown) {
          const hexBtn = dropdown.querySelector('.custom-color-hex-btn')
          hexBtn?.click()
        }
      }
    }
  }, true)

  // 利用事件委托监听隐藏 input 的修改
  document.addEventListener('input', (event) => {
    const target = event.target
    if (target.matches('.custom-color-hidden-input')) {
      const dropdown = target.closest('.custom-color-dropdown')
      const picker = dropdown?.__parentControl || target.closest('.custom-color-picker')
      if (picker) {
        ensureColorValueProperty(picker)
        picker.value = target.value
        picker.dispatchEvent(new Event('change', { bubbles: true }))
      }
    }
  })
}
