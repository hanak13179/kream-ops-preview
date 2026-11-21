/*
 * Kream inventory - shared logic.
 * The same code runs in two places:
 *   1. Google Apps Script (apps-script/Code.gs), reading and writing the Google Sheet
 *   2. The website's demo mode, using sample data in the browser
 * Edit this file, then run build.sh to refresh apps-script/Code.gs.
 */

var KREAM_TABS = {
  Settings: ['key', 'value', 'note'],
  Stores: ['store_id', 'name'],
  Items: ['item_id', 'name_ko', 'name_en', 'count_unit', 'pack_name', 'pack_size', 'active', 'sort'],
  Counts: ['submitted_at', 'count_date', 'store_id', 'item_id', 'counted', 'staff'],
  Movements: ['count_date', 'store_id', 'item_id', 'previous_date', 'previous_count', 'received', 'used', 'counted'],
  FactoryOrders: ['order_id', 'created_at', 'count_date', 'delivery_date', 'store_id', 'item_id', 'target',
    'counted', 'order_pieces', 'packs', 'pack_name', 'status', 'delivered_pieces', 'updated_at', 'suggested_packs']
};

// Columns stored as numbers in the sheet (everything else is stored as plain text).
var KREAM_NUMBER_COLUMNS = ['pack_size', 'sort', 'counted', 'previous_count',
  'received', 'used', 'target', 'order_pieces', 'packs', 'delivered_pieces', 'suggested_packs'];

// Target stock lives in one grid tab the owner edits directly:
// rows = items, columns = "<store_id> <store name> 평일" and "<store_id> <store name> 주말".
var KREAM_TARGETS_TAB = '기본 수량';
var KREAM_TARGET_FIXED = ['item_id', '제품', '단위'];
// Read-only overview tab, rebuilt after every count / order update.
var KREAM_SUMMARY_TAB = '매장별 발주';
// Colours per store, in Stores-tab order: [title, header, body]. Index -1 = factory / neutral.
var KREAM_STORE_COLORS = [
  ['#eeb4ae', '#f7d9d5', '#fdf2f0'],  // strawberry rose
  ['#b3cd9f', '#dae8cf', '#f3f8ef'],  // matcha
  ['#a9c1e3', '#d6e2f3', '#f2f6fc'],  // soda blue
  ['#ccb6e2', '#e6dbf2', '#f8f4fc'],  // lavender
  ['#ecd28f', '#f6e8c3', '#fdf9ec']   // butter
];
var KREAM_NEUTRAL_COLORS = ['#3e4b33', '#e4e2d6', '#faf8f2'];
function kreamStoreColors(i) { return i < 0 ? KREAM_NEUTRAL_COLORS : KREAM_STORE_COLORS[i % KREAM_STORE_COLORS.length]; }

var KREAM_SEED = {
  Settings: [
    {key: 'store_pin_1', value: '1001', note: 'Store 1 staff: opens straight into store 1'},
    {key: 'store_pin_3', value: '3003', note: 'Richmond staff: opens straight into store 3'},
    {key: 'store_pin_4', value: '4004', note: 'Finch staff: opens straight into store 4'},
    {key: 'factory_pin', value: '2222', note: 'Factory: see and update orders'},
    {key: 'manager_pin', value: '9999', note: 'Owner/manager: everything incl. target stock'},
    {key: 'staff_pin', value: '', note: 'Optional: one PIN for staff who work at several stores (they pick the store)'},
    {key: 'weekend_days', value: '5,6,0', note: 'Delivery days that use the weekend target (0=Sun ... 6=Sat)'},
    {key: 'delivery_offset_days', value: '1', note: 'Tonight\'s count is delivered this many days later'},
    {key: 'day_cutoff_hour', value: '4', note: 'Counts before this hour (Toronto time) belong to the previous night'}
  ],
  Stores: [
    {store_id: '1', name: 'Store 1'},
    {store_id: '3', name: 'Richmond'},
    {store_id: '4', name: 'Finch'}
  ],
  Items: [
    {item_id: 'bread', name_ko: '식빵', name_en: 'Loaf', count_unit: '개', pack_name: '개', pack_size: 1, active: 'Y', sort: 1},
    {item_id: 'cheesecake', name_ko: '치즈케이크', name_en: 'Cheesecake', count_unit: '조각', pack_name: '조각', pack_size: 1, active: 'Y', sort: 2},
    {item_id: 'cookie', name_ko: '쿠키', name_en: 'Cookies', count_unit: '개', pack_name: '개', pack_size: 1, active: 'Y', sort: 3}
  ],
  Targets: [
    {store_id: '1', item_id: 'bread', weekday_target: 12, weekend_target: 18},
    {store_id: '1', item_id: 'cheesecake', weekday_target: 20, weekend_target: 30},
    {store_id: '1', item_id: 'cookie', weekday_target: 64, weekend_target: 96},
    {store_id: '3', item_id: 'bread', weekday_target: 14, weekend_target: 20},
    {store_id: '3', item_id: 'cheesecake', weekday_target: 20, weekend_target: 30},
    {store_id: '3', item_id: 'cookie', weekday_target: 64, weekend_target: 128},
    {store_id: '4', item_id: 'bread', weekday_target: 10, weekend_target: 16},
    {store_id: '4', item_id: 'cheesecake', weekday_target: 10, weekend_target: 20},
    {store_id: '4', item_id: 'cookie', weekday_target: 32, weekend_target: 64}
  ]
};

function kreamError(code) { var e = new Error(code); e.code = code; return e; }
function kStr(v) { return v == null ? '' : String(v).trim(); }
function kNum(v) { if (v === '' || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
function kSame(a, b) { return kStr(a) === kStr(b); }
function kAddDays(date, n) {
  var t = new Date(date + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10);
}
function kDow(date) { return new Date(date + 'T12:00:00Z').getUTCDay(); }
function kIsDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(kStr(s)); }

function kreamSettings(db) {
  var map = {};
  db.all('Settings').forEach(function (r) { map[kStr(r.key)] = kStr(r.value); });
  var weekend = (map.weekend_days || '5,6,0').split(/[^0-9]+/).filter(function (x) { return x !== ''; })
    .map(Number).filter(function (n) { return n >= 0 && n <= 6; });
  var storePins = {};
  Object.keys(map).forEach(function (k) {
    var m = /^store_pin_(.+)$/.exec(k);
    if (m && map[k]) storePins[map[k]] = m[1];
  });
  return {
    pins: {staff: map.staff_pin, factory: map.factory_pin, manager: map.manager_pin},
    store_pins: storePins,
    weekend_days: weekend,
    delivery_offset_days: kNum(map.delivery_offset_days) == null ? 1 : kNum(map.delivery_offset_days),
    day_cutoff_hour: kNum(map.day_cutoff_hour) == null ? 4 : kNum(map.day_cutoff_hour)
  };
}

// Returns {role, store_id}. A store PIN is a staff login locked to that store.
function kreamRole(settings, pin) {
  pin = kStr(pin);
  if (!pin) return null;
  if (pin === settings.pins.manager) return {role: 'manager', store_id: ''};
  if (pin === settings.pins.factory) return {role: 'factory', store_id: ''};
  if (settings.store_pins[pin]) return {role: 'staff', store_id: settings.store_pins[pin]};
  if (pin === settings.pins.staff) return {role: 'staff', store_id: ''};
  return null;
}

function kreamActiveItems(db) {
  return db.all('Items').filter(function (i) {
    return kStr(i.item_id) && ['n', 'no', 'false', '0', 'x'].indexOf(kStr(i.active).toLowerCase()) < 0;
  }).map(function (i) {
    return {item_id: kStr(i.item_id), name_ko: kStr(i.name_ko), name_en: kStr(i.name_en) || kStr(i.name_ko),
      // Kream counts and orders everything in single pieces, so packs are always 1 piece.
      count_unit: kStr(i.count_unit) || '개', pack_name: kStr(i.count_unit) || '개',
      pack_size: 1, sort: kNum(i.sort) || 999};
  }).sort(function (a, b) { return a.sort - b.sort; });
}

function kreamStores(db) {
  return db.all('Stores').filter(function (s) { return kStr(s.store_id); })
    .map(function (s) { return {store_id: kStr(s.store_id), name: kStr(s.name) || ('Store ' + kStr(s.store_id))}; });
}

function kreamCountDate(settings, ctx) {
  return ctx.hour < settings.day_cutoff_hour ? kAddDays(ctx.date, -1) : ctx.date;
}

function kreamTargetHeader(store, kind) { return store.store_id + ' ' + store.name + ' ' + (kind === 'weekend' ? '주말' : '평일'); }
function kreamTargetHeaders(stores) {
  var h = KREAM_TARGET_FIXED.slice();
  stores.forEach(function (s) { h.push(kreamTargetHeader(s, 'weekday'), kreamTargetHeader(s, 'weekend')); });
  return h;
}
// Finds the column for a store in a grid row: the first word is the store id, the last word 평일 or 주말.
function kreamTargetKey(row, storeId, kind) {
  var suffix = kind === 'weekend' ? '주말' : '평일';
  var keys = Object.keys(row);
  for (var i = 0; i < keys.length; i++) {
    var parts = kStr(keys[i]).split(/\s+/);
    if (parts.length >= 2 && parts[0] === kStr(storeId) && parts[parts.length - 1] === suffix) return keys[i];
  }
  return null;
}
function kreamTargetRow(db, itemId) {
  return db.all(KREAM_TARGETS_TAB).filter(function (r) { return kSame(r.item_id, itemId); })[0] || null;
}
function kreamTargetValue(row, storeId, kind) {
  if (!row) return null;
  var k = kreamTargetKey(row, storeId, kind);
  return k ? kNum(row[k]) : null;
}
// Builds grid rows from a simple list (used for sample data and for upgrading the old Targets tab).
function kreamTargetGridFromList(stores, items, list) {
  return items.map(function (i) {
    var row = {item_id: i.item_id, '제품': i.name_ko, '단위': i.count_unit};
    stores.forEach(function (s) {
      var t = list.filter(function (x) { return kSame(x.store_id, s.store_id) && kSame(x.item_id, i.item_id); })[0] || {};
      row[kreamTargetHeader(s, 'weekday')] = t.weekday_target == null ? '' : t.weekday_target;
      row[kreamTargetHeader(s, 'weekend')] = t.weekend_target == null ? '' : t.weekend_target;
    });
    return row;
  });
}

function kreamTargetFor(db, settings, storeId, itemId, deliveryDate) {
  var row = kreamTargetRow(db, itemId);
  var weekend = settings.weekend_days.indexOf(kDow(deliveryDate)) >= 0;
  var v = kreamTargetValue(row, storeId, weekend ? 'weekend' : 'weekday');
  if (v == null && weekend) v = kreamTargetValue(row, storeId, 'weekday');
  return v;
}

// Order = target for the delivery day minus tonight's count, rounded UP to whole packs.
function kreamOrderFor(target, counted, packSize) {
  if (target == null) return {order_pieces: 0, packs: 0};
  var need = Math.max(0, target - counted);
  var packs = Math.ceil(need / packSize);
  return {order_pieces: packs * packSize, packs: packs};
}

function kreamHandle(db, req, ctx) {
  req = req || {};
  var settings = kreamSettings(db);
  var action = req.action || 'config';
  var countDate = kreamCountDate(settings, ctx);

  if (action === 'config') {
    return {stores: kreamStores(db), items: kreamActiveItems(db), count_date: countDate, today: ctx.date,
      delivery_date: kAddDays(countDate, settings.delivery_offset_days),
      weekend_days: settings.weekend_days};
  }

  var who = kreamRole(settings, req.pin);
  if (!who) throw kreamError('BAD_PIN');
  var role = who.role;
  var allowed = {
    login: ['staff', 'factory', 'manager'],
    storeStatus: ['staff', 'manager'],
    submitCount: ['staff', 'manager'],
    getTargets: ['manager'],
    saveTargets: ['manager'],
    getOrders: ['factory', 'manager'],
    setOrderStatus: ['factory', 'manager'],
    getHistory: ['manager']
  }[action];
  if (!allowed) throw kreamError('UNKNOWN_ACTION');
  if (allowed.indexOf(role) < 0) throw kreamError('NOT_ALLOWED');

  var stores = kreamStores(db);
  var items = kreamActiveItems(db);
  function needStore(id) {
    if (who.store_id && !kSame(who.store_id, id)) throw kreamError('NOT_YOUR_STORE');
    if (!stores.some(function (s) { return kSame(s.store_id, id); })) throw kreamError('BAD_STORE');
    return kStr(id);
  }

  if (action === 'login') return {role: role, store_id: who.store_id};

  if (action === 'storeStatus') {
    var sid = needStore(req.store_id);
    var counts = db.all('Counts').filter(function (c) { return kSame(c.store_id, sid); });
    var dDate = kAddDays(countDate, settings.delivery_offset_days);
    var result = {count_date: countDate, delivery_date: dDate, submitted: false, tonight: {}, last: {},
      targets: {}, tonight_packs: {}, locked: false};
    items.forEach(function (i) { result.targets[i.item_id] = kreamTargetFor(db, settings, sid, i.item_id, dDate); });
    db.all('FactoryOrders').forEach(function (o) {
      if (kSame(o.store_id, sid) && kSame(o.count_date, countDate)) {
        result.tonight_packs[kStr(o.item_id)] = kNum(o.packs);
        if (kStr(o.status) !== 'Pending') result.locked = true;
      }
    });
    counts.forEach(function (c) {
      var id = kStr(c.item_id), d = kStr(c.count_date);
      if (d === countDate) { result.submitted = true; result.tonight[id] = kNum(c.counted); result.staff = kStr(c.staff); }
      else if (d < countDate && (!result.last[id] || result.last[id].date <= d)) result.last[id] = {date: d, counted: kNum(c.counted)};
    });
    return result;
  }

  if (action === 'submitCount') {
    var storeId = needStore(req.store_id);
    var staff = kStr(req.staff).slice(0, 40);
    if (!staff) throw kreamError('STAFF_REQUIRED');
    var input = req.counts || {};
    var chosen = req.packs || {};
    var values = {};
    items.forEach(function (i) {
      var n = kNum(input[i.item_id]);
      if (n == null || n < 0 || n > 100000 || Math.floor(n) !== n) throw kreamError('COUNT_MISSING:' + i.item_id);
      values[i.item_id] = n;
    });
    var delivery = kAddDays(countDate, settings.delivery_offset_days);
    var thisNight = function (r) { return kSame(r.store_id, storeId) && kSame(r.count_date, countDate); };
    var locked = db.all('FactoryOrders').some(function (o) { return thisNight(o) && kStr(o.status) !== 'Pending'; });
    if (locked) throw kreamError('ORDER_ALREADY_SENT');
    // A second submission tonight replaces the first one.
    db.removeWhere('Counts', thisNight);
    db.removeWhere('Movements', thisNight);
    db.removeWhere('FactoryOrders', thisNight);

    var allCounts = db.all('Counts').filter(function (c) { return kSame(c.store_id, storeId) && kStr(c.count_date) < countDate; });
    var orders = db.all('FactoryOrders').filter(function (o) { return kSame(o.store_id, storeId) && kStr(o.status) === 'Delivered'; });
    var countRows = [], moveRows = [], orderRows = [];
    items.forEach(function (i) {
      var counted = values[i.item_id];
      var prev = null;
      allCounts.forEach(function (c) {
        if (kSame(c.item_id, i.item_id) && (!prev || kStr(c.count_date) >= prev.date)) prev = {date: kStr(c.count_date), counted: kNum(c.counted)};
      });
      var received = 0;
      orders.forEach(function (o) {
        var d = kStr(o.delivery_date);
        if (kSame(o.item_id, i.item_id) && d <= countDate && (!prev || d > prev.date)) received += kNum(o.delivered_pieces) || 0;
      });
      countRows.push({submitted_at: ctx.nowIso, count_date: countDate, store_id: storeId, item_id: i.item_id, counted: counted, staff: staff});
      moveRows.push({count_date: countDate, store_id: storeId, item_id: i.item_id,
        previous_date: prev ? prev.date : '', previous_count: prev ? prev.counted : '',
        received: received, used: prev ? prev.counted + received - counted : '', counted: counted});
      var target = kreamTargetFor(db, settings, storeId, i.item_id, delivery);
      var o = kreamOrderFor(target, counted, i.pack_size);
      // Staff may raise or lower the suggested order before saving.
      var packs = o.packs, pick = kNum(chosen[i.item_id]);
      if (pick != null) {
        if (pick < 0 || pick > 1000 || Math.floor(pick) !== pick) throw kreamError('BAD_QUANTITY');
        packs = pick;
      }
      if (packs > 0) {
        orderRows.push({order_id: countDate + '-' + storeId + '-' + i.item_id, created_at: ctx.nowIso, count_date: countDate,
          delivery_date: delivery, store_id: storeId, item_id: i.item_id, target: target == null ? '' : target, counted: counted,
          order_pieces: packs * i.pack_size, packs: packs, pack_name: i.pack_name, status: 'Pending',
          delivered_pieces: '', updated_at: ctx.nowIso, suggested_packs: o.packs});
      }
    });
    db.append('Counts', countRows);
    db.append('Movements', moveRows);
    db.append('FactoryOrders', orderRows);
    return {count_date: countDate, delivery_date: delivery, orders: orderRows, movements: moveRows};
  }

  if (action === 'getTargets') {
    var list = [];
    items.forEach(function (i) {
      var row = kreamTargetRow(db, i.item_id);
      stores.forEach(function (s) {
        list.push({store_id: s.store_id, item_id: i.item_id,
          weekday_target: kreamTargetValue(row, s.store_id, 'weekday'), weekend_target: kreamTargetValue(row, s.store_id, 'weekend')});
      });
    });
    return {stores: stores, items: items, weekend_days: settings.weekend_days, targets: list};
  }

  if (action === 'saveTargets') {
    var headers = kreamTargetHeaders(stores);
    (req.targets || []).forEach(function (t) {
      var sid = needStore(t.store_id);
      var item = items.filter(function (i) { return kSame(i.item_id, t.item_id); })[0];
      if (!item) throw kreamError('BAD_ITEM');
      var wd = kNum(t.weekday_target), we = kNum(t.weekend_target);
      [wd, we].forEach(function (n) { if (n != null && (n < 0 || n > 100000 || Math.floor(n) !== n)) throw kreamError('BAD_TARGET'); });
      var row = kreamTargetRow(db, item.item_id);
      if (!row) {
        var fresh = {item_id: item.item_id, '제품': item.name_ko, '단위': item.count_unit};
        headers.forEach(function (h) { if (!(h in fresh)) fresh[h] = ''; });
        db.append(KREAM_TARGETS_TAB, [fresh]);
        row = kreamTargetRow(db, item.item_id);
      }
      var kWd = kreamTargetKey(row, sid, 'weekday'), kWe = kreamTargetKey(row, sid, 'weekend');
      if (!kWd || !kWe) throw kreamError('MISSING_STORE_COLUMN');
      var patch = {};
      patch[kWd] = wd == null ? '' : wd;
      patch[kWe] = we == null ? '' : we;
      db.update(KREAM_TARGETS_TAB, row, patch);
    });
    if (req.weekend_days) {
      var days = req.weekend_days.map(Number).filter(function (n) { return n >= 0 && n <= 6; });
      var srow = db.all('Settings').filter(function (r) { return kStr(r.key) === 'weekend_days'; })[0];
      var sval = {key: 'weekend_days', value: days.join(','), note: srow ? srow.note : ''};
      if (srow) db.update('Settings', srow, sval); else db.append('Settings', [sval]);
    }
    return {saved: true};
  }

  if (action === 'getOrders') {
    var from = kIsDate(req.from) ? req.from : kAddDays(countDate, 0);
    return {stores: stores, items: items, from: from,
      orders: db.all('FactoryOrders').filter(function (o) { return kStr(o.delivery_date) >= from; }).map(function (o) {
        var r = {}; KREAM_TABS.FactoryOrders.forEach(function (k) { r[k] = KREAM_NUMBER_COLUMNS.indexOf(k) >= 0 ? kNum(o[k]) : kStr(o[k]); }); return r;
      })};
  }

  if (action === 'setOrderStatus') {
    var status = kStr(req.status);
    if (['Pending', 'Sent', 'Delivered'].indexOf(status) < 0) throw kreamError('BAD_STATUS');
    // One order (order_id) or several at once (order_ids, e.g. "dispatch everything for this store").
    var ids = Array.isArray(req.order_ids) ? req.order_ids.map(kStr) : [kStr(req.order_id)];
    var all = db.all('FactoryOrders');
    var done = [];
    ids.forEach(function (id) {
      var order = all.filter(function (o) { return kSame(o.order_id, id); })[0];
      if (!order) throw kreamError('ORDER_NOT_FOUND');
      var delivered = '';
      if (status === 'Delivered') {
        delivered = ids.length === 1 ? kNum(req.delivered_pieces) : null;
        if (delivered == null) delivered = kNum(order.order_pieces);
        if (delivered < 0 || delivered > 100000 || Math.floor(delivered) !== delivered) throw kreamError('BAD_QUANTITY');
      }
      var next = {};
      KREAM_TABS.FactoryOrders.forEach(function (k) { next[k] = order[k]; });
      next.status = status; next.delivered_pieces = delivered; next.updated_at = ctx.nowIso;
      db.update('FactoryOrders', order, next);
      done.push({order_id: kStr(order.order_id), status: status, delivered_pieces: delivered});
    });
    return done.length === 1 ? done[0] : {updated: done};
  }

  if (action === 'getHistory') {
    var days = Math.min(90, Math.max(1, kNum(req.days) || 14));
    var since = kAddDays(countDate, -days);
    return {stores: stores, items: items,
      movements: db.all('Movements').filter(function (m) {
        return kStr(m.count_date) > since && (!req.store_id || kSame(m.store_id, req.store_id));
      }).map(function (m) {
        return {count_date: kStr(m.count_date), store_id: kStr(m.store_id), item_id: kStr(m.item_id),
          previous_count: kNum(m.previous_count), received: kNum(m.received), used: kNum(m.used), counted: kNum(m.counted)};
      }).sort(function (a, b) { return a.count_date < b.count_date ? 1 : a.count_date > b.count_date ? -1 : 0; })};
  }
}

// Rows for the read-only "매장별 발주" tab. Returns {rows, titles, headers} (titles/headers = row indexes to style).
function kreamSummary(db, ctx) {
  var settings = kreamSettings(db);
  var stores = kreamStores(db), items = kreamActiveItems(db);
  var counts = db.all('Counts'), moves = db.all('Movements'), orders = db.all('FactoryOrders');
  var date = '';
  counts.forEach(function (c) { if (kStr(c.count_date) > date) date = kStr(c.count_date); });
  if (!date) date = kreamCountDate(settings, ctx);
  var delivery = kAddDays(date, settings.delivery_offset_days);
  var rows = [], titles = [], headers = [], blocks = [];
  function title(t) { titles.push(rows.length); rows.push(t); }
  function block(start, width, storeIndex) { blocks.push({start: start, end: rows.length - 1, width: width, store: storeIndex}); }
  function header(h) { headers.push(rows.length); rows.push(h); }
  function itemLabel(i) { return i.name_ko + (i.count_unit ? ' (' + i.count_unit + ')' : ''); }
  function orderText(i, o) {
    if (!o) return '-';
    return i.pack_size > 1 ? o.packs + ' ' + i.pack_name + ' (' + o.order_pieces + i.count_unit + ')' : o.order_pieces + ' ' + i.count_unit;
  }
  function find(list, sid, iid, d, field) {
    return list.filter(function (r) { return kSame(r.store_id, sid) && kSame(r.item_id, iid) && kSame(r[field || 'count_date'], d); })[0];
  }

  title(['매장별 발주 · 카운트 ' + date + ' → 납품 ' + delivery, '', '', '', '', '', '마지막 업데이트 ' + ctx.nowIso.slice(0, 16).replace('T', ' ') + ' UTC']);
  rows.push([]);

  // Factory totals for that delivery day.
  var fStart = rows.length;
  title(['공장 총 발주 (전 매장 합계)']);
  header(['제품', '총 발주'].concat(stores.map(function (s) { return s.name; })));
  items.forEach(function (i) {
    var per = stores.map(function (s) {
      var o = orders.filter(function (r) { return kSame(r.store_id, s.store_id) && kSame(r.item_id, i.item_id) && kSame(r.count_date, date); })[0];
      return o ? {packs: kNum(o.packs) || 0, order_pieces: kNum(o.order_pieces) || 0} : null;
    });
    var tot = per.reduce(function (a, o) { return o ? {packs: a.packs + o.packs, order_pieces: a.order_pieces + o.order_pieces} : a; }, {packs: 0, order_pieces: 0});
    rows.push([itemLabel(i), tot.packs ? orderText(i, tot) : '-'].concat(per.map(function (o) { return orderText(i, o); })));
  });
  block(fStart, 2 + stores.length, -1);
  rows.push([]);

  stores.forEach(function (s, si) {
    var sStart = rows.length;
    var submitted = counts.some(function (c) { return kSame(c.store_id, s.store_id) && kSame(c.count_date, date); });
    title([s.name + ' (' + s.store_id + ')', submitted ? '카운트 완료' : '아직 오늘 밤 카운트 없음']);
    header(['제품', '밤 재고', '나간 수량', '입고', '최소 수량', '발주']);
    items.forEach(function (i) {
      var c = find(counts, s.store_id, i.item_id, date);
      var m = find(moves, s.store_id, i.item_id, date);
      var o = orders.filter(function (r) { return kSame(r.store_id, s.store_id) && kSame(r.item_id, i.item_id) && kSame(r.count_date, date); })[0];
      var target = o ? kNum(o.target) : kreamTargetFor(db, settings, s.store_id, i.item_id, delivery);
      rows.push([itemLabel(i), c ? kNum(c.counted) : '', m && kNum(m.used) != null ? kNum(m.used) : '',
        m && kNum(m.received) ? kNum(m.received) : (m ? 0 : ''), target == null ? '' : target,
        o ? orderText(i, {packs: kNum(o.packs), order_pieces: kNum(o.order_pieces)}) : (submitted ? '-' : '')]);
    });
    block(sStart, 6, si);
    rows.push([]);
  });

  // Last 7 nights of "out" (sold/used) per store.
  var days = [];
  for (var d = 6; d >= 0; d--) days.push(kAddDays(date, -d));
  title(['최근 7일 나간 수량 (판매·사용 = 전날 재고 + 입고 − 밤 재고)']);
  rows.push([]);
  stores.forEach(function (s, si) {
    var wStart = rows.length;
    title([s.name + ' (' + s.store_id + ')']);
    header(['제품'].concat(days.map(function (x) { return x.slice(5).replace('-', '/'); }), ['합계']));
    items.forEach(function (i) {
      var sum = 0, any = false;
      var vals = days.map(function (x) {
        var m = find(moves, s.store_id, i.item_id, x);
        var u = m ? kNum(m.used) : null;
        if (u != null) { sum += u; any = true; }
        return u == null ? '' : u;
      });
      rows.push([itemLabel(i)].concat(vals, [any ? sum : '']));
    });
    block(wStart, 9, si);
    rows.push([]);
  });
  return {rows: rows, titles: titles, headers: headers, blocks: blocks};
}

/*
 * Google Sheets wrapper for the shared logic above.
 * Setup: Extensions > Apps Script, paste this whole file as Code.gs, run setup(), then Deploy > New deployment > Web app.
 */

var KREAM_TZ = 'America/Toronto';

function doGet(e) {
  return kreamRespond(function () { return kreamHandle(kreamSheetDb(), {action: 'config'}, kreamCtx()); });
}

function doPost(e) {
  return kreamRespond(function () {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (req.action === 'recordStock') return kreamRecordStock(req);   // 직원 앱 재고 기록 (stock-sync.js)
      if (req.action === 'syncItems') return kreamSyncStockItems(req);  // 직원 앱 품목 목록 맞추기
      var out = kreamHandle(kreamSheetDb(), req, kreamCtx());
      if (['submitCount', 'setOrderStatus', 'saveTargets'].indexOf(req.action) >= 0) {
        try { kreamRefreshSummary(); } catch (err) { console.error('summary refresh failed: ' + err); }
      }
      return out;
    } finally { lock.releaseLock(); }
  });
}

function kreamRespond(fn) {
  var out;
  try { out = {ok: true, data: fn()}; }
  catch (err) { out = {ok: false, error: (err && err.code) || String((err && err.message) || err)}; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function kreamCtx() {
  var now = new Date();
  return {date: Utilities.formatDate(now, KREAM_TZ, 'yyyy-MM-dd'),
    hour: Number(Utilities.formatDate(now, KREAM_TZ, 'H')), nowIso: now.toISOString()};
}

function kreamCell(v) {
  if (v instanceof Date) {
    var t = Utilities.formatDate(v, KREAM_TZ, 'HH:mm:ss');
    return t === '00:00:00' ? Utilities.formatDate(v, KREAM_TZ, 'yyyy-MM-dd') : v.toISOString();
  }
  return v;
}

function kreamSheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) throw kreamError('MISSING_TAB:' + name + ' (run setup)');
  return sh;
}

function kreamColumns(sh, name) {
  if (sh.getLastColumn() === 0) return KREAM_TABS[name] || [];
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
}

function kreamFormatRange(sh, name, row, count) {
  kreamColumns(sh, name).forEach(function (c, i) {
    var numeric = name === KREAM_TARGETS_TAB ? KREAM_TARGET_FIXED.indexOf(c) < 0 : KREAM_NUMBER_COLUMNS.indexOf(c) >= 0;
    sh.getRange(row, i + 1, count, 1).setNumberFormat(numeric ? '0.###' : '@');
  });
}

function kreamSheetDb() {
  var cache = {};
  function load(name) {
    if (cache[name]) return cache[name];
    var sh = kreamSheet(name);
    var values = sh.getDataRange().getValues();
    var header = values[0].map(String);
    var rows = [];
    for (var r = 1; r < values.length; r++) {
      var obj = {_row: r + 1};
      var empty = true;
      header.forEach(function (h, c) { if (!h) return; obj[h] = kreamCell(values[r][c]); if (values[r][c] !== '') empty = false; });
      if (!empty) rows.push(obj);
    }
    cache[name] = {sheet: sh, header: header, rows: rows};
    return cache[name];
  }
  function toRow(t, obj) { return t.header.map(function (h) { return obj[h] == null ? '' : obj[h]; }); }
  return {
    all: function (name) { return load(name).rows.slice(); },
    append: function (name, objs) {
      if (!objs.length) return;
      var t = load(name);
      var start = t.sheet.getLastRow() + 1;
      kreamFormatRange(t.sheet, name, start, objs.length);
      t.sheet.getRange(start, 1, objs.length, t.header.length).setValues(objs.map(function (o) { return toRow(t, o); }));
      delete cache[name];
    },
    update: function (name, row, patch) {
      var t = load(name);
      var merged = {};
      t.header.forEach(function (h) { merged[h] = h in patch ? patch[h] : row[h]; });
      t.sheet.getRange(row._row, 1, 1, t.header.length).setValues([toRow(t, merged)]);
      delete cache[name];
    },
    removeWhere: function (name, pred) {
      var t = load(name);
      t.rows.filter(pred).map(function (r) { return r._row; }).sort(function (a, b) { return b - a; })
        .forEach(function (n) { t.sheet.deleteRow(n); });
      delete cache[name];
    }
  };
}

function kreamStyleHeader(sh, cols) {
  sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#eeeee3');
  sh.setFrozenRows(1);
}

// Run once from the Apps Script editor (safe to run again): creates the tabs, sample data and the two owner tabs.
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(KREAM_TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    var cols = KREAM_TABS[name];
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
      kreamStyleHeader(sh, cols.length);
      var seed = KREAM_SEED[name] || [];
      if (seed.length) {
        kreamFormatRange(sh, name, 2, seed.length);
        sh.getRange(2, 1, seed.length, cols.length).setValues(seed.map(function (o) {
          return cols.map(function (c) { return o[c] == null ? '' : o[c]; });
        }));
      }
      sh.autoResizeColumns(1, cols.length);
    } else {
      // Upgrade: add any new columns at the end of an existing tab.
      var have = kreamColumns(sh, name);
      var missing = cols.filter(function (c) { return have.indexOf(c) < 0; });
      if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold').setBackground('#eeeee3');
    }
  });
  // Upgrade: add new Settings keys (e.g. store PINs) without touching existing values.
  var setSh = ss.getSheetByName('Settings');
  var keys = setSh.getDataRange().getValues().map(function (r) { return String(r[0]); });
  var newKeys = KREAM_SEED.Settings.filter(function (r) { return keys.indexOf(r.key) < 0; });
  if (newKeys.length) {
    var at = setSh.getLastRow() + 1;
    setSh.getRange(at, 1, newKeys.length, 3).setNumberFormat('@').setValues(newKeys.map(function (r) { return [r.key, r.value, r.note]; }));
  }
  kreamCreateTargetsTab();
  kreamSyncTargets();
  kreamStyleTargets();
  if (!ss.getSheetByName(KREAM_SUMMARY_TAB)) ss.insertSheet(KREAM_SUMMARY_TAB, 0);
  kreamRefreshSummary();
  kreamInstallArchiveTrigger();
  var tgt = ss.getSheetByName(KREAM_TARGETS_TAB);
  ss.setActiveSheet(tgt); ss.moveActiveSheet(2);
  var first = ss.getSheetByName('Sheet1');
  if (first && first.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(first);
}

// Creates the 기본 수량 grid. Upgrades an old "Targets" tab (one row per store+item) if there is one.
function kreamCreateTargetsTab() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(KREAM_TARGETS_TAB)) return;
  var db = kreamSheetDb();
  var stores = kreamStores(db), items = kreamActiveItems(db);
  var list = KREAM_SEED.Targets;
  var old = ss.getSheetByName('Targets');
  if (old && old.getLastRow() > 1) {
    var v = old.getDataRange().getValues(), h = v[0].map(String);
    list = v.slice(1).map(function (r) { var o = {}; h.forEach(function (k, i) { o[k] = r[i]; }); return o; });
  }
  var headers = kreamTargetHeaders(stores);
  var grid = kreamTargetGridFromList(stores, items, list);
  var sh = ss.insertSheet(KREAM_TARGETS_TAB);
  sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  kreamStyleHeader(sh, headers.length);
  if (grid.length) {
    kreamFormatRange(sh, KREAM_TARGETS_TAB, 2, grid.length);
    sh.getRange(2, 1, grid.length, headers.length).setValues(grid.map(function (o) { return headers.map(function (k) { return o[k]; }); }));
  }
  sh.setColumnWidth(1, 90);
  sh.autoResizeColumns(2, headers.length - 1);
  if (old) ss.deleteSheet(old);
}

// Keeps 기본 수량 in step with Items and Stores: adds a row per new item and two columns per new store.
function kreamSyncTargets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KREAM_TARGETS_TAB);
  if (!sh) return;
  var db = kreamSheetDb();
  var stores = kreamStores(db), items = kreamActiveItems(db);
  var header = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0].map(String);
  var probe = {};
  header.forEach(function (h) { probe[h] = ''; });
  var add = [];
  stores.forEach(function (s) {
    ['weekday', 'weekend'].forEach(function (kind) { if (!kreamTargetKey(probe, s.store_id, kind)) add.push(kreamTargetHeader(s, kind)); });
  });
  if (add.length) {
    sh.getRange(1, header.length + 1, 1, add.length).setValues([add]).setFontWeight('bold').setBackground('#eeeee3');
    header = header.concat(add);
  }
  var existing = db.all(KREAM_TARGETS_TAB);
  var newRows = items.filter(function (i) { return !existing.some(function (r) { return kSame(r.item_id, i.item_id); }); })
    .map(function (i) { return header.map(function (h) { return h === 'item_id' ? i.item_id : h === '제품' ? i.name_ko : h === '단위' ? i.count_unit : ''; }); });
  if (newRows.length) {
    var start = sh.getLastRow() + 1;
    kreamFormatRange(sh, KREAM_TARGETS_TAB, start, newRows.length);
    sh.getRange(start, 1, newRows.length, header.length).setValues(newRows);
  }
  if (add.length || newRows.length) kreamStyleTargets();
  // Refresh item names and units in case they changed in Items.
  existing.forEach(function (r) {
    var i = items.filter(function (x) { return kSame(x.item_id, r.item_id); })[0];
    if (i && (kStr(r['제품']) !== i.name_ko || kStr(r['단위']) !== i.count_unit)) sh.getRange(r._row, 2, 1, 2).setValues([[i.name_ko, i.count_unit]]);
  });
}

// Rebuilds the read-only 매장별 발주 overview tab.
var KREAM_FONT = 'Noto Sans KR';
function kreamRefreshSummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(KREAM_SUMMARY_TAB) || ss.insertSheet(KREAM_SUMMARY_TAB, 0);
  var s = kreamSummary(kreamSheetDb(), kreamCtx());
  var width = s.rows.reduce(function (m, r) { return Math.max(m, r.length); }, 1);
  var grid = s.rows.map(function (r) { var x = r.slice(); while (x.length < width) x.push(''); return x; });
  sh.clear();
  sh.setHiddenGridlines(true);
  var all = sh.getRange(1, 1, grid.length, width);
  all.setValues(grid).setFontFamily(KREAM_FONT).setFontSize(11).setFontColor('#3a3c34').setVerticalAlignment('middle').setBackground('#fffdf8');
  sh.getRange(1, 2, grid.length, width - 1).setHorizontalAlignment('center');
  s.titles.forEach(function (r) { sh.getRange(r + 1, 1).setFontWeight('bold').setFontSize(13); });
  sh.getRange(1, 1).setFontSize(16).setFontColor('#ed522e');
  sh.getRange(1, width).setFontColor('#9a9c90').setFontSize(9).setHorizontalAlignment('right');
  sh.setRowHeight(1, 38);
  s.blocks.forEach(function (b) {
    var col = kreamStoreColors(b.store);
    var n = b.end - b.start + 1;
    var box = sh.getRange(b.start + 1, 1, n, b.width);
    box.setBorder(true, true, true, true, true, true, '#e2dfd3', SpreadsheetApp.BorderStyle.SOLID);
    box.setBorder(true, true, true, true, null, null, col[0], SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    // Title band
    sh.getRange(b.start + 1, 1, 1, b.width).merge().setBackground(col[0]).setFontWeight('bold').setFontSize(13)
      .setHorizontalAlignment('left').setFontColor(b.store < 0 ? '#ffffff' : '#2f3129');
    sh.setRowHeight(b.start + 1, 34);
    // Column header
    sh.getRange(b.start + 2, 1, 1, b.width).setBackground(col[1]).setFontWeight('bold').setFontSize(10).setFontColor('#4a4c43');
    sh.setRowHeight(b.start + 2, 26);
    // Body rows: alternate white / soft store colour
    for (var r = b.start + 3; r <= b.end + 1; r++) {
      sh.getRange(r, 1, 1, b.width).setBackground((r - b.start) % 2 ? '#ffffff' : col[2]);
      sh.setRowHeight(r, 26);
    }
    sh.getRange(b.start + 3, 1, Math.max(1, n - 2), 1).setFontWeight('bold');
    if (b.width === 6) sh.getRange(b.start + 3, 6, Math.max(1, n - 2), 1).setFontWeight('bold').setFontSize(12).setFontColor('#d9480f');   // 발주
    if (b.width === 9) sh.getRange(b.start + 3, 9, Math.max(1, n - 2), 1).setFontWeight('bold');                   // 합계
    if (b.store < 0) sh.getRange(b.start + 3, 2, Math.max(1, n - 2), 1).setFontWeight('bold').setFontSize(12);     // 총 발주
  });
  sh.setColumnWidth(1, 190);
  for (var c = 2; c <= width; c++) sh.setColumnWidth(c, 118);
  sh.setFrozenRows(1);
}

// Colours the 기본 수량 grid: each store's two columns in that store's colour, borders on every cell.
function kreamStyleTargets() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KREAM_TARGETS_TAB);
  if (!sh || sh.getLastColumn() === 0) return;
  var rows = Math.max(2, sh.getLastRow()), cols = sh.getLastColumn();
  var header = sh.getRange(1, 1, 1, cols).getValues()[0].map(String);
  var stores = kreamStores(kreamSheetDb());
  sh.setHiddenGridlines(true);
  sh.getRange(1, 1, rows, cols).setFontFamily(KREAM_FONT).setFontSize(11).setFontColor('#3a3c34').setVerticalAlignment('middle')
    .setBorder(true, true, true, true, true, true, '#e2dfd3', SpreadsheetApp.BorderStyle.SOLID);
  sh.getRange(1, 1, rows, 3).setBackground(KREAM_NEUTRAL_COLORS[2]);
  sh.getRange(1, 1, 1, 3).setBackground(KREAM_NEUTRAL_COLORS[0]).setFontColor('#ffffff').setFontWeight('bold');
  header.forEach(function (h, i) {
    var id = kStr(h).split(/\s+/)[0];
    var si = -1;
    stores.forEach(function (s, k) { if (s.store_id === id) si = k; });
    if (i < 3 || si < 0) return;
    var col = kreamStoreColors(si);
    sh.getRange(1, i + 1).setBackground(col[0]).setFontWeight('bold').setFontColor('#2f3129').setWrap(true).setHorizontalAlignment('center');
    for (var r = 2; r <= rows; r++) sh.getRange(r, i + 1).setBackground(r % 2 ? col[2] : '#ffffff');
    sh.getRange(2, i + 1, rows - 1, 1).setHorizontalAlignment('center');
  });
  sh.getRange(2, 2, rows - 1, 1).setFontWeight('bold');
  sh.setRowHeight(1, 40);
  sh.setColumnWidth(1, 90); sh.setColumnWidth(2, 150); sh.setColumnWidth(3, 60);
  for (var c = 4; c <= cols; c++) sh.setColumnWidth(c, 115);
  sh.setFrozenRows(1); sh.setFrozenColumns(3);
}

function onOpen() {
  try { kreamRefreshStockIfDirty(); } catch (err) { console.error(err); }
  SpreadsheetApp.getUi().createMenu('Kream')
    .addItem('재고 현황·날짜별 재고 새로고침', 'kreamRefreshStock')
    .addSeparator()
    .addItem('매장별 발주 새로고침', 'kreamRefreshSummary')
    .addItem('기본 수량에 새 품목·매장 추가', 'kreamSyncTargets')
    .addItem('기본 수량 색·테두리 다시 입히기', 'kreamStyleTargets')
    .addSeparator()
    .addItem('오래된 기록 지금 보관하기', 'kreamArchiveNow')
    .addToUi();
}

// When Items or Stores change, add matching rows/columns to 기본 수량; when 기본 수량 changes, refresh the overview.
function onEdit(e) {
  var name = e && e.range && e.range.getSheet().getName();
  try {
    if (name === KREAM_STOCK_DAYS && e.range.getRow() === 2) { kreamRefreshStock(); return; }
    if (name === 'Items' || name === 'Stores') { kreamSyncTargets(); kreamRefreshSummary(); }
    else if (name === KREAM_TARGETS_TAB) kreamRefreshSummary();
  } catch (err) { console.error(err); }
}

// ---- Monthly archive ----
// On the 1st of each month: rows older than the start of last month move from Counts, Movements and
// FactoryOrders and 재고 기록 to a yearly file "Kream 재고 기록 YYYY" (one per year, created automatically).
// The main sheet keeps this month + last month. Nothing is deleted until it is safely copied.
var KREAM_ARCHIVE_TABS = ['Counts', 'Movements', 'FactoryOrders', '재고 기록'];

function kreamArchiveFile(year) {
  var props = PropertiesService.getScriptProperties();
  var key = 'archive_' + year, id = props.getProperty(key), file = null;
  if (id) { try { file = SpreadsheetApp.openById(id); } catch (e) { file = null; } }
  if (!file) {
    file = SpreadsheetApp.create('Kream 재고 기록 ' + year);
    props.setProperty(key, file.getId());
    // Leave a link in Settings so the owner can find it.
    var set = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
    set.getRange(set.getLastRow() + 1, 1, 1, 3).setNumberFormat('@')
      .setValues([[key, file.getUrl(), year + '년 보관 기록 (자동 생성)']]);
  }
  return file;
}

function kreamArchive() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var today = kreamCtx().date;
    var keepFrom = kAddDays(today.slice(0, 8) + '01', -1).slice(0, 8) + '01';   // first day of last month
    var moved = 0;
    KREAM_ARCHIVE_TABS.forEach(function (name) {
      var sh = ss.getSheetByName(name);
      if (!sh || sh.getLastRow() < 2) return;
      var values = sh.getDataRange().getValues();
      var header = values[0].map(String);
      var dc = header.indexOf('count_date');
      if (dc < 0) return;
      var keep = [], old = {};
      values.slice(1).forEach(function (row) {
        var d = kStr(kreamCell(row[dc]));
        if (kIsDate(d) && d < keepFrom) { (old[d.slice(0, 4)] = old[d.slice(0, 4)] || []).push(row); }
        else keep.push(row);
      });
      var years = Object.keys(old);
      if (!years.length) return;
      // 1) copy to the yearly archive files
      years.forEach(function (y) {
        var file = kreamArchiveFile(y);
        var tab = file.getSheetByName(name);
        if (!tab) {
          tab = file.insertSheet(name);
          tab.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold').setBackground('#e4e2d6');
          tab.setFrozenRows(1);
          var blank = file.getSheetByName('Sheet1') || file.getSheetByName('시트1');
          if (blank && file.getSheets().length > 1) file.deleteSheet(blank);
        }
        var rows = old[y];
        var at = tab.getLastRow() + 1;
        tab.getRange(at, 1, rows.length, header.length).setValues(rows.map(function (r) { return r.map(kreamCell); }));
        if (tab.getLastRow() < at + rows.length - 1) throw new Error('ARCHIVE_COPY_FAILED:' + name);
        moved += rows.length;
      });
      // 2) rewrite the main tab with only the rows we keep
      var last = sh.getLastRow();
      sh.getRange(2, 1, last - 1, header.length).clearContent();
      if (keep.length) sh.getRange(2, 1, keep.length, header.length).setValues(keep);
      if (last > keep.length + 1) sh.deleteRows(keep.length + 2, last - keep.length - 1);
    });
    if (moved) kreamRefreshSummary();
    return moved;
  } finally { lock.releaseLock(); }
}

// Run from the Kream menu: archives now and shows how many rows moved.
function kreamArchiveNow() {
  var n = kreamArchive();
  SpreadsheetApp.getUi().alert(n ? n + '줄을 보관 파일로 옮겼어요. Settings 탭에 보관 파일 링크가 있어요.' : '옮길 오래된 기록이 없어요 (지난달 1일 이전 기록만 옮겨요).');
}

// Installs the monthly trigger (1st of each month, around 3 AM). Safe to run again.
function kreamInstallArchiveTrigger() {
  var exists = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'kreamArchive'; });
  if (!exists) ScriptApp.newTrigger('kreamArchive').timeBased().onMonthDay(1).atHour(3).inTimezone(KREAM_TZ).create();
}

/*
 * 재고 기록: Sora 앱(직원 앱)에서 센 재고를 이 시트에 쌓고, 보기 좋게 보여줘요.
 *  - 재고 기록  : 센 숫자가 한 줄씩 계속 쌓여요 (매달 1일 오래된 줄은 연도별 보관 파일로).
 *  - 재고 품목  : 앱에서 처음 보는 품목이 자동으로 추가돼요 (카테고리·순서).
 *  - 재고 현황  : 매장별 최근 재고. 카테고리별로 묶어서 보여줘요.
 *  - 날짜별 재고: 고른 매장의 최근 14일 재고.
 * 보기 탭은 5분마다(새 기록이 있을 때만) 또는 Kream 메뉴에서 새로고침돼요.
 */

var KREAM_STOCK_LOG = '재고 기록';
var KREAM_STOCK_ITEMS = '재고 품목';
var KREAM_STOCK_NOW = '재고 현황';
var KREAM_STOCK_DAYS = '날짜별 재고';
var KREAM_STOCK_LOG_COLS = ['count_date', 'recorded_at', 'store_id', 'store', 'category', 'subgroup', 'item_id', 'item', 'unit', 'count', 'staff'];
var KREAM_STOCK_ITEM_COLS = ['item_id', 'item', 'category', 'subgroup', 'unit', 'sort', 'updated_at'];
var KREAM_STOCK_STORES = [
  {id: 'downtown', label: '1호점 Wellesley', color: '#eeb4ae', soft: '#fbeeec'},
  // 2호점 Midland는 원래 방식 그대로 (이 시트에 기록 안 함)
  {id: 'richmond-hill', label: '3호점 Richmond Hill', color: '#a9c1e3', soft: '#edf2fa'},
  {id: 'finch', label: '4호점 Finch', color: '#ccb6e2', soft: '#f4eefa'}
];
var KREAM_STOCK_OLD_TABS = ['매장별 발주', '기본 수량', 'Stores', 'Items', 'Counts', 'Movements', 'FactoryOrders'];
var KREAM_STOCK_DEFAULT_KEY = 'kream-stock-sync';
// 포장·소모품처럼 '있다/없다'로 세는 품목은 숫자 대신 ✅ / ❌
function kreamStockShow(it, v) {
  if (v === '' || v == null) return v;
  if (/반봉지/.test(it.unit || '')) return Number(v) >= 1 ? '🫖 1봉지+' : Number(v) > 0 ? '🍵 반봉지' : '❌ 없음';   // 티백
  if (/있음/.test(it.unit || '')) return Number(v) > 0 ? '✅ 있음' : '❌ 없음';   // 포장·소모품
  return v;
}

var KREAM_CATEGORY_COLORS = ['#f6d7cf', '#dfe9d2', '#d6e2f2', '#e7dcf0', '#f6ebc4', '#d9ece8', '#f1dbe6', '#e6e1d6'];

// 앱에서 보낸 재고 줄들을 저장해요. 화면 새로고침은 나중에 (5분 트리거).
function kreamRecordStock(req) {
  var settings = kreamSettingMap();
  var key = settings.sync_key || KREAM_STOCK_DEFAULT_KEY;
  if (req.key !== key) throw kreamError('BAD_SYNC_KEY');
  var known = KREAM_STOCK_STORES.map(function (s) { return s.id; });
  var rows = (req.rows || []).filter(function (r) { return r && r.item_id && known.indexOf(r.store_id) >= 0 && r.count !== '' && r.count != null && isFinite(Number(r.count)); });
  if (!rows.length) return {saved: 0};
  if (rows.length > 200) rows = rows.slice(0, 200);
  var cutoff = Number(settings.day_cutoff_hour || 4);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  kreamStockTabs(ss);
  var log = ss.getSheetByName(KREAM_STOCK_LOG);
  var now = new Date();
  var values = rows.map(function (r) {
    var at = new Date(r.recorded_at);
    if (isNaN(at.getTime()) || Math.abs(at - now) > 36 * 3600 * 1000) at = now;   // 이상한 시간이면 지금 시간
    var day = Utilities.formatDate(at, KREAM_TZ, 'yyyy-MM-dd');
    if (Number(Utilities.formatDate(at, KREAM_TZ, 'H')) < cutoff) day = kAddDays(day, -1);   // 새벽 기록은 전날 밤 재고
    var st = KREAM_STOCK_STORES.filter(function (s) { return s.id === r.store_id; })[0];
    return [day, Utilities.formatDate(at, KREAM_TZ, 'yyyy-MM-dd HH:mm'), kStr(r.store_id), st.label, kStr(r.category), kStr(r.subgroup),
      kStr(r.item_id), kStr(r.item) || kStr(r.item_id), kStr(r.unit), Number(r.count), kStr(r.staff).slice(0, 60)];
  });
  var start = log.getLastRow() + 1;
  log.getRange(start, 1, values.length, KREAM_STOCK_LOG_COLS.length).setNumberFormats(values.map(function () {
    return ['@', '@', '@', '@', '@', '@', '@', '@', '@', '0.###', '@'];
  })).setValues(values);
  kreamUpsertStockItems(ss, rows);
  PropertiesService.getScriptProperties().setProperty('stock_dirty', '1');
  return {saved: values.length};
}

// 앱의 품목 목록(이름·카테고리·순서)을 재고 품목 탭에 맞춰요. 기록은 안 남겨요.
function kreamSyncStockItems(req) {
  var settings = kreamSettingMap();
  if (req.key !== (settings.sync_key || KREAM_STOCK_DEFAULT_KEY)) throw kreamError('BAD_SYNC_KEY');
  var rows = (req.items || []).filter(function (r) { return r && r.item_id; }).slice(0, 2000);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  kreamStockTabs(ss);
  kreamUpsertStockItems(ss, rows);
  PropertiesService.getScriptProperties().setProperty('stock_dirty', '1');
  return {items: rows.length};
}

function kreamSettingMap() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Settings');
  var map = {};
  if (sh) sh.getDataRange().getValues().forEach(function (r) { map[String(r[0])] = r[1] === '' ? '' : String(r[1]); });
  return map;
}

function kreamUpsertStockItems(ss, rows) {
  var sh = ss.getSheetByName(KREAM_STOCK_ITEMS);
  var data = sh.getDataRange().getValues();
  var at = {};
  for (var i = 1; i < data.length; i++) at[String(data[i][0])] = i + 1;
  var stamp = Utilities.formatDate(new Date(), KREAM_TZ, 'yyyy-MM-dd HH:mm');
  var add = [], seen = {};
  rows.forEach(function (r) {
    var row = [kStr(r.item_id), kStr(r.item) || kStr(r.item_id), kStr(r.category), kStr(r.subgroup), kStr(r.unit), r.sort === '' || r.sort == null ? '' : Number(r.sort), stamp];
    if (at[row[0]]) sh.getRange(at[row[0]], 1, 1, row.length).setValues([row]);
    else if (!seen[row[0]]) { seen[row[0]] = true; add.push(row); }
  });
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, KREAM_STOCK_ITEM_COLS.length).setValues(add);
}

// 탭이 없으면 만들어요.
function kreamStockTabs(ss) {
  [[KREAM_STOCK_LOG, KREAM_STOCK_LOG_COLS], [KREAM_STOCK_ITEMS, KREAM_STOCK_ITEM_COLS]].forEach(function (x) {
    var sh = ss.getSheetByName(x[0]);
    if (sh) return;
    sh = ss.insertSheet(x[0]);
    sh.getRange(1, 1, 1, x[1].length).setValues([x[1]]).setFontWeight('bold').setBackground('#eeeee3').setFontFamily(KREAM_FONT);
    sh.setFrozenRows(1);
  });
  [KREAM_STOCK_NOW, KREAM_STOCK_DAYS].forEach(function (name) { if (!ss.getSheetByName(name)) ss.insertSheet(name); });
}

// 품목을 카테고리 순서대로 묶어요: [{category, items:[{id,item,unit}]}]
function kreamStockGroups(ss, logRows) {
  var items = {}, list = [];
  ss.getSheetByName(KREAM_STOCK_ITEMS).getDataRange().getValues().slice(1).forEach(function (r) {
    if (!r[0]) return;
    var it = {id: String(r[0]), item: String(r[1]), category: String(r[2]) || '기타', unit: String(r[4]), sort: r[5] === '' ? 99999 : Number(r[5])};
    items[it.id] = it; list.push(it);
  });
  logRows.forEach(function (r) {   // 품목 탭에 없는 품목도 보이게
    if (!items[r.item_id]) { items[r.item_id] = {id: r.item_id, item: r.item, category: r.category || '기타', unit: r.unit, sort: 99999}; list.push(items[r.item_id]); }
  });
  var cats = {};
  list.forEach(function (it) { (cats[it.category] = cats[it.category] || []).push(it); });
  return Object.keys(cats).map(function (c) {
    var arr = cats[c].sort(function (a, b) { return a.sort - b.sort || a.item.localeCompare(b.item); });
    return {category: c, first: arr[0].sort, items: arr};
  }).sort(function (a, b) { return a.first - b.first || a.category.localeCompare(b.category); });
}

function kreamStockLogRows(ss) {
  var v = ss.getSheetByName(KREAM_STOCK_LOG).getDataRange().getValues();
  var out = [];
  for (var i = 1; i < v.length; i++) {
    if (!v[i][6]) continue;
    out.push({date: kStr(kreamCell(v[i][0])), at: kStr(kreamCell(v[i][1])), store_id: String(v[i][2]), category: String(v[i][4]),
      item_id: String(v[i][6]), item: String(v[i][7]), unit: String(v[i][8]), count: v[i][9]});
  }
  return out;   // 시간 순서 (아래로 쌓임)
}

// 공통: 카테고리 묶음 표 그리기 (원래 매장별 발주처럼 색깔 상자).
// headerColors: 열 머리 색, softColors: 열 몸통 연한 색. cellFor(item, colIndex) → [값, 오늘이면 true]
function kreamDrawStockTable(sh, title, subtitle, headers, headerColors, groups, cellFor, extraTop, softColors) {
  sh.setFrozenRows(0); sh.setFrozenColumns(0);
  if (sh.getMaxRows() && sh.getMaxColumns()) sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  sh.setHiddenGridlines(true);
  var width = headers.length, top = 3 + (extraTop || 0);
  var grid = [], kinds = [], fresh = [];
  groups.forEach(function (g, gi) {
    var head = [g.category + '  ·  ' + g.items.length + '개']; while (head.length < width) head.push('');
    grid.push(head); kinds.push({cat: gi}); fresh.push(null);
    g.items.forEach(function (it, ii) {
      var row = [it.item, it.unit], marks = [false, false];
      for (var c = 2; c < width; c++) { var x = cellFor(it, c - 2); row.push(x[0]); marks.push(x[1]); }
      grid.push(row); kinds.push({odd: ii % 2 === 1}); fresh.push(marks);
    });
  });
  var all = sh.getRange(1, 1, top + Math.max(grid.length, 1), width);
  all.setFontFamily(KREAM_FONT).setFontSize(11).setFontColor('#3a3c34').setVerticalAlignment('middle').setBackground('#fffdf8');
  sh.getRange(1, 1).setValue(title).setFontSize(16).setFontWeight('bold').setFontColor('#ed522e');
  sh.getRange(1, width).setValue(subtitle).setFontSize(9).setFontColor('#9a9c90').setHorizontalAlignment('right');
  sh.setRowHeight(1, 38);
  // 머리 줄: 매장 색 띠
  var hdr = sh.getRange(top, 1, 1, width);
  hdr.setValues([headers]).setFontWeight('bold').setFontSize(11).setHorizontalAlignment('center').setBackground('#e9e6da').setFontColor('#2f3129');
  headerColors.forEach(function (col, i) { if (col) sh.getRange(top, i + 1).setBackground(col); });
  sh.getRange(top, 1).setHorizontalAlignment('left');
  sh.setRowHeight(top, 34);
  if (grid.length) {
    var body = sh.getRange(top + 1, 1, grid.length, width);
    body.setValues(grid);
    // 배경: 카테고리 띠 / 줄무늬 / 매장 열은 연한 매장 색
    var bg = [], colors = [], weights = [];
    kinds.forEach(function (k, r) {
      var b = [], cr = [], wr = [];
      for (var c = 0; c < width; c++) {
        if (k.cat != null) { b.push(KREAM_CATEGORY_COLORS[k.cat % KREAM_CATEGORY_COLORS.length]); cr.push('#2f3129'); wr.push('bold'); continue; }
        var soft = c >= 2 && softColors && softColors[c] ? softColors[c] : null;
        b.push(soft ? (k.odd ? kreamShade(soft) : soft) : (k.odd ? '#f6f4ec' : '#ffffff'));
        var m = fresh[r];
        cr.push(c < 2 ? (c === 1 ? '#8a8676' : '#2f3129') : (m && !m[c] ? '#a8a496' : '#2f3129'));
        wr.push(c === 0 ? 'bold' : c >= 2 && m && m[c] ? 'bold' : 'normal');
      }
      bg.push(b); colors.push(cr); weights.push(wr);
    });
    body.setBackgrounds(bg).setFontColors(colors).setFontWeights(weights)
      .setBorder(true, true, true, true, true, true, '#e2dfd3', SpreadsheetApp.BorderStyle.SOLID);
    sh.getRange(top + 1, 3, grid.length, width - 2).setHorizontalAlignment('center').setNumberFormat('0.###').setFontSize(12);
    sh.getRange(top + 1, 2, grid.length, 1).setFontSize(9).setHorizontalAlignment('center');
    kinds.forEach(function (k, r) {
      if (k.cat != null) sh.getRange(top + 1 + r, 1, 1, width).merge().setFontSize(12).setHorizontalAlignment('left');
    });
    sh.setRowHeights(top + 1, grid.length, 26);
    kinds.forEach(function (k, r) { if (k.cat != null) sh.setRowHeight(top + 1 + r, 30); });
    // 상자 테두리: 전체 + 매장 열마다 매장 색
    sh.getRange(top, 1, grid.length + 1, width).setBorder(true, true, true, true, null, null, '#8f927f', SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    headerColors.forEach(function (col, i) {
      if (col && i >= 2) sh.getRange(top, i + 1, grid.length + 1, 1).setBorder(true, true, true, true, null, null, col, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    });
  }
  sh.setFrozenRows(top);   // 첫 열은 고정 안 함 (카테고리 띠가 가로로 합쳐져 있어서)
  sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 80);
  for (var w = 3; w <= width; w++) sh.setColumnWidth(w, width > 8 ? 64 : 140);
}

// 연한 색을 조금 더 진하게 (줄무늬용)
function kreamShade(hex) {
  var n = parseInt(hex.slice(1), 16), f = 0.94;
  var r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// 재고 현황: 예전 "매장별 발주"처럼 색깔 상자로.
//  1) 전 매장 재고 합계  2) 매장별 상자 (오늘·어제 재고)  3) 매장별 최근 7일
// 매장 상자에는 그 매장이 한 번이라도 센 품목만 나와요.
function kreamRefreshStockNow(ss, logRows, groups) {
  var sh = ss.getSheetByName(KREAM_STOCK_NOW);
  var ctx = kreamCtx(), cutoff = Number(kreamSettingMap().day_cutoff_hour || 4);
  var today = ctx.hour < cutoff ? kAddDays(ctx.date, -1) : ctx.date, yest = kAddDays(today, -1), W = 8;   // 새벽 4시 전에는 어젯밤 재고가 '오늘'
  var latest = {}, byDay = {}, countedBy = {};
  logRows.forEach(function (r) {
    latest[r.store_id + '|' + r.item_id] = r;
    byDay[r.store_id + '|' + r.date + '|' + r.item_id] = r.count;
    countedBy[r.store_id + '|' + r.item_id] = true; countedBy['*|' + r.item_id] = true;
  });
  var days = []; for (var d = 6; d >= 0; d--) days.push(kAddDays(today, -d));
  var rows = [], blocks = [], cats = [], titles = [];
  function pad(r) { r = r.slice(); while (r.length < W) r.push(''); return r; }
  function short(dd) { return dd.slice(5).replace('-', '/'); }
  function block(title, color, soft, header, filterFn, rowFn) {
    var start = rows.length, width = header.length;
    rows.push(pad([title])); rows.push(pad(header));
    var any = false;
    groups.forEach(function (g, gi) {
      var items = g.items.filter(filterFn);
      if (!items.length) return;
      any = true;
      cats.push({row: rows.length, width: width, color: KREAM_CATEGORY_COLORS[gi % KREAM_CATEGORY_COLORS.length]});
      rows.push(pad([g.category + '  ·  ' + items.length + '개']));
      items.forEach(function (it) { rows.push(pad(rowFn(it))); });
    });
    if (!any) rows.push(pad(['아직 센 재고가 없어요']));
    blocks.push({start: start, end: rows.length - 1, width: width, color: color, soft: soft});
    rows.push(pad([]));
  }
  rows.push(pad(['재고 현황 · ' + today])); rows[0][W - 1] = '마지막 업데이트 ' + Utilities.formatDate(new Date(), KREAM_TZ, 'MM/dd HH:mm');
  rows.push(pad([]));
  // 1) 전 매장 합계 (가장 최근 숫자)
  block('전 매장 재고 합계 (최근에 센 숫자)', '#3e4b33', '#e9e6da',
    ['제품', '단위', '합계'].concat(KREAM_STOCK_STORES.map(function (s) { return s.label.split(' ')[0]; })),
    function (it) { return countedBy['*|' + it.id]; },
    function (it) {
      var sum = 0, vals = KREAM_STOCK_STORES.map(function (st) {
        var r = latest[st.id + '|' + it.id]; if (!r) return '-';
        sum += Number(r.count) || 0; return kreamStockShow(it, r.count);
      });
      return [it.item, it.unit, /있음|반봉지/.test(it.unit || '') ? '' : sum].concat(vals);
    });
  // 2) 매장별 상자
  KREAM_STOCK_STORES.forEach(function (st) {
    block(st.label, st.color, st.soft, ['제품', '단위', '오늘 재고', '어제 재고', '변화', '마지막으로 센 날'],
      function (it) { return countedBy[st.id + '|' + it.id]; },
      function (it) {
        var t = byDay[st.id + '|' + today + '|' + it.id], y = byDay[st.id + '|' + yest + '|' + it.id], r = latest[st.id + '|' + it.id];
        var diff = t != null && y != null && !/있음/.test(it.unit || '') ? Number(t) - Number(y) : '';
        return [it.item, it.unit, t == null ? '' : kreamStockShow(it, t), y == null ? '' : kreamStockShow(it, y),
          diff === '' || /반봉지/.test(it.unit || '') ? '' : (diff > 0 ? '+' + diff : diff), r ? short(r.date) : ''];
      });
  });
  titles.push(rows.length);
  rows.push(pad(['최근 7일 재고 (그날 마지막으로 센 숫자)']));
  // 3) 매장별 최근 7일
  KREAM_STOCK_STORES.forEach(function (st) {
    block(st.label, st.color, st.soft, ['제품'].concat(days.map(short)),
      function (it) { return countedBy[st.id + '|' + it.id]; },
      function (it) { return [it.item].concat(days.map(function (dd) { var v = byDay[st.id + '|' + dd + '|' + it.id]; return v == null ? '' : kreamStockShow(it, v); })); });
  });

  // 그리기
  sh.setFrozenRows(0); sh.setFrozenColumns(0);
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();
  sh.clear();
  sh.setHiddenGridlines(true);
  if (sh.getMaxRows() < rows.length) sh.insertRowsAfter(sh.getMaxRows(), rows.length - sh.getMaxRows());
  var bg = rows.map(function () { var x = []; for (var c = 0; c < W; c++) x.push('#fffdf8'); return x; });
  var fw = rows.map(function () { var x = []; for (var c = 0; c < W; c++) x.push('normal'); return x; });
  var fc = rows.map(function () { var x = []; for (var c = 0; c < W; c++) x.push('#3a3c34'); return x; });
  blocks.forEach(function (b) {
    for (var c = 0; c < b.width; c++) { bg[b.start][c] = b.color; fw[b.start][c] = 'bold'; fc[b.start][c] = b.color === '#3e4b33' ? '#ffffff' : '#2f3129';
      bg[b.start + 1][c] = b.soft; fw[b.start + 1][c] = 'bold'; fc[b.start + 1][c] = '#4a4c43'; }
    for (var r = b.start + 2; r <= b.end; r++) fw[r][0] = 'bold';
  });
  // 줄무늬: 홀수 줄 흰색, 짝수 줄 연한 매장 색
  blocks.forEach(function (b) { var n = 0; for (var r = b.start + 2; r <= b.end; r++) { n++; for (var c = 0; c < b.width; c++) bg[r][c] = n % 2 ? '#ffffff' : b.soft; } });
  cats.forEach(function (k) { for (var c = 0; c < k.width; c++) { bg[k.row][c] = k.color; fw[k.row][c] = 'bold'; fc[k.row][c] = '#2f3129'; } });
  var all = sh.getRange(1, 1, rows.length, W);
  all.setValues(rows).setBackgrounds(bg).setFontWeights(fw).setFontColors(fc)
    .setFontFamily(KREAM_FONT).setFontSize(11).setVerticalAlignment('middle');
  sh.getRange(1, 2, rows.length, W - 1).setHorizontalAlignment('center');
  sh.getRange(1, 1).setFontSize(16).setFontWeight('bold').setFontColor('#ed522e');
  sh.getRange(1, W).setFontSize(9).setFontColor('#9a9c90').setHorizontalAlignment('right');
  sh.setRowHeight(1, 38);
  titles.forEach(function (r) { sh.getRange(r + 1, 1).setFontWeight('bold').setFontSize(13); });
  blocks.forEach(function (b) {
    var n = b.end - b.start + 1, box = sh.getRange(b.start + 1, 1, n, b.width);
    box.setBorder(true, true, true, true, true, true, '#e2dfd3', SpreadsheetApp.BorderStyle.SOLID);
    box.setBorder(true, true, true, true, null, null, b.color, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
    sh.getRange(b.start + 1, 1, 1, b.width).merge().setFontSize(13).setHorizontalAlignment('left');
    sh.setRowHeight(b.start + 1, 32);
    sh.getRange(b.start + 2, 1, 1, b.width).setFontSize(10);
    sh.getRange(b.start + 2, 1).setHorizontalAlignment('left');
  });
  cats.forEach(function (k) { sh.getRange(k.row + 1, 1, 1, k.width).merge().setHorizontalAlignment('left').setFontSize(11); });
  sh.setColumnWidth(1, 210);
  for (var c = 2; c <= W; c++) sh.setColumnWidth(c, 96);
  sh.setFrozenRows(1);
}

// 날짜별 재고: B2에서 고른 매장의 최근 14일
function kreamRefreshStockDays(ss, logRows, groups) {
  var sh = ss.getSheetByName(KREAM_STOCK_DAYS);
  var chosen = String(sh.getRange(2, 2).getValue() || '');
  var store = KREAM_STOCK_STORES.filter(function (s) { return s.label === chosen; })[0] || KREAM_STOCK_STORES[0];
  var today = kreamCtx().date, days = [];
  for (var d = 0; d < 14; d++) days.push(kAddDays(today, -d));
  var byDay = {};
  logRows.forEach(function (r) { if (r.store_id === store.id) byDay[r.date + '|' + r.item_id] = r.count; });
  kreamDrawStockTable(sh, '날짜별 재고 · ' + store.label, '최근 14일 (그날 마지막으로 센 숫자)',
    ['제품', '단위'].concat(days.map(function (x) { return x.slice(5).replace('-', '/'); })),
    [null, null].concat(days.map(function (x, i) { return i === 0 ? store.color : null; })), groups,
    function (it, i) { var v = byDay[days[i] + '|' + it.id]; return [v == null ? '' : kreamStockShow(it, v), true]; },
    0, [null, null].concat(days.map(function () { return store.soft; })));
  sh.getRange(2, 1).setValue('매장 고르기 ▸').setFontWeight('bold').setFontFamily(KREAM_FONT);
  sh.getRange(2, 2, 1, 3).merge().setValue(store.label).setBackground(store.soft).setFontWeight('bold').setFontFamily(KREAM_FONT)
    .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(KREAM_STOCK_STORES.map(function (s) { return s.label; }), true).build());
}

function kreamRefreshStock() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  kreamStockTabs(ss);
  var logRows = kreamStockLogRows(ss), groups = kreamStockGroups(ss, logRows);
  kreamRefreshStockNow(ss, logRows, groups);
  kreamRefreshStockDays(ss, logRows, groups);
  PropertiesService.getScriptProperties().deleteProperty('stock_dirty');
}

// 5분마다: 새 기록이 있을 때만 새로고침
function kreamRefreshStockIfDirty() {
  if (PropertiesService.getScriptProperties().getProperty('stock_dirty') !== '1') return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try { kreamRefreshStock(); } finally { lock.releaseLock(); }
}

// 한 번 실행: 새 탭 만들고, 예전 데모 탭은 숨기고, 트리거 설치. 다시 실행해도 안전해요.
function kreamStockSetup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  kreamStockTabs(ss);
  var set = ss.getSheetByName('Settings');
  if (set && set.getDataRange().getValues().map(function (r) { return String(r[0]); }).indexOf('sync_key') < 0) {
    set.getRange(set.getLastRow() + 1, 1, 1, 3).setNumberFormat('@').setValues([['sync_key', KREAM_STOCK_DEFAULT_KEY, '직원 앱 → 이 시트 재고 기록용 암호 (앱 코드의 SYNC_KEY와 같아야 해요)']]);
  }
  kreamRefreshStock();
  [KREAM_STOCK_NOW, KREAM_STOCK_DAYS, KREAM_STOCK_LOG, KREAM_STOCK_ITEMS].forEach(function (name, i) {
    ss.setActiveSheet(ss.getSheetByName(name)); ss.moveActiveSheet(i + 1);
  });
  KREAM_STOCK_OLD_TABS.forEach(function (name) { var sh = ss.getSheetByName(name); if (sh) sh.hideSheet(); });
  var have = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'kreamRefreshStockIfDirty'; });
  if (!have) ScriptApp.newTrigger('kreamRefreshStockIfDirty').timeBased().everyMinutes(5).create();
  ss.setActiveSheet(ss.getSheetByName(KREAM_STOCK_NOW));
}
