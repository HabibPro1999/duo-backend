import admin from 'firebase-admin';
import type { Auth } from 'firebase-admin/auth';
import type { Storage } from 'firebase-admin/storage';
import { config } from '@config/app.config.js';

// Initialize Firebase Admin SDK
// Uses GOOGLE_APPLICATION_CREDENTIALS env var for service account
const app = admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  storageBucket: config.firebase.storageBucket,
});

// Explicit type annotations fix TypeScript inference error
export const firebaseAuth: Auth = app.auth();
export const firebaseStorage: Storage = app.storage();

/**
 * Verify Firebase ID token and return decoded token.
 */
export async function verifyToken(idToken: string) {
  return firebaseAuth.verifyIdToken(idToken);
}

/**
 * Create a new Firebase Auth user.
 */
export async function createFirebaseUser(email: string, password: string) {
  return firebaseAuth.createUser({
    email,
    password,
    emailVerified: true, // Admin-created accounts are pre-verified
  });
}

/**
 * Set custom claims on a Firebase user (role + clientId).
 */
export async function setCustomClaims(
  uid: string,
  claims: Record<string, unknown>
): Promise<void> {
  await firebaseAuth.setCustomUserClaims(uid, claims);
}

/**
 * Delete a Firebase Auth user.
 */
export async function deleteFirebaseUser(uid: string): Promise<void> {
  await firebaseAuth.deleteUser(uid);
}
