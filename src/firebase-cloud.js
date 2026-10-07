// Firebase client adapter. Firebase's public app configuration is not an AI key.
// The user's OpenAI key stays in this tab's closure and goes directly to OpenAI.
window.GameBuilderCloud = (() => {
  let settings = null, currentUser = null;
  const listeners = new Set();
  const ready = (async () => {
    const [appSDK, authSDK, storeSDK] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js')
    ]);
    const app = appSDK.initializeApp(window.__gbFirebaseConfig);
    const auth = authSDK.getAuth(app), db = storeSDK.getFirestore(app);
    if (window.__gbFirebaseEmulators) {
      authSDK.connectAuthEmulator(auth, window.__gbFirebaseEmulators.auth, { disableWarnings: true });
      storeSDK.connectFirestoreEmulator(db, '127.0.0.1', window.__gbFirebaseEmulators.firestorePort);
    }
    await authSDK.setPersistence(auth, authSDK.browserLocalPersistence);
    await authSDK.getRedirectResult(auth);
    await new Promise(resolve => {
      let first = true;
      authSDK.onAuthStateChanged(auth, user => {
        currentUser = user;
        for (const listener of listeners) listener(user ? { id: user.uid, name: user.displayName || user.email || 'Signed in' } : null);
        if (first) { first = false; resolve(); }
      });
    });
    return { authSDK, storeSDK, auth, db };
  })();
  const userPath = id => {
    if (!currentUser) throw new Error('Sign in with Google to access your cloud games.');
    return ['users', currentUser.uid, 'games', ...(id ? [id] : [])];
  };
  const clean = document => ({
    title: document.title, description: document.description || '', rules: document.rules || '', tutorial: document.tutorial || [],
    allowedPlayers: document.allowedPlayers || [2], hiddenInformation: !!document.hiddenInformation, code: document.code,
    chat: (document.chat || []).slice(-24).map(({ role, text, v }) => ({ role, text, ...(v === undefined ? {} : { v }) })),
    versions: (document.versions || []).slice(-5).map(({ n, note, code, at }) => ({ n, note: note || '', code, at: at || Date.now() })),
    createdAt: document.createdAt || Date.now(), updatedAt: Date.now()
  });
  return {
    backend: 'firebase',
    configure(value) { settings = value; },
    configured() { return !!settings; },
    async session() { await ready; return currentUser ? { id: currentUser.uid, name: currentUser.displayName || currentUser.email || 'Signed in' } : null; },
    onSession(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async signIn() {
      const { authSDK, auth } = await ready;
      return authSDK.signInWithRedirect(auth, new authSDK.GoogleAuthProvider());
    },
    async signOut() { const { authSDK, auth } = await ready; settings = null; await authSDK.signOut(auth); },
    async list() {
      const { storeSDK, db } = await ready;
      const snapshot = await storeSDK.getDocsFromServer(storeSDK.collection(db, ...userPath()));
      return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })).sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async save(id, document) {
      const { storeSDK, db } = await ready;
      const data = clean(document);
      if (new TextEncoder().encode(JSON.stringify(data)).length > 900000) throw new Error('This game is too large for one cloud document.');
      await storeSDK.setDoc(storeSDK.doc(db, ...userPath(id)), data);
      return { saved: true };
    },
    async remove(id) { const { storeSDK, db } = await ready; await storeSDK.deleteDoc(storeSDK.doc(db, ...userPath(id))); },
    async sample(prompt, options = {}) {
      if (!currentUser) throw new Error('Sign in with Google first.');
      if (!settings) throw new Error('Enter your OpenAI API key in AI settings first.');
      if (settings.provider !== 'openai') throw new Error('This Firebase demo currently supports OpenAI.');
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.key },
        body: JSON.stringify({ model: settings.model, input: prompt, max_output_tokens: 14000, store: false }),
        signal: options.signal
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'OpenAI rejected this key. Check API access.' :
        response.status === 429 ? 'OpenAI billing quota or rate limit reached. Check API billing and retry.' :
        response.status === 400 || response.status === 404 ? 'OpenAI rejected the request. Check the model ID.' : 'OpenAI is unavailable. Please retry.');
      const reply = await response.json();
      const text = (reply.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join('\n');
      if (!text) throw new Error('OpenAI returned no game code. Try again.');
      options.onText?.({ text });
      return { text, truncated: reply.status === 'incomplete' };
    },
    async importLibrary(library) {
      if (library.format !== 'gamebuilder-library-v1' || !Array.isArray(library.games)) throw new Error('Choose a GameBuilder library export.');
      const { storeSDK, db } = await ready;
      let imported = 0;
      for (const game of library.games) {
        if (!game.id || !/^[a-zA-Z0-9_-]{1,80}$/.test(game.id) || typeof game.code !== 'string' || typeof game.title !== 'string') throw new Error('The library contains an invalid game.');
        const existing = await storeSDK.getDocFromServer(storeSDK.doc(db, ...userPath(game.id)));
        if (existing.exists()) continue; // Preserve newer cloud edits on repeat imports.
        await this.save(game.id, game); imported++;
      }
      return imported;
    }
  };
})();
