import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0d1117",
          soft: "#161b22",
          softer: "#1c2128",
        },
        border: {
          DEFAULT: "#30363d",
        },
        text: {
          DEFAULT: "#e6edf3",
          muted: "#7d8590",
        },
        accent: "#58a6ff",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
