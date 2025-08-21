const canvas = document.getElementById('logo3d')
if (!canvas) {
  console.error('Canvas #logo3d не найден!')
  throw new Error('Canvas #logo3d не найден')
}

// Проверка поддержки ES6 (let, const, arrow functions)
try {
  eval('let es6test = () => {}; const es6const = 1;')
} catch (e) {
  alert(
    'Ваш браузер слишком старый и не поддерживает современные технологии. Пожалуйста, обновите браузер.'
  )
}

const gl =
  canvas.getContext('webgl', {
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  }) ||
  canvas.getContext('experimental-webgl', {
    alpha: true,
    premultipliedAlpha: true,
    preserveDrawingBuffer: false,
  })

// Safari/Firefox WebGL fallback
if (!gl) {
  canvas.style.display = 'none'
  alert(
    'WebGL не поддерживается этим браузером! Попробуйте обновить браузер или использовать Chrome.'
  )
  throw new Error('WebGL не поддерживается')
}

canvas.width = 1600
canvas.height = 900
gl.viewport(0, 0, canvas.width, canvas.height)

gl.enable(gl.BLEND)
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

const vertexShaderSource = `
    attribute vec2 a_position;
    attribute vec2 a_texCoord;
    varying vec2 v_texCoord;

    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_texCoord = a_texCoord;
    }
`

const fragmentShaderSource = `
    precision mediump float;
    uniform sampler2D u_video;
    uniform sampler2D u_mask;
    uniform sampler2D u_overlay;
    varying vec2 v_texCoord;

    vec3 lightenBlend(vec3 base, vec3 blend, float opacity) {
        return mix(base, max(base, blend), opacity);
    }

    vec3 overlayBlend(vec3 base, vec3 blend, float opacity) {
        vec3 result;
        for(int i = 0; i < 3; i++) {
            if(base[i] < 0.5) {
                result[i] = 2.0 * base[i] * blend[i];
            } else {
                result[i] = 1.0 - 2.0 * (1.0 - base[i]) * (1.0 - blend[i]);
            }
        }
        return mix(base, result, opacity);
    }

    float edgeDetect(sampler2D mask, vec2 uv) {
        float threshold = 0.15;
        float center = texture2D(mask, uv).a;
        float sum = 0.0;
        sum += abs(center - texture2D(mask, uv + vec2(0.002, 0.0)).a);
        sum += abs(center - texture2D(mask, uv + vec2(-0.002, 0.0)).a);
        sum += abs(center - texture2D(mask, uv + vec2(0.0, 0.002)).a);
        sum += abs(center - texture2D(mask, uv + vec2(0.0, -0.002)).a);
        return step(threshold, sum);
    }

    void main() {
        vec4 maskColor = texture2D(u_mask, v_texCoord);
        vec4 videoColor = texture2D(u_video, v_texCoord);
        vec4 overlayColor = texture2D(u_overlay, v_texCoord);
        vec3 lightenResult = lightenBlend(videoColor.rgb, maskColor.rgb, 0.25);
        vec3 overlayResult = overlayBlend(lightenResult, overlayColor.rgb, 0.10);
        float a = smoothstep(0.0, 0.9, maskColor.a);
        gl_FragColor = vec4(overlayResult, a);
    }
`

function createShader(gl, type, source) {
  const shader = gl.createShader(type)
  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Ошибка компиляции шейдера:', gl.getShaderInfoLog(shader))
    throw new Error('Ошибка компиляции шейдера')
  }

  if (type === gl.FRAGMENT_SHADER) {
    // console.log('Фрагментный шейдер успешно скомпилирован с эффектами объемности на масках');
  }

  return shader
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
const fragmentShader = createShader(
  gl,
  gl.FRAGMENT_SHADER,
  fragmentShaderSource
)

const program = gl.createProgram()
gl.attachShader(program, vertexShader)
gl.attachShader(program, fragmentShader)
gl.linkProgram(program)

if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  console.error('Ошибка линковки программы:', gl.getProgramInfoLog(program))
  throw new Error('Ошибка линковки программы')
}

gl.useProgram(program)

const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])

const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0])

const positionBuffer = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)

const texCoordBuffer = gl.createBuffer()
gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW)

const positionLocation = gl.getAttribLocation(program, 'a_position')
const texCoordLocation = gl.getAttribLocation(program, 'a_texCoord')

const videoLocation = gl.getUniformLocation(program, 'u_video')
const maskLocation = gl.getUniformLocation(program, 'u_mask')
const overlayLocation = gl.getUniformLocation(program, 'u_overlay')

function createTexture() {
  const texture = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return texture
}

const videoTexture = createTexture()
const maskTexture = createTexture()

const frameCount = 21
const masks = []
let loadedMasks = 0

// Универсальная функция для получения пути к ресурсу (encodeURI)
function getResourcePath(path) {
  return encodeURI(path)
}

for (let i = 0; i < frameCount; i++) {
  const img = new window.Image()
  const num = String(i).padStart(5, '0')
  img.crossOrigin = 'anonymous'
  img.onload = () => {
    masks[i] = img
    loadedMasks++
  }
  img.onerror = () => {
    const fallbackImg = new window.Image()
    fallbackImg.crossOrigin = 'anonymous'
    fallbackImg.onload = () => {
      masks[i] = fallbackImg
      loadedMasks++
    }
    fallbackImg.onerror = () => {
      console.error(
        `Ошибка загрузки маски: ${getResourcePath('SOURCE/ELEMENT_3D/ELEMENT 3D_' + num + '.webp')}`
      )
    }
    fallbackImg.src = getResourcePath(
      'SOURCE/ELEMENT 3D/ELEMENT 3D_' + num + '.png'
    )
  }
  img.src = getResourcePath('SOURCE/ELEMENT_3D/ELEMENT 3D_' + num + '.webp')
}

// Получаем видео по id, теперь оно вне .logo-container
const video = document.getElementById('logoVideo')
if (!video) {
  console.error('Видео #logoVideo не найдено!')
  throw new Error('Видео #logoVideo не найдено')
}

let currentFrame = 0

let overlayImg = null // overlay отключён
const overlayTexture = createTexture()

// Анимация для градиента (overlay)
let overlayScale = 0.75
let targetOverlayScale = 0.75

// overlayImg.onload = () => {
//     gl.bindTexture(gl.TEXTURE_2D, overlayTexture);
//     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, overlayImg);
// };

let videoScale = 0.75
let targetVideoScale = 0.75

// Проверка поддержки canvas filter (blur)
function isCanvasFilterSupported() {
  const testCanvas = document.createElement('canvas')
  const ctx = testCanvas.getContext('2d')
  if (!ctx) return false
  ctx.filter = 'blur(2px)'
  return ctx.filter === 'blur(2px)'
}
const canvasFilterSupported = isCanvasFilterSupported()

// Для видео — всегда фиксированный размер (1600x900), центрируем
function drawVideoFixed(media, targetWidth, targetHeight) {
  // Используем реальное разрешение видео
  const videoW = media.videoWidth || 1600
  const videoH = media.videoHeight || 900
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = targetWidth
  tempCanvas.height = targetHeight
  const ctx = tempCanvas.getContext('2d')
  ctx.clearRect(0, 0, targetWidth, targetHeight)

  const minScale = 1.0
  const maxScale = 10.0
  const maxBlur = 50 // px
  const blurValue = Math.max(
    0,
    (maxBlur * (videoScale - minScale)) / (maxScale - minScale)
  )
  if (
    typeof window.blurAnimated === 'undefined' ||
    isNaN(window.blurAnimated)
  ) {
    window.blurAnimated = blurValue
  }
  window.blurAnimated += (blurValue - window.blurAnimated) * 0.08
  if (canvasFilterSupported) {
    ctx.filter = `blur(${window.blurAnimated}px)`
  } else {
    ctx.filter = 'none'
    // fallback: добавить CSS-фильтр к .logo-video и .bg-video
    document.querySelectorAll('.logo-video, .bg-video').forEach((el) => {
      if (Math.round(window.blurAnimated) > 0) {
        el.style.filter = `blur(${Math.round(window.blurAnimated)}px)`
      } else {
        el.style.filter = ''
      }
    })
  }

  const smoothing = 0.15
  videoScale += (targetVideoScale - videoScale) * smoothing
  if (!isFinite(videoScale) || isNaN(videoScale)) videoScale = 1.0
  videoScale = Math.max(0.3, Math.min(videoScale, 4.55))
  const scaledW = videoW * videoScale
  const scaledH = videoH * videoScale
  const offsetX = (targetWidth - scaledW) / 2
  const offsetY = (targetHeight - scaledH) / 2
  ctx.drawImage(media, 0, 0, videoW, videoH, offsetX, offsetY, scaledW, scaledH)

  // Сброс фильтра
  ctx.filter = 'none'
  return tempCanvas
}
// Для маски — всегда растягиваем на весь canvas
function drawMaskStretched(maskImg, targetWidth, targetHeight) {
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = targetWidth
  tempCanvas.height = targetHeight
  const ctx = tempCanvas.getContext('2d')
  ctx.clearRect(0, 0, targetWidth, targetHeight)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(maskImg, 0, 0, targetWidth, targetHeight)
  return tempCanvas
}

// Для градиента — анимированное масштабирование без блюра
function drawOverlayAnimated(overlayImg, targetWidth, targetHeight) {
  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = targetWidth
  tempCanvas.height = targetHeight
  const ctx = tempCanvas.getContext('2d')
  ctx.clearRect(0, 0, targetWidth, targetHeight)

  // Плавная анимация масштабирования градиента
  const smoothing = 0.15
  overlayScale += (targetOverlayScale - overlayScale) * smoothing
  if (!isFinite(overlayScale) || isNaN(overlayScale)) overlayScale = 1.0
  overlayScale = Math.max(0.3, Math.min(overlayScale, 600.0))

  const overlayW = overlayImg.naturalWidth || targetWidth
  const overlayH = overlayImg.naturalHeight || targetHeight
  const scaledW = overlayW * overlayScale
  const scaledH = overlayH * overlayScale
  const offsetX = (targetWidth - scaledW) / 2
  const offsetY = (targetHeight - scaledH) / 2

  ctx.drawImage(
    overlayImg,
    0,
    0,
    overlayW,
    overlayH,
    offsetX,
    offsetY,
    scaledW,
    scaledH
  )
  return tempCanvas
}

function render() {
  if (loadedMasks < frameCount) {
    requestAnimationFrame(render)
    return
  }

  if (video.readyState < 2) {
    requestAnimationFrame(render)
    return
  }

  // Видео всегда фиксированного размера
  const fittedVideo = drawVideoFixed(video, canvas.width, canvas.height)
  gl.bindTexture(gl.TEXTURE_2D, videoTexture)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    fittedVideo
  )

  // Маска всегда растягивается на весь canvas
  const maskImg = masks[currentFrame]
  const fittedMask = drawMaskStretched(maskImg, canvas.width, canvas.height)
  gl.bindTexture(gl.TEXTURE_2D, maskTexture)
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    fittedMask
  )

  if (overlayImg && overlayImg.complete) {
    // overlay отключён
  }

  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
  gl.enableVertexAttribArray(positionLocation)
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer)
  gl.enableVertexAttribArray(texCoordLocation)
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0)

  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, videoTexture)
  gl.uniform1i(videoLocation, 0)

  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, maskTexture)
  gl.uniform1i(maskLocation, 1)

  gl.activeTexture(gl.TEXTURE2)
  gl.bindTexture(gl.TEXTURE_2D, overlayTexture)
  gl.uniform1i(overlayLocation, 2)

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

  requestAnimationFrame(render)
}

// Универсальная обработка событий для touch и mouse
function handleFrameChange(e) {
  let x
  if (e.touches && e.touches.length > 0) {
    x = e.touches[0].clientX
  } else {
    x = e.clientX
  }
  const rect = canvas.getBoundingClientRect()
  const percent = Math.max(0, Math.min(1, (x - rect.left) / rect.width))
  currentFrame = Math.floor(percent * (frameCount - 1))
}
window.addEventListener('mousemove', handleFrameChange)
window.addEventListener('touchmove', handleFrameChange, { passive: true })

video.addEventListener('play', () => {
  render()
})

video.addEventListener('loadeddata', () => {
  render()
})

window.addEventListener('DOMContentLoaded', () => {
  const bgVideo = document.querySelector('.bg-video')
  const logoVideo = document.getElementById('logoVideo')

  if (bgVideo && logoVideo) {
    function syncVideos() {
      bgVideo.currentTime = 0
      logoVideo.currentTime = 0
      bgVideo.play().catch(console.error)
      logoVideo.play().catch(console.error)
    }

    logoVideo.addEventListener('ended', syncVideos)
    bgVideo.addEventListener('ended', syncVideos)

    logoVideo.addEventListener('timeupdate', () => {
      if (logoVideo.currentTime > logoVideo.duration - 0.05) {
        syncVideos()
      }
    })
    bgVideo.addEventListener('timeupdate', () => {
      if (bgVideo.currentTime > bgVideo.duration - 0.05) {
        syncVideos()
      }
    })
  }

  if (!video.paused) {
    render()
  }
})

// Проверка загрузки всех ресурсов перед стартом анимации
function allResourcesReady() {
  return loadedMasks >= frameCount && video.readyState >= 2
}

function safeRender() {
  if (!allResourcesReady()) {
    requestAnimationFrame(safeRender)
    return
  }
  render()
}

video.addEventListener('play', () => {
  safeRender()
})

video.addEventListener('loadeddata', () => {
  safeRender()
})

// Для Safari/Firefox — принудительно запускать видео после user interaction
;['touchstart', 'click'].forEach((evt) => {
  window.addEventListener(evt, () => {
    if (video.paused) video.play().catch(() => {})
  })
})

// console.log('logo3d.js инициализирован с эффектами объемности');
