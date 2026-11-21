'use strict';
// Mock Google Drive; no credentials or real network required.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Writable, Readable } = require('node:stream');
const https = require('node:https');
const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
process.env.ZDRIVE_EMAIL = 'mock@example.test';
process.env.ZDRIVE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.ZDRIVE_FOLDER = 'test-folder';
let items = [];
let content = null;
https.request = (options, callback) => {
  const chunks = [];
  const req = new Writable({ write(chunk, enc, done) { chunks.push(Buffer.from(chunk)); done(); } });
  req.on('finish', () => {
    let body, status = 200;
    if (options.hostname === 'oauth2.googleapis.com') body = { access_token: 'mock', expires_in: 3600 };
    else if (options.method === 'GET' && options.path.startsWith('/drive/v3/files?q=')) body = { files: items.map(id => ({id})) };
    else if (options.method === 'POST' && options.path.startsWith('/upload/drive/v3/files?')) { items = ['snapshot-id']; content = Buffer.concat(chunks); body = {id: 'snapshot-id'}; }
    else if (options.method === 'PATCH' && options.path.startsWith('/upload/drive/v3/files/snapshot-id?')) { content = Buffer.concat(chunks); body = {id: 'snapshot-id'}; }
    else if (options.method === 'GET' && options.path.startsWith('/drive/v3/files/snapshot-id?alt=media')) body = content;
    else { status = 500; body = {error: 'unexpected request'}; }
    const res = Readable.from([Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))]);
    res.statusCode = status;
    callback(res);
  });
  return req;
};
const drive = require('../server/storage-drive');
test('snapshot create, update by ID, restore, and reject ambiguous duplicate names', async () => {
  await assert.rejects(drive.getSnapshot('db/zwork.db'), e => e.status === 404);
  await drive.putSnapshot({key: 'db/zwork.db', body: Buffer.from('first')});
  assert.equal(items.length, 1);
  await drive.putSnapshot({key: 'db/zwork.db', body: Buffer.from('second')});
  assert.equal(items.length, 1);
  const stream = await drive.getSnapshot('db/zwork.db');
  const chunks = []; for await (const c of stream) chunks.push(c);
  assert.equal(Buffer.concat(chunks).toString(), 'second');
  items.push('another-snapshot');
  await assert.rejects(drive.getSnapshot('db/zwork.db'), /متعددة/);
});
