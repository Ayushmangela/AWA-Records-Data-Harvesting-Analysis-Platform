import { Route, Routes, Navigate, useLocation } from "react-router-dom";
import FacilityPage from "./pages/FacilityPage";
import InspectorPage from "./pages/InspectorPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";
import DocumentReviewPage from "./pages/DocumentReviewPage";
import InspectorsDirectoryPage from "./pages/InspectorsDirectoryPage";
import LandingPage from "./pages/LandingPage";
import FacilityComparisonPage from "./pages/FacilityComparisonPage";
import EnforcementListPage from "./pages/EnforcementListPage";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Helper component to redirect legacy /app/* paths to root-level equivalents
function AppRedirector() {
  const location = useLocation();
  const targetPath = location.pathname.replace(/^\/app/, "") || "/";
  return <Navigate to={targetPath + location.search + location.hash} replace />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Routes>
        {/* Public routes */}
        <Route path="/landing" element={<LandingPage />} />
        <Route path="/login" element={<LandingPage />} />

        {/* Redirect handler for legacy /app paths */}
        <Route path="/app/*" element={<AppRedirector />} />

        {/* Protected routes wrapped in ProtectedRoute and Layout */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/" element={<SearchPage />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/enforcement" element={<EnforcementListPage />} />
                  <Route path="/enforcement/:id" element={<EnforcementListPage />} />
                  <Route path="/facility-comparison" element={<FacilityComparisonPage />} />
                  <Route path="/facility/:id" element={<FacilityPage />} />
                  <Route path="/facility/:id/:tab" element={<FacilityPage />} />
                  <Route path="/inspectors" element={<InspectorsDirectoryPage />} />
                  <Route path="/inspector/:id" element={<InspectorPage />} />
                  <Route path="/document-review" element={<DocumentReviewPage />} />
                  <Route path="*" element={<Navigate to="/search" replace />} />
                </Routes>
                <ToastContainer />
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}
