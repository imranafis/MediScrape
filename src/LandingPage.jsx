import React, { useCallback, useState, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { db } from "/src/lib/firebase";
import {
  addDoc,
  setDoc,
  collection,
  getDocs,
  getDoc,
  updateDoc,
  doc,
  deleteDoc,
  query,
  orderBy,
} from "firebase/firestore"; // Firestore imports
import "./LandingPage.css";

const LandingPage = () => {
  const navigate = useNavigate();
  const [medicines, setMedicines] = useState([]);
  const [doctorName, setDoctorName] = useState(null);
  const [tests, setTests] = useState([]);
  const [diseases, setDiseases] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [file, setFile] = useState(null);
  const [extractionAttempted, setExtractionAttempted] = useState(false);

  const medicineRefs = useRef([]);

  const userId = localStorage.getItem("userID");

  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length === 0) return;

    setFile(acceptedFiles[0]);
    setMedicines([]);
    setDoctorName(null);
    setError(null);
    setExtractionAttempted(false);
  }, []);

  const formReset = () => {
    setMedicines([]);
    setDoctorName(null);
    setFile(null);
    setExtractionAttempted(false);
  };

  const extractText = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setExtractionAttempted(false);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch(
        "https://mediscrape.onrender.com/MediScrape",
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        throw new Error("Failed to process the image.");
      }

      const data = await response.json();
      setMedicines(data.medicines || []);
      setDoctorName(data.doctorName || "Not Found");
      setTests(data.tests || []);
      setDiseases(data.diseases || []);
      setExtractionAttempted(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveData = async () => {
    if (medicines.length === 0 && tests.length === 0 && diseases.length === 0) {
      setError(
        "Doctor's name, medicines, tests, or diseases must be filled in."
      );
      return;
    }

    try {
      await addDoc(collection(db, userId), {
        doctorName,
        medicines,
        tests,
        diseases,
        date: new Date(),
      });

      alert("Data saved successfully!");

      // Clear the state
      formReset();
    } catch (err) {
      setError("Failed to save data to Firestore.");
      console.error(err);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [".jpeg", ".png", ".jpg"] },
    multiple: false,
  });

  const handleMedicineEdit = (index, newValue) => {
    const updatedMedicines = [...medicines];
    updatedMedicines[index] = newValue;
    setMedicines(updatedMedicines);
  };

  const handleMedicineDelete = (e, index) => {
    if (e.key === "Backspace" && e.target.textContent.trim() === "") {
      e.preventDefault();
      const updatedMedicines = [...medicines];
      updatedMedicines.splice(index, 1);
      setMedicines(updatedMedicines);
    }
  };

  const addMedicine = () => {
    setMedicines([...medicines, ""]);
  };

  const handleLogout = () => {
    localStorage.removeItem("userID");
    alert("Logged out successfully!");
    navigate("/"); // Redirect to login page
  };

  return (
    <>
      <div className="header">
        <button onClick={() => navigate("/history")} className="top-btn">
          History
        </button>
        <button onClick={() => navigate("/analysis")} className="top-btn">
          Analysis
        </button>
        <button onClick={handleLogout} className="top-btn">
          Logout
        </button>
      </div>
      <div className="container">
        <h1 className="title">Medicine Extractor</h1>
        <div
          {...getRootProps()}
          className={`dropzone ${isDragActive ? "dropzone-active" : ""}`}
        >
          <input {...getInputProps()} />
          <p>
            {isDragActive
              ? "Drop the image here..."
              : "Drag and drop an image, or click to select one (JPEG/PNG)."}
          </p>
        </div>

        {file && <p className="file-info">File selected: {file.name}</p>}

        <button
          onClick={extractText}
          className="extractBtn"
          disabled={!file || loading}
        >
          Extract Medicine
        </button>

        {loading && <p className="message">Processing, please wait...</p>}
        {error && <p className="message message-error">{error}</p>}

        {doctorName && (
          <div className="message message-text">
            <h3 className="title">Doctor's Name:</h3>
            <p
              contentEditable="true"
              spellCheck="false"
              suppressContentEditableWarning={true}
              onBlur={(e) => setDoctorName(e.target.textContent)}
            >
              {doctorName}
            </p>
          </div>
        )}

        {diseases.length > 0 && (
          <div className="message message-text">
            <h3 className="title">Diagnosed Diseases:</h3>
            {diseases.map((disease, index) => (
              <div key={index} className="editable-div">
                {disease}
              </div>
            ))}
          </div>
        )}

        {medicines.length > 0 && (
          <div className="message message-text">
            <h3 className="title">Validated Medicines:</h3>
            {medicines.map((medicine, index) => (
              <div
                key={index}
                className="editable-div"
                contentEditable="true"
                spellCheck="false"
                suppressContentEditableWarning={true}
                ref={(el) => (medicineRefs.current[index] = el)}
                onBlur={(e) => handleMedicineEdit(index, e.target.textContent)}
                onKeyDown={(e) => handleMedicineDelete(e, index)}
              >
                {medicine}
              </div>
            ))}
          </div>
        )}

        {tests.length > 0 && (
          <div className="message message-text">
            <h3 className="title">Prescribed Tests:</h3>
            {tests.map((test, index) => (
              <div key={index} className="editable-div">
                {test}
              </div>
            ))}
          </div>
        )}

        {extractionAttempted && medicines.length > 0 && (
          <>
            <div className="actionBtn">
              <button onClick={addMedicine} className="addBtn">
                Add Medicine
              </button>
              <button onClick={formReset} className="cancelBtn">
                Cancel
              </button>
              <button onClick={saveData} className="saveBtn">
                Save
              </button>
            </div>
          </>
        )}

        {extractionAttempted && medicines.length === 0 && (
          <p className="message">No valid medicines found in the image.</p>
        )}
      </div>
    </>
  );
};

export default LandingPage;
