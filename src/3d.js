import {
  Viewer,
  UrlTemplateImageryProvider,
  Math as CesiumMath,
  Cartesian3,
  Cartesian2,
  Cartographic,
  CesiumTerrainProvider,
  EllipsoidTerrainProvider,
  Ion,
  Terrain,
  Matrix4,
  HeadingPitchRange,
  Quaternion,
  Matrix3,
  sampleTerrainMostDetailed
} from 'cesium'
import AMapLoader from '@amap/amap-jsapi-loader'

import 'cesium/Source/Widgets/widgets.css'
import './styles.css'
import './map3d-styles.css'

import { initAdminApp } from './admin/dashboard.js'
import { isAdminLocation } from './admin/routes.js'
import { amapConfig, terrainConfig } from './config.js'
import { initAfterAccessCheck } from './map/access-control.js'
import { createCesiumLayerSources, LAYER_NAME_MAPPING, REVERSE_LAYER_MAPPING } from './map/tile-sources.js'
import { registerServiceWorker } from './pwa.js'
import { initGuidelines3d, toggleGuidelineMode3d } from './map3d/guidelines.js'
import { initKmlSupport3d } from './map3d/kml.js'
import { updatePosition3d } from './map3d/location.js'
import { initAmapSearch3d, toggleSearchMode3d } from './map3d/search.js'

// 配置 Cesium 资源基础路径
window.CESIUM_BASE_URL = '/cesium/'

const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''

function renderAppVersion () {
  const versionNode = document.getElementById('app-version')
  if (versionNode && APP_VERSION) {
    versionNode.textContent = `v${APP_VERSION}`
  }
}

async function loadAmap () {
  window._AMapSecurityConfig = {
    securityJsCode: amapConfig.securityJsCode,
  }

  return AMapLoader.load({
    key: amapConfig.key,
    version: '2.0',
    plugins: amapConfig.plugins,
  }).catch((err) => {
    console.warn('高德 JSAPI 加载失败，搜索功能不可用', err)
    return null
  })
}

// 2D 缩放级（Zoom）与 3D 相机高度（Height，单位：米）的指数映射转换公式
function zoomToHeight (zoom) {
  return 20000000.0 / Math.pow(2, zoom)
}

function heightToZoom (height) {
  const z = Math.log2(20000000.0 / height)
  return Math.max(1, Math.min(18, Math.round(z)))
}

// 经典的 JavaScript 防抖处理函数
function debounce (func, wait) {
  let timeout
  return function (...args) {
    const context = this
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(context, args), wait)
  }
}

// 预定义底图源组（支持多层叠加与透明度）
const layerSources = createCesiumLayerSources()
const layerNameMapping = LAYER_NAME_MAPPING
const reverseLayerMapping = REVERSE_LAYER_MAPPING

let viewer = null
let isRotating = false
let lastTime = 0
let interactionMode = '2d'
let terrainRuntime = {
  key: '',
  terrain: null,
  loading: false,
  ready: false,
  verified: false,
  loadId: 0,
}
const spinRate = 0.035 // 自转速度（弧度/秒）
const MIN_CAMERA_HEIGHT = 150.0
const MAX_CAMERA_DISTANCE = 18000000.0
const MIN_CAMERA_PITCH = CesiumMath.toRadians(-85.0)
const MAX_CAMERA_PITCH = CesiumMath.toRadians(-15.0)
const MOUSE_ORBIT_SENSITIVITY = 0.003
const TOUCH_ORBIT_SENSITIVITY = 0.0042
const PINCH_ZOOM_SENSITIVITY = 3.0
const MAX_PINCH_ZOOM_FRACTION = 0.62
const MAX_SINGLE_PINCH_MOVE = 4200000.0

function clamp (value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function isMapToolInteractionActive () {
  return Boolean(
    (typeof window.getIsGuidelineModeActive === 'function' && window.getIsGuidelineModeActive()) ||
    (typeof window.getIsKmlPickupModeActive === 'function' && window.getIsKmlPickupModeActive())
  )
}

function getCameraHeight () {
  return viewer?.camera?.positionCartographic?.height || 8000000.0
}

function getCanvasCenterPosition () {
  const canvas = viewer?.canvas
  if (!canvas) return new Cartesian2(0, 0)
  return new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
}

function pickEllipsoidAt (screenPosition) {
  if (!viewer || !screenPosition) return null
  try {
    return viewer.camera.pickEllipsoid(screenPosition, viewer.scene.globe.ellipsoid)
  } catch (err) {
    return null
  }
}

function getOrbitTarget (screenPosition) {
  return pickEllipsoidAt(screenPosition) || pickEllipsoidAt(getCanvasCenterPosition()) || Cartesian3.ZERO
}

function enforceCameraDistanceLimits () {
  if (!viewer) return
  const camera = viewer.camera
  const distanceToCenter = Cartesian3.magnitude(camera.position)
  if (distanceToCenter > MAX_CAMERA_DISTANCE) {
    const normalizedPos = Cartesian3.normalize(camera.position, new Cartesian3())
    Cartesian3.multiplyByScalar(normalizedPos, MAX_CAMERA_DISTANCE, camera.position)
  }
}

function orbitCameraAroundTarget (targetPosition, deltaX, deltaY, sensitivity = MOUSE_ORBIT_SENSITIVITY) {
  if (!viewer || !targetPosition) return
  const camera = viewer.camera
  const headingDelta = -deltaX * sensitivity
  const pitchDelta = -deltaY * sensitivity
  const offset = Cartesian3.subtract(camera.position, targetPosition, new Cartesian3())

  const rotationAxis = Cartesian3.normalize(targetPosition, new Cartesian3())
  if (Cartesian3.magnitude(rotationAxis) > 0.001) {
    const quaternionHeading = Quaternion.fromAxisAngle(rotationAxis, headingDelta, new Quaternion())
    const rotationMatrixHeading = Matrix3.fromQuaternion(quaternionHeading, new Matrix3())
    Matrix3.multiplyByVector(rotationMatrixHeading, offset, offset)
    Matrix3.multiplyByVector(rotationMatrixHeading, camera.direction, camera.direction)
    Matrix3.multiplyByVector(rotationMatrixHeading, camera.up, camera.up)
    Matrix3.multiplyByVector(rotationMatrixHeading, camera.right, camera.right)
  }

  const pitchAxis = camera.right
  if (Cartesian3.magnitude(pitchAxis) > 0.001) {
    const quaternionPitch = Quaternion.fromAxisAngle(pitchAxis, pitchDelta, new Quaternion())
    const rotationMatrixPitch = Matrix3.fromQuaternion(quaternionPitch, new Matrix3())
    Matrix3.multiplyByVector(rotationMatrixPitch, offset, offset)
    Matrix3.multiplyByVector(rotationMatrixPitch, camera.direction, camera.direction)
    Matrix3.multiplyByVector(rotationMatrixPitch, camera.up, camera.up)
    Matrix3.multiplyByVector(rotationMatrixPitch, camera.right, camera.right)
  }

  Cartesian3.add(targetPosition, offset, camera.position)
  Cartesian3.normalize(camera.direction, camera.direction)
  Cartesian3.normalize(camera.up, camera.up)
  Cartesian3.cross(camera.direction, camera.up, camera.right)
  Cartesian3.normalize(camera.right, camera.right)

  if (camera.pitch > MAX_CAMERA_PITCH || camera.pitch < MIN_CAMERA_PITCH) {
    const targetPitch = clamp(camera.pitch, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH)
    const distance = Math.max(MIN_CAMERA_HEIGHT, Cartesian3.distance(camera.position, targetPosition))
    camera.lookAt(targetPosition, new HeadingPitchRange(camera.heading, targetPitch, distance))
    camera.lookAtTransform(Matrix4.IDENTITY)
  }

  enforceCameraDistanceLimits()
}

function getPinchHeightFactor (height) {
  if (height > 3000000) return 1.5
  if (height > 300000) return 1.25
  if (height < 1500) return 0.55
  if (height < 10000) return 0.78
  return 1
}

function zoomCameraAtScreenPoint (screenPosition, ratio) {
  if (!viewer || !Number.isFinite(ratio) || ratio <= 0) return

  const camera = viewer.camera
  const height = Math.max(MIN_CAMERA_HEIGHT, getCameraHeight())
  const zoomFraction = clamp(
    Math.log(ratio) * PINCH_ZOOM_SENSITIVITY * getPinchHeightFactor(height),
    -MAX_PINCH_ZOOM_FRACTION,
    MAX_PINCH_ZOOM_FRACTION
  )
  if (Math.abs(zoomFraction) < 0.002) return

  const targetPosition = pickEllipsoidAt(screenPosition) || pickEllipsoidAt(getCanvasCenterPosition())
  const zoomDistance = Math.min(Math.abs(height * zoomFraction), MAX_SINGLE_PINCH_MOVE)

  if (!targetPosition) {
    if (zoomFraction > 0) {
      camera.moveForward(zoomDistance)
    } else {
      camera.moveBackward(zoomDistance)
    }
    return
  }

  const direction = Cartesian3.subtract(targetPosition, camera.position, new Cartesian3())
  const distanceToTarget = Cartesian3.magnitude(direction)
  if (distanceToTarget <= 0) return
  Cartesian3.normalize(direction, direction)

  if (zoomFraction > 0) {
    const moveDistance = Math.min(zoomDistance, Math.max(0, distanceToTarget - MIN_CAMERA_HEIGHT))
    if (moveDistance > 0) {
      camera.move(direction, moveDistance)
    }
  } else {
    camera.move(direction, -zoomDistance)
  }

  enforceCameraDistanceLimits()
}

function panCameraByScreenDelta (previousMidpoint, currentMidpoint) {
  if (!viewer || !previousMidpoint || !currentMidpoint) return
  const camera = viewer.camera
  const previousTarget = pickEllipsoidAt(previousMidpoint)
  const currentTarget = pickEllipsoidAt(currentMidpoint)

  if (previousTarget && currentTarget) {
    const delta = Cartesian3.subtract(previousTarget, currentTarget, new Cartesian3())
    Cartesian3.add(camera.position, delta, camera.position)
    enforceCameraDistanceLimits()
    return
  }

  const height = getCameraHeight()
  const dx = currentMidpoint.x - previousMidpoint.x
  const dy = currentMidpoint.y - previousMidpoint.y
  const pixelScale = clamp(height * 0.0014, 0.8, 9000)
  camera.moveRight(-dx * pixelScale)
  camera.moveUp(dy * pixelScale)
  enforceCameraDistanceLimits()
}

function setInteractionMode (mode, options = {}) {
  const nextMode = mode === '3d' ? '3d' : '2d'
  const previousMode = interactionMode
  interactionMode = nextMode
  window.getMap3dInteractionMode = () => interactionMode
  restoreDefaultControllerState()

  if (interactionMode === '3d') {
    updateTerrainStatus('地形：3D 操作模式，当前使用平面底图', 'warn')
  } else {
    useFlatTerrain('2D 平面模式')
    if (options.flatten !== false && previousMode !== '2d') {
      flattenCameraView({ keepHeading: true, duration: 0.35 })
    }
  }

  const button = document.getElementById('map3d-mode-toggle')
  if (!button) return

  const is3d = interactionMode === '3d'
  button.classList.toggle('is-3d', is3d)
  button.setAttribute('aria-pressed', String(is3d))
  const text = button.querySelector('span')
  if (text) {
    text.textContent = is3d ? '3D' : '2D'
  }
  document.body.classList.toggle('map3d-interaction-3d', is3d)
}

function restoreDefaultControllerState () {
  if (!viewer) return
  const controller = viewer.scene.screenSpaceCameraController
  controller.enableZoom = true
  controller.enableTranslate = true
  controller.enableRotate = true
  controller.enableTilt = false
  controller.enableLook = false
}

function flattenCameraView (options = {}) {
  if (!viewer) return
  const {
    keepHeading = true,
    duration = 0.4,
  } = options
  const camera = viewer.camera
  camera.flyTo({
    destination: camera.position,
    orientation: {
      heading: keepHeading ? camera.heading : 0.0,
      pitch: CesiumMath.toRadians(-90.0),
      roll: 0.0,
    },
    duration,
  })
}

function installMobileGestureControls (canvas, controller) {
  if (!canvas || !controller || !window.PointerEvent) return

  const activePointers = new Map()
  let gestureState = null
  let savedControllerState = null

  const saveAndSuspendController = () => {
    if (!savedControllerState) {
      savedControllerState = {
        enableZoom: controller.enableZoom,
        enableTranslate: controller.enableTranslate,
        enableRotate: controller.enableRotate,
        enableTilt: controller.enableTilt,
      }
    }
    controller.enableZoom = false
    controller.enableTranslate = false
    controller.enableRotate = false
    controller.enableTilt = false
  }

  const restoreController = () => {
    if (!savedControllerState) return
    controller.enableZoom = savedControllerState.enableZoom
    controller.enableTranslate = savedControllerState.enableTranslate
    controller.enableRotate = savedControllerState.enableRotate
    controller.enableTilt = false
    savedControllerState = null
  }

  const getFirstTwoPointers = () => Array.from(activePointers.values()).slice(0, 2)

  const getMidpoint = (first, second) => new Cartesian2(
    (first.x + second.x) / 2,
    (first.y + second.y) / 2
  )

  const getDistance = (first, second) => Math.hypot(first.x - second.x, first.y - second.y)

  const beginPinchGesture = () => {
    const [first, second] = getFirstTwoPointers()
    if (!first || !second) return
    saveAndSuspendController()
    gestureState = {
      type: 'pinch',
      previousDistance: Math.max(1, getDistance(first, second)),
      previousMidpoint: getMidpoint(first, second),
    }
  }

  const beginOrbitGesture = (point) => {
    if (interactionMode !== '3d' || isMapToolInteractionActive()) return
    saveAndSuspendController()
    const screenPosition = new Cartesian2(point.x, point.y)
    gestureState = {
      type: 'orbit',
      previousPosition: screenPosition,
      targetPosition: getOrbitTarget(screenPosition),
    }
  }

  const endGestureIfNeeded = () => {
    if (activePointers.size === 0) {
      gestureState = null
      restoreController()
      return
    }

    if (activePointers.size === 1 && gestureState?.type === 'pinch') {
      const [point] = Array.from(activePointers.values())
      gestureState = null
      restoreController()
      beginOrbitGesture(point)
    }
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    try {
      canvas.setPointerCapture(event.pointerId)
    } catch (err) {
    }

    if (activePointers.size >= 2) {
      event.preventDefault()
      beginPinchGesture()
      return
    }

    if (interactionMode === '3d' && !isMapToolInteractionActive()) {
      beginOrbitGesture({ x: event.clientX, y: event.clientY })
    }
  }, { passive: false })

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'touch' || !activePointers.has(event.pointerId)) return

    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })

    if (activePointers.size >= 2) {
      event.preventDefault()
      event.stopPropagation()
      if (gestureState?.type !== 'pinch') {
        beginPinchGesture()
        return
      }

      const [first, second] = getFirstTwoPointers()
      if (!first || !second) return

      const currentDistance = Math.max(1, getDistance(first, second))
      const currentMidpoint = getMidpoint(first, second)
      const ratio = currentDistance / Math.max(1, gestureState.previousDistance)

      zoomCameraAtScreenPoint(currentMidpoint, ratio)
      if (interactionMode === '3d') {
        panCameraByScreenDelta(gestureState.previousMidpoint, currentMidpoint)
      }

      gestureState.previousDistance = currentDistance
      gestureState.previousMidpoint = currentMidpoint
      return
    }

    if (gestureState?.type === 'orbit' && interactionMode === '3d' && !isMapToolInteractionActive()) {
      event.preventDefault()
      event.stopPropagation()
      const currentPosition = new Cartesian2(event.clientX, event.clientY)
      const deltaX = currentPosition.x - gestureState.previousPosition.x
      const deltaY = currentPosition.y - gestureState.previousPosition.y
      orbitCameraAroundTarget(gestureState.targetPosition, deltaX, deltaY, TOUCH_ORBIT_SENSITIVITY)
      gestureState.previousPosition = currentPosition
    }
  }, { passive: false })

  const onPointerEnd = (event) => {
    if (event.pointerType !== 'touch') return
    activePointers.delete(event.pointerId)
    try {
      canvas.releasePointerCapture(event.pointerId)
    } catch (err) {
    }
    endGestureIfNeeded()
  }

  const cancelAllGestures = () => {
    activePointers.clear()
    gestureState = null
    restoreController()
  }

  canvas.addEventListener('pointerup', onPointerEnd, { passive: false })
  canvas.addEventListener('pointercancel', onPointerEnd, { passive: false })
  canvas.addEventListener('pointerleave', onPointerEnd, { passive: false })
  window.addEventListener('blur', cancelAllGestures)
  window.addEventListener('pagehide', cancelAllGestures)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAllGestures()
    }
  })
}

function updateTerrainStatus (message, state = '') {
  const statusEl = document.getElementById('terrain-status')
  if (!statusEl) return
  statusEl.textContent = message
  statusEl.classList.remove('is-ready', 'is-warn', 'is-error')
  if (state) {
    statusEl.classList.add(`is-${state}`)
  }
}

function getEffectiveTerrainConfig () {
  const override = (typeof window !== 'undefined' && window.mapServiceTerrainConfig && typeof window.mapServiceTerrainConfig === 'object')
    ? window.mapServiceTerrainConfig
    : {}
  return {
    ...terrainConfig,
    ...override,
    demoView: {
      ...terrainConfig.demoView,
      ...(override.demoView || {}),
    },
  }
}

function fallbackToEllipsoidTerrain (reason) {
  if (!viewer || viewer.isDestroyed()) return
  useFlatTerrain(`地形回退：${reason}`, 'error')
  updateTerrainStatus(`地形：平面回退（${reason}）`, 'error')
  console.warn('3D terrain fallback to ellipsoid:', reason)
}

function verifyTerrainProvider (provider, config, loadId) {
  if (!provider || interactionMode !== '3d' || terrainRuntime.loadId !== loadId) return
  const demoView = config.demoView || terrainConfig.demoView
  const position = Cartographic.fromDegrees(demoView.lng, demoView.lat)
  sampleTerrainMostDetailed(provider, [position]).then(([sample]) => {
    if (interactionMode !== '3d' || terrainRuntime.loadId !== loadId) return
    const height = Number(sample?.height)
    if (Number.isFinite(height) && Math.abs(height) > 20) {
      terrainRuntime.verified = true
      updateTerrainStatus(`地形：真实地形已启用 · 采样 ${Math.round(height)} m · ${config.exaggeration}x`, 'ready')
      console.info('3D terrain verified with sampled height:', height)
    } else {
      updateTerrainStatus('地形：已启用，但采样高度异常，可能仍是平面数据', 'warn')
      console.warn('3D terrain sample returned an abnormal height:', height)
    }
  }).catch((err) => {
    if (interactionMode !== '3d' || terrainRuntime.loadId !== loadId) return
    updateTerrainStatus('地形：已启用，采样自检失败', 'warn')
    console.warn('3D terrain sample check failed:', err)
  })
}

function getTerrainKey (config) {
  return [
    config.enabled ? '1' : '0',
    config.provider || 'world',
    config.url || '',
    config.ionToken ? 'token' : 'no-token',
  ].join('|')
}

function getTerrainExaggeration (config) {
  const value = Number(config.exaggeration)
  if (!Number.isFinite(value)) return 1.35
  return clamp(value, 1, 2)
}

function useFlatTerrain (reason = '平面模式', state = 'warn') {
  if (!viewer || viewer.isDestroyed()) return
  terrainRuntime.loadId += 1
  viewer.terrainProvider = new EllipsoidTerrainProvider()
  viewer.scene.verticalExaggeration = 1
  viewer.scene.verticalExaggerationRelativeHeight = 0
  viewer.scene.globe.enableLighting = false
  updateTerrainStatus(`地形：${reason}，未采样`, state)
}

function enableConfiguredTerrain () {
  if (!viewer) return
  const config = getEffectiveTerrainConfig()

  if (!config.enabled || config.provider === 'none') {
    useFlatTerrain('配置关闭', 'warn')
    return
  }

  try {
    if (config.ionToken) {
      Ion.defaultAccessToken = config.ionToken
    }

    const terrainKey = getTerrainKey(config)
    const loadId = terrainRuntime.loadId + 1
    terrainRuntime.loadId = loadId
    viewer.scene.verticalExaggeration = getTerrainExaggeration(config)
    viewer.scene.verticalExaggerationRelativeHeight = 0
    viewer.scene.globe.enableLighting = true

    if (terrainRuntime.terrain && terrainRuntime.key === terrainKey) {
      viewer.scene.setTerrain(terrainRuntime.terrain)
      updateTerrainStatus(terrainRuntime.ready
        ? `地形：真实地形已启用 · ${viewer.scene.verticalExaggeration}x`
        : '地形：继续加载真实地形...', terrainRuntime.ready ? 'ready' : 'warn')
      if (terrainRuntime.ready && !terrainRuntime.verified && terrainRuntime.terrain.provider) {
        verifyTerrainProvider(terrainRuntime.terrain.provider, {
          ...config,
          exaggeration: viewer.scene.verticalExaggeration,
        }, loadId)
      }
      return
    }

    let terrain = null
    if ((config.provider === 'url' || config.provider === 'self-hosted') && config.url) {
      updateTerrainStatus('地形：加载自托管地形...', 'warn')
      terrain = new Terrain(CesiumTerrainProvider.fromUrl(config.url, {
        requestWaterMask: true,
        requestVertexNormals: true,
      }))
    } else {
      updateTerrainStatus(config.ionToken ? '地形：加载 Cesium World Terrain...' : '地形：加载 World Terrain（未配置 token）...', 'warn')
      terrain = Terrain.fromWorldTerrain({
        requestWaterMask: true,
        requestVertexNormals: true,
      })
    }

    terrainRuntime = {
      key: terrainKey,
      terrain,
      loading: true,
      ready: false,
      verified: false,
      loadId,
    }

    terrain.readyEvent.addEventListener((provider) => {
      if (!viewer || viewer.isDestroyed() || interactionMode !== '3d' || terrainRuntime.loadId !== loadId) return
      terrainRuntime.ready = true
      terrainRuntime.loading = false
      updateTerrainStatus(`地形：真实地形已启用 · ${viewer.scene.verticalExaggeration}x`, 'ready')
      provider.errorEvent.addEventListener((err) => {
        if (interactionMode !== '3d') return
        updateTerrainStatus('地形：瓦片加载异常，已继续保留当前视图', 'warn')
        console.warn('3D terrain tile provider error:', err)
      })
      verifyTerrainProvider(provider, {
        ...config,
        exaggeration: viewer.scene.verticalExaggeration,
      }, loadId)
    })

    terrain.errorEvent.addEventListener((err) => {
      if (terrainRuntime.loadId !== loadId) return
      fallbackToEllipsoidTerrain(err?.message || '加载失败')
    })

    viewer.scene.setTerrain(terrain)
  } catch (err) {
    fallbackToEllipsoidTerrain(err?.message || '初始化失败')
  }
}

function flyToTerrainDemoView () {
  if (!viewer) return
  const { demoView } = getEffectiveTerrainConfig()
  setInteractionMode('3d')
  enableConfiguredTerrain()
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(demoView.lng, demoView.lat, demoView.height),
    orientation: {
      heading: CesiumMath.toRadians(demoView.heading),
      pitch: CesiumMath.toRadians(demoView.pitch),
      roll: 0.0,
    },
    duration: 1.6,
  })
}

// 初始化 Cesium 地球
async function init3dEarth () {
  // 1. 初始化 Viewer 并移除大部分内置控件，打造极简前卫外观
  viewer = new Viewer('cesiumContainer', {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    infoBox: false,
    selectionIndicator: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    // 隐藏默认底图，稍后手动添加
    imageryProvider: false
  })

  // 确保启用所有空间相机控制器（旋转、缩放、平移等）
  const controller = viewer.scene.screenSpaceCameraController
  controller.enableZoom = true
  controller.enableTranslate = true
  controller.enableRotate = true // 高空下必须允许旋转（Rotate）以提供太空视角的拖拽滚动体验，防止地球成为死球
  controller.enableLook = false
  
  // 默认情况下（未按住 Shift 时）关闭倾斜（Tilt），仅在低空允许平移，高空允许旋转球体。
  let isShiftDragging = false
  let lastMousePosition = null
  let dragTargetPosition = null
  let activeManualPointerId = null
  let manual3dGestureUntil = 0

  const resetManualDrag = (event = null) => {
    if (event?.pointerId !== undefined && activeManualPointerId !== null && event.pointerId !== activeManualPointerId) {
      return
    }
    if (event?.pointerId !== undefined && activeManualPointerId === null && !isShiftDragging) {
      return
    }
    if (activeManualPointerId !== null && canvas) {
      try {
        canvas.releasePointerCapture(activeManualPointerId)
      } catch (err) {
      }
    }
    isShiftDragging = false
    lastMousePosition = null
    dragTargetPosition = null
    activeManualPointerId = null
    restoreDefaultControllerState()
  }

  // 动态控制交互权限：当按住 Shift 或使用中/右键进行手动操作时，挂起原生控制器，防止操作互斥冲突
  const handleGestureCheck = (e) => {
    if (e.pointerType === 'touch' || isMapToolInteractionActive()) return
    const isShift = !!e.shiftKey
    const isMiddle = e.button === 1
    const isRight = e.button === 2
    const shouldEnableManual3D = isShift || isMiddle || isRight

    const targetRotateState = !shouldEnableManual3D
    const targetTranslateState = !shouldEnableManual3D

    if (controller.enableRotate !== targetRotateState || controller.enableTranslate !== targetTranslateState) {
      controller.enableRotate = targetRotateState
      controller.enableTranslate = targetTranslateState
      controller.enableTilt = false // 始终让原生倾斜关闭，全权由我们更灵敏的 lookAt 接管
    }
  }

  const canvas = viewer.canvas
  if (canvas) {
    // 1. 监听指针按下 (拖拽开始)
    canvas.addEventListener('pointerdown', (e) => {
      handleGestureCheck(e)

      const isShift = !!e.shiftKey
      const shouldStartManualDrag = e.pointerType !== 'touch' &&
        !isMapToolInteractionActive() &&
        ((e.button === 0 && isShift) || e.button === 1 || e.button === 2)
      if (shouldStartManualDrag) { // Shift + 左键、中键或右键进入手动 3D 调整
        if (interactionMode === '2d') {
          setInteractionMode('3d')
        }
        controller.enableRotate = false
        controller.enableTranslate = false
        controller.enableTilt = false
        manual3dGestureUntil = Date.now() + 1200
        isShiftDragging = true
        activeManualPointerId = e.pointerId
        lastMousePosition = new Cartesian2(e.clientX, e.clientY)
        dragTargetPosition = getOrbitTarget(lastMousePosition)
        try {
          canvas.setPointerCapture(e.pointerId)
        } catch (err) {
        }
      }
    }, true)

    // 2. 监听指针移动 (拖拽中)
    canvas.addEventListener('pointermove', (e) => {
      handleGestureCheck(e)

      if (isShiftDragging && lastMousePosition && dragTargetPosition) {
        if (typeof e.buttons === 'number' && (e.buttons & 1) === 0) {
          resetManualDrag(e)
          return
        }
        e.preventDefault()
        e.stopPropagation()
        // 计算当前鼠标相对上一帧屏幕坐标的位移量
        const deltaX = e.clientX - lastMousePosition.x
        const deltaY = e.clientY - lastMousePosition.y

        // 更新上一次的屏幕坐标
        lastMousePosition.x = e.clientX
        lastMousePosition.y = e.clientY

        orbitCameraAroundTarget(dragTargetPosition, deltaX, deltaY, MOUSE_ORBIT_SENSITIVITY)
        manual3dGestureUntil = Date.now() + 1200
      }
    }, true)

    // 3. 监听指针抬起 (拖拽结束)
    canvas.addEventListener('pointerup', (e) => {
      resetManualDrag(e)
    }, true)
    canvas.addEventListener('pointercancel', resetManualDrag, true)
    canvas.addEventListener('pointerleave', resetManualDrag, true)
    window.addEventListener('pointerup', resetManualDrag, true)
    window.addEventListener('blur', resetManualDrag)
    window.addEventListener('pagehide', resetManualDrag)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        resetManualDrag()
      }
    })
  }
  installMobileGestureControls(canvas, controller)
  setInteractionMode('2d', { flatten: false })

  // 限制最小缩放高度为 150.0 米，防止过度贴地或穿透进入地形内部
  controller.minimumZoomDistance = MIN_CAMERA_HEIGHT

  // 1.1. 重写 showErrorPanel 阻止在未配置 Ion Token 时弹出报错黄条面板，改为在控制台输出
  viewer.showErrorPanel = (title, message, error) => {
    console.warn('Cesium non-fatal warning/error:', title, message, error)
  }

  // 1.6. 限制相机俯仰角（Pitch）防止视锥过长，并在高空时将视线对齐地心，防止平移将地球移出视野
  viewer.scene.preRender.addEventListener(() => {
    if (!viewer) return
    const camera = viewer.camera
    
    // 约束 1：限制最大偏离距离（防止太空视图下地球无限拉远缩小）
    enforceCameraDistanceLimits()

    // 约束 2：高空默认允许 rotate 旋转球体以平移视野，地球本身不会偏移出屏幕，此处无需额外逻辑

    if (interactionMode === '2d') {
      if (isShiftDragging || Date.now() < manual3dGestureUntil) {
        return
      }
      const targetPitch = CesiumMath.toRadians(-90.0)
      if (Math.abs(camera.pitch - targetPitch) > 0.00001 || Math.abs(camera.roll) > 0.00001) {
        camera.setView({
          destination: camera.position,
          orientation: {
            heading: camera.heading,
            pitch: targetPitch,
            roll: 0.0
          }
        })
      }
      return
    }

    // 约束 3：3D 模式限制相机倾斜角（Pitch），防止过度平视导致视锥极长触发疯狂瓦片加载
    if (camera.pitch > MAX_CAMERA_PITCH || camera.pitch < MIN_CAMERA_PITCH) {
      const targetPitch = clamp(camera.pitch, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH)
      camera.setView({
        destination: camera.position,
        orientation: {
          heading: camera.heading,
          pitch: targetPitch,
          roll: camera.roll
        }
      })
    }
  })


  // 1.5. 优化 macOS 触摸板（Trackpad）双指捏合缩放体验并防止高度/地底穿透越界
  // macOS 触摸板双指捏合会派发带有 ctrlKey = true 的 wheel 事件，导致 Cesium 误判或忽略。
  // 我们通过拦截该事件，直接基于屏幕坐标计算目标投影点，利用相机物理移动（move）实现精准的、高度自适应的“以鼠标指针为中心”的 3D 缩放。
  // 并且内置了地表碰撞防护限制，避免相机飞入地心触发 "normalized result is not a number" 崩溃。
  if (canvas) {
    canvas.addEventListener('wheel', (e) => {
      // A. 如果是按住 Shift 键的触摸板双指滑动（或鼠标滚轮滚动）
      if (e.shiftKey && !e.ctrlKey && !isMapToolInteractionActive()) {
        e.preventDefault()
        if (interactionMode === '2d') {
          setInteractionMode('3d')
        }
        manual3dGestureUntil = Date.now() + 1200

        const camera = viewer.camera

        // 1. 获取当前鼠标底下的三维世界坐标作为旋转/倾斜中心点
        const mousePosition = new Cartesian2(e.clientX, e.clientY)
        const targetPosition = getOrbitTarget(mousePosition)

        // 2. 获取当前相机的 heading, pitch, 以及到目标点的距离 range
        const distance = Cartesian3.distance(camera.position, targetPosition)
        const range = Math.max(MIN_CAMERA_HEIGHT, distance) // 限制最小距离

        // 3. 计算旋转和倾斜增量
        // e.deltaX 代表水平滑动（用于旋转），deltaY 代表垂直滑动（用于倾斜视角）
        const sens = 0.002 // 敏感度系数
        let headingDelta = -e.deltaX * sens
        let pitchDelta = -e.deltaY * sens

        // 计算新的角度
        let newHeading = camera.heading + headingDelta
        let newPitch = camera.pitch + pitchDelta

        // 限制倾斜角范围，防止穿透或者过度平视
        newPitch = clamp(newPitch, MIN_CAMERA_PITCH, MAX_CAMERA_PITCH)

        // 4. 让相机绕着 targetPosition 进行中心偏航和俯仰，并释放锁定
        camera.lookAt(targetPosition, new HeadingPitchRange(newHeading, newPitch, range))
        camera.lookAtTransform(Matrix4.IDENTITY)
        return
      }

      if (e.ctrlKey) {
        e.preventDefault()

        const camera = viewer.camera
        const scene = viewer.scene

        // 1. 获取鼠标在屏幕上的坐标
        const mousePosition = new Cartesian2(e.clientX, e.clientY)

        // 2. 将屏幕坐标转换为地球表面的三维世界坐标（以椭球体上交点为缩放中心点）
        const targetPosition = camera.pickEllipsoid(mousePosition, scene.globe.ellipsoid)

        // 3. 计算相机当前高度，用于自适应缩放步长
        const height = camera.positionCartographic ? camera.positionCartographic.height : 8000000.0

        if (!targetPosition) {
          // 如果鼠标没有指向地球表面，则直接沿着相机的朝向（方向向量）进行缩放移动
          const zoomAmount = height * 0.05
          if (e.deltaY < 0) {
            camera.moveForward(zoomAmount)
          } else {
            camera.moveBackward(zoomAmount)
          }
          return
        }

        // 4. 自适应缩放比例：根据高度进行动态百分比缩放。
        // 根据 deltaY 的大小来决定单次滚动的缩放百分比，通常限制在高度的 3% - 18% 之间
        const zoomPercentage = Math.min(0.18, Math.max(0.03, Math.abs(e.deltaY) * 0.025))
        const zoomAmount = height * zoomPercentage

        // 5. 计算方向向量
        const direction = Cartesian3.subtract(targetPosition, camera.position, new Cartesian3())
        const distance = Cartesian3.magnitude(direction)

        // 归一化方向向量
        Cartesian3.normalize(direction, direction)

        if (e.deltaY < 0) {
          // 放大：朝向目标点移动，但最多只能移到距离目标点 120 米处，防止穿透地表
          const maxMoveDistance = Math.max(0.0, distance - 120.0)
          const moveDistance = Math.min(zoomAmount, maxMoveDistance)
          if (moveDistance > 0) {
            camera.move(direction, moveDistance)
          }
        } else {
          // 缩小：背离目标点移动，限制单次最大位移
          const moveDistance = Math.min(zoomAmount, 3000000.0)
          camera.move(direction, -moveDistance)
        }
      }
    }, { passive: false })
  }

  // 2. 加载默认底图（自适应读取 URL 或本地图层缓存，对齐 2D）
  const urlParams = new URLSearchParams(window.location.search)
  let initialLayer = urlParams.get('layer') || localStorage.getItem('last_map_layer') || 'amap-hybrid'

  // 自适应中英文图层名转换，保证 2D/3D 高度关联
  if (reverseLayerMapping[initialLayer]) {
    initialLayer = reverseLayerMapping[initialLayer]
  } else if (!layerSources[initialLayer]) {
    initialLayer = 'amap-hybrid' // 兜底
  }

  switchLayer(initialLayer)
  const activeRadio = document.querySelector(`#map3d-layer-control input[data-layer="${initialLayer}"]`)
  if (activeRadio) {
    activeRadio.checked = true
  }

  // 3. 从 URL 或者缓存初始化相机视角（对齐 2D）
  initCameraView()

  // 4. 初始化地球自转动画逻辑
  lastTime = Date.now()
  viewer.scene.postRender.addEventListener((scene, time) => {
    if (!isRotating) return
    const now = Date.now()
    const delta = (now - lastTime) / 1000
    lastTime = now

    // 沿 Z 轴（自转轴）旋转相机
    viewer.camera.rotate(Cartesian3.UNIT_Z, -spinRate * delta)
  })

  // 5. 监听相机交互，拖拽时自动停用地球自转，并高频更新右下角指南针罗盘指向
  viewer.camera.moveStart.addEventListener(() => {
    if (isRotating) {
      isRotating = false
      const spinBtn = document.querySelector('[data-action="toggleRotation"]')
      if (spinBtn) spinBtn.classList.remove('active')
    }
  })

  // 监听相机位置和偏航角（Heading）实时旋转指南针
  viewer.scene.preRender.addEventListener(() => {
    if (!viewer) return
    const camera = viewer.camera
    const headingDeg = CesiumMath.toDegrees(camera.heading)
    const normalizedHeading = (headingDeg % 360 + 360) % 360

    const resetBearingBtn = document.getElementById('reset-bearing-btn')
    if (resetBearingBtn) {
      // 只要偏航角偏离正北超过 1.0 度，就显式显示罗盘按钮；否则隐去以保持对齐 2D 效果
      if (Math.abs(normalizedHeading) > 1.0 && Math.abs(normalizedHeading - 360) > 1.0) {
        resetBearingBtn.style.display = 'grid'
        const compassIcon = resetBearingBtn.querySelector('.compass-icon')
        if (compassIcon) {
          compassIcon.style.transform = `rotate(${-normalizedHeading}deg)`
        }
      } else {
        resetBearingBtn.style.display = 'none'
      }
    }
  })

  // 6. 实时更新底部的相机高度和位置信息，并防抖同步位置到 URL/缓存（对齐 2D）
  viewer.camera.changed.addEventListener(updateCameraStatus)
  viewer.camera.changed.addEventListener(syncCameraStateToUrl)
  // 初次加载也运行一次状态更新
  updateCameraStatus()

  // 7. 初始化与首页对标的地图工具能力
  const AMap = await loadAmap()
  if (AMap) {
    initAmapSearch3d(viewer, AMap)
  }
  initKmlSupport3d(viewer)
  initGuidelines3d(viewer)

  // 8. 绑定界面交互事件
  bindUiEvents()
}

// 切换底图图层（支持多层叠加与透明度）
function switchLayer (layerId) {
  if (!viewer) return
  const configs = layerSources[layerId]
  if (!configs || !Array.isArray(configs)) return

  const layers = viewer.imageryLayers
  layers.removeAll()

  // 依次添加配置中的所有子图层
  configs.forEach(config => {
    const provider = new UrlTemplateImageryProvider({
      url: config.url,
      subdomains: config.subdomains
    })
    const addedLayer = layers.addImageryProvider(provider)
    
    // 如果子图层配置了不透明度 (alpha)，则予以应用，以保证图层正确叠加显示
    if (config.opacity !== undefined) {
      addedLayer.alpha = config.opacity
    }
  })
}

// 重置相机到默认视角（中国）
function resetCameraView () {
  if (!viewer) return
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(104.2, 35.8, 8000000.0),
    orientation: {
      heading: CesiumMath.toRadians(0.0),
      pitch: CesiumMath.toRadians(-90.0),
      roll: 0.0
    },
    duration: 2.0
  })
}

// 从 URL 或者 localStorage 恢复上一次停留的位置，高度对齐 2D 地图
function initCameraView () {
  if (!viewer) return

  const urlParams = new URLSearchParams(window.location.search)
  const coordsParam = urlParams.get('coords')

  let lat = NaN
  let lng = NaN
  let zoom = NaN
  let bearing = NaN

  if (coordsParam) {
    const rawCoords = coordsParam.split(',')
    lat = Number(rawCoords[0])
    lng = Number(rawCoords[1])
    zoom = Number.parseInt(rawCoords[2] || '', 10)
    bearing = Number(rawCoords[3] || 0)
  }

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    // 尝试从 localStorage 中恢复
    try {
      const rawLocal = localStorage.getItem('last_map_view')
      if (rawLocal) {
        const localView = JSON.parse(rawLocal)
        if (localView && localView.center) {
          lat = localView.center[0]
          lng = localView.center[1]
          zoom = localView.zoom
          bearing = localView.bearing
        }
      }
    } catch (e) {
      console.error('Failed to parse last_map_view from localStorage', e)
    }
  }

  // 如果没有缓存，则使用兜底默认值（中国上空）
  if (Number.isNaN(lat) || Number.isNaN(lng)) lat = 35.8
  if (Number.isNaN(lng)) lng = 104.2
  if (Number.isNaN(zoom)) zoom = 3
  if (Number.isNaN(bearing)) bearing = 0

  // 将 Zoom 换算为 Height
  const height = zoomToHeight(zoom)

  viewer.camera.setView({
    destination: Cartesian3.fromDegrees(lng, lat, height),
    orientation: {
      heading: CesiumMath.toRadians(bearing),
      pitch: CesiumMath.toRadians(-90.0), // 3D 初始化时保持为 2D 正视视角，跟手后可自由倾斜
      roll: 0.0
    }
  })
}

// 实时将相机位置和图层同步写入 URL 及 localStorage，高度对齐 2D 地图（添加防抖限制防止高频卡顿）
const syncCameraStateToUrl = debounce(() => {
  if (!viewer) return
  const camera = viewer.camera
  const scene = viewer.scene

  // 1. 计算当前视口中心点投影到地球表面的三维世界坐标
  const canvas = viewer.canvas
  const centerScreenPos = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
  let centerCartesian = camera.pickEllipsoid(centerScreenPos, scene.globe.ellipsoid)
  if (!centerCartesian) {
    centerCartesian = camera.position // 若无交点（外太空远景），回退至相机物理位置
  }

  const cartographic = scene.globe.ellipsoid.cartesianToCartographic(centerCartesian)
  const lat = CesiumMath.toDegrees(cartographic.latitude)
  const lng = CesiumMath.toDegrees(cartographic.longitude)

  // 2. 将相机当前海拔高度转换为 2D 缩放级 zoom
  const cameraHeight = camera.positionCartographic ? camera.positionCartographic.height : 8000000.0
  const zoom = heightToZoom(cameraHeight)

  // 3. 计算偏航角为 2D 罗盘旋转度 bearing
  const headingDeg = CesiumMath.toDegrees(camera.heading)
  const bearing = Math.round((headingDeg % 360 + 360) % 360)

  // 4. 当前选中的底图图层名称
  const activeRadio = document.querySelector('#map3d-layer-control input[name="leaflet-base-layers"]:checked')
  const layerId = activeRadio ? activeRadio.getAttribute('data-layer') : 'amap-hybrid'
  const layerName2D = layerNameMapping[layerId] || layerId

  // 5. 拼装符合 2D 规范的坐标字符串coords
  const coords = `${lat.toFixed(6)},${lng.toFixed(6)},${zoom},${bearing}`

  // 6. 写入 URL 属性
  const urlParams = new URLSearchParams(window.location.search)
  urlParams.set('coords', coords)
  if (layerName2D) {
    urlParams.set('layer', layerName2D)
  } else {
    urlParams.delete('layer')
  }

  const query = urlParams.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)

  // 7. 写入 localStorage 缓存
  try {
    localStorage.setItem('last_map_view', JSON.stringify({
      center: [Number(lat.toFixed(6)), Number(lng.toFixed(6))],
      zoom,
      bearing,
      layer: layerName2D
    }))
    localStorage.setItem('last_map_layer', layerName2D)
  } catch (err) {
    console.error('Failed to save last_map_view to localStorage', err)
  }
}, 300)

// 更新位置/状态信息栏
function updateCameraStatus () {
  if (!viewer) return
  const camera = viewer.camera
  const position = camera.positionCartographic
  if (!position) return

  const lon = CesiumMath.toDegrees(position.longitude).toFixed(5)
  const lat = CesiumMath.toDegrees(position.latitude).toFixed(5)
  const alt = (position.height / 1000).toFixed(1) // 转换为千米

  const statusEl = document.getElementById('camera-status')
  if (statusEl) {
    statusEl.textContent = `经度: ${lon}° | 纬度: ${lat}° | 海拔: ${alt} km`
  }
}

// 绑定 3D 控制面板上的 UI 事件（高度对齐 2D）
function bindUiEvents () {
  const menu = document.getElementById('map-menu')
  const layerControlPanel = document.getElementById('map3d-layer-control')
  if (!menu) return

  const modeToggleBtn = document.getElementById('map3d-mode-toggle')
  if (modeToggleBtn) {
    modeToggleBtn.addEventListener('click', () => {
      setInteractionMode(interactionMode === '3d' ? '2d' : '3d')
    })
  }

  // 1. 图层面板选项切换绑定（Radio 方式，对齐 2D 底层逻辑）
  if (layerControlPanel) {
    layerControlPanel.addEventListener('change', (e) => {
      const radioInput = e.target.closest('input[name="leaflet-base-layers"]')
      if (radioInput) {
        const layerId = radioInput.getAttribute('data-layer')
        if (layerId) {
          switchLayer(layerId)
          try {
            localStorage.setItem('last_map_layer', layerNameMapping[layerId] || layerId)
          } catch (err) {
            console.error('Failed to save last_map_layer in localStorage', err)
          }
          syncCameraStateToUrl()
        }
      }
    })

    // 仿 2D Leaflet 逻辑：支持点击 Toggle 图标展开面板，以及点击外部空白区域自动折叠
    const layerToggle = layerControlPanel.querySelector('.leaflet-control-layers-toggle')
    if (layerToggle) {
      layerToggle.addEventListener('click', (e) => {
        e.stopPropagation()
        layerControlPanel.classList.add('leaflet-control-layers-expanded')
      })
    }

    // 全局点击空白折叠图层卡片
    document.addEventListener('click', (e) => {
      if (!layerControlPanel.contains(e.target)) {
        layerControlPanel.classList.remove('leaflet-control-layers-expanded')
      }
    })
  }

  // 2. 更多工具与图层切换（对齐 2D：同步展开右下角菜单 + 显示/隐藏右上角图层卡片）
  const layerControlBtn = menu.querySelector('[data-action="toggleLayerControl"]')
  if (layerControlBtn && layerControlPanel) {
    // 读取 localStorage 中保存的菜单展开状态
    let expanded = false
    try {
      expanded = localStorage.getItem('3d_menu_expanded') === 'true'
    } catch (err) {
      console.error(err)
    }

    const updateExpandedState = (state) => {
      expanded = state
      try {
        localStorage.setItem('3d_menu_expanded', state)
      } catch (err) {
        console.error(err)
      }

      if (expanded) {
        menu.classList.add('is-expanded')
        layerControlPanel.style.display = 'block'
        layerControlBtn.setAttribute('aria-expanded', 'true')
      } else {
        menu.classList.remove('is-expanded')
        layerControlPanel.style.display = 'none'
        layerControlBtn.setAttribute('aria-expanded', 'false')
      }
    }

    // 初始化展开状态
    updateExpandedState(expanded)

    layerControlBtn.addEventListener('click', () => {
      updateExpandedState(!expanded)
    })
  }

  // 3. 重置指南针偏航角为正北（Heading = 0），保留当前倾斜度
  const resetBearingBtn = document.getElementById('reset-bearing-btn')
  if (resetBearingBtn) {
    resetBearingBtn.addEventListener('click', () => {
      if (interactionMode === '2d') {
        flattenCameraView({ keepHeading: false, duration: 0.6 })
        return
      }
      const camera = viewer.camera
      camera.flyTo({
        destination: camera.position,
        orientation: {
          heading: 0.0,
          pitch: camera.pitch,
          roll: camera.roll
        },
        duration: 0.6
      })
    })
  }

  const kmlBtn = menu.querySelector('[data-action="toggleKmlPanel"]')
  if (kmlBtn) {
    kmlBtn.addEventListener('click', () => {
      window.toggleKmlPanel?.()
    })
  }

  const guidelineBtn = menu.querySelector('[data-action="toggleGuidelineMode"]')
  if (guidelineBtn) {
    guidelineBtn.addEventListener('click', () => {
      toggleGuidelineMode3d()
    })
  }

  const searchBtn = menu.querySelector('[data-action="toggleSearchMode"]')
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      toggleSearchMode3d()
    })
  }

  const positionBtn = menu.querySelector('[data-action="updatePosition"]')
  if (positionBtn) {
    positionBtn.addEventListener('click', () => {
      updatePosition3d(viewer)
    })
  }

  // 4. 地球自转控制
  const spinBtn = menu.querySelector('[data-action="toggleRotation"]')
  if (spinBtn) {
    // 同步初始化状态
    if (isRotating) {
      spinBtn.classList.add('active')
    }

    spinBtn.addEventListener('click', () => {
      isRotating = !isRotating
      if (isRotating) {
        lastTime = Date.now()
        spinBtn.classList.add('active')
      } else {
        spinBtn.classList.remove('active')
      }
    })
  }

  // 5. 视角复位
  const resetBtn = menu.querySelector('[data-action="resetView"]')
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetCameraView()
    })
  }

  const terrainDemoBtn = menu.querySelector('[data-action="flyTerrainDemo"]')
  if (terrainDemoBtn) {
    terrainDemoBtn.addEventListener('click', () => {
      flyToTerrainDemoView()
    })
  }

  const adminBtn = menu.querySelector('[data-action="openAdmin"]')
  if (adminBtn) {
    adminBtn.addEventListener('click', () => {
      window.location.href = '/admin/overview'
    })
  }

  // 6. 返回 2D 视图
  const backBtn = menu.querySelector('[data-action="back2d"]')
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = '/' + window.location.search
    })
  }
}

if (isAdminLocation(window.location)) {
  initAdminApp({ amapLoader: AMapLoader })
} else {
  renderAppVersion()
  initAfterAccessCheck({
    init: init3dEarth,
    title: '私有地图三维视图',
    submitText: '载入三维地球',
  })
}

registerServiceWorker()
