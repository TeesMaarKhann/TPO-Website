// Everything a guest reads on the site. Edit here to change times, venues,
// dress codes or map links.

window.PLACES = {
  P: {
    name: 'Palmwoods Retreat',
    short: 'Palmwoods',
    area: 'Mulshi',
    url: 'https://maps.app.goo.gl/ki4RKuw3ReaCj8aw6'
  },
  G: {
    name: 'Golden Fields Resort',
    short: 'Golden Fields',
    area: 'Mulshi',
    url: 'https://maps.app.goo.gl/wQJWP2f2YCCatVbEA'
  },
  A: {
    name: 'Amora Resort',
    short: 'Amora',
    area: 'Mulshi',
    url: 'https://maps.app.goo.gl/9heNv7naedXkmVqS8'
  }
};

// Order here is the scroll order. `code` matches the letters in the guest
// list (H, S, W, C). `on` is the date the countdown on the last page counts
// down to (the guest's first event). `particles` is what floats up behind it.
window.EVENTS = [
  {
    code: 'H',
    id: 'haldi',
    tab: 'Haldi',
    title: 'Yello!',
    kicker: 'Haldi and Welcome Lunch to kick things off',
    date: '9th December',
    on: '2026-12-09',
    day: 'Wednesday',
    times: ['11 am Onwards'],
    place: 'P',
    card: 'assets/mobile/haldi.webp',
    cardAlt: 'Illustrated invite: Yello! Haldi and Welcome Lunch, 9th December, 11 am onwards, Palmwoods Retreat, Mulshi.',
    accent: '#c9a227',
    particles: 'marigold',
    wardrobe: {
      image: 'assets/wardrobe/haldi.jpg',
      name: 'Haldi',
      shade: 'Warm shades',
      line: 'There may be haldi, there may be water! Come dressed for both.',
      swatches: ['#fed590', '#fcbf63', '#fa813e', '#fbbd9f', '#fcb1b6', '#cc6e4b']
    }
  },
  {
    code: 'S',
    id: 'sangeet',
    tab: 'Sangeet',
    title: 'Kar-de-Disco',
    kicker: 'Time to get on the dance floor!',
    date: '9th December',
    on: '2026-12-09',
    day: 'Wednesday',
    times: ['7pm Onwards'],
    place: 'P',
    card: 'assets/mobile/sangeet.webp',
    cardAlt: 'Illustrated invite: Kar-de-Disco. Time to get on the dance floor! 9th December, 7pm onwards, Palmwoods Retreat, Mulshi.',
    accent: '#1f3f8f',
    particles: 'sparkle',
    wardrobe: {
      image: 'assets/wardrobe/sangeet.jpg',
      name: 'Kar-de-Disco',
      shade: 'Dark shades',
      line: 'The brights can sit this one out.',
      swatches: ['#701328', '#3e527c', '#4c8482', '#a1667b', '#c07079', '#616260']
    }
  },
  {
    code: 'W',
    id: 'wedding',
    tab: 'Wedding',
    title: 'Phera Pheri',
    kicker: '2021 – 2026 – ∞',
    date: '10th December',
    on: '2026-12-10',
    day: 'Thursday',
    times: ['Vidhi : 7:30am', 'Muhurat : 12:19pm'],
    place: 'G',
    card: 'assets/mobile/wedding.webp',
    cardAlt: 'Illustrated invite: Phera Pheri. 10th December, Thursday. Vidhi 7:30am, Muhurat 12:19pm. Golden Fields Resort, Mulshi.',
    accent: '#c96f6a',
    particles: 'flower',
    wardrobe: {
      image: 'assets/wardrobe/wedding.jpg',
      name: 'Phera-Pheri',
      shade: 'Any shade of your choice',
      line: 'No suggestions here, pick your favorite.',
      swatches: ['#f8c8bf', '#f07e8d', '#fdd3b6', '#98986f', '#ba9cce', '#eb9d24']
    }
  },
  {
    code: 'C',
    id: 'cocktail',
    tab: 'Cocktail',
    title: 'Toast & Tonic',
    kicker: 'Raise a glass to the newlyweds',
    date: '10th December',
    on: '2026-12-10',
    day: 'Thursday',
    times: ['5:30pm onwards'],
    place: 'P',
    card: 'assets/mobile/cocktail.webp',
    cardAlt: 'Illustrated invite: Toast & Tonic. 10th December, 5:30pm onwards, Palmwoods Retreat, Mulshi.',
    accent: '#c47f6e',
    particles: 'bubble',
    // No wardrobe page yet. Add one like the others when it's ready.
    wardrobe: null
  }
];
