
"use client";

import { useState } from "react";
import Link from "next/link";
import axios from "axios";
import { useRegister } from "@/app/hooks/useRegister";

export default function Page() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  const registerMutation = useRegister();

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    registerMutation.mutate(form, {
      onSuccess: () => {
        setForm({
          name: "",
          email: "",
          password: "",
        });
      },
    });
  }

  const errorMessage = axios.isAxiosError(registerMutation.error)
    ? registerMutation.error.response?.data?.message ||
      "Registration failed. Please try again."
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

        {/* Register Form */}
        <div className="rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Create your account
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Enter your details to get started.
          </p>

          <form onSubmit={handleSubmit} className="mt-7 space-y-5">

            {/* Name */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Full Name
              </label>

              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Enter your name"
                minLength={2}
                maxLength={100}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-gray-900"
              />
            </div>

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
                placeholder="Minimum 8 characters"
                minLength={8}
                maxLength={72}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-3 text-sm outline-none transition focus:border-gray-900"
              />
            </div>

            {/* Error */}
            {registerMutation.isError && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                {errorMessage}
              </div>
            )}

            {/* Success */}
            {registerMutation.isSuccess && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700">
                Account created successfully!{" "}
                <Link href="/auth/login" className="font-semibold underline">
                  Login now
                </Link>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={registerMutation.isPending}
              className="w-full rounded-lg bg-gray-900 py-3 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {registerMutation.isPending
                ? "Creating account..."
                : "Create Account"}
            </button>
          </form>

          {/* Login Link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              href="/auth/login"
              className="font-semibold text-gray-900 hover:underline"
            >
              Sign in
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
