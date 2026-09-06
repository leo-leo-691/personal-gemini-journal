/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: {
          DEFAULT: "var(--surface)",
          raised: "var(--surface-raised)",
          hover: "var(--surface-hover)",
        },
        hairline: {
          DEFAULT: "var(--hairline)",
          strong: "var(--hairline-strong)",
        },
        ink: {
          DEFAULT: "var(--text-primary)",
          2: "var(--text-secondary)",
          3: "var(--text-tertiary)",
          off: "var(--text-disabled)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          strong: "var(--accent-strong)",
          on: "var(--accent-on-strong)",
          quiet: "var(--accent-quiet)",
        },
        warm: {
          DEFAULT: "var(--warm)",
          quiet: "var(--warm-quiet)",
        },
        positive: "var(--positive)",
        critical: {
          DEFAULT: "var(--critical)",
          strong: "var(--critical-strong)",
          quiet: "var(--critical-quiet)",
        },
        focusring: "var(--focus)",
        // Back-compat aliases so any stray reference keeps compiling.
        background: "var(--canvas)",
        foreground: "var(--text-primary)",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        display: ["2.125rem", { lineHeight: "1.15", letterSpacing: "-0.02em" }],
        title: ["1.625rem", { lineHeight: "1.25", letterSpacing: "-0.015em" }],
        heading: ["1.125rem", { lineHeight: "1.35", letterSpacing: "-0.01em" }],
        journal: ["1.1875rem", { lineHeight: "1.65" }],
        "journal-sm": ["1.0625rem", { lineHeight: "1.7" }],
        body: ["0.9375rem", { lineHeight: "1.7" }],
        ui: ["0.875rem", { lineHeight: "1.45", letterSpacing: "-0.005em" }],
        "ui-sm": ["0.8125rem", { lineHeight: "1.45" }],
        label: ["0.6875rem", { lineHeight: "1.2", letterSpacing: "0.12em" }],
        meta: ["0.71875rem", { lineHeight: "1.4" }],
      },
      borderRadius: {
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
      },
      boxShadow: {
        raised: "var(--shadow-raised)",
        overlay: "var(--shadow-overlay)",
      },
      maxWidth: {
        measure: "68ch",
        rail: "44ch",
        prose34: "34ch",
      },
      spacing: {
        gutter: "4.5rem",
      },
      transitionTimingFunction: {
        rail: "cubic-bezier(.22,1,.36,1)",
        exit: "cubic-bezier(.4,0,1,1)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
        slow: "220ms",
      },
      animation: {
        rise: "qi-rise 180ms ease-out both",
        "modal-in": "qi-modal-in 180ms ease-out both",
        fade: "qi-fade 140ms ease-out both",
        dot: "qi-dot 900ms ease-in-out infinite",
        shimmer: "qi-shimmer 1400ms ease-in-out infinite",
        sweep: "qi-sweep 1200ms linear infinite",
      },
    },
  },
  plugins: [],
};
