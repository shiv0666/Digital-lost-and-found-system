import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()], server: { proxy: { '/auth': 'http://localhost:8000', '/items': 'http://localhost:8000', '/claims': 'http://localhost:8000', '/admin': 'http://localhost:8000', '/uploads': 'http://localhost:8000' } } })
