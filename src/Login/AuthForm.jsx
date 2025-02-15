import React from "react";
import InputField from "./InputField.jsx";

const AuthForm = ({
  onSubmit,
  error,
  email,
  setEmail,
  password,
  setPassword,
}) => {
  const handleSubmit = () => {
    // Basic validation before submission
    if (!email || !password) {
      setError("Please fill in all fields");
    } else {
      onSubmit();
    }
  };

  return (
    <div className="form">
      <form>
        <InputField
          type="text"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          icon="fas fa-envelope"
        />
        <InputField
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          icon="fa-solid fa-lock"
        />
      </form>

      {/* Display error message if it exists */}
      {error && <div className="error">{error}</div>}

      <div id="goBtn" onClick={handleSubmit}>
        Go
      </div>
    </div>
  );
};

export default AuthForm;
