import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

api.interceptors.request.use(config => {
  if (import.meta.env.VITE_API_KEY) {
    config.headers["X-API-Key"] = import.meta.env.VITE_API_KEY;
  }
  return config;
});

export async function searchFacilities(params = {}) {
  const query = {};
  if (params.name) query.name = params.name;
  if (params.state) query.state = params.state;
  if (params.license_type) query.license_type = params.license_type;
  if (params.has_violations === true) query.has_violations = true;
  if (params.has_violations === false) query.has_violations = false;
  if (params.species) query.species = params.species;
  if (params.severity) query.severity = params.severity;
  if (params.sort_by) query.sort_by = params.sort_by;
  if (params.offset !== undefined) query.offset = params.offset;
  if (params.limit !== undefined) query.limit = params.limit;
  if (params.cursor) query.cursor = params.cursor;
  if (params.include_total !== undefined) query.include_total = params.include_total;

  const { data } = await api.get("/facilities", { params: query });
  return data;
}

export async function getFacility(id) {
  const { data } = await api.get(`/facilities/${id}`);
  return data;
}

export async function getInspectors(params = {}) {
  const query = {};
  if (params.state) query.state = params.state;

  const { data } = await api.get("/inspectors", { params: query });
  return data;
}

export async function getInspector(id) {
  const { data } = await api.get(`/inspectors/${id}`);
  return data;
}

export async function getDashboardStats() {
  const { data } = await api.get("/dashboard/stats");
  return data;
}

export async function generateAISummary(id) {
  const { data } = await api.post(`/facilities/${id}/ai-summary`);
  return data;
}

export async function generateLegalMemo(id) {
  const { data } = await api.post(`/facilities/${id}/legal-memo`);
  return data;
}

export default api;
