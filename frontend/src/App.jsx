import { Route, Routes } from "react-router-dom";
import FacilityPage from "./pages/FacilityPage";
import InspectorPage from "./pages/InspectorPage";
import SearchPage from "./pages/SearchPage";
import DashboardPage from "./pages/DashboardPage";
import DocumentReviewPage from "./pages/DocumentReviewPage";
import Layout from "./components/Layout";
import { ToastContainer } from "./components/Toast";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <Layout>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/facility/:id" element={<FacilityPage />} />
          <Route path="/inspector/:id" element={<InspectorPage />} />
          <Route path="/document-review" element={<DocumentReviewPage />} />
        </Routes>
      </ErrorBoundary>
      <ToastContainer />
    </Layout>
  );
}
