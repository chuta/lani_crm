import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initAuth } from './lib/auth'
import './style.css'

async function boot() {
  await initAuth()
  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

boot()