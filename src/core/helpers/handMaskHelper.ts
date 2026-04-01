export type HandKeypoint = {
  x: number
  y: number
  name?: string
}

export type HandPrediction = {
  score?: number
  handedness?: string
  keypoints: HandKeypoint[]
}

export type HandMaskRenderer = {
  mask: Uint8Array
  render(hands: HandPrediction[], sourceWidth: number, sourceHeight: number): Uint8Array
}

const handConnections: Array<[number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [0, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [0, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [5, 9],
  [9, 13],
  [13, 17],
]

const minHandScore = 0.35
const handMaskCloseRadius = 1

export function createHandMaskRenderer(
  width: number,
  height: number
): HandMaskRenderer {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Unable to create a 2D canvas context for hand masks')
  }

  const mask = new Uint8Array(width * height)
  const supportMask = new Uint8Array(width * height)
  const scratchMask = new Uint8Array(width * height)
  const scaleX = width
  const scaleY = height

  function render(
    hands: HandPrediction[],
    sourceWidth: number,
    sourceHeight: number
  ) {
    mask.fill(0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = '#ffffff'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    const sourceScaleX = scaleX / Math.max(1, sourceWidth)
    const sourceScaleY = scaleY / Math.max(1, sourceHeight)

    for (const hand of hands) {
      if ((hand.score ?? 1) < minHandScore || hand.keypoints.length < 21) {
        continue
      }

      const points = hand.keypoints.map((keypoint) => ({
        x: keypoint.x * sourceScaleX,
        y: keypoint.y * sourceScaleY,
      }))

      const radius = estimateHandRadius(points)

      drawHandSilhouette(points, ctx)
      drawPalm(points, radius, ctx)
      drawWristBridge(points, radius, ctx)
      drawSkeleton(points, radius, ctx)
    }

    const imageData = ctx.getImageData(0, 0, width, height)
    for (let i = 0; i < mask.length; i++) {
      const alpha = imageData.data[i * 4 + 3]
      mask[i] = alpha
      supportMask[i] = alpha > 0 ? 1 : 0
    }

    if (handMaskCloseRadius > 0) {
      closeMask(
        supportMask,
        scratchMask,
        width,
        height,
        handMaskCloseRadius
      )

      for (let i = 0; i < mask.length; i++) {
        if (supportMask[i] === 0) {
          mask[i] = 0
        }
      }
    }

    return mask
  }

  return {
    mask,
    render,
  }
}

export function mergeHandMaskIntoMask(
  mask: Uint8Array | Uint8ClampedArray,
  handMask: Uint8Array | null | undefined
) {
  if (!handMask || handMask.length !== mask.length) {
    return
  }

  for (let i = 0; i < mask.length; i++) {
    if (handMask[i] > mask[i]) {
      mask[i] = handMask[i]
    }
  }
}

function estimateHandRadius(points: Array<{ x: number; y: number }>) {
  const wrist = points[0]
  const indexMcp = points[5] ?? wrist
  const middleMcp = points[9] ?? wrist
  const ringMcp = points[13] ?? wrist
  const pinkyMcp = points[17] ?? wrist

  const palmSpan = Math.max(
    distance(wrist, indexMcp),
    distance(wrist, middleMcp),
    distance(wrist, ringMcp),
    distance(wrist, pinkyMcp),
    distance(indexMcp, pinkyMcp)
  )

  return clamp(palmSpan * 0.22, 4, 22)
}

function drawHandSilhouette(
  points: Array<{ x: number; y: number }>,
  ctx: CanvasRenderingContext2D
) {
  const hull = buildConvexHull(points)

  if (hull.length < 3) {
    return
  }

  ctx.beginPath()
  ctx.moveTo(hull[0].x, hull[0].y)
  for (let i = 1; i < hull.length; i++) {
    ctx.lineTo(hull[i].x, hull[i].y)
  }
  ctx.closePath()
  ctx.fill()
}

function drawPalm(
  points: Array<{ x: number; y: number }>,
  radius: number,
  ctx: CanvasRenderingContext2D
) {
  const palmPoints = [0, 5, 9, 13, 17]
    .map((index) => points[index])
    .filter(
      (point): point is { x: number; y: number } => point !== undefined
    )

  if (palmPoints.length === 0) {
    return
  }

  const center = palmPoints.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }),
    { x: 0, y: 0 }
  )
  center.x /= palmPoints.length
  center.y /= palmPoints.length

  ctx.beginPath()
  ctx.arc(center.x, center.y, radius * 1.2, 0, Math.PI * 2)
  ctx.fill()

  for (const index of [0, 1, 2, 3, 4, 5, 9, 13, 17]) {
    const point = points[index]
    if (!point) {
      continue
    }

    ctx.beginPath()
    ctx.arc(point.x, point.y, index === 0 ? radius * 1.15 : radius * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawWristBridge(
  points: Array<{ x: number; y: number }>,
  radius: number,
  ctx: CanvasRenderingContext2D
) {
  const wrist = points[0]
  const palmCenter = getPalmCenter(points)

  if (!wrist || !palmCenter) {
    return
  }

  ctx.lineWidth = radius * 1.65
  ctx.beginPath()
  ctx.moveTo(wrist.x, wrist.y)
  ctx.lineTo(palmCenter.x, palmCenter.y)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(wrist.x, wrist.y, radius * 1.35, 0, Math.PI * 2)
  ctx.fill()
}

function getPalmCenter(points: Array<{ x: number; y: number }>) {
  const palmPoints = [0, 5, 9, 13, 17]
    .map((index) => points[index])
    .filter(
      (point): point is { x: number; y: number } => point !== undefined
    )

  if (palmPoints.length === 0) {
    return null
  }

  const center = palmPoints.reduce(
    (acc, point) => ({
      x: acc.x + point.x,
      y: acc.y + point.y,
    }),
    { x: 0, y: 0 }
  )

  center.x /= palmPoints.length
  center.y /= palmPoints.length
  return center
}

function drawSkeleton(
  points: Array<{ x: number; y: number }>,
  radius: number,
  ctx: CanvasRenderingContext2D
) {
  ctx.lineWidth = radius * 1.15

  for (const [startIndex, endIndex] of handConnections) {
    const start = points[startIndex]
    const end = points[endIndex]

    if (!start || !end) {
      continue
    }

    ctx.beginPath()
    ctx.moveTo(start.x, start.y)
    ctx.lineTo(end.x, end.y)
    ctx.stroke()
  }

  for (const point of points) {
    ctx.beginPath()
    ctx.arc(point.x, point.y, radius * 0.75, 0, Math.PI * 2)
    ctx.fill()
  }
}

function buildConvexHull(points: Array<{ x: number; y: number }>) {
  const sortedPoints = [...points].sort(
    (a, b) => a.x - b.x || a.y - b.y
  )

  if (sortedPoints.length < 3) {
    return sortedPoints
  }

  const hull: Array<{ x: number; y: number }> = []

  for (const point of sortedPoints) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) {
      hull.pop()
    }
    hull.push(point)
  }

  const lowerHullLength = hull.length

  for (let i = sortedPoints.length - 2; i >= 0; i--) {
    const point = sortedPoints[i]
    while (
      hull.length > lowerHullLength &&
      cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0
    ) {
      hull.pop()
    }
    hull.push(point)
  }

  hull.pop()
  return hull
}

function closeMask(
  source: Uint8Array,
  destination: Uint8Array,
  width: number,
  height: number,
  radius: number
) {
  dilateMask(source, destination, width, height, radius)
  erodeMask(destination, source, width, height, radius)
}

function cross(
  origin: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number }
) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x)
}

function erodeMask(
  source: Uint8Array,
  destination: Uint8Array,
  width: number,
  height: number,
  radius: number
) {
  for (let y = 0; y < height; y++) {
    const minY = Math.max(0, y - radius)
    const maxY = Math.min(height - 1, y + radius)

    for (let x = 0; x < width; x++) {
      const minX = Math.max(0, x - radius)
      const maxX = Math.min(width - 1, x + radius)

      let keep = 1

      outer: for (let yy = minY; yy <= maxY; yy++) {
        const rowOffset = yy * width
        for (let xx = minX; xx <= maxX; xx++) {
          if (source[rowOffset + xx] === 0) {
            keep = 0
            break outer
          }
        }
      }

      destination[y * width + x] = keep
    }
  }
}

function dilateMask(
  source: Uint8Array,
  destination: Uint8Array,
  width: number,
  height: number,
  radius: number
) {
  for (let y = 0; y < height; y++) {
    const minY = Math.max(0, y - radius)
    const maxY = Math.min(height - 1, y + radius)

    for (let x = 0; x < width; x++) {
      const minX = Math.max(0, x - radius)
      const maxX = Math.min(width - 1, x + radius)

      let fill = 0

      outer: for (let yy = minY; yy <= maxY; yy++) {
        const rowOffset = yy * width
        for (let xx = minX; xx <= maxX; xx++) {
          if (source[rowOffset + xx] !== 0) {
            fill = 1
            break outer
          }
        }
      }

      destination[y * width + x] = fill
    }
  }
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
