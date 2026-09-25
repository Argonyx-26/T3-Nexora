import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: "..", // one .env at the repo root for backend and frontend
  server: { host: "127.0.0.1" },
});
