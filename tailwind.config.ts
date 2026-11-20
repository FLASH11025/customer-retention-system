import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        signal: {
          bg: "var(--signal-bg)",
          surface: "var(--signal-surface)",
          "surface-alt": "var(--signal-surface-alt)",
          ink: "var(--signal-ink)",
          muted: "var(--signal-muted)",
          hairline: "var(--signal-hairline)",
          "hairline-subtle": "var(--signal-hairline-subtle)",
          lime: "#C6F432",
          "lime-muted": "#A8D422",
          safe: "#3F8F5F",
          "safe-bg": "var(--signal-safe-bg)",
          watch: "#E0A526",
          "watch-bg": "var(--signal-watch-bg)",
          danger: "#E8452C",
          "danger-bg": "var(--signal-danger-bg)",
        },
      },
      fontFamily: {
        display: ["var(--font-instrument)", "Instrument Serif", "Georgia", "serif"],
        sans: ["var(--font-ui)", "Geist", "Inter Tight", "-apple-system", "BlinkMacSystemFont", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "Courier New", "monospace"],
      },
      borderRadius: {
        "24": "24px",
        "20": "20px",
        "16": "16px",
      },
      lineHeight: {
        tightest: "0.95",
      },
      boxShadow: {
        hairline: "0 0 0 1px var(--signal-hairline)",
        float: "0 20px 40px -15px rgba(0, 0, 0, 0.08)",
        "float-dark": "0 20px 40px -15px rgba(0, 0, 0, 0.4)",
      },
      animation: {
        "pulse-subtle": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "fade-in": "fadeIn 250ms ease-out forwards",
        "slide-up": "slideUp 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
