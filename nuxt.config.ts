// nuxt.config.ts
import Aura from '@primevue/themes/aura';

export default defineNuxtConfig({
  compatibilityDate: '2024-04-03',
  devtools: { enabled: true },
  
  // 添加 PrimeVue 模块
  modules: [
    '@primevue/nuxt-module'
  ],
  
  // PrimeVue 主题设置
  primevue: {
    options: {
        theme: {
            preset: Aura,
            options: {
                darkModeSelector: '.my-app-dark', // 手动控制深色模式
            }
        }
    }
  },
  
  // 加载图标集
  css: [
    'primeicons/primeicons.css'
  ]
})