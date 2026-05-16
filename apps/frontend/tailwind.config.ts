import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        midnight: "#0A0E1A",
        panel: "#101728",
        stroke: "rgba(255,255,255,0.08)",
        accent: "#00D4FF",
        gold: "#FFD700",
        success: "#00C896",
        danger: "#FF5E7A"
      },
      boxShadow: {
        glass: "0 20px 80px rgba(0, 0, 0, 0.35)"
      },
      backgroundImage: {
        aura:
          "radial-gradient(circle at top left, rgba(0,212,255,0.18), transparent 35%), radial-gradient(circle at bottom right, rgba(255,215,0,0.14), transparent 22%)"
      },
      fontFamily: {
        sans: ["\"Plus Jakarta Sans\"", "Inter", "sans-serif"]
      }
    }
  },
  plugins: []
} satisfies Config;

