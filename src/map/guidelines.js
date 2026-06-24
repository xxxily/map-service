import L from 'leaflet'
import { showConfirm } from '../ui/dialog.js'

// 当前所有的辅助线数据，格式：[{ id, lat, lng, bearing }]
let guidelinesData = []

// 历史快照存储栈，用于撤销与反撤销
const undoStack = []
const redoStack = []

// 当前在地图上渲染的 Leaflet Layer 对象的映射，格式：{ id: L.LayerGroup }
const renderedLayers = {}

// 当前被点击选中的辅助线 ID
let selectedGuidelineId = null

// 辅助线模式激活状态
let isGuidelineModeActive = false

// 地图引用
let activeMap = null

// 预览辅助线图层组
let previewGroup = null
let previewHorizontal = null
let previewVertical = null

// 旋转防误触时间戳记录
let lastRotateTime = 0

// 阻止元素上的所有交互、触摸和指针事件向地图容器冒泡，切断点击穿透
function preventAllPropagation (el) {
  if (!el) return
  const events = [
    'click', 'dblclick',
    'mousedown', 'mouseup',
    'touchstart', 'touchend', 'touchmove',
    'pointerdown', 'pointerup', 'pointermove',
    'contextmenu'
  ]
  events.forEach(evt => {
    el.addEventListener(evt, (e) => {
      e.stopPropagation()
    })
  })
}

// 从 localStorage 加载数据
function loadGuidelinesData () {
  try {
    const raw = localStorage.getItem('map_guidelines')
    console.log('[Guideline Debug] Loading guidelines data from localStorage:', raw)
    if (raw) {
      guidelinesData = JSON.parse(raw)
    }
  } catch (e) {
    console.error('[Guideline Debug] Failed to load guidelines from localStorage', e)
    guidelinesData = []
  }
}

// 保存数据到 localStorage
function saveGuidelinesData () {
  try {
    const raw = JSON.stringify(guidelinesData)
    console.log('[Guideline Debug] Saving guidelines data to localStorage:', raw)
    localStorage.setItem('map_guidelines', raw)
  } catch (e) {
    console.error('[Guideline Debug] Failed to save guidelines to localStorage', e)
  }
}

// 更新工具栏按钮的显示/隐藏状态与可用状态
function updateToolbarButtons () {
  const undoBtn = document.querySelector('[data-guideline-action="undo"]')
  const redoBtn = document.querySelector('[data-guideline-action="redo"]')
  console.log('[Guideline Debug] updateToolbarButtons, undoStack size:', undoStack.length, 'redoStack size:', redoStack.length)
  if (undoBtn) {
    undoBtn.disabled = undoStack.length === 0
    undoBtn.style.display = undoStack.length === 0 ? 'none' : 'inline-flex'
  }
  if (redoBtn) {
    redoBtn.disabled = redoStack.length === 0
    redoBtn.style.display = redoStack.length === 0 ? 'none' : 'inline-flex'
  }
}

// 在数据实质改变前，保存当前状态快照到撤销栈
function pushHistory () {
  undoStack.push(JSON.parse(JSON.stringify(guidelinesData)))
  if (undoStack.length > 50) {
    undoStack.shift()
  }
  redoStack.length = 0
  updateToolbarButtons()
}

// 执行撤销
export function undo () {
  console.log('[Guideline Debug] Undo triggered')
  if (undoStack.length === 0) return

  redoStack.push(JSON.parse(JSON.stringify(guidelinesData)))
  guidelinesData = undoStack.pop()

  if (selectedGuidelineId && !guidelinesData.some(g => g.id === selectedGuidelineId)) {
    selectedGuidelineId = null
  }

  saveGuidelinesData()
  renderGuidelines()
  updateToolbarButtons()
}

// 执行反撤销/重做
export function redo () {
  console.log('[Guideline Debug] Redo triggered')
  if (redoStack.length === 0) return

  undoStack.push(JSON.parse(JSON.stringify(guidelinesData)))
  guidelinesData = redoStack.pop()

  saveGuidelinesData()
  renderGuidelines()
  updateToolbarButtons()
}

/**
 * 根据坐标和偏角计算在墨卡托平面下，以当前画面视口为水平/垂直基准延伸的经纬度折线坐标。
 */
function getGuidelineLatLngs (map, latlng, bearing) {
  const crs = map.options.crs
  const p0 = crs.project(latlng)

  const bounds = map.getBounds()
  const p_ne = crs.project(bounds.getNorthEast())
  const p_sw = crs.project(bounds.getSouthWest())
  const W = Math.abs(p_ne.x - p_sw.x)
  const H = Math.abs(p_ne.y - p_sw.y)
  const D = Math.sqrt(W * W + H * H) || 1000000
  const L_dist = D * 2

  const rad = (bearing * Math.PI) / 180
  const sinT = Math.sin(rad)
  const cosT = Math.cos(rad)

  const v_vert = L.point(-sinT, cosT)
  const v_horiz = L.point(cosT, sinT)

  const Y_MAX = 20037508.34
  const clampPt = (pt) => {
    let { x, y } = pt
    if (y > Y_MAX) y = Y_MAX
    if (y < -Y_MAX) y = -Y_MAX
    return L.point(x, y)
  }

  const pt_v1 = clampPt(L.point(p0.x + L_dist * v_vert.x, p0.y + L_dist * v_vert.y))
  const pt_v2 = clampPt(L.point(p0.x - L_dist * v_vert.x, p0.y - L_dist * v_vert.y))

  const pt_h1 = clampPt(L.point(p0.x + L_dist * v_horiz.x, p0.y + L_dist * v_horiz.y))
  const pt_h2 = clampPt(L.point(p0.x - L_dist * v_horiz.x, p0.y - L_dist * v_horiz.y))

  const latlng_v1 = crs.unproject(pt_v1)
  const latlng_v2 = crs.unproject(pt_v2)

  const latlng_h1 = crs.unproject(pt_h1)
  const latlng_h2 = crs.unproject(pt_h2)

  return {
    vertical: [latlng_v1, latlng_v2],
    horizontal: [latlng_h1, latlng_h2]
  }
}

// 动态刷新已渲染辅助线的端点
function updateGuidelineEndpoints () {
  if (!activeMap) return

  guidelinesData.forEach(item => {
    const group = renderedLayers[item.id]
    if (group) {
      const pts = getGuidelineLatLngs(activeMap, L.latLng(item.lat, item.lng), item.bearing)
      group.eachLayer(layer => {
        if (layer._direction === 'horizontal') {
          layer.setLatLngs(pts.horizontal)
        } else if (layer._direction === 'vertical') {
          layer.setLatLngs(pts.vertical)
        }
      })
    }
  })
}

// 动态改变现有辅助线图层的样式
function updateGuidelineStyles () {
  console.log('[Guideline Debug] updateGuidelineStyles, selectedGuidelineId:', selectedGuidelineId)
  guidelinesData.forEach(item => {
    const group = renderedLayers[item.id]
    if (group) {
      const isSelected = item.id === selectedGuidelineId
      const color = isSelected ? '#be123c' : '#06b6d4'
      const weight = isSelected ? 2.2 : 1.5
      const pointColor = isSelected ? '#be123c' : '#0891b2'
      const radius = isSelected ? 7 : 6

      group.eachLayer(layer => {
        if (layer instanceof L.Polyline) {
          layer.setStyle({ color, weight })
        } else if (layer instanceof L.Marker) {
          const newIcon = L.divIcon({
            className: isSelected ? 'guideline-center-icon is-selected' : 'guideline-center-icon',
            iconSize: isSelected ? [14, 14] : [12, 12],
            iconAnchor: isSelected ? [7, 7] : [6, 6]
          })
          layer.setIcon(newIcon)
        }
      })
    }
  })
}

// 直接删除辅助线
export function deleteGuidelineDirectly (id) {
  console.log('[Guideline Debug] deleteGuidelineDirectly, id:', id)
  const item = guidelinesData.find(g => g.id === id)
  if (!item) return

  pushHistory()

  if (renderedLayers[id] && activeMap) {
    activeMap.removeLayer(renderedLayers[id])
    delete renderedLayers[id]
  }

  guidelinesData = guidelinesData.filter(g => g.id !== id)
  saveGuidelinesData()

  if (selectedGuidelineId === id) {
    selectedGuidelineId = null
  }

  renderGuidelines()
  updateToolbarButtons()
}

// 渲染所有已固定的辅助线
function renderGuidelines () {
  if (!activeMap) {
    console.warn('[Guideline Debug] renderGuidelines failed: activeMap is null')
    return
  }

  console.log('[Guideline Debug] renderGuidelines called, guidelinesData count:', guidelinesData.length)

  // 先清空当前的图层
  Object.keys(renderedLayers).forEach(id => {
    activeMap.removeLayer(renderedLayers[id])
    delete renderedLayers[id]
  })

  // 重新绘制
  guidelinesData.forEach(item => {
    const { id, lat, lng, bearing = 0 } = item
    const pts = getGuidelineLatLngs(activeMap, L.latLng(lat, lng), bearing)

    const isSelected = id === selectedGuidelineId
    const color = isSelected ? '#be123c' : '#06b6d4'
    const weight = isSelected ? 2.2 : 1.5
    const pointColor = isSelected ? '#be123c' : '#0891b2'

    // 水平辅助线，设置永远 interactive 允许任何模式点击触发
    const horizontalLine = L.polyline(pts.horizontal, {
      color: color,
      weight: weight,
      dashArray: '5, 5',
      interactive: true,
      bubblingMouseEvents: false
    })
    horizontalLine._direction = 'horizontal'

    // 垂直辅助线
    const verticalLine = L.polyline(pts.vertical, {
      color: color,
      weight: weight,
      dashArray: '5, 5',
      interactive: true,
      bubblingMouseEvents: false
    })
    verticalLine._direction = 'vertical'

    // 中心交点圆圈，使用 L.Marker + L.divIcon 以支持原生拖拽
    const centerIcon = L.divIcon({
      className: isSelected ? 'guideline-center-icon is-selected' : 'guideline-center-icon',
      iconSize: isSelected ? [14, 14] : [12, 12],
      iconAnchor: isSelected ? [7, 7] : [6, 6]
    })

    const centerPoint = L.marker([lat, lng], {
      icon: centerIcon,
      draggable: true,
      interactive: true,
      bubblingMouseEvents: false
    })

    // 监听拖拽事件以实时更新位置并支持撤销重做
    centerPoint.on('dragstart', () => {
      console.log('[Guideline Debug] Guideline dragstart:', id)
      pushHistory()
      activeMap.closePopup()
    })

    centerPoint.on('drag', (e) => {
      const latlng = e.target.getLatLng()
      item.lat = latlng.lat
      item.lng = latlng.lng

      // 实时更新正交线段的端点坐标
      const pts = getGuidelineLatLngs(activeMap, latlng, item.bearing)
      horizontalLine.setLatLngs(pts.horizontal)
      verticalLine.setLatLngs(pts.vertical)
    })

    centerPoint.on('dragend', () => {
      console.log('[Guideline Debug] Guideline dragend:', id)
      saveGuidelinesData()
    })

    // 绑定浮动删除 popup 气泡
    const popupContent = document.createElement('div')
    popupContent.className = 'guideline-popup-wrap'
    popupContent.innerHTML = `<button type="button" class="guideline-popup-del-btn" title="删除此辅助线 (Delete / Backspace)">🗑️ 删除</button>`

    // 彻底拦截全部鼠标、触摸和指针事件，拦截点击穿透
    preventAllPropagation(popupContent)

    popupContent.querySelector('.guideline-popup-del-btn').addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      console.log('[Guideline Debug] Popup delete button clicked for guideline:', id)
      deleteGuidelineDirectly(id)
    })

    const popup = L.popup({
      closeButton: false,
      offset: [0, -6],
      className: 'guideline-leaflet-popup'
    }).setContent(popupContent)

    centerPoint.bindPopup(popup)

    // 监听 popup 开启，记录选中 ID 并通过 setStyle 动态变红
    centerPoint.on('popupopen', (e) => {
      console.log('[Guideline Debug] Popup opened for guideline:', id)
      selectedGuidelineId = id
      updateGuidelineStyles()
      
      // 禁用整个 Popup 外层 DOM 元素的交互传播，彻底切断 mousedown, mouseup, click, pointerdown 等传递给地图
      const popupEl = e.popup?.getElement()
      if (popupEl) {
        preventAllPropagation(popupEl)
      }
    })

    // 监听 popup 关闭，延迟还原普通状态
    centerPoint.on('popupclose', () => {
      console.log('[Guideline Debug] Popup closed for guideline:', id)
      setTimeout(() => {
        if (selectedGuidelineId === id) {
          selectedGuidelineId = null
          updateGuidelineStyles()
        }
      }, 100)
    })

    // 常态化交互分发，点击后无论当前处于何种模式均会激活并呼出工具栏
    const handleSelect = (e) => {
      console.log('[Guideline Debug] handleSelect triggered on guideline:', id, 'isGuidelineModeActive:', isGuidelineModeActive)
      L.DomEvent.stopPropagation(e)
      if (!isGuidelineModeActive) {
        console.log('[Guideline Debug] Auto-activating guideline mode from select')
        enterGuidelineMode()
      }
      console.log('[Guideline Debug] Calling openPopup on centerPoint for:', id)
      centerPoint.openPopup()
    }

    centerPoint.on('click', handleSelect)
    horizontalLine.on('click', handleSelect)
    verticalLine.on('click', handleSelect)

    const group = L.featureGroup([horizontalLine, verticalLine, centerPoint])
    group.addTo(activeMap)
    renderedLayers[id] = group
  })
}

// 预览随动处理
function onMapMouseMove (e) {
  if (!activeMap) return
  const currentBearing = activeMap.getBearing ? activeMap.getBearing() : 0
  const pts = getGuidelineLatLngs(activeMap, e.latlng, currentBearing)

  if (!previewHorizontal || !previewVertical) {
    if (previewGroup) {
      activeMap.removeLayer(previewGroup)
    }

    previewHorizontal = L.polyline(pts.horizontal, {
      color: '#06b6d4',
      weight: 1.2,
      dashArray: '3, 5',
      opacity: 0.6,
      interactive: false
    })

    previewVertical = L.polyline(pts.vertical, {
      color: '#06b6d4',
      weight: 1.2,
      dashArray: '3, 5',
      opacity: 0.6,
      interactive: false
    })

    previewGroup = L.featureGroup([previewHorizontal, previewVertical])
    previewGroup.addTo(activeMap)
  } else {
    previewHorizontal.setLatLngs(pts.horizontal)
    previewVertical.setLatLngs(pts.vertical)
  }
}

// 移出地图隐藏预览
function onMapMouseOut () {
  if (previewGroup && activeMap) {
    activeMap.removeLayer(previewGroup)
    previewGroup = null
    previewHorizontal = null
    previewVertical = null
  }
}

// 地图点击固定或选中辅助线
function onMapClick (e) {
  if (!activeMap) return

  // 1. 距离和线段碰撞检测（全模式下皆生效）：在投影坐标空间下做高精度碰撞检测，避开 leaflet-rotate 的坐标变换 Bug
  const zoom = activeMap.getZoom()
  const clickPt = activeMap.project(e.latlng, zoom)
  let clickedGuideline = null

  for (const item of guidelinesData) {
    const centerPt = activeMap.project(L.latLng(item.lat, item.lng), zoom)
    const distCenter = clickPt.distanceTo(centerPt)
    // 优先匹配中心圆圈（16 像素感应区）
    if (distCenter < 16) {
      clickedGuideline = item
      break
    }

    // 匹配正交的双向无限长线段（法向量投影距离，8 像素感应区）
    const rad = ((item.bearing || 0) * Math.PI) / 180
    const sinT = Math.sin(rad)
    const cosT = Math.cos(rad)

    const d1 = Math.abs((clickPt.x - centerPt.x) * cosT + (clickPt.y - centerPt.y) * sinT)
    const d2 = Math.abs((clickPt.x - centerPt.x) * sinT - (clickPt.y - centerPt.y) * cosT)

    if (d1 < 8 || d2 < 8) {
      clickedGuideline = item
      break
    }
  }

  if (clickedGuideline) {
    console.log('[Guideline Debug] Existing guideline clicked via hit-test:', clickedGuideline.id)
    if (!isGuidelineModeActive) {
      enterGuidelineMode()
    }
    selectedGuidelineId = clickedGuideline.id
    updateGuidelineStyles()
    const group = renderedLayers[clickedGuideline.id]
    if (group) {
      group.eachLayer(layer => {
        if (layer instanceof L.Marker) {
          setTimeout(() => {
            layer.openPopup()
          }, 100)
        }
      })
    }
    return // 拦截，不创建新线
  }

  // 2. 如果点击的是空白处：
  // 只有在“辅助线模式”激活状态下，点空白处才创建新辅助线；否则作为常规地图点击忽略
  if (!isGuidelineModeActive) {
    return
  }

  // 限制旋转误触：如果最近 300ms 内发生过真实的地图偏转，则拦截本次误点击
  const deltaT = Date.now() - lastRotateTime
  console.log('[Guideline Debug] onMapClick triggered. MS since last rotate:', deltaT)
  if (deltaT < 300) {
    console.log('[Guideline Debug] onMapClick blocked by rotation timer')
    return
  }

  const { lat, lng } = e.latlng
  const currentBearing = activeMap.getBearing ? activeMap.getBearing() : 0

  pushHistory()

  const newId = `guideline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  const newGuideline = {
    id: newId,
    lat,
    lng,
    bearing: currentBearing
  }

  console.log('[Guideline Debug] Adding new guideline:', newGuideline)
  guidelinesData.push(newGuideline)
  saveGuidelinesData()
  renderGuidelines()
  updateToolbarButtons()

  // 新建后立刻选中并弹出删除按钮
  const group = renderedLayers[newId]
  if (group) {
    group.eachLayer(layer => {
      if (layer instanceof L.Marker) {
        setTimeout(() => {
          layer.openPopup()
        }, 100) // 延迟调整为100ms以避开事件分发周期的关闭
      }
    })
  }
}

// 进入辅助线模式
export function enterGuidelineMode () {
  console.log('[Guideline Debug] enterGuidelineMode, currentActive:', isGuidelineModeActive)
  if (!activeMap || isGuidelineModeActive) return
  isGuidelineModeActive = true

  // 修改鼠标指针
  const container = activeMap.getContainer()
  container.classList.add('map-guideline-active')

  // 地图交互事件监听
  activeMap.on('mousemove', onMapMouseMove)
  activeMap.on('mouseout', onMapMouseOut)

  updateToolbarButtons()

  // 显示工具栏
  const toolbar = document.getElementById('guideline-toolbar')
  if (toolbar) {
    toolbar.hidden = false
  }
}

// 退出辅助线模式
export function exitGuidelineMode () {
  console.log('[Guideline Debug] exitGuidelineMode')
  if (!activeMap || !isGuidelineModeActive) return
  isGuidelineModeActive = false

  // 恢复鼠标指针
  const container = activeMap.getContainer()
  container.classList.remove('map-guideline-active')

  // 移除地图事件监听
  activeMap.off('mousemove', onMapMouseMove)
  activeMap.off('mouseout', onMapMouseOut)

  onMapMouseOut()
  
  // 关闭当前所有打开的 popup，并重置选中态
  activeMap.closePopup()
  if (selectedGuidelineId) {
    selectedGuidelineId = null
    updateGuidelineStyles()
  }

  // 隐藏工具栏
  const toolbar = document.getElementById('guideline-toolbar')
  if (toolbar) {
    toolbar.hidden = true
  }
}

// 清除所有辅助线
export async function clearAllGuidelines () {
  console.log('[Guideline Debug] clearAllGuidelines triggered')
  if (guidelinesData.length === 0) return

  const confirmed = await showConfirm('确定要清除地图上的所有辅助线吗？该操作不可撤销。', {
    title: '清除所有辅助线',
    confirmText: '清除',
    cancelText: '取消'
  })

  if (confirmed) {
    pushHistory()

    if (activeMap) {
      Object.keys(renderedLayers).forEach(id => {
        activeMap.removeLayer(renderedLayers[id])
      })
    }
    guidelinesData = []
    Object.keys(renderedLayers).forEach(id => {
      delete renderedLayers[id]
    })
    selectedGuidelineId = null
    saveGuidelinesData()
    renderGuidelines()
    updateToolbarButtons()
  }
}

// 初始化辅助线功能
export function initGuidelines (map) {
  console.log('[Guideline Debug] initGuidelines called')
  activeMap = map
  loadGuidelinesData()
  renderGuidelines()

  // 监听地图的移动和缩放事件，动态刷新辅助线的端点坐标
  map.on('move', updateGuidelineEndpoints)

  // 全局常态化监听地图点击事件，以实现碰撞检测和无感添加
  map.on('click', onMapClick)

  // 监听地图的旋转动作，记录最近真实偏离角度的时间戳，以拦截误触
  let lastBearing = map.getBearing ? map.getBearing() : 0
  map.on('rotate', () => {
    const currentBearing = map.getBearing ? map.getBearing() : 0
    if (Math.abs(currentBearing - lastBearing) > 0.01) {
      lastRotateTime = Date.now()
      console.log('[Guideline Debug] rotate event detected, angle delta > 0.01, updating lastRotateTime')
    }
    lastBearing = currentBearing
  })

  // 绑定工具栏的按钮点击事件
  const toolbar = document.getElementById('guideline-toolbar')
  if (toolbar) {
    toolbar.addEventListener('click', (event) => {
      const actionTarget = event.target.closest('[data-guideline-action]')
      const action = actionTarget?.getAttribute('data-guideline-action')
      console.log('[Guideline Debug] Toolbar button clicked, action:', action)
      if (action === 'clear') {
        clearAllGuidelines()
      } else if (action === 'exit') {
        exitGuidelineMode()
      } else if (action === 'undo') {
        undo()
      } else if (action === 'redo') {
        redo()
      }
    })
  }

  // 监听键盘事件：支持 ESC 退出及 Ctrl+Z (Cmd+Z) / Ctrl+Y (Cmd+Y/Cmd+Shift+Z) 撤销重做
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isGuidelineModeActive) {
      console.log('[Guideline Debug] Escape key pressed, exiting mode')
      exitGuidelineMode()
      return
    }

    if (!isGuidelineModeActive) return

    // 支持 Delete 或 Backspace 键直接删除当前选中的辅助线
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedGuidelineId) {
      console.log('[Guideline Debug] Delete/Backspace key pressed on selected guideline:', selectedGuidelineId)
      event.preventDefault()
      deleteGuidelineDirectly(selectedGuidelineId)
      return
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
    const modifier = isMac ? event.metaKey : event.ctrlKey

    if (modifier) {
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
  })
}

// 切换辅助线模式
export function toggleGuidelineMode () {
  console.log('[Guideline Debug] toggleGuidelineMode')
  if (isGuidelineModeActive) {
    exitGuidelineMode()
  } else {
    enterGuidelineMode()
  }
}
