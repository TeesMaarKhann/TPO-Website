# Ishita & Sarvesh · wedding website

A static site (plain HTML/CSS/JS, no build step). Open `index.html` through any
web server, or host it on GitHub Pages / Netlify.

```
python3 -m http.server 8000   # then visit http://localhost:8000
```

## Pages

1. **Home** – the invite cover. Guests type their name and phone number.
2. **Events** – opens on a welcome letter addressed to the guest by name
   ("Dear Sarvesh,"), then a snap-scrolling list of only the events that guest is invited
   to, with tabs on top and a wardrobe planner popup per event.
3. **Itinerary** – the tent-card schedule, one tab per day, cut down to that
   guest: only their events, and check-in, hi-tea, breakfast and check-out at
   their own resort. Wedding + Cocktail guests see just those two; guests
   invited to the wedding alone don't see this page.
4. **Stay** – which resort the guest is staying at, plus the illustrated map,
   then **Travel plans**: the guest picks flight (with landing day and time),
   car or cab. Answers land in the **Visits** tab as a "Travel plan" row (see
   Visit log below). Guests invited to the wedding alone don't see this page.
5. **Pulp Fiction** – open to every guest, in three parts split by a line:
   - **Join the Insider**, a link to the @tpo_insider Instagram, shown only
     to guests tagged "TPO Insider Access". The list is kept in
     `js/insiders.js`; it goes by the person (their name with a number they
     may use). After changing tags, run
     `python3 tools/build_insiders.py <file>.csv` with the same CSV.
   - **The Ultimate Playlist.** Typing shows matching songs from Spotify;
     tapping one, or "Use what I typed" (matched to the closest Spotify
     song), adds it to the sheet's **Spotify** tab and straight into the
     Spotify playlist, and everyone sees the list with who picked it.
     "Check the playlist" opens the playlist (`SPOTIFY_PLAYLIST` at the top
     of `js/app.js`). Setup is in the comment at the top of
     `tools/visit-log.gs`: Spotify keys in Script properties, then run
     `connectSpotify` once. The Spotify tab's **In Spotify playlist** column says
     whether each song made it in.
   - **Need a hand?** Riya Shah and Priti Tahilani, each with a call and a
     WhatsApp button. Put their numbers in `CONTACTS` at the top of
     `js/app.js`; until then the buttons just open the dialer and WhatsApp.

The **Menu** button on the top right opens all of these. The map and the
event pages open Google Maps directions.

## Updating the guest list

Guests come from the **Daywise List | RSVP** tab. Its blocks (`| HSWC`,
`| HSW`, `| WC`, `| W`) decide which events a guest sees:
H = Haldi, S = Sangeet, W = Wedding, C = Cocktail.

1. In Google Sheets, open that tab → File → Download → CSV.
2. `python3 tools/build_guests.py ~/Downloads/<file>.csv`
3. `python3 tools/build_insiders.py ~/Downloads/<file>.csv`
4. Commit the new `js/guests.js` and `js/insiders.js`. **Don't commit the CSV.**

`js/guests.js` holds no names or phone numbers. Each guest is stored as a key
made from their name **and** phone number together, scrambled with a
deliberately slow method (PBKDF2-SHA256, 600,000 rounds). To log in a guest
types both, and the browser rebuilds the same key and looks it up.

- Guests can type their full name (any word order) or just their first name.
  The sheet's word order doesn't matter ("Dekhne Dilip" works as "Dilip").
- Typing only a surname asks for first name and surname. Any first name with
  the right surname then works, so "Kushal Shah Wife" can log in as her own name.
- Where the POC column spells someone better ("Dilip Dhekne" for "Dekhne
  Dilip"), that spelling works too, and so does the POC's number.
- Guests with no number of their own can use any number in their family. A
  family is a row with a POC plus the rows under it with no POC (the sheet
  merges the POC cell down over them), and any household whose POC names
  someone in it, even in another block (Smita Deshpande in HSW names Sanjay
  Deshpande in W, so Antara Shah can use either number).
- Each guest still sees only their own events, whichever family number they use.
- A guest with no number who types their name with the wrong number is told
  whose number to use. If the sheet has no number for them, or their household
  isn't clear (no shared surname), they're asked to contact Ishita or Sarvesh.
- The script lists anyone who can't log in because no number is known, and
  anyone whose household isn't clear. Fix the sheet and rebuild.
- Each device remembers the name and number a guest typed, so they only log
  in once. After a rebuild the site quietly checks the saved details against
  the new list; guests are only asked again if they're no longer on it.
  Open `#signout` to forget them on that device.

## Editing content

- Event names, times, venues, dress codes: `js/data.js`
- Where directions point: `dest` in `PLACES` in `js/data.js` (a name, or
  "latitude,longitude" for an exact pin)
- Itinerary rows: `ITINERARY` in `js/data.js` (who sees each row is explained
  there)
- Travel plans question and landing days: `MODES` and `LAND_DAYS` in `js/app.js`
- Itinerary icons (`assets/itinerary`) are cut from the tent card by
  `tools/cut_itinerary.py`
- Images: `assets/`
- The welcome letter: the words are written by `welcomeSection` in
  `js/app.js`. Phones show the drawing with the letter below it; computers
  show the drawing on the left and the letter on the right. Tapping the
  drawing makes it pop. The pictures (`assets/letter-*.webp`) are cut from the
  illustrated card `assets/invite/letter.webp`, with its paper, border and
  words removed, by `python3 tools/cut_letter.py`.
- The small motifs floating behind each event (`assets/motifs`) are cut from
  the invites by `tools/cut_motifs.py`. Which set each event uses is
  `particles` in `js/data.js`.
- The wedding has two invites. Guests at Haldi or Sangeet see `wedding`
  (Vidhi 7:30am); everyone else (the `| WC` and `| W` blocks) sees
  `wedding-day` (10:30am onwards). The swap is `dayGuests` in `js/data.js`.
- Phones show the invites from `assets/mobile`: the same images as
  `assets/invite` with the paper made see-through, so every page sits on one
  cream background (`--paper` in `css/style.css`). After changing an invite,
  rebuild them with `python3 tools/cut_mobile.py assets/invite assets/mobile`.
- The countdown on the last page counts to the guest's first event (`on` in
  `js/data.js`).

## Fonts

The invites use Canva fonts (e.g. Frunchy Serif). The site uses Fraunces and
Playfair Display from Google Fonts as close stand-ins. If you have a licence
for the original, add it to `css/style.css` as a `url(...)` in the
`@font-face` at the top and it'll be used automatically.

## Visit log

The site can add a row to the **Visits** tab of the "TPO | Website" Google
Sheet each time a guest logs in, comes back, or opens a page, event or
wardrobe. Each row has the time, the name they typed, what they did, the
events they're invited to, phone or computer, and a visit ID that groups one
sitting together. Phone numbers are never sent. Failed logins are logged too,
so you can spot guests who are stuck.

Setup (once):

1. In the sheet: Extensions → Apps Script. Replace everything with
   `tools/visit-log.gs` and save.
2. Deploy → New deployment → Web app. Execute as **Me**, access **Anyone**.
   Approve the permission prompt.
3. Copy the Web app URL (ends in `/exec`) into `LOG_URL` at the top of
   `js/app.js`, then commit.

The sheet shows one tab, **Guests**: one row per person with whether they
logged in, how many times they visited, when, which events they looked at,
how often they opened Stay and the game, outfits checked, directions opened
and their travel plan. It's built from the hidden **Visits** tab with a
formula and fills in on its own. Don't delete Visits: the site writes there.

Names are matched ignoring capitals, so "sarvesh" and "Sarvesh" are one
guest. If you change the wording the site logs (for example "Travel plan"),
update the formula too.

Leave `LOG_URL` empty to turn logging off.
