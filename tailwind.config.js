/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // テキストカラー（CSS変数参照でテーマ対応）
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-disabled': 'var(--color-text-disabled)',

        // アクセントカラー
        'accent': 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',

        // 背景色
        'bg-main': 'var(--color-bg-main)',
        'bg-card': 'var(--color-bg-card)',
        'bg-menu': 'var(--color-bg-menu)',

        // ボーダー
        'border-light': 'var(--color-border)',

        // ホバー
        'hover-bg': 'var(--color-hover)',
      },
    },
  },
  plugins: [],
};
