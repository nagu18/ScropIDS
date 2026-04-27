import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#06090f",
        foreground: "#e8edf7",
        card: "#0d131e",
        border: "#1f2c42",
        muted: "#94a3b8",
        danger: "#ef4444",
        warning: "#f59e0b",
        safe: "#22c55e",
        primary: "#2563eb",
        accent: "#22d3ee",
      },
      boxShadow: {
        soc: "0 12px 30px rgba(0, 0, 0, 0.35)",
      },
      keyframes: {
        pulseSlow: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        pulseSlow: "pulseSlow 2.2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
