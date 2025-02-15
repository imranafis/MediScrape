import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDrmSpJIywf0ZFc61bJkPVWObxoXxXwLxQ",
  authDomain: "mediscrape.firebaseapp.com",
  projectId: "mediscrape",
  storageBucket: "mediscrape.firebasestorage.app",
  messagingSenderId: "207817260049",
  appId: "1:207817260049:web:f23466db3b718b978745b0"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
