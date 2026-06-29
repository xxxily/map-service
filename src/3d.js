import {
  Viewer,
  UrlTemplateImageryProvider,
  Math as CesiumMath,
  Cartesian3,
  Cartesian2,
  CameraEventType,
  KeyboardEventModifier,
  Terrain,
  Matrix4,
  HeadingPitchRange,
  Quaternion,
  Matrix3
} from 'cesium'

import 'cesium/Source/Widgets/widgets.css'
import './styles.css'
import './map3d-styles.css'

import { getAccessStatus, verifyAccessPassword } from './admin/api.js'
import { escapeHtml } from './admin/utils.js'
import { tileRelayEndpoint } from './config.js'

// 配置 Cesium 资源基础路径
window.CESIUM_BASE_URL = '/cesium/'

function relayTileUrl (targetUrl) {
  const encodedTarget = encodeURIComponent(targetUrl)
    .replace(/%7B/g, '{')
    .replace(/%7D/g, '}')
  return `${tileRelayEndpoint}?url=${encodedTarget}`
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
const layerSources = {
  'amap-hybrid': [
    {
      url: relayTileUrl('https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=6&x={x}&y={y}&z={z}&scl=1'),
      subdomains: ['1', '2', '3', '4']
    },
    {
      url: relayTileUrl('https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1'),
      subdomains: ['1', '2', '3', '4'],
      opacity: 0.5
    }
  ],
  'google-amap-hybrid': [
    {
      url: relayTileUrl('https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}'),
      subdomains: []
    },
    {
      url: relayTileUrl('https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1'),
      subdomains: ['1', '2', '3', '4'],
      opacity: 0.7
    }
  ],
  'google-sat': [
    {
      url: relayTileUrl('https://www.google.com/maps/vt?lyrs=s@189&gl=cn&x={x}&y={y}&z={z}'),
      subdomains: []
    }
  ],
  'amap-road': [
    {
      url: relayTileUrl('https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&style=8&x={x}&y={y}&z={z}&scl=1'),
      subdomains: ['1', '2', '3', '4']
    }
  ],
  'google-road': [
    {
      url: relayTileUrl('https://www.google.com/maps/vt?lyrs=m@189&gl=cn&x={x}&y={y}&z={z}'),
      subdomains: []
    }
  ]
}

// 2D 汉字图层名与 3D 英文图层 key 的双向对齐映射表
const layerNameMapping = {
  'amap-hybrid': '高德/卫星',
  'google-amap-hybrid': '谷歌高德/卫星',
  'google-sat': '谷歌/卫星',
  'amap-road': '高德/街道',
  'google-road': '谷歌/街道'
}

const reverseLayerMapping = {
  '高德/卫星': 'amap-hybrid',
  '谷歌高德/卫星': 'google-amap-hybrid',
  '谷歌高德/卫星（HD）': 'google-amap-hybrid',
  '谷歌/卫星': 'google-sat',
  '高德/街道': 'amap-road',
  '谷歌/街道': 'google-road'
}

let viewer = null
let isRotating = false
let lastTime = 0
const spinRate = 0.035 // 自转速度（弧度/秒）

// 初始化 Cesium 地球
function init3dEarth () {
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
  
  // 默认情况下（未按住 Shift 时）关闭倾斜（Tilt），仅在低空允许平移，高空允  // 声明手动拖拽状态变量及局部 ENU 坐标系下的累加角度状态，防止参考系切换产生位置和方向突变抖动
  let isShiftDragging = false
  let lastMousePosition = null
  let dragTargetPosition = null
  let currentHeading = 0
  let currentPitch = 0
  let currentRange = 0

  // 动态控制交互权限：当按住 Shift 或使用中/右键进行手动操作时，挂起原生控制器，防止操作互斥冲突
  const handleGestureCheck = (e) => {
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
      if (isShift && e.button === 0) { // Shift + 左键按下
        isShiftDragging = true
        lastMousePosition = new Cartesian2(e.clientX, e.clientY)

        const camera = viewer.camera
        const scene = viewer.scene
        
        // 核心优化：以用户“鼠标点击/手指按压”的那个地面点，作为 3D 旋转和俯仰倾角变化的中心点
        dragTargetPosition = camera.pickEllipsoid(lastMousePosition, scene.globe.ellipsoid)
        if (!dragTargetPosition) {
          dragTargetPosition = Cartesian3.ZERO // 回退地心
        }
      }
    }, true)

    // 2. 监听指针移动 (拖拽中)
    canvas.addEventListener('pointermove', (e) => {
      handleGestureCheck(e)

      if (isShiftDragging && lastMousePosition && dragTargetPosition) {
        const camera = viewer.camera

        // 计算当前鼠标相对上一帧屏幕坐标的位移量
        const deltaX = e.clientX - lastMousePosition.x
        const deltaY = e.clientY - lastMousePosition.y

        // 更新上一次的屏幕坐标
        lastMousePosition.x = e.clientX
        lastMousePosition.y = e.clientY

        // 根据屏幕位移量转换为 Heading (左右) 和 Pitch (俯仰) 变化增量
        const sens = 0.003
        const headingDelta = -deltaX * sens
        const pitchDelta = -deltaY * sens

        // 获取相机当前到公转支点的位置向量 V = position - center
        const V = Cartesian3.subtract(camera.position, dragTargetPosition, new Cartesian3())

        // 1. 左右旋转：绕过支点处的地球法线轴（即 dragTargetPosition 归一化方向）进行旋转
        const rotationAxis = Cartesian3.normalize(dragTargetPosition, new Cartesian3())
        if (Cartesian3.magnitude(rotationAxis) > 0.001) {
          const quaternionHeading = Quaternion.fromAxisAngle(rotationAxis, headingDelta, new Quaternion())
          const rotationMatrixHeading = Matrix3.fromQuaternion(quaternionHeading, new Matrix3())

          // 旋转相机到支点的位置向量
          Matrix3.multiplyByVector(rotationMatrixHeading, V, V)
          // 旋转相机的正交姿态基向量
          Matrix3.multiplyByVector(rotationMatrixHeading, camera.direction, camera.direction)
          Matrix3.multiplyByVector(rotationMatrixHeading, camera.up, camera.up)
          Matrix3.multiplyByVector(rotationMatrixHeading, camera.right, camera.right)
        }

        // 2. 上下倾斜：绕相机的右向量轴（camera.right）进行倾斜
        const pitchAxis = camera.right
        if (Cartesian3.magnitude(pitchAxis) > 0.001) {
          const quaternionPitch = Quaternion.fromAxisAngle(pitchAxis, pitchDelta, new Quaternion())
          const rotationMatrixPitch = Matrix3.fromQuaternion(quaternionPitch, new Matrix3())

          // 旋转相机到支点的位置向量
          Matrix3.multiplyByVector(rotationMatrixPitch, V, V)
          // 旋转相机的正交姿态基向量
          Matrix3.multiplyByVector(rotationMatrixPitch, camera.direction, camera.direction)
          Matrix3.multiplyByVector(rotationMatrixPitch, camera.up, camera.up)
          Matrix3.multiplyByVector(rotationMatrixPitch, camera.right, camera.right)
        }

        // 3. 更新相机在世界坐标系下的新物理位置 P = center + V
        Cartesian3.add(dragTargetPosition, V, camera.position)

        // 4. 正交归一化相机姿态（Orthonormalize），防止多次旋转累加产生的拉伸/剪切畸变
        Cartesian3.normalize(camera.direction, camera.direction)
        Cartesian3.normalize(camera.up, camera.up)
        // 叉乘计算出相互垂直的右向量
        Cartesian3.cross(camera.direction, camera.up, camera.right)
        Cartesian3.normalize(camera.right, camera.right)

        // 5. 夹角安全截断：限制俯仰角，防止地底穿透和过度平视
        const minPitch = CesiumMath.toRadians(-85.0)
        const maxPitch = CesiumMath.toRadians(-15.0)
        if (camera.pitch > maxPitch || camera.pitch < minPitch) {
          const targetPitch = Math.max(minPitch, Math.min(maxPitch, camera.pitch))
          const distance = Cartesian3.distance(camera.position, dragTargetPosition)
          // 仅在越界需要拉回时，一次性调用 lookAt 进行安全限位重置，日常无抖动
          camera.lookAt(dragTargetPosition, new HeadingPitchRange(camera.heading, targetPitch, distance))
          camera.lookAtTransform(Matrix4.IDENTITY)
        }
      }
    }, true)

    // 3. 监听指针抬起 (拖拽结束)
    canvas.addEventListener('pointerup', (e) => {
      isShiftDragging = false
      lastMousePosition = null
      dragTargetPosition = null
      handleGestureCheck(e)
    }, true)
  }

  // 限制最小缩放高度为 150.0 米，防止过度贴地或穿透进入地形内部
  controller.minimumZoomDistance = 150.0

  // 1.1. 重写 showErrorPanel 阻止在未配置 Ion Token 时弹出报错黄条面板，改为在控制台输出
  viewer.showErrorPanel = (title, message, error) => {
    console.warn('Cesium non-fatal warning/error:', title, message, error)
  }

  // 1.3. 开启三维世界地形起伏，展现逼真的立体山脉与高低落差
  try {
    Terrain.fromWorldTerrain({
      requestWaterMask: true,
      requestVertexNormals: true // 开启地形光照法线，大幅增强 3D 立体山川视觉质感
    }).then(provider => {
      if (viewer && !viewer.isDestroyed()) {
        viewer.terrainProvider = provider
      }
    }).catch(err => {
      console.warn('Failed to initialize Cesium World Terrain:', err)
    })
  } catch (err) {
    console.warn('Failed to initialize Cesium World Terrain provider:', err)
  }

  // 1.4. 开启地形夸张效果（2.2倍），大幅强化山脉起伏和三维立体落差感
  viewer.scene.terrainExaggeration = 2.2

  // 1.6. 限制相机俯仰角（Pitch）防止视锥过长，并在高空时将视线对齐地心，防止平移将地球移出视野
  viewer.scene.preRender.addEventListener(() => {
    if (!viewer) return
    const camera = viewer.camera
    
    // 约束 1：限制最大偏离距离（防止太空视图下地球无限拉远缩小）
    const distanceToCenter = Cartesian3.magnitude(camera.position)
    const maxDistance = 18000000.0 // 限制最大距离为 1.8 万千米
    if (distanceToCenter > maxDistance) {
      const normalizedPos = Cartesian3.normalize(camera.position, new Cartesian3())
      Cartesian3.multiplyByScalar(normalizedPos, maxDistance, camera.position)
    }

    // 约束 2：高空默认允许 rotate 旋转球体以平移视野，地球本身不会偏移出屏幕，此处无需额外逻辑

    // 约束 3：限制相机倾斜角（Pitch），防止过度平视平视导致视锥极长触发疯狂瓦片加载
    const minPitch = CesiumMath.toRadians(-85.0) // 垂直向下偏上限，防止极点旋转异常
    const maxPitch = CesiumMath.toRadians(-15.0) // 接近水平视角的下限，防止视线平行于地平面

    if (camera.pitch > maxPitch || camera.pitch < minPitch) {
      const targetPitch = Math.max(minPitch, Math.min(maxPitch, camera.pitch))
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
      if (e.shiftKey && !e.ctrlKey) {
        e.preventDefault()

        const camera = viewer.camera
        const scene = viewer.scene

        // 1. 获取当前鼠标底下的三维世界坐标作为旋转/倾斜中心点
        const mousePosition = new Cartesian2(e.clientX, e.clientY)
        let targetPosition = camera.pickEllipsoid(mousePosition, scene.globe.ellipsoid)
        if (!targetPosition) {
          // 如果没有指向地球，就用屏幕中心的地面点，或者地球球心
          targetPosition = Cartesian3.ZERO
        }

        // 2. 获取当前相机的 heading, pitch, 以及到目标点的距离 range
        const distance = Cartesian3.distance(camera.position, targetPosition)
        const range = Math.max(150.0, distance) // 限制最小距离

        // 3. 计算旋转和倾斜增量
        // e.deltaX 代表水平滑动（用于旋转），deltaY 代表垂直滑动（用于倾斜视角）
        const sens = 0.002 // 敏感度系数
        let headingDelta = -e.deltaX * sens
        let pitchDelta = -e.deltaY * sens

        // 计算新的角度
        let newHeading = camera.heading + headingDelta
        let newPitch = camera.pitch + pitchDelta

        // 限制倾斜角范围，防止穿透或者过度平视
        const minPitch = CesiumMath.toRadians(-85.0)
        const maxPitch = CesiumMath.toRadians(-15.0)
        newPitch = Math.max(minPitch, Math.min(maxPitch, newPitch))

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

  // 7. 绑定界面交互事件
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

  // 1. 图层面板选项切换绑定（Radio 方式，对齐 2D 底层逻辑）
  if (layerControlPanel) {
    layerControlPanel.addEventListener('change', (e) => {
      const radioInput = e.target.closest('input[name="leaflet-base-layers"]')
      if (radioInput) {
        const layerId = radioInput.getAttribute('data-layer')
        if (layerId) {
          switchLayer(layerId)
          try {
            localStorage.setItem('last_map_layer', layerId)
          } catch (err) {
            console.error('Failed to save last_map_layer in localStorage', err)
          }
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

  // 6. 返回 2D 视图
  const backBtn = menu.querySelector('[data-action="back2d"]')
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      window.location.href = '/' + window.location.search
    })
  }
}

// 密码验证逻辑 - 与 2D 主页一致以保证安全性
async function checkMapAccessBeforeInit () {
  try {
    const status = await getAccessStatus()
    if (status.required) {
      showPasswordLockScreen()
    } else {
      init3dEarth()
    }
  } catch (err) {
    console.error('Failed to check map access status', err)
    showPasswordLockScreen({
      message: '访问状态检查失败，请稍后重试',
      allowRetry: true,
    })
  }
}

function showPasswordLockScreen (options = {}) {
  document.getElementById('map-lock-screen')?.remove()

  const lockScreen = document.createElement('div')
  lockScreen.id = 'map-lock-screen'
  lockScreen.className = 'lock-screen-backdrop'
  const message = options.message || '管理员启用了访问控制，请输入密码解锁'
  lockScreen.innerHTML = `
    <div class="lock-screen-card">
      <div class="lock-screen-icon">🔒</div>
      <h2>私有地图三维视图</h2>
      <p>${escapeHtml(message)}</p>
      <form id="lock-screen-form" autocomplete="off">
        <div class="lock-screen-field">
          <input type="password" name="password" placeholder="请输入访问密码" required autofocus>
        </div>
        <div id="lock-screen-error" class="lock-screen-error" style="${options.message ? '' : 'display: none;'}">${escapeHtml(options.message || '')}</div>
        <button type="submit">载入三维地球</button>
        ${options.allowRetry ? '<button type="button" class="lock-screen-secondary" data-lock-retry>重试检查</button>' : ''}
      </form>
    </div>
  `

  document.body.appendChild(lockScreen)

  const form = document.getElementById('lock-screen-form')
  const errorNode = document.getElementById('lock-screen-error')
  const retryButton = lockScreen.querySelector('[data-lock-retry]')

  retryButton?.addEventListener('click', () => {
    lockScreen.remove()
    checkMapAccessBeforeInit()
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    errorNode.style.display = 'none'
    const password = form.elements.password.value.trim()
    if (!password) return

    try {
      const btn = form.querySelector('button')
      btn.disabled = true
      btn.textContent = '正在验证...'

      await verifyAccessPassword(password)

      lockScreen.remove()
      init3dEarth()
    } catch (err) {
      const btn = form.querySelector('button')
      btn.disabled = false
      btn.textContent = '载入三维地球'
      errorNode.textContent = err.message || '访问密码错误'
      errorNode.style.display = 'block'
    }
  })
}

// 启动入口
checkMapAccessBeforeInit()
