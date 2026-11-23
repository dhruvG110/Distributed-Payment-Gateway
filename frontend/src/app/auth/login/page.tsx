"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import axios from "axios";
import { useLogin } from "@/app/hooks/useLogin";
import { useRouter } from "next/navigation";

export default function Page() {
  const router = useRouter();
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("reason") === "expired") {
      setSessionExpired(true);
    }
  }, []);
  const [form, setForm] = useState({
    email: "",
    password: "",
  });

  const loginMutation = useLogin();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    loginMutation.mutate(form, {
      onSuccess: () => {
        setForm({
          email: "",
          password: "",
        });

        router.push("/dashboard");
      },
    });
  }

  const errorMessage = axios.isAxiosError(loginMutation.error)
    ? loginMutation.error.response?.data?.message ||
      "Login failed. Please try again."
    : "Something went wrong.";

  return (
    <main className="min-h-screen bg-[#f7f8fa] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            PayMesh
          </h1>

          <p className="mt-2 text-sm text-gray-500">
            Your payments, simplified.
          </p>
        </div>

        {/* Login Form */}
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Login to your account
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Enter your details to login.
          </p>
          {sessionExpired && (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-800">
                Session expired
              </p>
              <p className="mt-1 text-sm text-amber-700">
                Your session has expired. Please login again to continue using
                PayMesh.
              </p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            {/* Email */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Email Address
              </label>

              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="you@example.com"
                maxLength={255}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-gray-900"
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Password
              </label>

              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="Enter your password"
                minLength={8}
                maxLength={72}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-gray-900"
              />
            </div>

            {/* Error */}
            {loginMutation.isError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {errorMessage}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loginMutation.isPending ? "Logging in..." : "Login"}
            </button>
          </form>

          {/* Register Link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Don&#39;t have an account?{" "}
            <Link
              href="/auth/register"
              className="font-semibold text-gray-900 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Secure payments powered by PayMesh.
        </p>
      </div>
    </main>
  );
}
