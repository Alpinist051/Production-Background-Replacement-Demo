import * as tfBodyPix from '@tensorflow-models/body-pix'
import * as tf from '@tensorflow/tfjs'
import { onMounted, ref } from 'vue'

export function useBodyPix() {
  const bodyPix = ref<tfBodyPix.BodyPix>()

  onMounted(() => {
    async function loadBodyPix() {
      try {
        console.log('Loading TensorFlow.js and BodyPix segmentation model')
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
