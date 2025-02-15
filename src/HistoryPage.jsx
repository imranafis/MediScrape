import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "/src/lib/firebase";
import "./HistoryPage.css"; // Add custom CSS for styling

const HistoryPage = () => {
  const navigate = useNavigate();

  const [historyData, setHistoryData] = useState([]);
  const userId = localStorage.getItem("userID");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const snapshot = await getDocs(collection(db, userId));
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        setHistoryData(data);
      } catch (err) {
        console.error("Failed to fetch history:", err);
      }
    };

    fetchData();
  }, [userId]);

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, userId, id));
      setHistoryData((prevData) => prevData.filter((entry) => entry.id !== id));
      alert("Entry deleted successfully!");
    } catch (err) {
      console.error("Failed to delete entry:", err);
    }
  };

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
        <button onClick={() => navigate("/analysis")} className="top-btn">
          Analysis
        </button>
        <button onClick={handleLogout} className="top-btn">
          Logout
        </button>
      </div>

      <div className="container">
        <h1 className="title">History</h1>
        {historyData.length > 0 ? (
          <div className="history-grid">
            {historyData.map((entry) => (
              <div key={entry.id} className="history-card">
                <h3 className="doctor-name">Doctor Name: {entry.doctorName}</h3>
                <h4 className="medicine-title">Medicines:</h4>
                <ul className="medicine-list">
                  {entry.medicines.map((med, index) => (
                    <li key={index} className="medicine-item">
                      {med}
                    </li>
                  ))}
                </ul>
                <button
                  className="deleteBtn"
                  onClick={() => handleDelete(entry.id)}
                >
                Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="no-data">No history found.</p>
        )}
      </div>
    </>
  );
};

export default HistoryPage;
