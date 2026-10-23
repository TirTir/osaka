const { test } = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const { readFileSync, readdirSync } = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

class NextRequest extends Request {
  get nextUrl() { return new URL(this.url); }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  }
  for (const id of ['owner', 'viewer', 'outsider']) {
    sqlite.prepare("INSERT INTO users(id,email,password_hash,password_salt,created_at) VALUES (?,?, 'unused','unused','2026-10-23')").run(id, `${id}@example.test`);
  }
  const editToken = 'a'.repeat(64), viewToken = 'b'.repeat(64);
  const sha256 = async value => createHash('sha256').update(value).digest('hex');
  sqlite.prepare("INSERT INTO trips(id,title,token_hash,view_token_hash,owner_user_id,created_at) VALUES ('trip','旅行',?,?, 'owner','2026-10-23')")
    .run(createHash('sha256').update(editToken).digest('hex'), createHash('sha256').update(viewToken).digest('hex'));
  sqlite.prepare("INSERT INTO trips(id,title,token_hash,owner_user_id,created_at) VALUES ('private','비공개','other','outsider','2026-10-22')").run();
  sqlite.prepare("INSERT INTO place_collections(id,trip_id,name,is_default,created_at) VALUES ('default','trip','기본',1,'2026-10-23'),('foreign','private','비공개',1,'2026-10-23')").run();
  sqlite.prepare("INSERT INTO trip_shares(id,trip_id,user_id,role,created_at) VALUES ('share','trip','viewer','view','2026-10-23')").run();
  sqlite.prepare("INSERT INTO places(id,trip_id,name,lat,lon,position,created_at) VALUES ('usj','trip','유니버설 스튜디오 재팬',34.665,135.432,1,'2026-10-23')").run();
  let roundTrips = 0;
  function prepare(sql, values = []) {
    return {
      bind(...bound) { return prepare(sql, bound); },
      read() { return { results: sqlite.prepare(sql).all(...values) }; },
      async all() { roundTrips++; return this.read(); },
      async first() { roundTrips++; return sqlite.prepare(sql).get(...values) || null; },
      async run() { roundTrips++; const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
    };
  }
  const database = { prepare, async batch(statements) { roundTrips++; return statements.map(statement => statement.read()); } };
  const auth = {
    db: () => database, sha256, randomToken: () => 'c'.repeat(64),
    sameOrigin: request => request.headers.get('origin') === request.nextUrl.origin,
    getSessionUser: async request => {
      const id = request.headers.get('x-test-user');
      if (!id) return null;
      roundTrips++;
      return sqlite.prepare('SELECT id,email FROM users WHERE id=?').get(id) || null;
    },
  };
  function load(path, extra = {}) {
    const exports = {};
    const code = ts.transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { exports, URL, Headers, crypto: globalThis.crypto, console, ...extra,
      require: name => name === 'next/server' ? { NextRequest, NextResponse: Response } : auth });
    return exports;
  }
  const board = load('app/api/board/route.ts');
  function request(path, user, init = {}) {
    const headers = { Origin: 'https://app.test', ...(user ? { 'x-test-user': user } : {}), ...init.headers };
    return new NextRequest(`https://app.test${path}`, { ...init, headers });
  }
  return { board, sqlite, request, viewToken, editToken, load, trips: () => roundTrips, reset: () => { roundTrips = 0; } };
}

test('initial load returns user, trips and selected places within four database round trips', async () => {
  const f = fixture();
  const response = await f.board.GET(f.request('/api/board?list=1&initial=1&id=private', 'owner'));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.user.id, 'owner');
  assert.deepEqual(data.trips.map(trip => trip.id), ['trip']);
  assert.equal(data.trip.id, 'trip'); // A requested foreign board cannot escape the access filter.
  assert.equal(data.places[0].name, '유니버설 스튜디오 재팬');
  assert.ok(f.trips() <= 4);
  f.sqlite.close();
});

test('initial load without a valid session returns no private data', async () => {
  const f = fixture();
  const response = await f.board.GET(f.request('/api/board?list=1&initial=1'));
  assert.deepEqual(await response.json(), { user: null, trips: [] });
  assert.equal(f.trips(), 0);
  f.sqlite.close();
});

test('shared viewers receive places, but never the owner share list or write access', async () => {
  const f = fixture();
  const data = await (await f.board.GET(f.request('/api/board?list=1&initial=1', 'outsider', { headers: { Authorization: `Bearer ${f.viewToken}` } }))).json();
  assert.equal(data.trip.id, 'trip');
  assert.equal(data.access, 'view');
  assert.equal(data.tokenUsed, true);
  assert.deepEqual(data.shares, []);
  const denied = await f.board.POST(f.request('/api/board?id=trip', 'viewer', {
    method: 'POST', body: JSON.stringify({ action: 'add', place: { name: '禁止', lat: 34.6, lon: 135.4 } }),
  }));
  assert.equal(denied.status, 403);
  f.sqlite.close();
});

test('invalid shared links are flagged and private board reads remain unauthorized', async () => {
  const f = fixture();
  const response = await f.board.GET(f.request('/api/board?list=1&initial=1', 'viewer', { headers: { Authorization: `Bearer ${'d'.repeat(64)}` } }));
  const data = await response.json();
  assert.equal(data.invalidToken, true);
  assert.equal(data.tokenUsed, false);
  assert.equal((await f.board.GET(f.request('/api/board?id=private', 'owner'))).status, 401);
  f.sqlite.close();
});

test('saving returns the actual row for immediate display and rejects another trip category', async () => {
  const f = fixture();
  const response = await f.board.POST(f.request('/api/board?id=trip', 'owner', {
    method: 'POST', body: JSON.stringify({ action: 'add', place: { name: '難波', category: 'place', collectionId: 'foreign', lat: 34.66, lon: 135.5 } }),
  }));
  const data = await response.json();
  assert.equal(response.status, 201);
  assert.equal(data.place.collectionId, 'default');
  assert.equal(data.place.position, 2);
  assert.equal(data.place.id, data.id);
  assert.equal(f.sqlite.prepare('SELECT name FROM places WHERE id=?').get(data.id).name, data.place.name);
  assert.ok(f.trips() <= 3);
  f.sqlite.close();
});

test('map starts without a configuration request and preloads Places for the first search', async () => {
  const exports = {};
  const code = ts.transpileModule(readFileSync('lib/google-maps.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  let src;
  const maps = { loaded: true };
  const window = { setTimeout: () => 1, clearTimeout() {} };
  vm.runInNewContext(code, { exports, window, google: { maps }, URLSearchParams,
    fetch: () => { throw new Error('unnecessary configuration request'); },
    document: { createElement: () => ({ remove() {} }), head: { appendChild(script) { src = script.src; window.initOsakaGoogleMap(); } } },
  });
  const first = exports.loadGoogleMaps('browser-test-key');
  assert.equal(first, exports.loadGoogleMaps('browser-test-key'));
  assert.equal(await first, maps);
  assert.equal(new URL(src).searchParams.get('libraries'), 'places');
});

test('batched itinerary reads preserve owner and viewer data boundaries', async () => {
  const f = fixture();
  f.sqlite.exec(`
    INSERT INTO itineraries(id,trip_id,owner_user_id,title,created_at) VALUES ('plan','trip','owner','旅程','2026-10-23');
    INSERT INTO itinerary_shares(id,itinerary_id,user_id,created_at) VALUES ('plan-share','plan','viewer','2026-10-23');
    INSERT INTO route_variants(id,itinerary_id,day,name,created_at) VALUES ('variant','plan',1,'Day 1','2026-10-23');
    INSERT INTO route_stops(id,variant_id,place_id,position,created_at) VALUES ('stop','variant','usj',1,'2026-10-23');
  `);
  const routes = f.load('app/api/itineraries/route.ts');
  const owner = await (await routes.GET(f.request('/api/itineraries?id=plan', 'owner'))).json();
  assert.equal(owner.itinerary.access, 'owner');
  assert.equal(owner.stops[0].id, 'usj');
  assert.equal(owner.places.length, 1);
  assert.equal(owner.shares.length, 1);
  assert.ok(f.trips() <= 3);
  f.reset();
  const viewer = await (await routes.GET(f.request('/api/itineraries?id=plan', 'viewer'))).json();
  assert.equal(viewer.itinerary.access, 'view');
  assert.equal(viewer.stops.length, 1);
  assert.deepEqual(viewer.places, []);
  assert.deepEqual(viewer.collections, []);
  assert.deepEqual(viewer.shares, []);
  assert.equal((await routes.GET(f.request('/api/itineraries?id=plan', 'outsider'))).status, 403);
  f.sqlite.close();
});

function routeFixture() {
  const f = fixture();
  f.sqlite.exec(`
    INSERT INTO itineraries(id,trip_id,owner_user_id,title,created_at) VALUES ('plan','trip','owner','여행 동선','2026-10-23');
    INSERT INTO route_variants(id,itinerary_id,day,name,created_at) VALUES ('variant','plan',1,'Day 1','2026-10-23');
    INSERT INTO route_stops(id,variant_id,place_id,position,created_at) VALUES ('stop','variant','usj',1,'2026-10-23');
  `);
  const routes = f.load('app/api/itineraries/route.ts');
  const mutate = (method, user, body, suffix = '', headers = {}) => routes[method](f.request(`/api/itineraries${suffix}`, user, {
    method, ...(method === 'DELETE' ? {} : { body: JSON.stringify({ itineraryId: 'plan', ...body }) }), headers,
  }));
  const read = (user, path = '?id=plan', headers = {}) => routes.GET(f.request(`/api/itineraries${path}`, user, { headers }));
  return { ...f, routes, mutate, read };
}

test('sharing a travel list also lists its routes with original author and inherited role', async () => {
  const f = routeFixture();
  const list = await (await f.read('viewer', '?list=1')).json();
  assert.equal(list.itineraries[0].id, 'plan');
  assert.equal(list.itineraries[0].ownerEmail, 'owner@example.test');
  assert.equal(list.itineraries[0].access, 'view');
  assert.equal((await f.read('viewer')).status, 200);
  assert.equal((await f.mutate('PATCH', 'viewer', { action: 'leg', stopId: 'stop', transportMode: 'rail', fareYen: 240 })).status, 403);
  f.sqlite.prepare("UPDATE trip_shares SET role='edit' WHERE id='share'").run();
  const editor = await (await f.read('viewer')).json();
  assert.equal(editor.itinerary.access, 'edit');
  assert.equal(editor.places.length, 1);
  assert.equal(editor.shares.length, 0);
  assert.equal((await f.mutate('PATCH', 'viewer', { action: 'leg', stopId: 'stop', transportMode: 'rail', fareYen: 240 })).status, 200);
  f.sqlite.prepare("DELETE FROM trip_shares WHERE id='share'").run();
  assert.equal((await f.read('viewer')).status, 403);
  assert.deepEqual((await (await f.read('viewer', '?list=1')).json()).itineraries, []);
  f.sqlite.close();
});

test('view and edit travel links also apply to routes and rotating a link revokes access', async () => {
  const f = routeFixture();
  assert.equal((await f.read('outsider')).status, 403);
  const viewHeaders = { Authorization: `Bearer ${f.viewToken}` };
  const editHeaders = { Authorization: `Bearer ${f.editToken}` };
  const list = await (await f.read('outsider', '?list=1', viewHeaders)).json();
  assert.equal(list.itineraries[0].access, 'view');
  assert.equal((await f.read('outsider', '?id=plan', viewHeaders)).status, 200);
  assert.equal((await f.mutate('PATCH', 'outsider', { action: 'leg', stopId: 'stop', transportMode: 'walk', fareYen: 0 }, '', viewHeaders)).status, 403);
  assert.equal((await f.mutate('PATCH', 'outsider', { action: 'leg', stopId: 'stop', transportMode: 'walk', fareYen: 0 }, '', editHeaders)).status, 200);
  f.sqlite.prepare("UPDATE trips SET token_hash='rotated' WHERE id='trip'").run();
  assert.equal((await f.read('outsider', '?id=plan', editHeaders)).status, 403);
  f.sqlite.close();
});

test('author can grant, downgrade and remove individual route access without transferring ownership', async () => {
  const f = routeFixture();
  assert.equal((await f.mutate('POST', 'owner', { action: 'share', email: 'outsider@example.test', role: 'edit' })).status, 200);
  assert.equal((await f.mutate('PATCH', 'outsider', { action: 'itinerary', title: '편집한 동선', dayCount: 1, ownerUserId: 'outsider' })).status, 200);
  const edited = await (await f.read('outsider')).json();
  assert.equal(edited.itinerary.title, '편집한 동선');
  assert.equal(edited.itinerary.ownerUserId, 'owner');
  assert.equal(edited.itinerary.ownerEmail, 'owner@example.test');
  assert.equal((await f.mutate('POST', 'owner', { action: 'share', email: 'outsider@example.test', role: 'view' })).status, 200);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS count FROM itinerary_shares WHERE itinerary_id='plan' AND user_id='outsider'").get().count, 1);
  assert.equal((await f.mutate('PATCH', 'outsider', { action: 'itinerary', title: '수정 금지', dayCount: 1 })).status, 403);
  assert.equal((await f.mutate('POST', 'outsider', { action: 'variant', day: 1 })).status, 403);
  assert.equal((await f.mutate('POST', 'outsider', { action: 'stop', variantId: 'variant', placeId: 'usj' })).status, 403);
  assert.equal((await f.mutate('DELETE', 'outsider', {}, '?itineraryId=plan&stopId=stop')).status, 403);
  assert.equal((await f.mutate('PATCH', 'outsider', { action: 'leg', stopId: 'stop', transportMode: 'taxi', fareYen: 1000 }, '', { Authorization: `Bearer ${f.editToken}` })).status, 403);
  const row = f.sqlite.prepare("SELECT id FROM itinerary_shares WHERE itinerary_id='plan' AND user_id='outsider'").get();
  assert.equal((await f.mutate('DELETE', 'owner', {}, `?itineraryId=plan&shareId=${row.id}`)).status, 200);
  assert.equal((await f.read('outsider')).status, 403);
  f.sqlite.close();
});

test('route editors can change stops but cannot share access or delete the original route', async () => {
  const f = routeFixture();
  await f.mutate('POST', 'owner', { action: 'share', email: 'outsider@example.test', role: 'edit' });
  assert.equal((await f.mutate('POST', 'outsider', { action: 'stop', variantId: 'variant', placeId: 'usj' })).status, 201);
  const editorStop = f.sqlite.prepare("SELECT id FROM route_stops WHERE id <> 'stop'").get();
  assert.equal((await f.mutate('PATCH', 'outsider', { action: 'move', stopId: editorStop.id, direction: -1 })).status, 200);
  assert.equal((await f.mutate('DELETE', 'outsider', {}, `?itineraryId=plan&stopId=${editorStop.id}`)).status, 200);
  assert.equal((await f.mutate('POST', 'outsider', { action: 'share', email: 'viewer@example.test', role: 'edit' })).status, 403);
  const share = f.sqlite.prepare("SELECT id FROM itinerary_shares WHERE user_id='outsider'").get();
  assert.equal((await f.mutate('DELETE', 'outsider', {}, `?itineraryId=plan&shareId=${share.id}`)).status, 403);
  assert.equal((await f.mutate('DELETE', 'outsider', {}, '?itineraryId=plan&delete=itinerary')).status, 403);
  assert.ok(f.sqlite.prepare("SELECT id FROM itineraries WHERE id='plan'").get());
  f.sqlite.close();
});

test('individual view overrides travel edit and can be reset to follow travel permissions', async () => {
  const f = routeFixture();
  f.sqlite.prepare("UPDATE trip_shares SET role='edit' WHERE id='share'").run();
  const inherited = await (await f.read('owner')).json();
  assert.equal(inherited.shares[0].source, 'trip');
  assert.equal(inherited.shares[0].role, 'edit');
  await f.mutate('POST', 'owner', { action: 'share', email: 'viewer@example.test', role: 'view' });
  assert.equal((await (await f.read('viewer')).json()).itinerary.access, 'view');
  const settings = await (await f.read('owner')).json();
  assert.equal(settings.shares[0].source, 'itinerary');
  assert.equal(settings.shares[0].inheritedRole, 'edit');
  await f.mutate('DELETE', 'owner', {}, `?itineraryId=plan&shareId=${settings.shares[0].id}`);
  assert.equal((await (await f.read('viewer')).json()).itinerary.access, 'edit');
  f.sqlite.close();
});

test('viewers cannot create routes, and only the route author manages permissions even for a travel owner', async () => {
  const f = routeFixture();
  assert.equal((await f.mutate('POST', 'viewer', { action: 'create', tripId: 'trip' })).status, 403);
  assert.equal((await f.mutate('POST', 'outsider', { action: 'create', tripId: 'trip' }, '', { Authorization: `Bearer ${f.viewToken}` })).status, 403);
  f.sqlite.prepare("UPDATE trip_shares SET role='edit' WHERE id='share'").run();
  const created = await (await f.mutate('POST', 'viewer', { action: 'create', tripId: 'trip' })).json();
  assert.equal(created.itinerary.ownerUserId, 'viewer');
  const sharedRoute = await (await f.read('owner', `?id=${created.itinerary.id}`)).json();
  assert.equal(sharedRoute.itinerary.access, 'edit');
  assert.equal(sharedRoute.itinerary.ownerEmail, 'viewer@example.test');
  assert.equal((await f.mutate('POST', 'owner', { action: 'share', itineraryId: created.itinerary.id, email: 'outsider@example.test', role: 'edit' })).status, 403);
  f.sqlite.close();
});

test('invalid roles and cross-origin requests never expand route access', async () => {
  const f = routeFixture();
  assert.equal((await f.mutate('POST', 'owner', { action: 'share', email: 'outsider@example.test', role: 'owner' })).status, 400);
  assert.equal((await f.mutate('POST', 'owner', { action: 'share', email: 'outsider@example.test', role: 'edit' }, '', { Origin: 'https://other.test' })).status, 403);
  assert.equal((await f.read('outsider')).status, 403);
  f.sqlite.close();
});

test('permission errors retain their message while HTML login errors stay readable', async () => {
  const f = fixture();
  const { readApiResponse } = f.load('lib/api-response.ts');
  await assert.rejects(readApiResponse(Response.json({ error: '편집 권한이 없습니다.' }, { status: 403 })), error => error.status === 403 && /편집 권한/.test(error.message));
  await assert.rejects(readApiResponse(new Response('<!DOCTYPE html>', { status: 401 })), /로그인/);
  f.sqlite.close();
});

test('migration preserves existing route shares as view-only', () => {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = readdirSync('drizzle').filter(name => name.endsWith('.sql')).sort();
  for (const name of migrations.slice(0, 6)) sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  sqlite.exec(`
    INSERT INTO users(id,email,password_hash,password_salt,created_at) VALUES ('u','u@example.test','unused','unused','2026-10-23');
    INSERT INTO trips(id,title,token_hash,owner_user_id,created_at) VALUES ('t','Trip','hash','u','2026-10-23');
    INSERT INTO itineraries(id,trip_id,owner_user_id,title,created_at) VALUES ('i','t','u','Route','2026-10-23');
    INSERT INTO itinerary_shares(id,itinerary_id,user_id,created_at) VALUES ('s','i','u','2026-10-23');
  `);
  for (const name of migrations.slice(6)) sqlite.exec(readFileSync(`drizzle/${name}`, 'utf8'));
  assert.equal(sqlite.prepare("SELECT role FROM itinerary_shares WHERE id='s'").get().role, 'view');
  sqlite.close();
});
