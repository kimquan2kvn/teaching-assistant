/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--brand)',
        'brand-hover': 'var(--brand-hover)',
        'brand-soft': 'var(--brand-soft)',
        'sidebar-bg': 'var(--sidebar-bg)',
        'sidebar-fg': 'var(--sidebar-fg)',
        'sidebar-active-fg': 'var(--sidebar-active-fg)',
        border: 'var(--border)',
        fg: 'var(--fg)',
        'fg-muted': 'var(--fg-muted)',
        success: 'var(--success)',
        'success-soft': 'var(--success-soft)',
        danger: 'var(--danger)',
        'danger-soft': 'var(--danger-soft)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        heading: 'var(--font-heading)',
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [],
};
