import { onMounted, ref, type Ref } from 'vue'
import {
  createHandMaskRenderer,
  type HandMaskRenderer,
  type HandPrediction,
} from '../core/helpers/handMaskHelper'

type HandDetector = {
  estimateHands(
    image: HTMLVideoElement | HTMLCanvasElement
  ): Promise<HandPrediction[]>
}

export type HandDetectionController = {
  handMask: Ref<Uint8Array | null>
  detectHands(
    video: HTMLVideoElement,
    targetWidth: number,
    targetHeight: number
  ): Promise<void>
}

export function useHandDetection(): HandDetectionController {
  const handMask = ref<Uint8Array | null>(null)

  let detector: HandDetector | null = null
  let renderer: HandMaskRenderer | null = null
  let detectorInputCanvas: HTMLCanvasElement | null = null
  let detectorInputCtx: CanvasRenderingContext2D | null = null
  let rendererWidth = 0
  let rendererHeight = 0
  let isLoading = false
  let isDetecting = false
  let lastDetectionAt = 0
  const detectorInputMaxDimension = 288
  const minDetectionIntervalMs = 0

  onMounted(() => {
    void loadHandDetector()
  })

  async function loadHandDetector() {
    if (isLoading || detector) {
      return
    }

    isLoading = true

    try {
      const [handPoseDetection, tf] = await Promise.all([
        import('@tensorflow-models/hand-pose-detection/dist/tfjs/detector'),
        import('@tensorflow/tfjs-core'),
      ])

      try {
        await import('@tensorflow/tfjs-backend-webgl')
        await tf.setBackend('webgl')
      } catch (webglError) {
        console.warn(
          'WebGL backend unavailable for hand detection, falling back to CPU.',
          webglError
        )
        await import('@tensorflow/tfjs-backend-cpu')
        await tf.setBackend('cpu')
      }

      await tf.ready()

      // Use the tfjs-only detector entry point so the app does not depend on
      // the MediaPipe bundle, which is published as a UMD script.
      detector = await handPoseDetection.load({
        runtime: 'tfjs',
        modelType: 'lite',
        maxHands: 2,
      })

      // Warm the detector up on a small blank frame so the first real hand
      // does not pay the shader/model compilation cost.
      const warmupCanvas = document.createElement('canvas')
      warmupCanvas.width = 256
      warmupCanvas.height = 256
      const warmupCtx = warmupCanvas.getContext('2d')
      if (warmupCtx) {
        warmupCtx.fillStyle = '#000'
        warmupCtx.fillRect(0, 0, warmupCanvas.width, warmupCanvas.height)
        try {
          await detector.estimateHands(warmupCanvas)
        } catch (warmupError) {
          console.warn('Hand detector warm-up failed.', warmupError)
        }
      }
    } catch (error) {
      console.warn('Failed to load the hand detector.', error)
    } finally {
      isLoading = false
    }
  }

  async function detectHands(
    video: HTMLVideoElement,
    targetWidth: number,
    targetHeight: number
  ) {
    if (
      !detector ||
      isDetecting ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return
    }

    const now = performance.now()
    if (now - lastDetectionAt < minDetectionIntervalMs) {
      return
    }

    const source = getDetectorInput(video)

    if (
      rendererWidth !== targetWidth ||
      rendererHeight !== targetHeight ||
      !renderer
    ) {
      renderer = createHandMaskRenderer(targetWidth, targetHeight)
      rendererWidth = targetWidth
      rendererHeight = targetHeight
    }

    isDetecting = true
    lastDetectionAt = now

    try {
      const hands = await detector.estimateHands(source.canvas)
      handMask.value = renderer.render(
        hands,
        source.canvas.width,
        source.canvas.height
      )
    } catch (error) {
      console.warn('Failed to detect hands.', error)
    } finally {
      isDetecting = false
    }
  }

  function getDetectorInput(video: HTMLVideoElement) {
    const sourceWidth = Math.max(1, video.videoWidth)
    const sourceHeight = Math.max(1, video.videoHeight)
    const scale = Math.min(
      1,
      detectorInputMaxDimension / Math.max(sourceWidth, sourceHeight)
    )
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale))

    if (!detectorInputCanvas) {
      detectorInputCanvas = document.createElement('canvas')
    }
    if (
      detectorInputCanvas.width !== targetWidth ||
      detectorInputCanvas.height !== targetHeight
    ) {
      detectorInputCanvas.width = targetWidth
      detectorInputCanvas.height = targetHeight
      detectorInputCtx = detectorInputCanvas.getContext('2d')
      if (detectorInputCtx) {
        detectorInputCtx.imageSmoothingEnabled = true
      }
    }

    if (!detectorInputCtx) {
      throw new Error('Unable to create a 2D canvas context for hand detection')
    }

    detectorInputCtx.clearRect(0, 0, targetWidth, targetHeight)
    detectorInputCtx.drawImage(video, 0, 0, targetWidth, targetHeight)

    return { canvas: detectorInputCanvas, width: targetWidth, height: targetHeight }
  }

  return {
    handMask,
    detectHands,
  }
}
