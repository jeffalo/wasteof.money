module.exports = {
  future: {
    // removeDeprecatedGapUtilities: true,
    // purgeLayersByDefault: true,
  },
  plugins: [
    require('@tailwindcss/typography'),
    // ...
  ],
  purge: {
    enabled: true,
    mode: 'all',
    "content": ['./pages/*.ejs', './partials/*.ejs']
  },

  theme: {
    extend: {},
    inset: {
      '0': 0,
      '10': '10px'
    }
  },
  variants: {}
}
