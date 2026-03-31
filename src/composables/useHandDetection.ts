import { onMounted, ref, type Ref } from 'vue'
import {
  createHandMaskRenderer,
  type HandMaskRenderer,
  type HandPrediction,
} from '../core/helpers/handMaskHelper'

type HandDetector = {
  estimateHands(image: HTMLVideoElement): Promise<HandPrediction[]>
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
  let rendererWidth = 0
  let rendererHeight = 0
  let isLoading = false
  let isDetecting = false
  let lastDetectionAt = 0

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
        console.warn('WebGL backend unavailable for hand detection, falling back to CPU.', webglError)
        await import('@tensorflow/tfjs-backend-cpu')
        await tf.setBackend('cpu')
      }

      await tf.ready()

      // Use the tfjs-only detector entry point so the app does not depend on
      // the MediaPipe bundle, which is published as a UMD script.
      detector = await handPoseDetection.load({
        runtime: 'tfjs',
        modelType: 'full',
        maxHands: 2,
      })
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
    if (now - lastDetectionAt < 120) {
      return
    }

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
      const hands = await detector.estimateHands(video)
      handMask.value = renderer.render(hands, video.videoWidth, video.videoHeight)
    } catch (error) {
      console.warn('Failed to detect hands.', error)
    } finally {
      isDetecting = false
    }
  }

  return {
    handMask,
    detectHands,
  }
}
