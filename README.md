# Ishita & Sarvesh · wedding website

A static site (plain HTML/CSS/JS, no build step). Open `index.html` through any
web server, or host it on GitHub Pages / Netlify.

```
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Pages

1. **Home** – the invite cover. Guests type their name and phone number.
2. **Events** – a snap-scrolling list of only the events that guest is invited
   to, with tabs on top and a wardrobe planner popup per event.
3. **Stay** – which resort the guest is staying at, plus the illustrated map.
   Each place on the map opens Google Maps directions.
4. **Tinker** – a quick word game (Shaadi Scramble).

## Updating the guest list

Guests come from the **Daywise List | RSVP** tab. Its blocks (`| HSWC`,
`| HSW`, `| WC`, `| W`) decide which events a guest sees:
H = Haldi, S = Sangeet, W = Wedding, C = Cocktail.

1. In Google Sheets, open that tab → File → Download → CSV.
2. `python3 tools/build_guests.py ~/Downloads/<file>.csv`
3. Commit the new `js/guests.js`. **Don't commit the CSV.**

`js/guests.js` holds only salted hashes of names and phone numbers, so the guest
list isn't readable from the site. A guest gets in if either their phone number
or their name matches. Rebuilding the list signs everyone out once so they pick
up any changes.

## Editing content

- Event names, times, venues, dress codes: `js/data.js`
- Map links and clickable areas on the map: `PLACES` in `js/data.js`
- The game: `js/tinker.js` (replace it with any game that exposes
  `window.Tinker.mount(element)`)
- Images: `assets/`

## Fonts

The invites use Canva fonts (e.g. Frunchy Serif). The site uses Fraunces and
Playfair Display from Google Fonts as close stand-ins. If you have a licence
for the original, add it to `css/style.css` as a `url(...)` in the
`@font-face` at the top and it'll be used automatically.
