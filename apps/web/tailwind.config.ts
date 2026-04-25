import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        enterprise: {
          primary: "#006666",
          primaryMuted: "#005151",
          secondary: "#F1F2F5",
          success: "#00A63D",
          warning: "#FE9900",
          danger: "#FF2157",
          info: "#0EA5E9",
          surface: "#E7E5E4",
          surface50: "#F1F2F5",
          surface100: "#E7E5E4",
          text: "#1E2938",
          panel: "#F1F2F5",
          border: "#D4D4D8",
          muted: "#64748B",
        },
      },
      fontFamily: {
        sans: ["Segoe UI", "Tahoma", "Arial", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Segoe UI", "Tahoma", "Arial", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      boxShadow: {
        enterprise: "10px 10px 24px rgba(174,171,170,0.72), -10px -10px 24px rgba(255,255,255,0.92)",
        panel: "8px 8px 18px rgba(174,171,170,0.58), -8px -8px 18px rgba(255,255,255,0.9)",
        insetSoft: "inset 5px 5px 12px rgba(174,171,170,0.58), inset -5px -5px 12px rgba(255,255,255,0.86)",
      },
      borderRadius: {
        enterprise: "1.125rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
