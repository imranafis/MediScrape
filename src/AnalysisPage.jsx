import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "/src/lib/firebase";
import "./AnalysisPage.css"; // Add custom CSS for styling

const AnalysisPage = () => {
  const navigate = useNavigate();

  const [analysisData, setAnalysisData] = useState([]);
  const userId = localStorage.getItem("userID");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const snapshot = await getDocs(collection(db, userId));
        const medicines = snapshot.docs.flatMap((doc) => doc.data().medicines);
        const medicineCount = medicines.reduce((acc, med) => {
          acc[med] = (acc[med] || 0) + 1;
          return acc;
        }, {});
        setAnalysisData(Object.entries(medicineCount));
      } catch (err) {
        console.error("Failed to fetch analysis:", err);
      }
    };

    fetchData();
  }, [userId]);

  const handleLogout = () => {
    localStorage.removeItem("userID");
    alert("Logged out successfully!");
    navigate("/"); // Redirect to login page
  };

  return (
    <>
      <div className="header">
        <button onClick={() => navigate("/Landing")} className="top-btn">
          Home
        </button>
        <button onClick={() => navigate("/history")} className="top-btn">
          History
        </button>
        <button onClick={handleLogout} className="top-btn">
          Logout
        </button>
      </div>

      <div className="container">
        <h1 className="title">Medicine Analysis</h1>
        {analysisData.length > 0 ? (
          <div className="analysis-grid">
            {analysisData.map(([medicine, count]) => (
              <div key={medicine} className="analysis-card">
                <h2 className="medicine-name">{medicine}</h2>
                <p className="medicine-count">Count: {count}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-data">No analysis data found.</p>
        )}
      </div>
    </>
  );
};

export default AnalysisPage;
