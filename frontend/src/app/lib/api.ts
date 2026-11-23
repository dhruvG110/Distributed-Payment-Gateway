import axios from "axios";
import { redirect } from "next/navigation";
import { useRouter } from "next/router";
console.log(process.env.NEXT_PUBLIC_AUTH_API_URL);
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_AUTH_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});
api.interceptors.response.use(
  (response) => response,
  checkSession
);
const walletApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_WALLET_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});
walletApi.interceptors.response.use(
  (response) => response,
  checkSession
);
const paymentApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_PAYMENT_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});
paymentApi.interceptors.response.use(
  (response) => response,
  checkSession
);
const notificationApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_NOTIFICATION_API_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});
notificationApi.interceptors.response.use((response)=>response , checkSession)
function checkSession(error: any) {
  console.log("API ERROR STATUS:", error.response?.status);
  console.log("API ERROR:", error.response?.data);

  if (error.response?.status === 401) {
    window.location.href = "/auth/login?reason=expired";
  }

  return Promise.reject(error);
}
export { api, walletApi, paymentApi, notificationApi };
