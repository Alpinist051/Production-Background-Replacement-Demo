<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BackgroundConfigCard from './core/components/BackgroundConfigCard.vue'
import PostProcessingConfigCard from './core/components/PostProcessingConfigCard.vue'
import SegmentationConfigCard from './core/components/SegmentationConfigCard.vue'
import ViewerCard from './core/components/ViewerCard.vue'
import {
  backgroundImageUrls,
  type BackgroundConfig,
} from './core/helpers/backgroundHelper'
import { type PostProcessingConfig } from './core/helpers/postProcessingHelper'
import {
  type SegmentationConfig,
} from './core/helpers/segmentationHelper'
import { useBodyPix } from './composables/useBodyPix'
import { useTFLite } from './composables/useTFLite'

const backgroundConfig = ref<BackgroundConfig>({
  type: 'image',
  url: backgroundImageUrls[0],
})

const segmentationConfig = ref<SegmentationConfig>({
  model: 'meet',
  backend: 'wasm',
  inputResolution: '160x96',
  pipeline: 'webgl2',
  targetFps: 65,
  deferInputResizing: true,
})

const postProcessingConfig = ref<PostProcessingConfig>({
  smoothSegmentationMask: true,
  jointBilateralFilter: { sigmaSpace: 1, sigmaColor: 0.1 },
  coverage: [0.5, 0.75],
  lightWrapping: 0.3,
  blendMode: 'screen',
})

const { bodyPix } = useBodyPix()
const { tflite, isSIMDSupported } = useTFLite(segmentationConfig)

watch(isSIMDSupported, (supported) => {
  if (supported && segmentationConfig.value.backend === 'wasm') {
    segmentationConfig.value = {
      ...segmentationConfig.value,
      backend: 'wasmSimd',
    }
  }
})

const modelStatus = computed(() =>
  bodyPix.value && tflite.value ? 'Models ready' : 'Loading models'
)

function formatModelName(model: SegmentationConfig['model']) {
  switch (model) {
    case 'bodyPix':
      return 'BodyPix'
    case 'mlkit':
      return 'ML Kit'
    default:
      return 'Meet'
  }
}

function formatBackendName(backend: SegmentationConfig['backend']) {
  switch (backend) {
    case 'wasm':
      return 'WASM'
    case 'wasmSimd':
      return 'WASM SIMD'
    default:
      return 'WebGL'
  }
}

function formatPipelineName(pipeline: SegmentationConfig['pipeline']) {
  return pipeline === 'webgl2' ? 'WebGL 2' : 'Canvas 2D + CPU'
}

const pipelineStatus = computed(
  () =>
    `${formatModelName(segmentationConfig.value.model)} / ${formatBackendName(segmentationConfig.value.backend)} / ${formatPipelineName(segmentationConfig.value.pipeline)}`
)

const modelPreview = computed(() => {
  return `${formatModelName(segmentationConfig.value.model)} / ${formatBackendName(segmentationConfig.value.backend)}`
})

function handleSegmentationChange(config: SegmentationConfig) {
  segmentationConfig.value = config
}

function handleBackgroundChange(config: BackgroundConfig) {
  backgroundConfig.value = config
}

function handlePostProcessingChange(config: PostProcessingConfig) {
  postProcessingConfig.value = config
}
</script>

<template>
  <main class="page-frame">
    <header class="hero">
      <div class="hero__copy">
        <p class="hero__eyebrow">Vue 3 / WebGL 2 / WASM</p>
        <h1 class="hero__title">Virtual Background</h1>
        <p class="hero__lede">
          Capture the camera, segment the person, and composite a live
          background in the browser with BodyPix or a TFLite pipeline.
        </p>
      </div>
      <div class="hero__badges">
        <span class="badge badge--accent">{{ modelStatus }}</span>
        <span class="badge">Camera only</span>
        <span class="badge">{{ modelPreview }}</span>
        <span class="badge">{{ pipelineStatus }}</span>
      </div>
    </header>

    <section class="dashboard__topbar">
      <BackgroundConfigCard
        :config="backgroundConfig"
        @change="handleBackgroundChange"
      />
      <SegmentationConfigCard
        :config="segmentationConfig"
        :is-simd-supported="isSIMDSupported"
        @change="handleSegmentationChange"
      />
    </section>

    <section class="dashboard">
      <ViewerCard
        class="dashboard__viewer"
        :background-config="backgroundConfig"
        :segmentation-config="segmentationConfig"
        :post-processing-config="postProcessingConfig"
        :body-pix="bodyPix"
        :tflite="tflite"
      />
      <aside class="dashboard__sidebar">
        <PostProcessingConfigCard
          :config="postProcessingConfig"
          :pipeline="segmentationConfig.pipeline"
          @change="handlePostProcessingChange"
        />
      </aside>
    </section>
  </main>
</template>
