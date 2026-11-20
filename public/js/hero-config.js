// Tuning for the home-page animated background. Every motion value lives here;
// public/js/animated-background.js reads it and writes it into CSS variables.
//
// Slides: each entry names images produced by `npm run images` (see
// scripts/build-hero-images.mjs). `wide` is shown on landscape screens, `tall` on
// portrait ones (phones, portrait tablets). A plain string uses the same image for both.
// Phones show the first `phone.slides` entries, tablets the first `tablet.slides`, etc.,
// so put the strongest images first. The first slide is the one that is preloaded.

export const HERO_BACKGROUND = {
  images: [
    { wide: 'sunset-silhouette', tall: 'sunset-ascent' },
    { wide: 'jet-over-clouds', tall: 'above-clouds' },
    'dawn-glide',
    { wide: 'above-clouds', tall: 'head-on' },
    { wide: 'wing-dusk', tall: 'head-on' },
  ],

  interval: 7000, //          ms each slide stays up (6000–8000)
  fadeDuration: 1500, //      ms crossfade between slides (1200–1800)
  firstFadeDuration: 700, //  ms fade-in of the very first image
  preloadLead: 2500, //       ms before a change that the next image starts downloading
  kenBurns: true,
  kenBurnsDuration: 15000, // ms for one zoom pass (12000–18000)
  parallax: true,

  // Breakpoints: phone < 640px (or a touch screen under 480px tall, i.e. a phone in
  // landscape), tablet 640–1023px, desktop >= 1024px.
  //   slides    – how many of `images` rotate
  //   scale     – Ken Burns end scale (1 = none)
  //   parallax  – max background shift in px (0 = off)
  //   parallaxMode – 'pointer' (mouse), 'scroll', or 'auto' (mouse if the device has one, else scroll)
  breakpoints: {
    desktop: { slides: 5, scale: 1.12, parallax: 30, parallaxMode: 'pointer' },
    tablet: { slides: 4, scale: 1.09, parallax: 15, parallaxMode: 'auto' },
    phone: { slides: 3, scale: 1.06, parallax: 14, parallaxMode: 'scroll' },
  },
};
