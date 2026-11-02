/* Settings for this copy of the pages. This file is public on GitHub Pages: no codes, names or keys go here.
   Guides, codes, tour times and promo messages live in the Google Sheet. */
Object.assign(CONFIG, {
  // The web app address from Apps Script: Deploy > Manage deployments > Web app URL (ends in /exec).
  apiUrl: 'https://script.google.com/macros/s/AKfycbxSMnehoUfYOgAqAj5-tpUWPWLtETeZlv1D2UIWLdHYhc65cMlr2e7BpkJTIgbWan_w/exec',
  environmentLabel: 'Test: sample data only',   // shown on the phones and admin page; set to '' when live

  // TV
  tvHeading: 'Guided tours',
  tvTheme: 'light',           // 'light' or 'dark'. Light hides reflections better in a sunny spot
  tvBright: false,            // true for sun or glare on the screen: heavier type, bigger timer
  approachMin: 15,            // the TV enlarges the timer and shrinks the media this long before a tour
  slideSec: 8,                // each media slide shows this long
  mediaSlides: ['[SLIDE_1]', '[SLIDE_2]', '[SLIDE_3]', '[SLIDE_4]'],   // placeholders until media is approved
  tickerSec: 8,               // each ticker message shows this long
  tickerMessages: ['Please stay on the paths and follow your guide'],   // used only until the Promo tab loads
  tvRefreshSec: 20,           // how often the TV asks for updates

  // Phones
  phoneRefreshSec: 15,        // how often a phone syncs when nothing is happening
  autoSignOutSec: 120,        // the start point phone is shared, so it signs out when left idle
});
