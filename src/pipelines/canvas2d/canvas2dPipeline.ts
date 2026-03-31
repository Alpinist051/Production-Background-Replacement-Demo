import type { Ref } from 'vue'
import { BackgroundConfig } from '../../core/helpers/backgroundHelper'
import { PostProcessingConfig } from '../../core/helpers/postProcessingHelper'
import {
  inputResolutions,
  SegmentationConfig,
} from '../../core/helpers/segmentationHelper'
import type { BodyPix } from '@tensorflow-models/body-pix'
import {
  createSegmentationMaskRefiner,
  fillPersonMaskProbabilities,
  getSegmentationMaskRefinementOptions,
} from '../../core/helpers/segmentationMaskHelper'
import { CameraPlayback } from '../../core/helpers/cameraHelper'
import type { TFLite } from '../../composables/useTFLite'
import { mergeHandMaskIntoMask } from '../../core/helpers/handMaskHelper'

export function buildCanvas2dPipeline(
  cameraPlayback: CameraPlayback,
  backgroundConfig: BackgroundConfig,
  segmentationConfig: SegmentationConfig,
  canvas: HTMLCanvasElement,
  bodyPix: BodyPix,
  tflite: TFLite,
  handMask: Ref<Uint8Array | null>,
  addFrameEvent: () => void
) {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Unable to create a 2D canvas context')
  }

  const [segmentationWidth, segmentationHeight] = inputResolutions[
    segmentationConfig.inputResolution
  ]
  const segmentationPixelCount = segmentationWidth * segmentationHeight
  const segmentationMask = new ImageData(segmentationWidth, segmentationHeight)
  const segmentationMaskCanvas = document.createElement('canvas')
  segmentationMaskCanvas.width = segmentationWidth
  segmentationMaskCanvas.height = segmentationHeight
  const segmentationMaskCtx = segmentationMaskCanvas.getContext('2d')!
  const segmentationProbabilities = new Float32Array(segmentationPixelCount)
  const segmentationMaskRefiner = createSegmentationMaskRefiner(
    segmentationWidth,
    segmentationHeight,
    getSegmentationMaskRefinementOptions(segmentationConfig)
  )

  const inputMemoryOffset = tflite._getInputMemoryOffset() / 4
  const outputMemoryOffset = tflite._getOutputMemoryOffset() / 4

  let postProcessingConfig: PostProcessingConfig

  async function render() {
    if (backgroundConfig.type !== 'none') {
      resizeCameraFrame()
    }

    addFrameEvent()

    if (backgroundConfig.type !== 'none') {
      if (segmentationConfig.model === 'bodyPix') {
        await runBodyPixInference()
      } else {
        runTFLiteInference()
      }
    }

    addFrameEvent()

    runPostProcessing()
  }

  function updatePostProcessingConfig(
    newPostProcessingConfig: PostProcessingConfig
  ) {
    postProcessingConfig = newPostProcessingConfig
  }

  function updateBackgroundImage(
    _backgroundImage: HTMLImageElement | null
  ) {
    // The Canvas 2D path reads the image directly from BackgroundConfig.
    // No separate background image state needs to be refreshed here.
  }

  function cleanUp() {
    // Nothing to clean up in this rendering pipeline
  }

  function resizeCameraFrame() {
    segmentationMaskCtx.drawImage(
      cameraPlayback.htmlElement,
      0,
      0,
      cameraPlayback.width,
      cameraPlayback.height,
      0,
      0,
      segmentationWidth,
      segmentationHeight
    )

    if (
      segmentationConfig.model === 'meet' ||
      segmentationConfig.model === 'mlkit'
    ) {
      const imageData = segmentationMaskCtx.getImageData(
        0,
        0,
        segmentationWidth,
        segmentationHeight
      )

      for (let i = 0; i < segmentationPixelCount; i++) {
        tflite.HEAPF32[inputMemoryOffset + i * 3] = imageData.data[i * 4] / 255
        tflite.HEAPF32[inputMemoryOffset + i * 3 + 1] =
          imageData.data[i * 4 + 1] / 255
        tflite.HEAPF32[inputMemoryOffset + i * 3 + 2] =
          imageData.data[i * 4 + 2] / 255
      }
    }
  }

  async function runBodyPixInference() {
    if (typeof bodyPix.segmentPerson !== 'function') {
      throw new Error('BodyPix model is not ready')
    }

    const segmentation = await bodyPix.segmentPerson(segmentationMaskCanvas)
    for (let i = 0; i < segmentationPixelCount; i++) {
      segmentationProbabilities[i] = segmentation.data[i]
    }

    const refinedMask = segmentationMaskRefiner.refine(segmentationProbabilities)
    mergeHandMaskIntoMask(refinedMask, handMask.value)
    for (let i = 0; i < segmentationPixelCount; i++) {
      segmentationMask.data[i * 4 + 3] = refinedMask[i]
    }
    segmentationMaskCtx.putImageData(segmentationMask, 0, 0)
  }

  function runTFLiteInference() {
    tflite._runInference()

    fillPersonMaskProbabilities(
      segmentationConfig.model,
      tflite,
      outputMemoryOffset,
      segmentationProbabilities
    )

    const refinedMask = segmentationMaskRefiner.refine(segmentationProbabilities)
    mergeHandMaskIntoMask(refinedMask, handMask.value)
    for (let i = 0; i < segmentationPixelCount; i++) {
      segmentationMask.data[i * 4 + 3] = refinedMask[i]
    }
    segmentationMaskCtx.putImageData(segmentationMask, 0, 0)
  }

  function runPostProcessing() {
    ctx.globalCompositeOperation = 'copy'
    ctx.filter = 'none'

    if (postProcessingConfig?.smoothSegmentationMask) {
      if (backgroundConfig.type === 'blur') {
        ctx.filter = 'blur(2px)' // FIXME Does not work on Safari
      } else if (backgroundConfig.type === 'image') {
        ctx.filter = 'blur(1px)' // FIXME Does not work on Safari
      }
    }

    if (backgroundConfig.type !== 'none') {
      drawSegmentationMask()
      ctx.globalCompositeOperation = 'source-in'
      ctx.filter = 'none'
    }

    ctx.drawImage(cameraPlayback.htmlElement, 0, 0)

    if (backgroundConfig.type === 'blur') {
      blurBackground()
    }
  }

  function drawSegmentationMask() {
    ctx.drawImage(
      segmentationMaskCanvas,
      0,
      0,
      segmentationWidth,
      segmentationHeight,
      0,
      0,
      cameraPlayback.width,
      cameraPlayback.height
    )
  }

  function blurBackground() {
    ctx.globalCompositeOperation = 'destination-over'
    ctx.filter = 'blur(8px)' // FIXME Does not work on Safari
    ctx.drawImage(cameraPlayback.htmlElement, 0, 0)
  }

  return {
    render,
    updatePostProcessingConfig,
    updateBackgroundImage,
    cleanUp,
  }
}
