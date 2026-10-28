/**
 * Visit log for the wedding website.
 *
 * Paste this into the "TPO | Website" Google Sheet:
 *   Extensions → Apps Script → replace everything with this file → Save.
 * Then Deploy → New deployment → type "Web app",
 *   Execute as: Me, Who has access: Anyone → Deploy.
 * Copy the Web app URL (ends in /exec) into LOG_URL at the top of js/app.js.
 *
 * Every visit, login and page view on the site adds one row to the "Visits" tab.
 * Phone numbers are never sent.
 *
 * It also runs the Playlist page: songs guests add go to the "Playlist" tab
 * (made on its own the first time), and song search asks Spotify. To turn
 * Spotify on, make an app at developer.spotify.com/dashboard, then in Apps
 * Script open Project Settings → Script properties and add SPOTIFY_ID and
 * SPOTIFY_SECRET. Without them, search uses iTunes instead.
 * After changing this file: Deploy → Manage deployments → Edit → Version:
 * New version → Deploy (the URL stays the same).
 */

var SHEET_NAME = 'Visits';
var PLAYLIST_SHEET = 'Playlist';
var EVENT_NAMES = { H: 'Haldi', S: 'Sangeet', W: 'Wedding', C: 'Cocktail' };

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

/* ---------- Playlist ---------- */

function doGet(e) {
  var p = (e && e.parameter) || {};
  var out = {};
  try {
    if (p.action === 'songs') out = { songs: listSongs() };
    else if (p.action === 'search') out = { tracks: searchSongs(String(p.q || '').slice(0, 80)) };
  } catch (err) {
    out = { error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function playlistSheet() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(PLAYLIST_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(PLAYLIST_SHEET);
    sheet.appendRow(['Added', 'Song', 'Artist', 'Added by', 'Link', 'Cover']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function addSong(d) {
  var song = clip(d.song);
  if (!song) return;
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var sheet = playlistSheet();
    var artist = clip(d.artist);
    var k = (song + '|' + artist).toLowerCase();
    var rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 2, sheet.getLastRow() - 1, 2).getValues() : [];
    for (var i = 0; i < rows.length; i++) {
      if ((rows[i][0] + '|' + rows[i][1]).toLowerCase() === k) return;
    }
    sheet.appendRow([new Date(), song, artist, clip(d.name), link(d.url, 'https://open.spotify.com/'), link(d.art, 'https://')]);
  } finally {
    lock.releaseLock();
  }
}

function listSongs() {
  var sheet = playlistSheet();
  var n = sheet.getLastRow() - 1;
  if (n < 1) return [];
  return sheet.getRange(2, 2, n, 5).getValues().reverse().slice(0, 400).map(function (r) {
    return { song: String(r[0]), artist: String(r[1]), by: String(r[2]), url: String(r[3]), art: String(r[4]) };
  });
}

// Only keeps links that start the way they should.
function link(v, start) {
  v = String(v || '').slice(0, 300);
  return v.indexOf(start) === 0 ? v : '';
}

function searchSongs(q) {
  if (q.length < 2) return [];
  var cache = CacheService.getScriptCache();
  var ck = 'q:' + q.toLowerCase();
  var hit = cache.get(ck);
  if (hit) return JSON.parse(hit);
  var props = PropertiesService.getScriptProperties();
  var tracks = props.getProperty('SPOTIFY_ID') ? spotify(q, props) : itunes(q);
  cache.put(ck, JSON.stringify(tracks), 21600);
  return tracks;
}

function spotify(q, props) {
  var cache = CacheService.getScriptCache();
  var token = cache.get('spotify-token');
  if (!token) {
    var auth = Utilities.base64Encode(props.getProperty('SPOTIFY_ID') + ':' + props.getProperty('SPOTIFY_SECRET'));
    var t = JSON.parse(UrlFetchApp.fetch('https://accounts.spotify.com/api/token', {
      method: 'post', payload: { grant_type: 'client_credentials' }, headers: { Authorization: 'Basic ' + auth }
    }).getContentText());
    token = t.access_token;
    cache.put('spotify-token', token, Math.max(60, (t.expires_in || 3600) - 120));
  }
  var res = JSON.parse(UrlFetchApp.fetch('https://api.spotify.com/v1/search?type=track&limit=6&market=IN&q=' + encodeURIComponent(q), {
    headers: { Authorization: 'Bearer ' + token }
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

function itunes(q) {
  var res = JSON.parse(UrlFetchApp.fetch('https://itunes.apple.com/search?media=music&entity=song&limit=6&country=IN&term=' + encodeURIComponent(q)).getContentText());
  return (res.results || []).map(function (r) {
    return { song: r.trackName, artist: r.artistName, art: String(r.artworkUrl100 || '').replace('100x100', '120x120'), url: '' };
  });
}
