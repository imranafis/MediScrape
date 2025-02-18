import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import AuthForm from "./AuthForm.jsx";
import { setUser } from "/src/lib/user";
import {
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
} from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "/src/lib/firebase"; // Import your Firebase auth and firestore
import "./LoginPage.css";
import InputField from "./InputField.jsx";

const handleAuthError = (errorCode) => {
  switch (errorCode) {
    case "auth/weak-password":
      return "Weak password";
    case "auth/email-already-in-use":
      return "Email already in use";
    case "auth/invalid-email":
      return "Invalid email";
    case "auth/wrong-password":
      return "Wrong password";
    case "auth/user-not-found":
      return "User not found";
    default:
      return "Invalid credential";
  }
};

const LoginPage = () => {
  useEffect(() => {
    const handleOnLoad = (e) => {
      const userID = localStorage.getItem("userID");
      if (userID) {
        navigate("/Landing");
      }
    };

    handleOnLoad();
  }, []);

  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState(null);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const toggleSection = (section) => {
    setActiveSection(activeSection === section ? null : section);
    setError("");
  };

  const handleUserRedirect = async (user) => {
    const docSnap = await getDoc(doc(db, "users", user.uid));
    if (!docSnap.exists()) {
      await setDoc(doc(db, "users", user.uid), {
        Email: user.email,
      });
    }
    setUser(user.displayName, user.uid);
    navigate("/Landing");
  };

  const handleForgetPass = async () => {
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Reset email sent!");
      toggleSection("login");
    } catch (error) {
      setError("Failed to send reset email. Please try again.");
    }
  };

  const handleFormSubmit = async () => {
    try {
      if (activeSection === "login") {
        const userCredential = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
        const user = userCredential.user;
        console.log("Logged in:", user.uid);

        if (user.emailVerified) {
          await handleUserRedirect(user);
        } else {
          setError("Please verify your email first!");
        }
      } else if (activeSection === "signup") {
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
        const user = userCredential.user;
        console.log("Signed up:", user.uid);

        await setDoc(doc(db, "users", user.uid), {
          Email: user.email,
        });
        localStorage.setItem("userLevel", "Beginner");

        await sendEmailVerification(user);
        alert(
          "Verification email sent! Please verify your email before proceeding."
        );
        toggleSection("login");
      }
    } catch (error) {
      console.error("Error:", error.message);
      const errorMsg = handleAuthError(error.code);
      setError(errorMsg); // Set the error message to display in the form
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      console.log("Google Sign-In:", user.uid);

      await handleUserRedirect(user);
    } catch (error) {
      console.error("Error during Google Sign-In:", error.message);
      setError("Google Sign-In failed. Please try again.");
    }
  };

  return (
    <div className="container-Login">
      <div className="auth-panel">
        <div className="intro">
          <p className="text">Welcome!</p>
        </div>
        <div className="formBtn" onClick={handleGoogleSignIn}>
          Login with Gmail
        </div>
        <div className="formBtn" onClick={() => toggleSection("login")}>
          Login with Email
        </div>
        {activeSection === "login" && (
          <AuthForm
            onSubmit={handleFormSubmit}
            error={error}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
          />
        )}

        <div className="formBtn" onClick={() => toggleSection("signup")}>
          Sign-Up
        </div>
        {activeSection === "signup" && (
          <AuthForm
            onSubmit={handleFormSubmit}
            error={error}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
          />
        )}

        <div id="forgetPassBtn" onClick={() => toggleSection("forgetpass")}>
          Forget Password
        </div>
        {activeSection === "forgetpass" && (
          <div className="form">
            <form>
              <InputField
                type="text"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon="fas fa-envelope"
              ></InputField>
            </form>

            <div id="goBtn" onClick={handleForgetPass}>
              Go
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
