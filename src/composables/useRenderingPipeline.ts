import { watchEffect, ref, type Ref } from 'vue'
import type { BodyPix } from '@tensorflow-models/body-pix'
import { buildCanvas2dPipeline } from '../pipelines/canvas2d/canvas2dPipeline'
import { buildWebGL2Pipeline } from '../pipelines/webgl2/webgl2Pipeline'
import { createTimerWorker } from '../shared/helpers/timerHelper'
import { BackgroundConfig } from '../core/helpers/backgroundHelper'
import { RenderingPipeline } from '../core/helpers/renderingPipelineHelper'
import { SegmentationConfig } from '../core/helpers/segmentationHelper'
import { CameraPlayback } from '../core/helpers/cameraHelper'
import { TFLite } from './useTFLite'

export function useRenderingPipeline(
  cameraPlayback: Ref<CameraPlayback | undefined>,
  backgroundConfig: Ref<BackgroundConfig>,
  segmentationConfig: Ref<SegmentationConfig>,
  bodyPix: Ref<BodyPix | undefined>,
  tflite: Ref<TFLite | undefined>
) {
  const pipeline = ref<RenderingPipeline | null>(null)
  const backgroundImageRef = ref<HTMLImageElement | null>(null)
  const canvasRef = ref<HTMLCanvasElement | null>(null)
  const fps = ref(0)
  const durations = ref<number[]>([])

  watchEffect((onCleanup) => {
    const camera = cameraPlayback.value
    const bg = backgroundConfig.value
    const segmentation = segmentationConfig.value
    const bodyPixModel = bodyPix.value
    const tfliteModel = tflite.value
    const canvas = canvasRef.value

    if (!camera || !bodyPixModel || !tfliteModel || !canvas) {
      pipeline.value = null
      return
    }

    const targetTimerTimeoutMs = 1000 / segmentation.targetFps

    let previousTime = 0
    let beginTime = 0
    let eventCount = 0
    let frameCount = 0
    const frameDurations: number[] = []
    let renderTimeoutId: number | undefined

    const timerWorker = createTimerWorker()

    const newPipeline =
      segmentation.pipeline === 'webgl2'
        ? buildWebGL2Pipeline(
            camera,
            backgroundImageRef.value,
            bg,
            segmentation,
            canvas,
            tfliteModel,
            timerWorker,
            addFrameEvent
          )
        : buildCanvas2dPipeline(
            camera,
            bg,
            segmentation,
            canvas,
            bodyPixModel,
            tfliteModel,
            addFrameEvent
          )

    async function render() {
      const startTime = performance.now()

      beginFrame()
      await newPipeline.render()
      endFrame()

      renderTimeoutId = timerWorker.setTimeout(
        render,
        Math.max(0, targetTimerTimeoutMs - (performance.now() - startTime))
      )
    }

    function beginFrame() {
      beginTime = Date.now()
    }

    function addFrameEvent() {
      const time = Date.now()
      frameDurations[eventCount] = time - beginTime
      beginTime = time
      eventCount++
    }

    function endFrame() {
      const time = Date.now()
      frameDurations[eventCount] = time - beginTime
      frameCount++
      if (time >= previousTime + 1000) {
        fps.value = (frameCount * 1000) / (time - previousTime)
        durations.value = [...frameDurations]
        previousTime = time
        frameCount = 0
      }
      eventCount = 0
    }

    render()
    console.log('Animation started:', camera, bg, segmentation)

    pipeline.value = newPipeline

    onCleanup(() => {
      if (renderTimeoutId !== undefined) {
        timerWorker.clearTimeout(renderTimeoutId)
      }
      timerWorker.terminate()
      newPipeline.cleanUp()
      console.log('Animation stopped:', camera, bg, segmentation)
      pipeline.value = null
    })
  })

  return {
    pipeline,
    backgroundImageRef,
    canvasRef,
    fps,
    durations,
  }
}
