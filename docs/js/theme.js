// Same Tailwind theme as thebowtiegoat.com.
tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Open Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f4f6f9', 100: '#e4e9f0', 200: '#c7d1e0', 300: '#a1afc7',
          400: '#7889a8', 500: '#586a8c', 600: '#425071', 700: '#2f3b56',
          800: '#1f2740', 900: '#141a2e', 950: '#0a0e1c',
        },
        blue: {
          50: '#eaf3fa', 100: '#c7e2f2', 200: '#93c7e6', 300: '#5aa8d6',
          400: '#2f8cc2', 500: '#1f72a3', 600: '#175a80', 700: '#124563',
        },
        tan: {
          50: '#faf3e8', 100: '#f0ddb8', 200: '#e0c08a', 300: '#cda366',
          400: '#b98d52', 500: '#9c7440', 600: '#7d5c33', 700: '#5f4526',
        },
        rose: {
          50: '#fbf0f3', 100: '#f0d3dc', 200: '#e0abbb', 300: '#cf8299',
          400: '#c06682', 500: '#a44f69', 600: '#833f54', 700: '#642f40',
        },
        cream: { 50: '#fdfaf0', 100: '#f8eeb8', 200: '#f0e090' },
      },
    },
  },
};
