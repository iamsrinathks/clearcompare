/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        // status colors for diffs
        added: { light: "#e6f4ea", dark: "#12301c", fg: "#1a7f37" },
        removed: { light: "#fbe9e9", dark: "#3a1518", fg: "#cf222e" },
        changed: { light: "#fff4e0", dark: "#3a2a12", fg: "#9a6700" },
      },
    },
  },
  plugins: [],
};
