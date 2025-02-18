import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
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
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
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

  const downloadPDF = () => {
    const doc = new jsPDF();
    doc.text("Medical History Report", 14, 15);

    const tableData = historyData.map((entry) => [
      entry.doctorName,
      entry.disease,
      entry.medicines.join(", "),
      entry.tests?.length > 0 ? entry.tests.join(", ") : "No tests prescribed",
    ]);

    autoTable(doc, {
      head: [["Doctor Name", "Disease", "Medicines", "Prescribed Tests"]],
      body: tableData,
      startY: 25,
    });

    doc.save("Medical_History.pdf");
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
        <button onClick={downloadPDF} className="pdf-btn">
          Download PDF
        </button>

        {historyData.length > 0 ? (
          <div className="history-grid">
            {historyData.map((entry) => (
              <div key={entry.id} className="history-card">
                <h3 className="doctor-title">Doctor Name: </h3>
                <p className="doctor-name">{entry.doctorName}</p>

                <h3 className="disease-title">Disease:</h3>
                <p className="disease-name">{entry.disease}</p>

                <h3 className="medicine-title">Medicines:</h3>
                <ul className="medicine-list">
                  {entry.medicines.map((med, index) => (
                    <li key={index} className="medicine-item">
                      {med}
                    </li>
                  ))}
                </ul>

                <h3 className="test-title">Prescribed Tests:</h3>
                {entry.tests && entry.tests.length > 0 ? (
                  <ul className="test-list">
                    {entry.tests.map((test, index) => (
                      <li key={index} className="test-item">
                        {test}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="test-name">No tests prescribed</p>
                )}

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
