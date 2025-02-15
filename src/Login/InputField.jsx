import React from "react";

const InputField = ({ type, placeholder, icon, value, onChange, id }) => {
  return (
    <div className="input-form">
      <span>
        <i className={icon}></i>
      </span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        id={id}
        required
        autoComplete="off"
        minLength={type === "password" ? 6 : undefined}
      />
    </div>
  );
};

export default InputField;
