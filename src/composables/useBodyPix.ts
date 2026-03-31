import { onMounted, ref } from 'vue'
import type { BodyPix } from '@tensorflow-models/body-pix'

export function useBodyPix() {
  const bodyPix = ref<BodyPix>()

  onMounted(() => {
    async function loadBodyPix() {
      try {
        const [tfBodyPix, tf] = await Promise.all([
          import('@tensorflow-models/body-pix'),
          import('@tensorflow/tfjs-core'),
        ])

        console.log('Loading TensorFlow.js and BodyPix segmentation model')

        try {
          await import('@tensorflow/tfjs-backend-webgl')
          await tf.setBackend('webgl')
        } catch (webglError) {
          console.warn('WebGL backend unavailable, falling back to CPU.', webglError)
          await import('@tensorflow/tfjs-backend-cpu')
          await tf.setBackend('cpu')
        }

        await tf.ready()
        bodyPix.value = await tfBodyPix.load()
        console.log('TensorFlow.js and BodyPix loaded')
      } catch (error) {
        console.error('Failed to load BodyPix segmentation model', error)
      }
    }

    void loadBodyPix()
  })

  return { bodyPix }
}
