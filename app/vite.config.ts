import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

// The new app is served at https://haddeerwork-design.github.io/ms-group-crm/app/
// while the old CRM stays at the root.
export default defineConfig({
  base: '/ms-group-crm/app/',
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        // Split big libraries into their own cached files so app updates download less.
        manualChunks: { charts: ['recharts'], supabase: ['@supabase/supabase-js'], react: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
})
