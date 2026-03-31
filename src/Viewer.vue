<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

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

const videoRef = ref<HTMLVideoElement | null>(null)
const isConnected = ref(false)

let peerConnection: RTCPeerConnection | undefined
let signalingChannel: BroadcastChannel | undefined
let resendTimerId: number | undefined
let localOffer: RTCSessionDescriptionInit | null = null
let offerId: string | null = null
let pendingIceCandidates: RTCIceCandidateInit[] = []
let remoteDescriptionSet = false
let hasReceivedAnswer = false

function createOfferId() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

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
    console.warn('Failed to parse viewer signaling message.', error)
  }

  return null
}

async function sendOffer() {
  if (!peerConnection || !signalingChannel || !offerId) {
    return
  }

  if (!localOffer) {
    localOffer = await peerConnection.createOffer({ offerToReceiveVideo: true })
    await peerConnection.setLocalDescription(localOffer)
  }

  signalingChannel.postMessage(
    JSON.stringify({
      type: 'offer',
      offerId,
      offer: peerConnection.localDescription ?? localOffer,
    })
  )
}

async function handleAnswer(message: AnswerSignal) {
  try {
    if (!peerConnection || !offerId || message.offerId !== offerId) {
      return
    }

    if (remoteDescriptionSet) {
      return
    }

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(message.answer)
    )
    remoteDescriptionSet = true
    hasReceivedAnswer = true

    if (resendTimerId !== undefined) {
      window.clearInterval(resendTimerId)
      resendTimerId = undefined
    }

    for (const candidate of pendingIceCandidates) {
      await peerConnection.addIceCandidate(candidate)
    }
    pendingIceCandidates = []
  } catch (error) {
    console.error('Failed to handle answer.', error)
  }
}

async function handleIceCandidate(message: IceCandidateSignal) {
  try {
    if (!peerConnection || !offerId || message.offerId !== offerId) {
      return
    }

    if (remoteDescriptionSet) {
      await peerConnection.addIceCandidate(message.candidate)
      return
    }

    pendingIceCandidates.push(message.candidate)
  } catch (error) {
    console.error('Failed to handle ice candidate.', error)
  }
}

function stopSignaling() {
  if (resendTimerId !== undefined) {
    window.clearInterval(resendTimerId)
    resendTimerId = undefined
  }

  peerConnection?.close()
  signalingChannel?.close()
  peerConnection = undefined
  signalingChannel = undefined
  localOffer = null
  offerId = null
  pendingIceCandidates = []
  remoteDescriptionSet = false
  hasReceivedAnswer = false
  isConnected.value = false
}

onMounted(() => {
  offerId = createOfferId()
  peerConnection = new RTCPeerConnection()
  signalingChannel = new BroadcastChannel('signaling-channel')

  peerConnection.ontrack = (event) => {
    const [remoteStream] = event.streams
    if (!remoteStream || !videoRef.value) {
      return
    }

    videoRef.value.srcObject = remoteStream
    videoRef.value.play().catch(() => {
      // Autoplay should work because the video is muted, but some browsers
      // still require the promise to be ignored.
    })
    isConnected.value = true
  }

  peerConnection.onicecandidate = (event) => {
    if (!event.candidate || !signalingChannel || !offerId) {
      return
    }

    signalingChannel.postMessage(
      JSON.stringify({
        type: 'ice-candidate',
        offerId,
        candidate: event.candidate.toJSON(),
      })
    )
  }

  signalingChannel.onmessage = async (event) => {
    const message = parseSignalMessage(event.data)
    if (!message) {
      return
    }

    if (message.type === 'answer') {
      await handleAnswer(message)
      return
    }

    if (message.type === 'ice-candidate') {
      await handleIceCandidate(message)
    }
  }

  void sendOffer().catch((error) => {
    console.error('Failed to send offer.', error)
  })

  resendTimerId = window.setInterval(() => {
    if (hasReceivedAnswer) {
      return
    }

    void sendOffer().catch((error) => {
      console.error('Failed to resend offer.', error)
    })
  }, 1500)
})

onBeforeUnmount(() => {
  if (videoRef.value) {
    videoRef.value.srcObject = null
  }

  stopSignaling()
})
</script>

<template>
  <main class="page-frame viewer-page">
    <section class="panel viewer-stage">
      <video
        ref="videoRef"
        class="viewer-stage__video"
        autoplay
        playsinline
        muted
      />
      <div v-if="!isConnected" class="viewer-stage__hint">
        <p class="hero__eyebrow">Viewer</p>
        <h1 class="viewer-stage__title">Waiting for the render tab</h1>
        <p class="viewer-stage__lede">
          Open the main app tab, allow camera access, and this view will receive
          the composited stream.
        </p>
      </div>
    </section>
  </main>
</template>

<style scoped>
.viewer-page {
  min-height: 100svh;
  display: flex;
  align-items: stretch;
}

.viewer-stage {
  position: relative;
  width: 100%;
  min-height: calc(100svh - 2rem);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.viewer-stage__video {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #020617;
}

.viewer-stage__hint {
  position: relative;
  z-index: 1;
  max-width: 36rem;
  padding: 2rem;
  text-align: center;
}

.viewer-stage__title {
  margin-top: 0.5rem;
  font-family: 'Space Grotesk', 'IBM Plex Sans', sans-serif;
  font-size: clamp(2rem, 6vw, 4rem);
  letter-spacing: -0.04em;
}

.viewer-stage__lede {
  margin-top: 1rem;
  color: var(--muted);
  line-height: 1.6;
}
</style>
