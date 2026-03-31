<script setup lang="ts">
import { ref } from 'vue'
import type { BodyPix } from '@tensorflow-models/body-pix'
import type { BackgroundConfig } from '../helpers/backgroundHelper'
import type { PostProcessingConfig } from '../helpers/postProcessingHelper'
import type { SegmentationConfig } from '../helpers/segmentationHelper'
import type { CameraPlayback } from '../helpers/cameraHelper'
import type { TFLite } from '../../composables/useTFLite'
import CameraViewer from './CameraViewer.vue'
import OutputViewer from './OutputViewer.vue'

const props = defineProps<{
  backgroundConfig: BackgroundConfig
  segmentationConfig: SegmentationConfig
  postProcessingConfig: PostProcessingConfig
  bodyPix?: BodyPix
  tflite?: TFLite
}>()

const cameraPlayback = ref<CameraPlayback>()

function handleCameraLoad(playback: CameraPlayback) {
  cameraPlayback.value = playback
}
</script>

<template>
  <section class="panel viewer-card">
    <div class="viewer-card__camera">
      <CameraViewer @load="handleCameraLoad" />
    </div>
    <div class="viewer-card__output">
      <OutputViewer
        v-if="cameraPlayback && props.bodyPix && props.tflite"
        :camera-playback="cameraPlayback"
        :background-config="props.backgroundConfig"
        :segmentation-config="props.segmentationConfig"
        :post-processing-config="props.postProcessingConfig"
        :body-pix="props.bodyPix"
        :tflite="props.tflite"
      />
      <div v-else class="placeholder">
        <div>
          <p class="panel__title">Live output</p>
          <p class="panel__subtitle">
            Allow the camera and wait for the segmentation models to finish
            loading.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.viewer-card {
  display: grid;
  grid-template-columns: 1fr;
  min-height: 32rem;
}

.viewer-card__camera,
.viewer-card__output {
  min-height: 16rem;
}

.viewer-card__output {
  position: relative;
  background: rgba(2, 6, 23, 0.2);
}

@media (min-width: 1024px) {
  .viewer-card {
    grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.4fr);
  }

  .viewer-card__camera {
    border-right: 1px solid var(--panel-border);
  }
}
</style>
