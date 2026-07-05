import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

// Ativar persistência offline multi-abas para suportar quedas de conexão e funcionamento do PDV
if (typeof window !== 'undefined') {
  enableMultiTabIndexedDbPersistence(db)
    .then(() => {
      console.log('Persistência offline do Firestore ativada com sucesso!');
    })
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        // Múltiplas abas abertas, a persistência já está ativa em outra aba.
        console.warn('Persistência do Firestore: Outra aba já está aberta com persistência ativa.');
      } else if (err.code === 'unimplemented') {
        // O navegador não oferece suporte aos recursos necessários
        console.warn('Persistência do Firestore: Navegador atual não suporta IndexedDB.');
      } else {
        console.error('Erro ao ativar persistência offline do Firestore:', err);
      }
    });
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('offline')) {
      console.error("Firebase offline. Check config.");
    }
  }
}
testConnection();
