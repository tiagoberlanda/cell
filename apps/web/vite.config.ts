import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
export default defineConfig({plugins:[react(),tailwind()],server:{port:5173,proxy:{'/api':'http://127.0.0.1:3101'}},build:{outDir:'dist',rollupOptions:{output:{manualChunks:{markdown:['react-markdown','remark-gfm'],ui:['@radix-ui/react-dialog','@radix-ui/react-dropdown-menu']}}}}});
