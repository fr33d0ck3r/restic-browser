/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Match Lumo design system
        lumo: {
          base: "var(--lumo-base-color)",
          tint: "var(--lumo-tint)",
          shade: "var(--lumo-shade)",
          primary: "var(--lumo-primary-color)",
          "primary-text": "var(--lumo-primary-text-color)",
          error: "var(--lumo-error-color)",
          "error-text": "var(--lumo-error-text-color)",
          success: "var(--lumo-success-color)",
          "success-text": "var(--lumo-success-text-color)",
        },
      },
      fontFamily: {
        sans: [
          "Nunito",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
