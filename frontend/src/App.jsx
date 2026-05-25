import { Route, Routes } from "react-router-dom";
import FacilityPage from "./pages/FacilityPage";
import InspectorPage from "./pages/InspectorPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";
import Navbar from "./components/Navbar";

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <div style={{ paddingTop: "64px" }}>
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/facility/:id" element={<FacilityPage />} />
          <Route path="/inspector/:id" element={<InspectorPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
        </Routes>
      </div>
    </div>
  );
}
