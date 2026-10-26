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
 */

var SHEET_NAME = 'Visits';
var EVENT_NAMES = { H: 'Haldi', S: 'Sangeet', W: 'Wedding', C: 'Cocktail' };

function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
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
