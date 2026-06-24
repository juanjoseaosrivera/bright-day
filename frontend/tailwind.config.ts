import type { Config } from 'tailwindcss';

/**
 * Tailwind v4 is primarily configured through CSS (`@theme` / `@theme inline`
 * in src/styles/theme.css). This file declares the class-based dark strategy
 * and the content sources for utility detection. Design tokens live in CSS,
 * not here — keep colors/typography in src/styles/theme.css.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
};

export default config;
