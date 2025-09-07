import axios from "axios";
export const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5000";

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
});

// Attach access token header
api.interceptors.request.use(config => {
  const t = localStorage.getItem("adminToken");
  if (t) config.headers.Authorization = `Bearer ${t}`;
  return config;
});

// Refresh-on-401 handler
let refreshing = null;
api.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config;
    if (err.response && err.response.status === 401 && !original._retry) {
      original._retry = true;

      if (!refreshing) {
        refreshing = axios.post(`${API_BASE}/token`, {}, { withCredentials: true })
          .then(r => {
            const newToken = r.data.token;
            localStorage.setItem("adminToken", newToken);
            return newToken;
          })
          .catch(() => {
            localStorage.removeItem("adminToken");
            return null;
          })
          .finally(() => (refreshing = null));
      }

      const newToken = await refreshing;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }
    return Promise.reject(err);
  }
);

export default api;
