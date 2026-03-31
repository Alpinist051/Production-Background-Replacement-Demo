<script setup lang="ts">
import { computed, toRef, watch } from 'vue'
import type { BodyPix } from '@tensorflow-models/body-pix'
import { type BackgroundConfig } from '../helpers/backgroundHelper'
import { type PostProcessingConfig } from '../helpers/postProcessingHelper'
import { type SegmentationConfig } from '../helpers/segmentationHelper'
import { type CameraPlayback } from '../helpers/cameraHelper'
import { useRenderingPipeline } from '../../composables/useRenderingPipeline'
import { useHandDetection } from '../../composables/useHandDetection'
import type { TFLite } from '../../composables/useTFLite'

type OfferSignal = {
  type: 'offer'
  offerId: string
  offer: RTCSessionDescriptionInit
}

type AnswerSignal = {
  type: 'answer'
  offerId: string
  answer: RTCSessionDescriptionInit
}

type IceCandidateSignal = {
  type: 'ice-candidate'
  offerId: string
  candidate: RTCIceCandidateInit
}

type SignalMessage = OfferSignal | AnswerSignal | IceCandidateSignal

const props = defineProps<{
  cameraPlayback: CameraPlayback
  backgroundConfig: BackgroundConfig
  segmentationConfig: SegmentationConfig
  postProcessingConfig: PostProcessingConfig
  bodyPix: BodyPix
  tflite: TFLite
}>()

const cameraPlayback = toRef(props, 'cameraPlayback')
const backgroundConfig = toRef(props, 'backgroundConfig')
const segmentationConfig = toRef(props, 'segmentationConfig')
const bodyPix = toRef(props, 'bodyPix')
const tflite = toRef(props, 'tflite')
const handDetection = useHandDetection()

const isBackgroundLoading = computed(
  () =>
    props.backgroundConfig.type === 'image' &&
    backgroundImageRef.value !== null &&
    (!backgroundImageRef.value.complete ||
      backgroundImageRef.value.naturalWidth === 0 ||
      backgroundImageRef.value.naturalHeight === 0)
)

const {
  pipeline,
  backgroundImageRef,
  canvasRef,
  fps,
  durations,
} = useRenderingPipeline(
  cameraPlayback,
  backgroundConfig,
  segmentationConfig,
  bodyPix,
  tflite,
  handDetection
)

watch(
  () => props.postProcessingConfig,
  (config) => {
    pipeline.value?.updatePostProcessingConfig(config)
  },
  {
    deep: true,
    immediate: true,
  }
)

const statsText = computed(() => {
  const [resizingDuration = 0, inferenceDuration = 0, postProcessingDuration = 0] =
    durations.value

  return `${Math.round(fps.value)} fps (resizing ${resizingDuration}ms, inference ${inferenceDuration}ms, post-processing ${postProcessingDuration}ms)`
})

function parseSignalMessage(data: unknown): SignalMessage | null {
  if (typeof data !== 'string') {
    return null
  }

  try {
    const message = JSON.parse(data) as Partial<SignalMessage>
    if (
      message.type === 'offer' ||
      message.type === 'answer' ||
      message.type === 'ice-candidate'
    ) {
      return message as SignalMessage
    }
  } catch (error) {
    console.warn('Failed to parse signaling message.', error)
  }

  return null
}

watch(
  canvasRef,
  (canvas, _, onCleanup) => {
    if (!canvas) {
      return
    }

    const peerConnection = new RTCPeerConnection()
    const signalingChannel = new BroadcastChannel('signaling-channel')
    const localStream = canvas.captureStream()
    const pendingIceCandidates: RTCIceCandidateInit[] = []

    let currentOfferId: string | null = null
    let remoteDescriptionSet = false
    let answerInFlight = false
    let lastAnswer: RTCSessionDescriptionInit | null = null

    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream)
    })

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !currentOfferId) {
        return
      }

      signalingChannel.postMessage(
        JSON.stringify({
          type: 'ice-candidate',
          offerId: currentOfferId,
          candidate: event.candidate.toJSON(),
        })
      )
    }

    async function flushPendingIceCandidates() {
      for (const candidate of pendingIceCandidates) {
        await peerConnection.addIceCandidate(candidate)
      }
      pendingIceCandidates.splice(0, pendingIceCandidates.length)
    }

    async function answerOffer(message: OfferSignal) {
      if (currentOfferId === message.offerId && lastAnswer) {
        signalingChannel.postMessage(
          JSON.stringify({
            type: 'answer',
            offerId: message.offerId,
            answer: lastAnswer,
          })
        )
        return
      }

      if (answerInFlight) {
        return
      }

      currentOfferId = message.offerId
      remoteDescriptionSet = false
      lastAnswer = null
      pendingIceCandidates.length = 0
      answerInFlight = true

      try {
        await peerConnection.setRemoteDescription(
          new RTCSessionDescription(message.offer)
        )
        remoteDescriptionSet = true
        await flushPendingIceCandidates()

        const answer = await peerConnection.createAnswer()
        await peerConnection.setLocalDescription(answer)

        lastAnswer = answer
        signalingChannel.postMessage(
          JSON.stringify({
            type: 'answer',
            offerId: message.offerId,
            answer,
          })
        )
      } catch (error) {
        console.error('Failed to answer offer.', error)
      } finally {
        answerInFlight = false
      }
    }

    signalingChannel.onmessage = async (event) => {
      const message = parseSignalMessage(event.data)
      if (!message) {
        return
      }

      if (message.type === 'offer') {
        await answerOffer(message)
        return
      }

      if (!currentOfferId || message.offerId !== currentOfferId) {
        return
      }

      if (message.type === 'ice-candidate') {
        try {
          if (remoteDescriptionSet) {
            await peerConnection.addIceCandidate(message.candidate)
          } else {
            pendingIceCandidates.push(message.candidate)
          }
        } catch (error) {
          console.error('Failed to add ice candidate.', error)
        }
      }
    }

    onCleanup(() => {
      peerConnection.close()
      signalingChannel.close()
      localStream.getTracks().forEach((track) => track.stop())
    })
  },
  { immediate: true }
)
</script>

<template>
  <div class="output-viewer">
    <img
      v-if="backgroundConfig.type === 'image'"
      ref="backgroundImageRef"
      class="output-viewer__background"
      :src="backgroundConfig.url"
      alt=""
      :hidden="segmentationConfig.pipeline === 'webgl2'"
    />
    <canvas
      :key="segmentationConfig.pipeline"
      ref="canvasRef"
      class="output-viewer__canvas"
      :width="cameraPlayback.width"
      :height="cameraPlayback.height"
    />
    <div v-if="isBackgroundLoading" class="output-viewer__loading">
      Loading background...
    </div>
    <div class="stats-bar">{{ statsText }}</div>
  </div>
</template>

<style scoped>
.output-viewer {
  position: relative;
  min-height: 100%;
  background:
    radial-gradient(circle at top right, rgba(138, 212, 255, 0.08), transparent 28%),
    linear-gradient(180deg, rgba(8, 15, 29, 0.26), rgba(8, 15, 29, 0.64));
}

.output-viewer__background,
.output-viewer__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.output-viewer__canvas {
  background: #020617;
}

.output-viewer__loading {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  z-index: 2;
  padding: 0.5rem 0.8rem;
  border: 1px solid rgba(110, 231, 183, 0.28);
  border-radius: 999px;
  background: rgba(2, 6, 23, 0.7);
  color: var(--text);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  backdrop-filter: blur(12px);
}
</style>
