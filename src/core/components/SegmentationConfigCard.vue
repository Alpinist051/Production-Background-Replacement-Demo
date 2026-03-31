<script setup lang="ts">
import {
  type InputResolution,
  type PipelineName,
  type SegmentationBackend,
  type SegmentationConfig,
  type SegmentationModel,
} from '../helpers/segmentationHelper'

const props = defineProps<{
  config: SegmentationConfig
  isSIMDSupported: boolean
}>()

const emit = defineEmits<{
  change: [SegmentationConfig]
}>()

function handleModelChange(event: Event) {
  const model = (event.target as HTMLSelectElement).value as SegmentationModel
  let backend = props.config.backend
  let inputResolution = props.config.inputResolution
  let pipeline = props.config.pipeline

  switch (model) {
    case 'bodyPix':
      backend = 'webgl'
      inputResolution = '640x360'
      pipeline = 'canvas2dCpu'
      break

    case 'meet':
      if (
        (backend !== 'wasm' && backend !== 'wasmSimd') ||
        (inputResolution !== '256x144' && inputResolution !== '160x96')
      ) {
        backend = props.isSIMDSupported ? 'wasmSimd' : 'wasm'
        inputResolution = '160x96'
        pipeline = 'webgl2'
      }
      break

    case 'mlkit':
      if (
        (backend !== 'wasm' && backend !== 'wasmSimd') ||
        inputResolution !== '256x256'
      ) {
        backend = props.isSIMDSupported ? 'wasmSimd' : 'wasm'
        inputResolution = '256x256'
        pipeline = 'webgl2'
      }
      break
  }

  emit('change', {
    ...props.config,
    model,
    backend,
    inputResolution,
    pipeline,
  })
}

function handleBackendChange(event: Event) {
  emit('change', {
    ...props.config,
    backend: (event.target as HTMLSelectElement).value as SegmentationBackend,
  })
}

function handleInputResolutionChange(event: Event) {
  emit('change', {
    ...props.config,
    inputResolution: (event.target as HTMLSelectElement).value as InputResolution,
  })
}

function handlePipelineChange(event: Event) {
  emit('change', {
    ...props.config,
    pipeline: (event.target as HTMLSelectElement).value as PipelineName,
  })
}

function handleTargetFpsChange(event: Event) {
  emit('change', {
    ...props.config,
    targetFps: parseInt((event.target as HTMLInputElement).value, 10),
  })
}

function handleDeferInputResizingChange(event: Event) {
  emit('change', {
    ...props.config,
    deferInputResizing: (event.target as HTMLInputElement).checked,
  })
}
</script>

<template>
  <section class="panel">
    <div class="panel__body">
      <h2 class="panel__title">Segmentation</h2>
      <p class="panel__subtitle">
        The model choice adjusts the backend and input resolution to a
        compatible combination.
      </p>
      <div class="segmentation-toolbar">
        <label class="field">
          <span class="field__label">Model</span>
          <select class="select" :value="config.model" @change="handleModelChange">
            <option value="meet">Meet</option>
            <option value="mlkit">ML Kit</option>
            <option value="bodyPix">BodyPix</option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">Backend</span>
          <select
            class="select"
            :value="config.backend"
            @change="handleBackendChange"
          >
            <option value="wasm" :disabled="config.model === 'bodyPix'">
              WebAssembly
            </option>
            <option
              value="wasmSimd"
              :disabled="config.model === 'bodyPix' || !isSIMDSupported"
            >
              WebAssembly SIMD
            </option>
            <option value="webgl" :disabled="config.model !== 'bodyPix'">
              WebGL
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">Input resolution</span>
          <select
            class="select"
            :value="config.inputResolution"
            @change="handleInputResolutionChange"
          >
            <option value="640x360" :disabled="config.model !== 'bodyPix'">
              640x360
            </option>
            <option value="256x256" :disabled="config.model !== 'mlkit'">
              256x256
            </option>
            <option value="256x144" :disabled="config.model !== 'meet'">
              256x144
            </option>
            <option value="160x96" :disabled="config.model !== 'meet'">
              160x96
            </option>
          </select>
        </label>

        <label class="field">
          <span class="field__label">Pipeline</span>
          <select
            class="select"
            :value="config.pipeline"
            @change="handlePipelineChange"
          >
            <option value="webgl2" :disabled="config.model === 'bodyPix'">
              WebGL 2
            </option>
            <option value="canvas2dCpu">Canvas 2D + CPU</option>
          </select>
        </label>

        <label v-if="config.pipeline === 'webgl2'" class="field field--tight">
          <span class="field__label">FPS</span>
          <input
            class="input"
            type="number"
            min="1"
            max="120"
            step="1"
            :value="config.targetFps"
            @change="handleTargetFpsChange"
          />
        </label>

        <label v-if="config.pipeline === 'webgl2'" class="field field--tight">
          <span class="field__label">Defer resize</span>
          <span class="switch-row">
            <input
              type="checkbox"
              :checked="config.deferInputResizing"
              @change="handleDeferInputResizingChange"
            />
            <span>On</span>
          </span>
        </label>
      </div>
    </div>
  </section>
</template>
