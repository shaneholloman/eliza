// Configures Vite bundling for the Capacitor app example.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
  },
});
