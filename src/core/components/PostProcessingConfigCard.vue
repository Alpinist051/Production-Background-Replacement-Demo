<script setup lang="ts">
import { computed } from 'vue'
import { type BlendMode, type PostProcessingConfig } from '../helpers/postProcessingHelper'
import { type PipelineName } from '../helpers/segmentationHelper'

const props = defineProps<{
  config: PostProcessingConfig
  pipeline: PipelineName
}>()

const emit = defineEmits<{
  change: [PostProcessingConfig]
}>()

const isWebGL2 = computed(() => props.pipeline === 'webgl2')

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function handleSmoothSegmentationMaskChange(event: Event) {
  emit('change', {
    ...props.config,
    smoothSegmentationMask: (event.target as HTMLInputElement).checked,
  })
}

function handleSigmaSpaceChange(event: Event) {
  emit('change', {
    ...props.config,
    jointBilateralFilter: {
      ...props.config.jointBilateralFilter,
      sigmaSpace: parseFloat((event.target as HTMLInputElement).value),
    },
  })
}

function handleSigmaColorChange(event: Event) {
  emit('change', {
    ...props.config,
    jointBilateralFilter: {
      ...props.config.jointBilateralFilter,
      sigmaColor: parseFloat((event.target as HTMLInputElement).value),
    },
  })
}

function handleCoverageStartChange(event: Event) {
  const nextStart = parseFloat((event.target as HTMLInputElement).value)
  const [, currentEnd] = props.config.coverage
  const maxStart = Math.max(0, currentEnd - 0.01)

  emit('change', {
    ...props.config,
    coverage: [clamp(nextStart, 0, maxStart), currentEnd],
  })
}

function handleCoverageEndChange(event: Event) {
  const nextEnd = parseFloat((event.target as HTMLInputElement).value)
  const [currentStart] = props.config.coverage
  const minEnd = Math.min(1, currentStart + 0.01)

  emit('change', {
    ...props.config,
    coverage: [currentStart, clamp(nextEnd, minEnd, 1)],
  })
}

function handleLightWrappingChange(event: Event) {
  emit('change', {
    ...props.config,
    lightWrapping: parseFloat((event.target as HTMLInputElement).value),
  })
}

function handleBlendModeChange(event: Event) {
  emit('change', {
    ...props.config,
    blendMode: (event.target as HTMLSelectElement).value as BlendMode,
  })
}
</script>

<template>
  <section class="panel">
    <div class="panel__body">
      <h2 class="panel__title">Post-processing</h2>
      <p class="panel__subtitle">
        WebGL 2 exposes the richer controls; the CPU path only uses mask
        smoothing.
      </p>

      <div v-if="isWebGL2" class="form-grid">
        <div class="field">
          <div class="field__label">Joint bilateral filter</div>
          <label class="field">
            <span class="field__label">Sigma space</span>
            <input
              class="range"
              type="range"
              min="0"
              max="10"
              step="0.1"
              :value="config.jointBilateralFilter.sigmaSpace"
              @input="handleSigmaSpaceChange"
            />
          </label>
          <label class="field">
            <span class="field__label">Sigma color</span>
            <input
              class="range"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="config.jointBilateralFilter.sigmaColor"
              @input="handleSigmaColorChange"
            />
          </label>
        </div>

        <div class="field">
          <div class="field__label">Background</div>
          <label class="field">
            <span class="field__label">Coverage start</span>
            <input
              class="range"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="config.coverage[0]"
              @input="handleCoverageStartChange"
            />
          </label>
          <label class="field">
            <span class="field__label">Coverage end</span>
            <input
              class="range"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="config.coverage[1]"
              @input="handleCoverageEndChange"
            />
          </label>
          <div class="field__help">
            Higher coverage keeps more of the person mask visible before the
            background blend fades in.
          </div>
        </div>

        <div class="form-row">
          <label class="field">
            <span class="field__label">Blend mode</span>
            <select
              class="select"
              :value="config.blendMode"
              @change="handleBlendModeChange"
            >
              <option value="screen">Screen</option>
              <option value="linearDodge">Linear dodge</option>
            </select>
          </label>

          <label class="field">
            <span class="field__label">Light wrapping</span>
            <input
              class="range"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="config.lightWrapping"
              @input="handleLightWrappingChange"
            />
          </label>
        </div>
      </div>

      <label v-else class="switch-row">
        <input
          type="checkbox"
          :checked="config.smoothSegmentationMask"
          @change="handleSmoothSegmentationMaskChange"
        />
        <span>Smooth segmentation mask</span>
      </label>
    </div>
  </section>
</template>
