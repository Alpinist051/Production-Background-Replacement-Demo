<script setup lang="ts">
import { type BackgroundConfig, backgroundImageUrls } from '../helpers/backgroundHelper'

const props = defineProps<{
  config: BackgroundConfig
}>()

const emit = defineEmits<{
  change: [BackgroundConfig]
}>()

function formatBackgroundLabel(imageUrl: string) {
  const fileName = imageUrl.split('/').pop()?.replace(/\.[^.]+$/, '') ?? 'background'
  return fileName.replace(/-/g, ' ')
}

function selectBackground(config: BackgroundConfig) {
  emit('change', config)
}
</script>

<template>
  <section class="panel">
    <div class="panel__body">
      <h2 class="panel__title">Background</h2>
      <p class="panel__subtitle">
        Pick no background, a blur, or one of the bundled scene images.
      </p>
      <div class="choice-grid">
        <button
          type="button"
          class="choice-button choice-button--text"
          :class="{ 'choice-button--selected': config.type === 'none' }"
          @click="selectBackground({ type: 'none' })"
        >
          None
        </button>
        <button
          type="button"
          class="choice-button choice-button--text"
          :class="{ 'choice-button--selected': config.type === 'blur' }"
          @click="selectBackground({ type: 'blur' })"
        >
          Blur
        </button>
        <button
          v-for="imageUrl in backgroundImageUrls"
          :key="imageUrl"
          type="button"
          class="choice-button choice-button--thumb"
          :class="{
            'choice-button--selected':
              config.type === 'image' && config.url === imageUrl,
          }"
          :style="{ backgroundImage: `url(${imageUrl})` }"
          :aria-label="`Select ${formatBackgroundLabel(imageUrl)} background`"
          :title="formatBackgroundLabel(imageUrl)"
          @click="selectBackground({ type: 'image', url: imageUrl })"
        >
          <span class="sr-only">{{ formatBackgroundLabel(imageUrl) }}</span>
          <span class="choice-button__overlay">
            {{ formatBackgroundLabel(imageUrl) }}
          </span>
        </button>
      </div>
    </div>
  </section>
</template>
