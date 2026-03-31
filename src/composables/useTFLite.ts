import { onMounted, ref, watch, type Ref } from 'vue'
import {
  getTFLiteModelFileName,
  type SegmentationConfig,
} from '../core/helpers/segmentationHelper'

declare function createTFLiteModule(): Promise<TFLite>
declare function createTFLiteSIMDModule(): Promise<TFLite>

export interface TFLite extends EmscriptenModule {
  _getModelBufferMemoryOffset(): number
  _getInputMemoryOffset(): number
  _getInputHeight(): number
  _getInputWidth(): number
  _getInputChannelCount(): number
  _getOutputMemoryOffset(): number
  _getOutputHeight(): number
  _getOutputWidth(): number
  _getOutputChannelCount(): number
  _loadModel(bufferSize: number): number
  _runInference(): number
}

export function useTFLite(segmentationConfig: Ref<SegmentationConfig>) {
  const tflite = ref<TFLite>()
  const tfliteSIMD = ref<TFLite>()
  const selectedTFLite = ref<TFLite>()
  const isSIMDSupported = ref(false)

  onMounted(() => {
    async function loadTFLite() {
      try {
        tflite.value = await createTFLiteModule()

        try {
          tfliteSIMD.value = await createTFLiteSIMDModule()
          isSIMDSupported.value = true
        } catch (error) {
          console.warn('Failed to create TFLite SIMD WebAssembly module.', error)
        }
      } catch (error) {
        console.error('Failed to create TFLite WebAssembly module.', error)
      }
    }

    void loadTFLite()
  })

  watch(
    [
      tflite,
      tfliteSIMD,
      isSIMDSupported,
      () => segmentationConfig.value.model,
      () => segmentationConfig.value.backend,
      () => segmentationConfig.value.inputResolution,
    ],
    async (_, __, onCleanup) => {
      let cancelled = false

      onCleanup(() => {
        cancelled = true
      })

      if (
        !tflite.value ||
        (isSIMDSupported.value && !tfliteSIMD.value) ||
        (!isSIMDSupported.value && segmentationConfig.value.backend === 'wasmSimd') ||
        (segmentationConfig.value.model !== 'meet' &&
          segmentationConfig.value.model !== 'mlkit')
      ) {
        return
      }

      selectedTFLite.value = undefined

      const newSelectedTFLite =
        segmentationConfig.value.backend === 'wasmSimd'
          ? tfliteSIMD.value
          : tflite.value

      if (!newSelectedTFLite) {
        throw new Error(
          `TFLite backend unavailable: ${segmentationConfig.value.backend}`
        )
      }

      const modelFileName = getTFLiteModelFileName(
        segmentationConfig.value.model,
        segmentationConfig.value.inputResolution
      )
      console.log('Loading tflite model:', modelFileName)

      try {
        const modelResponse = await fetch(
          `${import.meta.env.BASE_URL}models/${modelFileName}.tflite`
        )
        if (!modelResponse.ok) {
          throw new Error(
            `Failed to load TFLite model: ${modelResponse.status} ${modelResponse.statusText}`
          )
        }

        const model = await modelResponse.arrayBuffer()
        if (cancelled) {
          return
        }

        console.log('Model buffer size:', model.byteLength)

        const modelBufferOffset = newSelectedTFLite._getModelBufferMemoryOffset()
        console.log('Model buffer memory offset:', modelBufferOffset)
        console.log('Loading model buffer...')
        newSelectedTFLite.HEAPU8.set(new Uint8Array(model), modelBufferOffset)
        console.log(
          '_loadModel result:',
          newSelectedTFLite._loadModel(model.byteLength)
        )

        console.log(
          'Input memory offset:',
          newSelectedTFLite._getInputMemoryOffset()
        )
        console.log('Input height:', newSelectedTFLite._getInputHeight())
        console.log('Input width:', newSelectedTFLite._getInputWidth())
        console.log('Input channels:', newSelectedTFLite._getInputChannelCount())

        console.log(
          'Output memory offset:',
          newSelectedTFLite._getOutputMemoryOffset()
        )
        console.log('Output height:', newSelectedTFLite._getOutputHeight())
        console.log('Output width:', newSelectedTFLite._getOutputWidth())
        console.log(
          'Output channels:',
          newSelectedTFLite._getOutputChannelCount()
        )

        selectedTFLite.value = newSelectedTFLite
      } catch (error) {
        console.error('Failed to load TFLite model', error)
      }
    },
    { immediate: true }
  )

  return { tflite: selectedTFLite, isSIMDSupported }
}
