/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  corePlugins: { preflight: false },
  important: ".robin-platform-admin",
  theme: { extend: {} },
  plugins: [],
};
