const assert = require('node:assert/strict');
const fs = require('node:fs');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, setDoc, getDoc, collection, getDocs, deleteDoc, setLogLevel } = require('firebase/firestore');
setLogLevel('silent');
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-gamebuilder', firestore: {
    host: '127.0.0.1', port: 8080, rules: fs.readFileSync('firestore.rules', 'utf8')
  } });
  try {
    await env.clearFirestore();
    const alice = env.authenticatedContext('alice').firestore();
    const bob = env.authenticatedContext('bob').firestore();
    const guest = env.unauthenticatedContext().firestore();
    const game = { title: 'Cloud game', code: 'const game = {};', allowedPlayers: [2], createdAt: 1, updatedAt: 2 };
    await assertSucceeds(setDoc(doc(alice, 'users/alice/games/test'), game));
    const loaded = await assertSucceeds(getDoc(doc(alice, 'users/alice/games/test')));
    assert.equal(loaded.data().title, 'Cloud game');
    await assertSucceeds(getDocs(collection(alice, 'users/alice/games')));
    await assertFails(getDoc(doc(bob, 'users/alice/games/test')));
    await assertFails(setDoc(doc(bob, 'users/alice/games/test'), game));
    await assertFails(deleteDoc(doc(bob, 'users/alice/games/test')));
    await assertFails(getDoc(doc(guest, 'users/alice/games/test')));
    await assertFails(setDoc(doc(alice, 'users/alice/games/test'), { ...game, apiKey: 'must-not-be-saved' }));
    await assertFails(setDoc(doc(alice, 'users/alice/games/invalid'), { title: 'No code' }));
    await assertSucceeds(deleteDoc(doc(alice, 'users/alice/games/test')));
    console.log('FIRESTORE RULES PASSED: own-account CRUD; guest and cross-account access denied; key fields rejected');
  } finally { await env.cleanup(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
