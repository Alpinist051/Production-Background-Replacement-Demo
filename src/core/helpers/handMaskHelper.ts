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

      drawPalm(points, radius, ctx)
      drawSkeleton(points, radius, ctx)
    }

    const imageData = ctx.getImageData(0, 0, width, height)
    for (let i = 0; i < mask.length; i++) {
      mask[i] = imageData.data[i * 4 + 3]
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
    ctx.arc(point.x, point.y, radius * 0.8, 0, Math.PI * 2)
    ctx.fill()
  }
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

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
