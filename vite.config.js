import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves this repo from /Dwarf-Quest/, not the domain root — this tells
  // Vite to prefix every generated asset path accordingly. Must exactly match the repo
  // name, including capitalization.
  base: "/Dwarf-Quest/",
  plugins: [react()],
});
