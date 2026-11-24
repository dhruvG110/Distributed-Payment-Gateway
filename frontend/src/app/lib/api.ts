
import axios from "axios";

const api = axios.create({
  baseURL: "/api/auth",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

const walletApi = axios.create({
  baseURL: "/api/wallet",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

const paymentApi = axios.create({
  baseURL: "/api/payments",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

const notificationApi = axios.create({
  baseURL: "/api/notifications",
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Debug API errors without forcing a redirect.
// Dashboard will handle session verification.
function checkSession(error: any) {
  console.log("API ERROR STATUS:", error.response?.status);
  console.log("API ERROR:", error.response?.data);

  return Promise.reject(error);
}

api.interceptors.response.use(
  (response) => response,
  checkSession
);

walletApi.interceptors.response.use(
  (response) => response,
  checkSession
);

paymentApi.interceptors.response.use(
  (response) => response,
  checkSession
);

notificationApi.interceptors.response.use(
  (response) => response,
  checkSession
);

export { api, walletApi, paymentApi, notificationApi };
