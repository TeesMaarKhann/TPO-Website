/**
 * Visit log and playlist for the wedding website.
 *
 * Paste this into the "TPO | Website" Google Sheet:
 *   Extensions → Apps Script → replace everything with this file → Save.
 * First time: Deploy → New deployment → type "Web app",
 *   Execute as: Me, Who has access: Anyone → Deploy, and copy the Web app URL
 *   (ends in /exec) into LOG_URL at the top of js/app.js and WEB_APP_URL below.
 * After changing this file: Deploy → Manage deployments → Edit (pencil) →
 *   Version: New version → Deploy. The URL stays the same.
 *
 * Every visit, login and page view on the site adds one row to the "Visits"
 * tab. Phone numbers are never sent.
 *
 * Playlist (Pulp Fiction page): songs guests pick go to the "Spotify" tab and
 * straight into the Spotify playlist below, up to MAX_PICKS per guest.
 * Setup, once:
 *   1. developer.spotify.com/dashboard → your app → Settings. Under Redirect
 *      URIs add WEB_APP_URL exactly, and save.
 *   2. Here: Project Settings (gear) → Script properties → add SPOTIFY_ID
 *      (Client ID) and SPOTIFY_SECRET (Client secret).
 *   3. Back in the editor pick "connectSpotify" in the function menu → Run.
 *      Open the link it prints in the log, logged in to Spotify as the
 *      playlist's owner, and press Agree. The page says "Spotify connected".
 * Without the keys, search uses iTunes and songs only go to the sheet.
 */

var SHEET_NAME = 'Visits';
var PLAYLIST_SHEET = 'Spotify';
var EVENT_NAMES = { H: 'Haldi', S: 'Sangeet', W: 'Wedding', C: 'Cocktail' };

var WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyejSqjUJzisBrEoAyAu_4P2Sl7JIJx3ae3hQ8gSzr9o8UEJWbfDDIpOHJfpz9KFRSo/exec';
var SPOTIFY_PLAYLIST_ID = '0SEF3sXUXnJfSvrZgolKmS';
// Songs each guest can put in the playlist. The site doesn't tell them.
var MAX_PICKS = 5;

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    if (d.action === 'Added a song') addSong(d);
    var invited = String(d.events || '').split('').map(function (c) {
      return EVENT_NAMES[c] || '';
    }).filter(String).join(', ');

    var sheet = SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
    sheet.appendRow([
      new Date(),
      clip(d.name),
      clip(d.action),
      clip(d.page),
      invited,
      clip(d.device),
      clip(d.visit)
    ]);
  } catch (err) {
    // Bad or empty request: ignore it.
  }
  return ContentService.createTextOutput('ok');
}

// Keeps junk out of the sheet if someone posts nonsense to the URL.
function clip(v) {
  return String(v == null ? '' : v).slice(0, 80);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  if (p.code || p.error) return spotifyCallback(p);
  var out = {};
  try {
    if (p.action === 'search') out = { tracks: searchSongs(String(p.q || '').slice(0, 80)) };
  } catch (err) {
    out = { error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Playlist tab ---------- */

function playlistSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(PLAYLIST_SHEET) || ss.insertSheet(PLAYLIST_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(['Added', 'Song', 'Artist', 'Added by', 'Link', 'Cover', 'In Spotify playlist', 'Guest code']);
    sheet.setFrozenRows(1);
  }
  if (!sheet.getRange(1, 8).getValue()) sheet.getRange(1, 8).setValue('Guest code');
  return sheet;
}

function addSong(d) {
  var song = clip(d.song);
  if (!song) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = playlistSheet();
    var artist = clip(d.artist);
    var k = (song + '|' + artist).toLowerCase();
    var who = clip(d.who);
    var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 7).getValues() : [];
    var mine = 0;
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][0] + '|' + rows[i][1]).toLowerCase() === k) return;
      if (who && rows[i][6] === who) mine++;
    }
    // Guest code: a short code the site makes per guest, never their number.
    if (mine >= MAX_PICKS) return;
    var url = link(d.url, 'https://open.spotify.com/');
    var art = link(d.art, 'https://');
    var status = '';
    try {
      var res = addToSpotify(song, artist, url);
      status = res.status;
      if (res.track) {
        url = url || res.track.url;
        art = art || res.track.art;
      }
    } catch (err) {
      status = 'Error: ' + String(err).slice(0, 120);
    }
    sheet.appendRow([new Date(), song, artist, clip(d.name), url, art, status, who]);
  } finally {
    lock.releaseLock();
  }
}

// Only keeps links that start the way they should.
function link(v, start) {
  v = String(v || '').slice(0, 300);
  return v.indexOf(start) === 0 ? v : '';
}

/* ---------- Search ---------- */

function searchSongs(q) {
  if (q.length < 2) return [];
  var cache = CacheService.getScriptCache();
  var ck = 'q:' + q.toLowerCase();
  var hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  var tracks = hasSpotify() ? spotifySearch(q, 6) : itunes(q);
  cache.put(ck, JSON.stringify(tracks), 21600);
  return tracks;
}

function itunes(q) {
  var res = JSON.parse(UrlFetchApp.fetch('https://itunes.apple.com/search?media=music&entity=song&limit=6&country=IN&term=' + encodeURIComponent(q)).getContentText());
  return (res.results || []).map(function (r) {
    return { song: r.trackName, artist: r.artistName, art: String(r.artworkUrl100 || '').replace('100x100', '120x120'), url: '' };
  });
}

/* ---------- Spotify ---------- */

function props() { return PropertiesService.getScriptProperties(); }
function hasSpotify() { return !!(props().getProperty('SPOTIFY_ID') && props().getProperty('SPOTIFY_SECRET')); }
function basicAuth() {
  return 'Basic ' + Utilities.base64Encode(props().getProperty('SPOTIFY_ID') + ':' + props().getProperty('SPOTIFY_SECRET'));
}

// App token, for search.
function appToken() {
  var cache = CacheService.getScriptCache();
  var token = cache.get('spotify-app-token');
  if (token) return token;
  var t = JSON.parse(UrlFetchApp.fetch('https://accounts.spotify.com/api/token', {
    method: 'post', payload: { grant_type: 'client_credentials' }, headers: { Authorization: basicAuth() }
  }).getContentText());
  cache.put('spotify-app-token', t.access_token, Math.max(60, (t.expires_in || 3600) - 120));
  return t.access_token;
}

// The playlist owner's token, for adding songs. Comes from connectSpotify.
function ownerToken() {
  var cache = CacheService.getScriptCache();
  var token = cache.get('spotify-owner-token');
  if (token) return token;
  var refresh = props().getProperty('SPOTIFY_REFRESH');
  if (!refresh) return '';
  var t = JSON.parse(UrlFetchApp.fetch('https://accounts.spotify.com/api/token', {
    method: 'post', payload: { grant_type: 'refresh_token', refresh_token: refresh }, headers: { Authorization: basicAuth() }
  }).getContentText());
  if (t.refresh_token) props().setProperty('SPOTIFY_REFRESH', t.refresh_token);
  cache.put('spotify-owner-token', t.access_token, Math.max(60, (t.expires_in || 3600) - 120));
  return t.access_token;
}

function spotifySearch(q, limit) {
  var res = JSON.parse(UrlFetchApp.fetch('https://api.spotify.com/v1/search?type=track&market=IN&limit=' + limit + '&q=' + encodeURIComponent(q), {
    headers: { Authorization: 'Bearer ' + appToken() }
  }).getContentText());
  return ((res.tracks && res.tracks.items) || []).map(function (t) {
    var imgs = (t.album && t.album.images) || [];
    return {
      song: t.name,
      artist: (t.artists || []).map(function (a) { return a.name; }).join(', '),
      art: imgs.length ? imgs[imgs.length - 1].url : '',
      url: (t.external_urls && t.external_urls.spotify) || ''
    };
  });
}

// Puts one song into the playlist. Songs typed by hand (no Spotify link) get
// the best Spotify match for what was typed.
function addToSpotify(song, artist, url) {
  if (!hasSpotify()) return { status: '' };
  var token = ownerToken();
  if (!token) return { status: 'Not added: run connectSpotify first' };
  var track = null;
  var id = (String(url).match(/open\.spotify\.com\/track\/([A-Za-z0-9]+)/) || [])[1];
  if (!id) {
    track = spotifySearch((song + ' ' + artist).trim(), 1)[0];
    if (!track) return { status: 'Not found on Spotify' };
    id = (track.url.match(/track\/([A-Za-z0-9]+)/) || [])[1];
  }
  var body = JSON.stringify({ uris: ['spotify:track:' + id] });
  var opts = {
    method: 'post', contentType: 'application/json', payload: body,
    headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true
  };
  var base = 'https://api.spotify.com/v1/playlists/' + SPOTIFY_PLAYLIST_ID;
  var r = UrlFetchApp.fetch(base + '/items', opts);
  if (r.getResponseCode() === 404 || r.getResponseCode() === 405) r = UrlFetchApp.fetch(base + '/tracks', opts);
  var ok = r.getResponseCode() < 300;
  return { status: ok ? 'Added' : 'Error ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 120), track: track };
}

// Run this once from the editor, then open the printed link.
function connectSpotify() {
  if (!hasSpotify()) throw new Error('Add SPOTIFY_ID and SPOTIFY_SECRET in Project Settings → Script properties first.');
  var state = Utilities.getUuid();
  props().setProperty('SPOTIFY_STATE', state);
  var url = 'https://accounts.spotify.com/authorize?response_type=code' +
    '&client_id=' + encodeURIComponent(props().getProperty('SPOTIFY_ID')) +
    '&scope=' + encodeURIComponent('playlist-modify-public playlist-modify-private') +
    '&redirect_uri=' + encodeURIComponent(WEB_APP_URL) +
    '&state=' + state;
  Logger.log('Open this link, logged in to Spotify as the playlist owner:\n' + url);
}

function spotifyCallback(p) {
  var msg;
  if (p.error) {
    msg = 'Spotify said: ' + p.error;
  } else if (!p.state || p.state !== props().getProperty('SPOTIFY_STATE')) {
    msg = 'This link has expired. Run connectSpotify again.';
  } else {
    var t = JSON.parse(UrlFetchApp.fetch('https://accounts.spotify.com/api/token', {
      method: 'post',
      payload: { grant_type: 'authorization_code', code: p.code, redirect_uri: WEB_APP_URL },
      headers: { Authorization: basicAuth() }
    }).getContentText());
    props().setProperty('SPOTIFY_REFRESH', t.refresh_token);
    props().deleteProperty('SPOTIFY_STATE');
    CacheService.getScriptCache().remove('spotify-owner-token');
    msg = 'Spotify connected. Songs guests pick will now go into the playlist.';
  }
  return HtmlService.createHtmlOutput('<p style="font:18px sans-serif;margin:40px">' + msg + '</p>');
}
