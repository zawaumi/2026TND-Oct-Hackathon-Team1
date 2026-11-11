/**
 * Firebase の Web アプリの設定（ADR-016：ログインは Google アカウントのみ）。
 * この値はブラウザに公開する前提のもので、秘密情報ではない（API キーも Firebase の識別子）。
 * 別のプロジェクトを使うときは NEXT_PUBLIC_FIREBASE_* で上書きできる。
 * 秘密情報（DeepSeek などの API キー、サービスアカウントの鍵）はここにも NEXT_PUBLIC_* にも置かない。
 */
export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "AIzaSyDJP7nqT9qBx-mhlEaEfIwb0wAG1MOd498",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "tnd2026-oct-hackathon.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "tnd2026-oct-hackathon",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "tnd2026-oct-hackathon.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "618804505519",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "1:618804505519:web:0fb261a4d75dcccc16dd5a",
};
