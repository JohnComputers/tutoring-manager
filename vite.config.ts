import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({plugins:[react()],base:process.env.VITE_BASE_PATH || '/tutoring-manager/',resolve:{alias:{'@':fileURLToPath(new URL('./src',import.meta.url))}},build:{rollupOptions:{output:{manualChunks:{firebase:['firebase/app','firebase/auth','firebase/firestore'],calendar:['@fullcalendar/react','@fullcalendar/timegrid','@fullcalendar/daygrid','@fullcalendar/interaction','@fullcalendar/list','@fullcalendar/luxon3']}}}}});
