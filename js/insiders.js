// "Join the Insider" section on the Pulp Fiction page, shown only to guests tagged
// "TPO Insider Access" in the guest sheet.
//
// The list is hardwired: each entry is an insider's phone number (last 10
// digits) run through PBKDF2-SHA256 with the salt and rounds below, so no
// numbers are stored here. To add someone, print their hash with:
//   python3 -c "import hashlib,sys;print(hashlib.pbkdf2_hmac('sha256',sys.argv[1].encode(),b'tpo-insider',100000,dklen=12).hex())" 9876543210
window.Insider = (function () {
  'use strict';

  var LINK = 'https://www.instagram.com/tpo_insider/';
  var SALT = 'tpo-insider';
  var ROUNDS = 100000;
  var LIST = [
    '06d1d26e79f00427785614ab',
    '0773193d4f69fcb92ec80700',
    '083762ab8fabaa4b67d51c6c',
    '098bb7ff9f6fe0832d54767a',
    '17c1a9b24646b11fa419682f',
    '196965720e79fa8fa19e8897',
    '1d5aa52e89af2a1fd634487b',
    '249f458f76f0aa7ba0e8f9f4',
    '295b6b117c94997f835d80c0',
    '2af07a6ddbeec0794ca6690c',
    '2b9c9687bf7764e307745261',
    '2f80b0ed2a2deba6a8ea836f',
    '30597b28ca7130b1352530bc',
    '3344c41395466ff495c76f45',
    '34e39eb7bd36f4ece383a9d3',
    '369796ca95cd9db21d51c699',
    '442daaee5ea39958360dd52a',
    '5c90527625a19c9243667d6f',
    '5f97c42dc2ca0cb31b9ea351',
    '601a7f7383994f64338fb8a7',
    '6aa1325dc07bde55105d4a36',
    '72e71398d8b5c9efaf19f619',
    '7555124608a759037fc141b0',
    '82396b2f229c2ef4c892932d',
    '84ec14b350a5c4be6603c3da',
    '88a1fa028ebbab1f3589b057',
    '88c8583c11c1de5593c7b3c6',
    '8904cd01944d101aca77657a',
    '9085db59e7fae8255f872bad',
    '92f7624f459b790df23aa93a',
    '9526b66da42b13e18f02c113',
    '96195d3eb075e783a0af3bb2',
    '9a38c1912cfa8f7116410a48',
    '9ac82778a32aaa2cc276aac5',
    '9d2827a9386a8433be95db52',
    'a6dc53e1cb3f5a9955b8a1d1',
    'a735d2b9bdd90a71ff982eee',
    'ab1c16e4ce109d3bd786a47a',
    'ab291d61e2206598e34e2202',
    'be46cd08757f71c08b69248c',
    'c2cd49a2d2a7916996948a9a',
    'c35d0f1df2da4c4c938f46cd',
    'c36c08e56492c95901850f4e',
    'c3d6fffad513d472ebf02384',
    'c45e92fc01af9a1a9734c4b9',
    'c8a77a09c39aa064f0eaf073',
    'd1564aa95672ae98a834cd90',
    'd57949b48fc63dd108cae1e0',
    'd678d9d9227051615ce87e67',
    'd73b5b85a677e2eed09752db',
    'da152faec14f16ea91f240a9',
    'da8dd01be88c8892c5df71b8',
    'e466cf869047a1c33522c83e',
    'eb4273079657ed97c80267df',
    'ebbb41d581199bb98a6fa1c1',
    'efb95ecefaa76a3ea7b821d4',
    'f2351bd926dfb819f2a82931',
    'f5c54daefca089ff2cb84e3c',
    'f99132e7a7091a33fc9edb92',
    'fa00a487b0009d7e0c3ddbb1',
    'fc7029011e9cd6310a5410e9',
    'fe5bea1c1229eea30cb663ee'
  ];

  function hash(phone) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(phone), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ROUNDS }, k, 96);
      })
      .then(function (bits) {
        return Array.prototype.map.call(new Uint8Array(bits), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
  }

  // phone: the guest's number, already cut to its last 10 digits.
  // Resolves to true (and fills el) for insiders, false for everyone else.
  function mount(el, phone) {
    el.hidden = true;
    el.innerHTML = '';
    if (!phone || !window.crypto || !crypto.subtle) return Promise.resolve(false);
    return hash(phone).then(function (h) {
      if (LIST.indexOf(h) < 0) return false;
      el.innerHTML =
        '<p class="eyebrow">Members only</p>' +
        '<h3 class="display insider__title">Join the Insider</h3>' +
        '<a class="insider__link" href="' + LINK + '" target="_blank" rel="noopener" aria-label="TPO Insider on Instagram">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" class="dot"/></svg>' +
          '<span>TPO Insider</span>' +
        '</a>' +
        '<p class="insider__line">Tap to get insider tea for free.</p>';
      el.hidden = false;
      return true;
    }).catch(function () { return false; });
  }

  return { mount: mount };
})();
