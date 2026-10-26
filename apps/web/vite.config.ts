import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import {readFileSync} from 'node:fs';
// The root package.json is the single source of the app version.
const {version}=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
export default defineConfig({define:{__APP_VERSION__:JSON.stringify(version)},plugins:[react(),tailwind()],server:{port:5173,proxy:{'/api':'http://127.0.0.1:3101'}},build:{outDir:'dist',rollupOptions:{output:{manualChunks:{markdown:['react-markdown','remark-gfm'],ui:['@radix-ui/react-dialog','@radix-ui/react-dropdown-menu']}}}}});
