import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import AddApplication from "./pages/AddApplication";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ApplicationDetail from "./pages/ApplicationDetail";
import Integrations from "./pages/Integrations";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/applications" element={<Dashboard view="applications" />} />
        <Route path="/applications/:id" element={<ApplicationDetail />} />
        <Route path="/pipeline" element={<Dashboard view="pipeline" />} />
        <Route path="/calendar" element={<Dashboard view="calendar" />} />
        <Route path="/stats" element={<Dashboard view="stats" />} />
        <Route path="/integrations" element={<Integrations />} />
        <Route path="/reminders" element={<Dashboard view="reminders" />} />
        <Route path="/add" element={<AddApplication />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
