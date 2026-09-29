// Optional cloud sync: Google sign-in (Firebase Auth) + one document per user in Firestore.
// Loaded by app.js only when window.FIREBASE_CONFIG is set.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut }
    from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc }
    from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js';

export function createCloud(config, onUser) {
    const app = initializeApp(config);
    const auth = getAuth(app), db = getFirestore(app);
    const ref = () => doc(db, 'users', auth.currentUser.uid);
    onAuthStateChanged(auth, u => onUser(u && { uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL }));
    return {
        signIn: () => signInWithPopup(auth, new GoogleAuthProvider()),
        signOut: () => signOut(auth),
        load: async () => { const snap = await getDoc(ref()); return snap.exists() ? snap.data() : null; },
        save: data => setDoc(ref(), data),
        remove: () => deleteDoc(ref()),
    };
}
