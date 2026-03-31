import { createApp } from 'vue'
import App from './App.vue'
import Viewer from './Viewer.vue'
import './styles.css'

const isViewerPath = /\/viewer\/?$/.test(window.location.pathname)

createApp(isViewerPath ? Viewer : App).mount('#app')
