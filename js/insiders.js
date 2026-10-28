// "Join the Insider" section on the Pulp Fiction page, shown only to guests
// tagged "TPO Insider Access" in the guest sheet.
//
// The list is kept here, apart from js/guests.js, and is built by
// tools/build_insiders.py. Each entry is one of an insider's own logins (their
// name with a number they may use) run through PBKDF2-SHA256, so it goes by
// the person: a family member using an insider's number doesn't get it.
window.Insider = (function () {
  'use strict';

  var LINK = 'https://www.instagram.com/tpo_insider/';
  var SALT = 'tpo-insider';
  var ROUNDS = 100000;
  var LIST = [
    '000a8ffa8a53883ae930ef9d',
    '017682d04a7fab4ce30ecfb6',
    '02f8520278902208b6e72a34',
    '04b98121303998ef75e10312',
    '062858409275cf9ee3d4373c',
    '0680e9de07e8c1ca71ae7c84',
    '074d99b9c7c31d956f08453a',
    '08dcafc56b99fc86fa5f5934',
    '0a30d2b981bd205a53c4d9bb',
    '0b66d05d394f52d942c6e05e',
    '0be2bf852905c0aa5b33a567',
    '0be2c3efd1d2100fbc76309e',
    '117a5bf148a2cc0e2ade6cec',
    '14256ecaebfce4c7208478c3',
    '1769d9344727f8a63385ef1a',
    '1790eaba7f2fb834ed33515a',
    '183337b5853a3d219d733272',
    '1968765df1f9ea985d3393d6',
    '19bad441e4cc6ba7bf5223eb',
    '1c58ede544fa41552c45c525',
    '1c6f1074a9bbdca64b1fb679',
    '1ef09c0e856db651ac73b03f',
    '211a772097c0cb9484d80e5c',
    '262f91d5585ca222682c6a8b',
    '274cdcf0780dd60e11dafec1',
    '2c204eceebd182fda263a376',
    '2c77e9b6fcd32f69ea60bb03',
    '2d878a856297815cdb8f6e9b',
    '2e7ba9fab45140e303c394c2',
    '2ea317c247b0dba31657a7a4',
    '30acbf2defd87d8ba3aff883',
    '3129fff98f2f62e8ab4d0f26',
    '3148024830a36a96cfc28fcb',
    '31ed848dc6254b76ed28feaa',
    '350d6c5b38da73f49124abf0',
    '35856922ef10dbbddf630496',
    '35d898e35359850eea1d1fe1',
    '3684db16a45a6ab58750ec84',
    '36fcd6e2e412544c233566f5',
    '3db23221f8fb10bd62d23736',
    '3f56f2dfc6e0ad2097fd50fb',
    '40fedffc9b0c4e47ae26c5d5',
    '41b9520498dc28825b95af52',
    '42047965722d810a9c0a93a2',
    '4241de8fbaf43f81fa7cce1f',
    '4757c88b4ce3e9e1a897104e',
    '476d2f96f1489db605201e36',
    '4d1d39a2d22f82126c96f91f',
    '507b9a91060e776ebaedd77f',
    '51022c54ceeee900ce194f4c',
    '51e6065a2e771980107cc397',
    '52d3b97479ab38ec07a72b41',
    '55631c08ba5d87ffebecf9da',
    '5703f3e7758efdeaba22a772',
    '59185dc55c227ef73d91d4bd',
    '596dd17c43fdf58a7a5b802d',
    '5fee661ac491ba18c0dd7d19',
    '6208ba440fecdf1a915d0f8a',
    '65889ef5b7644c89604f56ef',
    '6767ffdb266c1d81c224a638',
    '6f0a8d3eeab70eeba355fcd5',
    '707fa9d64f2030d0caa4bdb6',
    '738542436ab00f7f4780be42',
    '74bdaff4fb637d07cd6d8ff9',
    '79b9e2b4b860078ebdd7bd2e',
    '7e081786009f8dbf2b9de1f0',
    '7eeba6b5c5c236c1a34db8e1',
    '7f9c7fee048ff1bb60030fa4',
    '81357483c17a5c294bbc3fdd',
    '829ac77c2691d681748e6ae8',
    '84ce59afec369f35d3b41896',
    '856908192f1059ffaf4743a7',
    '87fe0c641352346c3dd45270',
    '8b32593488fb888bac68429b',
    '8c79a3b5ab7ffb0225c71eb2',
    '8e01d7895bb891e493b55ac8',
    '8fee9641df2d039de267196b',
    '9062e82420210581501addce',
    '918f4d4198889e449fb046e3',
    '93a139f62d4ce339bc4c8448',
    '97efea5d70777e3fbb778521',
    '998e11bb05c2537222f517f5',
    '9c34e68b0622a8d13087c56f',
    '9d125c0a6c4330f5a9803c74',
    '9f00355856ae4ad0697b0ba1',
    '9fa665f7e338073ed7d77065',
    'a0367518fb742981b1ac0cb9',
    'a0b82d0a3b70592aeb46aa35',
    'a0e276c43be108ec800e6c2e',
    'a110e876daf66983394e7adb',
    'a1ca0b779bcf74a274185657',
    'a2380ccab2f9b222b27b9dc1',
    'a267be7ecabc533468f22b39',
    'a6c6b75b57fbd86968177129',
    'a7b61725b71d38f7ba8fcd2a',
    'a8c3ffad3d0ae73868207743',
    'a95a02076580cc0521c935ff',
    'ac76604f12202a49f1889eb1',
    'adc255b90d5cc7a2ac399a39',
    'b2ad92e566b2c66ece579526',
    'b41b082afcd2a2e152de3bb5',
    'b559414b09aaaec04be14c29',
    'b5d4740c937cc80fe510ee9f',
    'b810e81f340b154be0cb5eca',
    'b932663e843a924f669e8ff5',
    'ba5e0730f2adfead0c6d4e60',
    'bc4afc48812f67740b994578',
    'bca2297f357381624ff5716a',
    'bcc51c1530c3fbf09241be06',
    'be52d56bfdf1dea082034540',
    'c0526bcc80a5c4fa59993e91',
    'c0a850c72127b3650e04f777',
    'c319982b0f9a3e7623912ce2',
    'c429a2d7ff0d608470104509',
    'c56078594e7665ea2671b660',
    'c662cccffa19b0a38ede4987',
    'c67ea91a1451924ec2434ba8',
    'c749762e4de31e61a35dd6be',
    'ca827ee78cf0926dc6fb5951',
    'cb511c651f23dd53624e1793',
    'cb818e4859e8d13641d5745a',
    'ccc539f9f11cb65d6134db41',
    'ce88766eac9c6015ccb0805f',
    'cfe1cfcadf60465a2fbf446a',
    'd162be233540a780fa1a3f9d',
    'd201e74e90eec7d70ab28cac',
    'd7229dbad4c9ef13a9e76fd8',
    'd87b17a99855fdba1a9986df',
    'd9b9a56b8a8031db4fc21019',
    'da83bb1b1084b9e53b1b02f6',
    'daae7bfdf39789c79a811482',
    'dc00b29edea1e13931c504d4',
    'dce0bb89bae1ec8e4fbf449d',
    'ddd7faa0f5591672f9ed134e',
    'ddf3c302242a97aa0efd5543',
    'e02a232651cf4ea52747b15a',
    'e171f184b4e40d8d776297b6',
    'e3d46a092ab09c1ea7d04bb9',
    'e574498961ed75c4c3006069',
    'e8b6b5e8202d3130bfbba99c',
    'ea5894a840c04b271470ee57',
    'eb181ac861ab3f1f215c4bff',
    'ebb2e482cc870c74eeef7fc6',
    'ec43dcbaef9d04e7040c7dee',
    'ec9f793247243d5446639bb9',
    'ed109519b58d5fa8847011bc',
    'ed40728afd19d0ebb38fc540',
    'efe83f1ffd67bfdfd1f0f239',
    'f41cca6130d1b00220eca4d3',
    'f5eca146fca4f516d3cc572c',
    'f5f502580b2967da6844e2a8',
    'f79403cf74183a9f43c36177',
    'f998f479ced127415f3c5eea',
    'f9abad96b0778ce5abb365e9',
    'fa92a421db21a523427c9321',
    'faeb2c7f975a87f37311eb16',
    'fb99bda364a84a35b7ed8048',
    'fcba49b16225768a4870490b'
  ];

  function hash(text) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(text), 'PBKDF2', false, ['deriveBits'])
      .then(function (k) {
        return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(SALT), iterations: ROUNDS }, k, 96);
      })
      .then(function (bits) {
        return Array.prototype.map.call(new Uint8Array(bits), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      });
  }

  // login: the "name|number" key the guest logged in with.
  // Resolves to true (and fills el) for insiders, false for everyone else.
  function mount(el, login) {
    el.hidden = true;
    el.innerHTML = '';
    if (!login || !window.crypto || !crypto.subtle) return Promise.resolve(false);
    return hash(login).then(function (h) {
      if (LIST.indexOf(h) < 0) return false;
      el.innerHTML =
        '<p class="eyebrow">Members only</p>' +
        '<h3 class="display pulp__head">Join the Insider</h3>' +
        '<p class="pulp__line">Tap to get insider tea for free.</p>' +
        '<a class="insider__link" href="' + LINK + '" target="_blank" rel="noopener" aria-label="TPO Insider on Instagram">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1" class="dot"/></svg>' +
          '<span>TPO Insider</span>' +
        '</a>';
      el.hidden = false;
      return true;
    }).catch(function () { return false; });
  }

  return { mount: mount };
})();
