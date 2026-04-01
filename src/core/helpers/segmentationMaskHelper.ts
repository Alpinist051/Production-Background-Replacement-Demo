import {
  type SegmentationConfig,
  type SegmentationModel,
} from './segmentationHelper'

type TFLiteLike = {
  HEAPF32: Float32Array
}

export type SegmentationMaskRefinementOptions = {
  smoothEdgeStart: number
  smoothEdgeEnd: number
  supportThreshold: number
  morphologyRadius: number
  temporalSmoothing: number
}

export type SegmentationMaskRefiner = {
  mask: Uint8ClampedArray
  refine(sourceMask: ArrayLike<number>): Uint8ClampedArray
}

const defaultRefinementOptions: SegmentationMaskRefinementOptions = {
  smoothEdgeStart: 0.3,
  smoothEdgeEnd: 0.85,
  supportThreshold: 0.52,
  morphologyRadius: 1,
  temporalSmoothing: 0.74,
}

export function fillPersonMaskProbabilities(
  model: SegmentationModel,
  tflite: TFLiteLike,
  outputMemoryOffset: number,
  destination: Float32Array
) {
  const output = tflite.HEAPF32

  if (model === 'meet') {
    for (let i = 0; i < destination.length; i++) {
      const background = output[outputMemoryOffset + i * 2]
      const person = output[outputMemoryOffset + i * 2 + 1]
      const shift = Math.max(background, person)
      const backgroundExp = Math.exp(background - shift)
      const personExp = Math.exp(person - shift)
      destination[i] = personExp / (backgroundExp + personExp)
    }
    return
  }

  if (model === 'mlkit') {
    for (let i = 0; i < destination.length; i++) {
      destination[i] = output[outputMemoryOffset + i]
    }
    return
  }

  throw new Error(`Unsupported TFLite mask model: ${model}`)
}

export function getSegmentationMaskRefinementOptions(
  segmentationConfig: Pick<SegmentationConfig, 'model' | 'inputResolution'>
): SegmentationMaskRefinementOptions {
  if (segmentationConfig.model === 'bodyPix') {
    return {
      smoothEdgeStart: 0.16,
      smoothEdgeEnd: 0.82,
      supportThreshold: 0.5,
      morphologyRadius: 1,
    }
  }

  if (segmentationConfig.model === 'mlkit') {
    return {
      smoothEdgeStart: 0.28,
      smoothEdgeEnd: 0.84,
      supportThreshold: 0.52,
      morphologyRadius: 1,
    }
  }

  return segmentationConfig.inputResolution === '160x96'
    ? {
        smoothEdgeStart: 0.36,
        smoothEdgeEnd: 0.86,
        supportThreshold: 0.56,
        morphologyRadius: 1,
      }
    : {
        smoothEdgeStart: 0.3,
        smoothEdgeEnd: 0.84,
        supportThreshold: 0.53,
        morphologyRadius: 1,
      }
}

export function createSegmentationMaskRefiner(
  width: number,
  height: number,
  options: Partial<SegmentationMaskRefinementOptions> = {}
): SegmentationMaskRefiner {
  const pixelCount = width * height
  const smoothedProbabilities = new Float32Array(pixelCount)
  const supportMask = new Uint8Array(pixelCount)
  const scratchMask = new Uint8Array(pixelCount)
  const floodFillQueue = new Int32Array(pixelCount)
  const mask = new Uint8ClampedArray(pixelCount)
  let hasTemporalHistory = false
  let previousForegroundCoverage = 0.12
  const refinementOptions = {
    ...defaultRefinementOptions,
    ...options,
  }

  function refine(sourceMask: ArrayLike<number>) {
    const {
      smoothEdgeStart,
      smoothEdgeEnd,
      supportThreshold,
      morphologyRadius,
      temporalSmoothing,
    } = refinementOptions

    const distanceBoost = computeDistanceBoost(previousForegroundCoverage)
    const adaptiveSmoothEdgeStart = clamp(
      smoothEdgeStart - distanceBoost * 0.06,
      0.05,
      0.95
    )
    const adaptiveSmoothEdgeEnd = clamp(
      Math.max(
        adaptiveSmoothEdgeStart + 0.05,
        smoothEdgeEnd - distanceBoost * 0.03
      ),
      adaptiveSmoothEdgeStart + 0.05,
      0.99
    )
    const adaptiveSupportThreshold = clamp(
      supportThreshold - distanceBoost * 0.08,
      0.3,
      0.85
    )
    const adaptiveLowThreshold = Math.max(
      0,
      adaptiveSupportThreshold - 0.08
    )
    const adaptiveHighThreshold = Math.min(
      1,
      adaptiveSupportThreshold + 0.04
    )
    const adaptiveTemporalSmoothing = clamp(
      temporalSmoothing + distanceBoost * 0.12,
      0.5,
      0.92
    )
    const adaptiveMorphologyRadius = Math.max(
      1,
      Math.min(4, Math.round(morphologyRadius + distanceBoost * 2))
    )

    for (let i = 0; i < pixelCount; i++) {
      const probability = clamp01(sourceMask[i])
      const smoothedProbability = hasTemporalHistory
        ? smoothedProbabilities[i] * adaptiveTemporalSmoothing +
          probability * (1 - adaptiveTemporalSmoothing)
        : probability
      const edgeAlpha = smoothstep(
        adaptiveSmoothEdgeStart,
        adaptiveSmoothEdgeEnd,
        smoothedProbability
      )
      const previousSupport = supportMask[i] !== 0
      let keep = false

      smoothedProbabilities[i] = smoothedProbability
      if (!hasTemporalHistory) {
        keep = smoothedProbability >= adaptiveSupportThreshold
      } else {
        keep =
          smoothedProbability >= adaptiveHighThreshold ||
          (previousSupport && smoothedProbability >= adaptiveLowThreshold)
      }

      supportMask[i] = keep ? 1 : 0
      mask[i] = keep ? Math.max(smoothedProbability, edgeAlpha) * 255 : 0
    }

    if (adaptiveMorphologyRadius > 0) {
      dilateMask(
        supportMask,
        scratchMask,
        width,
        height,
        adaptiveMorphologyRadius
      )
      erodeMask(
        scratchMask,
        supportMask,
        width,
        height,
        adaptiveMorphologyRadius
      )
    }

    fillEnclosedHoles(
      supportMask,
      scratchMask,
      floodFillQueue,
      width,
      height
    )

    let foregroundCount = 0
    for (let i = 0; i < pixelCount; i++) {
      const keep = supportMask[i] !== 0
      if (keep) {
        foregroundCount++
      }

      // Keep the person-shaped alpha while avoiding flicker in weak areas.
      mask[i] = keep ? Math.max(mask[i], smoothedProbabilities[i] * 255) : 0
    }

    previousForegroundCoverage =
      foregroundCount > 0 ? foregroundCount / pixelCount : 0.08
    hasTemporalHistory = true

    return mask
  }

  return {
    mask,
    refine,
  }
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value))
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const range = Math.max(1e-6, edge1 - edge0)
  const t = clamp01((value - edge0) / range)
  return t * t * (3 - 2 * t)
}

function computeDistanceBoost(previousForegroundCoverage: number) {
  const coverageTarget = 0.18
  return clamp(
    (coverageTarget - previousForegroundCoverage) / coverageTarget,
    0,
    1
  )
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

function fillEnclosedHoles(
  mask: Uint8Array,
  visited: Uint8Array,
  queue: Int32Array,
  width: number,
  height: number
) {
  visited.fill(0)

  let head = 0
  let tail = 0

  function enqueue(index: number) {
    if (mask[index] !== 0 || visited[index] !== 0) {
      return
    }

    visited[index] = 1
    queue[tail++] = index
  }

  for (let x = 0; x < width; x++) {
    enqueue(x)
    enqueue((height - 1) * width + x)
  }

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width
    enqueue(rowOffset)
    enqueue(rowOffset + width - 1)
  }

  while (head < tail) {
    const index = queue[head++]
    const x = index % width
    const y = (index / width) | 0

    if (x > 0) {
      enqueue(index - 1)
    }
    if (x + 1 < width) {
      enqueue(index + 1)
    }
    if (y > 0) {
      enqueue(index - width)
    }
    if (y + 1 < height) {
      enqueue(index + width)
    }
  }

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 0 && visited[i] === 0) {
      mask[i] = 1
    }
  }
}
