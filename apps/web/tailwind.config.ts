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
          primary: "#072C2C",
          primaryMuted: "#123E3E",
          secondary: "#FF5F03",
          success: "#16A34A",
          warning: "#D97706",
          danger: "#DC2626",
          surface: "#EDEADE",
          surface50: "#FAF8F1",
          surface100: "#F5F1E7",
          text: "#111827",
          panel: "#FFFFFF",
          border: "#D5D0C3",
          muted: "#6B7280",
        },
      },
      fontFamily: {
        sans: ["Ubuntu", "Inter", "Segoe UI", "Tahoma", "Arial", "sans-serif"],
        display: ["Oswald", "Ubuntu", "Inter", "Segoe UI", "sans-serif"],
        mono: ["Ubuntu Mono", "ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      boxShadow: {
        enterprise: "0 18px 60px rgba(7, 44, 44, 0.10)",
        panel: "0 10px 30px rgba(17, 24, 39, 0.08)",
      },
      borderRadius: {
        enterprise: "0.875rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
