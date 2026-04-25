import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import dotenv from "dotenv";

function AddApplication() {
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState(""); // 1. Add email state
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      // 2. Send the email to the backend
      await axios.post(`${process.env.REACT_APP_API_URL}api/applications`, {
        company,
        role,
        email, 
        status: "applied"
      });
      navigate("/"); // Go back to dashboard
    } catch (err) {
      alert("Error adding application");
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Add New Application</h2>
      <form onSubmit={handleSubmit}>
        <input 
          placeholder="Company Name" 
          value={company} 
          onChange={(e) => setCompany(e.target.value)} 
          required 
        />
        <input 
          placeholder="Job Role" 
          value={role} 
          onChange={(e) => setRole(e.target.value)} 
          required 
        />
        {/* 3. Add the Email Input Field */}
        <input 
          type="email"
          placeholder="Recruiter/HR Email" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
        />
        <button type="submit">Add Application</button>
      </form>
    </div>
  );
}

export default AddApplication;