// Everything a guest reads on the site. Edit here to change times, venues,
// dress codes or map links.

// `dest` is what Google Maps is asked for directions to. A name works; for an
// exact pin use "latitude,longitude" (e.g. '18.5123,73.5123').
window.PLACES = {
  P: {
    name: 'Palmwoods Retreat',
    short: 'Palmwoods',
    area: 'Mulshi',
    dest: 'Palmwoods Retreat, Mulshi, Maharashtra'
  },
  G: {
    name: 'Golden Fields Resort',
    short: 'Golden Fields',
    area: 'Mulshi',
    dest: 'Golden Fields Resort, Khubavali, Mulshi, Maharashtra'
  },
  A: {
    name: 'Amora Resort',
    short: 'Amora',
    area: 'Mulshi',
    dest: 'Amora A Boutique Resort, Kolvan, Mulshi, Maharashtra'
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
    // Guests not at Haldi or Sangeet (the W and WC blocks) skip the Vidhi, so
    // they get the "10:30am onwards" invite instead.
    dayGuests: {
      times: ['10:30am onwards', 'Muhurat : 12:19pm'],
      card: 'assets/mobile/wedding-day.webp',
      cardAlt: 'Illustrated invite: Phera Pheri. 10th December, Thursday. 10:30am onwards, Muhurat 12:19pm. Golden Fields Resort, Mulshi.',
      deskText: 'wedding-text-day'
    },
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
    wardrobe: {
      image: 'assets/wardrobe/cocktail.jpg',
      name: 'Toast & Tonic',
      shade: 'All white',
      line: 'Ladies keep it white. Gentlemen have a little wiggle room for beige and brown.',
      swatches: ['#eeeeec', '#ebdec6', '#edc49a', '#d6b094', '#c2a287', '#c38152']
    }
  }
];

// The itinerary, from the tent cards. Each guest sees only the rows meant for
// them:
//   need: 'H' 'S' 'W' 'C'  - invited to that event
//   need: 'R'              - staying at a resort
//   for: 'HSWC WC'         - ...and in one of these blocks. Resort stays
//                            differ by block: HSWC 9th-11th, HSW 9th-10th,
//                            WC 10th-11th.
// place: 'P' 'G' 'A', or 'R' for the guest's own resort.
window.ITINERARY = [
  {
    day: 'Wednesday', date: '9 December',
    items: [
      { time: '11:00 AM', what: 'Haldi',        icon: 'haldi',     place: 'P', need: 'H' },
      { time: '02:00 PM', what: 'Lunch',        icon: 'plate',     place: 'P', need: 'H' },
      { time: '02:30 PM', what: 'Check-in',     icon: 'check-in',  place: 'R', need: 'R', for: 'HSWC HSW' },
      { time: '04:30 PM', what: 'Hi-Tea',       icon: 'tea',       place: 'R', need: 'R', for: 'HSWC HSW' },
      { time: '07:00 PM', what: 'Sangeet',      icon: 'disco',     place: 'P', need: 'S' },
      { time: '08:00 PM', what: 'Dinner',       icon: 'dinner',    place: 'P', need: 'S' }
    ]
  },
  {
    day: 'Thursday', date: '10 December',
    items: [
      { time: '07:00 AM', what: 'Breakfast',    icon: 'plate',     place: 'P', need: 'R', for: 'HSWC HSW' },
      { time: '07:30 AM', what: 'Vidhi',        icon: 'vidhi',     place: 'G', need: 'W', for: 'HSWC HSW' },
      { time: '10:30 AM', what: 'Baraat',       icon: 'horse',     place: 'G', need: 'W' },
      { time: '11:00 AM', what: 'Check-out',    icon: 'check-out', place: 'R', need: 'R', for: 'HSW' },
      { time: '12:19 PM', what: 'Mangalashtak', icon: 'mangalashtak', place: 'G', need: 'W' },
      { time: '12:30 PM', what: 'Lunch',        icon: 'dinner',    place: 'G', need: 'W' },
      { time: '02:30 PM', what: 'Check-in',     icon: 'check-in',  place: 'R', need: 'R', for: 'WC' },
      { time: '04:00 PM', what: 'Hi-Tea',       icon: 'tea',       place: 'R', need: 'R', for: 'HSWC WC' },
      { time: '05:00 PM', what: 'Cocktail',     icon: 'cocktail',  place: 'P', need: 'C' },
      { time: '08:00 PM', what: 'Dinner',       icon: 'dinner',    place: 'P', need: 'C' }
    ]
  },
  {
    day: 'Friday', date: '11 December',
    items: [
      { time: '07:00 AM', what: 'Breakfast',    icon: 'plate',     place: 'R', need: 'R', for: 'HSWC WC' },
      { time: '11:00 AM', what: 'Check-out',    icon: 'check-out', place: 'R', need: 'R', for: 'HSWC WC' }
    ]
  }
];

