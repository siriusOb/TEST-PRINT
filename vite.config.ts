
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  plugins: [react()],

  // GitHub 저장소 이름이 TEST-PRINT인 경우
  base: command === 'build' ? '/TEST-PRINT/' : '/',

  server: {
    proxy: {
      '^(/preview/[^/]+)?/api/': {
        target: 'http://127.0.0.1:8000',
        rewrite: (p) =>
          p.replace(/^\/preview\/[^/]+/, ''),
      },
    },
  },
}))
