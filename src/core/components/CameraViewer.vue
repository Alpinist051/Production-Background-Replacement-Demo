<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { type CameraPlayback } from '../helpers/cameraHelper'

const emit = defineEmits<{
  load: [CameraPlayback]
}>()

const videoRef = ref<HTMLVideoElement | null>(null)
const isLoading = ref(true)
const isCameraError = ref(false)

let cameraStream: MediaStream | undefined
let isCancelled = false
let hasEmittedLoad = false

async function openCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
    })

    if (isCancelled) {
      stream.getTracks().forEach((track) => track.stop())
      return
    }

    cameraStream = stream

    if (videoRef.value) {
      videoRef.value.srcObject = stream
      videoRef.value.play().catch(() => {
        // Muted autoplay should work, but some browsers still reject the
        // promise until playback starts.
      })
    }
  } catch (error) {
    console.error('Error opening video camera.', error)
    if (!isCancelled) {
      isLoading.value = false
      isCameraError.value = true
    }
  }
}

function handleLoadedMetadata() {
  if (!videoRef.value || hasEmittedLoad) {
    return
  }

  hasEmittedLoad = true
  emit('load', {
    htmlElement: videoRef.value,
    width: videoRef.value.videoWidth,
    height: videoRef.value.videoHeight,
  })
  isLoading.value = false
}

onMounted(() => {
  void openCamera()
})

onBeforeUnmount(() => {
  isCancelled = true
  cameraStream?.getTracks().forEach((track) => track.stop())
  cameraStream = undefined

  if (videoRef.value) {
    videoRef.value.srcObject = null
  }
})
</script>

<template>
  <div class="camera-viewer">
    <div v-if="isLoading" class="camera-viewer__spinner" aria-hidden="true"></div>
    <p v-if="isCameraError" class="camera-viewer__message">
      Camera access was denied or is unavailable.
    </p>
    <video
      v-else
      ref="videoRef"
      class="camera-viewer__video"
      :hidden="isLoading"
      autoplay
      playsinline
      muted
      @loadedmetadata="handleLoadedMetadata"
    />
  </div>
</template>

<style scoped>
.camera-viewer {
  position: relative;
  min-height: 16rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at top, rgba(108, 232, 199, 0.1), transparent 38%),
    linear-gradient(180deg, rgba(2, 6, 23, 0.22), rgba(2, 6, 23, 0.42));
}

.camera-viewer__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.camera-viewer__spinner {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.12);
  border-top-color: var(--accent);
  animation: spin 1s linear infinite;
}

.camera-viewer__message {
  position: relative;
  z-index: 1;
  padding: 1.5rem;
  color: var(--muted);
  text-align: center;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
