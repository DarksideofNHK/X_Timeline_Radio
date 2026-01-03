/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // テキストカラー
        'text-primary': '#34322D',
        'text-secondary': '#5E5E5B',
        'text-disabled': '#B9B9B7',

        // アクセントカラー
        'accent': '#0081F2',
        'accent-hover': '#0070D6',

        // 背景色
        'bg-main': '#F8F8F7',
        'bg-card': '#FFFFFF',
        'bg-menu': '#F0F0EF',

        // ボーダー
        'border-light': '#E5E5E3',
      },
    },
  },
  plugins: [],
};
