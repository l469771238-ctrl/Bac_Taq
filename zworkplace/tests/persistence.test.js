'use strict';
// All tests use disposable databases and mocked remote storage; never touches production.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { DatabaseSync } = require('node:sqlite');
const { prefetch, open } = require('../server/db');
const storage = require('../server/storage');
const persist = require('../server/persist');

function makeDb(file, value) {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE test (value TEXT)');
  db.prepare('INSERT INTO test VALUES (?)').run(value);
  db.close();
}
function readValue(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try { return db.prepare('SELECT value FROM test').get().value; } finally { db.close(); }
}

test('restore validates and restores only when local DB is absent', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'zp-prefetch-'));
  try {
    const remote = path.join(dir, 'remote.db'); const local = path.join(dir, 'local.db');
    makeDb(remote, 'remote');
    const store = { get: async () => Readable.from([readFileSync(remote)]) };
    assert.equal((await prefetch(local, store, 'db')).restored, true);
    assert.equal(readValue(local), 'remote');
    rmSync(local); makeDb(local, 'newer local');
    assert.equal((await prefetch(local, store, 'db')).restored, false);
    assert.equal(readValue(local), 'newer local');
    await assert.rejects(prefetch(local, { get: async () => { throw new Error('network'); } }, 'db'), /تعذر/);
    assert.equal(readValue(local), 'newer local');
    const noFile = { get: async () => { throw Object.assign(new Error('missing'), { status: 404 }); } };
    assert.equal((await prefetch(local, noFile, 'db')).restored, false);
    const bad = { get: async () => Readable.from([Buffer.from('bad')]) };
    await assert.rejects(prefetch(local, bad, 'db'), /تالفة/);
    assert.equal(readValue(local), 'newer local');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a write during an in-flight snapshot remains dirty and is saved next time', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'zp-save-'));
  let resolve; const snapshots = [];
  storage.kind = 's3';
  storage.store = { put: ({body}) => { snapshots.push(Buffer.from(body)); return new Promise(r => { resolve = r; }); } };
  const db = open(path.join(dir, 'live.db'));
  try {
    db.exec('CREATE TABLE test (value TEXT)');
    db.prepare('INSERT INTO test VALUES (?)').run('first');
    const first = persist.flush();
    db.prepare('INSERT INTO test VALUES (?)').run('second');
    resolve(); await first;
    assert.equal(persist.status().dirty, true);
    const second = persist.flush(); resolve(); await second;
    assert.equal(persist.status().dirty, false);
    const snapshot = path.join(dir, 'snapshot.db'); writeFileSync(snapshot, snapshots[1]);
    const saved = new DatabaseSync(snapshot, { readOnly: true });
    assert.equal(saved.prepare('SELECT COUNT(*) n FROM test').get().n, 2); saved.close();
    db.prepare('INSERT INTO test VALUES (?)').run('third');
    const ongoing = persist.flush();
    db.prepare('INSERT INTO test VALUES (?)').run('fourth');
    const shutdownSave = persist.flush(true);
    resolve(); await ongoing;
    await new Promise(r => setImmediate(r));
    resolve(); assert.equal((await shutdownSave).ok, true);
    assert.equal(persist.status().dirty, false);
    writeFileSync(snapshot, snapshots[snapshots.length - 1]);
    const final = new DatabaseSync(snapshot, { readOnly: true });
    assert.equal(final.prepare('SELECT COUNT(*) n FROM test').get().n, 4); final.close();
  } finally { db.close(); rmSync(dir, { recursive: true, force: true }); }
});
