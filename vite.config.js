import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Local dev: proxy /api to the Express server (npm run server).
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
