import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright-core';

const directory = await mkdtemp(join(tmpdir(), 'nexa-notes-'));
const origin = process.env.NOTES_TEST_ORIGIN || 'http://127.0.0.1:8897';
let server, browser, debugPage;
const owners = [];
async function request(auth, path = '', method = 'GET', body, extra = {}) {
  const response = await fetch(`${origin}/api/notebooks${auth ? `/${auth.id}${path}` : ''}`, { method, headers: { ...(auth ? { authorization: `Bearer ${auth.token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
}
const url = auth => `${origin}/#${new URLSearchParams({ notebook: auth.id, key: auth.token })}`;
try {
  if (!process.env.NOTES_TEST_ORIGIN) {
    server = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--ip', '127.0.0.1', '--port', '8897', '--persist-to', directory], { env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Local Worker did not start.')), 45000);
      const receive = chunk => { if (String(chunk).includes('Ready on')) { clearTimeout(timeout); resolve(); } };
      server.stdout.on('data', receive); server.stderr.on('data', receive);
      server.once('exit', code => { clearTimeout(timeout); reject(new Error(`Worker exited ${code}`)); });
    });
  }
  const created = await request(null, '', 'POST', { notes: [{ title: 'Test note', body: 'Original' }] });
  assert.equal(created.status, 201); const owner = { id: created.data.id, token: created.data.token }; owners.push(owner);
  const note = created.data.notes[0];
  const sharing = await request(owner, '/sharing', 'POST', { role: 'view' }); assert.equal(sharing.status, 200);
  const viewer = { id: owner.id, token: sharing.data.token };
  const editor = { id: owner.id, token: (await request(owner, '/sharing', 'POST', { role: 'edit' })).data.token };
  assert.equal((await request(viewer)).data.role, 'view');
  assert.equal((await request(viewer, '/notes', 'POST', { title: 'Forbidden', body: '' })).status, 403);
  assert.equal((await request(viewer, `/notes/${note.id}`, 'PUT', { ...note, body: 'Forbidden' })).status, 403);
  assert.equal((await request(viewer, `/notes/${note.id}`, 'DELETE', { version: note.version })).status, 403);
  assert.equal((await request(editor, '/sharing', 'POST', { role: 'view' })).status, 403);
  assert.equal((await request(editor, '', 'DELETE')).status, 403);
  assert.equal((await request({ id: owner.id, token: '0'.repeat(64) })).status, 403);
  const noAuth = await fetch(`${origin}/api/notebooks/${owner.id}`); assert.equal(noAuth.status, 401);
  assert.equal((await request(owner, '/notes', 'POST', { title: 'Cross origin', body: '' }, { origin: 'https://untrusted.example' })).status, 403);
  const race = await Promise.all(['First', 'Second'].map(body => request(editor, `/notes/${note.id}`, 'PUT', { ...note, body })));
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
  assert.equal((await request(owner, `/notes/${note.id}`, 'DELETE', { version: 1 })).status, 409);
  assert.equal((await request(owner, '/notes', 'POST', { title: 'Oversize', body: 'x'.repeat(100_001) })).status, 400);
  assert.equal((await request(owner, '/notes', 'POST', { title: 'Too large request', body: 'x'.repeat(120_000) })).status, 400);
  const independent = await request(null, '', 'POST', { notes: [] }); const other = { id: independent.data.id, token: independent.data.token }; owners.push(other);
  assert.equal((await request({ id: other.id, token: owner.token })).status, 403);
  await request(owner, '/sharing', 'DELETE');
  assert.equal((await request(viewer)).status, 403); assert.equal((await request(editor)).status, 403); assert.equal((await request(owner)).status, 200);
  const newEditor = { id: owner.id, token: (await request(owner, '/sharing', 'POST', { role: 'edit' })).data.token };
  const temporary = await request(newEditor, '/notes', 'POST', { title: 'Disposable', body: 'Editor can create' }); assert.equal(temporary.status, 201);
  assert.equal((await request(newEditor, `/notes/${temporary.data.id}`, 'DELETE', { version: 1 })).status, 200);
  console.log('API: durable CRUD, isolated notebooks, view/edit/owner access, revocation, size limits, origin checks, and simultaneous edit conflicts passed.');

  await mkdir('artifacts', { recursive: true });
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  debugPage = page;
  await page.goto(origin); await page.locator('.wiki').first().waitFor();
  await page.screenshot({ path: 'artifacts/notes-desktop.png' });
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme} ${width}: no overflow`);
      await page.screenshot({ path: `artifacts/notes-${theme}-${width}.png`, fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Create your notebook', exact: true }).click();
  await page.getByRole('button', { name: 'Share', exact: true }).waitFor();
  const authParams = new URLSearchParams(new URL(page.url()).hash.slice(1)); const uiOwner = { id: authParams.get('notebook'), token: authParams.get('key') }; owners.push(uiOwner);
  await page.getByRole('button', { name: 'New note', exact: false }).click();
  await page.getByLabel('Note title', { exact: true }).fill('Shared test');
  await page.getByLabel('Note Markdown').fill('Hello team. [[Start here]]\n\n<script>window.notesXSS = true</script><img src=x onerror="window.notesXSS=true"><a href="javascript:alert(1)">Unsafe</a><button id="share-link">Clobber</button>');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Saved');
  await page.reload(); await page.getByRole('button', { name: 'Shared test', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Shared test', exact: true }).click();
  assert.equal(await page.evaluate(() => window.notesXSS), undefined);
  assert.equal(await page.locator('#preview script, #preview img, #preview a[href^="javascript:"], #preview [id]').count(), 0);
  assert.equal(await page.locator('#preview .wiki').count(), 1);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Create sharing link' }).click(); await page.locator('#link-result:not([hidden])').waitFor();
  const viewURL = await page.getByLabel('Sharing link', { exact: true }).inputValue();
  await page.locator('#share-role').selectOption('edit');
  await page.getByRole('button', { name: 'Create sharing link' }).click(); await page.locator('#link-result:not([hidden])').waitFor();
  const editURL = await page.getByLabel('Sharing link', { exact: true }).inputValue();
  await page.keyboard.press('Escape'); assert.equal(await page.locator('dialog[open]').count(), 0);
  const secondContext = await browser.newContext(), second = await secondContext.newPage(); second.on('pageerror', error => errors.push(error.message));
  await second.goto(viewURL); await second.getByRole('button', { name: 'Shared test', exact: true }).waitFor();
  assert.equal(await second.getByRole('button', { name: 'Edit', exact: true }).count(), 0);
  assert.equal(await second.getByRole('button', { name: 'New note', exact: false }).isDisabled(), true);
  await second.goto(editURL); await second.getByRole('button', { name: 'Shared test', exact: true }).click();
  await second.getByRole('button', { name: 'Edit', exact: true }).click();
  await second.getByLabel('Note Markdown').fill('Updated in another browser.');
  await second.waitForFunction(() => document.querySelector('#status').textContent === 'Saved');
  await page.getByText('Updated in another browser.', { exact: true }).waitFor();

  // An offline local edit must survive both a remote edit and a page reload.
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); await context.setOffline(true);
  await page.getByLabel('Note Markdown').fill('My offline draft must survive.');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Draft on this device');
  await second.getByLabel('Note Markdown').fill('The other editor wins this revision.');
  await second.waitForFunction(() => document.querySelector('#status').textContent === 'Saved');
  await context.setOffline(false); await page.locator('#conflict:not([hidden])').waitFor();
  await page.reload(); await page.locator('#conflict:not([hidden])').waitFor();
  assert.equal(await page.getByLabel('Note Markdown').inputValue(), 'My offline draft must survive.');
  await page.getByRole('button', { name: 'Save my draft as a new note' }).click();
  await page.getByRole('button', { name: 'Shared test (my draft)', exact: true }).waitFor();
  assert.equal(await page.locator('#conflict').isHidden(), true);
  await page.getByLabel('Search notes').fill('offline draft');
  assert.equal(await page.locator('#note-list button').count(), 1);
  await page.getByLabel('Search notes').fill('');
  await page.locator('#import-file').setInputFiles({ name: 'Imported.md', mimeType: 'text/markdown', buffer: Buffer.from('Imported content. [[Start here]]') });
  await page.getByRole('button', { name: 'Imported', exact: true }).waitFor();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export', exact: true }).click();
  assert.equal((await downloadPromise).suggestedFilename(), 'Imported.md');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.locator('#preview .wiki').click();
  await page.getByRole('button', { name: 'Imported', exact: true }).nth(1).waitFor();
  assert.equal(await page.locator('#backlinks').isVisible(), true);
  // A remote deletion must also preserve the selected local draft across reload.
  await page.locator('#note-list').getByRole('button', { name: 'Imported', exact: true }).click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await context.setOffline(true);
  await page.getByLabel('Note Markdown').fill('Draft from a remotely deleted note.');
  await page.waitForFunction(() => document.querySelector('#status').textContent === 'Draft on this device');
  const imported = (await request(uiOwner)).data.notes.find(note => note.title === 'Imported');
  assert.equal((await request(uiOwner, `/notes/${imported.id}`, 'DELETE', { version: imported.version })).status, 200);
  await context.setOffline(false); await page.locator('#conflict:not([hidden])').waitFor();
  await page.reload(); await page.locator('#conflict:not([hidden])').waitFor();
  assert.equal(await page.getByLabel('Note Markdown').inputValue(), 'Draft from a remotely deleted note.');
  await page.getByRole('button', { name: 'Save my draft as a new note' }).click();
  await page.getByRole('button', { name: 'Imported (my draft)', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke all sharing links' }).click();
  await page.getByText('All view and edit links have been revoked.', { exact: false }).waitFor();
  await second.reload(); await second.getByText('This notebook link is invalid or has been revoked.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Browser: responsive themes, persistent notes, safe Markdown, wiki links, independent viewer/editor browsers, live sync, offline conflict recovery, reload, and revocation passed.');
} catch (error) {
  if (debugPage && !debugPage.isClosed()) {
    console.error('Browser diagnostics:', await debugPage.evaluate(() => ({ status: document.querySelector('#status')?.textContent, notice: document.querySelector('#notice')?.textContent, notes: [...document.querySelectorAll('#note-list button')].map(el => el.textContent), title: document.querySelector('#title')?.value, hasNotebookLink: location.hash.includes('notebook='), dialogs: document.querySelectorAll('dialog[open]').length })));
    await debugPage.screenshot({ path: 'artifacts/test-failure.png' });
  }
  throw error;
} finally {
  for (const auth of owners) await request(auth, '', 'DELETE').catch(() => {});
  await browser?.close(); server?.kill('SIGTERM');
  if (server && server.exitCode === null) await new Promise(resolve => server.once('exit', resolve));
  await rm(directory, { recursive: true, force: true });
}
