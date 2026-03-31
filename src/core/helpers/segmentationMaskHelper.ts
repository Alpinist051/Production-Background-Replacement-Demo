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
  const normalizedMask = new Float32Array(pixelCount)
  const supportMask = new Uint8Array(pixelCount)
  const scratchMask = new Uint8Array(pixelCount)
  const mask = new Uint8ClampedArray(pixelCount)
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
    } = refinementOptions

    for (let i = 0; i < pixelCount; i++) {
      const normalized = smoothstep(
        smoothEdgeStart,
        smoothEdgeEnd,
        clamp01(sourceMask[i])
      )
      normalizedMask[i] = normalized
      supportMask[i] = normalized >= supportThreshold ? 1 : 0
    }

    if (morphologyRadius > 0) {
      erodeMask(supportMask, scratchMask, width, height, morphologyRadius)
      dilateMask(scratchMask, supportMask, width, height, morphologyRadius)
    }

    for (let i = 0; i < pixelCount; i++) {
      // Keep the soft edge but trim the over-smoothed background bridges.
      mask[i] = normalizedMask[i] * supportMask[i] * 255
    }

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
