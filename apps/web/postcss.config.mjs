/**
 * PostCSS pipeline for @veyra/web.
 * tailwindcss must come first so @tailwind directives in app/globals.css are
 * compiled; autoprefixer handles vendor prefixes for the hand-written CSS.
 */
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
