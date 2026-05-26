import { Route, Routes } from "react-router-dom";
import FacilityPage from "./pages/FacilityPage";
import InspectorPage from "./pages/InspectorPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";
import Navbar from "./components/Navbar";
import { ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <div style={{ paddingTop: "64px" }}>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<SearchPage />} />
            <Route path="/facility/:id" element={<FacilityPage />} />
            <Route path="/inspector/:id" element={<InspectorPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
          </Routes>
        </ErrorBoundary>
      </div>
      <ToastContainer />
    </div>
  );
}
