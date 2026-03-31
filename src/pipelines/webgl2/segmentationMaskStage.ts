import {
  type SegmentationConfig,
  inputResolutions,
} from '../../core/helpers/segmentationHelper'
import {
  createSegmentationMaskRefiner,
  fillPersonMaskProbabilities,
  getSegmentationMaskRefinementOptions,
} from '../../core/helpers/segmentationMaskHelper'
import type { TFLite } from '../../composables/useTFLite'

type SegmentationMaskStage = {
  render(): void
  cleanUp(): void
}

export function buildSegmentationMaskStage(
  gl: WebGL2RenderingContext,
  segmentationConfig: SegmentationConfig,
  tflite: TFLite,
  outputTexture: WebGLTexture
): SegmentationMaskStage {
  const [segmentationWidth, segmentationHeight] = inputResolutions[
    segmentationConfig.inputResolution
  ]
  const segmentationPixelCount = segmentationWidth * segmentationHeight
  const tfliteOutputMemoryOffset = tflite._getOutputMemoryOffset() / 4
  const personProbabilities = new Float32Array(segmentationPixelCount)
  const segmentationMaskRefiner = createSegmentationMaskRefiner(
    segmentationWidth,
    segmentationHeight,
    getSegmentationMaskRefinementOptions(segmentationConfig)
  )
  const segmentationMask = new Uint8ClampedArray(segmentationPixelCount * 4)

  function render() {
    fillPersonMaskProbabilities(
      segmentationConfig.model,
      tflite,
      tfliteOutputMemoryOffset,
      personProbabilities
    )

    const refinedMask = segmentationMaskRefiner.refine(personProbabilities)
    for (let i = 0; i < segmentationPixelCount; i++) {
      segmentationMask[i * 4 + 3] = refinedMask[i]
    }

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, outputTexture)
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      segmentationWidth,
      segmentationHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      segmentationMask
    )
  }

  function cleanUp() {
    // Nothing to release; the shared output texture is owned by the pipeline.
  }

  return {
    render,
    cleanUp,
  }
}
